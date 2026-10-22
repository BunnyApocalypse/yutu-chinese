// The numbers on the Progress tab, worked out from what is already kept:
// every review (with its time, grade and `duration`), the cards' FSRS state,
// and the words' `learnedAt` and `learnDuration`. Nothing is stored for the
// tab itself, so combining backups and the Anki import carry it over.
//
// Plain calculation only, as in streak.js: the page is drawn by
// progressPanel.js, and the current time is always passed in (tested in
// tests/progress.test.js).
//
// The owner's choices (2026-10-19):
// - Today, the cards by stage, the streak with a calendar of days studied,
//   the time studied, and words (詞) and characters (字) over time.
// - A range for the last three, as in Anki: a month, 3 months, a year, all.
// - Words are counted by their characters: 行 xíng and 行 háng are one word.
// - Characters are counted in the learner's script; with both scripts, a
//   switch (off at first) counts 們 and 们 as two.

import { AGAIN } from './scheduler.js';
import { studyByDay, studyDayKey, previousDayKey } from './streak.js';
import { cardIdFor } from './session.js';
import { isSentence } from './sentences.js';
import { isRadical } from './radicals.js';

// The ranges to choose from: how many days back from today, or null for
// everything since the first day studied. `name` is the key of its text
// (src/text/en.js).
export const RANGES = [
  { id: 'month', name: 'progress.rangeMonth', days: 30 },
  { id: 'months3', name: 'progress.range3Months', days: 91 },
  { id: 'year', name: 'progress.rangeYear', days: 365 },
  { id: 'all', name: 'progress.rangeAll', days: null },
];

// A card is "mature" once it is next due 21 days or more after its last
// review, as in Anki; "young" before that.
export const MATURE_DAYS = 21;

export const STAGES = ['new', 'learning', 'young', 'mature'];

// Where a card stands. ts-fsrs numbers its states: 0 new, 1 learning,
// 2 review, 3 relearning (forgotten, being learned again). scheduled_days is
// the gap the scheduler chose until the next review.
export function cardStage(card) {
  const state = card?.fsrsState?.state;
  if (state === undefined || state === 0) {
    return 'new';
  }
  if (state === 1 || state === 3) {
    return 'learning';
  }
  return card.fsrsState.scheduled_days >= MATURE_DAYS ? 'mature' : 'young';
}

// How many cards of each kind are at each stage, for the kinds switched on.
// A card not studied yet is "new", if the word can have it (hasCardType
// leaves out suspended cards, kinds switched off, a tone card for pinyin
// that doesn't fit). The writing card counted is the one in the word's
// script.
//   types:       the kinds to count, in order
//   hasCardType: (word, type) → true if the word can have that card
//   scriptOf:    (word) → 'traditional' or 'simplified'
// Returns { rows: [{ type, counts, total }], all: { counts, total } },
// counts being { new, learning, young, mature }.
export function cardStages(words, cards, { types, hasCardType, scriptOf }) {
  const empty = () => Object.fromEntries(STAGES.map((stage) => [stage, 0]));
  const all = empty();
  const rows = types.map((type) => {
    const counts = empty();
    for (const word of words) {
      if (!hasCardType(word, type)) {
        continue;
      }
      const stage = cardStage(cards.get(cardIdFor(word, type, scriptOf(word))));
      counts[stage] += 1;
      all[stage] += 1;
    }
    return { type, counts, total: sum(Object.values(counts)) };
  });
  return { rows, all: { counts: all, total: sum(Object.values(all)) } };
}

const sum = (numbers) => numbers.reduce((total, number) => total + number, 0);

// When a word was learned: its `learnedAt`, or for a word studied before
// there was a Learn tab, or brought over from Anki, when its first card was
// first reviewed. undefined for a word not learned yet.
export function learnedAtOf(word, cards) {
  if (word.learnedAt !== undefined) {
    return word.learnedAt;
  }
  const times = [];
  for (const card of cards.values()) {
    if (card.wordId === word.id && card.firstReviewedAt !== undefined) {
      times.push(card.firstReviewedAt);
    }
  }
  return times.length > 0 ? Math.min(...times) : undefined;
}

// Time studied each day, in milliseconds: day name → time. A review's
// `duration` counts on the day it was made, a lesson's `learnDuration` on
// the day the word was learned (timing.js). Reviews from before 2026-10-19
// have no duration and count nothing.
export function timeByDay(reviews, words) {
  const days = new Map();
  const add = (time, ms) => {
    if (ms > 0) {
      const key = studyDayKey(time);
      days.set(key, (days.get(key) || 0) + ms);
    }
  };
  for (const review of reviews) {
    add(review.time, review.duration);
  }
  for (const word of words) {
    if (word.learnedAt !== undefined) {
      add(word.learnedAt, word.learnDuration);
    }
  }
  return days;
}

