// Tone cards: you see the word and give the tone of each character in turn,
// either with the five tone buttons or by drawing the tone mark on the card.

import { formatPinyin } from './wordList.js';
import { TONE_LABELS, describeReading } from './tones.js';
import { recognizeToneMark } from './toneMark.js';

// After a right answer, the next character comes up by itself after this long.
const MOVE_ON_AFTER_MS = 500;

// After a wrong answer or at the end, tapping the card continues. Taps are
// ignored for this long first, so a stray touch doesn't skip the answer.
const TAP_TO_CONTINUE_DELAY_MS = 600;

// A new character ignores touches for this long, so the tap that brought it up
// isn't taken for a neutral-tone dot.
const DRAW_ALLOWED_AFTER_MS = 300;

// How long a mark that wasn't recognized stays visible before it is cleared.
const CLEAR_UNRECOGNIZED_AFTER_MS = 600;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function paragraph(className, text) {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  return element;
}

// elements: the page elements the tone card uses:
//   cardFace, wordRow, statusElement,
//   toneButtons (the list of five tone buttons; each has a data-tone attribute),
//   nextButton
//
// Returns { start, stop }.
export function createToneFlow(elements) {
  const { cardFace, wordRow, statusElement, toneButtons, nextButton } = elements;

  // What the card on screen needs; null when no tone card is showing.
  let current = null;
  let chars = [];
  let position = 0;
  // One entry per character answered so far: the tone given, and whether it
  // was right.
  let givenTones = [];
  let passedPerChar = [];
  // True where the tone given was accepted only as a variant (see toneAnswers
  // in tones.js), not because it is the tone listed.
  let variantPerChar = [];
  // 'asking':  waiting for a tone
  // 'right':   just answered correctly; about to move on by itself
  // 'wrong':   answered incorrectly; waiting for a tap
  // 'done':    every character answered
  let state = 'asking';
  let tapAllowedFrom = 0;
  let moveOnTimer = null;

  // Drawing the tone mark. The "ink" is a see-through layer over the card
  // that shows the stroke while it is being drawn.
  const ink = document.createElementNS(SVG_NAMESPACE, 'svg');
  ink.setAttribute('class', 'tone-ink');
  const inkPath = document.createElementNS(SVG_NAMESPACE, 'path');
  ink.appendChild(inkPath);
  // The points of the stroke being drawn, or null when no stroke is under way.
  let drawing = null;
  let drawAllowedFrom = 0;
  let clearInkTimer = null;

  function showInk(points) {
    const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    // A single point has no length, so nothing would show; draw a tiny line.
    inkPath.setAttribute('d', points.length === 1 ? `${d} l 0.1 0` : d);
  }

  // Where a touch is, measured from the corner of the ink layer.
  function pointOf(event) {
    const box = ink.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function renderWordRow() {
    wordRow.replaceChildren();
    chars.forEach((char, index) => {
      const slot = document.createElement('span');
      slot.textContent = char;
      slot.className = 'slot';
      if (index === position && state !== 'done') {
        slot.classList.add('current');
      }
      if (passedPerChar[index] !== undefined) {
        slot.classList.add(passedPerChar[index] ? 'passed' : 'missed');
      }
      wordRow.appendChild(slot);
    });
  }

  function faceWord(text) {
    const element = paragraph(Array.from(text).length === 1 ? 'face-word single' : 'face-word', text);
    element.lang = current.script === 'traditional' ? 'zh-Hant-TW' : 'zh-Hans-CN';
    return element;
  }

  // Puts the next character up and asks for its tone.
  function ask() {
    state = 'asking';
    nextButton.hidden = true;
    renderWordRow();
    clearTimeout(clearInkTimer);
    showInk([]);
    drawing = null;
    drawAllowedFrom = Date.now() + DRAW_ALLOWED_AFTER_MS;
    cardFace.replaceChildren(
      faceWord(chars[position]),
      paragraph('face-hint', 'Draw the tone mark, or use the buttons'),
      ink,
    );
    statusElement.textContent =
      chars.length > 1 ? `Tone of character ${position + 1} of ${chars.length}` : 'Which tone?';
  }

  // Shows the word with its reading and meaning, and how it was answered.
  function showResult() {
    const wrong = passedPerChar.filter((passed) => !passed).length;
    statusElement.textContent = wrong === 0 ? 'All tones right' : `${wrong} wrong`;
    const described = describeReading(current.reading);
    const parts = [faceWord(chars.join('')), paragraph('face-pinyin', described.main)];
    if (described.other) {
      parts.push(paragraph('face-hint', described.other));
    }
    parts.push(paragraph('face-meaning', current.word.definition));
    // If the tones given differ from the listed reading, show what was
    // answered: the syllables with the tones that were chosen.
    const answered = formatPinyin(
      current.answers.map((answer, index) => answer.syllable.slice(0, -1) + givenTones[index]).join(''),
    );
    const listedFirst = formatPinyin(current.answers.map((answer) => answer.syllable).join(''));
    if (wrong > 0) {
      parts.push(paragraph('face-note missed', `You answered ${answered}.`));
    } else if (variantPerChar.includes(true)) {
      // Accepted, but not what is listed: say so, so the listed tone is learned.
      parts.push(
        paragraph(
          'face-note',
          `You answered ${answered}: accepted as a regional or neutral-tone variant of ${listedFirst}.`,
        ),
      );
    }
    cardFace.replaceChildren(...parts);
  }

  function finish() {
    state = 'done';
    tapAllowedFrom = Date.now() + TAP_TO_CONTINUE_DELAY_MS;
    nextButton.hidden = true;
    renderWordRow();
    showResult();
    current.onDone({
      givenTones: [...givenTones],
      passedPerChar: [...passedPerChar],
      variantPerChar: [...variantPerChar],
    });
  }

  function moveOn() {
    clearTimeout(moveOnTimer);
    if (position < chars.length - 1) {
      position += 1;
      ask();
    } else {
      finish();
    }
  }

  // A tone was given for the current character (1 to 4, or 5 for neutral).
  function answer(tone) {
    if (!current || state !== 'asking') {
      return;
    }
    const expected = current.answers[position];
    const listed = expected.tones.includes(tone);
    const passed = listed || expected.variantTones.includes(tone);
    givenTones[position] = tone;
    passedPerChar[position] = passed;
    variantPerChar[position] = passed && !listed;
    renderWordRow();

    // Show the syllable with its tone mark, green or red.
    const syllable = paragraph(
      passed ? 'face-pinyin passed' : 'face-pinyin missed',
      formatPinyin(expected.syllable),
    );
    cardFace.replaceChildren(faceWord(chars[position]), syllable);

    if (passed) {
      state = 'right';
      moveOnTimer = setTimeout(moveOn, MOVE_ON_AFTER_MS);
    } else {
      state = 'wrong';
      tapAllowedFrom = Date.now() + TAP_TO_CONTINUE_DELAY_MS;
      statusElement.textContent = `Not ${TONE_LABELS[tone]}. Tap to continue.`;
      nextButton.hidden = false;
    }
  }

  // A stroke was finished: work out which tone mark it is.
  function finishDrawing() {
    const points = drawing;
    drawing = null;
    const tone = recognizeToneMark(points, ink.getBoundingClientRect().width);
    if (tone === null) {
      statusElement.textContent = 'Mark not recognized. Try again, or use the buttons.';
      clearInkTimer = setTimeout(() => showInk([]), CLEAR_UNRECOGNIZED_AFTER_MS);
    } else {
      answer(tone);
    }
  }

  // "pointer" events cover fingers, styluses and the mouse alike.
  cardFace.addEventListener('pointerdown', (event) => {
    if (!current || state !== 'asking' || Date.now() < drawAllowedFrom) {
      return;
    }
    // Keeps the rest of this stroke coming to the card even if the finger
    // slides off its edge.
    cardFace.setPointerCapture(event.pointerId);
    clearTimeout(clearInkTimer);
    drawing = [pointOf(event)];
    showInk(drawing);
  });

  cardFace.addEventListener('pointermove', (event) => {
    if (drawing) {
      drawing.push(pointOf(event));
      showInk(drawing);
    }
  });

  // The system took the touch away, e.g. for a gesture: drop the stroke.
  cardFace.addEventListener('pointercancel', () => {
    drawing = null;
    showInk([]);
  });

  for (const button of toneButtons) {
    button.addEventListener('click', () => answer(Number(button.dataset.tone)));
  }

  nextButton.addEventListener('click', () => {
    if (current && state === 'wrong') {
      moveOn();
    }
  });

  cardFace.addEventListener('pointerup', () => {
    if (drawing) {
      finishDrawing();
      return;
    }
    if (!current || Date.now() < tapAllowedFrom) {
      return;
    }
    if (state === 'wrong') {
      moveOn();
    } else if (state === 'done') {
      current.onContinue();
    }
  });

  return {
    // Shows a tone card.
    //
    // options:
    //   word:    the word record
    //   script:  'traditional' or 'simplified'
    //   reading: which reading to show (from readingsFor in tones.js)
    //   answers: one entry per character, from toneAnswers() in tones.js
    //   onDone({ givenTones, passedPerChar, variantPerChar }): every
    //            character was answered
    //   onContinue(): the card was tapped after that
    start(options) {
      clearTimeout(moveOnTimer);
      current = options;
      // Lets the style sheet stop the page from scrolling under a drawing finger.
      cardFace.classList.add('drawable');
      chars = Array.from(options.word[options.script]);
      position = 0;
      givenTones = [];
      passedPerChar = [];
      variantPerChar = [];
      ask();
    },

    // The word's meaning was corrected while its card is showing.
    update(word) {
      if (current) {
        current.word = word;
        if (state === 'done') {
          showResult();
        }
      }
    },

    stop() {
      clearTimeout(moveOnTimer);
      clearTimeout(clearInkTimer);
      drawing = null;
      cardFace.classList.remove('drawable');
      current = null;
    },
  };
}
