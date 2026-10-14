// Decks: groups of words, which can be inside one another (a textbook and
// its chapters). Plain calculation, no page or database.
//
// A deck is a record { id, name, parentId, order } in the `decks` store, and
// a word lists the IDs of the decks it is in (`decks`). A word can be in
// several and still has one schedule: studying a deck only narrows down
// which words come up. A deck may have a `newWordsPerDay` of its own.
//
// Every word is in at least one deck (see homeForEveryWord).
//
// The page side is the Decks tab (wordsPanel.js and decksPanel.js) and the
// deck chooser in review.js.

// The ready-made lists and their levels, in order. The IDs are the `data-list`
// of the rows in the Ready-made decks section of index.html, and the levels are those in the first
// column of the files in data/wordlists/ (a test checks they agree).
//
// `levelName`, where a list has it, makes each of its levels a deck of its
// own, inside no other, under that name: learning one HSK level takes
// months, so nobody takes on the whole list as one deck (the owner,
// 2026-10-14). The list then has no deck. The radicals keep a deck of their
// own with their two levels inside it.
export const READY_MADE_LISTS = [
  { id: 'hsk-3.0', name: 'HSK 3.0', levels: ['1', '2', '3', '4', '5', '6', '7-9'], levelName: (level) => `HSK ${level} (3.0)` },
  { id: 'hsk-2.0', name: 'HSK 2.0', levels: ['1', '2', '3', '4', '5', '6'], levelName: (level) => `HSK ${level} (2.0)` },
  { id: 'tocfl', name: 'TOCFL', levels: ['Novice 1', 'Novice 2', '1', '2', '3', '4', '5'], levelName: (level) => `TOCFL ${level}` },
  { id: 'radicals', name: 'Radicals 部首', levels: ['Common', 'Uncommon'] },
];

// Where the decks of the levels that stand on their own go among the decks
// inside no other: after the ones made before them (newDeckRecord puts a new
// deck after all of these), and in the order of the lists and their levels.
const LEVEL_ORDER_BASE = 100;
const levelOrder = (position, index) => LEVEL_ORDER_BASE + position * 10 + index;

// How a level's deck was named until 2026-10-14, inside its list's deck.
const oldLevelName = (level) => (/^\d/.test(level) ? `Level ${level}` : level);

// The deck record for a ready-made list ('hsk-3.0'), one of its levels
// ('hsk-3.0/1') or a group of words inside a level ('tocfl/1/03'; see
// listTag in words.js), or null if the ID is none of these. The ID decides
// everything but a group's name, so every device makes the same deck.
//
// names: a Map from group deck ID to the group's name, from the list file
//        (see groupName in words.js). A group that is not in it is called
//        "Group 3"; that only happens where a group's deck has to be made
//        without the list at hand.
export function readyMadeDeck(deckId, names = new Map()) {
  for (const [position, list] of READY_MADE_LISTS.entries()) {
    if (deckId === list.id) {
      return list.levelName ? null : { id: list.id, name: list.name, parentId: null, order: position };
    }
    for (const level of list.levels) {
      const levelId = `${list.id}/${level}`;
      if (deckId === levelId) {
        const index = list.levels.indexOf(level);
        return list.levelName
          ? { id: deckId, name: list.levelName(level), parentId: null, order: levelOrder(position, index) }
          : { id: deckId, name: oldLevelName(level), parentId: list.id, order: index };
      }
      const group = deckId.startsWith(`${levelId}/`) && deckId.slice(levelId.length + 1).match(/^(\d+)$/);
      if (group) {
        return {
          id: deckId,
          name: names.get(deckId) || `Group ${Number(group[1])}`,
          parentId: levelId,
          order: Number(group[1]),
        };
      }
    }
  }
  return null;
}

// The ready-made decks that `words` are in but that are not stored yet,
// together with the decks those are inside.
//
// words: word records
// decks: the deck records already stored
// names: the names of group decks, by ID (see readyMadeDeck)
export function missingReadyMadeDecks(words, decks, names = new Map()) {
  const stored = new Set(decks.map((deck) => deck.id));
  const missing = new Map();
  for (const word of words) {
    for (const deckId of word.decks || []) {
      // The deck itself and each deck it is inside (a group's level, a
      // level's list), outermost first.
      const chain = [];
      for (let deck = readyMadeDeck(deckId, names); deck; deck = deck.parentId && readyMadeDeck(deck.parentId)) {
        chain.unshift(deck);
      }
      for (const deck of chain) {
        if (!stored.has(deck.id)) {
          missing.set(deck.id, deck);
        }
      }
    }
  }
  return [...missing.values()];
}

// Until 2026-10-14 the levels of every ready-made list were inside a deck of
// the list ("HSK 3.0 › Level 1"). Returns what has to change in the stored
// `decks` for the lists whose levels now stand on their own (see
// READY_MADE_LISTS):
//   changed: the level decks, and any deck someone made inside the list's
//            deck, now inside no other; a level still under its old name
//            gets the new one ("Level 1" becomes "HSK 1 (3.0)"), one renamed
//            by hand keeps its name
//   removed: the IDs of the lists' decks, if no word is in one directly
// Doing it again changes nothing, so it can run at every start.
export function flattenedReadyMadeDecks(decks, words) {
  const changed = [];
  const removed = [];
  for (const [position, list] of READY_MADE_LISTS.entries()) {
    // (A level can be left inside a list's deck that is gone, when a backup
    // from a device that had not changed yet is combined with this one.)
    if (!list.levelName || !decks.some((deck) => deck.id === list.id || deck.parentId === list.id)) {
      continue;
    }
    for (const deck of decks.filter((candidate) => candidate.parentId === list.id)) {
      const { changedAt, ...moved } = { ...deck, parentId: null };
      const level = list.levels.find((candidate) => deck.id === `${list.id}/${candidate}`);
      if (level !== undefined) {
        moved.order = levelOrder(position, list.levels.indexOf(level));
        if (deck.name === oldLevelName(level)) {
          moved.name = list.levelName(level);
        }
      }
      changed.push(moved);
    }
    if (decks.some((deck) => deck.id === list.id) && !words.some((word) => (word.decks || []).includes(list.id))) {
      removed.push(list.id);
    }
  }
  return { changed, removed };
}

