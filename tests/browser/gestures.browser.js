// The gestures on the writing area (src/gestures.js) in a real browser: a
// long hold shows the next stroke as a hint without counting as a stroke,
// and a swipe up starts the character again.
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

    // A swipe up, from near the bottom to near the top (in the stroke
    // data's units: y runs upward from -124 to 900).
    assert.equal(await drawStroke(page, area, [[512, -50], [512, 300], [512, 800]]), '1/2 · Write the first stroke');
    assert.equal(await page.evaluate(DRAWN_STROKES), 0);
  });

  it('before a steeply rising stroke, a swipe up must be longer', async () => {
    // 滿: after the two dots of 氵 comes its rising stroke (提).
    await startWriting(page, '滿');
    const area = await writingArea(page);
    const [dot1, dot2] = loadStrokeData('滿').medians;
    await drawStroke(page, area, dot1);
    assert.equal(await drawStroke(page, area, dot2), '3/14 · No mistakes');

    // Rising by about 0.6 of the writing area (698 of the stroke data's
    // units, which fill 0.88 of it): enough for a swipe elsewhere, not here.
    // It is graded as a stroke instead, a wrong one.
    assert.equal(await drawStroke(page, area, [[512, -60], [512, 300], [512, 638]]), '3/14 · 1 mistake');
    assert.equal(await page.evaluate(DRAWN_STROKES), 2);

    // From the very bottom to the very top: a swipe even here.
    assert.equal(await drawStroke(page, area, [[512, -110], [512, 400], [512, 880]]), '1/14 · 1 mistake');
    assert.equal(await page.evaluate(DRAWN_STROKES), 0);
  });
});
