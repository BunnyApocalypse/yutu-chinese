// Tone cards: you see the word and give the tone of each character in turn,
// either with the five tone buttons or by drawing the tone mark on the card.

import { formatPinyin } from './wordList.js';
import { TONE_LABELS, describeReading } from './tones.js';
import { recognizeToneMark } from './toneMark.js';
import { fillMixed, langFor } from './lang.js';
import { faceArrow, BACK, FORWARD } from './faceArrow.js';

// After a right answer, the next character comes up by itself after this long.
const MOVE_ON_AFTER_MS = 500;

// After a wrong answer or at the end, tapping the card continues. Taps are
// ignored for this long first, so a stray touch doesn't skip the answer.
// (200 since 2026-10-13, down from 600: the owner found the wait in the way
// when moving on quickly. It is still enough for the tap that finished the
// step not to count as the tap that moves on.)
const TAP_TO_CONTINUE_DELAY_MS = 200;

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

// The five marks, drawn faintly above "Draw one of these here" while asking
// (the owner, 2026-10-20, after tester 3 didn't know what to draw): level,
// rising, down then up, falling, and the dot of the neutral tone. Drawn as
// pictures, since a font puts tone marks high and small. Only a picture for
// the eye: the buttons say each tone's name.
const MARK_PATHS = ['M6 20 H34', 'M8 32 L32 8', 'M6 12 Q20 44 34 8', 'M8 8 L32 32'];

// One tone's mark as a picture (SVG markup): tone 1 to 4, or 5 for the dot.
// Also used by "Basics of Chinese" (basics.js).
export function toneMarkPicture(tone) {
  return tone === 5
    ? '<svg viewBox="0 0 40 40"><circle cx="20" cy="22" r="3.5" /></svg>'
    : `<svg viewBox="0 0 40 40"><path d="${MARK_PATHS[tone - 1]}" /></svg>`;
}

const EXAMPLE_MARKS = [1, 2, 3, 4, 5].map(toneMarkPicture).join('');

function exampleMarks() {
  const element = document.createElement('p');
  element.className = 'tone-examples';
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = EXAMPLE_MARKS;
  return element;
}

