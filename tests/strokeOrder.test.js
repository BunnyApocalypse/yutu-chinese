// Tests for characters that may be written in two stroke orders: finding the
// second order (scripts/strokeOrder.js), and telling during a quiz which
// order a drawn stroke belongs to (src/strokeMatch.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { findAlternativeOrder } from '../scripts/strokeOrder.js';
import {
  fitsStroke,
  distanceFromStroke,
  remainingInOtherOrder,
  isStandardOrder,
} from '../src/strokeMatch.js';
import { toPoints } from '../src/lines.js';

// The same leniency the app uses (LENIENCY in src/quiz.js).
const LENIENCY = 1.5;

const taiwanData = new Map();
for (const line of fs.readFileSync('data/animcjk/graphicsZhHant.txt', 'utf8').split('\n')) {
  if (line.trim() !== '') {
    const entry = JSON.parse(line);
    taiwanData.set(entry.character, entry);
  }
}

function bigSetData(char) {
  const file = `node_modules/hanzi-writer-data/${char}.json`;
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}

// Every Taiwan-set character that has a second order, with that order.
const charsWithSecondOrder = [];
for (const [char, entry] of taiwanData) {
  const bigSet = bigSetData(char);
  const altOrder = bigSet ? findAlternativeOrder(entry, bigSet) : null;
  if (altOrder) {
    charsWithSecondOrder.push({ char, entry, altOrder });
  }
}

// A stand-in for Math.random() that gives the same numbers on every run.
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const VARIATIONS = [
  { scale: 1, dx: 0, dy: 0, jitter: 0 },
  { scale: 0.85, dx: 30, dy: -20, jitter: 10 },
  { scale: 1.15, dx: -30, dy: 25, jitter: 10 },
  { scale: 1, dx: 40, dy: 40, jitter: 15 },
  { scale: 0.9, dx: -40, dy: -30, jitter: 15 },
  { scale: 0.75, dx: 0, dy: 0, jitter: 10 },
  { scale: 1.3, dx: 0, dy: 0, jitter: 10 },
];

function vary(points, { scale, dx, dy, jitter }, random) {
  const start = points[0];
  return points.map((point) => ({
    x: start.x + (point.x - start.x) * scale + dx + (random() * 2 - 1) * jitter,
    y: start.y + (point.y - start.y) * scale + dy + (random() * 2 - 1) * jitter,
  }));
}

// The app's rule for "this stroke belongs to the other order".
function takenForOtherOrder(drawn, entry, expected, other) {
  return (
    fitsStroke(drawn, entry.medians[other], LENIENCY) &&
    distanceFromStroke(drawn, entry.medians[other]) < distanceFromStroke(drawn, entry.medians[expected])
  );
}

test('the second order of 學 is the left part first, then 爻', () => {
  const order = findAlternativeOrder(taiwanData.get('學'), bigSetData('學'));
  assert.deepEqual(order, [4, 5, 6, 7, 0, 1, 2, 3, 8, 9, 10, 11, 12, 13, 14, 15]);
});

test('no second order where the order is the same or the shapes differ', () => {
  assert.equal(findAlternativeOrder(taiwanData.get('子'), bigSetData('子')), null);
  // 為 has 9 strokes in the Taiwan set and 12 in the big set.
  assert.equal(findAlternativeOrder(taiwanData.get('為'), bigSetData('為')), null);
  // 說 has the same number of strokes in both, but two of them differ in shape.
  assert.equal(findAlternativeOrder(taiwanData.get('說'), bigSetData('說')), null);
});

test('every second order uses each stroke exactly once', () => {
  assert.ok(charsWithSecondOrder.length >= 50, 'expected dozens of characters with a second order');
  for (const { char, entry, altOrder } of charsWithSecondOrder) {
    const sorted = [...altOrder].sort((a, b) => a - b);
    assert.deepEqual(sorted, entry.medians.map((median, index) => index), char);
    assert.equal(isStandardOrder(altOrder), false, char);
  }
});

test('the other order is offered only where the two orders part ways', () => {
  const standard = [0, 1, 2, 3, 4];
  const altOrder = [0, 2, 1, 3, 4];
  assert.equal(remainingInOtherOrder(standard, 0, altOrder), null); // both start with 0
  assert.deepEqual(remainingInOtherOrder(standard, 1, altOrder), [2, 1, 3, 4]);
  assert.equal(remainingInOtherOrder(standard, 2, altOrder), null); // committed to the standard order
  // After switching at the second stroke, the way back is offered...
  assert.deepEqual(remainingInOtherOrder([0, 2, 1, 3, 4], 1, altOrder), [1, 2, 3, 4]);
  // ...but once 2 is written, both orders want 1 next.
  assert.equal(remainingInOtherOrder([0, 2, 1, 3, 4], 2, altOrder), null);
  // Partway through a differing stretch there is no changing over: with
  // orders 0 1 2 3 4 and 2 0 1 3 4, having written 2 commits you to 0 next.
  assert.equal(remainingInOtherOrder([2, 0, 1, 3, 4], 1, [2, 0, 1, 3, 4]), null);
  assert.equal(remainingInOtherOrder(standard, 1, [2, 0, 1, 3, 4]), null);
  assert.equal(remainingInOtherOrder(standard, 1, null), null);
  assert.equal(remainingInOtherOrder(standard, 5, altOrder), null); // finished
});

test('two separate differing stretches can be written in different orders', () => {
  const standard = [0, 1, 2, 3, 4, 5];
  const altOrder = [1, 0, 2, 3, 5, 4];
  // Standard order through the first stretch, then the other order is still
  // on offer at the second.
  assert.deepEqual(remainingInOtherOrder(standard, 4, altOrder), [5, 4]);
  // The other order at the first stretch, and the standard one at the second.
  const switched = [1, 0, 2, 3, 5, 4];
  assert.deepEqual(remainingInOtherOrder(switched, 4, altOrder), [4, 5]);
});

test('strokes are attributed to the right order', () => {
  // For every character with two orders, walk through each order. Wherever
  // the two expect different strokes next, draw each of the two candidates in
  // several imperfect ways and check which order it is taken for.
  const random = makeRandom(3);
  let trials = 0;
  const wronglySwitched = [];
  const notRecognized = [];
  for (const { char, entry, altOrder } of charsWithSecondOrder) {
    const standard = entry.medians.map((median, index) => index);
    for (const sequence of [standard, altOrder]) {
      for (let written = 0; written < sequence.length; written++) {
        const other = remainingInOtherOrder(sequence, written, altOrder);
        if (!other) continue;
        const expected = sequence[written];
        for (const variation of VARIATIONS) {
          trials += 1;
          // The expected stroke must never be taken for the other order's.
          const drawnExpected = vary(toPoints(entry.medians[expected]), variation, random);
          if (takenForOtherOrder(drawnExpected, entry, expected, other[0])) {
            wronglySwitched.push(`${char} stroke ${expected}`);
          }
          // The other order's stroke should be recognized as such.
          const drawnOther = vary(toPoints(entry.medians[other[0]]), variation, random);
          if (!takenForOtherOrder(drawnOther, entry, expected, other[0])) {
            notRecognized.push(`${char} stroke ${other[0]}`);
          }
        }
      }
    }
  }
  assert.ok(trials > 500, 'expected plenty of trials');
  assert.deepEqual(wronglySwitched, [], 'a stroke of the expected order was taken for the other order');
  assert.ok(
    notRecognized.length <= trials * 0.05,
    `${notRecognized.length} of ${trials} strokes of the other order were not recognized: ${[...new Set(notRecognized)].join(', ')}`,
  );
});
