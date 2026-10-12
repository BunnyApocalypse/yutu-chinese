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
  cardId,
  CARD_TYPES,
  SIBLING_GAP_MS,
} from '../src/session.js';
import { splitSyllables, toneAnswers } from '../src/tones.js';
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

// ---- Session planning ----

const ALL_TYPES = { newWordsPerDay: 5, enabledTypes: CARD_TYPES };
const WRITING_ONLY = { newWordsPerDay: 5, enabledTypes: ['writing'] };

// A studied card for makeCards below.
function studied(wordId, type, { due, first, last }) {
  return [cardId(wordId, type), { due, firstReviewedAt: first, lastReviewedAt: last ?? first }];
}

test('with nothing studied, the first word in list order is next, meaning card first', () => {
  const words = makeWords(30).reverse();
  const plan = planSession(words, new Map(), at('2026-10-12T10:00:00'), ALL_TYPES);
  assert.equal(plan.next.word.id, 'w0');
  assert.equal(plan.next.type, 'meaning');
  assert.equal(plan.next.card, null);
  assert.equal(plan.dueCount, 0);
  assert.equal(plan.newWordsLeftToday, 5);
  assert.equal(plan.nextDueAt, null);
});

test('due cards come before new ones, longest overdue first', () => {
  const now = at('2026-10-12T10:00:00');
  const old = now - 3 * DAY;
  const cards = new Map([
    studied('w0', 'writing', { due: now - 5 * MINUTE, first: old }),
    studied('w1', 'writing', { due: now - 60 * MINUTE, first: old }),
    studied('w2', 'writing', { due: now + 30 * MINUTE, first: old }),
  ]);
  const plan = planSession(makeWords(5), cards, now, WRITING_ONLY);
  assert.equal(plan.next.word.id, 'w1');
  assert.equal(plan.next.type, 'writing');
  assert.equal(plan.dueCount, 2);
  assert.equal(plan.nextDueAt, now + 30 * MINUTE);
});

test('no more than the daily limit of new words is introduced', () => {
  const now = at('2026-10-12T10:00:00');
  const cards = new Map();
  for (let i = 0; i < 5; i++) {
    cards.set(...studied(`w${i}`, 'writing', { due: now + 2 * DAY, first: now - 10 * MINUTE }));
  }
  const words = makeWords(30);
  const today = planSession(words, cards, now, WRITING_ONLY);
  assert.equal(today.newWordsLeftToday, 0);
  assert.equal(today.next, null);
  assert.equal(today.nextDueAt, now + 2 * DAY);

  // A higher setting allows more the same day.
  const more = planSession(words, cards, now, { ...WRITING_ONLY, newWordsPerDay: 8 });
  assert.equal(more.newWordsLeftToday, 3);
  assert.equal(more.next.word.id, 'w5');

  // The next morning the limit resets, even though nothing is due yet.
  const tomorrow = planSession(words, cards, at('2026-10-13T08:00:00'), WRITING_ONLY);
  assert.equal(tomorrow.newWordsLeftToday, 5);
  assert.equal(tomorrow.next.word.id, 'w5');

  // A session that runs past midnight still belongs to the same study day.
  const lateNight = planSession(words, cards, at('2026-10-13T01:00:00'), WRITING_ONLY);
  assert.equal(lateNight.newWordsLeftToday, 0);
});

test('new words left never exceeds the words that exist', () => {
  const plan = planSession(makeWords(3), new Map(), at('2026-10-12T10:00:00'), ALL_TYPES);
  assert.equal(plan.newWordsLeftToday, 3);
});

test("a word's cards are introduced in order and kept apart", () => {
  const now = at('2026-10-12T10:00:00');
  const words = makeWords(1);
  // The meaning card was studied a minute ago and comes back in ten.
  const cards = new Map([
    studied('w0', 'meaning', { due: now + 10 * MINUTE, first: now - MINUTE }),
  ]);
  const soon = planSession(words, cards, now, ALL_TYPES);
  // The pinyin card is next in line, but held back for now.
  assert.equal(soon.next, null);
  assert.equal(soon.nextDueAt, now - MINUTE + SIBLING_GAP_MS);
  assert.equal(soon.newCardCount, 3);

  const later = planSession(words, cards, now + 5 * MINUTE, ALL_TYPES);
  assert.equal(later.next.type, 'pinyin');
  assert.equal(later.next.card, null);
});

test('a due card waits while another card of its word was just reviewed', () => {
  const now = at('2026-10-12T10:00:00');
  const old = now - 3 * DAY;
  const cards = new Map([
    studied('w0', 'meaning', { due: now - MINUTE, first: old, last: old }),
    studied('w0', 'writing', { due: now + 2 * DAY, first: old, last: now - MINUTE }),
  ]);
  const plan = planSession(makeWords(1), cards, now, ALL_TYPES);
  assert.equal(plan.dueCount, 0);
  // A card is not held back by its own review, only by its siblings'.
  const own = new Map([studied('w0', 'meaning', { due: now - MINUTE, first: old, last: now - 2 * MINUTE })]);
  assert.equal(planSession(makeWords(1), own, now, { ...ALL_TYPES, enabledTypes: ['meaning'] }).dueCount, 1);
});

