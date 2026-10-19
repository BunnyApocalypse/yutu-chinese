// Tests for the advice on long-term storage (src/storageAdvice.js): telling
// the browsers apart, and saying the right thing for each.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  browserKind,
  isMobile,
  storageAdvice,
  storageMessageLine,
  welcomeStorage,
  wordsAtRisk,
  RECENT_BACKUP_MS,
} from '../src/storageAdvice.js';

const DAY = 24 * 60 * 60 * 1000;

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

test('phones and tablets are told from computers, an iPad by its touch screen', () => {
  for (const name of ['chromeAndroid', 'samsung', 'safariPhone', 'chromePhoneApple', 'firefoxAndroid']) {
    assert.equal(isMobile(AGENTS[name]), true, name);
  }
  for (const name of ['chromeDesktop', 'edge', 'firefoxDesktop', 'safariMac']) {
    assert.equal(isMobile(AGENTS[name], 0), false, name);
  }
  // An iPad's Safari names itself as a Mac; Macs have no touch screen.
  assert.equal(isMobile(AGENTS.safariMac, 5), true);
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

test('Safari: the Home Screen or the Dock is what keeps the data, and words are brought over', () => {
  const phone = storageAdvice('safari', state(), true);
  assert.match(phone, /after about a week.*Add to Home Screen/);
  assert.match(phone, /don't come along.*Export backup here, then Import backup in the app/);
  // On a Mac too, with the Dock.
  const mac = storageAdvice('safari', state(), false);
  assert.match(mac, /after about a week.*Add to Dock/);
  assert.match(mac, /don't come along/);
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
  // Without it no button can install: the screen just starts, and says how.
  const noOffer = welcomeStorage('chromium', state());
  assert.equal(noOffer.action, 'later');
  assert.match(noOffer.line, /only keeps the words of an installed app: open the browser's menu/);
  assert.deepEqual(welcomeStorage('chromium', state({ installed: true, canInstall: true })), { action: 'ask', line: '' });
  // Firefox asks the person; on a phone, installing is mentioned as a convenience.
  assert.equal(welcomeStorage('firefox', state()).line, 'Firefox will ask at the top of the page: choose "Allow".');
  assert.equal(
    welcomeStorage('firefox', state(), true).line,
    'Firefox will ask at the bottom of the screen: choose "Allow". For an icon of your own, choose Install in the browser\'s menu (⋮).',
  );
  // Safari keeps only the data of an app on the Home Screen, or on a Mac in
  // the Dock: the screen shows the steps, with no button for them, since
  // only the person can do it.
  assert.deepEqual(welcomeStorage('safari', state(), true), { action: 'none', line: '', addTo: 'homeScreen' });
  assert.deepEqual(welcomeStorage('safari', state()), { action: 'none', line: '', addTo: 'dock' });
  assert.deepEqual(welcomeStorage('safari', state({ installed: true }), true), { action: 'ask', line: '' });
  // Nothing to ask.
  for (const kind of ['firefox', 'chromium', 'safari', 'other']) {
    assert.equal(welcomeStorage(kind, state({ kept: true })).action, 'none');
    assert.match(welcomeStorage(kind, state({ canAsk: false })).line, /Export backup/);
  }
});

test('the words are at risk until the browser keeps them, in Safari until the app is on the Home Screen', () => {
  const now = 100 * DAY;
  const notKept = { canAsk: true, kept: false, installed: false };
  for (const kind of ['chromium', 'firefox', 'other']) {
    assert.equal(wordsAtRisk(kind, notKept, null, now), true, kind);
    assert.equal(wordsAtRisk(kind, { ...notKept, kept: true }, null, now), false, kind);
    // A backup doesn't make it go away where the browser can be asked.
    assert.equal(wordsAtRisk(kind, notKept, now - DAY, now), true, kind);
  }
  // Safari deletes after a week whatever it has promised, unless it's the app.
  assert.equal(wordsAtRisk('safari', { ...notKept, kept: true }, now - DAY, now), true);
  assert.equal(wordsAtRisk('safari', { ...notKept, installed: true }, null, now), false);
  // A browser that can't be asked: safe for a week after a backup.
  const cannotAsk = { ...notKept, canAsk: false };
  assert.equal(wordsAtRisk('other', cannotAsk, null, now), true);
  assert.equal(wordsAtRisk('other', cannotAsk, now - 6 * DAY, now), false);
  assert.equal(wordsAtRisk('other', cannotAsk, now - RECENT_BACKUP_MS - 1, now), true);
});

test('the message while the words are at risk: one line and one action for each browser', () => {
  const notKept = { canAsk: true, kept: false, installed: false, canInstall: false };
  assert.deepEqual(storageMessageLine('chromium', { ...notKept, kept: true }), { action: 'none', line: '' });
  // Chrome with its own install question: the button installs.
  const chrome = storageMessageLine('chromium', { ...notKept, canInstall: true });
  assert.equal(chrome.action, 'install');
  assert.equal(chrome.line, "Install 玉兔中文 as an app so your browser doesn't delete them.");
  // Without it, "Keep my words safe" opens Settings, to install or save a backup.
  assert.deepEqual(storageMessageLine('chromium', notKept), {
    action: 'settings',
    line: "Install 玉兔中文 as an app or save a backup, so your browser doesn't delete them.",
  });
  assert.equal(storageMessageLine('chromium', { ...notKept, installed: true }).action, 'ask');
  assert.equal(storageMessageLine('firefox', notKept).line, "When Firefox asks, choose Allow so it doesn't delete them.");
  // An iPhone: the Home Screen, and the words brought over in a backup,
  // whose button is the one to tap; kept or not, Safari still deletes.
  for (const kept of [false, true]) {
    const phone = storageMessageLine('safari', { ...notKept, kept }, true);
    assert.equal(phone.action, 'export');
    assert.match(phone.line, /after a week.*Home Screen.*export a backup here and import it there/);
  }
  // A Mac: the same, with the Dock.
  const mac = storageMessageLine('safari', notKept, false);
  assert.equal(mac.action, 'export');
  assert.match(mac.line, /Dock.*export a backup/);
  // No way to ask: backups.
  const none = storageMessageLine('other', { ...notKept, canAsk: false });
  assert.equal(none.action, 'export');
  assert.match(none.line, /backup every week/);
});
