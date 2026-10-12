// Entry point: sets up the writing area and connects the buttons to the quiz.

import { createQuiz } from './quiz.js';

// Milestone 1: one hardcoded character.
const CHARACTER = '學';

const statusElement = document.getElementById('status');
const writingArea = document.getElementById('writing-area');
const restartButton = document.getElementById('restart-button');
const outlineButton = document.getElementById('outline-button');
const animateButton = document.getElementById('animate-button');

// As big as fits on the screen, leaving room for the status line and buttons.
// Worked out once when the page loads; reload after rotating the phone.
function chooseSize() {
  const fitsWidth = window.innerWidth - 32;
  const fitsHeight = window.innerHeight - 200;
  return Math.max(200, Math.min(fitsWidth, fitsHeight, 480));
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

const size = chooseSize();
writingArea.setAttribute('width', size);
writingArea.setAttribute('height', size);
drawGrid(writingArea, size);

const quiz = createQuiz(writingArea, CHARACTER, size, {
  onStart({ totalStrokes }) {
    statusElement.textContent = `Stroke 1 of ${totalStrokes} · 0 mistakes`;
  },
  onProgress({ strokesDone, totalStrokes, totalMistakes }) {
    // While the last stroke's completion is being reported, onComplete takes over.
    const current = Math.min(strokesDone + 1, totalStrokes);
    statusElement.textContent =
      `Stroke ${current} of ${totalStrokes} · ${pluralMistakes(totalMistakes)}`;
  },
  onComplete({ totalMistakes }) {
    statusElement.textContent =
      totalMistakes === 0
        ? 'Done, no mistakes!'
        : `Done with ${pluralMistakes(totalMistakes)}`;
  },
  onAnimateStart() {
    statusElement.textContent = 'Watch the stroke order…';
  },
});

let outlineVisible = false;

restartButton.addEventListener('click', () => quiz.restart());

outlineButton.addEventListener('click', () => {
  outlineVisible = !outlineVisible;
  quiz.setOutlineVisible(outlineVisible);
  outlineButton.textContent = outlineVisible ? 'Hide outline' : 'Show outline';
});

animateButton.addEventListener('click', () => quiz.animate());
