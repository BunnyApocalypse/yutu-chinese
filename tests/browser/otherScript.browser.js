// Cards in the script the cards are not in ("Also read simplified",
// src/otherScript.js), in a real browser: a word whose forms were learned
// brings its cards there into Review, shown in that script with the note
// above, and saved under their own IDs; none with the setting off; and the
// other way round for a learner of simplified.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, textOf, waitUntil } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

describe('cards in the other script', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Runs JavaScript in the page with `stores`: the database's stores, by
  // name, open for writing (as in review.browser.js).
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
        tx.oncomplete = () => {
          opening.result.close();
          resolve(JSON.stringify(result));
        };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      };
    })`).then(JSON.parse);

  const all = (storeName) =>
    inDatabase(`stores.${storeName}.getAll().onsuccess = (event) => { result.all = event.target.result; };`).then(
      (result) => result.all,
    );

  // A card learned long ago, not due for a month.
  const card = (id, wordId, type) => {
    const now = Date.now();
    return {
      id,
      wordId,
      type,
      due: now + 30 * DAY,
      firstReviewedAt: now - 100 * DAY,
      lastReviewedAt: now - 10 * DAY,
      fsrsState: {
        due: new Date(now + 30 * DAY).toISOString(),
        stability: 30,
        difficulty: 5,
        elapsed_days: 10,
        scheduled_days: 30,
        learning_steps: 0,
        reps: 5,
        lapses: 0,
        state: 2,
        last_review: new Date(now - 10 * DAY).toISOString(),
      },
    };
  };

  const setSettings = (settings) =>
    inDatabase(
      Object.entries(settings)
        .map(([key, value]) => `stores.settings.put({ key: ${JSON.stringify(key)}, value: ${JSON.stringify(value)} });`)
        .join('\n'),
    );

  const cardUp = (text) =>
    waitUntil(
      page,
      `!document.getElementById('card-face').hidden && document.getElementById('card-face').textContent.includes(${JSON.stringify(text)})`,
      `the card ${text}`,
    );

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // 我們, known in traditional (its meaning card not due), its forms in
    // simplified learned; 人, the same in both scripts, learned too.
    await inDatabase(`
      stores.words.put({ id: '我們|wo3men5', traditional: '我們', simplified: '我们', pinyin: 'wo3men5', definition: 'we; us', order: 0, addedAt: 1, learnedAt: 1, formsLearnedAt: 2 });
      stores.words.put({ id: '人|ren2', traditional: '人', simplified: '人', pinyin: 'ren2', definition: 'person', order: 1, addedAt: 1, learnedAt: 1, formsLearnedAt: 2 });
      for (const each of ${JSON.stringify([card('我們|wo3men5#meaning', '我們|wo3men5', 'meaning'), card('人|ren2#meaning', '人|ren2', 'meaning')])}) {
        stores.cards.put(each);
      }
    `);
    await setSettings({ enabledTypes: ['meaning'], script: 'traditional', bothScripts: false, otherScript: 'off', otherScriptTypes: ['meaning'] });
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('brings none with the setting off', async () => {
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    assert.equal(await page.evaluate(`document.getElementById('card-face').hidden`), true);
  });

  it('asks the meaning in simplified, with the note, and saves it as a card of its own', async () => {
    await setSettings({ otherScript: 'different' });
    await reloadApp(page);
    await cardUp('我们');
    assert.equal(await textOf(page, 'card-type'), 'Meaning');
    assert.equal(await textOf(page, 'script-flag'), 'simp. 简体');
    assert.equal(await page.evaluate(`document.querySelector('#card-face .face-word').lang`), 'zh-Hans-CN');
    await page.evaluate(
      `['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`,
    );
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    assert.match(await textOf(page, 'card-face'), /we; us/);
    await page.evaluate(`document.querySelector('#grade-row .grade.primary').click()`);
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    const reviews = await all('reviews');
    assert.deepEqual(
      reviews.map((review) => [review.cardId, review.script, review.wordId]),
      [['我們|wo3men5#meaning#in-simplified', 'simplified', '我們|wo3men5']],
    );
    const cards = await all('cards');
    assert.ok(cards.some((each) => each.id === '我們|wo3men5#meaning#in-simplified'));
    // 人 is written the same in both, so it has none.
    assert.ok(!cards.some((each) => each.id.startsWith('人|ren2#meaning#in-')));
  });

  it('asks in traditional, with its note, for a learner of simplified', async () => {
    await inDatabase(`
      stores.reviews.clear();
      stores.cards.delete('我們|wo3men5#meaning#in-simplified');
    `);
    await setSettings({ script: 'simplified' });
    await reloadApp(page);
    await cardUp('我們');
    assert.equal(await textOf(page, 'script-flag'), 'trad. 繁體');
    assert.equal(await page.evaluate(`document.querySelector('#card-face .face-word').lang`), 'zh-Hant-TW');
  });
});
