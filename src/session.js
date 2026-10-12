// Decides what to review next, and suggests a grade for a finished word.
//
// Everything here is plain calculation: no database, no page, and the current
// time is always passed in. That makes it easy to test with made-up dates.
//
// Times are in milliseconds since 1970, the same as Date.now().

import { AGAIN, HARD, GOOD } from './scheduler.js';

// How many words may be seen for the first time per day.
export const NEW_WORDS_PER_DAY = 10;

// The study day starts at 4:00 in the morning rather than midnight (as in
// Anki), so a late-night session still counts toward the same day.
const DAY_START_HOUR = 4;

// The moment the current study day began.
export function startOfStudyDay(now) {
  const start = new Date(now);
  start.setHours(DAY_START_HOUR, 0, 0, 0);
  if (start.getTime() > now) {
    start.setDate(start.getDate() - 1);
  }
  return start.getTime();
}

// Looks at all words and their cards and reports what there is to do.
//
// words: list of word records, each with an `id` and an `order`
// cards: a Map from word ID to that word's card. A word without a card has
//        never been studied.
//
// Returns:
//   next:         { word, card } to review now (card is null for a new word),
//                 or null if there is nothing to do right now
//   dueCount:     how many studied words are due now
//   newLeftToday: how many new words can still be introduced today
//   nextDueAt:    when the next studied word becomes due, or null
export function planSession(words, cards, now) {
  const due = [];
  const unseen = [];
  let nextDueAt = null;
  let introducedToday = 0;
  const dayStart = startOfStudyDay(now);

  for (const word of words) {
    const card = cards.get(word.id);
    if (!card) {
      unseen.push(word);
      continue;
    }
    if (card.firstReviewedAt >= dayStart) {
      introducedToday += 1;
    }
    if (card.due <= now) {
      due.push({ word, card });
    } else if (nextDueAt === null || card.due < nextDueAt) {
      nextDueAt = card.due;
    }
  }

  // Longest overdue first.
  due.sort((a, b) => a.card.due - b.card.due);
  // New words in the order of the word list.
  unseen.sort((a, b) => a.order - b.order);

  const newLeftToday = Math.min(unseen.length, Math.max(0, NEW_WORDS_PER_DAY - introducedToday));

  let next = null;
  if (due.length > 0) {
    next = due[0];
  } else if (newLeftToday > 0) {
    next = { word: unseen[0], card: null };
  }

  return { next, dueCount: due.length, newLeftToday, nextDueAt };
}

// A character counts as missed when its mistakes exceed this share of its
// strokes...
const MISSED_MISTAKE_SHARE = 0.25;
// ...but one slip is always forgiven, however few strokes it has.
const MISTAKES_ALWAYS_FORGIVEN = 1;

// Proposes a verdict for one character that was just written: true if it
// counts as passed, false if missed. You can overrule it.
//
// mistakes:  wrong strokes on this character, over all attempts
// strokes:   number of strokes the character has
// hintShown: a correct stroke was flashed after repeated misses
// peeked:    the outline or the animation was used, or the character was
//            started over after the answer had been shown
export function judgeChar({ mistakes, strokes, hintShown, peeked }) {
  if (hintShown || peeked) {
    return false;
  }
  const allowed = Math.max(MISTAKES_ALWAYS_FORGIVEN, strokes * MISSED_MISTAKE_SHARE);
  return mistakes <= allowed;
}

// Suggests a grade for a word that was just written.
//
// passedPerChar: the verdict on each character (true = passed)
// mistakes:      wrong strokes over the whole word
//
// One missed character fails the whole word. "Easy" is never suggested; that
// is for you to choose.
export function suggestGrade({ passedPerChar, mistakes }) {
  if (passedPerChar.includes(false)) {
    return AGAIN;
  }
  if (mistakes > 0) {
    return HARD;
  }
  return GOOD;
}

// Describes a length of time briefly, for the grade buttons: "10m", "3d".
export function formatInterval(milliseconds) {
  const minutes = milliseconds / 60000;
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  const months = days / 30;
  if (months < 12) return `${Math.round(months * 10) / 10}mo`;
  return `${Math.round((days / 365) * 10) / 10}y`;
}
