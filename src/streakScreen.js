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

// How many sparkles rise from the number.
const SPARKLES = 9;

// Sparkles rise from the number as it pops in (the owner, 2026-10-19: like
// sparkles, upward and outward, not confetti scattered at random; quick).
// Unless the device asks for less motion. They go out in an even fan over
// the top of the number, from left to right, near and far by turns and big
// and small by turns, so the burst looks deliberate; each twinkles, rises
// and fades, and is removed once done.
function throwSparkles(layer) {
  layer.replaceChildren();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  for (let index = 0; index < SPARKLES; index++) {
    // From 200° (left, a little up) to 340° (right, a little up); on the
    // screen, y grows downward, so 270° is straight up.
    const angle = ((200 + (140 * index) / (SPARKLES - 1)) * Math.PI) / 180;
    const distance = index % 2 === 0 ? 70 : 50;
    const sparkle = document.createElement('span');
    if (index % 2 === 1) {
      sparkle.className = 'small';
    }
    // Wider than high, as the number is.
    sparkle.style.setProperty('--dx', `${Math.round(Math.cos(angle) * distance * 1.3)}px`);
    sparkle.style.setProperty('--dy', `${Math.round(Math.sin(angle) * distance)}px`);
    sparkle.addEventListener('animationend', () => sparkle.remove());
    layer.append(sparkle);
  }
}

// turnOff: switches streaks off ("Don't count streaks").
// Returns { showIfNew(streak, dayKey, goal) }.
export function createStreakScreen(turnOff) {
  const dialog = byId('streak-dialog');
  const mascot = byId('streak-mascot');
  const kicker = byId('streak-kicker');
  const number = byId('streak-number');
  const sparkles = byId('streak-sparkles');
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
      throwSparkles(sparkles);
      // Marked as soon as it is shown, so it never comes twice in a day.
      markShown(dayKey);
    },
  };
}
