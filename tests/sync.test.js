// Tests for src/sync.js: devices sending and taking in batches and
// snapshots through a shared storage, encrypted. Both the storage and each device's database are stand-ins
// held in memory here; the database part is tested in a real browser in
// tests/browser/sync.browser.js.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSync, encodeFile, decodeFile } from '../src/sync.js';
import { mergeBackups, DEVICE_SETTINGS } from '../src/merge.js';
import { makeCode, keysFor } from '../src/syncCode.js';
import { word, sorted, twoDevices, memoryDevice, learnersData } from './fixtures/devices.js';

// A storage held in memory, shared by the devices of a test. `failing`
// makes every call fail, as with no connection.
function memoryStorage() {
  const files = new Map();
  const storage = {
    files,
    failing: false,
    check() {
      if (storage.failing) {
        throw Object.assign(new Error('no connection'), { reason: 'offline' });
      }
    },
    async list() {
      storage.check();
      return [...files].map(([name, bytes]) => ({ name, size: bytes.length }));
    },
    async read(name) {
      storage.check();
      return files.get(name);
    },
    async save(name, bytes) {
      storage.check();
      if (files.has(name)) {
        throw Object.assign(new Error('exists'), { reason: 'exists' });
      }
      files.set(name, bytes);
    },
    async remove(name) {
      storage.check();
      files.delete(name);
    },
  };
  return storage;
}

// The keys of one sync code, made once: working them out takes a moment.
const keys = keysFor(await makeCode());
const key = (await keys).encryption;

// Two devices with their data, syncing through one storage. `options` go to
// createSync (snapshotAfterBytes).
function setUp(options = {}) {
  const { mine, theirs } = twoDevices();
  const storage = memoryStorage();
  const a = memoryDevice(mine);
  const b = memoryDevice(theirs);
  const syncOf = (local) => createSync({ local, storage, key, ...options }).syncNow;
  return { mine, theirs, storage, a, b, syncA: syncOf(a), syncB: syncOf(b), syncOf };
}

// A file in the storage, opened.
const opened = (storage, name) => decodeFile(storage.files.get(name), key, name);
const names = (storage, prefix) => [...storage.files.keys()].filter((name) => name.startsWith(prefix)).sort();

test('a file is the batch compressed and encrypted, and opens again as it was', async () => {
  const batch = { format: 1, device: 'a', number: 1, words: [word('愛', 'ai4')], text: '愛'.repeat(1000) };
  const bytes = await encodeFile(batch, key, 'batch-a-0000000001');
  assert.ok(bytes.length < 500, `${bytes.length} bytes`);
  assert.deepEqual(await decodeFile(bytes, key, 'batch-a-0000000001'), batch);
});

test('two devices that sync end up with the same data, as combining their backups would give', async () => {
  const { mine, theirs, a, b, syncA, syncB } = setUp();
  const first = await syncA();
  assert.equal(first.sent, 1);
  assert.equal(first.takenIn, 0);
  const second = await syncB();
  assert.equal(second.sent, 1);
  assert.equal(second.takenIn, 1);
  assert.ok(second.changed);
  const third = await syncA();
  assert.equal(third.sent, null);
  assert.equal(third.takenIn, 1);

  assert.deepEqual(sorted(a.data()), sorted(mergeBackups(mine, theirs).data));
  assert.deepEqual(sorted(b.data()), sorted(mergeBackups(theirs, mine).data));
  assert.deepEqual(learnersData(a.data()), learnersData(b.data()));
  assert.equal(a.outbox.size, 0);
  // What B took in from A was not put in B's outbox, to be sent back.
  assert.equal(b.outbox.size, 0);
});

test('syncing again with nothing new sends and takes in nothing', async () => {
  const { storage, syncA, syncB } = setUp();
  await syncA();
  await syncB();
  await syncA();
  const files = storage.files.size;
  const nothing = { sent: null, takenIn: 0, snapshotTakenIn: false, snapshotMade: false, startedAfresh: false, changed: false, problems: [] };
  assert.deepEqual(await syncA(), nothing);
  assert.deepEqual(await syncB(), nothing);
  assert.equal(storage.files.size, files);
});

