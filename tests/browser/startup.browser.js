// Opening the app (the owner, 2026-10-26: on a tablet an empty writing area
// showed for seconds while every review was read): "Loading…" until the
// first screen is ready, and the first card without waiting for the
// reviews, which only the streak needs.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, waitUntil } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

// Put into the page before the app's own code: holds back every read of the
// cards and of the reviews, by keeping a transaction that writes to each
// open (reads wait for it) until window.__release('cards') or ('reviews').
const HOLD_BACK = `
  window.__released = new Set();
  window.__release = (name) => window.__released.add(name);
  const opening = indexedDB.open('hanzi-trainer');
  opening.onsuccess = () => {
    for (const name of ['cards', 'reviews']) {
      const store = opening.result.transaction([name], 'readwrite').objectStore(name);
      (function keepOpen() {
        if (!window.__released.has(name)) {
          store.get('nothing').onsuccess = keepOpen;
        }
      })();
    }
  };
`;

describe('opening the app', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // A meaning card due, and a review of it long ago.
    const now = Date.now();
    const card = {
      id: '大|da4#meaning',
      wordId: '大|da4',
      type: 'meaning',
      due: now - DAY,
      firstReviewedAt: now - 100 * DAY,
      lastReviewedAt: now - 10 * DAY,
      fsrsState: {
        due: new Date(now - DAY).toISOString(),
        stability: 10,
        difficulty: 5,
        elapsed_days: 10,
        scheduled_days: 10,
        learning_steps: 0,
        reps: 5,
        lapses: 0,
        state: 2,
        last_review: new Date(now - 10 * DAY).toISOString(),
      },
    };
    await page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction(['words', 'cards', 'reviews', 'settings'], 'readwrite');
        tx.objectStore('words').put({ id: '大|da4', traditional: '大', simplified: '大', pinyin: 'da4', definition: 'big', order: 0, addedAt: 1, learnedAt: 1 });
        tx.objectStore('cards').put(${JSON.stringify(card)});
        tx.objectStore('reviews').put({ id: 'old', cardId: '大|da4#meaning', wordId: '大|da4', type: 'meaning', time: ${now - 10 * DAY}, grade: 3 });
        tx.objectStore('settings').put({ key: 'enabledTypes', value: ['meaning'] });
        tx.objectStore('settings').put({ key: 'streaks', value: true });
        tx.objectStore('settings').put({ key: 'streakCards', value: 1 });
        tx.oncomplete = () => {
          opening.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    })`);
    await page.send('Page.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', { source: HOLD_BACK });
    await page.send('Page.reload');
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  const shown = (selector) => `(() => {
    const element = document.querySelector('${selector}');
    return Boolean(element) && getComputedStyle(element).display !== 'none' && getComputedStyle(element).visibility !== 'hidden';
  })()`;

  it('says "Loading…" and hides the writing area until the card is ready', async () => {
    await waitUntil(page, `typeof window.__release === 'function' && document.getElementById('starting-note')?.textContent === 'Loading…'`, '"Loading…"');
    assert.equal(await page.evaluate(shown('#starting-note')), true);
    assert.equal(await page.evaluate(shown('#study-area')), false);
    assert.equal(await page.evaluate(shown('#review-header')), false);
  });

  it('shows the first card before the reviews are read', async () => {
    await page.evaluate(`window.__release('cards')`);
    await waitUntil(page, `document.getElementById('card-face').textContent !== ''`, 'the card');
    assert.equal(await page.evaluate(shown('#starting-note')), false);
    assert.equal(await page.evaluate(shown('#study-area')), true);
    assert.equal(await page.evaluate(`window.__released.has('reviews')`), false);
  });

  // Not graded while they are held back: saving the review would wait too.
  it('counts the streak once the reviews are read', async () => {
    await page.evaluate(`window.__release('reviews')`);
    await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    await page.evaluate(`[...document.querySelectorAll('#grade-row .grade')].find((button) => button.firstChild.textContent === 'Good').click()`);
    // The first streak ever: the screen, with today counted.
    await waitUntil(page, `document.getElementById('streak-dialog').open`, 'the streak screen');
    assert.equal(await page.evaluate(`document.getElementById('streak-number').textContent`), '1');
  });
});
