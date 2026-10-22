// A card already graded, looked back at from Review (the ‹ arrow; the
// owner, 2026-10-21: "the last 10 or so cards I've studied should be able
// to be kept and I should be able to go back and change my grading").
// This file only fills the card's face; review.js keeps the cards graded,
// shows the grades under the face, and saves a change.
//
// A writing card shows your raw input on each character as you wrote it
// (quiz.drawing), side by side, each in a square green or red like its box
// in the row of slots, and in a word of several characters a tap on one
// changes its verdict. The other kinds show the word, its reading and its
// meaning, as once answered.

import { faceArrow, BACK, FORWARD } from './faceArrow.js';
import { langFor } from './lang.js';
import { describeReading } from './tones.js';
import { t } from './text.js';

function paragraph(className, text) {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  return element;
}

// cardFace: the element that shows the card (index.html)
// card:     what to show:
//   type:     'writing', 'tone', 'meaning' or 'pinyin'
//   text:     the word or sentence, in the script it was studied in (not
//             used on a writing card, whose drawings say what was written)
//   script:   'traditional' or 'simplified'
//   reading:  the reading shown for it (readingsFor in tones.js)
//   meaning:  its meaning
//   drawings: on a writing card, each character written with a picture of
//             your strokes on it ({ char, picture }: an SVG element, or
//             undefined where it was skipped; wordFlow's drawings())
//   passedPerChar, skippedPerChar: on a writing card, each character's
//             verdict, and whether it was skipped
// actions:
//   onVerdict(index): a character's square was tapped (a word of several
//             characters only)
//   onBack():    the ‹ arrow; null where there is no card further back
//   onForward(): the › arrow
export function showPastCard(cardFace, card, { onVerdict, onBack, onForward }) {
  const parts = card.type === 'writing' ? [drawingsOf(card, onVerdict)] : answerOf(card);
  const back = faceArrow('past-back-button', t('write.backToCard'), BACK);
  back.classList.toggle('unavailable', !onBack);
  back.addEventListener('click', () => onBack?.());
  const forward = faceArrow('past-forward-button', t('past.onToCardAfter'), FORWARD);
  forward.addEventListener('click', onForward);
  cardFace.replaceChildren(...parts, back, forward);
}

// The squares, as many to a row as make a square of them (two for 2 to 4
// characters, three for 5 to 9, four for 10 to 16, and so on), so that all
// fit on the face, as big as it allows.
function drawingsOf(card, onVerdict) {
  const chars = card.drawings.map((drawing) => drawing.char);
  const grid = document.createElement('div');
  grid.className = 'past-drawings';
  const columns = Math.ceil(Math.sqrt(chars.length));
  grid.style.setProperty('--columns', String(columns));
  grid.classList.toggle('many', columns >= 4);
  const several = chars.length > 1;
  chars.forEach((char, index) => {
    const passed = card.passedPerChar?.[index];
    // A tap changes its verdict, as on its box while writing; a word of one
    // character has none of its own (its grade is its verdict).
    const square = document.createElement(several ? 'button' : 'div');
    square.className = 'past-square';
    if (several) {
      square.type = 'button';
      const label = t('write.slotTitle', { char, verdict: t(passed ? 'write.gotIt' : 'write.missed') });
      square.title = label;
      square.setAttribute('aria-label', label);
      // Not a tap on the card, which goes on.
      square.addEventListener('pointerup', (event) => event.stopPropagation());
      square.addEventListener('click', () => onVerdict(index));
    }
    if (passed !== undefined) {
      square.classList.add(passed ? 'passed' : 'missed');
    }
    square.classList.toggle('skipped', Boolean(card.skippedPerChar?.[index]));
    const { picture } = card.drawings[index];
    // A copy, so that the same picture can be shown again.
    const strokes = picture && picture.querySelector('.drawn-strokes path') ? picture.cloneNode(true) : null;
    if (strokes) {
      square.append(strokes);
    } else {
      // Skipped, or written without raw input: the character itself.
      const printed = document.createElement('span');
      printed.className = 'past-char';
      printed.textContent = char;
      square.append(printed);
    }
    // In the right regional font, and read out as Chinese.
    square.lang = langFor(card.script);
    grid.append(square);
  });
  return grid;
}

// The word with its reading and meaning, as on the card once answered.
function answerOf(card) {
  const word = paragraph(Array.from(card.text).length > 6 ? 'face-word long' : 'face-word', card.text);
  word.lang = langFor(card.script);
  const described = describeReading(card.reading);
  return [word, paragraph('face-pinyin', described.main), paragraph('face-meaning', card.meaning)];
}
