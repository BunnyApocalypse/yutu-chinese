// Adding a list of words to the deck whose page is open: pasted or from a
// file, checked first, then added. Moved here from wordsPanel.js on
// 2026-10-17, when it was split by screen. Reading the list is words.js's.

import { putAll } from './db.js';
import { wordId } from './wordList.js';
import { withDeck } from './decks.js';
import { readWordList, newWordRecords, wordsWithSameCharacters, scriptFor } from './words.js';
import { proposeMeaning } from './dictionary.js';
import { t, formatList } from './text.js';

const byId = (id) => document.getElementById(id);

// How many unreadable lines of a pasted list are spelled out.
const MAX_PROBLEMS_SHOWN = 20;

// shared: what the Decks and Words tabs keep (wordsPanel.js): words(),
// getSettings(), openDeck() (the deck whose page is open), afterChange().
// dictionaryLoader: dictionaryLoader.js (a line with one column of
// characters has its other script looked up).
//
// Returns { forget(), applySettings(asks, both) }.
export function createListForm(shared, dictionaryLoader) {
  const listHint = byId('list-hint');
  const listText = byId('list-text');
  const listFileButton = byId('list-file-button');
  const listFile = byId('list-file');
  const checkListButton = byId('check-list-button');
  const listReport = byId('list-report');
  const listProblems = byId('list-problems');
  const addListButton = byId('add-list-button');

  // The checked words of a pasted list, waiting for "Add", and every word
  // that could be read from it, those already there included.
  let listToAdd = [];
  let listRead = [];

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

  checkListButton.addEventListener('click', async () => {
    forgetCheckedList();
    // A line with one column of characters has its other script looked up,
    // and what a line leaves out (pinyin, a meaning) is filled in from the
    // dictionary, the usual reading first (tester 4, 2026-10-21).
    await dictionaryLoader.load();
    await dictionaryLoader.loadUsualReadings();
    const settings = shared.getSettings();
    const fillIn = (characters, pinyin) => {
      const entry = dictionaryLoader.entryFor(characters, pinyin);
      return (
        entry && {
          pinyin: entry.pinyin,
          pinyinTaiwan: entry.pinyinTaiwan,
          definition: proposeMeaning(entry.meanings, settings.meaningDetail),
        }
      );
    };
    // A list with traditional in the first column is read the other way
    // round (scriptOrder in readWordList), and the report says so.
    const { words: readable, problems, swapped } = readWordList(
      listText.value,
      (characters, pinyin) => dictionaryLoader.completeForms(settings.script, characters, pinyin),
      fillIn,
      (first, second) => dictionaryLoader.scriptOrder(first, second),
    );
    const { toAdd, alreadyHave } = newWordRecords(readable, shared.words(), Date.now());
    if (readable.length === 0 && problems.length === 0) {
      listReport.textContent = t('addList.nothingYet');
      return;
    }
    // New words written like a word already in the list, but read differently.
    const sameCharacters = toAdd.filter((word) => wordsWithSameCharacters(word, shared.words()).length > 0);
    listReport.textContent =
      t('addList.checked', {
        new: t('addList.newWords', { count: toAdd.length }),
        have: alreadyHave,
        lines: t('addList.lines', { count: problems.length }),
      }) +
      (sameCharacters.length > 0
        ? ` ${t('addList.sameCharacters', {
            count: sameCharacters.length,
            words: formatList([
              ...sameCharacters.slice(0, 10).map((word) => word[scriptFor(word, shared.getSettings())]),
              ...(sameCharacters.length > 10 ? ['…'] : []),
            ]),
          })}`
        : '') +
      (swapped ? ` ${t('addList.swapped')}` : '');
    const shown = problems.slice(0, MAX_PROBLEMS_SHOWN).map(({ lineNumber, text, problem }) => {
      const item = document.createElement('li');
      item.textContent = t('addList.problem', { line: lineNumber, text: text.slice(0, 30), problem });
      return item;
    });
    if (problems.length > MAX_PROBLEMS_SHOWN) {
      const more = document.createElement('li');
      more.textContent = t('addList.andMore', { count: problems.length - MAX_PROBLEMS_SHOWN });
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
    const deckId = shared.openDeck().id;
    const listed = new Set(listRead.map((word) => wordId(word)));
    return shared.words().filter((word) => listed.has(word.id) && !word.decks.includes(deckId));
  }

  // A list is worth adding even if every word in it is there already: they
  // are put in this deck.
  function showAddListButton() {
    const toFile = listedButNotInDeck().length;
    addListButton.textContent =
      listToAdd.length > 0 || toFile === 0
        ? t('addList.addWords', { count: listToAdd.length })
        : t('addList.putInDeck', { count: toFile });
    addListButton.hidden = listToAdd.length === 0 && toFile === 0;
  }

  addListButton.addEventListener('click', async () => {
    // Worked out again here, in case the list of words changed since the check.
    const { toAdd } = newWordRecords(listToAdd, shared.words(), Date.now());
    // Everything goes into the deck whose page is open, the words of the
    // list that were there already too.
    const deckId = shared.openDeck().id;
    const alreadyThere = listedButNotInDeck();
    await putAll('words', [...toAdd, ...alreadyThere].map((word) => withDeck(word, deckId)));
    forgetCheckedList();
    listText.value = '';
    listReport.textContent =
      [
        t('addList.added', { count: toAdd.length }),
        toAdd.length > 0 ? t('addList.waitInLearn') : '',
        alreadyThere.length > 0 ? t('addList.wentIntoDeck', { count: alreadyThere.length }) : '',
      ]
        .filter(Boolean)
        .join(' ');
    await shared.afterChange();
  });

  return {
    // A list checked but not added is forgotten (another deck's page opened).
    forget: forgetCheckedList,

    // How the box says a list is laid out, by the scripts and readings asked
    // for (`asks` from asksFor(), `both` while both scripts are learned).
    applySettings(asks, both) {
      listHint.textContent = both
        ? t(asks.taiwan ? 'addList.hintBothTaiwan' : 'addList.hintBoth')
        : t(asks.taiwan ? 'addList.hintOneTaiwan' : 'addList.hintOne');
    },
  };
}
