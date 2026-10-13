// Looking words up in the dictionary, to fill in the fields when a word is
// added in the Words tab.
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
  const entries = (dictionary.get(characters) || []).map((line) => {
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
  });
  const isName = (entry) => /^[A-Z]/.test(entry.pinyin);
  // sort() keeps the file's order among entries that compare equal.
  return entries.sort((a, b) => Number(isName(a)) - Number(isName(b)));
}
