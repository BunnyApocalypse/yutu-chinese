// A word's example sentence added by itself when the word is learned (the
// setting addExampleSentences, off by default), and the offer to turn that
// on once some sentences have been added by hand (main.js; the owner,
// 2026-11-04).
//
// Run with: npm run test:browser -- tests/browser/exampleSentences.browser.js

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, tap, waitUntil, openLearn, openDeckPage, openSettings } from './harness.js';

// Words of HSK 3.0 level 1 with an example sentence in their notes.
const WORDS = [
  ['我們', '我们', 'wo3men5', 'we', '我們是同學。|sentence'],
  ['朋友', '朋友', 'peng2you5', 'friend', '她是我的好朋友。|sentence'],
  ['老師', '老师', 'lao3shi1', 'teacher', '老師好！|sentence'],
  ['學生', '学生', 'xue2sheng5', 'student', '我們班有二十個學生。|sentence'],
];

describe('example sentences added by themselves', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Runs JavaScript in the page with `stores`: the database's stores, by
  // name, open for writing; resolves with `result`.
  const inDatabase = (body) =>
    page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction(['words', 'settings'], 'readwrite');
        const stores = { words: tx.objectStore('words'), settings: tx.objectStore('settings') };
        const result = {};
        ${body}
        tx.oncomplete = () => {
          opening.result.close();
          resolve(result);
        };
        tx.onerror = () => reject(tx.error);
      };
      opening.onerror = () => reject(opening.error);
    })`);

  const sentenceIds = async () =>
    (
      await inDatabase(`stores.words.getAll().onsuccess = (event) => {
        result.ids = event.target.result.filter((word) => word.kind === 'sentence').map((word) => word.id);
      };`)
    ).ids.sort();

  // Learns the next word in Learn: only meaning cards are on, so its lesson
  // is a look at it, and "Next step" (or "Done") ends it.
  async function learnOne(traditional) {
    await waitUntil(page, `document.getElementById('card-face').textContent.startsWith('${traditional}')`, traditional);
    await waitUntil(page, `!document.getElementById('lesson-next-button').hidden`, 'Next step');
    await tap(page, 'lesson-next-button');
    await waitUntil(
      page,
      `!document.getElementById('card-face').textContent.startsWith('${traditional}') || !document.getElementById('done-panel')?.hidden`,
      `${traditional} learned`,
    );
  }

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    await inDatabase(`
      ${JSON.stringify(WORDS)}.forEach(([traditional, simplified, pinyin, definition], order) => {
        stores.words.put({ id: traditional + '|' + pinyin, traditional, simplified, pinyin, definition, order, addedAt: 1, decks: ['chinese'] });
      });
      stores.settings.put({ key: 'enabledTypes', value: ['meaning'] });
    `);
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('adds nothing while the setting is off (the default)', async () => {
    await openLearn(page);
    await learnOne('我們');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.deepEqual(await sentenceIds(), []);
  });

  it('adds the example sentence of a word learned, in its deck, the word as the gap', async () => {
    await openSettings(page, 'settings-studying');
    await page.evaluate(`document.getElementById('example-sentences-checkbox').click()`);
    await tap(page, 'settings-close');
    await openLearn(page);
    await learnOne('朋友');
    let ids = [];
    for (let tries = 0; tries < 50 && ids.length === 0; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      ids = await sentenceIds();
    }
    assert.deepEqual(ids, ['她是我的好朋友。|sentence']);
    const { sentence } = await inDatabase(`stores.words.get('她是我的好朋友。|sentence').onsuccess = (event) => {
      result.sentence = event.target.result;
    };`);
    assert.deepEqual(sentence.cloze, { traditional: '朋友', simplified: '朋友' });
    assert.deepEqual(sentence.decks, ['chinese']);
    assert.equal(sentence.definition, 'She is my good friend.');
  });

  it('offers the setting once, after the third sentence added by hand, while tips are on', async () => {
    await inDatabase(`
      stores.settings.put({ key: 'addExampleSentences', value: false });
      stores.settings.put({ key: 'tipsOn', value: true });
      stores.settings.put({ key: 'tipsSeen', value: ['grades', 'lesson', 'verdict', 'gestures', 'decks', 'deckRows', 'ready', 'wordPage'] });
    `);
    await reloadApp(page);
    // Adds the example sentence of the word with this ID from its page. (Its
    // row begins with the word; a sentence's row may too, but has a 。 or ！.)
    const addFromPage = async (wordId) => {
      await openDeckPage(page);
      const [traditional] = wordId.split('|');
      await page.evaluate(`[...document.querySelectorAll('#word-list li button')].find((button) => button.textContent.startsWith('${traditional}') && !/[。！]/.test(button.textContent)).click()`);
      await waitUntil(page, `document.getElementById('word-page').dataset.shown === '${wordId}'`, 'the word\'s page');
      await waitUntil(page, `document.querySelector('#word-page-body .page-add-sentence')`, 'Add sentence');
      await page.evaluate(`document.querySelector('#word-page-body .page-add-sentence button:not(.deck-choice-button)').click()`);
      await waitUntil(page, `document.querySelector('#word-page-body .page-sentence-studied')`, 'the sentence added');
    };
    const offered = `document.getElementById('confirm-dialog').open`;
    // One sentence already (added when 朋友 was learned): the second added by
    // hand asks nothing, the third brings the offer.
    await addFromPage('我們|wo3men5');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await page.evaluate(offered), false);
    await tap(page, 'word-page-close');
    await addFromPage('學生|xue2sheng5');
    await waitUntil(page, offered, 'the offer');
    assert.match(await page.evaluate(`document.getElementById('confirm-dialog').textContent`), /Add example sentences by themselves\?/);
    await tap(page, 'confirm-yes');
    await waitUntil(page, `!${offered}`, 'the offer closed');
    // Saved a moment after the answer.
    let setting = false;
    for (let tries = 0; tries < 50 && !setting; tries++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      ({ setting } = await inDatabase(`stores.settings.get('addExampleSentences').onsuccess = (event) => {
        result.setting = event.target.result?.value;
      };`));
    }
    assert.equal(setting, true);
    await tap(page, 'word-page-close');
    // Not again: switched off, a fourth added by hand asks nothing.
    await inDatabase(`stores.settings.put({ key: 'addExampleSentences', value: false });`);
    await reloadApp(page);
    await addFromPage('老師|lao3shi1');
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await page.evaluate(offered), false);
  });
});
