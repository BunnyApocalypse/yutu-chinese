// The Script and Pronunciation settings in a real browser: someone learning
// one script, or mainland pronunciation only, is not asked for or shown the
// rest, on the Words tab and on cards.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, choose, textOf, isShown, waitUntil } from './harness.js';

// Text for "the Words tab's list has this many rows".
const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;

// One browser, and the steps in order: each builds on the one before.
describe('the Script and Pronunciation settings', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Starts a Free practice card of this kind for a word of the built-in list.
  async function practice(word, kind) {
    await tap(page, 'practice-tab');
    await type(page, 'word-input', word);
    await choose(page, 'practice-type', kind);
    await waitUntil(page, `!document.getElementById('card-face').hidden`, 'the card');
  }

  // Taps the card, as a finger would.
  const tapCard = () =>
    page.evaluate(`document.getElementById('card-face').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);

  // Gives these tones on a tone card, one per character, and returns the status line at the end.
  async function giveTones(tones) {
    for (const [index, tone] of tones.entries()) {
      await waitUntil(page, `document.getElementById('status').textContent.includes('${index + 1} of ${tones.length}')`);
      await page.evaluate(`document.querySelector('#tone-buttons [data-tone="${tone}"]').click()`);
    }
    await waitUntil(page, `/right|wrong|Not/.test(document.getElementById('status').textContent)`, 'the result');
    return textOf(page, 'status');
  }

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

  it('shows the Taiwan reading and accepts its tone to begin with', async () => {
    await practice('星期', 'pinyin');
    await tapCard();
    assert.match(await textOf(page, 'card-face'), /xīngqī.*Taiwan: xīngqí/);
    await practice('星期', 'tone');
    assert.equal(await giveTones([1, 2]), 'All tones right');
  });

  it('leaves the Taiwan reading out with mainland pronunciation only', async () => {
    await choose(page, 'pronunciation-select', 'mainlandOnly');
    await practice('星期', 'pinyin');
    await tapCard();
    const face = await textOf(page, 'card-face');
    assert.match(face, /xīngqī/);
    assert.doesNotMatch(face, /Taiwan/);
    await practice('星期', 'tone');
    assert.match(await giveTones([1, 2]), /^Not á/);
  });

  it('asks only for simplified characters when only those are learned', async () => {
    await choose(page, 'script-select', 'simplified');
    await tap(page, 'words-tab');
    await waitUntil(page, `document.getElementById('word-count').textContent !== '0'`, 'the word list');
    assert.equal(await isShown(page, 'add-traditional'), false);
    assert.equal(await isShown(page, 'add-simplified'), true);
    assert.equal(await isShown(page, 'add-pinyin-taiwan'), false);
    assert.doesNotMatch(await textOf(page, 'list-hint'), /traditional, pinyin|Taiwan/);

    await type(page, 'add-simplified', '图书馆');
    await waitUntil(page, `document.querySelector('#add-suggestions button') !== null`, 'a dictionary entry');
    const entry = await textOf(page, '#add-suggestions button');
    assert.match(entry, /图书馆/);
    assert.doesNotMatch(entry, /圖書館/);
    await page.evaluate(`document.querySelector('#add-suggestions button').click()`);
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.startsWith('Added 图书馆.')`);
  });

  it('shows the word list and a word in simplified only', async () => {
    await type(page, 'word-search', 'library');
    await waitUntil(page, rows(1));
    const row = await textOf(page, '#word-list li');
    assert.match(row, /^图书馆/);
    assert.doesNotMatch(row, /圖書館/);
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    assert.match(await textOf(page, 'word-dialog-title'), /^图书馆/);
    assert.equal(await page.evaluate(`document.getElementById('edit-pinyin-taiwan').closest('label').hidden`), true);
    await tap(page, 'word-dialog-close');
  });

  it('works out the traditional form of a word typed by hand, and of a list', async () => {
    // 头发 is not tapped in the dictionary; its reading picks 頭髮 over 頭發.
    await type(page, 'add-simplified', '头发');
    await type(page, 'add-pinyin', 'tou2fa5');
    await type(page, 'add-definition', 'hair');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.startsWith('Added 头发.')`);

    await page.evaluate(`document.querySelector('.add-list').open = true`);
    await type(page, 'list-text', '企鹅\tqi4e2\tpenguin\n孔雀,kong3que4,peacock\n');
    await tap(page, 'check-list-button');
    await waitUntil(page, `document.getElementById('list-report').textContent !== ''`, 'the list report');
    assert.equal(await textOf(page, 'list-report'), "2 new words, 0 you already have, 0 lines that can't be read.");
    await tap(page, 'add-list-button');
    await waitUntil(page, `document.getElementById('list-report').textContent === 'Added 2 words.'`);

    // With both scripts learned, both are shown: the traditional forms were stored.
    await choose(page, 'script-select', 'both-traditional');
    for (const [search, characters] of [['library', '圖書館 · 图书馆'], ['hair', '頭髮 · 头发'], ['penguin', '企鵝 · 企鹅']]) {
      await type(page, 'word-search', search);
      await waitUntil(page, `${rows(1)} && document.querySelector('#word-list li').textContent.startsWith('${characters}')`, characters);
    }
    assert.equal(await isShown(page, 'add-traditional'), true);
    assert.match(await textOf(page, 'list-hint'), /simplified, traditional, pinyin/);
  });

  it('hides simplified when only traditional is learned', async () => {
    await choose(page, 'script-select', 'traditional');
    // A setting is saved before it takes effect, which takes a moment.
    await waitUntil(page, `document.getElementById('add-simplified').hidden`, 'the simplified box to go');
    await type(page, 'word-search', 'library');
    await waitUntil(page, `${rows(1)} && document.querySelector('#word-list li').textContent.startsWith('圖書館')`);
    assert.doesNotMatch(await textOf(page, '#word-list li'), /图书馆/);
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    assert.equal(await page.evaluate(`document.getElementById('edit-simplified').closest('label').hidden`), true);
    // Saving keeps the simplified form that is out of sight.
    await type(page, 'edit-definition', 'library (building)');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await choose(page, 'script-select', 'both-simplified');
    await type(page, 'word-search', 'building');
    await waitUntil(page, `${rows(1)} && document.querySelector('#word-list li').textContent.startsWith('图书馆 · 圖書館')`);
  });
});
