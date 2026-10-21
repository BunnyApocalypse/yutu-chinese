// "Basics of Chinese" (basics.js): its five screens, the ways to it, and
// its sounds. (The link on a tone card is checked in lesson.browser.js.)
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, textOf, isShown, waitUntil, openSettings, choose } from './harness.js';

const basicsOpen = `document.getElementById('basics-dialog').open`;

// One browser, and the steps in order: each builds on the one before.
describe('basics of Chinese', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // The heading of the screen that is showing.
  const heading = () =>
    page.evaluate(`document.querySelector('#basics-dialog [data-basics-step]:not([hidden]) h2').textContent`);

  before(async () => {
    app = await startApp();
    // The introduction stays, for its link to the basics.
    browsers = await startBrowsers(app.url, 1, { keepWelcome: true });
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

  it("opens over the introduction's first screen, which is still there after", async () => {
    await waitUntil(page, `document.getElementById('welcome').open`, 'the introduction');
    await tap(page, 'welcome-basics-button');
    await waitUntil(page, basicsOpen, 'the basics');
    assert.equal(await heading(), 'Characters');
    assert.equal(await textOf(page, 'basics-progress'), '1 of 5');
    assert.equal(await isShown(page, 'basics-back'), false);
    await tap(page, 'basics-close');
    assert.equal(await page.evaluate(basicsOpen), false);
    assert.equal(await page.evaluate(`document.getElementById('welcome').open`), true);
    assert.equal(await textOf(page, 'welcome-progress'), '1 of 4');
    await tap(page, 'welcome-skip');
  });

  it('goes through its five screens from the menu, and Done closes it', async () => {
    await tap(page, 'basics-button');
    await waitUntil(page, basicsOpen, 'the basics');
    const headings = [await heading()];
    for (let step = 2; step <= 5; step += 1) {
      await tap(page, 'basics-next');
      assert.equal(await textOf(page, 'basics-progress'), `${step} of 5`);
      headings.push(await heading());
    }
    assert.deepEqual(headings, ['Characters', 'Pinyin', 'Tones', 'Four kinds of card', 'Writing']);
    assert.equal(await textOf(page, 'basics-next'), 'Done');
    await tap(page, 'basics-back');
    assert.equal(await heading(), 'Four kinds of card');
    // Every kind of card has its tone mark drawn.
    assert.equal(await page.evaluate(`document.querySelectorAll('#basics-dialog .basics-marks svg').length`), 5);
    await tap(page, 'basics-next');
    await tap(page, 'basics-next');
    assert.equal(await page.evaluate(basicsOpen), false);
  });

  it('shows characters in the script being learned, marked as such', async () => {
    // Simplified, as on a new device: the introduction was skipped.
    await tap(page, 'basics-button');
    const forms = `[...document.querySelectorAll('#basics-dialog [data-simplified]')].map((element) => element.textContent + ':' + element.lang).join(' ')`;
    assert.match(await page.evaluate(forms), /^妈:zh-Hans-CN 麻:zh-Hans-CN 马:zh-Hans-CN 骂:zh-Hans-CN 妈妈:zh-Hans-CN$/);
    await tap(page, 'basics-close');
    await openSettings(page, 'settings-learning');
    await choose(page, 'script-select', 'traditional');
    await page.evaluate(`document.getElementById('settings-panel').close()`);
    // The setting is saved before it takes effect: opened again until it has.
    await waitUntil(
      page,
      `(document.getElementById('basics-dialog').close(), document.getElementById('basics-button').click(),
        document.querySelector('#basics-dialog [data-simplified]').textContent === '媽')`,
      'the traditional forms',
    );
    assert.match(await page.evaluate(forms), /^媽:zh-Hant-TW 麻:zh-Hant-TW 馬:zh-Hant-TW 罵:zh-Hant-TW 媽媽:zh-Hant-TW$/);
    assert.equal(await page.evaluate(`[...document.querySelectorAll('#basics-dialog [data-zh]')].every((element) => element.lang === 'zh-Hant-TW')`), true);
    await tap(page, 'basics-close');
  });

  it('opens from Settings, and plays its recordings', async () => {
    await openSettings(page, 'settings-help');
    await tap(page, 'settings-basics-button');
    await waitUntil(page, basicsOpen, 'the basics');
    assert.equal(await textOf(page, 'basics-progress'), '1 of 5');
    await tap(page, 'basics-next');
    await tap(page, 'basics-next');
    assert.equal(await heading(), 'Tones');
    assert.equal(await textOf(page, 'basics-progress'), '3 of 5');
    await page.evaluate(`document.querySelector('#basics-dialog [data-play="s/ma3"]').click()`);
    await waitUntil(
      page,
      `performance.getEntriesByType('resource').some((entry) => entry.name.endsWith('audio/s/ma3.mp3'))`,
      'the recording of mǎ fetched',
    );
    await tap(page, 'basics-close');
  });
});
