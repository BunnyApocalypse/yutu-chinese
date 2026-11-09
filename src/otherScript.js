// Learning to read the script the cards are not in ("Also read simplified",
// or traditional; docs/cards.md, "Reading the other script"). Plain
// calculation, no page.
//
// The changes between the two scripts are keys (scriptKeys.js): 爭 → 争 is
// learned once, on one word, and every character with it is then readable.
// This file works out, from the learner's words, which word teaches which
// keys, in the order the words were learned, and where else each key is.
//
// A word that has been through the flow that teaches it (Learn, on
// "简体字 forms") has `formsLearnedAt`, the time; its keys are then known,
// and it alone gets cards in the other script. Stored on the word, so it
// syncs and is in backups like `learnedAt`.

import { needsLearning, keyOf } from './scriptKeys.js';

// The character pairs in which a word's two forms differ, as [traditional,
// simplified]. A word whose two forms are not as long as each other (it
// happens in the dictionary, rarely) is one pair, the whole word.
export function differingPairs(word) {
  const traditional = [...(word.traditional ?? '')];
  const simplified = [...(word.simplified ?? '')];
  if (traditional.length !== simplified.length) {
    return word.traditional === word.simplified ? [] : [[word.traditional, word.simplified]];
  }
  return traditional.map((char, i) => [char, simplified[i]]).filter(([t, s]) => t !== s);
}

// A word's changes, each key once, in the order of its characters.
//
// changesOf(traditional, simplified): the changes of one character pair, as
//   scriptKeys.js gives them (changesOfPairs, so that 賣 itself has the key
//   賣 → 卖)
export function changesOfWord(word, changesOf) {
  const seen = new Set();
  const changes = [];
  for (const [t, s] of differingPairs(word)) {
    for (const change of changesOf(t, s)) {
      if (!seen.has(keyOf(change))) {
        seen.add(keyOf(change));
        changes.push(change);
      }
    }
  }
  return changes;
}

// What is still to learn, in the order to learn it: a list of
//   { word, keys }
// `keys`: the changes the word is the first to teach (it may be empty under
// 'all', for a word whose changes were all taught by others).
//
// words:   the learner's learned words, in the order they were learned
// options: mode:      'off', 'different' (only words with a key not yet
//                     learned) or 'all' (every word written differently)
//          changesOf: as for changesOfWord
export function formsToLearn(words, { mode, changesOf }) {
  if (mode === 'off') {
    return [];
  }
  const learnable = (word) => changesOfWord(word, changesOf).filter(needsLearning);
  // Keys known already: those of every word taught.
  const known = new Set();
  for (const word of words) {
    if (word.formsLearnedAt !== undefined) {
      for (const change of learnable(word)) {
        known.add(keyOf(change));
      }
    }
  }
  const items = [];
  const claimed = new Set();
  for (const word of words) {
    if (word.formsLearnedAt !== undefined || differingPairs(word).length === 0) {
      continue;
    }
    const keys = learnable(word).filter((change) => !known.has(keyOf(change)) && !claimed.has(keyOf(change)));
    for (const change of keys) {
      claimed.add(keyOf(change));
    }
    if (keys.length > 0 || mode === 'all') {
      items.push({ word, keys });
    }
  }
  return items;
}

// Where else a key is: the learner's words with it (other than `except`),
// then characters from `morePairs` (e.g. the ready-made lists' pairs) that
// none of those words has. Returns { words, characters }, `characters` as
// [traditional, simplified] pairs; each list at most `limit` long.
export function whereElse(key, { words, except, morePairs = [], changesOf, limit = 6 }) {
  const has = (t, s) => changesOf(t, s).some((change) => keyOf(change) === key);
  const found = words
    .filter((word) => word !== except && differingPairs(word).some(([t, s]) => has(t, s)))
    .slice(0, limit);
  const inWords = new Set([except, ...found].flatMap((word) => (word ? [...(word.traditional ?? '')] : [])));
  const characters = [];
  for (const [t, s] of morePairs) {
    if (characters.length >= limit) {
      break;
    }
    if (!inWords.has(t) && !characters.some(([other]) => other === t) && has(t, s)) {
      characters.push([t, s]);
    }
  }
  return { words: found, characters };
}
