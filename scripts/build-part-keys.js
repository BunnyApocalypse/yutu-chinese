// Checks every part change between the scripts (src/scriptKeys.js) against
// the whole dictionary and writes the verdicts the app reads,
// data/script-keys/part-keys.tsv (docs/cards.md, "Reading the other
// script", and checkPartKeys in src/scriptKeys.js for what the verdicts
// mean). Run it again after updating CC-CEDICT, Make Me a Hanzi or the
// character sets.
//
//   node scripts/build-part-keys.js            writes the file, prints counts
//   node scripts/build-part-keys.js --list     also prints every key that
//                                              isn't 'everywhere' both ways
//
// Characters: every one-character entry of CC-CEDICT (data/cedict/), those
// written alike in both scripts as well, whose traditional form is one of
// Taiwan's standard ones; only those in common use count against a change
// (data/unihan/, partKeyPairs below). How they are built: Make Me a Hanzi
// (data/makemeahanzi/).

import fs from 'node:fs';
import { parseCharacters } from '../src/characters.js';
import { checkPartKeys } from '../src/scriptKeys.js';
import { partKeyPairs } from './partKeyPairs.js';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const characters = parseCharacters(read('data/makemeahanzi/dictionary.txt'));
const { pairs, isCommon, isTaiwanForm, release, setsVersion } = partKeyPairs(read);

const checks = checkPartKeys(pairs, characters, { isCommon, isTaiwanForm });
const examples = (list) => list.slice(0, 5).join(' ');
const lines = [
  '# The part changes between traditional and simplified, each checked against every',
  `# one-character entry of ${release} in Taiwan's standard forms (${pairs.length}),`,
  `# built by Make Me a Hanzi; ${setsVersion}. Written by scripts/build-part-keys.js;`,
  '# see data/script-keys/README.md.',
  '# key\tin simplified\tin traditional\tfound\tkept or changed another way: in simplified\tin traditional\texamples found\tagainst, in simplified\tin traditional',
];
const sorted = [...checks].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
for (const [key, { found, simplified, traditional }] of sorted) {
  const against = (claim) => [...claim.kept, ...claim.other];
  lines.push(
    [
      key,
      simplified.verdict,
      traditional.verdict,
      found.length,
      against(simplified).length,
      against(traditional).length,
      examples(found),
      examples(against(simplified)),
      examples(against(traditional)),
    ].join('\t'),
  );
}
fs.mkdirSync(new URL('data/script-keys/', root), { recursive: true });
fs.writeFileSync(new URL('data/script-keys/part-keys.tsv', root), `${lines.join('\n')}\n`);

const count = (script, verdict) => [...checks.values()].filter((check) => check[script].verdict === verdict).length;
console.log(`${pairs.length} one-character entries, ${checks.size} part keys checked:`);
for (const script of ['simplified', 'traditional']) {
  console.log(
    `  in ${script}: everywhere ${count(script, 'everywhere')}, some ${count(script, 'some')}, once ${count(script, 'once')}`,
  );
}
if (process.argv.includes('--list')) {
  for (const [key, { found, simplified, traditional }] of sorted) {
    if (simplified.verdict !== 'everywhere' || traditional.verdict !== 'everywhere') {
      console.log(
        `${key}\t${simplified.verdict}/${traditional.verdict}\tin ${examples(found)}\t` +
          `simplified: ${examples([...simplified.kept, ...simplified.other])}\t` +
          `traditional: ${examples([...traditional.kept, ...traditional.other])}`,
      );
    }
  }
}
