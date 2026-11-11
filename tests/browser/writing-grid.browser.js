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
  loadStrokeData,
} from './harness.js';
import { grassTopsOf, chuiOf } from '../../src/shortcuts.js';
import { steepDotsOf } from '../../src/strokeMatch.js';
import { innerBoxForms } from '../../src/innerBox.js';

// Characters with two accepted stroke orders (the first eleven; 愉's 忄 the
// big set has only in the mainland order), some with one,
// some with strokes in a second shape (食房藍雨聽飽遍, also written so, and 食
// and 飽 with the dot under 人 steeply down), and some with 艹 (草花藍觀, the
// 十 十 of 垂 in 郵華, and 薦 from the big set, also written with it in three
// strokes, 薦 also in the big set's 丨 一 丨 一), and some with a
// second form (充流育, also written in the big set's), and some with the box
// of 骨 (骨體滑, also written in its other orders and shapes; not 髒, whose
// 9th stroke in its mainland shape was refused at half size, bottom right,
// with or without this). Half the size is no longer followed (MIN_SCALE in
// src/frame.js, 2026-11-08): the owner writes at 0.6 of the box and up.
const CHARS = Array.from(process.env.CHARS || '學覺我馬國忙錢愉母出長麼這謝子好食房藍雨草花觀聽充流育骨體滑郵華飽薦遍方旁睡北');

// Where and how big the character is written, compared with the centered
// reference: `scale` times the size, moved `dx` to the right and `dy` up, in
// the stroke data's units (the box is 1024 across).
const POSITIONS = {
  'centered': { scale: 1, dx: 0, dy: 0 },
  'small, top left': { scale: 0.6, dx: -20, dy: 330 },
  'small, bottom right': { scale: 0.65, dx: 380, dy: -40 },
  'shifted right': { scale: 1, dx: 190, dy: 0 },
  'shifted left': { scale: 1, dx: -190, dy: 0 },
  'larger, low': { scale: 1.2, dx: -90, dy: -110 },
};

