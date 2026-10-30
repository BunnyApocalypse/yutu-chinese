// Settings for trying the app out (the owner, 2026-10-20): the group "For
// testing" in Settings. It is shown in the test copy (built with a channel,
// see vite.config.js) and while developing (`npm run dev`). In the stable
// copy it is hidden, and these switches stay off, until the version line at
// the bottom of Settings › Help is tapped five times in a row, as Android
// shows its developer options (the owner, 2026-10-30, to record raw input on
// the tablet they study on). That is remembered for the device
// (`testerSettingsShown`), and "Hide these settings" undoes it.
//
// Each switch belongs to the device (DEVICE_SETTINGS in merge.js).
//
//   swipeReadout: show how each swipe up measured (quiz.js, gestures.js)
//   recordRawInput: record every stroke written, with how it was judged, to
//     save as a file for tuning the grading (rawInputLog.js)
//   the test language: every text in look-alike letters (src/text.js; kept
//     in localStorage, not as a setting)
//
// And one readout, not a switch: what the browser says about keeping the
// words (the owner, 2026-10-20, after tester 3's Brave kept asking to install
// an app already installed). Compared in the installed app and in a tab, it
// tells whether the browser ever agrees, and whether the two share the words.

/* global __CHANNEL__ */
import { getAll, getSetting, setSetting } from './db.js';
import { keepData } from './offline.js';
import { setSwipeReadout } from './quiz.js';
import { setRecording, recordedCount, downloadRecording, clearRecording } from './rawInputLog.js';
import { ask } from './confirm.js';
import { wordsAtRisk } from './storageAdvice.js';
import { t, language, setLanguage } from './text.js';

// import.meta.env.DEV is true only under Vite's dev server.
export const TESTER_SETTINGS_SHOWN = Boolean(__CHANNEL__) || import.meta.env.DEV;

// Five taps on the version line, each within a second of the one before.
const TAPS_TO_SHOW = 5;
const TAP_GAP_MS = 1000;

export async function setUpTesterSettings() {
  if (TESTER_SETTINGS_SHOWN || (await getSetting('testerSettingsShown', false))) {
    await showTesterSettings();
  } else {
    listenForTaps();
  }
}

function listenForTaps() {
  const version = document.getElementById('app-version');
  let taps = 0;
  let lastTap = 0;
  const onTap = async () => {
    const now = Date.now();
    taps = now - lastTap <= TAP_GAP_MS ? taps + 1 : 1;
    lastTap = now;
    if (taps < TAPS_TO_SHOW) {
      return;
    }
    version.removeEventListener('click', onTap);
    await setSetting('testerSettingsShown', true);
    version.append(document.createElement('br'), t('testing.shownNow'));
    await showTesterSettings();
  };
  version.addEventListener('click', onTap);
}

