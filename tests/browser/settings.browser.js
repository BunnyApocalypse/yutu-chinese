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
    // The one box left is not labeled with a script.
    assert.equal(await page.evaluate(`document.getElementById('add-simplified').placeholder`), 'Word or phrase 汉字');
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
    assert.equal(await page.evaluate(`document.getElementById('add-traditional').placeholder`), 'Traditional 繁體');
    assert.match(await textOf(page, 'list-hint'), /simplified, traditional, pinyin/);
  });

  it('hides simplified when only traditional is learned', async () => {
    await choose(page, 'script-select', 'traditional');
    // A setting is saved before it takes effect, which takes a moment.
    await waitUntil(page, `document.getElementById('add-simplified').hidden`, 'the simplified box to go');
    assert.equal(await page.evaluate(`document.getElementById('add-traditional').placeholder`), 'Word or phrase 漢字');
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

  it('lets a word have a script of its own while both are learned', async () => {
    await choose(page, 'script-select', 'both-traditional');
    await type(page, 'word-search', 'building');
    await waitUntil(page, `${rows(1)} && document.querySelector('#word-list li').textContent.startsWith('圖書館 · 图书馆')`);
    assert.equal(await isShown(page, 'add-card-script-row'), true);

    // Choosing a script when adding a word leaves only that script's box.
    await type(page, 'add-traditional', '鍵盤');
    await waitUntil(page, `document.querySelector('#add-suggestions button') !== null`, 'a dictionary entry');
    await page.evaluate(`document.querySelector('#add-suggestions button').click()`);
    await choose(page, 'add-card-script', 'simplified');
    assert.equal(await isShown(page, 'add-traditional'), false);
    assert.equal(await page.evaluate(`document.getElementById('add-simplified').value`), '键盘');
    await choose(page, 'add-card-script', 'traditional');
    assert.equal(await isShown(page, 'add-simplified'), false);
    assert.equal(await page.evaluate(`document.getElementById('add-traditional').value`), '鍵盤');
    await choose(page, 'add-card-script', '');
    assert.equal(await isShown(page, 'add-simplified'), true);
    // Typed by hand in simplified: the traditional form is looked up.
    await choose(page, 'add-card-script', 'simplified');
    await type(page, 'add-simplified', '键盘');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.startsWith('Added 键盘 · 鍵盤.')`, 'the word added');
    assert.equal(await isShown(page, 'add-traditional'), true);
    assert.equal(await page.evaluate(`document.getElementById('add-card-script').value`), '');

    // This one word in simplified, in a deck that is otherwise traditional.
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await choose(page, 'edit-card-script', 'simplified');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.querySelector('#word-list li').textContent.startsWith('图书馆 · 圖書館')`, 'simplified first');
    await practice('圖書館', 'meaning');
    assert.match(await textOf(page, 'card-face'), /^图书馆/);
    // The card says it is the odd one out, on every kind of card.
    assert.equal(await textOf(page, 'script-flag'), 'simp. 简体');
    // Free practice writes what was typed, so there only the simplified form is flagged.
    await choose(page, 'practice-type', 'writing');
    await waitUntil(page, `document.getElementById('status').textContent.startsWith('Stroke 1 of')`, 'the writing card');
    assert.equal(await textOf(page, 'script-flag'), '');
    await type(page, 'word-input', '图书馆');
    await page.evaluate(`document.getElementById('word-form').requestSubmit()`);
    await waitUntil(page, `!document.getElementById('script-flag').hidden`, 'the flag');
    assert.equal(await textOf(page, 'script-flag'), 'simp. 简体');
    await practice('星期', 'meaning');
    assert.match(await textOf(page, 'card-face'), /^星期/);
    assert.equal(await textOf(page, 'script-flag'), '');

    // With one script learned there is no such choice, and the word follows the setting.
    await choose(page, 'script-select', 'traditional');
    await practice('圖書館', 'meaning');
    await waitUntil(page, `document.getElementById('card-face').textContent.startsWith('圖書館')`, 'the card in traditional');
    assert.equal(await textOf(page, 'script-flag'), '');
    await tap(page, 'words-tab');
    await waitUntil(page, `document.getElementById('add-card-script-row').hidden`, 'the choice to go');
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    assert.equal(await page.evaluate(`document.getElementById('edit-card-script').closest('label').hidden`), true);
    await tap(page, 'word-dialog-close');
  });

  it('files cards and reviews under a corrected traditional form', async () => {
    // Runs JavaScript in the page with `stores`: the database's stores, by name, open for writing.
    // Returns what `body` leaves in `result`, once the changes are saved.
    const inDatabase = (body) =>
      page.evaluate(`new Promise((resolve, reject) => {
        const opening = indexedDB.open('hanzi-trainer');
        opening.onsuccess = () => {
          const tx = opening.result.transaction(['words', 'cards', 'reviews'], 'readwrite');
          const stores = { words: tx.objectStore('words'), cards: tx.objectStore('cards'), reviews: tx.objectStore('reviews') };
          const result = {};
          ${body}
          tx.oncomplete = () => resolve(JSON.stringify(result));
          tx.onerror = () => reject(tx.error);
        };
      })`).then(JSON.parse);

    // A simplified-only learner adds a word the dictionary does not have,
    // so its traditional form is stored as the simplified one.
    await choose(page, 'script-select', 'simplified');
    await tap(page, 'words-tab');
    await waitUntil(page, `document.getElementById('add-traditional').hidden`, 'the traditional box to go');
    await type(page, 'add-simplified', '书虫们');
    await type(page, 'add-pinyin', 'shu1chong2men5');
    await type(page, 'add-definition', 'bookworms');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.startsWith('Added 书虫们.')`);
    // ... and has studied it: a writing and a meaning card, reviewed in simplified.
    await inDatabase(`
      const id = '书虫们|shu1chong2men5';
      for (const type of ['writing', 'meaning']) {
        stores.cards.put({ id: id + '#' + type, wordId: id, type, due: Date.now() + 1e9, firstReviewedAt: 1, lastReviewedAt: 1, fsrsState: {} });
        stores.reviews.put({ id: 'test-' + type, cardId: id + '#' + type, wordId: id, type, time: 1, grade: 3, script: 'simplified' });
      }
    `);

    // Switching to traditional, they correct the traditional form.
    await choose(page, 'script-select', 'both-traditional');
    await type(page, 'word-search', 'bookworms');
    await waitUntil(page, `${rows(1)} && !document.getElementById('edit-traditional').closest('label').hidden`);
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    assert.equal(await page.evaluate(`document.getElementById('edit-traditional').value`), '书虫们');
    await type(page, 'edit-traditional', '書蟲們');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.querySelector('#word-list li').textContent.startsWith('書蟲們 · 书虫们')`, 'the corrected word');
    // Still a word that has been studied, not a new one.
    assert.doesNotMatch(await textOf(page, '#word-list li'), /new$/);

    const stored = await inDatabase(`
      stores.words.getAll().onsuccess = (event) => { result.words = event.target.result.filter((word) => word.definition === 'bookworms').map((word) => word.id); };
      stores.cards.getAll().onsuccess = (event) => { result.cards = event.target.result.filter((card) => card.wordId.includes('shu1chong2men5')).map((card) => card.id).sort(); };
      stores.reviews.getAll().onsuccess = (event) => { result.reviews = event.target.result.filter((review) => review.id.startsWith('test-')).map((review) => review.wordId + ' ' + review.cardId).sort(); };
    `);
    assert.deepEqual(stored.words, ['書蟲們|shu1chong2men5']);
    // The writing card was learned in simplified, so that is where it is filed;
    // the traditional one is still to be learned.
    assert.deepEqual(stored.cards, ['書蟲們|shu1chong2men5#meaning', '書蟲們|shu1chong2men5#writing#simplified']);
    assert.deepEqual(stored.reviews, [
      '書蟲們|shu1chong2men5 書蟲們|shu1chong2men5#meaning',
      '書蟲們|shu1chong2men5 書蟲們|shu1chong2men5#writing',
    ]);
  });

  it('opens a tab that was tapped before the app had started', async () => {
    // Makes every page loaded from now on tap Free practice as soon as it has
    // been read, which is before the app has opened its database.
    // Page.enable switches on the part of the DevTools protocol the next command belongs to.
    await page.send('Page.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded', () => document.getElementById('practice-tab').click())`,
    });
    await page.evaluate('window.loadedBefore = true');
    await page.send('Page.reload');
    // The page is briefly gone while it loads, so asking it can fail; keep trying.
    let started = false;
    for (let attempt = 0; attempt < 100 && !started; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      started = await page
        .evaluate(`!window.loadedBefore &&
          document.getElementById('practice-tab').classList.contains('selected') &&
          document.getElementById('status').textContent.startsWith('Stroke 1 of')`)
        .catch(() => false);
    }
    assert.ok(started, 'Free practice did not open');
  });
});
