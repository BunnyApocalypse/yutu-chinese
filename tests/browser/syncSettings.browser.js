// Settings › Your data and backups › Sync between devices (syncPanel.js,
// syncControl.js), against a sync server of the test's own
// (server/server.js), started on a free port with its files in a folder of
// its own.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { startApp, startBrowsers, tap, type, waitUntil, openSettings, textOf, ANSWER_YES } from './harness.js';
import { createSyncServer } from '../../server/server.js';
import qrcode from 'qrcode-generator';

// The files the server holds, all accounts together.
async function filesOnServer(folder) {
  const names = [];
  for (const account of await fs.readdir(folder)) {
    names.push(...(await fs.readdir(path.join(folder, account))).filter((name) => !name.startsWith('.')));
  }
  return names;
}

const shown = (id) => `!document.getElementById('${id}').hidden`;

// Gives the page a camera that sees a QR code of `text`: a canvas, redrawn
// ten times a second, in place of getUserMedia (headless Chromium has no
// camera). The QR code is made here with the library the app uses.
async function cameraSeeing(page, text) {
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const picture = code.createDataURL(6, 4);
  await page.evaluate(`(async () => {
    const image = new Image();
    image.src = '${picture}';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width + 200;
    canvas.height = image.height + 200;
    const context = canvas.getContext('2d');
    const draw = () => {
      context.fillStyle = '#808080';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 100, 100);
    };
    draw();
    setInterval(draw, 100);
    navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(10);
  })()`);
}

