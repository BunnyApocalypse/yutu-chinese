// The streak screen: a pop-up the first time in a study day that enough was
// studied for the streak (src/streak.js), from Review or Learn, whichever
// gets there first (the owner, 2026-10-19).
//
// Two kinds, the owner's choice from pictures (2026-10-19):
// - the first ever on this device explains streaks ("New: streaks", how a
//   day counts, that a missed day starts it again), with "Got it" and
//   "Don't count streaks", which switches them off then and there;
// - after that, a short one: "Study streak", the number, "Your streak is
//   safe for today. Keep going!" (not "Today is done": the day's minimum is
//   small, and studying on is the point), and the best.
//
// 🌕🐇 (the Jade Rabbit of the app's name) stands where the mascot will be,
// a rabbit to be drawn by an artist: `streak-mascot`, with `data-mood` saying
// which picture to show ('happy' for a streak going on, 'fresh' for a new
// start after a broken one).
//
// Which day it was last shown is kept in localStorage, not in the database:
// it belongs to the device, like "What's new" (whatsNew.js). The test copy
// keeps its own. Never shown before means this is the first, explaining one.

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

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// A line of the pop-up's text, with an emoji after it that screen readers
// leave out.
function line(text, emoji = '', className = '') {
  const element = document.createElement('p');
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  if (emoji) {
    const decoration = document.createElement('span');
    decoration.setAttribute('aria-hidden', 'true');
    decoration.textContent = ` ${emoji}`;
    element.append(decoration);
  }
  return element;
}

// How many pieces of confetti fly out around the number.
const CONFETTI_PIECES = 14;

// Throws confetti out from behind the number (the owner, 2026-10-19), unless
// the device asks for less motion. The pieces go out evenly all around, each
// a little off its place so the burst doesn't look drawn with a ruler, wider
// than high since the number is; they are removed once they have landed.
function throwConfetti(layer) {
  layer.replaceChildren();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  for (let index = 0; index < CONFETTI_PIECES; index++) {
    const angle = ((index + Math.random() * 0.6) / CONFETTI_PIECES) * 2 * Math.PI;
    const distance = 60 + Math.random() * 35;
    const piece = document.createElement('span');
    // Every third a dot, the rest strips.
    if (index % 3 === 0) {
      piece.className = 'dot';
    }
    piece.style.setProperty('--dx', `${Math.round(Math.cos(angle) * distance * 1.4)}px`);
    piece.style.setProperty('--dy', `${Math.round(Math.sin(angle) * distance * 0.7)}px`);
    piece.style.setProperty('--turn', `${Math.round((Math.random() - 0.5) * 540)}deg`);
    piece.addEventListener('animationend', () => piece.remove());
    layer.append(piece);
  }
}

// turnOff: switches streaks off ("Don't count streaks").
// Returns { showIfNew(streak, dayKey, goal) }.
export function createStreakScreen(turnOff) {
  const dialog = byId('streak-dialog');
  const mascot = byId('streak-mascot');
  const kicker = byId('streak-kicker');
  const number = byId('streak-number');
  const confetti = byId('streak-confetti');
  const label = byId('streak-label');
  const detail = byId('streak-detail');
  const continueButton = byId('streak-continue');
  const offButton = byId('streak-off');

  continueButton.addEventListener('click', () => dialog.close());
  byId('streak-close').addEventListener('click', () => dialog.close());
  offButton.addEventListener('click', () => {
    dialog.close();
    turnOff();
  });
  closeOnTapBeside(dialog);

  return {
    // streak: as streakAt gives it; dayKey: today's study day (studyDayKey);
    // goal: { cards, words }, how much makes a day count.
    // Shown only if today counts and it hasn't been shown today, and not over
    // another pop-up (the next save tries again).
    showIfNew(streak, dayKey, goal) {
      const shown = readShown();
      if (!streak.todayDone || shown === dayKey || document.querySelector('dialog[open]')) {
        return;
      }
      const first = shown === null;
      const fresh = streak.current === 1 && streak.lastRun > 0;
      mascot.dataset.mood = fresh ? 'fresh' : 'happy';
      kicker.textContent = first ? 'New: streaks' : 'Study streak';
      number.textContent = String(streak.current);
      label.textContent = streak.current === 1 ? 'day studied!' : 'days in a row!';
      if (first) {
        detail.replaceChildren(
          line(
            `Each day you review ${plural(goal.cards, 'card')} or learn ${plural(goal.words, 'word')}, ` +
              'your streak grows by one. Miss a day and it starts again.',
          ),
        );
      } else {
        const lines = [line('Your streak is safe for today. Keep going!', '✨')];
        if (fresh) {
          lines.push(line(`A new start. Your last streak was ${plural(streak.lastRun, 'day')}.`, '', 'hint'));
        } else if (streak.best > streak.current) {
          lines.push(line(`Your best: ${plural(streak.best, 'day')}.`, '', 'hint'));
        } else if (streak.current > 1) {
          lines.push(line('Your best yet!', '⭐', 'hint'));
        }
        detail.replaceChildren(...lines);
      }
      continueButton.textContent = first ? 'Got it' : 'Continue';
      offButton.hidden = !first;
      dialog.showModal();
      throwConfetti(confetti);
      // Marked as soon as it is shown, so it never comes twice in a day.
      markShown(dayKey);
    },
  };
}
