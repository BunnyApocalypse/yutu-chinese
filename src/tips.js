// A short tip the first time something comes up (the owner, 2026-10-14: the
// introduction is a wall of text many people will not read). A card with
// "Got it", which nothing waits for. Each tip is shown once per device;
// Settings can show them all again, or switch them off.
//
// Since 2026-10-15 (the owner, after testing, where tips of two or three
// sentences at the bottom of the screen went unread): one line each, about
// one thing on the screen, shown beside it with a small arrow pointing at it,
// when it first matters.
//
// The rest of the app says what has just come up by announcing it:
//
//     document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'decks' }));
//
// so that the screens need to know nothing about tips. Announcements without
// a tip ('review', 'learn', 'words', ...) are let pass.
//
// A tip announced waits until its element is in view (the parts on a word's
// page may be further down), and while it is up it follows the element. If
// the element goes out of view (another tab, the page scrolled, a pop-up panel
// over it), the tip is put away and waits for it to come back.
//
// The card is a popover (the `popover` attribute), which the browser puts in
// the top layer, above the page. Browsers without popovers get a plain card
// with position: fixed, which works the same here.

import { getSetting, setSetting } from './db.js';

// Each tip: its text, the element it is about (a CSS selector), and on which
// side of it the tip goes if there is room ('above' or 'below').
//
// Taken out on 2026-10-15: the tip the first time something was written,
// "Write anywhere in the box, at any size." (the owner found writing plain
// enough without it, with the animations), and the Words tab's, "Tap a word
// for its page. Free practice tries any card without it counting." (a word
// is what anyone would tap; Free practice is for the pass over the looks).
const TIPS = {
  // The first time the grades are offered (review.js), in Review or at a
  // lesson's graded step.
  grades: {
    text: 'How was this card? Choose, or tap the card to take the suggestion.',
    target: '#grade-row',
    side: 'below',
  },
  // The first step of a lesson, which shows "I know this word" (review.js).
  // Until 2026-10-15 this was the Learn tab's tip ('learn'), shown when the
  // tab opened, before the button was there.
  lesson: {
    text: 'Already know a word? "I know this word" skips its lesson.',
    target: '#skip-lesson-button',
    side: 'below',
  },
  // The first character judged in a word of several (wordFlow.js): one
  // character has no row of boxes, and its grade is its verdict. Above the
  // row, so as not to cover the writing area while the next one is written.
  verdict: {
    text: 'Tap a character\'s box if the app judged it wrong.',
    target: '#word-row',
    side: 'above',
  },
  // The first time a character can be written (wordFlow.js): the gestures
  // on the writing area (gestures.js), which nothing on screen shows. Under
  // the buttons, so as not to cover the writing area.
  gestures: {
    text: 'Hold still on the writing area for a hint; swipe up to start again.',
    target: '#restart-button',
    side: 'below',
  },
  decks: {
    text: 'Everything else is in the menu, ☰ at the top left.',
    target: '#menu-button',
    side: 'below',
  },
  // The first deck's ›, the first time decks are listed (decksPanel.js):
  // a tap on the row starts studying, so the way to a deck's words is not
  // what it was (2026-10-16).
  deckRows: {
    text: 'Tap a deck to study it; › for its words and settings.',
    target: '#deck-list .deck-open',
    side: 'below',
  },
  // The first level's Add button (or the one Add of a list whose levels are
  // ticked), once the list has loaded.
  ready: {
    text: 'Add one level at a time: each takes a few months.',
    target: '#ready-levels button',
    side: 'below',
  },
  // Below the first character's parts: above them it would cover the
  // character itself, which can be tapped too.
  wordPage: {
    text: 'Tap a character or part to see more about it.',
    target: '#word-page .character-parts',
    side: 'below',
  },
};

// The room kept between the tip and the element, and the edge of the screen.
const GAP = 10;
const MARGIN = 12;

