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
  : fs
      .readdirSync(folder)
      .filter((name) => name.endsWith('.browser.js'))
      .sort()
      .map((name) => path.join(folder, name));

console.log(`${freeMb} MB free: ${filesAtOnce} files at once, ${gridBrowsers} browsers for the writing grid.`);

// The writing grid takes longest. Node starts test files in order of their
// names, whatever order they are given in, so with the others it would
// start near the end and run alone (2026-11-05: 6 of a run's 8 minutes).
// So it runs as a process of its own beside them, taking one of the files'
// places; its report is held back and printed once everything is done, so
// the two reports don't mix.
const env = { ...process.env, BROWSERS: String(gridBrowsers) };
const isGrid = (file) => path.basename(file) === 'writing-grid.browser.js';
const grid = files.filter(isGrid);
const others = files.filter((file) => !isGrid(file));

// Runs Node's test runner on `list`; resolves with its exit code and, when
// `hold` is set, its report.
function runTests(list, concurrency, hold) {
  return new Promise((resolve) => {
    const run = spawn(process.execPath, ['--test', `--test-concurrency=${concurrency}`, ...list], {
      stdio: hold ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env,
    });
    let report = '';
    if (hold) {
      run.stdout.on('data', (chunk) => (report += chunk));
      run.stderr.on('data', (chunk) => (report += chunk));
    }
    run.on('exit', (code) => resolve({ code: code ?? 1, report }));
  });
}

const runs = [];
if (grid.length > 0 && others.length > 0) {
  runs.push(runTests(grid, 1, true));
  runs.push(runTests(others, Math.max(1, filesAtOnce - 1), false));
} else {
  runs.push(runTests(files, filesAtOnce, false));
}
const results = await Promise.all(runs);
for (const { report } of results) {
  process.stdout.write(report);
}
process.exit(Math.max(...results.map(({ code }) => code)));
