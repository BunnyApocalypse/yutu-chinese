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

// The kinds of card that are learned separately in each script. Writing 学习
// says little about writing 學習, so each has a card and a schedule of its
// own. The other kinds ask for a meaning or a reading, which is the same
// whichever script the word is shown in, so they have one card.
export const PER_SCRIPT_TYPES = ['writing'];

// True if this kind of card differs between the scripts for this word. A
// word written the same in both has one card of every kind.
function isPerScript(word, type) {
  return PER_SCRIPT_TYPES.includes(type) && word.traditional !== word.simplified;
}

// The ID of a word's card of one kind in one script ('traditional' or
// 'simplified'). The traditional card has the plain ID, just as a word's own
// ID is built on its traditional form; the simplified one, where it is a
// separate card, has "#simplified" added.
export function cardIdFor(word, type, script) {
  const plain = cardId(word.id, type);
  return script === 'simplified' && isPerScript(word, type) ? `${plain}#simplified` : plain;
}

// Every card ID a word can have, in both scripts.
export function allCardIds(word) {
  return [
    ...new Set(
      CARD_TYPES.flatMap((type) => [
        cardIdFor(word, type, 'traditional'),
        cardIdFor(word, type, 'simplified'),
      ]),
    ),
  ];
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
export function lastReviewOf(card) {
  return card.lastReviewedAt ?? Date.parse(card.fsrsState.last_review);
}

// A word in the app is either waiting or learned. It is learned once it has
// been through the Learn tab (which sets its `learnedAt`), or has any studied
// card (words from before there was a Learn tab). Only learned words are
// reviewed.
function isLearned(word, studiedCards) {
  return word.learnedAt !== undefined || studiedCards.length > 0;
}

// The word the Learn tab teaches next: the first one waiting, in the order
// of `order`. Returns null if none is waiting.
//
// cards: a Map from card ID to card, as for planSession
export function nextToLearn(words, cards) {
  const waiting = words.filter(
    (word) => !isLearned(word, allCardIds(word).map((id) => cards.get(id)).filter(Boolean)),
  );
  return waiting.sort((a, b) => a.order - b.order)[0] || null;
}

// Looks at the learned words and their cards and reports what there is to
// review.
//
// words: list of word records, each with an `id` and an `order`
// cards: a Map from card ID (see cardIdFor above) to card. A card that isn't
//        in the map has never been studied.
// now:   the current time
// options:
//   newWordsPerDay: how many cards may be started again in another script
//                   per day (see below). For new words it is only a goal,
//                   which the Learn tab shows; nothing here enforces it.
//   enabledTypes:   the card types switched on, e.g. ['meaning', 'writing']
//   hasCardType(word, type): optional; return false for a word that can't
//                   have that kind of card
//   scriptOf(word): optional; the script the word is studied in,
//                   'traditional' (the default) or 'simplified'
//
// A card that was learned in the other script only (see PER_SCRIPT_TYPES) is
// learned again in this one, as if new: after someone who studied simplified
// switches to traditional, say. Such cards are limited to newWordsPerDay a
// day (less the words learned that day) and come in the order they were
// first learned.
//
// Returns:
//   next:         { word, type, card } to review now (card is null for a card
//                 never studied), or null if there is nothing to do right now
//   dueCount:     how many studied cards are due now
//   newCardCount: how many never-studied cards are waiting for learned words
//   newWordsLeftToday: how many cards to be learned again in another script
//                 can still be started today
//   learnedToday: how many words were learned (or first studied) today
//   waitingCount: how many words are waiting to be learned
//   nextDueAt:    when something next becomes available, or null
//   reviewedToday: how many cards were reviewed this study day
//   laterToday:   how many cards become available later this study day
//   tomorrow:     how many cards become available on the next study day
export function planSession(words, cards, now, options) {
  const {
    newWordsPerDay,
    enabledTypes,
    hasCardType = () => true,
    scriptOf = () => 'traditional',
  } = options;
  const dayStart = startOfStudyDay(now);
  // A study day is not always 24 hours (summer time), so the next one's
  // start is found from a moment well inside it.
  const tomorrowStart = startOfStudyDay(dayStart + 36 * 60 * 60 * 1000);
  const dayAfterStart = startOfStudyDay(tomorrowStart + 36 * 60 * 60 * 1000);
  // Introduce a word's cards in the standard order, whatever order the
  // enabled types were given in.
  const types = CARD_TYPES.filter((type) => enabledTypes.includes(type));

  const due = [];
  const newForKnownWords = [];
  const toLearnAgain = [];
  let waitingCount = 0;
  let nextDueAt = null;
  let introducedToday = 0;
  let newCardCount = 0;
  let reviewedToday = 0;
  let laterToday = 0;
  let tomorrow = 0;

  // Called once for each card that is not available yet.
  const noteAvailableAt = (time) => {
    if (nextDueAt === null || time < nextDueAt) {
      nextDueAt = time;
    }
    if (time < tomorrowStart) {
      laterToday += 1;
    } else if (time < dayAfterStart) {
      tomorrow += 1;
    }
  };

  const inListOrder = [...words].sort((a, b) => a.order - b.order);
  for (const word of inListOrder) {
    // All of the word's studied cards, including types now switched off:
    // they still count for when the word was introduced and last seen.
    // That goes for cards in the other script too.
    const studied = allCardIds(word).map((id) => cards.get(id)).filter(Boolean);
    reviewedToday += studied.filter((card) => lastReviewOf(card) >= dayStart).length;
    const wanted = types.filter((type) => hasCardType(word, type));
    const script = scriptOf(word);
    const otherScript = script === 'traditional' ? 'simplified' : 'traditional';
    // The word's card of a kind in the script studied, and in the other one
    // if that is a separate card.
    const cardOf = (type) => cards.get(cardIdFor(word, type, script));
    const otherCardOf = (type) =>
      isPerScript(word, type) ? cards.get(cardIdFor(word, type, otherScript)) : undefined;

    if (!isLearned(word, studied)) {
      waitingCount += 1;
      continue;
    }
    // A card begun today in this script, of a word known in the other one,
    // uses up one of the day's new words just as a new word does.
    const learnedAgainToday = CARD_TYPES.some((type) => {
      const card = cardOf(type);
      const other = otherCardOf(type);
      return (
        card && other && card.firstReviewedAt >= dayStart && other.firstReviewedAt < card.firstReviewedAt
      );
    });
    // A word counts for the day it was learned, or first studied.
    const firstSeen = Math.min(word.learnedAt ?? Infinity, ...studied.map((card) => card.firstReviewedAt));
    if (firstSeen >= dayStart || learnedAgainToday) {
      introducedToday += 1;
    }

    let offeredNewCard = false;
    for (const type of wanted) {
      const card = cardOf(type);
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
      } else if (otherCardOf(type)) {
        toLearnAgain.push({
          word,
          type,
          heldUntil,
          learnedAt: otherCardOf(type).firstReviewedAt,
        });
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
    toLearnAgain.length,
    Math.max(0, newWordsPerDay - introducedToday),
  );

  // Cards to learn again in this script: in the order first learned, leaving
  // out those held back just now by another card of their word.
  toLearnAgain.sort((a, b) => a.learnedAt - b.learnedAt);
  const againNow = toLearnAgain.filter((entry) => entry.heldUntil <= now);
  if (newWordsLeftToday > 0) {
    for (const entry of toLearnAgain.filter((held) => held.heldUntil > now)) {
      noteAvailableAt(entry.heldUntil);
    }
  }

  let next = null;
  if (due.length > 0) {
    next = due[0];
  } else if (newForKnownWords.length > 0) {
    next = newForKnownWords[0];
  } else if (newWordsLeftToday > 0 && againNow.length > 0) {
    next = { word: againNow[0].word, type: againNow[0].type, card: null };
  }

  return {
    next,
    dueCount: due.length,
    newCardCount,
    newWordsLeftToday,
    learnedToday: introducedToday,
    waitingCount,
    nextDueAt,
    reviewedToday,
    laterToday,
    tomorrow,
  };
}

// The steps of the lesson a word is taught by (see "The lesson for a new
// word" in review.js):
//   'meet':    look at the word: its characters, reading and meaning. Only
//              when the word is new altogether (the Learn tab), not when just
//              its writing card is.
//   'tone':    give each character's tone, as practice. Left out if tone
//              cards are switched off or the word cannot have one.
//   'trace':   write over the outline, each stroke being shown until it is
//              written
//   'outline': write over the outline, without the strokes being shown
//   'test':    write it from memory. In Review this is the writing card
//              proper, and the only step that is graded; in the Learn tab it
//              is practice, and nothing is graded (the owner, 2026-10-16).
// The three writing steps are left out if writing cards are switched off or
// the word cannot be written.
export function lessonSteps({ newWord = false, toneCardsOn, canHaveToneCard, canBeWritten = true }) {
  return [
    ...(newWord ? ['meet'] : []),
    ...(toneCardsOn && canHaveToneCard ? ['tone'] : []),
    ...(canBeWritten ? ['trace', 'outline', 'test'] : []),
  ];
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
// hintShown: the next stroke was flashed as a hint, after repeated misses
//            or asked for with a long hold (gestures.js)
// peeked:    the outline or the animation was used, or the character was
//            started over after the answer had been shown
// hintCountsAs: the setting of that name: 'missed' (the default) to judge a
//            character with a hint as missed, 'hard' to let it pass, with the
//            word's grade then at best Hard (suggestGrade). The owner,
//            2026-10-15.
export function judgeChar({ mistakes, strokes, hintShown, peeked, hintCountsAs = 'missed' }) {
  if (peeked || (hintShown && hintCountsAs !== 'hard')) {
    return false;
  }
  const allowed = Math.max(MISTAKES_ALWAYS_FORGIVEN, strokes * MISSED_MISTAKE_SHARE);
  return mistakes <= allowed;
}

// Suggests a grade for a word that was just written.
//
// passedPerChar: the verdict on each character (true = passed)
// mistakes:      wrong strokes over the whole word
// hintPerChar:   true where a hint was shown (see judgeChar)
//
// One missed character fails the whole word. A hint makes it Hard at best.
// "Easy" is never suggested; that is for you to choose.
export function suggestGrade({ passedPerChar, mistakes, hintPerChar = [] }) {
  if (passedPerChar.includes(false)) {
    return AGAIN;
  }
  if (mistakes > 0 || hintPerChar.includes(true)) {
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
