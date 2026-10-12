// The only file that talks to Hanzi Writer. The rest of the app calls
// createQuiz() and gets plain numbers back through the handlers, so it never
// needs to know how Hanzi Writer works.

import HanziWriter from 'hanzi-writer';
import { getCharData } from './charData.js';

// After this many wrong attempts at one stroke, the correct stroke flashes as a hint.
const HINT_AFTER_MISSES = 3;

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

  const writer = HanziWriter.create(target, char, {
    width: size,
    height: size,
    padding: size * 0.06,
    showCharacter: false,
    showOutline: false,
    strokeColor: '#222222',
    outlineColor: '#d8d3c7',
    drawingColor: '#3b6fb6',
    highlightColor: '#3b9c5a',
    drawingWidth: Math.max(4, size / 40),
    // Tells Hanzi Writer to use our bundled data instead of fetching from its CDN.
    charDataLoader: (requestedChar, onLoad) => onLoad(getCharData(requestedChar)),
  });

  function start() {
    handlers.onStart({ totalStrokes });
    // quiz() also cancels any quiz in progress and clears the drawn strokes.
    writer.quiz({
      showHintAfterMisses: HINT_AFTER_MISSES,
      onCorrectStroke: (stroke) => {
        handlers.onProgress({
          // stroke.strokeNum counts from 0
          strokesDone: stroke.strokeNum + 1,
          totalStrokes,
          totalMistakes: stroke.totalMistakes,
        });
      },
      onMistake: (stroke) => {
        handlers.onProgress({
          strokesDone: stroke.strokeNum,
          totalStrokes,
          totalMistakes: stroke.totalMistakes,
        });
      },
      onComplete: (summary) => {
        handlers.onComplete({ totalMistakes: summary.totalMistakes });
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
    animate() {
      writer.cancelQuiz();
      handlers.onAnimateStart();
      writer.animateCharacter({ onComplete: start });
    },
  };
}
