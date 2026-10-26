// Tone cards: you see the word and give the tone of each character in turn,
// either with the five tone buttons or by drawing the tone mark on the card.

import { showReading } from './readingStyle.js';
import { TONE_LABELS, describeReading } from './tones.js';
import { recognizeToneMark } from './toneMark.js';
import { fillMixed, fillReading, langFor } from './lang.js';
import { faceArrow, BACK, FORWARD } from './faceArrow.js';
import { t } from './text.js';
import { freshTaps } from './freshTap.js';

// After a right answer, the next character comes up by itself after this long.
// The pause holds nobody up (the owner, 2026-10-26: it felt like the app
// lagging): an answer given meanwhile, by a tone button or a mark drawn, is
// for the next character, and a tap on the card moves on at once.
const MOVE_ON_AFTER_MS = 500;

// After a wrong answer or at the end, tapping the card continues, but only
// with a touch begun after the answer (freshTap.js): the one that gave it
// doesn't skip it. Drawing a mark needs no such care: a stroke begins only
// when a finger comes down, so the tap that brought a character up is never
// taken for a neutral-tone dot.

// How long a mark that wasn't recognized stays visible before it is cleared.
const CLEAR_UNRECOGNIZED_AFTER_MS = 600;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function paragraph(className, text) {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  return element;
}

