// The Decks tab: the decks (decksPanel.js), and in each deck its words: add a
// word, add a list of words, look through them, change or remove them. Every
// word is in at least one deck, so words are added on a deck's page. The
// tab's other section adds the ready-made decks (HSK, TOCFL).
//
// What is typed is checked by the plain-calculation code in words.js; this
// file is the page side, and saves the results in the database.

import { getAll, putAll, removeWord, renameWord } from './db.js';
import { formatPinyin, wordId } from './wordList.js';
import { allCardIds } from './session.js';
import { fileCardsByScript } from './scriptCards.js';
import {
  READY_MADE_LISTS,
  isReadyMadeGroup,
  missingReadyMadeDecks,
  readyMadeDeck,
  deckTree,
  deckWithInside,
  isInDecks,
  withDeck,
  DEFAULT_DECK,
} from './decks.js';
import { createDecksPanel, fillDeckSelect } from './decksPanel.js';
import { createCardsPanel } from './cardsPanel.js';
import { createWordPage } from './wordPage.js';
import { ask } from './confirm.js';
import { isSentence, sentenceId, sentenceRecord, clozeInBoth } from './sentences.js';
import { isRadical, radicalRecord } from './radicals.js';
import { lapsesOf } from './leeches.js';
import { findLeeches, describeLeech, describeSuspended, leechList, leechPrompt } from './leeches.js';
import {
  checkWord,
  readWordList,
  newWordRecords,
  wordsWithSameCharacters,
  orderForStudyingNext,
  matchesSearch,
  charactersShown,
  scriptFor,
  parseReadyList,
  levelsOfReadyList,
  listTag,
  groupName,
  withFormerId,
  tidyPinyin,
} from './words.js';
import {
  readDictionary,
  lookUp,
  lookUpByPinyin,
  readTypedPinyin,
  proposeMeaning,
  otherScriptForm,
} from './dictionary.js';
// "?url" makes Vite hand us the file's address instead of its contents, so
// the dictionary stays a separate file that is only fetched when needed.
import dictionaryUrl from '../data/cedict/dictionary.tsv?url';
// The ready-made lists are separate files in the same way (data/wordlists/).
import hsk3Url from '../data/wordlists/hsk/hsk-3.0.tsv?url';
import hsk2Url from '../data/wordlists/hsk/hsk-2.0.tsv?url';
import tocflUrl from '../data/wordlists/tocfl/tocfl.tsv?url';
import radicalsUrl from '../data/wordlists/radicals/radicals.tsv?url';

// Where each ready-made list is fetched from, by the `data-list` of its row
// in the Ready-made decks section (index.html).
const READY_LIST_URLS = { 'hsk-3.0': hsk3Url, 'hsk-2.0': hsk2Url, tocfl: tocflUrl, radicals: radicalsUrl };

