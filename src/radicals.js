// Radicals (部首) as things to study. Plain calculation, no page or database.
//
// The ready-made deck of radicals (data/wordlists/radicals/radicals.tsv,
// built by scripts/build-radicals.js) has two kinds of line:
//
//   - A radical that is itself a word (水, 口, 馬) is that word: a line with
//     its reading, which becomes an ordinary word record with the same ID as
//     when the word comes from the HSK or TOCFL list (the owner's choice,
//     2026-10-14). It gets the four kinds of card like any word.
//   - Any other radical (氵, 扌, 糹/纟) has no reading. It is kept as a word
//     record marked `kind: 'radical'`, like a sentence is (sentences.js), so
//     that decks, scheduling, leeches, the card manager and combining
//     backups all treat it as a word. What differs:
//       - Its ID is its traditional form followed by "|radical", where a word
//         has its pinyin, so every device gives it the same one.
//       - Its `pinyin` is empty, so it has no pinyin card and no tone card,
//         and nothing speaks it (most radicals are not said aloud as words).
//       - Its meaning comes from the list, not from the dictionary.
//     It is taught in the Learn tab like a word: a first look, then writing
//     it over the outline and from memory.

export const isRadical = (word) => word.kind === 'radical';

export const radicalId = (traditional) => `${traditional}|radical`;

// The kinds of card a radical (of kind 'radical') can have.
export const RADICAL_CARD_TYPES = ['meaning', 'writing'];

// The record for a radical with no reading, from its line in the list
// ({ traditional, simplified, meaning }), before it gets its place in the
// queue (newWordRecords in words.js does that).
export function radicalRecord(entry) {
  return {
    id: radicalId(entry.traditional),
    kind: 'radical',
    traditional: entry.traditional,
    simplified: entry.simplified,
    pinyin: '',
    definition: entry.meaning,
  };
}
