// Streaks in a real browser: the streak screen the first time a day counts,
// only once that day, the line at the end of Review, and the setting that
// switches both off. The counting itself is tested in tests/streak.test.js.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, openSettings, tap, textOf, isShown, waitUntil } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

// One browser, and the steps in order: each builds on the one before.
describe('streaks', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Runs JavaScript in the page with `stores`: the database's stores, by name, open for writing.
  const inDatabase = (body) =>
    page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction(['words', 'cards', 'reviews', 'settings'], 'readwrite');
        const stores = {
          words: tx.objectStore('words'),
          cards: tx.objectStore('cards'),
          reviews: tx.objectStore('reviews'),
          settings: tx.objectStore('settings'),
        };
        ${body}
        tx.oncomplete = () => {
          opening.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    })`);

  // A meaning card learned long ago and due now.
  const dueCard = (wordId) => {
    const now = Date.now();
    return {
      id: `${wordId}#meaning`,
      wordId,
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
  };

  // Taps the meaning card on screen and grades it Good.
  async function gradeMeaningCard() {
    await waitUntil(page, `!document.getElementById('card-face').hidden && document.getElementById('card-face').textContent !== ''`, 'a card');
    await page.evaluate(`document.getElementById('card-face').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    await page.evaluate(`[...document.querySelectorAll('#grade-row .grade')].find((button) => button.firstChild.textContent === 'Good').click()`);
  }

  const streakOpen = () => page.evaluate(`document.getElementById('streak-dialog').open`);

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // Two words with a meaning card due each, and one card reviewed on each
    // of the two days before. A day counts here after one card, so grading
    // one today makes three days in a row.
    await inDatabase(`
      for (const [char, pinyin, definition] of [['大', 'da4', 'big'], ['小', 'xiao3', 'small']]) {
        stores.words.put({ id: char + '|' + pinyin, traditional: char, simplified: char, pinyin, definition, order: 0, addedAt: 1, learnedAt: 1 });
      }
      for (const card of ${JSON.stringify([dueCard('大|da4'), dueCard('小|xiao3')])}) {
        stores.cards.put(card);
      }
      for (const [index, ago] of [${DAY}, ${2 * DAY}].entries()) {
        stores.reviews.put({ id: 'old' + index, cardId: '大|da4#meaning', wordId: '大|da4', type: 'meaning', time: Date.now() - ago, grade: 3 });
      }
      stores.settings.put({ key: 'enabledTypes', value: ['meaning'] });
      stores.settings.put({ key: 'streaks', value: true });
      stores.settings.put({ key: 'streakCards', value: 1 });
    `);
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('shows the streak screen once the day counts', async () => {
    await page.evaluate(`document.getElementById('review-tab').click()`);
    await gradeMeaningCard();
    await waitUntil(page, `document.getElementById('streak-dialog').open`, 'the streak screen');
    assert.equal(await textOf(page, 'streak-number'), '3');
    assert.equal(await textOf(page, 'streak-label'), 'days in a row');
    assert.match(await textOf(page, 'streak-detail'), /Today counts: 1 card reviewed\.\s*Your best yet\./);
    await tap(page, 'streak-continue');
    assert.equal(await streakOpen(), false);
  });

  it('does not show it again the same day, and says the streak at the end of Review', async () => {
    await gradeMeaningCard();
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    assert.equal(await streakOpen(), false);
    assert.match(await textOf(page, 'done-message'), /Streak: 3 days in a row\./);
  });

  it('can be switched off in Settings', async () => {
    await openSettings(page, 'settings-studying');
    assert.equal(await isShown(page, 'streak-goal'), true);
    await page.evaluate(`(() => {
      const box = document.getElementById('streaks-checkbox');
      box.checked = false;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await isShown(page, 'streak-goal'), false);
    await tap(page, 'settings-close');
    await waitUntil(page, `!document.getElementById('done-message').textContent.includes('Streak')`, 'the streak line to go');
  });
});
