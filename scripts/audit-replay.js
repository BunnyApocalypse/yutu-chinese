// Stroke-order audit, step 3: write the standard's order in the real app.
//
// Reads local/audit/orders-to-replay.json (from scripts/audit-order-triage.js) and writes each
// character in Free practice, in real headless Chromium, the way the writing grid does
// (tests/browser/writing-grid.browser.js): once in OUR order (a control: if that is refused,
// the character cannot be written at that position at all, whatever the order) and once in
// the standard's, at two positions. Prints what the app did and writes
// local/audit/replay-results.tsv.
//
//   node scripts/audit-replay.js
//
// Don't change files while it runs: the dev server reloads the pages and the writing fails
// (tests/browser/CLAUDE.md). Needs Chromium, as the browser tests do.

import fs from 'node:fs';
import {
  BROWSER_COUNT,
  startApp,
  startBrowsers,
  startWriting,
  writingArea,
  drawStroke,
  loadStrokeData,
} from '../tests/browser/harness.js';

const POSITIONS = {
  centered: { scale: 1, dx: 0, dy: 0 },
  'small, top left': { scale: 0.6, dx: -20, dy: 330 },
};
const JITTER = 8; // as in the writing grid: points shaken off their line, in the data's units

// The same stand-in for Math.random() as the grid's: the same numbers on every run.
function makeRandom(name) {
  let state = 0;
  for (const letter of name) state = (state * 31 + letter.codePointAt(0)) % 4294967296;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Writes one character in the order given (stroke numbers). Returns the status line at the
// end ("No mistakes" if all went well) and how many strokes were drawn.
async function writeChar(page, char, strokeOrder, position, random) {
  const data = loadStrokeData(char);
  await startWriting(page, char);
  const area = await writingArea(page);
  let status = '';
  let strokesDrawn = 0;
  for (const strokeNum of strokeOrder) {
    // A character begun too big is zoomed out by the app; the hand goes on at the new size.
    const zoom = await page.evaluate(`document.getElementById('writing-area').getAttribute('data-zoom')`);
    const [zoomScale, zoomX, zoomY] = zoom ? zoom.split(' ').map(Number) : [1, 0, 0];
    const points = data.medians[strokeNum].map(([x, y]) => [
      zoomScale * (position.scale * x + position.dx) + zoomX + (random() * 2 - 1) * JITTER,
      zoomScale * (position.scale * y + position.dy) + zoomY + (random() * 2 - 1) * JITTER,
    ]);
    status = await drawStroke(page, area, points);
    strokesDrawn += 1;
    if (!/no mistakes$/i.test(status)) break;
  }
  return { status, strokesDrawn };
}

const items = JSON.parse(fs.readFileSync('local/audit/orders-to-replay.json', 'utf8'));
const app = await startApp();
const browsers = await startBrowsers(app.url);
console.log(`${items.length} characters, ${BROWSER_COUNT} browsers`);

const jobs = [];
for (const { char, order, kanjivg } of items) {
  const ours = loadStrokeData(char).medians.map((median, index) => index);
  for (const [positionName, position] of Object.entries(POSITIONS)) {
    for (const [which, strokeOrder] of [['ours', ours], ['standard', order]]) {
      jobs.push(
        browsers
          .use((page) => writeChar(page, char, strokeOrder, position, makeRandom(`${char} ${which} ${positionName}`)))
          .then((result) => ({ char, positionName, which, total: strokeOrder.length, kanjivg, ...result })),
      );
    }
  }
}
const results = await Promise.all(jobs);

const lines = ['char\tposition\torder\tresult\tstrokes\tstatus'];
for (const r of results) {
  const passed = r.status === 'No mistakes';
  lines.push([r.char, r.positionName, r.which, passed ? 'accepted' : 'refused', `${r.strokesDrawn}/${r.total}`, r.status].join('\t'));
}
fs.writeFileSync('local/audit/replay-results.tsv', lines.join('\n') + '\n');

// A summary per character: did the standard's order pass, where ours also did?
console.log('\nchar  ours (centered, small)   standard (centered, small)   KanjiVG');
for (const { char, kanjivg } of items) {
  const of = (which) =>
    Object.keys(POSITIONS)
      .map((positionName) => {
        const r = results.find((x) => x.char === char && x.which === which && x.positionName === positionName);
        return r.status === 'No mistakes' ? 'ok' : `refused at ${r.strokesDrawn}/${r.total}`;
      })
      .join(', ');
  console.log(`${char}     ${of('ours').padEnd(26)}${of('standard').padEnd(40)}${kanjivg}`);
}

const errors = browsers.errors();
console.log(errors.length > 0 ? `Page errors:\n${errors.join('\n')}` : 'No page errors.');
browsers.close();
await app.close();
process.exit(0);
