// The Words tab in a real browser: add a word, find it, have it come up in
// Review, change it, add a list, remove a word, and check that it all
// survives closing and reopening the app.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, tap, type, textOf, waitUntil } from './harness.js';

// Text for "the Words tab's list has this many rows".
const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;
const wordCount = (page) => textOf(page, 'word-count').then(Number);

// One browser, and the steps in order: each builds on the one before.
describe('the Words tab', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;
  let countAtStart;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // The pop-up that asks before a word is removed: answer OK.
    await page.evaluate('window.confirm = () => true');
    await tap(page, 'words-tab');
    await waitUntil(page, `document.getElementById('word-count').textContent !== '0'`, 'the word list');
    countAtStart = await wordCount(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('adds a typed word', async () => {
    await type(page, 'add-traditional', '貓頭鷹');
    await type(page, 'add-simplified', '猫头鹰');
    await type(page, 'add-pinyin', 'mao1 tou2 ying1');
    assert.equal(await textOf(page, 'add-pinyin-preview'), 'māo tóu yīng');
    await type(page, 'add-definition', 'owl');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('word-count').textContent === '${countAtStart + 1}'`);
    assert.match(await textOf(page, 'add-word-note'), /^Added 貓頭鷹/);
  });

  it('refuses the same word twice, and a word with bad pinyin', async () => {
    await type(page, 'add-traditional', '貓頭鷹');
    await type(page, 'add-pinyin', 'mao1tou2ying1');
    await type(page, 'add-definition', 'owl again');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.includes('already')`);

    await type(page, 'add-pinyin', 'māotóuyīng');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.includes('tone numbers')`);
    assert.equal(await wordCount(page), countAtStart + 1);
  });

  it('finds the word by searching', async () => {
    await type(page, 'word-search', 'owl');
    await waitUntil(page, rows(1));
    const row = await textOf(page, '#word-list li');
    assert.match(row, /貓頭鷹 · 猫头鹰/);
    assert.match(row, /māotóuyīng/);
    assert.match(row, /new$/);
  });

  it('changes the meaning and moves the word to the front', async () => {
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await type(page, 'edit-definition', 'owl (the bird)');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.querySelector('#word-list li').textContent.includes('the bird')`);

    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await tap(page, 'study-next-button');
    await type(page, 'word-search', '');
    await waitUntil(page, `document.querySelector('#word-list li').textContent.includes('貓頭鷹')`, 'the word at the top of the list');
  });

  it('brings the word up as the next new card in Review', async () => {
    await tap(page, 'review-tab');
    // A new word starts with its meaning card, which shows the characters.
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('貓頭鷹')`, 'the card for the new word');
    assert.equal(await textOf(page, 'words-panel'), '');
  });

  it('adds a list, pasted as CSV', async () => {
    await tap(page, 'words-tab');
    await page.evaluate(`document.querySelector('.add-list').open = true`);
    await type(
      page,
      'list-text',
      '猫头鹰,貓頭鷹,mao1tou2ying1,owl\n企鹅,企鵝,qi4e2,"penguin, the bird"\n孔雀,孔雀,kong3que4,peacock\nnot a word\n',
    );
    await tap(page, 'check-list-button');
    assert.equal(await textOf(page, 'list-report'), "2 new words, 1 you already have, 1 line that can't be read.");
    assert.match(await textOf(page, 'list-problems'), /^Line 4/);
    await tap(page, 'add-list-button');
    await waitUntil(page, `document.getElementById('word-count').textContent === '${countAtStart + 3}'`);
    await type(page, 'word-search', 'penguin');
    await waitUntil(page, rows(1));
    assert.match(await textOf(page, '#word-list li'), /penguin, the bird/);
  });

  it('removes a word', async () => {
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await tap(page, 'remove-word-button');
    await waitUntil(page, rows(0));
    assert.equal(await wordCount(page), countAtStart + 2);
  });

  it('keeps it all when the app is opened again', async () => {
    await reloadApp(page);
    assert.match(await textOf(page, 'card-face'), /貓頭鷹/);
    await tap(page, 'words-tab');
    await waitUntil(page, `document.getElementById('word-count').textContent === '${countAtStart + 2}'`);
    await type(page, 'word-search', 'peacock');
    await waitUntil(page, rows(1));
  });
});
