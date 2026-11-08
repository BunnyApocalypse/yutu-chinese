// When syncing happens by itself (docs/sync.md, "When to sync"): changes
// should leave this device before the learner picks up another, and arrive
// before they study on it. Nothing here waits for the server: studying
// never waits for a sync.
//
//   Sending only (light: the outbox, a few kilobytes):
//     30 seconds after the last change, and at least every 5 minutes while
//     changes keep coming; at once when the app is put away (the screen
//     locked, another app or tab), the last moment a phone surely lets a page
//     run (the request is sent with keepalive, syncServer.js).
//   A whole sync (sending and taking in, which may write many records):
//     when the app starts, when it comes back into view, when the
//     connection comes back, and again after a failure (1, 5, then 30
//     minutes later). Never while a character is being written: it waits
//     until `isBusy()` has been false for a moment.
//
// The browser's events used: visibilitychange (the page shown or put
// away) and online (the connection back).

const SEND_AFTER_MS = 30 * 1000;
const SEND_AT_LEAST_EVERY_MS = 5 * 60 * 1000;
const RETRY_AFTER_MS = [60 * 1000, 5 * 60 * 1000, 30 * 60 * 1000];
const BUSY_CHECK_MS = 2000;

// Problems worth trying again for: those that may pass by themselves.
const PASSING = ['offline', 'too-many', 'paused', 'server-error'];

// How long syncing may go on failing before the app says so, with a red dot
// on the menu (main.js) and a pop-up (syncLateMessage.js); apart from the
// reminder to export a backup, which syncing replaces. The owner,
// 2026-11-08: longer than a server restarting for an update; 3 days when
// the server can't be reached ('offline': most likely no connection here,
// which sorts itself out, though a server that is down looks the same), a
// day for anything else (the server refusing, paused, full, an error).
export const SYNC_LATE_AFTER_MS = { offline: 3 * 24 * 60 * 60 * 1000, other: 24 * 60 * 60 * 1000 };

// Whether syncing has been failing too long: sync is on, the last try went
// wrong, and none has worked for longer than SYNC_LATE_AFTER_MS says for
// that problem. `status` is syncControl.js's (`lastWorkedAt`: when a sync
// last worked without a problem, or sync was turned on).
export function syncIsLate({ on, problem, lastWorkedAt }, now) {
  const limit = problem === 'offline' ? SYNC_LATE_AFTER_MS.offline : SYNC_LATE_AFTER_MS.other;
  return Boolean(on && problem && lastWorkedAt !== null && now - lastWorkedAt > limit);
}

// control: from createSyncControl (syncControl.js)
// isBusy(): true while a character is being written (main.js)
// onOutboxChange(listener): db.js's, to hear of each change noted
//
// Returns { stop() }, for the tests.
export function startSyncTiming({ control, isBusy, onOutboxChange }) {
  let sendTimer = null;
  let firstUnsentAt = null;
  let wholeTimer = null;
  let retries = 0;

  const on = () => control.status().on;

  function sendSoon() {
    if (!on()) {
      return;
    }
    const now = Date.now();
    firstUnsentAt ??= now;
    clearTimeout(sendTimer);
    const wait = Math.min(SEND_AFTER_MS, Math.max(0, firstUnsentAt + SEND_AT_LEAST_EVERY_MS - now));
    sendTimer = setTimeout(sendNow, wait);
  }

  function sendNow() {
    clearTimeout(sendTimer);
    sendTimer = null;
    firstUnsentAt = null;
    if (on()) {
      control.syncNow({ sendOnly: true });
    }
  }

  // A whole sync, once nothing is being written; then, if it failed for a
  // reason that may pass, another later.
  function syncWhole(after = 0) {
    clearTimeout(wholeTimer);
    wholeTimer = setTimeout(async () => {
      if (!on()) {
        return;
      }
      if (isBusy()) {
        syncWhole(BUSY_CHECK_MS);
        return;
      }
      await control.syncNow();
      const { problem } = control.status();
      if (problem && PASSING.includes(problem) && retries < RETRY_AFTER_MS.length) {
        syncWhole(RETRY_AFTER_MS[retries]);
        retries += 1;
      } else if (!problem) {
        retries = 0;
      }
    }, after);
  }

  onOutboxChange(sendSoon);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      sendNow();
    } else {
      syncWhole();
    }
  };
  const onOnline = () => syncWhole();
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);

  syncWhole();

  return {
    stop() {
      clearTimeout(sendTimer);
      clearTimeout(wholeTimer);
      onOutboxChange(() => {});
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    },
  };
}
