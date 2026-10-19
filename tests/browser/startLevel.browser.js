// With no words at all (the introduction skipped), Review and Learn offer a
// ready-made level to start with, one tap from the first lesson (roadmap
// item 2; the owner, 2026-10-19).
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, textOf, isShown, waitUntil } from './harness.js';

describe('starting with no words', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  before(async () => {
    app = await startApp();
    // The tests skip the introduction, as someone who skips it does.
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

  it('offers the suggested level first, with adding words of ones own', async () => {
    await tap(page, 'review-tab');
    await waitUntil(page, `document.getElementById('done-message').textContent === 'You have no words yet.'`, 'the empty Review');
    // The tests' browsers learn both scripts, cards in traditional
    // (startBrowsers): Taiwan's list. (A new device, simplified, gets HSK;
    // startingLevel is tested in tests/decks.test.js.)
    assert.equal(await textOf(page, 'start-level-button'), 'Start with TOCFL Novice 1');
    assert.equal(await textOf(page, 'add-words-button'), 'Add my own words');
    assert.equal(await isShown(page, 'other-level-button'), true);
    // One main button.
    assert.equal(await page.evaluate(`[...document.querySelectorAll('#done-panel .primary')].filter((button) => button.offsetParent).length`), 1);
  });

  it('"Choose another level" opens the ready-made decks', async () => {
    await tap(page, 'other-level-button');
    await waitUntil(page, `document.getElementById('ready-decks-button').classList.contains('selected')`, 'the ready-made decks');
    await tap(page, 'review-tab');
    await waitUntil(page, `!document.getElementById('start-level-button').hidden`, 'the offer again');
  });

  it('adds the level and opens its first lesson in Learn', { timeout: 60000 }, async () => {
    await tap(page, 'start-level-button');
    await waitUntil(page, `document.getElementById('card-type').textContent.startsWith('New word · step 1')`, 'the first lesson');
    assert.equal(await page.evaluate(`document.getElementById('learn-tab').classList.contains('selected')`), true);
    const levelWords = await page.evaluate(`new Promise((resolve) => {
      indexedDB.open('hanzi-trainer').onsuccess = (event) => {
        event.target.result.transaction('words').objectStore('words').getAll().onsuccess = (got) =>
          resolve(got.target.result.filter((word) => word.decks.some((deck) => deck.startsWith('tocfl/Novice 1'))).length);
      };
    })`);
    assert.ok(levelWords > 150, `${levelWords} words of TOCFL Novice 1`);
    // With words, Review no longer offers it.
    await tap(page, 'review-tab');
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'Review');
    assert.equal(await isShown(page, 'start-level-button'), false);
  });
});
