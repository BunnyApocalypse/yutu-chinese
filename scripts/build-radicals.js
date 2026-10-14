// Builds the ready-made deck of radicals (部首), data/wordlists/radicals/
// radicals.tsv, in the same format as the HSK and TOCFL lists, so that the
// Decks tab offers it in the same way.
//
// Run by hand when it should be rebuilt:
//
//     node scripts/build-radicals.js
//
// It reads:
//   - the 214 Kangxi radicals and their simplified forms from Unicode's
//     CJKRadicals.txt (downloaded once into local/word-list-sources/, like
//     the word lists' sources),
//   - which radical each character has, from Make Me a Hanzi
//     (data/makemeahanzi/dictionary.txt),
//   - the characters of the HSK and TOCFL lists (data/wordlists/), and
//   - the meanings of radicals that are not words, written by hand
//     (data/wordlists/radicals/meanings.tsv).
//
// The radicals are ranked by how many characters of the HSK and TOCFL lists
// they are the radical of, counting all their forms (氵 for 水). Those with
// at least COMMON_MIN characters are the level "Common", the rest
// "Uncommon"; each level is in that order, most useful first.
//
// What each radical becomes (the owner's choices, 2026-10-14):
//   - A radical that is itself a word of the lists, written the same way
//     (水, 口, 馬/马), is that word: the same item, with the same ID, as when
//     the word comes from the HSK or TOCFL list. It has a reading, and the
//     app gives it the meaning from the dictionary.
//   - Any other form is a radical of its own (氵, 扌, 糹/纟), with no reading;
//     the app makes it a record of kind 'radical' (src/radicals.js), with
//     meaning and writing cards only. Its meaning comes from meanings.tsv.
//   - A common radical brings each of its forms that is the radical of at
//     least FORM_MIN characters (心 and 忄; 火 and 灬), and its main form
//     if that is a word (手 besides 扌). An uncommon one brings its main form.

import fs from 'node:fs';

const UNICODE_SOURCE = 'https://www.unicode.org/Public/16.0.0/ucd/CJKRadicals.txt';
const SOURCES = 'local/word-list-sources';
const FOLDER = 'data/wordlists/radicals';
const COMMON_MIN = 10;
const FORM_MIN = 3;

// Forms of radicals that Make Me a Hanzi names as a character's radical but
// that Unicode's table does not list, with their Kangxi numbers. 阝 is two
// radicals in the Kangxi system (阜 on the left, 邑 on the right), but Make
// Me a Hanzi does not tell them apart; it is counted under 阜.
const VARIANTS = {
  扌: 64, 氵: 85, 氺: 85, 亻: 9, 艹: 140, 辶: 162, '⺼': 130, 糹: 120, 忄: 61, '⺗': 61, 阝: 170,
  釒: 167, '⺮': 118, 刂: 18, 刁: 18, 犭: 94, 攵: 66, 飠: 184, 王: 96, 灬: 86, 炏: 86, 衤: 145,
  礻: 113, 罒: 122, '⺳': 122, 户: 63, 丷: 12, 乚: 5, 乛: 5, 爫: 87, '⺌': 42, 青: 174, 母: 80,
  虎: 141, 耂: 125, 覀: 146, 西: 146, '⺊': 25, 民: 83, '㔾': 26, 巳: 49, 肀: 129, 川: 47,
  '⺀': 15, 彑: 58, 旡: 71, 兀: 43,
};

// Radicals whose Kangxi form is an old shape, by number: the shape written
// today, traditional and simplified.
const MAIN_FORMS = { 174: ['青', '青'], 146: ['覀', '覀'], 63: ['戶', '户'] };

// Side forms that differ between the scripts and are one item: the
// traditional form, then the simplified one.
const SIDE_PAIRS = { 糹: '纟', 釒: '钅', 飠: '饣' };
const simplifiedSide = new Set(Object.values(SIDE_PAIRS));

