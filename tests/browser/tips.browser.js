// The tips shown beside things the first time they come up (src/tips.js). The
// harness switches them off for the other tests; this one switches them on
// again from Settings.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, startWriting, tap, waitUntil } from './harness.js';

const tipOpen = `document.getElementById('tip-card').matches(':popover-open')`;
const tipSays = (text) => `${tipOpen} && document.getElementById('tip-text').textContent.startsWith(${JSON.stringify(text)})`;

// One browser, and the steps in order: each builds on the one before.
describe('tips', { concurrency: false }, () => {
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

  // JavaScript text: [the tip's side of its element, the room between them].
  const besideOf = (selector) => `(() => {
    const tip = document.getElementById('tip-card');
    const target = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    return tip.classList.contains('beside-below')
      ? ['below', Math.round(box.top - target.bottom)]
      : ['above', Math.round(target.top - box.bottom)];
  })()`;

  it('shows a tip beside its element the first time, until "Got it"', async () => {
    // Switched off by the harness; "Show all tips again" switches them back on.
    assert.equal(await page.evaluate(`document.getElementById('tips-checkbox').checked`), false);
    await tap(page, 'settings-button');
    await tap(page, 'tips-again-button');
    await waitUntil(page, `document.getElementById('tips-checkbox').checked`, 'tips on');
    assert.equal(await page.evaluate(tipOpen), false);

    await tap(page, 'decks-tab');
    await waitUntil(page, tipSays('Everything else is in the menu'), 'the Decks tip');
    // It is about the menu button, so it sits under it, pointing up at it.
    assert.deepEqual(await page.evaluate(besideOf('#menu-button')), ['below', 10]);
    // A pop-up panel over its element puts it away until the panel closes.
    await tap(page, 'settings-button');
    await waitUntil(page, `!${tipOpen}`, 'the tip put away');
    await tap(page, 'settings-close');
    await waitUntil(page, tipSays('Everything else is in the menu'), 'the Decks tip back');
    await tap(page, 'tip-dismiss');
    // Then the one beside the first deck's › (since 2026-10-16).
    await waitUntil(page, tipSays('Tap a deck to study it'), 'the tip about deck rows');
    await tap(page, 'tip-dismiss');
    assert.equal(await page.evaluate(tipOpen), false);

    // One seen does not come back; Words has none.
    await tap(page, 'words-tab');
    await tap(page, 'decks-tab');
    assert.equal(await page.evaluate(tipOpen), false);
  });

  it('waits for its element, and is put away while the element is out of view', async () => {
    // The ready-made lists' levels come once the list is loaded.
    await tap(page, 'ready-decks-button');
    await waitUntil(page, tipSays('Add one level at a time'), 'the Ready-made tip');
    // Below it if there is room, else above: either way right beside it.
    assert.equal((await page.evaluate(besideOf('#ready-levels button')))[1], 10);
    await tap(page, 'my-decks-button');
    await waitUntil(page, `!${tipOpen}`, 'the tip put away');
    await tap(page, 'ready-decks-button');
    await waitUntil(page, tipSays('Add one level at a time'), 'the Ready-made tip back');
    await tap(page, 'tip-dismiss');
    await tap(page, 'my-decks-button');
  });

  it('remembers which were seen, and can be switched off', async () => {
    // (The harness switches tips off again when the app is reloaded.)
    await reloadApp(page);
    await tap(page, 'settings-button');
    await page.evaluate(`(() => {
      const box = document.getElementById('tips-checkbox');
      if (!box.checked) {
        box.click();
      }
    })()`);
    await tap(page, 'settings-close');
    // Screens whose tips were seen before the reload show none.
    await tap(page, 'decks-tab');
    await tap(page, 'words-tab');
    assert.equal(await page.evaluate(tipOpen), false);
    // The first character written brings the tip about the gestures, below
    // Clear the character so as to leave the writing area empty; once put away, the next
    // character brings none.
    // (The tab starts a card of its own; that one is waited for first, or it
    // could come up after 我們 and take its place.)
    await tap(page, 'practice-button');
    await waitUntil(page, `document.getElementById('stroke-count').textContent.startsWith('1/')`, 'Free practice');
    await waitUntil(page, tipSays('Hold still on the writing area'), 'the gestures tip');
    assert.deepEqual(await page.evaluate(besideOf('#restart-button')), ['below', 10]);
    await tap(page, 'tip-dismiss');
    await waitUntil(page, `!${tipOpen}`, 'the gestures tip gone');
    await startWriting(page, '我們');
    assert.equal(await page.evaluate(tipOpen), false);
    // One not seen yet does: the one about overruling a verdict, announced
    // when a character of a word of several is first judged (wordFlow.js).
    // It goes above the row of boxes, leaving the writing area clear.
    await page.evaluate(`document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'verdict' }))`);
    await waitUntil(page, tipSays('Tap the writing area to go on'), 'the verdict tip');
    assert.deepEqual(await page.evaluate(besideOf('#word-row')), ['above', 10]);
    // Switching tips off takes away the one on screen.
    await tap(page, 'settings-button');
    await page.evaluate(`document.getElementById('tips-checkbox').click()`);
    await waitUntil(page, `!${tipOpen}`, 'the tip gone');
    await tap(page, 'settings-close');
  });
});
