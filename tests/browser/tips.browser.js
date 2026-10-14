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
    await waitUntil(page, tipSays('Your decks.'), 'the Decks tip');
    await tap(page, 'tip-dismiss');
    assert.equal(await page.evaluate(tipOpen), false);

    // Each screen its own; one seen does not come back.
    await tap(page, 'words-tab');
    await waitUntil(page, tipSays('All your words.'), 'the Words tip');
    await tap(page, 'tip-dismiss');
    await tap(page, 'decks-tab');
    await tap(page, 'ready-decks-button');
    await waitUntil(page, tipSays('Add one level at a time'), 'the Ready-made tip');
    await tap(page, 'tip-dismiss');
  });

  it('remembers which were seen, and can be switched off', async () => {
    // (The harness switches tips off again when the app is reloaded, maybe
    // after Review, where the app starts, has put its tip up.)
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
    assert.equal(await page.evaluate(`!${tipOpen} || ${tipSays('Cards come here')}`), true);
    // One not seen yet does.
    await tap(page, 'review-tab');
    await waitUntil(page, tipSays('Cards come here'), 'the Review tip');
    // Switching tips off takes away the one on screen.
    await tap(page, 'settings-button');
    await page.evaluate(`document.getElementById('tips-checkbox').click()`);
    await waitUntil(page, `!${tipOpen}`, 'the tip gone');
    await tap(page, 'settings-close');
  });
});
