// Leeches: cards that keep being forgotten. Plain calculation, no page or
// database.
//
// The scheduler counts, for each card, how often it was graded Again after
// it had been learned (a "lapse"; `lapses` in the card's FSRS state). A card
// with as many lapses as the "leech" setting says is a leech. Nothing is
// stored for this: the count is part of the card, and comes out the same
// when cards are worked out afresh from their reviews (merge.js).
//
// A leech is only pointed out. What to do about it (a mnemonic, a better
// meaning, practice) is the learner's business, which is what the exports
// below are for.

import { cardIdFor } from './session.js';

export const DEFAULT_LEECH_LAPSES = 6;
export const MIN_LEECH_LAPSES = 2;
export const MAX_LEECH_LAPSES = 30;

// How often a card has been forgotten.
export function lapsesOf(card) {
  return (card && card.fsrsState && card.fsrsState.lapses) || 0;
}

export function isLeech(card, threshold) {
  return lapsesOf(card) >= threshold;
}

// ---- Suspended cards ----
//
// A word's `suspended` field lists the kinds of card ('meaning', 'writing')
// that are not to come up in Review. It is on the word, not on the card,
// because cards are worked out afresh from their reviews when two devices'
// data are combined, and a mark on the card would be lost. A word's writing
// cards in the two scripts are suspended together.

export function isSuspended(word, type) {
  return (word.suspended || []).includes(type);
}

// The word with one kind of card suspended.
export function withSuspended(word, type) {
  return isSuspended(word, type) ? word : { ...word, suspended: [...(word.suspended || []), type] };
}

// True if a review has just made a leech of a card: it was forgotten once
// more, and that brought it to the number of the setting or, for a card
// already past it (the number was lowered, or the card was switched back
// on), to any number above. This is when the "suspend" setting acts, so a
// card switched back on gets a chance until it is next forgotten.
export function becameLeech(cardBefore, cardAfter, threshold) {
  return lapsesOf(cardAfter) > lapsesOf(cardBefore) && isLeech(cardAfter, threshold);
}

// The script a card is written in, going by its ID (see cardIdFor).
const scriptOfCard = (card) => (card.id.endsWith('#simplified') ? 'simplified' : 'traditional');

// For a writing card: the character of the word that was missed most often,
// from the verdicts its reviews recorded.
//
// Returns { char, missed, of } (missed in `missed` of `of` reviews), or null
// if no character was ever missed or the reviews do not say.
function mostMissedCharacter(word, card, reviews) {
  const script = scriptOfCard(card);
  const chars = Array.from(word[script]);
  const missed = chars.map(() => 0);
  let counted = 0;
  for (const review of reviews) {
    const sameCard =
      review.wordId === word.id &&
      review.type === card.type &&
      cardIdFor(word, review.type, review.script === 'simplified' ? 'simplified' : 'traditional') === card.id;
    // A review of the word when it was written differently says nothing
    // about these characters.
    if (!sameCard || !Array.isArray(review.passedPerChar) || review.passedPerChar.length !== chars.length) {
      continue;
    }
    counted += 1;
    review.passedPerChar.forEach((passed, index) => {
      missed[index] += passed ? 0 : 1;
    });
  }
  const most = Math.max(0, ...missed);
  return most > 0 ? { char: chars[missed.indexOf(most)], missed: most, of: counted } : null;
}

// The leeches among `cards`.
//
// words:     word records
// cards:     card records
// reviews:   review records (only used to say which character of a writing
//            card is missed; an empty list leaves that out)
// threshold: how many lapses make a leech
//
// Returns [{ word, card, lapses, script, missedChar }], most forgotten first:
//   script:     for a writing card, the script it is written in; else null
//   missedChar: for a writing card of several characters, see
//               mostMissedCharacter; else null
export function findLeeches(words, cards, reviews, threshold) {
  const wordOf = new Map(words.map((word) => [word.id, word]));
  return cards
    .filter((card) => isLeech(card, threshold) && wordOf.has(card.wordId))
    .map((card) => {
      const word = wordOf.get(card.wordId);
      const writing = card.type === 'writing';
      return {
        word,
        card,
        lapses: lapsesOf(card),
        script: writing ? scriptOfCard(card) : null,
        missedChar:
          writing && Array.from(word[scriptOfCard(card)]).length > 1
            ? mostMissedCharacter(word, card, reviews)
            : null,
      };
    })
    .sort((a, b) => b.lapses - a.lapses || a.word.order - b.word.order);
}