// How often the tip on screen is moved to follow its element, and a waiting
// one looks whether its element has come into view. Simpler than watching
// for every way an element can move or appear, and cheap: nothing is done
// while no tip is up or waiting.
const LOOK_EVERY_MS = 200;

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
  // The modal pop-up panels that are open, the last opened last: the card
  // goes inside the last, since everything outside it is out of reach.
  const openPanels = [];

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

  // Where the tip's element is on the screen, or null if it cannot be seen
  // and reached: not shown, not wholly on the screen, or hidden. Hidden is
  // asked of the browser: what is at the middle of the element must be the
  // element (or inside it, or the tip itself), not a pop-up panel over it,
  // nor what is in view where a panel's own scrolling has moved it out of
  // sight (the parts on a word's page).
  function targetBox(key) {
    const target = document.querySelector(TIPS[key].target);
    if (!target) {
      return null;
    }
    const box = target.getBoundingClientRect();
    if (box.width === 0 || box.height === 0 || box.top < 0 || box.bottom > window.innerHeight) {
      return null;
    }
    const there = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return there && (target.contains(there) || card.contains(there)) ? box : null;
  }

  // Puts the tip beside its element: above or below, on the side the tip
  // asks for if there is room there, and as near the element's middle as the
  // screen's edges allow. The class "beside-above" or "beside-below" says
  // which, for the arrow, and --arrow-x where along the tip the arrow is.
  function place(box) {
    // With the class on, the style sheet gives the tip its width, so its
    // size can be measured.
    card.classList.add('beside-below');
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    const roomAbove = box.top - GAP - height >= MARGIN;
    const roomBelow = box.bottom + GAP + height <= window.innerHeight - MARGIN;
    const above = TIPS[current].side === 'above' ? roomAbove || !roomBelow : !roomBelow && roomAbove;
    const middle = box.left + box.width / 2;
    const left = Math.min(Math.max(middle - width / 2, MARGIN), window.innerWidth - MARGIN - width);
    card.classList.toggle('beside-below', !above);
    card.classList.toggle('beside-above', above);
    card.style.left = `${left}px`;
    card.style.top = `${above ? box.top - GAP - height : box.bottom + GAP}px`;
    card.style.setProperty('--arrow-x', `${middle - left}px`);
  }

  // The card goes inside the pop-up panel opened last, if any (it could not
  // be tapped outside it), or else in the page.
  function moveCard() {
    const parent = openPanels.at(-1) || document.body;
    if (card.parentElement !== parent) {
      parent.append(card); // which closes a popover
    }
  }

  // Shows the first waiting tip whose element is in view, unless a tip is
  // up, or the introduction or "What's new" (whatsNew.js) is: those are read
  // first. Closing either is seen by the watch on pop-ups below.
  function next() {
    if (current || byId('welcome').open || byId('whats-new-dialog').open) {
      return;
    }
    const key = waiting.find((waitingKey) => targetBox(waitingKey));
    if (!key) {
      return;
    }
    waiting.splice(waiting.indexOf(key), 1);
    current = key;
    text.textContent = TIPS[key].text;
    moveCard();
    open();
    place(targetBox(key));
  }

  // The tip on screen follows its element, or is put away to wait for it;
  // then a waiting tip may come up.
  function look() {
    if (current) {
      const box = targetBox(current);
      if (box) {
        place(box);
      } else {
        close();
        waiting.unshift(current);
        current = null;
      }
    }
    next();
  }

  function ask(key) {
    if (on && TIPS[key] && !seen.has(key) && current !== key && !waiting.includes(key)) {
      waiting.push(key);
      next();
    }
  }

  document.addEventListener('screen-shown', (event) => ask(event.detail));
  setInterval(() => {
    if (current || waiting.length > 0) {
      look();
    }
  }, LOOK_EVERY_MS);

  // Keeps the list of open pop-up panels, and looks again whenever one opens
  // or closes: a tip under a panel is put away, and one inside it comes up.
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
    look();
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
    // Every tip is shown again, each the next time it comes up.
    async showAgain() {
      seen = new Set();
      await setSetting('tipsSeen', []);
      await this.setOn(true);
    },
  };
}
