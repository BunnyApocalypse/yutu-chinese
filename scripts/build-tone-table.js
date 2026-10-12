// Builds data/cedict/tones.json from the CC-CEDICT dictionary.
//
// Run by hand when the table should be refreshed:
//
//     node scripts/build-tone-table.js
//
// It downloads CC-CEDICT (about 4 MB) from mdbg.net. This is the only script
// in the project that uses the internet, and it is not part of `npm run dev`
// or `npm run build`. The app itself only ever reads the finished table.
//
// The table holds what the app needs to accept Taiwan and mainland tones:
//
//   taiwanWords: { "垃圾": "le4se4", ... }
//       words whose entry carries a "Taiwan pr." note, with that reading
//   regional:    { "期": [["qi1", "qi2"]], ... }
//       characters with a "Taiwan pr." note that differs only in tone:
//       pairs of [mainland reading, Taiwan reading]
//   readings:    { "友": ["you3"], ... }
//       every reading CC-CEDICT lists for each single character
//
// Pinyin is written as in the word lists: lowercase, tone numbers, "v" for ü.

import fs from 'node:fs';
import zlib from 'node:zlib';

const SOURCE = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const TARGET = 'data/cedict/tones.json';

// "Xing1 qi1" → ["xing1", "qi1"]; null if any part isn't a plain syllable
// (CC-CEDICT also has entries with Latin letters, digits and punctuation).
function syllablesOf(pinyin) {
  const parts = pinyin.toLowerCase().replaceAll('u:', 'v').split(' ');
  return parts.every((part) => /^[a-z]+[1-5]$/.test(part)) ? parts : null;
}

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`Could not download CC-CEDICT: ${response.status}`);
}
const text = zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');

const taiwanWords = {};
const regional = {};
const readings = {};
let date = 'unknown';

for (const line of text.split('\n')) {
  if (line.startsWith('#! date=')) {
    date = line.slice('#! date='.length).trim();
  }
  // An entry looks like:  學校 学校 [xue2 xiao4] /school/CL:所[suo3]/
  const match = line.match(/^(\S+) \S+ \[([^\]]+)\] \/(.*)\/\s*$/);
  if (!match) {
    continue;
  }
  const [, traditional, pinyin, definitions] = match;
  const syllables = syllablesOf(pinyin);
  const charCount = Array.from(traditional).length;
  if (!syllables || syllables.length !== charCount) {
    continue;
  }
  const taiwanNotes = [...definitions.matchAll(/Taiwan pr\. \[([^\]]+)\]/g)]
    .map((note) => syllablesOf(note[1]))
    .filter((noted) => noted && noted.length === charCount);

  if (charCount === 1) {
    const reading = syllables[0];
    readings[traditional] = [...new Set([...(readings[traditional] || []), reading])];
    for (const [noted] of taiwanNotes) {
      const sameLetters = noted.slice(0, -1) === reading.slice(0, -1);
      if (sameLetters && noted !== reading) {
        regional[traditional] = [...(regional[traditional] || []), [reading, noted]];
      }
    }
  } else if (taiwanNotes.length > 0 && !(traditional in taiwanWords)) {
    taiwanWords[traditional] = taiwanNotes.map((noted) => noted.join('')).join(', ');
  }
}

fs.mkdirSync('data/cedict', { recursive: true });
fs.writeFileSync(TARGET, JSON.stringify({ source: 'CC-CEDICT', date, taiwanWords, regional, readings }));
console.log(
  `Wrote ${TARGET} from CC-CEDICT dated ${date}: ` +
    `${Object.keys(taiwanWords).length} words with a Taiwan reading, ` +
    `${Object.keys(regional).length} characters with a regional tone variant, ` +
    `${Object.keys(readings).length} characters with readings.`,
);
