// A short tip the first time each screen is opened (the owner, 2026-10-14:
// the introduction is a wall of text many people will not read). A card at
// the bottom of the screen with "Got it", which nothing waits for. Each tip
// is shown once per device; Settings can show them all again, or switch
// them off.
//
// One line each (the owner, 2026-10-15: in testing, tips of two or three
// sentences went unread). A tip about one thing comes when that thing first
// matters rather than when its screen opens, and beside it, with a small
// arrow pointing at it (the owner, the same day): see PLACES.
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
  // The first step of a lesson, which shows "I know this word" (review.js).
  // Until 2026-10-15 this was the Learn tab's tip ('learn'), shown when the
  // tab opened, before the button was there.
  lesson: 'Already know a word? "I know this word" skips its lesson.',
  // There was a tip the first time something was written, "Write anywhere
  // in the box, at any size.": taken out on 2026-10-15, the owner finding
  // writing plain enough without it.
  // The first character judged in a word of several (wordFlow.js): one
  // character has no row of boxes, and its grade is its verdict.
  verdict: 'Tap a character\'s box if the app judged it wrong.',
  decks: 'Everything else is in the menu, ☰ at the top left.',
  ready: 'Add one level at a time: each takes a few months.',
  words: 'Tap a word for its page. Free practice tries any card without it counting.',
  wordPage: 'Tap any character or part to go further.',
};

// The tips that are about one thing on the screen, and where that is: the
// element's ID, and on which side of it the tip goes if there is room
// ('above' or 'below'). The verdict's tip goes above the row of boxes, so as
// not to cover the writing area while the next character is written. While
// the element is out of sight, the tip is at the bottom like the others.
const PLACES = {
  lesson: { target: 'skip-lesson-button', side: 'below' },
  verdict: { target: 'word-row', side: 'above' },
  decks: { target: 'menu-button', side: 'below' },
};

// The room kept between the tip and the element, and the edge of the screen.
const GAP = 10;
const MARGIN = 12;

// How often a tip beside something is moved to follow it (it can move when
// the page scrolls, the screen turns or another row appears above it).
// Simpler than watching for each of those, and cheap.
const FOLLOW_EVERY_MS = 200;

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

  let following = null; // the timer that keeps a tip beside its element

  function open() {
    if (popovers) {
      card.showPopover();
    } else {
      card.hidden = false;
    }
    place();
    if (PLACES[current]) {
      following = setInterval(place, FOLLOW_EVERY_MS);
    }
  }
  function close() {
    clearInterval(following);
    following = null;
    if (popovers) {
      card.hidePopover();
    } else {
      card.hidden = true;
    }
  }

  // Puts the tip beside its element, if it has one in sight; otherwise at
  // the bottom of the screen (the style sheet's place for it). Beside means
  // above or below, on the side PLACES asks for if there is room there, and
  // as near the element's middle as the screen's edges allow. The class
  // "beside-above" or "beside-below" says which, for the arrow, and
  // --arrow-x where along the tip the arrow is.
  function place() {
    const where = PLACES[current];
    const target = where && byId(where.target);
    const box = target?.getBoundingClientRect();
    card.classList.remove('beside-above', 'beside-below');
    card.style.left = '';
    card.style.top = '';
    if (!box || box.width === 0 || box.height === 0) {
      return;
    }
    // With the class on, the style sheet gives the tip its width, so its
    // size can be measured.
    card.classList.add('beside-below');
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const roomAbove = box.top - GAP - height >= MARGIN;
    const roomBelow = box.bottom + GAP + height <= window.innerHeight - MARGIN;
    const above = where.side === 'above' ? roomAbove || !roomBelow : !roomBelow && roomAbove;
    const middle = box.left + box.width / 2;
    const left = Math.min(Math.max(middle - width / 2, MARGIN), window.innerWidth - MARGIN - width);
    card.classList.toggle('beside-below', !above);
    card.classList.toggle('beside-above', above);
    card.style.left = `${left}px`;
    card.style.top = `${above ? box.top - GAP - height : box.bottom + GAP}px`;
    card.style.setProperty('--arrow-x', `${middle - left}px`);
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
      place();
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
    close();
    current = null;
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
          close();
          current = null;
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
