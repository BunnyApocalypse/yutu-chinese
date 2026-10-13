// Managing cards in the Decks tab: the "Cards" fold-out of a word's pop-up
// panel, which shows how each of the word's cards stands, and the bar for
// doing one thing to several words at once. The page side of
// cardManager.js; wordsPanel.js sets it up and owns the list of words.

import { putAll, removeWords, startCardsOver, saveKnown, randomId } from './db.js';
import { CARD_TYPES, allCardIds, formatInterval } from './session.js';
import { cardsOfWord, withStartedOver, markedKnown } from './cardManager.js';
import { fillDeckSelect } from './decksPanel.js';
import { withDeck } from './decks.js';

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
//   showCardsOf(word): fills the fold-out for the word being opened
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
  showList,
  afterChange,
  onWordChanged,
}) {
  // ---- One word's cards ----

  const cardList = byId('edit-cards');
  const knowButton = byId('know-word-button');
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
        entry.suspended ? 'suspended' : '',
      ].filter(Boolean);
      const text = document.createElement('span');
      text.textContent = ` ${facts.join(' · ')}`;
      item.append(name, text);
      if (entry.card) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'small';
        button.textContent = 'Start over';
        button.addEventListener('click', () => startOver(entry.type));
        item.append(button);
      }
      return item;
    });
    cardList.replaceChildren(...rows);
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
    const confirmed = window.confirm(
      `Start the ${KIND_NAMES[type].toLowerCase()} card of this word over?\n\n` +
        'It becomes a new card, as if never studied. Its reviews are kept in the history but no longer count.',
    );
    if (!confirmed) {
      return;
    }
    await startCardsOver(withStartedOver(openWord, type, Date.now()), cardIdsOfKind(openWord, type));
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
  }

  selectButton.addEventListener('click', () => {
    selecting = !selecting;
    selected = new Set();
    note.textContent = '';
    showBar();
    showList();
  });

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
      (count) => `Switched the suspended cards of ${plural(count, 'word')} back on.`,
    ),
  );

  byId('bulk-start-over-button').addEventListener('click', () => {
    const confirmed = window.confirm(
      `Start every card of ${plural(selected.size, 'word')} over?\n\n` +
        'They become new cards, as if never studied. Their reviews are kept in the history but no longer count.',
    );
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

  byId('bulk-remove-button').addEventListener('click', () => {
    const confirmed = window.confirm(
      `Remove ${plural(selected.size, 'word')} from your words altogether?\n\n` +
        'Their cards go too. Their reviews are kept in the history.',
    );
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
    refresh: showBar,
  };
}
