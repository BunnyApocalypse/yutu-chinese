// Stroke-order audit, step 2: triage the "order" candidates of step 1.
//
// For each character whose strokes are the same as the standard's but in another sequence:
//   1. works out OUR stroke numbers in the standard's sequence (`standardOrder`): for each
//      stroke of the standard, the first of our strokes of that class not yet used;
//   2. says whether the app already accepts that order as its second order (`altOrder` in
//      the data, as the app loads it: the writing grid's `loadStrokeData`);
//   3. asks KanjiVG (Japanese orders; local/stroke-sources/) which sequence it has, if it has
//      the character: the standard's, ours, or neither. Another source agreeing is evidence;
//      it is not proof, since the Japanese standard differs from the Chinese in places.
//
// Writes local/audit/orders-to-replay.json (the orders the app does not accept yet, for
// scripts/audit-replay.js) and prints a table. Run from the project's folder, after
// `node scripts/audit-stroke-order.js`.

import fs from 'node:fs';
import { strokeClass } from './strokeClasses.js';
import { loadStrokeData } from '../tests/browser/harness.js';

const candidatesFile = 'local/audit/order-candidates.tsv';
const kanjivgFolder = 'local/stroke-sources/kanjivg/unpacked/kanji';
const outputFile = 'local/audit/orders-to-replay.json';

// KanjiVG's stroke types are characters of Unicode's "CJK Strokes" block, such as ㇐ and ㇑.
// The same five classes as strokeClasses.js; every other type has a turn in it.
const KANJIVG_CLASS = { '㇀': 1, '㇐': 1, '㇑': 2, '㇚': 2, '㇒': 3, '㇓': 3, '㇔': 4, '㇏': 4 };

function kanjivgSequence(char) {
  const file = `${kanjivgFolder}/${char.codePointAt(0).toString(16).padStart(5, '0')}.svg`;
  if (!fs.existsSync(file)) return null;
  const strokes = [...fs.readFileSync(file, 'utf8').matchAll(/<path id="kvg:[0-9a-f]+-s(\d+)" kvg:type="([^"]+)"/g)];
  if (strokes.length === 0) return null;
  return strokes
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(([, , type]) => KANJIVG_CLASS[type[0]] ?? 5)
    .join('');
}

// Our stroke numbers in the standard's sequence: for each class asked, our first stroke of
// that class not yet used. Strokes of one class keep their order among themselves.
function standardOrder(oursClasses, standardSequence) {
  const used = new Set();
  return [...standardSequence].map((wanted) => {
    const index = [...oursClasses].findIndex((have, i) => have === wanted && !used.has(i));
    used.add(index);
    return index;
  });
}

const rows = fs
  .readFileSync(candidatesFile, 'utf8')
  .split('\n')
  .slice(1)
  .map((line) => line.split('\t'))
  .filter(([char, kind]) => char && kind === 'order');

const toReplay = [];
console.log('char  ours -> standard   standard order        app accepts   KanjiVG');
for (const [char, , ours, standard] of rows) {
  const data = loadStrokeData(char);
  const classes = data.medians.map(strokeClass).join('');
  const order = standardOrder(classes, standard);
  const accepted = Boolean(data.altOrder) && data.altOrder.join() === order.join();

  const japanese = kanjivgSequence(char);
  const kanjivg =
    japanese === null ? 'not there' : japanese === standard ? 'the standard\'s' : japanese === ours ? 'ours' : 'neither';

  console.log(
    `${char}     ${ours} -> ${standard}   ${order.join(',').padEnd(28)} ${accepted ? 'yes' : 'no'}${' '.repeat(accepted ? 11 : 12)}${kanjivg}`,
  );
  if (!accepted) toReplay.push({ char, order, ours, standard, kanjivg });
}

fs.writeFileSync(outputFile, JSON.stringify(toReplay, null, 1));
console.log(`\n${rows.length} candidates, ${rows.length - toReplay.length} already accepted, ${toReplay.length} written to ${outputFile}`);
