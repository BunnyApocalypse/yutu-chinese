// Choosing a deck: a button naming the deck chosen, which opens a panel
// listing the decks as a tree that folds. Only the decks inside no other
// show at first, each with › to show the decks inside it; the branch of the
// deck chosen starts open. Each deck is shown by its own name, indented
// under the deck it is inside.
//
// It replaced the phone's own drop-down list (a <select>) on 2026-10-31: that
// showed every deck on a line of its own with its whole path ("Skritter ›
// HSK 2 (3.0) › Section 7"), far too long with decks brought over from
// Skritter (the owner, who chose this over leaving the deeper decks out).
// First for the deck studied in Review and Learn (createDeckChooser); on
// 2026-11-01 everywhere else a deck is chosen too (deckButtonFor; the owner).
//
// There is one panel (deck-choice-dialog in index.html), shared by all the
// choosers: each says, when it opens it, what to list and what to do with
// the deck tapped.
//
// As in every deck chooser, the groups inside the ready-made levels are left
// out, except the one chosen (see fillDeckSelect in decksPanel.js).

import { deckTree, isReadyMadeGroup } from './decks.js';
import { closeOnTapBeside } from './dialogs.js';
import { fillMixed } from './lang.js';
import { t } from './text.js';

const byId = (id) => document.getElementById(id);

// What the panel shows while it is open: its rows in tree order, each
// { id, label, depth, parentId, path } (label: the deck's own name; path:
// its whole path); the ID of the deck chosen; the script its Chinese is in
// (lang.js); the decks whose decks inside are shown; and choose(id), called
// with the deck tapped. A row may also have `note` (said after its name,
// "12 to learn"), `script` (its own script, for Chinese in it) and
// `heading` (a line of text before it, "New words from").
let panel = null;
let listenersAdded = false;

// The panel's own buttons, set up the first time it opens.
function addPanelListeners() {
  if (listenersAdded) {
    return;
  }
  listenersAdded = true;
  const dialog = byId('deck-choice-dialog');
  const list = byId('deck-choice-list');
  // Choosing a deck closes the panel; so does tapping the one already chosen.
  list.addEventListener('change', (event) => {
    dialog.close();
    panel.choose(event.target.value);
  });
  list.addEventListener('click', (event) => {
    if (event.target.matches?.('input') && event.target.value === panel.chosen) {
      dialog.close();
    }
    const fold = event.target.closest('.deck-fold');
    if (fold) {
      const id = fold.dataset.deck;
      if (panel.unfolded.has(id)) {
        panel.unfolded.delete(id);
      } else {
        panel.unfolded.add(id);
      }
      render();
      list.querySelector(`.deck-fold[data-deck="${CSS.escape(id)}"]`)?.focus();
    }
  });
  byId('deck-choice-close').addEventListener('click', () => dialog.close());
  closeOnTapBeside(dialog);
}

// The decks the deck with this ID is inside, so that it can be seen.
function branchOf(rows, id) {
  const branch = new Set();
  let row = rows.find((entry) => entry.id === id);
  while (row?.parentId) {
    branch.add(row.parentId);
    row = rows.find((entry) => entry.id === row.parentId);
  }
  return branch;
}

// Opens the panel. title: its heading; rows, chosen, script, choose: as for
// `panel` above.
function openPanel({ title, rows, chosen, script, choose }) {
  addPanelListeners();
  panel = { rows, chosen, script, choose, unfolded: branchOf(rows, chosen) };
  byId('deck-choice-title').textContent = title;
  render();
  byId('deck-choice-dialog').showModal();
  // The keyboard's focus on the deck chosen, not the first in the list.
  byId('deck-choice-list').querySelector('input:checked')?.focus();
}

function render() {
  const { rows, chosen, script, unfolded } = panel;
  const hasInside = new Set(rows.map((row) => row.parentId).filter(Boolean));
  const shown = rows.filter((row) => {
    for (let parent = row.parentId; parent; parent = rows.find((entry) => entry.id === parent).parentId) {
      if (!unfolded.has(parent)) {
        return false;
      }
    }
    return true;
  });
  byId('deck-choice-list').replaceChildren(
    ...shown.map((row) => {
      const item = document.createElement('li');
      item.className = 'deck-choice-row';
      // How far it is indented (style.css).
      item.style.setProperty('--depth', row.depth);
      const label = document.createElement('label');
      label.className = 'deck-choice';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'deck-choice';
      radio.value = row.id;
      radio.checked = row.id === chosen;
      const name = document.createElement('span');
      fillMixed(name, row.label, row.script ?? script);
      label.append(radio, name);
      if (row.note) {
        const note = document.createElement('span');
        note.className = 'deck-choice-note';
        note.textContent = row.note;
        label.append(note);
      }
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
      if (!row.heading) {
        return item;
      }
      const heading = document.createElement('li');
      heading.className = 'deck-choice-heading';
      heading.textContent = row.heading;
      return [heading, item];
    }).flat(),
  );
}

