// A message about long-term storage, once per device, after the first word
// is learned, if the browser may still clear the app's data. The owner's
// choice on 2026-10-15, after a tester asked for a sign of how storage
// stands: a dot would stay on for most people (Chrome only allows it to an
// installed app), so this is said once, at the moment there is something to
// lose. Settings keeps saying how it stands (offline.js), and the backup
// reminder (main.js) is the safety net after that.
//
// What it says depends on the browser, as in the introduction and Settings
// (storageAdvice.js). Like the introduction's old last screen, it has one line
// and one main button that does what this browser needs (storageMessageLine),
// beside "Not now" (roadmap item 1, draft of 2026-10-18: there were three
// buttons and a long paragraph). Once that button has been tapped, the line
// says what happened (storageAdvice). Review announces the moment:
//
//     document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'learned' }));
//
// on the screen between two words in Learn, just after one was learned.

import { getSetting, setSetting } from './db.js';
import { fillMixed } from './lang.js';
import { storageAdvice, storageMessageLine } from './storageAdvice.js';

const byId = (id) => document.getElementById(id);

// keepData: from offline.js: long-term storage and installing
export function createStorageMessage(keepData) {
  const box = byId('storage-message');
  const advice = byId('storage-message-advice');
  const keepButton = byId('storage-message-keep');
  const mobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  // 'install' or 'ask', as worked out by welcomeStorage.
  let action = 'ask';

  // Fills in the line and the button for how things stand now. Returns
  // false if long-term storage is allowed, and so there is nothing to say.
  async function fill() {
    const state = await keepData.state();
    if (state.kept) {
      return false;
    }
    const plan = storageMessageLine(keepData.kind, state, mobile);
    action = plan.action;
    // Once asked, the full advice says what happened and what to do next.
    // The app's name is marked as Chinese, as elsewhere (zh-Hant-TW).
    fillMixed(advice, state.asked ? storageAdvice(keepData.kind, state) : plan.line, 'traditional');
    keepButton.textContent = action === 'install' ? 'Install the app' : 'Keep my words safe';
    keepButton.hidden = action === 'none' || state.asked;
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
  // Installing asks for long-term storage too, as in the introduction
  // (welcome.js), so that the app asks again by itself once installed.
  keepButton.addEventListener('click', () => {
    if (action === 'install') {
      keepData.install().catch(() => {});
    }
    keepData.ask().catch(() => {});
  });
  // After installing or asking, the advice says what happened; once it is
  // allowed, the message goes.
  keepData.listen(async () => {
    if (!box.hidden && !(await fill())) {
      box.hidden = true;
    }
  });
}
