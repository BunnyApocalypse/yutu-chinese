// Spaced repetition scheduling. The only file that imports ts-fsrs, the
// library implementing FSRS (the scheduler Anki uses).
//
// FSRS keeps a few numbers per card, mainly:
//   stability:  roughly, how many days until you'd have a 90% chance of
//               still remembering it
//   difficulty: how hard this card is for you, from 1 to 10
// From those and your grade it works out when the card is due next. A brand
// new card first goes through short "learning steps" (it comes back after a
// minute, then ten minutes) before being scheduled days ahead.

import { fsrs, generatorParameters, createEmptyCard } from 'ts-fsrs';
import { t } from './text.js';

// The four grades, in FSRS's own numbering.
export const AGAIN = 1;
export const HARD = 2;
export const GOOD = 3;
export const EASY = 4;

export const GRADES = [
  { value: AGAIN, label: t('grade.again') },
  { value: HARD, label: t('grade.hard') },
  { value: GOOD, label: t('grade.good') },
  { value: EASY, label: t('grade.easy') },
];

// The grade buttons offered, by the setting `gradeButtons` (the owner,
// 2026-10-20, after tester 3, who had no Chinese and found four grades too
// many): 'four', Again to Easy, or 'two', Wrong and Right. Right is always
// recorded as Good, whatever the app suggested; Hard and Easy are never
// used, which FSRS handles well (as Anki's pass/fail add-ons do).
const PASS_FAIL = [
  { value: AGAIN, label: t('grade.wrong') },
  { value: GOOD, label: t('grade.right') },
];

export function gradeButtons(kind) {
  return kind === 'two' ? PASS_FAIL : GRADES;
}

// The grade to record, or highlight, for `value` with these buttons: with
// two, Hard and Easy become Good (Right).
export function gradeFor(value, kind) {
  return kind === 'two' && value !== AGAIN ? GOOD : value;
}

// Default FSRS settings: aim for 90% recall. "Fuzz" varies long intervals by
// a small random amount so that cards learned together don't all come back
// on the same day forever.
const scheduler = fsrs(generatorParameters({ enable_fuzz: true }));

// ts-fsrs works with Date objects. We store plain data instead (dates become
// text like "2026-10-12T08:00:00.000Z"), because plain data can go straight
// into a backup file. ts-fsrs accepts dates in that form too.
function toPlainData(value) {
  return JSON.parse(JSON.stringify(value));
}

// Works out what each of the four grades would do to a card.
//
// fsrsState: the card's saved FSRS state, or null for a card never studied
// now:       the time of the review, as a Date
//
// Returns an object with one entry per grade (1 to 4), each holding:
//   fsrsState: the card's new state, to be saved
//   due:       when the card is due next, in milliseconds since 1970
//              (the same kind of number as Date.now())
//   log:       ts-fsrs's record of the review, kept in the review history
export function gradeOptions(fsrsState, now) {
  const card = fsrsState ?? createEmptyCard(now);
  const outcomes = scheduler.repeat(card, now);
  const options = {};
  for (const { value } of GRADES) {
    options[value] = {
      fsrsState: toPlainData(outcomes[value].card),
      due: outcomes[value].card.due.getTime(),
      log: toPlainData(outcomes[value].log),
    };
  }
  return options;
}

// The chance, from 0 to 1, that a card is still remembered at `now` (a Date
// or milliseconds): what FSRS calls retrievability. Practicing all cards
// takes the lowest first (practiceCards in session.js).
export function retrievability(fsrsState, now) {
  return scheduler.get_retrievability(fsrsState, now, false);
}

// Works out a card's schedule afresh from the reviews made of it, as if they
// were being made again one after another. Since every review is kept, this
// gives the same result as the state saved with the card, and it is how a
// card's schedule can be put together from reviews made on two devices.
//
// reviews: the card's review records (see db.js), in any order
//
// Returns { fsrsState, due } as gradeOptions does, or null without reviews.
//
// A card brought over from Anki also has a record holding the schedule Anki
// had given it, `importedSchedule` ({ fsrsState, due }, see ankiImport.js),
// dated just after its last review there. The card goes on from that
// schedule, not from the one these reviews would give, so that it is due
// when Anki said; the reviews before it are kept as its history.
//
// For speed (an Anki import replays tens of thousands of reviews), each
// review works out only the grade given (`next`, where gradeOptions works
// out all four), and the card is turned into plain data once, at the end.
// It gives exactly what gradeOptions would, review after review.
export function replay(reviews) {
  let card = null;
  for (const review of [...reviews].sort((a, b) => a.time - b.time)) {
    if (review.importedSchedule) {
      card = review.importedSchedule.fsrsState;
      continue;
    }
    const now = new Date(review.time);
    card = scheduler.next(card ?? createEmptyCard(now), now, review.grade).card;
  }
  if (!card) {
    return null;
  }
  const fsrsState = toPlainData(card);
  return { fsrsState, due: new Date(fsrsState.due).getTime() };
}

// The FSRS state of a card never studied, as plain data: what an imported
// schedule is filled in from (see ankiImport.js).
export function emptyState(now) {
  return toPlainData(createEmptyCard(now));
}