// The deck studied in Review and Learn.
//
// buttons:  the buttons naming the deck chosen, each with a .deck-select-name
// choose(deckId): called when a deck is chosen, '' for all words
//
// show(decks, chosenId, script, first): `first`, if given, is an entry before
// the decks, { id, label, note, script, title, heading } (in Learn, the forms
// in the other script, otherScript.js; in Review, the cards there): the
// panel then has its `title`, and the decks a heading of their own
// (`heading`, or "New words from").
//
// Returns { show(decks, chosenId, script) }, which names the deck chosen on
// the buttons and remembers the decks for the panel.
export function createDeckChooser({ buttons, choose }) {
  // The first row is "All words", with the ID ''.
  let rows = [];
  let chosen = '';
  let script = 'traditional';
  let title = '';

  function show(decks, chosenId, scriptNow, first = null) {
    chosen = chosenId;
    script = scriptNow;
    title = first?.title ?? t('review.chooseDeckTitle');
    rows = [
      ...(first
        ? [{ id: first.id, label: first.label, depth: 0, parentId: null, path: first.label, note: first.note, script: first.script }]
        : []),
      {
        id: '',
        label: t('review.allWords'),
        depth: 0,
        parentId: null,
        path: t('review.allWords'),
        ...(first && { heading: first.heading ?? t('learnForms.newWordsFrom') }),
      },
    ];
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
      fillMixed(button.querySelector('.deck-select-name'), current.label, current.script ?? script);
      button.setAttribute('aria-label', t('review.deckToStudyIs', { deck: current.path }));
    }
    // The decks changed while the panel was open: shown afresh.
    if (byId('deck-choice-dialog').open && panel?.owner === show) {
      panel.rows = rows;
      panel.script = script;
      render();
    }
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      openPanel({
        title,
        rows,
        chosen,
        script,
        choose: (deckId) => {
          chosen = deckId;
          choose(deckId);
        },
      });
      panel.owner = show;
    });
  }

  return { show };
}

// The panel's rows from a drop-down list filled by fillDeckSelect
// (decksPanel.js), whose entries say which deck each is inside
// (data-parent) and the deck's own name (data-name). An entry that is no
// deck ("All decks") is at the top. A deck whose parent is not in the list
// is at the top too, with its whole path, as its own name would not say
// which it is ("Family" of a TOCFL level).
function rowsFromSelect(select) {
  const rows = [];
  for (const option of select.options) {
    const parent = rows.find((row) => row.id === option.dataset.parent);
    rows.push({
      id: option.value,
      label: parent ? option.dataset.name : option.textContent,
      depth: parent ? parent.depth + 1 : 0,
      parentId: parent ? parent.id : null,
      path: option.textContent,
    });
  }
  return rows;
}

// Everywhere else a deck is chosen: turns a drop-down list of decks, filled
// by fillDeckSelect, into a button that opens the panel. The list stays,
// hidden, and still holds the choice: the code around it reads its value
// and hears its "change" as before, and fills it as before.
//
// titleKey: the text key of the panel's heading, which also names the
//           button to a screen reader ("Deck to add the word to: Animals")
// script(): the script the Chinese in the decks' names is in (lang.js)
//
// Returns the button, whose ID is the list's with "-button" after it.
export function deckButtonFor(select, { titleKey, script }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'deck-select deck-choice-button';
  button.setAttribute('aria-haspopup', 'dialog');
  if (select.id) {
    button.id = `${select.id}-button`;
  }
  const name = document.createElement('span');
  name.className = 'deck-select-name';
  button.append(name);
  // A list on the page is hidden and the button put after it; a list made
  // in code (wordPage.js) is left off the page, and the button placed there.
  select.hidden = true;
  select.parentNode?.insertBefore(button, select.nextSibling);

  // The button names the deck chosen in the list.
  function showChosen() {
    const row = rowsFromSelect(select).find((entry) => entry.id === select.value);
    fillMixed(name, row?.label ?? '', script());
    button.setAttribute('aria-label', t('decks.chosenIs', { what: t(titleKey), deck: row?.path ?? '' }));
  }
  // A list on the page is still empty when the app starts, before the
  // settings are read; one made in code is filled already.
  if (select.options.length > 0) {
    showChosen();
  }
  select.addEventListener('change', showChosen);
  // The list filled afresh. A MutationObserver is told of changes to the
  // page after the code making them is done, so a choice set straight after
  // filling the list (as the Words tab does) is shown too.
  new MutationObserver(showChosen).observe(select, { childList: true });

  button.addEventListener('click', () => {
    openPanel({
      title: t(titleKey),
      rows: rowsFromSelect(select),
      chosen: select.value,
      script: script(),
      choose: (deckId) => {
        select.value = deckId;
        // What a drop-down list announces when someone picks from it.
        select.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
  });
  return button;
}
