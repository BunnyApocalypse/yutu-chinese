// Entry point: sets up the page and runs the flow of a word, one character
// after another.

import { createQuiz } from './quiz.js';
import { loadCharData } from './charData.js';

const wordForm = document.getElementById('word-form');
const wordInput = document.getElementById('word-input');
const noteElement = document.getElementById('note');
const wordRow = document.getElementById('word-row');
const statusElement = document.getElementById('status');
const writingArea = document.getElementById('writing-area');
const nextButton = document.getElementById('next-button');
const restartButton = document.getElementById('restart-button');
const outlineButton = document.getElementById('outline-button');
const animateButton = document.getElementById('animate-button');

// The word being practiced, as a list of characters, and where we are in it.
let chars = [];
let position = 0;
// Mistakes made on each character of the word, filled in as each is finished.
let mistakesPerChar = [];
// True once the current character has been completed.
let charDone = false;

// After a character is finished, tapping the writing area moves on, like the
// Next button. Taps are ignored for this long first, so that a stray touch
// right after the last stroke doesn't skip the comparison.
const TAP_TO_CONTINUE_DELAY_MS = 600;
// The time (in milliseconds, as given by Date.now()) from which a tap counts.
let tapAllowedFrom = 0;

let outlineVisible = false;
let quiz = null;

// As big as fits on the screen, leaving room for everything above and below.
function chooseSize() {
  const fitsWidth = window.innerWidth - 32;
  const fitsHeight = window.innerHeight - 300;
  return Math.max(200, Math.min(fitsWidth, fitsHeight, 640));
}

// Draws the 米字格 guide lines (two diagonals, one vertical, one horizontal).
function drawGrid(svg, size) {
  const half = size / 2;
  const lines = [
    [0, 0, size, size],
    [size, 0, 0, size],
    [half, 0, half, size],
    [0, half, size, half],
  ];
  for (const [x1, y1, x2, y2] of lines) {
    // SVG elements must be created with this namespace or the browser ignores them.
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', '#e3ded2');
    line.setAttribute('stroke-dasharray', '6 6');
    svg.appendChild(line);
  }
}

function pluralMistakes(count) {
  return count === 1 ? '1 mistake' : `${count} mistakes`;
}

function doneMessage(prefix, mistakes) {
  return mistakes === 0 ? `${prefix}, no mistakes!` : `${prefix} with ${pluralMistakes(mistakes)}`;
}

// Shows the word's progress: finished characters are revealed, the current one
// is marked, and the ones still to come are placeholders.
function renderWordRow() {
  wordRow.replaceChildren();
  chars.forEach((char, index) => {
    const slot = document.createElement('span');
    const revealed = index < position || (index === position && charDone);
    slot.textContent = revealed ? char : '·';
    slot.className = index === position ? 'slot current' : 'slot';
    wordRow.appendChild(slot);
  });
}

const quizHandlers = {
  onStart({ totalStrokes }) {
    charDone = false;
    nextButton.hidden = true;
    renderWordRow();
    statusElement.textContent = `Stroke 1 of ${totalStrokes} · 0 mistakes`;
  },
  onProgress({ strokesDone, totalStrokes, totalMistakes }) {
    // While the last stroke's completion is being reported, onComplete takes over.
    const current = Math.min(strokesDone + 1, totalStrokes);
    statusElement.textContent =
      `Stroke ${current} of ${totalStrokes} · ${pluralMistakes(totalMistakes)}`;
  },
  onComplete({ totalMistakes }) {
    charDone = true;
    tapAllowedFrom = Date.now() + TAP_TO_CONTINUE_DELAY_MS;
    mistakesPerChar[position] = totalMistakes;
    renderWordRow();

    const isLastChar = position === chars.length - 1;
    if (isLastChar && chars.length > 1) {
      const wordMistakes = mistakesPerChar.reduce((sum, count) => sum + count, 0);
      statusElement.textContent = doneMessage('Word done', wordMistakes);
    } else {
      statusElement.textContent = doneMessage('Done', totalMistakes);
    }
    nextButton.textContent = isLastChar ? 'Again' : 'Next';
    nextButton.hidden = false;
  },
  onAnimateStart() {
    charDone = false;
    nextButton.hidden = true;
    statusElement.textContent = 'Watch the stroke order…';
  },
};

// Sets up the writing area at a size that fits the screen. Also used to
// rebuild it after the screen is rotated.
function buildWritingArea() {
  if (quiz) {
    quiz.destroy();
  }
  writingArea.replaceChildren();
  const size = chooseSize();
  writingArea.setAttribute('width', size);
  writingArea.setAttribute('height', size);
  drawGrid(writingArea, size);
  quiz = createQuiz(writingArea, size, quizHandlers);
  quiz.setOutlineVisible(outlineVisible);
}

function showCurrentCharacter() {
  return quiz.showCharacter(chars[position]);
}

// Begins practicing the typed text.
async function startWord(text) {
  // Array.from splits text into whole characters. (Plain text.split('') would
  // cut some rare characters in half.) Spaces are dropped.
  const typed = Array.from(text).filter((char) => char.trim() !== '');
  if (typed.length === 0) {
    return;
  }

  // Find out which characters have stroke data, loading it at the same time.
  const data = await Promise.all(typed.map(loadCharData));
  const usable = typed.filter((char, index) => data[index] !== null);
  const skipped = typed.filter((char, index) => data[index] === null);

  noteElement.textContent =
    skipped.length > 0 ? `No stroke data for ${skipped.join(' ')}, so skipped.` : '';
  if (usable.length === 0) {
    return; // keep whatever was being practiced
  }

  chars = usable;
  position = 0;
  mistakesPerChar = [];
  await showCurrentCharacter();
}

wordForm.addEventListener('submit', (event) => {
  // Without this the browser would reload the page, as forms do by default.
  event.preventDefault();
  startWord(wordInput.value);
  // Puts the on-screen keyboard away.
  wordInput.blur();
});

// Moves to the next character, or back to the start of the word after the last one.
function goToNext() {
  if (position < chars.length - 1) {
    position += 1;
  } else {
    position = 0;
    mistakesPerChar = [];
  }
  showCurrentCharacter();
}

nextButton.addEventListener('click', goToNext);

// "pointerup" fires when a finger, stylus or mouse button is lifted. A plain
// "click" listener would not work here: Hanzi Writer blocks the click that
// browsers normally produce from a touch on the writing area.
writingArea.addEventListener('pointerup', () => {
  if (charDone && Date.now() >= tapAllowedFrom) {
    goToNext();
  }
});

restartButton.addEventListener('click', () => quiz.restart());

outlineButton.addEventListener('click', () => {
  outlineVisible = !outlineVisible;
  quiz.setOutlineVisible(outlineVisible);
  outlineButton.textContent = outlineVisible ? 'Hide outline' : 'Show outline';
});

animateButton.addEventListener('click', () => quiz.animate());

// Rebuild the writing area when the screen is rotated. Only the width is
// watched: on Android the on-screen keyboard changes the height every time it
// opens, and that shouldn't wipe a character in progress.
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) {
    return;
  }
  lastWidth = window.innerWidth;
  buildWritingArea();
  if (chars.length > 0) {
    showCurrentCharacter();
  }
});

buildWritingArea();
startWord(wordInput.value);
