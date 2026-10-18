// "What's new" at start-up (whatsNew.js) and "Send feedback" (feedback.js).
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, textOf, waitUntil, reloadApp, openSettings } from './harness.js';
import { CHANGES, changeDate } from '../../src/changes.js';

const isOpen = (page, id) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).open`);

// One browser, and the steps in order: each builds on the one before.
describe("what's new and feedback", { concurrency: false }, () => {
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

  it('shows nothing new on a new device, then or on the next start', async () => {
    assert.equal(await isOpen(page, 'whats-new-dialog'), false);
    assert.equal(await page.evaluate(`localStorage.getItem('changes-seen')`), CHANGES[0].id);
    await reloadApp(page);
    assert.equal(await isOpen(page, 'whats-new-dialog'), false);
  });

  it('shows what changed since the app was last opened, once', async () => {
    // As on a device that used the app before there was a list.
    await page.evaluate(`localStorage.removeItem('changes-seen')`);
    await reloadApp(page);
    await waitUntil(page, `document.getElementById('whats-new-dialog').open`, "what's new shown");
    assert.equal(await page.evaluate(`document.getElementById('whats-new-intro').hidden`), false);
    const text = await textOf(page, 'whats-new-list');
    assert.ok(text.includes(changeDate(CHANGES[0].id)), text);
    assert.ok(text.includes(CHANGES[0].items[0]), text);
    await tap(page, 'whats-new-close');
    await reloadApp(page);
    assert.equal(await isOpen(page, 'whats-new-dialog'), false);
  });

  it("opens the whole list and feedback from Settings, and feedback from the menu", async () => {
    await openSettings(page, 'settings-help');
    await tap(page, 'whats-new-button');
    assert.equal(await isOpen(page, 'whats-new-dialog'), true);
    assert.equal(await page.evaluate(`document.getElementById('whats-new-intro').hidden`), true);
    // Its line at the bottom leads to feedback.
    await tap(page, 'whats-new-feedback');
    assert.equal(await isOpen(page, 'whats-new-dialog'), false);
    assert.equal(await isOpen(page, 'feedback-dialog'), true);
    assert.match(await textOf(page, 'feedback-dialog'), /yutufeedback\.delicious577@passmail\.com/);
    await tap(page, 'feedback-close');
    await tap(page, 'settings-close');

    await tap(page, 'menu-button');
    await tap(page, 'feedback-button');
    assert.equal(await isOpen(page, 'side-menu'), false);
    assert.equal(await isOpen(page, 'feedback-dialog'), true);
    await tap(page, 'feedback-close');
  });
});
