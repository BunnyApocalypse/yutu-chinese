// Tests for bringing a learner's study over from Skritter
// (src/skritterImport.js), on a small made-up export in Skritter's shape
// (tests/fixtures/skritter/, see its README).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { readSkritterExport, describeSkritter, planSkritterImport, candidatesFor } from '../src/skritterImport.js';
import { readDictionary } from '../src/dictionary.js';
import { replay } from '../src/scheduler.js';

const DICTIONARY = readDictionary(
  [
    '學習\t学习\txue2xi2\tto learn/to study',
    '你好\t\tni3hao3\thello/hi',
    '發\t发\tfa1\tto send out/to issue',
    '發\t发\tFa1\tsurname Fa',
    '髮\t发\tfa4\thair',
    '謝謝\t谢谢\txie4xie5\tto thank/thanks',
  ].join('\n'),
);

const START = 1767240000 * 1000; // the first session (make-fixture.js)
const WEEK_LATER = START + 7 * 86400 * 1000;
const NOW = Date.parse('2026-10-23T12:00:00Z');

const data = await readSkritterExport(new Uint8Array(fs.readFileSync('tests/fixtures/skritter/export.zip')));
const description = describeSkritter(data, { dictionary: DICTIONARY, meaningDetail: 'first' });

function contextWith(changes = {}) {
  let made = 0;
  return {
    words: [],
    decks: [],
    cards: new Map(),
    settings: { script: 'traditional' },
    now: NOW,
    randomId: () => `deck-${++made}`,
    ...changes,
  };
}

const plan = (leftOut = new Set(), changes = {}) =>
  planSkritterImport(data, description, { leftOut }, contextWith(changes));

test('the export is read from the zip, without the files a Mac adds', () => {
  assert.equal(data.items.length, 9);
  assert.equal(data.activities.length, 2);
  assert.equal(data.vocab.length, 2);
  assert.equal(data.lists[0].name, 'Textbook');
});

test('a zip that is not a Skritter export is refused', async () => {
  await assert.rejects(
    readSkritterExport(new Uint8Array(fs.readFileSync('tests/fixtures/anki/new.apkg'))),
    /isn’t the \.zip file Skritter sends/,
  );
});

test('the words studied, in the order first studied, with the words they may be', () => {
  // 你好's writing card was never studied, but its meaning card was.
  assert.deepEqual(
    description.words.map((word) => word.vocabId),
    ['zh-学习-1', 'zh-你好-0', 'zh-发-1', 'zh-㐀-0', 'zh-谢谢-0'],
  );
  assert.equal(description.cards, 8);
  assert.equal(description.reviews, 10); // the answer without a grade isn't one
  const of = (vocabId) => description.words.find((word) => word.vocabId === vocabId);
  // The learner's own meaning comes before the dictionary's.
  assert.deepEqual(
    of('zh-学习-1').candidates.map((word) => [word.id, word.definition]),
    [['學習|xue2xi2', 'to study (my own words)']],
  );
  // Two traditional forms: both, for the learner to check. The surname is
  // left out, as 发 is something else too.
  assert.deepEqual(
    of('zh-发-1').candidates.map((word) => word.id),
    ['發|fa1', '髮|fa4'],
  );
  assert.deepEqual(of('zh-㐀-0').candidates, []);
  assert.equal(of('zh-你好-0').reviews, 1);
});

test('a traditional form from a list settles a word, unless the list only repeats the simplified one', () => {
  const ids = (traditional) =>
    candidatesFor('发', new Set(['trad']), traditional, DICTIONARY).map((entry) => `${entry.traditional}|${entry.pinyin}`);
  assert.deepEqual(ids('髮'), ['髮|fa4']);
  assert.deepEqual(ids(undefined), ['發|fa1', '髮|fa4']);
  // A traditional form the dictionary doesn't have narrows nothing.
  assert.deepEqual(ids('X'), ['發|fa1', '髮|fa4']);
});

