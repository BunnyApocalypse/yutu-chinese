// The practice square on the page about the app: the app's own writing code
// (src/quiz.js), so a visitor tries the real thing, wrong strokes refused
// included. It writes 兔, the rabbit of the name. The app's stroke data is
// read from /app/char-data/ (vite.site.config.js says so), the same files the
// app uses.

import { createQuiz } from '../src/quiz.js';

const CHARACTER = '兔';
const SCRIPT = 'traditional';
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const square = document.getElementById('square');
const status = document.getElementById('status');
const watchButton = document.getElementById('watch');
const startOverButton = document.getElementById('start-over');
const failed = document.getElementById('square-failed');

let quiz = null;
let size = 0;
// At rest the character is shown as an outline, after being written once.
// The first touch of the square puts the outline away, and then you write it
// from memory, as in the app.
let outlineOn = true;
let firstBuild = true;

// The 米字格 guide lines under the writing, as in the app (wordFlow.js).
function drawGrid(svg, side) {
  const half = side / 2;
  const lines = [
    [0, 0, side, side],
    [side, 0, 0, side],
    [half, 0, half, side],
    [0, half, side, half],
  ];
  for (const [x1, y1, x2, y2] of lines) {
    const line = document.createElementNS(SVG_NAMESPACE, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.style.stroke = 'var(--grid)';
    line.setAttribute('stroke-dasharray', '6 6');
    svg.appendChild(line);
  }
}

const handlers = {
  onStart({ totalStrokes }) {
    status.textContent = outlineOn ? 'Start writing when you are ready' : `Write it: ${totalStrokes} strokes`;
  },
  onProgress({ strokesDone, totalStrokes }) {
    status.textContent = `Stroke ${strokesDone} of ${totalStrokes}`;
  },
  onComplete({ totalMistakes }) {
    status.textContent = totalMistakes === 0 ? 'Written, with no mistakes' : `Written, with ${totalMistakes} ${totalMistakes === 1 ? 'mistake' : 'mistakes'}`;
    return totalMistakes <= 2;
  },
  onAnimateStart() {
    status.textContent = 'Watch the strokes';
  },
  onWipe() {
    startOver();
  },
};

// Builds the writing area at the square's present width and starts it.
function build() {
  quiz?.destroy();
  square.replaceChildren();
  failed.hidden = true;
  size = Math.round(square.clientWidth);
  const svg = document.createElementNS(SVG_NAMESPACE, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('aria-label', 'Practice square: write the character 兔');
  svg.classList.add('writing');
  square.appendChild(svg);
  drawGrid(svg, size);
  try {
    quiz = createQuiz(svg, size, handlers);
    quiz.setOutlineVisible(outlineOn);
  } catch (error) {
    giveUp(error);
    return;
  }
  begin();
}

// The square could not start: the page says so, and the browser's console says why.
function giveUp(error) {
  console.error('The practice square could not start:', error);
  status.textContent = '';
  failed.hidden = false;
}

// Shows the character, and the first time writes it out once; the outline
// stays on when that is done.
async function begin() {
  let shown;
  try {
    shown = await quiz.showCharacter(CHARACTER, SCRIPT, true);
  } catch (error) {
    giveUp(error);
    return;
  }
  if (shown === false) {
    giveUp(new Error(`No stroke data for ${CHARACTER}: the files under app/char-data/ could not be read.`));
    return;
  }
  if (firstBuild) {
    firstBuild = false;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      quiz.animate();
    }
  }
}

// The first touch puts the outline away: from here on you write from memory.
square.addEventListener(
  'pointerdown',
  () => {
    if (outlineOn) {
      outlineOn = false;
      quiz?.setOutlineVisible(false);
    }
  },
  true,
);

watchButton.addEventListener('click', () => {
  outlineOn = true;
  quiz.setOutlineVisible(true);
  quiz.animate();
});

function startOver() {
  outlineOn = false;
  quiz.setOutlineVisible(false);
  begin();
}
startOverButton.addEventListener('click', startOver);

// A new size, such as a phone turned on its side, builds the square again.
let lastWidth = 0;
new ResizeObserver(() => {
  const width = Math.round(square.clientWidth);
  if (width > 0 && width !== lastWidth) {
    lastWidth = width;
    build();
  }
}).observe(square);

// ---- The sample of a word's page ----
// The markup is the app's own (scripts/make-word-page-sample.js). The "AI"
// boxes work as they do there. Anything else on it only makes sense inside
// the app, and says so when tapped, with a way in, instead of doing nothing.

const SAMPLE_ANSWERS = [
  ['.icon-button', 'In the app, this plays a recording by a native speaker.'],
  ['.note-word, .sentence-word', 'In the app, tap a word for its reading, its meaning and a recording.'],
  ['.part, .character-big', 'In the app, tapping a character or a part opens its own page, with its parts and tips.'],
  ['.deck-select, .page-add-sentence .small', 'In the app, this turns the sentence into cards: to read it, or to write the missing word.'],
  ['.chip-button', 'In the app, this opens the deck.'],
];
const SAMPLE_FALLBACK = 'This works in the app.';

function setUpSample(sample) {
  const bubble = document.createElement('div');
  bubble.className = 'sample-bubble';
  bubble.setAttribute('role', 'status');
  bubble.hidden = true;
  bubble.innerHTML = '<p></p><a href="app/">Open the app</a>';
  sample.append(bubble);
  const words = bubble.querySelector('p');

  function hide() {
    bubble.hidden = true;
  }

  // Under what was tapped, or above it where there is no room below.
  function show(control, text) {
    words.textContent = text;
    bubble.hidden = false;
    const around = sample.getBoundingClientRect();
    const box = control.getBoundingClientRect();
    const left = Math.max(0, Math.min(box.left - around.left, around.width - bubble.offsetWidth));
    const below = box.bottom - around.top + 8;
    const top = below + bubble.offsetHeight > around.height ? box.top - around.top - bubble.offsetHeight - 8 : below;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${Math.max(0, top)}px`;
  }

  sample.addEventListener('click', (event) => {
    const control = event.target.closest('button');
    if (bubble.contains(event.target)) return;
    // A tap on the card away from any button puts the bubble away too.
    if (!control) {
      hide();
      return;
    }
    if (control.classList.contains('note-badge')) {
      // As in the app: the box opens and closes its line of explanation.
      const text = document.getElementById(control.getAttribute('aria-controls'));
      text.hidden = !text.hidden;
      control.setAttribute('aria-expanded', String(!text.hidden));
      hide();
      return;
    }
    const answer = SAMPLE_ANSWERS.find(([selector]) => control.matches(selector));
    show(control, answer ? answer[1] : SAMPLE_FALLBACK);
  });
  // A tap elsewhere, or Escape, puts it away.
  document.addEventListener('click', (event) => {
    if (!sample.contains(event.target)) hide();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });
}

const sample = document.querySelector('.app-sample');
if (sample) setUpSample(sample);
