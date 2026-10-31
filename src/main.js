// Entry point: sets up the page, the three tabs (Review, Free practice and
// Words), settings and backups.

import { getAll, putAll, getSetting, setSetting, removeWord, removeDecks, renameWord, replaceEverything, IMPORT_UNFINISHED } from './db.js';
import { allCardIds } from './session.js';
import { OLD_BUILT_IN_WORD_IDS } from './oldBuiltInWords.js';
import { createWordFlow } from './wordFlow.js';
import { createToneFlow } from './toneFlow.js';
import { createRecallCard } from './recallCard.js';
import { createReview } from './review.js';
import { createSettings } from './settings.js';
import { createWordsPanel } from './wordsPanel.js';
import { scriptFor, scriptFlagFor } from './words.js';
import { fillMixed } from './lang.js';
import { fileCardsByScript } from './scriptCards.js';
import { missingReadyMadeDecks, wordsWithListsAsDecks, homeForEveryWord, flattenedReadyMadeDecks, startingLevel } from './decks.js';
import { setUpOffline, keepData } from './offline.js';
import { createStorageMessage } from './storageMessage.js';
import { createWelcome } from './welcome.js';
import { createBasics } from './basics.js';
import { createTips } from './tips.js';
import { buildBackup, checkBackup, describeBackup, restoreBackup } from './backup.js';
import { mergeBackups, describeMerge } from './merge.js';
import { ask, tell } from './confirm.js';
import { clampWithPopup } from './clamp.js';
import { fitMeaning } from './meaningFit.js';
import { watchForErrors, showVersion } from './errors.js';
import { parseReadingFixes, wordsToCorrect, correctedWord } from './readingFixes.js';
import { readDictionary, lookUp, DEFAULT_MEANING_DETAIL } from './dictionary.js';
// The corrections are a small file, so they come with the program ("?raw":
// Vite hands over the file's text). The dictionary is big and only fetched
// when a correction applies ("?url": Vite hands over its address).
import readingFixesText from '../data/wordlists/reading-fixes.tsv?raw';
import dictionaryUrl from '../data/cedict/dictionary.tsv?url';
import { closeOnTapBeside } from './dialogs.js';
import { createFeedback } from './feedback.js';
import { createWhatsNew } from './whatsNew.js';
import { createStreakScreen } from './streakScreen.js';
import { createProgressPanel } from './progressPanel.js';
import { setUpTesterSettings } from './testerSettings.js';
import { applyText, t, formatList, formatNumber } from './text.js';

// The page's own text, in the learner's language (src/text.js), before
// anything else is set up.
applyText();

const byId = (id) => document.getElementById(id);

const reviewTab = byId('review-tab');
const practiceButton = byId('practice-button');
const decksTab = byId('decks-tab');
// The Words tab: the same panel as the Decks tab, showing its list of words.
const wordsTab = byId('words-tab');
const wordsPanelElement = byId('words-panel');
const progressTab = byId('progress-tab');
const progressPanelElement = byId('progress-panel');
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
  strokeCountElement: byId('stroke-count'),
  noteElement: byId('note'),
  nextButton: byId('next-button'),
  restartButton: byId('restart-button'),
  outlineButton: byId('outline-button'),
  animateButton: byId('animate-button'),
  skipButton: byId('skip-button'),
  backButton: byId('back-button'),
  verdictRow: byId('verdict-row'),
});

const toneFlow = createToneFlow({
  cardFace: byId('card-face'),
  wordRow: byId('word-row'),
  statusElement: byId('status'),
  toneButtons: [...document.querySelectorAll('#tone-buttons [data-tone]')],
  // "What are tones?" on the card: the basics at its screen on tones.
  onWhatAreTones: () => basics.open('tones'),
});

const recallCard = createRecallCard(byId('card-face'));

// Both are set up in startUp() below, once the saved settings have been read.
let settings = null;
let review = null;
// "Basics of Chinese" (basics.js), set up with the settings.
let basics = null;

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
// Every pop-up has a ✕ in its top corner (tester 2, 2026-10-17: a tap beside
// it closes it too, but people look for the ✕; the owner, 2026-10-18). Where
// it replaced a Close button it took that button's id, and so its listener;
// where a Cancel stays, the ✕ does what it does (data-same-as).
document.addEventListener('click', (event) => {
  const cross = event.target.closest?.('.dialog-close[data-same-as]');
  if (cross) {
    byId(cross.dataset.sameAs).click();
  }
});
closeOnTapBeside(byId('credits-dialog'));

