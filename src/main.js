// Entry point: sets up the page, the three tabs (Review, Free practice and
// Words), settings and backups.

import { getAll, putAll, getSetting, setSetting, removeWord } from './db.js';
import { allCardIds } from './session.js';
import { OLD_BUILT_IN_WORD_IDS } from './oldBuiltInWords.js';
import { createWordFlow } from './wordFlow.js';
import { createToneFlow } from './toneFlow.js';
import { createRecallCard } from './recallCard.js';
import { createReview } from './review.js';
import { createSettings } from './settings.js';
import { createWordsPanel } from './wordsPanel.js';
import { scriptFor, scriptFlagFor } from './words.js';
import { fileCardsByScript } from './scriptCards.js';
import { missingReadyMadeDecks, wordsWithListsAsDecks, homeForEveryWord } from './decks.js';
import { setUpOffline, keepData } from './offline.js';
import { createWelcome } from './welcome.js';
import { buildBackup, checkBackup, describeBackup, restoreBackup } from './backup.js';

const byId = (id) => document.getElementById(id);

const reviewTab = byId('review-tab');
const learnTab = byId('learn-tab');
const practiceTab = byId('practice-tab');
const wordsTab = byId('decks-tab');
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

// Until 2026-10-13 a new database was filled with a list of 109 words for
// trying the app out. A device that was given them (it has the
// `builtInListVersion` setting from then) loses them here, once: the words
// and their cards, studied or not. Reviews are never deleted. Words the owner
// added are not on the list and stay.
async function removeOldBuiltInWords() {
  const wasGivenThem = (await getSetting('builtInListVersion', null)) !== null;
  if (!wasGivenThem || (await getSetting('oldBuiltInWordsRemoved', false))) {
    return;
  }
  const old = new Set(OLD_BUILT_IN_WORD_IDS);
  for (const word of await getAll('words')) {
    if (old.has(word.id)) {
      await removeWord(word.id, allCardIds(word));
    }
  }
  await setSetting('oldBuiltInWordsRemoved', true);
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
      option.value = word[scriptFor(word, settings)];
      return option;
    }),
  );
}

// The Decks tab. After it changes anything, Review and Free practice read
// the words afresh. Its "Review this deck" and "Learn this deck" buttons
// choose the deck and open that tab.
const wordsPanel = createWordsPanel(
  async () => {
    await review.load();
    await loadWordList();
  },
  () => settings,
  async (deckId, newMode) => {
    await settings.change('studyDeck', deckId);
    await setMode(newMode);
  },
);

// Free practice: any kind of card for what is in the text box. Nothing is
// saved and the schedule is not touched.
function startFreePractice() {
  const text = wordInput.value.trim();
  const type = practiceType.value;
  // Puts the page back to the writing parts and stops any card being shown.
  review.deactivate();

  // Either script may be typed.
  const word = wordList.find((entry) => entry.traditional === text || entry.simplified === text);

  if (type === 'writing') {
    // Writing works for any characters, in the word list or not, and what
    // was typed is what gets written. If that is a word in its own script
    // (see scriptFor), it is written and pointed out as on its other cards
    // (review.js does that for those).
    const ownScript = word && text === word[scriptFor(word, settings)];
    const scriptFlag = byId('script-flag');
    scriptFlag.textContent = ownScript ? scriptFlagFor(word, settings) : '';
    scriptFlag.hidden = scriptFlag.textContent === '';
    return flow.start(text, {
      script: ownScript ? scriptFor(word, settings) : settings.script,
      rawInput: settings.rawInput,
      continueLabel: 'Again',
      onContinue: startFreePractice,
    });
  }

  // The other kinds need the word's reading and meaning, so it has to be in
  // the word list.
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
  // Review and Learn share the top of the page and the study area.
  const reviewing = mode === 'review' || mode === 'learn';
  reviewTab.classList.toggle('selected', mode === 'review');
  learnTab.classList.toggle('selected', mode === 'learn');
  practiceTab.classList.toggle('selected', mode === 'practice');
  wordsTab.classList.toggle('selected', mode === 'words');
  reviewHeader.hidden = !reviewing;
  wordForm.hidden = mode !== 'practice';
  wordsPanelElement.hidden = mode !== 'words';
  noteElement.textContent = '';
  if (!review) {
    // A tab was tapped before the app finished starting. The tab is marked;
    // startUp() opens it once the database has been read.
    return undefined;
  }
  if (reviewing) {
    return review.activate(mode);
  }
  // Stops any card being shown and brings the study area back for writing.
  review.deactivate();
  if (mode === 'words') {
    // The Decks tab has the page to itself.
    byId('study-area').hidden = true;
    return wordsPanel.show();
  }
  return startFreePractice();
}