test('a change made later goes in the next batch, and only it', async () => {
  const { a, b, storage, syncA, syncB } = setUp();
  await syncA();
  await syncB();
  const tea = word('茶', 'cha2', { day: 20 });
  a.save('words', [tea]);
  assert.equal((await syncA()).sent, 2);
  const device = await a.getSyncValue('device');
  const batch = await opened(storage, `batch-${device}-0000000002`);
  assert.deepEqual(batch.words, [tea]);
  assert.equal((await syncB()).takenIn, 1);
  assert.ok(b.data().words.some((entry) => entry.id === tea.id));
});

test('with no connection nothing is lost: the outbox waits for the next sync', async () => {
  const { a, b, storage, syncA, syncB } = setUp();
  storage.failing = true;
  await assert.rejects(syncA(), { reason: 'offline' });
  assert.ok(a.outbox.size > 0);
  storage.failing = false;
  assert.equal((await syncA()).sent, 1);
  await syncB();
  assert.ok(b.data().words.some((entry) => entry.id === '愛|ai4' && entry.definition === 'love (corrected)'));
});

test('a batch number found taken (saved, but not noted before the app closed) moves on to the next', async () => {
  const { a, storage, syncA, syncB } = setUp();
  await syncA();
  // As if the app had closed after saving batch 1 and before noting it:
  // number 1 is still the next.
  a.save('words', [word('茶', 'cha2', { day: 20 })]);
  await a.setSyncValue('nextNumber', 1);
  const result = await syncA();
  assert.equal(result.sent, 2);
  assert.equal((await syncB()).takenIn, 2);
  assert.equal(names(storage, 'batch-').length, 3);
});

test('a record changed again while its batch was being sent stays in the outbox', async () => {
  const { a, storage, syncA } = setUp();
  const save = storage.save;
  storage.save = async (name, bytes) => {
    a.save('words', [word('愛', 'ai4', { day: 30, definition: 'love, changed meanwhile' })]);
    return save(name, bytes);
  };
  await syncA();
  assert.deepEqual([...a.outbox.keys()], ['words:愛|ai4']);
});

test('a missing batch stops that device\'s later ones from being taken in', async () => {
  const { a, storage, syncA, syncB } = setUp();
  await syncA();
  a.save('words', [word('茶', 'cha2', { day: 20 })]);
  await syncA();
  storage.files.delete(names(storage, 'batch-')[0]);
  const result = await syncB();
  assert.equal(result.takenIn, 0);
  assert.deepEqual(result.problems.map((problem) => problem.reason), ['missing-batch']);
});

test('a file that isn\'t the batch its name says is not taken in', async () => {
  const { storage, syncA, syncB } = setUp();
  await syncA();
  const [name] = storage.files.keys();
  const batch = await opened(storage, name);
  storage.files.set(name, await encodeFile({ ...batch, number: 7 }, key, name));
  const result = await syncB();
  assert.equal(result.takenIn, 0);
  assert.deepEqual(result.problems.map((problem) => problem.reason), ['bad-batch']);
});

test('a sync asked for while one runs waits for it, then runs once for all that asked', async () => {
  const { a, storage } = setUp();
  let lists = 0;
  const list = storage.list;
  storage.list = async () => {
    lists++;
    return list();
  };
  const { syncNow } = createSync({ local: a, storage, key });
  const results = await Promise.all([syncNow(), syncNow(), syncNow()]);
  assert.equal(lists, 2);
  assert.equal(results[0].sent, 1);
  assert.equal(results[1], results[2]);
});

test('nothing in the storage can be read without the sync code', async () => {
  const { storage, syncA, syncB } = setUp({ snapshotAfterBytes: 0 });
  await syncA();
  await syncB();
  assert.ok(names(storage, 'snapshot-').length > 0);
  for (const [name, bytes] of storage.files) {
    const seen = Buffer.from(bytes).toString('latin1');
    for (const piece of ['ai4', 'mao1', 'love', 'meaning', 'theme', Buffer.from('愛').toString('latin1')]) {
      assert.ok(!seen.includes(piece), `${piece} in ${name}`);
    }
  }
});

