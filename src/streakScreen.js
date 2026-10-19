// The streak screen: a pop-up the first time in a study day that enough was
// studied for the streak (src/streak.js), from Review or Learn, whichever
// gets there first (the owner, 2026-10-19).
//
// It has a place for the mascot, a rabbit to be drawn by an artist (the owner,
// 2026-10-18): `streak-mascot`, hidden until there is a picture, with
// `data-mood` saying which one to show ('happy' for a streak going on,
// 'fresh' for a new start after a broken one).
//
// Which day it was last shown is kept in localStorage, not in the database:
// it belongs to the device, like "What's new" (whatsNew.js). The test copy
// keeps its own.

/* global __CHANNEL__ */

import { closeOnTapBeside } from './dialogs.js';

const SHOWN_KEY = __CHANNEL__ ? `streak-shown-${__CHANNEL__}` : 'streak-shown';

const byId = (id) => document.getElementById(id);

function readShown() {
  try {
    return localStorage.getItem(SHOWN_KEY);
  } catch {
    // Storage refused (a private window, for one): as if never shown.
    return null;
  }
}

function markShown(dayKey) {
  try {
    localStorage.setItem(SHOWN_KEY, dayKey);
  } catch {
    // As above: it may come again today.
  }
}

const days = (count) => `${count} ${count === 1 ? 'day' : 'days'}`;

// Returns { showIfNew(streak, goal, dayKey) }.
export function createStreakScreen() {
  const dialog = byId('streak-dialog');
  const mascot = byId('streak-mascot');
  const number = byId('streak-number');
  const label = byId('streak-label');
  const detail = byId('streak-detail');

  byId('streak-continue').addEventListener('click', () => dialog.close());
  byId('streak-close').addEventListener('click', () => dialog.close());
  closeOnTapBeside(dialog);

  return {
    // streak: as streakAt gives it; dayKey: today's study day (studyDayKey).
    // Shown only if today counts and it hasn't been shown today, and not over
    // another pop-up (the next save tries again).
    showIfNew(streak, dayKey) {
      if (!streak.todayDone || readShown() === dayKey || document.querySelector('dialog[open]')) {
        return;
      }
      const fresh = streak.current === 1 && streak.lastRun > 0;
      mascot.dataset.mood = fresh ? 'fresh' : 'happy';
      number.textContent = String(streak.current);
      label.textContent = streak.current === 1 ? 'day in a row' : 'days in a row';
      const studied = [];
      if (streak.today.cards > 0) {
        studied.push(`${streak.today.cards} ${streak.today.cards === 1 ? 'card' : 'cards'} reviewed`);
      }
      if (streak.today.words > 0) {
        studied.push(`${streak.today.words} ${streak.today.words === 1 ? 'word' : 'words'} learned`);
      }
      const lines = [`Today counts: ${studied.join(' and ')}.`];
      if (fresh) {
        lines.push(`A new start. Your last streak was ${days(streak.lastRun)}.`);
      } else if (streak.best > streak.current) {
        lines.push(`Your best: ${days(streak.best)}.`);
      } else if (streak.current > 1) {
        lines.push('Your best yet.');
      }
      // One line each: what counted today, then the best.
      detail.replaceChildren(
        ...lines.map((text) => {
          const line = document.createElement('p');
          line.textContent = text;
          return line;
        }),
      );
      dialog.showModal();
      // Marked as soon as it is shown, so it never comes twice in a day.
      markShown(dayKey);
    },
  };
}