// With thousands of words, building a row for each would make the page slow,
// so only this many are shown at a time; the search box narrows them down.
const MAX_ROWS = 200;
// How many unreadable lines of a pasted list are spelled out.
const MAX_PROBLEMS_SHOWN = 20;
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

  const listHint = byId('list-hint');
  const listText = byId('list-text');
  const listFileButton = byId('list-file-button');
  const listFile = byId('list-file');
  const checkListButton = byId('check-list-button');
  const listReport = byId('list-report');
  const listProblems = byId('list-problems');
  const addListButton = byId('add-list-button');

  const countElement = byId('word-count');
  const searchInput = byId('word-search');
  const filterSelect = byId('word-filter');
  const sortSelect = byId('word-sort');
  const listElement = byId('word-list');
  const listNote = byId('word-list-note');
  const editDecks = byId('edit-decks');

  const dialog = byId('word-dialog');
  const dialogTitle = byId('word-dialog-title');
  const dialogStatus = byId('word-dialog-status');
  const editDefinition = byId('edit-definition');
  const editTraditional = byId('edit-traditional');
  const editSimplified = byId('edit-simplified');
  const editSimplifiedCaption = byId('edit-simplified-caption');
  const editPinyin = byId('edit-pinyin');
  const editPinyinTaiwan = byId('edit-pinyin-taiwan');
  const editPinyinAlso = byId('edit-pinyin-also');
  const editCardScript = byId('edit-card-script');
  const editCloze = byId('edit-cloze');
  const dialogNote = byId('word-dialog-note');
  const studyNextButton = byId('study-next-button');

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
  // The checked words of a pasted list, waiting for "Add", and every word
  // that could be read from it, those already there included.
  let listToAdd = [];
  let listRead = [];
  // The word open in the dialog.
  let openWord = null;
  // What became of it, for edit(): see there.
  let dialogResult = null;

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
    fillDeckSelect(listDeckSelect, decks, [{ value: '', label: 'All decks' }], (deck) =>
      isReadyMadeGroup(deck.id) && deck.id !== listDeckId,
    );
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
    forgetCheckedList();
    addNote.textContent = '';
    foldAddWord();
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
  });

  // "Add a word" is folded away, so that the deck's words are near the top
  // of its page, except on a deck without words: there, adding one is what
  // the page is for. Only done when a page is opened, so that the form does
  // not close under someone adding a deck's first words.
  function foldAddWord() {
    const deck = openDeck();
    const inside = deck ? deckWithInside(decks, deck.id) : null;
    byId('add-word-fold').open = Boolean(deck) && !words.some((word) => isInDecks(word, inside));
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
    showList: () => renderList(),
    afterChange: () => afterChange(),
    // The word open in the pop-up panel was changed from the fold-out: the
    // panel goes on with the new record, and reports a change when closed.
    onWordChanged: (word) => {
      openWord = word;
      dialogResult = { changed: true, word };
      studyNextButton.hidden = studiedWordIds.has(word.id);
      showDialogStatus(word);
    },
  });

  // The page of a word (wordPage.js): what a tap on a word in the list
  // opens. Its Edit button leads to the pop-up panel for changing the word.
  const wordPage = createWordPage({
    getWords: () => words,
    getDecks: () => decks,
    getSettings,
    lookUp: async (text) => {
      await loadDictionary();
      return dictionary ? lookUp(dictionary, text) : [];
    },
    edit: (word) => openDialog(words.find((entry) => entry.id === word.id) || word),
    addSentence: (sentence, deckId) => addSentence(sentence, deckId),
    // "Practice" on a word's page: Free practice with that word, which is a
    // text box and a button of the page (main.js).
    showCards: (word) => showCardsOnPage(word),
    practice: (word) => {
      byId('word-input').value = word[scriptFor(word, getSettings())];
      byId('practice-tab').click();
    },
    // The deck a sentence added from a page goes into unless another is
    // chosen: the one whose page is open, else the deck the app starts
    // with, else the first there is.
    defaultDeckId: () =>
      (openDeck() || decks.find((deck) => deck.id === DEFAULT_DECK.id) || deckTree(decks)[0]?.deck || {}).id,
  });

  // ---- Sentences ----

  // Adds a sentence to a deck (see sentenceRecord in sentences.js for what
  // `sentence` holds). One that is there already is put in the deck as well.
  // Returns 'added', 'put in deck' or 'already there'.
  async function addSentence(sentence, deckId) {
    const existing = words.find((word) => word.id === sentenceId(sentence.traditional));
    if (existing) {
      if ((existing.decks || []).includes(deckId)) {
        return 'already there';
      }
      await putAll('words', [withDeck(existing, deckId)]);
      await afterChange();
      return 'put in deck';
    }
    const order = words.reduce((highest, word) => Math.max(highest, word.order), -1) + 1;
    await putAll('words', [sentenceRecord(sentence, order, deckId, Date.now())]);
    await afterChange();
    return 'added';
  }

  // The form on a deck's page. The first box is the sentence in the script
  // that cards are shown in; the second, only there while both scripts are
  // learned, the same sentence in the other one.
  const sentenceFields = {
    characters: byId('sentence-characters'),
    other: byId('sentence-other'),
    pinyin: byId('sentence-pinyin'),
    meaning: byId('sentence-meaning'),
    cloze: byId('sentence-cloze'),
  };
  const sentenceNote = byId('add-sentence-note');
  byId('add-sentence-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const settings = getSettings();
    const own = sentenceFields.characters.value.trim();
    const other = sentenceFields.other.value.trim() || own;
    const meaning = sentenceFields.meaning.value.trim();
    const clozeOwn = sentenceFields.cloze.value.trim();
    if (own === '' || meaning === '') {
      sentenceNote.textContent = 'A sentence needs its characters and what it means.';
      return;
    }
    if (clozeOwn !== '' && !own.includes(clozeOwn)) {
      sentenceNote.textContent = `"${clozeOwn}" is not in the sentence.`;
      return;
    }
    const cloze = clozeInBoth(own, other, clozeOwn);
    const inScript = (ownForm, otherForm) =>
      settings.script === 'traditional'
        ? { traditional: ownForm, simplified: otherForm }
        : { traditional: otherForm, simplified: ownForm };
    const result = await addSentence(
      {
        ...inScript(own, other),
        pinyin: sentenceFields.pinyin.value.trim(),
        definition: meaning,
        ...(cloze ? { cloze: inScript(cloze.own, cloze.other) } : {}),
      },
      openDeck().id,
    );
    sentenceNote.textContent =
      result === 'added'
        ? `Added: ${own} Its cards come up in Review.`
        : result === 'put in deck'
          ? 'You had this sentence already. It is in this deck now too.'
          : 'This sentence is already in this deck.';
    if (result === 'added') {
      for (const field of Object.values(sentenceFields)) {
        field.value = '';
      }
    }
  });

  // Shows the decks, and the forms for adding words if a deck's page is open.
  function renderDecks() {
    decksPanel.render();
    byId('deck-adding').hidden = !openDeck();
    byId('word-list-title').textContent = listDeck() ? 'Words in this deck' : 'All your words';
  }

  // The three ways of adding to a deck (a word, a list, a sentence) are
  // fold-outs. Opening one closes the others, so that only one form is ever
  // in the way.
  const addFolds = [...document.querySelectorAll('#deck-adding > details')];
  for (const fold of addFolds) {
    fold.addEventListener('toggle', () => {
      if (fold.open) {
        addFolds.filter((other) => other !== fold).forEach((other) => {
          other.open = false;
        });
      }
    });
  }

  // ---- The tab's two sections ----

  function showSection(readyMade) {
    byId('my-decks-button').classList.toggle('selected', !readyMade);
    byId('ready-decks-button').classList.toggle('selected', readyMade);
    byId('my-decks-section').hidden = readyMade;
    byId('ready-decks-section').hidden = !readyMade;
    if (readyMade) {
      readyReport.textContent = '';
      showReadyLevels();
      // A tip the first time (tips.js).
      document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'ready' }));
    }
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
    byId('edit-pinyin-caption').textContent = pinyinLabel;
    if (taiwanFirst) {
      addFields.pinyin.before(addFields.pinyinTaiwan);
      editPinyin.closest('label').before(editPinyinTaiwan.closest('label'));
    } else {
      pinyinPreview.after(addFields.pinyinTaiwan);
      editPinyin.closest('label').after(editPinyinTaiwan.closest('label'));
    }
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
    editSimplifiedCaption.textContent = both ? 'Simplified' : 'Characters';
    if (!lookedUpField || lookedUpField.hidden) {
      lookedUpField = asked === 'simplified' ? addFields.simplified : addFields.traditional;
    }
    // In the pop-up panel each box sits in a <label>, which holds its caption.
    editTraditional.closest('label').hidden = !asks.traditional;
    editSimplified.closest('label').hidden = !asks.simplified;
    editPinyinTaiwan.closest('label').hidden = !asks.taiwan;
    sentenceFields.other.hidden = !both;
    // A word can only have a script of its own while both are being learned.
    byId('add-card-script-row').hidden = !both;
    editCardScript.closest('label').hidden = !both;
    if (!both) {
      addFields.cardScript.value = '';
    }

    const taiwanColumn = asks.taiwan ? ', and optionally the Taiwan reading' : '';
    listHint.textContent = both
      ? `One word per line, as in a TSV or CSV file: simplified, traditional, pinyin with tone numbers, meaning${taiwanColumn}, separated by tabs or commas. With one column of characters instead of two, the other script is looked up in the dictionary.`
      : `One word per line, as in a TSV or CSV file: characters, pinyin with tone numbers, meaning${taiwanColumn}, separated by tabs or commas. A list with two columns of characters (simplified, then traditional) works too.`;
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
        span('entry-characters', charactersOf(word)),
        span('entry-pinyin', formatPinyin(word.pinyin)),
        span('entry-definition', word.definition),
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
  }

  searchInput.addEventListener('input', renderList);
  filterSelect.addEventListener('change', renderList);
  sortSelect.addEventListener('change', renderList);

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
    downloadText(leechList(shownLeeches, scriptOfWord, formatPinyin), 'hanzi-trainer-leeches.tsv');
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
      downloadText(prompt, 'hanzi-trainer-leeches-prompt.txt');
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

  // The dictionary once it has been fetched (see dictionary.js), and the
  // fetch itself, so it is only made once.
  let dictionary = null;
  let dictionaryLoading = null;
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

  // Returns a promise that is done once the dictionary is there, or could
  // not be fetched.
  function loadDictionary() {
    if (!dictionaryLoading) {
      dictionaryLoading = fetch(dictionaryUrl)
        .then((response) => response.text())
        .then((text) => {
          dictionary = readDictionary(text);
          showSuggestions();
          loadUsualReadings();
        })
        // Without the dictionary the fields are simply filled in by hand.
        .catch(() => {
          dictionaryLoading = null;
        });
    }
    return dictionaryLoading;
  }

  // How a word typed in one script is written in both, for someone who is
  // only asked for one (`script` says which): from `tapped`, the dictionary entry that was tapped to
  // fill in the fields (if one was) or, failing that, from the dictionary's
  // entries for those characters. Where the dictionary cannot tell, both are
  // taken to be the same.
  //
  // Returns { traditional, simplified }.
  function completeForms(script, characters, pinyin, tapped = null) {
    const other = script === 'traditional' ? 'simplified' : 'traditional';
    const entries = [
      ...(tapped ? [tapped] : []),
      ...(dictionary ? lookUp(dictionary, characters) : []),
    ];
    return {
      [script]: characters,
      [other]: otherScriptForm(entries, script, characters, pinyin),
    };
  }

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
  // The reading a word usually has, where the dictionary has several: the
  // first one the HSK 3.0 list gives it (the list goes from the lowest level
  // up, so that is the reading learned first: 行 xíng, not háng), else the
  // TOCFL list's. By either form; filled in once both lists are fetched,
  // which happens with the dictionary. (The dictionary itself lists a
  // word's readings alphabetically, which says nothing of which is usual.)
  const usualReading = new Map();
  // The words of both lists, HSK 3.0's first: what lists words looked up by
  // pinyin the likeliest first (lookUpByPinyin). Replaced, never changed,
  // since lookUpByPinyin keeps what it works out from it.
  let readyListWords = [];
  let usualReadingsLoading = null;
  function loadUsualReadings() {
    usualReadingsLoading =
      usualReadingsLoading ||
      Promise.all(['hsk-3.0', 'tocfl'].map((listId) => readyEntries(listId).catch(() => [])))
        .then((lists) => {
          for (const entry of lists.flat()) {
            for (const form of [entry.simplified, entry.traditional]) {
              if (!usualReading.has(form)) {
                usualReading.set(form, entry.pinyin);
              }
            }
          }
          readyListWords = lists.flat();
          showSuggestions();
        });
    return usualReadingsLoading;
  }

  // The entry to fill in by itself: the one with the usual reading, if the
  // lists know it, otherwise the dictionary's first.
  function likeliestEntry(entries, typed) {
    const usual = usualReading.get(typed);
    return entries.find((entry) => entry.pinyin === usual) || entries[0] || null;
  }

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
  // its right-hand end says.
  function entryButton(entry, label) {
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
      span('entry-characters', charactersOf(entry)),
      span('entry-pinyin', formatPinyin(entry.pinyin)),
      span(
        'entry-definition',
        meanings.length > MAX_MEANINGS_LENGTH ? `${meanings.slice(0, MAX_MEANINGS_LENGTH)}…` : meanings,
      ),
      span('entry-new', label),
    );
    button.classList.toggle('selected', sameEntry(entry, filledEntry));
    button.addEventListener('click', () => fillIn(entry));
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
    if (!dictionary) {
      return [];
    }
    const entries = lookUpByPinyin(dictionary, typed, readyListWords);
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
    const typed = lookedUpField.value.trim();
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

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // or the browser would reload the page
    const typed = Object.fromEntries(
      Object.entries(addFields).map(([name, input]) => [name, input.value]),
    );
    // Pinyin still in the box: the word is to be chosen from the list.
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
    await putAll('words', [withDeck(existing || toAdd[0], deck.id)]);
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
    lookedUpField.focus();
  });

  // ---- Adding a list ----

  function forgetCheckedList() {
    listToAdd = [];
    listRead = [];
    addListButton.hidden = true;
    listReport.textContent = '';
    listProblems.replaceChildren();
  }

  // The real file chooser is a hidden <input type="file">; the visible button opens it.
  listFileButton.addEventListener('click', () => listFile.click());
  listFile.addEventListener('change', async () => {
    const file = listFile.files[0];
    listFile.value = ''; // so choosing the same file again still counts
    if (file) {
      listText.value = await file.text();
      forgetCheckedList();
    }
  });

  // A list changed after it was checked has to be checked again.
  listText.addEventListener('input', forgetCheckedList);

  const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

  checkListButton.addEventListener('click', async () => {
    forgetCheckedList();
    // A line with one column of characters has its other script looked up.
    await loadDictionary();
    const { words: readable, problems } = readWordList(listText.value, (characters, pinyin) =>
      completeForms(getSettings().script, characters, pinyin),
    );
    const { toAdd, alreadyHave } = newWordRecords(readable, words, Date.now());
    if (readable.length === 0 && problems.length === 0) {
      listReport.textContent = 'There is nothing in the box yet.';
      return;
    }
    // New words written like a word already in the list, but read differently.
    const sameCharacters = toAdd.filter((word) => wordsWithSameCharacters(word, words).length > 0);
    listReport.textContent =
      `${plural(toAdd.length, 'new word')}, ${alreadyHave} you already have, ` +
      `${plural(problems.length, 'line')} that can't be read.` +
      (sameCharacters.length > 0
        ? ` Of the new words, ${sameCharacters.length} ${sameCharacters.length === 1 ? 'has' : 'have'} the same` +
          ` characters as a word you already have, with another reading:` +
          ` ${sameCharacters.slice(0, 10).map((word) => word[scriptFor(word, getSettings())]).join(', ')}` +
          `${sameCharacters.length > 10 ? ', …' : ''}.`
        : '');
    const shown = problems.slice(0, MAX_PROBLEMS_SHOWN).map(({ lineNumber, text, problem }) => {
      const item = document.createElement('li');
      item.textContent = `Line ${lineNumber} (${text.slice(0, 30)}): ${problem}`;
      return item;
    });
    if (problems.length > MAX_PROBLEMS_SHOWN) {
      const more = document.createElement('li');
      more.textContent = `… and ${problems.length - MAX_PROBLEMS_SHOWN} more.`;
      shown.push(more);
    }
    listProblems.replaceChildren(...shown);

    listToAdd = toAdd;
    listRead = readable;
    showAddListButton();
  });

  // The words of the checked list that are in your words already, but not
  // in the deck whose page is open. Adding the list puts them in it too.
  function listedButNotInDeck() {
    const deckId = openDeck().id;
    const listed = new Set(listRead.map((word) => wordId(word)));
    return words.filter((word) => listed.has(word.id) && !word.decks.includes(deckId));
  }

  // A list is worth adding even if every word in it is there already: they
  // are put in this deck.
  function showAddListButton() {
    const toFile = listedButNotInDeck().length;
    addListButton.textContent =
      listToAdd.length > 0 || toFile === 0
        ? `Add ${plural(listToAdd.length, 'word')}`
        : `Put ${plural(toFile, 'word')} in this deck`;
    addListButton.hidden = listToAdd.length === 0 && toFile === 0;
  }

  addListButton.addEventListener('click', async () => {
    // Worked out again here, in case the list of words changed since the check.
    const { toAdd } = newWordRecords(listToAdd, words, Date.now());
    // Everything goes into the deck whose page is open, the words of the
    // list that were there already too.
    const deckId = openDeck().id;
    const alreadyThere = listedButNotInDeck();
    await putAll('words', [...toAdd, ...alreadyThere].map((word) => withDeck(word, deckId)));
    forgetCheckedList();
    listText.value = '';
    listReport.textContent =
      `Added ${plural(toAdd.length, 'word')}.` +
      (toAdd.length > 0 ? ' They wait in Learn.' : '') +
      (alreadyThere.length > 0 ? ` ${plural(alreadyThere.length, 'word')} you already had went into this deck.` : '');
    await afterChange();
  });

  // ---- Adding a ready-made list ----

  // The rows to choose a list with, and the list chosen: the first to begin
  // with.
  const readyRows = [...document.querySelectorAll('#ready-list button')];
  let readyListId = readyRows[0].dataset.list;
  const readyLevels = byId('ready-levels');
  const readyReport = byId('ready-report');

  // The lists fetched so far: list ID → its entries (see parseReadyList).
  const readyLists = new Map();

  async function readyEntries(listId) {
    if (!readyLists.has(listId)) {
      const response = await fetch(READY_LIST_URLS[listId]);
      readyLists.set(listId, parseReadyList(await response.text()));
    }
    return readyLists.get(listId);
  }

  // Lists the levels of the chosen list, one row each with how many of its
  // words are new and a button that adds it (the owner, 2026-10-14: a level
  // is months of work, so levels are added one at a time). The levels of a
  // list that keeps a deck of its own with its levels inside (the radicals)
  // get a checkbox each instead, and one button under them that adds the
  // ones ticked, since they make one deck.
  async function showReadyLevels() {
    const listId = readyListId;
    for (const row of readyRows) {
      const chosen = row.dataset.list === listId;
      row.classList.toggle('selected', chosen);
      // Says to a screen reader which row is the chosen one.
      row.setAttribute('aria-pressed', chosen);
      if (chosen) {
        byId('ready-levels-title').textContent = `Levels of ${row.firstElementChild.textContent}`;
      }
    }
    let entries;
    try {
      entries = await readyEntries(listId);
    } catch {
      readyLevels.replaceChildren();
      readyReport.textContent = 'The list could not be fetched. It needs a connection the first time.';
      return;
    }
    if (listId !== readyListId) {
      return; // another list was tapped while this one was being fetched
    }
    const together = !READY_MADE_LISTS.find((list) => list.id === listId).levelName;
    byId('ready-levels-hint').textContent = together
      ? `What you add goes into the deck ${readyMadeDeck(listId).name} under My decks, with a deck for each level inside it.`
      : 'Each level you add becomes a deck of its own under My decks. Where a level is divided into smaller groups of words, each group is a deck inside it.';
    const rows = levelsOfReadyList(entries, words).map(({ level, count, newCount }) => {
      const row = document.createElement('li');
      const text = document.createElement('span');
      // TOCFL has two levels with names of their own before its level 1.
      text.textContent =
        `${/^\d/.test(level) ? `Level ${level}` : level}: ${plural(count, 'word')}` +
        (newCount === count ? '' : newCount === 0 ? ', all in your words already' : `, ${newCount} new`);
      if (together) {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = level;
        box.addEventListener('change', () => {
          addTogether.disabled = !readyLevels.querySelector('input:checked');
        });
        const label = document.createElement('label');
        label.append(box, text);
        row.append(label);
        return row;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'small';
      button.textContent = 'Add';
      button.dataset.level = level;
      button.addEventListener('click', () => addReadyLevels(listId, [level]));
      row.append(text, button);
      return row;
    });
    // The one button for the levels ticked.
    const addTogether = document.createElement('button');
    addTogether.type = 'button';
    addTogether.className = 'small primary';
    addTogether.id = 'add-ready-button';
    addTogether.textContent = 'Add';
    addTogether.disabled = true;
    addTogether.addEventListener('click', () =>
      addReadyLevels(listId, [...readyLevels.querySelectorAll('input:checked')].map((box) => box.value)),
    );
    if (together) {
      const row = document.createElement('li');
      row.append(addTogether);
      rows.push(row);
    }
    readyLevels.replaceChildren(...rows);
  }

  for (const row of readyRows) {
    row.addEventListener('click', () => {
      readyListId = row.dataset.list;
      readyReport.textContent = '';
      showReadyLevels();
    });
  }

  // Adds levels of a list: their new words at the end of the queue, lowest
  // level first, and the words that were there already into their decks as
  // well. Also used by the introduction (welcome.js), through the panel's
  // addReadyLevels. Returns how many words were added.
  async function addReadyLevels(listId, levels) {
    const entries = (await readyEntries(listId)).filter((entry) => levels.includes(entry.level));
    for (const button of readyLevels.querySelectorAll('button')) {
      button.disabled = true;
    }
    readyReport.textContent = 'Adding…';
    // Meanings come from the dictionary, as for a word typed by hand.
    await loadDictionary();
    const { meaningDetail } = getSettings();
    const candidates = [];
    const tags = new Map(); // word ID → the tag for this list and level
    const groupNames = new Map(); // a group's deck ID → its name
    let noMeaning = 0;
    for (const entry of entries) {
      // A line with no reading is a radical of its own, with its meaning in
      // the list (see radicals.js).
      if (entry.pinyin === '') {
        const radical = radicalRecord(entry);
        candidates.push(radical);
        tags.set(radical.id, listTag(listId, entry.level, entry.group));
        continue;
      }
      const inDictionary = dictionary ? lookUp(dictionary, entry.traditional) : [];
      const sameWord = inDictionary.find(
        (found) => found.traditional === entry.traditional && found.pinyin === entry.pinyin,
      );
      const definition = sameWord
        ? proposeMeaning(sameWord.meanings, meaningDetail)
        : entry.meaning || (inDictionary[0] ? proposeMeaning(inDictionary[0].meanings, meaningDetail) : '');
      const checked = checkWord({ ...entry, definition });
      if (!checked.word) {
        noMeaning += 1; // only without the dictionary, for want of a meaning
        continue;
      }
      candidates.push(checked.word);
      const tag = listTag(listId, entry.level, entry.group);
      tags.set(wordId(checked.word), tag);
      if (entry.group !== '') {
        groupNames.set(tag, groupName(entry.group));
      }
    }
    const withTag = (word) => ({ ...word, decks: [...new Set([...(word.decks || []), tags.get(word.id)])] });
    const { toAdd, alreadyHave } = newWordRecords(candidates, words, Date.now());
    // Words that were there already are put in the level's deck too.
    const marked = words.filter((word) => tags.has(word.id) && !(word.decks || []).includes(tags.get(word.id)));
    const tagged = [...toAdd, ...marked].map(withTag);
    await putAll('words', tagged);
    // The level (and the list, for the radicals) become decks, if they are
    // not there yet.
    await putAll('decks', missingReadyMadeDecks(tagged, await getAll('decks'), groupNames));
    await afterChange();
    await showReadyLevels();
    readyReport.textContent =
      `Added ${plural(toAdd.length, 'word')}` +
      (alreadyHave > 0 ? `; ${alreadyHave} you already had` : '') +
      (noMeaning > 0 ? `; ${noMeaning} left out because the dictionary could not be fetched for their meaning` : '') +
      `. They are in the deck ${(readyMadeDeck(listId) || readyMadeDeck(listTag(listId, levels[0]))).name} under My decks, and wait in Learn, last in line.`;
    return toAdd.length;
  }

  // ---- One word: change, study next, remove ----

  // Says at the top of the pop-up panel whether the word has been learned.
  function showDialogStatus(word) {
    dialogStatus.textContent = studiedWordIds.has(word.id)
      ? 'You have learned this word; its cards come up in Review.'
      : 'Waiting: you have not learned this word yet. It comes up in Learn.';
  }

  // The checkboxes for suspending a word's cards, one per kind.
  const suspendedBoxes = [...document.querySelectorAll('#edit-suspended input')];
  // Says on the closed fold-out how many are ticked.
  function showSuspendedCount() {
    const count = suspendedBoxes.filter((box) => box.checked).length;
    byId('edit-suspended-summary').textContent = count > 0 ? `Suspended cards (${count})` : 'Suspended cards';
  }
  // The word whose cards the word page is showing.
  let cardsWord = null;
  // Fills in the cards part of a word's page: how its cards stand, and the
  // boxes for suspending them.
  function showCardsOnPage(word) {
    cardsWord = word;
    for (const box of suspendedBoxes) {
      box.checked = (word.suspended || []).includes(box.value);
      // A sentence or a radical has no pinyin or tone card to suspend.
      box.closest('label').hidden =
        (isSentence(word) || isRadical(word)) && (box.value === 'pinyin' || box.value === 'tone');
    }
    byId('edit-suspended-row').open = suspendedBoxes.some((box) => box.checked);
    showSuspendedCount();
    byId('edit-cards-row').open = false;
    return cardsPanel.showCardsOf(word);
  }
  // Ticking a box suspends that kind of card there and then.
  for (const box of suspendedBoxes) {
    box.addEventListener('change', async () => {
      showSuspendedCount();
      const { changedAt, suspended: unused, ...rest } = cardsWord;
      const off = suspendedBoxes.filter((entry) => entry.checked).map((entry) => entry.value);
      const changed = off.length > 0 ? { ...rest, suspended: off } : rest;
      await putAll('words', [changed]);
      await afterChange();
      cardsWord = words.find((word) => word.id === changed.id) || changed;
      // If the word's pop-up panel is open too, it goes on with the changed word.
      if (openWord && openWord.id === cardsWord.id) {
        openWord = cardsWord;
        dialogResult = { changed: true, word: cardsWord };
      }
      cardsPanel.showCardsOf(cardsWord);
    });
  }

  function openDialog(word) {
    // A sentence has no Taiwan reading, no readings for tone cards and no
    // script of its own; it has a word to fill in instead.
    applySettings();
    const sentence = isSentence(word);
    if (sentence) {
      for (const box of [editPinyinTaiwan, editPinyinAlso, editCardScript]) {
        box.closest('label').hidden = true;
      }
    } else {
      editPinyinAlso.closest('label').hidden = false;
    }
    // A radical from the ready-made deck has only its meaning and decks to
    // change: its forms are its ID, and it has no reading (radicals.js).
    // applySettings shows the other boxes again for the next word, all but
    // the pinyin, which is shown again here.
    editPinyin.closest('label').hidden = false;
    if (isRadical(word)) {
      for (const box of [editTraditional, editSimplified, editPinyin, editPinyinTaiwan, editPinyinAlso, editCardScript]) {
        box.closest('label').hidden = true;
      }
    }
    editCloze.closest('label').hidden = !sentence;
    // The word to fill in is shown in the script the sentence is studied in.
    editCloze.value = sentence && word.cloze ? word.cloze[scriptFor(word, getSettings())] : '';
    openWord = word;
    dialogResult = { changed: false, word };
    const studied = studiedWordIds.has(word.id);
    dialogTitle.textContent = `${word[scriptFor(word, getSettings())]} ${formatPinyin(word.pinyin)}`;
    showDialogStatus(word);
    editDefinition.value = word.definition;
    editTraditional.value = word.traditional;
    editSimplified.value = word.simplified;
    editPinyin.value = word.pinyin;
    editPinyinTaiwan.value = word.pinyinTaiwan || '';
    editPinyinAlso.value = word.pinyinAlso || '';
    editCardScript.value = word.cardScript || '';
    // One checkbox per deck, in the fold-out "Decks".
    const boxes = deckTree(decks).map(({ deck, label: name }) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = deck.id;
      box.checked = (word.decks || []).includes(deck.id);
      box.addEventListener('change', showDeckCount);
      const label = document.createElement('label');
      label.append(box, ` ${name}`);
      return label;
    });
    // The first child is the fieldset's caption, which stays.
    editDecks.replaceChildren(editDecks.firstElementChild, ...boxes);
    byId('edit-decks-row').hidden = false;
    byId('edit-decks-row').open = false;
    showDeckCount();
    dialogNote.textContent = '';
    // Only a word still waiting can be moved to the front of the line.
    studyNextButton.hidden = studied;
    // showModal() opens a <dialog> on top of the page and dims the rest.
    dialog.showModal();
  }

  // The decks ticked in the word's panel.
  const tickedDecks = () => [...editDecks.querySelectorAll('input:checked')].map((box) => box.value);

  // Says on the fold-out how many decks the word is in, so it need not be
  // opened to see.
  function showDeckCount() {
    const count = tickedDecks().length;
    byId('edit-decks-summary').textContent = count === 0 ? 'Decks: in none' : `Decks: in ${count}`;
  }

  byId('word-dialog-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    // The traditional form and the pinyin make up the word's ID, which its
    // cards and review history are filed under; when either is corrected,
    // those are filed under the new ID (renameWord).
    // What is not asked for (see applySettings) stays as it was stored.
    if (isSentence(openWord)) {
      // A sentence is saved by rules of its own: its pinyin is kept as
      // typed, and it has a word to fill in.
      const asksSentence = asksFor();
      // A script that is not asked for cannot be typed. If the sentence in
      // the other one was changed, it is the best there is for both.
      const typed = (box, asked, stored, otherBox, otherStored) =>
        asked ? box.value.trim() : otherBox.value.trim() === otherStored ? stored : otherBox.value.trim();
      const traditional = typed(editTraditional, asksSentence.traditional, openWord.traditional, editSimplified, openWord.simplified);
      const simplified = typed(editSimplified, asksSentence.simplified, openWord.simplified, editTraditional, openWord.traditional);
      const definition = editDefinition.value.trim();
      if (traditional === '' || simplified === '' || definition === '') {
        dialogNote.textContent = 'A sentence needs its characters and what it means.';
        return;
      }
      const script = scriptFor(openWord, getSettings());
      const [own, other] = script === 'traditional' ? [traditional, simplified] : [simplified, traditional];
      const clozeTyped = editCloze.value.trim();
      const cloze = clozeInBoth(own, other, clozeTyped);
      if (clozeTyped !== '' && !cloze) {
        dialogNote.textContent = `"${clozeTyped}" is not in the sentence.`;
        return;
      }
      if (tickedDecks().length === 0) {
        byId('edit-decks-row').open = true;
        dialogNote.textContent = 'A sentence has to be in at least one deck. To be rid of it, use Remove.';
        return;
      }
      const there = new Set(decks.map((deck) => deck.id));
      const { changedAt, suspended: wasSuspended, cloze: oldCloze, ...kept } = openWord;
      const sentence = {
        ...kept,
        id: sentenceId(traditional),
        traditional,
        simplified,
        pinyin: editPinyin.value.trim(),
        definition,
        decks: [...(openWord.decks || []).filter((id) => !there.has(id)), ...tickedDecks()],
      };
      if (cloze) {
        sentence.cloze =
          script === 'traditional'
            ? { traditional: cloze.own, simplified: cloze.other }
            : { traditional: cloze.other, simplified: cloze.own };
      }
      // Which cards are suspended is changed on the word's page, not here.
      if (wasSuspended) {
        sentence.suspended = wasSuspended;
      }
      if (sentence.id === openWord.id) {
        await putAll('words', [sentence]);
      } else if (words.some((word) => word.id === sentence.id)) {
        dialogNote.textContent = 'This sentence is already in your words.';
        return;
      } else {
        // Its characters changed, and its ID with them: its cards and
        // reviews are filed under the new one, as for a corrected word.
        await renameWord(openWord.id, withFormerId(sentence, openWord));
      }
      await fileCardsByScript([sentence]);
      await afterChange();
      dialogResult = { changed: true, word: sentence };
      dialog.close();
      return;
    }
    if (isRadical(openWord)) {
      const definition = editDefinition.value.trim();
      if (definition === '') {
        dialogNote.textContent = 'A radical needs its meaning.';
        return;
      }
      if (tickedDecks().length === 0) {
        byId('edit-decks-row').open = true;
        dialogNote.textContent = 'A radical has to be in at least one deck. To be rid of it, use Remove.';
        return;
      }
      const there = new Set(decks.map((deck) => deck.id));
      const { changedAt, ...kept } = openWord;
      const radical = {
        ...kept,
        definition,
        decks: [...(openWord.decks || []).filter((id) => !there.has(id)), ...tickedDecks()],
      };
      await putAll('words', [radical]);
      await afterChange();
      dialogResult = { changed: true, word: radical };
      dialog.close();
      return;
    }
    const asks = asksFor();
    const checked = checkWord({
      traditional: asks.traditional ? editTraditional.value : openWord.traditional,
      pinyin: editPinyin.value,
      simplified: asks.simplified ? editSimplified.value : openWord.simplified,
      definition: editDefinition.value,
      pinyinTaiwan: asks.taiwan ? editPinyinTaiwan.value : openWord.pinyinTaiwan,
      pinyinAlso: editPinyinAlso.value,
      cardScript: asks.traditional && asks.simplified ? editCardScript.value : openWord.cardScript,
    });
    if (checked.problem) {
      dialogNote.textContent = checked.problem;
      return;
    }
    // Start from the tidied word, so a Taiwan reading that was cleared is gone.
    const saved = {
      ...checked.word,
      id: wordId(checked.word),
      order: openWord.order,
      addedAt: openWord.addedAt,
    };
    // The decks ticked, and any the word is in that are not there to tick
    // (which should not happen). The IDs it had before are kept.
    const known = new Set(decks.map((deck) => deck.id));
    if (tickedDecks().length === 0) {
      byId('edit-decks-row').open = true;
      dialogNote.textContent = 'A word has to be in at least one deck. To be rid of the word, use Remove.';
      return;
    }
    saved.decks = [...(openWord.decks || []).filter((id) => !known.has(id)), ...tickedDecks()];
    if (openWord.formerIds) {
      saved.formerIds = openWord.formerIds;
    }
    if (openWord.learnedAt !== undefined) {
      saved.learnedAt = openWord.learnedAt;
    }
    if (openWord.startedOverAt) {
      saved.startedOverAt = openWord.startedOverAt;
    }
    // Which cards are suspended is changed on the word's page, not here.
    if (openWord.suspended) {
      saved.suspended = openWord.suspended;
    }
    if (saved.id === openWord.id) {
      await putAll('words', [saved]);
    } else if (words.some((word) => word.id === saved.id)) {
      dialogNote.textContent =
        `${charactersOf(saved)} (${formatPinyin(saved.pinyin)}) is already in your words.`;
      return;
    } else {
      await renameWord(openWord.id, withFormerId(saved, openWord));
    }
    // If the two scripts now differ where they were the same, a writing card
    // learned in simplified goes under the simplified form (scriptCards.js).
    await fileCardsByScript([saved]);
    // The panel closes once the rest of the app has the changed word too.
    await afterChange();
    dialogResult = { changed: true, word: saved };
    dialog.close();
  });

  studyNextButton.addEventListener('click', async () => {
    const moved = { ...openWord, order: orderForStudyingNext(words) };
    await putAll('words', [moved]);
    await afterChange();
    dialogResult = { changed: true, word: moved };
    dialog.close();
  });

  byId('remove-word-button').addEventListener('click', async () => {
    const confirmed = await ask({
      question: `Remove ${charactersOf(openWord)} from your words?`,
      detail: 'Its cards and their schedule are removed too. Your review history is kept.',
      yes: 'Remove',
    });
    if (!confirmed) {
      return;
    }
    await removeWord(openWord.id, allCardIds(openWord));
    await afterChange();
    dialogResult = { changed: true, word: null };
    dialog.close();
  });

  byId('word-dialog-close').addEventListener('click', () => dialog.close());

  return {
    addReadyLevels,
    noteOf: (word) => wordPage.noteOf(word),

    // Opens a word's panel from elsewhere in the app (Review's "Edit word").
    // Returns a promise for what became of the word once the panel is closed:
    //   changed: true if anything was saved
    //   word:    the word record as it is now; null if it was removed
    async edit(word) {
      applySettings();
      await load();
      renderDecks();
      openDialog(words.find((entry) => entry.id === word.id) || word);
      // A <dialog> announces "close" however it was closed, the Esc key included.
      return new Promise((resolve) => {
        dialog.addEventListener('close', () => resolve(dialogResult), { once: true });
      });
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