// "Send feedback", in the menu and under Help in Settings, and "What's new",
// shown by itself at start-up after an update (startUp below) and under Help.
const feedback = createFeedback();
const whatsNew = createWhatsNew(feedback.open);
byId('feedback-button').addEventListener('click', feedback.open);
byId('settings-feedback-button').addEventListener('click', feedback.open);
byId('whats-new-button').addEventListener('click', whatsNew.openAll);

// A long meaning in the prompt above a card is cut off after one line; a tap
// on it shows the whole of it in a panel.
// The meaning above a card, fitted into its room (meaningFit.js); measured
// again when the room changes (the screen turned) or a font arrives.
const refitMeaning = clampWithPopup(byId('prompt-meaning'), (text) => tell(t('main.meaning'), text), { fit: fitMeaning });
document.fonts?.addEventListener('loadingdone', () => refitMeaning());

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
// the words afresh. Its "Review this deck" and "Learn new words" buttons
// choose the deck and open that tab.
const wordsPanel = createWordsPanel(
  async () => {
    await review.load();
    await loadWordList();
  },
  () => settings,
  async (deckId, newMode) => {
    await settings.change('studyDeck', deckId);
    studiedFrom = { mode, scrollY: window.scrollY };
    // setMode sets the top bar at once, before it waits for the cards; the
    // way back goes in at once too, not after them.
    const shown = setMode(newMode);
    // "Learn it now" can come from the Words tab too.
    if (studiedFrom.mode === 'decks' || studiedFrom.mode === 'words') {
      const backTo = t(studiedFrom.mode === 'words' ? 'menu.words' : 'menu.decks');
      byId('study-back-label').textContent = backTo;
      // Its name for a screen reader, also while a card is up, when the
      // arrow is alone in the corner.
      byId('study-back-button').setAttribute('aria-label', t('place.backTo', { place: backTo }));
      byId('place-title').hidden = true;
      byId('study-back-button').hidden = false;
    }
    await shown;
  },
  (word) => practiceWord(word),
  () => mode !== 'review' && mode !== 'learn' && mode !== 'lesson',
  (newMode, options) => setMode(newMode, options),
  () => mode,
  (word) => repeatLesson(word),
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
    fillMixed(scriptFlag, ownScript ? scriptFlagFor(word, settings) : '', ownScript ? scriptFor(word, settings) : settings.script);
    scriptFlag.hidden = scriptFlag.textContent === '';
    return flow.start(text, {
      script: ownScript ? scriptFor(word, settings) : settings.script,
      rawInput: settings.rawInput,
      hideMistakes: !settings.mistakeCount,
      continueLabel: t('practice.again'),
      onContinue: startFreePractice,
    });
  }

  // The other kinds need the word's reading and meaning, so it has to be in
  // the word list.
  if (!word) {
    noteElement.textContent = t('practice.notInList', { text });
    return undefined;
  }
  if (!review.practice(word, type)) {
    noteElement.textContent = t('practice.noToneCard', { text });
    return undefined;
  }
  noteElement.textContent = '';
  return undefined;
}

practiceType.addEventListener('change', startFreePractice);

