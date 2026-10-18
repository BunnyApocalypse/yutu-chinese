// Decks in a real browser: the deck the app starts with, decks inside one
// another with a page each, adding words on a deck's page, studying a deck
// with a goal of its own, and deleting decks with and without their words.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, choose, textOf, isShown, waitUntil, openLearn, useAddForm } from './harness.js';

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

  // Opens the page of a deck listed on the page shown, with the › beside
  // its row (a tap on the row itself studies it).
  const openDeck = async (name) => {
    await page.evaluate(`${deckRow(name)}.parentElement.querySelector('.deck-open').click()`);
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
    await useAddForm(page, 'add-word-fold');
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

  it('starts with one deck, on the front page, which the first word goes into', async () => {
    // The tab opens on its front page, with the one deck the app starts with
    // listed and none opened by itself.
    await waitUntil(page, `document.getElementById('deck-head').hidden && ${deckRows(1)}`, 'the front page');
    await openDeck('Chinese 中文');
    // On a deck inside no other, the way back in the top bar says where it
    // is; the line "Decks › …" is only shown inside other decks.
    assert.equal(await textOf(page, 'deck-back-button'), 'Decks');
    assert.equal(await textOf(page, 'deck-path'), '');
    assert.match(await addWord('貓', '猫', 'mao1', 'cat'), /^Added/);
    await waitUntil(page, rows(1));
    assert.deepEqual(await decksOf('貓'), ['chinese']);
    assert.match(await textOf(page, 'deck-counts'), /^1 word · 0 learned/);
    // With one deck there is nothing to choose in Learn.
    await openLearn(page);
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('貓')`, 'the word in Learn');
    assert.equal(await page.evaluate(`document.getElementById('deck-select').hidden`), true);
    // Back to Decks: the front page again, not the deck that was open.
    await tap(page, 'decks-tab');
    await waitUntil(page, `document.getElementById('deck-head').hidden`, 'the front page again');
  });

  it('makes a deck on the front page, and one inside it on its page', async () => {
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
    // Its counts under its name (said "[object Object]" until 2026-10-18).
    assert.match(await textOf(page, 'deck-dialog-status'), /^\d+ words? · 0 learned/);
    await tap(page, 'deck-dialog-close');
  });

  it('adds a word on a deck\'s page, and shows it in the deck that one is inside', async () => {
    await openDeck('Chapter 1');
    assert.equal(await textOf(page, 'deck-path'), 'Decks › Textbook › Chapter 1');
    assert.match(await addWord('狗', '狗', 'gou3', 'dog'), /^Added/);
    await waitUntil(page, rows(1));
    // "‹ Textbook", in the top bar in place of the screen's name, goes up one level.
    assert.equal(await textOf(page, 'deck-back-button'), 'Textbook');
    assert.equal(await textOf(page, 'place-title'), '');
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
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
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
    await useAddForm(page, 'add-list-fold');
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
    await waitUntil(page, `document.getElementById('place-title').textContent === 'Learn'`, 'Learn');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('狗')`, 'the word of the deck');
    assert.match(await textOf(page, 'review-counts'), /of 7 learned today · 1 waiting/);
    assert.equal(await page.evaluate(`document.getElementById('deck-select').selectedOptions[0].textContent`), 'Textbook › Chapter 1');
    // All words: the first one added comes first, toward the goal in Settings.
    await choose(page, 'deck-select', '');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('貓')`, 'the first word');
    assert.match(await textOf(page, 'review-counts'), /of 5 learned today · 3 waiting/);

    // "Review this deck" does the same for Review. A deck includes the decks inside it.
    await tap(page, 'decks-tab');
    await waitUntil(page, `document.getElementById('deck-head').hidden`, 'the front page');
    await openDeck('Textbook');
    await tap(page, 'deck-review-button');
    await waitUntil(page, `document.getElementById('done-message').textContent.includes('2 words are waiting')`, 'Review for the deck');
    await tap(page, 'decks-tab');
  });

  it('studies a deck with a tap on its row', async () => {
    await waitUntil(page, `document.getElementById('deck-head').hidden`, 'the front page');
    // The screen's name is back in the top bar, without the way back.
    assert.equal(await textOf(page, 'place-title'), 'Decks');
    assert.equal(await textOf(page, 'deck-back-button'), '');
    // Words wait in it, so a tap learns them; one Learn button on its page,
    // with Review small beside it.
    assert.match(await page.evaluate(`${deckRow('Textbook')}.textContent`), /Tap to learn$/);
    await openDeck('Textbook');
    assert.equal(await page.evaluate(`document.getElementById('deck-learn-button').classList.contains('primary')`), true);
    assert.equal(await textOf(page, 'deck-review-button'), 'Review');
    await tap(page, 'deck-back-button');
    await waitUntil(page, `document.getElementById('deck-head').hidden`, 'the front page');
    await page.evaluate(`${deckRow('Textbook')}.click()`);
    await waitUntil(page, `document.getElementById('place-title').textContent === 'Learn'`, 'Learn');
    assert.equal(await page.evaluate(`document.getElementById('deck-select').selectedOptions[0].textContent`), 'Textbook');
    // "‹ Decks" in place of the screen's name goes back to the front page
    // (tester 2, 2026-10-17: there was no way back).
    assert.equal(await isShown(page, 'place-title'), false);
    assert.equal(await textOf(page, 'study-back-button'), 'Decks');
    // While a card is up, the arrow alone takes the menu button's place.
    await waitUntil(page, `document.querySelector('main').classList.contains('focused')`, 'a card up');
    assert.equal(await page.evaluate(`getComputedStyle(document.getElementById('menu-button')).display`), 'none');
    assert.equal(await page.evaluate(`getComputedStyle(document.getElementById('study-back-label')).display`), 'none');
    assert.equal(await page.evaluate(`document.getElementById('study-back-button').getAttribute('aria-label')`), 'Back to Decks');
    await tap(page, 'study-back-button');
    await waitUntil(page, `!document.getElementById('words-panel').hidden && document.getElementById('deck-head').hidden`, 'the front page');
    assert.equal(await isShown(page, 'study-back-button'), false);
    assert.equal(await textOf(page, 'place-title'), 'Decks');
    // From a deck's page, back to that page.
    await openDeck('Textbook');
    await tap(page, 'deck-review-button');
    await waitUntil(page, `document.getElementById('place-title').textContent === 'Review'`, 'Review');
    await tap(page, 'study-back-button');
    await waitUntil(page, `${titleIs('Textbook')} && !document.getElementById('deck-back-button').hidden`, 'the deck page again');
    await tap(page, 'deck-back-button');
    // Another way to another screen puts it away.
    await page.evaluate(`${deckRow('Textbook')}.click()`);
    await waitUntil(page, `document.getElementById('place-title').textContent === 'Learn'`, 'Learn');
    await tap(page, 'review-tab');
    await waitUntil(page, `document.getElementById('place-title').textContent === 'Review'`, 'Review');
    assert.equal(await isShown(page, 'study-back-button'), false);
    assert.equal(await isShown(page, 'place-title'), true);
    await tap(page, 'decks-tab');
  });

  it('deletes a deck and moves the words it leaves without one', async () => {
    await waitUntil(page, `document.getElementById('deck-head').hidden`, 'the front page');
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
    await openLearn(page);
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

  it('makes a deck of each group of words inside a ready-made level', { timeout: 60000 }, async () => {
    await tap(page, 'ready-decks-button');
    await page.evaluate(`document.querySelector('#ready-list button[data-list="tocfl"]').click()`);
    await waitUntil(page, `document.querySelector('#ready-levels li span')?.textContent.startsWith('Novice 1:')`, 'the levels of TOCFL');
    await page.evaluate(`document.querySelector('#ready-levels button[data-level="Novice 1"]').click()`);
    // Reading the dictionary and adding the words takes a few seconds.
    await waitUntil(page, `document.getElementById('ready-report').textContent.startsWith('Added 182 words')`, 'the words added');

    // The level, a deck of its own, and its eleven topics, in the list's order.
    const decks = await stored(page, 'decks');
    const topics = decks.filter((deck) => deck.parentId === 'tocfl/Novice 1').sort((a, b) => a.order - b.order);
    assert.equal(decks.find((deck) => deck.id === 'tocfl/Novice 1').parentId, null);
    assert.equal(decks.some((deck) => deck.id === 'tocfl'), false);
    assert.equal(topics.length, 11);
    assert.deepEqual(topics.slice(0, 2).map((deck) => deck.name), ['Personal information 個人資料', 'Work 工作']);
    // A word is in its topic's deck, and so counts for the level.
    const me = (await stored(page, 'words')).find((word) => word.id === '我|wo3');
    assert.deepEqual(me.decks, ['tocfl/Novice 1/01']);
    await tap(page, 'my-decks-button');
    await waitUntil(page, deckRows(2), 'the two decks');
    assert.match(await textOf(page, '#deck-list li:first-child .deck-entry'), /^TOCFL Novice 1182 words · 0 learned \(0%\) · 11 decks insideTap to learn$/);
    // The bar for several words offers only the learner's own decks: a
    // ready-made one is as its list has it (the owner, 2026-10-18).
    const offered = (id) => page.evaluate(`[...document.getElementById('${id}').options].map((option) => option.value)`);
    await tap(page, 'words-tab');
    await tap(page, 'select-words-button');
    assert.ok((await offered('bulk-deck')).length > 0);
    assert.equal((await offered('bulk-deck')).some((id) => id.startsWith('tocfl/')), false);
    await tap(page, 'select-words-button');

    // A word of the level: its example sentence goes into the word's topic
    // to begin with, and its panel's boxes are the learner's own decks, the
    // level named under them.
    const japan = (await stored(page, 'words')).find((word) => word.id === '日本|Ri4ben3');
    await type(page, 'word-search', '日本');
    await page.evaluate(`[...document.querySelectorAll('#word-list li button')].find((row) => row.dataset.wordId === '日本|Ri4ben3' || row.querySelector('.entry-pinyin')?.textContent === 'Rìběn').click()`);
    await waitUntil(page, `document.getElementById('word-page').dataset.shown === '日本|Ri4ben3'`, "日本's page");
    await waitUntil(page, `document.querySelector('#word-page-body .page-add-sentence select') !== null`, 'the way to add its sentence');
    assert.equal(await page.evaluate(`document.querySelector('#word-page-body .page-add-sentence select').value`), japan.decks[0]);
    assert.ok(japan.decks[0].startsWith('tocfl/Novice 1/'));
    await tap(page, 'word-page-edit');
    const boxes = await page.evaluate(`[...document.querySelectorAll('#edit-decks input')].map((box) => box.value)`);
    assert.ok(boxes.length > 0);
    assert.equal(boxes.some((id) => id.startsWith('tocfl/')), false);
    assert.match(await page.evaluate(`document.querySelector('#edit-decks .hint').textContent`), /^Also in the ready-made deck TOCFL Novice 1 › /);
    await tap(page, 'word-dialog-close');
    await type(page, 'word-search', '');
    await tap(page, 'decks-tab');
  });

  it('adds the common radicals, and teaches one that is not a word', { timeout: 60000 }, async () => {
    await tap(page, 'ready-decks-button');
    await page.evaluate(`document.querySelector('#ready-list button[data-list="radicals"]').click()`);
    await waitUntil(page, `document.querySelector('#ready-levels li span')?.textContent.startsWith('Common:')`, 'the levels of the radicals');
    // The radicals' two levels make one deck: they are ticked and added together.
    assert.equal(await page.evaluate(`document.getElementById('add-ready-button').disabled`), true);
    await page.evaluate(`document.querySelector('#ready-levels input[value="Common"]').click()`);
    await tap(page, 'add-ready-button');
    await waitUntil(page, `document.getElementById('ready-report').textContent.startsWith('Added')`, 'the radicals added');

    const words = await stored(page, 'words');
    // A radical that is a word is the word TOCFL brought, now in both decks.
    const water = words.find((word) => word.id === '水|shui3');
    assert.deepEqual(water.decks, ['tocfl/Novice 1/04', 'radicals/Common']);
    // One that is not a word is a radical of its own, with its meaning.
    const side = words.find((word) => word.id === '氵|radical');
    assert.equal(side.kind, 'radical');
    assert.equal(side.pinyin, '');
    assert.equal(side.definition, 'water (side form of 水)');
    assert.deepEqual(side.decks, ['radicals/Common']);

    // Learning the radicals' deck, the words TOCFL brought come first (they
    // were in line already); past them, a radical's lesson is a first look
    // and three writing steps, with no tones and nothing to hear.
    await openLearn(page);
    await choose(page, 'deck-select', 'radicals/Common');
    const typeShown = `document.getElementById('card-type').textContent`;
    await waitUntil(page, `${typeShown}.startsWith('New ')`, 'a lesson');
    for (let skipped = 0; (await page.evaluate(typeShown)).startsWith('New word'); skipped += 1) {
      assert.ok(skipped < 40, 'no radical came up');
      const before = await page.evaluate(`document.getElementById('study-area').textContent`);
      await tap(page, 'skip-lesson-button');
      await waitUntil(page, `document.getElementById('study-area').textContent !== ${JSON.stringify(before)}`, 'the next lesson');
    }
    assert.match(await page.evaluate(typeShown), /^New radical · step 1 of 4/);
    assert.equal(await page.evaluate(`document.getElementById('listen-button').hidden`), true);
    await choose(page, 'deck-select', '');
    // The Decks tab was left on Ready-made decks; it comes back on My decks.
    await tap(page, 'decks-tab');
    await waitUntil(page, `!document.getElementById('my-decks-section').hidden`, 'My decks');
    assert.equal(await page.evaluate(`document.getElementById('ready-decks-section').hidden`), true);
  });
});
