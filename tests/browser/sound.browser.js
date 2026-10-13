// The Listen button: a word is spoken from its recording, or from the
// recordings of its syllables, when its reading is in view.
//
// A test cannot hear. What it checks is which way the app chose to speak the
// word (noted on the button, see speakCurrent in review.js) and that the
// recordings were fetched.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, choose, waitUntil, openDeckPage, isShown } from './harness.js';

const spoken = `document.getElementById('listen-button').dataset.spoken`;
// The addresses of the recordings the page has fetched so far.
// (Each once: a word spoken twice in quick succession may be fetched twice.)
const fetched = `[...new Set(performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/audio/') && name.endsWith('.mp3')).map((name) => name.split('/audio/')[1]))].sort()`;

// One browser, and the steps in order: each builds on the one before.
describe('hearing a word', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('speaks a new word from its recording at its first look', async () => {
    await openDeckPage(page);
    // 學習 has a recording of its own; 星期 is given its Taiwan reading too.
    for (const [traditional, simplified, pinyin, meaning, taiwan] of [
      ['學習', '学习', 'xue2xi2', 'to study', ''],
      ['星期', '星期', 'xing1qi1', 'week', 'xing1qi2'],
    ]) {
      await type(page, 'add-traditional', traditional);
      await type(page, 'add-simplified', simplified);
      await type(page, 'add-pinyin', pinyin);
      await type(page, 'add-pinyin-taiwan', taiwan);
      await type(page, 'add-definition', meaning);
      await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
      await waitUntil(page, `document.getElementById('add-word-note').textContent.includes('${traditional}')`, 'the word added');
    }
    await tap(page, 'learn-tab');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('學習')`, 'the first look at the word');
    assert.equal(await isShown(page, 'listen-button'), true);
    // It is spoken by itself, as the Sound setting has it to begin with.
    await waitUntil(page, `${spoken} === '學習|xue2xi2 word'`, 'the word spoken from its recording');
    assert.equal(await page.evaluate(`document.getElementById('sound-select').value`), 'auto');
    // And again when the loudspeaker is tapped.
    await page.evaluate(`delete document.getElementById('listen-button').dataset.spoken`);
    await tap(page, 'listen-button');
    await waitUntil(page, `${spoken} === '學習|xue2xi2 word'`, 'the word spoken again');
    assert.deepEqual(await page.evaluate(fetched), ['w/5b66-4e60.mp3']);
  });

  it('speaks a Taiwan reading from the recordings of its syllables', async () => {
    await tap(page, 'settings-button');
    await choose(page, 'pronunciation-select', 'taiwan');
    await tap(page, 'settings-close');
    // Free of the first word: the next one to learn is 星期, read xīngqí.
    await tap(page, 'decks-tab');
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await page.evaluate('window.confirm = () => true');
    await tap(page, 'remove-word-button');
    await waitUntil(page, `document.querySelectorAll('#word-list li').length === 1`, 'one word left');
    await tap(page, 'learn-tab');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('xīngqí')`, 'the Taiwan reading');
    await waitUntil(page, `${spoken} === '星期|xing1qi1 syllables'`, 'the word spoken syllable by syllable');
    assert.deepEqual(await page.evaluate(fetched), ['s/qi2.mp3', 's/xing1.mp3', 'w/5b66-4e60.mp3']);

  });

  it('keeps the volume chosen with the slider', async () => {
    await tap(page, 'settings-button');
    assert.equal(await page.evaluate(`document.getElementById('volume-input').value`), '100');
    await page.evaluate(`(() => {
      const slider = document.getElementById('volume-input');
      slider.value = 40;
      slider.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    // Letting go of the slider speaks a sample: 中文, which has a recording.
    await waitUntil(page, `${fetched}.includes('w/4e2d-6587.mp3')`, 'the sample spoken');
    await tap(page, 'settings-close');
    const saved = await page.evaluate(`new Promise((resolve) => {
      const request = indexedDB.open('hanzi-trainer');
      request.onsuccess = () => {
        const get = request.result.transaction(['settings']).objectStore('settings').get('volume');
        get.onsuccess = () => { request.result.close(); resolve(get.result.value); };
      };
    })`);
    assert.equal(saved, 0.4);
  });

  it('has no Listen button with sound switched off', async () => {
    await tap(page, 'settings-button');
    await choose(page, 'sound-select', 'off');
    await tap(page, 'settings-close');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('星期')`, 'the first look again');
    assert.equal(await isShown(page, 'listen-button'), false);
  });

  it('offers the loudspeaker all through a lesson, and in Review only where it gives nothing away', async () => {
    await tap(page, 'settings-button');
    await choose(page, 'sound-select', 'tap');
    await tap(page, 'settings-close');
    await waitUntil(page, `!document.getElementById('listen-button').hidden`, 'the loudspeaker back');
    // On to the lesson's next step: it is still there.
    await tap(page, 'lesson-next-button');
    await waitUntil(page, `document.getElementById('card-type').textContent.includes('step 2')`, 'step 2');
    assert.equal(await isShown(page, 'listen-button'), true);
    // The word is known: its cards go to Review, some days ahead.
    await tap(page, 'skip-lesson-button');
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'nothing left to learn');
    assert.equal(await isShown(page, 'listen-button'), false);
  });
});
