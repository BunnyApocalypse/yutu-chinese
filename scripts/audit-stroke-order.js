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

const folder = process.argv[2] ?? 'public/char-data';
const outputFile = process.argv[3] ?? 'local/audit/order-candidates.tsv';
const standardFile = 'local/stroke-sources/zispace-chars.tsv';

// --- Sorting one stroke into a class ---------------------------------------------------

const length = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Ramer-Douglas-Peucker: keeps only the points where the line really bends.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [start, end] = [points[0], points[points.length - 1]];
  const span = length(start, end) || 1;
  let farthest = 0;
  let farthestIndex = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const cross = Math.abs(
      (end[0] - start[0]) * (start[1] - points[i][1]) - (start[0] - points[i][0]) * (end[1] - start[1]),
    );
    if (cross / span > farthest) {
      farthest = cross / span;
      farthestIndex = i;
    }
  }
  if (farthest <= tolerance) return [start, end];
  const left = simplify(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplify(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

// Degrees, 0 = right, 90 = up, -90 = down (the stroke data's y axis points up).
const angleOf = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const turnBetween = (first, second) => {
  const turn = Math.abs(first - second) % 360;
  return turn > 180 ? 360 - turn : turn;
};

const LONG_SEGMENT = 90; // a turn counts only between two segments this long: the brush's
// entry dab and the little hook at the end of a down stroke are shorter
const MIN_TURN = 55; // degrees
const DOT_LENGTH = 150; // a stroke going down that is shorter than this is a dot, not a down stroke

export function strokeClass(median) {
  const line = simplify(median, 30);
  const segments = [];
  for (let i = 1; i < line.length; i++) {
    segments.push({
      length: length(line[i - 1], line[i]),
      angle: angleOf(line[i - 1], line[i]),
      end: line[i],
    });
  }
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const long = segments.filter((segment) => segment.length >= LONG_SEGMENT);

  // A turn between two long segments: a stroke with a corner (class 5), except the hook of
  // a down stroke (竖钩): the last segment, going left, under half as long as the stroke down.
  let endPoint = median[median.length - 1];
  for (let i = 1; i < long.length; i++) {
    if (turnBetween(long[i - 1].angle, long[i].angle) < MIN_TURN) continue;
    const isHook =
      i === long.length - 1 &&
      long[i - 1].angle >= -100 &&
      long[i - 1].angle <= -60 &&
      long[i].length < 0.5 * long[i - 1].length &&
      (long[i].angle >= 135 || long[i].angle <= -150);
    if (!isHook) return 5;
    endPoint = long[i - 1].end; // the direction is the stroke down, not the hook
  }

  // Otherwise the direction is from the start to the end (without a hook).
  const direction = angleOf(median[0], endPoint);

  if (direction > -8 && direction <= 75) return 1; // level, or rising
  if (direction < -100 || direction > 150) return 3; // down-left
  if (total >= DOT_LENGTH && direction >= -100 && direction <= -60) return 2; // down
  return 4; // a dot or down-right
}

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