// keepPlace: back to Decks or Words as they were left (practiceWord).
function setMode(newMode, { keepPlace = false } = {}) {
  mode = newMode;
  // Review, Learn and a lesson repeated share the top of the page and the
  // study area.
  const reviewing = mode === 'review' || mode === 'learn' || mode === 'lesson';
  // The menu's item for the place shown is marked: by color ("selected"),
  // and for screen readers by aria-current, which they read as "current
  // page".
  for (const [tab, itsMode] of [
    [reviewTab, 'review'],
    [byId('learn-tab'), 'learn'],
    [practiceButton, 'practice'],
    [decksTab, 'decks'],
    [wordsTab, 'words'],
    [progressTab, 'progress'],
  ]) {
    tab.classList.toggle('selected', mode === itsMode);
    if (mode === itsMode) {
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.removeAttribute('aria-current');
    }
  }
  byId('place-title').textContent = PLACE_TITLES[mode];
  // A deck's page puts "‹ Decks" in the name's place (decksPanel.js); any
  // other screen, or Decks coming back to its front page, has the name.
  byId('place-title').hidden = false;
  byId('deck-back-button').hidden = true;
  byId('practice-back-button').hidden = true;
  byId('practice-word-back').hidden = true;
  byId('study-back-button').hidden = true;
  // The text box and its button, which practicing one word puts away
  // (practiceWord); the line saying nothing counts, on every practice screen.
  wordInput.hidden = false;
  byId('practice-go').hidden = false;
  byId('practice-note').hidden = mode !== 'practice';
  reviewHeader.hidden = !reviewing;
  wordForm.hidden = mode !== 'practice';
  wordsPanelElement.hidden = mode !== 'decks' && mode !== 'words';
  progressPanelElement.hidden = mode !== 'progress';
  noteElement.textContent = '';
  if (!review) {
    // A tab was tapped before the app finished starting. The tab is marked;
    // startUp() opens it once the database has been read.
    return undefined;
  }
  if (reviewing) {
    // A tip the first time (tips.js).
    if (mode !== 'lesson') {
      document.dispatchEvent(new CustomEvent('screen-shown', { detail: mode }));
    }
    return review.activate(mode, { word: repeatedWord });
  }
  // Stops any card being shown and brings the study area back for writing.
  review.deactivate();
  if (mode === 'decks' || mode === 'words') {
    // The Decks tab and the Words tab have the page to themselves.
    byId('study-area').hidden = true;
    return wordsPanel.show(mode, { keepPlace });
  }
  if (mode === 'progress') {
    // So does the Progress tab.
    byId('study-area').hidden = true;
    return progressPanel.show();
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
//
// Learn is in it only when words are waiting, with how many, and opens on the
// deck chosen in Review (the owner, 2026-10-16: on a day with cards due,
// Learn was three taps away through Decks; learning still goes with a deck).
const sideMenu = byId('side-menu');
function openMenu() {
  const waiting = review ? review.waitingToLearn() : 0;
  byId('learn-tab').hidden = waiting === 0 && mode !== 'learn';
  byId('learn-waiting').textContent = waiting > 0 ? t('menu.waiting', { count: waiting }) : '';
  sideMenu.showModal();
}
// Opening the menu is a pause in studying: a streak screen still waiting
// comes first, and the menu once it is closed (the owner, 2026-10-19).
byId('menu-button').addEventListener('click', () => {
  if (!review?.showStreakIfWaiting(openMenu)) {
    openMenu();
  }
});
byId('learn-tab').addEventListener('click', () => setMode('learn'));
// A tap on the dimmed page beside the panel lands on the dialog itself.
sideMenu.addEventListener('click', (event) => {
  if (event.target === sideMenu || event.target.closest('button')) {
    sideMenu.close();
  }
});

// The name of each screen, in the top bar.
const PLACE_TITLES = {
  review: t('menu.review'),
  learn: t('menu.learn'),
  lesson: t('place.lesson'),
  practice: t('place.practice'),
  decks: t('menu.decks'),
  words: t('menu.words'),
  progress: t('menu.progress'),
};

reviewTab.addEventListener('click', () => setMode('review'));
// Learn is opened from a deck (its row in Decks, or its page), and from
// Review when nothing is due and words are waiting (the owner, 2026-10-14:
// learning goes with a deck, so Learn left the menu).
byId('learn-next-button').addEventListener('click', () => {
  if (mode === 'review') {
    setMode('learn');
  }
});
// At the end of today's words in Learn: on to Review, where their cards now are.
byId('review-now-button').addEventListener('click', () => setMode('review'));
// Review or Learn with no words (or none left to learn): words are added in Decks.
byId('add-words-button').addEventListener('click', () => setMode('decks'));
// With no words at all, Review and Learn offer a ready-made level to start
// with (offerAdding in review.js; roadmap item 2, the owner, 2026-10-19): it
// is added as the introduction adds one, and Learn opens on its first word.
byId('start-level-button').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const { listId, level } = startingLevel(settings);
  button.disabled = true;
  button.textContent = t('main.addingWords');
  try {
    await wordsPanel.addReadyLevels(listId, [level]);
    await setMode('learn');
  } catch {
    // Without a connection the list cannot be fetched the first time. The
    // Ready-made section says so.
    await setMode('decks');
    byId('ready-decks-button').click();
  } finally {
    button.disabled = false;
  }
});
// "Choose another level": the Decks tab's ready-made levels.
byId('other-level-button').addEventListener('click', async () => {
  await setMode('decks');
  byId('ready-decks-button').click();
});
// Free practice is opened from Settings' Writing group, "Try writing with
// these settings" (and from a word's page, which taps the same button). From
// Settings, "‹ Settings" in the top bar goes back there, as the owner
// expected (2026-10-17).
practiceButton.addEventListener('click', () => {
  const fromSettings = byId('settings-panel').open;
  byId('settings-panel').close();
  setMode('practice');
  if (fromSettings) {
    byId('place-title').hidden = true;
    byId('practice-back-button').hidden = false;
  }
});
// "Practice" on a word's page: that word alone, with no text box to type
// another, and "‹ Practicing a word" in the top bar, the arrow going back to
// where the page was opened, the page open again (the owner, 2026-10-17: the
// word alone as the way back read as a link to it, and back has to bring the
// deck or list back, not only the page). The kind of card can still be
// chosen. Not offered in Review or Learn (canPractice above). The title
// does not name the word, since writing it is the test (tester 2,
// 2026-10-17; the owner chose the plain wording on 2026-10-18).
let practicedWord = null;
// Where the word's page was opened: { mode, scrollY }.
let practicedFrom = null;
async function practiceWord(word) {
  const script = scriptFor(word, settings);
  wordInput.value = word[script];
  practicedWord = word;
  practicedFrom = { mode, scrollY: window.scrollY };
  await setMode('practice');
  wordInput.hidden = true;
  byId('practice-go').hidden = true;
  byId('place-title').textContent = t('place.practicingWord');
  const back = byId('practice-word-back');
  back.setAttribute('aria-label', t('place.backToWordPage'));
  back.title = t('place.backToItsPage');
  back.hidden = false;
}
byId('practice-word-back').addEventListener('click', async () => {
  if (!practicedWord) {
    return;
  }
  await setMode(practicedFrom.mode, { keepPlace: true });
  window.scrollTo(0, practicedFrom.scrollY);
  wordsPanel.showWord(practicedWord);
});
// A deck studied from Decks (its row, or Learn and Review on its page; or
// "Learn it now" from Decks or Words): "‹ Decks" (or "‹ Words") in the top
// bar in place of the screen's name, back there as it was left, a deck's
// page open if it was (tester 2, 2026-10-17: there was no
// way back; the owner, 2026-10-18). Any other way to another screen puts it
// away (setMode).
let studiedFrom = null;
byId('study-back-button').addEventListener('click', async () => {
  if (mode === 'lesson') {
    backFromLesson();
    return;
  }
  await setMode(studiedFrom.mode, { keepPlace: true });
  window.scrollTo(0, studiedFrom.scrollY);
});