// Waits until `check()` (run here, in Node) gives something true, asking
// again every tenth of a second; a check that fails because the page is
// loading again counts as not yet. For what the harness's waitUntil can't
// wait for: a promise in the page, or the page starting again.
async function waitFor(check, description, limit = 15000) {
  const start = Date.now();
  for (;;) {
    try {
      if (await check()) {
        return;
      }
    } catch {
      // The page is between two loads.
    }
    if (Date.now() - start > limit) {
      throw new Error(`Waited in vain for: ${description}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const CODE_SHOWN = /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/;

// One browser, and the steps in order: each builds on the one before.
describe('sync in Settings', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;
  let server;
  let folder;
  let code;

  before(async () => {
    app = await startApp();
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'yutu-sync-settings-'));
    server = await createSyncServer({ dataDir: folder, log: false, allowedOrigins: [new URL(app.url).origin] });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // This device syncs with the test's server.
    await page.evaluate(`import('/src/db.js').then((db) => db.setSyncValue('server', 'http://127.0.0.1:${server.address().port}'))`);
    await page.evaluate(ANSWER_YES);
    await openSettings(page, 'settings-data');
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    await new Promise((resolve) => server?.close(resolve));
    await fs.rm(folder, { recursive: true, force: true });
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('offers sync, and shows a new code before turning anything on', async () => {
    assert.ok(await page.evaluate(shown('sync-setting')));
    assert.ok(await page.evaluate(shown('sync-off')));
    await tap(page, 'sync-on-button');
    await waitUntil(page, shown('sync-code-step'), 'the code');
    assert.match(await textOf(page, 'sync-code'), CODE_SHOWN);
    // Cancel: nothing was turned on or sent.
    await tap(page, 'sync-code-cancel');
    await waitUntil(page, shown('sync-off'), 'sync off again');
    assert.deepEqual(await filesOnServer(folder), []);
  });

  it('turns sync on with the code once it is saved, and sends this device\'s data', async () => {
    await tap(page, 'sync-on-button');
    await waitUntil(page, shown('sync-code-step'), 'the code');
    code = await textOf(page, 'sync-code');
    await tap(page, 'sync-file-button');
    await waitUntil(page, `document.getElementById('sync-code-note').textContent.includes('yutu-chinese-sync-code.txt')`, 'the file saved');
    await tap(page, 'sync-saved-button');
    await waitUntil(page, `document.getElementById('sync-status').textContent.startsWith('Last synced')`, 'the first sync');
    assert.ok(await page.evaluate(shown('sync-on')));
    assert.equal((await filesOnServer(folder)).filter((name) => name.startsWith('batch-')).length, 1);
    // The data group says the words are synced now.
    assert.match(await textOf(page, '#settings-data .hint'), /synced/);
  });

  it('shows the code again only after a warning, and hides it again', async () => {
    await tap(page, 'sync-show-code-button');
    await waitUntil(page, shown('sync-code-step'), 'the code');
    assert.equal(await textOf(page, 'sync-code'), code);
    assert.ok(await page.evaluate(`document.getElementById('sync-saved-button').hidden`));
    await tap(page, 'sync-code-hide');
    await waitUntil(page, shown('sync-on'), 'sync on again');
  });

  it('turns sync off, keeping the words and forgetting the code', async () => {
    await tap(page, 'sync-off-button');
    await waitUntil(page, shown('sync-off'), 'sync off');
    const kept = await page.evaluate(`import('/src/db.js').then(async (db) => ({
      code: await db.getSyncValue('code', null),
      outbox: (await db.getAll('outbox')).length,
    }))`);
    assert.deepEqual(kept, { code: null, outbox: 0 });
  });

  it('joins with a code typed in, telling a typing mistake apart', async () => {
    // The server's address went with the rest; this device is pointed at
    // the test's server again.
    await page.evaluate(`import('/src/db.js').then((db) => db.setSyncValue('server', 'http://127.0.0.1:${server.address().port}'))`);
    await tap(page, 'sync-join-button');
    const wrong = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6);
    await type(page, 'sync-code-input', wrong);
    await page.evaluate(`document.getElementById('sync-join-form').requestSubmit()`);
    await waitUntil(page, shown('sync-join-error'), 'the mistake');
    assert.match(await textOf(page, 'sync-join-error'), /wrong/);
    // Typed in small letters without dashes: read all the same.
    await type(page, 'sync-code-input', code.replace(/-/g, '').toLowerCase());
    assert.equal(await page.evaluate(`document.getElementById('sync-code-input').value`), code.replace(/-/g, '').toLowerCase());
    // Or scanned from the other device's QR code, the link with the code:
    // the code goes in the box, and joining is still the learner's tap.
    await cameraSeeing(page, `${app.url}#sync=${code}`);
    await tap(page, 'sync-scan-button');
    await waitUntil(page, `document.getElementById('scan-dialog').open`, 'the scanner');
    await waitUntil(page, `!document.getElementById('scan-dialog').open`, 'the code found', 15000);
    assert.equal(await page.evaluate(`document.getElementById('sync-code-input').value`), code);
    assert.equal(await page.evaluate(`import('/src/db.js').then((db) => db.getSyncValue('code', null))`), null);
    await page.evaluate(`document.getElementById('sync-join-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('sync-status').textContent.startsWith('Last synced')`, 'the sync');
    assert.equal(await textOf(page, 'sync-status').then((text) => text.includes('didn')), false);
  });

  it('deletes everything synced after asking, and turns sync off', async () => {
    assert.ok((await filesOnServer(folder)).length > 0);
    await tap(page, 'sync-delete-button');
    await waitUntil(page, shown('sync-off'), 'sync off');
    assert.deepEqual(await fs.readdir(folder), []);
  });

  it('chooses another sync server only once it answers, and goes back to the usual one', async () => {
    const port = server.address().port;
    const summary = () => textOf(page, 'sync-server-summary');
    await page.evaluate(`document.getElementById('sync-server-fold').open = true`);
    // The test's server, chosen at the start through the database.
    assert.equal(await summary(), `Sync server: 127.0.0.1:${port}`);
    const tryAddress = async (address) => {
      await type(page, 'sync-server-input', address);
      await page.evaluate(`document.getElementById('sync-server-form').requestSubmit()`);
      await waitUntil(page, `!document.getElementById('sync-server-note').textContent.startsWith('Checking')`, 'the check');
      return textOf(page, 'sync-server-note');
    };
    assert.match(await tryAddress('sync.example.org'), /isn’t a server’s address/);
    assert.match(await tryAddress('http://sync.example.org'), /starts with https/);
    assert.match(await tryAddress('http://127.0.0.1:9'), /didn’t answer/);
    // Back to the usual one (under npm run dev, the one on this computer).
    await tap(page, 'sync-server-usual');
    await waitUntil(page, `document.getElementById('sync-server-summary').textContent.includes('8787')`, 'the usual server');
    assert.ok(await page.evaluate(`document.getElementById('sync-server-usual').hidden`));
    // And the test's own again, which answers.
    assert.match(await tryAddress(`http://127.0.0.1:${port}/`), new RegExp(`will use 127.0.0.1:${port}`));
    assert.equal(await summary(), `Sync server: 127.0.0.1:${port}`);
    assert.equal(await page.evaluate(`import('/src/db.js').then((db) => db.getSyncValue('server', null))`), `http://127.0.0.1:${port}`);
  });

  it('says how syncing handles the learner\'s data', async () => {
    await page.evaluate(`document.querySelector('#sync-off .sync-privacy-button').click()`);
    await waitUntil(page, `document.getElementById('privacy-dialog').open`, 'the privacy page');
    assert.equal(await textOf(page, '#privacy-dialog h2'), 'Syncing and your data');
    assert.match(await textOf(page, '#privacy-dialog .privacy-list'), /Hetzner in Germany, run by the 玉兔中文 team/);
    await tap(page, 'privacy-close');
    await waitUntil(page, `!document.getElementById('privacy-dialog').open`, 'it to close');
  });
});

