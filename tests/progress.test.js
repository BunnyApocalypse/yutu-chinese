// Tests for src/progress.js: the numbers on the Progress tab.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cardStage,
  cardStages,
  learnedAtOf,
  timeByDay,
  todayStats,
  rangeDays,
  barSize,
  groupDays,
  hanCharacters,
  growthByDay,
  growthOver,
} from '../src/progress.js';

const at = (text) => new Date(text).getTime();
const word = (traditional, simplified, pinyin, more = {}) => ({
  id: `${traditional}|${pinyin}`,
  traditional,
  simplified,
  pinyin,
  ...more,
});
const reviewCard = (scheduledDays, state = 2) => ({ fsrsState: { state, scheduled_days: scheduledDays } });

test('a card is new, learning, young or mature', () => {
  assert.equal(cardStage(undefined), 'new');
  assert.equal(cardStage({ fsrsState: { state: 0 } }), 'new');
  assert.equal(cardStage(reviewCard(0, 1)), 'learning');
  // Forgotten and being learned again.
  assert.equal(cardStage(reviewCard(0, 3)), 'learning');
  assert.equal(cardStage(reviewCard(20)), 'young');
  assert.equal(cardStage(reviewCard(21)), 'mature');
});

test('cards are counted by kind and stage, only those a word can have', () => {
  const you = word('你', '你', 'nǐ', { learnedAt: 1 });
  const learn = word('學', '学', 'xué');
  const cards = new Map([
    ['你|nǐ#meaning', reviewCard(30)],
    // The simplified writing card: the one counted for a simplified learner.
    ['你|nǐ#writing', reviewCard(5)],
  ]);
  const stages = cardStages([you, learn], cards, {
    types: ['meaning', 'tone', 'writing'],
    // 學 can't have a tone card here, say.
    hasCardType: (each, type) => !(each === learn && type === 'tone'),
    scriptOf: () => 'simplified',
  });
  assert.deepEqual(
    stages.rows.map((row) => [row.type, row.counts, row.total]),
    [
      ['meaning', { new: 1, learning: 0, young: 0, mature: 1 }, 2],
      ['tone', { new: 1, learning: 0, young: 0, mature: 0 }, 1],
      ['writing', { new: 1, learning: 0, young: 1, mature: 0 }, 2],
    ],
  );
  assert.deepEqual(stages.all, { counts: { new: 3, learning: 0, young: 1, mature: 1 }, total: 5 });
});

test('a word without learnedAt was learned when its first card was first reviewed', () => {
  const cards = new Map([
    ['a#meaning', { wordId: 'a', firstReviewedAt: 50 }],
    ['a#pinyin', { wordId: 'a', firstReviewedAt: 20 }],
  ]);
  assert.equal(learnedAtOf({ id: 'a', learnedAt: 99 }, cards), 99);
  assert.equal(learnedAtOf({ id: 'a' }, cards), 20);
  assert.equal(learnedAtOf({ id: 'b' }, cards), undefined);
});

test('time studied adds reviews and lessons on their study day', () => {
  const reviews = [
    { time: at('2026-10-19T10:00:00'), duration: 5000 },
    // Before 4:00: still the 19th.
    { time: at('2026-10-20T03:00:00'), duration: 3000 },
    // From before durations were kept.
    { time: at('2026-10-18T10:00:00') },
  ];
  const words = [{ learnedAt: at('2026-10-19T12:00:00'), learnDuration: 60000 }, { learnedAt: at('2026-10-18T12:00:00') }];
  assert.deepEqual([...timeByDay(reviews, words)], [['2026-10-19', 68000]]);
});

test('today: cards, words, time, and how many answers were right', () => {
  const now = at('2026-10-19T20:00:00');
  const reviews = [
    { cardId: 'a#meaning', wordId: 'a', time: at('2026-10-19T10:00:00'), grade: 3, duration: 4000 },
    { cardId: 'a#meaning', wordId: 'a', time: at('2026-10-19T11:00:00'), grade: 1, duration: 6000 },
    { cardId: 'b#meaning', wordId: 'b', time: at('2026-10-19T12:00:00'), grade: 3 },
    // Marked as known: counts for nothing.
    { cardId: 'c#meaning', wordId: 'c', time: at('2026-10-19T13:00:00'), grade: 3, markedKnown: true },
    // Yesterday.
    { cardId: 'd#meaning', wordId: 'd', time: at('2026-10-18T13:00:00'), grade: 3 },
  ];
  const words = [{ id: 'a', learnedAt: at('2026-10-19T09:00:00'), learnDuration: 30000 }];
  assert.deepEqual(todayStats(reviews, words, now), { cards: 2, words: 1, time: 40000, reviews: 3, right: 2 });
});

