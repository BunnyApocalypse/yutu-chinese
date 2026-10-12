// Decides what to review next, and suggests a grade for a finished word.
//
// Everything here is plain calculation: no database, no page, and the current
// time is always passed in. That makes it easy to test with made-up dates.
//
// Times are in milliseconds since 1970, the same as Date.now().

import { AGAIN, HARD, GOOD } from './scheduler.js';

// The four kinds of card a word can have, in the order they are introduced
// for a new word: recognizing it first, producing it last.
//   meaning: shown the characters, recall the meaning
//   pinyin:  shown the characters, recall the reading
//   tone:    shown the characters, give the tone of each
//   writing: shown the meaning, write the characters
export const CARD_TYPES = ['meaning', 'pinyin', 'tone', 'writing'];

// How many words may be seen for the first time per day, unless the setting
// says otherwise.
export const DEFAULT_NEW_WORDS_PER_DAY = 5;

// Cards of the same word give each other's answers away: a writing card ends
// by showing the pinyin, and the other three show the characters. So after
// any card of a word is reviewed, the word's other cards wait this long.
export const SIBLING_GAP_MS = 3 * 60 * 1000;

export function cardId(wordId, type) {
  return `${wordId}#${type}`;
}

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

// When a card was last reviewed. Cards saved before `lastReviewedAt` existed
// only have the time inside their FSRS state, as text.
function lastReviewOf(card) {
  return card.lastReviewedAt ?? Date.parse(card.fsrsState.last_review);
}

// Looks at all words and their cards and reports what there is to do.
//
// words: list of word records, each with an `id` and an `order`
// cards: a Map from card ID (see cardId above) to card. A card that isn't in
//        the map has never been studied.
// now:   the current time
// options:
//   newWordsPerDay: how many words may be introduced per day
//   enabledTypes:   the card types switched on, e.g. ['meaning', 'writing']
//   hasCardType(word, type): optional; return false for a word that can't
//                   have that kind of card
//
// Returns:
//   next:         { word, type, card } to review now (card is null for a card
//                 never studied), or null if there is nothing to do right now
//   dueCount:     how many studied cards are due now
//   newCardCount: how many never-studied cards are waiting for words already
//                 introduced
//   newWordsLeftToday: how many more words can be introduced today
//   nextDueAt:    when something next becomes available, or null
export function planSession(words, cards, now, options) {
  const { newWordsPerDay, enabledTypes, hasCardType = () => true } = options;
  const dayStart = startOfStudyDay(now);
  // Introduce a word's cards in the standard order, whatever order the
  // enabled types were given in.
  const types = CARD_TYPES.filter((type) => enabledTypes.includes(type));

  const due = [];
  const newForKnownWords = [];
  const unseenWords = [];
  let nextDueAt = null;
  let introducedToday = 0;
  let newCardCount = 0;

  const noteAvailableAt = (time) => {
    if (nextDueAt === null || time < nextDueAt) {
      nextDueAt = time;
    }
  };

  const inListOrder = [...words].sort((a, b) => a.order - b.order);
  for (const word of inListOrder) {
    // All of the word's studied cards, including types now switched off:
    // they still count for when the word was introduced and last seen.
    const studied = CARD_TYPES.map((type) => cards.get(cardId(word.id, type))).filter(Boolean);
    const wanted = types.filter((type) => hasCardType(word, type));

    if (studied.length === 0) {
      if (wanted.length > 0) {
        unseenWords.push({ word, type: wanted[0], card: null });
      }
      continue;
    }
    if (Math.min(...studied.map((card) => card.firstReviewedAt)) >= dayStart) {
      introducedToday += 1;
    }

    let offeredNewCard = false;
    for (const type of wanted) {
      const card = cards.get(cardId(word.id, type));
      // The word's other cards hold this one back for a while after a review.
      const siblings = studied.filter((other) => other !== card);
      const heldUntil =
        siblings.length > 0 ? Math.max(...siblings.map(lastReviewOf)) + SIBLING_GAP_MS : 0;

      if (card) {
        const availableAt = Math.max(card.due, heldUntil);
        if (availableAt <= now) {
          due.push({ word, type, card });
        } else {
          noteAvailableAt(availableAt);
        }
      } else {
        newCardCount += 1;
        // Only the word's next new card is on offer; the rest wait their turn.
        if (offeredNewCard) {
          continue;
        }
        offeredNewCard = true;
        if (heldUntil <= now) {
          newForKnownWords.push({ word, type, card: null });
        } else {
          noteAvailableAt(heldUntil);
        }
      }
    }
  }

  // Longest overdue first.
  due.sort((a, b) => a.card.due - b.card.due);

  const newWordsLeftToday = Math.min(
    unseenWords.length,
    Math.max(0, newWordsPerDay - introducedToday),
  );

  let next = null;
  if (due.length > 0) {
    next = due[0];
  } else if (newForKnownWords.length > 0) {
    next = newForKnownWords[0];
  } else if (newWordsLeftToday > 0) {
    next = unseenWords[0];
  }

  return { next, dueCount: due.length, newCardCount, newWordsLeftToday, nextDueAt };
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
