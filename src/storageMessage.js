// A message about keeping the words, shown again and again while they may be
// lost (wordsAtRisk in storageAdvice.js): at the end of Review and on the
// screen between two words in Learn, every time, until the cause is fixed
// (the owner, 2026-10-19: "I would like to be annoying if the alternative is
// having users accidentally lose their data"; before, it was said once per
// device). "Not now" puts it away until the app is next opened. It can be
// switched off in Settings, after a warning, as every nudge can
// (`storageReminderOff`, a setting of the device).
//
// What it says depends on the browser, as in the introduction and Settings
// (storageAdvice.js). Like the introduction's last screen, it has one line
// and one main button that does what this browser needs (storageMessageLine),
// beside "Not now" (roadmap item 1, draft of 2026-10-18: there were three
// buttons and a long paragraph). Once that button has asked the browser, the
// line says what happened (storageAdvice). Review announces the moments:
//
//     document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'learned' }));
//     document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'reviewDone' }));
//
// and main.js announces a backup made with 'backup-made'.

import { getSetting, setSetting } from './db.js';
import { fillMixed } from './lang.js';
import { storageAdvice, storageMessageLine, wordsAtRisk } from './storageAdvice.js';
import { ask } from './confirm.js';
import { t } from './text.js';

const byId = (id) => document.getElementById(id);

// The moments the message is shown at (see above).
const MOMENTS = ['learned', 'reviewDone'];

// keepData: from offline.js: long-term storage and installing
export function createStorageMessage(keepData) {
  const box = byId('storage-message');
  const advice = byId('storage-message-advice');
  const keepButton = byId('storage-message-keep');
  const reminderButton = byId('keep-reminder-button');
  // 'install', 'ask', 'export' or 'settings', as worked out by storageMessageLine.
  let action = 'ask';
  // "Not now" was tapped: put away until the app is next opened.
  let putAway = false;

  // True if the words may be lost now.
  async function atRisk() {
    return wordsAtRisk(keepData.kind, await keepData.state(), await getSetting('lastBackupAt', null), Date.now());
  }

  // Fills in the line and the button for how things stand now. Returns
  // false if the words are safe, and so there is nothing to say.
  async function fill() {
    if (!(await atRisk())) {
      return false;
    }
    const state = await keepData.state();
    const plan = storageMessageLine(keepData.kind, state, keepData.mobile);
    action = plan.action;
    // Once the browser was asked, the full advice says what happened and
    // what to do next. The app's name is marked as Chinese, as elsewhere.
    const asked = state.asked && (action === 'install' || action === 'ask');
    fillMixed(advice, asked ? storageAdvice(keepData.kind, state, keepData.mobile) : plan.line, 'traditional');
    // ('settings' keeps "Keep my words safe", the reminder's own words: the
    // owner, 2026-10-19.)
    keepButton.textContent = t(
      action === 'install' ? 'settings.installApp' : action === 'export' ? 'settings.exportBackup' : 'storageMessage.keep',
    );
    keepButton.hidden = action === 'none' || asked;
    return true;
  }

  async function show() {
    if (putAway || (await getSetting('storageReminderOff', false))) {
      return;
    }
    box.hidden = !(await fill());
  }

  document.addEventListener('screen-shown', (event) => {
    if (MOMENTS.includes(event.detail)) {
      show();
    } else {
      box.hidden = true;
    }
  });
  // On to the next word, or Review and Learn's panel used for something else.
  byId('learn-next-button').addEventListener('click', () => {
    box.hidden = true;
  });
  byId('storage-message-close').addEventListener('click', () => {
    putAway = true;
    box.hidden = true;
  });
  keepButton.addEventListener('click', () => {
    if (action === 'export') {
      // The same as Export backup in Settings (main.js).
      byId('export-button').click();
      return;
    }
    if (action === 'settings') {
      // "Keep my words safe" without an install question: Settings › Your data and backups, which says how to install the app
      // from the browser's menu and has Export backup. The wish to keep the
      // words is noted, so that the installed app asks again by itself.
      keepData.ask().catch(() => {});
      byId('settings-button').click();
      document.querySelector('#settings-nav [data-group="settings-data"]').click();
      return;
    }
    // Installing asks for long-term storage too, as in the introduction
    // (welcome.js), so that the app asks again by itself once installed.
    if (action === 'install') {
      keepData.install().catch(() => {});
    }
    keepData.ask().catch(() => {});
  });
  // After installing or asking, the line says what happened; once the words
  // are safe, the message goes.
  const recheck = async () => {
    if (!box.hidden && !(await fill())) {
      box.hidden = true;
    }
    showReminderButton();
  };
  keepData.listen(recheck);
  // After Export backup from here, the line says where the file went and
  // what it is for (event.detail, main.js), until the next screen; in
  // Safari, with what to do next, as the backup is how the words reach the
  // app on the Home Screen or in the Dock.
  document.addEventListener('backup-made', (event) => {
    if (!box.hidden && action === 'export') {
      const next =
        keepData.kind === 'safari' ? ` ${t(keepData.mobile ? 'storageMessage.nextPhone' : 'storageMessage.nextMac')}` : '';
      fillMixed(advice, event.detail + next, 'traditional');
      keepButton.hidden = true;
    }
    showReminderButton();
  });

  // Settings › Your data and backups: switching the message off, after a
  // warning, or back on. Offered only while the words are at risk or it is
  // off.
  async function showReminderButton() {
    const off = await getSetting('storageReminderOff', false);
    // Named apart from the backup reminder's button in the same group.
    reminderButton.textContent = t(off ? 'storageMessage.showReminder' : 'settings.stopKeepReminder');
    reminderButton.hidden = !off && !(await atRisk());
  }
  reminderButton.addEventListener('click', async () => {
    const off = await getSetting('storageReminderOff', false);
    if (!off) {
      const sure = await ask({
        question: t('storageMessage.stopQuestion'),
        detail: t('storageMessage.stopDetail'),
        yes: t('storageMessage.stopYes'),
      });
      if (!sure) {
        return;
      }
    }
    await setSetting('storageReminderOff', !off);
    if (!off) {
      box.hidden = true;
    }
    showReminderButton();
  });
  showReminderButton();
}
