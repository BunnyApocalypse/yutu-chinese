// Entry point: sets up the page, the two modes (Review and Free practice),
// the script setting and backups.

import seedText from './seed-words.tsv?raw'; // "?raw" makes Vite hand us the file's text
import { getAll, putAll, getSetting, setSetting } from './db.js';
import { parseWordList, wordId } from './wordList.js';
import { createWordFlow } from './wordFlow.js';
import { createReview } from './review.js';
import { buildBackup, checkBackup, describeBackup, restoreBackup } from './backup.js';

const byId = (id) => document.getElementById(id);

const reviewTab = byId('review-tab');
const practiceTab = byId('practice-tab');
const reviewHeader = byId('review-header');
const wordForm = byId('word-form');
const wordInput = byId('word-input');
const scriptSelect = byId('script-select');
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
});

const review = createReview(
  {
    countsElement: byId('review-counts'),
    meaningElement: byId('prompt-meaning'),
    pinyinElement: byId('prompt-pinyin'),
    pinyinButton: byId('pinyin-button'),
    gradeRow: byId('grade-row'),
    donePanel: byId('done-panel'),
    doneMessage: byId('done-message'),
    studyArea: byId('study-area'),
  },
  flow,
  () => scriptSelect.value,
);

// The first time the app runs, fill the database with the built-in word list.
async function addBuiltInWordsIfEmpty() {
  const existing = await getAll('words');
  if (existing.length > 0) {
    return;
  }
  const now = Date.now();
  const words = parseWordList(seedText).map((word, index) => ({
    id: wordId(word),
    ...word,
    // `order` is the position in the list; new words are introduced in this order.
    order: index,
    addedAt: now,
  }));
  await putAll('words', words);
}

// ---- Modes ----

let mode = 'review';

// Free practice: write whatever is in the text box. Nothing is saved.
function startFreePractice() {
  const text = wordInput.value;
  return flow.start(text, {
    script: scriptSelect.value,
    continueLabel: 'Again',
    onContinue: startFreePractice,
  });
}

function setMode(newMode) {
  mode = newMode;
  const reviewing = mode === 'review';
  reviewTab.classList.toggle('selected', reviewing);
  practiceTab.classList.toggle('selected', !reviewing);
  reviewHeader.hidden = !reviewing;
  wordForm.hidden = reviewing;
  if (reviewing) {
    return review.activate();
  }
  review.deactivate();
  return startFreePractice();
}

reviewTab.addEventListener('click', () => setMode('review'));
practiceTab.addEventListener('click', () => setMode('practice'));

wordForm.addEventListener('submit', (event) => {
  // Without this the browser would reload the page, as forms do by default.
  event.preventDefault();
  startFreePractice();
  // Puts the on-screen keyboard away.
  wordInput.blur();
});

// ---- Script setting ----

scriptSelect.addEventListener('change', async () => {
  await setSetting('script', scriptSelect.value);
  if (mode === 'review') {
    review.refresh();
  } else {
    startFreePractice();
  }
});

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
  await addBuiltInWordsIfEmpty();
  scriptSelect.value = await getSetting('script', 'traditional');
  await review.load();
  await setMode('review');
}

startUp();
