// Streaks: how many study days in a row the learner has studied enough.
//
// Nothing is stored for them: the streak is worked out each time from the
// reviews (every review is kept, with its time) and from when each word was
// learned (`learnedAt`). So combining backups and importing from Anki carry
// it over by themselves, and it can't get out of step with the history.
//
// The owner's choices (2026-10-19):
// - A day counts once enough was studied: by default 10 cards reviewed or
//   2 words learned, whichever comes first. Both numbers are settings, and
//   streaks can be switched off ("all nudges should be able to be turned
//   off").
// - A missed day breaks the streak; the best one is kept and shown.
// - A day is a study day, starting at 4:00 as everywhere else (session.js).
//
// Marking a word as known ("I know this word") is not studying: its reviews
// and the `learnedAt` it sets don't count.

import { startOfStudyDay } from './session.js';
import { t } from './text.js';

export const DEFAULT_STREAK_CARDS = 10;
export const DEFAULT_STREAK_WORDS = 2;
export const MAX_STREAK_CARDS = 500;
export const MAX_STREAK_WORDS = 50;

// A study day's name, such as "2026-10-19": the date on which it began.
export function studyDayKey(time) {
  const start = new Date(startOfStudyDay(time));
  const pad = (number) => String(number).padStart(2, '0');
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
}

// The name of the study day before. (new Date(year, month, day) copes with
// the first of a month: day 0 is the last day of the month before.)
export function previousDayKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  const before = new Date(year, month - 1, day - 1, 12);
  return studyDayKey(before.getTime());
}

// What was studied on each day: day name → { cards, words }, how many
// different cards were reviewed and how many words were learned.
// reviews: { cardId, wordId, time, markedKnown } (other fields are ignored)
// words:   the words, for their `learnedAt`
export function studyByDay(reviews, words) {
  const cards = new Map();
  const learned = new Map();
  // "wordId|time" of every word marked as known, to leave its learnedAt out.
  const markedKnown = new Set();
  for (const review of reviews) {
    if (review.markedKnown) {
      markedKnown.add(`${review.wordId}|${review.time}`);
      continue;
    }
    const key = studyDayKey(review.time);
    if (!cards.has(key)) {
      cards.set(key, new Set());
    }
    cards.get(key).add(review.cardId);
  }
  for (const word of words) {
    if (word.learnedAt === undefined || markedKnown.has(`${word.id}|${word.learnedAt}`)) {
      continue;
    }
    const key = studyDayKey(word.learnedAt);
    learned.set(key, (learned.get(key) || 0) + 1);
  }
  const days = new Map();
  for (const key of new Set([...cards.keys(), ...learned.keys()])) {
    days.set(key, { cards: cards.get(key)?.size || 0, words: learned.get(key) || 0 });
  }
  return days;
}

// True if a day's study is enough for the streak.
// goal: { cards, words }, from the settings
export function dayCounts(study, goal) {
  return Boolean(study) && (study.cards >= goal.cards || study.words >= goal.words);
}

// The streak as it stands at `now`:
//   current:  days in a row, up to today if today counts already, or up to
//             yesterday if it doesn't yet (today can still keep it going)
//   best:     the longest run ever, at least `current`
//   todayDone: true if today already counts
//   today:    what was studied today, { cards, words }
//   lastRun:  when current is 1 and today counts, how long the run before it
//             was (0 if none), so a new start can be told apart from a first
export function streakAt(days, now, goal) {
  const counted = new Set([...days.keys()].filter((key) => dayCounts(days.get(key), goal)));
  const runBack = (key) => {
    let length = 0;
    while (counted.has(key)) {
      length += 1;
      key = previousDayKey(key);
    }
    return length;
  };
  const todayKey = studyDayKey(now);
  const todayDone = counted.has(todayKey);
  const current = runBack(todayDone ? todayKey : previousDayKey(todayKey));
  // A run's length is counted from its last day: a day whose next one
  // doesn't count.
  let best = current;
  let lastRun = 0;
  for (const key of counted) {
    best = Math.max(best, runBack(key));
  }
  if (todayDone && current === 1) {
    // The newest counted day before today.
    const earlier = [...counted].filter((key) => key < todayKey).sort();
    lastRun = earlier.length > 0 ? runBack(earlier[earlier.length - 1]) : 0;
  }
  return {
    current,
    best,
    todayDone,
    today: days.get(todayKey) || { cards: 0, words: 0 },
    lastRun,
  };
}

// The line about the streak at the end of Review, or '' for none.
export function streakLine(streak, goal) {
  if (streak.todayDone) {
    const best = streak.best > streak.current ? ` ${t('streak.best', { count: streak.best })}` : '';
    return t('streak.inARow', { count: streak.current }) + best;
  }
  const cardsLeft = goal.cards - streak.today.cards;
  const wordsLeft = goal.words - streak.today.words;
  // "more" only once something was studied today.
  const more = streak.today.cards > 0 || streak.today.words > 0;
  if (streak.current > 0) {
    return t('streak.toKeep', {
      count: streak.current,
      cards: t(more ? 'streak.reviewMoreCards' : 'streak.reviewCards', { count: cardsLeft }),
      words: t(more ? 'streak.learnMoreWords' : 'streak.learnWords', { count: wordsLeft }),
    });
  }
  return '';
}
