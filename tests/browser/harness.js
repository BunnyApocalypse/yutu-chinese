// What the browser tests share: serving the app, running several headless
// browsers side by side, and doing in a page what a hand would do (opening
// Free practice, drawing strokes, reading the status line).
//
// Nothing here is an npm dependency. The browser is the Chromium installed on
// this computer, started "headless" (without a window). It is driven through
// the DevTools protocol: the same channel the browser's own developer tools
// use, which takes commands such as "press the mouse button at this point" as
// JSON messages over a WebSocket.

import { spawn, execSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// How many browsers run side by side: half the processor's cores unless the
// BROWSERS environment variable says otherwise (BROWSERS=3 npm run test:browser).
export const BROWSER_COUNT =
  Number(process.env.BROWSERS) || Math.max(1, Math.floor(os.availableParallelism() / 2));

// The size of a phone screen, so the page is laid out as it is on the phone.
const SCREEN = { width: 393, height: 800 };

// ---- Serving the app ----

// Starts Vite's dev server for the tests alone, on its own port, so it does
// not matter whether `npm run dev` is running. Returns the address and a
// function that stops the server.
export async function startApp() {
  const server = await createServer({
    // Only this computer needs to reach it (vite.config.js opens the usual
    // dev server to the LAN for the phone).
    server: { host: '127.0.0.1', port: 5273 },
    logLevel: 'error',
  });
  await server.listen();
  return { url: server.resolvedUrls.local[0], close: () => server.close() };
}

// Builds the app and serves the result the way GitHub Pages does: as plain
// files, in a folder below the top of the site, with a real "not found" for
// anything that isn't there. Unlike the dev server this has the service
// worker, so it is what the offline test uses. Returns the address and a
// function that stops the server, as if the connection had gone.
export async function startBuiltApp() {
  execSync('npm run build', { stdio: 'ignore' });
  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
  };
  const FOLDER = '/hanzi-trainer/';
  const server = http.createServer((request, response) => {
    const asked = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const inFolder = asked.startsWith(FOLDER) ? asked.slice(FOLDER.length) || 'index.html' : null;
    const file = inFolder === null ? null : path.join('dist', inFolder);
    // path.join has resolved any "..", so a file outside dist/ is refused here.
    if (!file || !file.startsWith('dist') || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'text/plain; charset=utf-8' });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(4273, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:4273${FOLDER}`,
    close() {
      // Also drops the connections browsers keep open for later requests.
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

// ---- Browsers ----

const BROWSER_NAMES = ['chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable'];

// Finds the browser program: CHROME_PATH if set, otherwise the first of the
// usual names found on the PATH.
function findBrowser() {
  if (process.env.CHROME_PATH) {
    return process.env.CHROME_PATH;
  }
  for (const folder of (process.env.PATH || '').split(path.delimiter)) {
    for (const name of BROWSER_NAMES) {
      const candidate = path.join(folder, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  throw new Error(
    `The browser tests need Chromium or Chrome, and none of ${BROWSER_NAMES.join(', ')} was found. ` +
      'Install one, or set CHROME_PATH to the program to use.',
  );
}

// Every browser started and not yet closed, so none is left running if the
// tests are interrupted.
const runningBrowsers = new Set();
process.on('exit', () => {
  for (const browser of runningBrowsers) {
    browser.kill();
  }
});

// Starts one headless browser with a single page, and returns the page:
//   send(method, params)   a DevTools protocol command; returns its result
//   evaluate(expression)   runs JavaScript in the page and returns its value
//                          (waiting for it, if it is a promise)
//   errors                 the uncaught errors the page has thrown
//   close()
async function launchBrowser() {
  // Each browser gets its own empty profile folder, so each has its own
  // IndexedDB and settings, and nothing of yours is touched.
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'hanzi-trainer-test-'));
  const child = spawn(
    findBrowser(),
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      `--user-data-dir=${profile}`,
      `--window-size=${SCREEN.width + 30},${SCREEN.height + 100}`,
      // Port 0 lets the browser pick a free port; it reports which below.
      '--remote-debugging-port=0',
      'about:blank',
    ],
    // "detached" puts the browser and the helper programs it starts in a
    // group of their own, so they can all be stopped together.
    { detached: true, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  const browser = {
    kill() {
      try {
        process.kill(-child.pid, 'SIGKILL'); // minus: the whole group
      } catch {
        // already gone
      }
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    },
  };
  runningBrowsers.add(browser);

  // The browser announces where it listens for DevTools on its error output.
  let startTimer;
  const port = await new Promise((resolve, reject) => {
    let output = '';
    child.stderr.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
      if (match) {
        resolve(match[1]);
      }
    });
    child.on('exit', () => reject(new Error(`The browser stopped before it was ready:\n${output}`)));
    startTimer = setTimeout(() => reject(new Error(`The browser did not start in time:\n${output}`)), 20000);
  });
  // A timer left running would keep the tests from ending until it ran out.
  clearTimeout(startTimer);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = () => reject(new Error('Could not connect to the browser.'));
  });

  // Each command gets a number, and the browser's answer carries the same
  // number, which is how an answer finds the command that is waiting for it.
  let nextId = 1;
  const waiting = new Map();
  const errors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails;
      errors.push(details.exception?.description || details.text);
    }
    if (waiting.has(message.id)) {
      waiting.get(message.id)(message);
      waiting.delete(message.id);
    }
  };

  async function send(method, params = {}) {
    const id = nextId++;
    const answer = await new Promise((resolve) => {
      waiting.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });
    if (answer.error) {
      throw new Error(`${method}: ${answer.error.message}`);
    }
    return answer.result;
  }

  async function evaluate(expression) {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(`In the page: ${details.exception?.description || details.text}`);
    }
    return result.result.value;
  }

  await send('Runtime.enable'); // needed to be told about the page's errors
  await send('Emulation.setDeviceMetricsOverride', { ...SCREEN, deviceScaleFactor: 1, mobile: true });

  return {
    send,
    evaluate,
    errors,
    close() {
      socket.close();
      browser.kill();
      runningBrowsers.delete(browser);
    },
  };
}

// Starts `count` browsers, each with the app open in Free practice, and
// returns:
//   use(task)   waits for a free page, runs task(page) and returns its result
//   errors()    the uncaught errors of all pages
//   close()
// A test calls use() and gets whichever browser is free next, so the tests
// spread themselves over the browsers.
//
// The app opens with its introduction the first time. It is skipped here,
// unless `keepWelcome` is true (for the test of the introduction itself).
export async function startBrowsers(appUrl, count = BROWSER_COUNT, { keepWelcome = false } = {}) {
  const pages = await Promise.all(Array.from({ length: count }, launchBrowser));
  await Promise.all(pages.map((page) => openFreePractice(page, appUrl, keepWelcome)));

  const free = [...pages];
  const queue = []; // tasks waiting for a page

  return {
    async use(task) {
      const page = free.pop() || (await new Promise((resolve) => queue.push(resolve)));
      try {
        return await task(page);
      } finally {
        // Hand the page straight to the next in line, if there is one.
        if (queue.length > 0) {
          queue.shift()(page);
        } else {
          free.push(page);
        }
      }
    },
    errors: () => pages.flatMap((page) => page.errors),
    close() {
      for (const page of pages) {
        page.close();
      }
    },
  };
}

// ---- Doing things in the page ----

// JavaScript text for "the page's status line", used in the snippets below.
const STATUS = `document.getElementById('status').textContent`;
// The quiz can take a stroke: see setBusy in src/quiz.js.
const NOT_BUSY = `!document.getElementById('writing-area').hasAttribute('data-busy')`;

// Waits, inside the page, until `condition` (JavaScript text) is true, looking
// every few milliseconds. Returns the status line as it is then, or after
// `limit` milliseconds if the condition never comes true.
function waitInPage(page, condition, limit) {
  return page.evaluate(`new Promise((resolve) => {
    const start = performance.now();
    (function look() {
      if ((${condition}) || performance.now() - start > ${limit}) {
        resolve(${STATUS});
      } else {
        setTimeout(look, 5);
      }
    })();
  })`);
}

// Loads the page again, as closing and reopening the app would, and waits
// until the app has started. It comes up in Review.
export async function reloadApp(page) {
  // A mark on the page as it is now, which the freshly loaded page won't have.
  await page.evaluate('window.loadedBefore = true');
  await page.send('Page.reload');
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(100);
    try {
      const started = await page.evaluate(`!window.loadedBefore && (
        document.getElementById('card-type').textContent !== '' ||
        !document.getElementById('done-panel').hidden)`);
      if (started) {
        return;
      }
    } catch {
      // The page was between two loads; try again.
    }
  }
  throw new Error('The app did not start again after reloading.');
}

// Opens the app and switches to Free practice, which starts on its default word.
async function openFreePractice(page, appUrl, keepWelcome = false) {
  await page.send('Page.navigate', { url: appUrl });
  // The first time the dev server serves the app it may make the page reload
  // itself once, so keep trying until the app has really started.
  for (let attempt = 0; attempt < 100; attempt++) {
    await sleep(200);
    try {
      const status = await page.evaluate(`(() => {
        // The app has started once Review shows a card or says nothing is due.
        // (A tab tapped before that is only opened once the app has started.)
        const started =
          document.getElementById('card-type').textContent !== '' ||
          !document.getElementById('done-panel').hidden;
        // The introduction lies over the page and would catch the strokes.
        if (started && !${keepWelcome} && document.getElementById('welcome').open) {
          document.getElementById('welcome-skip').click();
        }
        const tab = document.getElementById('practice-tab');
        if (started && !tab.classList.contains('selected')) {
          tab.click();
        }
        return tab.classList.contains('selected') && ${NOT_BUSY} ? ${STATUS} : '';
      })()`);
      if (status.startsWith('Stroke 1 of')) {
        return;
      }
    } catch {
      // The page was between two loads; try again.
    }
  }
  throw new Error(`The app did not start in the browser. Page errors: ${page.errors.join('\n') || 'none'}`);
}

// Starts a writing card in Free practice for `word`, and waits until its
// first character can be written.
export async function startWriting(page, word) {
  await page.evaluate(`(() => {
    // Emptied first, so that the new card's "Stroke 1 of ..." can be told
    // from the same words left over from the card before.
    document.getElementById('status').textContent = '';
    document.getElementById('word-input').value = ${JSON.stringify(word)};
    document.getElementById('practice-type').value = 'writing';
    document.getElementById('word-form').requestSubmit();
  })()`);
  const status = await waitInPage(page, `${STATUS}.startsWith('Stroke 1 of') && ${NOT_BUSY}`, 5000);
  if (!status.startsWith('Stroke 1 of')) {
    throw new Error(`The writing card for ${word} did not start. Status line: "${status}"`);
  }
}

export const statusText = (page) => page.evaluate(STATUS);

// Taps the element with this id.
export const tap = (page, id) => page.evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);

// Types into the text box with this id, replacing what was there.
export const type = (page, id, text) =>
  page.evaluate(`(() => {
    const box = document.getElementById(${JSON.stringify(id)});
    box.value = ${JSON.stringify(text)};
    // What a text box announces when someone types in it.
    box.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);

// The app starts with no words. This gives it the test word list
// (tests/words.tsv, 109 common words) through the Words tab's "Add a list",
// and goes back to Free practice.
export async function addTestWords(page) {
  const list = fs.readFileSync('tests/words.tsv', 'utf8');
  const count = list.split('\n').filter((line) => line.trim() !== '').length;
  await tap(page, 'words-tab');
  await type(page, 'list-text', list);
  await tap(page, 'check-list-button');
  await waitUntil(page, `!document.getElementById('add-list-button').hidden`, 'the list to be checked');
  await tap(page, 'add-list-button');
  await waitUntil(page, `document.getElementById('word-count').textContent === '${count}'`, 'the test words');
  await tap(page, 'practice-tab');
  await waitInPage(page, `${STATUS}.startsWith('Stroke 1 of') && ${NOT_BUSY}`, 5000);
}

// Picks the option with this value in the drop-down list with this id.
export const choose = (page, id, value) =>
  page.evaluate(`(() => {
    const list = document.getElementById(${JSON.stringify(id)});
    list.value = ${JSON.stringify(value)};
    // What a drop-down list announces when someone picks from it.
    list.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);

// The text of the element with this id, or of the first element matching a
// CSS selector such as '#word-list li'. '' if there is none or it is hidden.
export const textOf = (page, idOrSelector) =>
  page.evaluate(`(() => {
    const wanted = ${JSON.stringify(idOrSelector)};
    const element = document.getElementById(wanted) || document.querySelector(wanted);
    return element && !element.closest('[hidden]') ? element.textContent.trim() : '';
  })()`);

// Waits until `condition` (JavaScript text, run in the page) is true. Fails
// the test if it isn't within five seconds.
export async function waitUntil(page, condition, description = condition) {
  const cameTrue = await page.evaluate(`new Promise((resolve) => {
    const start = performance.now();
    (function look() {
      if (${condition}) resolve(true);
      else if (performance.now() - start > 5000) resolve(false);
      else setTimeout(look, 10);
    })();
  })`);
  if (!cameTrue) {
    throw new Error(`Waited in vain for: ${description}`);
  }
}

// True if the element with this id is on the page and not hidden.
export const isShown = (page, id) =>
  page.evaluate(`!document.getElementById(${JSON.stringify(id)}).hasAttribute('hidden')`);

// The writing area's place on the screen, for drawStroke. Ask for it once a
// card is showing; it stays put while a character is written.
export async function writingArea(page) {
  return page.evaluate(`(() => {
    const box = document.getElementById('writing-area').getBoundingClientRect();
    return { x: box.x, y: box.y, size: box.width };
  })()`);
}

// Draws one stroke with the mouse and waits until the app has dealt with it.
//   area:   from writingArea()
//   points: the stroke as [x, y] pairs in the stroke data's own coordinates
//           (0 to 1024 across; y runs upward, from -124 at the bottom to 900
//           at the top)
// Returns the status line afterward.
export async function drawStroke(page, area, points) {
  // The same arithmetic Hanzi Writer uses to place the character in the box
  // (the padding is set where it is created, in src/quiz.js).
  const padding = area.size * 0.06;
  const scale = (area.size - 2 * padding) / 1024;
  const onScreen = points.map(([x, y]) => ({
    x: area.x + padding + x * scale,
    y: area.y + padding + (900 - y) * scale,
  }));

  const before = await statusText(page);
  const mouse = (type, point, extra) =>
    page.send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button: 'left', ...extra });
  await mouse('mousePressed', onScreen[0], { clickCount: 1 });
  for (let i = 1; i < onScreen.length; i++) {
    // A few steps along each segment, as a moving hand would report.
    for (let step = 1; step <= 3; step++) {
      const from = onScreen[i - 1];
      const to = onScreen[i];
      const point = { x: from.x + ((to.x - from.x) * step) / 3, y: from.y + ((to.y - from.y) * step) / 3 };
      await mouse('mouseMoved', point, { buttons: 1 });
    }
  }
  await mouse('mouseReleased', onScreen[onScreen.length - 1], { clickCount: 1 });

  // Accepted or not, a stroke changes the status line (the stroke number or
  // the mistake count). If it stays the same, the stroke was ignored.
  return waitInPage(page, `${STATUS} !== ${JSON.stringify(before)} && ${NOT_BUSY}`, 1500);
}

// ---- Stroke data ----

// The stroke data the app uses for a character in Traditional mode, read from
// the same files it serves: the Taiwan set where that has the character, the
// big set otherwise (as loadCharData in src/charData.js decides).
export function loadStrokeData(char) {
  const fileName = `${char.codePointAt(0).toString(16)}.json`;
  for (const folder of ['public/char-data-tw', 'public/char-data']) {
    const file = path.join(folder, fileName);
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  }
  throw new Error(`No stroke data for ${char}. Run "node scripts/copy-char-data.js" first.`);
}
