// Tests for src/syncBatch.js: making batches of changes and taking in
// another device's, checked against combining whole backups (merge.js).
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBatch, applyBatch, wordsTouched, isEmptyBatch } from '../src/syncBatch.js';
import { mergeBackups } from '../src/merge.js';
import { gradeOptions, replay, GOOD, HARD, AGAIN, EASY } from '../src/scheduler.js';

const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-09-01T09:00:00').getTime();

// A word record. `changedAt` is given in days after START.
function word(traditional, pinyin, { day, ...rest } = {}) {
  return {
    id: `${traditional}|${pinyin}`,
    traditional,
    simplified: traditional,
    pinyin,
    definition: 'meaning',
    order: 0,
    decks: ['chinese'],
    ...(day === undefined ? {} : { changedAt: START + day * DAY }),
    ...rest,
  };
}

// A device's data, as a backup: its words, and for each entry of `studied`
// a card with the reviews that made it, as the app would have saved them.
//
// studied: [{ word, type, grades: [[day, grade], ...], name }]
//          `name` makes the review IDs; reviews of the same name and number
//          are the same review on two devices.
function device({ words = [], studied = [], removed = [], decks = [], settings = [] } = {}) {
  const cards = [];
  const reviews = [];
  for (const { word: studiedWord, type = 'meaning', grades, name = 'r' } of studied) {
    let state = null;
    let due = null;
    const id = `${studiedWord.id}#${type}`;
    grades.forEach(([day, grade], index) => {
      const time = START + day * DAY;
      ({ fsrsState: state, due } = gradeOptions(state, new Date(time))[grade]);
      reviews.push({ id: `${name}-${id}-${index}`, cardId: id, wordId: studiedWord.id, type, time, grade, script: 'traditional' });
    });
    cards.push({
      id,
      wordId: studiedWord.id,
      type,
      due,
      firstReviewedAt: START + grades[0][0] * DAY,
      lastReviewedAt: START + grades.at(-1)[0] * DAY,
      fsrsState: state,
    });
  }
  return { words, cards, reviews, settings, removed, decks };
}

// What readSlice in db.js reads, from data held in memory.
function sliceOf(data, wordIds) {
  return {
    words: data.words,
    decks: data.decks,
    settings: data.settings,
    removed: data.removed,
    reviews: data.reviews.filter((review) => wordIds.has(review.wordId)),
    cards: data.cards.filter((card) => wordIds.has(card.id.slice(0, card.id.indexOf('#')))),
  };
}

// What saveTakenIn in db.js does, to data held in memory.
function saveChanges(data, { put, remove }) {
  const result = {};
  for (const [storeName, records] of Object.entries(data)) {
    const keyName = storeName === 'settings' ? 'key' : 'id';
    const byKey = new Map(records.map((record) => [record[keyName], record]));
    for (const key of remove[storeName] || []) {
      byKey.delete(key);
    }
    for (const record of put[storeName] || []) {
      byKey.set(record[keyName], record);
    }
    result[storeName] = [...byKey.values()];
  }
  return result;
}

// Takes a batch in, as the app will: a slice, applyBatch, save.
function takeIn(data, batch) {
  const changes = applyBatch(sliceOf(data, wordsTouched(batch, data.words)), batch);
  return { data: saveChanges(data, changes), changes };
}

// A batch of these records (a device's whole data, or part of it).
function batchOf(records, number = 1) {
  return buildBatch({ device: 'B', number, madeAt: START, records });
}

// The records of a device's data, dealt into `count` batches in turn, so
// that a word may come in another batch than its reviews.
function dealt(data, count) {
  const parts = Array.from({ length: count }, () => ({ words: [], decks: [], settings: [], removed: [], reviews: [] }));
  let next = 0;
  for (const storeName of Object.keys(parts[0])) {
    for (const record of data[storeName]) {
      parts[next % count][storeName].push(record);
      next++;
    }
  }
  return parts.map((records, index) => batchOf(records, index + 1));
}

