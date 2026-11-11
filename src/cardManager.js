// Managing cards by hand: seeing how each of a word's cards stands, starting
// one over, and marking words as known already. Plain calculation, no page
// or database. (Suspending is in leeches.js.)

import { gradeOptions, EASY } from './scheduler.js';
import { CARD_TYPES, cardIdFor, otherScriptCardId } from './session.js';
import { lapsesOf } from './leeches.js';
import { isSentence, SENTENCE_CARD_TYPES } from './sentences.js';
import { isRadical, RADICAL_CARD_TYPES } from './radicals.js';

// ---- Starting a card over ----
//
// "Start over" makes a card new again. Its reviews are kept, as all reviews
// are, so the word notes the time: `startedOverAt`, by kind of card
// ({ writing: 1760000000000 }). Reviews of that kind made before it no
// longer count toward the card's schedule when cards are worked out afresh
// from their reviews (merge.js). The cards themselves are removed by the
// caller (startCardsOver in db.js). A word's writing cards in the two
// scripts are started over together.

// The word with one kind of card marked as started over at `now`.
// The kinds of card a word can have: a sentence (sentences.js) or a radical
// with no reading (radicals.js) has no pinyin or tone card.
const kindsOf = (word) =>
  isSentence(word) ? SENTENCE_CARD_TYPES : isRadical(word) ? RADICAL_CARD_TYPES : CARD_TYPES;

export function withStartedOver(word, type, now) {
  return { ...word, startedOverAt: { ...(word.startedOverAt || {}), [type]: now } };
}

// The time before which a word's reviews of one kind do not count: when
// that kind was last started over, or -1.
export function countedFrom(word, type) {
  return (word.startedOverAt && word.startedOverAt[type]) ?? -1;
}

// ---- How a word's cards stand ----

// One entry per card a word has or could have in the script it is studied
// in, in the usual order:
//   { type, script, card, reviewCount, lapses, suspended }
// `card` is null for a card never studied. A writing card that exists only
// in the other script is listed as well, after the one studied, and so is a
// card for reading the word in the other script ("Also read simplified",
// otherScriptCardId), once studied, with `other: true`.
//
// word:    the word record
// cards:   all card records
// reviews: all review records, or null if they have not been read
// script:  the script the word is studied in
export function cardsOfWord(word, cards, reviews, script) {
  const byId = new Map(cards.filter((card) => card.wordId === word.id).map((card) => [card.id, card]));
  const otherScript = script === 'traditional' ? 'simplified' : 'traditional';
  const rows = [];
  // A sentence or a radical has no pinyin or tone card.
  // The card a review was of: its own ID if it is a card in the other script
  // (those were always saved so); otherwise worked out from its script, since
  // reviews from before writing cards were kept per script have the plain ID.
  const reviewedId = (review) =>
    review.cardId?.includes('#in-')
      ? review.cardId
      : cardIdFor(word, review.type, review.script === 'simplified' ? 'simplified' : 'traditional');
  for (const type of kindsOf(word)) {
    const ids = [[cardIdFor(word, type, script), script]];
    const otherId = cardIdFor(word, type, otherScript);
    if (otherId !== ids[0][0] && byId.has(otherId)) {
      ids.push([otherId, otherScript]);
    }
    const readingId = otherScriptCardId(word, type, otherScript);
    if (!ids.some(([id]) => id === readingId) && byId.has(readingId)) {
      ids.push([readingId, otherScript]);
    }
    for (const [id, cardScript] of ids) {
      const card = byId.get(id) || null;
      rows.push({
        type,
        script: cardScript,
        ...(id.includes('#in-') && { other: true }),
        card,
        reviewCount: reviews
          ? reviews.filter(
              (review) =>
                !review.importedSchedule &&
                review.wordId === word.id &&
                review.type === type &&
                review.time > countedFrom(word, type) &&
                reviewedId(review) === id,
            ).length
          : null,
        lapses: lapsesOf(card),
        suspended: (word.suspended || []).includes(type),
      });
    }
  }
  return rows;
}

// ---- Marking a word as known ----
//
// For someone who adds a list and knows part of it already. Each of the
// word's cards that has never been studied gets one ordinary review, graded
// Easy, and the word counts as learned without its lesson. Being ordinary
// reviews, they combine between devices like any other, and the scheduler
// treats the claim as it would any Easy answer: the cards come back in some
// days, and their later answers decide the rest.

// word:     the word record
// cards:    all card records
// types:    the kinds of card switched on in Settings
// script:   the script the word is studied in
// now:      the time, as from Date.now()
// randomId: gives an ID for a review (db.js)
// options:  idOf(word, type, script), the card IDs (cardIdFor; for the
//           word's cards in the other script, otherScriptCardId), and
//           `mark`, the field of the word that says it is learned
//           ('learnedAt'; 'formsLearnedAt' for its forms, otherScript.js)
//
// Returns { word, cards, reviews }: the word as it is to be saved (learned),
// and the new cards with the reviews that made them. Cards that have been
// studied are left as they are.
export function markedKnown(word, cards, types, script, now, randomId, { idOf = cardIdFor, mark = 'learnedAt' } = {}) {
  const studied = new Set(cards.filter((card) => card.wordId === word.id).map((card) => card.id));
  const newCards = [];
  const reviews = [];
  const kinds = kindsOf(word);
  for (const type of kinds.filter((kind) => types.includes(kind))) {
    const id = idOf(word, type, script);
    if (studied.has(id)) {
      continue;
    }
    const outcome = gradeOptions(null, new Date(now))[EASY];
    newCards.push({
      id,
      wordId: word.id,
      type,
      due: outcome.due,
      firstReviewedAt: now,
      lastReviewedAt: now,
      fsrsState: outcome.fsrsState,
    });
    reviews.push({
      id: randomId(),
      cardId: id,
      wordId: word.id,
      type,
      time: now,
      grade: EASY,
      suggestedGrade: null,
      script,
      log: outcome.log,
      // Not an answer given to the card: the word was marked as known.
      markedKnown: true,
    });
  }
  return {
    word: word[mark] === undefined ? { ...word, [mark]: now } : word,
    cards: newCards,
    reviews,
  };
}
