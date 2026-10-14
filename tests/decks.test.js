// Tests for src/decks.js. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  READY_MADE_LISTS,
  readyMadeDeck,
  missingReadyMadeDecks,
  wordsWithListsAsDecks,
  deckTree,
  deckWithInside,
  canBeInside,
  newDeckRecord,
  dailyGoal,
  isInDecks,
  withDeck,
  withoutDecks,
  wordsOnlyIn,
  DEFAULT_DECK,
  homeForEveryWord,
  flattenedReadyMadeDecks,
  lastActivity,
  isReadyMadeGroup,
} from '../src/decks.js';
import { parseReadyList, levelsOfReadyList, listTag } from '../src/words.js';

test('a ready-made list\'s levels have decks with fixed IDs, each on its own except the radicals\'', () => {
  // HSK and TOCFL levels stand on their own, after the decks made by hand.
  assert.equal(readyMadeDeck('hsk-3.0'), null);
  assert.deepEqual(readyMadeDeck('hsk-3.0/7-9'), { id: 'hsk-3.0/7-9', name: 'HSK 7-9 (3.0)', parentId: null, order: 106 });
  assert.deepEqual(readyMadeDeck('hsk-2.0/1'), { id: 'hsk-2.0/1', name: 'HSK 1 (2.0)', parentId: null, order: 110 });
  assert.deepEqual(readyMadeDeck('tocfl/Novice 2'), { id: 'tocfl/Novice 2', name: 'TOCFL Novice 2', parentId: null, order: 121 });
  // The radicals' levels are inside a deck of the radicals.
  assert.deepEqual(readyMadeDeck('radicals'), { id: 'radicals', name: 'Radicals 部首', parentId: null, order: 3 });
  assert.deepEqual(readyMadeDeck('radicals/Common'), { id: 'radicals/Common', name: 'Common', parentId: 'radicals', order: 0 });
  // A group of words inside a level: its number is its place, the rest its name.
  // Its name comes from the list, not from its ID, so it can change.
  const names = new Map([['tocfl/Novice 2/03', 'Education 教育']]);
  assert.deepEqual(readyMadeDeck('tocfl/Novice 2/03', names), {
    id: 'tocfl/Novice 2/03',
    name: 'Education 教育',
    parentId: 'tocfl/Novice 2',
    order: 3,
  });
  assert.equal(readyMadeDeck('tocfl/Novice 2/03').name, 'Group 3');
  assert.equal(readyMadeDeck('tocfl/Novice 2/Education'), null);
  assert.equal(readyMadeDeck('hsk-3.0/12'), null);
  assert.equal(readyMadeDeck('my textbook'), null);
});

test('the levels listed for the decks are those in the list files', () => {
  const files = {
    'hsk-3.0': 'hsk/hsk-3.0.tsv',
    'hsk-2.0': 'hsk/hsk-2.0.tsv',
    tocfl: 'tocfl/tocfl.tsv',
    radicals: 'radicals/radicals.tsv',
  };
  assert.deepEqual(READY_MADE_LISTS.map((list) => list.id), Object.keys(files));
  for (const list of READY_MADE_LISTS) {
    const entries = parseReadyList(fs.readFileSync(`data/wordlists/${files[list.id]}`, 'utf8'));
    assert.deepEqual(levelsOfReadyList(entries, []).map((entry) => entry.level), list.levels, list.id);
    // Every level's tag, as the Decks tab makes it, has a deck.
    for (const level of list.levels) {
      assert.equal(readyMadeDeck(listTag(list.id, level)).parentId, list.levelName ? null : list.id);
    }
    // So has every group's, inside its level and in the order of the file.
    const seen = new Map();
    for (const entry of entries.filter((candidate) => candidate.group !== '')) {
      const deck = readyMadeDeck(listTag(list.id, entry.level, entry.group));
      assert.equal(deck.parentId, listTag(list.id, entry.level), entry.group);
      const last = seen.get(entry.level) ?? 0;
      assert.ok(deck.order === last || deck.order === last + 1, `${list.id} ${entry.level}: ${entry.group} is out of order`);
      seen.set(entry.level, deck.order);
    }
  }
});