async function unicodeRadicals() {
  const kept = `${SOURCES}/CJKRadicals.txt`;
  if (!fs.existsSync(kept)) {
    console.log(`Downloading ${UNICODE_SOURCE}`);
    const response = await fetch(UNICODE_SOURCE);
    if (!response.ok) {
      throw new Error(`Could not download ${UNICODE_SOURCE}: ${response.status}`);
    }
    fs.mkdirSync(SOURCES, { recursive: true });
    fs.writeFileSync(kept, await response.text());
  }
  // Lines like "85; 2F54; 6C34" (number, Kangxi radical, the character) and
  // "120'; 2EB0; 7E9F" (a primed number: the simplified form).
  const main = new Map();
  const simplified = new Map();
  const numberOf = new Map(Object.entries(VARIANTS));
  for (const line of fs.readFileSync(kept, 'utf8').split('\n')) {
    const found = line.match(/^(\d+)('*); [0-9A-F]*; ([0-9A-F]+)/);
    if (!found) {
      continue;
    }
    const [, number, primes, code] = found;
    const char = String.fromCodePoint(parseInt(code, 16));
    numberOf.set(char, Number(number));
    if (primes === '') {
      main.set(Number(number), char);
    } else if (primes === "'") {
      simplified.set(Number(number), char);
    }
  }
  return { main, simplified, numberOf };
}

// The one-character words of the lists, by their traditional form:
// [{ traditional, simplified, pinyin }], every reading.
function listWords() {
  const words = new Map();
  for (const file of ['hsk/hsk-3.0.tsv', 'hsk/hsk-2.0.tsv', 'tocfl/tocfl.tsv']) {
    for (const line of fs.readFileSync(`data/wordlists/${file}`, 'utf8').split('\n')) {
      const [, simplified, traditional, pinyin] = line.split('\t');
      if (line.startsWith('#') || !pinyin || [...traditional].length !== 1) {
        continue;
      }
      const readings = words.get(traditional) || [];
      if (!readings.some((word) => word.simplified === simplified && word.pinyin === pinyin)) {
        readings.push({ traditional, simplified, pinyin });
      }
      words.set(traditional, readings);
    }
  }
  return words;
}

function listCharacters() {
  const chars = new Set();
  for (const file of ['hsk/hsk-3.0.tsv', 'hsk/hsk-2.0.tsv', 'tocfl/tocfl.tsv']) {
    for (const line of fs.readFileSync(`data/wordlists/${file}`, 'utf8').split('\n')) {
      const [, simplified = '', traditional = ''] = line.split('\t');
      if (!line.startsWith('#')) {
        for (const char of [...simplified, ...traditional]) {
          chars.add(char);
        }
      }
    }
  }
  return chars;
}

function readMeanings() {
  const meanings = new Map();
  for (const line of fs.readFileSync(`${FOLDER}/meanings.tsv`, 'utf8').split('\n')) {
    const [form, meaning] = line.split('\t');
    if (!line.startsWith('#') && meaning) {
      meanings.set(form, meaning.trim());
    }
  }
  return meanings;
}

const { main, simplified, numberOf } = await unicodeRadicals();
const words = listWords();
const meanings = readMeanings();

// How many list characters each radical, and each of its forms, is the
// radical of.
const radicalOf = new Map();
for (const line of fs.readFileSync('data/makemeahanzi/dictionary.txt', 'utf8').split('\n')) {
  if (line) {
    const { character, radical } = JSON.parse(line);
    radicalOf.set(character, radical);
  }
}
const counts = new Map(); // number → { total, forms: Map(form → count) }
for (const char of listCharacters()) {
  const form = radicalOf.get(char);
  const number = numberOf.get(form);
  if (number === undefined) {
    continue;
  }
  const tally = counts.get(number) || { total: 0, forms: new Map() };
  tally.total += 1;
  tally.forms.set(form, (tally.forms.get(form) || 0) + 1);
  counts.set(number, tally);
}

// The word that a form is, if the lists have it written that way in both
// scripts, with a full tone.
function wordFor(traditional, simplifiedForm) {
  const readings = (words.get(traditional) || []).filter((word) => word.simplified === simplifiedForm);
  // Only a neutral reading (子 zi, the suffix) is another word than the radical.
  return readings.find((word) => !word.pinyin.endsWith('5')) || null;
}

const lines = [];
const missing = [];
const ranked = [...main.keys()].sort(
  (a, b) => (counts.get(b)?.total || 0) - (counts.get(a)?.total || 0) || a - b,
);
for (const number of ranked) {
  const { total = 0, forms = new Map() } = counts.get(number) || {};
  const level = total >= COMMON_MIN ? 'Common' : 'Uncommon';
  const mainForm = MAIN_FORMS[number]?.[0] || main.get(number);
  const items = []; // [traditional, simplified]
  // The main form, with its simplified form unless that belongs to a side
  // form of the radical's (纟 goes with 糹, not with 糸).
  const mainSimplified = MAIN_FORMS[number] ? MAIN_FORMS[number][1] : simplified.has(number) && !simplifiedSide.has(simplified.get(number)) ? simplified.get(number) : mainForm;
  if (level === 'Uncommon' || wordFor(mainForm, mainSimplified) || (forms.get(mainForm) || 0) >= FORM_MIN || (forms.get(mainSimplified) || 0) >= FORM_MIN) {
    items.push([mainForm, mainSimplified]);
  }
  if (level === 'Common') {
    const others = [...forms]
      .filter(([form, count]) => count >= FORM_MIN && form !== mainForm && form !== mainSimplified && !simplifiedSide.has(form))
      .sort((a, b) => b[1] - a[1]);
    for (const [form] of others) {
      items.push([form, SIDE_PAIRS[form] || form]);
    }
    if (items.length === 0) {
      items.push([mainForm, mainSimplified]);
    }
  }
  for (const [traditional, simplifiedForm] of items) {
    const word = wordFor(traditional, simplifiedForm);
    if (word) {
      lines.push([level, word.simplified, word.traditional, word.pinyin, ''].join('\t'));
    } else {
      if (!meanings.has(traditional)) {
        missing.push(`${traditional}\t${number}`);
      }
      lines.push([level, simplifiedForm, traditional, '', meanings.get(traditional) || ''].join('\t'));
    }
  }
}

if (missing.length > 0) {
  console.log(`No meaning in ${FOLDER}/meanings.tsv for (form, Kangxi number):\n${missing.join('\n')}`);
  process.exit(1);
}

const header = [
  '# The 214 Kangxi radicals (部首), in two levels: Common, the radicals of at least',
  `# ${COMMON_MIN} characters of the HSK and TOCFL lists, and Uncommon, the rest; each most`,
  '# useful first. Built by scripts/build-radicals.js; see the README in this folder.',
  '# Columns: level, simplified, traditional, reading, meaning. A radical that is a word',
  '# has its reading and takes its meaning from the dictionary; one with no reading is',
  '# a radical only (src/radicals.js) and has its meaning here.',
];
fs.writeFileSync(`${FOLDER}/radicals.tsv`, `${[...header, ...lines].join('\n')}\n`);
const common = lines.filter((line) => line.startsWith('Common')).length;
console.log(`Wrote ${lines.length} items: ${common} common, ${lines.length - common} uncommon.`);
