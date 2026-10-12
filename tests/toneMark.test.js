// Tests for recognizing drawn tone marks (src/toneMark.js). Marks are drawn
// by formula at different sizes, positions and angles, with some shake.

import test from 'node:test';
import assert from 'node:assert/strict';

import { recognizeToneMark } from '../src/toneMark.js';

const AREA = 300;

// A stand-in for Math.random() that gives the same numbers on every run.
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Points along straight segments joining the given corners, a few pixels
// apart and shaken by up to `jitter` pixels, like a real stroke.
function stroke(corners, random, jitter = 2) {
  const points = [];
  for (let i = 1; i < corners.length; i++) {
    const [x1, y1] = corners[i - 1];
    const [x2, y2] = corners[i];
    const steps = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / 4));
    for (let step = i === 1 ? 0 : 1; step <= steps; step++) {
      points.push({
        x: x1 + ((x2 - x1) * step) / steps + (random() * 2 - 1) * jitter,
        y: y1 + ((y2 - y1) * step) / steps + (random() * 2 - 1) * jitter,
      });
    }
  }
  return points;
}

// A straight stroke of the given length, at an angle above horizontal
// (negative for falling), starting at (x, y). Screen y grows downward.
function straight(x, y, length, degrees) {
  const radians = (degrees * Math.PI) / 180;
  return [
    [x, y],
    [x + length * Math.cos(radians), y - length * Math.sin(radians)],
  ];
}

const SIZES = [40, 80, 150, 240];
const STARTS = [
  [30, 150],
  [60, 60],
  [20, 250],
];

function check(tone, makeCorners, label) {
  const random = makeRandom(tone);
  for (const size of SIZES) {
    for (const [x, y] of STARTS) {
      for (const corners of makeCorners(x, y, size)) {
        const result = recognizeToneMark(stroke(corners, random), AREA);
        assert.equal(result, tone, `${label}, size ${size} at (${x}, ${y}): ${JSON.stringify(corners)}`);
      }
    }
  }
}

test('a level stroke is tone 1', () => {
  check(1, (x, y, size) => [-10, -5, 0, 5, 10].map((tilt) => straight(x, y, size, tilt)), 'level');
});

test('a rising stroke is tone 2', () => {
  check(2, (x, y, size) => [30, 45, 60, 72].map((angle) => straight(x, y, size, angle)), 'rising');
});

test('a falling stroke is tone 4', () => {
  check(4, (x, y, size) => [-30, -45, -60, -72].map((angle) => straight(x, y, size, angle)), 'falling');
});

test('down then up is tone 3', () => {
  check(
    3,
    (x, y, size) => [
      // a symmetric v
      [[x, y], [x + size / 2, y + size / 2], [x + size, y]],
      // a short way down, a long way up
      [[x, y], [x + size * 0.3, y + size * 0.4], [x + size, y - size * 0.2]],
      // a long way down, a short way up
      [[x, y], [x + size * 0.6, y + size * 0.6], [x + size, y + size * 0.3]],
      // a shallow one
      [[x, y], [x + size / 2, y + size * 0.3], [x + size, y]],
    ],
    'down then up',
  );
});

test('a dot or a tap is the neutral tone', () => {
  const random = makeRandom(5);
  assert.equal(recognizeToneMark([{ x: 150, y: 150 }], AREA), 5);
  assert.equal(recognizeToneMark(stroke([[150, 150], [154, 153]], random, 1), AREA), 5);
  assert.equal(recognizeToneMark(stroke([[40, 220], [48, 228], [43, 222]], random, 1), AREA), 5);
});

test('strokes that are not tone marks are not recognized', () => {
  const random = makeRandom(6);
  // drawn from right to left
  assert.equal(recognizeToneMark(stroke([[250, 150], [60, 150]], random), AREA), null);
  assert.equal(recognizeToneMark(stroke([[250, 200], [100, 80]], random), AREA), null);
  // straight down, straight up
  assert.equal(recognizeToneMark(stroke([[150, 50], [152, 250]], random), AREA), null);
  assert.equal(recognizeToneMark(stroke([[150, 250], [151, 50]], random), AREA), null);
  // a scribble back and forth
  assert.equal(recognizeToneMark(stroke([[60, 150], [220, 140], [80, 160], [240, 150]], random), AREA), null);
  // up then down (an upside-down tone 3)
  assert.equal(recognizeToneMark(stroke([[60, 200], [150, 90], [240, 200]], random), AREA), null);
  // nothing at all
  assert.equal(recognizeToneMark([], AREA), null);
});
