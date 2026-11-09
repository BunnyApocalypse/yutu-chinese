// Cards in the script the cards are not in ("Also read simplified",
// src/otherScript.js), in a real browser: a word whose forms were learned
// brings its cards there into Review, shown in that script with the note
// above, and saved under their own IDs; none with the setting off; and the
// other way round for a learner of simplified. And learning the forms in
// Learn: Review's button, the deck chooser's entry, the three steps, "I can
// read this", and what is saved.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, textOf, isShown, waitUntil } from './harness.js';

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
    // Under the answer, the forms in place of the word's note (the owner,
    // 2026-11-09): its change, and where else it is.
    await waitUntil(page, `document.querySelector('#card-face .forms-tip') !== null`, 'the forms under the answer');
    assert.match(await textOf(page, 'card-face'), /門→门Also in/);
    // Its words open their reading and meaning, as in a note, without
    // moving the card on.
    await waitUntil(page, `document.querySelector('#card-face .forms-tip .note-word') !== null`, 'tappable words');
    await page.evaluate(`document.querySelector('#card-face .forms-tip .note-word').click()`);
    await waitUntil(page, `document.getElementById('word-peek').matches(':popover-open')`, 'the popup');
    assert.equal(await page.evaluate(`document.getElementById('grade-row').hidden`), false);
    await page.evaluate(`document.getElementById('word-peek').hidePopover()`);
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

  // The owner, 2026-11-09: Review's deck chooser has "简体字 cards" first,
  // with only those cards, as Learn has the forms.
  it('reviews only the cards in simplified when chosen in the deck chooser', async () => {
    // Both words' own meaning cards due, and 我們's in simplified new.
    const due = (each) => ({ ...each, due: Date.now() - DAY, fsrsState: { ...each.fsrsState, due: new Date(Date.now() - DAY).toISOString() } });
    await inDatabase(`
      stores.reviews.clear();
      for (const each of ${JSON.stringify([due(card('我們|wo3men5#meaning', '我們|wo3men5', 'meaning')), due(card('人|ren2#meaning', '人|ren2', 'meaning'))])}) {
        stores.cards.put(each);
      }
    `);
    await setSettings({ script: 'traditional' });
    await reloadApp(page);
    await waitUntil(page, `!document.getElementById('card-face').hidden`, 'a card');
    assert.equal(await textOf(page, 'script-flag'), '');
    await page.evaluate(`document.getElementById('deck-choice-button').click()`);
    await waitUntil(page, `document.getElementById('deck-choice-dialog').open`, 'the chooser');
    assert.equal(await textOf(page, 'deck-choice-title'), 'Review what?');
    const first = await page.evaluate(`(() => {
      const row = document.querySelector('#deck-choice-list li');
      return [row.querySelector('input').value, row.querySelector('input').checked, row.textContent];
    })()`);
    assert.deepEqual(first, ['#other-cards', false, '简体字 cards1 due']);
    await page.evaluate(`document.querySelector('#deck-choice-list input[value="#other-cards"]').click()`);
    await waitUntil(page, `!document.getElementById('deck-choice-dialog').open`, 'the chooser to close');
    // Only the card in simplified, then the end, though the own cards are due.
    await cardUp('我们');
    assert.equal(await textOf(page, 'script-flag'), 'simp. 简体');
    await page.evaluate(
      `['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`,
    );
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    await page.evaluate(`document.querySelector('#grade-row .grade.primary').click()`);
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    assert.deepEqual(
      (await all('reviews')).map((review) => review.cardId),
      ['我們|wo3men5#meaning#in-simplified'],
    );
    // All words again: the own cards come back.
    await page.evaluate(`document.getElementById('deck-choice-button').click()`);
    await waitUntil(page, `document.getElementById('deck-choice-dialog').open`, 'the chooser');
    await page.evaluate(`document.querySelector('#deck-choice-list input[value=""]').click()`);
    await waitUntil(page, `!document.getElementById('card-face').hidden && document.getElementById('script-flag').textContent === ''`, 'an own card');
  });
});

