// The decks in the Decks tab: the front page with the decks that are inside
// no other, a page per deck with the decks inside it, the form to add a
// deck, and the pop-up panel ("Deck settings") to rename a deck, move it,
// give it a daily goal of its own or delete it.
//
// The tree itself is worked out by the plain-calculation code in decks.js;
// this file is the page side, and saves the results in the database. It is
// set up by wordsPanel.js, which shows the words of the deck that is open,
// reads the words and decks and hands them over through the functions below.

import { putAll, removeDecks, removeWords, randomId } from './db.js';
import { allCardIds } from './session.js';
import {
  lastActivity,
  deckTree,
  deckWithInside,
  canBeInside,
  newDeckRecord,
  isInDecks,
  withDeck,
  withoutDecks,
  wordsOnlyIn,
  DEFAULT_DECK,
} from './decks.js';

const byId = (id) => document.getElementById(id);

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// Fills a <select> with one entry per deck, in tree order, after the entries
// in `first` ([{ value, label }]). The choice made is kept if it is still
// among them.
//
// skip: optional; a function saying which decks to leave out
export function fillDeckSelect(select, decks, first, skip = () => false) {
  const chosen = select.value;
  const option = (value, label) => {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = label;
    return element;
  };
  select.replaceChildren(
    ...first.map(({ value, label }) => option(value, label)),
    ...deckTree(decks)
      .filter(({ deck }) => !skip(deck))
      .map(({ deck, label }) => option(deck.id, label)),
  );
  if ([...select.options].some((entry) => entry.value === chosen)) {
    select.value = chosen;
  }
}

