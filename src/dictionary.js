// Looking words up in the dictionary, to fill in the fields when a word is
// added in the Decks tab.
//
// The dictionary is data/cedict/dictionary.tsv, made from CC-CEDICT by
// scripts/build-dictionary.js; the format is described there. It is a big
// file (about 117,000 entries), so the app only fetches it when a word is
// about to be added (see wordsPanel.js).
//
// Plain calculation: no page and no fetching, so it can be tested on its own.

// How much of an entry is proposed as the word's meaning (the "Dictionary
// meanings" setting):
//   'first':    the first meaning only
//   'everyday': every meaning except those marked as belonging to a
//               specialist field
//   'all':      every meaning, exactly as the dictionary has it
export const MEANING_DETAILS = ['first', 'everyday', 'all'];
export const DEFAULT_MEANING_DETAIL = 'everyday';

// The labels CC-CEDICT puts in front of a meaning that is only used in one
// field, as in "(math.) connection". Other labels, such as "(coll.)",
// "(literary)" or "(Tw)", say how or where a word is used, not that the
// meaning is a specialist one.
const SPECIALIST_FIELDS = new Set([
  // mathematics, computing and engineering
  'math.', 'geometry', 'statistics', 'computing', 'computer', 'computer networking',
  'cybersecurity', 'cryptography', 'electronics', 'electricity', 'electrical',
  'telecommunications', 'telephony', 'engineering', 'mechanics',
  // the sciences
  'physics', 'molecular physics', 'optics', 'nuclear energy', 'chemistry', 'biochemistry',
  'biology', 'microbiology', 'genetics', 'botany', 'zoology', 'ornithology', 'entomology',
  'astronomy', 'geology', 'mineralogy', 'seismology', 'meteorology',
  // medicine
  'medicine', 'med.', 'medical', 'TCM', 'Chinese medicine', 'anatomy', 'physiology',
  'pharmacology', 'pharm.', 'immunology', 'epidemiology', 'dentistry', 'dental', 'psychology',
  // language
  'linguistics', 'grammar', 'phonetics', 'Chinese phonetics', 'semantics',
  // law and money
  'law', 'legal', 'finance', 'economics', 'accounting', 'commerce', 'business', 'insurance',
  'stock market',
  // trades and industries
  'military', 'aviation', 'rocketry', 'railway', 'automotive', 'mining', 'metallurgy',
  'manufacturing', 'agriculture', 'horticulture', 'textiles', 'printing', 'typography',
  'typesetting', 'publishing', 'photography', 'architecture',
  // the arts
  'music', 'theater', 'Chinese opera', 'cinema', 'filmmaking', 'calligraphy',
  // religion and philosophy
  'philosophy', 'religion', 'Buddhism', 'Buddhist', 'Daoism', 'Taoism', 'Catholicism',
  'Protestantism', 'Christianity', 'Islam', 'mythology', 'Chinese mythology', 'folk religion',
  'Chinese folk religion',
  // sports and games
  'sports', 'sport', 'ball sports', 'baseball', 'basketball', 'soccer', 'golf', 'gymnastics',
  'athletics', 'table tennis', 'weightlifting', 'diving', 'angling', 'martial arts', 'mahjong',
  'Chinese chess', 'gambling', 'gaming', 'video gaming', 'ACG',
]);

// Whether a meaning starts with a specialist label. A meaning can have
// several labels, "(Tw) (computing) ...", and a label several fields,
// "(math., physics) ...".
function isSpecialist(meaning) {
  const labels = meaning.match(/^(\([^)]*\) )+/);
  if (!labels) {
    return false;
  }
  return [...labels[0].matchAll(/\(([^)]*)\)/g)].some((label) =>
    label[1].split(', ').some((field) => SPECIALIST_FIELDS.has(field)),
  );
}

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

