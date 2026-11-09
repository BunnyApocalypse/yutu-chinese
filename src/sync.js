// Syncing between devices: sending this device's batch of changes and taking
// in the other devices', with a whole snapshot now and then (sync.md has the
// whole plan; syncBatch.js the calculation; syncCode.js the encryption).
//
// Three things are handed in, so that the tests can use stand-ins:
//
//   local    this device's data: in the app, db.js itself (getSyncValue,
//            setSyncValue, readOutbox, takeOffOutbox, getAll, countAll,
//            readSlice, readEverything, saveTakenIn, sendEverything)
//   storage  where the files are kept, shared by all the devices:
//              list()             every file, as [{ name, size }]
//              read(name, onBytes)  a file's bytes (a Uint8Array);
//                                 onBytes(done, total) as they come
//              save(name, bytes)  refused, with error.reason 'exists', if a
//                                 file of that name is there already: a
//                                 file is never changed, only added
//              remove(name)
//   key      the encryption key from the sync code (keysFor in syncCode.js)
//   onProgress(progress)  told how a long step goes, to show it (syncPanel.js):
//            { phase, done, total }, phase one of 'pack' (making a big file),
//            'upload' (total: bytes), 'download' (done and total: bytes),
//            'open', 'merge' (combining with what is here), 'save' (done and
//            total: records). Only the steps of whole histories are told:
//            turning sync on, taking in a snapshot or everything, making a
//            snapshot. (In the app it all runs on a second thread,
//            syncWorker.js, so the page stays free meanwhile.)
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
// Each device saves only files of its own. Deleting follows one rule, so
// that two devices syncing at once never lose anything between them: a file
// goes only when a snapshot that is kept holds all of it (tidy). Any device
// may delete any device's files by that rule, so the files of a device that
// stopped syncing (turned off, its browser data cleared, a phone replaced)
// don't stay on the server for ever (the review of 2026-11-09).

import { buildBatch, isEmptyBatch, applyBatch, wordsTouched, wholeAsChanges, BATCH_FORMAT } from './syncBatch.js';
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
//   snapshots: [{ name, device, time }], oldest first, only those with their
//              covers file
//   orphans:   [{ name, device, time }], snapshots without their covers file:
//              being saved now, or left by a save that stopped halfway
function sortOut(listing) {
  const names = new Set(listing.map((file) => file.name));
  const batches = new Map();
  const snapshots = [];
  const orphans = [];
  for (const { name, size } of listing) {
    const batch = BATCH_NAME.exec(name);
    if (batch) {
      const list = batches.get(batch[1]) || [];
      list.push({ name, number: Number(batch[2]), size });
      batches.set(batch[1], list);
    }
    const snapshot = SNAPSHOT_NAME.exec(name);
    if (snapshot) {
      const found = { name, device: snapshot[2], time: Number(snapshot[1]) };
      (names.has(coversName(name)) ? snapshots : orphans).push(found);
    }
  }
  for (const list of batches.values()) {
    list.sort((a, b) => a.number - b.number);
  }
  snapshots.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { batches, snapshots, orphans };
}

// Whether snapshot `newer` holds everything `older` does: every device's
// batches as far as `older` covers them.
const holdsAll = (newer, older) => Object.entries(older.covers).every(([other, number]) => (newer.covers[other] ?? 0) >= number);

// How far any snapshot listed covers a device's batches.
const coveredUpTo = (snapshots, device) => Math.max(0, ...snapshots.map((snapshot) => snapshot.covers[device] ?? 0));

// A big file is downloaded with its progress told; a small one isn't worth
// the line.
const TELL_DOWNLOADS_FROM = 256 * 1024;

// Reads a file, telling its download's progress if it is big.
function readTelling(storage, name, report) {
  return storage.read(name, (done, total) => {
    if (total >= TELL_DOWNLOADS_FROM) {
      report({ phase: 'download', done, total });
    }
  });
}

