// Decks: groups of words, which can be inside one another (a textbook and
// its chapters). Plain calculation, no page or database.
//
// A deck is a record { id, name, parentId, order } in the `decks` store, and
// a word lists the IDs of the decks it is in (`decks`). A word can be in
// several and still has one schedule. Nothing on screen uses decks yet; this
// file only gives the ready-made lists their decks, so that the words added
// from them are already filed when decks arrive.

// The ready-made lists and their levels, in order. The IDs are the values of
// the List drop-down in index.html, and the levels are those in the first
// column of the files in data/wordlists/ (a test checks they agree).
export const READY_MADE_LISTS = [
  { id: 'hsk-3.0', name: 'HSK 3.0', levels: ['1', '2', '3', '4', '5', '6', '7-9'] },
  { id: 'hsk-2.0', name: 'HSK 2.0', levels: ['1', '2', '3', '4', '5', '6'] },
  { id: 'tocfl', name: 'TOCFL', levels: ['Novice 1', 'Novice 2', '1', '2', '3', '4', '5'] },
];

// The deck record for a ready-made list ('hsk-3.0') or one of its levels
// ('hsk-3.0/1', see listTag in words.js), or null if the ID is neither.
// The ID decides everything, so every device makes the same record.
export function readyMadeDeck(deckId) {
  for (const [position, list] of READY_MADE_LISTS.entries()) {
    if (deckId === list.id) {
      return { id: list.id, name: list.name, parentId: null, order: position };
    }
    const level = list.levels.find((entry) => deckId === `${list.id}/${entry}`);
    if (level !== undefined) {
      // TOCFL has two levels with names of their own before its level 1.
      const name = /^\d/.test(level) ? `Level ${level}` : level;
      return { id: deckId, name, parentId: list.id, order: list.levels.indexOf(level) };
    }
  }
  return null;
}

// The ready-made decks that `words` are in but that are not stored yet,
// together with the decks those are inside.
//
// words: word records
// decks: the deck records already stored
export function missingReadyMadeDecks(words, decks) {
  const stored = new Set(decks.map((deck) => deck.id));
  const missing = new Map();
  for (const word of words) {
    for (const deckId of word.decks || []) {
      const deck = readyMadeDeck(deckId);
      for (const needed of deck ? [readyMadeDeck(deck.parentId), deck] : []) {
        if (needed && !stored.has(needed.id)) {
          missing.set(needed.id, needed);
        }
      }
    }
  }
  return [...missing.values()];
}

// Until 2026-10-13 a word from a ready-made list carried the list and level
// in a `lists` field, with the same values deck IDs have now. Returns the
// words among `words` that still have one, with it moved to `decks`.
export function wordsWithListsAsDecks(words) {
  return words
    .filter((word) => word.lists)
    .map(({ lists, ...word }) => ({ ...word, decks: [...new Set([...(word.decks || []), ...lists])] }));
}
