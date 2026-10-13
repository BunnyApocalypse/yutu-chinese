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
} from './harness.js';

const statusIs = (start) => `document.getElementById('status').textContent.startsWith('${start}')`;
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
      `${statusIs('Stroke 1 of')} && !document.getElementById('writing-area').hasAttribute('data-busy')`,
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

  // Writes the word on screen from memory and takes the suggested grade.
  async function passTest(char) {
    assert.equal(await write(char), 'No mistakes');
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    await page.evaluate(`document.querySelector('#grade-row button.primary').click()`);
  }

  // Runs JavaScript in the page with `stores`: the database's stores, by name, open for writing.
  const inDatabase = (body) =>
    page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction(['words', 'cards', 'settings'], 'readwrite');
        const stores = { words: tx.objectStore('words'), cards: tx.objectStore('cards'), settings: tx.objectStore('settings') };
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
    assert.equal(await textOf(page, 'done-message'), 'Nothing to review yet. 3 words are waiting in the Learn tab.');
    await tap(page, 'learn-tab');
    await waitUntil(page, stepIs('step 1 of 5'), 'the first word');
    assert.equal(await textOf(page, 'review-counts'), 'Learned today 0 of 5 · 3 waiting');
  });

  it('starts with a look at the word, then its tones as practice', async () => {
    assert.equal(await textOf(page, 'card-face'), '大dàbig');
    await tap(page, 'lesson-next-button');
    await waitUntil(page, stepIs('step 2 of 5'), 'step 2');
    assert.match(await textOf(page, 'lesson-note'), /tones/);
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

  it('then the outline alone, then from memory, which is graded', { timeout: 60000 }, async () => {
    await waitUntil(page, stepIs('step 4 of 5'), 'step 4');
    await waitForFirstStroke();
    assert.equal(await outlineButton(), 'Hide outline');
    assert.equal(await page.evaluate(DEMO), null);
    assert.equal(await write('大'), 'No mistakes');
    await tap(page, 'next-button');

    await waitUntil(page, stepIs('step 5 of 5'), 'step 5');
    await waitForFirstStroke();
    assert.match(await textOf(page, 'lesson-note'), /from memory/);
    assert.equal(await outlineButton(), 'Show outline');
    // The reading is hidden again, and there is nothing left to skip.
    assert.equal(await isShown(page, 'prompt-pinyin'), false);
    assert.equal(await isShown(page, 'skip-lesson-button'), false);
    await passTest('大');
  });

  it('counts the word as learned and hands it to Review', async () => {
    await waitUntil(page, `!document.getElementById('learn-next-button').hidden`, 'the screen between two words');
    assert.equal(
      await textOf(page, 'done-message'),
      '大 is learned: its cards will come up in Review. 1 of 5 today.',
    );
    assert.equal(await textOf(page, 'review-counts'), 'Learned today 1 of 5 · 2 waiting');
    const stored = await inDatabase(`
      stores.words.get('大|da4').onsuccess = (event) => { result.learned = typeof event.target.result.learnedAt; };
      stores.cards.getAllKeys().onsuccess = (event) => { result.cards = event.target.result; };
    `);
    assert.deepEqual(stored, { learned: 'number', cards: ['大|da4#writing'] });
    // Review has its tone card to come (held back for a few minutes after the
    // writing) and still leaves the other words alone.
    await tap(page, 'review-tab');
    await waitUntil(page, `document.getElementById('review-counts').textContent === 'Due 0 · New cards 1'`, 'Review');
    assert.match(await textOf(page, 'done-message'), /2 words are waiting in the Learn tab\.$/);
  });

  it('lets a known word skip to the end of its lesson', { timeout: 60000 }, async () => {
    await tap(page, 'learn-tab');
    await waitUntil(page, `${stepIs('step 1 of 5')} && document.getElementById('card-face').textContent.startsWith('小')`, 'the next word');
    assert.equal(await isShown(page, 'skip-lesson-button'), true);
    await tap(page, 'skip-lesson-button');
    await waitUntil(page, stepIs('step 5 of 5'), 'the last step');
    await waitForFirstStroke();
    assert.equal(await outlineButton(), 'Show outline');
    await passTest('小');
    await waitUntil(page, `document.getElementById('done-message').textContent.startsWith('小 is learned')`, 'the word learned');
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
  });
});
