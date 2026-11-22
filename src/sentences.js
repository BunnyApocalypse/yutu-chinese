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
//   - It is learned in the Learn tab, as a word is (the owner, 2026-11-22),
//     when it comes from a list or from "Add a sentence" on a deck's page:
//     it is added without `learnedAt` and waits there. One added from a
//     word's page, or by itself when its word is learned (and every
//     sentence from before), counts as learned when it is added: its
//     `learnedAt` is its `addedAt` (learnedWhenAdded), and its cards come
//     up in Review at once.
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
// options:
//   waiting: true to have it wait in the Learn tab (from a list, or added
//            by hand on a deck's page); otherwise it is ready for Review
//            at once (from a word's page, or with its word)
export function sentenceRecord(sentence, order, deckId, now, { waiting = false } = {}) {
  const record = {
    id: sentenceId(sentence.traditional),
    kind: 'sentence',
    traditional: sentence.traditional,
    simplified: sentence.simplified,
    pinyin: sentence.pinyin || '',
    definition: sentence.definition,
    order,
    addedAt: now,
    // Learned as it is added (learnedWhenAdded), unless it waits in Learn.
    ...(waiting ? {} : { learnedAt: now }),
    decks: [deckId],
  };
  const { cloze } = sentence;
  // A cloze word that is not in the sentence would leave nothing to ask for.
  if (cloze && sentence.traditional.includes(cloze.traditional) && sentence.simplified.includes(cloze.simplified)) {
    record.cloze = { traditional: cloze.traditional, simplified: cloze.simplified };
  }
  return record;
}

// True for a sentence that counted as learned as it was added (from a word's
// page, by itself with its word, or before sentences were learned in Learn):
// it was never in the Learn tab, so it is not one of the day's words there,
// nor a word learned for the streak. A sentence learned in Learn, or marked
// as known there, has a `learnedAt` later than its `addedAt`.
export function learnedWhenAdded(word) {
  return isSentence(word) && word.learnedAt !== undefined && word.learnedAt === word.addedAt;
}

// How a sentence is shown where a word's characters would be in a small
// box (Learn's strip of today's words, the pill): its first two characters
// and "…". A word, and a sentence that short, as it is.
export function shortForm(word, script) {
  const characters = Array.from(word[script]);
  return isSentence(word) && characters.length > 3 ? `${characters.slice(0, 2).join('')}…` : word[script];
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
//           goes ("我们是＿＿。"), at each place it stands (the owner,
//           2026-11-20: 聞's example has 聞 twice); null when the whole
//           sentence is written
export function sentenceWriting(word, script, mode) {
  const sentence = word[script];
  const cloze = word.cloze && word.cloze[script];
  if (mode === 'word' && cloze && sentence.includes(cloze)) {
    const gap = '＿'.repeat(Array.from(cloze).length);
    return { text: cloze, prompt: sentence.replaceAll(cloze, gap) };
  }
  return { text: sentence, prompt: null };
}

// The records for the sentences of a list (as newWordRecords in words.js
// does for words): those not yet in `existing` (word records), each once,
// queued after every existing word. They wait in the Learn tab.
//
// Returns { toAdd, alreadyHave }: the new records, and how many were left
// out as already there (or earlier in the list).
export function newSentenceRecords(sentences, existing, deckId, now) {
  const known = new Set(existing.map((word) => word.id));
  let order = existing.reduce((highest, word) => Math.max(highest, word.order), -1);
  const toAdd = [];
  let alreadyHave = 0;
  for (const sentence of sentences) {
    const id = sentenceId(sentence.traditional);
    if (known.has(id)) {
      alreadyHave += 1;
      continue;
    }
    known.add(id);
    order += 1;
    toAdd.push(sentenceRecord(sentence, order, deckId, now, { waiting: true }));
  }
  return { toAdd, alreadyHave };
}

// ---- Sentences in a list (words.js, readWordList) ----
//
// A list of words may have sentences in it too (the owner, 2026-11-22). A
// line is a sentence when its characters have the punctuation of a
// sentence in them (。！？，、；：, or ? and ! of the Latin alphabet), which a
// word never has. A grammar pattern with gaps (越……越……, "……，这样……")
// is not one: Skritter's lists have such lines, left out as before. Its
// columns, separated by tabs or commas as a word's are:
//
//   the sentence     in one script or both: simplified, then traditional
//                    (or the other way round, as for words); the second may
//                    be left empty or left out, and is then looked up
//   reading          optional: pinyin or zhuyin, kept as typed
//   meaning          needed
//   word to fill in  optional: the cloze word, in either script

// Whether the characters of a list's line are a sentence.
export function looksLikeSentence(characters) {
  return (
    /\p{Script=Han}/u.test(characters) && /[。！？，、；：?!]/u.test(characters) && !/…|\.\.\.|⋯/u.test(characters)
  );
}

// Whether a field of a list is a sentence's reading rather than its meaning:
// no Chinese characters in it, and either zhuyin, or words that are all
// pinyin syllables (with tone marks, tone numbers or none). An English
// meaning nearly always has a word that is not ("Wait", "the").
//
// isPinyinWord(word): whether one word, punctuation taken off, is pinyin
// (readTypedPinyin and isSyllables, passed in by words.js).
export function isSentenceReading(field, isPinyinWord) {
  if (field === '' || /\p{Script=Han}/u.test(field)) {
    return false;
  }
  if (/\p{Script=Bopomofo}/u.test(field)) {
    return !/[a-z]/i.test(field);
  }
  const words = field
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}\p{N}'’-]/gu, ''))
    .filter(Boolean);
  return words.length > 0 && words.every(isPinyinWord);
}

