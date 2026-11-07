// Settings › Your data and backups › Sync between devices: turning sync on
// with a new code or one from another device, keeping the code safe, and
// what sync is doing (syncControl.js does the work; sync.md has the plan).
//
// Three parts, one shown at a time: sync off (what it is, the two ways to
// turn it on), the code (made, before anything is sent; or shown again),
// sync on (how it went, Sync now, Show sync code, Turn off, Delete).

import { makeCode, formatCode, readCode } from './syncCode.js';
import { ask } from './confirm.js';
import { t, formatDateTime } from './text.js';

const byId = (id) => document.getElementById(id);

// What to say for each `reason` syncing gives (sync.js, syncServer.js).
const PROBLEMS = {
  offline: 'sync.problem.offline',
  refused: 'sync.problem.refused',
  'cannot-open': 'sync.problem.cannotOpen',
  'bad-batch': 'sync.problem.cannotOpen',
  'missing-batch': 'sync.problem.missing',
  'too-large': 'sync.problem.full',
  'account-full': 'sync.problem.full',
  'server-full': 'sync.problem.full',
  'too-many': 'sync.problem.busy',
  paused: 'sync.problem.paused',
};

const problemText = (reason) => (PROBLEMS[reason] ? t(PROBLEMS[reason]) : t('sync.problem.other', { reason }));

// What to say when a typed code can't be read (readCode in syncCode.js).
const CODE_PROBLEMS = {
  length: 'sync.codeProblem.length',
  letters: 'sync.codeProblem.letters',
  mistyped: 'sync.codeProblem.mistyped',
};

// control: from createSyncControl (syncControl.js)
export async function createSyncPanel(control) {
  const setting = byId('sync-setting');
  const off = byId('sync-off');
  const codeStep = byId('sync-code-step');
  const on = byId('sync-on');
  const joinForm = byId('sync-join-form');
  const codeInput = byId('sync-code-input');
  const joinError = byId('sync-join-error');
  const codeNote = byId('sync-code-note');

  // The code on show.
  let shownCode = null;

  // Nowhere to sync to (a build without a server yet): nothing to offer.
  setting.hidden = !(await control.server());

  function showPart(part) {
    off.hidden = part !== off;
    codeStep.hidden = part !== codeStep;
    on.hidden = part !== on;
  }

  // The line under "Sync between devices" while sync is on.
  function statusLine(status) {
    if (status.running) {
      return t('sync.syncing');
    }
    const when =
      status.lastSyncedAt === null ? t('sync.notYet') : t('sync.lastSynced', { when: formatDateTime(new Date(status.lastSyncedAt)) });
    return status.problem ? `${when} ${problemText(status.problem)}` : when;
  }

  function show(status) {
    if (!codeStep.hidden) {
      return;
    }
    showPart(status.on ? on : off);
    byId('sync-status').textContent = statusLine(status);
    byId('sync-now-button').disabled = status.running;
    // The data group's first line says where the words are kept.
    byId('settings-data').querySelector('[data-t="settings.dataWhere"]').textContent = t(
      status.on ? 'settings.dataWhereSynced' : 'settings.dataWhere',
    );
  }

  // Shows a code with its ways to keep it. `isNew`: made just now, so sync
  // is turned on only by "I've saved it" (or not, by Cancel).
  function showCode(code, isNew) {
    shownCode = code;
    byId('sync-code').textContent = formatCode(code);
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
    showPart(null);
    show(control.status());
  }

  // The text kept with the code, in a file or on paper.
  function keepingText(code) {
    return t('sync.keepingText', {
      code: formatCode(code),
      date: formatDateTime(new Date()),
      address: window.location.href.split('#')[0].split('?')[0],
    });
  }

  byId('sync-on-button').addEventListener('click', async () => showCode(await makeCode(), true));

  byId('sync-join-button').addEventListener('click', () => {
    joinForm.hidden = false;
    codeInput.focus();
  });

  joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { code, reason } = await readCode(codeInput.value);
    joinError.hidden = !reason;
    if (reason) {
      joinError.textContent = t(CODE_PROBLEMS[reason]);
      return;
    }
    codeInput.value = '';
    joinForm.hidden = true;
    showPart(on);
    await control.turnOn(code);
  });

  byId('sync-copy-button').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(formatCode(shownCode));
      codeNote.textContent = t('sync.copied');
    } catch {
      // Some browsers allow copying only on a secure address, or not at all.
      codeNote.textContent = t('sync.copyFailed');
    }
  });

  // Saved as a small text file, as Export backup saves its file.
  byId('sync-file-button').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([keepingText(shownCode)], { type: 'text/plain' }));
    link.download = 'yutu-chinese-sync-code.txt';
    link.click();
    URL.revokeObjectURL(link.href);
    codeNote.textContent = t('sync.fileSaved', { file: link.download });
  });

  // Printed from a page of its own, made in a hidden frame, so that only the
  // code and how to use it go on paper, not the screen behind.
  byId('sync-print-button').addEventListener('click', () => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    document.body.append(frame);
    const page = frame.contentDocument;
    page.documentElement.lang = document.documentElement.lang;
    const text = page.createElement('pre');
    text.style.cssText = 'font: 14pt/1.5 sans-serif; white-space: pre-wrap;';
    text.textContent = keepingText(shownCode);
    page.body.append(text);
    frame.contentWindow.print();
    // Printing waits for the print dialog in most browsers; the frame goes
    // after it.
    setTimeout(() => frame.remove(), 1000);
  });

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
  return { show };
}
