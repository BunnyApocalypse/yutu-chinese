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
import { fillMixed } from './lang.js';
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
  isReadyMadeGroup,
  DEFAULT_DECK,
} from './decks.js';

const byId = (id) => document.getElementById(id);

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// Fills a <select> with one entry per deck, in tree order, after the entries
// in `first` ([{ value, label }]). The choice made is kept if it is still
// among them.
//
// The groups inside the levels of the ready-made lists are always left out:
// one HSK or TOCFL level brings a dozen of them, and a list of every one
// was far too long (a tester, 2026-10-14; the owner, 2026-10-15, on the
// chooser for adding a sentence). They stay on the Decks tab. A group that
// is the one chosen stays, so that the choice can be seen.
//
// options:
//   skip(deck): true for any other deck to leave out
//   keep:       the ID of the deck chosen, if the list does not have it yet
//               (the first time it is filled); otherwise the list's own choice
export function fillDeckSelect(select, decks, first, { skip = () => false, keep = '' } = {}) {
  const chosen = select.value;
  const leaveOut = (deck) => skip(deck) || (isReadyMadeGroup(deck.id) && deck.id !== chosen && deck.id !== keep);
  const option = (value, label) => {
    const element = document.createElement('option');
    element.value = value;
    element.textContent = label;
    return element;
  };
  select.replaceChildren(
    ...first.map(({ value, label }) => option(value, label)),
    ...deckTree(decks)
      .filter(({ deck }) => !leaveOut(deck))
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
// getSettings: returns the current settings (see settings.js)
// goBack():    called first by the top bar's way back; true if it went back
//              itself (to the word's page a deck was opened from)
//
// Returns { render() }.
export function createDecksPanel({ getWords, getDecks, getCards, isLearned, getOpenDeck, open, study, afterChange, getSettings, goBack }) {
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

  // A deck's name into an element, its Chinese marked as Chinese (lang.js).
  // A name has no script of its own, so the learner's is taken.
  const showName = (element, name) => fillMixed(element, name, getSettings().script);

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

  // What tapping a deck does (the owner, 2026-10-16, from a tester who
  // expected a tap to start): learn its waiting words, or once all are
  // learned review it, or for a deck without words open its page, where
  // words are added. Returns 'learn', 'review' or 'open'.
  function mainAction(deck) {
    const inDeck = wordsIn(deck);
    if (inDeck.some((word) => !isLearned(word))) {
      return 'learn';
    }
    return inDeck.length > 0 ? 'review' : 'open';
  }

  // The deck a deck is inside, or null (also if that one is not there).
  const parentOf = (deck) => getDecks().find((other) => other.id === deck.parentId) || null;

  // The line saying where you are: "Decks › Textbook › Chapter 2". Every
  // part but the last is a button that goes there. Shown inside other decks
  // only.
  function renderPath(current) {
    const above = [];
    for (let deck = current && parentOf(current); deck && !above.includes(deck); deck = parentOf(deck)) {
      above.unshift(deck);
    }
    const link = (text, deckId) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'path-part';
      showName(button, text);
      button.addEventListener('click', () => open(deckId));
      return button;
    };
    const parts = current ? [link('Decks', null), ...above.map((deck) => link(deck.name, deck.id))] : [];
    const here = document.createElement('span');
    showName(here, current ? current.name : '');
    pathElement.replaceChildren(...parts.flatMap((part) => [part, ' › ']), ...(current ? [here] : []));
    // Only inside another deck: on a deck inside no other it would say what
    // "‹ Decks" in the top bar says (the owner, 2026-10-16).
    byId('deck-path-row').hidden = above.length === 0;
  }

  // "‹ Decks" (or the name of the deck above) in the top bar goes up one
  // level: to the deck this one is inside, or from a deck inside no other to
  // the front page. In the top bar since 2026-10-16 (a tester did not see
  // "‹ Back" beside the path).
  const backButton = byId('deck-back-button');
  backButton.addEventListener('click', () => {
    if (goBack()) {
      return;
    }
    const parent = parentOf(getOpenDeck());
    open(parent ? parent.id : null);
  });

  function render() {
    const decks = getDecks();
    const current = getOpenDeck();
    renderPath(current);
    byId('deck-head').hidden = !current;
    // (Whether the way back is in the top bar is decided in wordsPanel.js,
    // which knows whether this page is on screen.)
    if (current) {
      const parent = parentOf(current);
      // The arrow before it is drawn (index.html); only the name changes.
      showName(byId('deck-back-label'), parent ? parent.name : 'Decks');
      showName(byId('deck-title'), current.name);
      const counts = countsOf(current);
      byId('deck-counts').textContent = counts.text;
      fillBar(byId('deck-progress'), counts.percent);
      // One main button: Learn while words wait, then Review, the other
      // small beside it (the owner, 2026-10-16); "+ Add to deck" (wordsPanel.js)
      // on a deck without words.
      const action = mainAction(current);
      const learning = action !== 'review';
      const learnButton = byId('deck-learn-button');
      const reviewButton = byId('deck-review-button');
      // A deck without words has "+ Add to deck" in their place.
      byId('deck-add-button').hidden = action !== 'open';
      reviewButton.hidden = action === 'open';
      learnButton.hidden = !learning || action === 'open';
      learnButton.classList.toggle('primary', learning);
      reviewButton.classList.toggle('primary', !learning);
      reviewButton.classList.toggle('link-button', learning);
      reviewButton.textContent = learning ? 'Review' : 'Review this deck';
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
      const name = span('entry-characters', '');
      showName(name, deck.name);
      // A tap starts studying the deck (mainAction); › beside it opens its
      // page. Until 2026-10-16 a tap opened the page, with Learn and Review
      // as two buttons beside the row.
      const action = mainAction(deck);
      const TAP_SAYS = { learn: 'Tap to learn', review: 'Tap to review', open: 'Tap to add words' };
      button.append(
        name,
        span('entry-definition', counts.text + (inside > 0 ? ` · ${plural(inside, 'deck')} inside` : '')),
        bar,
        span('deck-tap', TAP_SAYS[action]),
      );
      button.dataset.action = action;
      button.addEventListener('click', () => (action === 'open' ? open(deck.id) : study(deck.id, action)));
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'deck-open';
      // Drawn, as are all the app's arrows (index.html).
      openButton.innerHTML =
        '<svg class="back-arrow" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" ' +
        'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5 L16 12 L9 19" /></svg>';
      openButton.setAttribute('aria-label', `${deck.name}: its words and settings`);
      openButton.title = 'Its words and settings';
      openButton.addEventListener('click', () => open(deck.id));
      const row = document.createElement('li');
      row.className = 'deck-row';
      row.append(button, openButton);
      return row;
    });
    listElement.replaceChildren(...rows);
    // A tip the first time, beside the first deck's › (tips.js).
    if (rows.length > 0) {
      document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'deckRows' }));
    }
    byId('deck-list-title').textContent = current ? 'Decks inside this one' : 'Decks';
  }

  // ---- Adding a deck ----

  // "+ New deck" beside the heading opens a small panel for its name (the
  // owner, 2026-10-14: a box under the list would be pushed out of sight by
  // many decks). A new deck goes inside the deck whose page is open.
  const newDeckDialog = byId('new-deck-dialog');
  byId('new-deck-button').addEventListener('click', () => {
    const current = getOpenDeck();
    showName(byId('new-deck-title'), current ? `New deck inside ${current.name}` : 'New deck');
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
    fillDeckSelect(parentSelect, getDecks(), NO_PARENT, {
      skip: (other) => !canBeInside(getDecks(), deck.id, other.id),
      keep: deck.parentId,
    });
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
