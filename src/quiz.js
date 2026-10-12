// The only file that talks to Hanzi Writer. The rest of the app calls
// createQuiz() and gets plain numbers back through the handlers, so it never
// needs to know how Hanzi Writer works.
//
// There are two ways of showing what you write, chosen by a setting:
//
// "Raw squigs": the strokes you actually drew are kept on screen, and the
// printed strokes stay invisible during the quiz. When the character is
// finished, the printed character appears underneath in a light color so you
// can compare.
//
// "Snap to print": each correct stroke is replaced by the printed stroke, as
// Hanzi Writer does on its own, so the character builds up neatly.

import HanziWriter from 'hanzi-writer';
import { loadCharData } from './charData.js';
import { isShortcutStroke, joinedLine } from './shortcuts.js';
import { fitFrame, applyFrame, framesDiffer, NO_FRAME } from './frame.js';
import { toPoints, resample, averageDistance } from './lines.js';
import {
  fitsStroke,
  distanceFromStroke,
  shapeDifferenceFromStroke,
  remainingInOtherOrder,
  lastSyncPoint,
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

// Nothing shows where a character will be until its first stroke is written,
// so the first stroke may land anywhere, at any reasonable size: only its
// shape has to be right. When we check a first stroke ourselves, the leniency
// about position is multiplied by this, which in effect switches it off.
const FIRST_STROKE_EXTRA_LENIENCY = 4;

// A stroke Hanzi Writer has accepted is still re-read as the other stroke
// order if that fits clearly better: the misfit (average distance, in the
// data's units) must be below this share of the current reading's, and lower
// by at least this much.
const OTHER_ORDER_MISFIT_SHARE = 0.6;
const OTHER_ORDER_MISFIT_MARGIN = 15;

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
  // The stroke data Hanzi Writer currently holds: baseData with its strokes
  // in the order being written (`sequence`) and moved to where the character
  // is being written (`frame`). Usually that is baseData itself.
  let charData = null;
  // All stroke numbers of baseData, in the order currently expected.
  let sequence = [];
  // Where and how big the character is being written (see frame.js), and
  // baseData moved into that frame.
  let frame = NO_FRAME;
  let framedData = null;
  // The strokes accepted so far. For each:
  //   position:    how many strokes had been written before it
  //   strokeCount: how many textbook strokes it covered (2 for a joined stroke)
  //   reference:   the middle line of the textbook stroke(s) it was taken for
  //   drawn:       the points as drawn
  let acceptedStrokes = [];

  // We count mistakes ourselves rather than using Hanzi Writer's count, because
  // Hanzi Writer counts a shortcut stroke as a mistake before we recognize it.
  let mistakes = 0;
  // True once a correct stroke has been flashed as a hint for this character.
  let hintShown = false;

  let outlineVisible = false;

  // True for raw squigs, false for snapping to the printed strokes. Set with
  // each character (see showCharacter).
  let rawSquigs = true;

  // The timer for the pause after an animation, so it can be called off if
  // you move on before it runs out.
  let afterAnimationTimer = null;

  // While Hanzi Writer is being handed stroke data (at the start of a
  // character, and when the order or frame changes partway), a stroke drawn
  // would be lost. That takes a few hundredths of a second, too short for a
  // hand to notice. The writing area carries a `data-busy` attribute for as
  // long as it lasts, so that the browser tests (tests/browser/), which draw
  // much faster than a hand, know when the next stroke can be drawn.
  let busyCount = 0;
  function setBusy(isBusy) {
    busyCount += isBusy ? 1 : -1;
    target.toggleAttribute('data-busy', busyCount > 0);
  }

  // Our own layer for the strokes you drew.
  const squigLayer = document.createElementNS(SVG_NAMESPACE, 'g');
  squigLayer.setAttribute('class', 'squigs');

  // pathString is the stroke exactly as drawn, in the SVG's own pixel coordinates.
  function keepSquig(pathString) {
    if (!rawSquigs) {
      return; // the printed stroke is shown instead
    }
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

  // The color of the printed strokes while the character is being written:
  // invisible under your own strokes, or plain ink when they stand in for them.
  function colorWhileWriting() {
    return rawSquigs ? INVISIBLE : INK_COLOR;
  }

  // The color of the printed character once it is finished. With raw squigs
  // it is the light reference under your handwriting, green or red. Without,
  // it is the character itself, and only turns red if it was missed.
  function referenceColor(passed) {
    if (passed === false) {
      return REFERENCE_COLOR_MISSED;
    }
    return rawSquigs ? REFERENCE_COLOR : INK_COLOR;
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

  // Builds the stroke data for Hanzi Writer from the current order and frame.
  function currentData() {
    if (isStandardOrder(sequence)) {
      return framedData;
    }
    return {
      strokes: sequence.map((strokeNum) => framedData.strokes[strokeNum]),
      medians: sequence.map((strokeNum) => framedData.medians[strokeNum]),
    };
  }

  // Hands Hanzi Writer the stroke data for the current order and frame, and
  // carries on with the quiz after the `written` strokes already on the page.
  // None of this is visible: your own strokes stay on screen and the printed
  // strokes are invisible until the end.
  async function resume(written) {
    const startedOn = char;
    const data = currentData();
    setBusy(true);
    try {
      // We are usually inside one of Hanzi Writer's own callbacks here. Waiting
      // a moment lets it finish what it was doing before its character is replaced.
      await Promise.resolve();
      await giveWriter(data);
      if (char === startedOn) {
        runQuiz(written);
      }
    } finally {
      setBusy(false);
    }
  }

  // Goes back to the centered character in the standard stroke order, if it
  // had been moved or rearranged.
  async function useOriginalData() {
    const changed = !isStandardOrder(sequence) || frame !== NO_FRAME;
    sequence = baseData.strokes.map((stroke, index) => index);
    frame = NO_FRAME;
    framedData = baseData;
    acceptedStrokes = [];
    if (changed) {
      await giveWriter(baseData);
    }
  }

  // ---- Following where the character is written ----
  //
  // The reference is invisible, so you choose where to write and how big. Each
  // accepted stroke tells us more about that. We fit a frame to the strokes
  // so far (frame.js) and move the reference into it, so the remaining strokes
  // are expected where you will naturally put them.

  // Notes an accepted stroke. `position` is how many strokes had been written
  // before it; `baseStrokes` are the stroke numbers of baseData it covers:
  // one, or two for a joined stroke.
  function noteAccepted(position, baseStrokes, drawnPoints) {
    const reference =
      baseStrokes.length === 1
        ? toPoints(baseData.medians[baseStrokes[0]])
        : joinedLine({ medians: baseStrokes.map((strokeNum) => baseData.medians[strokeNum]) }, 0);
    acceptedStrokes.push({
      position,
      strokeCount: baseStrokes.length,
      reference,
      drawn: drawnPoints,
    });
  }

  // The two textbook strokes at `position` and after it, as they are in
  // baseData (not moved into the frame), in the form joinedLine wants.
  function framelessPair(position) {
    return {
      medians: [baseData.medians[sequence[position]], baseData.medians[sequence[position + 1]]],
    };
  }

  // The reference is only moved while it is invisible. With the outline
  // showing you are tracing a visible reference, which must stay where it is.
  // The same goes for printed strokes that have already snapped into place.
  function canFollow() {
    return rawSquigs && !outlineVisible;
  }

  // Refits the frame to the accepted strokes. Returns true if it changed
  // enough that Hanzi Writer needs the moved data.
  function refitFrame() {
    if (!canFollow()) {
      return false;
    }
    const fitted = fitFrame(acceptedStrokes);
    if (!framesDiffer(fitted, frame)) {
      return false;
    }
    frame = fitted;
    framedData = applyFrame(baseData, frame);
    return true;
  }

  // ---- Two accepted stroke orders ----
  //
  // Some characters may be written in either of two orders (baseData.altOrder).
  // Hanzi Writer only knows one order at a time and grades strictly in
  // sequence. So when a stroke it rejects turns out to be the stroke the other
  // order expects at this point, we accept the stroke ourselves, hand Hanzi
  // Writer the same strokes rearranged into the other order, and resume the
  // quiz after the strokes already written.

  // What it would mean to read the stroke just drawn, and those before it, as
  // the other accepted order. Returns null if there is no other order to
  // consider here; otherwise:
  //   sequence:  all strokes in the order that reading implies
  //   accepted:  the accepted strokes, with those written since the two orders
  //              last agreed re-read as the other order's strokes
  //   sinceSync: how many accepted strokes that re-reading covers
  //   strokeNum: the stroke the one just drawn would be
  function otherReadingOf(stroke) {
    const { altOrder } = baseData;
    const position = stroke.strokeNum;
    // Not at the last stroke: by then there is nothing left to tell the
    // orders apart, and the quiz is about to end.
    if (!altOrder || position >= baseData.strokes.length - 1) {
      return null;
    }
    const syncAt = lastSyncPoint(sequence, position, altOrder);
    const other = remainingInOtherOrder(sequence, syncAt, altOrder);
    if (!other) {
      return null;
    }
    const sinceSync = acceptedStrokes.filter((entry) => entry.position >= syncAt);
    // A joined stroke among them is too much to untangle.
    if (sinceSync.some((entry) => entry.strokeCount !== 1)) {
      return null;
    }
    return {
      sequence: [...sequence.slice(0, syncAt), ...other],
      accepted: [
        ...acceptedStrokes.filter((entry) => entry.position < syncAt),
        ...sinceSync.map((entry) => ({
          ...entry,
          reference: toPoints(baseData.medians[other[entry.position - syncAt]]),
        })),
      ],
      sinceSync: sinceSync.length,
      strokeNum: other[position - syncAt],
    };
  }

  // A line of points moved into a frame.
  function moved(points, intoFrame) {
    return points.map((point) => ({
      x: intoFrame.scale * point.x + intoFrame.dx,
      y: intoFrame.scale * point.y + intoFrame.dy,
    }));
  }

  // If the rejected stroke makes sense as the other accepted order, returns
  // how to carry on in that order (see otherReadingOf, plus the `frame` that
  // reading implies). Otherwise returns null.
  //
  // The simple case is a stroke at the point where the two orders part ways.
  // The harder case is one stroke later. Where the two orders start with
  // similar strokes side by side (學 starts with a ノ either way, one in the
  // middle and one at the left), the first stroke is accepted in the standard
  // order wherever it is written, because the reference is invisible and
  // Hanzi Writer is forgiving about where a character starts. Only the next
  // stroke shows which order was meant. So here we ask: if the strokes since
  // the orders last agreed are read as the *other* order's strokes, does
  // everything fit, including the one just drawn?
  function otherOrderFor(stroke) {
    const reading = otherReadingOf(stroke);
    if (!reading) {
      return null;
    }
    const points = stroke.drawnPath.points;
    // Read differently, the strokes say something different about where the
    // character is being written.
    const otherFrame = reading.sinceSync > 0 && canFollow() ? fitFrame(reading.accepted) : frame;
    const fits = (drawn, reference, leniency, isFirstStroke = false) =>
      // fitsStroke takes a middle line as [x, y] pairs.
      fitsStroke(
        drawn,
        moved(reference, otherFrame).map((point) => [point.x, point.y]),
        leniency,
        isFirstStroke,
      );

    // With nothing written yet, nobody knows where the character will be.
    const nothingWritten = acceptedStrokes.length === 0 && canFollow();
    const leniency = nothingWritten ? LENIENCY * FIRST_STROKE_EXTRA_LENIENCY : LENIENCY;
    const reference = toPoints(baseData.medians[reading.strokeNum]);
    if (!fits(points, reference, leniency, nothingWritten)) {
      return null;
    }
    if (reading.sinceSync === 0) {
      // At the parting of the ways: it must fit the other order's stroke
      // better than the one that was expected.
      const expectedMedian = framedData.medians[sequence[stroke.strokeNum]];
      if (nothingWritten) {
        // Where the first stroke lands says nothing about which stroke it is
        // (written small in a corner, it may be nearer the wrong one). So if
        // it could be the expected stroke as well, go by shape alone.
        const otherMedian = baseData.medians[reading.strokeNum];
        if (
          fitsStroke(points, expectedMedian, leniency, true) &&
          shapeDifferenceFromStroke(points, otherMedian) >=
            shapeDifferenceFromStroke(points, expectedMedian)
        ) {
          return null;
        }
      } else {
        const fromOther = averageDistance(resample(points), resample(moved(reference, otherFrame)));
        if (fromOther >= distanceFromStroke(points, expectedMedian)) {
          return null;
        }
      }
    } else {
      // Each earlier stroke must make sense in the other order too.
      const earlier = reading.accepted.slice(-reading.sinceSync);
      if (!earlier.every((entry) => fits(entry.drawn, entry.reference, LENIENCY))) {
        return null;
      }
    }
    return { ...reading, frame: otherFrame };
  }

  // For a stroke Hanzi Writer has accepted: returns how to carry on in the
  // other order if reading the strokes that way fits clearly better, otherwise
  // null. `currentReference` is the middle line the stroke was accepted as.
  //
  // This catches what a rejection can't. Written to the right, the left-hand
  // 丨 of 學 lands on the 爻 and passes for one of its strokes, although as the
  // 丨 of the other order it fits far better.
  function otherOrderBeats(stroke, currentReference) {
    const reading = otherReadingOf(stroke);
    if (!reading) {
      return null;
    }
    const drawn = stroke.drawnPath.points;
    const currentPairs = [...acceptedStrokes, { reference: currentReference, drawn }];
    const otherPairs = [
      ...reading.accepted,
      { reference: toPoints(baseData.medians[reading.strokeNum]), drawn },
    ];
    // Each reading gets the frame that suits it best, then we see how well
    // the strokes in question sit on their references.
    const frameFor = (pairs) => (canFollow() ? fitFrame(pairs) : frame);
    const misfit = (pairs) => {
      const pairFrame = frameFor(pairs);
      const inQuestion = pairs.slice(-(reading.sinceSync + 1));
      const distances = inQuestion.map((pair) =>
        averageDistance(resample(pair.drawn), resample(moved(pair.reference, pairFrame))),
      );
      return distances.reduce((sum, distance) => sum + distance, 0) / distances.length;
    };
    const current = misfit(currentPairs);
    const other = misfit(otherPairs);
    const clearlyBetter =
      other < current * OTHER_ORDER_MISFIT_SHARE && current - other > OTHER_ORDER_MISFIT_MARGIN;
    return clearlyBetter ? { ...reading, frame: frameFor(otherPairs) } : null;
  }

  // True if the rejected stroke is the first stroke of the character in every
  // way except where it was written.
  function isFirstStrokeAnywhere(stroke) {
    return (
      stroke.strokeNum === 0 &&
      acceptedStrokes.length === 0 &&
      canFollow() &&
      fitsStroke(
        stroke.drawnPath.points,
        baseData.medians[sequence[0]],
        LENIENCY * FIRST_STROKE_EXTRA_LENIENCY,
        true,
      )
    );
  }

  // Carries on in the other stroke order, with the strokes so far read that
  // way. `reading` comes from otherOrderFor or otherOrderBeats.
  function switchToOtherOrder(stroke, reading, totalStrokes) {
    const written = stroke.strokeNum + 1;
    sequence = reading.sequence;
    acceptedStrokes = reading.accepted;
    if (reading.frame !== frame) {
      frame = reading.frame;
      framedData = applyFrame(baseData, frame);
    }
    noteAccepted(stroke.strokeNum, [reading.strokeNum], stroke.drawnPath.points);
    refitFrame();
    handlers.onProgress({ strokesDone: written, totalStrokes, totalMistakes: mistakes });
    // This never happens at the last stroke, so there is always more to come.
    resume(written);
  }

  // Starts (or restarts) the quiz for the current character, from a clean slate.
  async function start() {
    clearTimeout(afterAnimationTimer);
    squigLayer.replaceChildren();
    mistakes = 0;
    hintShown = false;
    handlers.onStart({ totalStrokes: baseData.strokes.length });
    setBusy(true);
    try {
      await useOriginalData();
      await setPrintedColor(colorWhileWriting());
      target.appendChild(squigLayer);
      if (outlineVisible) {
        writer.showOutline({ duration: 0 });
      }
      runQuiz(0);
    } finally {
      setBusy(false);
    }
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
        const baseStrokes = [sequence[stroke.strokeNum]];
        let strokesDone = stroke.strokeNum + 1; // strokeNum counts from 0
        const isShortcut = drewShortcut(stroke);
        // Accepted, but does it fit the other stroke order clearly better?
        const otherReading = otherOrderBeats(
          stroke,
          isShortcut
            ? joinedLine(framelessPair(stroke.strokeNum), 0)
            : toPoints(baseData.medians[sequence[stroke.strokeNum]]),
        );
        if (otherReading) {
          switchToOtherOrder(stroke, otherReading, totalStrokes);
          return;
        }
        // A shortcut stroke can occasionally also pass as its first half. Then
        // the second half is already on the page, so move past it too.
        if (isShortcut) {
          baseStrokes.push(sequence[stroke.strokeNum + 1]);
          strokesDone += 1;
          writer.skipQuizStroke();
        }
        noteAccepted(stroke.strokeNum, baseStrokes, stroke.drawnPath.points);
        handlers.onProgress({ strokesDone, totalStrokes, totalMistakes: mistakes });
        // Unless that was the last stroke, see whether the frame has moved.
        if (strokesDone < totalStrokes && refitFrame()) {
          resume(strokesDone);
        }
      },
      // Hanzi Writer rejected the stroke. It may still be a shortcut, or the
      // next stroke of the character's other accepted order.
      onMistake: (stroke) => {
        if (drewShortcut(stroke)) {
          keepSquig(stroke.drawnPath.pathString);
          noteAccepted(
            stroke.strokeNum,
            [sequence[stroke.strokeNum], sequence[stroke.strokeNum + 1]],
            stroke.drawnPath.points,
          );
          const strokesDone = stroke.strokeNum + 2;
          handlers.onProgress({ strokesDone, totalStrokes, totalMistakes: mistakes });
          // One drawn stroke covered two textbook strokes.
          writer.skipQuizStroke();
          writer.skipQuizStroke();
          if (strokesDone < totalStrokes && refitFrame()) {
            resume(strokesDone);
          }
          return;
        }
        const otherReading = otherOrderFor(stroke);
        if (otherReading) {
          keepSquig(stroke.drawnPath.pathString);
          switchToOtherOrder(stroke, otherReading, totalStrokes);
          return;
        }
        // The first stroke of all, in the right shape but further from the
        // centered reference than Hanzi Writer allows: accept it, and let the
        // frame follow it.
        if (isFirstStrokeAnywhere(stroke)) {
          keepSquig(stroke.drawnPath.pathString);
          noteAccepted(0, [sequence[0]], stroke.drawnPath.points);
          handlers.onProgress({ strokesDone: 1, totalStrokes, totalMistakes: mistakes });
          writer.skipQuizStroke();
          if (totalStrokes > 1 && refitFrame()) {
            resume(1);
          }
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
    // 'traditional' or 'simplified' and decides which form is drawn.
    // `useRawSquigs` chooses between keeping your own strokes on screen
    // (true) and snapping to the printed strokes (false). Returns false if
    // there is no stroke data for the character.
    async showCharacter(newChar, script, useRawSquigs) {
      clearTimeout(afterAnimationTimer);
      const data = await loadCharData(newChar, script);
      if (!data) {
        return false;
      }
      char = newChar;
      rawSquigs = useRawSquigs;
      baseData = data;
      charData = data;
      sequence = data.strokes.map((stroke, index) => index);
      frame = NO_FRAME;
      framedData = data;
      acceptedStrokes = [];

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
      await setPrintedColor(referenceColor(true));
      writer.showCharacter();
    },

    // Recolors the printed character of a finished quiz after its verdict
    // changed: red for missed (false), green otherwise.
    showVerdict(passed) {
      setPrintedColor(referenceColor(passed));
    },

    // Plays the stroke order, then starts the quiz again. This always shows
    // the centered character in the standard order.
    async animate() {
      clearTimeout(afterAnimationTimer);
      writer.cancelQuiz();
      squigLayer.replaceChildren();
      handlers.onAnimateStart();
      await useOriginalData();
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
