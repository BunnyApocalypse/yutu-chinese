// The word page: what a tap on a word in the Decks tab opens. Its note and
// example sentence, the parts of its characters, and the taps that lead
// from one page to the next.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, textOf, waitUntil, openDeckPage, isShown } from './harness.js';

const shown = (what) => `document.getElementById('word-page').dataset.shown === ${JSON.stringify(what)}`;
const texts = (selector) => `[...document.querySelectorAll('#word-page-body ${selector}')].map((found) => found.textContent)`;

// One browser, and the steps in order: each builds on the one before.
describe('the word page', { concurrency: false }, () => {
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

  it('shows a word with its note, its example sentence and how its characters are built', async () => {
    await openDeckPage(page);
    await type(page, 'add-traditional', '我們');
    await type(page, 'add-simplified', '我们');
    await type(page, 'add-pinyin', 'wo3men5');
    await type(page, 'add-definition', 'we; us');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.querySelectorAll('#word-list li').length === 1`, 'the word');

    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(page, shown('我們|wo3men5'), 'the word\'s page');
    // The tests learn both scripts, with cards in traditional: that one first.
    assert.deepEqual(await page.evaluate(texts('.page-word')), ['我們', '我们']);
    assert.match(await textOf(page, '#word-page-body .page-reading'), /^wǒmen/);
    assert.equal(await textOf(page, '#word-page-body .page-meaning'), 'we; us');
    assert.deepEqual(await page.evaluate(texts('.chip')), ['Chinese 中文']);
    // The note, and the sentence in both scripts, word by word.
    assert.match(await textOf(page, '#word-page-body .page-note'), /^"We" or "us"/);
    assert.deepEqual(await page.evaluate(texts('.sentence-word')), ['我們', '是', '同學', '我们', '是', '同学']);
    assert.equal(await textOf(page, '#word-page-body .page-english'), 'We are classmates.');
    // Each character with its parts; 們 has one for the meaning and one for the sound.
    assert.deepEqual(await page.evaluate(texts('.character-big')), ['我', '們']);
    assert.deepEqual(await page.evaluate(texts('.part.meaning, .part.sound')), ['亻meaning', '門sound']);
    assert.equal(await isShown(page, 'word-page-edit'), true);
    assert.equal(await isShown(page, 'word-page-back'), false);
  });

  it('speaks the word when its loudspeaker is tapped', async () => {
    await page.evaluate(`document.querySelector('#word-page-body .page-reading button').click()`);
    // 我们 has a recording of its own.
    await waitUntil(page, `document.querySelector('#word-page-body .page-reading button').dataset.spoken === 'word'`, 'the word spoken');
  });

  it('goes on to a part of a character and to a word of the sentence, and back', async () => {
    // The sound part of 們.
    await page.evaluate(`document.querySelector('#word-page-body .part.sound').click()`);
    await waitUntil(page, shown('門'), 'the page of 門');
    // Not one of the learner's words: the dictionary's entry.
    assert.match(await textOf(page, '#word-page-body .page-meaning'), /^mén: .*gate/);
    assert.match((await page.evaluate(texts('.hint'))).join(' '), /Not in your words/);
    assert.equal(await isShown(page, 'word-page-edit'), false);
    assert.equal(await isShown(page, 'word-page-back'), true);
    await tap(page, 'word-page-back');
    await waitUntil(page, shown('我們|wo3men5'), 'the word\'s page again');

    // A word of the example sentence: 同學.
    await page.evaluate(`document.querySelectorAll('#word-page-body .sentence-word')[2].click()`);
    await waitUntil(page, shown('同學'), 'the page of 同學');
    assert.match(await textOf(page, '#word-page-body .page-meaning'), /^tóngxué: .*classmate/);
    // It has a note of its own, being a word of the same level.
    assert.equal((await page.evaluate(texts('.page-note'))).length, 1);
    await tap(page, 'word-page-back');
    await waitUntil(page, shown('我們|wo3men5'), 'the word\'s page once more');
  });

  it('leads to the panel for changing the word', async () => {
    await tap(page, 'word-page-edit');
    assert.equal(await page.evaluate(`document.getElementById('word-page').open`), false);
    assert.equal(await page.evaluate(`document.getElementById('word-dialog').open`), true);
    assert.equal(await page.evaluate(`document.getElementById('edit-definition').value`), 'we; us');
    await tap(page, 'word-dialog-close');
  });
});