// getWords, getDecks, getCards: return the word, deck and card records as
//              last read from the database
// isLearned(word): whether a word has been learned
// getOpenDeck: returns the deck whose page is open, or null on the front page
// open(deckId): opens a deck's page; null for the front page
// study(deckId, mode): shows Review ('review') or Learn ('learn') for a deck
// afterChange: called after anything was saved, to read it all afresh and
//              show it (which calls render() here)
//
// Returns { render() }.
export function createDecksPanel({ getWords, getDecks, getCards, isLearned, getOpenDeck, open, study, afterChange }) {
  const listElement = byId('deck-list');
  const pathElement = byId('deck-path');
  const addForm = byId('add-deck-form');
  const addName = byId('add-deck-name');
  const dialog = byId('deck-dialog');
  const nameInput = byId('deck-name');
  const parentSelect = byId('deck-parent');
  const goalInput = byId('deck-goal');
  const note = byId('deck-dialog-note');
  const buttons = byId('deck-buttons');
  const deleteChoice = byId('deck-delete-choice');
  const deleteKeepButton = byId('deck-delete-keep');
  const deleteWordsButton = byId('deck-delete-words');

  // The deck open in the dialog.
  let openDeck = null;

  const NO_PARENT = [{ value: '', label: 'No other deck' }];

  // The words in a deck or in the decks inside it.
  function wordsIn(deck) {
    const ids = deckWithInside(getDecks(), deck.id);
    return getWords().filter((word) => isInDecks(word, ids));
  }

  // How a deck stands: { text, percent }.
  //   text:    "120 words · 35 learned (29%) · 8 due"
  //   percent: how many of its words are learned, out of 100; null for a
  //            deck without words
  // "Learned" is the Learn tab's meaning of the word: the word has been
  // through its lesson or has a studied card (isLearned in session.js).
  function countsOf(deck) {
    const inDeck = wordsIn(deck);
    const wordIds = new Set(inDeck.map((word) => word.id));
    const now = Date.now();
    const due = getCards().filter((card) => wordIds.has(card.wordId) && card.due <= now).length;
    const learned = inDeck.filter(isLearned).length;
    // Rounded down, so that 100% is only said when every word is learned.
    const percent = inDeck.length > 0 ? Math.floor((100 * learned) / inDeck.length) : null;
    return {
      text:
        `${plural(inDeck.length, 'word')} · ${learned} learned` +
        (percent === null ? '' : ` (${percent}%)`) +
        (due > 0 ? ` · ${due} due` : ''),
      percent,
    };
  }

  // A bar filled as far as a deck's words are learned, to go under its
  // counts. Only decoration: the counts say the same in words.
  function fillBar(bar, percent) {
    bar.hidden = percent === null;
    bar.replaceChildren();
    if (percent !== null) {
      const filled = document.createElement('span');
      filled.style.width = `${percent}%`;
      bar.append(filled);
    }
  }

  // The deck a deck is inside, or null (also if that one is not there).
  const parentOf = (deck) => getDecks().find((other) => other.id === deck.parentId) || null;

  // The line saying where you are: "Decks › Textbook › Chapter 2". Every
  // part but the last is a button that goes there.
  function renderPath(current) {
    const above = [];
    for (let deck = current && parentOf(current); deck && !above.includes(deck); deck = parentOf(deck)) {
      above.unshift(deck);
    }
    const link = (text, deckId) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'path-part';
      button.textContent = text;
      button.addEventListener('click', () => open(deckId));
      return button;
    };
    const parts = current ? [link('Decks', null), ...above.map((deck) => link(deck.name, deck.id))] : [];
    pathElement.replaceChildren(...parts.flatMap((part) => [part, ' › ']), ...(current ? [current.name] : []));
    byId('deck-path-row').hidden = !current;
  }

  // "Back" goes up one level: to the deck this one is inside, or from a deck
  // inside no other to the front page.
  byId('deck-back-button').addEventListener('click', () => {
    const parent = parentOf(getOpenDeck());
    open(parent ? parent.id : null);
  });

  function render() {
    const decks = getDecks();
    const current = getOpenDeck();
    renderPath(current);
    byId('deck-head').hidden = !current;
    byId('decks-hint').hidden = Boolean(current);
    if (current) {
      byId('deck-title').textContent = current.name;
      const counts = countsOf(current);
      byId('deck-counts').textContent = counts.text;
      fillBar(byId('deck-progress'), counts.percent);
    }

    // The decks right inside the one that is open; on the front page, those
    // inside no other.
    // Most recently active first (the owner, 2026-10-14), then in the
    // tree's order.
    const activity = lastActivity(decks, getWords(), getCards());
    const shown = deckTree(decks)
      .filter(({ deck, depth }) => (current ? deck.parentId === current.id : depth === 0))
      .map((row, index) => ({ ...row, index }))
      .sort((a, b) => activity.get(b.deck.id) - activity.get(a.deck.id) || a.index - b.index);
    const rows = shown.map(({ deck }) => {
      const span = (className, text) => {
        const element = document.createElement('span');
        element.className = className;
        element.textContent = text;
        return element;
      };
      const inside = deckWithInside(decks, deck.id).size - 1;
      // Each row is a button, so it can be tapped and reached by keyboard.
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'word-entry deck-entry';
      const counts = countsOf(deck);
      const bar = span('deck-progress', '');
      fillBar(bar, counts.percent);
      button.append(
        span('entry-characters', deck.name),
        span('entry-definition', counts.text + (inside > 0 ? ` · ${plural(inside, 'deck')} inside` : '')),
        bar,
      );
      button.addEventListener('click', () => open(deck.id));
      // Learning and reviewing start from a deck (the owner, 2026-10-14:
      // Learn is no longer in the menu).
      const actions = document.createElement('div');
      actions.className = 'deck-actions';
      for (const [label, mode] of [['Learn', 'learn'], ['Review', 'review']]) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = `small deck-${mode}`;
        action.textContent = label;
        action.addEventListener('click', () => study(deck.id, mode));
        actions.append(action);
      }
      const row = document.createElement('li');
      row.className = 'deck-row';
      row.append(button, actions);
      return row;
    });
    listElement.replaceChildren(...rows);
    byId('deck-list-title').textContent = current ? 'Decks inside this one' : 'Decks';
  }

  // ---- Adding a deck ----

  // "+ New deck" beside the heading opens a small panel for its name (the
  // owner, 2026-10-14: a box under the list would be pushed out of sight by
  // many decks). A new deck goes inside the deck whose page is open.
  const newDeckDialog = byId('new-deck-dialog');
  byId('new-deck-button').addEventListener('click', () => {
    const current = getOpenDeck();
    byId('new-deck-title').textContent = current ? `New deck inside ${current.name}` : 'New deck';
    addName.value = '';
    newDeckDialog.showModal();
    addName.focus();
  });
  byId('new-deck-cancel').addEventListener('click', () => newDeckDialog.close());
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // or the browser would reload the page
    const name = addName.value.trim();
    if (name === '') {
      addName.focus();
      return;
    }
    const current = getOpenDeck();
    await putAll('decks', [newDeckRecord(randomId(), name, current ? current.id : null, getDecks())]);
    addName.value = '';
    newDeckDialog.close();
    await afterChange();
  });

  // ---- A deck's page ----

  byId('deck-review-button').addEventListener('click', () => study(getOpenDeck().id, 'review'));
  byId('deck-learn-button').addEventListener('click', () => study(getOpenDeck().id, 'learn'));
  byId('deck-settings-button').addEventListener('click', () => openDialog(getOpenDeck()));

  // ---- Deck settings: rename, move, daily goal, delete ----

  function showDeleteChoice(shown) {
    buttons.hidden = shown;
    deleteChoice.hidden = !shown;
  }

  function openDialog(deck) {
    openDeck = deck;
    byId('deck-dialog-title').textContent = deck.name;
    byId('deck-dialog-status').textContent = countsOf(deck);
    nameInput.value = deck.name;
    // A deck cannot go inside itself or inside a deck that is inside it.
    fillDeckSelect(parentSelect, getDecks(), NO_PARENT, (other) => !canBeInside(getDecks(), deck.id, other.id));
    parentSelect.value = parentOf(deck) ? deck.parentId : '';
    goalInput.value = Number.isInteger(deck.newWordsPerDay) ? deck.newWordsPerDay : '';
    note.textContent = '';
    showDeleteChoice(false);
    // showModal() opens a <dialog> on top of the page and dims the rest.
    dialog.showModal();
  }

  byId('deck-dialog-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    if (name === '') {
      note.textContent = 'The deck needs a name.';
      return;
    }
    const goal = goalInput.value.trim() === '' ? null : Number(goalInput.value);
    if (goal !== null && !(Number.isInteger(goal) && goal >= 0 && goal <= 50)) {
      note.textContent = 'New words per day is a whole number from 0 to 50, or empty.';
      return;
    }
    // Start from the record as it is, without a goal; it gets one if given.
    const { newWordsPerDay, ...rest } = openDeck;
    const saved = { ...rest, name, parentId: parentSelect.value || null };
    if (goal !== null) {
      saved.newWordsPerDay = goal;
    }
    await putAll('decks', [saved]);
    await afterChange();
    dialog.close();
  });

  // Where the words go that deleting the open deck would leave in no deck,
  // if they are kept: the deck it is inside, or the deck the app started
  // with. null if that one is being deleted too, so there is nowhere.
  function homeAfterDelete() {
    const going = deckWithInside(getDecks(), openDeck.id);
    const parent = parentOf(openDeck);
    if (parent) {
      return parent;
    }
    return going.has(DEFAULT_DECK.id)
      ? null
      : getDecks().find((deck) => deck.id === DEFAULT_DECK.id) || DEFAULT_DECK;
  }

  // Delete asks first what is to become of the deck's words.
  byId('deck-delete-button').addEventListener('click', () => {
    const ids = deckWithInside(getDecks(), openDeck.id);
    const inDeck = wordsIn(openDeck);
    const onlyHere = wordsOnlyIn(getWords(), ids);
    const home = homeAfterDelete();
    const inside = ids.size - 1;
    const these = onlyHere.length === inDeck.length ? 'They' : `${onlyHere.length} of them`;
    byId('deck-delete-text').textContent =
      `Delete "${openDeck.name}"` +
      (inside > 0 ? ` and the ${plural(inside, 'deck')} inside it` : '') +
      '? ' +
      (inDeck.length === 0
        ? 'It has no words.'
        : `It has ${plural(inDeck.length, 'word')}. ` +
          (onlyHere.length === 0
            ? 'All of them are in another deck too, and stay there.'
            : `${these} ${onlyHere.length === 1 && these !== 'They' ? 'is' : 'are'} in no other deck. ` +
              (home
                ? `Keep them, and they move to "${home.name}"; or remove them, with their cards. `
                : 'There is no other deck for them to move to: put them in another deck first, or remove them, with their cards. ') +
              'Your review history is kept either way.'));
    deleteKeepButton.textContent = onlyHere.length > 0 ? 'Delete the deck, keep the words' : 'Delete the deck';
    deleteKeepButton.hidden = onlyHere.length > 0 && !home;
    deleteWordsButton.textContent = `Delete the deck and remove ${plural(onlyHere.length, 'word')}`;
    deleteWordsButton.hidden = onlyHere.length === 0;
    showDeleteChoice(true);
  });

  byId('deck-delete-cancel').addEventListener('click', () => showDeleteChoice(false));

  // Deletes the open deck and the decks inside it.
  //
  // removeWordsToo: true to also remove the words that are in no other deck;
  //                 false to move them (see homeAfterDelete)
  async function deleteDeck(removeWordsToo) {
    const ids = deckWithInside(getDecks(), openDeck.id);
    const onlyHere = wordsOnlyIn(getWords(), ids);
    const going = new Set(removeWordsToo ? onlyHere.map((word) => word.id) : []);
    const home = homeAfterDelete();
    const parent = parentOf(openDeck);
    // The words that stay are taken out of the decks first, so that no word
    // is ever left in a deck that is not there; one left in no deck moves.
    const staying = getWords()
      .filter((word) => isInDecks(word, ids) && !going.has(word.id))
      .map((word) => withoutDecks(word, ids))
      .map((word) => (word.decks ? word : withDeck(word, home.id)));
    const decksLeft = getDecks().filter((deck) => !ids.has(deck.id));
    // The deck the app started with is made again if words move to it and it
    // is gone, or if no deck would be left at all.
    const needsDefault =
      !decksLeft.some((deck) => deck.id === DEFAULT_DECK.id) &&
      (decksLeft.length === 0 || staying.some((word) => word.decks.includes(DEFAULT_DECK.id)));
    await putAll('words', staying);
    await removeWords(
      onlyHere
        .filter((word) => going.has(word.id))
        .map((word) => ({ wordId: word.id, cardIds: allCardIds(word) })),
    );
    await removeDecks([...ids]);
    if (needsDefault) {
      await putAll('decks', [DEFAULT_DECK]);
    }
    dialog.close();
    // Its page is gone: on to the deck it was inside, or the front page.
    await open(parent ? parent.id : null);
    await afterChange();
  }

  deleteKeepButton.addEventListener('click', () => deleteDeck(false));
  deleteWordsButton.addEventListener('click', () => deleteDeck(true));

  byId('deck-dialog-close').addEventListener('click', () => dialog.close());

  return { render };
}
