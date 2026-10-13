// Adding words to the study list and looking after it: checking what was
// typed, reading a pasted list, working out which words are new, searching.
//
// Plain calculation: no page and no database, so it can be tested on its own.
// The page side is in wordsPanel.js.

import { wordId, formatPinyin } from './wordList.js';

// One reading in numbered pinyin: syllables of letters each followed by a
// tone number, with an optional apostrophe between them (nv3'er2).
const READING_PATTERN = /^(?:[a-zA-Z]+[1-5]'?)+$/;

const PINYIN_HELP = 'Write pinyin with tone numbers, like xue2xi2 (5 for the neutral tone).';

// Tidies numbered pinyin as typed, so the same reading is always stored the
// same way: "Xue2 xi2" stays capitalized but loses its space (or hyphen), ü
// and u: become v, an apostrophe goes before every later syllable that starts
// with a, e or o (nv3'er2) and nowhere else, and several readings are
// separated by a comma and a space.
// Returns null if it is not numbered pinyin.
export function tidyPinyin(text) {
  const readings = text
    .split(',')
    .map((reading) => reading.replace(/u:|ü/g, 'v').replace(/U:|Ü/g, 'V').replace(/[\s-]+/g, ''));
  if (readings.some((reading) => !READING_PATTERN.test(reading))) {
    return null;
  }
  return readings
    .map((reading) =>
      reading
        .match(/[a-zA-Z]+[1-5]/g)
        .map((syllable, index) => (index > 0 && /^[aeo]/i.test(syllable) ? `'${syllable}` : syllable))
        .join(''),
    )
    .join(', ');
}

// Checks the fields of one word as typed or read from a list:
//   { traditional, simplified, pinyin, definition, pinyinTaiwan, pinyinAlso,
//     cardScript }
// Either of traditional and simplified may be left empty if they are the same.
//
// Returns { word } with the tidied word, or { problem } with a sentence
// saying what is wrong.
export function checkWord(fields) {
  const clean = (text) => (text || '').replace(/\s+/g, ' ').trim();
  let traditional = clean(fields.traditional);
  let simplified = clean(fields.simplified);
  traditional = traditional || simplified;
  simplified = simplified || traditional;
  if (traditional === '') {
    return { problem: 'Type the characters of the word.' };
  }
  // A space would hide a typing slip; | and # are used inside the IDs of
  // words and cards.
  if (/[\s|#]/.test(traditional + simplified)) {
    return { problem: 'The characters may not contain spaces, | or #.' };
  }
  // Array.from counts whole characters, where .length would count rare
  // characters twice.
  if (Array.from(traditional).length !== Array.from(simplified).length) {
    return { problem: 'The traditional and simplified forms must have the same number of characters.' };
  }

  if (clean(fields.pinyin) === '') {
    return { problem: `The pinyin is missing. ${PINYIN_HELP}` };
  }
  const pinyin = tidyPinyin(clean(fields.pinyin));
  if (pinyin === null) {
    return { problem: `"${clean(fields.pinyin)}" is not pinyin the app can read. ${PINYIN_HELP}` };
  }
  const definition = clean(fields.definition);
  if (definition === '') {
    return { problem: 'The meaning is missing.' };
  }

  const word = { simplified, traditional, pinyin, definition };
  if (clean(fields.pinyinTaiwan) !== '') {
    const pinyinTaiwan = tidyPinyin(clean(fields.pinyinTaiwan));
    if (pinyinTaiwan === null) {
      return { problem: `The Taiwan reading is not pinyin the app can read. ${PINYIN_HELP}` };
    }
    // Only kept if it really differs.
    if (pinyinTaiwan !== pinyin) {
      word.pinyinTaiwan = pinyinTaiwan;
    }
  }
  // Readings that are accepted on tone cards besides the listed one, such as
  // xing1qi5 for 星期. They are not part of the word's ID.
  if (clean(fields.pinyinAlso) !== '') {
    const pinyinAlso = tidyPinyin(clean(fields.pinyinAlso));
    if (pinyinAlso === null) {
      return { problem: `The readings also accepted are not pinyin the app can read. ${PINYIN_HELP}` };
    }
    const extra = pinyinAlso.split(', ').filter((reading) => !pinyin.split(', ').includes(reading));
    if (extra.length > 0) {
      word.pinyinAlso = extra.join(', ');
    }
  }
  // The word's own script, if it has one (see scriptFor).
  if (fields.cardScript === 'traditional' || fields.cardScript === 'simplified') {
    word.cardScript = fields.cardScript;
  }
  return { word };
}

// The script a word's cards are shown and written in: 'traditional' or
// 'simplified'.
//
// A word may have its own, `cardScript`, for a deck that mixes the two: mostly
// traditional, say, with a few words learned in simplified. It only counts
// while both scripts are being learned; otherwise, and for a word without
// one, the Script setting decides.
//
// settings: the current settings (see settings.js); `script` and
//           `bothScripts` are used
export function scriptFor(word, settings) {
  return settings.bothScripts && word.cardScript ? word.cardScript : settings.script;
}

// The note shown above a card whose word is in another script than the rest
// of the deck (see scriptFor), so that a simplified word among traditional
// ones is not taken for the traditional form: "simp. 简体" or "trad. 繁體".
// '' for every other word, and for one written the same in both scripts.
export function scriptFlagFor(word, settings) {
  const script = scriptFor(word, settings);
  if (script === settings.script || word.traditional === word.simplified) {
    return '';
  }
  return script === 'simplified' ? 'simp. 简体' : 'trad. 繁體';
}

// ---- Reading a list of words ----

// Splits one line of a CSV file (comma-separated values) into its fields.
// A field that contains a comma is normally wrapped in double quotes, with a
// quote inside it written twice: "to see, to watch". Files that don't follow
// this exactly are common, so a quote that doesn't wrap a whole field is taken
// as an ordinary character.
export function splitCsvLine(line) {
  const fields = [];
  let rest = line;
  while (true) {
    // A wrapped field: a quote, then anything (with "" for a quote), then a
    // quote that is followed by a comma or the end of the line.
    const wrapped = rest.match(/^\s*"((?:[^"]|"")*)"\s*(,|$)/);
    if (wrapped) {
      fields.push(wrapped[1].replace(/""/g, '"'));
      rest = rest.slice(wrapped[0].length);
      if (wrapped[2] === '') {
        break;
      }
      continue;
    }
    const comma = rest.indexOf(',');
    if (comma === -1) {
      fields.push(rest);
      break;
    }
    fields.push(rest.slice(0, comma));
    rest = rest.slice(comma + 1);
  }
  return fields;
}

