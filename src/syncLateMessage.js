// A pop-up when syncing has been failing too long (syncIsLate in
// syncTiming.js; the owner, 2026-11-08: a dot alone is too easy to miss).
// It says since when and why, with "Open sync settings" and "Not now".
// "Not now" puts it away until the next day (`lateSnoozedUntil` in the sync
// store, which turning sync off empties); the dot on the menu button stays
// until syncing works again (main.js). No off switch: it is about losing
// what was done on this device, and goes away when syncing is fixed or
// turned off.
//
// It is never put up over another pop-up (the introduction, What's new…),
// nor while a character is being written: it waits for the next time the
// sync status changes, which syncing by itself brings about often enough
// (syncTiming.js).

import { getSyncValue, setSyncValue } from './db.js';
import { syncIsLate } from './syncTiming.js';
import { problemText } from './syncCodeView.js';
import { t, formatDateTime } from './text.js';

const byId = (id) => document.getElementById(id);
const SNOOZE_MS = 24 * 60 * 60 * 1000;

// isBusy(): true while a character is being written (main.js)
// openSyncSettings(): opens Settings at the sync section
//
// Returns { check(status) }: puts the pop-up up if syncing is late and it
// isn't put away; called with each sync status (syncControl.js).
export function createSyncLateMessage({ isBusy, openSyncSettings }) {
  const dialog = byId('sync-late-dialog');

  byId('sync-late-open').addEventListener('click', () => {
    dialog.close();
    openSyncSettings();
  });
  byId('sync-late-later').addEventListener('click', () => dialog.close());
  // "Not now", the ✕ and Esc all put it away until tomorrow.
  dialog.addEventListener('close', () => setSyncValue('lateSnoozedUntil', Date.now() + SNOOZE_MS));

  return {
    async check(status) {
      const now = Date.now();
      if (!syncIsLate(status, now) || dialog.open || isBusy() || document.querySelector('dialog[open]')) {
        return;
      }
      if (now < (await getSyncValue('lateSnoozedUntil', 0))) {
        return;
      }
      byId('sync-late-detail').textContent = [
        t('syncLate.detail', { when: formatDateTime(new Date(status.lastWorkedAt)) }),
        problemText(status.problem),
      ].join(' ');
      dialog.showModal();
    },
  };
}
