// Tests for following where a character is being written (src/frame.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  fitFrame,
  applyFrame,
  framesDiffer,
  extentOf,
  combineFrames,
  zoomToFit,
  ROOM,
  strokeLeavesRoom,
  NO_FRAME,
} from '../src/frame.js';
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

test('one long stroke written short does not make the character tiny', () => {
  // 鼎 begun where 臼 was asked (the owner, 2026-10-24): its first stroke,
  // shorter than 臼's long first stroke, was taken for a 臼 written at 0.4.
  const random = makeRandom(4);
  const first = JSON.parse(fs.readFileSync('node_modules/hanzi-writer-data/臼.json', 'utf8')).medians.slice(0, 1);
  const fitted = fitFrame(pairsFor(first, { scale: 0.45, dx: 100, dy: 150 }, random));
  assert.equal(fitted.scale, 1);
  // Two strokes written small are followed at their size.
  const two = JSON.parse(fs.readFileSync('node_modules/hanzi-writer-data/臼.json', 'utf8')).medians.slice(0, 2);
  assert.ok(fitFrame(pairsFor(two, { scale: 0.6, dx: 100, dy: 150 }, random)).scale < 0.7);
});

test('the frame stays within its limits', () => {
  const random = makeRandom(3);
  const medians = taiwanData.get('學').medians;
  const tiny = fitFrame(pairsFor(medians, { scale: 0.2, dx: 0, dy: 0 }, random));
  assert.equal(tiny.scale, 0.4);
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

// ---- Zooming out ----

// True if a character covering `extent` stays within the writing area's room
// in `frame`.
function fitsInRoom(extent, frame) {
  return (
    frame.scale * extent.left + frame.dx >= ROOM.left - 0.01 &&
    frame.scale * extent.right + frame.dx <= ROOM.right + 0.01 &&
    frame.scale * extent.bottom + frame.dy >= ROOM.bottom - 0.01 &&
    frame.scale * extent.top + frame.dy <= ROOM.top + 0.01
  );
}

test('the box around a character covers its outlines', () => {
  const data = { strokes: ['M 100 200 Q 150 250 200 -20 Z', 'M 600 700 L 50 300 Z'] };
  assert.deepEqual(extentOf(data), { left: 50, right: 600, bottom: -20, top: 700 });
});

test('combining frames does one and then the other', () => {
  const inner = { scale: 1.2, dx: -30, dy: 40 };
  const outer = { scale: 0.8, dx: 100, dy: -10 };
  const both = combineFrames(outer, inner);
  const point = { x: 300, y: 500 };
  const once = { x: inner.scale * point.x + inner.dx, y: inner.scale * point.y + inner.dy };
  const twice = { x: outer.scale * once.x + outer.dx, y: outer.scale * once.y + outer.dy };
  assert.ok(Math.abs(both.scale * point.x + both.dx - twice.x) < 1e-9);
  assert.ok(Math.abs(both.scale * point.y + both.dy - twice.y) < 1e-9);
});

test('a character that fits is not zoomed', () => {
  for (const data of taiwanData.values()) {
    assert.equal(zoomToFit(extentOf(data), NO_FRAME), null, data.character);
  }
  // Written a little big, but still within the room.
  assert.equal(zoomToFit(extentOf(taiwanData.get('麼')), { scale: 1.05, dx: -20, dy: -20 }), null);
});

test('the left part of 鋼 written big zooms out until the right part fits', () => {
  // 鋼 is not in the Taiwan set; the app takes it from the big set.
  const data = JSON.parse(fs.readFileSync('node_modules/hanzi-writer-data/鋼.json', 'utf8'));
  const random = makeRandom(5);
  // 金 is its first 8 strokes. Written 1.4 times the size, its left edge
  // kept where it is.
  const written = { scale: 1.4, dx: -40, dy: -155 };
  const frame = fitFrame(pairsFor(data.medians.slice(0, 8), written, random));
  const extent = extentOf(data);
  assert.ok(!fitsInRoom(extent, frame), 'the right part should reach beyond the area');
  const zoom = zoomToFit(extent, frame);
  assert.ok(zoom.scale < 0.95, JSON.stringify(zoom));
  assert.ok(fitsInRoom(extent, combineFrames(zoom, frame)));
});

test('a zoom waits until the next stroke would leave the room', () => {
  const data = JSON.parse(fs.readFileSync('node_modules/hanzi-writer-data/鋼.json', 'utf8'));
  // 金 (strokes 1 to 8) written 1.4 times the size: the rest of 金 and the
  // left side of 岡 (stroke 9) stay in the room, the right side of 岡 does not.
  const written = { scale: 1.4, dx: -40, dy: -155 };
  assert.ok([1, 2, 3, 4, 5, 6, 7, 8].every((stroke) => !strokeLeavesRoom(data.strokes[stroke], written)));
  assert.equal(strokeLeavesRoom(data.strokes[9], written), true);
  // At full size nothing leaves it.
  assert.ok(data.strokes.every((outline) => !strokeLeavesRoom(outline, NO_FRAME)));
});

test('a zoom always brings the whole character into the room', () => {
  // Every frame the fit can give: up to 1.5 times the size, the middle moved
  // up to 320 units.
  const frames = [];
  for (const scale of [0.4, 0.8, 1, 1.2, 1.5]) {
    for (let angle = 0; angle < 360; angle += 45) {
      const radians = (angle * Math.PI) / 180;
      const moveX = 320 * Math.cos(radians);
      const moveY = 320 * Math.sin(radians);
      frames.push({ scale, dx: 512 - scale * 512 + moveX, dy: 388 - scale * 388 + moveY });
    }
  }
  for (const char of '麼學這為校國謝機電聽好明') {
    const extent = extentOf(taiwanData.get(char));
    for (const frame of frames) {
      const zoom = zoomToFit(extent, frame);
      const after = zoom ? combineFrames(zoom, frame) : frame;
      assert.ok(fitsInRoom(extent, after), `${char} in ${JSON.stringify(frame)}`);
      if (zoom) {
        assert.ok(zoom.scale <= 1);
      }
    }
  }
});

test('a zoom shrinks toward the middle of the box, so it says nothing about where the rest goes', () => {
  // A character centered and too big in every direction shrinks in place.
  const extent = { left: 0, right: 1024, bottom: -124, top: 900 };
  const zoom = zoomToFit(extent, { scale: 1.3, dx: 512 - 1.3 * 512, dy: 388 - 1.3 * 388 });
  assert.ok(Math.abs(zoom.scale * 512 + zoom.dx - 512) < 1e-9);
  assert.ok(Math.abs(zoom.scale * 388 + zoom.dy - 388) < 1e-9);
});