// Sorts the fields of one CSV line into a word's columns. This takes some
// care, because Skritter's CSV export does not wrap fields in quotes: a
// meaning with a comma in it, or two readings ("di4fang5, di4fang1"), arrive
// as extra fields. So: the first two fields are the characters; the pinyin is
// the third field plus any that follow it and are pinyin too; a last field
// that is pinyin is the Taiwan reading; everything in between is the meaning.
function columnsFromCsv(fields) {
  const isPinyin = (field) => tidyPinyin(field.trim()) !== null;
  const [simplified, traditional, firstReading, ...others] = fields;
  const readings = [firstReading];
  // The last field is never taken for pinyin here: something has to be left
  // over as the meaning.
  while (others.length > 1 && isPinyin(others[0])) {
    readings.push(others.shift());
  }
  let pinyinTaiwan;
  if (others.length > 1 && isPinyin(others[others.length - 1])) {
    pinyinTaiwan = others.pop();
  }
  return {
    simplified,
    traditional,
    pinyin: readings.join(','),
    definition: others.length > 0 ? others.join(',') : undefined,
    pinyinTaiwan,
  };
}

const COLUMNS_HELP =
  'It needs four columns: simplified, traditional, pinyin, meaning. Or three: characters, pinyin, meaning.';

// Reads the text of a word list: one word per line, with the columns
// simplified, traditional, pinyin, meaning and optionally the Taiwan reading
// (see wordList.js). The columns may be separated by tabs (TSV) or by commas
// (CSV); a line with a tab in it is read as TSV. Unlike parseWordList in
// wordList.js, every line is checked, and lines that can't be used are
// reported.
//
// A line may also have a single column of characters: characters, pinyin,
// meaning. It is told apart by its second column being pinyin.
// completeForms(characters, pinyin), if given, is then asked how the word is
// written in both scripts and returns { traditional, simplified }; without
// it both are taken to be the same.
//
// Returns:
//   words:    the tidied words
//   problems: [{ lineNumber, text, problem }] for the lines left out
export function readWordList(text, completeForms) {
  const words = [];
  const problems = [];
  // Windows ends lines with \r\n; the \r is dropped along with other spaces.
  text.split('\n').forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (line === '') {
      return;
    }
    const isTsv = line.includes('\t');
    let fields = isTsv ? line.split('\t') : splitCsvLine(line);
    // One column of characters: read it as if it were written out twice.
    const oneScript = fields.length > 1 && tidyPinyin(fields[1].trim()) !== null;
    if (oneScript) {
      fields = [fields[0], ...fields];
    }
    let columns;
    if (isTsv) {
      const [simplified, traditional, pinyin, definition, pinyinTaiwan] = fields;
      columns = { simplified, traditional, pinyin, definition, pinyinTaiwan };
    } else {
      columns = columnsFromCsv(fields);
    }
    const result =
      columns.definition === undefined ? { problem: COLUMNS_HELP } : checkWord(columns);
    if (result.word && oneScript && completeForms) {
      Object.assign(result.word, completeForms(result.word.traditional, result.word.pinyin));
    }
    if (result.word) {
      words.push(result.word);
    } else {
      problems.push({ lineNumber: index + 1, text: line, problem: result.problem });
    }
  });
  return { words, problems };
}

// ---- Ready-made lists ----