// What a card asks, in a few words.
const KIND = {
  meaning: 'meaning',
  pinyin: 'pinyin',
  tone: 'tones',
  writing: 'writing',
};

// "writing · forgotten 7 times · 習 missed 5 of 9 times · suspended"
export function describeLeech(leech) {
  const { missedChar } = leech;
  return (
    `${KIND[leech.card.type]} · forgotten ${leech.lapses} times` +
    (missedChar ? ` · ${missedChar.char} missed ${missedChar.missed} of ${missedChar.of} times` : '') +
    (isSuspended(leech.word, leech.card.type) ? ' · suspended' : '')
  );
}

// "suspended: meaning, writing", for a word with suspended cards; else ''.
export function describeSuspended(word) {
  const kinds = (word.suspended || []).map((type) => KIND[type]);
  return kinds.length > 0 ? `suspended: ${kinds.join(', ')}` : '';
}

// The characters a leech is about: the script of a writing card, otherwise
// the script the word is shown in.
//
// scriptOf: gives the script a word is shown in (scriptFor in words.js)
const charactersOf = (leech, scriptOf) => leech.word[leech.script || scriptOf(leech.word)];

// The leeches as a list for a spreadsheet: one line each with tabs between
// the columns, under a line of captions.
//
// formatPinyin: turns stored pinyin into tone marks (wordList.js)
export function leechList(leeches, scriptOf, formatPinyin) {
  const lines = leeches.map((leech) =>
    [
      charactersOf(leech, scriptOf),
      formatPinyin(leech.word.pinyin),
      // A tab or line break inside a meaning would break the columns.
      leech.word.definition.replace(/\s+/g, ' '),
      KIND[leech.card.type],
      leech.lapses,
      leech.missedChar ? leech.missedChar.char : '',
    ].join('\t'),
  );
  return ['word\tpinyin\tmeaning\tcard\ttimes forgotten\tcharacter missed most', ...lines].join('\n') + '\n';
}

// The leeches as a request to put to an AI model, for mnemonics. The app
// sends nothing anywhere: the text is for the learner to paste where they
// like.
export function leechPrompt(leeches, scriptOf, formatPinyin) {
  // One line per word, with everything forgotten about it.
  const byWord = new Map();
  for (const leech of leeches) {
    const key = `${leech.word.id} ${charactersOf(leech, scriptOf)}`;
    byWord.set(key, [...(byWord.get(key) || []), leech]);
  }
  const lines = [...byWord.values()].map((group) => {
    const [{ word }] = group;
    const trouble = group
      .map(
        (leech) =>
          `${KIND[leech.card.type]} (forgotten ${leech.lapses} times` +
          (leech.missedChar ? `, mostly the character ${leech.missedChar.char}` : '') +
          ')',
      )
      .join('; ');
    return `- ${charactersOf(group[0], scriptOf)} (${formatPinyin(word.pinyin)}): ${word.definition.replace(/\s+/g, ' ')}. I keep forgetting: ${trouble}.`;
  });
  return [
    'I am learning Chinese with flashcards, and these are the words I keep forgetting. For each one I say what I forget: its meaning, its pinyin, its tones, or how to write it.',
    '',
    ...lines,
    '',
    'For each word, please give me:',
    '1. A breakdown of each character into its components, with what each component means or sounds like. Say so when a traditional explanation is uncertain or made up; do not invent etymology.',
    '2. A short, vivid mnemonic aimed at the thing I forget: a story linking the components for writing, a sound link for pinyin and tones, an image for meaning.',
    '3. One short example sentence with pinyin and an English translation.',
    '4. If the word is easily confused with a similar word or character, name it and say how to tell them apart.',
    '',
    'Keep each word to a few lines.',
  ].join('\n') + '\n';
}