// What was done today: { cards, words, time, reviews, right }. cards and
// words as the streak counts them (different cards reviewed, words learned
// in Learn); reviews: how many answers were graded, right: how many of them
// were not "Again". Marking a word as known counts for nothing.
export function todayStats(reviews, words, now) {
  const today = studyDayKey(now);
  const study = studyByDay(reviews, words).get(today) || { cards: 0, words: 0 };
  const graded = reviews.filter((review) => !review.markedKnown && studyDayKey(review.time) === today);
  return {
    cards: study.cards,
    words: study.words,
    time: timeByDay(reviews, words).get(today) || 0,
    reviews: graded.length,
    right: graded.filter((review) => review.grade !== AGAIN).length,
  };
}

// The days a range covers, oldest first, ending today. For "all", from the
// first day anything was studied (`firstKey`), or just today.
export function rangeDays(range, now, firstKey = null) {
  const today = studyDayKey(now);
  const keys = [today];
  const days = RANGES.find((each) => each.id === range)?.days;
  while (days ? keys.length < days : firstKey !== null && keys[keys.length - 1] > firstKey) {
    keys.push(previousDayKey(keys[keys.length - 1]));
  }
  return keys.reverse();
}

// How the bars of "Time studied" are grouped for a range: a bar a day for
// up to a month, a week for up to 3 months, a calendar month for longer.
export function barSize(dayCount) {
  return dayCount <= 31 ? 'day' : dayCount <= 92 ? 'week' : 'month';
}

// The days grouped into bars, oldest first: [{ keys: [...] }]. Weeks are
// counted back from today, so the last bar is the 7 days up to today.
export function groupDays(keys, size) {
  if (size === 'day') {
    return keys.map((key) => ({ keys: [key] }));
  }
  const groups = [];
  if (size === 'week') {
    for (let end = keys.length; end > 0; end -= 7) {
      groups.unshift({ keys: keys.slice(Math.max(0, end - 7), end) });
    }
    return groups;
  }
  for (const key of keys) {
    const month = key.slice(0, 7);
    if (groups.length === 0 || groups[groups.length - 1].month !== month) {
      groups.push({ month, keys: [] });
    }
    groups[groups.length - 1].keys.push(key);
  }
  return groups;
}

// The Chinese characters in a text, leaving out anything else (the OK of
// 卡拉OK, punctuation). Array.from splits by character, not by UTF-16 unit,
// so characters outside the basic plane stay whole.
export function hanCharacters(text) {
  return Array.from(text || '').filter((character) => /\p{Script=Han}/u.test(character));
}

// Words learned and characters known, as they grew: day name →
// { words, characters }, how many were new that day.
//
// Sentences and radicals are left out. A word is counted by its characters,
// so 行 xíng and 行 háng are one (the traditional form, which every word
// has, is the key). A character counts from the day the first word with it
// was learned.
//
// Characters are counted in `script`, the learner's script, so a
// simplified-only learner counts 们 and someone learning both counts each
// character once, whichever script its word is shown in. With `apart` (the
// switch, offered only with both scripts), a word's characters count in
// the script it is studied in (`scriptOf`), and in the other one too from
// the day its writing card there was first reviewed: someone who has
// written 們 and 们 knows two characters.
export function growthByDay(words, cards, { script, apart = false, scriptOf }) {
  const firstSeen = new Map(); // key → earliest time
  const see = (key, time) => {
    if (!firstSeen.has(key) || time < firstSeen.get(key)) {
      firstSeen.set(key, time);
    }
  };
  for (const word of words) {
    if (isSentence(word) || isRadical(word)) {
      continue;
    }
    const learnedAt = learnedAtOf(word, cards);
    if (learnedAt === undefined) {
      continue;
    }
    see(`word ${word.traditional}`, learnedAt);
    if (!apart) {
      for (const character of hanCharacters(word[script])) {
        see(`character ${character}`, learnedAt);
      }
      continue;
    }
    const own = scriptOf(word);
    for (const character of hanCharacters(word[own])) {
      see(`character ${character}`, learnedAt);
    }
    const other = own === 'traditional' ? 'simplified' : 'traditional';
    const otherCard = cards.get(cardIdFor(word, 'writing', other));
    if (otherCard && otherCard !== cards.get(cardIdFor(word, 'writing', own)) && otherCard.firstReviewedAt !== undefined) {
      for (const character of hanCharacters(word[other])) {
        see(`character ${character}`, otherCard.firstReviewedAt);
      }
    }
  }
  const days = new Map();
  for (const [key, time] of firstSeen) {
    const day = studyDayKey(time);
    const counts = days.get(day) || { words: 0, characters: 0 };
    counts[key.startsWith('word ') ? 'words' : 'characters'] += 1;
    days.set(day, counts);
  }
  return days;
}

// The running totals over a range's days: [{ key, words, characters }], each
// day's total including everything before the range.
export function growthOver(keys, days) {
  let words = 0;
  let characters = 0;
  for (const [key, counts] of days) {
    if (key < keys[0]) {
      words += counts.words;
      characters += counts.characters;
    }
  }
  return keys.map((key) => {
    const counts = days.get(key);
    if (counts) {
      words += counts.words;
      characters += counts.characters;
    }
    return { key, words, characters };
  });
}
