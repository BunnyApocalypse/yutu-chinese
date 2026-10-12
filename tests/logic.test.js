// Tests for the parts of the app that are plain calculation (no browser
// needed). Run them with `npm test`. They use Node's built-in test runner, so
// there is nothing extra to install.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { gradeOptions, AGAIN, HARD, GOOD, EASY } from '../src/scheduler.js';
import {
  planSession,
  startOfStudyDay,
  suggestGrade,
  judgeChar,
  formatInterval,
  NEW_WORDS_PER_DAY,
} from '../src/session.js';
import { parseWordList, wordId, formatPinyin } from '../src/wordList.js';
import { checkBackup } from '../src/backup.js';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// Local time, so the 4:00 day boundary behaves the same in any time zone.
const at = (text) => new Date(text).getTime();

function makeWords(count) {
  return Array.from({ length: count }, (unused, index) => ({ id: `w${index}`, order: index }));
}

test('a new card comes back within minutes, except when graded Easy', () => {
  const now = new Date(at('2026-10-12T10:00:00'));
  const options = gradeOptions(null, now);
  assert.ok(options[AGAIN].due - now.getTime() <= 2 * MINUTE);
  assert.ok(options[GOOD].due - now.getTime() <= 15 * MINUTE);
  assert.ok(options[EASY].due - now.getTime() >= DAY);
});

test('better grades never bring a card back sooner', () => {
  const start = new Date(at('2026-10-12T10:00:00'));
  // Take a card through its learning steps into normal review.
  let state = gradeOptions(null, start)[GOOD];
  state = gradeOptions(state.fsrsState, new Date(state.due))[GOOD];
  const reviewTime = new Date(state.due);
  const options = gradeOptions(state.fsrsState, reviewTime);
  assert.ok(options[AGAIN].due <= options[HARD].due);
  assert.ok(options[HARD].due <= options[GOOD].due);
  assert.ok(options[GOOD].due <= options[EASY].due);
  // A remembered card is scheduled days ahead; a forgotten one comes back soon.
  assert.ok(options[GOOD].due - reviewTime.getTime() >= DAY);
  assert.ok(options[AGAIN].due - reviewTime.getTime() < DAY);
});

test('saved card state survives being written to a backup and read back', () => {
  const now = new Date(at('2026-10-12T10:00:00'));
  const first = gradeOptions(null, now)[GOOD];
  const reloaded = JSON.parse(JSON.stringify(first.fsrsState));
  const again = gradeOptions(reloaded, new Date(first.due))[GOOD];
  assert.ok(again.due > first.due);
});

test('the study day starts at 4:00', () => {
  assert.equal(startOfStudyDay(at('2026-10-12T10:00:00')), at('2026-10-12T04:00:00'));
  assert.equal(startOfStudyDay(at('2026-10-12T03:59:00')), at('2026-10-11T04:00:00'));
  assert.equal(startOfStudyDay(at('2026-10-12T04:00:00')), at('2026-10-12T04:00:00'));
});

test('with nothing studied, the first new word in list order is next', () => {
  const words = makeWords(30).reverse();
  const plan = planSession(words, new Map(), at('2026-10-12T10:00:00'));
  assert.equal(plan.next.word.id, 'w0');
  assert.equal(plan.next.card, null);
  assert.equal(plan.dueCount, 0);
  assert.equal(plan.newLeftToday, NEW_WORDS_PER_DAY);
  assert.equal(plan.nextDueAt, null);
});

test('due words come before new words, longest overdue first', () => {
  const now = at('2026-10-12T10:00:00');
  const words = makeWords(5);
  const cards = new Map([
    ['w0', { due: now - 5 * MINUTE, firstReviewedAt: now - 3 * DAY }],
    ['w1', { due: now - 60 * MINUTE, firstReviewedAt: now - 3 * DAY }],
    ['w2', { due: now + 30 * MINUTE, firstReviewedAt: now - 3 * DAY }],
  ]);
  const plan = planSession(words, cards, now);
  assert.equal(plan.next.word.id, 'w1');
  assert.equal(plan.dueCount, 2);
  assert.equal(plan.nextDueAt, now + 30 * MINUTE);
});

test('no more than the daily limit of new words is introduced', () => {
  const now = at('2026-10-12T10:00:00');
  const words = makeWords(30);
  const cards = new Map();
  for (let i = 0; i < NEW_WORDS_PER_DAY; i++) {
    cards.set(`w${i}`, { due: now + 2 * DAY, firstReviewedAt: now - 10 * MINUTE });
  }
  const today = planSession(words, cards, now);
  assert.equal(today.newLeftToday, 0);
  assert.equal(today.next, null);
  assert.equal(today.nextDueAt, now + 2 * DAY);

  // The next morning the limit resets, even though nothing is due yet.
  const tomorrow = planSession(words, cards, at('2026-10-13T08:00:00'));
  assert.equal(tomorrow.newLeftToday, NEW_WORDS_PER_DAY);
  assert.equal(tomorrow.next.word.id, `w${NEW_WORDS_PER_DAY}`);

  // A session that runs past midnight still belongs to the same study day.
  const lateNight = planSession(words, cards, at('2026-10-13T01:00:00'));
  assert.equal(lateNight.newLeftToday, 0);
});

