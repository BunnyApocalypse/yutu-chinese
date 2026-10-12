// The only file that talks to Hanzi Writer. The rest of the app calls
// createQuiz() and gets plain numbers back through the handlers, so it never
// needs to know how Hanzi Writer works.
//
// "Raw squigs": Hanzi Writer normally replaces each correct stroke with the
// printed stroke. Here the printed strokes are kept invisible during the quiz
// and the strokes you actually drew are kept on screen instead. When the
// character is finished, the printed character appears underneath in a light
// colour so you can compare.

import HanziWriter from 'hanzi-writer';
import { getCharData } from './charData.js';
import { isShortcutStroke } from './shortcuts.js';

// After this many wrong attempts at one stroke, the correct stroke flashes as a hint.
const HINT_AFTER_MISSES = 3;

// How forgiving the grading is. 1 is Hanzi Writer's default; higher accepts
// strokes that are further from the reference in position, shape and length.
const LENIENCY = 1.5;

const INK_COLOR = '#222222';
const INVISIBLE = 'rgba(0, 0, 0, 0)';
// The printed character shown under your handwriting once you finish.
const REFERENCE_COLOR = '#a9d4b8';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// target:   the <svg> element to draw into
// char:     the character to practise, e.g. '學'
// size:     width and height of the writing area in pixels
// handlers: functions called as the quiz progresses
//   onStart({ totalStrokes })
//   onProgress({ strokesDone, totalStrokes, totalMistakes })
//   onComplete({ totalMistakes })
//   onAnimateStart()
export function createQuiz(target, char, size, handlers) {
  const totalStrokes = getCharData(char).strokes.length;
  const penWidth = Math.max(4, size / 40);

  const writer = HanziWriter.create(target, char, {
    width: size,
    height: size,
    padding: size * 0.06,
    showCharacter: false,
    showOutline: false,
    strokeColor: INVISIBLE,
    outlineColor: '#d8d3c7',
    // Same colour and width as the kept strokes, so a stroke doesn't visibly
    // change at the moment it is accepted.
    drawingColor: INK_COLOR,
    drawingWidth: penWidth,
    highlightColor: '#3b9c5a',
    // Tells Hanzi Writer to use our bundled data instead of fetching from its CDN.
    charDataLoader: (requestedChar, onLoad) => onLoad(getCharData(requestedChar)),
  });

  // Our own layer for the strokes you drew.
  const squigLayer = document.createElementNS(SVG_NAMESPACE, 'g');
  squigLayer.setAttribute('class', 'squigs');

  // pathString is the stroke exactly as drawn, in the SVG's own pixel coordinates.
  function keepSquig(pathString) {
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', pathString);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', INK_COLOR);
    path.setAttribute('stroke-width', penWidth);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    squigLayer.appendChild(path);
  }

  // Changes the colour of the printed strokes immediately (no fade).
  // Hanzi Writer keeps a separate colour for the strokes of the character's
  // radical (the 子 in 學), so both have to be set or the radical is left behind.
  async function setPrintedColor(color) {
    await writer.updateColor('strokeColor', color, { duration: 0 });
    await writer.updateColor('radicalColor', color, { duration: 0 });
  }

  // We count mistakes ourselves rather than using Hanzi Writer's count, because
  // Hanzi Writer counts a shortcut stroke as a mistake before we recognise it.
  let mistakes = 0;

  function drewShortcut(stroke) {
    return isShortcutStroke(char, stroke.strokeNum, stroke.drawnPath.points, LENIENCY);
  }

  async function start() {
    squigLayer.replaceChildren();
    mistakes = 0;
    handlers.onStart({ totalStrokes });
    await setPrintedColor(INVISIBLE);
    // Later elements in an SVG are drawn on top. Hanzi Writer adds its own
    // layers once the character data has loaded, which has happened by now, so
    // (re)adding ours here puts your strokes above the printed character.
    target.appendChild(squigLayer);
    // quiz() also cancels any quiz in progress.
    writer.quiz({
      showHintAfterMisses: HINT_AFTER_MISSES,
      leniency: LENIENCY,
      // Hanzi Writer would otherwise flash the printed character when you finish.
      highlightOnComplete: false,
      // Hanzi Writer accepted the stroke as the textbook stroke.
      onCorrectStroke: (stroke) => {
        keepSquig(stroke.drawnPath.pathString);
        let strokesDone = stroke.strokeNum + 1; // strokeNum counts from 0
        // A shortcut stroke can occasionally also pass as its first half. Then
        // the second half is already on the page, so move past it too.
        if (drewShortcut(stroke)) {
          strokesDone += 1;
          writer.skipQuizStroke();
        }
        handlers.onProgress({ strokesDone, totalStrokes, totalMistakes: mistakes });
      },
      // Hanzi Writer rejected the stroke. It may still be a shortcut.
      onMistake: (stroke) => {
        if (drewShortcut(stroke)) {
          keepSquig(stroke.drawnPath.pathString);
          handlers.onProgress({
            strokesDone: stroke.strokeNum + 2,
            totalStrokes,
            totalMistakes: mistakes,
          });
          // One drawn stroke covered two textbook strokes.
          writer.skipQuizStroke();
          writer.skipQuizStroke();
          return;
        }
        mistakes += 1;
        handlers.onProgress({
          strokesDone: stroke.strokeNum,
          totalStrokes,
          totalMistakes: mistakes,
        });
      },
      onComplete: () => {
        setPrintedColor(REFERENCE_COLOR);
        handlers.onComplete({ totalMistakes: mistakes });
      },
    });
  }

  start();

  return {
    restart: start,

    setOutlineVisible(visible) {
      if (visible) {
        writer.showOutline();
      } else {
        writer.hideOutline();
      }
    },

    // Plays the correct stroke order, then starts the quiz again.
    async animate() {
      writer.cancelQuiz();
      squigLayer.replaceChildren();
      handlers.onAnimateStart();
      await writer.hideCharacter({ duration: 0 });
      await setPrintedColor(INK_COLOR);
      writer.animateCharacter({ onComplete: start });
    },
  };
}
