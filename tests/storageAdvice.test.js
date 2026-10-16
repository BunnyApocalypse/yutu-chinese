// Tests for the advice on long-term storage (src/storageAdvice.js): telling
// the browsers apart, and saying the right thing for each.

import test from 'node:test';
import assert from 'node:assert/strict';

import { browserKind, storageAdvice, welcomeStorage } from '../src/storageAdvice.js';

const AGENTS = {
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  chromeDesktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  firefoxDesktop: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  safariPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  chromePhoneApple: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
  firefoxPhoneApple: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/131.0 Mobile/15E148 Safari/605.1.15',
};

test('browsers are told apart by family', () => {
  for (const name of ['chromeAndroid', 'chromeDesktop', 'edge', 'samsung']) {
    assert.equal(browserKind(AGENTS[name]), 'chromium', name);
  }
  assert.equal(browserKind(AGENTS.firefoxDesktop), 'firefox');
  assert.equal(browserKind(AGENTS.firefoxAndroid), 'firefox');
  assert.equal(browserKind(AGENTS.safariMac), 'safari');
  // On an iPhone every browser is Safari underneath.
  for (const name of ['safariPhone', 'chromePhoneApple', 'firefoxPhoneApple']) {
    assert.equal(browserKind(AGENTS[name]), 'safari', name);
  }
  assert.equal(browserKind('SomethingElse/1.0'), 'other');
  // Where the browser lists its brands, those count.
  assert.equal(browserKind('SomethingElse/1.0', [{ brand: 'Chromium', version: '130' }]), 'chromium');
});

const state = (changes = {}) => ({ canAsk: true, kept: false, asked: false, installed: false, canInstall: false, ...changes });

test('once storage is allowed, every browser gets the same good news', () => {
  for (const kind of ['firefox', 'chromium', 'safari', 'other']) {
    assert.match(storageAdvice(kind, state({ kept: true, asked: true })), /is allowed/);
  }
});

test('Firefox: expect a question, and how to undo a refusal', () => {
  assert.match(storageAdvice('firefox', state()), /will show a question.*Choose "Allow"/);
  const refused = storageAdvice('firefox', state({ asked: true }));
  assert.match(refused, /address bar/);
  assert.match(refused, /Export backup/);
});

test('Chromium: no question; install first, by button if there is one', () => {
  const before = storageAdvice('chromium', state());
  assert.match(before, /will not ask you anything/);
  assert.match(before, /install the app first \(open the browser's menu/);
  assert.match(storageAdvice('chromium', state({ canInstall: true })), /tap "Install the app" below/);
  const refused = storageAdvice('chromium', state({ asked: true }));
  assert.match(refused, /said no.*Install the app.*ask again by itself/);
  assert.match(refused, /Export backup/);
  // Installed already: nothing to install, it is a matter of time.
  assert.doesNotMatch(storageAdvice('chromium', state({ installed: true })), /install the app first/);
  assert.match(storageAdvice('chromium', state({ installed: true, asked: true })), /asks again each time it starts/);
});

test('Safari: the Home Screen is what keeps the data', () => {
  assert.match(storageAdvice('safari', state()), /after about a week.*Add to Home Screen/);
  assert.match(storageAdvice('safari', state({ installed: true })), /is kept/);
});

test('a browser that cannot be asked is told to keep backups', () => {
  for (const kind of ['firefox', 'chromium', 'safari', 'other']) {
    assert.match(storageAdvice(kind, state({ canAsk: false })), /no way to ask.*Export backup/);
  }
});

test('the introduction: one button that does what the browser needs', () => {
  // Chromium keeps only an installed app's data: install, by its own question if it offers one.
  assert.deepEqual(welcomeStorage('chromium', state({ canInstall: true })), {
    action: 'install',
    line: 'This browser keeps the words of an installed app.',
  });
  const noOffer = welcomeStorage('chromium', state());
  assert.equal(noOffer.action, 'ask');
  assert.match(noOffer.line, /only keeps the words of an installed app: open the browser's menu/);
  assert.deepEqual(welcomeStorage('chromium', state({ installed: true, canInstall: true })), { action: 'ask', line: '' });
  // Firefox asks the person; on a phone, installing is mentioned as a convenience.
  assert.equal(welcomeStorage('firefox', state()).line, 'Firefox will ask at the top of the page: choose "Allow".');
  assert.equal(
    welcomeStorage('firefox', state(), true).line,
    'Firefox will ask at the bottom of the screen: choose "Allow". For an icon of your own, choose Install in the browser\'s menu (⋮).',
  );
  // Safari on an iPhone or iPad keeps only a Home Screen app's data; on a Mac nothing to add.
  assert.match(welcomeStorage('safari', state(), true).line, /only keeps them for an app on the Home Screen/);
  assert.deepEqual(welcomeStorage('safari', state()), { action: 'ask', line: '' });
  assert.deepEqual(welcomeStorage('safari', state({ installed: true }), true), { action: 'ask', line: '' });
  // Nothing to ask.
  for (const kind of ['firefox', 'chromium', 'safari', 'other']) {
    assert.equal(welcomeStorage(kind, state({ kept: true })).action, 'none');
    assert.match(welcomeStorage(kind, state({ canAsk: false })).line, /Export backup/);
  }
});
