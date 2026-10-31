// The chooser of the deck studied, at the top of Review and Learn: a button
// naming the deck (and another on the card's top line in Review, where the
// first is put away while a card is up), which opens a panel listing the decks as a tree that
// folds. Only the decks inside no other show at first, each with ▸ to show
// the decks inside it; the branch of the deck chosen starts open. Each deck
// is shown by its own name, indented under the deck it is inside.
//
// It replaced the phone's own drop-down list (a <select>) on 2026-10-31: that
// showed every deck on a line of its own with its whole path ("Skritter ›
// HSK 2 (3.0) › Section 7"), far too long with decks brought over from
// Skritter (the owner, who chose this over leaving the deeper decks out).
//
// As before, the groups inside the ready-made levels are left out, except
// the one chosen (see fillDeckSelect in decksPanel.js).

import { deckTree, isReadyMadeGroup } from './decks.js';
import { closeOnTapBeside } from './dialogs.js';
import { fillMixed } from './lang.js';
import { t } from './text.js';

// buttons:  the buttons naming the deck chosen, each with a .deck-select-name
// dialog:   the panel it opens (index.html)
// list:     the list in the panel, filled here
// choose(deckId): called when a deck is chosen, '' for all words
//
// Returns { show(decks, chosenId, script) }, which names the deck chosen on
// the button and remembers the decks for the panel.
export function createDeckChooser({ buttons, dialog, list, choose }) {
  // The rows of the panel, in tree order: { id, label, depth, parentId, path }.
  // The first is "All words", with the ID ''.
  let rows = [];
  let chosen = '';
  let script = 'traditional';
  // The decks whose decks inside are shown.
  let unfolded = new Set();

  function show(decks, chosenId, scriptNow) {
    chosen = chosenId;
    script = scriptNow;
    rows = [{ id: '', label: t('review.allWords'), depth: 0, parentId: null, path: t('review.allWords') }];
    // The deck each row is inside is the last row one level up, since the
    // tree lists every deck straight after the one it is inside.
    const above = [];
    for (const { deck, depth, label } of deckTree(decks)) {
      if (isReadyMadeGroup(deck.id) && deck.id !== chosenId) {
        continue;
      }
      above.length = depth;
      rows.push({ id: deck.id, label: deck.name, depth, parentId: above[depth - 1] ?? null, path: label });
      above.push(deck.id);
    }
    const current = rows.find((row) => row.id === chosen) || rows[0];
    for (const button of buttons) {
      fillMixed(button.querySelector('.deck-select-name'), current.label, script);
      button.setAttribute('aria-label', t('review.deckToStudyIs', { deck: current.path }));
    }
    if (dialog.open) {
      render();
    }
  }

  // The decks the chosen one is inside, so that it can be seen.
  function branchOf(id) {
    const branch = new Set();
    let row = rows.find((entry) => entry.id === id);
    while (row?.parentId) {
      branch.add(row.parentId);
      row = rows.find((entry) => entry.id === row.parentId);
    }
    return branch;
  }

  function render() {
    const hasInside = new Set(rows.map((row) => row.parentId).filter(Boolean));
    const shown = rows.filter((row) => {
      for (let parent = row.parentId; parent; parent = rows.find((entry) => entry.id === parent).parentId) {
        if (!unfolded.has(parent)) {
          return false;
        }
      }
      return true;
    });
    list.replaceChildren(
      ...shown.map((row) => {
        const item = document.createElement('li');
        item.className = 'deck-choice-row';
        // How far it is indented (style.css).
        item.style.setProperty('--depth', row.depth);
        const label = document.createElement('label');
        label.className = 'deck-choice';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'study-deck';
        radio.value = row.id;
        radio.checked = row.id === chosen;
        const name = document.createElement('span');
        fillMixed(name, row.label, script);
        label.append(radio, name);
        item.append(label);
        if (hasInside.has(row.id)) {
          const fold = document.createElement('button');
          fold.type = 'button';
          fold.className = 'deck-fold';
          fold.dataset.deck = row.id;
          fold.setAttribute('aria-expanded', String(unfolded.has(row.id)));
          fold.setAttribute('aria-label', t('review.decksInside', { deck: row.path }));
          fold.innerHTML =
            '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5 L16 12 L9 19" /></svg>';
          item.append(fold);
        }
        return item;
      }),
    );
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      unfolded = branchOf(chosen);
      render();
      dialog.showModal();
      // The keyboard's focus on the deck chosen, not the first in the list.
      list.querySelector('input:checked')?.focus();
    });
  }

  // Choosing a deck closes the panel; so does tapping the one already chosen.
  list.addEventListener('change', (event) => {
    chosen = event.target.value;
    dialog.close();
    choose(chosen);
  });
  list.addEventListener('click', (event) => {
    if (event.target.matches?.('input') && event.target.value === chosen) {
      dialog.close();
    }
    const fold = event.target.closest('.deck-fold');
    if (fold) {
      const id = fold.dataset.deck;
      if (unfolded.has(id)) {
        unfolded.delete(id);
      } else {
        unfolded.add(id);
      }
      render();
      list.querySelector(`.deck-fold[data-deck="${CSS.escape(id)}"]`)?.focus();
    }
  });
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  closeOnTapBeside(dialog);

  return { show };
}
