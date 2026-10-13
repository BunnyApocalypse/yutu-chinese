// The Decks tab and the Words tab: one shows the decks, the other the words.
// (Older tests read the list of words while the Decks tab is open, where it
// is kept up to date but out of view. This one checks what is in view.)
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, choose, textOf, waitUntil, openDeckPage } from './harness.js';

// True if an element takes up room on the page: it and everything it is
// inside are shown, by whatever means.
const inView = (page, id) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).offsetParent !== null`);
const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;

// One browser, and the steps in order: each builds on the one before.
describe('the Decks and Words tabs', { concurrency: false }, () => {
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

  it('shows the decks on one tab and the words on the other', async () => {
    await openDeckPage(page);
    for (const [traditional, simplified, pinyin, meaning] of [['貓', '猫', 'mao1', 'cat'], ['狗', '狗', 'gou3', 'dog']]) {
      await type(page, 'add-traditional', traditional);
      await type(page, 'add-simplified', simplified);
      await type(page, 'add-pinyin', pinyin);
      await type(page, 'add-definition', meaning);
      await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
      await waitUntil(page, `document.getElementById('add-word-note').textContent.includes('${traditional}')`, 'the word added');
    }
    // A second deck with one of the words in it.
    await tap(page, 'my-decks-button');
    await type(page, 'add-deck-name', 'Animals');
    await page.evaluate(`document.getElementById('add-deck-form').requestSubmit()`);
    await waitUntil(page, `document.querySelectorAll('#deck-list li').length === 2`, 'the new deck');

    // The Decks tab: decks in view, no list of words.
    assert.equal(await inView(page, 'deck-list'), true);
    assert.equal(await inView(page, 'word-search'), false);
    assert.equal(await inView(page, 'word-list'), false);

    // The Words tab: the words in view, with their tools, and no decks.
    await tap(page, 'words-tab');
    await waitUntil(page, rows(2), 'both words');
    assert.equal(await inView(page, 'word-list'), true);
    assert.equal(await inView(page, 'word-search'), true);
    assert.equal(await inView(page, 'select-words-button'), true);
    assert.equal(await inView(page, 'deck-list'), false);
    assert.equal(await inView(page, 'my-decks-button'), false);
    assert.equal(await page.evaluate(`document.getElementById('words-tab').classList.contains('selected')`), true);
    assert.equal(await textOf(page, 'word-list-title'), 'All your words');
  });

  it('lists one deck\'s words when that deck is chosen, or its "Its words" is tapped', async () => {
    // Put 貓 into Animals from its panel.
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await page.evaluate(`[...document.querySelectorAll('#edit-decks label')].find((label) => label.textContent.includes('Animals')).querySelector('input').click()`);
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `!document.getElementById('word-dialog').open`, 'the panel to close');

    const animals = await page.evaluate(`[...document.getElementById('words-deck-select').options].find((option) => option.textContent === 'Animals').value`);
    await choose(page, 'words-deck-select', animals);
    await waitUntil(page, rows(1), 'the one word of the deck');
    assert.equal(await textOf(page, 'word-list-title'), 'Words in this deck');
    await choose(page, 'words-deck-select', '');
    await waitUntil(page, rows(2), 'all words again');

    // From the deck's page.
    await tap(page, 'decks-tab');
    await page.evaluate(`[...document.querySelectorAll('#deck-list button')].find((button) => button.textContent.includes('Animals')).click()`);
    await waitUntil(page, `document.getElementById('deck-title').textContent === 'Animals'`, 'the deck\'s page');
    await tap(page, 'deck-words-button');
    await waitUntil(page, `document.getElementById('words-tab').classList.contains('selected') && ${rows(1)}`, 'the Words tab with the deck\'s word');
    assert.equal(await page.evaluate(`document.getElementById('words-deck-select').value`), animals);
    assert.equal(await inView(page, 'word-list'), true);
  });

  it('reaches Free practice from the Words tab and from a word\'s page', async () => {
    assert.equal(await inView(page, 'practice-tab'), true);
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(page, `document.getElementById('word-page').dataset.shown === '貓|mao1'`, 'the word\'s page');
    await tap(page, 'word-page-practice');
    // The writing area with the word's first stroke to write.
    await waitUntil(page, `document.getElementById('status').textContent.startsWith('Stroke 1 of')`, 'Free practice');
    assert.equal(await page.evaluate(`document.getElementById('word-input').value`), '貓');
    assert.equal(await page.evaluate(`document.getElementById('word-page').open`), false);
    assert.equal(await inView(page, 'word-list'), false);
  });

  it('says which version it is, whose work it is built on, and when something goes wrong', async () => {
    await tap(page, 'settings-button');
    assert.match(await textOf(page, 'app-version'), /^Version \d+\.\d+\.\d+ \(/);
    await tap(page, 'credits-button');
    assert.equal(await page.evaluate(`document.getElementById('credits-dialog').open`), true);
    assert.match(await textOf(page, '#credits-dialog .credits'), /Arphic[\s\S]*CC-CEDICT[\s\S]*Chen Wang/);
    await tap(page, 'credits-close');
    await tap(page, 'settings-close');

    // An error nothing caught, as the browser would announce it.
    assert.equal(await page.evaluate(`document.getElementById('error-banner').hidden`), true);
    await page.evaluate(`window.dispatchEvent(new ErrorEvent('error', { message: 'boom', filename: 'somewhere.js', lineno: 7 }))`);
    assert.equal(await page.evaluate(`document.getElementById('error-banner').hidden`), false);
    await tap(page, 'error-details-button');
    const details = await page.evaluate(`document.getElementById('error-text').value`);
    assert.match(details, /^Hanzi Trainer \d+\.\d+\.\d+ \(/);
    assert.match(details, /Browser: /);
    assert.match(details, /boom \(somewhere\.js:7\)/);
    await tap(page, 'error-close-button');
    assert.equal(await page.evaluate(`document.getElementById('error-banner').hidden`), true);
  });
});
