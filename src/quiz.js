// The only file that talks to Hanzi Writer. The rest of the app calls
// createQuiz() and gets plain numbers back through the handlers, so it never
// needs to know how Hanzi Writer works.
//
// "Raw squigs": Hanzi Writer normally replaces each correct stroke with the
// printed stroke. Here the printed strokes are kept invisible during the quiz
// and the strokes you actually drew are kept on screen instead. When the
// character is finished, the printed character appears underneath in a light
// color so you can compare.

import HanziWriter from 'hanzi-writer';
import { loadCharData } from './charData.js';
import { isShortcutStroke } from './shortcuts.js';
import {
  fitsStroke,
  distanceFromStroke,
  remainingInOtherOrder,
  isStandardOrder,
} from './strokeMatch.js';

// After this many wrong attempts at one stroke, the correct stroke flashes as a hint.
const HINT_AFTER_MISSES = 3;

// How forgiving the grading is. 1 is Hanzi Writer's default; higher accepts
// strokes that are further from the reference in position, shape and length.
const LENIENCY = 1.5;

// The Animate button: how fast each stroke is drawn (1 is Hanzi Writer's
// default speed), and how long it waits between strokes, in milliseconds
// (Hanzi Writer's default is 1000).
const STROKE_ANIMATION_SPEED = 1;
const PAUSE_BETWEEN_STROKES_MS = 300;
// How long the finished character stays on screen after the animation,
// before the quiz starts again.
const PAUSE_AFTER_ANIMATION_MS = 1500;

const INK_COLOR = '#222222';
const INVISIBLE = 'rgba(0, 0, 0, 0)';
// The printed character shown under your handwriting once you finish: green,
// or red if the character was judged as missed.
const REFERENCE_COLOR = '#a9d4b8';
const REFERENCE_COLOR_MISSED = '#ecb3a7';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

