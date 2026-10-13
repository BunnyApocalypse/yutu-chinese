// Builds the ready-made word lists in data/wordlists/: the HSK lists from two
// openly licensed projects, and the TOCFL list from the file its own
// committee publishes. The Words tab offers these lists ("Add a ready-made
// list").
//
// Run by hand when the lists should be refreshed:
//
//     node scripts/build-word-lists.js
//
// Like the dictionary scripts it uses the internet and is not part of
// `npm run dev` or `npm run build`. Both sources are fetched at a fixed
// version, so a run gives the same result until the versions below are
// changed. (The TOCFL file has no versions; its name carries its date.) See
// the README in each folder of data/wordlists/ for the sources and licenses.
//
// Each list is one file with tabs between the columns:
//
//     level, simplified, traditional, pinyin, meaning
//
// Pinyin is written as in the app's word lists (see tidyPinyin in
// src/words.js). The meaning is left empty wherever the app's dictionary
// (data/cedict/dictionary.tsv) has the word with that reading, which is
// nearly always: the app then proposes a meaning from the dictionary, as it
// does for a word typed by hand. Lines starting with # are comments.

import fs from 'node:fs';
import zlib from 'node:zlib';

import { tidyPinyin, splitCsvLine } from '../src/words.js';
import { readDictionary, lookUp } from '../src/dictionary.js';

// HSK 3.0 (2021): https://github.com/ivankra/hsk30, MIT license.
const HSK3_VERSION = '4ff9e3915ce87baaecd7ebe263085573a4ea3192';
const HSK3_SOURCE = `https://raw.githubusercontent.com/ivankra/hsk30/${HSK3_VERSION}/hsk30-expanded.csv`;
// HSK 2.0 (2012): https://github.com/glxxyz/hskhsk.com, MIT license.
const HSK2_VERSION = '8a6f229c699e2fd7ac8708156c55c3afb2be7e1f';
const hsk2Source = (level) =>
  `https://raw.githubusercontent.com/glxxyz/hskhsk.com/${HSK2_VERSION}/data/lists/` +
  encodeURIComponent(`HSK Official With Definitions 2012 L${level}.txt`);

const FOLDER = 'data/wordlists/hsk';

// TOCFL (2023): the word list of Taiwan's Test of Chinese as a Foreign
// Language, as published by the test's steering committee.
const TOCFL_SOURCE = 'https://tocfl.edu.tw/assets/files/vocabulary/8000zhuyin_202307.zip';
const TOCFL_FOLDER = 'data/wordlists/tocfl';

async function download(address) {
  const response = await fetch(address);
  if (!response.ok) {
    throw new Error(`Could not download ${address}: ${response.status}`);
  }
  return response.text();
}

const dictionary = readDictionary(fs.readFileSync('data/cedict/dictionary.tsv', 'utf8'));
// True if the app's dictionary has this word with this reading.
const inDictionary = (traditional, pinyin) =>
  lookUp(dictionary, traditional).some(
    (entry) => entry.traditional === traditional && entry.pinyin === pinyin,
  );

// Writes one list. words: [{ level, simplified, traditional, pinyin, meaning }]
// and, for a word in a group inside its level, `group`: the group's number
// within the level and its name ("03 Education 教育"), which goes in a sixth
// column. A word listed twice (at two levels, or as two variants that come to
// the same thing) is kept at its first, lower level.
function writeList(file, title, source, words, folder = FOLDER) {
  const seen = new Set();
  const lines = [];
  for (const word of words) {
    const id = `${word.traditional}|${word.pinyin}`;
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const meaning = inDictionary(word.traditional, word.pinyin) ? '' : word.meaning || '';
    lines.push([word.level, word.simplified, word.traditional, word.pinyin, meaning, word.group || ''].join('\t').trimEnd());
  }
  fs.writeFileSync(`${folder}/${file}`, `# ${title}\n# Source: ${source}\n${lines.join('\n')}\n`);
  const noMeaning = words.filter((word) => !word.meaning && !inDictionary(word.traditional, word.pinyin));
  if (noMeaning.length > 0) {
    console.log(`  Without a meaning (add them to extra-meanings.tsv): ${noMeaning.map((word) => `${word.simplified} ${word.pinyin}`).join(', ')}`);
  }
  const own = lines.filter((line) => (line.split('\t')[4] || '') !== '').length;
  console.log(`Wrote ${folder}/${file}: ${lines.length} words, ${own} with a meaning of their own.`);
}

