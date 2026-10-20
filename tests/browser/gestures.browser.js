// The gestures on the writing area (src/gestures.js) in a real browser: a
// long hold shows the next stroke as a hint without counting as a stroke,
// and a swipe up starts the character again. And a stroke begun during
// Animate.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  startApp,
  startBrowsers,
  startWriting,
  writingArea,
  drawStroke,
  loadStrokeData,
  statusText,
  waitUntil,
} from './harness.js';

const HINT_SHOWN = `document.getElementById('writing-area').hasAttribute('data-hint-shown')`;
const STATUS_IS = (text) => `[document.getElementById('stroke-count').textContent, document.getElementById('status').textContent].filter(Boolean).join(' · ') === ${JSON.stringify(text)}`;
const DRAWN_STROKES = `document.querySelectorAll('#writing-area .drawn-strokes path').length`;

describe('gestures on the writing area', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('a long hold shows a hint and is not a stroke; a swipe up starts again', async () => {
    await startWriting(page, '十');
    const area = await writingArea(page);
    const middle = { x: area.x + area.size / 2, y: area.y + area.size / 2 };
    const mouse = (type, point, extra) =>
      page.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', ...extra });

    // Held still, with a wobble too small to matter, for longer than HOLD_MS.
    assert.equal(await page.evaluate(HINT_SHOWN), false);
    await mouse('mousePressed', middle, { clickCount: 1 });
    await mouse('mouseMoved', { x: middle.x + 3, y: middle.y + 2 }, { buttons: 1 });
    await waitUntil(page, HINT_SHOWN, 'the hint');
    await mouse('mouseMoved', { x: middle.x + 40, y: middle.y + 40 }, { buttons: 1 });
    await mouse('mouseReleased', middle, { clickCount: 1 });
    // The quiz restarts at the same stroke after a hold, busy meanwhile.
    await waitUntil(page, `!document.getElementById('writing-area').hasAttribute('data-busy')`, 'the quiz restarted');
    assert.equal(await statusText(page), '1/2 · Write the first stroke', 'the hold was taken for a stroke');

    // The character can still be written after the hint.
    const [first] = loadStrokeData('十').medians;
    assert.equal(await drawStroke(page, area, first), '2/2 · No mistakes');
    assert.equal(await page.evaluate(DRAWN_STROKES), 1);

    // The same line up drawn slowly (about a second) is a stroke, a wrong
    // one, and wipes nothing (tester 3, 2026-10-20).
    const upward = [[512, -50], [512, 300], [512, 800]];
    assert.equal(await drawStroke(page, area, upward, { pauseMs: 170 }), '2/2 · 1 mistake');
    assert.equal(await page.evaluate(DRAWN_STROKES), 1);

    // Drawn quickly, it is a swipe up, from near the bottom to near the top
    // (in the stroke data's units: y runs upward from -124 to 900).
    assert.equal(await drawStroke(page, area, upward), '1/2 · 1 mistake');
    assert.equal(await page.evaluate(DRAWN_STROKES), 0);
  });

  it('a stroke begun during Animate stops it and is written', async () => {
    // Tester 2, 2026-10-17: the writing area waited for the animation.
    await startWriting(page, '十');
    const area = await writingArea(page);
    await page.evaluate(`document.getElementById('animate-button').click()`);
    await waitUntil(page, `document.getElementById('status').textContent === 'Watch the stroke order…'`, 'the animation');
    const [first, second] = loadStrokeData('十').medians;
    await drawStroke(page, area, first);
    // (The line says "1/2" first, as the quiz starts, then the stroke counts.)
    await waitUntil(page, `${STATUS_IS('2/2 · No mistakes')}`, 'the first stroke taken');
    assert.equal(await page.evaluate(DRAWN_STROKES), 1);
    // The quiz goes on as usual, and the animation does not come back.
    assert.equal(await drawStroke(page, area, second), 'No mistakes');

    // A stroke whose start never reaches Hanzi Writer by itself (pointer
    // events alone, made in the page, as when a finger's "touchstart" comes
    // before the quiz listens): the points kept are handed on.
    await page.evaluate(`document.getElementById('animate-button').click()`);
    await waitUntil(page, `document.getElementById('status').textContent === 'Watch the stroke order…'`, 'the animation again');
    const padding = area.size * 0.06;
    const scale = (area.size - 2 * padding) / 1024;
    const onScreen = first.map(([x, y]) => ({ x: area.x + padding + x * scale, y: area.y + padding + (900 - y) * scale }));
    await page.evaluate(`(() => {
      const area = document.getElementById('writing-area');
      const points = ${JSON.stringify(onScreen)};
      const fire = (type, point) => area.dispatchEvent(new PointerEvent(type, {
        bubbles: true, isPrimary: true, button: type === 'pointermove' ? -1 : 0, clientX: point.x, clientY: point.y,
      }));
      fire('pointerdown', points[0]);
      for (const point of points.slice(1)) fire('pointermove', point);
      fire('pointerup', points.at(-1));
    })()`);
    await waitUntil(page, `${STATUS_IS('2/2 · No mistakes')}`, 'the stroke handed on');
  });

  it('before a steeply rising stroke, a swipe up must be longer', async () => {
    // 滿: after the two dots of 氵 comes its rising stroke (提).
    await startWriting(page, '滿');
    const area = await writingArea(page);
    const [dot1, dot2] = loadStrokeData('滿').medians;
    await drawStroke(page, area, dot1);
    assert.equal(await drawStroke(page, area, dot2), '3/14 · No mistakes');

    // Rising by about 0.45 of the writing area (524 of the stroke data's
    // units, which fill 0.88 of it): enough for a swipe elsewhere, not here.
    // It is graded as a stroke instead, a wrong one.
    assert.equal(await drawStroke(page, area, [[512, -60], [512, 200], [512, 464]]), '3/14 · 1 mistake');
    assert.equal(await page.evaluate(DRAWN_STROKES), 2);

    // From the very bottom to the very top: a swipe even here.
    assert.equal(await drawStroke(page, area, [[512, -110], [512, 400], [512, 880]]), '1/14 · 1 mistake');
    assert.equal(await page.evaluate(DRAWN_STROKES), 0);
  });
});
