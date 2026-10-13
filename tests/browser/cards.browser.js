// Managing cards in the Decks tab: a word's cards in its pop-up panel
// (start over, "I know this word"), the order of the list, and doing one
// thing to several words at once.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, choose, textOf, waitUntil, openDeckPage } from './harness.js';

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

const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;
const cardRows = `[...document.querySelectorAll('#edit-cards li')].map((row) => row.textContent)`;
const note = (text) => `document.getElementById('bulk-note').textContent.startsWith(${JSON.stringify(text)})`;

// One browser, and the steps in order: each builds on the one before.
describe('managing cards', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // The pop-ups that ask before starting over or removing: answer OK.
    await page.evaluate('window.confirm = () => true');
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('shows a word\'s cards, and marks the word as known', async () => {
    await openDeckPage(page);
    for (const [traditional, simplified, pinyin, meaning] of [['貓', '猫', 'mao1', 'cat'], ['愛', '爱', 'ai4', 'to love']]) {
      await type(page, 'add-traditional', traditional);
      await type(page, 'add-simplified', simplified);
      await type(page, 'add-pinyin', pinyin);
      await type(page, 'add-definition', meaning);
      await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
      await waitUntil(page, `document.getElementById('add-word-note').textContent.includes('${traditional}')`, 'the word added');
    }
    await waitUntil(page, rows(2));

    // The second word, 愛: four cards, none studied.
    await page.evaluate(`document.querySelectorAll('#word-list li button')[1].click()`);
    await waitUntil(page, `document.querySelectorAll('#edit-cards li').length === 4`, 'the four cards');
    assert.deepEqual(await page.evaluate(cardRows), [
      'Meaning not studied yet',
      'Pinyin not studied yet',
      'Tones not studied yet',
      'Writing (traditional) not studied yet',
    ]);
    await tap(page, 'know-word-button');
    await waitUntil(page, `document.getElementById('know-word-button').hidden`, 'the word marked as known');
    const cards = await stored(page, 'cards');
    assert.deepEqual(cards.map((card) => card.id).sort(), ['愛|ai4#meaning', '愛|ai4#pinyin', '愛|ai4#tone', '愛|ai4#writing']);
    const reviews = await stored(page, 'reviews');
    assert.deepEqual(reviews.map((review) => [review.grade, review.markedKnown]), Array(4).fill([4, true]));
    assert.equal(typeof (await stored(page, 'words')).find((word) => word.id === '愛|ai4').learnedAt, 'number');
    assert.match((await page.evaluate(cardRows))[0], /^Meaning due in \d+d · 1 reviewStart over$/);
    assert.match(await textOf(page, 'word-dialog-status'), /^You have learned this word/);
  });

  it('starts a card over', async () => {
    await page.evaluate(`document.querySelector('#edit-cards li button').click()`);
    await waitUntil(page, `document.querySelector('#edit-cards li').textContent === 'Meaning not studied yet'`, 'the card new again');
    assert.equal((await stored(page, 'cards')).length, 3);
    // The review is kept; the word notes when the card was started over.
    assert.equal((await stored(page, 'reviews')).length, 4);
    const love = (await stored(page, 'words')).find((word) => word.id === '愛|ai4');
    assert.deepEqual(Object.keys(love.startedOverAt), ['meaning']);
    // Saving the word in its panel keeps that.
    await type(page, 'edit-definition', 'to love; love');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `!document.getElementById('word-dialog').open`, 'the panel to close');
    const saved = (await stored(page, 'words')).find((word) => word.id === '愛|ai4');
    assert.deepEqual(saved.startedOverAt, love.startedOverAt);
    assert.equal(typeof saved.learnedAt, 'number');
  });

  it('orders the list by what is due next', async () => {
    const first = `document.querySelector('#word-list li .entry-characters').textContent`;
    assert.match(await page.evaluate(first), /^貓/);
    // 愛 has cards, 貓 has none: it comes first.
    await choose(page, 'word-sort', 'due');
    await waitUntil(page, `${first}.startsWith('愛')`, 'the word with cards first');
    await choose(page, 'word-sort', '');
    await waitUntil(page, `${first}.startsWith('貓')`, 'the learning order again');
  });

  it('does one thing to several words at once', async () => {
    await tap(page, 'select-words-button');
    assert.equal(await page.evaluate(`document.getElementById('bulk-suspend-button').disabled`), true);
    // A tap selects the word instead of opening its panel.
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    assert.match(await textOf(page, 'bulk-count'), /^1 word selected/);
    assert.equal(await page.evaluate(`document.getElementById('word-dialog').open`), false);
    await tap(page, 'bulk-all-button');
    assert.match(await textOf(page, 'bulk-count'), /^2 words selected/);
    assert.equal(await page.evaluate(`document.querySelectorAll('#word-list button.selected').length`), 2);

    await tap(page, 'bulk-suspend-button');
    await waitUntil(page, note('Suspended every card of 2 words.'), 'the words suspended');
    assert.deepEqual((await stored(page, 'words')).map((word) => word.suspended.length), [4, 4]);
    await tap(page, 'bulk-unsuspend-button');
    await waitUntil(page, note('Switched the suspended cards of 2 words back on.'), 'the cards back on');
    assert.deepEqual((await stored(page, 'words')).map((word) => word.suspended), [undefined, undefined]);

    // 貓 has four new cards and 愛 the one that was started over.
    await tap(page, 'bulk-know-button');
    await waitUntil(page, note('Marked 2 words as known'), 'the words marked as known');
    assert.equal((await stored(page, 'cards')).length, 8);
    await tap(page, 'bulk-know-button');
    await waitUntil(page, note('Marked 0 words as known'), 'nothing left to mark');

    await tap(page, 'bulk-start-over-button');
    await waitUntil(page, note('Started the cards of 2 words over.'), 'the cards started over');
    assert.equal((await stored(page, 'cards')).length, 0);
    assert.equal((await stored(page, 'reviews')).length, 9);

    await tap(page, 'bulk-remove-button');
    await waitUntil(page, note('Removed 2 words.'), 'the words removed');
    assert.deepEqual(await stored(page, 'words'), []);
    assert.match(await textOf(page, 'bulk-count'), /^0 words selected/);
    await tap(page, 'select-words-button');
    assert.equal(await page.evaluate(`document.getElementById('bulk-bar').hidden`), true);
  });
});
