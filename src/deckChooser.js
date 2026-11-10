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
//
// Review's chooser has tickboxes instead (the owner, 2026-11-10): as many
// decks as wanted, and the cards in the other script with them. A deck
// ticked includes the decks inside it, shown ticked and greyed; "All words"
// is ticked when nothing else is. The panel stays open while ticking, and
// the choice is made when it closes, by "Done" or any other way.

import { deckTree, isReadyMadeGroup } from './decks.js';
import { closeOnTapBeside } from './dialogs.js';
import { fillMixed } from './lang.js';
import { formatList, t } from './text.js';

const byId = (id) => document.getElementById(id);

// What the panel shows while it is open: its rows in tree order, each
// { id, label, depth, parentId, path } (label: the deck's own name; path:
// its whole path); the ID of the deck chosen; the script its Chinese is in
// (lang.js); the decks whose decks inside are shown; and choose(id), called
// with the deck tapped. A row may also have `note` (said after its name,
// "12 to learn"), `script` (its own script, for Chinese in it) and
// `heading` (a line of text before it, "New words from").
// With tickboxes, `ticked` is a Set of the IDs ticked (none for all words),
// and choose(ids) is called with them as the panel closes, if they changed.
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
  // A tickbox changes what is ticked, and the panel stays open.
  list.addEventListener('change', (event) => {
    if (panel.ticked) {
      tick(event.target.value, event.target.checked);
      render();
      list.querySelector(`input[value="${CSS.escape(event.target.value)}"]`)?.focus();
      return;
    }
    dialog.close();
    panel.choose(event.target.value);
  });
  list.addEventListener('click', (event) => {
    if (!panel.ticked && event.target.matches?.('input') && event.target.value === panel.chosen) {
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
  byId('deck-choice-done').addEventListener('click', () => dialog.close());
  // The decks ticked are chosen as the panel closes, however it is closed:
  // ticks are not lost to a tap beside it.
  dialog.addEventListener('close', () => {
    if (!dialog.open) {
      finishTicking(panel);
    }
  });
  closeOnTapBeside(dialog);
}

// Chooses what a panel with tickboxes has ticked, if it changed, once. The
// browser sends "close" a moment after the panel closes: a button opening
// the panel again before then finishes the one closed first
// (finishClosedPanel), before it reads what is chosen, or those ticks would
// be lost.
function finishTicking(closed) {
  if (!closed?.ticked || closed.finished) {
    return;
  }
  closed.finished = true;
  const ids = [...closed.ticked];
  const same = ids.length === closed.chosen.length && ids.every((id) => closed.chosen.includes(id));
  if (!same) {
    closed.choose(ids);
  }
}

// A tickbox ticked (on) or unticked. "All words" ('') unticks everything
// else; a deck ticked takes the place of the decks inside it that were
// ticked, as it includes them.
function tick(id, on) {
  const { ticked, rows } = panel;
  if (id === '') {
    ticked.clear();
    return;
  }
  if (!on) {
    ticked.delete(id);
    return;
  }
  ticked.add(id);
  for (const row of rows) {
    if (ancestorsOf(rows, row.id).has(id)) {
      ticked.delete(row.id);
    }
  }
}

function finishClosedPanel() {
  if (panel && !byId('deck-choice-dialog').open) {
    finishTicking(panel);
  }
}

// Whether the row is inside a deck ticked: then it is ticked too, and greyed.
function insideTicked(row) {
  return [...ancestorsOf(panel.rows, row.id)].some((id) => panel.ticked.has(id));
}

// The decks the deck with this ID is inside (so that it can be seen).
function ancestorsOf(rows, id) {
  const branch = new Set();
  let row = rows.find((entry) => entry.id === id);
  while (row?.parentId) {
    branch.add(row.parentId);
    row = rows.find((entry) => entry.id === row.parentId);
  }
  return branch;
}

// Opens the panel. title: its heading; rows, chosen, script, choose: as for
// `panel` above. `chosen` is a list of IDs for tickboxes.
function openPanel({ title, rows, chosen, script, choose }) {
  addPanelListeners();
  const ticked = Array.isArray(chosen) ? new Set(chosen) : null;
  // The branches of the decks chosen start open.
  const unfolded = new Set((ticked ? chosen : [chosen]).flatMap((id) => [...ancestorsOf(rows, id)]));
  panel = { rows, chosen, script, choose, unfolded, ticked };
  byId('deck-choice-title').textContent = title;
  byId('deck-choice-bar').hidden = !ticked;
  render();
  byId('deck-choice-dialog').showModal();
  // The keyboard's focus on the deck chosen, not the first in the list.
  byId('deck-choice-list').querySelector('input:checked')?.focus();
}

function render() {
  const { rows, chosen, script, unfolded, ticked } = panel;
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
      radio.type = ticked ? 'checkbox' : 'radio';
      radio.name = 'deck-choice';
      radio.value = row.id;
      if (!ticked) {
        radio.checked = row.id === chosen;
      } else if (row.id === '') {
        radio.checked = ticked.size === 0;
      } else {
        radio.checked = ticked.has(row.id) || insideTicked(row);
        radio.disabled = radio.checked && !ticked.has(row.id);
      }
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
// choose(deckId): called when a deck is chosen, '' for all words; with
//           tickboxes, choose(ids) with the IDs ticked, [] for all words
//
// show(decks, chosenId, script, first): `first`, if given, is an entry before
// the decks, { id, label, note, script, title, heading } (in Learn, the forms
// in the other script, otherScript.js; in Review, the cards there): the
// panel then has its `title`, and the decks a heading of their own
// (`heading`, or "New words from"). `chosenId` a list of IDs (Review) has
// the panel show tickboxes; the buttons then say "3 decks" where more than
// one is ticked, or "简体字 cards + 2 decks".
// notes(), if given: a Map of a note for each row by its ID ("12 due",
//           '' for all words), asked for as the panel opens, so that it is
//           not worked out at every card; or null for none
//
// Returns { show(decks, chosenId, script) }, which names the deck chosen on
// the buttons and remembers the decks for the panel.
export function createDeckChooser({ buttons, choose, notes = () => null }) {
  // "All words" has the ID ''.
  let rows = [];
  let chosen = '';
  let script = 'traditional';
  let title = '';

  function show(decks, chosenId, scriptNow, first = null) {
    chosen = chosenId;
    script = scriptNow;
    title = first?.title ?? t(Array.isArray(chosenId) ? 'review.reviewDecksTitle' : 'review.chooseDeckTitle');
    const entry = first && {
      id: first.id,
      label: first.label,
      depth: 0,
      parentId: null,
      path: first.label,
      note: first.note,
      script: first.script,
    };
    const allWords = { id: '', label: t('review.allWords'), depth: 0, parentId: null, path: t('review.allWords') };
    const heading = first && (first.heading ?? t('learnForms.newWordsFrom'));
    // With tickboxes "All words" is first, as ticking it unticks the rest
    // (the owner, 2026-11-10), and the heading goes on the first deck.
    // Otherwise the entry is first, and the heading on "All words".
    rows = Array.isArray(chosenId)
      ? [allWords, ...(entry ? [entry] : [])]
      : [...(entry ? [entry] : []), { ...allWords, ...(heading && { heading }) }];
    let headingLeft = Array.isArray(chosenId) ? heading : null;
    // The deck each row is inside is the last row one level up, since the
    // tree lists every deck straight after the one it is inside.
    const kept = new Set(Array.isArray(chosenId) ? chosenId : [chosenId]);
    const above = [];
    for (const { deck, depth, label } of deckTree(decks)) {
      if (isReadyMadeGroup(deck.id) && !kept.has(deck.id)) {
        continue;
      }
      above.length = depth;
      rows.push({
        id: deck.id,
        label: deck.name,
        depth,
        parentId: above[depth - 1] ?? null,
        path: label,
        ...(headingLeft && { heading: headingLeft }),
      });
      headingLeft = null;
      above.push(deck.id);
    }
    const picked = Array.isArray(chosen) ? rows.filter((row) => kept.has(row.id)) : [];
    if (picked.length > 1) {
      // Several ticked: how many, the entry before the decks by its name.
      const entry = first && picked.find((row) => row.id === first.id);
      const count = picked.length - (entry ? 1 : 0);
      const label = entry ? t('review.entryAndDecks', { entry: entry.label, count }) : t('review.decksTicked', { count });
      for (const button of buttons) {
        fillMixed(button.querySelector('.deck-select-name'), label, entry?.script ?? script);
        button.setAttribute('aria-label', t('review.decksToStudyAre', { decks: formatList(picked.map((row) => row.path)) }));
      }
    } else {
      const current = picked[0] || rows.find((row) => row.id === chosen) || rows[0];
      for (const button of buttons) {
        fillMixed(button.querySelector('.deck-select-name'), current.label, current.script ?? script);
        button.setAttribute('aria-label', t('review.deckToStudyIs', { deck: current.path }));
      }
    }
    // The decks changed while the panel was open: shown afresh.
    if (byId('deck-choice-dialog').open && panel?.owner === show) {
      panel.rows = withNotes(rows);
      panel.script = script;
      render();
    }
  }

  // The rows with their notes, where notes() has one.
  function withNotes(list) {
    const each = notes();
    return each ? list.map((row) => (each.has(row.id) ? { ...row, note: each.get(row.id) } : row)) : list;
  }

  for (const button of buttons) {
    button.addEventListener('click', () => {
      finishClosedPanel();
      openPanel({
        title,
        rows: withNotes(rows),
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
    finishClosedPanel();
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
