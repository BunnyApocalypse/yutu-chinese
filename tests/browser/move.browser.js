// The move to yutuchinese.com (docs/offline.md): the moving page at the old
// address hands everything to the app at the new one (move.js, moveIn.js).
//
// A browser keeps data per site, and two different host names are two
// sites: here the old address is http://localhost:5294 and the new one
// http://127.0.0.1:5293, each the app's own dev server, on ports of their
// own (the other files' servers use 5273). Steps build on each other, in
// one browser.

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { startBrowsers, addTestWords, waitUntil } from './harness.js';

const OLD = 'http://localhost:5294';
const NEW = 'http://127.0.0.1:5293';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Read by vite.config.js when each server starts.
process.env.VITE_MOVE_FROM = OLD;
process.env.VITE_MOVE_TO = `${NEW}/`;

async function serve(host, port) {
  const server = await createServer({ server: { host, port, strictPort: true }, logLevel: 'error' });
  await server.listen();
  return server;
}

// The number of records in a store of the app's database, in the page.
const count = (page, store) =>
  page.evaluate(`new Promise((resolve, reject) => {
    const open = indexedDB.open('hanzi-trainer');
    open.onsuccess = () => {
      const request = open.result.transaction('${store}').objectStore('${store}').count();
      request.onsuccess = () => { resolve(request.result); open.result.close(); };
      request.onerror = () => reject(request.error);
    };
    open.onerror = () => reject(open.error);
  })`);

// A real click in the middle of an element: a window may be opened only in
// answer to one (a click() from a script is refused).
async function click(page, id) {
  const { x, y } = await page.evaluate(`(() => {
    const box = document.getElementById('${id}').getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  })()`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
}

async function go(page, url) {
  await page.send('Page.navigate', { url });
  await sleep(500);
}

describe('the move to the new address', { concurrency: false }, () => {
  let oldServer;
  let newServer;
  let browsers;

  before(async () => {
    oldServer = await serve('localhost', 5294);
    newServer = await serve('127.0.0.1', 5293);
    browsers = await startBrowsers(`${OLD}/`, 1);
  });

  after(async () => {
    browsers?.close();
    await oldServer?.close();
    await newServer?.close();
  });

  test('with no words at the old address, the moving page goes straight to the new one', () =>
    browsers.use(async (page) => {
      await go(page, `${OLD}/move.html`);
      await waitUntil(page, `location.origin === '${NEW}'`, 'the new address', 10000);
    }));

  test('opened for the move with no way back to the old page, says so instead of starting empty', () =>
    browsers.use(async (page) => {
      // As when an installed Android app opens the new address in a browser
      // view that keeps no link to it. Through a blank page: from the new
      // address itself, only the part after # would change, which loads
      // nothing.
      await go(page, 'about:blank');
      await go(page, `${NEW}/#move-in`);
      await waitUntil(page, `document.getElementById('starting-note').textContent.includes('browser')`, 'what to do', 10000);
      assert.equal(await page.evaluate(`document.querySelector('main').classList.contains('starting')`), true);
      assert.equal(await page.evaluate('location.hash'), '');
      // A reload opens the app as usual (given time to begin loading, so
      // the wait below runs in the new page).
      await page.send('Page.reload');
      await sleep(1000);
      await waitUntil(page, `!document.querySelector('main').classList.contains('starting')`, 'the app', 10000);
    }));

  test('hands every word, the language and syncing over, and keeps them at the old address', () =>
    browsers.use(async (page) => {
      // Words studied at the old address, a language chosen, and syncing on
      // (to a server that never answers, so nothing is sent anywhere).
      await go(page, `${OLD}/`);
      await waitUntil(page, `!document.querySelector('main').classList.contains('starting')`, 'the app', 10000);
      await addTestWords(page);
      const words = await count(page, 'words');
      assert.ok(words > 100);
      await page.evaluate(`localStorage.setItem('language', 'it')`);
      await page.evaluate(`new Promise((resolve) => {
        const open = indexedDB.open('hanzi-trainer');
        open.onsuccess = () => {
          const tx = open.result.transaction('sync', 'readwrite');
          tx.objectStore('sync').put({ key: 'code', value: '0123456789ABCDEFGHJKMNPQRSTVWXYZ' });
          tx.objectStore('sync').put({ key: 'server', value: 'http://127.0.0.1:9' });
          tx.oncomplete = () => { open.result.close(); resolve(); };
        };
      })`);

      await go(page, `${OLD}/move.html`);
      await waitUntil(page, `!document.getElementById('move-window').hidden`, 'the move button', 10000);
      // Every line the status shows on the way, to see the saving's progress.
      await page.evaluate(`window.seen = [];
        new MutationObserver(() => window.seen.push(document.getElementById('move-status').textContent))
          .observe(document.getElementById('move-status'), { childList: true, characterData: true, subtree: true })`);
      await click(page, 'move-button');
      // Done when the page notes the move (its text is in Italian now).
      await waitUntil(page, `localStorage.getItem('moved-at') !== null`, 'the move to finish', 20000);
      assert.equal(await page.evaluate(`document.getElementById('move-open').hidden`), false);
      // The progress of saving at the new address, shown here too
      // ("Salvataggio su yutuchinese.com: 2.000 di …").
      assert.ok(await page.evaluate(`window.seen.some((line) => line.includes('yutuchinese.com:'))`));
      // Nothing deleted at the old address.
      assert.equal(await count(page, 'words'), words);

      // At the new address: the words, the language, and syncing.
      await go(page, `${NEW}/`);
      await waitUntil(page, `!document.querySelector('main').classList.contains('starting')`, 'the app at the new address', 10000);
      assert.equal(await count(page, 'words'), words);
      assert.equal(await page.evaluate(`localStorage.getItem('language')`), 'it');
      assert.equal(await page.evaluate(`document.documentElement.lang`), 'it');
      const code = await page.evaluate(`new Promise((resolve) => {
        const open = indexedDB.open('hanzi-trainer');
        open.onsuccess = () => {
          const request = open.result.transaction('sync').objectStore('sync').get('code');
          request.onsuccess = () => { resolve(request.result?.value ?? null); open.result.close(); };
        };
      })`);
      assert.equal(code, '0123456789ABCDEFGHJKMNPQRSTVWXYZ');
      // The introduction is not shown: the old address had finished it.
      assert.equal(await page.evaluate(`document.getElementById('welcome-dialog')?.open ?? false`), false);
    }));

  test('in an installed app, says to move from the browser instead of offering the button', () =>
    browsers.use(async (page) => {
      // As in an app installed from the old address (the owner's tablet,
      // where the window the button opens had no way back). Headless
      // Chromium doesn't take display-mode from Emulation.setEmulatedMedia,
      // so the page's question is answered "yes" before its scripts run
      // (which needs the Page domain on).
      await page.send('Page.enable');
      const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `const realMatchMedia = window.matchMedia.bind(window);
          window.matchMedia = (query) => query.includes('display-mode: standalone')
            ? { matches: true, media: query, addEventListener() {}, removeEventListener() {} }
            : realMatchMedia(query);`,
      });
      try {
        await go(page, `${OLD}/move.html`);
        await waitUntil(page, `!document.getElementById('move-installed').hidden`, 'the steps for an installed app', 10000);
        assert.equal(await page.evaluate(`document.getElementById('move-window').hidden`), true);
        assert.equal(await page.evaluate(`document.getElementById('move-installed-address').textContent`), `${OLD}/move.html`);
      } finally {
        await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      }
    }));
});
