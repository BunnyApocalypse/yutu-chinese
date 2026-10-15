// A message about long-term storage, once per device, after the first word
// is learned, if the browser may still clear the app's data. The owner's
// choice on 2026-10-15, after a tester asked for a sign of how storage
// stands: a dot would stay on for most people (Chrome only allows it to an
// installed app), so this is said once, at the moment there is something to
// lose. Settings keeps saying how it stands (offline.js), and the backup
// reminder (main.js) is the safety net after that.
//
// What it says depends on the browser, as in the introduction and Settings
// (storageAdvice.js). Review announces the moment:
//
//     document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'learned' }));
//
// on the screen between two words in Learn, just after one was learned.

import { getSetting, setSetting } from './db.js';
import { storageAdvice } from './storageAdvice.js';

const byId = (id) => document.getElementById(id);

// keepData: from offline.js: long-term storage and installing
export function createStorageMessage(keepData) {
  const box = byId('storage-message');
  const advice = byId('storage-message-advice');
  const installButton = byId('storage-message-install');
  const keepButton = byId('storage-message-keep');

  // Fills in the advice and the buttons for how things stand now. Returns
  // false if long-term storage is allowed, and so there is nothing to say.
  async function fill() {
    const state = await keepData.state();
    if (state.kept) {
      return false;
    }
    advice.textContent = storageAdvice(keepData.kind, state);
    installButton.hidden = !state.canInstall;
    keepButton.hidden = !state.canAsk;
    return true;
  }

  async function show() {
    // A setting that belongs to the device (merge.js), like the question
    // itself: another device's answer says nothing about this browser.
    if (await getSetting('storageMessageShown', false)) {
      return;
    }
    if (!(await fill())) {
      return;
    }
    await setSetting('storageMessageShown', true);
    box.hidden = false;
  }

  document.addEventListener('screen-shown', (event) => {
    if (event.detail === 'learned') {
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
    box.hidden = true;
  });
  installButton.addEventListener('click', () => keepData.install());
  keepButton.addEventListener('click', () => keepData.ask());
  // After installing or asking, the advice says what happened; once it is
  // allowed, the message goes.
  keepData.listen(async () => {
    if (!box.hidden && !(await fill())) {
      box.hidden = true;
    }
  });
}
