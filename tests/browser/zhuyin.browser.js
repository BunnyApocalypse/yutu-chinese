// Readings in zhuyin (the owner, 2026-10-26; docs/words.md, "Zhuyin"): the
// setting "Readings in" shows them in pinyin, zhuyin, or both either way
// round, on cards, on the writing card's reading line and in the Words tab,
// the zhuyin marked as Chinese.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, tap, textOf, waitUntil, openSettings } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

// One browser, and the steps in order.
describe('readings in zhuyin', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Runs JavaScript in the page with `stores`: the database's stores, by name, open for writing.
  const inDatabase = (body) =>
    page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction(['words', 'cards', 'settings'], 'readwrite');
        const stores = { words: tx.objectStore('words'), cards: tx.objectStore('cards'), settings: tx.objectStore('settings') };
        ${body}
        tx.oncomplete = () => {
          opening.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    })`);

  // A card learned long ago, due in `dueIn` milliseconds.
  const card = (wordId, type, dueIn) => {
    const now = Date.now();
    return {
      id: `${wordId}#${type}`,
      wordId,
      type,
      due: now + dueIn,
      firstReviewedAt: now - 100 * DAY,
      lastReviewedAt: now - 10 * DAY,
      fsrsState: {
        due: new Date(now + dueIn).toISOString(),
        stability: 10,
        difficulty: 5,
        elapsed_days: 10,
        scheduled_days: 10,
        learning_steps: 0,
        reps: 5,
        lapses: 0,
        state: 2,
        last_review: new Date(now - 10 * DAY).toISOString(),
      },
    };
  };

  const WORD = '學校|xue2xiao4';
  const TYPES = ['pinyin', 'writing'];

  // Only this card due, readings shown in `style`, and Review started again
  // with the card showing.
  async function showCard(type, style) {
    const cards = TYPES.map((each) => card(WORD, each, each === type ? -DAY : 30 * DAY));
    await inDatabase(`
      for (const card of ${JSON.stringify(cards)}) stores.cards.put(card);
      stores.settings.put({ key: 'readingStyle', value: '${style}' });
    `);
    await reloadApp(page);
    await waitUntil(page, `!document.getElementById('study-area').hidden && document.getElementById('card-type').textContent !== ''`, 'the card');
  }

  // The answer of a pinyin card, tapped for.
  async function answer() {
    await page.evaluate(`(() => {
      const face = document.getElementById('card-face');
      face.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true }));
      face.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true }));
    })()`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
  }

  // The text of an element, and the lang of the part of it in zhuyin.
  const reading = (selector) =>
    page.evaluate(`(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      const marked = [...element.querySelectorAll('[lang]')].find((part) => /[\\u3105-\\u312f]/u.test(part.textContent));
      return { text: element.textContent, lang: marked?.lang ?? null };
    })()`);

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    await inDatabase(`
      stores.words.put({ id: '${WORD}', traditional: '學校', simplified: '学校', pinyin: 'xue2xiao4', definition: 'school', order: 0, addedAt: 1, learnedAt: 1 });
      stores.settings.put({ key: 'enabledTypes', value: ${JSON.stringify(TYPES)} });
    `);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it("shows a pinyin card's answer in zhuyin, marked as Chinese", async () => {
    await showCard('pinyin', 'zhuyin');
    await answer();
    assert.deepEqual(await reading('#card-face .face-pinyin'), { text: 'ㄒㄩㄝˊ ㄒㄧㄠˋ', lang: 'zh-Hant-TW' });
  });

  it('shows both, either first', async () => {
    await showCard('pinyin', 'zhuyinPinyin');
    await answer();
    assert.equal((await reading('#card-face .face-pinyin')).text, 'ㄒㄩㄝˊ ㄒㄧㄠˋ xuéxiào');
    await showCard('pinyin', 'pinyinZhuyin');
    await answer();
    assert.equal((await reading('#card-face .face-pinyin')).text, 'xuéxiào ㄒㄩㄝˊ ㄒㄧㄠˋ');
  });

  it("names the writing card's button by the setting, and shows the reading so", async () => {
    await showCard('writing', 'zhuyin');
    assert.equal(await textOf(page, 'pinyin-button'), 'Show zhuyin');
    await tap(page, 'pinyin-button');
    assert.deepEqual(await reading('#prompt-pinyin'), { text: 'ㄒㄩㄝˊ ㄒㄧㄠˋ', lang: 'zh-Hant-TW' });
    await showCard('writing', 'pinyinZhuyin');
    assert.equal(await textOf(page, 'pinyin-button'), 'Show reading');
    await showCard('writing', 'pinyin');
    assert.equal(await textOf(page, 'pinyin-button'), 'Show pinyin');
    await tap(page, 'pinyin-button');
    assert.deepEqual(await reading('#prompt-pinyin'), { text: 'xuéxiào', lang: null });
  });

  it('changes the Words tab when chosen in Settings', async () => {
    await openSettings(page, 'settings-learning');
    await page.evaluate(`(() => {
      const select = document.getElementById('reading-style-select');
      select.value = 'zhuyin';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await tap(page, 'settings-close');
    await tap(page, 'words-tab');
    await waitUntil(page, `document.querySelector('#word-list .entry-pinyin')?.textContent === 'ㄒㄩㄝˊ ㄒㄧㄠˋ'`, 'the word in zhuyin');
    assert.equal((await reading('#word-list .entry-pinyin')).lang, 'zh-Hant-TW');
  });
});
