// Adding a list of words to the deck whose page is open. Moved here from
// wordsPanel.js on 2026-10-17, when it was split by screen. Reading the list
// is words.js's.
//
// The steps (the owner, 2026-11-08, from mockups; before, a file was poured
// into a text box and "Check list" had to be found):
//   start  "Choose a file", or "Or paste a list" for the text box
//   read   a chosen file at once, a pasted list once typing pauses; then
//          what was found, the first words, the lines that couldn't be
//          read, and one button to add them
//   done   what was added, and "Add another list"

import { putAll } from './db.js';
import { wordId } from './wordList.js';
import { withDeck } from './decks.js';
import { readWordList, newWordRecords, scriptFor } from './words.js';
import { proposeMeaning } from './dictionary.js';
import { showReading } from './readingStyle.js';
import { charactersElement, mixedSpan } from './wordRows.js';
import { fillMixed } from './lang.js';
import { t, formatList } from './text.js';

const byId = (id) => document.getElementById(id);

// How many unreadable lines of a list are spelled out.
const MAX_PROBLEMS_SHOWN = 20;
// Up to this many, they are listed open; more are folded under their count.
const PROBLEMS_SHOWN_OPEN = 5;
// How many of the list's words are shown, to see it was read right.
const PREVIEW_ROWS = 5;
// How long typing in the box must pause before the list is read (ms).
const READ_AFTER_MS = 600;

