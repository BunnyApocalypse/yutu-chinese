// Learning new words, in a real browser: a word waits in the Learn tab, is
// taught there (a look at it, its tones, each stroke shown until it is
// written, the outline, then from memory), and only then comes up in Review.
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
  tap,
  textOf,
  isShown,
  waitUntil,
  openLearn,
} from './harness.js';

const stepIs = (step) => `document.getElementById('card-type').textContent.endsWith('${step}')`;
// The outline of the stroke being shown, or null if none is.
const DEMO = `document.querySelector('#writing-area .stroke-demo clipPath path')?.getAttribute('d') ?? null`;

// One browser, and the steps in order: each builds on the one before.
describe('learning new words', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  const outlineButton = () => textOf(page, 'outline-button');

  // Waits until the character can be written.
  async function waitForFirstStroke() {
    await waitUntil(
      page,
      `document.getElementById('stroke-count').textContent.startsWith('1/') && !document.getElementById('writing-area').hasAttribute('data-busy')`,
      'the character to be writable',
    );
  }

  // Writes a character in the writing area and returns the status line at the end.
  async function write(char) {
    await waitForFirstStroke();
    const area = await writingArea(page);
    let status = '';
    for (const median of loadStrokeData(char).medians) {
      status = await drawStroke(page, area, median);
    }
    return status;
  }

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
        tx.oncomplete = () => resolve(JSON.stringify(result));
        tx.onerror = () => reject(tx.error);
      };
    })`).then(JSON.parse);

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // Three short words, waiting. Only tone and writing cards are on.
    await inDatabase(`
      [['大', 'da4', 'big'], ['小', 'xiao3', 'small'], ['上', 'shang4', 'up']].forEach(([char, pinyin, definition], order) => {
        stores.words.put({ id: char + '|' + pinyin, traditional: char, simplified: char, pinyin, definition, order, addedAt: 1 });
      });
      stores.settings.put({ key: 'enabledTypes', value: ['tone', 'writing'] });
    `);
    await reloadApp(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('keeps words out of Review until they are learned', async () => {
    assert.equal(await textOf(page, 'done-message'), 'Nothing to review yet. 3 words are waiting in Learn.');
    // Learn is not in the menu; Review offers the way there.
    assert.equal(await textOf(page, 'learn-next-button'), 'Learn new words');
    assert.equal(await isShown(page, 'learn-next-button'), true);
    await tap(page, 'learn-next-button');
    await waitUntil(page, stepIs('step 1 of 5'), 'the first word');
    assert.equal(await textOf(page, 'review-counts'), 'Learned today 0 of 5 · 3 waiting');
  });

  it('starts with a look at the word and its learning tip, then its tones as practice', async () => {
    // The word, its reading and meaning, and once the notes are there, its tip.
    await waitUntil(page, `document.querySelector('#card-face .face-tip')`, 'the tip');
    assert.match(await textOf(page, 'card-face'), /^大dàbig"Big"\./);
    // "More about this word" opens its page, and the lesson stays where it was.
    await page.evaluate(`document.querySelector('#card-face .face-tip-more').click()`);
    await waitUntil(page, `document.getElementById('word-page').dataset.shown === '大|da4'`, 'the word\'s page');
    await tap(page, 'word-page-close');
    assert.ok(await page.evaluate(stepIs('step 1 of 5')));
    // A word of the tip's note can be tapped for its reading and meaning,
    // without the tap counting as one on the card (which would move on); nor
    // does the tap that closes the popup.
    await waitUntil(page, `document.querySelector('#card-face .note-word')`, 'the note\'s words');
    // A press at `top` pixels from the top of the element, in the middle.
    const press = async (selector, top) => {
      const box = await page.evaluate(`JSON.stringify(document.querySelector('${selector}').getBoundingClientRect())`).then(JSON.parse);
      const y = box.y + (top ?? box.height / 2);
      for (const type of ['mousePressed', 'mouseReleased']) {
        await page.send('Input.dispatchMouseEvent', { type, x: box.x + box.width / 2, y, button: 'left', clickCount: 1 });
      }
    };
    const peekOpen = `document.getElementById('word-peek').matches(':popover-open')`;
    await press('#card-face .note-word');
    await waitUntil(page, peekOpen, 'the popup');
    // (Pressed at the top of the card, where the popup is not: a tap there
    // would otherwise move on.)
    await press('#card-face', 10);
    await waitUntil(page, `!${peekOpen}`, 'the popup closed');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(await page.evaluate(stepIs('step 1 of 5')));
    await tap(page, 'lesson-next-button');
    await waitUntil(page, stepIs('step 2 of 5'), 'step 2');
    assert.match(await textOf(page, 'lesson-note'), /tones/);
    // The tone card asks with the character small, over what to do, large;
    // the row above has the character too, even for a word of one.
    await waitUntil(page, `document.querySelector('#card-face .tone-char')`, 'the tone card');
    // (‹ and › are the arrows, hidden here: a word of one character.)
    assert.equal(await textOf(page, 'card-face'), '大Draw the tone mark hereor use the buttons below');
    assert.equal(await page.evaluate(`document.querySelectorAll('#card-face .face-arrow:not(.unavailable)').length`), 0);
    assert.equal(await page.evaluate(`document.querySelector('#card-face .tone-char').lang`), 'zh-Hant-TW');
    assert.equal(await textOf(page, 'status'), 'Which tone?');
    assert.equal(await page.evaluate(`document.querySelectorAll('#word-row .slot').length`), 1);
    assert.equal(await page.evaluate(`getComputedStyle(document.getElementById('word-row')).display`), 'flex');
    // The meaning and the reading stay in view while the word is being learned.
    assert.equal(await textOf(page, 'prompt-meaning'), 'big');
    assert.equal(await textOf(page, 'prompt-pinyin'), 'dà');
    assert.equal(await isShown(page, 'lesson-next-button'), false);
    await page.evaluate(`document.querySelector('#tone-buttons [data-tone="4"]').click()`);
    await waitUntil(page, `document.getElementById('status').textContent === 'All tones right'`);
    // Nothing is graded here.
    assert.equal(await isShown(page, 'grade-row'), false);
    await tap(page, 'lesson-next-button');
  });

  it('then shows each stroke until it is written', { timeout: 60000 }, async () => {
    await waitUntil(page, stepIs('step 3 of 5'), 'step 3');
    assert.match(await textOf(page, 'lesson-note'), /each stroke as it is shown/);
    await waitForFirstStroke();
    assert.equal(await outlineButton(), 'Hide outline');
    const strokes = loadStrokeData('大').medians;
    const area = await writingArea(page);
    // The first stroke is shown, and stays until it is written; then the second.
    const first = await page.evaluate(DEMO);
    assert.notEqual(first, null);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(await page.evaluate(DEMO), first);
    await drawStroke(page, area, strokes[0]);
    const second = await page.evaluate(DEMO);
    assert.notEqual(second, null);
    assert.notEqual(second, first);
    await drawStroke(page, area, strokes[1]);
    assert.equal(await drawStroke(page, area, strokes[2]), 'No mistakes');
    // Nothing is left to show.
    assert.equal(await page.evaluate(DEMO), null);
    assert.equal(await isShown(page, 'grade-row'), false);
    assert.equal(await textOf(page, 'next-button'), 'Next step');
    await tap(page, 'next-button');
  });

  it('then the outline alone, then from memory, as practice', { timeout: 60000 }, async () => {
    await waitUntil(page, stepIs('step 4 of 5'), 'step 4');
    // Which moments are announced for tips from here on (see tips.js).
    await page.evaluate(`window.announced = [];
      document.addEventListener('screen-shown', (event) => window.announced.push(event.detail))`);
    // "Hide outline" tapped while the step is still loading stays tapped
    // (it used to be undone once the stroke data had loaded).
    await tap(page, 'outline-button');
    await waitForFirstStroke();
    assert.equal(await outlineButton(), 'Show outline');
    await tap(page, 'outline-button');
    assert.equal(await outlineButton(), 'Hide outline');
    assert.equal(await page.evaluate(DEMO), null);
    assert.equal(await write('大'), 'No mistakes');
    await tap(page, 'next-button');

    await waitUntil(page, stepIs('step 5 of 5'), 'step 5');
    await waitForFirstStroke();
    assert.equal(await textOf(page, 'lesson-note'), 'Now from memory.');
    assert.equal(await outlineButton(), 'Show outline');
    // The reading is hidden again. The lesson can still be skipped.
    assert.equal(await isShown(page, 'prompt-pinyin'), false);
    assert.equal(await isShown(page, 'skip-lesson-button'), true);
    // The stroke count is shown while a word is being taught, last step included.
    assert.equal(await isShown(page, 'stroke-count'), true);
    // A wrong stroke, then starting again: in Learn the slate is wiped, so
    // a clean attempt has no mistakes (a tester, 2026-10-16).
    const area = await writingArea(page);
    const strokes = loadStrokeData('大').medians;
    assert.match(await drawStroke(page, area, strokes[2]), /1 mistake/);
    await tap(page, 'restart-button');
    assert.equal(await write('大'), 'No mistakes');
    // Nothing is graded in Learn (the owner, 2026-10-16).
    assert.equal(await isShown(page, 'grade-row'), false);
    assert.equal(await textOf(page, 'next-button'), 'Done');
    // Each step brings the tip beside "I know this word" (shown once). The
    // character was judged, but a word of one character has no row of boxes
    // to overrule it with, so no tip about verdicts.
    const announced = await page.evaluate('window.announced');
    assert.ok(announced.includes('lesson'));
    assert.ok(!announced.includes('verdict'));
    await tap(page, 'next-button');
  });

  it('counts the word as learned and hands it to Review', async () => {
    await waitUntil(page, `!document.getElementById('learn-next-button').hidden`, 'the screen between two words');
    assert.equal(
      await textOf(page, 'done-message'),
      '大 is learned: its cards will come up in Review. 1 of 5 today.',
    );
    assert.equal(await textOf(page, 'review-counts'), 'Learned today 1 of 5 · 2 waiting');
    // The first word learned brings the message about long-term storage,
    // once: the test browser has not allowed it (an app not installed).
    await waitUntil(page, `!document.getElementById('storage-message').hidden`, 'the message about storage');
    assert.match(await textOf(page, 'storage-message-advice'), /install/i);
    assert.equal(await isShown(page, 'storage-message-keep'), true);
    await tap(page, 'storage-message-close');
    assert.equal(await isShown(page, 'storage-message'), false);
    const stored = await inDatabase(`
      stores.words.get('大|da4').onsuccess = (event) => { result.learned = typeof event.target.result.learnedAt; };
      stores.cards.getAllKeys().onsuccess = (event) => { result.cards = event.target.result; };
    `);
    // Nothing was saved but the word being learned: all its cards start in
    // Review, straight away, and the other words are left alone.
    assert.deepEqual(stored, { learned: 'number', cards: [] });
    await tap(page, 'review-tab');
    await waitUntil(page, `document.getElementById('review-counts').textContent.endsWith('New cards 2')`, 'Review');
    await waitUntil(page, `document.getElementById('card-type').textContent === 'Tone'`, 'its tone card');
    // Its writing card, once the tone card has been answered a while ago,
    // comes without the lesson: the word was just taught in Learn.
    await inDatabase(`
      // (Today, or 大 would no longer count as learned today.)
      const longAgo = Date.now() - 10 * 60000;
      stores.cards.put({ id: '大|da4#tone', wordId: '大|da4', type: 'tone', due: Date.now() + 1e9, firstReviewedAt: longAgo, lastReviewedAt: longAgo, fsrsState: {} });
    `);
    await reloadApp(page);
    await waitUntil(page, `document.getElementById('card-type').textContent === 'Writing'`, 'its writing card');
    assert.equal(await isShown(page, 'lesson-note'), false);
  });

  it('lets a known word skip its lesson altogether', { timeout: 60000 }, async () => {
    await openLearn(page);
    await waitUntil(page, `${stepIs('step 1 of 5')} && document.getElementById('card-face').textContent.startsWith('小')`, 'the next word');
    assert.equal(await textOf(page, 'skip-lesson-button'), 'I know this word');
    await tap(page, 'skip-lesson-button');
    // Nothing is written: the next word comes at once.
    await waitUntil(page, `${stepIs('step 1 of 5')} && document.getElementById('card-face').textContent.startsWith('上')`, 'the word after it');
    assert.equal(await textOf(page, 'review-counts'), 'Learned today 2 of 5 · 1 waiting');
    // The word is learned, and each of its cards was answered "Easy".
    const stored = await inDatabase(`
      stores.words.get('小|xiao3').onsuccess = (event) => { result.learned = typeof event.target.result.learnedAt; };
      stores.cards.getAllKeys().onsuccess = (event) => { result.cards = event.target.result.filter((id) => id.startsWith('小')); };
      stores.reviews.getAll().onsuccess = (event) => {
        result.reviews = event.target.result.filter((review) => review.wordId === '小|xiao3').map((review) => [review.grade, review.markedKnown]);
      };
    `);
    assert.equal(stored.learned, 'number');
    // (Only tone and writing cards are switched on here.)
    assert.deepEqual(stored.cards.sort(), ['小|xiao3#tone', '小|xiao3#writing']);
    assert.deepEqual(stored.reviews, Array(2).fill([4, true]));
  });

  it('says when the goal for the day is reached, and lets one go on', async () => {
    // A goal of two words a day.
    await tap(page, 'settings-button');
    await page.evaluate(`(() => {
      const box = document.getElementById('new-words-input');
      box.value = 2;
      box.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await tap(page, 'settings-close');
    await waitUntil(page, `document.getElementById('review-counts').textContent === 'Learned today 2 of 2 · 1 waiting'`, 'the new goal');
    assert.match(await textOf(page, 'done-message'), /That is today's goal: 2 of 2\. Stop here, or go on if you like\.$/);
    // The message about long-term storage was shown once and is not again.
    assert.equal(await isShown(page, 'storage-message'), false);
    await tap(page, 'learn-next-button');
    await waitUntil(page, `${stepIs('step 1 of 5')} && document.getElementById('card-face').textContent.startsWith('上')`, 'the third word');
  });

  it('teaches a writing card that is new in Review too, unless switched off', { timeout: 60000 }, async () => {
    // A word from before: its tone card was studied long ago, writing never.
    await inDatabase(`
      const longAgo = Date.now() - 86400000;
      stores.words.put({ id: '下|xia4', traditional: '下', simplified: '下', pinyin: 'xia4', definition: 'down', order: -5, addedAt: 1 });
      stores.cards.put({ id: '下|xia4#tone', wordId: '下|xia4', type: 'tone', due: Date.now() + 1e9, firstReviewedAt: longAgo, lastReviewedAt: longAgo, fsrsState: {} });
    `);
    await reloadApp(page);
    // Its lesson has no first look: the word is not new.
    await waitUntil(page, `document.getElementById('prompt-meaning').textContent === 'down'`, 'the word in Review');
    assert.equal(await textOf(page, 'card-type'), 'New word · step 1 of 4');
    assert.match(await textOf(page, 'lesson-note'), /tones/);
    await tap(page, 'settings-button');
    await tap(page, 'lessons-checkbox');
    await tap(page, 'settings-close');
    await waitUntil(page, `document.getElementById('card-type').textContent === 'Writing'`, 'a plain writing card');
    assert.equal(await isShown(page, 'lesson-note'), false);
    assert.equal(await isShown(page, 'skip-lesson-button'), false);
    await waitForFirstStroke();
    assert.equal(await outlineButton(), 'Show outline');
    // In Review the stroke count is a hint, hidden unless the setting says otherwise.
    assert.equal(await isShown(page, 'stroke-count'), false);
    await tap(page, 'settings-button');
    await tap(page, 'stroke-count-checkbox');
    await tap(page, 'settings-close');
    await waitUntil(page, `!document.getElementById('stroke-count').hidden`, 'the stroke count');
    assert.equal(await textOf(page, 'stroke-count'), '1/3');
  });

  it('once written, shows only the grades, and practicing again changes nothing', { timeout: 60000 }, async () => {
    // The plain writing card of 下 from the test before, written cleanly.
    await write('下');
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    assert.equal(await isShown(page, 'writing-buttons'), false, 'Clear, Show outline and Animate are put away');
    assert.equal(await isShown(page, 'practice-again-button'), true);
    const suggested = `document.querySelector('#grade-row button.primary').firstChild.textContent`;
    assert.equal(await page.evaluate(suggested), 'Good');
    const reviewCount = () => inDatabase(`stores.reviews.count().onsuccess = (e) => { result.count = e.target.result; };`).then((result) => result.count);
    const reviewsBefore = await reviewCount();
    const gradesTop = `Math.round(document.getElementById('grade-row').getBoundingClientRect().top)`;
    const top = await page.evaluate(gradesTop);

    // Practice: the tools come back under the grades, which stay put.
    await tap(page, 'practice-again-button');
    await waitForFirstStroke();
    assert.equal(await isShown(page, 'writing-buttons'), true);
    assert.equal(await isShown(page, 'grade-row'), true);
    assert.equal(await isShown(page, 'practice-again-button'), false);
    assert.equal(await page.evaluate(gradesTop), top, 'the grades did not move');
    assert.ok(
      await page.evaluate(`document.getElementById('writing-buttons').getBoundingClientRect().top > document.getElementById('grade-row').getBoundingClientRect().bottom`),
      'the tools are under the grades',
    );
    // A wrong stroke, the outline, then the character: none of it counts.
    const area = await writingArea(page);
    await drawStroke(page, area, [[100, 100], [900, 800]]);
    await tap(page, 'outline-button');
    assert.match(await write('下'), /^Practice · /);
    assert.equal(await page.evaluate(suggested), 'Good');
    // A tap on the writing area does not grade while practicing.
    await page.evaluate(`document.getElementById('writing-area').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(await isShown(page, 'grade-row'), true);
    assert.equal(await reviewCount(), reviewsBefore);
    // A swipe up starts the practice again.
    await drawStroke(page, area, [[512, -50], [512, 300], [512, 800]]);
    await waitForFirstStroke();
    assert.equal(await page.evaluate(suggested), 'Good');

    // Graded: the review is the first writing's, Good with no mistakes.
    await page.evaluate(`document.querySelector('#grade-row button.primary').click()`);
    await waitUntil(page, `document.getElementById('grade-row').hidden`, 'the card graded');
    const { reviews } = await inDatabase(`stores.reviews.getAll().onsuccess = (e) => { result.reviews = e.target.result; };`);
    const last = reviews.filter((review) => review.cardId === '下|xia4#writing').sort((a, b) => a.time - b.time).pop();
    assert.equal(last.grade, 3);
    assert.equal(last.suggestedGrade, 3);
    assert.deepEqual(last.mistakesPerChar, [0]);
    assert.deepEqual(last.passedPerChar, [true]);
  });

  it('goes back to a written character as practice, which changes nothing', { timeout: 90000 }, async () => {
    // 小孩: its writing card new (lessons are off since the test above), the
    // rest out of the way.
    await inDatabase(`
      stores.cards.getAll().onsuccess = (event) => {
        for (const card of event.target.result) stores.cards.put({ ...card, due: Date.now() + 1e9 });
      };
      const longAgo = Date.now() - 86400000;
      stores.words.put({ id: '小孩|xiao3hai2', traditional: '小孩', simplified: '小孩', pinyin: 'xiao3hai2', definition: 'child', order: -6, addedAt: 1 });
      stores.cards.put({ id: '小孩|xiao3hai2#tone', wordId: '小孩|xiao3hai2', type: 'tone', due: Date.now() + 1e9, firstReviewedAt: longAgo, lastReviewedAt: longAgo, fsrsState: {} });
    `);
    await reloadApp(page);
    await tap(page, 'review-tab');
    await waitUntil(page, `document.getElementById('prompt-meaning').textContent === 'child'`, 'the word in Review');
    const arrowShown = (id) => `!document.getElementById('${id}').classList.contains('unavailable')`;
    // On the first character there is nothing before it.
    await waitForFirstStroke();
    assert.equal(await page.evaluate(arrowShown('back-button')), false);
    await write('小');
    await tap(page, 'next-button');
    // 孩, with one wrong stroke; then back to 小, which is there to go to.
    await waitForFirstStroke();
    const area = await writingArea(page);
    assert.match(await drawStroke(page, area, [[100, 100], [900, 800]]), /1 mistake/);
    assert.equal(await page.evaluate(arrowShown('back-button')), true);
    await tap(page, 'back-button');
    await waitForFirstStroke();
    assert.equal(await textOf(page, 'status'), 'Practice');
    // Practicing 小 with a mistake: nothing of it counts.
    await drawStroke(page, area, [[100, 100], [900, 800]]);
    assert.match(await write('小'), /^Practice · /);
    // Forward again: 孩 goes on, with its one mistake from before.
    await tap(page, 'skip-button');
    await waitForFirstStroke();
    assert.equal(await textOf(page, 'status'), '1 mistake');
    await write('孩');
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    const suggested = `document.querySelector('#grade-row button.primary').firstChild.textContent`;
    assert.equal(await page.evaluate(suggested), 'Hard');
    // Once the word is done, back again: practice, the grades stay.
    await tap(page, 'back-button');
    await waitForFirstStroke();
    assert.equal(await textOf(page, 'status'), 'Practice');
    assert.equal(await isShown(page, 'grade-row'), true);
    assert.equal(await page.evaluate(suggested), 'Hard');

    await page.evaluate(`document.querySelector('#grade-row button.primary').click()`);
    await waitUntil(page, `document.getElementById('grade-row').hidden`, 'the card graded');
    const { reviews } = await inDatabase(`stores.reviews.getAll().onsuccess = (e) => { result.reviews = e.target.result; };`);
    const last = reviews.filter((review) => review.cardId === '小孩|xiao3hai2#writing').sort((a, b) => a.time - b.time).pop();
    assert.equal(last.suggestedGrade, 2);
    assert.deepEqual(last.mistakesPerChar, [0, 1]);
    assert.deepEqual(last.passedPerChar, [true, true]);
  });

  it('has the arrows on a tone card too: skip counts as right, going back is practice', { timeout: 60000 }, async () => {
    // Only 小孩's tone card comes up: made new again (the one stored above
    // has no scheduling state to grade), the others not due and reviewed long
    // ago (a word's cards hold each other back for a while after one of them
    // is reviewed), and only tone cards on (cards never studied, such as
    // 大's writing card, would come up as new ones).
    const toneDue = `
      stores.settings.put({ key: 'enabledTypes', value: ['tone'] });
      stores.cards.getAll().onsuccess = (event) => {
        for (const card of event.target.result) {
          if (card.id === '小孩|xiao3hai2#tone') {
            stores.cards.delete(card.id);
          } else {
            stores.cards.put({ ...card, due: Date.now() + 1e9, lastReviewedAt: 1 });
          }
        }
      };`;
    const lastToneReview = async () => {
      const { reviews } = await inDatabase(`stores.reviews.getAll().onsuccess = (e) => { result.reviews = e.target.result; };`);
      // Review IDs are random: the newest is the one with the latest time.
      return reviews.filter((review) => review.cardId === '小孩|xiao3hai2#tone').sort((a, b) => a.time - b.time).pop();
    };
    const toneButton = (tone) => page.evaluate(`document.querySelector('#tone-buttons [data-tone="${tone}"]').click()`);
    const asked = (text) => `document.getElementById('status').textContent === ${JSON.stringify(text)}`;
    const shownArrow = (id) => `!document.getElementById('${id}').classList.contains('unavailable')`;

    await inDatabase(toneDue);
    await reloadApp(page);
    await tap(page, 'review-tab');
    await waitUntil(page, asked('Tone of 小 (1 of 2)'), 'the tone card');
    assert.equal(await page.evaluate(shownArrow('tone-back-button')), false);
    assert.equal(await page.evaluate(shownArrow('tone-skip-button')), true);
    // 小 answered wrong, then back to it: practice, answered right.
    await toneButton(1);
    await page.evaluate(`document.getElementById('tone-next-button').click()`);
    await waitUntil(page, asked('Tone of 孩 (2 of 2)'), '孩');
    await new Promise((resolve) => setTimeout(resolve, 350)); // touches are ignored at first
    await page.evaluate(`document.getElementById('tone-back-button').click()`);
    await waitUntil(page, asked('Practice · Tone of 小 (1 of 2)'), '小 again, as practice');
    await toneButton(3);
    await waitUntil(page, asked('Tone of 孩 (2 of 2)'), '孩 again');
    await toneButton(2);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    await page.evaluate(`document.querySelector('#grade-row button.primary').click()`);
    await waitUntil(page, `document.getElementById('grade-row').hidden`, 'the card graded');
    let review;
    for (let attempt = 0; attempt < 50 && !review; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      review = await lastToneReview();
    }
    assert.deepEqual(review.passedPerChar, [false, true], 'the first answer stands');

    // Again, 小 skipped: counted as right.
    await inDatabase(toneDue);
    await reloadApp(page);
    await tap(page, 'review-tab');
    await waitUntil(page, asked('Tone of 小 (1 of 2)'), 'the tone card again');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await page.evaluate(`document.getElementById('tone-skip-button').click()`);
    await waitUntil(page, asked('Tone of 孩 (2 of 2)'), '孩');
    assert.equal(await page.evaluate(`document.querySelector('#word-row .slot').classList.contains('skipped')`), true);
    await toneButton(2);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    assert.doesNotMatch(await textOf(page, 'card-face'), /undefined/);
    await page.evaluate(`document.querySelector('#grade-row button.primary').click()`);
    await waitUntil(page, `document.getElementById('grade-row').hidden`, 'the card graded');
    // The review is saved a moment after the grades go: wait for the new one.
    const firstId = review.id;
    for (let attempt = 0; attempt < 50 && review.id === firstId; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      review = await lastToneReview();
    }
    assert.deepEqual(review.passedPerChar, [true, true]);
  });
});
