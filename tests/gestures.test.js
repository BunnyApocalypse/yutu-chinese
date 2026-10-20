// Tests for recognizing a swipe up on the writing area (src/gestures.js).
//
// The error that matters is a real stroke taken for a swipe, which would wipe
// the character. So every stroke of every character in both stroke data sets
// is drawn, in its right direction, and none may count as a swipe.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { isSwipeUp, risesSteeply, SWIPE_MAX_MS } from '../src/gestures.js';

// Stroke data is 1024 units across, with y running upward up to 900; the
// screen's y runs downward. The writing area is taken as 1024 pixels.
const AREA = 1024;
const onScreen = (median) => median.map(([x, y]) => ({ x, y: 900 - y }));

function* everyMedian() {
  const bigSet = 'node_modules/hanzi-writer-data';
  for (const file of fs.readdirSync(bigSet)) {
    if (file.endsWith('.json') && file !== 'package.json') {
      yield* JSON.parse(fs.readFileSync(`${bigSet}/${file}`, 'utf8')).medians;
    }
  }
  for (const line of fs.readFileSync('data/animcjk/graphicsZhHant.txt', 'utf8').split('\n')) {
    if (line.trim() !== '') {
      yield* JSON.parse(line).medians;
    }
  }
}

test('a textbook stroke is taken for a swipe up only if it rises steeply, and hardly ever at its size', () => {
  let strokes = 0;
  let takenAtSize = 0;
  const notSteep = [];
  for (const median of everyMedian()) {
    strokes += 1;
    // As the app draws it (the stroke data's box fills about 0.88 of the
    // area), as big as the area, and a fifth bigger still.
    const atSize = isSwipeUp(onScreen(median), AREA / 0.88);
    if (atSize) {
      takenAtSize += 1;
    }
    // Any stroke with a swipe's shape rises steeply, so the stricter share
    // guards it whenever it is the stroke expected next.
    if ((atSize || isSwipeUp(onScreen(median), AREA) || isSwipeUp(onScreen(median), AREA / 1.2)) && !risesSteeply(median)) {
      notSteep.push(median);
    }
  }
  assert.ok(strokes > 100000, `only ${strokes} strokes read`);
  assert.equal(notSteep.length, 0, `taken for a swipe: ${JSON.stringify(notSteep.slice(0, 3))}`);
  // 3 of over 120,000 (2026-10-20), out of order only.
  assert.ok(takenAtSize <= 5, `${takenAtSize} strokes at their size taken for a swipe`);
});

test('a swipe up is recognized, a swipe down or sideways is not', () => {
  const line = (from, to, steps = 10) =>
    Array.from({ length: steps + 1 }, (unused, i) => ({
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    }));
  // Straight up, and a little slanted.
  assert.ok(isSwipeUp(line({ x: 500, y: 900 }, { x: 500, y: 300 }), AREA));
  assert.ok(isSwipeUp(line({ x: 500, y: 900 }, { x: 600, y: 350 }), AREA));
  // A third of the area is enough (the owner's swipes rise 36 to 40%).
  assert.ok(isSwipeUp(line({ x: 500, y: 900 }, { x: 500, y: 520 }), AREA));
  // Too short, too slanted, or downward.
  assert.ok(!isSwipeUp(line({ x: 500, y: 900 }, { x: 500, y: 600 }), AREA));
  assert.ok(!isSwipeUp(line({ x: 300, y: 900 }, { x: 700, y: 400 }), AREA));
  assert.ok(!isSwipeUp(line({ x: 500, y: 300 }, { x: 500, y: 900 }), AREA));
  // Down first, then up: a hook, not a swipe.
  const downAndUp = [...line({ x: 500, y: 300 }, { x: 500, y: 900 }), ...line({ x: 500, y: 900 }, { x: 520, y: 100 })];
  assert.ok(!isSwipeUp(downAndUp, AREA));
  // A single point (a tap) is nothing.
  assert.ok(!isSwipeUp([{ x: 500, y: 500 }], AREA));
});

test('when the next stroke rises steeply, even one written a fifth bigger is no swipe', () => {
  let rising = 0;
  const taken = [];
  for (const median of everyMedian()) {
    if (!risesSteeply(median)) {
      continue;
    }
    rising += 1;
    // 1.2 times as big, grown from where the stroke starts, with the stroke
    // data's box already as big as the whole writing area (the app draws it
    // at 0.88).
    const [startX, startY] = median[0];
    const grown = median.map(([x, y]) => [startX + 1.2 * (x - startX), startY + 1.2 * (y - startY)]);
    if (isSwipeUp(onScreen(grown), AREA, true)) {
      taken.push(median);
    }
  }
  assert.ok(rising > 100, `only ${rising} steeply rising strokes found`);
  assert.equal(taken.length, 0, `taken for a swipe: ${JSON.stringify(taken.slice(0, 3))}`);
});

test('the rising stroke of 氵 rises steeply, a horizontal stroke does not', () => {
  const man = JSON.parse(fs.readFileSync('node_modules/hanzi-writer-data/滿.json', 'utf8'));
  // 滿: the third stroke is the 提 of 氵, the fourth the first 橫 of 艹.
  assert.ok(risesSteeply(man.medians[2]));
  assert.ok(!risesSteeply(man.medians[3]));
  // Downward strokes never do.
  assert.ok(!risesSteeply([[500, 800], [500, 100]]));
});

test('a strict swipe up must be longer', () => {
  const up = (from, to) => [{ x: 500, y: from }, { x: 500, y: to }];
  // Rising by 0.45 of the area: a swipe, but not a strict one.
  assert.ok(isSwipeUp(up(900, 439), AREA));
  assert.ok(!isSwipeUp(up(900, 439), AREA, true));
  // Half is enough for a strict one (the owner, 2026-10-20).
  assert.ok(isSwipeUp(up(900, 380), AREA, true));
  // From near the bottom to near the top: a swipe either way.
  assert.ok(isSwipeUp(up(980, 40), AREA, true));
});

test('a swipe up must be quick; a slow line upward is a stroke', () => {
  const up = [{ x: 500, y: 900 }, { x: 500, y: 300 }];
  assert.ok(isSwipeUp(up, AREA, false, 150));
  assert.ok(isSwipeUp(up, AREA, false, SWIPE_MAX_MS));
  assert.ok(!isSwipeUp(up, AREA, false, SWIPE_MAX_MS + 1));
  assert.ok(!isSwipeUp(up, AREA, false, 1200));
  // The same for a strict swipe, however long.
  const fromBottomToTop = [{ x: 500, y: 980 }, { x: 500, y: 40 }];
  assert.ok(isSwipeUp(fromBottomToTop, AREA, true, 200));
  assert.ok(!isSwipeUp(fromBottomToTop, AREA, true, 900));
});
