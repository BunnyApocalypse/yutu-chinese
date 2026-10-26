// Streaks in a real browser: the streak screen at once the first time ever;
// after that the pill while studying, and the screen at a pause (the end of
// Review, opening the menu, coming back to Review, a tap on the pill); only
// once a day; the line at the end of Review; and the setting that switches
// them off. The counting itself is tested in tests/streak.test.js.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, openSettings, tap, textOf, isShown, waitUntil } from './harness.js';

const DAY = 24 * 60 * 60 * 1000;

// One browser, and the steps in order: each builds on the one before.
describe('streaks', { concurrency: false }, () => {
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
        ${body}
        tx.oncomplete = () => {
          opening.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    })`);

  // A meaning card learned long ago and due now.
  const dueCard = (wordId) => {
    const now = Date.now();
    return {
      id: `${wordId}#meaning`,
      wordId,
      type: 'meaning',
      due: now - DAY,
      firstReviewedAt: now - 100 * DAY,
      lastReviewedAt: now - 10 * DAY,
      fsrsState: {
        due: new Date(now - DAY).toISOString(),
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

  // Taps the meaning card on screen and grades it Good.
  async function gradeMeaningCard() {
    // A card asking (its hint, "Tap to see…", is only there then), not the
    // answer of the card graded before, which stays up until the next comes:
    // a tap on that did nothing, and the grades never came (the failure now
    // and then in a full run, 2026-10-20 to 2026-10-26).
    await waitUntil(page, `!document.getElementById('card-face').hidden && document.querySelector('#card-face .face-hint') !== null && document.getElementById('grade-row').hidden`, 'a card');
    await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    await page.evaluate(`[...document.querySelectorAll('#grade-row .grade')].find((button) => button.firstChild.textContent === 'Good').click()`);
  }

  const streakOpen = () => page.evaluate(`document.getElementById('streak-dialog').open`);

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // Four words with a meaning card due each, and one card reviewed on each
    // of the two days before. A day counts here after one card, so grading
    // one today makes three days in a row.
    await inDatabase(`
      for (const [char, pinyin, definition] of [['大', 'da4', 'big'], ['小', 'xiao3', 'small'], ['中', 'zhong1', 'middle'], ['人', 'ren2', 'person']]) {
        stores.words.put({ id: char + '|' + pinyin, traditional: char, simplified: char, pinyin, definition, order: 0, addedAt: 1, learnedAt: 1 });
      }
      for (const card of ${JSON.stringify([dueCard('大|da4'), dueCard('小|xiao3'), dueCard('中|zhong1'), dueCard('人|ren2')])}) {
        stores.cards.put(card);
      }
      for (const [index, ago] of [${DAY}, ${2 * DAY}].entries()) {
        stores.reviews.put({ id: 'old' + index, cardId: '大|da4#meaning', wordId: '大|da4', type: 'meaning', time: Date.now() - ago, grade: 3 });
      }
      stores.settings.put({ key: 'enabledTypes', value: ['meaning'] });
      stores.settings.put({ key: 'streaks', value: true });
      stores.settings.put({ key: 'streakCards', value: 1 });
    `);
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  // As if the streak screen was last shown on another day, or never.
  const setShown = (day) =>
    page.evaluate(day === null ? `localStorage.removeItem('streak-shown')` : `localStorage.setItem('streak-shown', '${day}')`);

  it('explains streaks the first time the day counts', async () => {
    await page.evaluate(`document.getElementById('review-tab').click()`);
    await gradeMeaningCard();
    await waitUntil(page, `document.getElementById('streak-dialog').open`, 'the streak screen');
    assert.equal(await textOf(page, 'streak-kicker'), 'New: streaks');
    assert.equal(await textOf(page, 'streak-number'), '3');
    assert.equal(await textOf(page, 'streak-label'), 'days in a row!');
    assert.match(await textOf(page, 'streak-detail'), /Each day you review 1 card or learn 2 words, your streak grows by one\./);
    assert.equal(await textOf(page, 'streak-continue'), 'Got it');
    assert.equal(await isShown(page, 'streak-off'), true);
    await tap(page, 'streak-continue');
    assert.equal(await streakOpen(), false);
  });

  const pillShown = () => page.evaluate(`!document.getElementById('streak-pill').hidden`);

  it('after that, says it with the pill while studying, which opens the screen', async () => {
    await setShown('2000-01-01');
    await gradeMeaningCard();
    await waitUntil(page, `!document.getElementById('streak-pill').hidden`, 'the pill');
    assert.equal(await streakOpen(), false);
    assert.equal(await textOf(page, 'streak-pill'), '🌕🐇 3 days in a row ✨');
    await tap(page, 'streak-pill');
    await waitUntil(page, `document.getElementById('streak-dialog').open`, 'the streak screen');
    assert.equal(await pillShown(), false);
    assert.equal(await textOf(page, 'streak-kicker'), 'Study streak');
    assert.match(await textOf(page, 'streak-detail'), /Your streak is safe for today\. Keep going!.*Your best yet!/s);
    assert.equal(await textOf(page, 'streak-continue'), 'Continue');
    assert.equal(await isShown(page, 'streak-off'), false);
    await tap(page, 'streak-continue');
    // The pill's day is kept on the device, so a reload doesn't bring it
    // back the same day (the owner saw it twice, 2026-10-24).
    const [pillDay, screenDay] = await page.evaluate(`[localStorage.getItem('streak-pill-shown'), localStorage.getItem('streak-shown')]`);
    assert.equal(pillDay, screenDay);
  });

  it('does not show either again the same day, and says the streak at the end of Review', async () => {
    await gradeMeaningCard();
    await gradeMeaningCard();
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    assert.equal(await streakOpen(), false);
    assert.equal(await pillShown(), false);
    assert.match(await textOf(page, 'done-message'), /Streak: 3 days in a row\./);
  });

  it('shows the screen at once when the day counts at the end of Review', async () => {
    // Four cards were reviewed today: with five to count, the day doesn't yet.
    await setShown('2000-01-01');
    await inDatabase(`
      stores.words.put({ id: '天|tian1', traditional: '天', simplified: '天', pinyin: 'tian1', definition: 'sky', order: 0, addedAt: 1, learnedAt: 1 });
      stores.cards.put(${JSON.stringify(dueCard('天|tian1'))});
      stores.settings.put({ key: 'streakCards', value: 5 });
    `);
    await reloadApp(page);
    await page.evaluate(`document.getElementById('review-tab').click()`);
    await gradeMeaningCard();
    await waitUntil(page, `document.getElementById('streak-dialog').open`, 'the streak screen');
    assert.equal(await pillShown(), false);
    await tap(page, 'streak-continue');
  });

  it('shows a waiting screen when the menu is opened, then the menu', async () => {
    await setShown('2000-01-01');
    await tap(page, 'menu-button');
    await waitUntil(page, `document.getElementById('streak-dialog').open`, 'the streak screen');
    assert.equal(await page.evaluate(`document.getElementById('side-menu').open`), false);
    await tap(page, 'streak-continue');
    await waitUntil(page, `document.getElementById('side-menu').open`, 'the menu');
    await page.evaluate(`document.getElementById('side-menu').close()`);
  });

  it('shows a waiting screen on coming back to Review the same day', async () => {
    await setShown('2000-01-01');
    await reloadApp(page);
    await page.evaluate(`document.getElementById('review-tab').click()`);
    await waitUntil(page, `document.getElementById('streak-dialog').open`, 'the streak screen');
    assert.equal(await textOf(page, 'streak-kicker'), 'Study streak');
    await tap(page, 'streak-continue');
  });

  it('is switched off by "Don\'t count streaks"', async () => {
    await setShown(null);
    await reloadApp(page);
    await page.evaluate(`document.getElementById('review-tab').click()`);
    await waitUntil(page, `document.getElementById('streak-dialog').open`, 'the streak screen');
    assert.equal(await textOf(page, 'streak-kicker'), 'New: streaks');
    await tap(page, 'streak-off');
    assert.equal(await streakOpen(), false);
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'the end of Review');
    await waitUntil(page, `!document.getElementById('done-message').textContent.includes('Streak')`, 'the streak line to go');
    // Settings shows it off (the panel is filled in as it opens).
    await openSettings(page, 'settings-studying');
    assert.equal(await page.evaluate(`document.getElementById('streaks-checkbox').checked`), false);
    assert.equal(await isShown(page, 'streak-goal'), false);
    await tap(page, 'settings-close');
  });
});
