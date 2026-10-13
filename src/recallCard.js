// Meaning and pinyin cards: you see the word, recall its meaning or its
// reading, tap to see the answer, and grade yourself.

import { describeReading } from './tones.js';

// A tap right after the answer appears is probably the same tap that revealed
// it; ignore taps for this long.
const TAP_TO_CONTINUE_DELAY_MS = 600;

const HINTS = {
  meaning: 'Tap to show the meaning',
  pinyin: 'Tap to show the reading',
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
  let tapAllowedFrom = 0;

  // Shows the answer under the word.
  function showAnswer() {
    const { word, ask, reading } = current;
    const described = describeReading(reading);
    const pinyin = [paragraph('face-pinyin', described.main)];
    if (described.other) {
      pinyin.push(paragraph('face-hint', described.other));
    }
    const meaning = paragraph('face-meaning', word.definition);
    // The word stays at the top; the thing that was asked for comes first.
    cardFace.replaceChildren(
      cardFace.firstElementChild,
      ...(ask === 'meaning' ? [meaning, ...pinyin] : [...pinyin, meaning]),
    );
  }

  function reveal() {
    revealed = true;
    tapAllowedFrom = Date.now() + TAP_TO_CONTINUE_DELAY_MS;
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
    } else if (Date.now() >= tapAllowedFrom) {
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
    //   onReveal():   the answer was shown
    //   onContinue(): the card was tapped again after the answer was shown
    start(options) {
      current = options;
      revealed = false;
      const text = options.word[options.script];
      const wordElement = paragraph('face-word', text);
      // Tells the browser which regional font to use for the characters.
      wordElement.lang = options.script === 'traditional' ? 'zh-Hant-TW' : 'zh-Hans-CN';
      cardFace.replaceChildren(wordElement, paragraph('face-hint', HINTS[options.ask]));
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
