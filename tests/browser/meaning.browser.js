// The meaning above a writing card, fitted into its room (src/meaningFit.js;
// the owner, 2026-10-25: too many meanings were cut off): on a phone with
// height to spare a long meaning takes more than one line, the writing area
// stays in the same place whatever the meaning, a meaning still too long
// loses whole meanings from its end, and a tap shows it all.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, waitUntil } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

const SHORT = ['大', 'da4', 'big'];
const LONG = ['没关系', 'mei2guan1xi5', "it doesn't matter; it's nothing; never mind; think nothing of it; it's my pleasure; you're welcome"];
const LONGEST = [
  '好',
  'hao3',
  'good; appropriate; proper; all right!; (before a verb) easy to; (before a verb) good to; (before an adjective for exclamatory effect) so; (verb complement indicating completion); (of two people) close; on intimate terms; (after a form of address) hello',
];
const WORDS = [SHORT, LONG, LONGEST];

// One browser, and the steps in order.
describe('the meaning above a writing card', { concurrency: false }, () => {
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

  // A writing card learned long ago, due in `dueIn` milliseconds.
  const card = (wordId, dueIn) => {
    const now = Date.now();
    return {
      id: `${wordId}#writing`,
      wordId,
      type: 'writing',
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

  // Only this word's writing card due, and Review started again with it
  // showing. Returns where the writing area's top is and how many lines the
  // meaning takes.
  async function showCard([char, pinyin]) {
    const id = `${char}|${pinyin}`;
    const cards = WORDS.map(([c, p]) => card(`${c}|${p}`, `${c}|${p}` === id ? -DAY : 30 * DAY));
    await inDatabase(`for (const card of ${JSON.stringify(cards)}) stores.cards.put(card);`);
    await reloadApp(page);
    await waitUntil(
      page,
      `document.getElementById('prompt-meaning').textContent.length > 0 && !document.getElementById('writing-area').hasAttribute('data-busy')`,
      'the card',
    );
    return page.evaluate(`(() => {
      const meaning = document.getElementById('prompt-meaning');
      return {
        top: Math.round(document.getElementById('writing-area').getBoundingClientRect().top),
        lines: Math.round(meaning.clientHeight / parseFloat(getComputedStyle(meaning).lineHeight)),
        shown: [...meaning.querySelectorAll('.sense')].filter((sense) => !sense.hidden).map((sense) => sense.textContent).join(''),
        cut: meaning.querySelector('.cut-after') !== null,
        hasMore: meaning.classList.contains('has-more'),
      };
    })()`);
  }

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // A phone with height to spare (390 by 844).
    await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await inDatabase(`
      for (const [char, pinyin, definition] of ${JSON.stringify(WORDS)}) {
        stores.words.put({ id: char + '|' + pinyin, traditional: char, simplified: char, pinyin, definition, order: 0, addedAt: 1, learnedAt: 1 });
      }
      stores.settings.put({ key: 'enabledTypes', value: ['writing'] });
    `);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('gives a long meaning more lines, the writing area staying in place', async () => {
    const short = await showCard(SHORT);
    const long = await showCard(LONG);
    assert.equal(short.lines, 1);
    assert.ok(long.lines > 1, `the long meaning should take more than one line, took ${long.lines}`);
    assert.equal(long.cut, false);
    assert.equal(long.hasMore, false);
    assert.equal(long.top, short.top);
  });

  it('leaves whole meanings out of one still too long, and shows it all on a tap', async () => {
    const short = await showCard(SHORT);
    const longest = await showCard(LONGEST);
    assert.equal(longest.top, short.top);
    assert.ok(longest.cut);
    assert.ok(longest.hasMore);
    // Cut after a whole meaning: what is shown is the start of the meaning, up to a "; ".
    assert.ok(LONGEST[2].startsWith(longest.shown));
    assert.ok(longest.shown.endsWith('; '));
    await page.evaluate(`document.getElementById('prompt-meaning').click()`);
    await waitUntil(page, `document.getElementById('confirm-dialog').open`, 'the whole meaning');
    assert.equal(await page.evaluate(`document.getElementById('confirm-detail').textContent`), LONGEST[2]);
  });
});