test('the lower levels of each list are divided into groups, with every word in one', () => {
  const grouped = {
    'hsk/hsk-3.0.tsv': { 1: 28, 2: 39, 3: 47, 4: 60, 5: 70, 6: 78 },
    'hsk/hsk-2.0.tsv': { 1: 11, 2: 10, 3: 17, 4: 37, 5: 77 },
    'tocfl/tocfl.tsv': { 'Novice 1': 11, 'Novice 2': 12, 1: 12, 2: 12, 3: 74 },
  };
  for (const [file, levels] of Object.entries(grouped)) {
    const entries = parseReadyList(fs.readFileSync(`data/wordlists/${file}`, 'utf8'));
    const groupsOf = new Map();
    for (const entry of entries) {
      const where = `${file} level ${entry.level}: ${entry.simplified}`;
      // A level has groups for all of its words or for none.
      assert.equal(entry.group !== '', entry.level in levels, where);
      if (entry.group !== '') {
        assert.match(entry.group, /^\d\d \S/, where);
        groupsOf.set(entry.level, (groupsOf.get(entry.level) || new Set()).add(entry.group));
      }
    }
    assert.deepEqual(Object.fromEntries([...groupsOf].map(([level, groups]) => [level, groups.size])), levels, file);
  }
});

test('only the decks that are not stored yet are made, with the list they are in', () => {
  const words = [
    { id: 'a', decks: ['hsk-3.0/1'] },
    { id: 'b', decks: ['hsk-3.0/1', 'hsk-2.0/2', 'made by hand'] },
    { id: 'c' },
  ];
  assert.deepEqual(missingReadyMadeDecks(words, []).map((deck) => deck.id), ['hsk-3.0/1', 'hsk-2.0/2']);
  assert.deepEqual(missingReadyMadeDecks(words, [{ id: 'hsk-3.0/1' }]).map((deck) => deck.id), ['hsk-2.0/2']);
  // A word in a group brings the group and its level.
  assert.deepEqual(
    missingReadyMadeDecks([{ id: 'd', decks: ['tocfl/1/02'] }], [], new Map([['tocfl/1/02', 'Work 工作']])).map((deck) => [deck.id, deck.name]),
    [['tocfl/1', 'TOCFL 1'], ['tocfl/1/02', 'Work 工作']],
  );
  // A radical brings the radicals' deck too.
  assert.deepEqual(missingReadyMadeDecks([{ id: 'e', decks: ['radicals/Common'] }], []).map((deck) => deck.id), ['radicals', 'radicals/Common']);
});

test('levels stored inside their list\'s deck come out of it, and the list\'s deck goes', () => {
  const decks = [
    { id: 'chinese', name: 'Chinese 中文', parentId: null, order: -1 },
    { id: 'hsk-3.0', name: 'HSK 3.0', parentId: null, order: 0, changedAt: 5 },
    { id: 'hsk-3.0/1', name: 'Level 1', parentId: 'hsk-3.0', order: 0, changedAt: 5 },
    { id: 'hsk-3.0/2', name: 'Year one', parentId: 'hsk-3.0', order: 1 },
    { id: 'hsk-3.0/1/01', name: 'Greetings', parentId: 'hsk-3.0/1', order: 1 },
    { id: 'mine', name: 'Extra', parentId: 'hsk-3.0', order: 4 },
    { id: 'radicals', name: 'Radicals 部首', parentId: null, order: 3 },
    { id: 'radicals/Common', name: 'Common', parentId: 'radicals', order: 0 },
  ];
  const { changed, removed } = flattenedReadyMadeDecks(decks, [{ id: 'a', decks: ['hsk-3.0/1/01'] }]);
  assert.deepEqual(changed, [
    // Renamed, unless it was renamed by hand; its time of change is the store's to give.
    { id: 'hsk-3.0/1', name: 'HSK 1 (3.0)', parentId: null, order: 100 },
    { id: 'hsk-3.0/2', name: 'Year one', parentId: null, order: 101 },
    { id: 'mine', name: 'Extra', parentId: null, order: 4 },
  ]);
  assert.deepEqual(removed, ['hsk-3.0']);
  // The list's deck stays while a word is in it directly.
  assert.deepEqual(flattenedReadyMadeDecks(decks, [{ id: 'b', decks: ['hsk-3.0'] }]).removed, []);
  // Once done there is nothing more to do.
  const after = decks.filter((deck) => deck.id !== 'hsk-3.0').map((deck) => changed.find((c) => c.id === deck.id) || deck);
  assert.deepEqual(flattenedReadyMadeDecks(after, []), { changed: [], removed: [] });
});

