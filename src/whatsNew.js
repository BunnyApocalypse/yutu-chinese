// "What's new": what changed in the app since it was last opened on this
// device, in a pop-up when the app starts (the owner, 2026-10-18: every
// release since then, not only the latest, for someone who was away through
// several). The whole list is under Help in Settings. The entries are in
// src/changes.js.
//
// Which entry this device was last shown is kept in localStorage, not in the
// database: it belongs to the device, so it stays out of backups, and
// restoring an older backup doesn't bring the pop-up back. The test copy
// keeps its own (see db.js).

/* global __CHANNEL__ */

import { CHANGES, changesSince, changeDate } from './changes.js';
import { closeOnTapBeside } from './dialogs.js';
import { language } from './text.js';
import { fillMixed } from './lang.js';

const SEEN_KEY = __CHANNEL__ ? `changes-seen-${__CHANNEL__}` : 'changes-seen';

const byId = (id) => document.getElementById(id);

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY);
  } catch {
    // Storage refused (a private window, for one): as if never shown.
    return null;
  }
}

function markAllSeen() {
  try {
    if (CHANGES.length > 0) {
      localStorage.setItem(SEEN_KEY, CHANGES[0].id);
    }
  } catch {
    // As above: the pop-up may come again next time.
  }
}

// openFeedback: opens "Send feedback", from the line at the pop-up's bottom.
// Returns { openIfNew(isFirstUse), openAll() }.
export function createWhatsNew(openFeedback) {
  const dialog = byId('whats-new-dialog');
  const intro = byId('whats-new-intro');
  const list = byId('whats-new-list');

  function show(entries, sinceLastTime) {
    list.replaceChildren();
    let lastDate = null;
    for (const entry of entries) {
      // Two releases on one day ("2026-10-22", "2026-10-22-2") go under one
      // date (the owner, 2026-10-25).
      const date = changeDate(entry.id);
      if (date !== lastDate) {
        const heading = document.createElement('h3');
        heading.textContent = date;
        list.append(heading);
        lastDate = date;
      }
      const items = document.createElement('ul');
      // In the reader's language when the entry has it (`it`, `de`), else
      // in English, marked as such for screen readers.
      const translated = entry[language];
      for (const text of translated ?? entry.items) {
        const item = document.createElement('li');
        // Chinese in a line (辶, 隨) marked as such; the entries write
        // characters in their traditional forms.
        fillMixed(item, text, 'traditional');
        if (!translated && language !== 'en') {
          item.lang = 'en';
        }
        items.append(item);
      }
      list.append(items);
    }
    intro.hidden = !sinceLastTime;
    dialog.showModal();
    // Marked as soon as it is shown, so that it never comes up twice, even
    // if the app is closed with the pop-up still open.
    markAllSeen();
  }

  byId('whats-new-close').addEventListener('click', () => dialog.close());
  byId('whats-new-feedback').addEventListener('click', () => {
    dialog.close();
    openFeedback();
  });
  closeOnTapBeside(dialog);

  return {
    // Called once the app has started. On the very first use (before the
    // introduction) nothing is new: everything is marked as seen.
    openIfNew(isFirstUse) {
      if (isFirstUse) {
        markAllSeen();
        return;
      }
      const entries = changesSince(CHANGES, readSeen());
      if (entries.length > 0) {
        show(entries, true);
      }
    },
    openAll() {
      show(CHANGES, false);
    },
  };
}
