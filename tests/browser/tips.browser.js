// The tips shown the first time each screen is opened (src/tips.js). The
// harness switches them off for the other tests; this one switches them on
// again from Settings.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, tap, waitUntil } from './harness.js';

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

  it('shows a screen\'s tip the first time it is opened, until "Got it"', async () => {
    // Switched off by the harness; "Show all tips again" switches them back on.
    assert.equal(await page.evaluate(`document.getElementById('tips-checkbox').checked`), false);
    await tap(page, 'settings-button');
    await tap(page, 'tips-again-button');
    await waitUntil(page, `document.getElementById('tips-checkbox').checked`, 'tips on');
    assert.equal(await page.evaluate(tipOpen), false);

    await tap(page, 'decks-tab');
    await waitUntil(page, tipSays('Everything else is in the menu'), 'the Decks tip');
    // It is about the menu button, so it sits under it, pointing up at it.
    assert.deepEqual(
      await page.evaluate(`(() => {
        const tip = document.getElementById('tip-card');
        const button = document.getElementById('menu-button').getBoundingClientRect();
        const box = tip.getBoundingClientRect();
        return [tip.classList.contains('beside-below'), box.top > button.bottom, box.top - button.bottom < 20];
      })()`),
      [true, true, true],
    );
    await tap(page, 'tip-dismiss');
    assert.equal(await page.evaluate(tipOpen), false);

    // Each screen its own; one seen does not come back. A tip about the
    // whole screen is at the bottom.
    await tap(page, 'words-tab');
    await waitUntil(page, tipSays('Tap a word for its page'), 'the Words tip');
    assert.equal(await page.evaluate(`document.getElementById('tip-card').className`), 'tip-card');
    await tap(page, 'tip-dismiss');
    await tap(page, 'decks-tab');
    await tap(page, 'ready-decks-button');
    await waitUntil(page, tipSays('Add one level at a time'), 'the Ready-made tip');
    await tap(page, 'tip-dismiss');
  });

  it('keeps a tip on top of a pop-up panel opened after it', async () => {
    // Review's tip is up (not seen yet); then a panel opens over the page.
    await tap(page, 'review-tab');
    await waitUntil(page, tipSays('Grade yourself'), 'the Review tip');
    await tap(page, 'settings-button');
    // The tip is still the topmost thing where its button is.
    assert.equal(
      await page.evaluate(`(() => {
        const button = document.getElementById('tip-dismiss').getBoundingClientRect();
        return document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)?.id;
      })()`),
      'tip-dismiss',
    );
    await tap(page, 'tip-dismiss');
    await tap(page, 'settings-close');
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
    // One not seen yet does (Free practice writes a character).
    await tap(page, 'words-tab');
    await tap(page, 'practice-tab');
    await waitUntil(page, tipSays('Write anywhere'), 'the writing tip');
    // A tip can wait for its moment rather than its screen: the one about
    // overruling a verdict comes when a character is first judged (wordFlow.js
    // announces that; lesson.browser.js checks that it does).
    await tap(page, 'tip-dismiss');
    await page.evaluate(`document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'verdict' }))`);
    await waitUntil(page, tipSays('Tap a character\'s box'), 'the verdict tip');
    // Switching tips off takes away the one on screen.
    await tap(page, 'settings-button');
    await page.evaluate(`document.getElementById('tips-checkbox').click()`);
    await waitUntil(page, `!${tipOpen}`, 'the tip gone');
    await tap(page, 'settings-close');
  });
});
