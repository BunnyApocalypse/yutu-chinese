// Keeping writing cards filed under the script they were learned in.
//
// A word written differently in the two scripts has a writing card for each
// (see cardIdFor in session.js): the traditional one under the plain ID, the
// simplified one under an ID ending in "#simplified". A card can end up under
// the plain ID although it was learned in simplified:
//   - it was studied before cards were kept per script (before 2026-10-13);
//   - its word was stored with the same form for both scripts, because the
//     dictionary could not supply the other one, and has since been
//     corrected.
// Left there, it would pass for knowing the traditional form. The reviews
// record the script each was done in, so the card can be put right.

import { getAll, getSome, getReviewsOfWord, moveCards } from './db.js';
import { PER_SCRIPT_TYPES, cardIdFor } from './session.js';

// Works out which cards under a plain ID belong under the simplified one:
// those whose latest review was done in simplified.
//
// words:   the word records to look at
// cards:   the card records (at least those of these words)
// reviews: the review records (at least those of these words)
//
// Returns [{ from, to }], card IDs. Plain calculation.
export function cardsLearnedInSimplified(words, cards, reviews) {
  const cardIds = new Set(cards.map((card) => card.id));
  // The latest review of each card.
  const latest = new Map();
  for (const review of reviews) {
    const known = latest.get(review.cardId);
    if (!known || review.time > known.time) {
      latest.set(review.cardId, review);
    }
  }
  const moves = [];
  for (const word of words) {
    for (const type of PER_SCRIPT_TYPES) {
      const from = cardIdFor(word, type, 'traditional');
      const to = cardIdFor(word, type, 'simplified');
      if (from !== to && cardIds.has(from) && !cardIds.has(to) && latest.get(from)?.script === 'simplified') {
        moves.push({ from, to });
      }
    }
  }
  return moves;
}

// Up to this many words, only their own cards and reviews are read; more
// (every word, once per device at start) are read all at once.
const FEW_WORDS = 20;

// Does that for these words in the database. Returns how many cards moved.
// A word saved in its panel reads only its writing cards and its reviews:
// reading all the reviews took 2.3 s of the 2.6 s a Save took on a computer
// with the owner's 186,000 (2026-11-10).
export async function fileCardsByScript(words) {
  const few = words.length <= FEW_WORDS;
  const cards = few
    ? await getSome('cards', words.flatMap((word) => PER_SCRIPT_TYPES.flatMap((type) => [cardIdFor(word, type, 'traditional'), cardIdFor(word, type, 'simplified')])))
    : await getAll('cards');
  const reviews = few ? (await Promise.all(words.map((word) => getReviewsOfWord(word.id)))).flat() : await getAll('reviews');
  const moves = cardsLearnedInSimplified(words, cards, reviews);
  if (moves.length > 0) {
    await moveCards(moves);
  }
  return moves.length;
}