// ---- Groups inside a level ----
//
// The HSK lists are alphabetical inside each level, which is no order to
// learn words in. For the lower levels there is a file per level in
// data/wordlists/hsk/groups/ ("hsk-3.0-1.tsv") that sorts the level's words
// into small themed groups, in an order for learning: one word per line with
// the columns group number, group name, simplified, pinyin. These files were
// written for this project (see the README there), not taken from the HSK.

const GROUPS_FOLDER = `${FOLDER}/groups`;

// Returns `words` with those of each level that has a groups file put in
// that file's order and given their `group`. Levels keep their places in
// the list.
function withGroups(words, listId) {
  const result = [...words];
  for (const level of new Set(words.map((word) => word.level))) {
    const file = `${GROUPS_FOLDER}/${listId}-${level}.tsv`;
    if (!fs.existsSync(file)) {
      continue;
    }
    // Where each word comes in the file, and its group: "simplified pinyin" → { place, group }.
    const placed = new Map();
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (line.trim() === '' || line.startsWith('#')) {
        continue;
      }
      const [number, name, simplified, pinyin] = line.split('\t');
      placed.set(`${simplified} ${pinyin}`, { place: placed.size, group: `${number.padStart(2, '0')} ${name}` });
    }
    const keyOf = (word) => `${word.simplified} ${word.pinyin}`;
    const places = result.flatMap((word, index) => (word.level === level ? [index] : []));
    const missing = places.map((index) => result[index]).filter((word) => !placed.has(keyOf(word)));
    // A word the file lacks goes last, in no group. That is as it should be
    // for a word also listed at a lower level, which writeList leaves out
    // here; a test checks that no word that is written is without a group.
    if (missing.length > 0) {
      console.log(`  Not in ${file}: ${missing.map(keyOf).join(', ')}`);
    }
    const placeOf = (word) => placed.get(keyOf(word))?.place ?? Infinity;
    const inOrder = places
      .map((index) => result[index])
      // sort() keeps words with the same key (two traditional forms) as they were.
      .sort((a, b) => placeOf(a) - placeOf(b) || 0);
    places.forEach((index, position) => {
      result[index] = { ...inOrder[position], group: placed.get(keyOf(inOrder[position]))?.group };
    });
    console.log(`  ${listId} level ${level}: ${new Set([...placed.values()].map((entry) => entry.group)).size} groups`);
  }
  return result;
}

// ---- Matching a listed word to the dictionary ----

