// Leeches: a card that keeps being forgotten is listed in the Decks tab,
// pointed out in Review, and suspended if the settings say so.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, tap, type, choose, textOf, waitUntil, openDeckPage, isShown } from './harness.js';

// Everything in one store of the app's database, read through a connection
// of the test's own.
const stored = (page, storeName) =>
  page.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('hanzi-trainer');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const all = request.result.transaction(['${storeName}']).objectStore('${storeName}').getAll();
      all.onsuccess = () => {
        request.result.close();
        resolve(all.result);
      };
    };
  })`);

// Puts a card straight into the database: the meaning card of 愛, learned
// long ago, forgotten seven times and due now.
const putForgottenCard = (page) =>
  page.evaluate(`new Promise((resolve, reject) => {
    const DAY = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const request = indexedDB.open('hanzi-trainer');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const tx = request.result.transaction(['cards'], 'readwrite');
      tx.objectStore('cards').put({
        id: '愛|ai4#meaning',
        wordId: '愛|ai4',
        type: 'meaning',
        due: now - DAY,
        firstReviewedAt: now - 100 * DAY,
        lastReviewedAt: now - 4 * DAY,
        fsrsState: {
          due: new Date(now - DAY).toISOString(),
          stability: 3,
          difficulty: 8,
          elapsed_days: 3,
          scheduled_days: 3,
          learning_steps: 0,
          reps: 20,
          lapses: 7,
          state: 2,
          last_review: new Date(now - 4 * DAY).toISOString(),
        },
      });
      tx.oncomplete = () => {
        request.result.close();
        resolve(true);
      };
    };
  })`);

const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;

// One browser, and the steps in order: each builds on the one before.
describe('leeches', { concurrency: false }, () => {
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

  it('lists the cards that keep being forgotten', async () => {
    await openDeckPage(page);
    for (const [traditional, simplified, pinyin, meaning] of [['愛', '爱', 'ai4', 'to love'], ['貓', '猫', 'mao1', 'cat']]) {
      await type(page, 'add-traditional', traditional);
      await type(page, 'add-simplified', simplified);
      await type(page, 'add-pinyin', pinyin);
      await type(page, 'add-definition', meaning);
      await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
      await waitUntil(page, `document.getElementById('add-word-note').textContent.includes('${traditional}')`, 'the word added');
    }
    await waitUntil(page, rows(2));
    // No leeches yet.
    await choose(page, 'word-filter', 'leeches');
    await waitUntil(page, rows(0));
    assert.match(await textOf(page, 'word-list-note'), /^No leeches here: no card has been forgotten 6 times/);
    assert.equal(await isShown(page, 'leech-export'), false);

    await putForgottenCard(page);
    await reloadApp(page);
    await tap(page, 'decks-tab');
    await choose(page, 'word-filter', 'leeches');
    await waitUntil(page, rows(1), 'the leech');
    assert.match(await textOf(page, '#word-list li'), /meaning · forgotten 7 times$/);
    assert.equal(await isShown(page, 'leech-export'), true);
    // The prompt is copied or, where the browser will not allow that, saved as a file.
    await tap(page, 'leech-prompt-button');
    await waitUntil(page, `/Copied|saved as a file/.test(document.getElementById('word-list-note').textContent)`, 'the prompt handed over');
  });

  it('points a leech out in Review, and suspends it once the setting says so', async () => {
    await tap(page, 'settings-button');
    assert.equal(await page.evaluate(`document.getElementById('leech-input').value`), '6');
    await choose(page, 'leech-action-select', 'suspend');
    await tap(page, 'settings-close');
    await tap(page, 'review-tab');
    await waitUntil(page, `document.getElementById('card-type').textContent.toLowerCase().includes('meaning')`, 'the meaning card');
    // "Leech" beside the kind of card from the start, not yet a way to the
    // word's page, which would give the answer away.
    assert.equal(await textOf(page, 'leech-tag'), 'Leech');
    assert.equal(await page.evaluate(`document.getElementById('leech-tag').disabled`), true);
    // Tap to see the answer: the grades come up, and the tag opens the
    // word's page with this card's strip, saying what a leech is.
    await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    // Nothing under the grades any more (the owner, 2026-10-26: the page scrolled).
    assert.equal(await page.evaluate(`document.getElementById('leech-note')`), null);
    await tap(page, 'leech-tag');
    await waitUntil(page, `document.querySelector('.page-this-card') !== null`, 'the card\'s strip');
    assert.match(await textOf(page, '.page-this-card'), /Leech: you have forgotten this card 7 times/);
    await page.evaluate(`document.getElementById('word-page').close()`);

    // Forgotten again: that is the eighth time, and the card is suspended.
    await page.evaluate(`document.querySelector('#grade-row button').click()`);
    await waitUntil(page, `document.getElementById('grade-row').hidden`, 'the next card');
    let love;
    for (let attempt = 0; attempt < 50 && !love?.suspended; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      love = (await stored(page, 'words')).find((word) => word.id === '愛|ai4');
    }
    assert.deepEqual(love.suspended, ['meaning']);
    // The app says so, above the next card.
    assert.match(await textOf(page, 'review-notice'), /^Suspended: the meaning card of 愛, forgotten 8 times\./);
    assert.equal((await stored(page, 'cards')).find((card) => card.id === '愛|ai4#meaning').fsrsState.lapses, 8);
    // It does not come up again, though it is due within minutes.
    assert.doesNotMatch(await textOf(page, 'card-type'), /meaning/i);
  });

  it('lists suspended cards, and switches one back on from the word\'s page', async () => {
    await tap(page, 'words-tab');
    await choose(page, 'word-filter', 'suspended');
    await waitUntil(page, rows(1), 'the word with a suspended card');
    assert.match(await textOf(page, '#word-list li'), /suspended: meaning$/);
    // The word's page has its cards; unticking takes effect at once.
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(page, `document.getElementById('word-page').dataset.shown === '愛|ai4'`, 'the word\'s page');
    assert.equal(await textOf(page, 'edit-cards-summary'), 'Cards (1 suspended)');
    await page.evaluate(`[...document.querySelectorAll('#edit-cards li')].find((row) => row.textContent.startsWith('Meaning')).querySelector('button:last-child').click()`);
    await waitUntil(page, rows(0), 'no suspended cards');
    // The list and the page's heading of its cards are updated one after the
    // other, so the heading is waited for too (it failed now and then in a
    // full run).
    await waitUntil(page, `document.getElementById('edit-cards-summary').textContent === 'Cards'`, 'the heading without "suspended"');
    await tap(page, 'word-page-close');
    const love = (await stored(page, 'words')).find((word) => word.id === '愛|ai4');
    assert.equal(love.suspended, undefined);
    // Among the leeches it is still listed, no longer as suspended.
    await choose(page, 'word-filter', 'leeches');
    await waitUntil(page, rows(1), 'the leech');
    assert.match(await textOf(page, '#word-list li'), /meaning · forgotten 8 times$/);
  });
});
