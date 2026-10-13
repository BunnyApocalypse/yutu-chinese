// The Words tab: add a word, add a list of words, and look through the words
// you have, changing or removing them.
//
// What is typed is checked by the plain-calculation code in words.js; this
// file is the page side, and saves the results in the database.

import { getAll, putAll, removeWord, renameWord } from './db.js';
import { formatPinyin, wordId } from './wordList.js';
import { allCardIds } from './session.js';
import { fileCardsByScript } from './scriptCards.js';
import { missingReadyMadeDecks } from './decks.js';
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
  withFormerId,
  tidyPinyin,
} from './words.js';
import { readDictionary, lookUp, proposeMeaning, otherScriptForm } from './dictionary.js';
// "?url" makes Vite hand us the file's address instead of its contents, so
// the dictionary stays a separate file that is only fetched when needed.
import dictionaryUrl from '../data/cedict/dictionary.tsv?url';
// The ready-made lists are separate files in the same way (data/wordlists/).
import hsk3Url from '../data/wordlists/hsk/hsk-3.0.tsv?url';
import hsk2Url from '../data/wordlists/hsk/hsk-2.0.tsv?url';
import tocflUrl from '../data/wordlists/tocfl/tocfl.tsv?url';

// Where each ready-made list is fetched from, by the value of its entry in
// the List drop-down (index.html).
const READY_LIST_URLS = { 'hsk-3.0': hsk3Url, 'hsk-2.0': hsk2Url, tocfl: tocflUrl };

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
// Returns { show(), edit(word) }; call show() whenever the tab is opened or a
// setting has changed.
export function createWordsPanel(onChange, getSettings) {
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
  const listElement = byId('word-list');
  const listNote = byId('word-list-note');

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
  const dialogNote = byId('word-dialog-note');
  const studyNextButton = byId('study-next-button');

  let words = [];
  // The IDs of the words that have been learned.
  let studiedWordIds = new Set();
  // The checked words of a pasted list, waiting for "Add".
  let listToAdd = [];
  // The word open in the dialog.
  let openWord = null;
  // What became of it, for edit(): see there.
  let dialogResult = null;

  async function load() {
    words = (await getAll('words')).sort((a, b) => a.order - b.order);
    // A word is learned once it has been through the Learn tab, or has a card
    // (see isLearned in session.js).
    studiedWordIds = new Set([
      ...(await getAll('cards')).map((card) => card.wordId),
      ...words.filter((word) => word.learnedAt !== undefined).map((word) => word.id),
    ]);
  }

  // Reads the list afresh, shows it, and tells the rest of the app.
  async function afterChange() {
    await load();
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
  function applySettings() {
    const asks = asksFor();
    const both = asks.traditional && asks.simplified;
    const asked = scriptAsked();
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
    caption(addFields.traditional, both ? 'Traditional 繁體' : 'Word or phrase 漢字');
    caption(
      addFields.simplified,
      both ? `Simplified 简体${asked ? '' : ' (if different)'}` : 'Word or phrase 汉字',
    );
    editSimplifiedCaption.textContent = both ? 'Simplified' : 'Characters';
    if (!lookedUpField || lookedUpField.hidden) {
      lookedUpField = asked === 'simplified' ? addFields.simplified : addFields.traditional;
    }
    // In the pop-up panel each box sits in a <label>, which holds its caption.
    editTraditional.closest('label').hidden = !asks.traditional;
    editSimplified.closest('label').hidden = !asks.simplified;
    editPinyinTaiwan.closest('label').hidden = !asks.taiwan;
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
    const matching = words.filter((word) => matchesSearch(word, searchInput.value));
    countElement.textContent = words.length;
    listNote.textContent =
      matching.length > MAX_ROWS
        ? `Showing the first ${MAX_ROWS} of ${matching.length}. Search to narrow them down.`
        : matching.length === 0
          ? 'No words match.'
          : '';

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
      if (!studiedWordIds.has(word.id)) {
        button.append(span('entry-new', 'waiting'));
      }
      button.addEventListener('click', () => openDialog(word));
      const row = document.createElement('li');
      row.append(button);
      return row;
    });
    listElement.replaceChildren(...rows);
  }

  searchInput.addEventListener('input', renderList);

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
  // The dictionary entry last tapped to fill in the fields, until the
  // characters are typed over.
  let filledEntry = null;

  // Returns a promise that is done once the dictionary is there, or could
  // not be fetched.
  function loadDictionary() {
    if (!dictionaryLoading) {
      dictionaryLoading = fetch(dictionaryUrl)
        .then((response) => response.text())
        .then((text) => {
          dictionary = readDictionary(text);
          showSuggestions();
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
    fillInCharacters(entry);
    addFields.pinyin.value = entry.pinyin;
    addFields.pinyinTaiwan.value = asks.taiwan ? entry.pinyinTaiwan || '' : '';
    addFields.definition.value = proposeMeaning(entry.meanings, getSettings().meaningDetail);
    showPinyinPreview();
    addNote.textContent = '';
    // The meaning is the part most likely to want changing.
    addFields.definition.focus();
  }

  // Shows, under the characters typed, the words in the list written the
  // same way and what the dictionary has for them.
  function showSuggestions() {
    const typed = lookedUpField.value.trim();
    const parts = [];
    if (typed !== '') {
      const alreadyHave = wordsWithSameCharacters({ traditional: typed, simplified: typed }, words);
      for (const word of alreadyHave) {
        parts.push(
          paragraph('note', `Already in your words: ${charactersOf(word)} ${formatPinyin(word.pinyin)} (${word.definition})`),
        );
      }
      const entries = dictionary ? lookUp(dictionary, typed) : [];
      for (const entry of entries.slice(0, MAX_SUGGESTIONS)) {
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
          span('entry-new', 'fill in'),
        );
        button.addEventListener('click', () => fillIn(entry));
        parts.push(button);
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
      lookedUpField = field;
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
    const { toAdd } = newWordRecords([checked.word], words, Date.now());
    if (toAdd.length === 0) {
      addNote.textContent =
        `${charactersOf(checked.word)} (${formatPinyin(checked.word.pinyin)}) is already in your words.`;
      return;
    }
    await putAll('words', toAdd);
    addForm.reset();
    filledEntry = null;
    applySettings(); // "Cards in" is back to "As in Settings", so both boxes are

    pinyinPreview.textContent = '';
    suggestions.replaceChildren();
    addNote.textContent = `Added ${charactersOf(toAdd[0])}. It waits in the Learn tab, last in line.`;
    await afterChange();
    lookedUpField.focus();
  });

  // ---- Adding a list ----

  function forgetCheckedList() {
    listToAdd = [];
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
    addListButton.textContent = `Add ${plural(toAdd.length, 'word')}`;
    addListButton.hidden = toAdd.length === 0;
  });

  addListButton.addEventListener('click', async () => {
    // Worked out again here, in case the list of words changed since the check.
    const { toAdd } = newWordRecords(listToAdd, words, Date.now());
    await putAll('words', toAdd);
    forgetCheckedList();
    listText.value = '';
    listReport.textContent = `Added ${plural(toAdd.length, 'word')}. They wait in the Learn tab.`;
    await afterChange();
  });

  // ---- Adding a ready-made list ----

  const readyDetails = byId('ready-list');
  const readySelect = byId('ready-list-select');
  const readyLevels = byId('ready-levels');
  const addReadyButton = byId('add-ready-button');
  const readyReport = byId('ready-report');

  // The lists fetched so far: list ID → its entries (see parseReadyList).
  const readyLists = new Map();

  async function readyEntries() {
    const listId = readySelect.value;
    if (!readyLists.has(listId)) {
      const response = await fetch(READY_LIST_URLS[listId]);
      readyLists.set(listId, parseReadyList(await response.text()));
    }
    return readyLists.get(listId);
  }

  const chosenLevels = () =>
    [...readyLevels.querySelectorAll('input:checked')].map((box) => box.value);

  // Says on the button how many words the chosen levels would add.
  function showReadyCount() {
    const count = [...readyLevels.querySelectorAll('input:checked')].reduce(
      (total, box) => total + Number(box.dataset.newCount),
      0,
    );
    addReadyButton.textContent = `Add ${plural(count, 'word')}`;
    addReadyButton.disabled = chosenLevels().length === 0;
  }

  // Lists the levels of the chosen list, each with a checkbox.
  async function showReadyLevels() {
    let entries;
    try {
      entries = await readyEntries();
    } catch {
      readyReport.textContent = 'The list could not be fetched. It needs a connection the first time.';
      return;
    }
    const boxes = levelsOfReadyList(entries, words).map(({ level, count, newCount }) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = level;
      box.dataset.newCount = newCount;
      box.addEventListener('change', showReadyCount);
      const label = document.createElement('label');
      label.append(
        box,
        // TOCFL has two levels with names of their own before its level 1.
        ` ${/^\d/.test(level) ? `Level ${level}` : level}: ${plural(count, 'word')}` +
          (newCount === count ? '' : newCount === 0 ? ', all in your words already' : `, ${newCount} new`),
      );
      return label;
    });
    // The first child is the fieldset's caption, which stays.
    readyLevels.replaceChildren(readyLevels.firstElementChild, ...boxes);
    showReadyCount();
  }

  // "toggle" is announced when a <details> is opened or closed.
  readyDetails.addEventListener('toggle', () => {
    if (readyDetails.open) {
      readyReport.textContent = '';
      showReadyLevels();
    }
  });
  readySelect.addEventListener('change', () => {
    readyReport.textContent = '';
    showReadyLevels();
  });

  addReadyButton.addEventListener('click', async () => {
    const listId = readySelect.value;
    const levels = new Set(chosenLevels());
    const entries = (await readyEntries()).filter((entry) => levels.has(entry.level));
    addReadyButton.disabled = true;
    readyReport.textContent = 'Adding…';
    // Meanings come from the dictionary, as for a word typed by hand.
    await loadDictionary();
    const { meaningDetail } = getSettings();
    const candidates = [];
    const tags = new Map(); // word ID → the tag for this list and level
    let noMeaning = 0;
    for (const entry of entries) {
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
      tags.set(wordId(checked.word), listTag(listId, entry.level));
    }
    const withTag = (word) => ({ ...word, decks: [...new Set([...(word.decks || []), tags.get(word.id)])] });
    const { toAdd, alreadyHave } = newWordRecords(candidates, words, Date.now());
    // Words that were there already are put in the level's deck too.
    const marked = words.filter((word) => tags.has(word.id) && !(word.decks || []).includes(tags.get(word.id)));
    const tagged = [...toAdd, ...marked].map(withTag);
    await putAll('words', tagged);
    // The list and its levels become decks, if they are not there yet.
    await putAll('decks', missingReadyMadeDecks(tagged, await getAll('decks')));
    await afterChange();
    await showReadyLevels();
    readyReport.textContent =
      `Added ${plural(toAdd.length, 'word')}` +
      (alreadyHave > 0 ? `; ${alreadyHave} you already had` : '') +
      (noMeaning > 0 ? `; ${noMeaning} left out because the dictionary could not be fetched for their meaning` : '') +
      '. They wait in the Learn tab, last in line, lowest level first.';
  });

  // ---- One word: change, study next, remove ----

  function openDialog(word) {
    openWord = word;
    dialogResult = { changed: false, word };
    const studied = studiedWordIds.has(word.id);
    dialogTitle.textContent = `${word[scriptFor(word, getSettings())]} ${formatPinyin(word.pinyin)}`;
    dialogStatus.textContent = studied
      ? 'You have learned this word; its cards come up in Review.'
      : 'Waiting: you have not learned this word yet. It comes up in the Learn tab.';
    editDefinition.value = word.definition;
    editTraditional.value = word.traditional;
    editSimplified.value = word.simplified;
    editPinyin.value = word.pinyin;
    editPinyinTaiwan.value = word.pinyinTaiwan || '';
    editPinyinAlso.value = word.pinyinAlso || '';
    editCardScript.value = word.cardScript || '';
    dialogNote.textContent = '';
    // Only a word still waiting can be moved to the front of the line.
    studyNextButton.hidden = studied;
    // showModal() opens a <dialog> on top of the page and dims the rest.
    dialog.showModal();
  }

  byId('word-dialog-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    // The traditional form and the pinyin make up the word's ID, which its
    // cards and review history are filed under; when either is corrected,
    // those are filed under the new ID (renameWord).
    // What is not asked for (see applySettings) stays as it was stored.
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
    // The decks the word is in and the IDs it had before are kept.
    if (openWord.decks) {
      saved.decks = openWord.decks;
    }
    if (openWord.formerIds) {
      saved.formerIds = openWord.formerIds;
    }
    if (openWord.learnedAt !== undefined) {
      saved.learnedAt = openWord.learnedAt;
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
    const confirmed = window.confirm(
      `Remove ${charactersOf(openWord)} (${formatPinyin(openWord.pinyin)}) from your words?\n\n` +
        'Its cards and their schedule are removed too. Your review history is kept.',
    );
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
    // Opens a word's panel from elsewhere in the app (Review's "Edit word").
    // Returns a promise for what became of the word once the panel is closed:
    //   changed: true if anything was saved
    //   word:    the word record as it is now; null if it was removed
    async edit(word) {
      applySettings();
      await load();
      openDialog(words.find((entry) => entry.id === word.id) || word);
      // A <dialog> announces "close" however it was closed, the Esc key included.
      return new Promise((resolve) => {
        dialog.addEventListener('close', () => resolve(dialogResult), { once: true });
      });
    },

    async show() {
      applySettings();
      await load();
      renderList();
      showSuggestions();
    },
  };
}
