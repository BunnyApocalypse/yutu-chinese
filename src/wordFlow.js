// Writing a word: one character after another in the writing area, with the
// row of slots, the status line and the Clear / Outline / Animate / Next
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
// (200 since 2026-10-13, down from 600: the owner found the wait in the way
// when moving on quickly. It is still enough for the tap that finished the
// step not to count as the tap that moves on.)
const TAP_TO_CONTINUE_DELAY_MS = 200;

// As big as fits on the screen, leaving room for everything above and below.
function chooseSize() {
  // 32 for the page's margins. The arrows go over the area's edges when the
  // width is what limits it (see arrowsBeside).
  const fitsWidth = window.innerWidth - 32;
  // The writing area has one size, and everything else has fixed room
  // above and below it, so that the area never moves or changes size from
  // one card or one step of a lesson to the next (the owner's rule,
  // 2026-10-13). 380 is that room, measured with the tabs put away (see
  // "Focus" in review.js):
  //   above: the kind of card, the meaning (one line), the pinyin, a
  //          lesson's note, and the row of slots (words of several
  //          characters) with the status line beside them: 213. Each keeps
  //          its room when empty. (Until 2026-10-14 the slots and the status
  //          line had a row each, and the number was 420.)
  //   below: the three buttons and the four grade buttons, with the
  //          margins: about 167 (155 left the page 9px too tall).
  // The area is the point of the app: if a row is added, find its room in
  // the rows there are, do not raise this number.
  const fitsHeight = window.innerHeight - 380;
  const oneColumn = Math.max(200, Math.min(fitsWidth, fitsHeight, 640));
  // Held sideways (a tablet or phone in landscape, a computer), the area can
  // be much bigger in a column of its own, beside everything else (the
  // owner, 2026-10-17: "we wont be able to stop people from going into
  // landscape"). Only where that gains clearly, and never on an upright
  // screen.
  const twoColumns = Math.min(window.innerHeight - WIDE_ROOM_ABOVE_BELOW, window.innerWidth - 32 - WIDE_SIDE_COLUMN, WIDE_MAX);
  wide = window.innerWidth > window.innerHeight && twoColumns >= oneColumn + 60;
  return wide ? twoColumns : oneColumn;
}

// The layout in two columns (style.css, data-layout="wide"): the room above
// and below the area (main's padding and a little), the width of the column
// beside it with its gap, and the area's largest size there.
const WIDE_ROOM_ABOVE_BELOW = 40;
const WIDE_SIDE_COLUMN = 360 + 24;
const WIDE_MAX = 760;
// Whether chooseSize chose two columns.
let wide = false;

// Whether the arrows fit beside an area of `size`, in the margins left over:
// on a tablet or a computer, where the area is as big as it gets or limited
// by the height (the owner, 2026-10-17). Otherwise they go over its edges.
// --arrow-room in style.css is the room they need beside it.
function arrowsBeside(size) {
  const arrowRoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--arrow-room')) || 0;
  // In two columns the other column is beside the area: over its edges.
  return !wide && window.innerWidth - 32 - size >= arrowRoom;
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
    // A style rather than a plain value, so that the lines follow the light
    // or dark look by itself (theme.js).
    line.style.stroke = 'var(--grid)';
    line.setAttribute('stroke-dasharray', '6 6');
    svg.appendChild(line);
  }
}

function describeMistakes(count) {
  if (count === 0) return 'No mistakes';
  return count === 1 ? '1 mistake' : `${count} mistakes`;
}

// "2nd", "3rd", "4th"… for "on the 2nd try".
function ordinal(number) {
  const tens = number % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : { 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] || 'th';
  return `${number}${suffix}`;
}

function sum(numbers) {
  return numbers.reduce((total, number) => total + number, 0);
}

