// Repeating a word's lesson from its page (tester 2's R6; the owner,
// 2026-10-18): a word already learned goes through its lesson again, as
// practice, and nothing is saved; a word still waiting is offered "Learn it
// now" instead.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, writingArea, drawStroke, loadStrokeData, tap, textOf, isShown, waitUntil } from './harness.js';

const stepIs = (step) => `document.getElementById('card-type').textContent.endsWith('${step}')`;

describe('repeating a lesson', { concurrency: false }, () => {
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
        tx.oncomplete = () => resolve(JSON.stringify(result));
        tx.onerror = () => reject(tx.error);
      };
    })`).then(JSON.parse);

  // What is saved of the words, cards and reviews.
  const saved = () =>
    inDatabase(`
      stores.words.getAll().onsuccess = (event) => { result.words = event.target.result; };
      stores.cards.getAll().onsuccess = (event) => { result.cards = event.target.result; };
      stores.reviews.getAll().onsuccess = (event) => { result.reviews = event.target.result; };
    `);

  // Writes a character in the writing area once it can be written.
  async function write(char) {
    await waitUntil(
      page,
      `document.getElementById('stroke-count').textContent.startsWith('1/') && !document.getElementById('writing-area').hasAttribute('data-busy')`,
      'the character to be writable',
    );
    const area = await writingArea(page);
    let status = '';
    for (const median of loadStrokeData(char).medians) {
      status = await drawStroke(page, area, median);
    }
    return status;
  }

  // Opens the page of the word in the Words tab's list.
  async function openWordPage(id) {
    await tap(page, 'words-tab');
    await waitUntil(page, `document.querySelectorAll('#word-list li').length === 2`, 'the list');
    await page.evaluate(
      `[...document.querySelectorAll('#word-list li button')].find((row) => row.querySelector('.entry-characters').textContent.startsWith(${JSON.stringify(id[0])})).click()`,
    );
    await waitUntil(page, `document.getElementById('word-page').dataset.shown === ${JSON.stringify(id)}`, `the page of ${id}`);
  }

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // 大 learned, with a tone card that is not due; 小 waiting. Only tone
    // and writing cards are on.
    await inDatabase(`
      stores.words.put({ id: '大|da4', traditional: '大', simplified: '大', pinyin: 'da4', definition: 'big', order: 0, addedAt: 1, learnedAt: 2, decks: ['chinese'] });
      stores.words.put({ id: '小|xiao3', traditional: '小', simplified: '小', pinyin: 'xiao3', definition: 'small', order: 1, addedAt: 1, decks: ['chinese'] });
      stores.cards.put({ id: '大|da4#tone', wordId: '大|da4', type: 'tone', due: Date.now() + 1e9, firstReviewedAt: 3, lastReviewedAt: 3, fsrsState: {} });
      stores.settings.put({ key: 'enabledTypes', value: ['tone', 'writing'] });
    `);
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('goes through the lesson of a word already learned, saving nothing', { timeout: 90000 }, async () => {
    const before = await saved();
    await openWordPage('大|da4');
    assert.equal(await isShown(page, 'word-page-lesson'), true);
    assert.equal(await textOf(page, 'word-page-lesson'), 'Repeat lesson');
    await tap(page, 'word-page-lesson');

    await waitUntil(page, stepIs('step 1 of 5'), 'step 1');
    assert.match(await textOf(page, 'card-face'), /^大dàbig/);
    // Not a new word (the owner, 2026-10-18).
    assert.equal(await textOf(page, 'card-type'), 'Repeat lesson · step 1 of 5');
    assert.equal(await textOf(page, 'lesson-note'), 'Have another look.');
    // No "I know this word", which would grade the cards; the way back in the
    // corner, and no deck or counts.
    assert.equal(await isShown(page, 'skip-lesson-button'), false);
    assert.equal(await isShown(page, 'study-back-button'), true);
    assert.equal(await page.evaluate(`document.querySelector('.counts-row').hidden`), true);
    await tap(page, 'lesson-next-button');

    await waitUntil(page, stepIs('step 2 of 5'), 'step 2');
    await waitUntil(page, `document.querySelector('#tone-buttons [data-tone="4"]')`, 'the tone card');
    await page.evaluate(`document.querySelector('#tone-buttons [data-tone="4"]').click()`);
    await waitUntil(page, `document.getElementById('status').textContent === 'All tones right'`);
    await tap(page, 'lesson-next-button');
    for (const step of ['step 3 of 5', 'step 4 of 5', 'step 5 of 5']) {
      await waitUntil(page, stepIs(step), step);
      assert.equal(await write('大'), 'No mistakes');
      assert.equal(await isShown(page, 'grade-row'), false);
      await tap(page, 'next-button');
    }

    await waitUntil(page, `document.getElementById('done-message').textContent === 'Lesson done.'`, 'the end');
    assert.equal(await textOf(page, 'learn-next-button'), 'Repeat lesson');
    assert.equal(await isShown(page, 'lesson-back-button'), true);
    assert.equal(await isShown(page, 'add-words-button'), false);
    // Nothing saved: the same words, cards and reviews as before.
    assert.deepEqual(await saved(), before);

    // Again from the start.
    await tap(page, 'learn-next-button');
    await waitUntil(page, stepIs('step 1 of 5'), 'step 1 again');
  });

  it("goes back to the word's page, where it was opened", async () => {
    // The page's mark is still there from before the lesson: without
    // clearing it, the wait below would end before the page is open again,
    // and its late filling-in would land on the next page opened.
    await page.evaluate(`delete document.getElementById('word-page').dataset.shown`);
    await tap(page, 'study-back-button');
    await waitUntil(page, `document.getElementById('word-page').dataset.shown === '大|da4'`, "the word's page again");
    assert.equal(await isShown(page, 'words-part'), true);
    assert.equal(await page.evaluate(`document.querySelector('.counts-row').hidden`), false);
    await tap(page, 'word-page-close');
  });

  it('offers a word still waiting its lesson in Learn instead', { timeout: 60000 }, async () => {
    await openWordPage('小|xiao3');
    assert.equal(await textOf(page, 'word-page-lesson'), 'Learn it now');
    await tap(page, 'word-page-lesson');
    // (Its first step's label is the same as the one left from the lesson
    // repeated: wait for the word.)
    await waitUntil(page, `document.getElementById('card-face').textContent.startsWith('小')`, 'its lesson in Learn');
    assert.match(await textOf(page, 'card-face'), /^小xiǎosmall/);
    // The real lesson: it can be skipped as known.
    assert.equal(await isShown(page, 'skip-lesson-button'), true);
    assert.equal(await textOf(page, 'card-type'), 'New word · step 1 of 5');
    assert.equal(await page.evaluate(`document.getElementById('learn-tab').classList.contains('selected')`), true);
  });
});
