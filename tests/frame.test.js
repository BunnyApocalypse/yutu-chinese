// Tests for following where a character is being written (src/frame.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { fitFrame, applyFrame, framesDiffer, NO_FRAME } from '../src/frame.js';
import { toPoints, resample, averageDistance } from '../src/lines.js';

const taiwanData = new Map();
for (const line of fs.readFileSync('data/animcjk/graphicsZhHant.txt', 'utf8').split('\n')) {
  if (line.trim() !== '') {
    const entry = JSON.parse(line);
    taiwanData.set(entry.character, entry);
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

// A stroke as someone writing in `frame` would draw it: moved into the frame
// and shaken a little.
function drawIn(median, frame, random, jitter = 12) {
  return median.map(([x, y]) => ({
    x: frame.scale * x + frame.dx + (random() * 2 - 1) * jitter,
    y: frame.scale * y + frame.dy + (random() * 2 - 1) * jitter,
  }));
}

function pairsFor(medians, frame, random) {
  return medians.map((median) => ({ reference: toPoints(median), drawn: drawIn(median, frame, random) }));
}

const FRAMES = [
  { scale: 0.75, dx: -150, dy: 120 },
  { scale: 0.8, dx: 160, dy: -60 },
  { scale: 1.2, dx: -90, dy: -70 },
  { scale: 0.7, dx: 0, dy: 150 },
  { scale: 1, dx: -180, dy: 0 },
  { scale: 0.9, dx: 120, dy: 120 },
];

test('with no strokes there is nothing to follow', () => {
  assert.deepEqual(fitFrame([]), NO_FRAME);
});

test('a fit recovers the frame a character was written in', () => {
  const random = makeRandom(1);
  const medians = taiwanData.get('麼').medians.slice(0, 6);
  for (const frame of FRAMES) {
    const fitted = fitFrame(pairsFor(medians, frame, random));
    assert.ok(Math.abs(fitted.scale - frame.scale) < 0.05, `scale for ${JSON.stringify(frame)}: ${fitted.scale}`);
    assert.ok(!framesDiffer(fitted, frame) || Math.hypot(fitted.dx - frame.dx, fitted.dy - frame.dy) < 40, `shift for ${JSON.stringify(frame)}`);
  }
});

test('one short stroke gives a shift but leaves the size alone', () => {
  const random = makeRandom(2);
  // The first stroke of 麼 is a short dot.
  const dot = taiwanData.get('麼').medians.slice(0, 1);
  const fitted = fitFrame(pairsFor(dot, { scale: 0.7, dx: -100, dy: 80 }, random));
  assert.equal(fitted.scale, 1);
  assert.ok(Math.abs(fitted.dx) > 30 || Math.abs(fitted.dy) > 30, 'expected some shift');
});

test('the frame stays within its limits', () => {
  const random = makeRandom(3);
  const medians = taiwanData.get('學').medians;
  const tiny = fitFrame(pairsFor(medians, { scale: 0.3, dx: 0, dy: 0 }, random));
  assert.equal(tiny.scale, 0.6);
  const huge = fitFrame(pairsFor(medians, { scale: 2.5, dx: -700, dy: -500 }, random));
  assert.equal(huge.scale, 1.5);
  // Written far off in a corner: followed only part of the way.
  const farOff = fitFrame(pairsFor(medians, { scale: 1, dx: 900, dy: 900 }, random));
  assert.ok(Math.hypot(farOff.dx, farOff.dy) <= 321, JSON.stringify(farOff));
});

test('small differences between frames do not matter, large ones do', () => {
  assert.equal(framesDiffer(NO_FRAME, { scale: 1.01, dx: 3, dy: -4 }), false);
  assert.equal(framesDiffer(NO_FRAME, { scale: 1, dx: 40, dy: 0 }), true);
  assert.equal(framesDiffer(NO_FRAME, { scale: 0.9, dx: 51, dy: 39 }), true);
});

test('moving stroke data moves every coordinate and nothing else', () => {
  const data = {
    strokes: ['M 100 200 Q 150.5 250 200 200 L 300 -50 C 1 2 3 4 5 6 Z'],
    medians: [[[100, 200], [300, -50]]],
    altOrder: [0],
  };
  const moved = applyFrame(data, { scale: 0.5, dx: 10, dy: -20 });
  assert.equal(moved.strokes[0], 'M 60 80 Q 85.3 105 110 80 L 160 -45 C 10.5 -19 11.5 -18 12.5 -17 Z');
  assert.deepEqual(moved.medians, [[[60, 80], [160, -45]]]);
  assert.deepEqual(moved.altOrder, [0]);
  // The original is untouched, and the frame that changes nothing returns it as is.
  assert.equal(data.strokes[0].startsWith('M 100 200'), true);
  assert.equal(applyFrame(data, NO_FRAME), data);
});

test('real stroke outlines keep their shape when moved', () => {
  // Every outline must still have the same letters in the same places, and
  // as many numbers as before.
  const data = taiwanData.get('麼');
  const moved = applyFrame(data, { scale: 0.8, dx: -120, dy: 60 });
  data.strokes.forEach((outline, index) => {
    const letters = (text) => text.replace(/[^A-Za-z]/g, '');
    const numbers = (text) => text.match(/-?\d*\.?\d+/g).length;
    assert.equal(letters(moved.strokes[index]), letters(outline));
    assert.equal(numbers(moved.strokes[index]), numbers(outline));
  });
});

test('following the frame brings later strokes close to where they are expected', () => {
  // Write several characters off-center and resized. For each stroke after
  // the first, compare where it lands with where it is expected: once without
  // following, and once using the frame fitted to the strokes before it.
  const random = makeRandom(4);
  const apart = (a, b) => averageDistance(resample(a, 16), resample(b, 16));
  const without = [];
  const withFrame = [];
  for (const char of '麼學這為校國謝機電聽') {
    const medians = taiwanData.get(char).medians;
    for (const frame of FRAMES) {
      const drawn = medians.map((median) => drawIn(median, frame, random));
      for (let k = 1; k < medians.length; k++) {
        const fitted = fitFrame(
          medians.slice(0, k).map((median, index) => ({ reference: toPoints(median), drawn: drawn[index] })),
        );
        const expected = toPoints(applyFrame({ strokes: [], medians: [medians[k]] }, fitted).medians[0]);
        without.push(apart(toPoints(medians[k]), drawn[k]));
        withFrame.push(apart(expected, drawn[k]));
      }
    }
  }
  const average = (numbers) => numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
  assert.ok(average(without) > 100, `without following: ${average(without)}`);
  assert.ok(average(withFrame) < 30, `with following: ${average(withFrame)}`);
  // Hanzi Writer wants a stroke within about 260 units on average; aim well inside that.
  const withinReach = withFrame.filter((distance) => distance <= 130).length / withFrame.length;
  assert.ok(withinReach > 0.98, `share within reach: ${withinReach}`);
});
