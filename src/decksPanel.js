// The Decks section of the Words tab: the decks as a tree, a form to add
// one, and a pop-up panel per deck to rename it, move it, give it a daily
// goal of its own or delete it.
//
// The tree itself is worked out by the plain-calculation code in decks.js;
// this file is the page side, and saves the results in the database. It is
// set up by wordsPanel.js, which reads the words and decks and hands them
// over through the functions below.

import { putAll, removeDecks, removeWords, randomId } from './db.js';
import { allCardIds } from './session.js';
import {
  deckTree,
  deckWithInside,
  canBeInside,
  newDeckRecord,
  isInDecks,
  withoutDecks,
  wordsOnlyIn,
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
// afterChange: called after anything was saved, to read it all afresh and
//              show it (which calls render() here)
//
// Returns { render() }.
export function createDecksPanel({ getWords, getDecks, getCards, isLearned, afterChange }) {
  const listElement = byId('deck-list');
  const addForm = byId('add-deck-form');
  const addName = byId('add-deck-name');
  const addParent = byId('add-deck-parent');
  const dialog = byId('deck-dialog');
  const nameInput = byId('deck-name');
  const parentSelect = byId('deck-parent');
  const goalInput = byId('deck-goal');
  const note = byId('deck-dialog-note');
  const buttons = byId('deck-buttons');
  const deleteChoice = byId('deck-delete-choice');
  const deleteWordsButton = byId('deck-delete-words');

  // The deck open in the dialog.
  let openDeck = null;

  const NO_PARENT = [{ value: '', label: 'No other deck' }];

  // The words in a deck or in the decks inside it.
  function wordsIn(deck) {
    const ids = deckWithInside(getDecks(), deck.id);
    return getWords().filter((word) => isInDecks(word, ids));
  }

  // "120 words · 35 learned · 8 due"
  function countsOf(deck) {
    const inDeck = wordsIn(deck);
    const wordIds = new Set(inDeck.map((word) => word.id));
    const now = Date.now();
    const due = getCards().filter((card) => wordIds.has(card.wordId) && card.due <= now).length;
    return (
      `${plural(inDeck.length, 'word')} · ${inDeck.filter(isLearned).length} learned` +
      (due > 0 ? ` · ${due} due` : '')
    );
  }

  function render() {
    const decks = getDecks();
    const rows = deckTree(decks).map(({ deck, depth }) => {
      const span = (className, text) => {
        const element = document.createElement('span');
        element.className = className;
        element.textContent = text;
        return element;
      };
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'word-entry deck-entry';
      // A deck inside another is set in from the left, further for each level.
      button.style.marginLeft = `${Math.min(depth, 4) * 20}px`;
      button.append(span('entry-characters', deck.name), span('entry-definition', countsOf(deck)));
      button.addEventListener('click', () => openDialog(deck));
      const row = document.createElement('li');
      row.append(button);
      return row;
    });
    listElement.replaceChildren(...rows);
    fillDeckSelect(addParent, decks, NO_PARENT);
    byId('add-deck-parent-row').hidden = decks.length === 0;
  }

  // ---- Adding a deck ----

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // or the browser would reload the page
    const name = addName.value.trim();
    if (name === '') {
      addName.focus();
      return;
    }
    await putAll('decks', [newDeckRecord(randomId(), name, addParent.value || null, getDecks())]);
    addName.value = '';
    await afterChange();
  });

  // ---- One deck: rename, move, daily goal, delete ----

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
    parentSelect.value = getDecks().some((other) => other.id === deck.parentId) ? deck.parentId : '';
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

  // Delete asks first what is to become of the deck's words.
  byId('deck-delete-button').addEventListener('click', () => {
    const ids = deckWithInside(getDecks(), openDeck.id);
    const inDeck = wordsIn(openDeck);
    const onlyHere = wordsOnlyIn(getWords(), ids);
    const inside = ids.size - 1;
    byId('deck-delete-text').textContent =
      `Delete "${openDeck.name}"` +
      (inside > 0 ? ` and the ${plural(inside, 'deck')} inside it` : '') +
      '? ' +
      (inDeck.length === 0
        ? 'It has no words.'
        : `Its ${plural(inDeck.length, 'word')} can stay in your words. ` +
          (onlyHere.length > 0
            ? `${onlyHere.length} of them ${onlyHere.length === 1 ? 'is' : 'are'} in no other deck; ` +
              'you can remove those too, with their cards. Your review history is kept either way.'
            : 'All of them are in another deck too.'));
    deleteWordsButton.textContent = `Delete the deck and remove ${plural(onlyHere.length, 'word')}`;
    deleteWordsButton.hidden = onlyHere.length === 0;
    showDeleteChoice(true);
  });

  byId('deck-delete-cancel').addEventListener('click', () => showDeleteChoice(false));

  // Deletes the open deck and the decks inside it.
  //
  // removeWordsToo: true to also remove the words that are in no other deck
  async function deleteDeck(removeWordsToo) {
    const ids = deckWithInside(getDecks(), openDeck.id);
    const onlyHere = removeWordsToo ? wordsOnlyIn(getWords(), ids) : [];
    const going = new Set(onlyHere.map((word) => word.id));
    // The words that stay are taken out of the decks first, so that no word
    // is ever left in a deck that is not there.
    const staying = getWords().filter((word) => isInDecks(word, ids) && !going.has(word.id));
    await putAll('words', staying.map((word) => withoutDecks(word, ids)));
    await removeWords(onlyHere.map((word) => ({ wordId: word.id, cardIds: allCardIds(word) })));
    await removeDecks([...ids]);
    await afterChange();
    dialog.close();
  }

  byId('deck-delete-keep').addEventListener('click', () => deleteDeck(false));
  deleteWordsButton.addEventListener('click', () => deleteDeck(true));

  byId('deck-dialog-close').addEventListener('click', () => dialog.close());

  return { render };
}
