// The phone's Back button (src/backButton.js): it closes the open pop-up
// panel and never leaves the app. The test calls history.back(), what Back
// does. A marker on `window` shows the page was never left or reloaded.
//
// Run with: npm run test:browser -- backButton

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, waitUntil, openSettings, reloadApp } from './harness.js';

const isOpen = (page, id) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).open`);
const stillHere = (page) => page.evaluate(`window.__stayed === true && document.getElementById('menu-button') !== null`);

// Back, then a moment for the browser to answer (popstate comes later).
const back = async (page) => {
  await page.evaluate(`history.back()`);
  await new Promise((resolve) => setTimeout(resolve, 300));
};

describe('the Back button', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    await page.evaluate(`window.__stayed = true`);
    // A real touch, as the learner's first one: the app adds its guard place
    // to the history then, and Chrome counts only real input as a touch.
    for (const type of ['mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', { type, x: 3, y: 3, button: 'left', clickCount: 1 });
    }
    // The guard is added a moment after the tap.
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('does nothing on the front screen', async () => {
    await back(page);
    assert.equal(await stillHere(page), true, 'the app was left');
    // And again: the guard is put back each time.
    await back(page);
    assert.equal(await stillHere(page), true, 'the app was left the second time');
  });

  it('closes the menu, and then does nothing', async () => {
    await tap(page, 'menu-button');
    await waitUntil(page, `document.getElementById('side-menu').open`, 'the menu open');
    await back(page);
    assert.equal(await isOpen(page, 'side-menu'), false, 'the menu is still open');
    assert.equal(await stillHere(page), true, 'the app was left');
    await back(page);
    assert.equal(await stillHere(page), true, 'the app was left after the menu closed');
  });

  it('closes Settings, and a panel closed by its own button gives its place back', async () => {
    await openSettings(page, 'settings-writing');
    await waitUntil(page, `document.getElementById('settings-panel').open`, 'Settings open');
    await back(page);
    assert.equal(await isOpen(page, 'settings-panel'), false, 'Settings is still open');
    // Open and close with the panel's own button, three times: Back after
    // that must still only reach the guard, not leave the app.
    for (let i = 0; i < 3; i += 1) {
      await tap(page, 'settings-button');
      await waitUntil(page, `document.getElementById('settings-panel').open`, 'Settings open');
      await page.evaluate(`document.getElementById('settings-panel').close()`);
      await waitUntil(page, `!document.getElementById('settings-panel').open`, 'Settings closed');
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await back(page);
    assert.equal(await stillHere(page), true, 'the app was left');
    // Back twice more still has to find the app there.
    await back(page);
    assert.equal(await stillHere(page), true, 'the app was left after the panels');
  });

  // Firefox's Back passes over a panel's place when nothing was touched on it,
  // so one Back can go two places down. One Back must still close only one
  // panel, and the app must still have its guard afterwards.
  it('closes one panel for one Back even when the browser skips a place', async () => {
    await page.evaluate(`document.getElementById('credits-dialog').showModal()`);
    await page.evaluate(`document.getElementById('feedback-dialog').showModal()`);
    await waitUntil(page, `document.getElementById('feedback-dialog').open`, 'both panels open');
    await new Promise((resolve) => setTimeout(resolve, 200));
    await page.evaluate(`history.go(-2)`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(await isOpen(page, 'feedback-dialog'), false, 'the top panel is still open');
    assert.equal(await isOpen(page, 'credits-dialog'), true, 'the lower panel was closed too');
    await back(page);
    assert.equal(await isOpen(page, 'credits-dialog'), false, 'the lower panel is still open');
    assert.equal(await stillHere(page), true, 'the app was left');
    await back(page);
    assert.equal(await stillHere(page), true, 'the app was left at the front screen');
  });

  // After a reload the browser still has the app's places from before; a panel
  // opening and closing before any tap must not step down from them.
  it('does not leave the app when a panel opens after a reload, before any tap', async () => {
    await reloadApp(page);
    await page.evaluate(`window.__stayed = true`);
    await page.evaluate(`document.getElementById('credits-dialog').showModal()`);
    await waitUntil(page, `document.getElementById('credits-dialog').open`, 'the panel open');
    await page.evaluate(`document.getElementById('credits-dialog').close()`);
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(await stillHere(page), true, 'the app was left');
  });
});
