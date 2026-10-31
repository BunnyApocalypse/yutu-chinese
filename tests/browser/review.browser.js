// Grading in Review, in a real browser: the grade suggested for a written
// word (Good, Hard after a mistake or a hint, Again for a missed character),
// what is saved once a grade is chosen (how long it took too), a meaning
// card graded from its tap, the Card types setting leaving a kind of card
// out, "missed" and "right" between the characters of a word, a tone's
// verdict changed by a tap on its box, and going back to a card graded to
// change its grade.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  startApp,
  startBrowsers,
  reloadApp,
  writingArea,
  drawStroke,
  loadStrokeData,
  openSettings,
  tap,
  textOf,
  isShown,
  waitUntil,
  ANSWER_YES,
} from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

// The suggested grade's button, whose label comes first ("Good" + "3d").
const SUGGESTED = `document.querySelector('#grade-row .grade.primary')?.firstChild.textContent`;

// One browser, and the steps in order: each builds on the one before.
describe('grading in Review', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Runs JavaScript in the page with `stores`: the database's stores, by name, open for writing.
  const inDatabase = (body) =>
    page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction(['words', 'cards', 'reviews', 'settings', 'decks'], 'readwrite');
        const stores = {
          words: tx.objectStore('words'),
          cards: tx.objectStore('cards'),
          reviews: tx.objectStore('reviews'),
          settings: tx.objectStore('settings'),
          decks: tx.objectStore('decks'),
        };
        const result = {};
        ${body}
        tx.oncomplete = () => {
          opening.result.close();
          resolve(JSON.stringify(result));
        };
        tx.onerror = () => reject(tx.error);
      };
    })`).then(JSON.parse);

  // Everything in one store, as a list.
  const all = (storeName) => inDatabase(`stores.${storeName}.getAll().onsuccess = (event) => { result.all = event.target.result; };`).then((result) => result.all);

  // A card learned long ago, due in `dueIn` milliseconds (negative: overdue).
  // Reviewed long ago too, or the other cards of its word would hold it back.
  const card = (id, wordId, type, dueIn) => {
    const now = Date.now();
    return {
      id,
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

  // Makes these cards (by ID, with word ID and type) due now and the app
  // start again in Review, with the first of them showing. Every card's last
  // review is put long ago, or a card graded in the test before would hold
  // back the other cards of its word for a few minutes (SIBLING_GAP_MS in
  // src/session.js).
  async function makeDue(...cards) {
    await inDatabase(`
      stores.cards.getAll().onsuccess = (event) => {
        for (const card of event.target.result) {
          stores.cards.put({ ...card, lastReviewedAt: ${Date.now() - 10 * DAY} });
        }
        for (const card of ${JSON.stringify(cards.map(([id, wordId, type]) => card(id, wordId, type, -DAY)))}) {
          stores.cards.put(card);
        }
      };
    `);
    await reloadApp(page);
  }

  // Waits until the writing card's character can be written.
  async function waitForFirstStroke() {
    await waitUntil(
      page,
      `document.getElementById('stroke-count').textContent.startsWith('1/') && !document.getElementById('writing-area').hasAttribute('data-busy')`,
      'the character to be writable',
    );
  }

  // Writes a character's strokes, after `wrong` strokes that are not its
  // first (a line down the middle, where it begins with a line across).
  async function write(char, { wrong = 0 } = {}) {
    await waitForFirstStroke();
    const area = await writingArea(page);
    for (let count = 0; count < wrong; count++) {
      await drawStroke(page, area, [[512, 850], [512, 400], [512, -50]]);
    }
    for (const median of loadStrokeData(char).medians) {
      await drawStroke(page, area, median);
    }
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
  }

  // Holds the pen still on the writing area until the next stroke flashes
  // as a hint (src/gestures.js), as gestures.browser.js does.
  async function holdForHint() {
    await waitForFirstStroke();
    const area = await writingArea(page);
    const middle = { x: area.x + area.size / 2, y: area.y + area.size / 2 };
    const mouse = (type, point, extra) =>
      page.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', ...extra });
    await mouse('mousePressed', middle, { clickCount: 1 });
    await waitUntil(page, `document.getElementById('writing-area').hasAttribute('data-hint-shown')`, 'the hint');
    await mouse('mouseReleased', middle, { clickCount: 1 });
    await waitUntil(page, `!document.getElementById('writing-area').hasAttribute('data-busy')`, 'the quiz restarted');
  }

  // Taps the grade button with this label.
  const chooseGrade = (label) =>
    page.evaluate(`[...document.querySelectorAll('#grade-row .grade')].find((button) => button.firstChild.textContent === '${label}').click()`);

  // The review saved last.
  const lastReview = async () => (await all('reviews')).sort((a, b) => a.time - b.time).at(-1);

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // Three words learned long ago, with their meaning and writing cards,
    // none of them due yet. The stroke count is shown in Review, so that
    // each stroke changes the status line (drawStroke waits for that).
    await inDatabase(`
      for (const [char, pinyin, definition] of [['大', 'da4', 'big'], ['小', 'xiao3', 'small']]) {
        stores.words.put({ id: char + '|' + pinyin, traditional: char, simplified: char, pinyin, definition, order: 0, addedAt: 1, learnedAt: 1 });
      }
      for (const card of ${JSON.stringify([
        card('大|da4#meaning', '大|da4', 'meaning', 30 * DAY),
        card('大|da4#writing', '大|da4', 'writing', 30 * DAY),
        card('小|xiao3#meaning', '小|xiao3', 'meaning', 30 * DAY),
        card('小|xiao3#writing', '小|xiao3', 'writing', 30 * DAY),
        card('大小|da4xiao3#meaning', '大小|da4xiao3', 'meaning', 30 * DAY),
        card('大小|da4xiao3#writing', '大小|da4xiao3', 'writing', 30 * DAY),
      ])}) {
        stores.cards.put(card);
      }
      stores.words.put({ id: '大小|da4xiao3', traditional: '大小', simplified: '大小', pinyin: 'da4xiao3', definition: 'size', order: 0, addedAt: 1, learnedAt: 1 });
      stores.settings.put({ key: 'enabledTypes', value: ['meaning', 'writing'] });
      stores.settings.put({ key: 'strokeCountInReview', value: true });
    `);
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('has nothing to review while no card is due', async () => {
    assert.equal(await isShown(page, 'done-panel'), true);
    assert.equal(await isShown(page, 'study-area'), false);
  });

  it('suggests Good for a word written without mistakes, and saves the grade chosen', async () => {
    // (Before the card comes up, which counts toward how long it took.)
    const before = Date.now();
    await makeDue(['大|da4#writing', '大|da4', 'writing']);
    await write('大');
    assert.equal(await page.evaluate(SUGGESTED), 'Good');
    // Each grade says when the card would come back: Again soon, Easy last.
    const waits = await page.evaluate(`[...document.querySelectorAll('#grade-row .wait')].map((wait) => wait.textContent)`);
    assert.equal(waits.length, 4);
    assert.match(waits[0], /m$/);
    assert.match(waits[3], /d$|mo$|y$/);

    await chooseGrade('Good');
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    const review = await lastReview();
    assert.equal(review.cardId, '大|da4#writing');
    assert.equal(review.grade, 3);
    assert.equal(review.suggestedGrade, 3);
    assert.deepEqual(review.passedPerChar, [true]);
    assert.deepEqual(review.mistakesPerChar, [0]);
    // How long it took (timing.js): some time, no more than since the card came up.
    assert.ok(review.duration > 0 && review.duration <= Date.now() - before, `duration ${review.duration}`);
    // The card comes back days from now, not today.
    const saved = (await all('cards')).find((each) => each.id === '大|da4#writing');
    assert.ok(saved.lastReviewedAt >= before);
    assert.ok(saved.due > Date.now() + DAY, 'the card is due again too soon');
  });

  it('suggests Hard after a mistake, and saves a different grade if one is chosen', async () => {
    await makeDue(['大|da4#writing', '大|da4', 'writing']);
    // 大 has three strokes: one mistake is forgiven, but the word is Hard.
    await write('大', { wrong: 1 });
    assert.equal(await page.evaluate(SUGGESTED), 'Hard');
    await chooseGrade('Good');
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    const review = await lastReview();
    assert.equal(review.grade, 3);
    assert.equal(review.suggestedGrade, 2);
    assert.deepEqual(review.mistakesPerChar, [1]);
  });

  it('suggests Again for a character missed, and brings the card back soon', async () => {
    await makeDue(['大|da4#writing', '大|da4', 'writing']);
    // Two mistakes are too many for three strokes.
    await write('大', { wrong: 2 });
    assert.equal(await page.evaluate(SUGGESTED), 'Again');
    await chooseGrade('Again');
    const review = await lastReview();
    assert.equal(review.grade, 1);
    assert.equal(review.suggestedGrade, 1);
    assert.deepEqual(review.passedPerChar, [false]);
    const saved = (await all('cards')).find((each) => each.id === '大|da4#writing');
    assert.ok(saved.due < Date.now() + 60 * 60 * 1000, 'a forgotten card should come back within the hour');
    assert.equal(saved.fsrsState.lapses, 1);
  });

  it('counts a character written with a hint as missed, unless the setting says Hard', async () => {
    await makeDue(['小|xiao3#writing', '小|xiao3', 'writing']);
    await holdForHint();
    await write('小');
    assert.equal(await page.evaluate(SUGGESTED), 'Again');
    await chooseGrade('Again');
    assert.equal((await lastReview()).hintPerChar?.[0], true);

    await openSettings(page, 'settings-writing');
    await page.evaluate(`(() => {
      const list = document.getElementById('hint-select');
      list.value = 'hard';
      list.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    // The setting is saved before it takes effect; reloading reads it back.
    await waitUntil(page, `document.getElementById('hint-select').value === 'hard'`);
    await inDatabase(`stores.settings.get('hintCountsAs').onsuccess = (event) => { result.value = event.target.result?.value; };`).then(
      (result) => assert.equal(result.value, 'hard'),
    );
    await tap(page, 'settings-close');
    await makeDue(['小|xiao3#writing', '小|xiao3', 'writing']);
    await holdForHint();
    await write('小');
    assert.equal(await page.evaluate(SUGGESTED), 'Hard');
    await chooseGrade('Hard');
    const review = await lastReview();
    assert.equal(review.suggestedGrade, 2);
    assert.deepEqual(review.passedPerChar, [true]);
  });

  it('grades a meaning card once it is tapped, Good suggested', async () => {
    await makeDue(['小|xiao3#meaning', '小|xiao3', 'meaning']);
    await waitUntil(page, `!document.getElementById('card-face').hidden && document.getElementById('card-face').textContent.includes('小')`, 'the card');
    assert.equal(await isShown(page, 'grade-row'), false);
    // While a card is up, pulling down doesn't reload the page (style.css).
    assert.equal(await page.evaluate(`getComputedStyle(document.documentElement).overscrollBehaviorY`), 'contain');
    await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    assert.match(await textOf(page, 'card-face'), /small/);
    assert.equal(await page.evaluate(SUGGESTED), 'Good');
    await chooseGrade('Easy');
    const review = await lastReview();
    assert.equal(review.cardId, '小|xiao3#meaning');
    assert.equal(typeof review.duration, 'number');
    assert.equal(review.grade, 4);
    assert.equal(review.suggestedGrade, 3);
  });

  // The owner, 2026-10-24: an old character flashed up on the writing area.
  // The next word's stroke data is held back here, so the area is seen
  // while it loads: nothing of the word before may be on it.
  it('empties the writing area before the next word has loaded', async () => {
    await makeDue(['大|da4#writing', '大|da4', 'writing'], ['小|xiao3#writing', '小|xiao3', 'writing']);
    await waitForFirstStroke();
    const first = (await textOf(page, 'prompt-meaning')) === 'big' ? '大' : '小';
    await write(first);
    const drawnPaths = `document.querySelectorAll('#writing-area .drawn-strokes path').length`;
    assert.ok((await page.evaluate(drawnPaths)) > 0);
    await page.evaluate(`(() => {
      const fetchNow = window.fetch;
      window.fetch = (url, ...rest) =>
        String(url).includes('char-data')
          ? new Promise((resolve) => setTimeout(() => resolve(fetchNow(url, ...rest)), 600))
          : fetchNow(url, ...rest);
    })()`);
    const meaning = first === '大' ? 'big' : 'small';
    await chooseGrade(await page.evaluate(SUGGESTED));
    await waitUntil(page, `document.getElementById('prompt-meaning').textContent !== '${meaning}'`, 'the next card');
    assert.equal(await page.evaluate(drawnPaths), 0);
    // The other card graded too, for the tests after this one.
    await write(first === '大' ? '小' : '大');
    await chooseGrade(await page.evaluate(SUGGESTED));
  });

  // No pause after the answer is shown (the owner, 2026-10-24): a new touch
  // moves on at once, while the end of the touch that showed it does not.
  it('takes a new tap at once after the answer, but not the end of the touch before', async () => {
    await makeDue(['小|xiao3#meaning', '小|xiao3', 'meaning']);
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('小')`, 'the card');
    const face = `document.getElementById('card-face')`;
    const fire = (type) => `${face}.dispatchEvent(new PointerEvent('${type}', { bubbles: true, isPrimary: true }))`;
    // Down and up in one go: the answer shows, and a second lift without a
    // new touch is still that tap.
    await page.evaluate(`${fire('pointerdown')}; ${fire('pointerup')}; ${fire('pointerup')}`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    assert.equal(await isShown(page, 'grade-row'), true);
    const before = (await lastReview())?.id;
    // A new touch right away takes the suggestion, Good.
    await page.evaluate(`${fire('pointerdown')}; ${fire('pointerup')}`);
    await waitUntil(page, `document.getElementById('grade-row').hidden`, 'the grade taken');
    const review = await lastReview();
    assert.notEqual(review.id, before);
    assert.equal(review.cardId, '小|xiao3#meaning');
    assert.equal(review.grade, 3);
  });

  it('leaves out the kinds of card switched off in Card types', async () => {
    await makeDue(['大|da4#writing', '大|da4', 'writing'], ['小|xiao3#meaning', '小|xiao3', 'meaning']);
    const writingBox = `document.querySelector('#settings-panel [data-card-type="writing"]')`;
    const setWriting = (on) =>
      page.evaluate(`(() => {
        const box = ${writingBox};
        box.checked = ${on};
        box.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);

    await openSettings(page, 'settings-learning');
    await setWriting(false);
    await tap(page, 'settings-close');
    // Only the meaning card is left: once it is graded, Review is done.
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('小')`, 'the meaning card');
    assert.equal(await isShown(page, 'writing-row'), false);
    await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    await chooseGrade('Good');
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');

    // Switched on again, the writing card comes back.
    await openSettings(page, 'settings-learning');
    await setWriting(true);
    await tap(page, 'settings-close');
    await waitUntil(page, `document.getElementById('done-panel').hidden`, 'a card again');
    await waitForFirstStroke();
    assert.equal(await textOf(page, 'prompt-meaning'), 'big');
  });

  // The test browser hasn't promised to keep the data (no installed app), so
  // the words are at risk (wordsAtRisk in storageAdvice.js).
  it('says at the end of every Review that the words may be lost, until put away or switched off', async () => {
    const gradeMeaning = async () => {
      await makeDue(['小|xiao3#meaning', '小|xiao3', 'meaning']);
      await waitUntil(page, `document.getElementById('card-face').textContent.includes('小')`, 'the meaning card');
      await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
      await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
      await chooseGrade('Good');
      await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    };
    const messageShown = `!document.getElementById('storage-message').hidden`;
    // The test before leaves 大's writing card due: not today.
    await inDatabase(`stores.cards.get('大|da4#writing').onsuccess = (event) => {
      stores.cards.put({ ...event.target.result, due: Date.now() + 30 * ${DAY} });
    };`);

    await gradeMeaning();
    await waitUntil(page, messageShown, 'the message');
    assert.match(await textOf(page, 'storage-message'), /^Keep your words safe\. Install 玉兔中文 as an app/);
    // "Not now" puts it away until the app is opened again.
    await tap(page, 'storage-message-close');
    assert.equal(await isShown(page, 'storage-message'), false);
    await page.evaluate(`document.getElementById('learn-next-button').click()`);
    await page.evaluate(`document.getElementById('review-tab').click()`);
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'Review again');
    assert.equal(await isShown(page, 'storage-message'), false);
    // Opened again (makeDue reloads the app): it is back.
    await gradeMeaning();
    await waitUntil(page, messageShown, 'the message again');

    // Settings can switch it off, after a warning.
    await openSettings(page, 'settings-data');
    await waitUntil(page, `!document.getElementById('keep-reminder-button').hidden`, 'the switch');
    assert.equal(await textOf(page, 'keep-reminder-button'), 'Stop the reminder in Review and Learn');
    await page.evaluate(ANSWER_YES);
    await tap(page, 'keep-reminder-button');
    await waitUntil(page, `document.getElementById('keep-reminder-button').textContent === 'Show the reminder in Review and Learn again'`, 'switched off');
    await tap(page, 'settings-close');
    await gradeMeaning();
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await isShown(page, 'storage-message'), false);

    // Switched on again for the tests after this one.
    await openSettings(page, 'settings-data');
    await waitUntil(page, `document.getElementById('keep-reminder-button').textContent === 'Show the reminder in Review and Learn again'`, 'the switch');
    await tap(page, 'keep-reminder-button');
    await waitUntil(page, `document.getElementById('keep-reminder-button').textContent === 'Stop the reminder in Review and Learn'`, 'switched on');
    await tap(page, 'settings-close');
  });

  it('offers Wrong and Right with the setting Grade buttons, Right saved as Good', async () => {
    const buttonsSetting = (value) =>
      page.evaluate(`(() => {
        const list = document.getElementById('grade-buttons-select');
        list.value = '${value}';
        list.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
    await openSettings(page, 'settings-studying');
    await buttonsSetting('two');
    await waitUntil(page, `document.getElementById('grade-buttons-select').value === 'two'`);
    await inDatabase(`stores.settings.get('gradeButtons').onsuccess = (event) => { result.value = event.target.result?.value; };`).then(
      (result) => assert.equal(result.value, 'two'),
    );
    await tap(page, 'settings-close');

    // A mistake: Hard is suggested, so Right is the one highlighted.
    await makeDue(['大|da4#writing', '大|da4', 'writing']);
    await write('大', { wrong: 1 });
    const labels = await page.evaluate(`[...document.querySelectorAll('#grade-row .grade')].map((button) => button.firstChild.textContent)`);
    assert.deepEqual(labels, ['Wrong', 'Right']);
    assert.equal(await page.evaluate(SUGGESTED), 'Right');
    // The key 2 presses Right.
    await page.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }))`);
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    const review = await lastReview();
    assert.equal(review.grade, 3);
    assert.equal(review.suggestedGrade, 2);

    await openSettings(page, 'settings-studying');
    await buttonsSetting('four');
    await waitUntil(page, `document.getElementById('grade-buttons-select').value === 'four'`);
    await tap(page, 'settings-close');
  });

  it('saves How much to remember as a number, 90% unless chosen', async () => {
    const retentionSetting = (value) =>
      page.evaluate(`(() => {
        const list = document.getElementById('retention-select');
        list.value = '${value}';
        list.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
    await openSettings(page, 'settings-studying');
    const choices = await page.evaluate(`[...document.getElementById('retention-select').options].map((option) => [option.value, option.textContent])`);
    assert.deepEqual(choices, [['0.8', '80%'], ['0.85', '85%'], ['0.9', '90%'], ['0.95', '95%']]);
    assert.equal(await page.evaluate(`document.getElementById('retention-select').value`), '0.9');
    await retentionSetting('0.95');
    await waitUntil(page, `document.getElementById('retention-select').value === '0.95'`);
    // The setting is saved a moment after the change (settings.js awaits
    // the database), so the test asks again until it is there.
    const savedAs = async (expected) => {
      for (let tries = 0; tries < 50; tries++) {
        const { value } = await inDatabase(
          `stores.settings.get('targetRetention').onsuccess = (event) => { result.value = event.target.result?.value; };`,
        );
        if (value === expected) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.fail(`targetRetention never saved as ${expected}`);
    };
    await savedAs(0.95);
    await retentionSetting('0.9');
    await savedAs(0.9);
    await tap(page, 'settings-close');
  });

  it('offers missed and right between the characters of a word, the verdict changed by a tap', async () => {
    await makeDue(['大小|da4xiao3#writing', '大小|da4xiao3', 'writing']);
    await waitForFirstStroke();
    const area = await writingArea(page);
    // 大 with two mistakes: judged missed.
    for (let count = 0; count < 2; count++) {
      await drawStroke(page, area, [[512, 850], [512, 400], [512, -50]]);
    }
    for (const median of loadStrokeData('大').medians) {
      await drawStroke(page, area, median);
    }
    await waitUntil(page, `!document.getElementById('verdict-row').hidden`, 'the verdict buttons');
    const buttons = `[...document.querySelectorAll('#verdict-row .verdict')]`;
    const state = () =>
      page.evaluate(`${buttons}.map((button) => [button.textContent, button.getAttribute('aria-pressed')])`);
    assert.deepEqual(await state(), [['✕ 大 missed', 'true'], ['✓ 大 right', 'false']]);
    assert.ok(await page.evaluate(`document.querySelector('#word-row .slot').classList.contains('missed')`));

    // Right: the box turns green and the button is pressed.
    await page.evaluate(`${buttons}[1].click()`);
    assert.deepEqual(await state(), [['✕ 大 missed', 'false'], ['✓ 大 right', 'true']]);
    assert.ok(await page.evaluate(`document.querySelector('#word-row .slot').classList.contains('passed')`));

    // No Next button between characters (the owner, 2026-10-26); the ›
    // arrow says it goes on. Enter on a keyboard, as a tap on the area: on
    // to 小. The buttons go, and after it the grades take their place.
    assert.equal(await isShown(page, 'next-button'), false);
    assert.equal(await page.evaluate(`document.getElementById('skip-button').getAttribute('aria-label')`), 'Next character');
    for (const type of ['keyDown', 'keyUp']) {
      await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    }
    await waitUntil(page, `document.getElementById('verdict-row').hidden`, 'the verdict buttons to go');
    await waitForFirstStroke();
    for (const median of loadStrokeData('小').medians) {
      await drawStroke(page, area, median);
    }
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    assert.ok(await page.evaluate(`document.getElementById('verdict-row').hidden`));
    // Mistakes but nothing missed: Hard.
    assert.equal(await page.evaluate(SUGGESTED), 'Hard');
    await chooseGrade('Hard');
    const review = await lastReview();
    assert.deepEqual(review.passedPerChar, [true, true]);
    assert.deepEqual(review.suggestedPerChar, [false, true]);
  });

  it('goes back to the card graded before, with the raw input, and corrects its grade', async () => {
    await makeDue(['大|da4#writing', '大|da4', 'writing'], ['小|xiao3#writing', '小|xiao3', 'writing']);
    const reviewsBefore = (await all('reviews')).length;
    // The first card: no card before it, so ‹ is not offered.
    await waitForFirstStroke();
    assert.ok(await page.evaluate(`document.getElementById('back-button').classList.contains('unavailable')`));
    const first = await page.evaluate(`document.getElementById('prompt-meaning').textContent`);
    const char = first === 'big' ? '大' : '小';
    const other = char === '大' ? '小' : '大';
    await write(char);
    await chooseGrade('Good');

    // The next card, untouched: ‹ goes back to the one graded.
    await waitForFirstStroke();
    await waitUntil(page, `!document.getElementById('back-button').classList.contains('unavailable')`, 'the way back');
    await tap(page, 'back-button');
    await waitUntil(page, `document.getElementById('card-type').textContent === 'Writing · 1 back'`, 'the card before');
    // The raw input is there, and the grade given is pressed.
    assert.ok(await page.evaluate(`document.querySelectorAll('#card-face .past-square .drawn-strokes path').length > 0`));
    const pressed = `document.querySelector('#grade-row .grade[aria-pressed="true"]')?.firstChild.textContent`;
    assert.equal(await page.evaluate(pressed), 'Good');
    assert.ok(await page.evaluate(`document.getElementById('past-back-button').classList.contains('unavailable')`));

    // Again instead: the same review corrected, no new one, the card due soon.
    await chooseGrade('Again');
    await waitUntil(page, `document.getElementById('card-type').textContent === 'Writing'`, 'back to the card on screen');
    const reviews = await all('reviews');
    assert.equal(reviews.length, reviewsBefore + 1);
    const cardId = char === '大' ? '大|da4#writing' : '小|xiao3#writing';
    const corrected = reviews.filter((review) => review.cardId === cardId).sort((a, b) => a.time - b.time).at(-1);
    assert.equal(corrected.grade, 1);
    assert.deepEqual(corrected.passedPerChar, [false]);
    const saved = (await all('cards')).find((each) => each.id === cardId);
    assert.ok(saved.due < Date.now() + 60 * 60 * 1000, 'a forgotten card should come back within the hour');
    assert.equal(saved.fsrsState.lapses, 1);

    // The card on screen is the other word, and once a stroke is drawn ‹
    // stays on it.
    await waitForFirstStroke();
    assert.equal(await page.evaluate(`document.getElementById('prompt-meaning').textContent`), other === '大' ? 'big' : 'small');
    const area = await writingArea(page);
    await drawStroke(page, area, loadStrokeData(other).medians[0]);
    assert.ok(await page.evaluate(`document.getElementById('back-button').classList.contains('unavailable')`));
  });

  it('changes a character\'s verdict on a card looked back at from the end of Review', async () => {
    // Only 大小 due: the test before left the other word's card due.
    await inDatabase(`
      for (const card of ${JSON.stringify([card('大|da4#writing', '大|da4', 'writing', 30 * DAY), card('小|xiao3#writing', '小|xiao3', 'writing', 30 * DAY)])}) {
        stores.cards.put(card);
      }
    `);
    await makeDue(['大小|da4xiao3#writing', '大小|da4xiao3', 'writing']);
    await waitForFirstStroke();
    const area = await writingArea(page);
    // 大 with two mistakes (missed), then 小: Again.
    for (let count = 0; count < 2; count++) {
      await drawStroke(page, area, [[512, 850], [512, 400], [512, -50]]);
    }
    for (const median of loadStrokeData('大').medians) {
      await drawStroke(page, area, median);
    }
    await waitUntil(page, `!document.getElementById('verdict-row').hidden`, 'the verdict buttons');
    await tap(page, 'skip-button');
    await write('小');
    assert.equal(await page.evaluate(SUGGESTED), 'Again');
    await chooseGrade('Again');

    // The end of Review: back to the last card from there.
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    await waitUntil(page, `!document.getElementById('look-back-button').hidden`, 'the way back');
    await tap(page, 'look-back-button');
    await waitUntil(page, `document.getElementById('card-type').textContent === 'Writing · 1 back'`, 'the card before');
    const squares = `[...document.querySelectorAll('#card-face .past-square')]`;
    assert.deepEqual(await page.evaluate(`${squares}.map((square) => square.className)`), ['past-square missed', 'past-square passed']);
    // 大 right after all: Hard (it had mistakes), saved at once.
    await page.evaluate(`${squares}[0].click()`);
    await waitUntil(page, `document.querySelector('#card-face .past-square').classList.contains('passed')`, 'the verdict changed');
    const review = (await all('reviews')).filter((each) => each.cardId === '大小|da4xiao3#writing').sort((a, b) => a.time - b.time).at(-1);
    assert.deepEqual(review.passedPerChar, [true, true]);
    assert.equal(review.grade, 2);
    assert.equal(await page.evaluate(`document.querySelector('#grade-row .grade[aria-pressed="true"]')?.firstChild.textContent`), 'Hard');
    // › goes on: nothing is due, so back to the end of Review.
    await tap(page, 'past-forward-button');
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review again');
  });

  it('changes a tone\'s verdict by a tap on its box, as on a writing card, also on a card looked back at', async () => {
    // Only 大小's tone card due, with tone cards switched on for this test.
    await inDatabase(`
      for (const card of ${JSON.stringify(['大|da4', '小|xiao3', '大小|da4xiao3'].flatMap((id) => ['meaning', 'writing'].map((type) => card(id + '#' + type, id, type, 30 * DAY))))}) {
        stores.cards.put(card);
      }
      stores.settings.put({ key: 'enabledTypes', value: ['meaning', 'writing', 'tone'] });
    `);
    try {
      await answerToneCard();
    } finally {
      await inDatabase(`stores.settings.put({ key: 'enabledTypes', value: ['meaning', 'writing'] });`);
      await reloadApp(page);
    }
  });

  it('waits after a right tone for a tap, which is not a dot, or takes the next answer at once', async () => {
    await inDatabase(`
      for (const card of ${JSON.stringify(['大|da4', '小|xiao3', '大小|da4xiao3'].flatMap((id) => ['meaning', 'writing'].map((type) => card(id + '#' + type, id, type, 30 * DAY))))}) {
        stores.cards.put(card);
      }
      stores.settings.put({ key: 'enabledTypes', value: ['meaning', 'writing', 'tone'] });
    `);
    try {
      const toneButton = (tone) => page.evaluate(`document.querySelector('#tone-buttons [data-tone="${tone}"]').click()`);
      // A real tap in the middle of the card's face (a dot, were it asking).
      const tapFace = async () => {
        const middle = await page.evaluate(`(() => {
          const box = document.getElementById('card-face').getBoundingClientRect();
          return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        })()`);
        for (const type of ['mousePressed', 'mouseReleased']) {
          await page.send('Input.dispatchMouseEvent', { type, ...middle, button: 'left', clickCount: 1 });
        }
      };
      const slotClasses = () => page.evaluate(`[...document.querySelectorAll('#word-row .slot')].map((slot) => slot.classList.contains('passed') ? 'passed' : slot.classList.contains('missed') ? 'missed' : '')`);

      // Both tones at once: the second is 小's, not lost in 大's pause.
      await makeDue(['大小|da4xiao3#tone', '大小|da4xiao3', 'tone']);
      await waitUntil(page, `document.getElementById('status').textContent.includes('1 of 2')`, 'the tone of 大');
      await toneButton(4);
      await toneButton(3);
      await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
      assert.deepEqual(await slotClasses(), ['passed', 'passed']);
      await chooseGrade('Good');

      // After a right tone the card waits for a tap (tester 4, 2026-10-27:
      // it went on by itself, and the tap meant to go on became a neutral
      // tone); the tap goes on and isn't taken for the neutral tone. After
      // the last one the result comes at once.
      await makeDue(['大小|da4xiao3#tone', '大小|da4xiao3', 'tone']);
      await waitUntil(page, `document.getElementById('status').textContent.includes('1 of 2')`, 'the tone of 大');
      await toneButton(4);
      await new Promise((resolve) => setTimeout(resolve, 700));
      assert.equal(await textOf(page, 'status'), 'Right. Tap to continue.');
      await tapFace();
      assert.match(await textOf(page, 'status'), /2 of 2/);
      assert.deepEqual(await slotClasses(), ['passed', '']);
      await toneButton(3);
      await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
      assert.equal(await textOf(page, 'status'), 'All tones right');
      assert.equal(await page.evaluate(SUGGESTED), 'Good');
      await chooseGrade('Good');
    } finally {
      await inDatabase(`stores.settings.put({ key: 'enabledTypes', value: ['meaning', 'writing'] });`);
      await reloadApp(page);
    }
  });

  async function answerToneCard() {
    await makeDue(['大小|da4xiao3#tone', '大小|da4xiao3', 'tone']);
    // After a right tone the card waits for a tap, but a tone button answers
    // the next character directly (src/toneFlow.js).
    const giveTone = async (tone, which) => {
      await waitUntil(
        page,
        `document.getElementById('status').textContent.includes('${which} of 2') || (${which} > 1 && document.getElementById('status').textContent.startsWith('Right.'))`,
        `the tone of character ${which}`,
      );
      await page.evaluate(`document.querySelector('#tone-buttons [data-tone="${tone}"]').click()`);
    };
    const slots = `[...document.querySelectorAll('#word-row .slot')]`;
    const slotClasses = () => page.evaluate(`${slots}.map((slot) => [slot.tagName, slot.classList.contains('passed') ? 'passed' : slot.classList.contains('missed') ? 'missed' : ''])`);

    // 大 right (dà), 小 wrong (xiāo): Again suggested.
    await giveTone(4, 1);
    await giveTone(1, 2);
    assert.deepEqual(await slotClasses(), [['BUTTON', 'passed'], ['BUTTON', 'missed']]);
    // No Next button: › goes on, here named so (the owner, 2026-10-26).
    assert.equal(await page.evaluate(`document.getElementById('tone-next-button')`), null);
    assert.equal(await page.evaluate(`document.getElementById('tone-skip-button').getAttribute('aria-label')`), 'Go on');
    await tap(page, 'tone-skip-button');
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    assert.equal(await page.evaluate(SUGGESTED), 'Again');

    // 小's box tapped: right after all, Good suggested, what was answered still said.
    await page.evaluate(`${slots}[1].click()`);
    assert.deepEqual(await slotClasses(), [['BUTTON', 'passed'], ['BUTTON', 'passed']]);
    assert.equal(await page.evaluate(SUGGESTED), 'Good');
    assert.equal(await textOf(page, 'status'), 'All tones right');
    assert.match(await textOf(page, 'card-face'), /You answered dàxiāo\./);
    await chooseGrade('Good');
    let review = await lastReview();
    assert.equal(review.cardId, '大小|da4xiao3#tone');
    assert.deepEqual(review.passedPerChar, [true, true]);
    assert.deepEqual(review.givenTones, [4, 1]);
    assert.equal(review.grade, 3);

    // Looked back at with ‹ from the next card (a tone card new for 大 or
    // 小): a square for each character, and a tap on one changes its
    // verdict and the grade, saved at once.
    await waitUntil(page, `document.getElementById('status').textContent === 'Which tone?'`, 'the next tone card');
    await waitUntil(page, `!document.getElementById('tone-back-button').classList.contains('unavailable')`, 'the way back');
    await tap(page, 'tone-back-button');
    await waitUntil(page, `document.getElementById('card-type').textContent === 'Tone · 1 back'`, 'the card before');
    const squares = `[...document.querySelectorAll('#card-face .past-square')]`;
    assert.deepEqual(await page.evaluate(`${squares}.map((square) => square.className + ' ' + square.textContent)`), ['past-square passed 大', 'past-square passed 小']);
    assert.equal(await textOf(page, 'prompt-meaning'), 'size');
    await page.evaluate(`${squares}[1].click()`);
    await waitUntil(page, `document.querySelectorAll('#card-face .past-square')[1]?.classList.contains('missed')`, 'the verdict changed');
    review = (await all('reviews')).filter((each) => each.cardId === '大小|da4xiao3#tone').sort((a, b) => a.time - b.time).at(-1);
    assert.deepEqual(review.passedPerChar, [true, false]);
    assert.equal(review.grade, 1);
    assert.equal(await page.evaluate(`document.querySelector('#grade-row .grade[aria-pressed="true"]')?.firstChild.textContent`), 'Again');
  }

  it('goes on with a tap after practicing a character gone back to, the word unfinished', async () => {
    await makeDue(['大小|da4xiao3#writing', '大小|da4xiao3', 'writing']);
    await waitForFirstStroke();
    const area = await writingArea(page);
    for (const median of loadStrokeData('大').medians) {
      await drawStroke(page, area, median);
    }
    await tap(page, 'skip-button');
    await waitForFirstStroke();
    // Back to 大, written again as practice.
    await tap(page, 'back-button');
    await waitForFirstStroke();
    for (const median of loadStrokeData('大').medians) {
      await drawStroke(page, area, median);
    }
    await waitUntil(page, `document.getElementById('status').textContent.startsWith('Practice ·')`, 'the practice done');
    // The box of 大, on screen, is green with the blue ring of the current one.
    assert.equal(
      await page.evaluate(`getComputedStyle(document.querySelector('#word-row .slot.current.passed')).outlineStyle`),
      'solid',
    );
    // A real tap on the writing area: on to 小.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const middle = { x: area.x + area.size / 2, y: area.y + area.size / 2 };
    for (const type of ['mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', { type, x: middle.x, y: middle.y, button: 'left', clickCount: 1 });
    }
    await waitUntil(page, `document.querySelectorAll('#word-row .slot')[1].classList.contains('current')`, 'on to 小');
  });

  it('shows the outline for one character only, and leaves Chinese out of the meaning', async () => {
    // A meaning with Chinese in it, as CC-CEDICT's for 你 (tester 4).
    await inDatabase(`
      stores.words.put({ id: '大小|da4xiao3', traditional: '大小', simplified: '大小', pinyin: 'da4xiao3', definition: 'size (opposite of 尺寸)', order: 0, addedAt: 1, learnedAt: 1 });
    `);
    await makeDue(['大小|da4xiao3#writing', '大小|da4xiao3', 'writing']);
    await waitForFirstStroke();
    assert.equal(await textOf(page, 'prompt-meaning'), 'size (opposite of …)');
    // The Chinese left out is a small box, named for a screen reader.
    assert.equal(await page.evaluate(`document.querySelector('#prompt-meaning .chinese-gap')?.getAttribute('aria-label')`), 'Chinese left out');
    const area = await writingArea(page);
    await tap(page, 'outline-button');
    assert.equal(await textOf(page, 'outline-button'), 'Hide outline');
    for (const median of loadStrokeData('大').medians) {
      await drawStroke(page, area, median);
    }
    // → on a keyboard, as the › arrow.
    for (const type of ['keyDown', 'keyUp']) {
      await page.send('Input.dispatchKeyEvent', { type, key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    }
    await waitForFirstStroke();
    // 小 starts without the outline, and so isn't counted as peeked.
    assert.equal(await textOf(page, 'outline-button'), 'Show outline');
    for (const median of loadStrokeData('小').medians) {
      await drawStroke(page, area, median);
    }
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    await chooseGrade('Again');
    assert.deepEqual((await lastReview()).suggestedPerChar, [false, true]);
    await inDatabase(`
      stores.words.put({ id: '大小|da4xiao3', traditional: '大小', simplified: '大小', pinyin: 'da4xiao3', definition: 'size', order: 0, addedAt: 1, learnedAt: 1 });
    `);
  });

  it('keeps the count of mistakes out of sight with the setting off', async () => {
    await inDatabase(`stores.settings.put({ key: 'mistakeCount', value: false });`);
    await makeDue(['大|da4#writing', '大|da4', 'writing']);
    await write('大', { wrong: 1 });
    assert.doesNotMatch(await textOf(page, 'status'), /mistake/i);
    // Still graded on them: Hard.
    assert.equal(await page.evaluate(SUGGESTED), 'Hard');
    await chooseGrade('Hard');
    assert.deepEqual((await lastReview()).mistakesPerChar, [1]);
    await inDatabase(`stores.settings.put({ key: 'mistakeCount', value: true });`);
  });

  it('asks how many cards to review, and stops after the number chosen', async () => {
    // 25 words with a meaning card each, all due: more than the smallest number offered (20).
    const chars = [...'一二三四五六七八九十上下人口手日月山水火木土田目耳'];
    await inDatabase(`
      ${JSON.stringify(chars)}.forEach((char, index) => {
        stores.words.put({ id: char + '|x' + (index + 1) + '1', traditional: char, simplified: char, pinyin: 'x' + (index + 1) + '1', definition: 'number ' + index, order: 0, addedAt: 1, learnedAt: 1 });
      });
      stores.settings.put({ key: 'reviewStart', value: true });
    `);
    await makeDue(...chars.map((char, index) => [`${char}|x${index + 1}1#meaning`, `${char}|x${index + 1}1`, 'meaning']));
    await waitUntil(page, `!document.getElementById('review-start').hidden`, 'the start of Review');
    assert.equal(await textOf(page, 'review-start-count'), '50 cards to review');
    // 25 due, and the 25 new writing cards of their words. Only the numbers below 50.
    assert.deepEqual(
      await page.evaluate(`[...document.querySelectorAll('#review-limit-buttons button')].filter((button) => !button.hidden).map((button) => button.textContent)`),
      ['20', 'Other…'],
    );
    await tap(page, 'review-other-button');
    await page.evaluate(`document.getElementById('review-other-input').value = '2'`);
    await page.evaluate(`document.getElementById('review-other-form').requestSubmit()`);

    const gradeOne = async (count) => {
      await waitUntil(page, `document.getElementById('card-type').textContent === 'Meaning · ${count + 1}/2' && !document.getElementById('card-face').hidden`, `card ${count + 1}`);
      await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
      await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
      await chooseGrade('Good');
    };
    await gradeOne(0);
    await gradeOne(1);
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of the two');
    assert.match(await textOf(page, 'done-message'), /^2 cards done48 cards still to review\.$/);
    assert.equal(await textOf(page, 'review-more-button'), 'Keep going: 2 more');
    await tap(page, 'review-more-button');
    await gradeOne(0);

    // Opening Review again asks again; with the setting off it doesn't.
    await inDatabase(`stores.settings.put({ key: 'reviewStart', value: false });`);
    await reloadApp(page);
    await waitUntil(page, `!document.getElementById('card-face').hidden && document.getElementById('review-start').hidden`, 'a card at once');
    await inDatabase(`
      ${JSON.stringify(chars)}.forEach((char, index) => {
        stores.words.delete(char + '|x' + (index + 1) + '1');
        stores.cards.delete(char + '|x' + (index + 1) + '1#meaning');
      });
    `);
  });

  it('names the deck studied on the card, and changes it from there', async () => {
    // A second deck, so there is a choice; the word is not in it.
    await inDatabase(`stores.decks.put({ id: 'other', name: 'Other', parentId: null, order: 1 });`);
    await makeDue(['大|da4#writing', '大|da4', 'writing']);
    await waitForFirstStroke();
    // While a card is up, the chooser above is put away, and the card's top
    // line names the deck instead.
    const displayed = (id) => page.evaluate(`document.getElementById('${id}').offsetParent !== null`);
    assert.equal(await displayed('deck-choice-button'), false);
    assert.equal(await displayed('deck-tag'), true);
    assert.equal(await textOf(page, 'deck-tag'), 'All words');
    await tap(page, 'deck-tag');
    await waitUntil(page, `document.getElementById('deck-choice-dialog').open`, 'the deck chooser');
    // Choosing the other deck: none of its words is due.
    await page.evaluate(`[...document.querySelectorAll('#deck-choice-list input')].find((radio) => radio.value === 'other').click()`);
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'nothing due in the deck');
    assert.equal(await textOf(page, 'deck-choice-button'), 'Other');
    // Back to all words, and the deck removed again.
    await tap(page, 'deck-choice-button');
    await page.evaluate(`document.querySelector('#deck-choice-list input[value=""]').click()`);
    await waitForFirstStroke();
    await inDatabase(`stores.decks.delete('other');`);
    await reloadApp(page);
  });
});