test('words that only have writing cards get their other cards as new', () => {
  const now = at('2026-10-12T10:00:00');
  const old = now - 3 * DAY;
  const cards = new Map([studied('w0', 'writing', { due: now + 2 * DAY, first: old })]);
  const plan = planSession(makeWords(1), cards, now, { ...ALL_TYPES, newWordsPerDay: 0 });
  // Not limited by new words per day: the word is not new.
  assert.equal(plan.next.type, 'meaning');
  assert.equal(plan.newCardCount, 3);
});

test('card types that are switched off never appear', () => {
  const now = at('2026-10-12T10:00:00');
  const old = now - 3 * DAY;
  const cards = new Map([studied('w0', 'tone', { due: now - MINUTE, first: old })]);
  const options = { newWordsPerDay: 5, enabledTypes: ['writing', 'meaning'] };
  const plan = planSession(makeWords(2), cards, now, options);
  assert.equal(plan.dueCount, 0); // the due tone card is ignored
  assert.equal(plan.next.type, 'meaning');
  assert.equal(plan.next.word.id, 'w0');
  // A word that can't have a kind of card skips it.
  const noMeaning = { ...options, hasCardType: (word, type) => type !== 'meaning' };
  assert.equal(planSession(makeWords(2), cards, now, noMeaning).next.type, 'writing');
});

test('cards saved before lastReviewedAt existed still hold their siblings back', () => {
  const now = at('2026-10-12T10:00:00');
  const cards = new Map([
    [
      cardId('w0', 'writing'),
      {
        due: now + DAY,
        firstReviewedAt: now - DAY,
        fsrsState: { last_review: new Date(now - MINUTE).toISOString() },
      },
    ],
  ]);
  const plan = planSession(makeWords(1), cards, now, ALL_TYPES);
  assert.equal(plan.next, null);
  assert.equal(plan.nextDueAt, now - MINUTE + SIBLING_GAP_MS);
});

// ---- Tones ----

test('pinyin is split into one syllable per character', () => {
  assert.deepEqual(splitSyllables('xue2xiao4'), ['xue2', 'xiao4']);
  assert.deepEqual(splitSyllables("nv3'er2"), ['nv3', 'er2']);
  assert.deepEqual(splitSyllables('tiao4 wu3'), ['tiao4', 'wu3']);
  assert.deepEqual(splitSyllables('yi1dian3r5'), ['yi1', 'dian3', 'r5']);
  assert.deepEqual(splitSyllables('Zhong1guo2'), ['zhong1', 'guo2']);
});

test('tone answers line up with the characters', () => {
  assert.deepEqual(toneAnswers('xue2xiao4', 2), [
    { syllable: 'xue2', tones: [2] },
    { syllable: 'xiao4', tones: [4] },
  ]);
  // Several listed readings: any of their tones is accepted.
  assert.deepEqual(toneAnswers('shan1, shan4', 1), [{ syllable: 'shan1', tones: [1, 4] }]);
  assert.deepEqual(toneAnswers('xing1qi1, xing1qi2', 2)[1], { syllable: 'qi1', tones: [1, 2] });
  // A reading that doesn't fit the characters is left out; if none fits,
  // there is no tone card.
  assert.deepEqual(toneAnswers('yi1dian3r5, yi1dianr3', 3).map((a) => a.syllable), ['yi1', 'dian3', 'r5']);
  assert.equal(toneAnswers('yi1dianr3', 3), null);
  assert.equal(toneAnswers('', 2), null);
});

test('every word in the built-in list can have a tone card', () => {
  const words = parseWordList(fs.readFileSync('src/seed-words.tsv', 'utf8'));
  for (const word of words) {
    assert.ok(toneAnswers(word.pinyin, Array.from(word.traditional).length), word.traditional);
  }
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

test('the Taiwan-form stroke data is well formed', () => {
  const lines = fs
    .readFileSync('data/animcjk/graphicsZhHant.txt', 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '');
  assert.ok(lines.length >= 1000);
  for (const line of lines) {
    const entry = JSON.parse(line);
    assert.equal(Array.from(entry.character).length, 1);
    assert.ok(entry.strokes.length > 0, `${entry.character}: no strokes`);
    assert.equal(entry.strokes.length, entry.medians.length, `${entry.character}: strokes and medians differ`);
  }
  // The reason this data is here: 為 in its Taiwan form has 9 strokes.
  const wei = lines.map((line) => JSON.parse(line)).find((entry) => entry.character === '為');
  assert.equal(wei.strokes.length, 9);
});