// The meaning proposed for the card, from an entry's list of meanings. It is
// only a proposal, to be edited.
//
// detail: one of MEANING_DETAILS
//
// For 聯絡, whose meanings are "to get in touch with", "to contact", "to stay
// in contact (with)", "liaison" and "(math.) connection":
//   'first':    "to get in touch with"
//   'everyday': "to get in touch with; to contact; to stay in contact (with); liaison"
//   'all':      the same with "; (math.) connection" at the end
export function proposeMeaning(meanings, detail = DEFAULT_MEANING_DETAIL) {
  if (detail === 'all') {
    return meanings.join('; ');
  }
  // A word that only has specialist meanings keeps them.
  const everyday = meanings.filter((meaning) => !isSpecialist(meaning));
  const kept = everyday.length > 0 ? everyday : meanings;
  return (detail === 'first' ? kept.slice(0, 1) : kept)
    // These labels are about grammar and style, and only clutter a card.
    .map((meaning) => meaning.replace(/^\((bound form|literary|coll\.|dialect)\) /, ''))
    .join('; ');
}

// Looks up a word by its characters in either script.
//
// dictionary: from readDictionary
//
// Returns a list of entries, empty if the word is not in the dictionary. A
// word with several readings has one entry for each:
//   { traditional, simplified, pinyin, meanings }
//   and pinyinTaiwan, if the dictionary notes a different Taiwan reading
// Names (pinyin with a capital, such as a surname) come last.
export function lookUp(dictionary, characters) {
  const entries = (dictionary.get(characters) || []).map(entryFromLine);
  // sort() keeps the file's order among entries that compare equal.
  return entries.sort((a, b) => Number(isName(a)) - Number(isName(b)));
}

// Takes one line of the file apart into an entry (see lookUp).
function entryFromLine(line) {
  const [traditional, simplified, pinyin, meanings, pinyinTaiwan] = line.split('\t');
  const entry = {
    traditional,
    simplified: simplified || traditional,
    pinyin,
    meanings: meanings.split('/'),
  };
  if (pinyinTaiwan) {
    entry.pinyinTaiwan = pinyinTaiwan;
  }
  return entry;
}

const isName = (entry) => /^[A-Z]/.test(entry.pinyin);

// ---------------------------------------------------------------------------
// Looking a word up by its pinyin, for a learner without a Chinese keyboard
// (2026-10-15: a beginner in testing could not add a word at all).

const TONE_MARKS = {
  ā: ['a', 1], á: ['a', 2], ǎ: ['a', 3], à: ['a', 4],
  ē: ['e', 1], é: ['e', 2], ě: ['e', 3], è: ['e', 4],
  ī: ['i', 1], í: ['i', 2], ǐ: ['i', 3], ì: ['i', 4],
  ō: ['o', 1], ó: ['o', 2], ǒ: ['o', 3], ò: ['o', 4],
  ū: ['u', 1], ú: ['u', 2], ǔ: ['u', 3], ù: ['u', 4],
  ǖ: ['v', 1], ǘ: ['v', 2], ǚ: ['v', 3], ǜ: ['v', 4],
};