describe('learning forms in the other script', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

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

  const note = () => textOf(page, 'lesson-note');
  const next = () => page.evaluate(`document.getElementById('lesson-next-button').click()`);

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // Three words learned in this order, none waiting. 我們 is the first with
    // 門 → 门, so 你們 needs nothing; 這個 teaches 言 → 文 and 個 → 个.
    await inDatabase(`
      const words = [
        ['我們', '我们', 'wo3men5', 'we; us', 1],
        ['你們', '你们', 'ni3men5', 'you (plural)', 2],
        ['這個', '这个', 'zhe4ge5', 'this one', 3],
      ];
      for (const [traditional, simplified, pinyin, definition, learnedAt] of words) {
        stores.words.put({ id: traditional + '|' + pinyin, traditional, simplified, pinyin, definition, order: learnedAt, addedAt: 1, learnedAt });
      }
      // Each with its meaning card, not due for a month: Review has nothing.
      for (const each of ${JSON.stringify(
        ['我們|wo3men5', '你們|ni3men5', '這個|zhe4ge5'].map((wordId) => ({
          id: `${wordId}#meaning`,
          wordId,
          type: 'meaning',
          due: Date.now() + 30 * DAY,
          firstReviewedAt: Date.now() - 100 * DAY,
          lastReviewedAt: Date.now() - 10 * DAY,
          fsrsState: {
            due: new Date(Date.now() + 30 * DAY).toISOString(),
            stability: 30,
            difficulty: 5,
            elapsed_days: 10,
            scheduled_days: 30,
            learning_steps: 0,
            reps: 5,
            lapses: 0,
            state: 2,
            last_review: new Date(Date.now() - 10 * DAY).toISOString(),
          },
        })),
      )}) {
        stores.cards.put(each);
      }
      for (const [key, value] of Object.entries(${JSON.stringify({
        enabledTypes: ['meaning'],
        script: 'traditional',
        bothScripts: false,
        otherScript: 'different',
        otherScriptTypes: ['meaning', 'pinyin'],
      })})) {
        stores.settings.put({ key, value });
      }
    `);
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('offers them at the end of Review, and in Learn as the first entry of the deck chooser', async () => {
    await waitUntil(page, `!document.getElementById('learn-forms-button').hidden`, 'the button for the forms');
    assert.equal(await textOf(page, 'learn-forms-button'), 'Learn 简体字 forms · 2');
    await page.evaluate(`document.getElementById('learn-forms-button').click()`);
    await waitUntil(page, `document.getElementById('lesson-note').textContent === 'See what changed.'`, 'the first step');
    // Opened from Review it shows the forms straight away, chosen in the chooser.
    await page.evaluate(`document.getElementById('deck-choice-button').click()`);
    await waitUntil(page, `document.getElementById('deck-choice-dialog').open`, 'the chooser');
    assert.equal(await textOf(page, 'deck-choice-title'), 'Learn what?');
    const first = await page.evaluate(`(() => {
      const row = document.querySelector('#deck-choice-list li');
      return [row.querySelector('input').value, row.querySelector('input').checked, row.textContent];
    })()`);
    assert.deepEqual(first, ['#forms', true, '简体字 forms2 to learn']);
    await page.evaluate(`document.getElementById('deck-choice-dialog').close()`);
  });

  it('shows what changed, where else, and the word to read, then saves the word as learned', async () => {
    assert.match(await textOf(page, 'card-face'), /^我们我們 in traditional/);
    assert.match(await textOf(page, 'card-face'), /門→门On the side of a character, 門 is written 门 in simplified\./);
    await next();
    await waitUntil(page, `document.getElementById('lesson-note').textContent === 'Where else it changes.'`, 'step 2');
    assert.match(await textOf(page, 'card-face'), /In your words你們→你们/);
    assert.match(await textOf(page, 'card-face'), /Also in/);
    await next();
    assert.equal(await note(), 'Read it in simplified.');
    assert.equal(await textOf(page, 'card-face'), '我们Can you read it? Tap to see.');
    assert.equal(await textOf(page, 'lesson-next-button'), 'Show');
    await next();
    assert.match(await textOf(page, 'card-face'), /^我们wǒmenwe; us$/);
    assert.equal(await textOf(page, 'lesson-next-button'), 'Next form');
    await next();
    await waitUntil(page, `document.querySelector('#card-face .face-word')?.textContent === '这个'`, 'the next word');
    const learned = (await all('words')).filter((word) => word.formsLearnedAt).map((word) => word.traditional);
    assert.deepEqual(learned, ['我們']);
  });

  it('takes "I can read this" as known: the cards answered Easy, the end of the sitting next', async () => {
    assert.equal(await textOf(page, 'skip-lesson-button'), 'I can read this');
    await page.evaluate(`document.getElementById('skip-lesson-button').click()`);
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of the sitting');
    assert.match(await textOf(page, 'done-message'), /^2 简体字 forms learned/);
    assert.equal(await isShown(page, 'learn-next-button'), false); // none left
    const cards = (await all('cards'))
      .map((card) => card.id)
      .filter((id) => id.includes('#in-'))
      .sort();
    assert.deepEqual(cards, ['這個|zhe4ge5#meaning#in-simplified', '這個|zhe4ge5#pinyin#in-simplified']);
    const reviews = await all('reviews');
    assert.ok(reviews.every((review) => review.markedKnown && review.grade === 4 && review.script === 'simplified'));
    // The button the steps relabeled has its own text back.
    assert.equal(await page.evaluate(`document.getElementById('skip-lesson-button').textContent`), 'I know this word');
  });

  it("brings the new word's card in simplified into Review", async () => {
    await page.evaluate(`document.getElementById('review-now-button').click()`);
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('我们')`, 'the card');
    assert.equal(await textOf(page, 'script-flag'), 'simp. 简体');
  });
});
