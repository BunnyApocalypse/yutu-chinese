// Checks every part change between the scripts (src/scriptKeys.js) against
// the whole dictionary and writes the verdicts the app reads,
// data/script-keys/part-keys.tsv (docs/cards.md, "Reading the other
// script", and checkPartKeys in src/scriptKeys.js for what the verdicts
// mean). Run it again after updating CC-CEDICT or Make Me a Hanzi.
//
//   node scripts/build-part-keys.js            writes the file, prints counts
//   node scripts/build-part-keys.js --list     also prints every key that
//                                              isn't 'everywhere'
//
// Characters: every one-character entry of CC-CEDICT (data/cedict/), those
// written alike in both scripts as well. How they are built: Make Me a
// Hanzi (data/makemeahanzi/).

import fs from 'node:fs';
import { parseCharacters } from '../src/characters.js';
import { checkPartKeys } from '../src/scriptKeys.js';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const characters = parseCharacters(read('data/makemeahanzi/dictionary.txt'));

// One-character entries, each pair once; the simplified column is empty
// when it is the same.
const pairs = [];
const seen = new Set();
const dictionary = read('data/cedict/dictionary.tsv');
const release = dictionary.split('\n')[0].replace(/^#\s*/, '');
for (const line of dictionary.split('\n')) {
  if (line.startsWith('#')) {
    continue;
  }
  const [traditional, simplified] = line.split('\t');
  const s = simplified || traditional;
  if (traditional && [...traditional].length === 1 && [...s].length === 1 && !seen.has(traditional + s)) {
    seen.add(traditional + s);
    pairs.push([traditional, s]);
  }
}

const checks = checkPartKeys(pairs, characters);
const examples = (list) => list.slice(0, 5).join(' ');
const lines = [
  '# The part changes between traditional and simplified, each checked against',
  `# every one-character entry of ${release} (${pairs.length}), built by Make Me a Hanzi.`,
  '# Written by scripts/build-part-keys.js; see data/script-keys/README.md.',
  '# key\tverdict\tfound\tkept\tchanged another way\texamples found\tkept\tchanged another way',
];
const sorted = [...checks].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
for (const [key, { verdict, found, kept, other }] of sorted) {
  lines.push([key, verdict, found.length, kept.length, other.length, examples(found), examples(kept), examples(other)].join('\t'));
}
fs.mkdirSync(new URL('data/script-keys/', root), { recursive: true });
fs.writeFileSync(new URL('data/script-keys/part-keys.tsv', root), `${lines.join('\n')}\n`);

const count = (verdict) => [...checks.values()].filter((check) => check.verdict === verdict).length;
console.log(`${pairs.length} one-character entries, ${checks.size} part keys checked:`);
console.log(`  everywhere ${count('everywhere')}, some ${count('some')}, once ${count('once')}`);
if (process.argv.includes('--list')) {
  for (const [key, { verdict, found, kept, other }] of sorted) {
    if (verdict !== 'everywhere') {
      console.log(`${verdict}\t${key}\tin ${examples(found)}\tkept ${kept.length}: ${examples(kept)}\tother ${other.length}: ${examples(other)}`);
    }
  }
}