test('a device with another sync code opens nothing and changes nothing', async () => {
  const { storage, syncA, b } = setUp();
  await syncA();
  const before = structuredClone(b.data());
  const otherKey = (await keysFor(await makeCode())).encryption;
  const result = await createSync({ local: b, storage, key: otherKey }).syncNow();
  assert.deepEqual(result.problems.map((problem) => problem.reason), ['cannot-open']);
  assert.equal(result.takenIn, 0);
  assert.deepEqual(b.data(), before);
});

test('data from before sync was turned on is sent whole, cards and all', async () => {
  const { mine, theirs } = twoDevices();
  const storage = memoryStorage();
  const a = memoryDevice(mine, { before: true });
  const b = memoryDevice(theirs, { before: true });
  await createSync({ local: a, storage, key }).syncNow();
  const batch = await opened(storage, names(storage, 'batch-')[0]);
  assert.equal(batch.cards.length, mine.cards.length);
  assert.ok(batch.settings.every((setting) => !DEVICE_SETTINGS.includes(setting.key)));
  assert.equal(a.outbox.size, 0);
  await createSync({ local: b, storage, key }).syncNow();
  await createSync({ local: a, storage, key }).syncNow();
  assert.deepEqual(sorted(a.data()), sorted(mergeBackups(mine, theirs).data));
  assert.deepEqual(learnersData(a.data()), learnersData(b.data()));
});

test('a snapshot is made when enough is sent, and the batches it covers are deleted', async () => {
  const { a, storage, syncA, syncB } = setUp({ snapshotAfterBytes: 1 });
  const first = await syncA();
  assert.equal(first.snapshotMade, true);
  assert.equal(names(storage, 'snapshot-').length, 1);
  assert.equal(names(storage, 'covers-').length, 1);
  // A's batch is covered by A's own snapshot, so it went at once.
  const deviceA = await a.getSyncValue('device');
  assert.deepEqual(names(storage, `batch-${deviceA}`), []);
  // B, on its first sync, takes in the snapshot rather than batches.
  const second = await syncB();
  assert.equal(second.snapshotTakenIn, true);
  assert.equal(second.takenIn, 0);
  // B made a snapshot of its own (B's batch was more than 1 byte), which
  // covers everything, so B's batch and A's old snapshot are going: A's when
  // A next syncs.
  assert.equal(second.snapshotMade, true);
  assert.equal(names(storage, 'batch-').length, 0);
  assert.equal(names(storage, 'snapshot-').length, 2);
  await syncA();
  assert.equal(names(storage, 'snapshot-').length, 1);
  assert.equal(names(storage, 'covers-').length, 1);
});

test('a new device joins from the snapshot and the batches after it', async () => {
  const { a, b, storage, syncA, syncB, syncOf } = setUp({ snapshotAfterBytes: 1 });
  await syncA();
  await syncB();
  await syncA();
  // A change after the snapshot, in a batch of its own.
  a.save('words', [word('茶', 'cha2', { day: 20 })]);
  await createSync({ local: a, storage, key }).syncNow();
  const c = memoryDevice();
  const result = await syncOf(c)();
  assert.equal(result.snapshotTakenIn, true);
  assert.ok(c.data().words.some((entry) => entry.id === '茶|cha2'));
  await syncB();
  assert.deepEqual(learnersData(c.data()), learnersData(a.data()));
  assert.deepEqual(learnersData(c.data()), learnersData(b.data()));
});

