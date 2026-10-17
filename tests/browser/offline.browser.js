// Working offline, in a real browser: the built app is opened once, saves
// itself and its data on the device, and then works with the server gone.
//
// Run with: npm run test:browser
// This file builds the app first (`npm run build`), which takes a few seconds.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  startBuiltApp,
  startBrowsers,
  startWriting,
  writingArea,
  drawStroke,
  loadStrokeData,
  reloadApp,
  tap,
  type,
  textOf,
  waitUntil,
  addTestWords,
 openDeckPage } from './harness.js';

// One browser, and the steps in order: each builds on the one before.
describe('offline use', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Writes the first stroke of a character in Free practice and returns the status line.
  async function writeFirstStroke(char) {
    await tap(page, 'practice-button');
    await startWriting(page, char);
    const area = await writingArea(page);
    return drawStroke(page, area, loadStrokeData(char).medians[0]);
  }

  before(async () => {
    app = await startBuiltApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    await addTestWords(page);
  });

  after(async () => {
    // One of the tests changes the built service worker; put it back.
    fs.writeFileSync('dist/sw.js', fs.readFileSync('dist/sw.js', 'utf8').replace('-next"', '"'));
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('runs from a folder below the top of the site', async () => {
    assert.match(await writeFirstStroke('學'), /^2\/16 /);
  });

  it('saves the app, the stroke data and the dictionary on the device', { timeout: 180000 }, async () => {
    // Unpacking about 10,600 files takes a while, so this waits longer than waitUntil does.
    let status = '';
    for (let attempt = 0; attempt < 600 && !/saved too/.test(status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      status = await page.evaluate(`document.getElementById('offline-status').textContent`);
    }
    assert.match(status, /The app is saved on this device\./);
    assert.match(status, /Stroke data and dictionary are saved too\./);
    // The update button is for a later version, not for the first one.
    assert.equal(await page.evaluate(`document.getElementById('update-button').hidden`), true);
  });

  it('keeps the recordings out of that, and saves them all when asked', { timeout: 180000 }, async () => {
    const saved = (file) =>
      page.evaluate(`caches.open('offline-audio').then((cache) => cache.match(new URL('${file}', location.href).href)).then((found) => Boolean(found))`);
    await waitUntil(page, `document.getElementById('offline-status').textContent.includes('Recordings of words are kept once played.')`, 'the line about recordings');
    assert.equal(await saved('audio/w/5b66-4e60.mp3'), false);
    // The button is shown only once the app listens for its tap, a moment
    // after the line above. A tap before that did nothing, which made this
    // test (and the last one, which expects the recordings asked for) fail
    // now and then in a full run, with the computer busy.
    await waitUntil(page, `!document.getElementById('save-audio-button').hidden`, 'the button for the recordings');
    await tap(page, 'save-audio-button');
    let status = '';
    for (let attempt = 0; attempt < 600 && !/All recordings are saved too/.test(status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      status = await page.evaluate(`document.getElementById('offline-status').textContent`);
    }
    assert.match(status, /All recordings are saved too\./);
    // A word's recording and a syllable's are there, as sound.
    assert.equal(await saved('audio/w/5b66-4e60.mp3'), true);
    assert.equal(await saved('audio/s/ma1.mp3'), true);
    assert.equal(
      await page.evaluate(`caches.match(new URL('audio/s/ma1.mp3', location.href).href).then((found) => found.headers.get('Content-Type'))`),
      'audio/mpeg',
    );
  });

  it('deletes what was saved under the old folder, /hanzi-trainer/, and keeps its own', async () => {
    const old = JSON.stringify(`${new URL(app.url).origin}/hanzi-trainer/char-data/5b78.json`);
    const dataCache = `caches.open('offline-data')`;
    await page.evaluate(`${dataCache}.then((cache) => cache.put(${old}, new Response('{}')))`);
    await page.evaluate(`localStorage.removeItem('old-folder-forgotten')`);
    await reloadApp(page);
    await waitUntil(page, `localStorage.getItem('old-folder-forgotten') === 'yes'`, 'the clean-up');
    assert.equal(await page.evaluate(`${dataCache}.then((cache) => cache.match(${old})).then((found) => found === undefined)`), true);
    assert.ok(await page.evaluate(`${dataCache}.then((cache) => cache.keys()).then((keys) => keys.length)`) > 1000);
  });

  it('offers a new version of the app and switches to it when asked', { timeout: 60000 }, async () => {
    const appCaches = () =>
      page.evaluate(`caches.keys().then((names) => names.filter((name) => name.startsWith('app-')).join(','))`);
    const before = await appCaches();
    // A new version, as far as the browser can tell: the service worker's file has changed.
    const worker = fs.readFileSync('dist/sw.js', 'utf8');
    fs.writeFileSync('dist/sw.js', worker.replace(/const VERSION = "(\w+)"/, 'const VERSION = "$1-next"'));
    // The browser looks for a new version when the app is opened; update() makes it look now.
    await page.evaluate(`navigator.serviceWorker.getRegistration().then((registration) => registration.update())`);
    await waitUntil(page, `!document.getElementById('update-button').hidden`, 'the update button');
    // Until it is tapped, the old version stays in charge.
    assert.equal(await appCaches().then((names) => names.includes(before)), true);

    await page.evaluate('window.loadedBefore = true');
    await tap(page, 'update-button');
    let reloaded = false;
    for (let attempt = 0; attempt < 100 && !reloaded; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      reloaded = await page
        .evaluate(`!window.loadedBefore && (document.getElementById('card-type').textContent !== '' ||
          !document.getElementById('done-panel').hidden)`)
        .catch(() => false);
    }
    assert.ok(reloaded, 'the app did not start again');
    assert.equal(await appCaches(), `${before}-next`);
    assert.equal(await page.evaluate(`document.getElementById('update-button').hidden`), true);
  });

  it('starts and works with the server gone', { timeout: 60000 }, async () => {
    await app.close();
    await reloadApp(page);
    // A character of the Taiwan set, and one that is only in the big set.
    assert.match(await writeFirstStroke('學'), /^2\/16 /);
    assert.match(await writeFirstStroke('学'), /^2\/8 /);
    // The dictionary is there too.
    await openDeckPage(page);
    await type(page, 'add-traditional', '圖書館');
    await waitUntil(page, `document.querySelector('#add-suggestions button') !== null`, 'a dictionary entry');
    assert.match(await textOf(page, '#add-suggestions button'), /library/);
    // Tone cards need the tone table, which is part of the app's own files.
    await tap(page, 'practice-button');
    await type(page, 'word-input', '星期');
    await page.evaluate(`(() => {
      const kind = document.getElementById('practice-type');
      kind.value = 'tone';
      kind.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await waitUntil(page, `document.getElementById('status').textContent.includes('1 of 2')`, 'a tone card');
    await page.evaluate(`document.querySelector('#tone-buttons [data-tone="1"]').click()`);
    await waitUntil(page, `document.getElementById('status').textContent.includes('2 of 2')`);
    await page.evaluate(`document.querySelector('#tone-buttons [data-tone="2"]').click()`);
    await waitUntil(page, `document.getElementById('status').textContent === 'All tones right'`, 'the Taiwan tone accepted');
    // And it says how things stand.
    // (Read whether or not Settings is open, where the line is.)
    const offlineStatus = () => page.evaluate(`document.getElementById('offline-status').textContent`);
    assert.match(await offlineStatus(), /saved too/);
    // The recordings were asked for on this device, so they still are.
    // (Looking through everything that is saved takes the app a while first.)
    let status = '';
    for (let attempt = 0; attempt < 240 && !/recordings/i.test(status); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      status = await offlineStatus();
    }
    assert.match(status, /All recordings are saved too\./);
  });
});