// shared: what the Decks and Words tabs keep (wordsPanel.js): words(),
// getSettings(), openDeck() (the deck whose page is open), afterChange().
// dictionaryLoader: dictionaryLoader.js (a line with one column of
// characters has its other script looked up).
//
// Returns { forget(), applySettings(asks, both) }.
export function createListForm(shared, dictionaryLoader) {
  const startPart = byId('list-start');
  const pastePart = byId('list-paste');
  const fileLine = byId('list-file-line');
  const foundPart = byId('list-found');
  const donePart = byId('list-done');
  const formatFold = byId('list-format');
  const listText = byId('list-text');
  const listFile = byId('list-file');
  const report = byId('list-report');
  const notes = byId('list-notes');
  const problemsFold = byId('list-problems-fold');
  const preview = byId('list-preview');
  const more = byId('list-more');
  const addListButton = byId('add-list-button');

  // The words of the list read last that are new, waiting for "Add", and
  // every word that could be read from it, those already there included.
  let listToAdd = [];
  let listRead = [];
  // Counts the readings started, so that one overtaken by a newer one (the
  // learner kept typing) is dropped when it ends.
  let readings = 0;
  let pause = 0;

  // Shows one step: 'start', 'paste', 'file' or 'done'. What was found is
  // shown apart, by showFound.
  function showStep(step) {
    startPart.hidden = step !== 'start';
    pastePart.hidden = step !== 'paste';
    fileLine.hidden = step !== 'file';
    donePart.hidden = step !== 'done';
    formatFold.hidden = step !== 'start' && step !== 'paste';
    if (step !== 'file' && step !== 'paste') {
      showFound(false);
    }
  }

  function showFound(shown) {
    foundPart.hidden = !shown;
    if (!shown) {
      listToAdd = [];
      listRead = [];
      delete foundPart.dataset.state;
    }
  }

  // Back to the beginning, the box emptied.
  function startAgain() {
    readings += 1;
    clearTimeout(pause);
    listText.value = '';
    showStep('start');
  }

  // The real file chooser is a hidden <input type="file">; the visible buttons open it.
  for (const id of ['list-file-button', 'list-file-instead', 'list-another-file']) {
    byId(id).addEventListener('click', () => listFile.click());
  }
  listFile.addEventListener('change', async () => {
    const file = listFile.files[0];
    listFile.value = ''; // so choosing the same file again still counts
    if (!file) {
      return;
    }
    byId('list-file-name').textContent = file.name;
    showStep('file');
    readList(await file.text());
  });

  byId('list-paste-button').addEventListener('click', () => {
    // What a chosen file gave doesn't belong under the box; a list pasted
    // there before is read again.
    readings += 1;
    showStep('paste');
    showFound(false);
    if (listText.value.trim() !== '') {
      readList(listText.value);
    }
    listText.focus();
  });
  // Read once typing pauses; a list emptied shows nothing found.
  listText.addEventListener('input', () => {
    clearTimeout(pause);
    readings += 1;
    if (listText.value.trim() === '') {
      showFound(false);
      return;
    }
    // What was found before no longer holds (the browser tests wait for 'read').
    delete foundPart.dataset.state;
    pause = setTimeout(() => readList(listText.value), READ_AFTER_MS);
  });

  byId('list-again-button').addEventListener('click', startAgain);

  async function readList(text) {
    readings += 1;
    const reading = readings;
    showFound(true);
    foundPart.dataset.state = 'reading';
    report.textContent = t('addList.reading');
    for (const part of [notes, problemsFold, preview, more, addListButton]) {
      part.hidden = true;
    }
    // A line with one column of characters has its other script looked up,
    // and what a line leaves out (pinyin, a meaning) is filled in from the
    // dictionary, the usual reading first (tester 4, 2026-10-21).
    await dictionaryLoader.load();
    await dictionaryLoader.loadUsualReadings();
    if (reading !== readings) {
      return;
    }
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
      text,
      (characters, pinyin) => dictionaryLoader.completeForms(settings.script, characters, pinyin),
      fillIn,
      (first, second) => dictionaryLoader.scriptOrder(first, second),
    );
    const { toAdd, alreadyHave } = newWordRecords(readable, shared.words(), Date.now());
    listToAdd = toAdd;
    listRead = readable;
    foundPart.dataset.state = 'read';

    report.textContent =
      readable.length > 0
        ? t('addList.found', { count: readable.length, new: toAdd.length, have: alreadyHave })
        : t('addList.nothingRead');

    // New words written like a word already there, but read differently
    // (as wordsWithSameCharacters in words.js says it). Looked up in two sets
    // made once: going through every word for each new one took 7 s of a
    // tablet's time for a list of 10,000 (2026-11-08).
    const traditionalForms = new Set(shared.words().map((word) => word.traditional));
    const simplifiedForms = new Set(shared.words().map((word) => word.simplified));
    const sameCharacters = toAdd.filter(
      (word) => traditionalForms.has(word.traditional) || simplifiedForms.has(word.simplified),
    );
    const noteLines = [];
    if (sameCharacters.length > 0) {
      noteLines.push(
        t('addList.sameCharacters', {
          count: sameCharacters.length,
          words: formatList([
            ...sameCharacters.slice(0, 10).map((word) => word[scriptFor(word, settings)]),
            ...(sameCharacters.length > 10 ? ['…'] : []),
          ]),
        }),
      );
    }
    if (swapped) {
      noteLines.push(t('addList.swapped'));
    }
    fillMixed(notes, noteLines.join(' '), settings.script);
    notes.hidden = noteLines.length === 0;

    // The lines that couldn't be read, under their count in red: open while
    // they are few, folded when many.
    problemsFold.hidden = problems.length === 0;
    problemsFold.open = problems.length <= PROBLEMS_SHOWN_OPEN;
    byId('list-problems-title').textContent = t('addList.unreadable', { count: problems.length });
    const shown = problems.slice(0, MAX_PROBLEMS_SHOWN).map(({ lineNumber, text: line, problem }) => {
      const item = document.createElement('li');
      fillMixed(item, t('addList.problem', { line: lineNumber, text: line.slice(0, 30), problem }), settings.script);
      return item;
    });
    if (problems.length > MAX_PROBLEMS_SHOWN) {
      const andMore = document.createElement('li');
      andMore.textContent = t('addList.andMore', { count: problems.length - MAX_PROBLEMS_SHOWN });
      shown.push(andMore);
    }
    byId('list-problems').replaceChildren(...shown);

    // The first words as they will be added, to see the list was read right
    // (readings and meanings filled in from the dictionary especially).
    preview.replaceChildren(
      ...readable.slice(0, PREVIEW_ROWS).map((word) => {
        const row = document.createElement('li');
        row.append(
          charactersElement(word, settings),
          mixedSpan('entry-pinyin', showReading(word.pinyin, Array.from(word.traditional)), scriptFor(word, settings)),
          mixedSpan('entry-definition', word.definition, scriptFor(word, settings)),
        );
        return row;
      }),
    );
    preview.hidden = readable.length === 0;
    more.textContent = t('addList.andMoreWords', { count: readable.length - PREVIEW_ROWS });
    more.hidden = readable.length <= PREVIEW_ROWS;

    showAddListButton();
  }

  // The words of the list that are in your words already, but not in the
  // deck whose page is open. Adding the list puts them in it too.
  function listedButNotInDeck() {
    const deckId = shared.openDeck().id;
    const listed = new Set(listRead.map((word) => wordId(word)));
    return shared.words().filter((word) => listed.has(word.id) && !word.decks.includes(deckId));
  }

  // A list is worth adding even if every word in it is there already: they
  // are put in this deck.
  function showAddListButton() {
    const deck = shared.openDeck().name;
    const toFile = listedButNotInDeck().length;
    fillMixed(
      addListButton,
      listToAdd.length > 0 || toFile === 0
        ? t('addList.addWordsTo', { count: listToAdd.length, deck })
        : t('addList.putInDeckNamed', { count: toFile, deck }),
      shared.getSettings().script,
    );
    addListButton.hidden = listToAdd.length === 0 && toFile === 0;
    addListButton.disabled = false;
  }

  addListButton.addEventListener('click', async () => {
    addListButton.disabled = true;
    // Worked out again here, in case the list of words changed since it was read.
    const { toAdd } = newWordRecords(listToAdd, shared.words(), Date.now());
    // Everything goes into the deck whose page is open, the words of the
    // list that were there already too.
    const deck = shared.openDeck();
    const alreadyThere = listedButNotInDeck();
    await putAll('words', [...toAdd, ...alreadyThere].map((word) => withDeck(word, deck.id)));
    const script = shared.getSettings().script;
    fillMixed(
      byId('list-done-text'),
      toAdd.length > 0
        ? `${t('addList.addedTo', { count: toAdd.length, deck: deck.name })} ${t('addList.waitInLearn')}`
        : t('addList.wentIntoDeck', { count: alreadyThere.length }),
      script,
    );
    const detail = byId('list-done-detail');
    detail.textContent = toAdd.length > 0 && alreadyThere.length > 0 ? t('addList.wentIntoDeck', { count: alreadyThere.length }) : '';
    detail.hidden = detail.textContent === '';
    listText.value = '';
    showStep('done');
    await shared.afterChange();
  });

  return {
    // Another deck's page opened: back to the beginning.
    forget: startAgain,

    // How the format help says a list is laid out, by the scripts and
    // readings asked for (`asks` from asksFor(), `both` while both scripts
    // are learned).
    applySettings(asks, both) {
      byId('list-hint').textContent = both
        ? t(asks.taiwan ? 'addList.hintBothTaiwan' : 'addList.hintBoth')
        : t(asks.taiwan ? 'addList.hintOneTaiwan' : 'addList.hintOne');
      fillMixed(byId('list-examples'), t('addList.examples'), shared.getSettings().script);
    },
  };
}