async function showTesterSettings() {
  const navButton = document.querySelector('#settings-nav [data-group="settings-testing"]');
  navButton.hidden = false;

  const swipeCheckbox = document.getElementById('swipe-readout-checkbox');
  swipeCheckbox.checked = await getSetting('swipeReadout', false);
  setSwipeReadout(swipeCheckbox.checked);
  swipeCheckbox.addEventListener('change', async () => {
    setSwipeReadout(swipeCheckbox.checked);
    await setSetting('swipeReadout', swipeCheckbox.checked);
  });

  // Recording raw input (rawInputLog.js), with how many characters are
  // recorded, shown again whenever the group is opened.
  const recordCheckbox = document.getElementById('record-raw-input-checkbox');
  recordCheckbox.checked = await getSetting('recordRawInput', false);
  setRecording(recordCheckbox.checked);
  const showCount = () => {
    document.getElementById('raw-input-count').textContent = t('testing.rawInputCount', { count: recordedCount() });
  };
  recordCheckbox.addEventListener('change', async () => {
    setRecording(recordCheckbox.checked);
    await setSetting('recordRawInput', recordCheckbox.checked);
  });
  document.getElementById('raw-input-save').addEventListener('click', () => downloadRecording());
  document.getElementById('raw-input-clear').addEventListener('click', async () => {
    if (await ask({ question: t('testing.clearRawInputQuestion'), yes: t('testing.clearRawInput') })) {
      clearRecording();
      showCount();
    }
  });
  navButton.addEventListener('click', showCount);
  showCount();

  // The test language (src/text.js): kept with the browser rather than in
  // the database, and the app starts again in it.
  const pseudoCheckbox = document.getElementById('pseudo-language-checkbox');
  pseudoCheckbox.checked = language === 'pseudo';
  pseudoCheckbox.addEventListener('change', () => setLanguage(pseudoCheckbox.checked ? 'pseudo' : null));

  document.getElementById('storage-readout-refresh').addEventListener('click', () => showStorageReadout());
  document.getElementById('storage-readout-ask').addEventListener('click', async () => {
    const kept = await keepData.ask();
    await showStorageReadout(t('testing.askedJustNow', { answer: yesNo(kept) }));
  });
  // Filled again whenever the group is opened, and when anything about
  // keeping or installing may have changed (offline.js).
  navButton.addEventListener('click', () => showStorageReadout());
  keepData.listen(() => showStorageReadout());
  await showStorageReadout();

  // Shown by the five taps (not in the test copy, where the group is always
  // there): hiding it switches everything in it off, and the app starts again.
  document.getElementById('tester-settings-hide-row').hidden = TESTER_SETTINGS_SHOWN;
  document.getElementById('tester-settings-hide').addEventListener('click', async () => {
    await setSetting('swipeReadout', false);
    await setSetting('recordRawInput', false);
    await setSetting('testerSettingsShown', false);
    if (language === 'pseudo') {
      setLanguage(null); // starts the app again by itself
    } else {
      location.reload();
    }
  });
}

// Which browser this is, with Brave named apart: it names itself as Chrome
// in navigator.userAgent, but has navigator.brave, and "Brave" among
// navigator.userAgentData.brands (the names a Chromium browser gives itself).
function browserName(brands) {
  if (navigator.brave || brands.some((entry) => entry.brand === 'Brave')) {
    return 'Brave';
  }
  return {
    chromium: t('testing.chromium'),
    firefox: 'Firefox',
    safari: 'Safari',
    other: t('testing.notRecognized'),
  }[keepData.kind];
}

// How the app was opened. Android's WebView (a browser built into another
// app, which then holds words of its own) says "; wv)" in its userAgent. A
// link opened from Discord or similar may instead open in the browser's own
// "custom tab", which from inside the page looks like an ordinary tab.
function openedAs(installed) {
  if (installed) {
    return t('testing.installed');
  }
  if (/; wv\)/.test(navigator.userAgent)) {
    return t('testing.webView');
  }
  return t('testing.tab');
}

const yesNo = (answer) => t(answer ? 'testing.yes' : 'testing.no');

// first: a line to put at the top, or ''.
async function showStorageReadout(first = '') {
  const brands = navigator.userAgentData ? navigator.userAgentData.brands : [];
  const state = await keepData.state();
  const words = (await getAll('words')).length;
  const atRisk = wordsAtRisk(keepData.kind, state, await getSetting('lastBackupAt', null), Date.now());
  const lines = [
    first,
    t('testing.browser', { name: browserName(brands) }),
    t('testing.openedAs', { how: openedAs(state.installed) }),
    t('testing.keeps', { kept: yesNo(state.kept), asked: yesNo(state.asked) }),
    t('testing.words', { count: words }),
    t('testing.reminder', { shown: t(atRisk ? 'testing.reminderShown' : 'testing.reminderNotShown') }),
    t('testing.brands', { names: brands.map((entry) => `${entry.brand} ${entry.version}`).join(', ') || navigator.userAgent }),
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
