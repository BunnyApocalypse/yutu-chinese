// The writing area on a short phone (the owner, 2026-10-27: "if the canvas
// isn't optimally large on small phones then thats a problem"): on a 360×640
// phone it is as wide as the screen allows (328px), and the page never
// scrolls, in the lesson step that needs the most room (a word in its other
// script, its note beside "I know this word") and in Review once graded and
// while practicing (one row of buttons under the area, never two). See
// ROOM_ABOVE_BELOW in src/wordFlow.js and docs/pitfalls.md.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, writingArea, drawStroke, loadStrokeData, openLearn, tap, waitUntil } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

describe('the writing area on a short phone', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  const inDatabase = (body) =>
    page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction(['words', 'cards', 'settings'], 'readwrite');
        const stores = { words: tx.objectStore('words'), cards: tx.objectStore('cards'), settings: tx.objectStore('settings') };
        ${body}
        tx.oncomplete = () => {
          opening.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    })`);

  // The size of the area, or of the card's face in its place, and how far
  // the page would scroll.
  const measure = () =>
    page.evaluate(`({
      size: Math.round(document.getElementById(document.getElementById('card-face').hidden ? 'writing-area' : 'card-face').getBoundingClientRect().width),
      scroll: document.documentElement.scrollHeight - innerHeight,
    })`);

  const writable = `document.getElementById('stroke-count').textContent.startsWith('1/') && !document.getElementById('writing-area').hasAttribute('data-busy')`;

  async function write(char) {
    await waitUntil(page, writable, 'the character to be writable');
    const area = await writingArea(page);
    for (const median of loadStrokeData(char).medians) {
      await drawStroke(page, area, median);
    }
  }

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    const now = Date.now();
    const due = {
      id: '大|da4#writing',
      wordId: '大|da4',
      type: 'writing',
      due: now - DAY,
      firstReviewedAt: now - 100 * DAY,
      lastReviewedAt: now - 10 * DAY,
      fsrsState: { due: new Date(now - DAY).toISOString(), stability: 10, difficulty: 5, elapsed_days: 10, scheduled_days: 10, learning_steps: 0, reps: 5, lapses: 0, state: 2, last_review: new Date(now - 10 * DAY).toISOString() },
    };
    // 門 waiting in Learn, learned in simplified among traditional words, so
    // that its cards say so ("simp. 简体"); 大 due in Review.
    await inDatabase(`
      stores.words.put({ id: '門|men2', traditional: '門', simplified: '门', pinyin: 'men2', definition: 'door; gate; opening; a family or school of thought', order: 0, addedAt: 1, cardScript: 'simplified' });
      stores.words.put({ id: '大|da4', traditional: '大', simplified: '大', pinyin: 'da4', definition: 'big', order: 1, addedAt: 1, learnedAt: 1 });
      stores.cards.put(${JSON.stringify(due)});
      stores.settings.put({ key: 'bothScripts', value: true });
      stores.settings.put({ key: 'enabledTypes', value: ['tone', 'writing'] });
    `);
    await page.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 1, mobile: true });
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('is as wide as the screen allows in Review, graded and practicing, without scrolling', { timeout: 60000 }, async () => {
    await write('大');
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    assert.deepEqual(await measure(), { size: 328, scroll: 0 });
    await tap(page, 'practice-again-button');
    await waitUntil(page, writable, 'practice');
    assert.deepEqual(await measure(), { size: 328, scroll: 0 });
  });

  it('is the same in a lesson, with the word in its other script, without scrolling', { timeout: 60000 }, async () => {
    await openLearn(page);
    await waitUntil(page, `document.getElementById('card-type').textContent.endsWith('step 1 of 5')`, 'the lesson');
    assert.equal(await page.evaluate(`document.getElementById('script-flag').textContent`), 'simp. 简体');
    assert.deepEqual(await measure(), { size: 328, scroll: 0 });
    await tap(page, 'lesson-next-button');
    await waitUntil(page, `document.querySelector('#card-face .tone-char')`, 'the tones');
    await page.evaluate(`document.querySelector('#tone-buttons [data-tone="2"]').click()`);
    await waitUntil(page, `!document.getElementById('lesson-next-button').hidden`, 'Next step');
    // "Next step" in the tone buttons' place: one row.
    assert.equal(await page.evaluate(`document.getElementById('tone-buttons').hidden`), true);
    assert.deepEqual(await measure(), { size: 328, scroll: 0 });
    await tap(page, 'lesson-next-button');
    await write('门');
    await waitUntil(page, `!document.getElementById('next-button').hidden`, 'Next step');
    assert.deepEqual(await measure(), { size: 328, scroll: 0 });
  });
});
