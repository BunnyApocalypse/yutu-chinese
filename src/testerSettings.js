// Settings for trying the app out (the owner, 2026-10-20): the group "For
// testing" in Settings. It is shown only in the test copy (built with a
// channel, see vite.config.js) and while developing (`npm run dev`), never in
// the stable copy, where these switches stay off.
//
// Each switch belongs to the device (DEVICE_SETTINGS in merge.js).
//
//   swipeReadout: show how each swipe up measured (quiz.js, gestures.js)

/* global __CHANNEL__ */
import { getSetting, setSetting } from './db.js';
import { setSwipeReadout } from './quiz.js';

// import.meta.env.DEV is true only under Vite's dev server.
export const TESTER_SETTINGS_SHOWN = Boolean(__CHANNEL__) || import.meta.env.DEV;

export async function setUpTesterSettings() {
  if (!TESTER_SETTINGS_SHOWN) {
    return;
  }
  document.querySelector('#settings-nav [data-group="settings-testing"]').hidden = false;

  const swipeCheckbox = document.getElementById('swipe-readout-checkbox');
  swipeCheckbox.checked = await getSetting('swipeReadout', false);
  setSwipeReadout(swipeCheckbox.checked);
  swipeCheckbox.addEventListener('change', async () => {
    setSwipeReadout(swipeCheckbox.checked);
    await setSetting('swipeReadout', swipeCheckbox.checked);
  });
}