test('a range is its days up to today; "all" starts on the first day studied', () => {
  const now = at('2026-10-19T20:00:00');
  const month = rangeDays('month', now);
  assert.equal(month.length, 30);
  assert.equal(month[0], '2026-09-20');
  assert.equal(month[29], '2026-10-19');
  assert.equal(rangeDays('year', now).length, 365);
  assert.deepEqual(rangeDays('all', now, '2026-10-17'), ['2026-10-17', '2026-10-18', '2026-10-19']);
  assert.deepEqual(rangeDays('all', now, null), ['2026-10-19']);
});

test('bars are days for a month, weeks for 3 months, months for longer', () => {
  assert.equal(barSize(30), 'day');
  assert.equal(barSize(91), 'week');
  assert.equal(barSize(365), 'month');
  const days = rangeDays('months3', at('2026-10-19T20:00:00'));
  const weeks = groupDays(days, 'week');
  assert.equal(weeks.length, 13);
  assert.deepEqual(weeks[12].keys, days.slice(-7));
  const months = groupDays(['2026-09-29', '2026-09-30', '2026-10-01'], 'month');
  assert.deepEqual(months, [
    { month: '2026-09', keys: ['2026-09-29', '2026-09-30'] },
    { month: '2026-10', keys: ['2026-10-01'] },
  ]);
});

test('only Chinese characters are characters', () => {
  assert.deepEqual(hanCharacters('卡拉OK'), ['卡', '拉']);
  assert.deepEqual(hanCharacters('你好！'), ['你', '好']);
  assert.deepEqual(hanCharacters(undefined), []);
});

test('words are counted by their characters, characters once, from the day first learned', () => {
  const day1 = at('2026-10-17T10:00:00');
  const day2 = at('2026-10-18T10:00:00');
  const words = [
    word('你好', '你好', 'nǐhǎo', { learnedAt: day1 }),
    word('好', '好', 'hǎo', { learnedAt: day2 }),
    // One word with two readings.
    word('行', '行', 'xíng', { learnedAt: day1 }),
    word('行', '行', 'háng', { learnedAt: day2 }),
    // Left out: not learned, a sentence, a radical.
    word('學', '学', 'xué'),
    word('我很好。', '我很好。', '', { kind: 'sentence', learnedAt: day1 }),
    word('氵', '氵', '', { kind: 'radical', learnedAt: day1 }),
  ];
  const days = growthByDay(words, new Map(), { script: 'simplified', scriptOf: () => 'simplified' });
  assert.deepEqual([...days], [
    ['2026-10-17', { words: 2, characters: 3 }],
    ['2026-10-18', { words: 1, characters: 0 }],
  ]);
});

test('characters are counted in the learner\'s script, or apart in both with the switch', () => {
  const day1 = at('2026-10-17T10:00:00');
  const day2 = at('2026-10-18T10:00:00');
  const they = word('他們', '他们', 'tāmen', { learnedAt: day1 });
  const you = word('你們', '你们', 'nǐmen', { learnedAt: day1, cardScript: 'traditional' });
  // 他們 written in traditional too, a day later.
  const cards = new Map([
    ['他們|tāmen#writing#simplified', { firstReviewedAt: day1 }],
    ['他們|tāmen#writing', { firstReviewedAt: day2 }],
  ]);
  const scriptOf = (each) => each.cardScript || 'simplified';
  // Off: one count, in the learner's script (他 们 你).
  const together = growthByDay([they, you], cards, { script: 'simplified', scriptOf });
  assert.deepEqual([...together], [['2026-10-17', { words: 2, characters: 3 }]]);
  // Apart: 他 们 (simplified), 你 們 (你們 is studied in traditional), then
  // 們 again from 他們's traditional writing card: already known.
  const apart = growthByDay([they, you], cards, { script: 'simplified', apart: true, scriptOf });
  assert.deepEqual([...apart], [['2026-10-17', { words: 2, characters: 4 }]]);
  // Only 他們 in simplified, then written in traditional: 們 is new on day 2.
  const later = growthByDay([they], cards, { script: 'simplified', apart: true, scriptOf });
  assert.deepEqual([...later], [
    ['2026-10-17', { words: 1, characters: 2 }],
    ['2026-10-18', { words: 0, characters: 1 }],
  ]);
});

test('running totals include what came before the range', () => {
  const days = new Map([
    ['2026-10-01', { words: 5, characters: 7 }],
    ['2026-10-18', { words: 1, characters: 2 }],
  ]);
  assert.deepEqual(growthOver(['2026-10-17', '2026-10-18', '2026-10-19'], days), [
    { key: '2026-10-17', words: 5, characters: 7 },
    { key: '2026-10-18', words: 6, characters: 9 },
    { key: '2026-10-19', words: 6, characters: 9 },
  ]);
});
