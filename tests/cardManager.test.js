// Tests for src/cardManager.js: starting a card over, how a word's cards
// stand, and marking a word as known; and that combining backups (merge.js)
// goes along with a card started over.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { withStartedOver, countedFrom, cardsOfWord, markedKnown } from '../src/cardManager.js';
import { mergeBackups } from '../src/merge.js';
import { gradeOptions, replay, GOOD, EASY } from '../src/scheduler.js';

const DAY = 24 * 60 * 60 * 1000;
const START = new Date('2026-09-01T09:00:00').getTime();
const study = { id: '學習|xue2xi2', traditional: '學習', simplified: '学习', pinyin: 'xue2xi2', definition: 'to study', order: 0 };

// A card with the reviews that made it, as the app would have saved them.
function studied(word, type, days, { script = 'traditional', name = 'r' } = {}) {
  const id = `${word.id}#${type}${script === 'simplified' && type === 'writing' ? '#simplified' : ''}`;
  let state = null;
  let due = null;
  const reviews = days.map((day, index) => {
    const time = START + day * DAY;
    ({ fsrsState: state, due } = gradeOptions(state, new Date(time))[GOOD]);
    return { id: `${name}-${id}-${index}`, cardId: id, wordId: word.id, type, time, grade: GOOD, script };
  });
  return { card: { id, wordId: word.id, type, due, firstReviewedAt: reviews[0].time, lastReviewedAt: reviews.at(-1).time, fsrsState: state }, reviews };
}

test('a word notes when each kind of card was started over', () => {
  const once = withStartedOver(study, 'writing', 100);
  const twice = withStartedOver(withStartedOver(once, 'tone', 200), 'writing', 300);
  assert.deepEqual(twice.startedOverAt, { writing: 300, tone: 200 });
  assert.equal(countedFrom(twice, 'writing'), 300);
  assert.equal(countedFrom(twice, 'meaning'), -1);
  assert.equal(countedFrom(study, 'writing'), -1);
  // The word given is left as it was.
  assert.equal(study.startedOverAt, undefined);
});

test('how a word\'s cards stand is listed kind by kind', () => {
  const meaning = studied(study, 'meaning', [1, 2, 5]);
  const simplified = studied(study, 'writing', [1, 3], { script: 'simplified' });
  const word = { ...study, suspended: ['tone'], startedOverAt: { meaning: START + 3 * DAY } };
  const rows = cardsOfWord(word, [meaning.card, simplified.card], [...meaning.reviews, ...simplified.reviews], 'traditional');
  assert.deepEqual(
    rows.map((row) => [row.type, row.script, Boolean(row.card), row.reviewCount, row.suspended]),
    [
      // Only the review made after the meaning card was started over counts.
      ['meaning', 'traditional', true, 1, false],
      ['pinyin', 'traditional', false, 0, false],
      ['tone', 'traditional', false, 0, true],
      // The writing card studied (none yet), then the one in the other script.
      ['writing', 'traditional', false, 0, false],
      ['writing', 'simplified', true, 2, false],
    ],
  );
  // Without the reviews the cards are listed all the same.
  assert.equal(cardsOfWord(word, [meaning.card], null, 'traditional')[0].reviewCount, null);
});

test('marking a word as known answers its new cards Easy and makes it learned', () => {
  const meaning = studied(study, 'meaning', [1]);
  let next = 0;
  const now = START + 10 * DAY;
  const known = markedKnown(study, [meaning.card], ['meaning', 'pinyin', 'writing'], 'simplified', now, () => `id${next++}`);
  // The meaning card was studied already and tone cards are switched off.
  assert.deepEqual(known.cards.map((card) => card.id), ['學習|xue2xi2#pinyin', '學習|xue2xi2#writing#simplified']);
  assert.deepEqual(known.reviews.map((review) => [review.id, review.cardId, review.grade, review.script, review.markedKnown]), [
    ['id0', '學習|xue2xi2#pinyin', EASY, 'simplified', true],
    ['id1', '學習|xue2xi2#writing#simplified', EASY, 'simplified', true],
  ]);
  assert.equal(known.word.learnedAt, now);
  // The cards are what working them out from their reviews gives, and come
  // back in days, not minutes.
  const [card] = known.cards;
  assert.deepEqual({ fsrsState: card.fsrsState, due: card.due }, replay([known.reviews[0]]));
  assert.ok(card.due - now >= DAY);
  // A word that was learned keeps the time it was, and nothing is left to mark.
  const again = markedKnown({ ...study, learnedAt: 5 }, [meaning.card, ...known.cards], ['meaning', 'pinyin', 'writing'], 'simplified', now, () => 'x');
  assert.equal(again.word.learnedAt, 5);
  assert.deepEqual(again.cards, []);
});

test('a card started over on one device is not brought back by the other\'s reviews', () => {
  const before = studied(study, 'meaning', [1, 2, 5, 20], { name: 'theirs' });
  const pinyin = studied(study, 'pinyin', [1, 2], { name: 'theirs' });
  // The other device studied the word for weeks and has changed it since.
  const theirs = {
    words: [{ ...study, definition: 'to learn', changedAt: START + 40 * DAY }],
    cards: [before.card, pinyin.card],
    reviews: [...before.reviews, ...pinyin.reviews],
  };
  // Here its meaning card was started over on day 30 and studied once since.
  const since = studied(study, 'meaning', [31], { name: 'mine' });
  const mine = {
    words: [{ ...withStartedOver(study, 'meaning', START + 30 * DAY), changedAt: START + 30 * DAY }],
    cards: [since.card, pinyin.card],
    reviews: [...before.reviews.slice(0, 2), ...since.reviews, ...pinyin.reviews],
  };
  for (const { data } of [mergeBackups(mine, theirs), mergeBackups(theirs, mine)]) {
    const [word] = data.words;
    // The later record is kept, with the time the card was started over.
    assert.equal(word.definition, 'to learn');
    assert.deepEqual(word.startedOverAt, { meaning: START + 30 * DAY });
    assert.equal(data.reviews.length, 7);
    const meaning = data.cards.find((card) => card.type === 'meaning');
    assert.equal(meaning.firstReviewedAt, START + 31 * DAY);
    assert.deepEqual({ fsrsState: meaning.fsrsState, due: meaning.due }, replay(since.reviews));
    // The other kind of card is untouched.
    assert.deepEqual(data.cards.find((card) => card.type === 'pinyin'), pinyin.card);
  }
  // Started over and not studied since: no card.
  const { data } = mergeBackups({ ...mine, cards: [pinyin.card], reviews: mine.reviews.filter((review) => !since.reviews.includes(review)) }, theirs);
  assert.deepEqual(data.cards.map((card) => card.type), ['pinyin']);
});