// Lists in a fixed order, so that two results can be compared.
function sorted(data) {
  const result = {};
  for (const [storeName, records] of Object.entries(data)) {
    const key = (record) => record.id ?? record.key;
    result[storeName] = [...records].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  }
  return result;
}

// Two devices that have studied some of the same words, each with words and
// a deck of its own, and one word removed on the other device.
function twoDevices() {
  const love = word('愛', 'ai4', { day: 1 });
  const loveLater = word('愛', 'ai4', { day: 5, definition: 'love (corrected)' });
  const cat = word('貓', 'mao1', { day: 2 });
  const dog = word('狗', 'gou3', { day: 1 });
  const fish = word('魚', 'yu2', { day: 3 });
  const shared = [[1, GOOD], [3, HARD]];
  const mine = device({
    words: [love, dog],
    studied: [
      { word: love, grades: shared },
      { word: dog, grades: [[1, GOOD], [4, AGAIN]] },
    ],
    decks: [{ id: 'chinese', name: 'Chinese', parentId: null, order: 0, changedAt: START }],
    settings: [
      { key: 'theme', value: 'dark', changedAt: START + 9 * DAY },
      { key: 'newWordsPerDay', value: 5, changedAt: START },
    ],
  });
  const theirs = device({
    words: [loveLater, cat, fish],
    studied: [
      { word: loveLater, grades: [...shared, [6, GOOD], [12, EASY]] },
      { word: cat, type: 'pinyin', grades: [[2, GOOD], [5, GOOD]], name: 's' },
      { word: fish, type: 'writing', grades: [[3, AGAIN], [3.01, GOOD]], name: 's' },
    ],
    removed: [{ id: dog.id, removedAt: START + 6 * DAY }],
    decks: [{ id: 'hsk', name: 'HSK', parentId: null, order: 1, changedAt: START + 2 * DAY }],
    settings: [
      { key: 'theme', value: 'light', changedAt: START + 10 * DAY },
      { key: 'newWordsPerDay', value: 10, changedAt: START + 3 * DAY },
    ],
  });
  return { mine, theirs };
}

// The other device's data as its outbox would hold it: no cards.
const outboxOf = (data) => ({ ...data, cards: undefined });

test('taking in another device\'s changes in one batch gives what combining backups gives', () => {
  const { mine, theirs } = twoDevices();
  const { data } = takeIn(mine, batchOf(outboxOf(theirs)));
  assert.deepEqual(sorted(data), sorted(mergeBackups(mine, theirs).data));
});

test('the same, dealt into batches taken in in any order', () => {
  const { mine, theirs } = twoDevices();
  const expected = sorted(mergeBackups(mine, theirs).data);
  const batches = dealt(outboxOf(theirs), 3);
  for (const order of [[0, 1, 2], [2, 1, 0], [1, 2, 0]]) {
    let data = mine;
    for (const index of order) {
      data = takeIn(data, batches[index]).data;
    }
    assert.deepEqual(sorted(data), expected, `order ${order}`);
  }
});

test('taking a batch in a second time changes nothing', () => {
  const { mine, theirs } = twoDevices();
  const batch = batchOf(outboxOf(theirs));
  const once = takeIn(mine, batch).data;
  const { data, changes } = takeIn(once, batch);
  assert.deepEqual(changes.put, {});
  assert.deepEqual(changes.remove, {});
  assert.deepEqual(sorted(data), sorted(once));
});

test('a batch reads and changes only the cards and reviews of the words it touches', () => {
  const { mine } = twoDevices();
  const cat = word('貓', 'mao1', { day: 2 });
  const batch = batchOf({ words: [cat] });
  assert.deepEqual([...wordsTouched(batch, mine.words)], [cat.id]);
  const { changes } = takeIn(mine, batch);
  assert.deepEqual(changes.put.words, [cat]);
  assert.equal(changes.put.cards, undefined);
  assert.equal(changes.put.reviews, undefined);
});

