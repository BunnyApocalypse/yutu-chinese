// Tone cards: you see the word and give the tone of each character in turn.

import { formatPinyin } from './wordList.js';
import { TONE_LABELS } from './tones.js';

// After a right answer, the next character comes up by itself after this long.
const MOVE_ON_AFTER_MS = 500;

// After a wrong answer or at the end, tapping the card continues. Taps are
// ignored for this long first, so a stray touch doesn't skip the answer.
const TAP_TO_CONTINUE_DELAY_MS = 600;

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
  // 'asking':  waiting for a tone
  // 'right':   just answered correctly; about to move on by itself
  // 'wrong':   answered incorrectly; waiting for a tap
  // 'done':    every character answered
  let state = 'asking';
  let tapAllowedFrom = 0;
  let moveOnTimer = null;

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
    cardFace.replaceChildren(faceWord(chars[position]));
    statusElement.textContent =
      chars.length > 1 ? `Tone of character ${position + 1} of ${chars.length}` : 'Which tone?';
  }

  function finish() {
    state = 'done';
    tapAllowedFrom = Date.now() + TAP_TO_CONTINUE_DELAY_MS;
    nextButton.hidden = true;
    renderWordRow();
    const wrong = passedPerChar.filter((passed) => !passed).length;
    statusElement.textContent = wrong === 0 ? 'All tones right' : `${wrong} wrong`;
    cardFace.replaceChildren(
      faceWord(chars.join('')),
      paragraph('face-pinyin', formatPinyin(current.word.pinyin)),
      paragraph('face-meaning', current.word.definition),
    );
    current.onDone({ givenTones: [...givenTones], passedPerChar: [...passedPerChar] });
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
    const passed = expected.tones.includes(tone);
    givenTones[position] = tone;
    passedPerChar[position] = passed;
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

  for (const button of toneButtons) {
    button.addEventListener('click', () => answer(Number(button.dataset.tone)));
  }

  nextButton.addEventListener('click', () => {
    if (current && state === 'wrong') {
      moveOn();
    }
  });

  cardFace.addEventListener('pointerup', () => {
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
    //   answers: one entry per character, from toneAnswers() in tones.js
    //   onDone({ givenTones, passedPerChar }): every character was answered
    //   onContinue(): the card was tapped after that
    start(options) {
      clearTimeout(moveOnTimer);
      current = options;
      chars = Array.from(options.word[options.script]);
      position = 0;
      givenTones = [];
      passedPerChar = [];
      ask();
    },

    stop() {
      clearTimeout(moveOnTimer);
      current = null;
    },
  };
}