// elements: the page elements the flow controls:
//   writingArea, wordRow, statusElement, strokeCountElement, noteElement,
//   nextButton, restartButton, outlineButton, animateButton,
//   orderNote,
//   skipButton, backButton
//
// Returns { start, rebuild }.
export function createWordFlow(elements) {
  const {
    writingArea,
    wordRow,
    statusElement,
    strokeCountElement,
    noteElement,
    nextButton,
    restartButton,
    outlineButton,
    animateButton,
    orderNote,
    skipButton,
    backButton,
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
  let orderPerChar = []; // 'moe' or 'mainland' where a character has two
  //                        accepted stroke orders, otherwise null
  let skippedPerChar = []; // true where the character was skipped, not written
  let finishedPerChar = []; // true once the character has been written or skipped
  let retriesPerChar = []; // where starting again wipes the slate: how many
  //                          times it was started again after a mistake or a
  //                          hint, so that "✓ 2nd try" can say it was not
  //                          right at first (tester 2, 2026-10-17)

  // Mistakes on the current character so far in this attempt, and mistakes
  // from earlier attempts at it (before Clear or Animate was pressed).
  // Starting over doesn't wipe the slate.
  let currentMistakes = 0;
  let carriedMistakes = 0;

  // The time (in milliseconds, as given by Date.now()) from which a tap on the
  // writing area counts.
  let tapAllowedFrom = 0;

  let outlineVisible = false;

  // Practicing the character on screen again after the word was finished
  // (options.practiceWhenDone, Review; the owner, 2026-10-17: "I need to
  // practice this one a few times to make sure that it stays in my head").
  // Nothing written while practicing changes what is known about the word:
  // its mistakes, hints, verdicts and suggested grade stay as they were, and
  // a tap on the writing area does not move on.
  let practicing = false;
  let quiz = null;

  // What the current mode wants; see start().
  let options = {};

  // Shows the word's progress: finished characters are revealed (green or red
  // if they have a verdict), the current one is marked, and the ones still to
  // come are placeholders.
  //
  // A finished character with a verdict is a button: tapping it overrules the
  // verdict the app proposed (passed becomes missed and the other way round).
  // A word of one character has no row of slots; its grade is its verdict
  // (see grade() in review.js). Until 2026-10-14 two buttons beside the status
  // line, Missed and Got it, did this for the character just written.
  function renderWordRow() {
    wordRow.replaceChildren();
    wordRow.classList.toggle('single', chars.length === 1);
    chars.forEach((char, index) => {
      const finished = Boolean(finishedPerChar[index]);
      const hasVerdict = finished && passedPerChar[index] !== undefined;
      const slot = document.createElement(hasVerdict ? 'button' : 'span');
      const preview = !finished && Boolean(options.showCharacters);
      slot.textContent = finished || preview ? char : '·';
      slot.className = 'slot';
      slot.classList.toggle('preview', preview);
      // Passed only after starting again: the badge says on which try.
      const retried = hasVerdict && passedPerChar[index] && retriesPerChar[index] > 0;
      if (hasVerdict) {
        slot.type = 'button';
        const verdict = passedPerChar[index]
          ? `got it${retried ? ` on the ${ordinal(retriesPerChar[index] + 1)} try` : ''}`
          : 'missed';
        slot.title = `${char}: ${verdict}. Tap to change.`;
        slot.setAttribute('aria-label', slot.title);
        slot.addEventListener('click', () => setVerdict(index, !passedPerChar[index]));
      }
      if (index === position) {
        slot.classList.add('current');
      }
      if (hasVerdict) {
        slot.classList.add(passedPerChar[index] ? 'passed' : 'missed');
      }
      if (retried) {
        slot.classList.add('retried');
        slot.dataset.try = retriesPerChar[index] + 1;
      }
      if (skippedPerChar[index]) {
        slot.classList.add('skipped');
      }
      wordRow.appendChild(slot);
    });
    showArrows();
  }

  // The two arrows beside the writing area.
  //
  // Right: on the character being written, skip it (move past without
  // writing it, counted as passed), for when only another character of the
  // word needs the practice. On a character already written (practicing it,
  // or the word finished), simply go to the next one.
  //
  // Left: go to the character before, always (the owner, 2026-10-17: "If im
  // writing 小孩子 and i struggle remembering 孩, i might want to review the
  // full word before returning to 孩"). Written ones are practiced again
  // there, which changes nothing (see practicing); a skipped one is written
  // after all. Until 2026-10-17 it only undid a skip.
  function canSkip() {
    return finishedPerChar[position] ? position < chars.length - 1 : !charDone && chars.length > 1;
  }

  // The character the back arrow goes to, or -1 if there is none: the one
  // before; or this one, once it is finished, if it was skipped.
  function backTarget() {
    if (charDone && skippedPerChar[position]) {
      return position;
    }
    return position - 1;
  }

  function canGoBack() {
    return backTarget() !== -1;
  }

  function showArrows() {
    skipButton.classList.toggle('unavailable', !canSkip());
    backButton.classList.toggle('unavailable', !canGoBack());
  }

  // The stroke being written out of how many: "3/7". With hideStrokeCount
  // the text is still filled in (the browser tests read it), but not shown.
  // started: false before anything is drawn, when "No mistakes" would be
  // praise for nothing (UX review, 2026-10-16); mistakes in the word's
  // earlier characters are still shown then.
  function showProgress(strokeNumber, totalStrokes, started = true) {
    strokeCountElement.textContent = `${strokeNumber}/${totalStrokes}`;
    strokeCountElement.hidden = Boolean(options.hideStrokeCount);
    const mistakes = carriedMistakes + currentMistakes;
    const status = !started && mistakes === 0 ? 'Write the first stroke' : describeMistakes(mistakes);
    // While practicing, the line says so, so that it is not taken for the
    // card's own result; short, or on a small phone it wraps beside the
    // boxes and moves the writing area down.
    if (practicing) {
      statusElement.textContent = !started && mistakes === 0 ? 'Practice' : `Practice · ${status.toLowerCase()}`;
      return;
    }
    statusElement.textContent = status;
  }

  // The count is only for while a character is being written.
  function hideProgress() {
    strokeCountElement.textContent = '';
    strokeCountElement.hidden = true;
  }

  // Everything known about the word so far, for the mode's callbacks.
  function wordResult() {
    return {
      mistakes: sum(mistakesPerChar),
      mistakesPerChar: [...mistakesPerChar],
      passedPerChar: [...passedPerChar],
      suggestedPerChar: [...suggestedPerChar],
      hintPerChar: chars.map((char, index) => Boolean(hintPerChar[index])),
      orderPerChar: [...orderPerChar],
      skippedPerChar: chars.map((char, index) => Boolean(skippedPerChar[index])),
    };
  }

  // True once every character has been written or skipped.
  function wordFinished() {
    return chars.every((char, index) => finishedPerChar[index]);
  }

  // The next character still to be written: the first unfinished one after
  // the current position, or failing that the first one anywhere (after
  // going back, the unfinished ones can lie on either side).
  function nextUnfinished() {
    const isUnfinished = (index) => !finishedPerChar[index];
    const indexes = chars.map((char, index) => index);
    const after = indexes.filter((index) => index > position && isUnfinished(index));
    return after.length > 0 ? after[0] : indexes.find(isUnfinished);
  }

  const quizHandlers = {
    onStart({ totalStrokes }) {
      charDone = false;
      currentMistakes = 0;
      if (practicing) {
        carriedMistakes = 0;
        // The way on stays where the word is finished (a lesson's "Next
        // step"); Review has none, its grades are the way on.
        nextButton.hidden = !(wordFinished() && options.continueLabel);
        orderNote.hidden = true;
        renderWordRow(); // the arrows do nothing while practicing
        showProgress(1, totalStrokes, false);
        options.onPracticeStart?.();
        return;
      }
      strokesPerChar[position] = totalStrokes;
      // Starting the character (again) means it is being written after all.
      skippedPerChar[position] = false;
      finishedPerChar[position] = false;
      if (outlineVisible) {
        peekedPerChar[position] = true;
      }
      nextButton.hidden = true;
      orderNote.hidden = true;
      renderWordRow();
      showProgress(1, totalStrokes, false);
      // A tip the first time, about the gestures on the writing area (tips.js).
      document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'gestures' }));
      options.onCharStart?.();
    },
    onProgress({ strokesDone, totalStrokes, totalMistakes }) {
      currentMistakes = totalMistakes;
      // While the last stroke's completion is being reported, onComplete takes over.
      showProgress(Math.min(strokesDone + 1, totalStrokes), totalStrokes, strokesDone > 0 || totalMistakes > 0);
    },
    onComplete({ totalMistakes, hintShown, order }) {
      charDone = true;
      if (practicing) {
        orderNote.hidden = order !== 'mainland';
        hideProgress();
        statusElement.textContent = `Practice · ${describeMistakes(totalMistakes).toLowerCase()}`;
        // Back to the character still being written, as after a real one.
        if (!wordFinished()) {
          nextButton.textContent = 'Next';
          nextButton.hidden = false;
        }
        // The printed character keeps the color of the verdict that stands.
        return passedPerChar[position];
      }
      finishedPerChar[position] = true;
      orderPerChar[position] = order;
      // Writing the mainland order is accepted; the note only points out that
      // the standard order is different.
      orderNote.hidden = order !== 'mainland';
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
        // A tip the first time a character is judged in a word of several,
        // which has a row of boxes to overrule a verdict with (tips.js).
        if (chars.length > 1) {
          document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'verdict' }));
        }
      }
      afterCharFinished();
      // Returned to the quiz, which colors the printed character to match:
      // amber for right only after starting again. In Free practice there is
      // no verdict and this is undefined.
      return passedPerChar[position] && retriesPerChar[position] > 0 ? 'retried' : passedPerChar[position];
    },
    onAnimateStart() {
      nextButton.hidden = true;
      orderNote.hidden = true;
      hideProgress();
      statusElement.textContent = 'Watch the stroke order…';
    },
    // A swipe up on the writing area (gestures.js).
    onWipe: startOver,
  };

  // The current character is finished (written, or skipped as the last one):
  // update the page and, at the end of the word, tell the mode.
  function afterCharFinished() {
    renderWordRow();
    hideProgress();
    statusElement.textContent = skippedPerChar[position]
      ? 'Skipped'
      : describeMistakes(mistakesPerChar[position]) +
        (passedPerChar[position] && retriesPerChar[position] > 0 ? ` · ${ordinal(retriesPerChar[position] + 1)} try` : '');

    if (!wordFinished()) {
      nextButton.textContent = 'Next';
      nextButton.hidden = false;
      return;
    }
    if (chars.length > 1) {
      statusElement.textContent = `Word done · ${describeMistakes(sum(mistakesPerChar)).toLowerCase()}`;
    }
    if (options.continueLabel) {
      nextButton.textContent = options.continueLabel;
      nextButton.hidden = false;
    }
    options.onWordDone?.(wordResult());
  }

  // The skip button: move past the current character and count it as passed.
  function skipChar() {
    if (!canSkip()) {
      return;
    }
    if (finishedPerChar[position]) {
      goTo(position + 1);
      return;
    }
    skippedPerChar[position] = true;
    // Mistakes made before skipping still count toward the word.
    mistakesPerChar[position] = carriedMistakes + currentMistakes;
    orderPerChar[position] = null;
    if (options.judgeChar) {
      suggestedPerChar[position] = true;
      passedPerChar[position] = true;
    }

    finishedPerChar[position] = true;

    if (!wordFinished()) {
      position = nextUnfinished();
      showCurrentCharacter();
      return;
    }
    // Nothing is left to write: show this character, since the word is now
    // complete, and finish as if it had been written.
    charDone = true;
    tapAllowedFrom = Date.now() + TAP_TO_CONTINUE_DELAY_MS;
    quiz.reveal();
    afterCharFinished();
  }

  skipButton.addEventListener('click', skipChar);

  // The back button: return to the character that was skipped, to write it.
  function goBack() {
    const target = backTarget();
    if (target !== -1) {
      goTo(target);
    }
  }

  // Moves to the character at `index`, by the arrows. Nothing about leaving
  // or returning is held against you:
  // - a character left before it is finished keeps the mistakes (and a
  //   hint) made on it so far, and its attempt goes on when it is reached
  //   again;
  // - a character already written is practiced (see practicing);
  // - a skipped one is written after all: the skip's verdict is forgotten,
  //   the mistakes made on it before it was skipped are kept.
  function goTo(index) {
    if (!finishedPerChar[position]) {
      mistakesPerChar[position] = carriedMistakes + currentMistakes;
      hintPerChar[position] = Boolean(hintPerChar[position]) || quiz.hintShownNow();
    }
    const wasPracticing = practicing;
    position = index;
    charDone = false;
    practicing = Boolean(finishedPerChar[index]) && !skippedPerChar[index];
    if (wasPracticing && !practicing) {
      options.onPracticeEnd?.();
    }
    if (skippedPerChar[index]) {
      passedPerChar[index] = undefined;
      suggestedPerChar[index] = undefined;
    }
    const soFar = practicing ? 0 : mistakesPerChar[index] || 0;
    showCurrentCharacter();
    carriedMistakes = soFar;
  }

  backButton.addEventListener('click', goBack);

  function setOutlineVisible(visible) {
    outlineVisible = visible;
    quiz.setOutlineVisible(visible);
    outlineButton.textContent = visible ? 'Hide outline' : 'Show outline';
    if (visible && chars.length > 0 && !practicing) {
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
    document.documentElement.dataset.layout = wide ? 'wide' : 'narrow';
    const beside = arrowsBeside(size);
    writingArea.parentElement.classList.toggle('arrows-beside', beside);
    // The tone card's arrows follow the same rule (toneFlow.js, style.css).
    document.documentElement.dataset.arrows = beside ? 'beside' : 'over';
    writingArea.setAttribute('width', size);
    writingArea.setAttribute('height', size);
    // Lets the style sheet give the card face (see style.css) the same size.
    document.documentElement.style.setProperty('--area-size', `${size}px`);
    // Its text grows with it above a phone's size (style.css, .card-face).
    document.documentElement.style.setProperty('--face-zoom', String(Math.max(1, size / 400)));
    drawGrid(writingArea, size);
    quiz = createQuiz(writingArea, size, quizHandlers);
    quiz.setOutlineVisible(outlineVisible);
  }

  async function showCurrentCharacter() {
    carriedMistakes = 0;
    quiz.setDemoStrokes(Boolean(options.demoStrokes));
    return quiz.showCharacter(chars[position], options.script, options.rawInput !== false);
  }

  // Called before the current character is started over: keeps the mistakes
  // made so far, and notes if the answer had already been seen. With
  // freshRestart (practice) the slate is wiped instead, so that a clean
  // attempt counts as one (a tester, 2026-10-16).
  function beforeRedo() {
    if (options.freshRestart) {
      if (carriedMistakes + currentMistakes > 0 || hintPerChar[position] || quiz.hintShownNow()) {
        retriesPerChar[position] = (retriesPerChar[position] || 0) + 1;
      }
      carriedMistakes = 0;
      peekedPerChar[position] = outlineVisible;
      hintPerChar[position] = false;
    } else if (charDone) {
      carriedMistakes = mistakesPerChar[position];
      peekedPerChar[position] = true;
    } else {
      carriedMistakes += currentMistakes;
    }
    charDone = false;
  }

  // The Next button, or a tap on the writing area once a character is done.
  function goOn() {
    if (!wordFinished()) {
      goTo(nextUnfinished());
    } else {
      options.onContinue?.();
    }
  }

  // A tap on a finished character's slot: overrules its verdict.
  function setVerdict(index, passed) {
    passedPerChar[index] = passed;
    renderWordRow();
    // The printed character under the writing is colored to match, if it is
    // the one on screen.
    if (index === position) {
      quiz.showVerdict(passed);
    }
    if (wordFinished()) {
      options.onVerdictChange?.(wordResult());
    }
  }

  nextButton.addEventListener('click', goOn);

  // "pointerup" fires when a finger, stylus or mouse button is lifted. A plain
  // "click" listener would not work here: Hanzi Writer blocks the click that
  // browsers normally produce from a touch on the writing area.
  //
  // It listens on the writing area's row, which hears the event after the
  // writing area itself: a swipe up once the character is done is taken by
  // the quiz there and goes no further, so it is not also a tap (quiz.js).
  writingArea.parentElement.addEventListener('pointerup', (event) => {
    // Not while practicing: a tap there never grades or moves on.
    if (writingArea.contains(event.target) && charDone && !practicing && Date.now() >= tapAllowedFrom) {
      goOn();
    }
  });

  // The Clear button, or a swipe up on the writing area: the mistakes made
  // so far still count.
  function startOver() {
    if (options.practiceWhenDone && wordFinished()) {
      practicing = true;
    }
    if (!practicing) {
      beforeRedo();
    }
    quiz.restart();
  }

  restartButton.addEventListener('click', startOver);

  outlineButton.addEventListener('click', () => setOutlineVisible(!outlineVisible));

  animateButton.addEventListener('click', () => {
    if (!practicing) {
      beforeRedo();
      peekedPerChar[position] = true;
    }
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
    //   rawInput:     false to replace each correct stroke with the printed
    //                  one; otherwise your own strokes stay on screen
    //   continueLabel: text for the Next button once the word is finished, or
    //                  null to leave it hidden
    //   hideOutline:   true to switch the outline off first
    //   showOutline:   true to switch the outline on first
    //   demoStrokes:   true to show each stroke, over and over, until it is
    //                  written (the lesson for a new word, see review.js)
    //   showCharacters: true to show the characters still to be written in
    //                  their slots, faintly, instead of "·": for steps where
    //                  the character is on screen anyway (a lesson's tracing
    //                  and outline steps; UX review item 12, 2026-10-17)
    //   freshRestart:  true to forget the mistakes, hints and peeks of earlier
    //                  attempts when a character is started over (practice);
    //                  otherwise they still count
    //   hideStrokeCount: true to keep the stroke count ("3/7") out of sight,
    //                  since it is a hint (Review, unless a setting says so)
    //   judgeChar({ mistakes, strokes, hintShown, peeked }):
    //                  returns true if the character counts as passed. Leave
    //                  it out for no verdicts at all (Free practice).
    //   practiceWhenDone: true to let the character on screen be written
    //                  again once the word is finished, as practice that
    //                  changes nothing (see practicing; Review)
    //   onCharStart(): a character starts (or starts over)
    //   onPracticeStart(): practicing a written character begins (see
    //                  practiceAgain, goTo)
    //   onPracticeEnd(): the arrows went from practicing back to the
    //                  character still being written
    //   onWordDone(result): the last character was finished. `result` has
    //                  mistakes, mistakesPerChar, passedPerChar,
    //                  suggestedPerChar, hintPerChar, orderPerChar,
    //                  skippedPerChar
    //   onVerdictChange(result): a verdict was overruled after the word was
    //                  finished
    //   onContinue():  Next was pressed, or the writing area tapped, after the
    //                  word was finished
    async start(text, newOptions) {
      // Array.from splits text into whole characters. (Plain text.split('')
      // would cut some rare characters in half.) Spaces are dropped.
      const typed = Array.from(text).filter((char) => char.trim() !== '');

      // The outline is set now, before the stroke data has loaded: a tap on
      // "Hide outline" while it loads (a slow tablet) would otherwise be
      // undone once it has (a tester, 2026-10-16).
      if (newOptions.hideOutline) {
        setOutlineVisible(false);
      } else if (newOptions.showOutline) {
        setOutlineVisible(true);
      }

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
      practicing = false;
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
      orderPerChar = [];
      skippedPerChar = [];
      finishedPerChar = [];
      retriesPerChar = [];
      await showCurrentCharacter();
      return true;
    },

    // Writes the character on screen again, as practice (see practicing).
    // Only once the word is finished, and only where practiceWhenDone is set.
    practiceAgain() {
      if (options.practiceWhenDone && wordFinished()) {
        startOver();
      }
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
