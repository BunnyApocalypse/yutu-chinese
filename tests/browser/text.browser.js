// The interface's text (src/text.js): the page's own text filled in at
// start-up, the language chosen in Settings › Look and sound, and the test
// language under Settings › For testing.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, textOf, openSettings, choose, waitUntil } from './harness.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits until the page has loaded again after the app restarted itself and
// `condition` (JavaScript text) is true in it.
async function afterRestart(page, condition) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(100);
    try {
      if (await page.evaluate(`!window.loadedBefore && (${condition})`)) {
        return;
      }
    } catch {
      // The page was between two loads; try again.
    }
  }
  throw new Error(`The app did not start again with: ${condition}`);
}

describe('the interface text', { concurrency: false }, () => {
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

  it('fills in the page from the English text, links and all', async () => {
    await openSettings(page, 'settings-learning');
    assert.equal(await page.evaluate(`document.getElementById('settings-title').textContent`), 'Settings');
    assert.equal(await textOf(page, '#settings-learning h3'), 'Chinese');
    assert.equal(await page.evaluate(`document.querySelectorAll('#script-hint a').length`), 2);
    assert.equal(
      await page.evaluate(`document.querySelector('#script-select option[value="simplified"]').textContent`),
      'Simplified only 简体',
    );
    assert.equal(
      await page.evaluate(`document.querySelector('#leech-input').getAttribute('aria-label')`),
      'Times forgotten before a card is a leech',
    );
    assert.equal(await page.evaluate('document.documentElement.lang'), 'en');
  });

  it('switches to the test language and back, starting the app again', async () => {
    await openSettings(page, 'settings-testing');
    await page.evaluate('window.loadedBefore = true');
    await tap(page, 'pseudo-language-checkbox');
    // Once the app has started, the box is ticked (testerSettings.js).
    await afterRestart(
      page,
      `document.getElementById('settings-title').textContent.startsWith('[Šéţţîñĝš') && document.getElementById('pseudo-language-checkbox').checked`,
    );
    // Chinese and the links are kept as they are.
    assert.match(
      await page.evaluate(`document.querySelector('#script-select option[value="simplified"]').textContent`),
      /简体/,
    );
    assert.equal(await page.evaluate(`document.querySelectorAll('#script-hint a').length`), 2);

    await page.evaluate('window.loadedBefore = true');
    await tap(page, 'pseudo-language-checkbox');
    await afterRestart(page, `document.getElementById('settings-title').textContent === 'Settings'`);
  });

  it('switches to Italian and back to English in Settings', async () => {
    await openSettings(page, 'settings-look');
    // Filled in when Settings is set up, a moment after the page's text.
    await waitUntil(page, `document.getElementById('language-select').options.length === 3`, 'the languages');
    assert.equal(await page.evaluate(`document.getElementById('language-select').value`), 'en');
    await page.evaluate('window.loadedBefore = true');
    await choose(page, 'language-select', 'it');
    await afterRestart(
      page,
      `document.documentElement.lang === 'it' && document.getElementById('language-select').value === 'it'`,
    );
    assert.equal(await page.evaluate(`document.getElementById('settings-title').textContent`), 'Impostazioni');
    // Each language is named in itself, marked with its own lang.
    assert.equal(await page.evaluate(`document.querySelector('#language-select option[value="de"]').lang`), 'de');

    await page.evaluate('window.loadedBefore = true');
    await choose(page, 'language-select', 'en');
    await afterRestart(page, `document.getElementById('settings-title').textContent === 'Settings'`);
  });
});
