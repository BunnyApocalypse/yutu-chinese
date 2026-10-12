// Entry point: sets up the page, the three tabs (Review, Free practice and
// Words), settings and backups.

import seedText from './seed-words.tsv?raw'; // "?raw" makes Vite hand us the file's text
import { getAll, putAll, getSetting, setSetting } from './db.js';
import { parseWordList, wordId } from './wordList.js';
import { createWordFlow } from './wordFlow.js';
import { createToneFlow } from './toneFlow.js';
import { createRecallCard } from './recallCard.js';
import { createReview } from './review.js';
import { createSettings } from './settings.js';
import { createWordsPanel } from './wordsPanel.js';
import { buildBackup, checkBackup, describeBackup, restoreBackup } from './backup.js';

const byId = (id) => document.getElementById(id);

const reviewTab = byId('review-tab');
const practiceTab = byId('practice-tab');
const wordsTab = byId('words-tab');
const wordsPanelElement = byId('words-panel');
const reviewHeader = byId('review-header');
const wordForm = byId('word-form');
const wordInput = byId('word-input');
const practiceType = byId('practice-type');
const noteElement = byId('note');
const exportButton = byId('export-button');
const importButton = byId('import-button');
const importFile = byId('import-file');

const flow = createWordFlow({
  writingArea: byId('writing-area'),
  wordRow: byId('word-row'),
  statusElement: byId('status'),
  noteElement: byId('note'),
  nextButton: byId('next-button'),
  restartButton: byId('restart-button'),
  outlineButton: byId('outline-button'),
  animateButton: byId('animate-button'),
  verdictRow: byId('verdict-row'),
  missedButton: byId('missed-button'),
  gotItButton: byId('got-it-button'),
  orderNote: byId('order-note'),
  skipButton: byId('skip-button'),
  backButton: byId('back-button'),
});

const toneFlow = createToneFlow({
  cardFace: byId('card-face'),
  wordRow: byId('word-row'),
  statusElement: byId('status'),
  toneButtons: [...document.querySelectorAll('#tone-buttons [data-tone]')],
  nextButton: byId('tone-next-button'),
});

const recallCard = createRecallCard(byId('card-face'));

// Both are set up in startUp() below, once the saved settings have been read.
let settings = null;
let review = null;

// Raise this number whenever seed-words.tsv changes, so that devices which
// already have the built-in words pick up the changes.
const BUILT_IN_LIST_VERSION = 2;

// The first time the app runs, fills the database with the built-in word
// list. Later, when the list has changed, brings the stored copies of those
// words up to date without touching their cards or anything else. A built-in
// word that has been removed stays removed.
async function addOrUpdateBuiltInWords() {
  const existing = await getAll('words');
  const builtIn = parseWordList(seedText);
  // No version saved means the list has never been loaded on this device.
  // (An empty word list alone doesn't: every word may have been removed.)
  const neverLoaded = (await getSetting('builtInListVersion', null)) === null;

  if (existing.length === 0 && neverLoaded) {
    const now = Date.now();
    const words = builtIn.map((word, index) => ({
      id: wordId(word),
      ...word,
      // `order` is the position in the list; new words are introduced in this order.
      order: index,
      addedAt: now,
    }));
    await putAll('words', words);
  } else if ((await getSetting('builtInListVersion', 1)) < BUILT_IN_LIST_VERSION) {
    const stored = new Map(existing.map((word) => [word.id, word]));
    const updated = builtIn
      .filter((word) => stored.has(wordId(word)))
      // Keep the stored record's own fields (id, order, addedAt) and take the
      // list's current wording and readings.
      .map((word) => ({ ...stored.get(wordId(word)), ...word }));
    await putAll('words', updated);
  }
  await setSetting('builtInListVersion', BUILT_IN_LIST_VERSION);
}

// ---- Modes ----

let mode = 'review';

// The words in the database, for Free practice to look up what was typed.
let wordList = [];

// Reads the words from the database, and offers them as suggestions under
// Free practice's text box.
async function loadWordList() {
  wordList = await getAll('words');
  byId('word-suggestions').replaceChildren(
    ...wordList.map((word) => {
      const option = document.createElement('option');
      option.value = word.traditional;
      return option;
    }),
  );
}

// The Words tab. After it changes the list, Review and Free practice read
// the words afresh.
const wordsPanel = createWordsPanel(async () => {
  await review.load();
  await loadWordList();
});

// Free practice: any kind of card for what is in the text box. Nothing is
// saved and the schedule is not touched.
function startFreePractice() {
  const text = wordInput.value.trim();
  const type = practiceType.value;
  // Puts the page back to the writing parts and stops any card being shown.
  review.deactivate();

  if (type === 'writing') {
    // Writing works for any characters, in the word list or not.
    return flow.start(text, {
      script: settings.script,
      rawInput: settings.rawInput,
      continueLabel: 'Again',
      onContinue: startFreePractice,
    });
  }

  // The other kinds need the word's reading and meaning, so it has to be in
  // the word list. Either script may be typed.
  const word = wordList.find((entry) => entry.traditional === text || entry.simplified === text);
  if (!word) {
    noteElement.textContent = `"${text}" is not in the word list, so only Writing can be practiced with it.`;
    return undefined;
  }
  if (!review.practice(word, type)) {
    noteElement.textContent = `"${text}" can't have a tone card: its pinyin doesn't have one syllable per character.`;
    return undefined;
  }
  noteElement.textContent = '';
  return undefined;
}