// Sorts the fields of a sentence's line into its columns (see above).
//
// fields:       the line's fields, as split at its tabs or commas
// isTsv:        whether it was split at tabs. A CSV line whose sentence or
//               meaning has a comma in it and isn't in quotes arrives as
//               more fields, which are put back together.
// isPinyinWord: as for isSentenceReading
//
// Returns { first, second, pinyin, definition, cloze } (`second` and `cloze`
// null where the line has none), or { reason }: 'sentenceMeaning' if it has
// no meaning, 'sentenceColumns' if a TSV line has more columns than these.
export function readSentenceFields(fields, isTsv, isPinyinWord) {
  const trimmed = fields.map((field) => field.trim());
  const hasHan = (field) => /\p{Script=Han}/u.test(field);
  // Chinese and nothing else (punctuation and spaces aside): a cloze word.
  const onlyChinese = (field) => hasHan(field) && !/\p{L}/u.test(field.replace(/\p{Script=Han}/gu, ''));
  const first = trimmed[0];
  let rest = trimmed.slice(1);
  let second = null;
  // The second script, or its column left empty. (An empty column there
  // could also be the reading left empty; it comes to the same.)
  if (rest.length > 0 && (hasHan(rest[0]) || rest[0] === '')) {
    second = rest[0] || null;
    rest = rest.slice(1);
  }
  // Trailing empty columns mean nothing.
  while (rest.length > 0 && rest[rest.length - 1] === '') {
    rest.pop();
  }
  let cloze = null;
  if (rest.length > 1 && onlyChinese(rest[rest.length - 1])) {
    cloze = rest.pop();
  }
  // The reading: the fields before the meaning that are reading (in CSV a
  // reading may have been split at its commas), or an empty column.
  const reading = [];
  while (rest.length > 1 && (isSentenceReading(rest[0], isPinyinWord) || (reading.length === 0 && rest[0] === ''))) {
    reading.push(rest[0]);
    rest = rest.slice(1);
  }
  // No meaning: nothing left, or only a reading ("你好吗？	Nǐ hǎo ma?").
  const onlyReading = reading.length === 0 && rest.length === 1 && isSentenceReading(rest[0], isPinyinWord);
  if (rest.length === 0 || rest.join('') === '' || onlyReading) {
    return { reason: 'sentenceMeaning' };
  }
  if (isTsv && rest.length > 1) {
    return { reason: 'sentenceColumns' };
  }
  // Put back together with the commas they were split at.
  const rejoin = (parts) => parts.join(', ').trim();
  return { first, second, pinyin: rejoin(reading), definition: rejoin(rest), cloze };
}
