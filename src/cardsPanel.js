// Managing cards in the Decks tab: the "Cards" fold-out of a word's pop-up
// panel, which shows how each of the word's cards stands, and the bar for
// doing one thing to several words at once. The page side of
// cardManager.js; wordsPanel.js sets it up and owns the list of words.

import { putAll, removeWords, startCardsOver, saveKnown, randomId } from './db.js';
import { CARD_TYPES, allCardIds, formatInterval } from './session.js';
import { cardsOfWord, withStartedOver, markedKnown } from './cardManager.js';
import { fillDeckSelect } from './decksPanel.js';
import { withDeck, withoutDecks, deckWithInside } from './decks.js';
import { ask } from './confirm.js';

const byId = (id) => document.getElementById(id);
const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

const KIND_NAMES = { meaning: 'Meaning', pinyin: 'Pinyin', tone: 'Tones', writing: 'Writing' };

// The cards of one kind of a word, in both scripts.
const cardIdsOfKind = (word, type) => allCardIds(word).filter((id) => id.startsWith(`${word.id}#${type}`));

// Sets up the fold-out and the bar.
//
// getWords, getCards, getDecks, getSettings: what the tab has read
// getReviews():   a promise for all review records (read when first wanted)
// scriptOf(word): the script a word is studied in
// getListed():    the words the list shows at the moment, all of them
// showList():     shows the list of words again
// afterChange():  call after saving anything; reads everything afresh,
//                 shows the list again and tells the rest of the app
// onWordChanged(word): the word open in the pop-up panel was changed here
//
// Returns:
//   showCardsOf(word): fills the fold-out for the word being opened, with
//                      Start over and Suspend or Resume on each card
//   selecting():       true while words are being selected
//   isSelected(word), toggle(word): for the list's rows
//   refresh():         call when the list has been shown again
export function createCardsPanel({
  getWords,
  getCards,
  getDecks,
  getSettings,
  getReviews,
  scriptOf,
  getListed,
  getListDeck,
  showList,
  afterChange,
  onWordChanged,
}) {
  // ---- One word's cards ----

  const cardList = byId('edit-cards');
  const knowButton = byId('know-word-button');
  const cardsSummary = byId('edit-cards-summary');
  let openWord = null;

  // "due in 3d", "due now", "new"
  function describeDue(card, now) {
    if (!card) {
      return 'not studied yet';
    }
    return card.due <= now ? 'due now' : `due in ${formatInterval(card.due - now)}`;
  }

  async function showCardsOf(word) {
    openWord = word;
    const reviews = await getReviews();
    if (openWord !== word) {
      return; // another word was opened meanwhile
    }
    const now = Date.now();
    const both = getSettings().bothScripts;
    const rows = cardsOfWord(word, getCards(), reviews, scriptOf(word)).map((entry) => {
      const item = document.createElement('li');
      const name = document.createElement('b');
      // The script is only named for a card in the other one than is studied.
      name.textContent =
        KIND_NAMES[entry.type] + (entry.script !== scriptOf(word) || (both && entry.type === 'writing') ? ` (${entry.script})` : '');
      const facts = [
        describeDue(entry.card, now),
        entry.card ? plural(entry.reviewCount, 'review') : '',
        entry.lapses > 0 ? `forgotten ${plural(entry.lapses, 'time')}` : '',
      ].filter(Boolean);
      const text = document.createElement('span');
      text.textContent = ` ${facts.join(' · ')}`;
      // "Suspended" by the name, in the color of notes: which card is off
      // shows at a glance, and the buttons stay plain (the owner asked about
      // coloring them, 2026-10-17; red and green mean missed and passed).
      item.classList.toggle('suspended', entry.suspended);
      item.append(name);
      if (entry.suspended) {
        const mark = document.createElement('em');
        mark.className = 'card-suspended';
        mark.textContent = 'Suspended';
        item.append(mark);
      }
      // Start over (a studied card) and Suspend or Resume, on a line of
      // their own under the facts (the owner, 2026-10-17: one list for both,
      // in place of a second fold-out with a checkbox per kind; "Resume"
      // since it is about as long as "Suspend").
      const buttons = document.createElement('div');
      buttons.className = 'card-row-buttons';
      const button = (label, act) => {
        const made = document.createElement('button');
        made.type = 'button';
        made.className = 'small';
        made.textContent = label;
        made.addEventListener('click', act);
        buttons.append(made);
      };
      if (entry.card) {
        button('Start over', () => startOver(entry.type));
      }
      button(entry.suspended ? 'Resume' : 'Suspend', () => setSuspended(entry.type, !entry.suspended));
      item.append(text, buttons);
      return item;
    });
    cardList.replaceChildren(...rows);
    // Said on the fold-out while it is closed.
    const suspendedCount = (word.suspended || []).length;
    cardsSummary.textContent = suspendedCount > 0 ? `Cards (${suspendedCount} suspended)` : 'Cards';
    // Only offered while a card of a kind that is switched on is still new.
    knowButton.hidden = markedKnown(word, getCards(), getSettings().enabledTypes, scriptOf(word), now, randomId).cards.length === 0;
  }

  // Reads everything afresh and shows the open word's cards again.
  async function afterWordChange() {
    const id = openWord.id;
    await afterChange();
    const word = getWords().find((entry) => entry.id === id);
    if (word) {
      onWordChanged(word);
      await showCardsOf(word);
    }
  }

  async function startOver(type) {
    const confirmed = await ask({
      question: `Start the ${KIND_NAMES[type].toLowerCase()} card of this word over?`,
      detail: 'It becomes a new card, as if never studied. Its reviews are kept in the history but no longer count.',
      yes: 'Start over',
    });
    if (!confirmed) {
      return;
    }
    await startCardsOver(withStartedOver(openWord, type, Date.now()), cardIdsOfKind(openWord, type));
    await afterWordChange();
  }

  // Suspends one kind of card of the open word, or resumes it, at once. A
  // word's writing cards in both scripts go together (leeches.js).
  async function setSuspended(type, on) {
    const { changedAt, suspended = [], ...rest } = openWord;
    const kinds = on ? [...new Set([...suspended, type])] : suspended.filter((kind) => kind !== type);
    await putAll('words', [kinds.length > 0 ? { ...rest, suspended: kinds } : rest]);
    await afterWordChange();
  }

  // The words as they are saved when marked as known, for those of `words`
  // that have a card still new.
  function knownEntries(words) {
    const now = Date.now();
    return words
      .map((word) => markedKnown(word, getCards(), getSettings().enabledTypes, scriptOf(word), now, randomId))
      .filter((entry) => entry.cards.length > 0);
  }

  knowButton.addEventListener('click', async () => {
    await saveKnown(knownEntries([openWord]));
    await afterWordChange();
  });

  // ---- Several words at once ----

  const selectButton = byId('select-words-button');
  const bar = byId('bulk-bar');
  const countElement = byId('bulk-count');
  const note = byId('bulk-note');
  const deckSelect = byId('bulk-deck');
  const moveButton = byId('bulk-move-button');
  let selecting = false;
  // The IDs of the selected words.
  let selected = new Set();

  const selectedWords = () => getWords().filter((word) => selected.has(word.id));

  function showBar() {
    selectButton.textContent = selecting ? 'Done selecting' : 'Select words';
    bar.hidden = !selecting;
    countElement.textContent = `${plural(selected.size, 'word')} selected. Tap words in the list to select them.`;
    for (const button of bar.querySelectorAll('button[data-needs-selection]')) {
      button.disabled = selected.size === 0;
    }
    fillDeckSelect(deckSelect, getDecks(), []);
    // Moving takes the words out of the deck listed: there is none to take
    // them out of when all words are listed.
    moveButton.hidden = !getListDeck();
  }

  // Starts or stops selecting; `first`, a word to start with selected
  // (holding a row, wordsPanel.js).
  function setSelecting(on, first = null) {
    selecting = on;
    selected = new Set(first ? [first.id] : []);
    note.textContent = '';
    showBar();
    showList();
  }

  selectButton.addEventListener('click', () => setSelecting(!selecting));

  byId('bulk-all-button').addEventListener('click', () => {
    selected = new Set(getListed().map((word) => word.id));
    note.textContent = '';
    showBar();
    showList();
  });

  // Does one thing to the selected words, says what was done, and leaves
  // them selected for the next thing.
  //   work(words): saves the change; returns how many words it changed
  //   done(count): the sentence to show afterwards
  async function act(work, done) {
    const count = await work(selectedWords());
    await afterChange();
    // Words that are gone are no longer selected.
    const there = new Set(getWords().map((word) => word.id));
    selected = new Set([...selected].filter((id) => there.has(id)));
    showBar();
    note.textContent = done(count);
  }

  byId('bulk-know-button').addEventListener('click', () =>
    act(
      async (words) => {
        const entries = knownEntries(words);
        await saveKnown(entries);
        return entries.length;
      },
      (count) =>
        `Marked ${plural(count, 'word')} as known: their new cards were answered "Easy" and will come up in Review in some days.`,
    ),
  );

  byId('bulk-suspend-button').addEventListener('click', () =>
    act(
      async (words) => {
        await putAll('words', words.map((word) => ({ ...word, suspended: [...CARD_TYPES] })));
        return words.length;
      },
      (count) => `Suspended every card of ${plural(count, 'word')}.`,
    ),
  );

  byId('bulk-unsuspend-button').addEventListener('click', () =>
    act(
      async (words) => {
        const suspended = words.filter((word) => (word.suspended || []).length > 0);
        await putAll('words', suspended.map(({ suspended: unused, ...word }) => word));
        return suspended.length;
      },
      (count) => `Resumed the suspended cards of ${plural(count, 'word')}.`,
    ),
  );

  byId('bulk-start-over-button').addEventListener('click', async () => {
    const confirmed = await ask({
      question: `Start every card of ${plural(selected.size, 'word')} over?`,
      detail: 'They become new cards, as if never studied. Their reviews are kept in the history but no longer count.',
      yes: 'Start over',
    });
    if (!confirmed) {
      return;
    }
    act(
      async (words) => {
        const now = Date.now();
        for (const word of words) {
          const startedOver = CARD_TYPES.reduce((result, type) => withStartedOver(result, type, now), word);
          await startCardsOver(startedOver, allCardIds(word));
        }
        return words.length;
      },
      (count) => `Started the cards of ${plural(count, 'word')} over.`,
    );
  });

  byId('bulk-deck-button').addEventListener('click', () => {
    const deck = getDecks().find((entry) => entry.id === deckSelect.value);
    if (!deck) {
      return;
    }
    act(
      async (words) => {
        const added = words.filter((word) => !(word.decks || []).includes(deck.id));
        await putAll('words', added.map((word) => withDeck(word, deck.id)));
        return added.length;
      },
      (count) => `Put ${plural(count, 'word')} in ${deck.name} as well.`,
    );
  });

  // Whether two records of a word are in the same decks.
  const sameDecks = (a, b) => [...(a.decks || [])].sort().join() === [...(b.decks || [])].sort().join();

  // Out of the deck listed and every deck inside it (the list shows their
  // words too), and into the one chosen (tester 2's R4, 2026-10-17: moving
  // words from a deck's page; the owner, 2026-10-18). Into a deck inside the
  // one listed, they stay in the list, in that deck.
  moveButton.addEventListener('click', () => {
    const deck = getDecks().find((entry) => entry.id === deckSelect.value);
    const from = getListDeck();
    if (!deck || !from) {
      return;
    }
    const inside = deckWithInside(getDecks(), from.id);
    act(
      async (words) => {
        const moved = words
          .map((word) => [word, withDeck(withoutDecks(word, inside), deck.id)])
          .filter(([word, after]) => !sameDecks(word, after))
          .map(([, after]) => after);
        await putAll('words', moved);
        return moved.length;
      },
      (count) => `Moved ${plural(count, 'word')} to ${deck.name}.`,
    );
  });

  byId('bulk-remove-button').addEventListener('click', async () => {
    const confirmed = await ask({
      question: `Remove ${plural(selected.size, 'word')} from your words altogether?`,
      detail: 'Their cards go too. Their reviews are kept in the history.',
      yes: 'Remove',
    });
    if (!confirmed) {
      return;
    }
    act(
      async (words) => {
        await removeWords(words.map((word) => ({ wordId: word.id, cardIds: allCardIds(word) })));
        return words.length;
      },
      (count) => `Removed ${plural(count, 'word')}.`,
    );
  });

  return {
    showCardsOf,
    selecting: () => selecting,
    isSelected: (word) => selected.has(word.id),
    toggle(word) {
      if (selected.has(word.id)) {
        selected.delete(word.id);
      } else {
        selected.add(word.id);
      }
      note.textContent = '';
      showBar();
    },
    startSelecting: (word) => setSelecting(true, word),
    // Ends selecting, if it is on; the caller shows the list again.
    stopSelecting() {
      selecting = false;
      selected = new Set();
      note.textContent = '';
      showBar();
    },
    refresh: showBar,
  };
}