// A paragraph with a reading in it, its zhuyin marked as Chinese (lang.js).
function readingParagraph(className, text) {
  const element = paragraph(className, '');
  fillReading(element, text);
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
  // 'right':   just answered correctly; about to move on by itself, or at
  //            once with a touch or an answer (MOVE_ON_AFTER_MS)
  // 'wrong':   answered incorrectly; waiting for a tap
  // 'done':    every character answered
  let state = 'asking';
  const taps = freshTaps(cardFace);
  let moveOnTimer = null;
  // True while a touch begun as a right answer was shown is being drawn: if
  // it turns out a dot, it was a tap to move on, not the neutral tone.
  let hurried = false;
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
  const backArrow = faceArrow('tone-back-button', t('write.backToCharacter'), BACK);
  const skipArrow = faceArrow('tone-skip-button', t('tone.skip'), FORWARD);

  // "What are tones?", under what to do while asking (the owner, 2026-10-21,
  // after tester 3, who had almost no Chinese). On the card's face, which is
  // always the same size, so that nothing above or below it moves; in the
  // line above the card it took two lines in Learn. Like the arrows, a touch
  // on it is not a stroke of a tone mark nor a tap on the card.
  const tonesLink = document.createElement('button');
  tonesLink.type = 'button';
  tonesLink.id = 'tones-link';
  tonesLink.className = 'link-button face-link';
  tonesLink.textContent = t('tone.whatAreTones');
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
    const label = t(position === 0 ? 'write.backToCard' : 'write.backToCharacter');
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
  let clearInkTimer = null;
  // The syllable shown after an answer, green or red; recolored if its box
  // is tapped.
  let shownSyllable = null;

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

  // The row of boxes above the card. An answered character's box is a
  // button: a tap overrules the app's verdict, right becoming wrong and the
  // other way round, exactly as on a writing card (the owner, 2026-10-24).
  function renderWordRow() {
    wordRow.replaceChildren();
    // The row is shown even for a word of one character (wordFlow hides it
    // then), as the top of a tone card (the owner, 2026-10-16).
    wordRow.classList.remove('single');
    chars.forEach((char, index) => {
      const answered = passedPerChar[index] !== undefined;
      const slot = document.createElement(answered ? 'button' : 'span');
      slot.textContent = char;
      slot.className = 'slot';
      if (answered) {
        slot.type = 'button';
        slot.title = t('write.slotTitle', { char, verdict: t(passedPerChar[index] ? 'write.right' : 'write.missed') });
        slot.setAttribute('aria-label', slot.title);
        slot.addEventListener('click', () => setVerdict(index, !passedPerChar[index]));
      }
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

  // A tap on an answered character's box: its verdict is overruled. The
  // tone given stays as it was; only whether it counts as right changes.
  function setVerdict(index, passed) {
    if (!current) {
      return;
    }
    passedPerChar[index] = passed;
    // Right by the learner's word, not as a variant of the listed tone.
    variantPerChar[index] = false;
    renderWordRow();
    if (index === position && shownSyllable && state !== 'asking') {
      shownSyllable.className = passed ? 'face-pinyin passed' : 'face-pinyin missed';
    }
    if (state === 'done') {
      showResult();
      // Once graded, the change can alter the suggested grade (review.js).
      if (doneOnce) {
        current.onVerdictChange?.(results());
      }
    }
  }

  // Whether the tone given for a character is one the word accepts.
  function accepted(index) {
    const expected = current.answers[index];
    const tone = givenTones[index];
    return tone === undefined || expected.tones.includes(tone) || expected.variantTones.includes(tone);
  }

  function results() {
    return {
      givenTones: [...givenTones],
      passedPerChar: [...passedPerChar],
      variantPerChar: [...variantPerChar],
    };
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
    shownSyllable = null;
    // The character asked about, small, above what to do, large: drawn big
    // as before, it looked like something to draw over (a tester and the
    // owner, 2026-10-16).
    const asked = paragraph('tone-char', chars[position]);
    asked.lang = langFor(current.script);
    cardFace.replaceChildren(
      asked,
      exampleMarks(),
      paragraph('face-hint tone-ask', t('tone.drawHere')),
      // In two columns (a screen held sideways) the buttons are to the left.
      paragraph('face-hint', t(document.documentElement.dataset.layout === 'wide' ? 'tone.orButtonsLeft' : 'tone.orButtonsBelow')),
      // Only for someone who has graded few tone cards yet (review.js).
      ...(current.offerHelp ? [tonesLink] : []),
      ink,
      backArrow,
      skipArrow,
    );
    showArrows();
    // "Tone of 你 (1 of 2)": the character named, and the count for a word
    // with the same one twice (谢谢). The owner's wording, 2026-10-16.
    if (chars.length > 1) {
      const which = { char: chars[position], position: position + 1, count: chars.length };
      fillMixed(statusElement, t(practicing ? 'tone.practiceToneOf' : 'tone.toneOf', which), current.script);
    } else {
      statusElement.textContent = t(practicing ? 'tone.practiceWhichTone' : 'tone.whichTone');
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
    statusElement.textContent = wrong === 0 ? t('tone.allRight') : t('tone.wrong', { count: wrong });
    const described = describeReading(current.reading);
    const parts = [faceWord(chars.join('')), readingParagraph('face-pinyin', described.main)];
    if (described.other) {
      parts.push(readingParagraph('face-hint', described.other));
    }
    parts.push(paragraph('face-meaning', current.word.definition));
    // If the tones given differ from the listed reading, show what was
    // answered: the syllables with the tones that were chosen.
    const answered = showReading(
      // A skipped character is shown with its listed tone.
      current.answers.map((answer, index) => (givenTones[index] === undefined ? answer.syllable : answer.syllable.slice(0, -1) + givenTones[index])).join(''),
    );
    const listedFirst = showReading(current.answers.map((answer) => answer.syllable).join(''));
    if (wrong > 0) {
      parts.push(readingParagraph('face-note missed', t('tone.youAnswered', { answer: answered })));
    } else if (chars.some((char, index) => !accepted(index))) {
      // A wrong tone counted as right by a tap on its box: still say what
      // was answered.
      parts.push(readingParagraph('face-note', t('tone.youAnswered', { answer: answered })));
    } else if (variantPerChar.includes(true)) {
      // Accepted, but not what is listed: say so, so the listed tone is learned.
      parts.push(
        readingParagraph('face-note', t('tone.variant', { answer: answered, listed: listedFirst })),
      );
    }
    cardFace.replaceChildren(...parts);
  }

  function finish() {
    state = 'done';
    practicing = false;
    taps.mark();
    nextButton.hidden = true;
    renderWordRow();
    showResult();
    if (doneOnce) {
      return; // gone back after it was done: the answers stand as given
    }
    doneOnce = true;
    current.onDone(results());
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
    // Given while a right answer is shown: for the next character.
    if (current && state === 'right' && position < chars.length - 1) {
      moveOn();
    }
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

    // Show the syllable with its tone mark, green or red (or as its box
    // says, in practice).
    const shown = passedPerChar[position];
    shownSyllable = readingParagraph(
      shown ? 'face-pinyin passed' : 'face-pinyin missed',
      showReading(expected.syllable),
    );
    cardFace.replaceChildren(faceWord(chars[position]), shownSyllable);

    if (passed) {
      state = 'right';
      moveOnTimer = setTimeout(moveOn, MOVE_ON_AFTER_MS);
    } else {
      state = 'wrong';
      taps.mark();
      statusElement.textContent = t('tone.not', { tone: TONE_LABELS[tone] });
      nextButton.hidden = false;
    }
  }

  // A stroke was finished: work out which tone mark it is.
  function finishDrawing() {
    const points = drawing;
    drawing = null;
    const tone = recognizeToneMark(points, ink.getBoundingClientRect().width / zoomOf());
    if (hurried && tone === 5) {
      showInk([]); // a tap to move on (see `hurried`)
      return;
    }
    if (tone === null) {
      statusElement.textContent = t('tone.notRecognized');
      clearInkTimer = setTimeout(() => showInk([]), CLEAR_UNRECOGNIZED_AFTER_MS);
    } else {
      answer(tone);
    }
  }

  // "pointer" events cover fingers, styluses and the mouse alike.
  cardFace.addEventListener('pointerdown', (event) => {
    if (!current) {
      return;
    }
    // A right answer is shown: on at once. After the last character this
    // shows the result, and the touch ends there (it isn't fresh, so its
    // lifting doesn't also go on to the grade).
    hurried = state === 'right';
    if (hurried) {
      moveOn();
    }
    if (state !== 'asking') {
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
    if (!current || !taps.isFresh()) {
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
    //   onVerdictChange({ givenTones, passedPerChar, variantPerChar }):
    //            optional; a box was tapped after onDone, overruling a verdict
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
