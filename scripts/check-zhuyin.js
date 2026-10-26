// Checks the app's zhuyin (src/zhuyin.js) against Wiktionary, which gives
// most characters and words in both pinyin and zhuyin, written by its own
// editors: an independent source for every spelling and for where the
// tone marks go (docs/words.md, "Zhuyin").
//
// For each pair, Wiktionary's zhuyin is read back into pinyin with the
// app's own table, syllable by syllable, and must give Wiktionary's pinyin:
// the same letters and the same tones. Any pair that doesn't is printed.
// Then every syllable of the app's dictionary must have a zhuyin spelling.
//
// For development only. Needs local/wiktionary/ (local/README.md says how to
// fetch it). Run with: node scripts/check-zhuyin.js

import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { syllableZhuyin, toZhuyin } from '../src/zhuyin.js';
import { SYLLABLES } from '../src/pinyinSyllables.js';
import { readTypedPinyin } from '../src/dictionary.js';

const SOURCE = 'local/wiktionary/kaikki.org-dictionary-Chinese.jsonl.gz';
const CEDICT = 'data/cedict/dictionary.tsv';

if (!fs.existsSync(SOURCE)) {
  console.error(`${SOURCE} is not there. local/README.md says how to fetch it.`);
  process.exit(1);
}

// Every zhuyin spelling the app makes, back to the pinyin letters it makes
// it from (some have two: ㄦ is er, or the r of 一點兒).
const back = new Map();
for (const letters of SYLLABLES) {
  const symbols = syllableZhuyin(letters);
  if (symbols === null) {
    console.log(`No zhuyin for the syllable ${letters}`);
    continue;
  }
  if (!back.has(symbols)) {
    back.set(symbols, new Set());
  }
  // lue and nue are the same syllables as lve and nve.
  back.get(symbols).add(letters.replace(/^([ln])ue$/, '$1ve'));
}
// The ㄦ joined to a syllable, for the r of a word said with an r (筷兒
// ㄎㄨㄞˋㄦ, kuàir).
const JOINED_R = 'ㄦ+';
back.set(JOINED_R, new Set(['r']));

const TONES = { 'ˊ': 2, 'ˇ': 3, 'ˋ': 4 };

// One zhuyin syllable, such as ˙ㄇㄚ or ㄒㄩㄝˊ: its symbols and tone.
function apart(syllable) {
  if (syllable.startsWith('˙')) {
    return { symbols: syllable.slice(1), tone: 5 };
  }
  const tone = TONES[syllable.at(-1)];
  return tone ? { symbols: syllable.slice(0, -1), tone } : { symbols: syllable, tone: 1 };
}

// Whether `letters` can be made of the syllables' spellings, in order.
function spells(letters, syllables, from = 0, index = 0) {
  if (index === syllables.length) {
    return from === letters.length;
  }
  for (const candidate of back.get(syllables[index]) ?? []) {
    if (letters.startsWith(candidate, from) && spells(letters, syllables, from + candidate.length, index + 1)) {
      return true;
    }
  }
  return false;
}

// Whether Wiktionary's zhuyin reads back as its pinyin, or why not.
function problemWith(pinyin, zhuyin) {
  const typed = readTypedPinyin(pinyin);
  if (!typed) {
    return null; // not plain pinyin (a note in it); not a check of the table
  }
  const syllables = zhuyin
    .split(/\s+/)
    .flatMap((syllable) =>
      syllable.replace('˙', '').length > 1 && syllable.endsWith('ㄦ')
        ? [apart(syllable.slice(0, -1)), { symbols: JOINED_R, tone: 5 }]
        : [apart(syllable)],
    );
  const unknown = syllables.find((syllable) => !back.has(syllable.symbols));
  if (unknown) {
    // Some readings in Wiktionary are of syllables Mandarin has only in a
    // few old or regional words (崖 yái, 淚 luì), which CC-CEDICT, and so
    // the app, never has.
    return `no syllable of the app's is spelled ${unknown.symbols}`;
  }
  if (!spells(typed.letters.replace(/u:/g, 'v'), syllables.map((syllable) => syllable.symbols))) {
    return 'the letters differ';
  }
  // Pinyin marks every tone but the neutral one, in order.
  const marked = syllables.map((syllable) => syllable.tone).filter((tone) => tone !== 5);
  if (marked.join() !== typed.tones.map((tone) => tone.tone).join()) {
    return 'the tones differ';
  }
  return null;
}

const lines = readline.createInterface({ input: fs.createReadStream(SOURCE).pipe(zlib.createGunzip()) });
let pairs = 0;
const problems = new Map();
const seen = new Set();
for await (const line of lines) {
  if (!line.includes('"Bopomofo"')) {
    continue;
  }
  const entry = JSON.parse(line);
  const standard = (kind) =>
    (entry.sounds || [])
      .filter((sound) => sound.zh_pron && ['Mandarin', 'Standard', kind].every((tag) => sound.tags?.includes(tag)))
      // "xiáo (xue², xiao²)": the part in brackets is another way of writing it.
      .map((sound) => sound.zh_pron.replace(/\s*\(.*\)\s*$/, '').trim());
  const pinyins = standard('Pinyin');
  const zhuyins = standard('Bopomofo');
  // Paired by place, so only where there are as many of each.
  if (pinyins.length !== zhuyins.length) {
    continue;
  }
  pinyins.forEach((pinyin, index) => {
    const key = `${pinyin}\t${zhuyins[index]}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    pairs++;
    const problem = problemWith(pinyin, zhuyins[index]);
    if (problem) {
      problems.set(key, `${entry.word}\t${key}\t${problem}`);
    }
  });
}
console.log(`${pairs} different pairs of pinyin and zhuyin in Wiktionary; ${problems.size} don't read back:`);
for (const problem of problems.values()) {
  console.log(problem);
}

// Every reading in the app's dictionary: what is left in Latin letters
// once it is in zhuyin, which should be only the letters of words such as
// A圈兒 (Aquan1r5, "A ㄑㄩㄢㄦ") and CC-CEDICT's xx5 for a character it has
// no reading for.
const leftInLetters = new Map();
for (const line of fs.readFileSync(CEDICT, 'utf8').split('\n')) {
  const reading = line.split('\t')[2];
  if (!reading || line.startsWith('#')) {
    continue;
  }
  for (const letters of toZhuyin(reading).match(/[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+/g) || []) {
    leftInLetters.set(letters, (leftInLetters.get(letters) || 0) + 1);
  }
}
console.log(`Left in letters in CC-CEDICT's readings: ${[...leftInLetters].map(([letters, count]) => `${letters} ${count}`).join(', ')}`);
console.log(`For a look: 學校 ${toZhuyin('xue2xiao4')}, 媽媽 ${toZhuyin('ma1ma5')}, 一下兒 ${toZhuyin('yi1xia4r5')}, 兒 ${toZhuyin('r5')}`);
