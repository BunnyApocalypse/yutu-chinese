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

// The four grades, in FSRS's own numbering.
export const AGAIN = 1;
export const HARD = 2;
export const GOOD = 3;
export const EASY = 4;

export const GRADES = [
  { value: AGAIN, label: 'Again' },
  { value: HARD, label: 'Hard' },
  { value: GOOD, label: 'Good' },
  { value: EASY, label: 'Easy' },
];

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
