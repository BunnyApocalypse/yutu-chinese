// "Send feedback": a small pop-up with the two ways to reach the people
// making the app, an email and an issue on GitHub. In the menu, where a
// stranger trying the app finds it (roadmap, 2026-10-18), and under Help in
// Settings.
//
// The email is written by the person's own mail app: a "mailto:" address can
// carry a subject and the start of the message, so it begins with which
// version, browser and screen this is (aboutThisDevice in errors.js), which
// is what a report needs. The app itself sends nothing.

import { aboutThisDevice } from './errors.js';
import { closeOnTapBeside } from './dialogs.js';

const ADDRESS = 'yutufeedback.delicious577@passmail.com';
const ISSUES = 'https://github.com/BunnyApocalypse/yutu-chinese/issues';

const byId = (id) => document.getElementById(id);

// Returns { open() }.
export function createFeedback() {
  const dialog = byId('feedback-dialog');

  byId('feedback-email').addEventListener('click', () => {
    const body = `\n\n\n---\nThe details below help with a report; delete them if you like.\n${aboutThisDevice()}\n`;
    // encodeURIComponent turns spaces, line breaks and the like into the
    // %20-style codes an address needs.
    window.location.href =
      `mailto:${ADDRESS}?subject=${encodeURIComponent('Yutu Chinese feedback')}&body=${encodeURIComponent(body)}`;
  });
  byId('feedback-issue').addEventListener('click', () => {
    // "noopener": the new tab gets no handle on this one.
    window.open(ISSUES, '_blank', 'noopener');
  });
  byId('feedback-close').addEventListener('click', () => dialog.close());
  closeOnTapBeside(dialog);

  return {
    open() {
      dialog.showModal();
    },
  };
}