// Syncing in the introduction (welcome.js): one device turns it on on the
// last screen, another joins from the first, a third is opened from the
// link in the QR code.
describe('sync in the introduction', { concurrency: false }, () => {
  let app;
  let browsers;
  let server;
  let folder;
  const pages = [];
  let code;

  const click = (page, selector) => page.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const syncServerIs = (page) =>
    page.evaluate(`import('/src/db.js').then((db) => db.setSyncValue('server', 'http://127.0.0.1:${server.address().port}'))`);

  before(async () => {
    app = await startApp();
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'yutu-sync-welcome-'));
    server = await createSyncServer({ dataDir: folder, log: false, allowedOrigins: [new URL(app.url).origin] });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browsers = await startBrowsers(app.url, 3, { keepWelcome: true });
    // All three pages, kept for the steps below (nothing else uses them).
    await browsers.use((a) => browsers.use((b) => browsers.use((c) => pages.push(a, b, c))));
    for (const page of pages) {
      await syncServerIs(page);
    }
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    await new Promise((resolve) => server?.close(resolve));
    await fs.rm(folder, { recursive: true, force: true });
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('turns sync on at the end, once the code is ticked as saved', async () => {
    const [page] = pages;
    await tap(page, 'welcome-next');
    await click(page, 'input[name="welcome-script"][value="traditional"]');
    await tap(page, 'welcome-next');
    await click(page, 'input[name="welcome-start"][value=""]');
    await tap(page, 'welcome-next');
    assert.ok(await page.evaluate(shown('welcome-sync')));
    // "Not now" is chosen at first; the screen finishes as before.
    assert.equal(await page.evaluate(`document.getElementById('welcome-next').disabled`), false);
    await click(page, 'input[name="welcome-sync"][value="on"]');
    await waitUntil(page, shown('welcome-sync-code'), 'the code');
    code = await textOf(page, 'welcome-code');
    assert.match(code, CODE_SHOWN);
    assert.equal(await page.evaluate(`document.querySelectorAll('#welcome-qr svg path').length`), 1);
    assert.equal(await page.evaluate(`document.getElementById('welcome-next').disabled`), true);
    await click(page, '#welcome-code-saved');
    assert.equal(await page.evaluate(`document.getElementById('welcome-next').disabled`), false);
    await tap(page, 'welcome-next');
    await waitUntil(page, `!document.getElementById('welcome').open`, 'the introduction to close');
    await waitFor(() => page.evaluate(`import('/src/db.js').then((db) => db.getSyncValue('lastSyncedAt', null))`), 'the first sync');
    assert.equal((await filesOnServer(folder)).filter((name) => name.startsWith('batch-')).length, 1);
  });

  it('joins from the first screen, skipping the rest and taking the other device\'s settings', async () => {
    const page = pages[1];
    await tap(page, 'welcome-join-button');
    await type(page, 'welcome-code-input', code);
    await page.evaluate(`window.loadedBefore = true; document.getElementById('welcome-join-form').requestSubmit()`);
    // The app starts again with what came (the introduction not again).
    await waitFor(
      () => page.evaluate(`!window.loadedBefore && !document.querySelector('main').classList.contains('starting')`),
      'the app to start again',
    );
    assert.equal(await page.evaluate(`document.getElementById('welcome').open`), false);
    const script = await page.evaluate(`import('/src/db.js').then((db) => db.getSetting('script', null))`);
    assert.equal(script, 'traditional');
  });

  it('opened from the link in the QR code, puts the code in the box to confirm, and out of the address', async () => {
    const page = pages[2];
    // (With "?link", a page of its own: a "#…" alone would only move within
    // the page already open.)
    await page.send('Page.navigate', { url: `${app.url}?link#sync=${code}` });
    await waitFor(
      () => page.evaluate(`document.getElementById('welcome')?.open && !document.getElementById('welcome-join-form').hidden`),
      'the code box',
    );
    assert.equal(await page.evaluate(`document.getElementById('welcome-code-input').value`), code);
    assert.ok(await page.evaluate(shown('welcome-from-link')));
    assert.equal(await page.evaluate('window.location.hash'), '');
    // Nothing joined by itself.
    assert.equal(await page.evaluate(`import('/src/db.js').then((db) => db.getSyncValue('code', null))`), null);
  });
});

