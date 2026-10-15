// Runs the browser tests, as many at once as the computer's free memory
// allows (`npm run test:browser`; the owner, 2026-10-15, after a run filled
// a laptop's memory and brought it down).
//
// Each test file starts its own Vite server and at least one headless
// Chromium; the writing grid starts several. Together, with the server,
// a browser was measured at about 300 MB; 400 is counted to be safe. Only
// half of the memory free at the start is used, leaving room for everything
// else on the computer.
//
// Two numbers are chosen and printed:
//   files at once  how many test files Node runs side by side
//                  (--test-concurrency)
//   BROWSERS       how many browsers the writing grid shares (harness.js)
// Either can be set by hand: TEST_FILES=2 BROWSERS=3 npm run test:browser
//
// File names given after the command run only those:
//   npm run test:browser -- tests/browser/tips.browser.js

import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const MB_PER_BROWSER = 400;
const SHARE_OF_FREE_MEMORY = 0.5;

const freeMb = Math.floor(os.freemem() / 1024 / 1024);
const cores = os.availableParallelism();
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// How many browsers (each with its share of a server) fit in memory.
const browsersThatFit = Math.max(1, Math.floor((freeMb * SHARE_OF_FREE_MEMORY) / MB_PER_BROWSER));
// Half of them go to running files side by side, the rest to the grid's
// extra browsers, so that at most browsersThatFit run at once.
const filesAtOnce = Number(process.env.TEST_FILES) || clamp(Math.ceil(browsersThatFit / 2), 1, cores - 1);
const gridBrowsers = Number(process.env.BROWSERS) || clamp(browsersThatFit - filesAtOnce + 1, 1, Math.floor(cores / 2));

const folder = 'tests/browser';
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(folder).filter((name) => name.endsWith('.browser.js')).sort().map((name) => path.join(folder, name));

console.log(`${freeMb} MB free: ${filesAtOnce} files at once, ${gridBrowsers} browsers for the writing grid.`);

const run = spawn(process.execPath, ['--test', `--test-concurrency=${filesAtOnce}`, ...files], {
  stdio: 'inherit',
  env: { ...process.env, BROWSERS: String(gridBrowsers) },
});
run.on('exit', (code) => process.exit(code ?? 1));
