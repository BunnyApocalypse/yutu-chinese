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

import { startApp, startBrowsers, tap, textOf, waitUntil } from './harness.js';

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
const chooseFile = (page, name) =>
  page.evaluate(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(fs.readFileSync(`tests/fixtures/anki/${name}`).toString('base64'))}), (c) => c.charCodeAt(0));
    const files = new DataTransfer();
    files.items.add(new File([bytes], ${JSON.stringify(name)}));
    const input = document.getElementById('anki-file');
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
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
    assert.equal(await page.evaluate(`document.getElementById('anki-import-row').hidden`), false);
    await tap(page, 'anki-import-button');
    assert.equal(await page.evaluate(`document.getElementById('anki-dialog').open`), true);

    await chooseFile(page, 'new.apkg');
    await waitUntil(page, `!document.getElementById('anki-check-step').hidden`, 'the guesses');
    assert.equal(await textOf(page, 'anki-summary'), 'In the file: 8 notes in 3 decks, 16 reviews.');
    const choices = await textOf(page, 'anki-note-types');
    assert.match(choices, /First note: 你好 nǐhǎo · hello/);
    assert.match(choices, /Recognition \(shows Hanzi\) · 7 cards/);
    assert.match(choices, /Anki can’t check handwriting/);
    // Recognition counts for meaning and pinyin, Recall for nothing yet.
    const ticked = await page.evaluate(`[...document.querySelectorAll('.anki-template')].map((row) =>
      [...row.querySelectorAll('input')].filter((box) => box.checked).map((box) => box.parentElement.textContent.trim()))`);
    assert.deepEqual(ticked, [['Meaning', 'Pinyin'], ['Meaning', 'Pinyin'], [], []]);
  });

  it("saves the words, decks and Anki's schedules", async () => {
    await tap(page, 'anki-import-now');
    await waitUntil(page, `!document.getElementById('anki-done-step').hidden`, 'the result');
    assert.match(await textOf(page, 'anki-result'), /^Brought over 6 new words\. 15 cards keep their schedule from Anki, with 33 reviews of history\. 1 word not yet studied in Anki waits in Learn\./);
    assert.match(await textOf(page, 'anki-problems'), /Measure words/);

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
    assert.match(await textOf(page, 'anki-result'), /^No new words\. 6 words you had already went into the decks\./);
    assert.equal((await stored(page, 'reviews')).length, reviewsBefore);
  });
});
