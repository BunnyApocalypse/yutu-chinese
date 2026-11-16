// Stroke-order audit, step 1: compare our stroke order with the mainland standard.
//
// zispace's table (local/stroke-sources/zispace-chars.tsv, from GF 0023-2020; see
// local/README.md) gives, for each of 8,105 characters, its strokes in standard order as
// five classes: 1 level (横, incl. rising 提), 2 down (竖, incl. hooked 竖钩), 3 down-left
// (撇), 4 dot or down-right (点, 捺), 5 anything with a turn (折).
//
// This script puts each of OUR strokes into the same five classes (from its median line)
// and compares the sequences. A character whose sequences differ is a CANDIDATE: our data
// may be in another order, or the sorting below may have guessed a stroke wrong. Nothing
// here says which; a person (or the replay in the next step) decides.
//
//   node scripts/audit-stroke-order.js [char-data folder] [output file]
//
// Defaults: public/char-data (the big set, mainland forms) and
// local/audit/order-candidates.tsv. Only Node's own modules are used.

import fs from 'node:fs';
import path from 'node:path';
import { strokeClass } from './strokeClasses.js';

const folder = process.argv[2] ?? 'public/char-data';
const outputFile = process.argv[3] ?? 'local/audit/order-candidates.tsv';
const standardFile = 'local/stroke-sources/zispace-chars.tsv';


// --- Reading the standard and our data ----------------------------------------------------

const standard = new Map();
for (const line of fs.readFileSync(standardFile, 'utf8').split('\n').slice(1)) {
  const [char, , , count, sequence] = line.split('\t');
  if (char && sequence) standard.set(char, { count: Number(count), sequence: sequence.split(';').join('') });
}

const rows = [];
// Which class pairs disagree, stroke by stroke: mostly a sign of what the sorting gets wrong.
const confusions = new Map();
const tally = { checked: 0, notInStandard: 0, countDiffers: 0, orderDiffers: 0, classesDiffer: 0, same: 0 };
for (const file of fs.readdirSync(folder)) {
  if (!file.endsWith('.json')) continue;
  const char = String.fromCodePoint(parseInt(file.slice(0, -5), 16));
  const data = JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
  const ours = data.medians.map(strokeClass).join('');
  const theirs = standard.get(char);
  tally.checked += 1;
  if (!theirs) {
    tally.notInStandard += 1;
  } else if (theirs.sequence.length !== ours.length) {
    tally.countDiffers += 1;
    rows.push([char, 'count', ours, theirs.sequence]);
  } else if (theirs.sequence !== ours) {
    // The same strokes in another sequence is a real difference of ORDER; different strokes
    // mean the sorting guessed a class wrong or the character's form differs.
    const sameStrokes = [...ours].sort().join('') === [...theirs.sequence].sort().join('');
    tally[sameStrokes ? 'orderDiffers' : 'classesDiffer'] += 1;
    rows.push([char, sameStrokes ? 'order' : 'classes', ours, theirs.sequence]);
    for (let i = 0; i < ours.length; i++) {
      if (ours[i] !== theirs.sequence[i]) {
        const pair = `ours ${ours[i]}, standard ${theirs.sequence[i]}`;
        confusions.set(pair, (confusions.get(pair) ?? 0) + 1);
      }
    }
  } else {
    tally.same += 1;
  }
}

fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(
  outputFile,
  ['char\tkind\tours\tstandard', ...rows.map((row) => row.join('\t'))].join('\n') + '\n',
);
console.log(`${folder}:`, tally);
console.log(`candidates written to ${outputFile}`);
console.log('strokes that disagree, by class:');
for (const [pair, count] of [...confusions].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${pair}: ${count}`);
}
