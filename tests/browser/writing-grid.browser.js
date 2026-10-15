// Writes characters in a real browser, in both accepted stroke orders and at
// several positions and sizes, and checks that each is accepted without a
// mistake. This is what tells us whether following where a character is
// written (src/frame.js) and telling the two stroke orders apart
// (src/quiz.js) work together.
//
// Run with: npm run test:browser
// Only some characters:  CHARS=學母 npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  BROWSER_COUNT,
  startApp,
  startBrowsers,
  startWriting,
  writingArea,
  drawStroke,
  isShown,
  loadStrokeData,
} from './harness.js';

// Characters with two accepted stroke orders (the first ten), and some with one.
const CHARS = Array.from(process.env.CHARS || '學覺我馬國忙錢母出長麼這謝子好');

// Where and how big the character is written, compared with the centered
// reference: `scale` times the size, moved `dx` to the right and `dy` up, in
// the stroke data's units (the box is 1024 across).
const POSITIONS = {
  'centered': { scale: 1, dx: 0, dy: 0 },
  'small, top left': { scale: 0.6, dx: -20, dy: 330 },
  'half size, top left': { scale: 0.45, dx: 30, dy: 420 },
  'half size, bottom right': { scale: 0.5, dx: 430, dy: -40 },
  'shifted right': { scale: 1, dx: 190, dy: 0 },
  'shifted left': { scale: 1, dx: -190, dy: 0 },
  'larger, low': { scale: 1.2, dx: -90, dy: -110 },
};

// How far each point of a stroke is shaken off its line, in the data's units,
// so that strokes are not traced perfectly.
const JITTER = 8;

// The writing area in the data's units: the character's own box (0 to 1024
// across, -124 to 900 upward) plus the margin Hanzi Writer leaves around it,
// less a little for the shaking. A stroke that begins outside it never reaches
// the app, so a combination of character and position with such a stroke
// cannot be written and is skipped. (A stroke may run on past the edge.)
const AREA = { left: -60, right: 1084, bottom: -184, top: 960 };

function canBeWritten(medians, position) {
  return medians.every(([[x, y]]) => {
    const startX = position.scale * x + position.dx;
    const startY = position.scale * y + position.dy;
    return startX > AREA.left && startX < AREA.right && startY > AREA.bottom && startY < AREA.top;
  });
}

// A stand-in for Math.random() that gives the same numbers on every run. Each
// test gets its own, seeded from its name, so a test draws the same strokes
// whichever browser it lands on and whatever ran before it.
function makeRandom(name) {
  let state = 0;
  for (const letter of name) {
    state = (state * 31 + letter.codePointAt(0)) % 4294967296;
  }
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Writes one character in Free practice, stopping at the first stroke that
// is not accepted. Returns:
//   status:         the status line at the end ("No mistakes" if all went well)
//   strokesDrawn:   how many strokes were drawn
//   orderNoteShown: whether the note about the mainland order is showing
async function writeChar(page, char, strokeOrder, position, random) {
  const data = loadStrokeData(char);
  await startWriting(page, char);
  const area = await writingArea(page);
  let status = '';
  let strokesDrawn = 0;
  for (const strokeNum of strokeOrder) {
    const points = data.medians[strokeNum].map(([x, y]) => [
      position.scale * x + position.dx + (random() * 2 - 1) * JITTER,
      position.scale * y + position.dy + (random() * 2 - 1) * JITTER,
    ]);
    status = await drawStroke(page, area, points);
    strokesDrawn += 1;
    // After the last stroke the status line is "No mistakes"; until then it
    // is "3/7 · No mistakes" for as long as every stroke has been accepted.
    if (!/no mistakes$/i.test(status)) {
      break;
    }
  }
  return { status, strokesDrawn, orderNoteShown: await isShown(page, 'order-note') };
}

describe('writing grid', { concurrency: BROWSER_COUNT }, () => {
  let app;
  let browsers;
  // For the table at the end: per position, how many passed, failed and were skipped.
  const tally = Object.fromEntries(
    Object.keys(POSITIONS).map((name) => [name, { passed: 0, failed: 0, skipped: 0 }]),
  );

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url);
  });

  after(async () => {
    console.log(`\nWritten without a mistake, by position (${BROWSER_COUNT} browsers):`);
    for (const [name, { passed, failed, skipped }] of Object.entries(tally)) {
      const note = skipped > 0 ? `   (${skipped} skipped: a stroke would begin outside the writing area)` : '';
      console.log(`  ${name.padEnd(26)}${String(passed).padStart(3)} of ${passed + failed}${note}`);
    }
    const errors = browsers?.errors() ?? [];
    console.log(errors.length > 0 ? `Page errors:\n${errors.join('\n')}` : 'No page errors.');
    browsers?.close();
    await app?.close();
  });

  for (const char of CHARS) {
    const data = loadStrokeData(char);
    const moeOrder = data.medians.map((median, index) => index);
    const orders = data.altOrder ? { MOE: moeOrder, mainland: data.altOrder } : { MOE: moeOrder };

    for (const [orderName, strokeOrder] of Object.entries(orders)) {
      for (const [positionName, position] of Object.entries(POSITIONS)) {
        const name = `${char} in ${orderName} order, ${positionName}`;

        if (!canBeWritten(data.medians, position)) {
          tally[positionName].skipped += 1;
          it.skip(name);
          continue;
        }

        it(name, { timeout: 120000 }, async () => {
          const result = await browsers.use((page) =>
            writeChar(page, char, strokeOrder, position, makeRandom(name)),
          );
          const passed =
            result.status === 'No mistakes' && result.orderNoteShown === (orderName === 'mainland');
          tally[positionName][passed ? 'passed' : 'failed'] += 1;

          assert.equal(
            result.status,
            'No mistakes',
            `stroke ${result.strokesDrawn} of ${strokeOrder.length} was not accepted`,
          );
          assert.equal(
            result.orderNoteShown,
            orderName === 'mainland',
            'the note about the mainland order should show for that order only',
          );
        });
      }
    }
  }
});
