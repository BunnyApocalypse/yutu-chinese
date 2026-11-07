// Tests for src/sync.js: devices sending and taking in batches through a
// shared storage. Both the storage and each device's database are stand-ins
// held in memory here; the database part is tested in a real browser in
// tests/browser/sync.browser.js.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSync, encodeFile, decodeFile } from '../src/sync.js';
import { mergeBackups, DEVICE_SETTINGS } from '../src/merge.js';
import { word, sliceOf, saveChanges, sorted, twoDevices } from './fixtures/devices.js';

const KEYS = { words: 'id', cards: 'id', reviews: 'id', settings: 'key', removed: 'id', decks: 'id' };
const SYNCED = ['words', 'settings', 'decks', 'reviews', 'removed'];

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
      return [...files.keys()];
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

// A device's database held in memory, with what db.js offers syncing.
// Everything in `initial` was saved while sync was on, so it is all in the
// outbox, except cards, which are never sent.
function memoryDevice(initial) {
  let data = Object.fromEntries(Object.keys(KEYS).map((storeName) => [storeName, [...(initial[storeName] || [])]]));
  const outbox = new Map();
  const values = new Map();
  let tokens = 0;
  const note = (storeName, key) => {
    const entryKey = `${storeName}:${key}`;
    outbox.set(entryKey, { key: entryKey, store: storeName, id: key, token: ++tokens });
  };
  for (const storeName of SYNCED) {
    for (const record of data[storeName]) {
      note(storeName, record[KEYS[storeName]]);
    }
  }
  return {
    data: () => data,
    outbox,
    // What the app does when the learner saves records, with sync on.
    save(storeName, records) {
      data = saveChanges(data, { put: { [storeName]: records }, remove: {} });
      for (const record of records) {
        note(storeName, record[KEYS[storeName]]);
      }
    },
    async getSyncValue(key, fallback) {
      return values.has(key) ? structuredClone(values.get(key)) : fallback;
    },
    async setSyncValue(key, value) {
      values.set(key, structuredClone(value));
    },
    async readOutbox() {
      const entries = [...outbox.values()].map((entry) => ({ ...entry }));
      const records = Object.fromEntries(SYNCED.map((storeName) => [storeName, []]));
      for (const entry of entries) {
        const record = data[entry.store].find((found) => found[KEYS[entry.store]] === entry.id);
        if (record) {
          records[entry.store].push(record);
        }
      }
      return { entries, records };
    },
    async takeOffOutbox(entries) {
      for (const entry of entries) {
        if (outbox.get(entry.key)?.token === entry.token) {
          outbox.delete(entry.key);
        }
      }
    },
    async getAll(storeName) {
      return data[storeName];
    },
    async readSlice(wordIds) {
      return sliceOf(data, wordIds);
    },
    async saveTakenIn(changes) {
      data = saveChanges(data, changes);
    },
  };
}

// Two devices with their data, syncing through one storage.
function setUp() {
  const { mine, theirs } = twoDevices();
  const storage = memoryStorage();
  const a = memoryDevice(mine);
  const b = memoryDevice(theirs);
  return {
    mine,
    theirs,
    storage,
    a,
    b,
    syncA: createSync({ local: a, storage }).syncNow,
    syncB: createSync({ local: b, storage }).syncNow,
  };
}

// A device's data without the settings that belong to it, which differ
// between devices by design.
const learnersData = (data) =>
  sorted({ ...data, settings: data.settings.filter((setting) => !DEVICE_SETTINGS.includes(setting.key)) });

test('a file is the batch compressed, and opens again as it was', async () => {
  const batch = { format: 1, device: 'a', number: 1, words: [word('愛', 'ai4')], text: '愛'.repeat(1000) };
  const bytes = await encodeFile(batch);
  assert.ok(bytes.length < 500, `${bytes.length} bytes`);
  assert.deepEqual(await decodeFile(bytes), batch);
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
  assert.deepEqual(await syncA(), { sent: null, takenIn: 0, changed: false, problems: [] });
  assert.deepEqual(await syncB(), { sent: null, takenIn: 0, changed: false, problems: [] });
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
  const batch = await decodeFile(storage.files.get(`batch-${device}-0000000002`));
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
  assert.equal([...storage.files.keys()].filter((name) => name.startsWith('batch-')).length, 3);
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
  const firstOfA = [...storage.files.keys()].find((name) => name.endsWith('0000000001'));
  storage.files.delete(firstOfA);
  const result = await syncB();
  assert.equal(result.takenIn, 0);
  assert.deepEqual(result.problems.map((problem) => problem.reason), ['missing-batch']);
});

test('a file that isn\'t the batch its name says is not taken in', async () => {
  const { storage, syncA, syncB } = setUp();
  await syncA();
  const [name] = storage.files.keys();
  const batch = await decodeFile(storage.files.get(name));
  storage.files.set(name, await encodeFile({ ...batch, number: 7 }));
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
  const { syncNow } = createSync({ local: a, storage });
  const results = await Promise.all([syncNow(), syncNow(), syncNow()]);
  assert.equal(lists, 2);
  assert.equal(results[0].sent, 1);
  assert.equal(results[1], results[2]);
});
