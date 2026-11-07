// Syncing between devices: sending this device's batch of changes and taking
// in the other devices' (sync.md has the whole plan; syncBatch.js the
// calculation).
//
// Two things are handed in, so that the tests can use stand-ins for both:
//
//   local    this device's data: in the app, db.js itself (getSyncValue,
//            setSyncValue, readOutbox, takeOffOutbox, getAll, readSlice,
//            saveTakenIn)
//   storage  where the files are kept, shared by all the devices:
//              list()           the names of every file
//              read(name)       a file's bytes (a Uint8Array)
//              save(name, bytes)  refused, with error.reason 'exists', if a
//                               file of that name is there already: a
//                               device's log is only ever added to
//              remove(name)
//
// Each device writes only files of its own, "batch-<device>-<number>", so
// two devices syncing at once never get in each other's way.

import { buildBatch, isEmptyBatch, applyBatch, wordsTouched, BATCH_FORMAT } from './syncBatch.js';
import { randomId } from './db.js';

// The batch number in a file name has a fixed width, so that names sort in
// the order of their numbers.
const batchName = (device, number) => `batch-${device}-${String(number).padStart(10, '0')}`;
const BATCH_NAME = /^batch-([0-9a-f]+)-(\d{10})$/;

// A file's contents: the batch as JSON text, compressed with gzip (built into
// the browser as CompressionStream). The owner's month of study, about 6,400
// reviews, is 0.4 MB compressed (sync.md). Encryption comes in here too
// (step 2 of sync.md).
export async function encodeFile(object) {
  const stream = new Blob([JSON.stringify(object)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decodeFile(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
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

// Sends the outbox as this device's next batch, if it holds anything.
// Returns the batch's number, or null if there was nothing to send.
async function send(local, storage, device) {
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
        await storage.save(batchName(device, number), await encodeFile({ ...batch, number }));
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

// Takes in the other devices' batches not yet taken in, each device's in
// order. Returns { takenIn, changed, problems }: how many batches were taken
// in, whether anything here changed, and what went wrong, as
// [{ reason, device }]:
//   'missing-batch'  a device's batch is missing before one that is there:
//                    its later ones wait (a snapshot will settle it, sync.md)
//   'bad-batch'      a file isn't the batch its name says
export async function fetchBatches(local, storage, device) {
  const names = await storage.list();
  const byDevice = new Map();
  for (const name of names) {
    const match = BATCH_NAME.exec(name);
    if (match && match[1] !== device) {
      const list = byDevice.get(match[1]) || [];
      list.push({ name, number: Number(match[2]) });
      byDevice.set(match[1], list);
    }
  }
  // The last batch taken in from each device: { device: number }.
  const taken = { ...(await local.getSyncValue('taken', {})) };
  let takenIn = 0;
  let changed = false;
  const problems = [];
  for (const [other, files] of byDevice) {
    files.sort((a, b) => a.number - b.number);
    for (const { name, number } of files.filter((file) => file.number > (taken[other] ?? 0))) {
      if (number !== (taken[other] ?? 0) + 1) {
        problems.push({ reason: 'missing-batch', device: other });
        break;
      }
      const batch = await decodeFile(await storage.read(name));
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
  return { takenIn, changed, problems };
}

// Makes a sync for this device. syncNow() sends what changed here and takes
// in what changed elsewhere, and returns
//   { sent, takenIn, changed, problems }
// `sent` is the number of the batch sent, or null. A sync asked for while
// one is under way waits for it and then runs once more, since something may
// have changed meanwhile; several asked for meanwhile share that one run.
export function createSync({ local, storage }) {
  let running = null;
  let waiting = null;

  async function run() {
    const device = await deviceId(local);
    const sent = await send(local, storage, device);
    const fetched = await fetchBatches(local, storage, device);
    return { sent, ...fetched };
  }

  function syncNow() {
    if (!running) {
      running = run().finally(() => {
        running = null;
      });
      return running;
    }
    if (!waiting) {
      waiting = running
        .catch(() => {})
        .then(() => {
          waiting = null;
          return syncNow();
        });
    }
    return waiting;
  }

  return { syncNow };
}
