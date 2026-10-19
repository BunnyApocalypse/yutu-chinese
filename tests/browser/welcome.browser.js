// The introduction shown the first time the app is opened, in a real browser,
// and the one-time removal of the words the app used to start with.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, tap, textOf, isShown, waitUntil, openSettings } from './harness.js';

const welcomeOpen = `document.getElementById('welcome').open`;

// One browser, and the steps in order: each builds on the one before.
describe('the introduction', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // The heading of the screen that is showing.
  const heading = () => page.evaluate(`document.querySelector('#welcome [data-step]:not([hidden]) h2').textContent`);
  const click = (selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);

  before(async () => {
    app = await startApp();
    // Everywhere else the tests skip the introduction; here it stays.
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

  it('opens by itself the first time', async () => {
    assert.equal(await page.evaluate(welcomeOpen), true);
    assert.equal(await heading(), 'Welcome to 玉兔中文');
    assert.equal(await textOf(page, 'welcome-progress'), '1 of 4');
    assert.equal(await isShown(page, 'welcome-back'), false);
  });

  it('sets the script, with the pronunciation following it, and a first level', async () => {
    await tap(page, 'welcome-next');
    assert.equal(await heading(), 'Which characters are you learning?');
    // The two scripts and the pronunciations are explained, folded away, with
    // a link to read more about each.
    assert.deepEqual(
      await page.evaluate(`[...document.querySelectorAll('#welcome [data-step]:not([hidden]) a')].map((link) => link.getAttribute('href').split('/wiki/')[1])`),
      ['Simplified_Chinese_characters', 'Traditional_Chinese_characters', 'Taiwanese_Mandarin'],
    );
    assert.equal(await page.evaluate(`[...document.querySelectorAll('#welcome [data-step]:not([hidden]) details')].some((fold) => fold.open)`), false);
    // It starts from the settings as they are: a new device learns simplified
    // and mainland pronunciation only.
    const pronunciation = `document.querySelector('input[name="welcome-pronunciation"]:checked').value`;
    assert.equal(await page.evaluate(`document.querySelector('input[name="welcome-script"]:checked').value`), 'simplified');
    assert.equal(await page.evaluate(pronunciation), 'mainlandOnly');
    assert.equal(await textOf(page, 'welcome-pronunciation-summary'), 'Pronunciation: Mainland China');
    // The pronunciation follows the script...
    await click('input[name="welcome-script"][value="traditional"]');
    assert.equal(await page.evaluate(pronunciation), 'taiwan');
    assert.equal(await textOf(page, 'welcome-pronunciation-summary'), 'Pronunciation: Taiwan');
    await click('input[name="welcome-script"][value="both-traditional"]');
    assert.equal(await page.evaluate(pronunciation), 'mainland');
    // ...until it is chosen by hand.
    await click('input[name="welcome-pronunciation"][value="taiwan"]');
    await click('input[name="welcome-script"][value="traditional"]');
    await click('input[name="welcome-script"][value="simplified"]');
    assert.equal(await page.evaluate(pronunciation), 'taiwan');
    await click('input[name="welcome-script"][value="traditional"]');

    await tap(page, 'welcome-next');
    assert.equal(await heading(), 'Select your starting level');
    // A first level is suggested to suit the script and pronunciation chosen.
    const start = `document.querySelector('input[name="welcome-start"]:checked').value`;
    assert.equal(await page.evaluate(start), 'tocfl|Novice 1');
    // Going back to change the script changes the suggestion...
    await tap(page, 'welcome-back');
    await click('input[name="welcome-script"][value="simplified"]');
    await click('input[name="welcome-pronunciation"][value="mainlandOnly"]');
    await tap(page, 'welcome-next');
    assert.equal(await page.evaluate(start), 'hsk-3.0|1');
    await tap(page, 'welcome-back');
    await click('input[name="welcome-script"][value="traditional"]');
    await click('input[name="welcome-pronunciation"][value="taiwan"]');
    await tap(page, 'welcome-next');
    // ...until one is chosen by hand. This run starts with nothing.
    await click('input[name="welcome-start"][value=""]');
    assert.equal(await page.evaluate(start), '');
  });

  it('keeps Back and Next in view on a phone held sideways', async () => {
    await tap(page, 'welcome-back');
    assert.equal(await heading(), 'Which characters are you learning?');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
    const nextInView = `document.getElementById('welcome-next').getBoundingClientRect().bottom <= innerHeight`;
    const covering = `document.getElementById('welcome-bar').classList.contains('covering')`;
    await waitUntil(page, covering, 'the line above Back and Next');
    assert.equal(await page.evaluate(nextInView), true);
    // At the bottom nothing is hidden under the bar, so the line goes.
    await page.evaluate(`document.getElementById('welcome').scrollTop = 9999`);
    await waitUntil(page, `!(${covering})`, 'no line at the bottom');
    // Upright, the screen fits: no line.
    await page.send('Emulation.setDeviceMetricsOverride', { width: 393, height: 800, deviceScaleFactor: 1, mobile: true });
    await waitUntil(page, `!(${covering})`, 'no line upright');
    assert.equal(await page.evaluate(nextInView), true);
    await tap(page, 'welcome-next');
  });

  it('ends with one button that keeps the words, and "Not now"', async () => {
    await tap(page, 'welcome-next');
    assert.equal(await heading(), 'Keep your words safe');
    assert.equal(await textOf(page, 'welcome-progress'), '4 of 4');
    // The test's browser is a Chromium, which keeps only an installed app's
    // data: the button installs where the browser offers it, with "Not now"
    // beside it; otherwise the screen says how and the button just starts.
    await waitUntil(page, `document.getElementById('welcome-keep-note').textContent !== ''`, 'the line about this browser');
    assert.match(await textOf(page, 'welcome-keep-note'), /installed app/);
    const next = await textOf(page, 'welcome-next');
    assert.doesNotMatch(next, /Keep my words safe/);
    assert.equal(await isShown(page, 'welcome-skip'), next === 'Install the app and start');
    if (next === 'Install the app and start') {
      assert.equal(await textOf(page, 'welcome-skip'), 'Not now');
    }
    // Three buttons at most.
    assert.ok(await page.evaluate(`[...document.querySelectorAll('#welcome button')].filter((button) => button.offsetParent).length`) <= 3);
  });

  it('ends in the Decks tab with the choices saved', async () => {
    // "Not now" saves the choices; only long-term storage is not asked for.
    await tap(page, 'welcome-skip');
    await waitUntil(page, `!${welcomeOpen} && document.getElementById('decks-tab').classList.contains('selected')`, 'the Decks tab');
    // One box for the word, in traditional, and one for the Taiwan reading.
    assert.equal(await isShown(page, 'add-simplified'), false);
    assert.equal(await isShown(page, 'add-traditional'), true);
    assert.equal(await isShown(page, 'add-pinyin-taiwan'), true);
    await openSettings(page, 'settings-learning');
    assert.equal(await page.evaluate(`document.getElementById('script-select').value`), 'traditional');
    assert.equal(await page.evaluate(`document.getElementById('pronunciation-select').value`), 'taiwan');
    // Settings explains the two settings too, behind their "?" buttons.
    assert.equal(await textOf(page, 'script-hint'), '');
    await page.evaluate(`document.querySelector('[aria-controls="script-hint"]').click()`);
    assert.match(await textOf(page, 'script-hint'), /Simplified characters are used in mainland China/);
    await page.evaluate(`document.querySelector('[aria-controls="pronunciation-hint"]').click()`);
    assert.match(await textOf(page, 'pronunciation-hint'), /read differently in Taiwan/);
    assert.deepEqual(
      await page.evaluate(`[...document.querySelectorAll('#settings-panel [data-card-type]')].filter((box) => box.checked).map((box) => box.dataset.cardType)`),
      // The kinds of card are no longer chosen in the introduction.
      ['meaning', 'pinyin', 'tone', 'writing'],
    );
    assert.equal(await page.evaluate(`navigator.storage.persisted()`), false);
    await tap(page, 'settings-close');
  });

  it('does not come back by itself, but can be asked for', async () => {
    await reloadApp(page);
    assert.equal(await page.evaluate(welcomeOpen), false);
    await tap(page, 'settings-button');
    await tap(page, 'welcome-again-button');
    assert.equal(await page.evaluate(welcomeOpen), true);
    assert.equal(await heading(), 'Welcome to 玉兔中文');
    await tap(page, 'welcome-next');
    assert.equal(await page.evaluate(`document.querySelector('input[name="welcome-script"]:checked').value`), 'traditional');
    // Skipping changes nothing.
    await click('input[name="welcome-script"][value="simplified"]');
    await tap(page, 'welcome-skip');
    await tap(page, 'settings-button');
    assert.equal(await page.evaluate(`document.getElementById('script-select').value`), 'traditional');
    await tap(page, 'settings-close');
  });

  it('removes the words the app used to start with, once, and no others', async () => {
    // A device from before: it was given the list, one of whose words has been
    // studied, and has a word of its own.
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
    await inDatabase(`
      const word = (traditional, pinyin) => ({ id: traditional + '|' + pinyin, traditional, simplified: traditional, pinyin, definition: 'x', order: 0, addedAt: 1 });
      stores.words.put(word('今天', 'jin1tian1'));
      stores.words.put(word('明天', 'ming2tian1'));
      stores.words.put(word('貓頭鷹', 'mao1tou2ying1'));
      stores.cards.put({ id: '今天|jin1tian1#meaning', wordId: '今天|jin1tian1', type: 'meaning', due: 1, firstReviewedAt: 1, fsrsState: {} });
      stores.settings.put({ key: 'builtInListVersion', value: 2 });
    `);
    await reloadApp(page);
    const left = await inDatabase(`
      stores.words.getAllKeys().onsuccess = (event) => { result.words = event.target.result; };
      stores.cards.getAllKeys().onsuccess = (event) => { result.cards = event.target.result; };
    `);
    assert.deepEqual(left, { words: ['貓頭鷹|mao1tou2ying1'], cards: [] });

    // Added again by the owner, such a word stays.
    await inDatabase(`stores.words.put({ id: '今天|jin1tian1', traditional: '今天', simplified: '今天', pinyin: 'jin1tian1', definition: 'today', order: 1, addedAt: 2 });`);
    await reloadApp(page);
    const later = await inDatabase(`stores.words.getAllKeys().onsuccess = (event) => { result.words = event.target.result; };`);
    assert.deepEqual(later.words.sort(), ['今天|jin1tian1', '貓頭鷹|mao1tou2ying1']);
  });

  it('leaves a device from before on both scripts and both pronunciations', async () => {
    // Such a device has settings stored, but may never have had the Script
    // setting touched: what it had then was not written down anywhere.
    await page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction(['settings'], 'readwrite');
        tx.objectStore('settings').delete('script');
        tx.objectStore('settings').delete('bothScripts');
        tx.objectStore('settings').delete('pronunciation');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      };
    })`);
    await reloadApp(page);
    await tap(page, 'settings-button');
    assert.equal(await page.evaluate(`document.getElementById('script-select').value`), 'both-traditional');
    assert.equal(await page.evaluate(`document.getElementById('pronunciation-select').value`), 'mainland');
    await tap(page, 'settings-close');
  });

  it('can add a first level, and then ends in Learn', { timeout: 60000 }, async () => {
    await tap(page, 'settings-button');
    await tap(page, 'welcome-again-button');
    // To the screen about words. With words on the device already (from the
    // steps before), nothing is suggested; a level chosen is added when the
    // introduction is finished.
    for (let screen = 0; screen < 2; screen++) {
      await tap(page, 'welcome-next');
    }
    assert.equal(await heading(), 'Select your starting level');
    assert.equal(await page.evaluate(`document.querySelector('input[name="welcome-start"]:checked').value`), '');
    await click('input[name="welcome-start"][value="tocfl|Novice 1"]');
    await tap(page, 'welcome-next');
    // The main button does what keeps the words: here it installs, or (no
    // install question) starts and quietly notes that they are to be kept,
    // so that the app asks again by itself once installed.
    assert.match(await textOf(page, 'welcome-next'), /^(Install the app and start|Start learning)$/);
    await tap(page, 'welcome-next');
    await waitUntil(page, `!${welcomeOpen} && document.getElementById('place-title').textContent === 'Learn'`, 'Learn');
    assert.equal(await page.evaluate(`new Promise((resolve) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        opening.result.transaction('settings').objectStore('settings').get('keepDataWanted').onsuccess = (event) => resolve(event.target.result?.value);
      };
    })`), true);
    const words = await page.evaluate(`new Promise((resolve) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        opening.result.transaction('words').objectStore('words').getAll().onsuccess = (event) => resolve(event.target.result);
      };
    })`);
    assert.ok(words.filter((word) => word.decks.some((deck) => deck.startsWith('tocfl/Novice 1'))).length > 150);
  });

  it('can start with a deck from Anki, ending with its import open', async () => {
    await tap(page, 'settings-button');
    await tap(page, 'welcome-again-button');
    for (let screen = 0; screen < 2; screen++) {
      await tap(page, 'welcome-next');
    }
    await click('input[name="welcome-start"][value="anki"]');
    await tap(page, 'welcome-next');
    await tap(page, 'welcome-next');
    await waitUntil(page, `!${welcomeOpen} && document.getElementById('anki-dialog').open`, 'the Anki import');
    assert.equal(await page.evaluate(`document.getElementById('place-title').textContent`), 'Decks');
    assert.equal(await isShown(page, 'anki-choose-step'), true);
    await tap(page, 'anki-cancel-button');
  });
});