// "Repeat lesson" on the page of a word already learned (tester 2's R6; the
// owner, 2026-10-18): its lesson again, as practice, nothing saved
// (review.js). The way back is the one of a deck studied from Decks, "‹ Back"
// in the top bar (the arrow alone while a card is up), as from a deck's page
// opened from a word's page; it goes back to where the page was opened, the
// page open again, as from "Practice". "Back to the word" at the end does
// the same.
let repeatedWord = null;
// Where the word's page was opened: { mode, scrollY }.
let repeatedFrom = null;
async function repeatLesson(word) {
  repeatedWord = word;
  repeatedFrom = { mode, scrollY: window.scrollY };
  const shown = setMode('lesson');
  byId('study-back-label').textContent = t('place.back');
  byId('study-back-button').setAttribute('aria-label', t('place.backToWordPage'));
  byId('place-title').hidden = true;
  byId('study-back-button').hidden = false;
  await shown;
}
async function backFromLesson() {
  await setMode(repeatedFrom.mode, { keepPlace: true });
  window.scrollTo(0, repeatedFrom.scrollY);
  wordsPanel.showWord(repeatedWord);
}
byId('lesson-back-button').addEventListener('click', () => {
  if (mode === 'lesson') {
    backFromLesson();
  }
});
byId('practice-back-button').addEventListener('click', () => {
  byId('settings-button').click();
  document.querySelector('#settings-nav [data-group="settings-writing"]').click();
});
decksTab.addEventListener('click', () => setMode('decks'));
wordsTab.addEventListener('click', () => setMode('words'));
progressTab.addEventListener('click', () => setMode('progress'));

