// Syncing in the app: turning it on and off, syncing, and what Settings
// shows about it (syncPanel.js shows it; sync.md has the whole plan).
//
// What is kept on this device, in the `sync` store (db.js), never in a
// backup:
//   code          the sync code (syncCode.js): the one key to everything
//                 synced, so it stays out of backups and settings
//   server        the sync server's address, as when sync was turned on
//   lastSyncedAt  when the last sync finished
// and what sync.js keeps there (device, nextNumber, taken…). Turning sync
// off empties the store and the outbox, so turning it on again starts
// afresh.

import * as db from './db.js';
import { createSync } from './sync.js';
import { keysFor } from './syncCode.js';
import { serverStorage } from './syncServer.js';

// The sync server the app uses unless told otherwise: put in by Vite
// (vite.config.js), the one on this computer under `npm run dev`, none yet
// in a build (docs/sync.md, step 4). With none, Settings doesn't offer
// syncing.
/* global __SYNC_SERVER__ */
export const DEFAULT_SERVER = typeof __SYNC_SERVER__ === 'undefined' ? '' : __SYNC_SERVER__;

// onChanged(): called after a sync brought changes in, for the screens to
//              read the data afresh
// onStatus(status): called whenever `status` changes (below)
export function createSyncControl({ onChanged = async () => {}, onStatus = () => {} } = {}) {
  let sync = null;
  let storage = null;
  // What Settings shows:
  //   on:           whether sync is on on this device
  //   running:      whether a sync is under way
  //   lastSyncedAt: when the last one finished, or null
  //   problem:      the `reason` of what went wrong last time, or null
  const status = { on: false, running: false, lastSyncedAt: null, problem: null };

  const tell = () => onStatus({ ...status });

  async function connect(code) {
    const keys = await keysFor(code);
    const address = await db.getSyncValue('server', DEFAULT_SERVER);
    storage = serverStorage({ address, account: keys.account, access: keys.access });
    sync = createSync({ local: db, storage, key: keys.encryption });
    db.setOutboxOn(true);
    status.on = true;
  }

  return {
    status: () => ({ ...status }),

    // The address syncing would use: the one kept, or the default.
    server: () => db.getSyncValue('server', DEFAULT_SERVER),

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
      await db.setSyncValue('server', await db.getSyncValue('server', DEFAULT_SERVER));
      await connect(code);
      await db.sendEverything();
      tell();
      return this.syncNow();
    },

    // Sends and takes in what changed; with { sendOnly: true } only sends
    // (sync.js). Returns sync.js's result, or null if sync is off or it
    // failed (then `status.problem` says why).
    async syncNow(options = {}) {
      if (!sync) {
        return null;
      }
      status.running = true;
      tell();
      let result = null;
      try {
        result = await sync.syncNow(options);
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
        status.running = false;
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
      sync = null;
      storage = null;
      Object.assign(status, { on: false, running: false, lastSyncedAt: null, problem: null });
      tell();
    },

    // Deletes every synced file on the server, for all the learner's
    // devices, and turns sync off here. Each device keeps its words.
    async deleteSyncedData() {
      await storage.removeAll();
      await this.turnOff();
    },
  };
}
