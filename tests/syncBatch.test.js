// Tests for src/syncBatch.js: making batches of changes and taking in
// another device's, checked against combining whole backups (merge.js).
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { buildBatch, applyBatch, wordsTouched, isEmptyBatch } from '../src/syncBatch.js';
import { mergeBackups } from '../src/merge.js';
import { replay, GOOD, AGAIN } from '../src/scheduler.js';
import { START, DAY, word, device, sliceOf, saveChanges, sorted, twoDevices, outboxOf } from './fixtures/devices.js';

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
      { key: 'tipsSeen', value: ['review'], changedAt: START },
      { key: 'theme', value: 'dark', changedAt: START },
      { key: 'newWordsPerDay', value: 10, changedAt: START },
    ],
  });
  assert.deepEqual(batch.settings.map((setting) => setting.key), ['theme', 'newWordsPerDay']);
  assert.equal(batch.device, 'B');
  assert.equal(batch.number, 1);
  assert.ok(!isEmptyBatch(batch));
  assert.ok(isEmptyBatch(batchOf({})));
});

test('a card is worked out from its stored schedule and the later reviews alone, as from them all', () => {
  const love = word('愛', 'ai4', { day: 1 });
  const grades = [[1, GOOD], [3, AGAIN], [3.1, GOOD], [9, GOOD]];
  const mine = device({ words: [love], studied: [{ word: love, grades }] });
  const theirs = device({ words: [love], studied: [{ word: love, grades: [...grades, [25, AGAIN], [25.2, GOOD]] }] });
  const later = theirs.reviews.slice(4);
  const { data } = takeIn(mine, batchOf({ reviews: later }));
  assert.deepEqual(data.cards[0].fsrsState, replay(theirs.reviews).fsrsState);
  assert.deepEqual(data.cards[0], theirs.cards[0]);
  // A review made here in between: no going on from the stored card, the
  // whole history is replayed.
  const between = { ...later[0], id: 'between', time: START + 5 * DAY };
  const { data: mixed } = takeIn(mine, batchOf({ reviews: [between] }));
  assert.deepEqual(mixed.cards[0].fsrsState, replay([...mine.reviews, between]).fsrsState);
});

test('a whole history taken in on an empty device as it is gives what combining would', async () => {
  const { wholeAsChanges } = await import('../src/syncBatch.js');
  const { theirs } = twoDevices();
  const mySettings = [
    { key: 'tipsSeen', value: ['review'], changedAt: START },
    { key: 'theme', value: 'auto', changedAt: START + 99 * DAY },
    { key: 'newWordsPerDay', value: 3, changedAt: START + 99 * DAY },
  ];
  const empty = { words: [], cards: [], reviews: [], settings: mySettings, removed: [], decks: [] };
  const changes = wholeAsChanges(theirs, mySettings);
  assert.deepEqual(changes.remove, {});
  assert.deepEqual(sorted(saveChanges(empty, changes)), sorted(mergeBackups(empty, theirs).data));
  // Neither of the other's settings is taken: this device's look and
  // new-words setting were saved later.
  assert.equal(changes.put.settings, undefined);
});