// target:   the <svg> element to draw into
// size:     width and height of the writing area in pixels
// handlers: functions called as the quiz progresses
//   onStart({ totalStrokes })
//   onProgress({ strokesDone, totalStrokes, totalMistakes })
//   onComplete({ totalMistakes, hintShown, order })
//       order is 'moe' or 'mainland' for a character with two accepted
//       stroke orders, saying which was written, and null for any other
//       may return false to say the character was missed, which turns the
//       printed character red instead of green
//   onAnimateStart()
//
// Returns an object with functions to control the quiz. Call showCharacter()
// to begin.
export function createQuiz(target, size, handlers) {
  const penWidth = Math.max(4, size / 40);

  // One Hanzi Writer is created for the first character and then reused for
  // every later one. Each Hanzi Writer attaches its own touch listeners to the
  // writing area and never removes them, so making a new one per character
  // would pile them up.
  let writer = null;

  // The character being quizzed.
  let char = null;
  // Its stroke data as loaded, with the strokes in the standard order.
  let baseData = null;
  // The stroke data Hanzi Writer currently holds. Usually the same as
  // baseData; for a character being written in its second accepted order it
  // is a copy with the strokes rearranged (see switchOrder below).
  let charData = null;
  // All stroke numbers of baseData, in the order currently expected.
  let sequence = [];

  // We count mistakes ourselves rather than using Hanzi Writer's count, because
  // Hanzi Writer counts a shortcut stroke as a mistake before we recognize it.
  let mistakes = 0;
  // True once a correct stroke has been flashed as a hint for this character.
  let hintShown = false;

  let outlineVisible = false;

  // The timer for the pause after an animation, so it can be called off if
  // you move on before it runs out.
  let afterAnimationTimer = null;

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

  // Changes the color of the printed strokes immediately (no fade).
  // Hanzi Writer keeps a separate color for the strokes of the character's
  // radical (the 子 in 學), so both have to be set or the radical is left behind.
  //
  // Each change waits for the one before it to finish, so two requests made
  // close together can't end up half applied in the wrong order.
  let lastColorChange = Promise.resolve();
  function setPrintedColor(color) {
    lastColorChange = lastColorChange.then(async () => {
      await writer.updateColor('strokeColor', color, { duration: 0 });
      await writer.updateColor('radicalColor', color, { duration: 0 });
    });
    return lastColorChange;
  }

  function referenceColor(passed) {
    return passed === false ? REFERENCE_COLOR_MISSED : REFERENCE_COLOR;
  }

  function drewShortcut(stroke) {
    return isShortcutStroke(charData, stroke.strokeNum, stroke.drawnPath.points, LENIENCY);
  }

  // Hands Hanzi Writer a set of stroke data for the current character. It
  // fetches data through charDataLoader (see showCharacter), which returns
  // whatever charData is at that moment.
  async function giveWriter(data) {
    charData = data;
    await writer.setCharacter(char);
    // Setting a character rebuilds Hanzi Writer's layers. Later elements in an
    // SVG are drawn on top, so (re)adding ours puts your strokes above the
    // printed character. It also resets the outline to hidden.
    target.appendChild(squigLayer);
    if (outlineVisible) {
      writer.showOutline({ duration: 0 });
    }
  }

  // Goes back to the standard stroke order if the second one was in use.
  async function useStandardOrder() {
    if (!isStandardOrder(sequence)) {
      sequence = baseData.strokes.map((stroke, index) => index);
      await giveWriter(baseData);
    }
  }

  // ---- Two accepted stroke orders ----
  //
  // Some characters may be written in either of two orders (baseData.altOrder).
  // Hanzi Writer only knows one order at a time and grades strictly in
  // sequence. So when a stroke it rejects turns out to be the stroke the other
  // order expects at this point, we accept the stroke ourselves, hand Hanzi
  // Writer the same strokes rearranged into the other order, and resume the
  // quiz after the strokes already written. None of this is visible: your own
  // strokes stay on screen and the printed strokes are invisible until the end.

  // If the rejected stroke belongs to the other accepted order, returns the
  // strokes still to be written in that order. Otherwise returns null.
  function otherOrderFor(stroke) {
    const other = remainingInOtherOrder(sequence, stroke.strokeNum, baseData.altOrder);
    if (!other) {
      return null;
    }
    const points = stroke.drawnPath.points;
    const expectedMedian = baseData.medians[sequence[stroke.strokeNum]];
    const otherMedian = baseData.medians[other[0]];
    const fitsOther =
      fitsStroke(points, otherMedian, LENIENCY) &&
      distanceFromStroke(points, otherMedian) < distanceFromStroke(points, expectedMedian);
    return fitsOther ? other : null;
  }

  // Continues the quiz in the other order. `written` strokes are on the page.
  async function switchOrder(written, remainingInNewOrder) {
    const startedOn = char;
    sequence = [...sequence.slice(0, written - 1), ...remainingInNewOrder];
    const rearranged = {
      strokes: sequence.map((strokeNum) => baseData.strokes[strokeNum]),
      medians: sequence.map((strokeNum) => baseData.medians[strokeNum]),
    };
    // We are inside one of Hanzi Writer's own callbacks here. Waiting a moment
    // lets it finish what it was doing before its character is replaced.
    await Promise.resolve();
    await giveWriter(rearranged);
    if (char === startedOn) {
      runQuiz(written);
    }
  }

  // Starts (or restarts) the quiz for the current character, from a clean slate.
  async function start() {
    clearTimeout(afterAnimationTimer);
    squigLayer.replaceChildren();
    mistakes = 0;
    hintShown = false;
    handlers.onStart({ totalStrokes: baseData.strokes.length });
    await useStandardOrder();
    await setPrintedColor(INVISIBLE);
    target.appendChild(squigLayer);
    if (outlineVisible) {
      writer.showOutline({ duration: 0 });
    }
    runQuiz(0);
  }

  // Runs Hanzi Writer's quiz on charData, beginning at stroke `startAt`.
  function runQuiz(startAt) {
    const totalStrokes = charData.strokes.length;
    // quiz() also cancels any quiz in progress.
    writer.quiz({
      // Hanzi Writer remembers quiz options from one quiz to the next, so this
      // must be given every time, not only when resuming partway.
      quizStartStrokeNum: startAt,
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
      // Hanzi Writer rejected the stroke. It may still be a shortcut, or the
      // next stroke of the character's other accepted order.
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
        const otherOrder = otherOrderFor(stroke);
        if (otherOrder) {
          keepSquig(stroke.drawnPath.pathString);
          const written = stroke.strokeNum + 1;
          handlers.onProgress({ strokesDone: written, totalStrokes, totalMistakes: mistakes });
          switchOrder(written, otherOrder);
          return;
        }
        mistakes += 1;
        // mistakesOnStroke counts the misses on this one stroke, including this one.
        if (stroke.mistakesOnStroke >= HINT_AFTER_MISSES) {
          hintShown = true;
        }
        handlers.onProgress({
          strokesDone: stroke.strokeNum,
          totalStrokes,
          totalMistakes: mistakes,
        });
      },
      onComplete: () => {
        let order = null;
        if (baseData.altOrder) {
          order = isStandardOrder(sequence) ? 'moe' : 'mainland';
        }
        const passed = handlers.onComplete({ totalMistakes: mistakes, hintShown, order });
        setPrintedColor(referenceColor(passed));
      },
    });
  }

  return {
    // Switches to a character and starts quizzing it. `script` is
    // 'traditional' or 'simplified' and decides which form is drawn. Returns
    // false if there is no stroke data for the character.
    async showCharacter(newChar, script) {
      clearTimeout(afterAnimationTimer);
      const data = await loadCharData(newChar, script);
      if (!data) {
        return false;
      }
      char = newChar;
      baseData = data;
      charData = data;
      sequence = data.strokes.map((stroke, index) => index);

      if (!writer) {
        writer = HanziWriter.create(target, char, {
          width: size,
          height: size,
          padding: size * 0.06,
          showCharacter: false,
          showOutline: false,
          strokeColor: INVISIBLE,
          outlineColor: '#d8d3c7',
          // Same color and width as the kept strokes, so a stroke doesn't
          // visibly change at the moment it is accepted.
          drawingColor: INK_COLOR,
          drawingWidth: penWidth,
          highlightColor: '#3b9c5a',
          strokeAnimationSpeed: STROKE_ANIMATION_SPEED,
          delayBetweenStrokes: PAUSE_BETWEEN_STROKES_MS,
          // Tells Hanzi Writer to use our own data instead of fetching from
          // its CDN. We always load a character before asking Hanzi Writer to
          // show it, so the data it wants is the data we just loaded.
          charDataLoader: (requestedChar, onLoad) => onLoad(charData),
        });
      } else {
        await giveWriter(data);
      }

      await start();
      return true;
    },

    restart: start,

    setOutlineVisible(visible) {
      outlineVisible = visible;
      if (!writer) {
        return; // applied when the first character starts
      }
      if (visible) {
        writer.showOutline();
      } else {
        writer.hideOutline();
      }
    },

    // Ends the quiz and shows the printed character, as when it has been
    // written. Used when a character is skipped.
    async reveal() {
      clearTimeout(afterAnimationTimer);
      writer.cancelQuiz();
      await setPrintedColor(REFERENCE_COLOR);
      writer.showCharacter();
    },

    // Recolors the printed character of a finished quiz after its verdict
    // changed: red for missed (false), green otherwise.
    showVerdict(passed) {
      setPrintedColor(referenceColor(passed));
    },

    // Plays the stroke order, then starts the quiz again. For a character
    // with two accepted orders this always shows the standard one.
    async animate() {
      clearTimeout(afterAnimationTimer);
      writer.cancelQuiz();
      squigLayer.replaceChildren();
      handlers.onAnimateStart();
      await useStandardOrder();
      await writer.hideCharacter({ duration: 0 });
      await setPrintedColor(INK_COLOR);
      writer.animateCharacter({
        // The animation is canceled if you move to another character meanwhile.
        onComplete: (result) => {
          if (!result.canceled) {
            // Leave the finished character up for a moment before clearing it.
            afterAnimationTimer = setTimeout(start, PAUSE_AFTER_ANIMATION_MS);
          }
        },
      });
    },

    // Stops this quiz for good. Used when the writing area is rebuilt at a new size.
    destroy() {
      clearTimeout(afterAnimationTimer);
      if (writer) {
        writer.cancelQuiz();
      }
      squigLayer.remove();
    },
  };
}
