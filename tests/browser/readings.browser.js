// Words with several readings in Review (the owner, 2026-10-24: 好 answered
// hǎo counted wrong for 好 hào): tone and pinyin cards show the meaning
// above them, and a meaning card shows the reading under the word when
// another word is written with the same characters.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, textOf, waitUntil } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

// One browser, and the steps in order.
describe('words with several readings', { concurrency: false }, () => {
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

  const WORDS = ['好|hao3', '好|hao4', '你|ni3'];
  const TYPES = ['meaning', 'pinyin', 'tone'];

  // Only this card due, and Review started again with it showing.
  async function showCard(wordId, type) {
    const cards = WORDS.flatMap((id) => TYPES.map((each) => card(id, each, id === wordId && each === type ? -DAY : 30 * DAY)));
    await inDatabase(`for (const card of ${JSON.stringify(cards)}) stores.cards.put(card);`);
    await reloadApp(page);
    await waitUntil(page, `!document.getElementById('card-face').hidden && document.getElementById('card-face').textContent.length > 0`, 'the card');
  }

  const facePinyin = `document.querySelector('#card-face .face-pinyin')?.textContent ?? null`;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    await inDatabase(`
      for (const [char, pinyin, definition] of [['好', 'hao3', 'good; well'], ['好', 'hao4', 'to be fond of (variant of 喜好[xi3 hao4])'], ['你', 'ni3', 'you']]) {
        stores.words.put({ id: char + '|' + pinyin, traditional: char, simplified: char, pinyin, definition, order: 0, addedAt: 1, learnedAt: 1 });
      }
      stores.settings.put({ key: 'enabledTypes', value: ${JSON.stringify(TYPES)} });
    `);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('shows the meaning above a tone card, without its Chinese', async () => {
    await showCard('好|hao4', 'tone');
    assert.equal(await textOf(page, 'prompt-meaning'), 'to be fond of (variant of …)');
  });

  it('shows the meaning above a pinyin card', async () => {
    await showCard('好|hao3', 'pinyin');
    assert.equal(await textOf(page, 'prompt-meaning'), 'good; well');
    // Once answered the meaning is on the card, and not above it too.
    await page.evaluate(`(() => {
      const face = document.getElementById('card-face');
      face.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true }));
      face.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true }));
    })()`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    assert.equal(await textOf(page, 'prompt-meaning'), '');
  });

  it('shows the reading on a meaning card when another word has the same characters', async () => {
    await showCard('好|hao4', 'meaning');
    assert.equal(await page.evaluate(facePinyin), 'hào');
    assert.equal(await textOf(page, 'prompt-meaning'), '');
  });

  it('leaves the reading off a meaning card for characters read one way', async () => {
    await showCard('你|ni3', 'meaning');
    assert.equal(await page.evaluate(facePinyin), null);
  });
});
