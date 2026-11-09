// Sync between devices, offered once to someone already using the app on
// this device (the owner, 2026-11-09, for the release that brings syncing):
// a pop-up when the app starts, before "What's new". New learners are
// offered it in the introduction instead (welcome.js).
//
// Four parts, one shown at a time: the invitation (Turn on sync, I have a
// sync code, Not now), the new code to keep safe (as in Settings), a code
// from another device, and sync on.
//
// Whether it was shown is kept in localStorage, as for "What's new": it
// belongs to the device, so it stays out of backups and syncing, and the
// test copy keeps its own (see db.js). Shown once, whatever is chosen;
// Settings › Your data and backups has sync from then on.

/* global __CHANNEL__ */

import { makeCode, readCode } from './syncCode.js';
import { showCode, copyCode, saveCodeFile, printCode, problemText, codeProblemText, progressText } from './syncCodeView.js';
import { scanForCode } from './syncScan.js';
import { t } from './text.js';

const SHOWN_KEY = __CHANNEL__ ? `sync-invite-shown-${__CHANNEL__}` : 'sync-invite-shown';

const byId = (id) => document.getElementById(id);

function wasShown() {
  try {
    return localStorage.getItem(SHOWN_KEY) === 'yes';
  } catch {
    // Storage refused (a private window, for one): not offered, rather
    // than offered at every start.
    return true;
  }
}

function markShown() {
  try {
    localStorage.setItem(SHOWN_KEY, 'yes');
  } catch {
    // As above.
  }
}

// control: from createSyncControl (syncControl.js)
//
// Returns { openIfNew(isFirstUse), show(status) }. openIfNew resolves once
// the pop-up is closed (at once if it isn't shown), so that "What's new"
// can wait for it; show(status) follows sync while the pop-up is open.
export function createSyncInvite(control) {
  const dialog = byId('sync-invite-dialog');
  const parts = {
    start: byId('sync-invite-start'),
    code: byId('sync-invite-code-step'),
    join: byId('sync-invite-join'),
    on: byId('sync-invite-on'),
  };
  const codeInput = byId('sync-invite-code-input');
  const joinError = byId('sync-invite-join-error');
  const codeNote = byId('sync-invite-code-note');

  // The new code on show, and the server in its link (linkServer).
  let newCode = null;
  let newServer = '';

  function showPart(name) {
    for (const [key, part] of Object.entries(parts)) {
      part.hidden = key !== name;
    }
    dialog.scrollTop = 0;
  }

  // While sync is being turned on from here: until its first sync is done,
  // the line says "Syncing…", not "All … synced".
  let turningOn = false;

  // The line under "Sync is on": how the first sync is going.
  function show(status) {
    if (!dialog.open || parts.on.hidden) {
      return;
    }
    let line = t('syncInvite.allSynced');
    if (turningOn && !status.progress) {
      line = t('sync.syncing');
    } else if (status.running) {
      line = status.progress ? progressText(status.progress) : t('sync.syncing');
    } else if (status.problem) {
      line = problemText(status.problem);
    }
    byId('sync-invite-status').textContent = line;
  }

  byId('sync-invite-turn-on').addEventListener('click', async () => {
    if (!newCode) {
      newCode = await makeCode();
      newServer = await control.linkServer();
      showCode({ codeElement: byId('sync-invite-code'), qrElement: byId('sync-invite-qr') }, newCode, newServer);
    }
    showPart('code');
    byId('sync-invite-copy').focus();
  });
  byId('sync-invite-have-code').addEventListener('click', () => {
    showPart('join');
    codeInput.focus();
  });
  for (const button of dialog.querySelectorAll('.sync-invite-back')) {
    button.addEventListener('click', () => showPart('start'));
  }
  byId('sync-invite-not-now').addEventListener('click', () => dialog.close());
  byId('sync-invite-close').addEventListener('click', () => dialog.close());
  byId('sync-invite-done').addEventListener('click', () => dialog.close());

  byId('sync-invite-copy').addEventListener('click', async () => {
    codeNote.textContent = await copyCode(newCode);
  });
  byId('sync-invite-file').addEventListener('click', () => {
    codeNote.textContent = saveCodeFile(newCode, newServer);
  });
  byId('sync-invite-print').addEventListener('click', () => printCode(newCode, newServer));

  // Shows "Sync is on" and turns it on with `code`; returns turnOn's result.
  async function turnOn(code) {
    turningOn = true;
    showPart('on');
    show(control.status());
    try {
      return await control.turnOn(code);
    } finally {
      turningOn = false;
      show(control.status());
    }
  }

  byId('sync-invite-saved').addEventListener('click', () => turnOn(newCode));

  // A code scanned goes in the box; joining is still a tap on the button.
  byId('sync-invite-scan').addEventListener('click', async () => {
    const found = await scanForCode();
    if (found) {
      codeInput.value = found.code;
      joinError.hidden = true;
      byId('sync-invite-join-submit').focus();
    }
  });

  parts.join.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { code, reason } = await readCode(codeInput.value);
    joinError.hidden = !reason;
    if (reason) {
      joinError.textContent = codeProblemText(reason);
      return;
    }
    codeInput.value = '';
    const result = await turnOn(code);
    // The other devices' words and settings came: the app starts again with
    // them, as after joining in Settings (settings are read at start).
    if (result?.changed) {
      window.location.reload();
    }
  });

  // Opens it at the first part, and resolves once it is closed.
  async function open() {
    newCode = null;
    codeNote.textContent = '';
    joinError.hidden = true;
    showPart('start');
    dialog.showModal();
    // Marked as soon as it is shown, so that it never comes up twice.
    markShown();
    await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
  }

  // Settings › For testing (testerSettings.js): shows it again, over
  // Settings, where sync is off.
  byId('sync-invite-show').addEventListener('click', async () => {
    const note = byId('sync-invite-show-note');
    note.textContent = '';
    if (control.status().on) {
      note.textContent = t('testing.syncInviteSyncOn');
    } else if (!(await control.server())) {
      note.textContent = t('testing.syncInviteNoServer');
    } else {
      open();
    }
  });

  return {
    show,
    async openIfNew(isFirstUse) {
      // New learners met sync in the introduction; nothing to offer without
      // a server, or with sync already on.
      if (isFirstUse) {
        markShown();
        return;
      }
      if (wasShown() || control.status().on || !(await control.server())) {
        return;
      }
      await open();
    },
  };
}