test('new words left never exceeds the words that exist', () => {
  const plan = planSession(makeWords(3), new Map(), at('2026-10-12T10:00:00'));
  assert.equal(plan.newLeftToday, 3);
});

test('a character is missed after a hint, peeking, or too many mistakes', () => {
  const clean = { mistakes: 0, strokes: 16, hintShown: false, peeked: false };
  assert.equal(judgeChar(clean), true);
  assert.equal(judgeChar({ ...clean, mistakes: 4 }), true);
  assert.equal(judgeChar({ ...clean, mistakes: 5 }), false);
  assert.equal(judgeChar({ ...clean, hintShown: true }), false);
  assert.equal(judgeChar({ ...clean, peeked: true }), false);
  // One slip is forgiven even on a character with very few strokes.
  assert.equal(judgeChar({ ...clean, strokes: 2, mistakes: 1 }), true);
  assert.equal(judgeChar({ ...clean, strokes: 2, mistakes: 2 }), false);
});

test('one missed character fails the word; otherwise mistakes decide', () => {
  assert.equal(suggestGrade({ passedPerChar: [true, true], mistakes: 0 }), GOOD);
  assert.equal(suggestGrade({ passedPerChar: [true, true], mistakes: 3 }), HARD);
  assert.equal(suggestGrade({ passedPerChar: [true, false], mistakes: 0 }), AGAIN);
  assert.equal(suggestGrade({ passedPerChar: [false, true, true], mistakes: 9 }), AGAIN);
});

test('intervals are described briefly', () => {
  assert.equal(formatInterval(20 * 1000), '<1m');
  assert.equal(formatInterval(10 * MINUTE), '10m');
  assert.equal(formatInterval(5 * 60 * MINUTE), '5h');
  assert.equal(formatInterval(3 * DAY), '3d');
  assert.equal(formatInterval(45 * DAY), '1.5mo');
  assert.equal(formatInterval(730 * DAY), '2y');
});

test('numbered pinyin is shown with tone marks', () => {
  assert.equal(formatPinyin('xue2xiao4'), 'xuéxiào');
  assert.equal(formatPinyin('wo3men5'), 'wǒmen');
  assert.equal(formatPinyin("nv3'er2"), "nǚ'ér");
  assert.equal(formatPinyin('lv4shi1'), 'lǜshī');
  assert.equal(formatPinyin('peng2you5'), 'péngyou');
  assert.equal(formatPinyin('shui4jiao4'), 'shuìjiào');
  assert.equal(formatPinyin('dui4bu5qi3'), 'duìbuqǐ');
  assert.equal(formatPinyin('shan1, shan4'), 'shān, shàn');
  assert.equal(formatPinyin('tiao4 wu3'), 'tiào wǔ');
  assert.equal(formatPinyin('yi1dian3r5'), 'yīdiǎnr');
  assert.equal(formatPinyin('Zhong1guo2'), 'Zhōngguó');
  assert.equal(formatPinyin('E2'), 'É');
});

test('the built-in word list is well formed', () => {
  const words = parseWordList(fs.readFileSync('src/seed-words.tsv', 'utf8'));
  assert.ok(words.length >= 100);
  const ids = new Set(words.map(wordId));
  assert.equal(ids.size, words.length, 'two words share an ID');
  for (const word of words) {
    assert.equal(
      Array.from(word.simplified).length,
      Array.from(word.traditional).length,
      `${word.traditional}: the two scripts differ in length`,
    );
    assert.ok(word.pinyin && word.definition, `${word.traditional}: missing pinyin or definition`);
    for (const char of word.simplified + word.traditional) {
      const file = `node_modules/hanzi-writer-data/${char}.json`;
      assert.ok(fs.existsSync(file), `${word.traditional}: no stroke data for ${char}`);
    }
  }
});

test('word list parsing skips incomplete lines', () => {
  const words = parseWordList('学\t學\txue2\tto learn\n\nbroken line\n校\t校\txiao4\tschool\n');
  assert.deepEqual(words.map((word) => word.traditional), ['學', '校']);
});

test('backups are checked before use', () => {
  const good = {
    format: 'hanzi-trainer-backup',
    version: 1,
    words: [{ id: 'a' }],
    cards: [],
    reviews: [],
    settings: [{ key: 'script', value: 'traditional' }],
  };
  assert.doesNotThrow(() => checkBackup(good));
  assert.throws(() => checkBackup({ hello: 'world' }), /not a Hanzi Trainer backup/);
  assert.throws(() => checkBackup({ ...good, version: 99 }), /format version 99/);
  assert.throws(() => checkBackup({ ...good, cards: undefined }), /"cards" is missing/);
  assert.throws(() => checkBackup({ ...good, words: [{ name: 'no id' }] }), /has no id/);
});
