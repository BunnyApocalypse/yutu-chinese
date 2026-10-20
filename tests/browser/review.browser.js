// Grading in Review, in a real browser: the grade suggested for a written
// word (Good, Hard after a mistake or a hint, Again for a missed character),
// what is saved once a grade is chosen (how long it took too), a meaning
// card graded from its tap,
// and the Card types setting leaving a kind of card out.
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
    // Two words learned long ago, with their meaning and writing cards, none
    // of them due yet. The stroke count is shown in Review, so that each
    // stroke changes the status line (drawStroke waits for that).
    await inDatabase(`
      for (const [char, pinyin, definition] of [['大', 'da4', 'big'], ['小', 'xiao3', 'small']]) {
        stores.words.put({ id: char + '|' + pinyin, traditional: char, simplified: char, pinyin, definition, order: 0, addedAt: 1, learnedAt: 1 });
      }
      for (const card of ${JSON.stringify([
        card('大|da4#meaning', '大|da4', 'meaning', 30 * DAY),
        card('大|da4#writing', '大|da4', 'writing', 30 * DAY),
        card('小|xiao3#meaning', '小|xiao3', 'meaning', 30 * DAY),
        card('小|xiao3#writing', '小|xiao3', 'writing', 30 * DAY),
      ])}) {
        stores.cards.put(card);
      }
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
    await page.evaluate(`document.getElementById('card-face').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);
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
    await page.evaluate(`document.getElementById('card-face').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);
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
      await page.evaluate(`document.getElementById('card-face').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);
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
});
