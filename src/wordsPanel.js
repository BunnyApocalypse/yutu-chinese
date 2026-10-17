// The Decks tab: the decks (decksPanel.js), and in each deck its words: add a
// word, add a list of words, look through them, change or remove them. Every
// word is in at least one deck, so words are added on a deck's page. The
// tab's other section adds the ready-made decks (HSK, TOCFL).
//
// What is typed is checked by the plain-calculation code in words.js; this
// file is the page side, and saves the results in the database.

import { getAll, putAll } from './db.js';
import { formatPinyin, wordId } from './wordList.js';
import {
  deckTree,
  deckWithInside,
  isInDecks,
  withDeck,
  DEFAULT_DECK,
} from './decks.js';
import { createDecksPanel, fillDeckSelect } from './decksPanel.js';
import { createCardsPanel } from './cardsPanel.js';
import { createWordPage } from './wordPage.js';
import { createDictionaryLoader } from './dictionaryLoader.js';
import { createWordDialog } from './wordDialog.js';
import { createSentenceForm } from './addSentenceForm.js';
import { createListForm } from './addListForm.js';
import { createReadyDecks } from './readyDecks.js';
import { langFor, fillMixed } from './lang.js';
import { lapsesOf } from './leeches.js';
import { findLeeches, describeLeech, describeSuspended, leechList, leechPrompt } from './leeches.js';
import {
  checkWord,
  newWordRecords,
  wordsWithSameCharacters,
  orderForStudyingNext,
  matchesSearch,
  charactersShown,
  scriptsShown,
  scriptFor,
  tidyPinyin,
} from './words.js';
import {
  lookUp,
  lookUpByPinyin,
  lookUpByCharacters,
  lookUpByMeaning,
  readTypedPinyin,
  proposeMeaning,
  splitIntoWords,
} from './dictionary.js';

// With thousands of words, building a row for each would make the page slow,
// so only this many are shown at a time; the search box narrows them down.
const MAX_ROWS = 200;
// How many dictionary entries are offered for the characters typed, and how
// much of each entry's list of meanings is shown.
const MAX_SUGGESTIONS = 8;
const MAX_MEANINGS_LENGTH = 140;

const byId = (id) => document.getElementById(id);

