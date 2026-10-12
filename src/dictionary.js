// Looking words up in the dictionary, to fill in the fields when a word is
// added in the Words tab.
//
// The dictionary is data/cedict/dictionary.tsv, made from CC-CEDICT by
// scripts/build-dictionary.js; the format is described there. It is a big
// file (about 117,000 entries), so the app only fetches it when a word is
// about to be added (see wordsPanel.js).
//
// Plain calculation: no page and no fetching, so it can be tested on its own.

// How many meanings are proposed for the card. A dictionary entry often
// lists many more; a card needs to be short.
const MEANINGS_PROPOSED = 3;

// Prepares the dictionary's text for looking up. Returns a Map from a word's
// characters, traditional or simplified, to its lines in the file. The lines
// are only taken apart when a word is looked up (see lookUp), which keeps
// this quick and light for a file this size.
export function readDictionary(text) {
  const linesByWord = new Map();
  const note = (word, line) => {
    const lines = linesByWord.get(word);
    if (lines) {
      lines.push(line);
    } else {
      linesByWord.set(word, [line]);
    }
  };
  for (const line of text.split('\n')) {
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const firstTab = line.indexOf('\t');
    const secondTab = line.indexOf('\t', firstTab + 1);
    note(line.slice(0, firstTab), line);
    // The simplified column is empty where both scripts are the same.
    if (secondTab > firstTab + 1) {
      note(line.slice(firstTab + 1, secondTab), line);
    }
  }
  return linesByWord;
}

// A short meaning for the card, from an entry's list of meanings: the first
// group, cut down to a few. "place; location; area; space; territory" becomes
// "place; location; area". It is only a proposal, to be edited.
export function proposeMeaning(meanings) {
  return meanings[0]
    .replace(/^\((bound form|literary|coll\.|dialect)\) /, '')
    .split('; ')
    .slice(0, MEANINGS_PROPOSED)
    .join('; ');
}

// Looks up a word by its characters in either script.
//
// dictionary: from readDictionary
//
// Returns a list of entries, empty if the word is not in the dictionary. A
// word with several readings has one entry for each:
//   { traditional, simplified, pinyin, meanings, proposedMeaning }
//   and pinyinTaiwan, if the dictionary notes a different Taiwan reading
// Names (pinyin with a capital, such as a surname) come last.
export function lookUp(dictionary, characters) {
  const entries = (dictionary.get(characters) || []).map((line) => {
    const [traditional, simplified, pinyin, meanings, pinyinTaiwan] = line.split('\t');
    const entry = {
      traditional,
      simplified: simplified || traditional,
      pinyin,
      meanings: meanings.split('/'),
    };
    entry.proposedMeaning = proposeMeaning(entry.meanings);
    if (pinyinTaiwan) {
      entry.pinyinTaiwan = pinyinTaiwan;
    }
    return entry;
  });
  const isName = (entry) => /^[A-Z]/.test(entry.pinyin);
  // sort() keeps the file's order among entries that compare equal.
  return entries.sort((a, b) => Number(isName(a)) - Number(isName(b)));
}
