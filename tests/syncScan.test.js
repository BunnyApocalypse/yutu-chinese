// Tests for src/syncScan.js: the sync code in what a QR code says. (The
// camera and jsQR are tried in tests/browser/syncSettings.browser.js.)
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { codeIn } from '../src/syncScan.js';

test('the code is taken from the link, or is the whole text', () => {
  const code = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789';
  assert.equal(codeIn(`https://bunnyapocalypse.github.io/yutu-chinese/#sync=${code}`), code);
  assert.equal(codeIn(`http://localhost:5173/?link#sync=${encodeURIComponent(code)}`), code);
  assert.equal(codeIn(` ${code}\n`), code);
  assert.equal(codeIn('https://example.com/'), 'https://example.com/');
});
