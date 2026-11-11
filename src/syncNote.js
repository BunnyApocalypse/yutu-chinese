// The quiet line at the foot of the start of Review, the end of Review and
// the end of today's words in Learn, while sync is on: "Synced 2 minutes
// ago. Sync now" (the owner, 2026-11-08: when switching from the phone to
// the desktop, to see that this device has what was just studied there,
// and to fetch it if not). The places are the `.sync-note` paragraphs in
// index.html.
//
// "Synced" means a whole sync, which takes in the other devices' changes,
// and worked (`lastFetchedAt` in syncControl.js); sending alone doesn't
// count. The time is said again each half minute, so "just now" grows old.

import { t, formatAgo } from './text.js';

const REFRESH_MS = 30 * 1000;
// After Sync now is tapped, "Syncing…" stays at least this long: a sync
// with nothing new takes a moment, and the line would only flicker, as if
// the tap had done nothing.
const SYNCING_AT_LEAST_MS = 700;

// control: from createSyncControl (syncControl.js), for Sync now
export function createSyncNote(control) {
  const notes = [...document.querySelectorAll('.sync-note')];
  let status = control.status();
  let tappedAt = 0;

  function lineFor(now) {
    if (status.running || now - tappedAt < SYNCING_AT_LEAST_MS) {
      return t('sync.syncing');
    }
    if (status.problem) {
      const since = status.lastWorkedAt ?? status.lastSyncedAt;
      return since === null ? t('syncNote.failed') : t('syncNote.failedSince', { when: formatAgo(since, now) });
    }
    if (status.lastFetchedAt === null) {
      // Before the first whole sync since the app opened, which comes at once.
      return t('sync.syncing');
    }
    return now - status.lastFetchedAt < 60 * 1000
      ? t('syncNote.justNow')
      : t('syncNote.synced', { when: formatAgo(status.lastFetchedAt, now) });
  }

  function show() {
    const now = Date.now();
    for (const note of notes) {
      note.hidden = !status.on;
      note.querySelector('.sync-note-text').textContent = status.on ? lineFor(now) : '';
      note.querySelector('button').disabled = status.running || now - tappedAt < SYNCING_AT_LEAST_MS;
    }
  }

  for (const note of notes) {
    note.querySelector('button').addEventListener('click', () => {
      tappedAt = Date.now();
      show();
      control.syncNow();
      // The line again once the least time is up, should the sync be over.
      setTimeout(show, SYNCING_AT_LEAST_MS);
    });
  }
  setInterval(() => {
    if (status.on && document.visibilityState === 'visible') {
      show();
    }
  }, REFRESH_MS);
  show();

  return {
    // With each sync status (main.js).
    show(newStatus) {
      status = newStatus;
      show();
    },
  };
}