// Reads pinyin as a learner types it: "nihao", "ni hao", "ni3hao3", "nǐhǎo",
// "lv4", "lü4", "lu:4", with tones on some syllables or none.
//
// Returns { letters, tones }, or null if the text is not pinyin (it has
// characters in it, or anything else but letters, tones and separators):
//   letters: the letters alone, in lowercase, with v for ü ("nihao")
//   tones:   [{ at, tone }], one for each tone typed: `at` is the position
//            in `letters` of a letter of the syllable the tone belongs to
//            (the last one for a tone number, the vowel for a tone mark),
//            since without the dictionary nobody can tell where a syllable
//            of "xian" ends. A neutral tone may be typed as 5 or 0.
export function readTypedPinyin(text) {
  let letters = '';
  const tones = [];
  for (const char of text.toLowerCase().replace(/u:/g, 'v')) {
    if (/[a-z]/.test(char)) {
      letters += char;
    } else if (char === 'ü') {
      letters += 'v';
    } else if (TONE_MARKS[char]) {
      letters += TONE_MARKS[char][0];
      tones.push({ at: letters.length - 1, tone: TONE_MARKS[char][1] });
    } else if (/[0-5]/.test(char) && letters !== '') {
      tones.push({ at: letters.length - 1, tone: Number(char) || 5 });
    } else if (!/[\s'’-]/.test(char)) {
      return null;
    }
  }
  return letters === '' ? null : { letters, tones };
}

// A reading as stored ("xi1'an1") taken apart: its letters ("xian") and
// where each syllable lies in them, with its tone.
function syllablesOf(pinyin) {
  let letters = '';
  const syllables = [];
  for (const [, syllable, tone] of pinyin.toLowerCase().matchAll(/([a-z]+)([1-5])/g)) {
    syllables.push({ start: letters.length, end: letters.length + syllable.length, tone: Number(tone) });
    letters += syllable;
  }
  return { letters, syllables };
}

// Whether a reading has every tone that was typed, each in its syllable.
function hasTones(pinyin, tones) {
  const { syllables } = syllablesOf(pinyin);
  return tones.every(({ at, tone }) =>
    syllables.some((syllable) => syllable.start <= at && at < syllable.end && syllable.tone === tone),
  );
}

// The dictionary's lines by their letters without tones, made the first time
// a word is looked up by its pinyin (which a learner who types characters
// never does), and kept with the dictionary.
//   keys:      every set of letters, sorted, to find those beginning with
//              what is typed quickly
//   byLetters: Map from letters to [{ line, order }], `order` being the
//              line's place in the file
const pinyinIndexes = new WeakMap();
function pinyinIndex(dictionary) {
  if (!pinyinIndexes.has(dictionary)) {
    const byLetters = new Map();
    // readDictionary files each line under both its forms; once is enough.
    const lines = new Set();
    for (const linesOfWord of dictionary.values()) {
      for (const line of linesOfWord) {
        lines.add(line);
      }
    }
    let order = 0;
    for (const line of lines) {
      const start = line.indexOf('\t', line.indexOf('\t') + 1) + 1;
      const letters = line
        .slice(start, line.indexOf('\t', start))
        .toLowerCase()
        .replace(/[1-5']/g, '');
      const sameLetters = byLetters.get(letters);
      if (sameLetters) {
        sameLetters.push({ line, order });
      } else {
        byLetters.set(letters, [{ line, order }]);
      }
      order += 1;
    }
    pinyinIndexes.set(dictionary, { keys: [...byLetters.keys()].sort(), byLetters });
  }
  return pinyinIndexes.get(dictionary);
}

// What the ready-made lists say of how common a word is, made once for a
// set of lists (see lookUpByPinyin) and kept with it.
//   rank:  Map from a word's ID (`traditional|pinyin`) to its place in the
//          lists, the first list's words first
//   count: Map from a character, in either script, to how many listed
//          words have it
const listFacts = new WeakMap();
function factsOf(listed) {
  if (!listFacts.has(listed)) {
    const rank = new Map();
    const count = new Map();
    for (const word of listed) {
      const id = `${word.traditional}|${word.pinyin}`;
      if (word.pinyin === '' || rank.has(id)) {
        continue;
      }
      rank.set(id, rank.size);
      for (const char of new Set([...word.traditional, ...word.simplified])) {
        count.set(char, (count.get(char) || 0) + 1);
      }
    }
    listFacts.set(listed, { rank, count });
  }
  return listFacts.get(listed);
}

// Prefix matches only from this many letters on: one letter begins ten
// thousand words, which is slow on a phone and helps nobody.
const MIN_LETTERS_FOR_BEGINNINGS = 2;

// Looks a word up by its pinyin, as typed (see readTypedPinyin).
//
// dictionary: from readDictionary
// listed:     the words of the ready-made lists, the list whose order counts
//             most first: [{ traditional, simplified, pinyin }]. The same
//             array each time, so what is worked out from it is kept.
//
// Returns the entries (as from lookUp) read that way, the likeliest first:
//   - words read exactly as typed, then words whose reading only begins
//     that way ("zhongg" finds 中國 before the word is typed out);
//   - where tones were typed, only words with those tones, unless none has
//     them (a learner may have the tone wrong);
//   - in each of those, words of the lists first, in the lists' order (是
//     before 柿 for "shi4");
//   - then names (a capital in the reading: 石 Shí the surname; a listed
//     one, such as 中國 Zhōngguó, keeps its place in the lists);
//   - then variants: a word in no list with the same reading and meanings as
//     one that comes before it (丗 for 世). CC-CEDICT's "variant of" entries
//     were given the meanings of the word they point to when the dictionary
//     was built (scripts/build-dictionary.js), which is how they are told. A
//     listed word is never one, so 辭典 (TOCFL) stays beside 詞典.
//   - the other words by their rarest character, those whose characters
//     are in many listed words first (义, in 意义 and 主义, before 㑊, in
//     none); then shorter first; then in the file's order.
// Empty if the text is not pinyin or nothing is read that way.
export function lookUpByPinyin(dictionary, text, listed = []) {
  const typed = readTypedPinyin(text);
  if (!typed) {
    return [];
  }
  const { keys, byLetters } = pinyinIndex(dictionary);
  const { rank, count } = factsOf(listed);
  // The first key that is not before the letters typed (a binary search):
  // the keys beginning with them follow it.
  let low = 0;
  let high = keys.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (keys[middle] < typed.letters) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  const beginnings = typed.letters.length >= MIN_LETTERS_FOR_BEGINNINGS;
  let found = [];
  for (let i = low; i < keys.length && keys[i].startsWith(typed.letters); i += 1) {
    const exact = keys[i] === typed.letters;
    if (!exact && !beginnings) {
      break;
    }
    for (const { line, order } of byLetters.get(keys[i])) {
      const entry = entryFromLine(line);
      found.push({
        entry,
        exact,
        order,
        rank: rank.get(`${entry.traditional}|${entry.pinyin}`) ?? Infinity,
        rarest: Math.min(...[...entry.traditional].map((char) => count.get(char) || 0)),
      });
    }
  }
  if (typed.tones.length > 0) {
    const withTones = found.filter(({ entry }) => hasTones(entry.pinyin, typed.tones));
    if (withTones.length > 0) {
      found = withTones;
    }
  }
  // Variants: the first word of each reading and meanings, listed words
  // first, is the word; any other not in a list is a variant.
  const byListThenFile = [...found].sort((a, b) => a.rank - b.rank || a.order - b.order);
  const seen = new Set();
  for (const item of byListThenFile) {
    const said = `${item.entry.pinyin}\t${item.entry.meanings.join('/')}`;
    item.variant = seen.has(said) && item.rank === Infinity;
    seen.add(said);
  }
  return found
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        a.rank - b.rank ||
        Number(isName(a.entry)) - Number(isName(b.entry)) ||
        Number(a.variant) - Number(b.variant) ||
        b.rarest - a.rarest ||
        a.entry.traditional.length - b.entry.traditional.length ||
        a.order - b.order,
    )
    .map(({ entry }) => entry);
}

// How a word is written in the other script, for someone who only types one.
//
// entries:    dictionary entries to look in (from lookUp)
// script:     'traditional' or 'simplified': the script `characters` is in
// characters: the word as typed
// pinyin:     its reading, tidied
//
// Several words can be written alike in one script and differently in the
// other (发 is both 發 fā and 髮 fà), so the entry with the same reading is
// used; failing that, the dictionary's answer if all its entries agree.
// Returns `characters` itself if the dictionary cannot tell.
export function otherScriptForm(entries, script, characters, pinyin) {
  const other = script === 'traditional' ? 'simplified' : 'traditional';
  const written = entries.filter((entry) => entry[script] === characters);
  const sameReading = written.find((entry) => entry.pinyin === pinyin);
  if (sameReading) {
    return sameReading[other];
  }
  const forms = new Set(written.map((entry) => entry[other]));
  return forms.size === 1 ? [...forms][0] : characters;
}