// Syncing by itself (syncTiming.js), between two devices with sync on.
describe('syncing by itself', { concurrency: false }, () => {
  let app;
  let browsers;
  let server;
  let folder;
  let a;
  let b;

  // The page put away (another app, the screen locked) or shown again, as
  // the browser says so.
  const setVisibility = (page, state) =>
    page.evaluate(`Object.defineProperty(document, 'visibilityState', { value: '${state}', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'))`);
  const newWordsOn = (page) => page.evaluate(`document.getElementById('new-words-input').value`);
  const setNewWords = (page, value) =>
    page.evaluate(`(() => {
      const box = document.getElementById('new-words-input');
      box.value = '${value}';
      box.dispatchEvent(new Event('change'));
    })()`);
  const batchesOnServer = async () => (await filesOnServer(folder)).filter((name) => name.startsWith('batch-')).length;

  before(async () => {
    app = await startApp();
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'yutu-sync-timing-'));
    server = await createSyncServer({ dataDir: folder, log: false, allowedOrigins: [new URL(app.url).origin] });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browsers = await startBrowsers(app.url, 2);
    await browsers.use((first) => browsers.use((second) => {
      a = first;
      b = second;
    }));
    for (const page of [a, b]) {
      await page.evaluate(`import('/src/db.js').then((db) => db.setSyncValue('server', 'http://127.0.0.1:${server.address().port}'))`);
    }
    // A turns sync on, B joins with A's code.
    await openSettings(a, 'settings-data');
    await tap(a, 'sync-on-button');
    await waitUntil(a, shown('sync-code-step'), 'the code');
    const code = await textOf(a, 'sync-code');
    await tap(a, 'sync-saved-button');
    await waitUntil(a, `document.getElementById('sync-status').textContent.startsWith('Last synced')`, 'the first sync');
    await openSettings(b, 'settings-data');
    await tap(b, 'sync-join-button');
    await type(b, 'sync-code-input', code);
    await b.evaluate(`window.loadedBefore = true; document.getElementById('sync-join-form').requestSubmit()`);
    // B starts again with A's settings.
    await waitFor(() => b.evaluate(`!window.loadedBefore && !document.querySelector('main').classList.contains('starting')`), 'B to start again');
    await openSettings(a, 'settings-studying');
    await openSettings(b, 'settings-studying');
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    await new Promise((resolve) => server?.close(resolve));
    await fs.rm(folder, { recursive: true, force: true });
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('sends a change when the app is put away, and the other device takes it in, at once in effect, when shown', async () => {
    const before = await batchesOnServer();
    await setNewWords(a, 17);
    await setVisibility(a, 'hidden');
    await waitFor(async () => (await batchesOnServer()) > before, 'A\'s change sent');
    assert.notEqual(await newWordsOn(b), '17');
    await setVisibility(b, 'visible');
    // The Settings panel on B shows it without starting again.
    await waitFor(async () => (await newWordsOn(b)) === '17', 'B to show it');
  });

  it('takes nothing in while a character is being written on that device', async () => {
    const before = await batchesOnServer();
    await setNewWords(a, 23);
    await setVisibility(a, 'hidden');
    await waitFor(async () => (await batchesOnServer()) > before, 'A\'s change sent');
    // On B a finger is down on the writing area.
    await b.evaluate(`document.getElementById('writing-area').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, isPrimary: true }))`);
    await setVisibility(b, 'visible');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.equal(await newWordsOn(b), '17');
    // The finger lifts; a few seconds later the change comes.
    await b.evaluate(`window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, isPrimary: true }))`);
    await waitFor(async () => (await newWordsOn(b)) === '23', 'B to take it in after the stroke');
  });
});
