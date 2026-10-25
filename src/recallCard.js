// Meaning and pinyin cards: you see the word, recall its meaning or its
// reading, tap to see the answer, and grade yourself.

import { describeReading } from './tones.js';
import { faceArrow, BACK } from './faceArrow.js';
import { t } from './text.js';
import { freshTaps } from './freshTap.js';

const HINTS = {
  meaning: 'recall.tapMeaning',
  pinyin: 'recall.tapReading',
};

function paragraph(className, text) {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  return element;
}

// cardFace: the element that shows the card (see index.html)
//
// Returns { start, stop }.
export function createRecallCard(cardFace) {
  // What the card on screen needs; null when this kind of card isn't showing.
  let current = null;
  let revealed = false;
  // The tap that showed the answer is not also the tap that moves on
  // (freshTap.js).
  const taps = freshTaps(cardFace);

  // Shows the answer under the word.
  function showAnswer() {
    const { word, reading } = current;
    const described = describeReading(reading);
    const pinyin = [paragraph('face-pinyin', described.main)];
    if (described.other) {
      pinyin.push(paragraph('face-hint', described.other));
    }
    const meaning = paragraph('face-meaning', word.definition);
    // Always the word, its pinyin, its meaning, as on the word's page and
    // the other cards (tester 4, 2026-10-21; the owner, 2026-10-22). Until
    // then the thing asked for came first.
    cardFace.replaceChildren(cardFace.firstElementChild, ...pinyin, meaning);
    current.onAnswerShown?.();
  }

  function reveal() {
    revealed = true;
    taps.mark();
    showAnswer();
    current.onReveal();
  }

  // "pointerup" fires when a finger, stylus or mouse button is lifted.
  cardFace.addEventListener('pointerup', () => {
    if (!current) {
      return;
    }
    if (!revealed) {
      reveal();
    } else if (taps.isFresh()) {
      current.onContinue();
    }
  });

  return {
    // Shows a card.
    //
    // options:
    //   word:    the word record
    //   script:  'traditional' or 'simplified'
    //   ask:     'meaning' or 'pinyin'
    //   reading: which reading to show (from readingsFor in tones.js)
    //   showReading: true to show the reading under the word before the
    //            answer (a meaning card for a word whose characters have
    //            another reading among the learner's words)
    //   onReveal():   the answer was shown
    //   onContinue(): the card was tapped again after the answer was shown
    //   onAnswerShown(): optional; the answer was put on the face (each time,
    //                 also after update()), so more can be added under it
    //   backToCard(): optional; a ‹ arrow on the face, until the answer is
    //                 shown, goes back to the card before (Review). Showing
    //                 the answer refills the face, which takes it away.
    start(options) {
      current = options;
      revealed = false;
      const text = options.word[options.script];
      // A sentence is shown smaller than a word, so that it fits.
      const wordElement = paragraph(Array.from(text).length > 6 ? 'face-word long' : 'face-word', text);
      // Tells the browser which regional font to use for the characters.
      wordElement.lang = options.script === 'traditional' ? 'zh-Hant-TW' : 'zh-Hans-CN';
      const reading = options.showReading ? [paragraph('face-pinyin', describeReading(options.reading).main)] : [];
      cardFace.replaceChildren(wordElement, ...reading, paragraph('face-hint', t(HINTS[options.ask])));
      if (options.backToCard) {
        const back = faceArrow('recall-back-button', t('write.backToCard'), BACK);
        back.addEventListener('click', () => options.backToCard());
        cardFace.append(back);
      }
    },

    // The word's meaning was corrected while its card is showing.
    update(word) {
      if (current) {
        current.word = word;
        if (revealed) {
          showAnswer();
        }
      }
    },

    stop() {
      current = null;
    },
  };
}
