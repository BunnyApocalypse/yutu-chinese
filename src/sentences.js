// Sentences as things to study. Plain calculation, no page or database.
//
// A sentence is kept as a word record marked `kind: 'sentence'`, so that
// decks, scheduling, leeches, the card manager and combining backups all
// treat it as they treat a word. What differs:
//
//   - Its `pinyin` is for reading, not for checking: tone marks, with spaces
//     between words and with punctuation ("Wǒmen shì tóngxué."), as an
//     example sentence in data/notes/ has it. So a sentence has no pinyin
//     card and no tone card.
//   - Its ID is its traditional characters followed by "|sentence", where a
//     word has its pinyin. The same sentence gets the same ID on every
//     device.
//   - It may have a `cloze`: one word in it, { traditional, simplified },
//     that its writing card asks for.
//   - Changing its characters changes its ID, as correcting a word's
//     characters does; its cards and reviews move with it (renameWord in
//     db.js).
//   - It is not taught in the Learn tab: it counts as learned when it is
//     added (`learnedAt`), and its cards come up in Review.
//
// A sentence has up to two cards:
//   meaning   "reading": the sentence is shown; recall what it means
//   writing   either the cloze word, written into the gap, or the whole
//             sentence; the "sentence writing" setting says which

export const isSentence = (word) => word.kind === 'sentence';

export const sentenceId = (traditional) => `${traditional}|sentence`;

// The kinds of card a sentence can have (see above).
export const SENTENCE_CARD_TYPES = ['meaning', 'writing'];

// Which kinds of card are wanted for sentences, from the settings:
//   sentenceReading: true or false
//   sentenceWriting: 'word' (the cloze word), 'sentence' (all of it) or 'off'
export function sentenceCardTypes(settings) {
  return [
    ...(settings.sentenceReading ? ['meaning'] : []),
    ...(settings.sentenceWriting !== 'off' ? ['writing'] : []),
  ];
}

// The record for a new sentence.
//
// sentence: { traditional, simplified, pinyin, definition } and optionally
//           cloze: { traditional, simplified }
// order:    its place in the queue (see newWordRecords in words.js)
// deckId:   the deck it goes into
// now:      the time, as from Date.now()
export function sentenceRecord(sentence, order, deckId, now) {
  const record = {
    id: sentenceId(sentence.traditional),
    kind: 'sentence',
    traditional: sentence.traditional,
    simplified: sentence.simplified,
    pinyin: sentence.pinyin || '',
    definition: sentence.definition,
    order,
    addedAt: now,
    // A sentence is not taught first: it is ready for Review at once.
    learnedAt: now,
    decks: [deckId],
  };
  const { cloze } = sentence;
  // A cloze word that is not in the sentence would leave nothing to ask for.
  if (cloze && sentence.traditional.includes(cloze.traditional) && sentence.simplified.includes(cloze.simplified)) {
    record.cloze = { traditional: cloze.traditional, simplified: cloze.simplified };
  }
  return record;
}

// The word to fill in, in both scripts, from the word as typed in one.
//
// own, other: the sentence in the script the word was typed in, and in the
//             other script
// clozeOwn:   the word, as it stands in `own`
//
// Returns { own, other }: in the other script it is the characters at the
// same place, if the two sentences have the same number of characters;
// otherwise the word as typed. Returns null if the word is not in the
// sentence.
export function clozeInBoth(own, other, clozeOwn) {
  const at = own.indexOf(clozeOwn);
  if (clozeOwn === '' || at < 0) {
    return null;
  }
  const place = Array.from(own.slice(0, at)).length;
  const length = Array.from(clozeOwn).length;
  const sameLength = Array.from(own).length === Array.from(other).length;
  return {
    own: clozeOwn,
    other: sameLength ? Array.from(other).slice(place, place + length).join('') : clozeOwn,
  };
}

// What a sentence's writing card asks for, in one script.
//
// mode: the "sentence writing" setting: 'word' or 'sentence'
//
// Returns { text, prompt }:
//   text:   the characters to write: the cloze word, or the whole sentence
//           (the writing flow leaves out what is not a character)
//   prompt: for the cloze word, the sentence with a gap where the word
//           goes ("我们是＿＿。"); null when the whole sentence is written
export function sentenceWriting(word, script, mode) {
  const sentence = word[script];
  const cloze = word.cloze && word.cloze[script];
  if (mode === 'word' && cloze && sentence.includes(cloze)) {
    const gap = '＿'.repeat(Array.from(cloze).length);
    return { text: cloze, prompt: sentence.replace(cloze, gap) };
  }
  return { text: sentence, prompt: null };
}