test('the list tags of words added before there were decks become their decks', () => {
  const words = [{ id: 'a', lists: ['hsk-3.0/1', 'hsk-2.0/1'], order: 3 }, { id: 'b' }, { id: 'c', decks: ['x'] }];
  assert.deepEqual(wordsWithListsAsDecks(words), [{ id: 'a', order: 3, decks: ['hsk-3.0/1', 'hsk-2.0/1'] }]);
});

// A textbook with two chapters, the second with a part of its own, and a
// deck beside it.
const DECKS = [
  { id: 'verbs', name: 'Verbs', parentId: null, order: 5 },
  { id: 'ch2', name: 'Chapter 2', parentId: 'book', order: 2 },
  { id: 'book', name: 'Textbook', parentId: null, order: 0 },
  { id: 'ch1', name: 'Chapter 1', parentId: 'book', order: 1 },
  { id: 'ch2b', name: 'Dialogue', parentId: 'ch2', order: 3 },
];

test('decks are listed as a tree, each followed by the decks inside it', () => {
  assert.deepEqual(
    deckTree(DECKS).map(({ deck, depth, label }) => [deck.id, depth, label]),
    [
      ['book', 0, 'Textbook'],
      ['ch1', 1, 'Textbook › Chapter 1'],
      ['ch2', 1, 'Textbook › Chapter 2'],
      ['ch2b', 2, 'Textbook › Chapter 2 › Dialogue'],
      ['verbs', 0, 'Verbs'],
    ],
  );
  // A deck whose parent is gone is listed at the top; decks inside each
  // other in a circle are not lost.
  assert.deepEqual(deckTree([{ id: 'a', name: 'A', parentId: 'gone', order: 0 }])[0].depth, 0);
  const circle = [{ id: 'a', name: 'A', parentId: 'b', order: 0 }, { id: 'b', name: 'B', parentId: 'a', order: 1 }];
  assert.equal(deckTree(circle).length, 2);
});

test('a deck cannot be put inside itself or a deck inside it', () => {
  assert.deepEqual([...deckWithInside(DECKS, 'book')].sort(), ['book', 'ch1', 'ch2', 'ch2b']);
  assert.deepEqual([...deckWithInside(DECKS, 'ch1')], ['ch1']);
  assert.equal(canBeInside(DECKS, 'book', 'ch2b'), false);
  assert.equal(canBeInside(DECKS, 'book', 'book'), false);
  assert.equal(canBeInside(DECKS, 'ch2b', 'verbs'), true);
  assert.equal(canBeInside(DECKS, 'ch2b', null), true);
});

test('a new deck goes after the others, and a deck may have a daily goal of its own', () => {
  assert.deepEqual(newDeckRecord('x', 'Idioms', 'book', DECKS), { id: 'x', name: 'Idioms', parentId: 'book', order: 6 });
  assert.equal(newDeckRecord('x', 'First', null, []).order, 0);
  assert.equal(dailyGoal(null, 5), 5);
  assert.equal(dailyGoal(DECKS[0], 5), 5);
  assert.equal(dailyGoal({ ...DECKS[0], newWordsPerDay: 0 }, 5), 0);
  assert.equal(dailyGoal({ ...DECKS[0], newWordsPerDay: 12 }, 5), 12);
});

