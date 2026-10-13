// Builds data/cedict/dictionary.tsv from the CC-CEDICT dictionary: the file
// the Words tab looks words up in when one is being added.
//
// Run by hand when the dictionary should be refreshed:
//
//     node scripts/build-dictionary.js
//
// Like build-tone-table.js it downloads CC-CEDICT (about 4 MB) from mdbg.net,
// and is not part of `npm run dev` or `npm run build`. The app itself only
// ever reads the finished file.
//
// The result has one entry per line, in CC-CEDICT's own order, with tabs
// between the columns:
//
//     traditional, simplified (empty if the same), pinyin, meanings, Taiwan reading
//
// Pinyin is written as in the word lists (see tidyPinyin in src/words.js).
// The meanings are separated by slashes, as in CC-CEDICT, with the parts
// that are no use on a flash card taken out (see cleanMeanings below). The
// Taiwan reading comes from the entry's "Taiwan pr." note and is usually empty.
// The first line is a comment giving the CC-CEDICT release.

import fs from 'node:fs';
import zlib from 'node:zlib';

import { tidyPinyin } from '../src/words.js';

const SOURCE = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
const TARGET = 'data/cedict/dictionary.tsv';

// Meanings that say nothing about what the word means: measure words, notes
// on pronunciation and spelling, and pointers to other entries.
const NOT_A_MEANING = [
  /^CL:/,
  /^Taiwan pr\./,
  /^also pr\./,
  /^(also|sometimes) written/,
  /^(old |archaic |Japanese |erhua |dialectal |ancient )?variant of/,
  /^see (also )?[^a-z]/,
];

// CC-CEDICT refers to other words as 學習|学习[xue2 xi2]. On a card the
// traditional form alone is enough.
function cleanMeanings(definitions) {
  return definitions
    .split('/')
    .map((meaning) =>
      meaning
        // A note on pronunciation inside a meaning: "conduct (Taiwan pr. [xing4])"
        .replace(/\s*\((?:Taiwan|also) pr\. \[[^\]]*\]\)/g, '')
        // The Taiwanese reading in "(from Taiwanese 烘, Tai-lo pr. [hang])"
        .replace(/,? ?Tai-lo pr\. \[[^\]]*\]/g, '')
        .replace(/([^\s|[\]]+)\|[^\s|[\]]+/g, '$1') // 學習|学习 → 學習
        .replace(/\[[^\]]*\]/g, '') // [xue2 xi2]
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((meaning) => meaning !== '' && !NOT_A_MEANING.some((pattern) => pattern.test(meaning)));
}

const response = await fetch(SOURCE);
if (!response.ok) {
  throw new Error(`Could not download CC-CEDICT: ${response.status}`);
}
const text = zlib.gunzipSync(Buffer.from(await response.arrayBuffer())).toString('utf8');

let date = 'unknown';
const lines = [];
let leftOut = 0;

for (const line of text.split('\n')) {
  if (line.startsWith('#! date=')) {
    date = line.slice('#! date='.length).trim();
  }
  // An entry looks like:  學校 学校 [xue2 xiao4] /school/CL:所[suo3]/
  const match = line.match(/^(\S+) (\S+) \[([^\]]+)\] \/(.*)\/\s*$/);
  if (!match) {
    continue;
  }
  const [, traditional, simplified, rawPinyin, definitions] = match;
  // tidyPinyin refuses readings with anything but syllables in them
  // (CC-CEDICT also has entries with Latin letters, digits and punctuation).
  const pinyin = tidyPinyin(rawPinyin);
  const meanings = cleanMeanings(definitions);
  if (pinyin === null || pinyin.includes(',') || meanings.length === 0 || /[|#]/.test(traditional)) {
    leftOut += 1;
    continue;
  }
  const taiwan = [...definitions.matchAll(/Taiwan pr\. \[([^\]]+)\]/g)]
    .map((note) => tidyPinyin(note[1]))
    .filter((reading) => reading !== null && reading !== pinyin)
    .join(', ');
  lines.push(
    [traditional, simplified === traditional ? '' : simplified, pinyin, meanings.join('/'), taiwan]
      .join('\t')
      .trimEnd(),
  );
}

fs.mkdirSync('data/cedict', { recursive: true });
fs.writeFileSync(TARGET, `# CC-CEDICT ${date}\n${lines.join('\n')}\n`);
console.log(`Wrote ${TARGET} from CC-CEDICT dated ${date}: ${lines.length} entries, ${leftOut} left out.`);