// onChange: called after the word list has changed, so the rest of the app
//           can read it afresh
// getSettings: returns the current settings (see settings.js). A function,
//           because the settings are only read after this panel is set up.
//
// Someone learning one script is only asked for and shown that script, and
// someone who chose mainland pronunciation only is not asked for Taiwan
// readings (see applySettings). Every word still has both scripts stored,
// since its ID is made from the traditional form. Someone learning both can
// give a word a script of its own ("Cards in"; see scriptFor in words.js).
//
// studyDeck(deckId, mode): shows Review ('review') or Learn ('learn') with
//           that deck chosen
//
// The panel serves two tabs. The Decks tab shows the decks: choosing one,
// adding to it, studying it. The Words tab shows the words: finding them,
// filtering and ordering them, and doing things to several at once.
//
// Returns { show(view), edit(word), showWord(word) }; call show() whenever
// one of the two tabs is opened ('decks' or 'words') or a setting has
// changed (without a view: the one that was showing).
export function createWordsPanel(onChange, getSettings, studyDeck) {
  const addForm = byId('add-word-form');
  const addFields = {
    traditional: byId('add-traditional'),
    simplified: byId('add-simplified'),
    pinyin: byId('add-pinyin'),
    pinyinTaiwan: byId('add-pinyin-taiwan'),
    definition: byId('add-definition'),
    cardScript: byId('add-card-script'),
  };
  const pinyinPreview = byId('add-pinyin-preview');
  const suggestions = byId('add-suggestions');
  const addNote = byId('add-word-note');
  const addLearnNow = byId('add-learn-now');


  const countElement = byId('word-count');
  const searchInput = byId('word-search');
  const myWordsOnly = byId('my-words-only');
  const dictionaryPart = byId('dictionary-part');
  const dictionaryList = byId('dictionary-list');
  const dictionaryNote = byId('dictionary-note');
  const dictionaryMore = byId('dictionary-more');
  const filterSelect = byId('word-filter');
  const sortSelect = byId('word-sort');
  const listElement = byId('word-list');
  const listNote = byId('word-list-note');


  // Which of the two tabs is showing: 'decks' or 'words'.
  let view = 'decks';
  // The deck whose words the Words tab lists; '' for all of them.
  let listDeckId = '';

  let words = [];
  let decks = [];
  let cards = [];
  // The reviews, read only once the leeches are listed (see renderList);
  // null until then, and again after anything changes.
  let reviews = null;
  // The leeches in the list as it is shown, for the two export buttons.
  let shownLeeches = [];
  // The words in the list as it is shown (all of them, not only the rows
  // that fit), for "Select all listed".
  let listedWords = [];
  // The ID of the deck whose page is open; null on the front page, and
  // undefined until the tab is first shown (see show()).
  let openDeckId;
  // The IDs of the words that have been learned.
  let studiedWordIds = new Set();

  // The dictionary and the ready-made lists, fetched once (dictionaryLoader.js).
  // When the dictionary or the usual readings arrive, the add form's
  // suggestions are shown afresh.
  const dictionaryLoader = createDictionaryLoader(() => showSuggestions());
  const loadDictionary = dictionaryLoader.load;
  const loadUsualReadings = dictionaryLoader.loadUsualReadings;
  const likeliestEntry = dictionaryLoader.likeliestEntry;
  const completeForms = dictionaryLoader.completeForms;
  const getDictionary = dictionaryLoader.get;

  async function load() {
    words = (await getAll('words')).sort((a, b) => a.order - b.order);
    decks = await getAll('decks');
    cards = await getAll('cards');
    reviews = null;
    // A word is learned once it has been through the Learn tab, or has a card
    // (see isLearned in session.js).
    studiedWordIds = new Set([
      ...cards.map((card) => card.wordId),
      ...words.filter((word) => word.learnedAt !== undefined).map((word) => word.id),
    ]);
  }

  // The deck whose page is open, or null on the front page (also if the
  // deck has since been deleted).
  function openDeck() {
    return decks.find((deck) => deck.id === openDeckId) || null;
  }

  // The deck whose words are listed: on the Words tab the one chosen there
  // (null for all words); on the Decks tab, where the list is out of view,
  // the deck whose page is open.
  function listDeck() {
    return view === 'words' ? decks.find((deck) => deck.id === listDeckId) || null : openDeck();
  }

  // Shows the parts that belong to the tab that is open.
  const listDeckSelect = byId('words-deck-select');
  function showView() {
    const onWords = view === 'words';
    byId('decks-part').classList.toggle('view-hidden', onWords);
    // A deck's page lists its words under it (the owner, 2026-10-14: it felt
    // strange to open a deck and not see them); the front page does not.
    byId('words-part').classList.toggle('view-hidden', !onWords && !openDeckId);
    // The deck chooser and Free practice belong to the Words tab.
    byId('words-tab-tools').classList.toggle('view-hidden', !onWords);
    // "My decks" and "Ready-made decks" belong to the Decks tab.
    byId('my-decks-button').parentElement.classList.toggle('view-hidden', onWords);
    if (onWords) {
      byId('my-decks-section').hidden = false;
      byId('ready-decks-section').hidden = true;
    } else {
      // Back on the section that was showing.
      const readyMade = byId('ready-decks-button').classList.contains('selected');
      byId('my-decks-section').hidden = readyMade;
      byId('ready-decks-section').hidden = !readyMade;
    }
    fillDeckSelect(listDeckSelect, decks, [{ value: '', label: 'All decks' }], { keep: listDeckId });
    listDeckSelect.value = decks.some((deck) => deck.id === listDeckId) ? listDeckId : '';
  }
  listDeckSelect.addEventListener('change', () => {
    listDeckId = listDeckSelect.value;
    renderList();
  });

  // Opens a deck's page, or the front page (null), at its top.
  function openDeckPage(deckId) {
    openDeckId = deckId;
    searchInput.value = '';
    listForm.forget();
    addNote.textContent = '';
    renderDecks();
    renderList();
    showView();
    byId('words-panel').scrollIntoView();
  }

  // The decks themselves (decksPanel.js). It saves its own changes and then
  // calls afterChange, like everything else here.
  const decksPanel = createDecksPanel({
    getWords: () => words,
    getDecks: () => decks,
    getCards: () => cards,
    isLearned: (word) => studiedWordIds.has(word.id),
    getOpenDeck: openDeck,
    open: openDeckPage,
    study: studyDeck,
    afterChange: () => afterChange(),
    getSettings,
  });

  // Managing cards (cardsPanel.js): the "Cards" fold-out of a word's panel
  // and the bar for several words at once.
  const cardsPanel = createCardsPanel({
    getWords: () => words,
    getCards: () => cards,
    getDecks: () => decks,
    getSettings,
    // The reviews are only read when wanted, since there can be very many.
    getReviews: async () => {
      reviews = reviews || (await getAll('reviews'));
      return reviews;
    },
    scriptOf: (word) => scriptFor(word, getSettings()),
    getListed: () => listedWords,
    showList: () => renderList(),
    afterChange: () => afterChange(),
    // The word open in the pop-up panel was changed from the fold-out.
    onWordChanged: (word) => wordDialog.wordChanged(word),
  });

  // A word's pop-up panel, and its cards on its page (wordDialog.js).
  const wordDialog = createWordDialog({
    words: () => words,
    decks: () => decks,
    isLearned: (id) => studiedWordIds.has(id),
    getSettings,
    asksFor: () => asksFor(),
    charactersOf: (word) => charactersOf(word),
    afterChange: () => afterChange(),
    cardsPanel: () => cardsPanel,
    applySettings: () => applySettings(),
  });

  // The page of a word (wordPage.js): what a tap on a word in the list
  // opens. Its Edit button leads to the pop-up panel for changing the word.
  const wordPage = createWordPage({
    getWords: () => words,
    getDecks: () => decks,
    getSettings,
    lookUp: async (text) => {
      await loadDictionary();
      const dictionary = getDictionary();
      return dictionary ? lookUp(dictionary, text) : [];
    },
    // For the words in a learning note, which can be tapped: the note split
    // into words, and a word's usual entry (there is no sentence to tell
    // which of its readings is meant).
    splitWords: async (text) => {
      await loadDictionary();
      const dictionary = getDictionary();
      return dictionary ? splitIntoWords(dictionary, text) : [{ text, word: false }];
    },
    likeliestEntry: async (text) => {
      await loadDictionary();
      await loadUsualReadings();
      const dictionary = getDictionary();
      return dictionary ? likeliestEntry(lookUp(dictionary, text), text) : null;
    },
    edit: (word) => wordDialog.open(words.find((entry) => entry.id === word.id) || word),
    addSentence: (sentence, deckId) => sentenceForm.addSentence(sentence, deckId),
    addEntry: (entry, deckId) => addEntry(entry, deckId),
    learnNow: (id, deckId) => learnNow(id, deckId),
    isLearned: (word) => studiedWordIds.has(word.id),
    // "Practice" on a word's page: Free practice with that word, which is a
    // text box and a button of the page (main.js).
    showCards: (word) => wordDialog.showCardsOnPage(word),
    practice: (word) => {
      byId('word-input').value = word[scriptFor(word, getSettings())];
      byId('practice-tab').click();
    },
    // The deck a sentence or word added from a page goes into unless another
    // is chosen: the one listed (the deck chosen on the Words tab, or the
    // one whose page is open on the Decks tab), else the deck the app
    // starts with, else the first there is.
    defaultDeckId: () =>
      (listDeck() || decks.find((deck) => deck.id === DEFAULT_DECK.id) || deckTree(decks)[0]?.deck || {}).id,
  });

  // Adding a list of words, and the ready-made decks (addListForm.js,
  // readyDecks.js).
  const listForm = createListForm(
    { words: () => words, getSettings, openDeck: () => openDeck(), afterChange: () => afterChange() },
    dictionaryLoader,
  );
  const readyDecks = createReadyDecks({ words: () => words, getSettings, afterChange: () => afterChange() }, dictionaryLoader);

  // Adding a sentence (addSentenceForm.js).
  const sentenceForm = createSentenceForm({
    words: () => words,
    getSettings,
    openDeck: () => openDeck(),
    afterChange: () => afterChange(),
  });


  // Shows the decks, and the forms for adding words if a deck's page is open.
  function renderDecks() {
    decksPanel.render();
    // The way back from a deck's page takes the place of the screen's name in
    // the top bar, only while that page is on screen: not on the Words tab,
    // which shares this code, nor under Ready-made decks, nor once another
    // screen is shown (this runs after changes made from anywhere, and once
    // put "‹ Decks" over Learn's top line).
    const onDeckPage =
      Boolean(openDeck()) &&
      view === 'decks' &&
      !byId('words-panel').hidden &&
      !byId('ready-decks-button').classList.contains('selected');
    byId('deck-back-button').hidden = !onDeckPage;
    byId('place-title').hidden = onDeckPage;
    byId('deck-adding').hidden = !openDeck();
    // (A deck without words has it as its main button already.)
    const deck = openDeck();
    byId('add-to-deck-button').hidden =
      !deck || !words.some((word) => isInDecks(word, deckWithInside(decks, deck.id)));
    byId('word-list-title').textContent = listDeck() ? 'Words in this deck' : 'All your words';
  }

  // ---- Adding to the deck whose page is open ----
  //
  // One panel, opened by "+ Add to deck" beside the deck's words (or in the
  // main button's place on a deck without words), with the three ways of
  // adding: a word, a list, a sentence (the owner, 2026-10-16: until then
  // three fold-outs on the deck's page, unlike "+ New deck" beside them).
  // Three tabs at its top, "One word" open to begin with: the most common
  // case is ready at once (the owner chose this over a first screen of three
  // choices, from screenshots of both).
  const addDialog = byId('add-dialog');
  const addForms = [...addDialog.querySelectorAll('.add-form')];
  const addTabs = [...addDialog.querySelectorAll('#add-choices button')];

  // Shows the form with this ID.
  function showAddForm(id) {
    for (const form of addForms) {
      form.hidden = form.id !== id;
    }
    for (const tab of addTabs) {
      tab.setAttribute('aria-current', String(tab.dataset.add === id));
    }
    addDialog.scrollTop = 0;
  }
  for (const tab of addTabs) {
    tab.addEventListener('click', () => showAddForm(tab.dataset.add));
  }

  function openAdding() {
    fillMixed(byId('add-to-deck-name'), openDeck().name, getSettings().script);
    addLearnNow.hidden = true;
    addNote.textContent = '';
    showAddForm('add-word-fold');
    addDialog.showModal();
  }
  byId('add-to-deck-button').addEventListener('click', openAdding);
  byId('deck-add-button').addEventListener('click', openAdding);
  byId('add-close').addEventListener('click', () => addDialog.close());

  // ---- The tab's two sections ----

  function showSection(readyMade) {
    byId('my-decks-button').classList.toggle('selected', !readyMade);
    byId('ready-decks-button').classList.toggle('selected', readyMade);
    byId('my-decks-section').hidden = readyMade;
    byId('ready-decks-section').hidden = !readyMade;
    if (readyMade) {
      readyDecks.show();
      // A tip the first time (tips.js).
      document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'ready' }));
    }
    // The top bar: the way back from a deck's page only under My decks.
    renderDecks();
  }
  // "My decks" tapped while a deck's page is open goes back to the front
  // page: it is what the button says.
  byId('my-decks-button').addEventListener('click', () => {
    if (!byId('my-decks-section').hidden && openDeck()) {
      openDeckPage(null);
    }
    showSection(false);
  });
  byId('ready-decks-button').addEventListener('click', () => showSection(true));

  // Reads the list afresh, shows it, and tells the rest of the app.
  async function afterChange() {
    await load();
    renderDecks();
    renderList();
    await onChange();
  }

  // The word's characters in the script being learned: "學習" or, with both
  // scripts, "學習 · 学习".
  function charactersOf(word) {
    return charactersShown(word, getSettings());
  }

  // A span of text that may have Chinese in it (a meaning such as "classifier
  // for 門"), its Chinese marked as Chinese in `script` (lang.js).
  function mixedSpan(className, text, script) {
    const element = document.createElement('span');
    element.className = className;
    fillMixed(element, text, script);
    return element;
  }

  // The same as a span for a row of a list, each script's part marked with
  // its language (lang.js), so that a screen reader reads it as Chinese.
  function charactersElement(word) {
    const element = document.createElement('span');
    element.className = 'entry-characters';
    const parts = scriptsShown(word, getSettings()).map((script) => {
      const part = document.createElement('span');
      part.lang = langFor(script);
      part.textContent = word[script];
      return part;
    });
    element.append(...parts.flatMap((part, index) => (index > 0 ? [' · ', part] : [part])));
    return element;
  }

  // Which of the two scripts and of the Taiwan readings are asked for.
  function asksFor() {
    const { script, bothScripts, pronunciation } = getSettings();
    return {
      traditional: bothScripts || script === 'traditional',
      simplified: bothScripts || script === 'simplified',
      taiwan: pronunciation !== 'mainlandOnly',
    };
  }

  // The one script the Add a word form asks for: 'traditional' or
  // 'simplified'; null if it asks for both. That is the script being learned
  // or, with both learned, the one chosen for this word under "Cards in".
  function scriptAsked() {
    const { script, bothScripts } = getSettings();
    return bothScripts ? addFields.cardScript.value || null : script;
  }

  // Fits the forms and their wording to the settings.
  // The boxes for a word's readings are named by region, and with Taiwan's
  // pronunciation chosen its box comes first (the owner, 2026-10-14: the two
  // standards are to be treated alike). With Mainland China only, the one
  // box is simply the pinyin.
  function showReadingBoxes(taiwanAsked) {
    const taiwanFirst = getSettings().pronunciation === 'taiwan';
    const pinyinLabel = taiwanAsked ? 'Mainland reading' : 'Pinyin';
    // (The example shows the tone numbers; spelled out, it did not fit a phone.)
    addFields.pinyin.placeholder = `${pinyinLabel}: xue2xi2`;
    addFields.pinyin.setAttribute('aria-label', `${pinyinLabel}, with tone numbers`);
    if (taiwanFirst) {
      addFields.pinyin.before(addFields.pinyinTaiwan);
    } else {
      pinyinPreview.after(addFields.pinyinTaiwan);
    }
    wordDialog.placeReadingBoxes(taiwanFirst, pinyinLabel);
  }

  function applySettings() {
    const asks = asksFor();
    const both = asks.traditional && asks.simplified;
    const asked = scriptAsked();
    showReadingBoxes(asks.taiwan);
    // A box that is out of sight is also emptied, so nothing stale is used.
    const showBox = (box, shown) => {
      box.hidden = !shown;
      if (!shown) {
        box.value = '';
      }
    };
    showBox(addFields.traditional, asked !== 'simplified');
    showBox(addFields.simplified, asked !== 'traditional');
    showBox(addFields.pinyinTaiwan, asks.taiwan);
    // With one script learned there is nothing to tell apart, so its box is
    // simply where the word goes.
    const caption = (box, text) => {
      box.placeholder = text;
      box.setAttribute('aria-label', text); // what a screen reader calls the box
    };
    // Either box also takes pinyin, to choose the word from a list.
    caption(addFields.traditional, both ? 'Traditional 繁體 or pinyin' : 'Word or phrase: 漢字 or pinyin');
    caption(
      addFields.simplified,
      both ? `Simplified 简体${asked ? '' : ' (if different)'}` : 'Word or phrase: 汉字 or pinyin',
    );
    if (!lookedUpField || lookedUpField.hidden) {
      lookedUpField = asked === 'simplified' ? addFields.simplified : addFields.traditional;
    }
    wordDialog.applySettings(asks, both);
    sentenceForm.applySettings(both);
    // A word can only have a script of its own while both are being learned.
    byId('add-card-script-row').hidden = !both;
    if (!both) {
      addFields.cardScript.value = '';
    }

    listForm.applySettings(asks, both);
  }

  // ---- The list of words ----

  function renderList() {
    // On a deck's page: its words and those of the decks inside it. On the
    // front page: all words.
    const deck = listDeck();
    byId('word-list-title').textContent = deck ? 'Words in this deck' : 'All your words';
    const inside = deck ? deckWithInside(decks, deck.id) : null;
    const listed = inside ? words.filter((word) => isInDecks(word, inside)) : words;
    const searched = listed.filter((word) => matchesSearch(word, searchInput.value));
    countElement.textContent = listed.length;
    const nameOf = new Map(decks.map((entry) => [entry.id, entry.name]));

    // With "Leeches" chosen, only the words with a card that keeps being
    // forgotten are listed, the most forgotten first, each with what is
    // forgotten about it.
    const onlyLeeches = filterSelect.value === 'leeches';
    if (onlyLeeches && reviews === null) {
      // The reviews say which character of a word is missed. They are only
      // read when wanted, since there can be very many; the list is shown
      // again once they are here.
      getAll('reviews').then((all) => {
        reviews = all;
        renderList();
      });
    }
    const { leechLapses } = getSettings();
    shownLeeches = onlyLeeches ? findLeeches(searched, cards, reviews || [], leechLapses) : [];
    const leechesOf = new Map();
    for (const leech of shownLeeches) {
      leechesOf.set(leech.word.id, [...(leechesOf.get(leech.word.id) || []), leech]);
    }
    const onlySuspended = filterSelect.value === 'suspended';
    const filtered = onlyLeeches
      ? [...new Set(shownLeeches.map((leech) => leech.word))]
      : onlySuspended
        ? searched.filter((word) => describeSuspended(word) !== '')
        : searched;
    // The order: as the words are learned, by which has a card due soonest
    // (words with no card studied last), or by which was forgotten most.
    const cardsOf = new Map();
    for (const card of sortSelect.value === '' ? [] : cards) {
      cardsOf.set(card.wordId, [...(cardsOf.get(card.wordId) || []), card]);
    }
    const nextDue = (word) => Math.min(Infinity, ...(cardsOf.get(word.id) || []).map((card) => card.due));
    const mostLapses = (word) => Math.max(0, ...(cardsOf.get(word.id) || []).map(lapsesOf));
    const matching =
      sortSelect.value === 'due'
        ? [...filtered].sort((a, b) => nextDue(a) - nextDue(b) || a.order - b.order)
        : sortSelect.value === 'lapses'
          ? [...filtered].sort((a, b) => mostLapses(b) - mostLapses(a) || a.order - b.order)
          : filtered;
    listedWords = matching;
    byId('leech-export').hidden = shownLeeches.length === 0;
    listNote.textContent =
      matching.length > MAX_ROWS
        ? `Showing the first ${MAX_ROWS} of ${matching.length}. Search to narrow them down.`
        : matching.length > 0
          ? ''
          : onlyLeeches
            ? `No leeches here: no card has been forgotten ${leechLapses} times. (The number is in Settings.)`
            : onlySuspended
              ? 'No suspended cards here.'
              : dictionaryWanted()
                ? 'None of your words match.'
                : 'No words match.';

    const rows = matching.slice(0, MAX_ROWS).map((word) => {
      const span = (className, text) => {
        const element = document.createElement('span');
        element.className = className;
        element.textContent = text;
        return element;
      };
      // Each row is a button, so it can be tapped and reached by keyboard.
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'word-entry';
      button.append(
        charactersElement(word),
        span('entry-pinyin', formatPinyin(word.pinyin)),
        mixedSpan('entry-definition', word.definition, scriptFor(word, getSettings())),
      );
      // A word that is in a deck inside this one is marked with that deck.
      const where =
        deck && !word.decks.includes(deck.id)
          ? `in ${nameOf.get(word.decks.find((id) => inside.has(id)))}`
          : '';
      const waiting = studiedWordIds.has(word.id) ? '' : 'waiting';
      if (where || waiting) {
        button.append(span('entry-new', [where, waiting].filter(Boolean).join(' · ')));
      }
      for (const leech of leechesOf.get(word.id) || []) {
        button.append(span('entry-leech', describeLeech(leech)));
      }
      // Outside the list of leeches, a word's suspended cards are named.
      if (!onlyLeeches && describeSuspended(word) !== '') {
        button.append(span('entry-leech', describeSuspended(word)));
      }
      // While words are being selected, a tap picks the word instead of
      // opening its panel.
      button.classList.toggle('selected', cardsPanel.selecting() && cardsPanel.isSelected(word));
      button.addEventListener('click', () => {
        if (cardsPanel.selecting()) {
          cardsPanel.toggle(word);
          button.classList.toggle('selected', cardsPanel.isSelected(word));
        } else {
          wordPage.open(word);
        }
      });
      const row = document.createElement('li');
      row.append(button);
      return row;
    });
    listElement.replaceChildren(...rows);
    searchDictionary();
  }

  searchInput.addEventListener('input', renderList);
  filterSelect.addEventListener('change', renderList);
  sortSelect.addEventListener('change', renderList);
  myWordsOnly.addEventListener('change', renderList);

  // ---- The dictionary under your words (Words tab) ----

  // While something is searched on the Words tab, the dictionary's words
  // that are not among yours are listed under them, by characters, pinyin
  // or English meaning, unless "My words only" is ticked (the owner,
  // 2026-10-15: they kept going there to look up a word to add). A tap opens
  // the word's page, where it can be added to a deck.
  //
  // The dictionary is searched once typing pauses: going through every
  // English meaning takes 20 to 50 ms on the PC, and several times that on
  // an old phone, which would make each letter typed stick.
  const DICTIONARY_PAUSE_MS = 200;
  const DICTIONARY_ROWS = 10;
  let dictionaryTimer = null;
  let dictionaryFound = [];
  let dictionaryShown = DICTIONARY_ROWS;
  // What was searched last: the same text again (the list shown afresh
  // after a word was added) is searched at once, as nothing is being typed.
  let dictionarySearched = null;

  function dictionaryWanted() {
    return (
      view === 'words' &&
      !myWordsOnly.checked &&
      filterSelect.value === '' &&
      !cardsPanel.selecting() &&
      searchInput.value.trim() !== ''
    );
  }

  function searchDictionary() {
    clearTimeout(dictionaryTimer);
    if (!dictionaryWanted()) {
      dictionaryPart.hidden = true;
      return;
    }
    dictionaryPart.hidden = false;
    const typed = searchInput.value.trim();
    const again = typed === dictionarySearched && Boolean(getDictionary());
    const pause = again ? 0 : DICTIONARY_PAUSE_MS;
    if (!again) {
      dictionaryShown = DICTIONARY_ROWS; // "Show more" starts over
    }
    dictionarySearched = typed;
    dictionaryTimer = setTimeout(async () => {
      if (!getDictionary()) {
        dictionaryNote.textContent = 'Opening the dictionary…';
      }
      await loadDictionary();
      const dictionary = getDictionary();
      const readyListWords = dictionaryLoader.readyListWords();
      // Typed on meanwhile, or gone elsewhere: a later search takes over.
      if (searchInput.value.trim() !== typed || !dictionaryWanted()) {
        return;
      }
      if (!dictionary) {
        dictionaryNote.textContent = 'The dictionary could not be opened.';
        dictionaryList.replaceChildren();
        return;
      }
      const have = new Set(words.map((word) => word.id));
      const seen = new Set();
      dictionaryFound = [
        ...(/\p{Script=Han}/u.test(typed) ? lookUpByCharacters(dictionary, typed, readyListWords) : []),
        ...lookUpByPinyin(dictionary, typed, readyListWords),
        ...lookUpByMeaning(dictionary, typed, readyListWords),
      ].filter((entry) => {
        const id = wordId(entry);
        const fresh = !have.has(id) && !seen.has(id);
        seen.add(id);
        return fresh;
      });
      showDictionaryRows();
    }, pause);
  }

  function showDictionaryRows() {
    dictionaryNote.textContent = dictionaryFound.length === 0 ? 'No other words found.' : '';
    dictionaryList.replaceChildren(
      ...dictionaryFound.slice(0, dictionaryShown).map((entry) => {
        const row = document.createElement('li');
        row.append(entryButton(entry, null, () => wordPage.openEntry(entry)));
        return row;
      }),
    );
    const more = dictionaryFound.length - dictionaryShown;
    dictionaryMore.hidden = more <= 0;
    dictionaryMore.textContent = `Show more (${more} more)`;
  }

  dictionaryMore.addEventListener('click', () => {
    dictionaryShown += 2 * DICTIONARY_ROWS;
    showDictionaryRows();
  });

  // The dictionary is fetched as soon as the search box is tapped on the
  // Words tab, so that it is usually there by the time a word is typed.
  searchInput.addEventListener('focus', () => {
    if (view === 'words' && !myWordsOnly.checked) {
      loadDictionary();
    }
  });

  // Adds a dictionary entry to a deck as one of your words, as a word typed
  // on a deck's page would be: the meaning proposed from the dictionary's, the
  // Taiwan reading where it is asked for. A word you have is put in the deck
  // as well. Returns 'added', 'put in deck' or 'already there'.
  async function addEntry(entry, deckId) {
    const asks = asksFor();
    const checked = checkWord({
      traditional: entry.traditional,
      simplified: entry.simplified,
      pinyin: entry.pinyin,
      pinyinTaiwan: asks.taiwan ? entry.pinyinTaiwan || '' : '',
      definition: proposeMeaning(entry.meanings, getSettings().meaningDetail),
      cardScript: '',
    });
    if (checked.problem) {
      return 'already there';
    }
    const { toAdd } = newWordRecords([checked.word], words, Date.now());
    const existing = toAdd.length === 0 ? words.find((word) => word.id === wordId(checked.word)) : null;
    if (existing && existing.decks.includes(deckId)) {
      return 'already there';
    }
    await putAll('words', [withDeck(existing || toAdd[0], deckId)]);
    await afterChange();
    return existing ? 'put in deck' : 'added';
  }

  // ---- Taking the leeches elsewhere ----

  // Saves text as a file in the device's Downloads folder (see downloadBackup
  // in main.js for how).
  function downloadText(text, fileName) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const scriptOfWord = (word) => scriptFor(word, getSettings());

  byId('leech-list-button').addEventListener('click', () => {
    downloadText(leechList(shownLeeches, scriptOfWord, formatPinyin), 'yutu-chinese-leeches.tsv');
  });

  // The clipboard is what "copy" fills and "paste" empties. A page may only
  // write to it at an https or localhost address; elsewhere, or if the
  // browser refuses, the prompt is saved as a file instead.
  byId('leech-prompt-button').addEventListener('click', async () => {
    const prompt = leechPrompt(shownLeeches, scriptOfWord, formatPinyin);
    try {
      await navigator.clipboard.writeText(prompt);
      listNote.textContent = 'Copied. Paste it into the AI you use.';
    } catch {
      downloadText(prompt, 'yutu-chinese-leeches-prompt.txt');
      listNote.textContent = 'It could not be copied here, so it was saved as a file instead.';
    }
  });

  // ---- Adding one word ----

  // Shows the pinyin with tone marks as it is typed, to check it by eye.
  function showPinyinPreview() {
    pinyinPreview.textContent = formatPinyin(addFields.pinyin.value.trim());
  }
  addFields.pinyin.addEventListener('input', showPinyinPreview);

  // ---- The dictionary ----

  // The characters field last typed in, which is what gets looked up.
  let lookedUpField = null;
  // The dictionary entry the fields were last filled in from, by itself or
  // by a tap, until the characters are typed over.
  let filledEntry = null;
  // Whether that entry was tapped, rather than chosen by itself (a tapped
  // one is kept; one chosen by itself gives way to a likelier one).
  let entryTapped = false;
  // What was last put in each field by itself (see autoFill), so that a
  // field the learner has typed in is told apart and left alone.
  const autoValues = new Map();

  const paragraph = (className, text) => {
    const element = document.createElement('p');
    element.className = className;
    element.textContent = text;
    return element;
  };

  // Puts a dictionary entry into the fields, ready to be edited.
  // Puts a dictionary entry's characters into the box or boxes on show.
  function fillInCharacters(entry) {
    const asked = scriptAsked();
    if (asked) {
      // The other script is worked out when the word is added (completeForms).
      addFields[asked].value = entry[asked];
    } else {
      addFields.traditional.value = entry.traditional;
      addFields.simplified.value = entry.simplified === entry.traditional ? '' : entry.simplified;
    }
  }

  function fillIn(entry) {
    const asks = asksFor();
    filledEntry = entry;
    entryTapped = true;
    fillInCharacters(entry);
    // Chosen from pinyin typed in the simplified box, a word written the same
    // in both scripts leaves that box empty: the traditional one has it.
    if (lookedUpField.value === '') {
      lookedUpField = addFields.traditional;
    }
    addFields.pinyin.value = entry.pinyin;
    addFields.pinyinTaiwan.value = asks.taiwan ? entry.pinyinTaiwan || '' : '';
    addFields.definition.value = proposeMeaning(entry.meanings, getSettings().meaningDetail);
    // What a tap put there may be replaced by itself, as when filled in by
    // itself, should the characters be typed over.
    for (const field of [addFields.pinyin, addFields.pinyinTaiwan, addFields.definition]) {
      autoValues.set(field, field.value);
    }
    showPinyinPreview();
    addNote.textContent = '';
    showSuggestions();
    // The meaning is the part most likely to want changing.
    addFields.definition.focus();
  }

  // Fills in the reading and meaning by themselves as the characters are
  // typed, from the dictionary's first entry for them (the owner,
  // 2026-10-14: having to tap an entry was one step too many); the entries
  // listed under the box can still be tapped for another reading. A field
  // the learner has typed in is left as it is, and so is the box being
  // typed in; with `entry` null (nothing in the dictionary) what was filled
  // in by itself is taken out again.
  // Each lookup gives new records, so entries are compared by what they say.
  const sameEntry = (a, b) =>
    Boolean(a && b) && a.traditional === b.traditional && a.simplified === b.simplified && a.pinyin === b.pinyin;

  function autoFill(entry) {
    const asks = asksFor();
    const put = (field, value) => {
      const free = field.value === '' || field.value === autoValues.get(field);
      if (free) {
        field.value = value;
        autoValues.set(field, value);
      }
    };
    filledEntry = entry;
    entryTapped = false;
    put(addFields.pinyin, entry ? entry.pinyin : '');
    put(addFields.pinyinTaiwan, entry && asks.taiwan ? entry.pinyinTaiwan || '' : '');
    put(addFields.definition, entry ? proposeMeaning(entry.meanings, getSettings().meaningDetail) : '');
    // The other script's box, where both are asked for. (The simplified
    // box is left empty when the forms are the same, as its caption says.)
    if (!scriptAsked()) {
      if (lookedUpField === addFields.traditional) {
        put(addFields.simplified, entry && entry.simplified !== entry.traditional ? entry.simplified : '');
      } else {
        put(addFields.traditional, entry ? entry.traditional : '');
      }
    }
    showPinyinPreview();
  }

  // A dictionary entry as a button that fills in the form; `label` is what
  // its right-hand end says (nothing if null). With `onTap`, a tap does that
  // instead (the Words tab's dictionary).
  function entryButton(entry, label, onTap = null) {
    const span = (className, text) => {
      const element = document.createElement('span');
      element.className = className;
      element.textContent = text;
      return element;
    };
    const meanings = entry.meanings.join(' / ');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'word-entry';
    button.append(
      charactersElement(entry),
      span('entry-pinyin', formatPinyin(entry.pinyin)),
      mixedSpan(
        'entry-definition',
        meanings.length > MAX_MEANINGS_LENGTH ? `${meanings.slice(0, MAX_MEANINGS_LENGTH)}…` : meanings,
        getSettings().script,
      ),
      ...(label ? [span('entry-new', label)] : []),
    );
    button.classList.toggle('selected', !onTap && sameEntry(entry, filledEntry));
    button.addEventListener('click', () => (onTap ? onTap() : fillIn(entry)));
    return button;
  }

  // How many words read as typed are listed under the box; "Show more"
  // lists more, and typing starts again from the first few.
  let pinyinShown = MAX_SUGGESTIONS;

  // What is listed under the box when pinyin is typed in it: the words read
  // that way, the likeliest first (lookUpByPinyin), to choose from. Nothing
  // is filled in by itself, since the word is not known until one is chosen.
  function pinyinSuggestions(typed) {
    autoFill(null);
    const dictionary = getDictionary();
    if (!dictionary) {
      return [];
    }
    const entries = lookUpByPinyin(dictionary, typed, dictionaryLoader.readyListWords());
    if (entries.length === 0) {
      return [paragraph('hint', 'No word in the dictionary is read that way. Check the spelling (v for ü), or type the characters.')];
    }
    const have = new Set(words.map((word) => word.id));
    const parts = entries
      .slice(0, pinyinShown)
      .map((entry) => entryButton(entry, have.has(wordId(entry)) ? 'in your words' : 'use this'));
    const more = entries.length - pinyinShown;
    if (more > 0) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'link-button more-entries';
      button.textContent = `Show more (${more} more)`;
      button.addEventListener('click', () => {
        pinyinShown += MAX_SUGGESTIONS;
        showSuggestions();
      });
      parts.push(button);
      if (readTypedPinyin(typed).tones.length === 0) {
        parts.push(paragraph('hint', 'Add tone numbers (shi4) to narrow it down.'));
      }
    }
    return parts;
  }

  // Shows, under the characters typed, the words in the list written the
  // same way and what the dictionary has for them; or, under pinyin typed,
  // the words read that way.
  function showSuggestions() {
    // The form has not been set up yet (nothing typed since the app
    // started): nothing to suggest. Called then when the usual readings
    // have loaded for a word of a learning note tapped on a card, and until
    // 2026-10-17 it threw there, so the word's popup did not open.
    if (!lookedUpField) {
      return;
    }
    const typed = lookedUpField.value.trim();
    const dictionary = getDictionary();
    // Nothing typed: what was filled in by itself goes too.
    if (typed === '' && !entryTapped) {
      autoFill(null);
    }
    if (readTypedPinyin(typed)) {
      suggestions.replaceChildren(...pinyinSuggestions(typed));
      return;
    }
    const parts = [];
    if (typed !== '') {
      const alreadyHave = wordsWithSameCharacters({ traditional: typed, simplified: typed }, words);
      for (const word of alreadyHave) {
        parts.push(
          paragraph('note', `Already in your words: ${charactersOf(word)} ${formatPinyin(word.pinyin)} (${word.definition})`),
        );
      }
      const entries = dictionary ? lookUp(dictionary, typed) : [];
      // The fields follow the characters typed, unless an entry was tapped
      // for these very characters.
      if (dictionary && !(entryTapped && entries.some((entry) => sameEntry(entry, filledEntry)))) {
        autoFill(likeliestEntry(entries, typed));
      }
      for (const entry of entries.slice(0, MAX_SUGGESTIONS)) {
        parts.push(entryButton(entry, sameEntry(entry, filledEntry) ? 'filled in' : 'use this'));
      }
      if (dictionary && entries.length === 0 && alreadyHave.length === 0) {
        parts.push(paragraph('hint', 'Not in the dictionary. Fill in the fields yourself.'));
      }
    }
    suggestions.replaceChildren(...parts);
  }

  for (const field of [addFields.traditional, addFields.simplified]) {
    // Fetch the dictionary as soon as a word is about to be typed, so it is
    // usually there by the time the characters are.
    field.addEventListener('focus', loadDictionary);
    field.addEventListener('input', () => {
      filledEntry = null; // the characters are no longer the tapped entry's
      entryTapped = false;
      lookedUpField = field;
      pinyinShown = MAX_SUGGESTIONS;
      loadDictionary(); // in case the text arrived without the box being tapped
      showSuggestions();
    });
  }

  // Choosing a script for the word leaves only that script's box. What was
  // typed in the other box goes with it; characters that came from a
  // dictionary entry are put back in the script now asked for.
  addFields.cardScript.addEventListener('change', () => {
    applySettings();
    if (filledEntry) {
      fillInCharacters(filledEntry);
    }
    showSuggestions();
  });

  // ---- "Learn it now" ----
  //
  // After a word is added (the owner, 2026-10-16, from a tester who wanted to
  // learn a word just added without looking for it): the word goes to the
  // front of the line, as "Study next" does, and Learn opens on the deck it
  // was added to. Offered in the panel for adding and on the word's page
  // after adding it from the dictionary (wordPage.js).
  async function learnNow(wordIdToLearn, deckId) {
    const word = words.find((entry) => entry.id === wordIdToLearn);
    if (word) {
      await putAll('words', [{ ...word, order: orderForStudyingNext(words) }]);
      await afterChange();
    }
    studyDeck(deckId, 'learn');
  }

  let learnNowTarget = null;
  addLearnNow.addEventListener('click', async () => {
    const target = learnNowTarget;
    addDialog.close();
    await learnNow(target.wordId, target.deckId);
  });
  addForm.addEventListener('input', () => {
    addLearnNow.hidden = true;
  });

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // or the browser would reload the page
    const typed = Object.fromEntries(
      Object.entries(addFields).map(([name, input]) => [name, input.value]),
    );
    // Pinyin still in the box: the word is to be chosen from the list.
    const dictionary = getDictionary();
    if (dictionary && lookUpByPinyin(dictionary, lookedUpField.value.trim()).length > 0) {
      addNote.textContent = 'Choose the word from the list under the box, or type its characters.';
      return;
    }
    const asked = scriptAsked();
    if (asked) {
      // Only one script was typed; the dictionary supplies the other.
      await loadDictionary();
      Object.assign(
        typed,
        completeForms(asked, typed[asked].trim(), tidyPinyin(typed.pinyin.trim()) || '', filledEntry),
      );
    }
    const checked = checkWord(typed);
    if (checked.problem) {
      addNote.textContent = checked.problem;
      return;
    }
    // The word goes into the deck whose page is open.
    const deck = openDeck();
    const { toAdd } = newWordRecords([checked.word], words, Date.now());
    const name = `${charactersOf(checked.word)} (${formatPinyin(checked.word.pinyin)})`;
    // A word that is there already is put in this deck as well.
    const existing = toAdd.length === 0 ? words.find((word) => word.id === wordId(checked.word)) : null;
    if (existing && existing.decks.includes(deck.id)) {
      addNote.textContent = `${name} is already in this deck.`;
      return;
    }
    const added = withDeck(existing || toAdd[0], deck.id);
    await putAll('words', [added]);
    addForm.reset();
    filledEntry = null;
    autoValues.clear();
    applySettings(); // "Cards in" is back to "As in Settings", so both boxes are

    pinyinPreview.textContent = '';
    suggestions.replaceChildren();
    addNote.textContent = existing
      ? `${name} was already in your words, as you had it. It is in this deck now too.`
      : `Added ${charactersOf(toAdd[0])}. It waits in Learn, last in line.`;
    await afterChange();
    // "Learn it now", for a word still to be learned; typing the next word
    // puts it away.
    learnNowTarget = studiedWordIds.has(added.id) ? null : { wordId: added.id, deckId: deck.id };
    addLearnNow.hidden = learnNowTarget === null;
    lookedUpField.focus();
  });

  return {
    addReadyLevels: (listId, levels) => readyDecks.addReadyLevels(listId, levels),
    noteOf: (word) => wordPage.noteOf(word),
    tappableText: (element, text) => wordPage.tappableText(element, text),

    // Opens a word's panel from elsewhere in the app (Review's "Edit word").
    // Returns a promise for what became of the word once the panel is closed:
    //   changed: true if anything was saved
    //   word:    the word record as it is now; null if it was removed
    async edit(word) {
      applySettings();
      await load();
      renderDecks();
      return wordDialog.edit(words.find((entry) => entry.id === word.id) || word);
    },

    // Opens a word's page from elsewhere in the app (Review's "About this
    // word").
    async showWord(word) {
      applySettings();
      await load();
      wordPage.open(words.find((entry) => entry.id === word.id) || word);
    },

    async show(newView) {
      view = newView || view;
      // Coming to the Decks tab always shows My decks (the owner,
      // 2026-10-14), whichever section was showing before. Done before
      // anything is waited for, so a tap on Ready-made decks right after is
      // not undone.
      if (newView === 'decks') {
        showSection(false);
      }
      // Coming to the Decks tab always shows the front page, with the decks,
      // and never opens one by itself (the owner, 2026-10-14: having
      // "Chinese 中文" open to begin with misled new learners, above all
      // after adding an HSK or TOCFL level). Before anything is waited for,
      // like the section.
      if (newView === 'decks' || openDeckId === undefined) {
        openDeckId = null;
        renderDecks(); // at once, from what was read before; again below
        showView();
      }
      // A tip the first time each tab is opened (tips.js).
      if (newView) {
        document.dispatchEvent(new CustomEvent('screen-shown', { detail: newView }));
      }
      applySettings();
      await load();
      renderDecks();
      showView();
      renderList();
      showSuggestions();
    },
  };
}
