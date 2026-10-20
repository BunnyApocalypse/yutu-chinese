// Settings for trying the app out (the owner, 2026-10-20): the group "For
// testing" in Settings. It is shown only in the test copy (built with a
// channel, see vite.config.js) and while developing (`npm run dev`), never in
// the stable copy, where these switches stay off.
//
// Each switch belongs to the device (DEVICE_SETTINGS in merge.js).
//
//   swipeReadout: show how each swipe up measured (quiz.js, gestures.js)
//
// And one readout, not a switch: what the browser says about keeping the
// words (the owner, 2026-10-20, after tester 3's Brave kept asking to install
// an app already installed). Compared in the installed app and in a tab, it
// tells whether the browser ever agrees, and whether the two share the words.

/* global __CHANNEL__ */
import { getAll, getSetting, setSetting } from './db.js';
import { keepData } from './offline.js';
import { setSwipeReadout } from './quiz.js';
import { wordsAtRisk } from './storageAdvice.js';

// import.meta.env.DEV is true only under Vite's dev server.
export const TESTER_SETTINGS_SHOWN = Boolean(__CHANNEL__) || import.meta.env.DEV;

export async function setUpTesterSettings() {
  if (!TESTER_SETTINGS_SHOWN) {
    return;
  }
  const navButton = document.querySelector('#settings-nav [data-group="settings-testing"]');
  navButton.hidden = false;

  const swipeCheckbox = document.getElementById('swipe-readout-checkbox');
  swipeCheckbox.checked = await getSetting('swipeReadout', false);
  setSwipeReadout(swipeCheckbox.checked);
  swipeCheckbox.addEventListener('change', async () => {
    setSwipeReadout(swipeCheckbox.checked);
    await setSetting('swipeReadout', swipeCheckbox.checked);
  });

  document.getElementById('storage-readout-refresh').addEventListener('click', () => showStorageReadout());
  document.getElementById('storage-readout-ask').addEventListener('click', async () => {
    const kept = await keepData.ask();
    await showStorageReadout(`Asked just now: the browser said ${kept ? 'yes' : 'no'}.`);
  });
  // Filled again whenever the group is opened, and when anything about
  // keeping or installing may have changed (offline.js).
  navButton.addEventListener('click', () => showStorageReadout());
  keepData.listen(() => showStorageReadout());
  await showStorageReadout();
}

// Which browser this is, with Brave named apart: it names itself as Chrome
// in navigator.userAgent, but has navigator.brave, and "Brave" among
// navigator.userAgentData.brands (the names a Chromium browser gives itself).
function browserName(brands) {
  if (navigator.brave || brands.some((entry) => entry.brand === 'Brave')) {
    return 'Brave';
  }
  return {
    chromium: 'Chrome, or another browser built on Chromium',
    firefox: 'Firefox',
    safari: 'Safari',
    other: 'not recognized',
  }[keepData.kind];
}

// How the app was opened. Android's WebView (a browser built into another
// app, which then holds words of its own) says "; wv)" in its userAgent. A
// link opened from Discord or similar may instead open in the browser's own
// "custom tab", which from inside the page looks like an ordinary tab.
function openedAs(installed) {
  if (installed) {
    return 'the installed app';
  }
  if (/; wv\)/.test(navigator.userAgent)) {
    return "a browser built into another app (such as Discord), with words apart from the browser's";
  }
  return 'a page in the browser (a tab, or a link opened from another app such as Discord)';
}

// first: a line to put at the top, or ''.
async function showStorageReadout(first = '') {
  const brands = navigator.userAgentData ? navigator.userAgentData.brands : [];
  const state = await keepData.state();
  const words = (await getAll('words')).length;
  const atRisk = wordsAtRisk(keepData.kind, state, await getSetting('lastBackupAt', null), Date.now());
  const lines = [
    first,
    `Browser: ${browserName(brands)}.`,
    `Opened as: ${openedAs(state.installed)}.`,
    `Keeps the words for good: ${state.kept ? 'yes' : 'no'} (asked before on this device: ${state.asked ? 'yes' : 'no'}).`,
    `Words here: ${words}.`,
    `The reminder in Review and Learn: ${atRisk ? 'shown' : 'not shown'}.`,
    `The browser's names: ${brands.map((entry) => `${entry.brand} ${entry.version}`).join(', ') || navigator.userAgent}.`,
  ].filter(Boolean);
  const readout = document.getElementById('storage-readout');
  readout.replaceChildren();
  lines.forEach((line, index) => {
    if (index > 0) {
      readout.append(document.createElement('br'));
    }
    readout.append(line);
  });
}
