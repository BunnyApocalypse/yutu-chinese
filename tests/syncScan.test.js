// Tests for src/syncScan.js: the sync code in what a QR code says. (The
// camera and jsQR are tried in tests/browser/syncSettings.browser.js.)
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { codeIn, serverIn } from '../src/syncScan.js';

test('the code is taken from the link, or is the whole text', () => {
  const code = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789';
  assert.equal(codeIn(`https://bunnyapocalypse.github.io/yutu-chinese/#sync=${code}`), code);
  assert.equal(codeIn(`http://localhost:5173/?link#sync=${encodeURIComponent(code)}`), code);
  assert.equal(codeIn(` ${code}\n`), code);
  assert.equal(codeIn('https://example.com/'), 'https://example.com/');
});

test('a link may carry the sync server after the code, for someone running their own', () => {
  const code = 'ABCD-EFGH-JKMN-PQRS-TVWX-YZ01-2345-6789';
  const link = `https://bunnyapocalypse.github.io/yutu-chinese/#sync=${code}&server=${encodeURIComponent('https://sync.example.org')}`;
  assert.equal(codeIn(link), code);
  assert.equal(serverIn(link), 'https://sync.example.org');
  assert.equal(serverIn(`https://bunnyapocalypse.github.io/yutu-chinese/#sync=${code}`), null);
  assert.equal(serverIn(code), null);
  // Not a server's address: left out.
  assert.equal(serverIn(`#sync=${code}&server=${encodeURIComponent('http://sync.example.org')}`), null);
  assert.equal(serverIn(`#sync=${code}&server=nonsense`), null);
});
