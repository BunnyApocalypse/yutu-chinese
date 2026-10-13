// Decks in a real browser: make decks inside one another, put words in
// them, look through one, study one in the Learn tab with a goal of its own,
// and delete them with and without their words.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, choose, textOf, waitUntil } from './harness.js';

const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;
const deckRows = (count) => `document.querySelectorAll('#deck-list li').length === ${count}`;

// JavaScript text for the row of the deck with this name in the Words tab.
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

  // Chooses the entry with this text in a list of decks.
  const chooseDeck = async (selectId, label) => {
    const value = await page.evaluate(
      `[...document.getElementById('${selectId}').options].find((entry) => entry.textContent === ${JSON.stringify(label)}).value`,
    );
    await choose(page, selectId, value);
  };

  const addDeck = async (name, inside) => {
    const count = await page.evaluate(`document.querySelectorAll('#deck-list li').length`);
    await type(page, 'add-deck-name', name);
    // "Inside" keeps its choice from one deck to the next (chapters are added
    // in a row), and is only there once there is a deck.
    if (count > 0) {
      await chooseDeck('add-deck-parent', inside || 'No other deck');
    }
    await page.evaluate(`document.getElementById('add-deck-form').requestSubmit()`);
    await waitUntil(page, deckRows(count + 1), `the deck ${name}`);
  };

  const addWord = async (traditional, simplified, pinyin, meaning, deck) => {
    const count = Number(await textOf(page, 'word-count'));
    await type(page, 'add-traditional', traditional);
    await type(page, 'add-simplified', simplified);
    await type(page, 'add-pinyin', pinyin);
    await type(page, 'add-definition', meaning);
    if (deck !== undefined) {
      await chooseDeck('add-deck', deck);
    }
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('word-count').textContent === '${count + 1}'`, `the word ${traditional}`);
  };

  const openDeck = async (name) => {
    await page.evaluate(`${deckRow(name)}.click()`);
    await waitUntil(page, `document.getElementById('deck-dialog').open`, 'the deck panel');
  };

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    await tap(page, 'words-tab');
    await waitUntil(page, `document.getElementById('word-count').textContent === '0'`, 'the Words tab');
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('offers no decks to choose from while there are none', async () => {
    for (const id of ['add-deck-row', 'list-deck-row', 'word-deck-filter-row', 'add-deck-parent-row']) {
      assert.equal(await page.evaluate(`document.getElementById('${id}').hidden`), true, id);
    }
    await addWord('貓', '猫', 'mao1', 'cat');
    await tap(page, 'learn-tab');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('貓')`, 'the word in Learn');
    assert.equal(await page.evaluate(`document.getElementById('deck-select').hidden`), true);
    await tap(page, 'words-tab');
  });

  it('makes a deck, and one inside it', async () => {
    await addDeck('Textbook');
    await addDeck('Chapter 1', 'Textbook');
    const decks = await stored(page, 'decks');
    const textbook = decks.find((deck) => deck.name === 'Textbook');
    assert.equal(textbook.parentId, null);
    assert.equal(decks.find((deck) => deck.name === 'Chapter 1').parentId, textbook.id);
    // A deck cannot be put inside itself or a deck inside it.
    await openDeck('Textbook');
    assert.deepEqual(
      await page.evaluate(`[...document.getElementById('deck-parent').options].map((entry) => entry.textContent)`),
      ['No other deck'],
    );
    await tap(page, 'deck-dialog-close');
  });

  it('adds a word to a deck, and counts it in the deck that one is inside', async () => {
    await addWord('狗', '狗', 'gou3', 'dog', 'Textbook › Chapter 1');
    await waitUntil(page, `${deckRow('Chapter 1')}.textContent.includes('1 word ·')`, 'the count of Chapter 1');
    assert.match(await page.evaluate(`${deckRow('Textbook')}.textContent`), /1 word · 0 learned/);
    // The deck stays chosen for the next word.
    assert.equal(await page.evaluate(`document.getElementById('add-deck').selectedOptions[0].textContent`), 'Textbook › Chapter 1');
  });

  it('shows the words of a deck, or those in none', async () => {
    await chooseDeck('word-deck-filter', 'Textbook');
    await waitUntil(page, rows(1));
    assert.match(await textOf(page, '#word-list li'), /狗/);
    await chooseDeck('word-deck-filter', 'Words in no deck');
    await waitUntil(page, `${rows(1)} && document.querySelector('#word-list li').textContent.includes('貓')`);
    await chooseDeck('word-deck-filter', 'All words');
    await waitUntil(page, rows(2));
  });

  it('puts a word in a deck from its panel', async () => {
    await type(page, 'word-search', 'cat');
    await waitUntil(page, rows(1));
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    assert.equal(await textOf(page, 'edit-decks-summary'), 'Decks: in none');
    await page.evaluate(`document.querySelector('#edit-decks input').click()`); // Textbook, the first
    assert.equal(await textOf(page, 'edit-decks-summary'), 'Decks: in 1');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `${deckRow('Textbook')}.textContent.includes('2 words')`, 'the count of Textbook');
    assert.match(await page.evaluate(`${deckRow('Chapter 1')}.textContent`), /1 word ·/);
    await type(page, 'word-search', '');
  });

  it('puts the words of a list in a deck, those already there too', async () => {
    await page.evaluate(`document.querySelector('details.add-list').open = true`);
    await type(page, 'list-text', '鸟\t鳥\tniao3\tbird\n狗\t狗\tgou3\tdog\n');
    await addDeck('Animals');
    await chooseDeck('list-deck', 'Animals');
    await tap(page, 'check-list-button');
    await waitUntil(page, `!document.getElementById('add-list-button').hidden`, 'the list to be checked');
    await tap(page, 'add-list-button');
    await waitUntil(page, `${deckRow('Animals')}.textContent.includes('2 words')`, 'both words in Animals');
    assert.match(await textOf(page, 'list-report'), /Added 1 word\..*1 word you already had went into the deck/);
    assert.equal(await textOf(page, 'word-count'), '3');
  });

  it('teaches the words of the deck chosen in Learn, toward the deck\'s own goal', async () => {
    await openDeck('Chapter 1');
    await type(page, 'deck-goal', '7');
    await page.evaluate(`document.getElementById('deck-dialog-form').requestSubmit()`);
    await waitUntil(page, `!document.getElementById('deck-dialog').open`, 'the deck panel to close');

    await tap(page, 'learn-tab');
    // All words: the first one added comes first.
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('貓')`, 'the first word');
    assert.match(await textOf(page, 'review-counts'), /of 5 · 3 waiting/);
    assert.equal(await page.evaluate(`document.getElementById('deck-select').hidden`), false);
    await chooseDeck('deck-select', 'Textbook › Chapter 1');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('狗')`, 'the word of the deck');
    assert.match(await textOf(page, 'review-counts'), /of 7 · 1 waiting/);
    // A deck includes the decks inside it; its goal is the one in Settings.
    await chooseDeck('deck-select', 'Textbook');
    await waitUntil(page, `document.getElementById('review-counts').textContent.includes('of 5 · 2 waiting')`, 'the counts of Textbook');

    // Review is narrowed down in the same way.
    await tap(page, 'review-tab');
    await waitUntil(page, `document.getElementById('done-message').textContent.includes('2 words are waiting')`, 'Review for the deck');
    await tap(page, 'words-tab');
  });

  it('deletes a deck and the one inside it, keeping the words', async () => {
    await openDeck('Textbook');
    await tap(page, 'deck-delete-button');
    assert.match(await textOf(page, 'deck-delete-text'), /"Textbook" and the 1 deck inside it\? Its 2 words can stay/);
    // 狗 is in Animals too, so only 貓 would be left without a deck.
    assert.equal(await textOf(page, 'deck-delete-words'), 'Delete the deck and remove 1 word');
    await tap(page, 'deck-delete-keep');
    await waitUntil(page, deckRows(1), 'only Animals left');
    assert.equal(await textOf(page, 'word-count'), '3');
    const words = await stored(page, 'words');
    const animals = (await stored(page, 'decks'))[0].id;
    assert.deepEqual(words.map((word) => [word.traditional, word.decks]).sort(), [
      ['狗', [animals]],
      ['貓', undefined],
      ['鳥', [animals]],
    ]);
    const marks = await stored(page, 'removed');
    assert.deepEqual(marks.map((mark) => mark.kind), ['deck', 'deck']);

    // The deck that was being studied is gone: all words are studied again.
    await tap(page, 'learn-tab');
    await waitUntil(page, `document.getElementById('review-counts').textContent.includes('3 waiting')`, 'all words in Learn');
    assert.equal(await page.evaluate(`document.getElementById('deck-select').value`), '');
    await tap(page, 'words-tab');
  });

  it('deletes a deck with the words that are in no other', async () => {
    await openDeck('Animals');
    await tap(page, 'deck-delete-button');
    assert.equal(await textOf(page, 'deck-delete-words'), 'Delete the deck and remove 2 words');
    await tap(page, 'deck-delete-words');
    await waitUntil(page, deckRows(0), 'no decks left');
    await waitUntil(page, `document.getElementById('word-count').textContent === '1'`, 'one word left');
    assert.deepEqual((await stored(page, 'words')).map((word) => word.traditional), ['貓']);
    const marks = await stored(page, 'removed');
    assert.deepEqual(marks.map((mark) => mark.id).filter((id) => id.includes('|')).sort(), ['狗|gou3', '鳥|niao3']);
    // With no decks there is nothing to choose again.
    assert.equal(await page.evaluate(`document.getElementById('word-deck-filter-row').hidden`), true);
  });
});
