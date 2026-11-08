// Syncing in the app: turning it on and off, syncing, and what Settings
// shows about it (syncPanel.js shows it; sync.md has the whole plan).
//
// What is kept on this device, in the `sync` store (db.js), never in a
// backup:
//   code          the sync code (syncCode.js): the one key to everything
//                 synced, so it stays out of backups and settings
//   server        the sync server chosen in Settings, if not the usual one
//                 (DEFAULT_SERVER); kept when sync is turned off
//   lastSyncedAt  when the last sync finished
// and what sync.js keeps there (device, nextNumber, taken…). Turning sync
// off empties the store and the outbox, so turning it on again starts
// afresh.
//
// The syncing itself runs on a second thread (syncWorker.js), so that
// taking in or sending a whole history doesn't hold up the page; its
// progress comes back as `status.progress`.

import * as db from './db.js';
import { keysFor } from './syncCode.js';
import { serverStorage } from './syncServer.js';

// The sync server the app uses unless told otherwise: put in by Vite
// (vite.config.js), the one on this computer under `npm run dev`, none yet
// in a build (docs/sync.md, step 4). With none, Settings doesn't offer
// syncing.
/* global __SYNC_SERVER__ */
export const DEFAULT_SERVER = typeof __SYNC_SERVER__ === 'undefined' ? '' : __SYNC_SERVER__;

// The server syncing uses: the one chosen in Settings, else the usual one.
async function serverAddress() {
  return (await db.getSyncValue('server', null)) || DEFAULT_SERVER;
}

// Starts the second thread, and gives a way to ask it things: ask(message)
// resolves to its answer, or rejects with the error it reports (with its
// `reason`). onProgress(progress) hears its progress.
function startWorker(onProgress) {
  const worker = new Worker(new URL('./syncWorker.js', import.meta.url), { type: 'module' });
  const waiting = new Map();
  let lastId = 0;
  worker.addEventListener('message', ({ data }) => {
    if (data.type === 'progress') {
      onProgress(data.progress);
      return;
    }
    const asker = waiting.get(data.id);
    waiting.delete(data.id);
    if (data.type === 'failed') {
      asker.reject(Object.assign(new Error(data.message), { reason: data.reason }));
    } else {
      asker.resolve(data.result);
    }
  });
  // The thread itself failing (its code not loading, say): every question
  // waiting fails with it.
  worker.addEventListener('error', (event) => {
    for (const asker of waiting.values()) {
      asker.reject(new Error(event.message || 'The sync worker failed.'));
    }
    waiting.clear();
  });
  return {
    ask(message) {
      return new Promise((resolve, reject) => {
        lastId += 1;
        waiting.set(lastId, { resolve, reject });
        worker.postMessage({ ...message, id: lastId });
      });
    },
    // Stopped (sync turned off): whatever waits fails, as 'stopped'.
    stop() {
      worker.terminate();
      for (const asker of waiting.values()) {
        asker.reject(Object.assign(new Error('Syncing was turned off.'), { reason: 'stopped' }));
      }
      waiting.clear();
    },
  };
}

// onChanged(): called after a sync brought changes in, for the screens to
//              read the data afresh
// onStatus(status): called whenever `status` changes (below)
export function createSyncControl({ onChanged = async () => {}, onStatus = () => {} } = {}) {
  let worker = null;
  let storage = null;
  // The sync under way on the worker, if any, and whether new ones are
  // refused for now (while deleting everything).
  let current = null;
  let refusing = false;
  // What Settings shows:
  //   on:           whether sync is on on this device
  //   running:      whether a sync is under way
  //   lastSyncedAt: when the last one finished, or null
  //   problem:      the `reason` of what went wrong last time, or null
  //   progress:     while a long step runs, how it goes (sync.js,
  //                 onProgress), else null
  const status = { on: false, running: false, lastSyncedAt: null, problem: null, progress: null };

  const tell = () => onStatus({ ...status });

  async function connect(code) {
    const keys = await keysFor(code);
    const address = await serverAddress();
    // On the page too, for deleting everything (Settings).
    storage = serverStorage({ address, account: keys.account, access: keys.access });
    worker?.stop();
    worker = startWorker((progress) => {
      status.progress = progress;
      tell();
    });
    await worker.ask({ type: 'connect', code, address });
    db.setOutboxOn(true);
    status.on = true;
  }

  return {
    status: () => ({ ...status }),

    // The address syncing uses, and choosing another (null: the usual one).
    // Only while sync is off: its files are on the server it began with.
    server: serverAddress,
    usualServer: DEFAULT_SERVER,
    async chooseServer(address) {
      await db.setSyncValue('server', address);
    },

    // At start: picks up where sync was left, if it is on.
    async start() {
      const code = await db.getSyncValue('code', null);
      if (code) {
        await connect(code);
        status.lastSyncedAt = await db.getSyncValue('lastSyncedAt', null);
      }
      tell();
    },

    // Turns sync on with a code, new or typed in (readCode in syncCode.js
    // checked it). Everything on this device is sent with the next batch
    // (sendEverything), since the other devices have none of it yet; then
    // the first sync runs.
    async turnOn(code) {
      await db.setSyncValue('code', code);
      await connect(code);
      await db.sendEverything();
      tell();
      return this.syncNow();
    },

    // Sends and takes in what changed; with { sendOnly: true } only sends
    // (sync.js). Returns sync.js's result, or null if sync is off or it
    // failed (then `status.problem` says why).
    async syncNow(options = {}) {
      if (!worker || refusing) {
        return null;
      }
      status.running = true;
      tell();
      let result = null;
      try {
        current = worker.ask({ type: 'sync', options });
        result = await current;
        status.lastSyncedAt = Date.now();
        await db.setSyncValue('lastSyncedAt', status.lastSyncedAt);
        status.problem = result.problems[0]?.reason ?? null;
        if (result.changed) {
          await onChanged();
        }
      } catch (error) {
        status.problem = error.reason || 'server-error';
        if (!error.reason) {
          // Not one of syncing's own: worth seeing when it happens.
          console.error(error);
        }
      } finally {
        current = null;
        status.running = false;
        status.progress = null;
        tell();
      }
      return result;
    },

    // The sync code, for "Show sync code".
    code: () => db.getSyncValue('code', null),

    // Stops syncing on this device. Its words stay; the other devices go on
    // syncing.
    async turnOff() {
      db.setOutboxOn(false);
      await db.forgetSync();
      worker?.stop();
      worker = null;
      storage = null;
      Object.assign(status, { on: false, running: false, lastSyncedAt: null, problem: null, progress: null });
      tell();
    },

    // Deletes every synced file on the server, for all the learner's
    // devices, and turns sync off here. Each device keeps its words.
    //
    // Syncing here stops first, a sync under way allowed to finish: one
    // could otherwise save a file just after the deleting, and the account
    // would be back (2026-11-07, found by the browser test once syncing ran
    // on its own thread; stopping the thread instead cut a request off
    // halfway, not before the server had it). If the deleting fails (no
    // connection), syncing goes on as before, and the error is passed on.
    async deleteSyncedData() {
      refusing = true;
      try {
        await current?.catch(() => {});
        await storage.removeAll();
        // Still refusing, until sync is off: a sync starting now would
        // bring the account back too.
        await this.turnOff();
      } finally {
        refusing = false;
      }
    },
  };
}
