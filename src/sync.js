// Syncing between devices: sending this device's batch of changes and taking
// in the other devices', with a whole snapshot now and then (sync.md has the
// whole plan; syncBatch.js the calculation; syncCode.js the encryption).
//
// Three things are handed in, so that the tests can use stand-ins:
//
//   local    this device's data: in the app, db.js itself (getSyncValue,
//            setSyncValue, readOutbox, takeOffOutbox, getAll, readSlice,
//            readEverything, saveTakenIn, sendEverything)
//   storage  where the files are kept, shared by all the devices:
//              list()             every file, as [{ name, size }]
//              read(name)         a file's bytes (a Uint8Array)
//              save(name, bytes)  refused, with error.reason 'exists', if a
//                                 file of that name is there already: a
//                                 file is never changed, only added
//              remove(name)
//   key      the encryption key from the sync code (keysFor in syncCode.js)
//
// The files, all encrypted:
//
//   batch-<device>-<number>      a device's changes, numbered 1, 2, 3…
//   snapshot-<time>-<device>     everything a device had at that time
//   covers-<time>-<device>       which batches that snapshot includes, by
//                                device: { device: number }; small, so a
//                                device can tell whether it needs the
//                                snapshot without reading it. Saved after
//                                the snapshot: one without it isn't there yet.
//
// Each device saves and deletes only files of its own, so two devices
// syncing at once never get in each other's way.

import { buildBatch, isEmptyBatch, applyBatch, wordsTouched, BATCH_FORMAT } from './syncBatch.js';
import { DEVICE_SETTINGS } from './merge.js';
import { encrypt, decrypt } from './syncCode.js';
import { randomId } from './db.js';

export const SNAPSHOT_FORMAT = 1;

// A snapshot is made when the batches since the newest add up to this much
// (sync.md: the owner's month of study is about 0.4 MB, their whole
// snapshot 5.7 MB), or are this many: a batch goes every few minutes of
// study and holds a few kilobytes, so a lighter learner would otherwise
// gather thousands of small files before reaching the size, and every whole
// sync reads their list (2026-11-07).
export const SNAPSHOT_AFTER_BYTES = 2 * 1024 * 1024;
export const SNAPSHOT_AFTER_BATCHES = 200;

// Numbers and times in names have a fixed width, so that names sort in their
// order.
const batchName = (device, number) => `batch-${device}-${String(number).padStart(10, '0')}`;
const snapshotName = (time, device) => `snapshot-${String(time).padStart(13, '0')}-${device}`;
const coversName = (snapshot) => snapshot.replace(/^snapshot-/, 'covers-');
const BATCH_NAME = /^batch-([0-9a-f]+)-(\d{10})$/;
const SNAPSHOT_NAME = /^snapshot-(\d{13})-([0-9a-f]+)$/;

// A file's contents: JSON text, compressed with gzip (built into the
// browser as CompressionStream), then encrypted under its name.
export async function encodeFile(object, key, name) {
  const stream = new Blob([JSON.stringify(object)]).stream().pipeThrough(new CompressionStream('gzip'));
  return encrypt(key, name, new Uint8Array(await new Response(stream).arrayBuffer()));
}