test('a device away while batches were deleted catches up through the snapshot', async () => {
  const { a, b, storage, syncA, syncB } = setUp();
  await syncA();
  await syncB();
  await syncA();
  // B goes away. A studies on and, with a low limit, makes a snapshot
  // that covers its batches, which are then deleted.
  a.save('words', [word('茶', 'cha2', { day: 20 })]);
  await createSync({ local: a, storage, key, snapshotAfterBytes: 1 }).syncNow();
  const deviceA = await a.getSyncValue('device');
  assert.deepEqual(names(storage, `batch-${deviceA}`), []);
  const result = await syncB();
  assert.equal(result.snapshotTakenIn, true);
  assert.deepEqual(result.problems, []);
  assert.ok(b.data().words.some((entry) => entry.id === '茶|cha2'));
});

test('a snapshot whose covers file never got saved doesn\'t count, and costs nothing', async () => {
  const { a, storage, syncOf } = setUp({ snapshotAfterBytes: 1 });
  // As if the app stopped between saving the snapshot and its covers file.
  const save = storage.save;
  storage.save = async (name, bytes) => {
    if (name.startsWith('covers-')) {
      throw Object.assign(new Error('no connection'), { reason: 'offline' });
    }
    return save(name, bytes);
  };
  await assert.rejects(syncOf(a)(), { reason: 'offline' });
  storage.save = save;
  assert.equal(names(storage, 'snapshot-').length, 1);
  assert.equal(names(storage, 'batch-').length, 1);
  // A new device takes the batch, not the snapshot.
  const c = memoryDevice();
  const result = await syncOf(c)();
  assert.equal(result.snapshotTakenIn, false);
  assert.equal(result.takenIn, 1);
  assert.ok(c.data().words.some((entry) => entry.id === '愛|ai4'));
});

test('a sync that only sends sends, and touches nothing else', async () => {
  const { a, storage, syncA, syncB } = setUp();
  await syncB();
  let lists = 0;
  const list = storage.list;
  storage.list = async () => {
    lists++;
    return list();
  };
  const result = await syncA({ sendOnly: true });
  assert.equal(result.sent, 1);
  assert.equal(result.takenIn, 0);
  assert.equal(lists, 0);
  assert.ok(!a.data().words.some((entry) => entry.id === '貓|mao1'));
  // A whole sync then takes B's in.
  assert.equal((await syncA()).takenIn, 1);
});

test('syncs asked for while one runs: one more, a whole one if any asked for that', async () => {
  const { a, storage } = setUp();
  let lists = 0;
  const list = storage.list;
  storage.list = async () => {
    lists++;
    return list();
  };
  const { syncNow } = createSync({ local: a, storage, key });
  await Promise.all([syncNow({ sendOnly: true }), syncNow({ sendOnly: true }), syncNow()]);
  assert.equal(lists, 1);
});

test('a device whose files the server lost sends everything again, as a new device, and others catch up', async () => {
  const { a, b, storage, syncA, syncB, syncOf } = setUp();
  await syncA();
  await syncB();
  await syncA();
  const before = await a.getSyncValue('device');
  // The server loses everything.
  storage.files.clear();
  const result = await syncA();
  assert.equal(result.startedAfresh, true);
  assert.equal(result.sent, 1);
  assert.notEqual(await a.getSyncValue('device'), before);
  assert.equal(names(storage, 'batch-').length, 1);
  // B too, the next time it syncs; and A's new batch, taken in, changes
  // nothing for B, which had it all.
  const second = await syncB();
  assert.equal(second.startedAfresh, true);
  assert.equal(second.takenIn, 1);
  // A device joining now gets everything, from batches numbered from 1.
  const c = memoryDevice();
  const third = await syncOf(c)();
  assert.deepEqual(third.problems, []);
  assert.deepEqual(learnersData(c.data()), learnersData(a.data()));
});

test('a device whose batches a snapshot covers has not lost them', async () => {
  const { a, storage, syncA } = setUp({ snapshotAfterBytes: 1 });
  await syncA();
  // Its batch went, covered by its snapshot.
  assert.equal(names(storage, 'batch-').length, 0);
  const device = await a.getSyncValue('device');
  const result = await syncA();
  assert.equal(result.startedAfresh, false);
  assert.equal(await a.getSyncValue('device'), device);
});
