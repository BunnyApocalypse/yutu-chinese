// What the database keeps so that two devices' data can later be combined:
// a database from before is brought up to date, a removed word leaves a
// mark, a changed word carries the time, and a word whose ID was corrected
// remembers the old one.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, tap, type, waitUntil, openDeckPage } from './harness.js';

const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;

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

// Replaces the app's database with one as it was before 2026-10-13: version
// 1, four stores. The settings are carried over, so the introduction stays
// away. The app's own connection lets go when the database is deleted.
const putBackOldDatabase = (page, words, settings) =>
  page.evaluate(`new Promise((resolve, reject) => {
    const removal = indexedDB.deleteDatabase('hanzi-trainer');
    removal.onerror = () => reject(removal.error);
    removal.onsuccess = () => {
      const request = indexedDB.open('hanzi-trainer', 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('words', { keyPath: 'id' });
        database.createObjectStore('cards', { keyPath: 'id' });
        database.createObjectStore('reviews', { keyPath: 'id' });
        database.createObjectStore('settings', { keyPath: 'key' });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction(['words', 'settings'], 'readwrite');
        for (const word of ${JSON.stringify(words)}) {
          tx.objectStore('words').put(word);
        }
        for (const setting of ${JSON.stringify(settings)}) {
          tx.objectStore('settings').put(setting);
        }
        tx.oncomplete = () => {
          request.result.close();
          resolve(true);
        };
      };
    };
  })`);

// One browser, and the steps in order: each builds on the one before.
describe('the database', { concurrency: false }, () => {
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

  it('brings a database from before up to date, keeping what was in it', async () => {
    const oldWord = {
      id: '愛|ai4',
      traditional: '愛',
      simplified: '爱',
      pinyin: 'ai4',
      definition: 'to love',
      order: 0,
      addedAt: 1,
      lists: ['hsk-3.0/1', 'hsk-2.0/1'],
    };
    await putBackOldDatabase(page, [oldWord], await stored(page, 'settings'));
    await reloadApp(page);
    await tap(page, 'decks-tab');
    await waitUntil(page, `document.getElementById('word-count').textContent === '1'`, 'the word from before');

    // The word is in its lists' decks, and is otherwise as it was: not even
    // marked as changed.
    const { lists, ...rest } = oldWord;
    assert.deepEqual(await stored(page, 'words'), [{ ...rest, decks: lists }]);
    const decks = await stored(page, 'decks');
    assert.deepEqual(decks.map((deck) => deck.id).sort(), ['hsk-2.0', 'hsk-2.0/1', 'hsk-3.0', 'hsk-3.0/1']);
    assert.deepEqual(decks.find((deck) => deck.id === 'hsk-3.0/1').parentId, 'hsk-3.0');
    assert.deepEqual(await stored(page, 'removed'), []);
  });

  it('marks a changed word and a changed setting with the time', async () => {
    const before = Date.now();
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await type(page, 'edit-definition', 'to love; love');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.querySelector('#word-list li').textContent.includes('love; love')`);
    const [word] = await stored(page, 'words');
    assert.ok(word.changedAt >= before);
    // Its decks came through the change.
    assert.deepEqual(word.decks, ['hsk-3.0/1', 'hsk-2.0/1']);
    // The introduction's "done" was saved again when the page was reloaded.
    const settings = await stored(page, 'settings');
    assert.ok(settings.some((setting) => setting.changedAt >= before - 60000));
  });

  it('remembers the ID a word had before its pinyin was corrected', async () => {
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await type(page, 'edit-pinyin', 'ai3');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.querySelector('#word-list li').textContent.includes('ǎi')`, 'the new reading');
    let [word] = await stored(page, 'words');
    assert.equal(word.id, '愛|ai3');
    assert.deepEqual(word.formerIds, ['愛|ai4']);

    // A change that keeps the ID keeps the former ones too.
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await type(page, 'edit-definition', 'to love');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `!document.querySelector('#word-list li').textContent.includes('love; love')`);
    [word] = await stored(page, 'words');
    assert.deepEqual(word.formerIds, ['愛|ai4']);
  });

  it('leaves a mark when a word is removed, which stays when the word is added again', async () => {
    const before = Date.now();
    // The pop-up that asks before a word is removed: answer OK.
    await page.evaluate('window.confirm = () => true');
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await tap(page, 'remove-word-button');
    await waitUntil(page, rows(0));
    const removed = await stored(page, 'removed');
    assert.deepEqual(removed.map((mark) => mark.id), ['愛|ai3']);
    assert.ok(removed[0].removedAt >= before);

    // Words are added on a deck's page.
    await openDeckPage(page);
    await type(page, 'add-traditional', '愛');
    await type(page, 'add-simplified', '爱');
    await type(page, 'add-pinyin', 'ai3');
    await type(page, 'add-definition', 'to love');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, rows(1));
    // The mark stays, so that reviews from before the removal do not count
    // for the new word; the word is there because it was saved later.
    assert.deepEqual(await stored(page, 'removed'), removed);
    const [word] = await stored(page, 'words');
    assert.ok(word.changedAt >= removed[0].removedAt);
  });
});