// Takes in a whole history (a snapshot's data, or a batch of everything):
// on a device with no words or reviews yet, which is a device joining, as
// it is (it is already combined: wholeAsChanges in syncBatch.js), sparing
// combining 190,000 records with nothing; otherwise combined with
// everything here. Saved telling its progress. Returns the changes.
//
// The page stays in use meanwhile (the worker, syncWorker.js), so the save
// is given this device's data as it was read (`before`): a record the
// learner changed here since then is kept as it is (saveTakenIn in db.js).
async function takeInWhole(local, data, report) {
  const empty = (await local.countAll('words')) === 0 && (await local.countAll('reviews')) === 0;
  let changes;
  let before;
  if (empty) {
    const settings = await local.getAll('settings');
    before = { settings };
    changes = wholeAsChanges(data, settings);
  } else {
    report({ phase: 'merge' });
    before = await local.readEverything();
    changes = applyBatch(before, data);
  }
  await local.saveTakenIn(changes, (done, total) => report({ phase: 'save', done, total }), { before });
  return changes;
}

// Sends the outbox as this device's next batch, if it holds anything.
// Returns { number, everything } (whether it held all this device has), or
// null if there was nothing to send.
async function send(local, storage, key, device, report) {
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
        if (batch.everything) {
          report({ phase: 'pack' });
        }
        const bytes = await encodeFile({ ...batch, number }, key, name);
        if (batch.everything) {
          report({ phase: 'upload', total: bytes.length });
        }
        await storage.save(name, bytes);
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
  return isEmptyBatch(batch) ? null : { number, everything: Boolean(batch.everything) };
}

// The snapshots listed, each with what it covers: [{ name, device, time,
// covers }], oldest first. Each covers file is read once and kept on this
// device (`coversKnown`, { name: covers }, only the listed ones kept). One
// that can't be opened is left out; the newest one being so throws, with
// reason 'cannot-open'.
async function withCovers(local, storage, key, snapshots) {
  const known = await local.getSyncValue('coversKnown', {});
  const kept = {};
  const found = [];
  for (const snapshot of snapshots) {
    let covers = known[snapshot.name];
    if (!covers) {
      const name = coversName(snapshot.name);
      try {
        ({ covers } = await decodeFile(await storage.read(name), key, name));
      } catch (error) {
        // (Deleted since the listing by another device's tidy: no matter.)
        if (error.reason === 'not-found') {
          continue;
        }
        if (error.reason !== 'cannot-open' || snapshot === snapshots.at(-1)) {
          throw error;
        }
        continue;
      }
    }
    kept[snapshot.name] = covers;
    found.push({ ...snapshot, covers });
  }
  await local.setSyncValue('coversKnown', kept);
  return found;
}

