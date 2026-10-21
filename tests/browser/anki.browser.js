// Importing from Anki: choosing a file made by Anki (tests/fixtures/anki/),
// checking the guesses, and what the import saves. The calculation itself is
// tested in tests/ankiImport.test.js; this checks the pop-up and that the
// file is read in a real browser (sql.js, its WebAssembly, the browser's
// own unzipping).
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { startApp, startBrowsers, reloadApp, tap, textOf, waitUntil } from './harness.js';

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

// Hands the pop-up a file as if it had been chosen with "Choose a file".
// Gives what the pop-up showed at once: whether the working sign was there
// and the button disabled.
const chooseFile = (page, name) =>
  page.evaluate(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(fs.readFileSync(`tests/fixtures/anki/${name}`).toString('base64'))}), (c) => c.charCodeAt(0));
    const files = new DataTransfer();
    files.items.add(new File([bytes], ${JSON.stringify(name)}));
    const input = document.getElementById('anki-file');
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
    return {
      sign: Boolean(document.querySelector('#anki-note.working .working-sign')),
      text: document.getElementById('anki-note').textContent,
      disabled: document.getElementById('anki-file-button').disabled,
    };
  })()`);

// The collection's creation time in the files (CRT in make-fixtures.py).
const CRT = 1767240000;

// One browser, and the steps in order: each builds on the one before.
describe('importing from Anki', { concurrency: false }, () => {
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

  it('reads the file and shows what it guessed', async () => {
    await tap(page, 'decks-tab');
    await waitUntil(page, `document.querySelectorAll('#deck-list li').length > 0`, 'the Decks tab');
    // Offered in the panel for a new deck, on the front page.
    assert.equal(await textOf(page, 'new-deck-button'), '+ New / import deck');
    await tap(page, 'new-deck-button');
    assert.equal(await page.evaluate(`document.getElementById('anki-import-row').hidden`), false);
    await tap(page, 'anki-import-button');
    assert.equal(await page.evaluate(`document.getElementById('anki-dialog').open`), true);
    assert.equal(await page.evaluate(`document.getElementById('new-deck-dialog').open`), false);

    // A sign that it is working at once, and the button can't be pressed again.
    assert.deepEqual(await chooseFile(page, 'new.apkg'), { sign: true, text: 'Reading the file…', disabled: true });
    await waitUntil(page, `!document.getElementById('anki-check-step').hidden`, 'the guesses');
    assert.equal(await page.evaluate(`document.getElementById('anki-file-button').disabled`), false);
    assert.equal(await page.evaluate(`document.querySelector('#anki-note .working-sign')`), null);
    assert.equal(await textOf(page, 'anki-summary'), 'In the file: 8 notes in 3 decks, 16 reviews.');
    const summary = await textOf(page, 'anki-note-types');
    assert.match(summary, /Each note becomes a word, like:\s*你好 nǐhǎo · hello/);
    assert.match(summary, /Your Anki reviews count for: Meaning, Pinyin and Tone\.\s*Writing starts new/);
    // The choices are folded away under "Change this" until tapped.
    const change = `document.querySelector('.anki-change')`;
    assert.equal(await page.evaluate(`${change}.open`), false);
    await page.evaluate(`${change}.querySelector('summary').click()`);
    assert.equal(await page.evaluate(`${change}.open`), true);
    const choices = await textOf(page, 'anki-note-types');
    assert.match(choices, /Reviewing Anki’s “Recognition” \(7 cards, showing Hanzi on the front\), you practiced:/);
    assert.match(choices, /Anki can’t check handwriting/);
    // Recognition counts for meaning, pinyin and tone, Recall for nothing yet.
    const ticked = await page.evaluate(`[...document.querySelectorAll('.anki-template')].map((row) =>
      [...row.querySelectorAll('input')].filter((box) => box.checked).map((box) => box.parentElement.textContent.trim()))`);
    assert.deepEqual(ticked, [['Meaning', 'Pinyin', 'Tone'], ['Meaning', 'Pinyin', 'Tone'], [], []]);
    // Templates guessed as nothing are named on a line, their rows hidden
    // until the link is tapped.
    const unused = `[...document.querySelectorAll('.anki-unused')]`;
    assert.deepEqual(await page.evaluate(`${unused}.map((line) => line.textContent)`), [
      'Not brought over: Recall, Listening. Show their checkboxes',
    ]);
    const hiddenRows = `[...document.querySelectorAll('.anki-template')].filter((row) => row.hidden).length`;
    assert.equal(await page.evaluate(hiddenRows), 2);
    // In the other note type's "Change this", opened first, as a learner would.
    await page.evaluate(`${unused}[0].closest('details').open = true`);
    await page.evaluate(`${unused}[0].querySelector('button').click()`);
    assert.equal(await page.evaluate(hiddenRows), 0);
    assert.equal(await page.evaluate(`${unused}.length`), 0);
    // Focus goes on to the first box shown.
    assert.equal(await page.evaluate(`document.activeElement.parentElement.textContent.trim()`), 'Meaning');
  });

  it("saves the words, decks and Anki's schedules", async () => {
    const atOnce = await page.evaluate(`(() => {
      document.getElementById('anki-import-now').click();
      return [Boolean(document.querySelector('#anki-note.working .working-sign')), document.getElementById('anki-import-now').disabled];
    })()`);
    assert.deepEqual(atOnce, [true, true]);
    await waitUntil(page, `!document.getElementById('anki-done-step').hidden`, 'the result');
    assert.match(await textOf(page, 'anki-result'), /^Brought over 6 new words\.\s*15 cards keep their schedule from Anki, with 33 reviews of history\.\s*1 word you hadn’t studied in Anki yet waits in Learn\./);
    assert.match(await textOf(page, 'anki-left-out'), /^1 note was left out\s*They weren’t brought over\./);
    assert.match(await textOf(page, 'anki-problems'), /Measure words\s*To study one, add it yourself: open a deck, tap “\+\sAdd to deck”, then “One word”\./);

    const words = await stored(page, 'words');
    assert.ok(words.some((word) => word.id === '你好|ni3hao3' && word.importedAt));
    const decks = await stored(page, 'decks');
    const chinese = decks.find((deck) => deck.name === 'Chinese');
    assert.ok(decks.some((deck) => deck.name === 'HSK 1' && deck.parentId === chinese.id));
    const card = (await stored(page, 'cards')).find((candidate) => candidate.id === '你好|ni3hao3#meaning');
    assert.equal(card.due, (CRT + 300 * 86400) * 1000);

    await tap(page, 'anki-done-button');
    await waitUntil(page, `document.getElementById('deck-list').textContent.includes('Chinese')`, 'the new deck');
  });

  it('brings the writing cards in a few a day', async () => {
    await tap(page, 'review-tab');
    // 中國 is overdue in its learning steps; writing cards without history
    // come as "more new today", as many as the new words per day.
    await waitUntil(page, `/more new today/.test(document.getElementById('review-counts').textContent)`, 'the counts');
    assert.match(await textOf(page, 'review-counts'), /to review · 0 new · \d+ more new today/);
  });

  it('adds nothing when the same file is imported again', async () => {
    const reviewsBefore = (await stored(page, 'reviews')).length;
    await tap(page, 'decks-tab');
    await tap(page, 'anki-import-button');
    await chooseFile(page, 'legacy.apkg');
    await waitUntil(page, `!document.getElementById('anki-check-step').hidden`, 'the guesses');
    await tap(page, 'anki-import-now');
    await waitUntil(page, `!document.getElementById('anki-done-step').hidden`, 'the result');
    assert.match(await textOf(page, 'anki-result'), /^No new words\.\s*6 words you already had were added to these decks\./);
    assert.equal((await stored(page, 'reviews')).length, reviewsBefore);
  });

  it("offers the deck's meaning for a word whose meaning differs", async () => {
    // 你好's meaning as if the learner had changed it.
    await page.evaluate(`new Promise((resolve, reject) => {
      const request = indexedDB.open('hanzi-trainer');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction(['words'], 'readwrite');
        const words = transaction.objectStore('words');
        words.get('你好|ni3hao3').onsuccess = (event) => words.put({ ...event.target.result, definition: 'hi there' });
        transaction.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
    })`);
    await reloadApp(page);
    await tap(page, 'decks-tab');
    await tap(page, 'new-deck-button');
    await tap(page, 'anki-import-button');
    await chooseFile(page, 'legacy.apkg');
    await waitUntil(page, `!document.getElementById('anki-check-step').hidden`, 'the guesses');
    const box = `[...document.querySelectorAll('.anki-note-type')].find((box) => box.querySelector('legend').textContent === 'Words you already have')`;
    assert.match(await page.evaluate(`${box}.textContent`), /Use the deck’s meanings for the 1 word you already have/);
    // Off unless chosen.
    assert.equal(await page.evaluate(`${box}.querySelector('input').checked`), false);
    // Counted again when the decks change: none ticked, no such words.
    const deckBoxes = `document.querySelectorAll('#anki-decks input')`;
    await page.evaluate(`${deckBoxes}.forEach((input) => input.click())`);
    assert.equal(await page.evaluate(`Boolean(${box})`), false);
    await page.evaluate(`${deckBoxes}.forEach((input) => input.click())`);
    assert.equal(await page.evaluate(`Boolean(${box})`), true);
    await page.evaluate(`${box}.querySelector('input').click()`);
    await tap(page, 'anki-import-now');
    await waitUntil(page, `!document.getElementById('anki-done-step').hidden`, 'the result');
    assert.match(await textOf(page, 'anki-result'), /1 word you already had was given the deck’s meaning\./);
    const word = (await stored(page, 'words')).find((candidate) => candidate.id === '你好|ni3hao3');
    assert.equal(word.definition, 'hello');
  });
});