const withoutTones = (pinyin) => pinyin.toLowerCase().replace(/[1-5']/g, '');
const tones = (pinyin) => pinyin.replace(/[^1-5]/g, '');

// The candidate that fits a reading best: the same letters, and as many of
// the same tones as possible; among equals, the one written `traditional`
// if that is given, otherwise the first. With no reading to go by, the only
// candidate. Comparing letters alone also matches readings that differ in
// how they are written down: "wan2r5" and "wanr2", "Mei3yuan2" and "mei3yuan2".
function bestMatch(candidates, pinyin, traditional = null) {
  if (pinyin === null) {
    return candidates.length === 1 ? candidates[0] : null;
  }
  const sameLetters = candidates.filter(
    (candidate) => withoutTones(candidate.pinyin) === withoutTones(pinyin),
  );
  const agreement = (candidate) =>
    [...tones(candidate.pinyin)].filter((tone, index) => tone === tones(pinyin)[index]).length +
    (candidate.traditional === traditional ? 0.5 : 0);
  // sort() keeps the dictionary's order among candidates that fit equally.
  return sameLetters.sort((a, b) => agreement(b) - agreement(a))[0] || null;
}

// The dictionary's entries for a word written this way in simplified.
const dictionaryEntries = (simplified) =>
  lookUp(dictionary, simplified).filter((entry) => entry.simplified === simplified);



// ---- HSK 3.0 ----

// Readings and meanings for the few terms CC-CEDICT does not have.
const extra = new Map(
  fs
    .readFileSync(`${FOLDER}/extra-meanings.tsv`, 'utf8')
    .split('\n')
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((line) => line.split('\t'))
    .map(([simplified, pinyin, meaning, traditional]) => [simplified, { pinyin, meaning, traditional }]),
);

const hsk3 = [];
const hsk3LeftOut = [];
const [header, ...rows] = (await download(HSK3_SOURCE)).trim().split('\n').map(splitCsvLine);
const column = (row, name) => row[header.indexOf(name)].trim();
for (const row of rows) {
  // A row marked as an example only illustrates a prefix or suffix on the
  // list (第二 for 第); it is not itself a term.
  if (column(row, 'Example') !== '') {
    continue;
  }
  const simplified = column(row, 'Simplified');
  // The source names the matching CC-CEDICT entry as 愛好|爱好[ai4 hao4]:
  // that gives the traditional form and the reading in the dictionary's
  // own spelling.
  const key = column(row, 'CEDICT').match(/^([^|]+)\|[^[]+\[([^\]]+)\]$/);
  let word;
  if (key) {
    // The source was made from an older CC-CEDICT. Where today's dictionary
    // writes the entry differently (another traditional variant, a neutral
    // tone, an erhua reading), the word is taken as the dictionary has it
    // now, so that the app finds its meaning there.
    const now = bestMatch(dictionaryEntries(simplified), tidyPinyin(key[2]), key[1]);
    word = now
      ? { traditional: now.traditional, pinyin: now.pinyin }
      : { traditional: key[1], pinyin: tidyPinyin(key[2]), meaning: extra.get(simplified)?.meaning };
  } else if (extra.has(simplified)) {
    word = {
      traditional: column(row, 'Traditional').split('|')[0],
      pinyin: tidyPinyin(extra.get(simplified).pinyin),
      meaning: extra.get(simplified).meaning,
    };
  }
  if (!word || word.pinyin === null) {
    hsk3LeftOut.push(simplified);
    continue;
  }
  hsk3.push({ level: column(row, 'Level'), simplified, ...word });
}
writeList('hsk-3.0.tsv', 'HSK 3.0 (2021): levels 1 to 6 and 7-9', `ivankra/hsk30 at ${HSK3_VERSION}`, withGroups(hsk3, 'hsk-3.0'));
if (hsk3LeftOut.length > 0) {
  console.log(`  Left out, for want of a reading: ${hsk3LeftOut.join(' ')}`);
}

// ---- HSK 2.0 ----

// The source leaves the tone number off some neutral syllables ("bao1zi").
function withNeutralTones(reading) {
  return reading.trim().replace(/([a-z:]+)(?![a-z:]*[1-5])$/i, '$15');
}

// The source's own traditional forms and tones cannot be used as they are:
// the traditional column was converted character by character (后面 for
// 後面, 手表 for 手錶), and the pinyin has tones as they are spoken (yi4qi3)
// where dictionaries write them as they are listed (yi1qi3). So each word is
// matched to the same word in the HSK 3.0 list above or, failing that, in the
// dictionary, and takes its traditional form and reading from there. The
// source's reading decides between several candidates (长 cháng and zhǎng).
const hsk3BySimplified = new Map();
for (const word of hsk3) {
  hsk3BySimplified.set(word.simplified, [...(hsk3BySimplified.get(word.simplified) || []), word]);
}

const hsk2 = [];
const hsk2LeftOut = [];
let hsk2AsInSource = 0;
for (const level of [1, 2, 3, 4, 5, 6]) {
  // The files begin with a mark that says they are UTF-8; it is not text.
  const text = (await download(hsk2Source(level))).replace(/^\uFEFF/, '');
  for (const line of text.split('\n')) {
    const [simplified, traditional, numbered, , meaning] = line.trim().split('\t');
    if (!simplified || !numbered) {
      continue;
    }
    // A character with two readings ("chang2, zhang3") is two words.
    for (const reading of numbered.split(',')) {
      const pinyin = tidyPinyin(reading.trim()) ?? tidyPinyin(withNeutralTones(reading));
      const match =
        bestMatch(hsk3BySimplified.get(simplified) || [], pinyin) ||
        bestMatch(dictionaryEntries(simplified), pinyin);
      if (match) {
        hsk2.push({ level: String(level), simplified, traditional: match.traditional, pinyin: match.pinyin, meaning: match.meaning });
      } else if (extra.has(simplified)) {
        // In neither: written out by hand in extra-meanings.tsv.
        const own = extra.get(simplified);
        hsk2.push({ level: String(level), simplified, traditional: own.traditional, pinyin: tidyPinyin(own.pinyin), meaning: own.meaning });
      } else if (pinyin !== null) {
        // Not there either: taken as the source has it, with its meaning.
        hsk2AsInSource += 1;
        hsk2.push({ level: String(level), simplified, traditional, pinyin, meaning });
      } else {
        hsk2LeftOut.push(`${simplified} (${reading.trim()})`);
      }
    }
  }
}
writeList('hsk-2.0.tsv', 'HSK 2.0 (2012): levels 1 to 6', `glxxyz/hskhsk.com at ${HSK2_VERSION}`, withGroups(hsk2, 'hsk-2.0'));
if (hsk2AsInSource > 0) {
  console.log(`  ${hsk2AsInSource} taken as the source has them: add them to extra-meanings.tsv.`);
}
if (hsk2LeftOut.length > 0) {
  console.log(`  Left out, for want of a reading: ${hsk2LeftOut.join(' ')}`);
}

// ---- TOCFL ----
//
// The committee publishes the list as a spreadsheet inside a zip file: one
// sheet per level, each word in traditional characters with its pinyin in
// tone marks, and no simplified forms or meanings. Each word is matched to
// the dictionary for those, by its characters and reading.

// Reads a zip file (an .xlsx spreadsheet is one too) without any library.
// A zip ends with a table of contents; each entry there says where a file's
// data starts and how it is packed. Returns [{ name, read() }].
function filesInZip(buffer) {
  // The table's own position is in the last record of the file, which
  // starts with the bytes "PK" 5 6.
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buffer.readUInt16LE(end + 10);
  let at = buffer.readUInt32LE(end + 16);
  const files = [];
  for (let index = 0; index < count; index++) {
    const method = buffer.readUInt16LE(at + 10);
    const packedSize = buffer.readUInt32LE(at + 20);
    const nameLength = buffer.readUInt16LE(at + 28);
    const extraLength = buffer.readUInt16LE(at + 30);
    const commentLength = buffer.readUInt16LE(at + 32);
    const start = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    files.push({
      name,
      read() {
        // The file's own header comes first, with a name and extras of its own.
        const dataStart = start + 30 + buffer.readUInt16LE(start + 26) + buffer.readUInt16LE(start + 28);
        const packed = buffer.subarray(dataStart, dataStart + packedSize);
        // Method 8 is "deflate" compression; 0 is stored as it is.
        return method === 8 ? zlib.inflateRawSync(packed) : packed;
      },
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// Reads the sheets of a spreadsheet: [{ name, rows }], each row a list of the
// texts in its cells. An .xlsx file keeps every text once, in one shared
// list, and the cells refer to them by number.
function sheetsOf(xlsx) {
  const files = new Map(filesInZip(xlsx).map((file) => [file.name, file]));
  const xml = (name) => files.get(name).read().toString('utf8');
  const unescape = (text) =>
    text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const texts = [...xml('xl/sharedStrings.xml').matchAll(/<si>(.*?)<\/si>/gs)].map((item) =>
    unescape([...item[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((part) => part[1]).join('')),
  );
  // workbook.xml lists the sheets by name; its "rels" file says which file each is.
  const targets = new Map(
    [...xml('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*>/g)].map((tag) => [
      tag[0].match(/Id="([^"]+)"/)[1],
      tag[0].match(/Target="([^"]+)"/)[1],
    ]),
  );
  return [...xml('xl/workbook.xml').matchAll(/<sheet [^>]*>/g)].map((tag) => {
    const name = unescape(tag[0].match(/name="([^"]+)"/)[1]);
    const sheet = xml(`xl/${targets.get(tag[0].match(/r:id="([^"]+)"/)[1])}`);
    const rows = [...sheet.matchAll(/<row [^>]*>(.*?)<\/row>/gs)].map((row) =>
      [...row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)].map(([, , attributes, inside]) => {
        const value = (inside || '').match(/<v>([^<]*)<\/v>/);
        if (!value) {
          return '';
        }
        return attributes.includes('t="s"') ? texts[Number(value[1])] : value[1];
      }),
    );
    return { name, rows };
  });
}

// Pinyin with tone marks, as the list has it, taken apart for comparing with
// the dictionary's numbered pinyin: its letters alone ("xuexi"), and the
// tones of its marked syllables in order ("22"). Neutral syllables have no
// mark. The list uses ă, ĭ and ŏ in places for ǎ, ǐ and ǒ.
const TONE_OF_MARK = { '\u0304': '1', '\u0301': '2', '\u030c': '3', '\u0306': '3', '\u0300': '4' };
function markedPinyin(text) {
  // "NFD" writes each marked letter as the letter followed by its marks.
  const apart = text.normalize('NFD').toLowerCase();
  return {
    letters: apart
      .replace(/u\u0308/g, 'v')
      .replace(/[^a-z]/g, ''),
    tones: [...apart].map((character) => TONE_OF_MARK[character] || '').join(''),
  };
}

// The list writes several things into one cell:
//   你/妳  nĭ             two ways of writing a word
//   爸爸/爸  bàba/bà       two words, each with its reading
//   車(子)  chē(zi)       a word with an optional part: 車 and 車子
//   名字(˙ㄗ)  míngzi      a note in zhuyin on how a syllable is said
// This gives every form such a cell stands for: the alternatives, each with
// and without its optional part, without the notes.
function formsOf(cell) {
  return cell
    .replace(/\([˙ˊˇˋ\u3105-\u312f]+\)/g, '') // zhuyin notes
    .replace(/ɑ/g, 'a') // a letter the list sometimes uses for "a"
    .split('/')
    .map((form) => form.trim())
    .filter((form) => form !== '')
    .flatMap((form) =>
      /\(.*\)/.test(form) ? [form.replace(/\(.*?\)/g, ''), form.replace(/[()]/g, '')] : [form],
    );
}

// How well a dictionary entry fits one of the list's readings: -1 if its
// letters differ; otherwise higher the more of its tones agree. An entry's
// Taiwan reading counts as well as its main one (垃圾 is lèsè in the list).
function tocflFit(entry, pinyin) {
  const { letters, tones: listedTones } = markedPinyin(pinyin);
  const fits = [entry.pinyin, ...(entry.pinyinTaiwan ? entry.pinyinTaiwan.split(', ') : [])]
    .filter((reading) => withoutTones(reading) === letters)
    .map((reading) => {
      const full = tones(reading).replace(/5/g, '');
      return full === listedTones ? 100 : [...full].filter((tone, index) => tone === listedTones[index]).length;
    });
  return Math.max(-1, ...fits);
}

// The dictionary entry for a word of the list, given the readings its cell
// has, or null.
function tocflMatch(traditional, pinyins) {
  const candidates = lookUp(dictionary, traditional).filter((entry) => entry.traditional === traditional);
  const fit = (entry) => Math.max(...pinyins.map((pinyin) => tocflFit(entry, pinyin)));
  // Names (pinyin with a capital) come after other entries that fit as well.
  const isName = (entry) => /^[A-Z]/.test(entry.pinyin);
  const fitting = candidates
    .filter((entry) => fit(entry) >= 0)
    .sort((a, b) => fit(b) - fit(a) || Number(isName(a)) - Number(isName(b)));
  if (fitting.length > 0) {
    return fitting[0];
  }
  // No entry reads as the list does. Taiwan says some words differently from
  // any reading the dictionary has (血管 xiěguăn, 暫時 zhànshí), and the list
  // has slips of its own. A word of two or more characters that the
  // dictionary knows in exactly one way is that word all the same; a single
  // character with another reading is too uncertain.
  const words = candidates.filter((entry) => !isName(entry));
  return Array.from(traditional).length > 1 && words.length === 1 ? words[0] : null;
}

// The lower four levels sort their words under twelve topics ("contexts",
// 任務領域), the same in each. The app makes a deck of each topic inside its
// level, named in English (Claude's translation) and in the list's own words.
const TOCFL_TOPICS = {
  個人資料: 'Personal information',
  工作: 'Work',
  教育: 'Education',
  '房屋與家庭、環境': 'Home and surroundings',
  日常生活: 'Daily life',
  '閒暇時間、娛樂': 'Free time',
  與他人的關係: 'Other people',
  旅行: 'Travel',
  健康及身體照護: 'Health',
  購物: 'Shopping',
  飲食: 'Food and drink',
  其他: 'Other',
};

// The sheets that are levels, in order, and what the app calls each level.
const TOCFL_LEVELS = ['Novice 1', 'Novice 2', 'Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'];

const tocflZip = Buffer.from(await (await fetch(TOCFL_SOURCE)).arrayBuffer());
const tocflSheets = sheetsOf(filesInZip(tocflZip).find((file) => file.name.endsWith('.xlsx')).read());
const tocfl = [];
const tocflLeftOut = [];
for (const levelName of TOCFL_LEVELS) {
  const sheet = tocflSheets.find((candidate) => candidate.name.includes(`(${levelName})`));
  // The first row holds the captions. The lower levels have a column for the
  // topic in front of the word.
  const [captions, ...rows] = sheet.rows;
  const wordColumn = captions.findIndex((caption) => caption.includes('Vocabulary'));
  // The topics of this level, numbered in the order the sheet has them.
  const groups = new Map();
  for (const row of rows) {
    const listed = (row[wordColumn] || '').trim();
    const pinyin = (row[wordColumn + 1] || '').trim();
    if (listed === '' || pinyin === '') {
      continue;
    }
    const topic = wordColumn > 0 ? row[0].trim() : '';
    if (topic !== '' && !groups.has(topic)) {
      if (!TOCFL_TOPICS[topic]) {
        throw new Error(`TOCFL has a topic this script does not know: ${topic}`);
      }
      groups.set(topic, `${String(groups.size + 1).padStart(2, '0')} ${TOCFL_TOPICS[topic]} ${topic}`);
    }
    const pinyins = formsOf(pinyin);
    for (const traditional of formsOf(listed)) {
      const match = tocflMatch(traditional, pinyins);
      if (match) {
        tocfl.push({
          // "Level 3" is level "3"; the two before level 1 keep their names.
          level: levelName.replace('Level ', ''),
          simplified: match.simplified,
          traditional,
          pinyin: match.pinyin,
          group: groups.get(topic),
        });
      } else {
        tocflLeftOut.push(`${traditional} ${pinyin}`);
      }
    }
  }
}
fs.mkdirSync(TOCFL_FOLDER, { recursive: true });
writeList('tocfl.tsv', 'TOCFL (2023): Novice 1 and 2, levels 1 to 5', TOCFL_SOURCE, tocfl, TOCFL_FOLDER);
console.log(`  ${tocflLeftOut.length} left out, not being in the dictionary with that reading: ${tocflLeftOut.join(', ')}`);
