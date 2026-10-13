// Decks in a real browser: the deck the app starts with, decks inside one
// another with a page each, adding words on a deck's page, studying a deck
// with a goal of its own, and deleting decks with and without their words.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, choose, textOf, waitUntil } from './harness.js';

const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;
const deckRows = (count) => `document.querySelectorAll('#deck-list li').length === ${count}`;
const titleIs = (name) => `!document.getElementById('deck-head').hidden && document.getElementById('deck-title').textContent === ${JSON.stringify(name)}`;

// JavaScript text for the row of the deck with this name on the page shown.
const deckRow = (name) =>
  `[...document.querySelectorAll('#deck-list button')].find((row) => row.firstChild.textContent === ${JSON.stringify(name)})`;

// Everything in one store of the app's database.
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

// One browser, and the steps in order: each builds on the one before.
describe('decks', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Opens the page of a deck listed on the page shown.
  const openDeck = async (name) => {
    await page.evaluate(`${deckRow(name)}.click()`);
    await waitUntil(page, titleIs(name), `the page of ${name}`);
  };

  // Goes up by tapping a part of the line that says where you are.
  const goUpTo = async (name) => {
    await page.evaluate(
      `[...document.querySelectorAll('#deck-path button')].find((part) => part.textContent === ${JSON.stringify(name)}).click()`,
    );
    await waitUntil(page, name === 'Decks' ? `document.getElementById('deck-head').hidden` : titleIs(name), `up to ${name}`);
  };

  const addDeck = async (name) => {
    const count = await page.evaluate(`document.querySelectorAll('#deck-list li').length`);
    await type(page, 'add-deck-name', name);
    await page.evaluate(`document.getElementById('add-deck-form').requestSubmit()`);
    await waitUntil(page, deckRows(count + 1), `the deck ${name}`);
  };

  // Fills in and sends the Add a word form of the deck's page that is open.
  const addWord = async (traditional, simplified, pinyin, meaning) => {
    await type(page, 'add-traditional', traditional);
    await type(page, 'add-simplified', simplified);
    await type(page, 'add-pinyin', pinyin);
    await type(page, 'add-definition', meaning);
    await page.evaluate(`document.getElementById('add-word-note').textContent = ''`);
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent !== ''`, `the word ${traditional}`);
    return textOf(page, 'add-word-note');
  };

  const openSettings = async () => {
    await tap(page, 'deck-settings-button');
    await waitUntil(page, `document.getElementById('deck-dialog').open`, 'the deck settings');
  };

  const decksOf = async (traditional) =>
    (await stored(page, 'words')).find((word) => word.traditional === traditional)?.decks;
  const idOf = async (name) => (await stored(page, 'decks')).find((deck) => deck.name === name).id;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    await tap(page, 'decks-tab');
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('starts with one deck, open, which the first word goes into', async () => {
    await waitUntil(page, titleIs('Chinese 中文'), 'the page of the deck the app starts with');
    assert.equal(await textOf(page, 'deck-path'), 'Decks › Chinese 中文');
    assert.match(await addWord('貓', '猫', 'mao1', 'cat'), /^Added/);
    await waitUntil(page, rows(1));
    assert.deepEqual(await decksOf('貓'), ['chinese']);
    assert.match(await textOf(page, 'deck-counts'), /^1 word · 0 learned/);
    // With one deck there is nothing to choose in Learn.
    await tap(page, 'learn-tab');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('貓')`, 'the word in Learn');
    assert.equal(await page.evaluate(`document.getElementById('deck-select').hidden`), true);
    await tap(page, 'decks-tab');
    await waitUntil(page, titleIs('Chinese 中文'), 'the same page again');
  });

  it('makes a deck on the front page, and one inside it on its page', async () => {
    await goUpTo('Decks');
    // The front page has no forms for adding words: every word is in a deck.
    assert.equal(await page.evaluate(`document.getElementById('deck-adding').hidden`), true);
    assert.equal(await textOf(page, 'word-count'), '1');
    await addDeck('Textbook');
    await openDeck('Textbook');
    assert.equal(await page.evaluate(`document.querySelectorAll('#deck-list li').length`), 0);
    await addDeck('Chapter 1');
    const decks = await stored(page, 'decks');
    const textbook = decks.find((deck) => deck.name === 'Textbook');
    assert.equal(textbook.parentId, null);
    assert.equal(decks.find((deck) => deck.name === 'Chapter 1').parentId, textbook.id);
    // A deck cannot be moved inside itself or a deck inside it.
    await openSettings();
    assert.deepEqual(
      await page.evaluate(`[...document.getElementById('deck-parent').options].map((entry) => entry.textContent)`),
      ['No other deck', 'Chinese 中文'],
    );
    await tap(page, 'deck-dialog-close');
  });

  it('adds a word on a deck\'s page, and shows it in the deck that one is inside', async () => {
    await openDeck('Chapter 1');
    assert.equal(await textOf(page, 'deck-path'), 'Decks › Textbook › Chapter 1');
    assert.match(await addWord('狗', '狗', 'gou3', 'dog'), /^Added/);
    await waitUntil(page, rows(1));
    // "Back" goes up one level.
    await tap(page, 'deck-back-button');
    await waitUntil(page, titleIs('Textbook'), 'back to Textbook');
    await waitUntil(page, rows(1));
    assert.match(await textOf(page, '#word-list li'), /狗.*in Chapter 1 · waiting$/);
    assert.match(await page.evaluate(`${deckRow('Chapter 1')}.textContent`), /1 word · 0 learned/);
    assert.match(await textOf(page, 'deck-counts'), /^1 word/);
  });

  it('puts a word you already have in this deck as well', async () => {
    assert.match(await addWord('貓', '猫', 'mao1', 'a cat, again'), /was already in your words.*in this deck now too/);
    await waitUntil(page, rows(2));
    const words = await stored(page, 'words');
    assert.equal(words.length, 2);
    const cat = words.find((word) => word.traditional === '貓');
    assert.deepEqual(cat.decks, ['chinese', await idOf('Textbook')]);
    assert.equal(cat.definition, 'cat');
    assert.match(await addWord('貓', '猫', 'mao1', 'cat'), /is already in this deck/);
  });

  it('keeps every word in at least one deck', async () => {
    await type(page, 'word-search', 'dog');
    await waitUntil(page, rows(1));
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    assert.equal(await textOf(page, 'edit-decks-summary'), 'Decks: in 1');
    await page.evaluate(`document.querySelector('#edit-decks input:checked').click()`);
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('word-dialog-note').textContent.includes('at least one deck')`, 'the refusal');
    assert.equal(await page.evaluate(`document.getElementById('word-dialog').open`), true);
    await tap(page, 'word-dialog-close');
    await type(page, 'word-search', '');
  });

  it('puts the words of a list in the deck, those already there too', async () => {
    // From a deck inside no other, "Back" goes to the front page, where the button is not shown.
    await tap(page, 'deck-back-button');
    await waitUntil(page, `document.getElementById('deck-head').hidden`, 'the front page');
    assert.equal(await page.evaluate(`document.getElementById('deck-path-row').hidden`), true);
    await addDeck('Animals');
    await openDeck('Animals');
    await type(page, 'list-text', '鸟\t鳥\tniao3\tbird\n狗\t狗\tgou3\tdog\n');
    await tap(page, 'check-list-button');
    await waitUntil(page, `!document.getElementById('add-list-button').hidden`, 'the list to be checked');
    await tap(page, 'add-list-button');
    await waitUntil(page, rows(2));
    assert.match(await textOf(page, 'list-report'), /Added 1 word\..*1 word you already had went into this deck/);
    assert.deepEqual(await decksOf('狗'), [await idOf('Chapter 1'), await idOf('Animals')]);
  });

  it('studies a deck from its page, toward the deck\'s own goal', async () => {
    // So does "My decks", from any deck's page.
    await tap(page, 'my-decks-button');
    await waitUntil(page, `document.getElementById('deck-head').hidden`, 'the front page');
    await openDeck('Textbook');
    await openDeck('Chapter 1');
    await openSettings();
    await type(page, 'deck-goal', '7');
    await page.evaluate(`document.getElementById('deck-dialog-form').requestSubmit()`);
    await waitUntil(page, `!document.getElementById('deck-dialog').open`, 'the deck settings to close');

    await tap(page, 'deck-learn-button');
    await waitUntil(page, `document.getElementById('learn-tab').classList.contains('selected')`, 'the Learn tab');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('狗')`, 'the word of the deck');
    assert.match(await textOf(page, 'review-counts'), /of 7 · 1 waiting/);
    assert.equal(await page.evaluate(`document.getElementById('deck-select').selectedOptions[0].textContent`), 'Textbook › Chapter 1');
    // All words: the first one added comes first, toward the goal in Settings.
    await choose(page, 'deck-select', '');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('貓')`, 'the first word');
    assert.match(await textOf(page, 'review-counts'), /of 5 · 3 waiting/);

    // "Review this deck" does the same for Review. A deck includes the decks inside it.
    await tap(page, 'decks-tab');
    await goUpTo('Textbook');
    await tap(page, 'deck-review-button');
    await waitUntil(page, `document.getElementById('done-message').textContent.includes('2 words are waiting')`, 'Review for the deck');
    await tap(page, 'decks-tab');
  });

  it('deletes a deck and moves the words it leaves without one', async () => {
    await goUpTo('Decks');
    await openDeck('Animals');
    await openSettings();
    await tap(page, 'deck-delete-button');
    // 狗 is in Chapter 1 too; 鳥 would be left without a deck.
    assert.match(
      await textOf(page, 'deck-delete-text'),
      /^Delete "Animals"\? It has 2 words\. 1 of them is in no other deck\. Keep them, and they move to "Chinese 中文"/,
    );
    assert.equal(await textOf(page, 'deck-delete-words'), 'Delete the deck and remove 1 word');
    await tap(page, 'deck-delete-keep');
    // Its page is gone: the front page is shown.
    await waitUntil(page, `document.getElementById('deck-head').hidden && ${deckRows(2)}`, 'the front page without Animals');
    assert.deepEqual(await decksOf('鳥'), ['chinese']);
    assert.deepEqual(await decksOf('狗'), [await idOf('Chapter 1')]);
    assert.deepEqual((await stored(page, 'removed')).map((mark) => mark.kind), ['deck']);
    assert.equal(await textOf(page, 'word-count'), '3');
  });

  it('deletes a deck with the decks inside it and the words that are in no other', async () => {
    await openDeck('Textbook');
    await openSettings();
    await tap(page, 'deck-delete-button');
    assert.match(await textOf(page, 'deck-delete-text'), /^Delete "Textbook" and the 1 deck inside it\? It has 2 words\. 1 of them is in no other deck/);
    await tap(page, 'deck-delete-words');
    await waitUntil(page, `document.getElementById('deck-head').hidden && ${deckRows(1)}`, 'the front page with one deck');
    assert.deepEqual((await stored(page, 'words')).map((word) => [word.traditional, word.decks]).sort(), [
      ['貓', ['chinese']],
      ['鳥', ['chinese']],
    ]);
    const marks = await stored(page, 'removed');
    assert.deepEqual(marks.map((mark) => mark.id).filter((id) => id.includes('|')), ['狗|gou3']);
    assert.equal(marks.filter((mark) => mark.kind === 'deck').length, 3);
    // The deck that was being studied is gone: all words are studied again.
    await tap(page, 'learn-tab');
    await waitUntil(page, `document.getElementById('review-counts').textContent.includes('2 waiting')`, 'all words in Learn');
    await tap(page, 'decks-tab');
  });

  it('does not strand the words of the last deck', async () => {
    await openDeck('Chinese 中文');
    await openSettings();
    await tap(page, 'deck-delete-button');
    assert.match(await textOf(page, 'deck-delete-text'), /They are in no other deck\. There is no other deck for them to move to/);
    assert.equal(await page.evaluate(`document.getElementById('deck-delete-keep').hidden`), true);
    assert.equal(await textOf(page, 'deck-delete-words'), 'Delete the deck and remove 2 words');
    // Removing them too leaves the app as it started: one empty deck.
    await tap(page, 'deck-delete-words');
    await waitUntil(page, `document.getElementById('deck-head').hidden && ${deckRows(1)}`, 'the front page');
    assert.deepEqual((await stored(page, 'decks')).map((deck) => deck.id), ['chinese']);
    assert.deepEqual(await stored(page, 'words'), []);
  });
});
