// Writing a word: one character after another in the writing area, with the
// row of slots, the status line and the Restart / Outline / Animate / Next
// buttons. Used by both Review and Free practice; each tells the flow what to
// do when the word is finished.
//
// In Review each character also gets a verdict, passed or missed. The flow
// proposes one as soon as the character is finished, colors its slot green or
// red, and shows two buttons to overrule it.

import { createQuiz } from './quiz.js';
import { loadCharData } from './charData.js';

// After a character is finished, tapping the writing area moves on, like the
// Next button. Taps are ignored for this long first, so that a stray touch
// right after the last stroke doesn't skip the comparison.
const TAP_TO_CONTINUE_DELAY_MS = 600;

// As big as fits on the screen, leaving room for everything above and below.
function chooseSize() {
  const fitsWidth = window.innerWidth - 32;
  const fitsHeight = window.innerHeight - 460;
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

function describeMistakes(count) {
  if (count === 0) return 'No mistakes';
  return count === 1 ? '1 mistake' : `${count} mistakes`;
}

function sum(numbers) {
  return numbers.reduce((total, number) => total + number, 0);
}

// elements: the page elements the flow controls:
//   writingArea, wordRow, statusElement, noteElement,
//   nextButton, restartButton, outlineButton, animateButton,
//   verdictRow, missedButton, gotItButton
//
// Returns { start, rebuild }.
export function createWordFlow(elements) {
  const {
    writingArea,
    wordRow,
    statusElement,
    noteElement,
    nextButton,
    restartButton,
    outlineButton,
    animateButton,
    verdictRow,
    missedButton,
    gotItButton,
  } = elements;

  // The word being written, as a list of characters, and where we are in it.
  let chars = [];
  let position = 0;
  // True once the current character has been completed.
  let charDone = false;

  // One entry per character, filled in as each is reached and finished:
  let strokesPerChar = []; // how many strokes it has
  let mistakesPerChar = []; // wrong strokes, over all attempts
  let hintPerChar = []; // a correct stroke was flashed as a hint
  let peekedPerChar = []; // the outline or animation was used, or it was
  //                         started over after the answer had been seen
  let suggestedPerChar = []; // the verdict the app proposed (true = passed)
  let passedPerChar = []; // the verdict that stands (true = passed)

  // Mistakes on the current character so far in this attempt, and mistakes
  // from earlier attempts at it (before Restart or Animate was pressed).
  // Starting over doesn't wipe the slate.
  let currentMistakes = 0;
  let carriedMistakes = 0;

  // The time (in milliseconds, as given by Date.now()) from which a tap on the
  // writing area counts.
  let tapAllowedFrom = 0;

  let outlineVisible = false;
  let quiz = null;

  // What the current mode wants; see start().
  let options = {};

  // Shows the word's progress: finished characters are revealed (green or red
  // if they have a verdict), the current one is marked, and the ones still to
  // come are placeholders.
  function renderWordRow() {
    wordRow.replaceChildren();
    chars.forEach((char, index) => {
      const slot = document.createElement('span');
      const finished = index < position || (index === position && charDone);
      slot.textContent = finished ? char : '·';
      slot.className = 'slot';
      if (index === position) {
        slot.classList.add('current');
      }
      if (finished && passedPerChar[index] !== undefined) {
        slot.classList.add(passedPerChar[index] ? 'passed' : 'missed');
      }
      wordRow.appendChild(slot);
    });
  }

  // Shows the two verdict buttons with the current verdict selected.
  function renderVerdict() {
    const passed = passedPerChar[position];
    gotItButton.classList.toggle('selected', passed === true);
    missedButton.classList.toggle('selected', passed === false);
    verdictRow.hidden = false;
  }

  function showProgress(strokeNumber, totalStrokes) {
    const mistakes = carriedMistakes + currentMistakes;
    statusElement.textContent =
      `Stroke ${strokeNumber} of ${totalStrokes} · ${describeMistakes(mistakes).toLowerCase()}`;
  }

  // Everything known about the word so far, for the mode's callbacks.
  function wordResult() {
    return {
      mistakes: sum(mistakesPerChar),
      mistakesPerChar: [...mistakesPerChar],
      passedPerChar: [...passedPerChar],
      suggestedPerChar: [...suggestedPerChar],
    };
  }

  function isLastChar() {
    return position === chars.length - 1;
  }

  const quizHandlers = {
    onStart({ totalStrokes }) {
      charDone = false;
      currentMistakes = 0;
      strokesPerChar[position] = totalStrokes;
      if (outlineVisible) {
        peekedPerChar[position] = true;
      }
      nextButton.hidden = true;
      verdictRow.hidden = true;
      renderWordRow();
      showProgress(1, totalStrokes);
      options.onCharStart?.();
    },
    onProgress({ strokesDone, totalStrokes, totalMistakes }) {
      currentMistakes = totalMistakes;
      // While the last stroke's completion is being reported, onComplete takes over.
      showProgress(Math.min(strokesDone + 1, totalStrokes), totalStrokes);
    },
    onComplete({ totalMistakes, hintShown }) {
      charDone = true;
      tapAllowedFrom = Date.now() + TAP_TO_CONTINUE_DELAY_MS;
      mistakesPerChar[position] = carriedMistakes + totalMistakes;
      hintPerChar[position] = hintPerChar[position] || hintShown;

      if (options.judgeChar) {
        suggestedPerChar[position] = options.judgeChar({
          mistakes: mistakesPerChar[position],
          strokes: strokesPerChar[position],
          hintShown: Boolean(hintPerChar[position]),
          peeked: Boolean(peekedPerChar[position]),
        });
        passedPerChar[position] = suggestedPerChar[position];
        renderVerdict();
      }
      renderWordRow();
      statusElement.textContent = describeMistakes(mistakesPerChar[position]);

      // Returned to the quiz, which colors the printed character to match.
      // In Free practice there is no verdict and this is undefined.
      const passed = passedPerChar[position];

      if (!isLastChar()) {
        nextButton.textContent = 'Next';
        nextButton.hidden = false;
        return passed;
      }
      if (chars.length > 1) {
        statusElement.textContent = `Word done · ${describeMistakes(sum(mistakesPerChar)).toLowerCase()}`;
      }
      if (options.continueLabel) {
        nextButton.textContent = options.continueLabel;
        nextButton.hidden = false;
      }
      options.onWordDone?.(wordResult());
      return passed;
    },
    onAnimateStart() {
      nextButton.hidden = true;
      verdictRow.hidden = true;
      statusElement.textContent = 'Watch the stroke order…';
    },
  };

  function setOutlineVisible(visible) {
    outlineVisible = visible;
    quiz.setOutlineVisible(visible);
    outlineButton.textContent = visible ? 'Hide outline' : 'Show outline';
    if (visible && chars.length > 0) {
      peekedPerChar[position] = true;
    }
  }

  // Sets up the writing area at a size that fits the screen.
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
    carriedMistakes = 0;
    return quiz.showCharacter(chars[position], options.script);
  }

  // Called before the current character is started over: keeps the mistakes
  // made so far, and notes if the answer had already been seen.
  function beforeRedo() {
    if (charDone) {
      carriedMistakes = mistakesPerChar[position];
      peekedPerChar[position] = true;
    } else {
      carriedMistakes += currentMistakes;
    }
    charDone = false;
  }

  // The Next button, or a tap on the writing area once a character is done.
  function goOn() {
    if (!isLastChar()) {
      position += 1;
      showCurrentCharacter();
    } else {
      options.onContinue?.();
    }
  }

  // One of the two verdict buttons: overrules the verdict for the character
  // just written.
  function setVerdict(passed) {
    passedPerChar[position] = passed;
    renderVerdict();
    renderWordRow();
    quiz.showVerdict(passed);
    if (isLastChar()) {
      options.onVerdictChange?.(wordResult());
    }
  }

  nextButton.addEventListener('click', goOn);
  gotItButton.addEventListener('click', () => setVerdict(true));
  missedButton.addEventListener('click', () => setVerdict(false));

  // "pointerup" fires when a finger, stylus or mouse button is lifted. A plain
  // "click" listener would not work here: Hanzi Writer blocks the click that
  // browsers normally produce from a touch on the writing area.
  writingArea.addEventListener('pointerup', () => {
    if (charDone && Date.now() >= tapAllowedFrom) {
      goOn();
    }
  });

  restartButton.addEventListener('click', () => {
    beforeRedo();
    quiz.restart();
  });

  outlineButton.addEventListener('click', () => setOutlineVisible(!outlineVisible));

  animateButton.addEventListener('click', () => {
    beforeRedo();
    peekedPerChar[position] = true;
    quiz.animate();
  });

  buildWritingArea();

  return {
    // Begins writing `text`. Returns false if none of its characters have
    // stroke data, in which case nothing changes.
    //
    // newOptions:
    //   script:        'traditional' or 'simplified'; decides which printed
    //                  form of each character is used
    //   continueLabel: text for the Next button once the word is finished, or
    //                  null to leave it hidden
    //   hideOutline:   true to switch the outline off first
    //   judgeChar({ mistakes, strokes, hintShown, peeked }):
    //                  returns true if the character counts as passed. Leave
    //                  it out for no verdicts at all (Free practice).
    //   onCharStart(): a character starts (or starts over)
    //   onWordDone(result): the last character was finished. `result` has
    //                  mistakes, mistakesPerChar, passedPerChar, suggestedPerChar
    //   onVerdictChange(result): the last character's verdict was overruled
    //   onContinue():  Next was pressed, or the writing area tapped, after the
    //                  word was finished
    async start(text, newOptions) {
      // Array.from splits text into whole characters. (Plain text.split('')
      // would cut some rare characters in half.) Spaces are dropped.
      const typed = Array.from(text).filter((char) => char.trim() !== '');

      // Find out which characters have stroke data, loading it at the same time.
      const data = await Promise.all(typed.map((char) => loadCharData(char, newOptions.script)));
      const usable = typed.filter((char, index) => data[index] !== null);
      const skipped = typed.filter((char, index) => data[index] === null);

      noteElement.textContent =
        skipped.length > 0 ? `No stroke data for ${skipped.join(' ')}, so skipped.` : '';
      if (usable.length === 0) {
        return false;
      }

      options = newOptions;
      // Tells the browser which regional font to use for the characters in
      // the slot row. Without it, a phone may show Japanese or mainland shapes.
      wordRow.lang = options.script === 'traditional' ? 'zh-Hant-TW' : 'zh-Hans-CN';
      chars = usable;
      position = 0;
      strokesPerChar = [];
      mistakesPerChar = [];
      hintPerChar = [];
      peekedPerChar = [];
      suggestedPerChar = [];
      passedPerChar = [];
      if (options.hideOutline) {
        setOutlineVisible(false);
      }
      await showCurrentCharacter();
      return true;
    },

    // Rebuilds the writing area at a size that fits the screen now, and starts
    // the current character over. Used after the screen is rotated.
    rebuild() {
      buildWritingArea();
      if (chars.length > 0) {
        showCurrentCharacter();
      }
    },
  };
}