// Takes in a snapshot: a whole history (takeInWhole). Returns whether
// anything here changed.
async function takeInSnapshot(local, storage, key, device, snapshot, taken, report) {
  const file = await readTelling(storage, snapshot.name, report);
  report({ phase: 'open' });
  const contents = await decodeFile(file, key, snapshot.name);
  const changes = await takeInWhole(local, contents.data, report);
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
async function takeIn(local, storage, key, device, batches, snapshots, report) {
  // The last batch taken in from each device: { device: number }.
  const taken = { ...(await local.getSyncValue('taken', {})) };
  let changed = false;
  let snapshotTakenIn = false;
  // Whether a whole history was taken in (a snapshot, or a batch of
  // everything): then no snapshot is made in the same sync (createSync).
  let tookWhole = false;
  const problems = [];

  // A snapshot is taken in on the first sync (the newest: quicker than every
  // batch since the beginning), and wherever a device's next batch is gone
  // but a snapshot covers it (deleted as covered, or this device was away
  // long). Not always the newest: two devices may make snapshots at once,
  // and the one named later may cover less of the other's batches (tidy
  // keeps the earlier then). Each snapshot at most once.
  const gapFilledBy = (snapshot) =>
    Object.entries(snapshot.covers).some(
      ([other, number]) =>
        other !== device &&
        number > (taken[other] ?? 0) &&
        !(batches.get(other) || []).some((file) => file.number === (taken[other] ?? 0) + 1),
    );
  const newest = snapshots.at(-1);
  let next = newest && newest.device !== device && !(await local.getSyncValue('joined', false)) ? newest : null;
  const tried = new Set();
  for (;;) {
    next ??= snapshots.findLast((snapshot) => !tried.has(snapshot.name) && gapFilledBy(snapshot));
    if (!next) {
      break;
    }
    tried.add(next.name);
    try {
      changed = (await takeInSnapshot(local, storage, key, device, next, taken, report)) || changed;
      snapshotTakenIn = true;
      tookWhole = true;
    } catch (error) {
      // (Deleted since the listing, as one another snapshot holds all of:
      // the next sync finds that one.)
      if (error.reason === 'not-found') {
        next = null;
        continue;
      }
      if (error.reason !== 'cannot-open') {
        throw error;
      }
      problems.push({ reason: 'cannot-open', device: next.device });
    }
    next = null;
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
        const file = await readTelling(storage, name, report);
        if (file.length >= TELL_DOWNLOADS_FROM) {
          report({ phase: 'open' });
        }
        batch = await decodeFile(file, key, name);
      } catch (error) {
        // Deleted since the listing, covered by a snapshot: the next sync
        // takes that in.
        if (error.reason === 'not-found') {
          problems.push({ reason: 'missing-batch', device: other });
          break;
        }
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
      // A batch of everything a device had (sync turned on there) is a whole
      // history; any other, the words it touches.
      let changes;
      if (batch.everything) {
        changes = await takeInWhole(local, batch, report);
        tookWhole = true;
      } else {
        const slice = await local.readSlice(wordsTouched(batch, await local.getAll('words')));
        changes = applyBatch(slice, batch);
        await local.saveTakenIn(changes, undefined, { before: slice });
      }
      changed ||= Object.keys(changes.put).length > 0 || Object.keys(changes.remove).length > 0;
      // Noted after each batch, so that one taken in is not taken in again
      // if the next fails.
      taken[other] = number;
      await local.setSyncValue('taken', { ...taken });
      takenIn++;
    }
  }
  return { takenIn, snapshotTakenIn, changed, problems, tookWhole };
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
// withCovers lists one. Named after the newest one listed (`after`), even if
// this device's clock is behind, so that it is the newest.
async function saveSnapshot(local, storage, key, device, after, report) {
  report({ phase: 'pack' });
  const data = await local.readEverything();
  data.settings = data.settings.filter((setting) => !DEVICE_SETTINGS.includes(setting.key));
  const taken = await local.getSyncValue('taken', {});
  const covers = { ...taken, [device]: (await local.getSyncValue('nextNumber', 1)) - 1 };
  const madeAt = Math.max(Date.now(), (after?.time ?? 0) + 1);
  const name = snapshotName(madeAt, device);
  const bytes = await encodeFile({ format: SNAPSHOT_FORMAT, device, madeAt, covers, data }, key, name);
  report({ phase: 'upload', total: bytes.length });
  await storage.save(name, bytes);
  const covering = coversName(name);
  await storage.save(covering, await encodeFile({ format: SNAPSHOT_FORMAT, device, madeAt, covers }, key, covering));
  await local.setSyncValue('coversKnown', { ...(await local.getSyncValue('coversKnown', {})), [name]: covers });
  await local.setSyncValue('checkedSnapshot', name);
  return { name, device, time: madeAt, covers };
}

// A snapshot without its covers file is taken to be left by a save that
// stopped halfway once it is this old (another device may be saving it now).
const ORPHAN_AFTER_MS = 24 * 60 * 60 * 1000;

// Deletes the files the newest snapshot makes unneeded, any device's: the
// batches it covers, and older snapshots it holds all of (holdsAll). A
// snapshot named later may cover less than an earlier one (two devices
// making one at once), so an earlier one that holds something the newest
// doesn't is kept, and takeIn reads it where needed: nothing is deleted
// unless a snapshot that stays holds all of it. Also this device's own
// snapshots left without their covers file, and other devices' after a day.
// Only once this device has opened the newest snapshot (made it, or read it
// through), so that one that can't be opened never costs the files it would
// replace. A file another device deleted meanwhile is no matter.
async function tidy(local, storage, key, device, files, snapshots) {
  const newest = snapshots.at(-1);
  if (!newest) {
    return;
  }
  const covered = [...files.batches].flatMap(([other, list]) => list.filter((file) => file.number <= (newest.covers[other] ?? 0)));
  const older = snapshots.filter((snapshot) => snapshot.name < newest.name && holdsAll(newest, snapshot));
  const orphans = files.orphans.filter((orphan) =>
    orphan.device === device ? orphan.name < newest.name : orphan.time < Date.now() - ORPHAN_AFTER_MS,
  );
  if (covered.length === 0 && older.length === 0 && orphans.length === 0) {
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
  for (const orphan of orphans) {
    await storage.remove(orphan.name);
  }
}

// Whether this device's files are gone from the storage: it has sent
// batches, and the first of them not covered by a snapshot isn't there
// (none is, or only later ones: a batch sent since into an account the
// server had lost). The server lost them (its disk, a move to another host,
// a server run afresh, an account unused a year: sync.md, "The server holds
// nothing that can't be replaced").
function filesLost(files, snapshots, device, sentUpTo) {
  const covered = coveredUpTo(snapshots, device);
  const mine = files.batches.get(device) || [];
  if (mine.length === 0) {
    return sentUpTo > 0 && covered < sentUpTo;
  }
  return mine[0].number > covered + 1;
}

// Starts this device afresh in the storage: a new device ID, so that its
// batches are numbered from 1 again (a device joining later would otherwise
// find the first ones missing), what it had taken in forgotten (those files
// are gone too), and everything it has in the next batch. The batches left
// under the old ID (sent since the loss) go: the next batch holds them.
async function startAfresh(local, storage, files, device) {
  for (const file of files.batches.get(device) || []) {
    await storage.remove(file.name);
  }
  await local.setSyncValue('device', randomId());
  await local.setSyncValue('nextNumber', 1);
  await local.setSyncValue('taken', {});
  await local.setSyncValue('coversKnown', {});
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
  onProgress = () => {},
}) {
  let running = null;
  let waiting = null;
  let waitingWhole = false;

  async function run({ sendOnly = false } = {}) {
    const report = onProgress;
    let device = await deviceId(local);
    let sending = await send(local, storage, key, device, report);
    let sent = sending?.number ?? null;
    const nothingElse = { takenIn: 0, snapshotTakenIn: false, snapshotMade: false, startedAfresh: false, changed: false };
    if (sendOnly) {
      return { sent, ...nothingElse, problems: [] };
    }
    let files = sortOut(await storage.list());
    let snapshots = [];
    const problems = [];
    try {
      snapshots = await withCovers(local, storage, key, files.snapshots);
    } catch (error) {
      if (error.reason !== 'cannot-open') {
        throw error;
      }
      problems.push({ reason: 'cannot-open', device: files.snapshots.at(-1).device });
    }
    let startedAfresh = false;
    // (Not when the newest snapshot can't be opened: what it covers isn't
    // known.)
    if (problems.length === 0 && filesLost(files, snapshots, device, (await local.getSyncValue('nextNumber', 1)) - 1)) {
      await startAfresh(local, storage, files, device);
      device = await deviceId(local);
      sending = await send(local, storage, key, device, report);
      sent = sending?.number ?? null;
      files = sortOut(await storage.list());
      startedAfresh = true;
    }
    const fetched = await takeIn(local, storage, key, device, files.batches, snapshots, report);
    await local.setSyncValue('joined', true);
    let snapshotMade = false;
    const since = uncovered(snapshots.at(-1), files.batches);
    // Not right after sending everything: that was packed just now, and
    // packing it all again at once would double the wait (2026-11-07, the
    // owner's tablet). Nor right after taking a whole history in: that is a
    // device joining, waiting for its words. The next sync, here or on
    // another device, makes it, in the background.
    const due = since.bytes > snapshotAfterBytes || since.count > snapshotAfterBatches;
    if (due && !sending?.everything && !fetched.tookWhole) {
      snapshots = [...snapshots, await saveSnapshot(local, storage, key, device, snapshots.at(-1), report)];
      snapshotMade = true;
    }
    await tidy(local, storage, key, device, files, snapshots);
    const { tookWhole, ...told } = fetched;
    return { sent, ...told, snapshotMade, startedAfresh, problems: [...problems, ...fetched.problems] };
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
