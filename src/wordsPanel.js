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
import { createAnkiImport } from './ankiImportForm.js';
import { createSkritterImport } from './skritterImportForm.js';
import { createAddWordForm } from './addWordForm.js';
import { charactersElement, mixedSpan, entryRow, whenHeld } from './wordRows.js';
import { fillMixed } from './lang.js';
import { showReading } from './readingStyle.js';
import { lapsesOf } from './leeches.js';
import { findLeeches, describeLeech, describeSuspended, leechList, leechPrompt } from './leeches.js';
import {
  checkWord,
  newWordRecords,
  orderForStudyingNext,
  matchesSearch,
  charactersShown,
  scriptFor,
} from './words.js';
import {
  lookUp,
  lookUpByCharacters,
  lookUpByLetters,
  proposeMeaning,
  splitIntoWords,
} from './dictionary.js';
import { isSentence } from './sentences.js';
import { isRadical } from './radicals.js';
import { t } from './text.js';

// With thousands of words, building a row for each would make the page slow,
// so only this many are shown at a time; the search box narrows them down.
const MAX_ROWS = 200;

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
// practiceWord(word): Free practice with that word ("Practice" on its page)
// canPractice(): whether a word's page offers that now (not in Review or Learn)
// setMode(mode, options): shows another screen (setMode in main.js);
//           returns a promise
// getMode(): the screen showing ('decks', 'words', 'practice', ...)
// repeatLesson(word): the lesson of a word already learned, again, as
//           practice ("Repeat lesson" on its page; main.js)
//
// The panel serves two tabs. The Decks tab shows the decks: choosing one,
// adding to it, studying it. The Words tab shows the words: finding them,
// filtering and ordering them, and doing things to several at once.
//
// Returns { show(view), edit(word), showWord(word) }; call show() whenever
// one of the two tabs is opened ('decks' or 'words') or a setting has
// changed (without a view: the one that was showing).
export function createWordsPanel(onChange, getSettings, studyDeck, practiceWord, canPractice, setMode, getMode, repeatLesson) {


  const countElement = byId('word-count');
  const searchInput = byId('word-search');
  const dictionaryResults = byId('dictionary-results');
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
  const dictionaryLoader = createDictionaryLoader(() => addWordForm.showSuggestions());
  const loadDictionary = dictionaryLoader.load;
  const loadUsualReadings = dictionaryLoader.loadUsualReadings;
  const likeliestEntry = dictionaryLoader.likeliestEntry;
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
    fillDeckSelect(listDeckSelect, decks, [{ value: '', label: t('words.allDecks') }], { keep: listDeckId });
    listDeckSelect.value = decks.some((deck) => deck.id === listDeckId) ? listDeckId : '';
  }
  listDeckSelect.addEventListener('change', () => {
    listDeckId = listDeckSelect.value;
    cardsPanel.stopSelecting(); // another list
    renderList();
  });

  // A deck's page opened from a deck's box on a word's page: where that
  // page was, so that the top bar's "‹ Back" brings it back, as "Practice"
  // does (the owner, 2026-10-18: going up to Decks lost the place).
  // { mode, deckId, scrollY, word }; null once anything else is opened.
  let cameFromWord = null;

  // Opens a deck's page, or the front page (null), at its top.
  function openDeckPage(deckId) {
    cameFromWord = null;
    openDeckId = deckId;
    // Selecting belongs to the list it was started on: left behind with it
    // (the owner, 2026-10-18: back on the deck later, it was still on).
    cardsPanel.stopSelecting();
    searchInput.value = '';
    listForm.forget();
    addWordForm.clearNote();
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
    goBack: () => {
      if (!cameFromWord) {
        return false;
      }
      goBackToWord(cameFromWord);
      return true;
    },
  });

  // Back from a deck's page to the word's page it was opened from: the
  // screen, the deck page or list and the scroll as they were.
  async function goBackToWord(from) {
    cameFromWord = null;
    await setMode(from.mode, { keepPlace: true });
    if (from.mode === 'decks' || from.mode === 'words') {
      openDeckId = from.deckId;
      renderDecks();
      showView();
      renderList();
      window.scrollTo(0, from.scrollY);
    }
    wordPage.open(words.find((entry) => entry.id === from.word.id) || from.word);
  }

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
    getListDeck: () => listDeck(),
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
    remove: (word) => wordDialog.remove(words.find((entry) => entry.id === word.id) || word),
    addSentence: (sentence, deckId) => sentenceForm.addSentence(sentence, deckId),
    addEntry: (entry, deckId) => addEntry(entry, deckId),
    learnNow: (id, deckId) => learnNow(id, deckId),
    isLearned: (word) => studiedWordIds.has(word.id),
    showCards: (word) => wordDialog.showCardsOnPage(word),
    // "Practice" on a word's page: Free practice with that word (main.js).
    practice: (word) => practiceWord(word),
    repeatLesson: (word) => repeatLesson(word),
    // Learn opened on the deck listed if the word is in it (or in a deck
    // inside it), else the first deck the word is in.
    learnWordNow: (word) => {
      const deck = listDeck();
      const inList = deck && isInDecks(word, deckWithInside(decks, deck.id));
      return learnNow(word.id, inList ? deck.id : (word.decks || [])[0] || '');
    },
    canPractice,
    // A tap on a deck's box on a word's page: that deck's page, with the
    // way back going to the word's page (cameFromWord).
    showDeck: async (deckId, word) => {
      const from = { mode: getMode(), deckId: openDeckId, scrollY: window.scrollY, word };
      await setMode('decks');
      openDeckPage(deckId);
      cameFromWord = from;
      renderDecks();
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
  // Importing from Anki and Skritter (ankiImportForm.js,
  // skritterImportForm.js), under the decks.
  const importShared = { words: () => words, decks: () => decks, cards: () => cards, getSettings, afterChange: () => afterChange() };
  createAnkiImport(importShared, dictionaryLoader);
  createSkritterImport(importShared, dictionaryLoader);

  // Adding one word (addWordForm.js).
  const addWordForm = createAddWordForm(
    {
      words: () => words,
      isLearned: (id) => studiedWordIds.has(id),
      getSettings,
      asksFor: () => asksFor(),
      charactersOf: (word) => charactersOf(word),
      openDeck: () => openDeck(),
      afterChange: () => afterChange(),
      applySettings: () => applySettings(),
      learnNow: (id, deckId) => learnNow(id, deckId),
      closeAdding: () => addDialog.close(),
    },
    dictionaryLoader,
  );

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
    // Opened from a word's page, the way back goes there (cameFromWord).
    if (cameFromWord) {
      fillMixed(byId('deck-back-label'), t('place.back'), getSettings().script);
    }
    // Only while Decks or Words is on screen: this also runs after changes
    // made from Review, whose top bar may have its own way back in the
    // name's place (main.js).
    if (!byId('words-panel').hidden) {
      byId('place-title').hidden = onDeckPage;
    }
    byId('deck-adding').hidden = !openDeck();
    // (A deck without words has it as its main button already.)
    const deck = openDeck();
    byId('add-to-deck-button').hidden =
      !deck || !words.some((word) => isInDecks(word, deckWithInside(decks, deck.id)));
    byId('word-list-title').textContent = t(listDeck() ? 'words.inThisDeck' : 'decks.wordListTitle');
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
    addWordForm.clearNote();
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
    // The bar's deck chooser, for a deck added or renamed meanwhile.
    cardsPanel.refresh();
    await onChange();
  }

  // The word's characters in the script being learned: "學習" or, with both
  // scripts, "學習 · 学习".
  function charactersOf(word) {
    return charactersShown(word, getSettings());
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

  // Fits the forms and their wording to the settings.
  // The boxes for a word's readings are named by region, and with Taiwan's
  // pronunciation chosen its box comes first (the owner, 2026-10-14: the two
  // standards are to be treated alike). With Mainland China only, the one
  // box is simply the pinyin.
  function showReadingBoxes(taiwanAsked) {
    const taiwanFirst = getSettings().pronunciation === 'taiwan';
    const pinyinLabel = t(taiwanAsked ? 'words.mainlandReading' : 'words.pinyin');
    addWordForm.placeReadingBoxes(taiwanFirst, pinyinLabel);
    wordDialog.placeReadingBoxes(taiwanFirst, pinyinLabel);
  }

  function applySettings() {
    const asks = asksFor();
    const both = asks.traditional && asks.simplified;
    showReadingBoxes(asks.taiwan);
    addWordForm.applySettings(asks, both);
    wordDialog.applySettings(asks, both);
    sentenceForm.applySettings(both);
    listForm.applySettings(asks, both);
  }

  // ---- The list of words ----

  function renderList() {
    // On a deck's page: its words and those of the decks inside it. On the
    // front page: all words.
    const deck = listDeck();
    byId('word-list-title').textContent = t(deck ? 'words.inThisDeck' : 'decks.wordListTitle');
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
        ? t('words.showingFirst', { shown: MAX_ROWS, count: matching.length })
        : matching.length > 0
          ? ''
          : onlyLeeches
            ? t('words.noLeeches', { count: leechLapses })
            : onlySuspended
              ? t('words.noSuspended')
              : dictionaryWanted()
                ? t('words.noneOfYoursMatch')
                : t('words.noneMatch');

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
        charactersElement(word, getSettings()),
        mixedSpan('entry-pinyin', showReading(word.pinyin), scriptFor(word, getSettings())),
        mixedSpan('entry-definition', word.definition, scriptFor(word, getSettings())),
      );
      // A word that is in a deck inside this one is marked with that deck.
      const where =
        deck && !word.decks.includes(deck.id)
          ? t('words.inDeck', { deck: nameOf.get(word.decks.find((id) => inside.has(id))) })
          : '';
      const waiting = studiedWordIds.has(word.id) ? '' : t('words.waiting');
      // A sentence or a radical says so: a sentence beginning with a word in
      // the list read as that word added twice (tester 2, 2026-10-17; the
      // owner, 2026-10-18).
      const kind = isSentence(word) ? t('words.sentence') : isRadical(word) ? t('words.radical') : '';
      if (kind || where || waiting) {
        button.append(span('entry-new', [kind, where, waiting].filter(Boolean).join(' · ')));
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
      // Holding a row starts selecting, with that word (tester 2's R3; the
      // owner, 2026-10-18); while selecting, it picks the word as a tap does.
      // Before the tap's listener, which it can stop.
      whenHeld(button, () => {
        if (cardsPanel.selecting()) {
          cardsPanel.toggle(word);
          button.classList.toggle('selected', cardsPanel.isSelected(word));
        } else {
          cardsPanel.startSelecting(word);
        }
      });
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
  dictionaryResults.addEventListener('change', renderList);

  // ---- The dictionary under your words (Words tab) ----

  // While something is searched on the Words tab, the dictionary's words
  // that are not among yours are listed under them, by characters, pinyin
  // or English meaning, unless "Dictionary results" is switched off (the owner,
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
      dictionaryResults.checked &&
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
        dictionaryNote.textContent = t('words.openingDictionary');
      }
      await loadDictionary();
      const dictionary = getDictionary();
      const readyListWords = dictionaryLoader.readyListWords();
      // Typed on meanwhile, or gone elsewhere: a later search takes over.
      if (searchInput.value.trim() !== typed || !dictionaryWanted()) {
        return;
      }
      if (!dictionary) {
        dictionaryNote.textContent = t('words.dictionaryFailed');
        dictionaryList.replaceChildren();
        return;
      }
      const have = new Set(words.map((word) => word.id));
      const seen = new Set();
      dictionaryFound = [
        ...(/\p{Script=Han}/u.test(typed) ? lookUpByCharacters(dictionary, typed, readyListWords) : []),
        ...lookUpByLetters(dictionary, typed, readyListWords),
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
    dictionaryNote.textContent = dictionaryFound.length === 0 ? t('words.noOtherWords') : '';
    dictionaryList.replaceChildren(
      ...dictionaryFound.slice(0, dictionaryShown).map((entry) => {
        const row = document.createElement('li');
        row.append(entryRow(entry, null, getSettings(), { onTap: () => wordPage.openEntry(entry) }));
        return row;
      }),
    );
    const more = dictionaryFound.length - dictionaryShown;
    dictionaryMore.hidden = more <= 0;
    dictionaryMore.textContent = t('words.showMore', { count: more });
  }

  dictionaryMore.addEventListener('click', () => {
    dictionaryShown += 2 * DICTIONARY_ROWS;
    showDictionaryRows();
  });

  // The dictionary is fetched as soon as the search box is tapped on the
  // Words tab, so that it is usually there by the time a word is typed.
  searchInput.addEventListener('focus', () => {
    if (view === 'words' && dictionaryResults.checked) {
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
      listNote.textContent = t('words.copied');
    } catch {
      downloadText(prompt, 'yutu-chinese-leeches-prompt.txt');
      listNote.textContent = t('words.savedInstead');
    }
  });

  // ---- "Learn it now" ----
  //
  // After a word is added (the owner, 2026-10-16, from a tester who wanted to
  // learn a word just added without looking for it): the word goes to the
  // front of the line, as "Learn this word next" does, and Learn opens on the deck it
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
    // word"); thisCard: the card it was opened from (see wordPage.js).
    async showWord(word, thisCard = null) {
      applySettings();
      await load();
      wordPage.open(words.find((entry) => entry.id === word.id) || word, thisCard);
    },

    // keepPlace: coming back from practicing a word (main.js), to the deck
    // page or list as it was left, not the front page.
    async show(newView, { keepPlace = false } = {}) {
      view = newView || view;
      if (keepPlace) {
        newView = undefined;
      }
      // Coming to the Decks tab always shows My decks (the owner,
      // 2026-10-14), whichever section was showing before. Done before
      // anything is waited for, so a tap on Ready-made decks right after is
      // not undone.
      if (newView === 'decks') {
        showSection(false);
      }
      // Another screen: a deck opened from a word's page goes up as usual,
      // and selecting ends, as on leaving a deck's page.
      if (newView) {
        cameFromWord = null;
        cardsPanel.stopSelecting();
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
      addWordForm.showSuggestions();
    },
  };
}
