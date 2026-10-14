// A short tip the first time each screen is opened (the owner, 2026-10-14:
// the introduction is a wall of text many people will not read). A card at
// the bottom of the screen with "Got it", which nothing waits for. Each tip
// is shown once per device; Settings can show them all again, or switch
// them off.
//
// The rest of the app says which screen has just come up by announcing it:
//
//     document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'decks' }));
//
// so that the screens need to know nothing about tips.
//
// The card is a popover (the `popover` attribute), which the browser puts in
// the top layer: above the page, and above a pop-up panel opened before it,
// such as a word's page. Browsers without popovers get a plain card fixed to
// the bottom of the page.

import { getSetting, setSetting } from './db.js';

const TIPS = {
  review:
    'Cards come here when they are due. Answer, then grade yourself: Again if you missed it, Good if you knew it. ' +
    'Where the app can check your answer it suggests a grade, and tapping the card accepts it.',
  learn:
    'New words, one at a time: a look, their tones, then writing them with help and from memory. ' +
    'Already know one? "I know this word" skips it. Words are spoken as you go; Settings can make them quieter.',
  writing:
    'Write anywhere in the box, at any size. After each character its box above turns green or red; ' +
    'tap it if the app got it wrong.',
  decks:
    'Your decks. Learn teaches a deck\'s new words; Review goes over what is due. ' +
    'Ready-made decks has the HSK, the TOCFL and the radicals. Everything else is in the menu, ☰ at the top left.',
  ready: 'Add one level at a time: each takes a few months to learn.',
  words:
    'All your words. Tap one for its page, use Select words to change many at once, ' +
    'or Free practice to try any card without it counting.',
  wordPage:
    'Learning tips, an example sentence, and how each character is built. Tap any character or part to go further.',
};

const byId = (id) => document.getElementById(id);

// Returns { load(), on, setOn(on), showAgain() }; load() is to be waited
// for once, at start-up.
export function createTips() {
  const card = byId('tip-card');
  const text = byId('tip-text');
  const popovers = typeof card.showPopover === 'function';
  if (!popovers) {
    card.hidden = true;
  }
  let seen = new Set();
  let on = true;
  // The tip on screen, and those asked for meanwhile, in order.
  let current = null;
  const waiting = [];

  function open() {
    if (popovers) {
      card.showPopover();
    } else {
      card.hidden = false;
    }
  }
  function close() {
    if (popovers) {
      card.hidePopover();
    } else {
      card.hidden = true;
    }
  }

  // Shows the next tip waiting, unless one is up or the introduction is.
  function next() {
    if (current || waiting.length === 0 || byId('welcome').open) {
      return;
    }
    current = waiting.shift();
    text.textContent = TIPS[current];
    open();
  }

  function ask(key) {
    if (on && TIPS[key] && !seen.has(key) && current !== key && !waiting.includes(key)) {
      waiting.push(key);
      next();
    }
  }

  document.addEventListener('screen-shown', (event) => ask(event.detail));
  // The introduction goes first; its tips come once it is closed.
  byId('welcome').addEventListener('close', next);

  byId('tip-dismiss').addEventListener('click', () => {
    seen.add(current);
    setSetting('tipsSeen', [...seen]);
    current = null;
    close();
    next();
  });

  return {
    async load() {
      seen = new Set(await getSetting('tipsSeen', []));
      on = await getSetting('tipsOn', true);
    },
    get on() {
      return on;
    },
    // Switches the tips on or off (the checkbox in Settings).
    async setOn(value) {
      on = value;
      await setSetting('tipsOn', value);
      if (!on) {
        waiting.length = 0;
        if (current) {
          current = null;
          close();
        }
      }
    },
    // Every tip is shown again, each the next time its screen comes up.
    async showAgain() {
      seen = new Set();
      await setSetting('tipsSeen', []);
      await this.setOn(true);
    },
  };
}
