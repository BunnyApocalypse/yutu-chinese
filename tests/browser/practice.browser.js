// Practice at the end of Review (tester 4, 2026-10-27; the owner chose
// practice that saves nothing): "Practice again" goes through today's cards,
// those missed today first, with "Next card" in the grades' place; at its
// end "Practice all my cards" goes through every card. Nothing is saved.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, writingArea, drawStroke, loadStrokeData, tap, textOf, isShown, waitUntil } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe('practice at the end of Review', { concurrency: false }, () => {
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
        const result = {};
        ${body}
        tx.oncomplete = () => {
          opening.result.close();
          resolve(JSON.stringify(result));
        };
        tx.onerror = () => reject(tx.error);
      };
    })`).then(JSON.parse);

  // What is saved of the cards and reviews.
  const saved = () =>
    inDatabase(`
      stores.cards.getAll().onsuccess = (event) => { result.cards = event.target.result; };
      stores.reviews.getAll().onsuccess = (event) => { result.reviews = event.target.result; };
    `);

  // A card not due for days, last reviewed `ago` milliseconds ago, with
  // FSRS stability `stability` (in days).
  const card = (id, wordId, type, ago, stability) => {
    const now = Date.now();
    return {
      id,
      wordId,
      type,
      due: now + 5 * DAY,
      firstReviewedAt: now - 100 * DAY,
      lastReviewedAt: now - ago,
      fsrsState: {
        due: new Date(now + 5 * DAY).toISOString(),
        stability,
        difficulty: 5,
        elapsed_days: 1,
        scheduled_days: 5,
        learning_steps: 0,
        reps: 5,
        lapses: 0,
        state: 2,
        last_review: new Date(now - ago).toISOString(),
      },
    };
  };

  const cardIs = (label) => `document.getElementById('card-type').textContent === ${JSON.stringify(label)}`;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // 大's meaning and writing cards reviewed minutes ago (today's study
    // day), the writing card missed; 小's cards reviewed days ago, its
    // meaning card the likeliest forgotten.
    const cards = [
      card('大|da4#meaning', '大|da4', 'meaning', MINUTE, 20),
      card('大|da4#writing', '大|da4', 'writing', 2 * MINUTE, 20),
      card('小|xiao3#meaning', '小|xiao3', 'meaning', 10 * DAY, 2),
      card('小|xiao3#writing', '小|xiao3', 'writing', 10 * DAY, 3),
    ];
    await inDatabase(`
      stores.words.put({ id: '大|da4', traditional: '大', simplified: '大', pinyin: 'da4', definition: 'big', order: 0, addedAt: 1, learnedAt: 1 });
      stores.words.put({ id: '小|xiao3', traditional: '小', simplified: '小', pinyin: 'xiao3', definition: 'small', order: 1, addedAt: 1, learnedAt: 1 });
      for (const card of ${JSON.stringify(cards)}) {
        stores.cards.put(card);
      }
      stores.reviews.put({ id: 'missed', cardId: '大|da4#writing', wordId: '大|da4', type: 'writing', time: ${cards[1].lastReviewedAt}, grade: 1 });
      stores.settings.put({ key: 'enabledTypes', value: ['meaning', 'writing'] });
    `);
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it("goes through today's cards, missed first, then all, saving nothing", { timeout: 60000 }, async () => {
    const before = await saved();
    await waitUntil(page, `!document.getElementById('practice-round-button').hidden`, 'Practice again');
    assert.match(await textOf(page, 'done-message'), /^All done for now/);
    assert.equal(await textOf(page, 'practice-round-button'), 'Practice again');
    await tap(page, 'practice-round-button');

    // The writing card missed today comes first.
    await waitUntil(page, cardIs('Writing · practice 1/2'), 'the writing card');
    await waitUntil(
      page,
      `document.getElementById('stroke-count').textContent.startsWith('1/') && !document.getElementById('writing-area').hasAttribute('data-busy')`,
      'the character to be writable',
    );
    const area = await writingArea(page);
    for (const median of loadStrokeData('大').medians) {
      await drawStroke(page, area, median);
    }
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'Next card');
    assert.equal(await textOf(page, 'grade-row'), 'Next card');
    assert.equal(await isShown(page, 'practice-again-button'), true);
    await page.evaluate(`document.querySelector('#grade-row button').click()`);

    await waitUntil(page, `${cardIs('Meaning · practice 2/2')} && !document.getElementById('card-face').hidden`, 'the meaning card');
    await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'Next card');
    // A tap on the answer goes on, as "Next card" does.
    await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);

    await waitUntil(page, `!document.getElementById('practice-all-button').hidden`, 'the end of practice');
    assert.equal(
      await textOf(page, 'done-message'),
      'Practice done2 cards practiced. Nothing was saved, so your schedule is as it was.',
    );
    assert.equal(await isShown(page, 'round-back-button'), true);
    assert.equal(await isShown(page, 'practice-round-button'), false);
    assert.deepEqual(await saved(), before);

    // All cards: 小's, reviewed long ago, first.
    await tap(page, 'practice-all-button');
    await waitUntil(page, `${cardIs('Meaning · practice 1/4')} && document.getElementById('card-face').textContent.includes('小')`, "小's card");

    // Leaving Review ends practice.
    await reloadApp(page);
    await waitUntil(page, `!document.getElementById('practice-round-button').hidden`, 'the end of Review');
    assert.match(await textOf(page, 'done-message'), /^All done for now/);
    assert.deepEqual(await saved(), before);
  });
});
