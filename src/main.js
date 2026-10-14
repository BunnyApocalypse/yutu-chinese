// Entry point: sets up the page, the three tabs (Review, Free practice and
// Words), settings and backups.

import { getAll, putAll, getSetting, setSetting, removeWord, removeDecks, renameWord, replaceEverything } from './db.js';
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
import { missingReadyMadeDecks, wordsWithListsAsDecks, homeForEveryWord, flattenedReadyMadeDecks } from './decks.js';
import { setUpOffline, keepData } from './offline.js';
import { createWelcome } from './welcome.js';
import { createTips } from './tips.js';
import { buildBackup, checkBackup, describeBackup, restoreBackup } from './backup.js';
import { mergeBackups, describeMerge } from './merge.js';
import { ask, tell } from './confirm.js';
import { clampWithPopup } from './clamp.js';
import { watchForErrors, showVersion } from './errors.js';
import { parseReadingFixes, wordsToCorrect, correctedWord } from './readingFixes.js';
import { readDictionary, lookUp, DEFAULT_MEANING_DETAIL } from './dictionary.js';
// The corrections are a small file, so they come with the program ("?raw":
// Vite hands over the file's text). The dictionary is big and only fetched
// when a correction applies ("?url": Vite hands over its address).
import readingFixesText from '../data/wordlists/reading-fixes.tsv?raw';
import dictionaryUrl from '../data/cedict/dictionary.tsv?url';

const byId = (id) => document.getElementById(id);

const reviewTab = byId('review-tab');
const practiceTab = byId('practice-tab');
const wordsTab = byId('decks-tab');
// The Words tab: the same panel as the Decks tab, showing its list of words.
const browseTab = byId('words-tab');
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

// Errors that nothing else catches are said on the page, with details to
// copy. Set up first of all, so that a failure while starting is caught too.
watchForErrors({
  banner: byId('error-banner'),
  detailsButton: byId('error-details-button'),
  dialog: byId('error-dialog'),
  textElement: byId('error-text'),
  copyButton: byId('error-copy-button'),
  closeButton: byId('error-close-button'),
});
showVersion();

// "Credits and licenses", under "Help, feedback and licenses" in Settings.
byId('credits-button').addEventListener('click', () => byId('credits-dialog').showModal());
byId('credits-close').addEventListener('click', () => byId('credits-dialog').close());

// A long meaning in the prompt above a card is cut off after one line; a tap
// on it shows the whole of it in a panel.
clampWithPopup(byId('prompt-meaning'), (text) => tell('Meaning', text));

// ---- Modes ----

let mode = 'review';

// The words in the database, for Free practice to look up what was typed.
let wordList = [];

// Reads the words from the database, and offers them as suggestions under
// Free practice's text box.
async function loadWordList() {
  wordList = await getAll('words');
  showBackupStatus();
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
    // A tip the first time something is written (tips.js).
    document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'writing' }));
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
  practiceTab.classList.toggle('selected', mode === 'practice');
  wordsTab.classList.toggle('selected', mode === 'words');
  browseTab.classList.toggle('selected', mode === 'browse');
  byId('place-title').textContent = PLACE_TITLES[mode];
  reviewHeader.hidden = !reviewing;
  wordForm.hidden = mode !== 'practice';
  wordsPanelElement.hidden = mode !== 'words' && mode !== 'browse';
  noteElement.textContent = '';
  if (!review) {
    // A tab was tapped before the app finished starting. The tab is marked;
    // startUp() opens it once the database has been read.
    return undefined;
  }
  if (reviewing) {
    // A tip the first time (tips.js).
    document.dispatchEvent(new CustomEvent('screen-shown', { detail: mode }));
    return review.activate(mode);
  }
  // Stops any card being shown and brings the study area back for writing.
  review.deactivate();
  if (mode === 'words' || mode === 'browse') {
    // The Decks tab and the Words tab have the page to themselves.
    byId('study-area').hidden = true;
    return wordsPanel.show(mode === 'browse' ? 'words' : 'decks');
  }
  return startFreePractice();
}

// ---- The menu ----
//
// Review, Learn, Decks, Words and Settings are in a panel that slides in
// from the left, opened with the button at the top left (the owner,
// 2026-10-14: two rows of buttons stacked at the top were too much). It is a
// <dialog>, so the page under it is out of reach and Esc closes it. Choosing
// anything in it closes it.
const sideMenu = byId('side-menu');
byId('menu-button').addEventListener('click', () => sideMenu.showModal());
// A tap on the dimmed page beside the panel lands on the dialog itself.
sideMenu.addEventListener('click', (event) => {
  if (event.target === sideMenu || event.target.closest('button')) {
    sideMenu.close();
  }
});

