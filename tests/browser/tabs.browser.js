// The Decks tab and the Words tab: one shows the decks, the other the words.
// (Older tests read the list of words while the Decks tab is open, where it
// is kept up to date but out of view. This one checks what is in view.)
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, choose, textOf, waitUntil, openDeckPage, isShown, reloadApp, openSettings } from './harness.js';

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

    // The Decks tab's front page: decks in view, no list of words.
    assert.equal(await inView(page, 'deck-list'), true);
    assert.equal(await inView(page, 'word-search'), false);
    assert.equal(await inView(page, 'word-list'), false);

    // The Words tab: the words in view, with their tools, and no decks.
    await tap(page, 'words-tab');
    // (The list has its two rows already, out of view; wait for the tab itself.)
    await waitUntil(page, `document.getElementById('word-list').offsetParent !== null && ${rows(2)}`, 'the Words tab with both words');
    assert.equal(await inView(page, 'word-list'), true);
    assert.equal(await inView(page, 'word-search'), true);
    assert.equal(await inView(page, 'select-words-button'), true);
    assert.equal(await inView(page, 'deck-list'), false);
    assert.equal(await inView(page, 'my-decks-button'), false);
    assert.equal(await page.evaluate(`document.getElementById('words-tab').classList.contains('selected')`), true);
    assert.equal(await textOf(page, 'word-list-title'), 'All your words');
  });

  it('lists one deck\'s words when that deck is chosen, or under its page', async () => {
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
    await page.evaluate(`[...document.querySelectorAll('#deck-list li')].find((row) => row.textContent.includes('Animals')).querySelector('.deck-open').click()`);
    await waitUntil(page, `document.getElementById('deck-title').textContent === 'Animals'`, 'the deck\'s page');
    // Its words are listed under its page, without the Words tab's deck
    // chooser; the front page has none.
    await waitUntil(page, `document.getElementById('word-list').offsetParent !== null && ${rows(1)}`, 'the deck\'s word under its page');
    assert.equal(await inView(page, 'word-search'), true);
    assert.equal(await inView(page, 'words-deck-select'), false);
    assert.equal(await inView(page, 'practice-tab'), false);
    await tap(page, 'my-decks-button');
    await waitUntil(page, `document.getElementById('word-list').offsetParent === null`, 'no words on the front page');
  });

  it('reaches Free practice from the Words tab and from a word\'s page', async () => {
    await tap(page, 'words-tab');
    await waitUntil(page, `document.getElementById('practice-tab').offsetParent !== null`, 'the Words tab');
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(page, `document.getElementById('word-page').dataset.shown === '貓|mao1'`, 'the word\'s page');
    await tap(page, 'word-page-practice');
    // The writing area with the word's first stroke to write.
    await waitUntil(page, `document.getElementById('stroke-count').textContent.startsWith('1/')`, 'Free practice');
    assert.equal(await page.evaluate(`document.getElementById('word-input').value`), '貓');
    assert.equal(await page.evaluate(`document.getElementById('word-page').open`), false);
    assert.equal(await inView(page, 'word-list'), false);
  });

  it('searches the dictionary too on the Words tab, and adds a word from there', async () => {
    const dictionaryRows = `[...document.querySelectorAll('#dictionary-list li .entry-characters')].map((row) => row.textContent)`;
    await tap(page, 'words-tab');
    await waitUntil(page, `document.getElementById('word-search').offsetParent !== null`, 'the Words tab');
    // By English: none of your words, and the dictionary's under them.
    await type(page, 'word-search', 'teacher');
    await waitUntil(page, `document.querySelectorAll('#dictionary-list li').length > 0`, 'the dictionary\'s words');
    assert.equal(await textOf(page, 'word-list-note'), 'None of your words match.');
    assert.ok((await page.evaluate(dictionaryRows)).slice(0, 3).some((row) => row.startsWith('老師')), 'teacher finds 老師');
    // By characters and pinyin too; a word you have is not listed again.
    await type(page, 'word-search', 'mao1');
    await waitUntil(page, `${rows(1)} && document.querySelectorAll('#dictionary-list li').length > 0`, 'mao1 in both lists');
    assert.equal((await page.evaluate(dictionaryRows)).some((row) => row.startsWith('貓')), false);
    await type(page, 'word-search', '老');
    await waitUntil(page, `${dictionaryRows}.some((row) => row.startsWith('老師'))`, '老 finds 老師');

    // A tap opens the word's page, where it is added to a deck.
    await page.evaluate(`[...document.querySelectorAll('#dictionary-list li button')].find((row) => row.textContent.startsWith('老師')).click()`);
    await waitUntil(page, `document.querySelector('#word-page .page-add-word button')`, 'the page with Add');
    await page.evaluate(`document.querySelector('#word-page .page-add-word button').click()`);
    // It is one of your words now: its own page, and the list has it.
    await waitUntil(page, `document.getElementById('word-page').dataset.shown === '老師|lao3shi1'`, 'the word\'s own page');
    assert.equal(await isShown(page, 'word-page-edit'), true);
    // "Learn it now" at its top starts its lesson, on the deck it went into.
    assert.match(await textOf(page, '#word-page .page-learn-now'), /^Added to .*Learn it now$/);
    await page.evaluate(`document.querySelector('#word-page .page-learn-now button').click()`);
    await waitUntil(
      page,
      `document.getElementById('place-title').textContent === 'Learn' && document.getElementById('card-face').textContent.startsWith('老師')`,
      'the lesson for 老師',
    );
    // The top bar is Learn's: no "‹ Decks" left over the lesson's top line.
    assert.equal(await textOf(page, 'deck-back-button'), '');
    // Back on the Words tab, the top bar has its name, whatever deck was open.
    await tap(page, 'words-tab');
    assert.equal(await textOf(page, 'place-title'), 'Words');
    assert.equal(await textOf(page, 'deck-back-button'), '');
    await waitUntil(page, `[...document.querySelectorAll('#word-list li')].some((row) => row.textContent.startsWith('老師'))`, '老師 among your words');
    await waitUntil(page, `!${dictionaryRows}.some((row) => row.startsWith('老師'))`, '老師 out of the dictionary\'s list');

    // "My words only" leaves the dictionary out; so does a deck's page.
    await page.evaluate(`document.getElementById('my-words-only').click()`);
    await waitUntil(page, `document.getElementById('dictionary-part').hidden`, 'the dictionary gone');
    await page.evaluate(`document.getElementById('my-words-only').click()`);
    await waitUntil(page, `!document.getElementById('dictionary-part').hidden`, 'the dictionary back');
    await tap(page, 'decks-tab');
    await waitUntil(page, `document.getElementById('dictionary-part').hidden`, 'no dictionary on the Decks tab');
    await type(page, 'word-search', '');
  });

  it('says which version it is, whose work it is built on, and when something goes wrong', async () => {
    await openSettings(page, 'settings-help');
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
    assert.match(details, /^Yutu Chinese \d+\.\d+\.\d+ \(/);
    assert.match(details, /Browser: /);
    assert.match(details, /boom \(somewhere\.js:7\)/);
    await tap(page, 'error-close-button');
    assert.equal(await page.evaluate(`document.getElementById('error-banner').hidden`), true);
  });

  it('offers Learn in the menu while words are waiting, with how many', async () => {
    await tap(page, 'menu-button');
    assert.equal(await isShown(page, 'learn-tab'), true);
    assert.match(await textOf(page, 'learn-waiting'), /^\d+ waiting$/);
    await tap(page, 'learn-tab');
    await waitUntil(page, `document.getElementById('place-title').textContent === 'Learn'`, 'Learn');
    await waitUntil(page, `document.getElementById('learn-tab').classList.contains('selected')`, 'Learn marked in the menu');
    await tap(page, 'review-tab');
  });

  it('reminds of a backup with a dot, which can be switched off and on', async () => {
    // Words and no backup, but nothing studied yet: no dot, which in a new
    // learner's first minutes would look like an error.
    const dot = `document.getElementById('menu-button').classList.contains('reminder')`;
    assert.equal(await page.evaluate(dot), false);
    // A card first studied two days ago (the browser here has not promised
    // to keep the data, so a day is enough): the dot is on the menu button
    // and on Settings, and the menu says what it is.
    const day = 24 * 60 * 60 * 1000;
    const card = { id: 'test|card#meaning', wordId: 'test|card', type: 'meaning', due: Date.now(), firstReviewedAt: Date.now() - 2 * day, fsrsState: null };
    await page.evaluate(`new Promise((resolve, reject) => {
      const request = indexedDB.open('hanzi-trainer');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction(['cards'], 'readwrite');
        transaction.objectStore('cards').put(${JSON.stringify(card)});
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
    })`);
    await reloadApp(page);
    await waitUntil(page, dot, 'the reminder');
    assert.equal(await page.evaluate(`document.getElementById('settings-button').classList.contains('reminder')`), true);
    assert.equal(await page.evaluate(`document.getElementById('backup-due-line').hidden`), false);
    // In Settings the dot is on the group it is about, in the list.
    await tap(page, 'settings-button');
    assert.equal(await page.evaluate(`document.querySelector('#settings-nav [data-group="settings-data"]').classList.contains('reminder')`), true);
    await tap(page, 'settings-close');
    // Switching it off asks first.
    await openSettings(page, 'settings-data');
    await tap(page, 'backup-reminder-button');
    await waitUntil(page, `document.getElementById('confirm-dialog').open`, 'the question');
    await tap(page, 'confirm-yes');
    await waitUntil(page, `!${dot}`, 'the dot gone');
    assert.equal(await textOf(page, 'backup-reminder-button'), 'Remind me about backups again');
    await tap(page, 'backup-reminder-button');
    await waitUntil(page, dot, 'the reminder back');
    await tap(page, 'settings-close');
  });
});
