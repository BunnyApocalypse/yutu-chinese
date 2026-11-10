// Taking in a learner's words from the app's old address, as the app at its
// new one (docs/offline.md, "The move to yutuchinese.com").
//
// A browser keeps each site's data apart, so the words studied at
// https://bunnyapocalypse.github.io/yutu-chinese/ can't be read here at
// https://yutuchinese.com/app/. The page now at the old address (move.js)
// opens this app in a new window, with "#move-in" at the end of the address,
// and the two windows talk with postMessage: a browser feature by which a
// window can hand data to a window of another site, each checking which
// site the other is. Here:
//
//   1. this window tells the old one it is ready ("yutu-move-ready");
//   2. the old one sends everything: the backup's contents, its syncing
//      records and the language chosen ("yutu-move-data");
//   3. this window saves it, says how it went ("yutu-move-done" or
//      "yutu-move-failed"), and starts the app.
//
// Only the old address is listened to, and only the window that opened this
// one.

import { checkBackup, buildBackup, restoreBackup } from './backup.js';
import { countAll, getSyncValue, replaceEverything, replaceSyncState, sendEverything } from './db.js';
import { mergeBackups } from './merge.js';
import { t, formatNumber, saveLanguage } from './text.js';

// The old address's site (without a path): put in by Vite (vite.config.js).
/* global __MOVE_FROM__ */
const MOVE_FROM = typeof __MOVE_FROM__ === 'undefined' ? '' : __MOVE_FROM__;

// How long to wait for the old window to send the words, in milliseconds.
const WAIT = 60_000;

// Whether this window was opened by the page at the old address to take the
// words in. Also without the opener: an app installed on Android may open
// the new address in Chrome or a browser view of its own, which may not keep
// the way back (moveIn says so then).
export function openedToMoveIn() {
  return Boolean(MOVE_FROM) && window.location.hash === '#move-in';
}

// Takes the words in, saying how it goes in `note` (the "Loading…" line),
// then starts the app afresh (the page reloads). The app is not started
// meanwhile: it would show the introduction to a learner who has words.
export async function moveIn(note) {
  const opener = window.opener;
  // Out of the address, so that a reload starts the app as usual.
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  // Opened without a way back to the old page: nothing can come. Said,
  // with the backup file instead, rather than starting the app empty with
  // its introduction as if this were a new learner.
  if (!opener) {
    note.textContent = t('move.inNoOpener');
    return;
  }
  const tell = (message) => opener.postMessage(message, MOVE_FROM);
  note.textContent = t('move.inWaiting');
  let handed;
  try {
    handed = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Object.assign(new Error('No answer'), { reason: 'noAnswer' })), WAIT);
      window.addEventListener('message', function hear(event) {
        if (event.origin !== MOVE_FROM || event.source !== opener || event.data?.type !== 'yutu-move-data') {
          return;
        }
        clearTimeout(timer);
        window.removeEventListener('message', hear);
        resolve(event.data);
      });
      tell({ type: 'yutu-move-ready' });
    });
    checkBackup(handed.backup);
    note.textContent = t('move.inSaving');
    // Saved in parts (replaceEverything in db.js): how far, here as Import
    // backup says it, and to the old window, which shows it too and keeps
    // waiting while it comes.
    const onProgress = (saved, total) => {
      note.textContent = t('import.saving', { saved: formatNumber(saved), total: formatNumber(total) });
      tell({ type: 'yutu-move-progress', saved, total });
    };
    const empty = (await countAll('words')) === 0 && (await countAll('reviews')) === 0;
    const syncingHere = Boolean(await getSyncValue('code', null));
    if (empty) {
      await restoreBackup(handed.backup, onProgress);
    } else {
      // Words studied here already (the app was opened at this address
      // first): both kept, as Import backup's "Combine" does.
      const { data } = mergeBackups(await buildBackup(), handed.backup, { summarize: false });
      await replaceEverything(data, onProgress);
    }
    // Syncing goes on where the old address left off, unless this address
    // syncs already: then its own stays, and what came is sent with it.
    if (!syncingHere && handed.sync?.some((record) => record.key === 'code')) {
      await replaceSyncState(handed);
      if (!empty) {
        await sendEverything();
      }
    }
    // The language chosen at the old address, kept per site outside the
    // database; saved before the move is said to be done.
    if (handed.language) {
      saveLanguage(handed.language);
    }
    const words = handed.backup.words.length;
    tell({ type: 'yutu-move-done', words });
    note.textContent = t('move.inDone', { count: words, words: formatNumber(words) });
  } catch (error) {
    tell({ type: 'yutu-move-failed', reason: error.reason || error.textKey || 'failed' });
    note.textContent = t('move.inFailed', { detail: String(error.message || error) });
    return;
  }
  // The app starts with the words in place, a moment later so that the line
  // above can be read.
  setTimeout(() => window.location.reload(), 1500);
}
