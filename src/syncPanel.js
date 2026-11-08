// Settings › Your data and backups › Sync between devices: turning sync on
// with a new code or one from another device, keeping the code safe, and
// what sync is doing (syncControl.js does the work; sync.md has the plan).
//
// Three parts, one shown at a time: sync off (what it is, the two ways to
// turn it on), the code (made, before anything is sent; or shown again),
// sync on (how it went, Sync now, Show sync code, Turn off, Delete).

import { makeCode, readCode } from './syncCode.js';
import { createServerChoice, hostOf } from './syncServerChoice.js';
import { closeOnTapBeside } from './dialogs.js';
import { showCode as fillCode, copyCode, saveCodeFile, printCode, problemText, codeProblemText, progressText } from './syncCodeView.js';
import { scanForCode } from './syncScan.js';
import { syncIsLate } from './syncTiming.js';
import { ask } from './confirm.js';
import { t, formatDateTime } from './text.js';

const byId = (id) => document.getElementById(id);

// control: from createSyncControl (syncControl.js)
//
// Returns { show(status), offerJoin(text) }: offerJoin fills the code box
// with a code from a link, for the learner to confirm.
export async function createSyncPanel(control) {
  const setting = byId('sync-setting');
  const off = byId('sync-off');
  const codeStep = byId('sync-code-step');
  const on = byId('sync-on');
  const joinForm = byId('sync-join-form');
  const codeInput = byId('sync-code-input');
  const joinError = byId('sync-join-error');
  const codeNote = byId('sync-code-note');

  // The code on show, and the server in its link (linkServer).
  let shownCode = null;
  let shownServer = '';

  // Nowhere to sync to (a build without a server, and none chosen): nothing
  // to offer.
  setting.hidden = !(await control.server());

  // ---- Which sync server ----
  //
  // Folded away under its name (syncServerChoice.js). Choosing one makes
  // syncing possible even in a build without a usual server.
  const serverChoice = createServerChoice('sync', control, {
    summary: true,
    onChosen: () => {
      setting.hidden = false;
    },
  });

  // ---- What syncing does with a learner's data ----
  const privacy = byId('privacy-dialog');
  for (const button of document.querySelectorAll('.sync-privacy-button')) {
    button.addEventListener('click', () => privacy.showModal());
  }
  byId('privacy-close').addEventListener('click', () => privacy.close());
  closeOnTapBeside(privacy);

  function showPart(part) {
    off.hidden = part !== off;
    codeStep.hidden = part !== codeStep;
    on.hidden = part !== on;
  }

  // The line under "Sync between devices" while sync is on.
  function statusLine(status, address) {
    const through = address ? t('sync.through', { host: hostOf(address) }) : '';
    if (status.running) {
      return status.progress ? progressText(status.progress) : `${t('sync.syncing')} ${through}`;
    }
    const when =
      status.lastSyncedAt === null ? t('sync.notYet') : t('sync.lastSynced', { when: formatDateTime(new Date(status.lastSyncedAt)) });
    // Failing too long (the menu's red dot says so too, main.js): first.
    const late = syncIsLate(status, Date.now()) ? t('sync.late', { when: formatDateTime(new Date(status.lastWorkedAt)) }) : '';
    return [late, when, through, status.problem ? problemText(status.problem) : ''].filter(Boolean).join(' ');
  }

  async function show(status) {
    if (!codeStep.hidden) {
      return;
    }
    showPart(status.on ? on : off);
    byId('sync-status').textContent = statusLine(status, await control.server());
    await serverChoice.refresh();
    byId('sync-now-button').disabled = status.running;
    // The data group's first line says where the words are kept.
    byId('settings-data').querySelector('[data-t="settings.dataWhere"]').textContent = t(
      status.on ? 'settings.dataWhereSynced' : 'settings.dataWhere',
    );
  }

  // Shows a code with its ways to keep it. `isNew`: made just now, so sync
  // is turned on only by "I've saved it" (or not, by Cancel).
  async function showCode(code, isNew) {
    shownCode = code;
    shownServer = await control.linkServer();
    fillCode({ codeElement: byId('sync-code'), qrElement: byId('sync-qr') }, code, shownServer);
    codeNote.textContent = '';
    byId('sync-saved-button').hidden = !isNew;
    byId('sync-code-cancel').hidden = !isNew;
    byId('sync-code-hide').hidden = isNew;
    showPart(codeStep);
    byId('sync-copy-button').focus();
  }

  function hideCode() {
    shownCode = null;
    byId('sync-code').textContent = '';
    byId('sync-qr').replaceChildren();
    showPart(null);
    show(control.status());
  }

  function openJoin() {
    joinForm.hidden = false;
    codeInput.focus();
  }

  byId('sync-on-button').addEventListener('click', async () => showCode(await makeCode(), true));

  // A code scanned goes in the box; joining is still a tap on the button.
  byId('sync-scan-button').addEventListener('click', async () => {
    const found = await scanForCode();
    if (found) {
      codeInput.value = found.code;
      if (found.server) {
        serverChoice.useFromLink(found.server);
      }
      joinError.hidden = true;
      byId('sync-join-submit').focus();
    }
  });
  byId('sync-join-button').addEventListener('click', openJoin);

  joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { code, reason } = await readCode(codeInput.value);
    joinError.hidden = !reason;
    if (reason) {
      joinError.textContent = codeProblemText(reason);
      return;
    }
    codeInput.value = '';
    joinForm.hidden = true;
    byId('sync-from-link').hidden = true;
    showPart(on);
    const result = await control.turnOn(code);
    // The other devices' words and settings came: the app starts again with
    // them, as after importing a backup (settings are read at start).
    if (result?.changed) {
      window.location.reload();
    }
  });

  byId('sync-copy-button').addEventListener('click', async () => {
    codeNote.textContent = await copyCode(shownCode);
  });
  byId('sync-file-button').addEventListener('click', () => {
    codeNote.textContent = saveCodeFile(shownCode, shownServer);
  });
  byId('sync-print-button').addEventListener('click', () => printCode(shownCode, shownServer));

  byId('sync-saved-button').addEventListener('click', async () => {
    const code = shownCode;
    hideCode();
    showPart(on);
    await control.turnOn(code);
  });

  byId('sync-code-cancel').addEventListener('click', hideCode);
  byId('sync-code-hide').addEventListener('click', hideCode);

  byId('sync-now-button').addEventListener('click', () => control.syncNow());

  byId('sync-show-code-button').addEventListener('click', async () => {
    const confirmed = await ask({
      question: t('sync.showCodeQuestion'),
      detail: t('sync.showCodeDetail'),
      yes: t('sync.showCodeYes'),
    });
    if (confirmed) {
      showCode(await control.code(), false);
    }
  });

  byId('sync-off-button').addEventListener('click', async () => {
    const confirmed = await ask({
      question: t('sync.turnOffQuestion'),
      detail: t('sync.turnOffDetail'),
      yes: t('sync.turnOffYes'),
    });
    if (confirmed) {
      await control.turnOff();
    }
  });

  byId('sync-delete-button').addEventListener('click', async () => {
    const confirmed = await ask({
      question: t('sync.deleteQuestion'),
      detail: t('sync.deleteDetail'),
      yes: t('sync.deleteYes'),
    });
    if (!confirmed) {
      return;
    }
    try {
      await control.deleteSyncedData();
    } catch (error) {
      byId('sync-status').textContent = problemText(error.reason);
    }
  });

  show(control.status());

  return {
    show,
    // A code from a link (takeCodeFromLink in syncCodeView.js): put in the
    // box with a warning, never joined by itself; the link's server, if any,
    // tried and chosen.
    offerJoin({ text, server }) {
      showPart(off);
      codeInput.value = text;
      byId('sync-from-link').hidden = false;
      if (server) {
        serverChoice.useFromLink(server);
      }
      openJoin();
    },
  };
}