// The stroke orders are written at every position above; the other ways
// (second shapes, 艹 in three strokes, second forms, the box of 骨) only at
// these two, which keeps the grid to a few minutes (2026-11-05: it had grown
// to 590 characters written, nearly six minutes on four browsers).
const FEWER_POSITIONS = ['centered', 'small, top left'];

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
// `shapes`: the second shapes to write strokes in (altShapes), or none.
// An entry of `strokeOrder` may be a pair of stroke numbers, written as one
// stroke (the level stroke of 艹 in three strokes).
async function writeChar(page, char, strokeOrder, position, random, shapes = {}) {
  const data = loadStrokeData(char);
  await startWriting(page, char);
  const area = await writingArea(page);
  let status = '';
  let strokesDrawn = 0;
  for (const strokeNum of strokeOrder) {
    // If the app has shrunk the strokes so far, to fit a character begun too
    // big (zoomToFit in src/frame.js), a hand goes on next to them, at their
    // new size.
    const zoom = await page.evaluate(
      `document.getElementById('writing-area').getAttribute('data-zoom')`,
    );
    const [zoomScale, zoomX, zoomY] = zoom ? zoom.split(' ').map(Number) : [1, 0, 0];
    const median = Array.isArray(strokeNum)
      ? strokeNum.flatMap((part) => data.medians[part])
      : shapes[strokeNum] || data.medians[strokeNum];
    const points = median.map(([x, y]) => [
      zoomScale * (position.scale * x + position.dx) + zoomX + (random() * 2 - 1) * JITTER,
      zoomScale * (position.scale * y + position.dy) + zoomY + (random() * 2 - 1) * JITTER,
    ]);
    status = await drawStroke(page, area, points);
    strokesDrawn += 1;
    // After the last stroke the status line is "No mistakes"; until then it
    // is "3/7 · No mistakes" for as long as every stroke has been accepted.
    if (!/no mistakes$/i.test(status)) {
      break;
    }
  }
  return {
    status,
    strokesDrawn,
    zoomed: await page.evaluate(`document.getElementById('writing-area').hasAttribute('data-zoom')`),
  };
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
    // (The big set's 忄 has the Taiwan order second: inTaiwanOrder. A 方
    // alone has its ノ before its ㇆ second: withFangInEitherOrder.)
    const orders = !data.altOrder
      ? { MOE: moeOrder }
      : data.altOrderIsTaiwan
        ? { MOE: data.altOrder, mainland: moeOrder }
        : data.altOrderIsFang
          ? { MOE: moeOrder, 'other (方 ノ first, 垂 丨 late)': data.altOrder }
          : { MOE: moeOrder, mainland: data.altOrder };
    const ways = Object.entries(orders).map(([orderName, strokeOrder]) => ({
      label: `${orderName} order`,
      strokeOrder,
      everywhere: true,
    }));
    if (data.altShapes) {
      ways.push({ label: 'MOE order, mainland shapes', strokeOrder: moeOrder, shapes: data.altShapes });
    }
    // The dot under 人 of 食 and 飠 written straight down (steepDotsOf).
    if ('食飽'.includes(char)) {
      const [, straightDown] = steepDotsOf(data.altShapes[2]);
      ways.push({ label: 'MOE order, dot under 人 straight down', strokeOrder: moeOrder, shapes: { 2: straightDown } });
    }
    // The second form, every stroke its own (src/quiz.js, otherFormFor).
    if (data.altForm) {
      const { medians } = data.altForm;
      ways.push({ label: 'second form', strokeOrder: medians.map((median, index) => index), shapes: { ...medians } });
    }
    // The box of 骨 written in another way (src/innerBox.js), and with the
    // form's own other shapes.
    innerBoxForms(char, data).forEach(({ medians, altShapes }, index) => {
      const strokeOrder = medians.map((median, strokeNum) => strokeNum);
      ways.push({ label: `box of 骨, way ${index + 1}`, strokeOrder, shapes: { ...medians } });
      if (altShapes) {
        ways.push({ label: `box of 骨, way ${index + 1}, other shapes`, strokeOrder, shapes: { ...medians, ...altShapes } });
      }
    });
    // 艹 in three strokes: the level stroke across, then the two uprights;
    // or the left upright, the level stroke, the right upright.
    for (const top of grassTopsOf(data)) {
      const [before, after] = [moeOrder.slice(0, top), moeOrder.slice(top + 4)];
      const level = [top + 1, top + 2];
      ways.push({ label: 'MOE order, 艹 in three strokes', strokeOrder: [...before, level, top, top + 3, ...after] });
      ways.push({ label: 'MOE order, 艹 in three strokes, upright first', strokeOrder: [...before, top, level, top + 3, ...after] });
    }

    // 匕's branch written right to left (reversedShapes in src/shortcuts.js).
    for (const [strokeNum, shapesToWrite] of Object.entries(data.reversedShapes ?? {})) {
      shapesToWrite.forEach((shape, index) => {
        ways.push({ label: `MOE order, 匕 branch right to left, way ${index + 1}`, strokeOrder: moeOrder, shapes: { [strokeNum]: shape } });
      });
    }
    // 垂 with the middle level stroke across both halves, its 丨 after the
    // next level stroke (src/quiz.js, grassLevelFor).
    for (const { at, whole } of chuiOf(data)) {
      if (!whole) {
        const before = moeOrder.slice(0, at + 2);
        const after = moeOrder.slice(at + 9);
        ways.push({
          label: '垂 level across, 丨 late',
          strokeOrder: [...before, [at + 4, at + 5], at + 3, at + 6, at + 7, at + 2, at + 8, ...after],
        });
      }
    }

    for (const { label, strokeOrder, shapes, everywhere } of ways) {
      for (const [positionName, position] of Object.entries(POSITIONS)) {
        if (!everywhere && !FEWER_POSITIONS.includes(positionName)) {
          continue;
        }
        const name = `${char} in ${label}, ${positionName}`;

        if (!canBeWritten(data.medians, position)) {
          tally[positionName].skipped += 1;
          it.skip(name);
          continue;
        }

        it(name, { timeout: 120000 }, async () => {
          const result = await browsers.use((page) =>
            writeChar(page, char, strokeOrder, position, makeRandom(name), shapes),
          );
          const passed = result.status === 'No mistakes';
          tally[positionName][passed ? 'passed' : 'failed'] += 1;

          assert.equal(
            result.status,
            'No mistakes',
            `stroke ${result.strokesDrawn} of ${strokeOrder.length} was not accepted`,
          );
        });
      }
    }
  }

  // A character begun so big that the rest of it would land beyond the
  // writing area: the strokes so far shrink to make room (a tester, twice,
  // 2026-10-17). Its left part is written 1.5 times the size, so big that
  // strokes of the right part would begin beyond the area; the rest is
  // written next to it as it then is.
  const TOO_BIG = {
    鋼: { scale: 1.5, dx: 0, dy: -310 },
    好: { scale: 1.5, dx: 190, dy: -250 },
  };
  for (const [char, position] of Object.entries(TOO_BIG)) {
    const name = `${char} begun too big is zoomed out and can be finished`;
    it(name, { timeout: 120000 }, async () => {
      const { medians } = loadStrokeData(char);
      assert.ok(!canBeWritten(medians, position), 'without zooming out, this could not be finished');
      const strokeOrder = medians.map((median, index) => index);
      const result = await browsers.use((page) => writeChar(page, char, strokeOrder, position, makeRandom(name)));
      assert.equal(
        result.status,
        'No mistakes',
        `stroke ${result.strokesDrawn} of ${strokeOrder.length} was not accepted`,
      );
      assert.ok(result.zoomed, 'the strokes should have been shrunk');
    });
  }

  // A wrong stroke, written for another character, is not taken for the
  // right one in a tiny character (the owner, 2026-11-08). 中 at 0.75 of the
  // size: its first stroke, then 和's second where 中's ㇕ is expected. That
  // fits 中 written at under half the size, which was accepted.
  const SMALL_CENTERED = { scale: 0.75, dx: 0.25 * 512, dy: 0.25 * 388 };
  it('a wrong stroke is not taken for the right one written tiny', { timeout: 60000 }, async () => {
    const name = 'a wrong stroke is not taken for the right one written tiny';
    const random = makeRandom(name);
    const zhong = loadStrokeData('中').medians;
    const wrong = loadStrokeData('和').medians[1];
    const status = await browsers.use(async (page) => {
      await startWriting(page, '中');
      const area = await writingArea(page);
      const draw = (median) =>
        drawStroke(
          page,
          area,
          median.map(([x, y]) => [
            SMALL_CENTERED.scale * x + SMALL_CENTERED.dx + (random() * 2 - 1) * JITTER,
            SMALL_CENTERED.scale * y + SMALL_CENTERED.dy + (random() * 2 - 1) * JITTER,
          ]),
        );
      await draw(zhong[0]);
      return draw(wrong);
    });
    assert.doesNotMatch(status, /no mistakes$/i, '和\'s stroke was accepted as 中\'s');
    // Written right at that size, 中 is accepted.
    const strokeOrder = zhong.map((median, index) => index);
    const result = await browsers.use((page) => writeChar(page, '中', strokeOrder, SMALL_CENTERED, random));
    assert.equal(result.status, 'No mistakes', `stroke ${result.strokesDrawn} of 中 was not accepted`);
  });
});