// Until 2026-10-13 a word from a ready-made list carried the list and level
// in a `lists` field, with the same values deck IDs have now. Returns the
// words among `words` that still have one, with it moved to `decks`.
export function wordsWithListsAsDecks(words) {
  return words
    .filter((word) => word.lists)
    .map(({ lists, ...word }) => ({ ...word, decks: [...new Set([...(word.decks || []), ...lists])] }));
}

// ---- The tree ----

// The decks in the order they are listed: each one followed by the decks
// inside it. Decks side by side go by `order`, then by name.
//
// Returns [{ deck, depth, label }]: depth is 0 for a deck inside no other,
// and label is the deck's name with those it is inside, "HSK 3.0 › Level 1".
export function deckTree(decks) {
  const ids = new Set(decks.map((deck) => deck.id));
  // A deck whose parent is not there (any more) is listed at the top.
  const parentOf = (deck) => (ids.has(deck.parentId) ? deck.parentId : null);
  const rows = [];
  const listed = new Set();
  const list = (parentId, depth, path) => {
    const inside = decks
      .filter((deck) => parentOf(deck) === parentId && !listed.has(deck.id))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    for (const deck of inside) {
      listed.add(deck.id);
      rows.push({ deck, depth, label: [...path, deck.name].join(' › ') });
      list(deck.id, depth + 1, [...path, deck.name]);
    }
  };
  list(null, 0, []);
  // Decks that are inside each other in a circle are reached from no top.
  // It should not happen (see canBeInside); they are listed at the end.
  for (const deck of decks) {
    if (!listed.has(deck.id)) {
      listed.add(deck.id);
      rows.push({ deck, depth: 0, label: deck.name });
      list(deck.id, 1, [deck.name]);
    }
  }
  return rows;
}

// The IDs of a deck and of every deck inside it, as a Set.
export function deckWithInside(decks, deckId) {
  const ids = new Set([deckId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const deck of decks) {
      if (ids.has(deck.parentId) && !ids.has(deck.id)) {
        ids.add(deck.id);
        grew = true;
      }
    }
  }
  return ids;
}

// Whether a deck may be put inside `parentId` (null for "inside no deck"):
// not inside itself, nor inside a deck that is inside it.
export function canBeInside(decks, deckId, parentId) {
  return parentId === null || !deckWithInside(decks, deckId).has(parentId);
}

// A new deck's record. It goes after the decks there are.
//
// id: a random ID (see randomId in db.js)
export function newDeckRecord(id, name, parentId, decks) {
  const order = Math.max(-1, ...decks.map((deck) => deck.order)) + 1;
  return { id, name, parentId, order };
}

// How many new words a day is the goal while `deck` is studied: its own
// number if it has one, otherwise the one from Settings. `deck` is null when
// all words are studied.
export function dailyGoal(deck, goalInSettings) {
  return deck && Number.isInteger(deck.newWordsPerDay) ? deck.newWordsPerDay : goalInSettings;
}

// ---- Words and decks ----

// Whether a word is in any of the decks whose IDs are in `deckIds` (a Set).
export function isInDecks(word, deckIds) {
  return (word.decks || []).some((id) => deckIds.has(id));
}

// The word put in a deck as well. Returns the same record if it is in it.
export function withDeck(word, deckId) {
  return (word.decks || []).includes(deckId) ? word : { ...word, decks: [...(word.decks || []), deckId] };
}

// The word taken out of the decks in `deckIds` (a Set). A word left in no
// deck has no `decks` field.
export function withoutDecks(word, deckIds) {
  const { decks = [], ...rest } = word;
  const left = decks.filter((id) => !deckIds.has(id));
  return left.length > 0 ? { ...rest, decks: left } : rest;
}

// Of the words in the decks in `deckIds` (a Set), those in no other deck:
// the ones that deleting those decks would leave without any.
export function wordsOnlyIn(words, deckIds) {
  return words.filter((word) => isInDecks(word, deckIds) && word.decks.every((id) => deckIds.has(id)));
}

// ---- Every word is in a deck ----

// The deck the app starts with, and where words go that would otherwise be
// in no deck. Its ID is fixed, so every device has the same one; it can be
// renamed like any other deck.
export const DEFAULT_DECK = { id: 'chinese', name: 'Chinese 中文', parentId: null, order: -1 };

// Sees to it that there is a deck and that every word is in one.
//
// Returns { words, decks }: the word records to save (those that were in no
// deck that exists, now in the default deck) and the deck records to save
// (the default deck, if it is needed and not there). Both are usually empty.
export function homeForEveryWord(words, decks) {
  const there = new Set(decks.map((deck) => deck.id));
  const homeless = words.filter((word) => !isInDecks(word, there));
  const needed = (homeless.length > 0 || decks.length === 0) && !there.has(DEFAULT_DECK.id);
  return {
    words: homeless.map((word) => ({ ...word, decks: [DEFAULT_DECK.id] })),
    decks: needed ? [DEFAULT_DECK] : [],
  };
}