practiceType.addEventListener('change', startFreePractice);

function setMode(newMode) {
  mode = newMode;
  const reviewing = mode === 'review';
  reviewTab.classList.toggle('selected', reviewing);
  practiceTab.classList.toggle('selected', mode === 'practice');
  wordsTab.classList.toggle('selected', mode === 'words');
  reviewHeader.hidden = !reviewing;
  wordForm.hidden = mode !== 'practice';
  wordsPanelElement.hidden = mode !== 'words';
  noteElement.textContent = '';
  if (reviewing) {
    return review.activate();
  }
  // Stops any card being shown and brings the study area back for writing.
  review.deactivate();
  if (mode === 'words') {
    // The Words tab has the page to itself.
    byId('study-area').hidden = true;
    return wordsPanel.show();
  }
  return startFreePractice();
}

reviewTab.addEventListener('click', () => setMode('review'));
practiceTab.addEventListener('click', () => setMode('practice'));
wordsTab.addEventListener('click', () => setMode('words'));

wordForm.addEventListener('submit', (event) => {
  // Without this the browser would reload the page, as forms do by default.
  event.preventDefault();
  startFreePractice();
  // Puts the on-screen keyboard away.
  wordInput.blur();
});

// ---- Settings ----

// Called whenever a setting changes: show the current card or word afresh.
function onSettingsChange() {
  if (mode === 'review') {
    review.refresh();
  } else if (mode === 'practice') {
    startFreePractice();
  }
}

// ---- Backups ----

exportButton.addEventListener('click', async () => {
  const backup = await buildBackup();
  // A Blob is a file held in memory. Pointing a link at it and "clicking" the
  // link is how a web page saves a file to the device's Downloads folder.
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  // Named with the local date and time, e.g. hanzi-trainer-backup-2026-10-12-1704.json
  const now = new Date();
  const twoDigits = (number) => String(number).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}` +
    `-${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}`;
  link.download = `hanzi-trainer-backup-${stamp}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

// The real file chooser is a hidden <input type="file">; the visible button opens it.
importButton.addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  // Clear the chooser so picking the same file again still counts as a change.
  importFile.value = '';
  if (!file) {
    return;
  }

  let backup;
  try {
    backup = JSON.parse(await file.text());
    checkBackup(backup);
  } catch (error) {
    // JSON.parse fails with a technical message; checkBackup with a readable one.
    const reason = error instanceof SyntaxError ? 'This file is not a Hanzi Trainer backup.' : error.message;
    window.alert(`Nothing was changed.\n\n${reason}`);
    return;
  }

  const onDevice = await buildBackup();
  const confirmed = window.confirm(
    'Replace everything on this device with the backup?\n\n' +
      `In the backup: ${describeBackup(backup)}\n\n` +
      `On this device now: ${describeBackup(onDevice)}\n\n` +
      'This cannot be undone.',
  );
  if (!confirmed) {
    return;
  }
  await restoreBackup(backup);
  // Start afresh from the restored data.
  window.location.reload();
});

// ---- Screen rotation ----

// Rebuild the writing area when the screen is rotated. Only the width is
// watched: on Android the on-screen keyboard changes the height every time it
// opens, and that shouldn't wipe a character in progress.
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) {
    return;
  }
  lastWidth = window.innerWidth;
  flow.rebuild();
});

// ---- Startup ----

async function startUp() {
  await addOrUpdateBuiltInWords();

  settings = await createSettings(
    {
      panel: byId('settings-panel'),
      openButton: byId('settings-button'),
      closeButton: byId('settings-close'),
      scriptSelect: byId('script-select'),
      pronunciationSelect: byId('pronunciation-select'),
      handwritingSelect: byId('handwriting-select'),
      newWordsInput: byId('new-words-input'),
      typeCheckboxes: [...document.querySelectorAll('#settings-panel [data-card-type]')],
    },
    onSettingsChange,
  );

  review = createReview(
    {
      countsElement: byId('review-counts'),
      typeElement: byId('card-type'),
      meaningElement: byId('prompt-meaning'),
      pinyinElement: byId('prompt-pinyin'),
      pinyinButton: byId('pinyin-button'),
      gradeRow: byId('grade-row'),
      donePanel: byId('done-panel'),
      doneMessage: byId('done-message'),
      studyArea: byId('study-area'),
      wordRow: byId('word-row'),
      statusRow: byId('status-row'),
      verdictRow: byId('verdict-row'),
      writingRow: byId('writing-row'),
      writingButtons: byId('writing-buttons'),
      cardFace: byId('card-face'),
      toneButtonRow: byId('tone-buttons'),
      orderNote: byId('order-note'),
  skipButton: byId('skip-button'),
  backButton: byId('back-button'),
    },
    { writing: flow, tone: toneFlow, recall: recallCard },
    settings,
  );

  await review.load();

  await loadWordList();

  await setMode('review');
}

startUp();