// The Progress tab (progressPanel.js). Review knows which cards a word can
// have (kinds switched off, suspended cards), so it is asked.
const progressPanel = createProgressPanel({
  panel: progressPanelElement,
  getSettings: () => settings,
  hasCardType: (word, type) => review.hasCardType(word, type),
});

wordForm.addEventListener('submit', (event) => {
  // Without this the browser would reload the page, as forms do by default.
  event.preventDefault();
  startFreePractice();
  // Puts the on-screen keyboard away.
  wordInput.blur();
});

// ---- Settings ----

// Called whenever a setting changes: show the current card or word afresh.
// The font the writing area was last sized for: OpenDyslexic has more room
// around the area (roomAboveBelow in wordFlow.js). The area is first built
// before the settings are read, for the device's own font.
let fontSizedFor = 'system';
function sizeForFont() {
  if (settings.font !== fontSizedFor) {
    fontSizedFor = settings.font;
    flow.rebuild();
    refitMeaning();
  }
}

function onSettingsChange() {
  sizeForFont();
  loadWordList(); // the suggestions are in the script being learned
  if (mode === 'decks' || mode === 'words') {
    wordsPanel.show();
  } else if (mode === 'review' || mode === 'learn' || mode === 'lesson') {
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
//
// Returns the file's name.
function downloadBackup(backup, label = '') {
  // A Blob is a file held in memory. Pointing a link at it and "clicking" the
  // link is how a web page saves a file to the device's Downloads folder.
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  // Named with the local date and time, e.g. yutu-chinese-backup-2026-10-12-1704.json
  const now = new Date();
  const twoDigits = (number) => String(number).padStart(2, '0');
  const stamp =
    `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}` +
    `-${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}`;
  link.download = `yutu-chinese-backup-${stamp}${label}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  return link.download;
}

exportButton.addEventListener('click', async () => {
  const saved = byId('export-done');
  // Said at once, and the button put away until done (the owner,
  // 2026-10-26: on the tablet a tap seemed to do nothing for seconds, with
  // 186,000 reviews to read and write out). The work holds up the page, so
  // the browser is given a moment to show this first (two frames: one to
  // lay it out, one to paint it).
  exportButton.disabled = true;
  saved.textContent = t('backup.making');
  saved.hidden = false;
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  let name;
  try {
    name = downloadBackup(await buildBackup());
  } finally {
    exportButton.disabled = false;
  }
  // Where the file went and what it is for: a backup left on the same
  // device is lost with it (roadmap item 7, data safety seen by a stranger).
  saved.textContent = t('backup.saved', { name });
  // When a backup was last made on this device, for the reminder below.
  await setSetting('lastBackupAt', Date.now());
  showBackupStatus();
  // For the message about keeping the words (storageMessage.js).
  document.dispatchEvent(new CustomEvent('backup-made', { detail: saved.textContent }));
});

// Everything the learner has is in this one browser. Settings says when a
// backup was last made, and the menu button gets a dot when it is time for
// another: there are words, and no backup was made in the last two weeks.
// The reminder can be switched off, at the learner's own risk (a tester
// had it there all the time and nothing to do about it, 2026-10-14):
// `backupReminderOff`, a setting of the device.
// With no backup yet, the first reminder waits a while after the first card
// was studied: a red dot in a new learner's first minutes looked like an
// error (UX review, 2026-10-16). How long depends on whether the browser has
// promised to keep the data (offline.js, "Keeping your data"): if it has, a
// week; if not, a day, since Safari clears a site that was not opened for
// 7 days, and a pause that long early on must not find no backup made.
const BACKUP_DUE_AFTER_MS = 14 * 24 * 60 * 60 * 1000;
const FIRST_BACKUP_AFTER_MS = { kept: 7 * 24 * 60 * 60 * 1000, notKept: 24 * 60 * 60 * 1000 };
async function showBackupStatus() {
  const last = await getSetting('lastBackupAt', null);
  const off = await getSetting('backupReminderOff', false);
  const days = last === null ? null : Math.floor((Date.now() - last) / (24 * 60 * 60 * 1000));
  let due = false;
  if (!off && wordList.length > 0) {
    if (last !== null) {
      due = Date.now() - last > BACKUP_DUE_AFTER_MS;
    } else {
      const started = (await getAll('cards'))
        .map((card) => card.firstReviewedAt)
        .filter((time) => time != null);
      const kept = Boolean(navigator.storage && navigator.storage.persisted && (await navigator.storage.persisted()));
      const wait = kept ? FIRST_BACKUP_AFTER_MS.kept : FIRST_BACKUP_AFTER_MS.notKept;
      due = started.length > 0 && Date.now() - Math.min(...started) > wait;
    }
  }
  byId('backup-reminder-button').textContent = t(off ? 'backup.remindAgain' : 'settings.stopBackupReminders');
  byId('backup-reminder-button').hidden = !off && !due;
  byId('backup-status').textContent = [
    last === null
      ? t('backup.noneYet')
      : days === 0
        ? t('backup.lastToday')
        : days === 1
          ? t('backup.lastYesterday')
          : t('backup.lastDaysAgo', { count: days }),
    due ? t('backup.due') : '',
    off ? t('backup.remindersOff') : '',
  ]
    .filter(Boolean)
    .join(' ');
  // The dot says why it is there to anyone who rests the mouse on the menu
  // button or uses a screen reader, and in Settings the same dot is on the
  // group it is about, in the list of groups.
  const menuButton = byId('menu-button');
  menuButton.classList.toggle('reminder', due);
  menuButton.title = t(due ? 'menu.menuBackupDue' : 'menu.menu');
  menuButton.setAttribute('aria-label', menuButton.title);
  const settingsButton = byId('settings-button');
  settingsButton.classList.toggle('reminder', due);
  settingsButton.title = due ? t('menu.settingsBackupDue') : '';
  // On a phone there is no resting the mouse on a button, so the menu says
  // in words what the dot is about, under Settings.
  byId('backup-due-line').hidden = !due;
  document.querySelector('#settings-nav [data-group="settings-data"]').classList.toggle('reminder', due);
}

byId('backup-reminder-button').addEventListener('click', async () => {
  const off = await getSetting('backupReminderOff', false);
  if (!off) {
    const sure = await ask({
      question: t('backup.stopQuestion'),
      detail: t('backup.stopDetail'),
      yes: t('backup.stopYes'),
    });
    if (!sure) {
      return;
    }
  }
  await setSetting('backupReminderOff', !off);
  showBackupStatus();
});

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
    const reason = error instanceof SyntaxError ? t('backup.notABackup') : error.message;
    await tell(t('backup.couldNotUse'), t('backup.nothingChanged', { reason }));
    return;
  }

  onDevice = await buildBackup();
  byId('import-backup-text').textContent = t('backup.inBackup', { contents: describeBackup(chosenBackup) });
  byId('import-device-text').textContent = t('backup.onDevice', { contents: describeBackup(onDevice) });
  // What combining would do, worked out now so it can be said before choosing.
  const changes = describeMerge(mergeBackups(onDevice, chosenBackup).summary);
  byId('import-combine-text').textContent =
    changes.length > 0
      ? t('backup.combineWouldBring', { changes: formatList(changes) })
      : t('backup.combineNothing');
  byId('import-combine-button').disabled = changes.length === 0;
  byId('import-note').textContent = '';
  importDialog.showModal();
});

byId('import-cancel-button').addEventListener('click', () => importDialog.close());

// While the backup is being saved, the panel stays open with its buttons off,
// and says how far it has got: a big backup takes a while on a slow device.
let importSaving = false;
const IMPORT_BUTTONS = ['import-combine-button', 'import-replace-button', 'import-cancel-button'];
function startSaving() {
  importSaving = true;
  for (const id of IMPORT_BUTTONS) {
    byId(id).disabled = true;
  }
  byId('import-note').textContent = t('import.preparing');
}
function showSaving(saved, total) {
  byId('import-note').textContent = t('import.saving', { saved: formatNumber(saved), total: formatNumber(total) });
}
// Esc would close the panel; the "cancel" event lets the app say no to that.
importDialog.addEventListener('cancel', (event) => {
  if (importSaving) {
    event.preventDefault();
  }
});

byId('import-combine-button').addEventListener('click', async () => {
  startSaving();
  // What is on the device is saved as a file first: combining cannot be undone.
  downloadBackup(onDevice, '-before-combining');
  // Worked out again from the database as it is now, in case something was
  // studied in another tab since the panel opened.
  const { data } = mergeBackups(await buildBackup(), chosenBackup);
  await replaceEverything(data, showSaving);
  // Start afresh from the combined data.
  window.location.reload();
});

byId('import-replace-button').addEventListener('click', async () => {
  const confirmed = await ask({
    question: t('backup.replaceQuestion'),
    detail: t('backup.replaceDetail'),
    yes: t('backup.replaceYes'),
  });
  if (!confirmed) {
    return;
  }
  startSaving();
  await restoreBackup(chosenBackup, showSaving);
  // Start afresh from the restored data.
  window.location.reload();
});

// ---- The top bar while scrolling ----

// The top bar stays at the top of the window (style.css, .top-bar); once the
// page is scrolled, a line under it shows where the list goes under it.
// "passive" tells the browser this never stops the scrolling, so it can
// scroll without waiting for it.
const topBar = document.querySelector('.top-bar');
window.addEventListener('scroll', () => {
  topBar.classList.toggle('scrolled', window.scrollY > 0);
}, { passive: true });

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
  refitMeaning();
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
  // An import that was cut off halfway (replaceEverything in db.js) left only
  // part of the backup. Said every time the app starts, until an import
  // finishes.
  if (await getSetting(IMPORT_UNFINISHED, false)) {
    await tell(t('import.unfinishedQuestion'), t('import.unfinishedDetail'));
  }
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
      readingStyleSelect: byId('reading-style-select'),
      handwritingSelect: byId('handwriting-select'),
      themeRadios: [...document.querySelectorAll('input[name="settings-theme"]')],
      lessonsCheckbox: byId('lessons-checkbox'),
      strokeCountCheckbox: byId('stroke-count-checkbox'),
      mistakeCountCheckbox: byId('mistake-count-checkbox'),
      fontSelect: byId('font-select'),
      languageSelect: byId('language-select'),
      reviewStartCheckbox: byId('review-start-checkbox'),
      hintSelect: byId('hint-select'),
      gradeButtonsSelect: byId('grade-buttons-select'),
      retentionSelect: byId('retention-select'),
      meaningDetailSelect: byId('meaning-detail-select'),
      newWordsInput: byId('new-words-input'),
      leechInput: byId('leech-input'),
      leechActionSelect: byId('leech-action-select'),
      streaksCheckbox: byId('streaks-checkbox'),
      streakCardsInput: byId('streak-cards-input'),
      streakWordsInput: byId('streak-words-input'),
      streakGoal: byId('streak-goal'),
      soundSelect: byId('sound-select'),
      volumeInput: byId('volume-input'),
      sentenceReadingCheckbox: byId('sentence-reading-checkbox'),
      sentenceWritingSelect: byId('sentence-writing-select'),
      typeCheckboxes: [...document.querySelectorAll('#settings-panel [data-card-type]')],
    },
    onSettingsChange,
  );
  sizeForFont();

  review = createReview(
    {
      deckButton: byId('deck-choice-button'),
      deckTag: byId('deck-tag'),
      deckDialog: byId('deck-choice-dialog'),
      deckList: byId('deck-choice-list'),
      countsElement: byId('review-counts'),
      typeElement: byId('card-type'),
      meaningElement: byId('prompt-meaning'),
      pinyinElement: byId('prompt-pinyin'),
      pinyinButton: byId('pinyin-button'),
      gradeRow: byId('grade-row'),
      verdictRow: byId('verdict-row'),
      practiceAgainButton: byId('practice-again-button'),
      editWordButton: byId('edit-word-button'),
      aboutWordButton: byId('about-word-button'),
      leechTag: byId('leech-tag'),
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
      reviewNowButton: byId('review-now-button'),
      learnStrip: byId('learn-strip'),
      learnedPill: byId('learned-pill'),
      addWordsButton: byId('add-words-button'),
      startLevelButton: byId('start-level-button'),
      otherLevelButton: byId('other-level-button'),
      lessonBackButton: byId('lesson-back-button'),
      countsRow: document.querySelector('.counts-row'),
      wordRow: byId('word-row'),
      statusRow: byId('status-row'),
      strokeCountElement: byId('stroke-count'),
      writingRow: byId('writing-row'),
      writingButtons: byId('writing-buttons'),
      cardFace: byId('card-face'),
      toneButtonRow: byId('tone-buttons'),
  skipButton: byId('skip-button'),
  backButton: byId('back-button'),
    },
    { writing: flow, tone: toneFlow, recall: recallCard },
    settings,
    (word) => wordsPanel.edit(word),
    (word, thisCard) => wordsPanel.showWord(word, thisCard),
    (word) => wordsPanel.noteOf(word),
    (element, text, script) => wordsPanel.tappableText(element, text, script),
    createStreakScreen(() => settings.change('streaks', false)),
  );

  await review.load();

  await loadWordList();

  // The introduction, the first time the app is opened on a device. It adds
  // the level chosen to start with and ends in Learn; with none, it ends in
  // the Decks tab if there are no words yet.
  // At the end of Review and in Learn while the words may be lost (storageMessage.js).
  createStorageMessage(keepData);

  const welcome = createWelcome({
    settings,
    keepData,
    hasWords: () => wordList.length > 0,
    onFinish: async (start) => {
      // A deck from Anki: the Decks tab, with the import open on top
      // (ankiImportForm.js; the owner, 2026-10-19).
      if (start?.anki) {
        await setMode('decks');
        byId('anki-import-button').click();
        return;
      }
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
        await setMode('decks');
      }
    },
  });
  byId('welcome-again-button').addEventListener('click', () => {
    byId('settings-panel').close();
    welcome.open();
  });

  // "Basics of Chinese" (basics.js): from the menu and Settings › Help, and
  // on top of the introduction's first screen. (A tone card opens it at its
  // screen on tones: onWhatAreTones above.)
  basics = createBasics(settings);
  byId('basics-button').addEventListener('click', () => basics.open());
  byId('settings-basics-button').addEventListener('click', () => basics.open());
  byId('welcome-basics-button').addEventListener('click', () => basics.open());

  // The tips the first time each screen is opened, and their two controls
  // in Settings (Help).
  // Settings › For testing, in the test copy only (testerSettings.js).
  await setUpTesterSettings();

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
  const firstUse = !(await getSetting('welcomeDone', false));
  await welcome.openIfFirstTime();
  // What changed since the app was last opened here. Before the screen is
  // shown, so that its tip waits for this to be closed (tips.js).
  whatsNew.openIfNew(firstUse);

  // Review, unless another tab was tapped in the meantime.
  await setMode(mode);

  // Last, and not waited for: saving the app for offline use in the background.
  setUpOffline({
    statusElement: byId('offline-status'),
    keepElement: byId('keep-data-status'),
    updateButton: byId('update-button'),
    keepButton: byId('keep-data-button'),
    installButton: byId('install-button'),
    audioButton: byId('save-audio-button'),
  });
}

// Once the first screen is ready, "Loading…" goes and the page is shown
// (main.starting in index.html). Also if starting fails partway: errors.js
// says what went wrong, and the page is shown as far as it got.
startUp().finally(() => document.querySelector('main').classList.remove('starting'));
