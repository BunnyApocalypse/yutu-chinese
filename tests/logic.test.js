// Tests for the parts of the app that are plain calculation (no browser
// needed). Run them with `npm test`. They use Node's built-in test runner, so
// there is nothing extra to install.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { gradeOptions, replay, AGAIN, HARD, GOOD, EASY } from '../src/scheduler.js';
import {
  planSession,
  nextToLearn,
  startOfStudyDay,
  suggestGrade,
  judgeChar,
  formatInterval,
  cardId,
  cardIdFor,
  allCardIds,
  lessonSteps,
  CARD_TYPES,
  SIBLING_GAP_MS,
} from '../src/session.js';
import { splitSyllables, toneAnswers, readingsFor } from '../src/tones.js';

// The tone table the app uses (see data/cedict/README.md).
const toneTable = JSON.parse(fs.readFileSync('data/cedict/tones.json', 'utf8'));
import { parseWordList, wordId, formatPinyin } from '../src/wordList.js';
import { checkBackup } from '../src/backup.js';
import { cardsLearnedInSimplified } from '../src/scriptCards.js';

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

test('replaying a card\'s reviews gives the state that was saved with it', () => {
  // Review a card as the app does: each review starts from the saved state
  // and is made some time after the card fell due.
  let state = null;
  let due = null;
  let time = at('2026-01-05T09:00:00');
  const reviews = [];
  for (const grade of [GOOD, GOOD, GOOD, HARD, GOOD, AGAIN, GOOD, GOOD, EASY, GOOD, GOOD, GOOD]) {
    ({ fsrsState: state, due } = gradeOptions(state, new Date(time))[grade]);
    reviews.push({ time, grade });
    time = due + 7 * 60 * 60 * 1000;
  }
  // Long intervals are varied a little at random ("fuzz"); this only works
  // because that variation comes out the same for the same review.
  assert.ok(due - reviews.at(-1).time > 30 * DAY);
  assert.deepEqual(replay(reviews), { fsrsState: state, due });
  // The order the reviews are handed over in does not matter.
  assert.deepEqual(replay([...reviews].reverse()), { fsrsState: state, due });
  assert.equal(replay([]), null);
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

test('words that have not been learned are never reviewed; the Learn tab takes them in order', () => {
  const words = makeWords(30).reverse();
  const now = at('2026-10-12T10:00:00');
  const plan = planSession(words, new Map(), now, ALL_TYPES);
  assert.equal(plan.next, null);
  assert.equal(plan.waitingCount, 30);
  assert.equal(plan.learnedToday, 0);
  assert.equal(nextToLearn(words, new Map()).id, 'w0');

  // Once learned, a word's cards come up as new ones, the first kind first.
  const learned = words.map((word) => (word.id === 'w0' ? { ...word, learnedAt: now - MINUTE } : word));
  const after = planSession(learned, new Map(), now, ALL_TYPES);
  assert.deepEqual([after.next.word.id, after.next.type, after.next.card], ['w0', 'meaning', null]);
  assert.equal(after.newCardCount, 4);
  assert.equal(after.waitingCount, 29);
  assert.equal(after.learnedToday, 1);
  assert.equal(nextToLearn(learned, new Map()).id, 'w1');
  // A word from before there was a Learn tab counts as learned by its cards.
  const cards = new Map([studied('w1', 'writing', { due: now + DAY, first: now - 3 * DAY })]);
  assert.equal(nextToLearn(learned, cards).id, 'w2');
  assert.equal(nextToLearn([], new Map()), null);
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

test('the words learned today are counted by the study day', () => {
  const now = at('2026-10-12T10:00:00');
  const words = makeWords(30).map((word, index) => (index < 5 ? { ...word, learnedAt: now - 10 * MINUTE } : word));
  assert.equal(planSession(words, new Map(), now, WRITING_ONLY).learnedToday, 5);
  // The next morning the count starts again.
  assert.equal(planSession(words, new Map(), at('2026-10-13T08:00:00'), WRITING_ONLY).learnedToday, 0);
  // A session that runs past midnight still belongs to the same study day.
  assert.equal(planSession(words, new Map(), at('2026-10-13T01:00:00'), WRITING_ONLY).learnedToday, 5);
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

test('a neutral tone is accepted where the dictionary or the owner allows it', () => {
  // The dictionary also has zhi1dao5 for 知道: accepted, as a variant.
  assert.deepEqual(toneAnswers(['知', '道'], 'zhi1dao4', null, toneTable)[1], {
    syllable: 'dao4',
    tones: [4],
    variantTones: [5],
  });
  assert.deepEqual(toneAnswers(['知', '道'], 'zhi1dao4', null, toneTable)[0].variantTones, []);
  // It has none for 學校 or 星期, so neutral is wrong there ...
  assert.ok(!toneAnswers(['學', '校'], 'xue2xiao4', null, toneTable)[1].variantTones.includes(5));
  assert.ok(!toneAnswers(['星', '期'], 'xing1qi1', null, toneTable)[1].variantTones.includes(5));
  // ... until the owner adds the reading to the word; then it is simply right.
  const week = toneAnswers(['星', '期'], 'xing1qi1', null, toneTable, true, 'xing1qi5');
  assert.deepEqual(week[1].tones, [1, 5]);
  assert.equal(week[1].syllable, 'qi1');
  // A reading that does not fit the characters is ignored.
  assert.deepEqual(toneAnswers(['星', '期'], 'xing1qi1', null, toneTable, true, 'xing1')[1].tones, [1]);
  // A table from before neutralWords existed still works.
  const { neutralWords, ...oldTable } = toneTable;
  assert.deepEqual(toneAnswers(['知', '道'], 'zhi1dao4', null, oldTable)[1].variantTones, []);
});

test('the lesson for a new word starts with its tones only where that makes sense', () => {
  assert.deepEqual(lessonSteps({ toneCardsOn: true, canHaveToneCard: true }), ['tone', 'trace', 'outline', 'test']);
  assert.deepEqual(lessonSteps({ toneCardsOn: false, canHaveToneCard: true }), ['trace', 'outline', 'test']);
  assert.deepEqual(lessonSteps({ toneCardsOn: true, canHaveToneCard: false }), ['trace', 'outline', 'test']);
  // A word that is new altogether is looked at first.
  assert.deepEqual(lessonSteps({ newWord: true, toneCardsOn: true, canHaveToneCard: true }), ['meet', 'tone', 'trace', 'outline', 'test']);
  // Without writing cards the lesson ends before the writing.
  assert.deepEqual(lessonSteps({ newWord: true, toneCardsOn: true, canHaveToneCard: true, canBeWritten: false }), ['meet', 'tone']);
});

// ---- Writing cards per script ----

// Words written differently in the two scripts, and one written the same.
const STUDY = { id: '學習|xue2xi2', traditional: '學習', simplified: '学习', order: 0 };
const BOOK = { id: '書|shu1', traditional: '書', simplified: '书', order: 1 };
const HELLO = { id: '你好|ni3hao3', traditional: '你好', simplified: '你好', order: 2 };
const TREE = { id: '樹|shu4', traditional: '樹', simplified: '树', order: 3 };

test('only the writing card of a word that differs is kept per script', () => {
  assert.equal(cardIdFor(STUDY, 'writing', 'traditional'), '學習|xue2xi2#writing');
  assert.equal(cardIdFor(STUDY, 'writing', 'simplified'), '學習|xue2xi2#writing#simplified');
  assert.equal(cardIdFor(STUDY, 'meaning', 'simplified'), '學習|xue2xi2#meaning');
  assert.equal(cardIdFor(HELLO, 'writing', 'simplified'), '你好|ni3hao3#writing');
  assert.equal(allCardIds(STUDY).length, 5);
  assert.equal(allCardIds(HELLO).length, 4);
});

test('after switching script, writing is learned again and the rest carries over', () => {
  const now = at('2026-10-12T10:00:00');
  const old = now - 30 * DAY;
  const later = now + 30 * DAY;
  // Everything was studied in simplified; 書 was learned before 學習.
  const known = (word, type, first) => [
    cardIdFor(word, type, 'simplified'),
    { due: later, firstReviewedAt: first, lastReviewedAt: first },
  ];
  const cards = new Map(
    [[STUDY, old], [BOOK, old - DAY], [HELLO, old]].flatMap(([word, first]) =>
      CARD_TYPES.map((type) => known(word, type, first)),
    ),
  );
  const words = [STUDY, BOOK, HELLO, TREE];
  const inSimplified = { ...ALL_TYPES, scriptOf: () => 'simplified' };
  const inTraditional = { ...ALL_TYPES, scriptOf: () => 'traditional' };

  // In simplified nothing is due. (樹 has not been learned at all; that is
  // for the Learn tab.)
  const before = planSession(words, cards, now, inSimplified);
  assert.equal(before.next, null);
  assert.equal(before.newWordsLeftToday, 0);
  assert.equal(before.waitingCount, 1);

  // In traditional the two words that differ are to be written again, the
  // one learned first coming first and both before the word never seen.
  const after = planSession(words, cards, now, inTraditional);
  assert.equal(after.dueCount, 0); // meaning, pinyin and tone keep their schedule
  assert.deepEqual([after.next.word, after.next.type, after.next.card], [BOOK, 'writing', null]);
  assert.equal(after.newWordsLeftToday, 2);
  assert.equal(after.newCardCount, 0);

  // They count toward the day's new words: with a limit of 1, one written
  // today leaves nothing more for today.
  cards.set(cardIdFor(BOOK, 'writing', 'traditional'), { due: later, firstReviewedAt: now - MINUTE, lastReviewedAt: now - MINUTE });
  const limited = planSession(words, cards, now, { ...inTraditional, newWordsPerDay: 1 });
  assert.equal(limited.next, null);
  assert.equal(limited.newWordsLeftToday, 0);
  // With room left, 學習 follows.
  const more = planSession(words, cards, now, inTraditional);
  assert.deepEqual([more.next.word, more.next.type], [STUDY, 'writing']);
  assert.equal(more.newWordsLeftToday, 1);

  // Back in simplified, the old progress is all still there.
  assert.equal(planSession(words, cards, now, inSimplified).next, null);
});

test('a word can be studied in a script of its own', () => {
  const now = at('2026-10-12T10:00:00');
  const cards = new Map([
    [cardIdFor(STUDY, 'writing', 'simplified'), { due: now - MINUTE, firstReviewedAt: now - DAY, lastReviewedAt: now - DAY }],
  ]);
  const scriptOf = (word) => (word === STUDY ? 'simplified' : 'traditional');
  const plan = planSession([STUDY, BOOK], cards, now, { ...WRITING_ONLY, scriptOf });
  assert.equal(plan.next.card, cards.get(cardIdFor(STUDY, 'writing', 'simplified')));
});

test('cards under a plain ID that were learned in simplified are found', () => {
  const card = (id) => ({ id });
  const review = (cardId, time, script) => ({ cardId, time, script });
  const cards = [card('學習|xue2xi2#writing'), card('學習|xue2xi2#meaning'), card('書|shu1#writing'), card('你好|ni3hao3#writing')];
  const reviews = [
    // Latest review in simplified: to be moved.
    review('學習|xue2xi2#writing', 1, 'traditional'),
    review('學習|xue2xi2#writing', 2, 'simplified'),
    review('學習|xue2xi2#meaning', 2, 'simplified'),
    // Latest review in traditional: stays.
    review('書|shu1#writing', 5, 'simplified'),
    review('書|shu1#writing', 9, 'traditional'),
    review('你好|ni3hao3#writing', 2, 'simplified'),
  ];
  assert.deepEqual(cardsLearnedInSimplified([STUDY, BOOK, HELLO], cards, reviews), [
    { from: '學習|xue2xi2#writing', to: '學習|xue2xi2#writing#simplified' },
  ]);
  // Not if there is a simplified card already.
  cards.push(card('學習|xue2xi2#writing#simplified'));
  assert.deepEqual(cardsLearnedInSimplified([STUDY, BOOK, HELLO], cards, reviews), []);
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
  assert.deepEqual(toneAnswers(['學', '校'], 'xue2xiao4', null, null), [
    { syllable: 'xue2', tones: [2], variantTones: [] },
    { syllable: 'xiao4', tones: [4], variantTones: [] },
  ]);
  // Several listed readings: any of their tones is simply right.
  assert.deepEqual(toneAnswers(['扇'], 'shan1, shan4', null, null)[0].tones, [1, 4]);
  // A reading that doesn't fit the characters is left out; if none fits,
  // there is no tone card.
  const erhua = toneAnswers(['一', '點', '兒'], 'yi1dian3r5, yi1dianr3', null, null);
  assert.deepEqual(erhua.map((answer) => answer.syllable), ['yi1', 'dian3', 'r5']);
  assert.equal(toneAnswers(['一', '點', '兒'], 'yi1dianr3', null, null), null);
  assert.equal(toneAnswers(['學', '校'], '', null, null), null);
});

test('the pronunciation setting decides which reading is expected', () => {
  const week = { traditional: '星期', pinyin: 'xing1qi1', pinyinTaiwan: 'xing1qi2' };
  assert.deepEqual(readingsFor(week, 'mainland', null), {
    primary: 'xing1qi1',
    other: 'xing1qi2',
    otherLabel: 'Taiwan',
  });
  assert.deepEqual(readingsFor(week, 'taiwan', null), {
    primary: 'xing1qi2',
    other: 'xing1qi1',
    otherLabel: 'mainland',
  });
  // A word with no Taiwan reading listed is the same under both settings.
  const school = { traditional: '學校', pinyin: 'xue2xiao4' };
  assert.equal(readingsFor(school, 'taiwan', toneTable).primary, 'xue2xiao4');
  assert.equal(readingsFor(school, 'taiwan', toneTable).other, null);
  // The tone table supplies Taiwan readings for words that don't list one.
  const garbage = { traditional: '垃圾', pinyin: 'la1ji1' };
  assert.equal(readingsFor(garbage, 'taiwan', toneTable).primary, 'le4se4');
  assert.equal(readingsFor(garbage, 'mainland', toneTable).other, 'le4se4');
  // Someone learning mainland pronunciation only is never shown a Taiwan reading.
  assert.deepEqual(readingsFor(week, 'mainlandOnly', toneTable), { primary: 'xing1qi1', other: null, otherLabel: null });
  assert.equal(readingsFor(garbage, 'mainlandOnly', toneTable).other, null);
});

test("the other region's tone is accepted as a variant", () => {
  // Expecting the mainland reading, the Taiwan tone is a variant, and the
  // other way round.
  assert.deepEqual(toneAnswers(['星', '期'], 'xing1qi1', 'xing1qi2', null)[1], {
    syllable: 'qi1',
    tones: [1],
    variantTones: [2],
  });
  assert.deepEqual(toneAnswers(['星', '期'], 'xing1qi2', 'xing1qi1', null)[1], {
    syllable: 'qi2',
    tones: [2],
    variantTones: [1],
  });
  // A tone in neither reading is not accepted at all.
  const answer = toneAnswers(['星', '期'], 'xing1qi1', 'xing1qi2', toneTable)[1];
  assert.ok(!answer.tones.includes(4) && !answer.variantTones.includes(4));
});

test('the tone table adds regional and neutral-tone variants', () => {
  // 期 is qī on the mainland and qí in Taiwan, even where the word itself
  // lists no Taiwan reading.
  assert.deepEqual(toneAnswers(['日', '期'], 'ri4qi1', null, toneTable)[1].variantTones, [2]);
  // ... unless only one region's pronunciation is being learned.
  assert.deepEqual(toneAnswers(['日', '期'], 'ri4qi1', null, toneTable, false)[1].variantTones, []);
  // Where the list says neutral, the character's own tone is accepted too.
  assert.deepEqual(toneAnswers(['朋', '友'], 'peng2you5', null, toneTable)[1], {
    syllable: 'you5',
    tones: [5],
    variantTones: [3],
  });
  // A full tone in the list is not loosened to neutral.
  assert.deepEqual(toneAnswers(['學', '校'], 'xue2xiao4', null, toneTable)[1].variantTones, []);
  // Without the table, only the listed tone counts.
  assert.deepEqual(toneAnswers(['朋', '友'], 'peng2you5', null, null)[1].variantTones, []);
});

test('every word in the test word list can have a tone card, under both settings', () => {
  const words = parseWordList(fs.readFileSync('tests/words.tsv', 'utf8'));
  let withTaiwanReading = 0;
  for (const word of words) {
    const chars = Array.from(word.traditional);
    for (const pronunciation of ['mainland', 'taiwan']) {
      const { primary, other } = readingsFor(word, pronunciation, toneTable);
      assert.ok(toneAnswers(chars, primary, other, toneTable), `${word.traditional} (${pronunciation})`);
    }
    if (word.pinyinTaiwan) {
      withTaiwanReading += 1;
    }
  }
  assert.ok(withTaiwanReading >= 10);
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

test('the test word list is well formed', () => {
  const words = parseWordList(fs.readFileSync('tests/words.tsv', 'utf8'));
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

test('a fifth column gives the Taiwan reading', () => {
  const words = parseWordList('星期\t星期\txing1qi1\tweek\txing1qi2\n学\t學\txue2\tto learn\n');
  assert.equal(words[0].pinyinTaiwan, 'xing1qi2');
  assert.equal('pinyinTaiwan' in words[1], false);
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
  // The current version also has the removed words and the decks.
  const current = { ...good, version: 2, removed: [{ id: 'b', removedAt: 1 }], decks: [{ id: 'hsk-3.0' }] };
  assert.doesNotThrow(() => checkBackup(current));
  assert.throws(() => checkBackup({ ...current, decks: undefined }), /"decks" is missing/);
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
