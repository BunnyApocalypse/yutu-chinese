// The moving page (move.html): shown at the app's old address,
// https://bunnyapocalypse.github.io/yutu-chinese/, once the app is at
// https://yutuchinese.com/app/ (docs/offline.md, "The move to
// yutuchinese.com").
//
// A browser keeps each site's data apart, so the learner's words stay here
// until handed over. This page reads them (with the app's own db.js, which
// also brings an old database up to date) and offers:
//
//   - the usual way: "Move my words" opens the app at its new address in a
//     window and hands everything over with postMessage (moveIn.js has the
//     other half and the steps);
//   - on an iPhone's or iPad's Home Screen, where a window opens in Safari,
//     which keeps its words apart: the sync code if this device syncs, else
//     a backup file;
//   - always: a backup file.
//
// Nothing here is deleted: the words stay at this address too.
//
// Someone with no words here (never used the app, or a bookmark) is sent to
// the new address at once.

import { buildBackup, backupFile } from './backup.js';
import { countAll, getSyncValue, readSyncState } from './db.js';
import { formatCode } from './syncCode.js';
import { applyText, t, formatNumber, formatDateTime, savedLanguage } from './text.js';

// Where the app is now: put in by Vite (vite.move.config.js).
/* global __MOVE_TO__, __CHANNEL__ */
const MOVE_TO = __MOVE_TO__;
const MOVE_ORIGIN = new URL(MOVE_TO).origin;

// When the words were last handed over from here, kept in this browser so a
// second visit says so. Named apart for the test copy (CLAUDE.md).
const MOVED_KEY = __CHANNEL__ ? `moved-at-${__CHANNEL__}` : 'moved-at';

// How long to wait for the new window to answer, in milliseconds.
const WAIT = 60_000;

const byId = (id) => document.getElementById(id);

function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // localStorage can be refused (a private window): only the note is lost.
  }
}

function recall(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

// An app opened from an iPhone's or iPad's Home Screen.
const onHomeScreen = () => navigator.standalone === true;

// An installed app (Android, a computer): the move is made from the browser
// instead (start, below).
const installed = () => window.matchMedia('(display-mode: standalone)').matches;

// The sync link to the new address, as the app makes it (syncLink in
// syncCodeView.js): with the server if one was chosen in Settings.
function syncLinkThere(code, server) {
  return `${MOVE_TO}#sync=${formatCode(code)}${server ? `&server=${encodeURIComponent(server)}` : ''}`;
}

// Saves the backup to the device, as Export backup in the app does.
function download(file) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file);
  const now = new Date();
  const twoDigits = (number) => String(number).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}` +
    `-${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}`;
  link.download = `yutu-chinese-backup-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// The usual way: the app opened at the new address, everything handed to it.
function moveByWindow() {
  const status = byId('move-status');
  const button = byId('move-button');
  // Opened at once, in the tap itself: a window opened later is blocked.
  // Not "noopener": the new window needs this one to answer to.
  const there = window.open(`${MOVE_TO}#move-in`, '_blank');
  if (!there) {
    status.textContent = t('move.blocked');
    return;
  }
  button.disabled = true;
  status.textContent = t('move.opening');
  let finished = false;
  const finish = (text) => {
    finished = true;
    window.removeEventListener('message', hear);
    status.textContent = text;
    button.disabled = false;
  };
  // Given up on after WAIT without a word from the new window; each word
  // from it (its progress while saving) starts the wait again, so a big
  // history taking minutes to save is not given up on.
  let timer = null;
  const waitAgain = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!finished) {
        finish(t('move.noAnswer'));
      }
    }, WAIT);
  };
  waitAgain();
  async function hear(event) {
    // Only the window opened just now, at the new address.
    if (event.origin !== MOVE_ORIGIN || event.source !== there) {
      return;
    }
    const { type } = event.data ?? {};
    waitAgain();
    if (type === 'yutu-move-progress') {
      status.textContent = t('move.savingThere', {
        saved: formatNumber(event.data.saved),
        total: formatNumber(event.data.total),
      });
    } else if (type === 'yutu-move-ready') {
      status.textContent = t('move.sending');
      const backup = await buildBackup();
      const { sync, outbox } = await readSyncState();
      there.postMessage({ type: 'yutu-move-data', backup, sync, outbox, language: savedLanguage() }, MOVE_ORIGIN);
    } else if (type === 'yutu-move-done') {
      clearTimeout(timer);
      remember(MOVED_KEY, String(Date.now()));
      finish(t('move.done', { count: event.data.words, words: formatNumber(event.data.words) }));
      byId('move-open').hidden = false;
    } else if (type === 'yutu-move-failed') {
      clearTimeout(timer);
      finish(t('move.failed'));
    }
  }
  window.addEventListener('message', hear);
}

// The steps on a Home Screen: the sync code, or a backup file.
async function showHomeScreenSteps() {
  const code = await getSyncValue('code', null);
  const steps = code
    ? [
        t('move.homeScreenAdd', { address: MOVE_TO }),
        t('move.homeScreenJoin', { code: formatCode(code) }),
        t('move.homeScreenRemoveOld'),
      ]
    : [t('move.homeScreenBackup'), t('move.homeScreenAdd', { address: MOVE_TO }), t('move.homeScreenImport'), t('move.homeScreenRemoveOld')];
  const list = byId('move-home-screen-steps');
  for (const text of steps) {
    const item = document.createElement('li');
    // The app's own text, which marks Chinese with lang; what is filled in
    // (the code, the address) holds no markup.
    item.innerHTML = text;
    list.append(item);
  }
  if (code) {
    // The link opens Safari, not the Home Screen app, but shows the code
    // there too, ready to copy.
    const link = document.createElement('a');
    link.href = syncLinkThere(code, await getSyncValue('server', null));
    link.textContent = t('move.homeScreenLink');
    list.after(link);
  }
  byId('move-home-screen').hidden = false;
}

async function start() {
  applyText();
  byId('move-open').href = MOVE_TO;
  const words = await countAll('words');
  const reviews = await countAll('reviews');
  if (words === 0 && reviews === 0) {
    window.location.replace(MOVE_TO);
    return;
  }
  byId('move-contents').textContent = t('move.contents', {
    words: t('backup.words', { count: words }),
    reviews: t('backup.reviews', { count: reviews }),
  });
  const movedAt = Number(recall(MOVED_KEY));
  if (movedAt) {
    byId('move-already').textContent = t('move.already', { when: formatDateTime(movedAt) });
    byId('move-already').hidden = false;
  }
  if (onHomeScreen()) {
    await showHomeScreenSteps();
  } else if (installed()) {
    // A window opened from an installed app (Firefox's or Chrome's on
    // Android) opens in the browser without a way back to this page, so
    // "Move my words" can't work here; the browser has the same words.
    const address = window.location.origin + window.location.pathname;
    byId('move-installed-address').textContent = address;
    byId('move-copy-button').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(address);
        byId('move-copy-status').textContent = t('move.copied');
      } catch {
        byId('move-copy-status').textContent = t('move.copyFailed');
      }
    });
    byId('move-installed').hidden = false;
  } else {
    byId('move-window').hidden = false;
    byId('move-button').addEventListener('click', moveByWindow);
  }
  byId('move-backup-button').addEventListener('click', async () => {
    download(backupFile(await buildBackup()));
    byId('move-backup-status').textContent = t('move.backupSaved');
  });
}

start();