test('words are put in decks and taken out of them', () => {
  const word = { id: 'a', decks: ['ch1'] };
  assert.equal(withDeck(word, 'ch1'), word);
  assert.deepEqual(withDeck(word, 'verbs').decks, ['ch1', 'verbs']);
  assert.deepEqual(withDeck({ id: 'b' }, 'verbs').decks, ['verbs']);
  assert.equal(isInDecks(word, deckWithInside(DECKS, 'book')), true);
  assert.equal(isInDecks(word, deckWithInside(DECKS, 'ch2')), false);
  assert.equal(isInDecks({ id: 'b' }, deckWithInside(DECKS, 'book')), false);
  assert.deepEqual(withoutDecks({ id: 'a', decks: ['ch1', 'verbs'] }, new Set(['ch1'])), { id: 'a', decks: ['verbs'] });
  assert.deepEqual(withoutDecks(word, new Set(['ch1'])), { id: 'a' });
});

test('the words a deck\'s deletion would leave without a deck are found', () => {
  const words = [
    { id: 'a', decks: ['ch1'] },
    { id: 'b', decks: ['ch1', 'ch2b'] },
    { id: 'c', decks: ['ch1', 'verbs'] },
    { id: 'd', decks: ['verbs'] },
    { id: 'e' },
  ];
  assert.deepEqual(wordsOnlyIn(words, deckWithInside(DECKS, 'book')).map((word) => word.id), ['a', 'b']);
});

test('every word gets a deck, and there is always one deck', () => {
  // A new device: no words, no decks.
  assert.deepEqual(homeForEveryWord([], []), { words: [], decks: [DEFAULT_DECK] });
  // Words in no deck, or only in a deck that is gone, go into the default one.
  const words = [{ id: 'a' }, { id: 'b', decks: ['gone'] }, { id: 'c', decks: ['ch1', 'gone'] }];
  const result = homeForEveryWord(words, DECKS);
  assert.deepEqual(result.words, [{ id: 'a', decks: ['chinese'] }, { id: 'b', decks: ['chinese'] }]);
  assert.deepEqual(result.decks, [DEFAULT_DECK]);
  // Nothing to do: the default deck is not made again once it was deleted.
  assert.deepEqual(homeForEveryWord([words[2]], DECKS), { words: [], decks: [] });
  // It is there already (renamed, even).
  const renamed = { ...DEFAULT_DECK, name: 'Mandarin' };
  assert.deepEqual(homeForEveryWord([{ id: 'a' }], [renamed]).decks, []);
});

test('a deck\'s last activity is the latest change to it, its words and their reviews, inside decks included', () => {
  const decks = [
    { id: 'book', name: 'Book', parentId: null, order: 0, changedAt: 10 },
    { id: 'ch1', name: 'Chapter 1', parentId: 'book', order: 0, changedAt: 20 },
    { id: 'other', name: 'Other', parentId: null, order: 1 },
  ];
  const words = [
    { id: 'a', decks: ['ch1'], addedAt: 30, learnedAt: 40 },
    { id: 'b', decks: ['other'], addedAt: 5, changedAt: 15 },
  ];
  const cards = [{ wordId: 'b', lastReviewedAt: 50 }, { wordId: 'a', lastReviewedAt: 35 }];
  const times = lastActivity(decks, words, cards);
  // Chapter 1's word was learned at 40, which counts for the book too.
  assert.equal(times.get('ch1'), 40);
  assert.equal(times.get('book'), 40);
  // Other's word was reviewed at 50.
  assert.equal(times.get('other'), 50);
  // A deck where nothing happened.
  assert.equal(lastActivity([{ id: 'x', parentId: null }], [], []).get('x'), 0);
});

test('the groups inside ready-made levels are told apart from other decks', () => {
  assert.equal(isReadyMadeGroup('tocfl/1/03'), true);
  assert.equal(isReadyMadeGroup('hsk-3.0/1/01'), true);
  assert.equal(isReadyMadeGroup('hsk-3.0/1'), false);
  assert.equal(isReadyMadeGroup('radicals/Common'), false);
  assert.equal(isReadyMadeGroup('a1b2c3'), false);
});
