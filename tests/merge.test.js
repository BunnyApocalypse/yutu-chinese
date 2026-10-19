// Tests for src/merge.js: combining this device's data with a backup from
// another device.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeBackups, describeMerge } from '../src/merge.js';
import { gradeOptions, replay, GOOD, HARD, AGAIN } from '../src/scheduler.js';

const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-09-01T09:00:00').getTime();

// A word record. `changedAt` is given in days after START.
function word(traditional, pinyin, { day, simplified = traditional, ...rest } = {}) {
  return {
    id: `${traditional}|${pinyin}`,
    traditional,
    simplified,
    pinyin,
    definition: 'meaning',
    order: 0,
    decks: ['chinese'],
    ...(day === undefined ? {} : { changedAt: START + day * DAY }),
    ...rest,
  };
}

// A device as a backup: its words, and for each entry of `studied` a card
// with the reviews that made it, as the app would have saved them.
//
// studied: [{ word, type, grades: [[day, grade], ...], script, name }]
//          `name` makes the review IDs; reviews of the same name and number
//          are the same review on two devices.
function device({ words = [], studied = [], removed = [], decks = [], settings = [] } = {}) {
  const cards = [];
  const reviews = [];
  for (const { word: studiedWord, type = 'meaning', grades, script = 'traditional', name = 'r', cardId } of studied) {
    let state = null;
    let due = null;
    const id = cardId || `${studiedWord.id}#${type}`;
    grades.forEach(([day, grade], index) => {
      const time = START + day * DAY;
      ({ fsrsState: state, due } = gradeOptions(state, new Date(time))[grade]);
      reviews.push({ id: `${name}-${id}-${index}`, cardId: id, wordId: studiedWord.id, type, time, grade, script });
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

// Lists in a fixed order, so that two results can be compared.
function sorted(data) {
  const result = {};
  for (const [storeName, records] of Object.entries(data)) {
    const key = (record) => record.id ?? record.key;
    result[storeName] = [...records].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  }
  return result;
}

const ids = (records) => records.map((record) => record.id).sort();

test('combining keeps the words and reviews of both devices', () => {
  const love = word('愛', 'ai4', { day: 1 });
  const cat = word('貓', 'mao1', { day: 2 });
  const mine = device({ words: [love], studied: [{ word: love, grades: [[1, GOOD]] }] });
  const theirs = device({ words: [cat], studied: [{ word: cat, grades: [[2, GOOD]] }] });
  const { data, summary } = mergeBackups(mine, theirs);
  assert.deepEqual(ids(data.words), ['愛|ai4', '貓|mao1']);
  assert.equal(data.reviews.length, 2);
  assert.deepEqual(ids(data.cards), ['愛|ai4#meaning', '貓|mao1#meaning']);
  // Each card was only studied on one device, so it is kept exactly as stored.
  assert.deepEqual(data.cards.find((card) => card.wordId === cat.id), theirs.cards[0]);
  assert.deepEqual(data.cards.find((card) => card.wordId === love.id), mine.cards[0]);
  assert.deepEqual(summary, {
    wordsAdded: 1,
    wordsChanged: 0,
    wordsRemoved: 0,
    decksAdded: 0,
    decksRemoved: 0,
    reviewsAdded: 1,
    cardsChanged: 1,
    settingsChanged: 0,
  });
  assert.deepEqual(describeMerge(summary), ['1 new word', '1 new review', '1 card with a new schedule']);
});

test('combining gives the same result from either device, and nothing new the second time', () => {
  const love = word('愛', 'ai4', { day: 1 });
  const cat = word('貓', 'mao1', { day: 2 });
  const dog = word('狗', 'gou3', { day: 3 });
  const mine = device({
    words: [love, cat, { ...dog, definition: 'dog (mine)', changedAt: START + 9 * DAY }],
    studied: [
      { word: love, grades: [[1, GOOD], [2, GOOD], [5, HARD]], name: 'mine' },
      { word: cat, grades: [[2, GOOD]], name: 'mine' },
    ],
    decks: [{ id: 'chinese', name: 'Chinese', parentId: null, order: 0, changedAt: START }],
    settings: [{ key: 'newWordsPerDay', value: 5, changedAt: START }],
  });
  const theirs = device({
    words: [love, dog],
    studied: [
      { word: love, grades: [[3, GOOD], [4, AGAIN], [20, GOOD]], name: 'theirs' },
      { word: dog, type: 'pinyin', grades: [[4, GOOD]], name: 'theirs' },
    ],
    decks: [{ id: 'chinese', name: 'Mandarin', parentId: null, order: 0, changedAt: START + DAY }],
    settings: [{ key: 'newWordsPerDay', value: 10, changedAt: START + DAY }],
    removed: [{ id: '貓|mao1', removedAt: START + 6 * DAY }],
  });
  const here = mergeBackups(mine, theirs);
  const there = mergeBackups(theirs, mine);
  assert.deepEqual(sorted(here.data), sorted(there.data));

  // What it comes to: the later version of each record, the cat removed.
  assert.deepEqual(ids(here.data.words), ['愛|ai4', '狗|gou3']);
  assert.equal(here.data.words.find((entry) => entry.id === dog.id).definition, 'dog (mine)');
  assert.equal(here.data.decks[0].name, 'Mandarin');
  assert.equal(here.data.settings[0].value, 10);
  assert.equal(here.data.reviews.length, 8);
  assert.deepEqual(ids(here.data.cards), ['愛|ai4#meaning', '狗|gou3#pinyin']);

  // The word studied on both devices is scheduled from all six reviews.
  const loveReviews = here.data.reviews.filter((review) => review.wordId === love.id);
  const loveCard = here.data.cards.find((card) => card.wordId === love.id);
  assert.equal(loveReviews.length, 6);
  assert.deepEqual(
    { fsrsState: loveCard.fsrsState, due: loveCard.due },
    replay(loveReviews),
  );
  assert.equal(loveCard.firstReviewedAt, START + DAY);
  assert.equal(loveCard.lastReviewedAt, START + 20 * DAY);

  // Taking in the same backup again, or the combined data, changes nothing.
  const again = mergeBackups(here.data, theirs);
  assert.deepEqual(sorted(again.data), sorted(here.data));
  assert.deepEqual(describeMerge(again.summary), []);
  assert.deepEqual(describeMerge(mergeBackups(here.data, there.data).summary), []);
});

test('a word removed on one device stays removed, unless it was changed after that', () => {
  const love = word('愛', 'ai4', { day: 1 });
  const mine = device({ words: [love], studied: [{ word: love, grades: [[1, GOOD]] }] });
  const removedLater = device({ removed: [{ id: love.id, removedAt: START + 3 * DAY }] });
  let { data, summary } = mergeBackups(mine, removedLater);
  assert.deepEqual(data.words, []);
  assert.deepEqual(data.cards, []);
  // Reviews are never deleted, and the mark is kept for the next device.
  assert.equal(data.reviews.length, 1);
  assert.equal(data.removed.length, 1);
  assert.equal(summary.wordsRemoved, 1);

  const removedEarlier = device({ removed: [{ id: love.id, removedAt: START }] });
  ({ data } = mergeBackups(mine, removedEarlier));
  assert.deepEqual(ids(data.words), [love.id]);

  // A word from before records carried the time counts as older than any removal.
  const { changedAt, ...oldLove } = love;
  ({ data } = mergeBackups(device({ words: [oldLove] }), removedEarlier));
  assert.deepEqual(data.words, []);
});

test('a word removed and added again does not get its old schedule back', () => {
  // On the other device the word was studied for a month.
  const love = word('愛', 'ai4', { day: 0 });
  const theirs = device({
    words: [love],
    studied: [{ word: love, grades: [[1, GOOD], [2, GOOD], [10, GOOD], [30, GOOD]], name: 'theirs' }],
  });
  // Here it was studied at first (the same first two reviews, from an
  // earlier combining), removed on day 5, added again on day 40 and studied
  // once since.
  const addedAgain = word('愛', 'ai4', { day: 40 });
  const mine = device({
    words: [addedAgain],
    studied: [{ word: addedAgain, grades: [[41, GOOD]], name: 'mine' }],
    removed: [{ id: love.id, removedAt: START + 5 * DAY }],
  });
  mine.reviews.push(...theirs.reviews.slice(0, 2));

  for (const { data } of [mergeBackups(mine, theirs), mergeBackups(theirs, mine)]) {
    assert.equal(data.reviews.length, 5);
    assert.equal(data.words[0].changedAt, START + 40 * DAY);
    // Only what was studied after the removal counts: the other device's
    // reviews of days 10 and 30, and this one's of day 41.
    const [card] = data.cards;
    assert.equal(card.firstReviewedAt, START + 10 * DAY);
    const counted = data.reviews.filter((review) => review.time > START + 5 * DAY);
    assert.equal(counted.length, 3);
    assert.deepEqual({ fsrsState: card.fsrsState, due: card.due }, replay(counted));
  }

  // With no review since, the word is there without a card.
  const { data } = mergeBackups(device({ words: [addedAgain], removed: mine.removed }), {
    ...theirs,
    reviews: theirs.reviews.slice(0, 2),
  });
  assert.deepEqual(ids(data.words), [love.id]);
  assert.deepEqual(data.cards, []);
});

test('a word learned on both devices keeps the earlier lesson and its time', () => {
  const first = word('朋友', 'peng2you3', { day: 1, learnedAt: START + DAY, learnDuration: 80000 });
  // Saved later (so this record is kept), learned later, its lesson untimed.
  const second = word('朋友', 'peng2you3', { day: 3, learnedAt: START + 3 * DAY });
  const both = [
    mergeBackups(device({ words: [first] }), device({ words: [second] })),
    mergeBackups(device({ words: [second] }), device({ words: [first] })),
  ];
  for (const { data } of both) {
    assert.equal(data.words[0].learnedAt, START + DAY);
    assert.equal(data.words[0].learnDuration, 80000);
  }
  // The other way round, the later lesson's time doesn't come along.
  const timedLater = { ...second, learnDuration: 70000 };
  const untimedFirst = word('朋友', 'peng2you3', { day: 1, learnedAt: START + DAY });
  const { data } = mergeBackups(device({ words: [untimedFirst] }), device({ words: [timedLater] }));
  assert.equal(data.words[0].learnedAt, START + DAY);
  assert.equal(data.words[0].learnDuration, undefined);
});

test('a word corrected on one device takes the place of the old one on the other', () => {
  // The other device still has the word under its old ID, with reviews.
  const old = word('朋友', 'peng2you3', { day: 1, learnedAt: START + DAY, learnDuration: 95000 });
  const theirs = device({
    words: [old],
    studied: [{ word: old, grades: [[1, GOOD], [3, GOOD]], name: 'theirs' }],
  });
  // Here the pinyin was corrected, which moved the first review along.
  const corrected = word('朋友', 'peng2you5', { day: 2, formerIds: [old.id] });
  const mine = device({ words: [corrected] });
  mine.reviews.push({ ...theirs.reviews[0], wordId: corrected.id, cardId: `${corrected.id}#meaning` });

  for (const { data } of [mergeBackups(mine, theirs), mergeBackups(theirs, mine)]) {
    assert.deepEqual(ids(data.words), [corrected.id]);
    assert.deepEqual(data.words[0].formerIds, [old.id]);
    // When it was learned, and how long that took, are kept from the old record.
    assert.equal(data.words[0].learnedAt, START + DAY);
    assert.equal(data.words[0].learnDuration, 95000);
    assert.deepEqual(data.reviews.map((review) => review.wordId), [corrected.id, corrected.id]);
    assert.deepEqual(data.reviews.map((review) => review.cardId), [`${corrected.id}#meaning`, `${corrected.id}#meaning`]);
    assert.deepEqual(ids(data.cards), [`${corrected.id}#meaning`]);
    assert.equal(data.cards[0].wordId, corrected.id);
    assert.equal(data.cards[0].due, theirs.cards[0].due);
  }

  // The same characters added again under the old reading, after the
  // correction, are a word of their own.
  const both = device({ words: [corrected, word('朋友', 'peng2you3', { day: 5 })] });
  assert.deepEqual(ids(mergeBackups(both, theirs).data.words), [old.id, corrected.id]);
});

test('writing cards are worked out per script, whatever card ID an old review carries', () => {
  const study = word('學習', 'xue2xi2', { day: 1, simplified: '学习' });
  // Both devices studied the word in simplified before cards were kept per
  // script: the reviews carry the plain card ID, the card has been moved.
  const plain = `${study.id}#writing`;
  const side = (name, grades) => {
    const result = device({
      words: [study],
      studied: [{ word: study, type: 'writing', script: 'simplified', grades, name }],
    });
    result.cards[0].id = `${plain}#simplified`;
    return result;
  };
  const mine = side('mine', [[1, GOOD], [2, GOOD]]);
  const theirs = side('theirs', [[3, GOOD], [9, HARD]]);
  // The other device has since written it in traditional as well.
  const traditional = device({ studied: [{ word: study, type: 'writing', grades: [[12, GOOD]], name: 'trad' }] });
  theirs.cards.push(...traditional.cards);
  theirs.reviews.push(...traditional.reviews);

  const { data } = mergeBackups(mine, theirs);
  assert.deepEqual(ids(data.cards), [plain, `${plain}#simplified`]);
  const simplified = data.cards.find((card) => card.id.endsWith('#simplified'));
  assert.deepEqual(
    { fsrsState: simplified.fsrsState, due: simplified.due },
    replay(data.reviews.filter((review) => review.script === 'simplified')),
  );
  assert.equal(data.cards.find((card) => card.id === plain).firstReviewedAt, START + 12 * DAY);
});

test('settings that belong to the device stay as they are on it', () => {
  const mine = device({
    settings: [
      { key: 'welcomeDone', value: true, changedAt: START },
      { key: 'studyDeck', value: 'chinese', changedAt: START },
      { key: 'cardsFiledByScript', value: true, changedAt: START },
      { key: 'script', value: 'traditional', changedAt: START + 2 * DAY },
      { key: 'rawInput', value: true },
    ],
  });
  const theirs = device({
    settings: [
      { key: 'studyDeck', value: 'hsk-3.0', changedAt: START + 5 * DAY },
      { key: 'keepDataWanted', value: true, changedAt: START + 5 * DAY },
      { key: 'cardsFiledByScript', value: true, changedAt: START + 5 * DAY },
      { key: 'script', value: 'simplified', changedAt: START + DAY },
      { key: 'rawInput', value: false, changedAt: START + DAY },
      { key: 'lessons', value: false, changedAt: START + DAY },
    ],
  });
  const { data, summary } = mergeBackups(mine, theirs);
  const value = Object.fromEntries(data.settings.map((setting) => [setting.key, setting.value]));
  assert.deepEqual(value, {
    welcomeDone: true,
    studyDeck: 'chinese',
    cardsFiledByScript: true,
    script: 'traditional',
    rawInput: false,
    lessons: false,
  });
  assert.equal(summary.settingsChanged, 2);

  // A backup from before writing cards were filed by script: the note that
  // it was done here is left out, so the app files the cards again.
  const older = { words: [], cards: [], reviews: [], settings: [] };
  assert.equal(mergeBackups(mine, older).data.settings.some((setting) => setting.key === 'cardsFiledByScript'), false);
  // Such a backup has no decks or marks of removal; none are made up.
  assert.deepEqual(mergeBackups(mine, older).data.decks, []);
});

test('a deck deleted on one device stays deleted, unless it was changed after that', () => {
  const deck = (id, day) => ({ id, name: id, parentId: null, order: 0, changedAt: START + day * DAY });
  const mine = device({ decks: [deck('chinese', 0), deck('animals', 1), deck('food', 8)] });
  const theirs = device({
    decks: [deck('chinese', 0)],
    removed: [
      { id: 'animals', kind: 'deck', removedAt: START + 4 * DAY },
      { id: 'food', kind: 'deck', removedAt: START + 4 * DAY },
    ],
  });
  const { data, summary } = mergeBackups(mine, theirs);
  assert.deepEqual(ids(data.decks), ['chinese', 'food']);
  assert.equal(summary.decksRemoved, 1);
});