// Reads a ready-made word list (data/wordlists/, built by
// scripts/build-word-lists.js): one word per line with the columns level,
// simplified, traditional, pinyin and, for the few words the dictionary does
// not have, a meaning. Where a level is divided into groups of words, a
// sixth column has the word's group: its number within the level and its
// name ("03 Education 教育"). Lines starting with # are comments.
//
// Returns [{ level, simplified, traditional, pinyin, meaning, group }], in
// the file's order; meaning is '' where the dictionary is to supply it, and
// group is '' for a word in no group.
export function parseReadyList(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '' && !line.startsWith('#'))
    .map((line) => {
      const [level, simplified, traditional, pinyin, meaning = '', group = ''] = line.trim().split('\t');
      return { level, simplified, traditional, pinyin, meaning, group };
    });
}

// The levels of a ready-made list, in the list's order, with how many of
// each level's words are new.
//
// entries:  from parseReadyList
// existing: the word records already stored
//
// Returns [{ level, count, newCount }].
export function levelsOfReadyList(entries, existing) {
  const known = new Set(existing.map((word) => word.id));
  const levels = new Map();
  for (const entry of entries) {
    const tally = levels.get(entry.level) || { level: entry.level, count: 0, newCount: 0 };
    tally.count += 1;
    tally.newCount += known.has(wordId(entry)) ? 0 : 1;
    levels.set(entry.level, tally);
  }
  return [...levels.values()];
}

// The ID of the deck for one level of a ready-made list ('hsk-3.0/1'), or,
// given a group as parseReadyList reads it, for that group inside the level
// ('tocfl/1/03 Education 教育'). A word from the list carries the ID of its
// group, or of its level if it is in no group, in its `decks` field (see
// decks.js).
export function listTag(listId, level, group = '') {
  return group === '' ? `${listId}/${level}` : `${listId}/${level}/${group}`;
}

// A word whose ID is about to change (its characters or pinyin were
// corrected) remembers the old one, so that another device's cards and
// reviews under the old ID can later be matched to it.
//
// word:    the corrected record, with its new ID
// oldWord: the record as stored
export function withFormerId(word, oldWord) {
  const formerIds = [...new Set([...(oldWord.formerIds || []), oldWord.id])].filter((id) => id !== word.id);
  return { ...word, formerIds };
}

// Works out which of `candidates` (tidied words) are new to the list.
//
// existing: the word records already stored
// now:      the time, as from Date.now()
//
// Returns:
//   toAdd:       complete records for the new words, queued after every
//                existing word, in the order given
//   alreadyHave: how many candidates were left out because the list (or an
//                earlier line) already has the same characters and pinyin
export function newWordRecords(candidates, existing, now) {
  const known = new Set(existing.map((word) => word.id));
  let order = existing.reduce((highest, word) => Math.max(highest, word.order), -1);
  const toAdd = [];
  let alreadyHave = 0;
  for (const word of candidates) {
    const id = wordId(word);
    if (known.has(id)) {
      alreadyHave += 1;
      continue;
    }
    known.add(id);
    order += 1;
    toAdd.push({ id, ...word, order, addedAt: now });
  }
  return { toAdd, alreadyHave };
}

// The words in the list that are written with the same characters as `word`,
// in either script. With the same pinyin too it would be the same word; with
// another reading it may be a different word (地方 dìfang and dìfāng) or the
// same one written down differently (péngyou and péngyǒu), which is worth
// pointing out before it is added.
export function wordsWithSameCharacters(word, words) {
  return words.filter(
    (other) => other.traditional === word.traditional || other.simplified === word.simplified,
  );
}

// A word's characters as shown in lists and messages: in the script being
// learned, or in both where they differ, the script of the word's cards first
// ("學習 · 学习").
//
// settings: the current settings; `script` and `bothScripts` are used
export function charactersShown(word, settings) {
  const script = scriptFor(word, settings);
  const { bothScripts } = settings;
  const other = script === 'traditional' ? 'simplified' : 'traditional';
  return bothScripts && word[other] !== word[script]
    ? `${word[script]} · ${word[other]}`
    : word[script];
}

// The `order` that puts a word ahead of every other word, so that it is the
// next new word to be introduced.
export function orderForStudyingNext(words) {
  return words.reduce((lowest, word) => Math.min(lowest, word.order), 0) - 1;
}

// True if the word matches what was typed in the search box: part of its
// characters in either script, of its meaning, or of its pinyin written with
// tone marks, with tone numbers or with neither.
export function matchesSearch(word, search) {
  const wanted = search.trim().toLowerCase();
  if (wanted === '') {
    return true;
  }
  const readings = `${word.pinyin} ${word.pinyinTaiwan || ''} ${word.pinyinAlso || ''}`.toLowerCase();
  const haystack = [
    word.traditional,
    word.simplified,
    word.definition.toLowerCase(),
    readings,
    readings.replace(/[1-5']/g, ''),
    formatPinyin(readings),
  ];
  return haystack.some((text) => text.includes(wanted));
}
