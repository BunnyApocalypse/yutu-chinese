// Readings put right in the ready-made word lists, carried over to words a
// device already has. Plain calculation; main.js does the saving.
//
// A word's ID is its traditional form and its reading, so when a list's
// reading of a word is corrected (data/wordlists/reading-fixes.tsv, which
// says why that happens), a device that added the word before keeps it under
// the old ID, with the old entry's meaning: 说法 "to expound Buddhist
// teachings" instead of 说法 "a way of putting it". At every start, such a
// word is given the reading meant, as if it had been corrected by hand in
// its pop-up panel: same record, new ID, the old one kept in `formerIds`,
// and its cards and reviews moved with it (renameWord in db.js).

import { proposeMeaning, MEANING_DETAILS } from './dictionary.js';
import { withFormerId } from './words.js';
import { isSentence } from './sentences.js';

// The corrections file, as text, read into [{ list, simplified, wrong, right }].
export function parseReadingFixes(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const [list, simplified, wrong, right] = line.split('\t');
      return { list, simplified, wrong, right };
    });
}

// True if the word is in a deck of the list `listId` ('hsk-3.0'): the list
// itself, one of its levels or a group inside one (see listTag in words.js).
const inList = (word, listId) =>
  (word.decks || []).some((deck) => deck === listId || deck.startsWith(`${listId}/`));

// The words a correction applies to: [{ word, fix }]. Only words in one of
// that list's decks: someone who typed in 说法 shuōfǎ by hand may mean the
// Buddhist word. A word whose corrected ID is taken already (the device has
// the right word too) is left alone, rather than one overwriting the other.
export function wordsToCorrect(fixes, words) {
  const ids = new Set(words.map((word) => word.id));
  const found = [];
  for (const word of words) {
    if (isSentence(word)) {
      continue;
    }
    const fix = fixes.find(
      (candidate) => candidate.simplified === word.simplified && candidate.wrong === word.pinyin && inList(word, candidate.list),
    );
    if (fix && !ids.has(`${word.traditional}|${fix.right}`)) {
      found.push({ word, fix });
    }
  }
  return found;
}

// The corrected record of `word`.
//
// entries: the dictionary's entries for the word (lookUp in dictionary.js),
//          or [] if the dictionary could not be had
// detail:  the "Dictionary meanings" setting (meaningDetail)
//
// The meaning is replaced only if it is still what the app proposed from the
// wrong entry, under any setting; a meaning the learner wrote is kept.
export function correctedWord(word, fix, entries, detail) {
  // Looked up by its characters, a word can also find entries of a variant
  // written alike in one script (著 is also a form of 着 and of 著 zhù).
  const own = entries.filter((entry) => entry.simplified === word.simplified && entry.traditional === word.traditional);
  const wrong = own.find((entry) => entry.pinyin === fix.wrong);
  const right = own.find((entry) => entry.pinyin === fix.right);
  const proposedFromWrong = wrong ? MEANING_DETAILS.map((each) => proposeMeaning(wrong.meanings, each)) : [];
  const definition =
    right && proposedFromWrong.includes(word.definition) ? proposeMeaning(right.meanings, detail) : word.definition;
  const corrected = { ...word, pinyin: fix.right, id: `${word.traditional}|${fix.right}`, definition };
  // A record read from the database carries the time it was saved; the new
  // one is stamped when it is saved (renameWord).
  delete corrected.changedAt;
  return withFormerId(corrected, word);
}