test('every card studied keeps its history and is due when Skritter said', () => {
  const { cards, reviews, words, report } = plan();
  assert.deepEqual(report, {
    newWords: 5,
    wordsThere: 0,
    cardsWithSchedule: 8,
    reviewsCopied: 10,
    alreadyStudied: 0,
    suspended: 1,
    leftOut: ['㐀'],
  });
  assert.deepEqual(
    words.map((word) => word.id),
    ['學習|xue2xi2', '你好|ni3hao3', '發|fa1', '髮|fa4', '謝謝|xie4xie5'],
  );
  const card = (id) => cards.find((candidate) => candidate.id === id);
  // Skritter's schedule as it was: due 20 days after the last review, with
  // its stability and difficulty.
  const writing = card('學習|xue2xi2#writing');
  assert.equal(writing.due, WEEK_LATER + 10 * 1000 + 20 * 86400 * 1000);
  assert.equal(writing.fsrsState.stability, 20.5);
  assert.equal(writing.fsrsState.difficulty, 4.2);
  // Without Skritter's memory, the interval stands in for the stability.
  assert.equal(card('學習|xue2xi2#meaning').fsrsState.stability, 15);
  assert.equal(card('學習|xue2xi2#meaning').fsrsState.difficulty, 5);
  // Rebuilding a card from its reviews gives the same, as combining
  // backups does.
  for (const each of cards) {
    const rebuilt = replay(reviews.filter((review) => review.cardId === each.id));
    assert.equal(rebuilt.due, each.due, each.id);
  }
  // Written in simplified in Skritter: the simplified writing card.
  assert.ok(card('謝謝|xie4xie5#writing#simplified'));
  // Its history, spread over the five minutes spent in the first session
  // (eight answers but one ungraded: 300 s / 7 each), and the grades.
  const pinyin = reviews.filter((review) => review.cardId === '學習|xue2xi2#pinyin' && !review.importedSchedule);
  assert.deepEqual(
    pinyin.map((review) => [review.time - START, review.grade]),
    [
      [Math.round(300000 / 7), 1],
      [2 * Math.round(300000 / 7), 3],
    ],
  );
  assert.ok(reviews.every((review) => review.fromSkritter && review.id.startsWith('skritter-')));
  // Words with cards from Skritter learn the rest a few a day.
  assert.ok(words.every((word) => word.importedAt === NOW));
});

test('the same file gives the same reviews, so importing it twice adds nothing', () => {
  const first = plan();
  const second = plan(new Set(), {
    words: first.words,
    decks: first.decks,
    cards: new Map(first.cards.map((card) => [card.id, card])),
  });
  assert.deepEqual(
    second.reviews.map((review) => review.id),
    [],
  );
  assert.equal(second.report.alreadyStudied, 8);
  assert.equal(second.report.wordsThere, 5);
  assert.deepEqual(second.decks, []);
  assert.deepEqual(
    plan().reviews.map((review) => review.id),
    first.reviews.map((review) => review.id),
  );
});

test('a word unticked is left out', () => {
  const { words, cards } = plan(new Set(['发>髮|fa4']));
  assert.ok(!words.some((word) => word.id === '髮|fa4'));
  assert.ok(cards.some((card) => card.wordId === '發|fa1'));
});

test("the learner's lists become decks inside Skritter, and banned words are suspended", () => {
  const { words, decks } = plan();
  assert.deepEqual(
    decks.map((deck) => [deck.id, deck.name, deck.parentId]),
    [
      ['deck-1', 'Skritter', null],
      ['deck-2', 'Textbook', 'deck-1'],
    ],
  );
  const word = (id) => words.find((candidate) => candidate.id === id);
  assert.deepEqual(word('學習|xue2xi2').decks, ['deck-2']);
  // 发 is in the list too, under the traditional form's Skritter word.
  assert.deepEqual(word('發|fa1').decks, ['deck-2']);
  assert.deepEqual(word('你好|ni3hao3').decks, ['deck-1']);
  assert.deepEqual(word('你好|ni3hao3').suspended, ['meaning', 'writing']);
});
