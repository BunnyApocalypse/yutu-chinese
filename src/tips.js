// A short tip the first time each screen is opened (the owner, 2026-10-14:
// the introduction is a wall of text many people will not read). A card at
// the bottom of the screen with "Got it", which nothing waits for. Each tip
// is shown once per device; Settings can show them all again, or switch
// them off.
//
// One line each (the owner, 2026-10-15: in testing, tips of two or three
// sentences went unread). A tip about one thing comes when that thing first
// matters rather than when its screen opens: the one about overruling a
// verdict when the first character is judged ('verdict').
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
  review: 'Grade yourself after each card; tap the card to take the suggested grade.',
  learn: 'Already know a word? "I know this word" skips its lesson.',
  writing: 'Write anywhere in the box, at any size.',
  verdict: 'Tap a character\'s box above if the app judged it wrong.',
  decks: 'Everything else is in the menu, ☰ at the top left.',
  ready: 'Add one level at a time: each takes a few months.',
  words: 'Tap a word for its page. Free practice tries any card without it counting.',
  wordPage: 'Tap any character or part to go further.',
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
  // While a pop-up panel is open, everything outside it is out of reach,
  // a tip drawn above it included ("Got it" could not be tapped under a
  // word's page, seen in testing, 2026-10-14). So the card is moved into the
  // panel opened last, and back out when that closes, and shown again there.
  const openPanels = []; // modal panels that are open, the last opened last
  function placeCard() {
    const parent = openPanels.at(-1) || document.body;
    if (card.parentElement !== parent) {
      parent.append(card); // which closes a popover
    }
    if (current && popovers) {
      if (card.matches(':popover-open')) {
        card.hidePopover();
      }
      card.showPopover();
    }
  }
  new MutationObserver((changes) => {
    for (const { target } of changes) {
      if (target === card || target.tagName !== 'DIALOG') {
        continue;
      }
      const index = openPanels.indexOf(target);
      if (index !== -1) {
        openPanels.splice(index, 1);
      }
      if (target.open && target.matches(':modal')) {
        openPanels.push(target);
      }
    }
    placeCard();
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['open'] });
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