// The name of each screen, in the top bar.
const PLACE_TITLES = { review: 'Review', learn: 'Learn', practice: 'Free practice', words: 'Decks', browse: 'Words' };

reviewTab.addEventListener('click', () => setMode('review'));
// Learn is opened from a deck (its row in Decks, or its page), and from
// Review when nothing is due and words are waiting (the owner, 2026-10-14:
// learning goes with a deck, so Learn left the menu).
byId('learn-next-button').addEventListener('click', () => {
  if (mode === 'review') {
    setMode('learn');
  }
});
practiceTab.addEventListener('click', () => setMode('practice'));
wordsTab.addEventListener('click', () => setMode('words'));
browseTab.addEventListener('click', () => setMode('browse'));

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
  if (mode === 'words' || mode === 'browse') {
    wordsPanel.show();
  } else if (mode === 'review' || mode === 'learn') {
    review.refresh();
  } else if (mode === 'practice') {
    startFreePractice();
  }
}

// ---- Backups ----

// Saves a backup as a file in the device's Downloads folder.
//
// backup: as buildBackup() gives it
// label:  added to the file's name, to tell one kind of backup from another
function downloadBackup(backup, label = '') {
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
  link.download = `hanzi-trainer-backup-${stamp}${label}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

exportButton.addEventListener('click', async () => {
  downloadBackup(await buildBackup());
  // When a backup was last made on this device, for the reminder below.
  await setSetting('lastBackupAt', Date.now());
  showBackupStatus();
});

// Everything the learner has is in this one browser. Settings says when a
// backup was last made, and the menu button gets a dot when it is time for
// another: there are words, and no backup was made in the last two weeks.
const BACKUP_DUE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
async function showBackupStatus() {
  const last = await getSetting('lastBackupAt', null);
  const days = last === null ? null : Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
  const due = wordList.length > 0 && (last === null || Date.now() - last > BACKUP_DUE_AFTER_MS);
  byId('backup-status').textContent =
    (last === null
      ? 'No backup has been made on this device yet.'
      : `Last backup: ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}.`) +
    (due
      ? ' Your words and progress are kept only in this browser, so export a backup now and then. ' +
        'The red dot on the menu button is this reminder; it goes away once you have exported one.'
      : '');
  // The dot says why it is there to anyone who rests the mouse on the menu
  // button or uses a screen reader, and in Settings the same dot is on the
  // heading of the group it is about, which is opened.
  const menuButton = byId('menu-button');
  menuButton.classList.toggle('reminder', due);
  menuButton.title = due ? 'Menu (time to make a backup, in Settings)' : 'Menu';
  menuButton.setAttribute('aria-label', menuButton.title);
  const settingsButton = byId('settings-button');
  settingsButton.classList.toggle('reminder', due);
  settingsButton.title = due ? 'Settings (time to make a backup)' : '';
  byId('settings-data').classList.toggle('reminder', due);
  byId('settings-data').open = due || byId('settings-data').open;
}

// The real file chooser is a hidden <input type="file">; the visible button opens it.
importButton.addEventListener('click', () => importFile.click());

// The backup that was chosen and what is on the device, while the panel that
// asks what to do with them is open.
const importDialog = byId('import-dialog');
let chosenBackup = null;
let onDevice = null;

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  // Clear the chooser so picking the same file again still counts as a change.
  importFile.value = '';
  if (!file) {
    return;
  }

  try {
    chosenBackup = JSON.parse(await file.text());
    checkBackup(chosenBackup);
  } catch (error) {
    // JSON.parse fails with a technical message; checkBackup with a readable one.
    const reason = error instanceof SyntaxError ? 'This file is not a Hanzi Trainer backup.' : error.message;
    await tell('That file could not be used', `${reason} Nothing was changed.`);
    return;
  }

  onDevice = await buildBackup();
  byId('import-backup-text').textContent = `In the backup: ${describeBackup(chosenBackup)}.`;
  byId('import-device-text').textContent = `On this device now: ${describeBackup(onDevice)}.`;
  // What combining would do, worked out now so it can be said before choosing.
  const changes = describeMerge(mergeBackups(onDevice, chosenBackup).summary);
  byId('import-combine-text').textContent =
    changes.length > 0
      ? `Combining would bring this device: ${changes.join(', ')}.`
      : 'Combining would change nothing: this device already has everything in the backup.';
  byId('import-combine-button').disabled = changes.length === 0;
  byId('import-note').textContent = '';
  importDialog.showModal();
});

byId('import-cancel-button').addEventListener('click', () => importDialog.close());

byId('import-combine-button').addEventListener('click', async () => {
  // What is on the device is saved as a file first: combining cannot be undone.
  downloadBackup(onDevice, '-before-combining');
  // Worked out again from the database as it is now, in case something was
  // studied in another tab since the panel opened.
  const { data } = mergeBackups(await buildBackup(), chosenBackup);
  await replaceEverything(data);
  // Start afresh from the combined data.
  window.location.reload();
});

byId('import-replace-button').addEventListener('click', async () => {
  const confirmed = await ask({
    question: 'Replace everything on this device with the backup?',
    detail: 'What is on this device now will be gone. This cannot be undone.',
    yes: 'Replace everything',
  });
  if (!confirmed) {
    return;
  }
  await restoreBackup(chosenBackup);
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
  // The levels of HSK and TOCFL stand on their own since 2026-10-14.
  const flattened = flattenedReadyMadeDecks(await getAll('decks'), await getAll('words'));
  if (flattened.changed.length > 0) {
    await putAll('decks', flattened.changed, { stamp: false });
  }
  if (flattened.removed.length > 0) {
    await removeDecks(flattened.removed);
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

// Words added from a ready-made list whose reading the list has since put
// right (see src/readingFixes.js) are given the reading meant. Looked at on
// every start, since an older backup may bring such words back; usually
// there is nothing to do, and the dictionary is not fetched.
async function applyReadingFixes() {
  const found = wordsToCorrect(parseReadingFixes(readingFixesText), await getAll('words'));
  if (found.length === 0) {
    return;
  }
  // The dictionary decides the new meaning. Without it (offline, before it
  // was saved for offline use) the readings are put right all the same.
  let dictionary = null;
  try {
    dictionary = readDictionary(await (await fetch(dictionaryUrl)).text());
  } catch {
    // the meanings stay as they are
  }
  const detail = await getSetting('meaningDetail', DEFAULT_MEANING_DETAIL);
  for (const { word, fix } of found) {
    const entries = dictionary ? lookUp(dictionary, word.traditional) : [];
    await renameWord(word.id, correctedWord(word, fix, entries, detail));
  }
}

async function startUp() {
  await keepOldDefaults();
  await removeOldBuiltInWords();
  await fileListWordsInDecks();
  await applyReadingFixes();
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
      leechInput: byId('leech-input'),
      leechActionSelect: byId('leech-action-select'),
      soundSelect: byId('sound-select'),
      volumeInput: byId('volume-input'),
      sentenceReadingCheckbox: byId('sentence-reading-checkbox'),
      sentenceWritingSelect: byId('sentence-writing-select'),
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
      aboutWordButton: byId('about-word-button'),
      leechNote: byId('leech-note'),
      leechSuspendButton: byId('leech-suspend-button'),
      listenButton: byId('listen-button'),
      noticeElement: byId('review-notice'),
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
    (word) => wordsPanel.showWord(word),
    (word) => wordsPanel.noteOf(word),
  );

  await review.load();

  await loadWordList();

  // The introduction, the first time the app is opened on a device. It adds
  // the level chosen to start with and ends in Learn; with none, it ends in
  // the Decks tab if there are no words yet.
  const welcome = createWelcome({
    settings,
    keepData,
    hasWords: () => wordList.length > 0,
    onFinish: async (start) => {
      if (start) {
        try {
          await wordsPanel.addReadyLevels(start.listId, [start.level]);
          await setMode('learn');
          return;
        } catch {
          // Without a connection the list cannot be fetched the first time.
          // The Decks tab's Ready-made section says so when it is opened.
        }
      }
      if (wordList.length === 0) {
        await setMode('words');
      }
    },
  });
  byId('welcome-again-button').addEventListener('click', () => {
    byId('settings-panel').close();
    welcome.open();
  });

  // The tips the first time each screen is opened, and their two controls
  // in Settings (Help).
  const tips = createTips();
  await tips.load();
  const tipsCheckbox = byId('tips-checkbox');
  tipsCheckbox.checked = tips.on;
  tipsCheckbox.addEventListener('change', () => tips.setOn(tipsCheckbox.checked));
  byId('tips-again-button').addEventListener('click', async () => {
    await tips.showAgain();
    tipsCheckbox.checked = true;
    byId('settings-panel').close();
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
    audioButton: byId('save-audio-button'),
  });
}

startUp();