// Opens what encodeFile made. Throws with error.reason 'cannot-open' for a
// file made with another sync code, or changed.
export async function decodeFile(bytes, key, name) {
  const compressed = await decrypt(key, name, bytes);
  const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// This device's ID among the devices that sync: random, made the first time.
async function deviceId(local) {
  let device = await local.getSyncValue('device', null);
  if (!device) {
    device = randomId();
    await local.setSyncValue('device', device);
  }
  return device;
}

// The files in a listing, sorted out:
//   batches:   by device, [{ name, number, size }] in order
//   snapshots: [{ name, device }], oldest first, only those with their
//              covers file
function sortOut(listing) {
  const names = new Set(listing.map((file) => file.name));
  const batches = new Map();
  const snapshots = [];
  for (const { name, size } of listing) {
    const batch = BATCH_NAME.exec(name);
    if (batch) {
      const list = batches.get(batch[1]) || [];
      list.push({ name, number: Number(batch[2]), size });
      batches.set(batch[1], list);
    }
    const snapshot = SNAPSHOT_NAME.exec(name);
    if (snapshot && names.has(coversName(name))) {
      snapshots.push({ name, device: snapshot[2] });
    }
  }
  for (const list of batches.values()) {
    list.sort((a, b) => a.number - b.number);
  }
  snapshots.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { batches, snapshots };
}

// Sends the outbox as this device's next batch, if it holds anything.
// Returns the batch's number, or null if there was nothing to send.
async function send(local, storage, key, device) {
  const { entries, records } = await local.readOutbox();
  if (entries.length === 0) {
    return null;
  }
  let number = await local.getSyncValue('nextNumber', 1);
  const batch = buildBatch({ device, number, madeAt: Date.now(), records });
  if (!isEmptyBatch(batch)) {
    // A number already taken means a batch was saved but the app stopped
    // before noting it (closed at that moment): its changes are all in this
    // batch too, and taking them in twice changes nothing, so the next
    // number is used.
    for (;;) {
      try {
        const name = batchName(device, number);
        await storage.save(name, await encodeFile({ ...batch, number }, key, name));
        break;
      } catch (error) {
        if (error.reason !== 'exists') {
          throw error;
        }
        number++;
      }
    }
    await local.setSyncValue('nextNumber', number + 1);
  }
  // Only now that the batch is safely stored. An entry whose record changed
  // again meanwhile stays, for the next batch.
  await local.takeOffOutbox(entries);
  return isEmptyBatch(batch) ? null : number;
}

// The newest snapshot and what it covers: { name, device, covers }, or null
// if there is none. Its covers file is read once and kept on this device.
async function newestSnapshot(local, storage, key, snapshots) {
  const newest = snapshots.at(-1);
  if (!newest) {
    return null;
  }
  const known = await local.getSyncValue('snapshotCovers', null);
  if (known && known.name === newest.name) {
    return { ...newest, covers: known.covers };
  }
  const name = coversName(newest.name);
  const { covers } = await decodeFile(await storage.read(name), key, name);
  await local.setSyncValue('snapshotCovers', { name: newest.name, covers });
  return { ...newest, covers };
}

// Takes in a snapshot: as a batch of everything, against everything here.
// Returns whether anything here changed.
async function takeInSnapshot(local, storage, key, device, snapshot, taken) {
  const contents = await decodeFile(await storage.read(snapshot.name), key, snapshot.name);
  const changes = applyBatch(await local.readEverything(), contents.data);
  await local.saveTakenIn(changes);
  for (const [other, number] of Object.entries(contents.covers)) {
    if (other !== device) {
      taken[other] = Math.max(taken[other] ?? 0, number);
    }
  }
  await local.setSyncValue('taken', { ...taken });
  await local.setSyncValue('checkedSnapshot', snapshot.name);
  return Object.keys(changes.put).length > 0 || Object.keys(changes.remove).length > 0;
}

// Takes in the other devices' batches not yet taken in, each device's in
// order, and a snapshot first where it is needed. Every change is in some
// device's batches (a device's data from before sync was turned on too:
// sendEverything in db.js), so a snapshot is only ever a shortcut. Returns
// { takenIn, snapshotTakenIn, changed, problems }; a problem is
// { reason, device }:
//   'missing-batch'  a device's batch is missing and no snapshot covers it:
//                    its later ones wait
//   'bad-batch'      a file isn't the batch its name says
//   'cannot-open'    a file can't be opened with this sync code
async function takeIn(local, storage, key, device, batches, newest) {
  // The last batch taken in from each device: { device: number }.
  const taken = { ...(await local.getSyncValue('taken', {})) };
  let changed = false;
  let snapshotTakenIn = false;
  const problems = [];

  // A snapshot is taken in on the first sync (quicker than every batch since
  // the beginning) or where a device's next batch is gone but the snapshot
  // covers it (deleted as covered, or this device was away long).
  if (newest && newest.device !== device) {
    const first = !(await local.getSyncValue('joined', false));
    const gap = Object.entries(newest.covers).some(
      ([other, number]) =>
        other !== device &&
        number > (taken[other] ?? 0) &&
        !(batches.get(other) || []).some((file) => file.number === (taken[other] ?? 0) + 1),
    );
    if (first || gap) {
      try {
        changed = await takeInSnapshot(local, storage, key, device, newest, taken);
        snapshotTakenIn = true;
      } catch (error) {
        if (error.reason !== 'cannot-open') {
          throw error;
        }
        problems.push({ reason: 'cannot-open', device: newest.device });
      }
    }
  }

  let takenIn = 0;
  for (const [other, files] of batches) {
    if (other === device) {
      continue;
    }
    for (const { name, number } of files.filter((file) => file.number > (taken[other] ?? 0))) {
      if (number !== (taken[other] ?? 0) + 1) {
        problems.push({ reason: 'missing-batch', device: other });
        break;
      }
      let batch;
      try {
        batch = await decodeFile(await storage.read(name), key, name);
      } catch (error) {
        if (error.reason !== 'cannot-open') {
          throw error;
        }
        problems.push({ reason: 'cannot-open', device: other });
        break;
      }
      if (batch.format !== BATCH_FORMAT || batch.device !== other || batch.number !== number) {
        problems.push({ reason: 'bad-batch', device: other });
        break;
      }
      const slice = await local.readSlice(wordsTouched(batch, await local.getAll('words')));
      const changes = applyBatch(slice, batch);
      await local.saveTakenIn(changes);
      changed ||= Object.keys(changes.put).length > 0 || Object.keys(changes.remove).length > 0;
      // Noted after each batch, so that one taken in is not taken in again
      // if the next fails.
      taken[other] = number;
      await local.setSyncValue('taken', { ...taken });
      takenIn++;
    }
  }
  return { takenIn, snapshotTakenIn, changed, problems };
}

// The batches the newest snapshot doesn't cover: { count, bytes }.
function uncovered(newest, batches) {
  let count = 0;
  let bytes = 0;
  for (const [other, files] of batches) {
    for (const file of files) {
      if (file.number > (newest?.covers[other] ?? 0)) {
        count += 1;
        bytes += file.size;
      }
    }
  }
  return { count, bytes };
}

// Saves a snapshot of everything here, then its covers file. Returns it as
// newestSnapshot does.
async function saveSnapshot(local, storage, key, device) {
  const data = await local.readEverything();
  data.settings = data.settings.filter((setting) => !DEVICE_SETTINGS.includes(setting.key));
  const taken = await local.getSyncValue('taken', {});
  const covers = { ...taken, [device]: (await local.getSyncValue('nextNumber', 1)) - 1 };
  const madeAt = Date.now();
  const name = snapshotName(madeAt, device);
  await storage.save(name, await encodeFile({ format: SNAPSHOT_FORMAT, device, madeAt, covers, data }, key, name));
  const covering = coversName(name);
  await storage.save(covering, await encodeFile({ format: SNAPSHOT_FORMAT, device, madeAt, covers }, key, covering));
  await local.setSyncValue('snapshotCovers', { name, covers });
  await local.setSyncValue('checkedSnapshot', name);
  return { name, device, covers };
}

// Deletes this device's files that the newest snapshot makes unneeded: its
// batches the snapshot covers, and its older snapshots. Only once this
// device has opened that snapshot (made it, or read it through), so that a
// snapshot that can't be opened never costs the batches it would replace.
async function tidy(local, storage, key, device, files, newest) {
  if (!newest) {
    return;
  }
  const covered = (files.batches.get(device) || []).filter((file) => file.number <= (newest.covers[device] ?? 0));
  const older = files.snapshots.filter((snapshot) => snapshot.device === device && snapshot.name < newest.name);
  if (covered.length === 0 && older.length === 0) {
    return;
  }
  if ((await local.getSyncValue('checkedSnapshot', null)) !== newest.name) {
    const contents = await decodeFile(await storage.read(newest.name), key, newest.name);
    if (contents.format !== SNAPSHOT_FORMAT || !contents.data) {
      return;
    }
    await local.setSyncValue('checkedSnapshot', newest.name);
  }
  for (const file of covered) {
    await storage.remove(file.name);
  }
  for (const snapshot of older) {
    // The covers file first: without it, the snapshot no longer counts.
    await storage.remove(coversName(snapshot.name));
    await storage.remove(snapshot.name);
  }
}

// Whether this device's files are gone from the storage: it has sent
// batches, none is there, and no snapshot covers them. The server lost them
// (its disk, a move to another host, a server run afresh: sync.md, "The
// server holds nothing that can't be replaced").
function filesLost(files, newest, device, sentUpTo) {
  return (
    sentUpTo > 0 &&
    !(files.batches.get(device) || []).length &&
    (newest?.covers[device] ?? 0) < sentUpTo
  );
}

// Starts this device afresh in the storage: a new device ID, so that its
// batches are numbered from 1 again (a device joining later would otherwise
// find the first ones missing), what it had taken in forgotten (those files
// are gone too), and everything it has in the next batch.
async function startAfresh(local) {
  await local.setSyncValue('device', randomId());
  await local.setSyncValue('nextNumber', 1);
  await local.setSyncValue('taken', {});
  await local.setSyncValue('snapshotCovers', null);
  await local.setSyncValue('checkedSnapshot', null);
  await local.sendEverything();
}

// Makes a sync for this device. syncNow() sends what changed here, takes in
// what changed elsewhere, makes a snapshot when one is due and deletes this
// device's files no longer needed. It returns
//   { sent, takenIn, snapshotTakenIn, snapshotMade, startedAfresh, changed,
//     problems }
// `sent` is the number of the batch sent, or null; `snapshotMade` whether a
// snapshot was saved; `startedAfresh` whether this device found its files
// gone and sent everything again.
//
// syncNow({ sendOnly: true }) only sends: quick and light, for while the
// learner studies and when the app is put away (syncTiming.js).
//
// A sync asked for while one is under way waits for it and then runs once
// more, since something may have changed meanwhile; several asked for
// meanwhile share that one run, a whole one if any of them asked for that.
//
// snapshotAfterBytes, snapshotAfterBatches: SNAPSHOT_AFTER_BYTES and
// SNAPSHOT_AFTER_BATCHES, smaller in the tests
export function createSync({
  local,
  storage,
  key,
  snapshotAfterBytes = SNAPSHOT_AFTER_BYTES,
  snapshotAfterBatches = SNAPSHOT_AFTER_BATCHES,
}) {
  let running = null;
  let waiting = null;
  let waitingWhole = false;

  async function run({ sendOnly = false } = {}) {
    let device = await deviceId(local);
    let sent = await send(local, storage, key, device);
    const nothingElse = { takenIn: 0, snapshotTakenIn: false, snapshotMade: false, startedAfresh: false, changed: false };
    if (sendOnly) {
      return { sent, ...nothingElse, problems: [] };
    }
    let files = sortOut(await storage.list());
    let newest = null;
    const problems = [];
    try {
      newest = await newestSnapshot(local, storage, key, files.snapshots);
    } catch (error) {
      if (error.reason !== 'cannot-open') {
        throw error;
      }
      problems.push({ reason: 'cannot-open', device: files.snapshots.at(-1).device });
    }
    let startedAfresh = false;
    if (filesLost(files, newest, device, (await local.getSyncValue('nextNumber', 1)) - 1)) {
      await startAfresh(local);
      device = await deviceId(local);
      sent = await send(local, storage, key, device);
      files = sortOut(await storage.list());
      startedAfresh = true;
    }
    const fetched = await takeIn(local, storage, key, device, files.batches, newest);
    await local.setSyncValue('joined', true);
    let snapshotMade = false;
    const since = uncovered(newest, files.batches);
    if (since.bytes > snapshotAfterBytes || since.count > snapshotAfterBatches) {
      newest = await saveSnapshot(local, storage, key, device);
      snapshotMade = true;
    }
    await tidy(local, storage, key, device, files, newest);
    return { sent, ...fetched, snapshotMade, startedAfresh, problems: [...problems, ...fetched.problems] };
  }

  function syncNow({ sendOnly = false } = {}) {
    if (!running) {
      running = run({ sendOnly }).finally(() => {
        running = null;
      });
      return running;
    }
    waitingWhole ||= !sendOnly;
    if (!waiting) {
      waiting = running
        .catch(() => {})
        .then(() => {
          const whole = waitingWhole;
          waiting = null;
          waitingWhole = false;
          return syncNow({ sendOnly: !whole });
        });
    }
    return waiting;
  }

  return { syncNow };
}