test('a word removed on the other device goes, with its cards, and its reviews stay', () => {
  const { mine } = twoDevices();
  const dogId = '狗|gou3';
  const { data, changes } = takeIn(mine, batchOf({ removed: [{ id: dogId, removedAt: START + 6 * DAY }] }));
  assert.deepEqual(changes.remove.words, [dogId]);
  assert.deepEqual(changes.remove.cards, [`${dogId}#meaning`]);
  assert.ok(!data.words.some((entry) => entry.id === dogId));
  assert.equal(data.reviews.filter((review) => review.wordId === dogId).length, 2);
});

test('a word corrected on the other device moves this device\'s cards and reviews to its new ID', () => {
  const wrong = word('行', 'xing2', { day: 1 });
  const mine = device({ words: [wrong], studied: [{ word: wrong, grades: [[1, GOOD], [2, GOOD]] }] });
  const right = word('行', 'hang2', { day: 3, formerIds: [wrong.id] });
  const batch = batchOf({ words: [right] });
  assert.deepEqual([...wordsTouched(batch, mine.words)].sort(), [right.id, wrong.id].sort());
  const { data } = takeIn(mine, batch);
  assert.deepEqual(data.words.map((entry) => entry.id), [right.id]);
  assert.deepEqual(data.cards.map((card) => card.id), [`${right.id}#meaning`]);
  assert.ok(data.reviews.every((review) => review.wordId === right.id && review.cardId === `${right.id}#meaning`));
  assert.deepEqual(sorted(data), sorted(mergeBackups(mine, { words: [right] }).data));
});

test('this device\'s correction holds against the other device\'s word under the old ID', () => {
  const wrong = word('行', 'xing2', { day: 1 });
  const right = word('行', 'hang2', { day: 3, formerIds: [wrong.id] });
  const mine = device({ words: [right], studied: [{ word: right, grades: [[1, GOOD]] }] });
  const theirs = device({ words: [wrong], studied: [{ word: wrong, grades: [[2, GOOD]], name: 's' }] });
  const { data } = takeIn(mine, batchOf(outboxOf(theirs)));
  assert.deepEqual(data.words.map((entry) => entry.id), [right.id]);
  assert.ok(data.reviews.every((review) => review.wordId === right.id));
  assert.deepEqual(sorted(data), sorted(mergeBackups(mine, theirs).data));
});

test('a grade corrected on the other device replaces the first copy here, and the card follows', () => {
  const love = word('愛', 'ai4', { day: 1 });
  const mine = device({ words: [love], studied: [{ word: love, grades: [[1, GOOD], [4, GOOD]] }] });
  const [first, second] = mine.reviews;
  const corrected = { ...second, grade: AGAIN, correctedAt: START + 4 * DAY + 60000 };
  const { data } = takeIn(mine, batchOf({ reviews: [corrected] }));
  assert.equal(data.reviews.find((review) => review.id === second.id).grade, AGAIN);
  const card = data.cards.find((entry) => entry.id === `${love.id}#meaning`);
  assert.deepEqual(card.fsrsState, replay([first, corrected]).fsrsState);
  // The first copy, sent again later, doesn't undo the correction.
  const again = takeIn(data, batchOf({ reviews: [second] }));
  assert.deepEqual(again.changes.put, {});
});

test('a batch leaves out the settings that belong to the device', () => {
  const batch = batchOf({
    settings: [
      { key: 'theme', value: 'dark', changedAt: START },
      { key: 'newWordsPerDay', value: 10, changedAt: START },
    ],
  });
  assert.deepEqual(batch.settings.map((setting) => setting.key), ['newWordsPerDay']);
  assert.equal(batch.device, 'B');
  assert.equal(batch.number, 1);
  assert.ok(!isEmptyBatch(batch));
  assert.ok(isEmptyBatch(batchOf({})));
});
