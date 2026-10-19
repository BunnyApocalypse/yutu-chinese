// The Progress tab in a real browser: opened from the menu, today's
// numbers, the range, a tapped day, and the switch for counting 們 and 们
// as two (only with both scripts). The counting itself is tested in
// tests/progress.test.js.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, tap, textOf, isShown, waitUntil } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

describe('the Progress tab', { concurrency: false }, () => {
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

  // A card that has been reviewed, next due in `days` days.
  const card = (id, wordId, type, days) => {
    const now = Date.now();
    return {
      id,
      wordId,
      type,
      due: now + days * DAY,
      firstReviewedAt: now - 60000,
      lastReviewedAt: now - 60000,
      fsrsState: {
        due: new Date(now + days * DAY).toISOString(),
        stability: days,
        difficulty: 5,
        elapsed_days: 0,
        scheduled_days: days,
        learning_steps: 0,
        reps: 3,
        lapses: 0,
        state: 2,
        last_review: new Date(now - 60000).toISOString(),
      },
    };
  };

  const openProgress = async () => {
    await tap(page, 'progress-tab');
    await waitUntil(page, `document.querySelector('#progress-today b')`, 'the Progress tab');
  };

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // 大, learned two days ago; 他們, learned today (a minute's lesson) and
    // written in simplified too; 學, not learned. Today: two cards reviewed,
    // one of them missed, a minute each.
    await inDatabase(`
      const now = Date.now();
      stores.words.put({ id: '大|dà', traditional: '大', simplified: '大', pinyin: 'dà', definition: 'big', order: 0, addedAt: 1, learnedAt: now - 2 * ${DAY} });
      stores.words.put({ id: '他們|tāmen', traditional: '他們', simplified: '他们', pinyin: 'tāmen', definition: 'they', order: 1, addedAt: 1, learnedAt: now - 120000, learnDuration: 60000 });
      stores.words.put({ id: '學|xué', traditional: '學', simplified: '学', pinyin: 'xué', definition: 'to study', order: 2, addedAt: 1 });
      for (const card of ${JSON.stringify([
        card('大|dà#meaning', '大|dà', 'meaning', 30),
        card('他們|tāmen#meaning', '他們|tāmen', 'meaning', 2),
        card('他們|tāmen#writing#simplified', '他們|tāmen', 'writing', 1),
      ])}) {
        stores.cards.put(card);
      }
      stores.reviews.put({ id: 'r1', cardId: '大|dà#meaning', wordId: '大|dà', type: 'meaning', time: now - 60000, grade: 3, duration: 60000 });
      stores.reviews.put({ id: 'r2', cardId: '他們|tāmen#meaning', wordId: '他們|tāmen', type: 'meaning', time: now - 30000, grade: 1, duration: 60000 });
      stores.settings.put({ key: 'enabledTypes', value: ['meaning', 'writing'] });
      stores.settings.put({ key: 'streaks', value: true });
      // A day counts after one card, so today makes a streak of one.
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

  it('opens from the menu with today\'s numbers', async () => {
    await openProgress();
    assert.equal(await textOf(page, 'place-title'), 'Progress');
    assert.equal(await isShown(page, 'progress-panel'), true);
    assert.equal(await isShown(page, 'study-area'), false);
    const tiles = await page.evaluate(`[...document.querySelectorAll('#progress-today .progress-tile')].map((tile) => tile.textContent)`);
    // Two reviews and a lesson of a minute each; one answer of two right.
    assert.deepEqual(tiles, ['2cards reviewed', '1word learned', '3 minstudied', '50%answers right']);
  });

  it('counts the cards of the kinds switched on by stage', async () => {
    const rows = await page.evaluate(
      `[...document.querySelectorAll('#progress-stages .stage-row')].map((row) => [row.firstChild.textContent, row.querySelector('.stage-bar').getAttribute('aria-label'), row.lastChild.textContent])`,
    );
    // Writing: the traditional cards (the harness studies in traditional)
    // aren't studied yet, so all three are new.
    assert.deepEqual(rows, [
      ['Meaning', '1 new, 0 learning, 1 young, 1 mature', '3'],
      ['Writing', '3 new, 0 learning, 0 young, 0 mature', '3'],
      ['All cards', '4 new, 0 learning, 1 young, 1 mature', '6'],
    ]);
  });

  it('shows a month as a calendar and a year as a strip; a tapped day says what was done', async () => {
    assert.equal(await page.evaluate(`document.querySelector('#progress-range [aria-pressed="true"]').textContent`), 'Month');
    assert.equal(await page.evaluate(`document.querySelectorAll('#progress-days .progress-calendar.month i:not(.blank)').length`), 30);
    await page.evaluate(`document.querySelector('#progress-days .today').click()`);
    assert.match(await page.evaluate(`document.querySelector('#progress-days .progress-readout').textContent`), /: 2 cards, 1 word learned, 3 min\.$/);
    assert.equal(await page.evaluate(`document.querySelector('#progress-days .progress-big-line b').textContent`), '1 day');
    await page.evaluate(`document.querySelector('#progress-range [data-range="year"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('#progress-range [aria-pressed="true"]').textContent`), 'Year');
    assert.equal(await page.evaluate(`document.querySelectorAll('#progress-days .progress-calendar.strip i:not(.blank)').length`), 365);
  });

  it('counts characters in the learner\'s script, or apart with the switch', async () => {
    const ends = () => page.evaluate(`[...document.querySelectorAll('#progress-growth .end-label')].map((label) => label.textContent)`);
    // 大 他 們: the harness learns both scripts, cards in traditional.
    assert.equal(await isShown(page, 'progress-apart-label'), true);
    assert.deepEqual(await ends(), ['3 characters', '2 words']);
    // 他们 has been written in simplified too: 们 counts as well.
    await tap(page, 'progress-apart');
    // The setting is saved before the chart is drawn again.
    await waitUntil(page, `document.querySelector('#progress-growth .end-label').textContent === '4 characters'`, 'the chart drawn again');
    assert.deepEqual(await ends(), ['4 characters', '2 words']);
    // Kept when the tab is opened again.
    await tap(page, 'review-tab');
    await openProgress();
    assert.equal(await page.evaluate(`document.getElementById('progress-apart').checked`), true);
    assert.deepEqual(await ends(), ['4 characters', '2 words']);
  });

  it('has no switch for someone learning one script', async () => {
    await inDatabase(`stores.settings.put({ key: 'bothScripts', value: false });`);
    await reloadApp(page);
    await openProgress();
    assert.equal(await isShown(page, 'progress-apart-label'), false);
    // The switch left on means nothing then.
    assert.deepEqual(
      await page.evaluate(`[...document.querySelectorAll('#progress-growth .end-label')].map((label) => label.textContent)`),
      ['3 characters', '2 words'],
    );
  });
});