// elements: the page elements the tone card uses:
//   cardFace, wordRow, statusElement,
//   toneButtons (the list of five tone buttons; each has a data-tone attribute),
//   nextButton,
//   onWhatAreTones (called by "What are tones?" on the card: main.js opens
//   "Basics of Chinese" at its screen on tones)
//
// Returns { start, stop }.
export function createToneFlow(elements) {
  const { cardFace, wordRow, statusElement, toneButtons, nextButton, onWhatAreTones } = elements;

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
  // Skipped characters, counted as right (the › arrow), and whether the
  // character asked now was answered before and is only practice (gone
  // back to with the ‹ arrow): its first answer stands (the owner,
  // 2026-10-17, as for writing in wordFlow.js).
  let skippedPerChar = [];
  let practicing = false;
  // True once onDone has been called: going back afterwards is practice.
  let doneOnce = false;

  // The arrows (faceArrow.js): back to the character before, and on past
  // this one. Put on the card's face with each question, since the face is
  // refilled.
  const backArrow = faceArrow('tone-back-button', 'Go back to the character before', BACK);
  const skipArrow = faceArrow('tone-skip-button', 'Skip this character (counts as right)', FORWARD);

  // "What are tones?", under what to do while asking (the owner, 2026-10-21,
  // after tester 3, who had almost no Chinese). On the card's face, which is
  // always the same size, so that nothing above or below it moves; in the
  // line above the card it took two lines in Learn. Like the arrows, a touch
  // on it is not a stroke of a tone mark nor a tap on the card.
  const tonesLink = document.createElement('button');
  tonesLink.type = 'button';
  tonesLink.id = 'tones-link';
  tonesLink.className = 'link-button face-link';
  tonesLink.textContent = 'What are tones?';
  tonesLink.addEventListener('pointerdown', (event) => event.stopPropagation());
  tonesLink.addEventListener('pointerup', (event) => event.stopPropagation());
  tonesLink.addEventListener('click', () => onWhatAreTones());

  // Back to the card before (Review, options.backToCard): from the first
  // character, before any tone has been given or skipped.
  function canGoBackACard() {
    return Boolean(current?.backToCard) && position === 0 && givenTones.length === 0 && skippedPerChar.length === 0;
  }

  function showArrows() {
    backArrow.classList.toggle('unavailable', !(state === 'asking' && (position > 0 || canGoBackACard())));
    const label = position === 0 ? 'Go back to the card before' : 'Go back to the character before';
    backArrow.setAttribute('aria-label', label);
    backArrow.title = label;
    skipArrow.classList.toggle('unavailable', !(state === 'asking' && chars.length > 1));
  }

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

  // How much bigger the card is drawn than its own size (its "zoom" on a
  // big screen, style.css): what the screen measures is divided by it to
  // get the card's own units, in which the ink is drawn.
  function zoomOf() {
    return cardFace.getBoundingClientRect().width / cardFace.offsetWidth || 1;
  }

  // Where a touch is, measured from the corner of the ink layer, in the
  // card's own units.
  function pointOf(event) {
    const box = ink.getBoundingClientRect();
    const zoom = zoomOf();
    return { x: (event.clientX - box.left) / zoom, y: (event.clientY - box.top) / zoom };
  }

  function renderWordRow() {
    wordRow.replaceChildren();
    // The row is shown even for a word of one character (wordFlow hides it
    // then), as the top of a tone card (the owner, 2026-10-16).
    wordRow.classList.remove('single');
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
      if (skippedPerChar[index]) {
        slot.classList.add('skipped');
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
    // The character asked about, small, above what to do, large: drawn big
    // as before, it looked like something to draw over (a tester and the
    // owner, 2026-10-16).
    const asked = paragraph('tone-char', chars[position]);
    asked.lang = langFor(current.script);
    cardFace.replaceChildren(
      asked,
      exampleMarks(),
      paragraph('face-hint tone-ask', 'Draw one of these here'),
      // In two columns (a screen held sideways) the buttons are to the left.
      paragraph('face-hint', document.documentElement.dataset.layout === 'wide' ? 'or use the buttons on the left' : 'or use the buttons below'),
      // Only for someone who has graded few tone cards yet (review.js).
      ...(current.offerHelp ? [tonesLink] : []),
      ink,
      backArrow,
      skipArrow,
    );
    showArrows();
    // "Tone of 你 (1 of 2)": the character named, and the count for a word
    // with the same one twice (谢谢). The owner's wording, 2026-10-16.
    const practice = practicing ? 'Practice · ' : '';
    if (chars.length > 1) {
      fillMixed(statusElement, `${practice}Tone of ${chars[position]} (${position + 1} of ${chars.length})`, current.script);
    } else {
      statusElement.textContent = `${practice}Which tone?`;
    }
  }

  // Asks the character at `index`: practice if it was answered before.
  function askAt(index) {
    clearTimeout(moveOnTimer);
    position = index;
    // A skipped one is answered after all, as on the writing area.
    practicing = givenTones[index] !== undefined;
    ask();
  }

  // The › arrow: on past this character, counted as right if it had no
  // answer yet. Not on the result once all are answered (the arrows are
  // only on a question).
  function skip() {
    if (!current || state !== 'asking' || chars.length < 2) {
      return;
    }
    if (!practicing) {
      skippedPerChar[position] = true;
      passedPerChar[position] = true;
      variantPerChar[position] = false;
    }
    moveOn();
  }

  function goBack() {
    if (!current || state !== 'asking') {
      return;
    }
    if (position > 0) {
      askAt(position - 1);
    } else if (canGoBackACard()) {
      current.backToCard();
    }
  }

  backArrow.addEventListener('click', goBack);
  skipArrow.addEventListener('click', skip);

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
      // A skipped character is shown with its listed tone.
      current.answers.map((answer, index) => (givenTones[index] === undefined ? answer.syllable : answer.syllable.slice(0, -1) + givenTones[index])).join(''),
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
    practicing = false;
    tapAllowedFrom = Date.now() + TAP_TO_CONTINUE_DELAY_MS;
    nextButton.hidden = true;
    renderWordRow();
    showResult();
    if (doneOnce) {
      return; // gone back after it was done: the answers stand as given
    }
    doneOnce = true;
    current.onDone({
      givenTones: [...givenTones],
      passedPerChar: [...passedPerChar],
      variantPerChar: [...variantPerChar],
    });
  }

  function moveOn() {
    clearTimeout(moveOnTimer);
    if (position < chars.length - 1) {
      askAt(position + 1);
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
    // Practice (a character gone back to) keeps its first answer.
    if (!practicing) {
      skippedPerChar[position] = false;
      givenTones[position] = tone;
      passedPerChar[position] = passed;
      variantPerChar[position] = passed && !listed;
    }
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
    const tone = recognizeToneMark(points, ink.getBoundingClientRect().width / zoomOf());
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
    //   offerHelp: true to show "What are tones?" while asking
    //   onDone({ givenTones, passedPerChar, variantPerChar }): every
    //            character was answered
    //   onContinue(): the card was tapped after that
    //   backToCard(): optional; the ‹ arrow on the first character, before
    //            anything is answered, goes back to the card before (Review)
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
      skippedPerChar = [];
      practicing = false;
      doneOnce = false;
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