reviewTab.addEventListener('click', () => setMode('review'));
learnTab.addEventListener('click', () => setMode('learn'));
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
  loadWordList(); // the suggestions are in the script being learned
  if (mode === 'words') {
    wordsPanel.show();
  } else if (mode === 'review' || mode === 'learn') {
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

// Until 2026-10-13 a device that had never touched the Script and
// Pronunciation settings was learning both scripts with cards in traditional,
// and both pronunciations with the mainland one first, without that being
// saved anywhere. Now that a new device starts with simplified and mainland
// only, a device from before has what it had written down here, so that it
// does not change. A device that has stored any setting at all is one from
// before.
async function keepOldDefaults() {
  if ((await getAll('settings')).length === 0) {
    return; // a new device
  }
  if ((await getSetting('pronunciation', null)) === null) {
    await setSetting('pronunciation', 'mainland');
  }
  if ((await getSetting('script', null)) === null) {
    await setSetting('script', 'traditional');
  }
  if ((await getSetting('bothScripts', null)) === null) {
    await setSetting('bothScripts', true);
  }
}

// Words added from a ready-made list before there were decks are put in the
// list's decks, and the decks are made. Looked at on every start, since an
// older backup may bring such words back; usually there is nothing to do.
// The words are saved without a new `changedAt`: nothing about them changed
// that the owner would see.
async function fileListWordsInDecks() {
  const converted = wordsWithListsAsDecks(await getAll('words'));
  if (converted.length > 0) {
    await putAll('words', converted, { stamp: false });
  }
  const missing = missingReadyMadeDecks(await getAll('words'), await getAll('decks'));
  if (missing.length > 0) {
    await putAll('decks', missing);
  }
  // Every word is in a deck, and there is always a deck: a new device gets
  // "Chinese 中文", and words from before there were decks are put in it.
  const home = homeForEveryWord(await getAll('words'), await getAll('decks'));
  if (home.decks.length > 0) {
    await putAll('decks', home.decks);
  }
  if (home.words.length > 0) {
    await putAll('words', home.words, { stamp: false });
  }
}

async function startUp() {
  await keepOldDefaults();
  await removeOldBuiltInWords();
  await fileListWordsInDecks();
  // Once per device (and again after an older backup is restored): cards
  // studied before writing cards were kept per script are filed under the
  // script they were learned in.
  if (!(await getSetting('cardsFiledByScript', false))) {
    await fileCardsByScript(await getAll('words'));
    await setSetting('cardsFiledByScript', true);
  }

  settings = await createSettings(
    {
      panel: byId('settings-panel'),
      openButton: byId('settings-button'),
      closeButton: byId('settings-close'),
      scriptSelect: byId('script-select'),
      pronunciationSelect: byId('pronunciation-select'),
      handwritingSelect: byId('handwriting-select'),
      lessonsCheckbox: byId('lessons-checkbox'),
      meaningDetailSelect: byId('meaning-detail-select'),
      newWordsInput: byId('new-words-input'),
      typeCheckboxes: [...document.querySelectorAll('#settings-panel [data-card-type]')],
    },
    onSettingsChange,
  );

  review = createReview(
    {
      deckSelect: byId('deck-select'),
      countsElement: byId('review-counts'),
      typeElement: byId('card-type'),
      meaningElement: byId('prompt-meaning'),
      pinyinElement: byId('prompt-pinyin'),
      pinyinButton: byId('pinyin-button'),
      gradeRow: byId('grade-row'),
      editWordButton: byId('edit-word-button'),
      donePanel: byId('done-panel'),
      doneMessage: byId('done-message'),
      studyArea: byId('study-area'),
      scriptFlag: byId('script-flag'),
      lessonNote: byId('lesson-note'),
      skipLessonButton: byId('skip-lesson-button'),
      lessonNextButton: byId('lesson-next-button'),
      learnNextButton: byId('learn-next-button'),
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
    (word) => wordsPanel.edit(word),
  );

  await review.load();

  await loadWordList();

  // The introduction, the first time the app is opened on a device. It ends
  // in the Decks tab if there are no words yet.
  const welcome = createWelcome({
    settings,
    keepData,
    hasWords: () => wordList.length > 0,
    onFinish: () => {
      if (wordList.length === 0) {
        setMode('words');
      }
    },
  });
  byId('welcome-again-button').addEventListener('click', () => {
    byId('settings-panel').close();
    welcome.open();
  });
  // Free practice starts with an example character in the script being learned.
  if (settings.script === 'simplified' && wordInput.value === '學') {
    wordInput.value = '学';
  }
  await welcome.openIfFirstTime();

  // Review, unless another tab was tapped in the meantime.
  await setMode(mode);

  // Last, and not waited for: saving the app for offline use in the background.
  setUpOffline({
    statusElement: byId('offline-status'),
    updateButton: byId('update-button'),
    keepButton: byId('keep-data-button'),
    installButton: byId('install-button'),
  });
}

startUp();
