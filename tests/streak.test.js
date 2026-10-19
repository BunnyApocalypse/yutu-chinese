// Tests for src/streak.js: which days count, and the streak worked out from
// them.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { studyDayKey, previousDayKey, studyByDay, dayCounts, streakAt, streakLine } from '../src/streak.js';

const goal = { cards: 10, words: 2 };
const at = (text) => new Date(text).getTime();

// `count` reviews of different cards at the given time.
const reviewsAt = (text, count, wordId = 'w') =>
  Array.from({ length: count }, (_, index) => ({ cardId: `${wordId}#${index}`, wordId, time: at(text) }));

test('a study day starts at 4:00 and is named by the date it began', () => {
  assert.equal(studyDayKey(at('2026-10-19T04:00:00')), '2026-10-19');
  assert.equal(studyDayKey(at('2026-10-20T03:59:00')), '2026-10-19');
  assert.equal(previousDayKey('2026-11-01'), '2026-10-31');
  assert.equal(previousDayKey('2026-01-01'), '2025-12-31');
  // Over a change of clocks (late October in Europe) too.
  assert.equal(previousDayKey('2026-10-26'), '2026-10-25');
});

test('a day counts with enough different cards or enough words learned', () => {
  // The same card twice is one card.
  const twice = [...reviewsAt('2026-10-19T10:00:00', 9), { cardId: 'w#0', wordId: 'w', time: at('2026-10-19T11:00:00') }];
  assert.equal(dayCounts(studyByDay(twice, []).get('2026-10-19'), goal), false);
  const ten = reviewsAt('2026-10-19T10:00:00', 10);
  assert.equal(dayCounts(studyByDay(ten, []).get('2026-10-19'), goal), true);
  const words = [
    { id: 'a', learnedAt: at('2026-10-19T10:00:00') },
    { id: 'b', learnedAt: at('2026-10-19T23:00:00') },
  ];
  assert.equal(dayCounts(studyByDay([], words).get('2026-10-19'), goal), true);
  assert.equal(dayCounts(studyByDay([], words.slice(0, 1)).get('2026-10-19'), goal), false);
});

test('a word marked as known counts for nothing', () => {
  const time = at('2026-10-19T10:00:00');
  const reviews = Array.from({ length: 12 }, (_, index) => ({ cardId: `k${index}`, wordId: `k${index}`, time, markedKnown: true }));
  const words = Array.from({ length: 12 }, (_, index) => ({ id: `k${index}`, learnedAt: time }));
  assert.equal(studyByDay(reviews, words).size, 0);
});

test('the streak goes on through today, and is kept until today ends', () => {
  const reviews = [
    ...reviewsAt('2026-10-15T10:00:00', 10), // a run of one, broken on the 16th
    ...reviewsAt('2026-10-17T10:00:00', 10),
    ...reviewsAt('2026-10-18T22:00:00', 10),
  ];
  const days = studyByDay(reviews, []);
  // Today (the 19th) nothing yet: the run up to yesterday still stands.
  let streak = streakAt(days, at('2026-10-19T20:00:00'), goal);
  assert.deepEqual([streak.current, streak.best, streak.todayDone], [2, 2, false]);
  assert.equal(streakLine(streak, goal), 'To keep your 2-day streak, review 10 cards or learn 2 words today.');
  // Some study, not enough yet.
  const some = studyByDay([...reviews, ...reviewsAt('2026-10-19T20:00:00', 3, 'x')], []);
  streak = streakAt(some, at('2026-10-19T21:00:00'), goal);
  assert.equal(streakLine(streak, goal), 'To keep your 2-day streak, review 7 more cards or learn 2 more words today.');
  // Enough.
  const enough = studyByDay([...reviews, ...reviewsAt('2026-10-19T20:00:00', 10, 'x')], []);
  streak = streakAt(enough, at('2026-10-19T21:00:00'), goal);
  assert.deepEqual([streak.current, streak.best, streak.todayDone], [3, 3, true]);
  assert.equal(streakLine(streak, goal), 'Streak: 3 days in a row.');
  // A day missed: gone, the best kept.
  streak = streakAt(days, at('2026-10-21T10:00:00'), goal);
  assert.deepEqual([streak.current, streak.best], [0, 2]);
  assert.equal(streakLine(streak, goal), '');
});

test('a new start says how long the last run was', () => {
  const reviews = [
    ...reviewsAt('2026-10-10T10:00:00', 10),
    ...reviewsAt('2026-10-11T10:00:00', 10),
    ...reviewsAt('2026-10-12T10:00:00', 10),
    ...reviewsAt('2026-10-19T10:00:00', 10),
  ];
  const streak = streakAt(studyByDay(reviews, []), at('2026-10-19T12:00:00'), goal);
  assert.deepEqual([streak.current, streak.best, streak.lastRun], [1, 3, 3]);
  assert.equal(streakLine(streak, goal), 'Streak: 1 day in a row. Your best: 3 days.');
});
