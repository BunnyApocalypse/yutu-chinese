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
    // Shown in both scripts, each line says which it is.
    assert.deepEqual(await page.evaluate(texts('.sentence-script')), ['trad. 繁體', 'simp. 简体']);
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

    // A word of the example sentence: 同學. A tap shows a small popup first,
    // with its reading in the sentence, its meaning and a loudspeaker; a tap
    // elsewhere closes it, and the page stays.
    const peekOpen = `document.getElementById('word-peek').matches(':popover-open')`;
    await page.evaluate(`document.querySelectorAll('#word-page-body .sentence-word')[2].click()`);
    await waitUntil(page, peekOpen, 'the popup');
    assert.equal(await textOf(page, 'word-peek-word'), '同學');
    assert.equal(await textOf(page, 'word-peek-pinyin'), 'tóngxué');
    assert.match(await textOf(page, 'word-peek-meaning'), /classmate/);
    assert.equal(await page.evaluate(`document.querySelectorAll('#word-peek .icon-button').length`), 1);
    // A press elsewhere, as a finger would, closes it and does nothing else:
    // pressed on Close, the page stays open.
    const pressClose = async () => {
      const box = await page.evaluate(`JSON.stringify(document.getElementById('word-page-close').getBoundingClientRect())`).then(JSON.parse);
      for (const type of ['mousePressed', 'mouseReleased']) {
        await page.send('Input.dispatchMouseEvent', { type, x: box.x + box.width / 2, y: box.y + box.height / 2, button: 'left', clickCount: 1 });
      }
    };
    await pressClose();
    await waitUntil(page, `!${peekOpen}`, 'the popup closed');
    assert.ok(await page.evaluate(`document.getElementById('word-page').open`));
    assert.ok(await page.evaluate(shown('我們|wo3men5')));
    // The words of the learning note can be tapped too, once the dictionary
    // has split it into words. With no sentence to say which reading is
    // meant, the usual one is shown: 的 is "de", not "dí".
    await waitUntil(page, `document.querySelectorAll('#word-page-body .note-word').length > 0`, 'the note\'s words');
    assert.deepEqual(
      await page.evaluate(texts('.note-word')),
      ['我', '们', '的', '我们', '的', '老师'],
    );
    await page.evaluate(`document.querySelectorAll('#word-page-body .note-word')[2].click()`);
    await waitUntil(page, `${peekOpen} && document.getElementById('word-peek-word').textContent === '的'`, 'the popup for 的');
    assert.equal(await textOf(page, 'word-peek-pinyin'), 'de');
    await pressClose();
    await waitUntil(page, `!${peekOpen}`, 'the popup closed');

    // "Open its page" goes on to the word's page.
    await page.evaluate(`document.querySelectorAll('#word-page-body .sentence-word')[2].click()`);
    await waitUntil(page, peekOpen, 'the popup again');
    await tap(page, 'word-peek-open');
    await waitUntil(page, shown('同學'), 'the page of 同學');
    assert.equal(await page.evaluate(peekOpen), false);
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
