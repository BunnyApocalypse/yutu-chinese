// The only file that talks to Hanzi Writer. The rest of the app calls
// createQuiz() and gets plain numbers back through the handlers, so it never
// needs to know how Hanzi Writer works.
//
// There are two ways of showing what you write, chosen by a setting:
//
// "Raw input": the strokes you actually drew are kept on screen, and the
// printed strokes stay invisible during the quiz. When the character is
// finished, the printed character appears underneath in a light color so you
// can compare.
//
// "Snap to print": each correct stroke is replaced by the printed stroke, as
// Hanzi Writer does on its own, so the character builds up neatly.

import HanziWriter from 'hanzi-writer';
import { loadCharData } from './charData.js';
import { isShortcutStroke, joinedLine } from './shortcuts.js';
import {
  fitFrame,
  applyFrame,
  framesDiffer,
  sizeIsKnown,
  extentOf,
  zoomToFit,
  combineFrames,
  NO_FRAME,
} from './frame.js';
import { toPoints, resample, averageDistance } from './lines.js';
import { themeColor } from './theme.js';
import { describeSwipe, HOLD_MS, HOLD_STILLNESS_PX, isSwipeUp, risesSteeply } from './gestures.js';
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

// The colors, from the named colors in style.css. They differ between the
// light and the dark look (theme.js), so they are read each time they are
// used, and set again when the look changes (see 'theme-changed' below).
const ink = () => themeColor('--ink');
const INVISIBLE = 'rgba(0, 0, 0, 0)';
// The printed character shown under your handwriting once you finish: green,
// or red if the character was judged as missed.
const reference = () => themeColor('--reference');
const referenceMissed = () => themeColor('--reference-missed');
const referenceRetried = () => themeColor('--reference-retried');

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

// The empty margin around the character, as a share of the writing area's size.
const PADDING_SHARE = 0.06;

// target:   the <svg> element to draw into
// size:     width and height of the writing area in pixels
// handlers: functions called as the quiz progresses
//   onStart({ totalStrokes })
//   onProgress({ strokesDone, totalStrokes, totalMistakes })
//   onComplete({ totalMistakes, hintShown, order })
//       order is 'moe' or 'mainland' for a character with two accepted
//       stroke orders, saying which was written, and null for any other
//       may return false to say the character was missed, which turns the
//       printed character red instead of green, or 'retried' for right only
//       after starting again, which turns it amber
//   onAnimateStart()
//   onWipe()  a swipe up asked to start the character again (gestures.js);
//       the flow does what its Clear button does
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
  // The box around the character's printed strokes (see zoomToFit), and the
  // zoom applied so far to what has been written of it, for the browser tests.
  let extent = null;
  let zoomSoFar = NO_FRAME;
  // The strokes accepted so far. For each:
  //   position:    how many strokes had been written before it
  //   strokeCount: how many textbook strokes it covered (2 for a joined stroke)
  //   reference:   the middle line of the textbook stroke(s) it was taken for
  //   drawn:       the points as drawn
  let acceptedStrokes = [];

  // We count mistakes ourselves rather than using Hanzi Writer's count, because
  // Hanzi Writer counts a shortcut stroke as a mistake before we recognize it.
  let mistakes = 0;
  // True once a correct stroke has been flashed as a hint for this character,
  // after repeated misses or asked for with a long hold. The writing area
  // carries a `data-hint-shown` attribute meanwhile, for the browser tests.
  let hintShown = false;
  function noteHint(shown) {
    hintShown = shown;
    target.toggleAttribute('data-hint-shown', shown);
  }

  // True while a stroke can be written: a quiz is running and the character
  // is not finished. How many strokes are done counts textbook strokes, as
  // Hanzi Writer does (a joined stroke counts two).
  let writing = false;
  let strokesDone = 0;

  let outlineVisible = false;

  // True for raw input, false for snapping to the printed strokes. Set with
  // each character (see showCharacter).
  let rawInput = true;

  // The timer for the pause after an animation, so it can be called off if
  // you move on before it runs out.
  let afterAnimationTimer = null;

  // True while Animate plays, and while the finished character stays up
  // after it. A stroke begun then stops it and is written (catchStroke).
  let animating = false;
  // Settles once the quiz start() began is taking strokes.
  let quizReady = Promise.resolve();

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
  const drawnLayer = document.createElementNS(SVG_NAMESPACE, 'g');
  drawnLayer.setAttribute('class', 'drawn-strokes');

  // ---- Showing the next stroke ----
  //
  // In the lesson for a new word (see review.js) the stroke to write next is
  // shown over and over, in color, until it has been written; then the one
  // after it. Hanzi Writer can animate a stroke, but not while its quiz is
  // running, so this is drawn here, the way Hanzi Writer does it: a thick
  // line along the stroke's middle line, cut to the stroke's printed shape,
  // that grows from the stroke's start to its end. The growing and repeating
  // is done by the style sheet (.stroke-demo-line in style.css).
  let demoStrokes = false;
  const demoLayer = document.createElementNS(SVG_NAMESPACE, 'g');
  demoLayer.setAttribute('class', 'stroke-demo');
  // Where Hanzi Writer draws the character: stroke data is 1024 units across
  // with y running upward from -124, inside the padding given to Hanzi Writer.
  const padding = size * PADDING_SHARE;
  const unit = (size - 2 * padding) / 1024;
  demoLayer.setAttribute(
    'transform',
    `translate(${padding}, ${size - padding - 124 * unit}) scale(${unit}, ${-unit})`,
  );

  // Shows the stroke that comes after `strokesDone` strokes, or nothing if
  // this is switched off or the character is finished.
  function showDemo(strokesDone) {
    demoLayer.replaceChildren();
    if (!demoStrokes || strokesDone >= sequence.length) {
      return;
    }
    const strokeNum = sequence[strokesDone];
    // A clipPath is a shape that cuts whatever refers to it: here the
    // stroke's printed outline.
    const clip = document.createElementNS(SVG_NAMESPACE, 'clipPath');
    clip.id = 'stroke-demo-shape';
    const shape = document.createElementNS(SVG_NAMESPACE, 'path');
    shape.setAttribute('d', framedData.strokes[strokeNum]);
    clip.appendChild(shape);
    const line = document.createElementNS(SVG_NAMESPACE, 'path');
    line.setAttribute('d', `M ${framedData.medians[strokeNum].map(([x, y]) => `${x} ${y}`).join(' L ')}`);
    line.setAttribute('class', 'stroke-demo-line');
    line.setAttribute('clip-path', 'url(#stroke-demo-shape)');
    // Lets the style sheet treat the line as being of length 1, however long it is.
    line.setAttribute('pathLength', '1');
    demoLayer.append(clip, line);
  }

  // Tells the flow how far the character has got, and shows the next stroke.
  function reportProgress(progress) {
    strokesDone = progress.strokesDone;
    handlers.onProgress(progress);
    showDemo(progress.strokesDone);
  }

  // pathString is the stroke exactly as drawn, in the SVG's own pixel coordinates.
  function keepDrawnStroke(pathString) {
    if (!rawInput) {
      return; // the printed stroke is shown instead
    }
    const path = document.createElementNS(SVG_NAMESPACE, 'path');
    path.setAttribute('d', pathString);
    path.setAttribute('fill', 'none');
    // A style rather than a plain value, so that the stroke follows the
    // light or dark look by itself.
    path.style.stroke = 'var(--ink)';
    path.setAttribute('stroke-width', penWidth);
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    // The line keeps its width when the strokes are shrunk (zoomInk).
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    drawnLayer.appendChild(path);
  }

  // Changes the color of the printed strokes immediately (no fade).
  // Hanzi Writer keeps a separate color for the strokes of the character's
  // radical (the 子 in 學), so both have to be set or the radical is left behind.
  //
  // Each change waits for the one before it to finish, so two requests made
  // close together can't end up half applied in the wrong order.
  //
  // `colorOf` is a function giving the color, kept so that the color can be
  // worked out again when the look changes from light to dark or back.
  let lastColorChange = Promise.resolve();
  let printedColorOf = () => INVISIBLE;
  function setPrintedColor(colorOf) {
    printedColorOf = colorOf;
    const color = colorOf();
    lastColorChange = lastColorChange.then(async () => {
      await writer.updateColor('strokeColor', color, { duration: 0 });
      await writer.updateColor('radicalColor', color, { duration: 0 });
    });
    return lastColorChange;
  }

  // The look changed from light to dark or back (theme.js): Hanzi Writer
  // was given its colors as values, so it is given them again.
  document.addEventListener('theme-changed', () => {
    if (!writer) {
      return;
    }
    setPrintedColor(printedColorOf);
    lastColorChange = lastColorChange.then(async () => {
      await writer.updateColor('outlineColor', themeColor('--outline'), { duration: 0 });
      await writer.updateColor('drawingColor', ink(), { duration: 0 });
      await writer.updateColor('highlightColor', themeColor('--success'), { duration: 0 });
    });
  });

  // The color of the printed strokes while the character is being written:
  // invisible under your own strokes, or plain ink when they stand in for them.
  function colorWhileWriting() {
    return rawInput ? INVISIBLE : ink();
  }

  // The color of the printed character once it is finished. With raw input
  // it is the light reference under your handwriting, green or red. Without,
  // it is the character itself, and only turns red if it was missed.
  function referenceColor(passed) {
    if (passed === false) {
      return referenceMissed();
    }
    if (passed === 'retried') {
      return rawInput ? referenceRetried() : ink();
    }
    return rawInput ? reference() : ink();
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
    target.append(demoLayer, drawnLayer);
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
    noteZoom(NO_FRAME);
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
    return rawInput && !outlineVisible;
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
    useFrame(fitted);
    return true;
  }

  // Moves the reference into `newFrame`. If the whole character would no
  // longer fit in the writing area there, first zooms out: the strokes
  // written so far shrink on screen, and the frame and the strokes'
  // recorded points with them, so that everything stays as it was relative
  // to everything else (see zoomToFit in frame.js). Not before the size
  // being written is known: the first stroke says only where.
  function useFrame(newFrame) {
    frame = newFrame;
    const zoom = sizeIsKnown(acceptedStrokes) ? zoomToFit(extent, frame) : null;
    if (zoom) {
      frame = combineFrames(zoom, frame);
      acceptedStrokes = acceptedStrokes.map((entry) => ({ ...entry, drawn: moved(entry.drawn, zoom) }));
      zoomInk(zoom);
      noteZoom(combineFrames(zoom, zoomSoFar));
    }
    framedData = applyFrame(baseData, frame);
  }

  // Shrinks the strokes on screen as `zoom` shrinks the stroke data. The
  // strokes are on screen in pixels, and the data's units run upward from
  // -124 inside the padding (as for demoLayer above), so the zoom is turned
  // into pixels first. They are put into a group of their own, which slides
  // into place (.drawn-strokes > g in style.css); a later zoom puts that
  // group into another, so zooms add up.
  function zoomInk(zoom) {
    const top = size - padding - 124 * unit; // where y = 0 is, in pixels
    const shiftX = (1 - zoom.scale) * padding + unit * zoom.dx;
    const shiftY = (1 - zoom.scale) * top - unit * zoom.dy;
    const group = document.createElementNS(SVG_NAMESPACE, 'g');
    group.append(...drawnLayer.childNodes);
    drawnLayer.appendChild(group);
    // The browser must see the group unmoved before it is moved, or it
    // jumps instead of sliding. Asking for its style makes the browser
    // take note of it as it is.
    getComputedStyle(group).transform;
    group.style.transform = `matrix(${zoom.scale}, 0, 0, ${zoom.scale}, ${shiftX}, ${shiftY})`;
  }

  // Keeps the zoom so far on the writing area as `data-zoom` ("scale dx dy",
  // in the data's units), so that a browser test can write the rest of a
  // character where a hand would, next to the shrunk strokes.
  function noteZoom(zoom) {
    zoomSoFar = zoom;
    if (zoom === NO_FRAME) {
      target.removeAttribute('data-zoom');
    } else {
      target.setAttribute('data-zoom', `${zoom.scale} ${zoom.dx} ${zoom.dy}`);
    }
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
    const reference = toPoints(baseData.medians[reading.strokeNum]);
    // Read differently, the strokes say something different about where the
    // character is being written. If they are too few to say how big (see
    // isExpectedStrokeAtAnotherSize), the stroke just drawn is counted in.
    let otherFrame = frame;
    if (reading.sinceSync > 0 && canFollow()) {
      otherFrame = fitFrame(
        sizeIsKnown(reading.accepted)
          ? reading.accepted
          : [...reading.accepted, { reference, drawn: points }],
      );
    }
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

  // A rejected stroke can pass both as a shortcut (the next two strokes
  // joined) and as the next stroke of the other order: written to the right,
  // the left-hand 丨 of 學 runs alongside the 丶 and ノ of the 爻 joined up.
  // True if it sits closer to the other order's stroke than to the joined pair.
  function otherOrderIsCloser(stroke, reading) {
    const drawn = resample(stroke.drawnPath.points);
    const asOtherOrder = moved(toPoints(baseData.medians[reading.strokeNum]), reading.frame);
    const asShortcut = joinedLine(charData, stroke.strokeNum);
    return averageDistance(drawn, resample(asOtherOrder)) < averageDistance(drawn, resample(asShortcut));
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

  // True if the rejected stroke is the expected one after all, written at a
  // size nobody could know yet.
  //
  // One short stroke says where a character is being written but not how big
  // (see MIN_SPAN_FOR_SCALE in frame.js), so the second or third stroke is
  // still expected at full size. Written at half size it lands too close to
  // the first and is rejected. So we ask: taking this stroke as the expected
  // one, is there a size at which it and every stroke before it sit on their
  // references? If so, that is the size being written.
  function isExpectedStrokeAtAnotherSize(stroke) {
    if (!canFollow() || acceptedStrokes.length === 0 || sizeIsKnown(acceptedStrokes)) {
      return false;
    }
    const pairs = [
      ...acceptedStrokes,
      {
        reference: toPoints(baseData.medians[sequence[stroke.strokeNum]]),
        drawn: stroke.drawnPath.points,
      },
    ];
    if (!sizeIsKnown(pairs)) {
      return false;
    }
    const withSize = fitFrame(pairs);
    // What fitsStroke allows is measured for a full-size character. In a
    // small one the strokes lie closer together, so less is allowed, or a
    // neighboring stroke of the same shape would pass too.
    const leniency = LENIENCY * Math.min(1, withSize.scale);
    return pairs.every((pair) =>
      // fitsStroke takes a middle line as [x, y] pairs.
      fitsStroke(
        pair.drawn,
        moved(pair.reference, withSize).map((point) => [point.x, point.y]),
        leniency,
      ),
    );
  }

  // Carries on in the other stroke order, with the strokes so far read that
  // way. `reading` comes from otherOrderFor or otherOrderBeats.
  function switchToOtherOrder(stroke, reading, totalStrokes) {
    const written = stroke.strokeNum + 1;
    sequence = reading.sequence;
    acceptedStrokes = reading.accepted;
    noteAccepted(stroke.strokeNum, [reading.strokeNum], stroke.drawnPath.points);
    if (reading.frame !== frame) {
      useFrame(reading.frame);
    }
    refitFrame();
    reportProgress({ strokesDone: written, totalStrokes, totalMistakes: mistakes });
    // This never happens at the last stroke, so there is always more to come.
    resume(written);
  }

  // ---- Gestures (see gestures.js) ----
  //
  // Hanzi Writer takes every touch on the writing area for a stroke. The
  // browser reports a touch as "pointer" events first, before the touch or
  // mouse events Hanzi Writer listens to, so a hold or a swipe is recognized
  // here, and Hanzi Writer's quiz is called off before it can grade what was
  // drawn. Calling the quiz off also throws away the line it was drawing.

  // The touch in progress: the points it went through, the timer that makes
  // it a hold, and whether it has been taken as one.
  let press = null;
  // A timer this late (in milliseconds) means the page was busy.
  const HOLD_LATE_MS = 100;

  // Where a pointer event happened, in pixels from the writing area's corner.
  function pointOf(event) {
    const box = target.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function endPress() {
    if (press) {
      clearTimeout(press.holdTimer);
    }
    press = null;
  }

  // A gesture is only taken while a stroke could be written, and not while
  // Hanzi Writer is being handed new stroke data.
  function canTakeGesture() {
    return writing && busyCount === 0;
  }

  // Once the character is written, a swipe up still starts it again (to
  // practice it, in Review: wordFlow.js), but nothing else is a gesture.
  let completed = false;
  function canSwipeWhenDone() {
    return completed && !writing && busyCount === 0;
  }

  // The finger or pen was held still for HOLD_MS, as far as the page has
  // heard. If the timer came late, the page was busy (unpacking the offline
  // data, say) and movements may still be waiting to be handed on: wait a
  // little more, until a wait comes on time. The browser also hands on
  // movements once per screen frame, so wait for the next frame, then look
  // again.
  function holdTimeUp(dueAt) {
    const pressNow = press;
    if (performance.now() - dueAt > HOLD_LATE_MS) {
      pressNow.holdTimer = setTimeout(() => holdTimeUp(performance.now() + HOLD_LATE_MS), HOLD_LATE_MS);
      return;
    }
    requestAnimationFrame(() => {
      if (press === pressNow && !pressNow.moved) {
        holdReached();
      }
    });
  }

  // A hold: flash the next stroke, which counts as a hint. The quiz carries
  // on at the same stroke, with nothing lost. Busy until it has restarted, so
  // that a stroke drawn meanwhile is not lost unseen.
  async function holdReached() {
    if (!canTakeGesture()) {
      return;
    }
    press.taken = true;
    writer.cancelQuiz();
    noteHint(true);
    const next = strokesDone;
    setBusy(true);
    try {
      await runQuiz(next);
    } finally {
      setBusy(false);
    }
    writer.highlightStroke(next);
  }

  // ---- A stroke begun during Animate ----
  //
  // Writing stops the animation and is taken as a stroke (tester 2,
  // 2026-10-17, found waiting for it "a bit annoying"; the owner,
  // 2026-10-18). Hanzi Writer only listens once its quiz runs, and starting
  // it takes a moment. The browser's own "mousedown" or "touchstart" for the
  // touch comes after the "pointerdown" heard here, and may reach Hanzi
  // Writer once it listens (the quiz can start that quickly), or not. If not,
  // the points drawn until then, kept here, are handed to it as mouse events,
  // which it reads as it reads a finger or a pen. The rest of the stroke
  // reaches it as usual.

  // The stroke begun during the animation, until the quiz takes it:
  // { points, ended, ready, heard }, or null. `heard`: the browser's own
  // start of the stroke came once the quiz was ready.
  let caught = null;

  for (const type of ['mousedown', 'touchstart']) {
    target.addEventListener(
      type,
      (event) => {
        if (caught?.ready && event.isTrusted) {
          caught.heard = true;
        }
      },
      { capture: true, passive: true },
    );
  }

  async function catchStroke(event) {
    const caughtNow = { points: [pointOf(event)], ended: false, ready: false, heard: false };
    caught = caughtNow;
    await start();
    await quizReady;
    caughtNow.ready = true;
    // One turn of the page's work, for the browser's own start of the stroke.
    await new Promise((resolve) => setTimeout(resolve));
    // Started again meanwhile (another stroke begun, Clear): that one wins.
    if (caught !== caughtNow) {
      return;
    }
    caught = null;
    if (caughtNow.heard) {
      return;
    }
    const box = target.getBoundingClientRect();
    const fire = (type, point) =>
      target.dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: box.left + point.x, clientY: box.top + point.y }),
      );
    fire('mousedown', caughtNow.points[0]);
    for (const point of caughtNow.points.slice(1)) {
      fire('mousemove', point);
    }
    // Lifted already: Hanzi Writer hears the end of a stroke on the page.
    if (caughtNow.ended) {
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    }
  }

  target.addEventListener('pointerdown', (event) => {
    endPress();
    if (animating && event.isPrimary && event.button === 0) {
      catchStroke(event);
      return;
    }
    // Only the first finger, and only the main mouse button.
    if (!event.isPrimary || event.button !== 0 || !(canTakeGesture() || canSwipeWhenDone())) {
      return;
    }
    const dueAt = performance.now() + HOLD_MS;
    press = {
      points: [pointOf(event)],
      // When the finger landed, for telling a quick swipe from a slow line
      // (event.timeStamp is in milliseconds, the same clock for every event).
      startedAt: event.timeStamp,
      moved: false,
      taken: false,
      holdTimer: setTimeout(() => holdTimeUp(dueAt), HOLD_MS),
    };
  });

  target.addEventListener('pointermove', (event) => {
    if (caught && event.isPrimary) {
      caught.points.push(pointOf(event));
    }
    if (!press || press.taken || !event.isPrimary) {
      return;
    }
    const point = pointOf(event);
    press.points.push(point);
    const start = press.points[0];
    if (Math.hypot(point.x - start.x, point.y - start.y) > HOLD_STILLNESS_PX) {
      press.moved = true;
      clearTimeout(press.holdTimer);
    }
  });

  target.addEventListener('pointerup', (event) => {
    if (caught && event.isPrimary) {
      caught.ended = true;
    }
    if (!press || !event.isPrimary) {
      return;
    }
    // A longer swipe is asked for when the stroke expected next itself goes
    // steeply up (the 提 of 氵 in 滿, say).
    const next = charData?.medians[strokesDone];
    const strict = Boolean(next) && risesSteeply(next);
    const duration = event.timeStamp - press.startedAt;
    const swipedUp = !press.taken && canTakeGesture() && isSwipeUp(press.points, size, strict, duration);
    const swipedUpWhenDone = !press.taken && canSwipeWhenDone() && isSwipeUp(press.points, size, false, duration);
    if (!press.taken) {
      showSwipeReadout(describeSwipe(press.points, size, strict && !canSwipeWhenDone(), duration));
    }
    endPress();
    if (swipedUp) {
      writing = false;
      writer.cancelQuiz();
      handlers.onWipe();
    } else if (swipedUpWhenDone) {
      // Not also a tap, which would move on (wordFlow.js listens further up).
      event.stopPropagation();
      handlers.onWipe();
    }
  });

  // The system took the touch away (for a gesture of its own, say).
  target.addEventListener('pointercancel', (event) => {
    if (caught && event.isPrimary) {
      caught.ended = true;
    }
    endPress();
  });

  // Empties the writing area at once: nothing of the character before (your
  // strokes, its printed form, its outline) stays up while the next one's
  // stroke data loads, or it flashed up as the next card came (the owner,
  // 2026-10-24). start() puts back what the new character needs.
  let blanked = false;
  function blank() {
    blanked = true;
    clearTimeout(afterAnimationTimer);
    animating = false;
    writing = false;
    completed = false;
    drawnLayer.replaceChildren();
    demoLayer.replaceChildren();
    if (writer) {
      writer.cancelQuiz();
      writer.hideOutline({ duration: 0 });
      setPrintedColor(() => INVISIBLE);
    }
  }

  // Starts (or restarts) the quiz for the current character, from a clean slate.
  async function start() {
    blanked = false;
    clearTimeout(afterAnimationTimer);
    animating = false;
    completed = false;
    drawnLayer.replaceChildren();
    mistakes = 0;
    strokesDone = 0;
    noteHint(false);
    handlers.onStart({ totalStrokes: baseData.strokes.length });
    setBusy(true);
    try {
      await useOriginalData();
      await setPrintedColor(colorWhileWriting);
      target.append(demoLayer, drawnLayer);
      if (outlineVisible) {
        writer.showOutline({ duration: 0 });
      }
      quizReady = runQuiz(0);
      showDemo(0);
    } finally {
      setBusy(false);
    }
  }

  // Runs Hanzi Writer's quiz on charData, beginning at stroke `startAt`.
  // Returns a promise that settles once the quiz has started.
  function runQuiz(startAt) {
    const totalStrokes = charData.strokes.length;
    writing = true;
    // quiz() also cancels any quiz in progress.
    return writer.quiz({
      // Hanzi Writer remembers quiz options from one quiz to the next, so this
      // must be given every time, not only when resuming partway.
      quizStartStrokeNum: startAt,
      showHintAfterMisses: HINT_AFTER_MISSES,
      leniency: LENIENCY,
      // Hanzi Writer would otherwise flash the printed character when you finish.
      highlightOnComplete: false,
      // Hanzi Writer accepted the stroke as the textbook stroke.
      onCorrectStroke: (stroke) => {
        keepDrawnStroke(stroke.drawnPath.pathString);
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
        reportProgress({ strokesDone, totalStrokes, totalMistakes: mistakes });
        // Unless that was the last stroke, see whether the frame has moved.
        if (strokesDone < totalStrokes && refitFrame()) {
          resume(strokesDone);
        }
      },
      // Hanzi Writer rejected the stroke. It may still be a shortcut, or the
      // next stroke of the character's other accepted order.
      onMistake: (stroke) => {
        const otherReading = otherOrderFor(stroke);
        if (drewShortcut(stroke) && !(otherReading && otherOrderIsCloser(stroke, otherReading))) {
          keepDrawnStroke(stroke.drawnPath.pathString);
          noteAccepted(
            stroke.strokeNum,
            [sequence[stroke.strokeNum], sequence[stroke.strokeNum + 1]],
            stroke.drawnPath.points,
          );
          const strokesDone = stroke.strokeNum + 2;
          reportProgress({ strokesDone, totalStrokes, totalMistakes: mistakes });
          // One drawn stroke covered two textbook strokes.
          writer.skipQuizStroke();
          writer.skipQuizStroke();
          if (strokesDone < totalStrokes && refitFrame()) {
            resume(strokesDone);
          }
          return;
        }
        if (otherReading) {
          keepDrawnStroke(stroke.drawnPath.pathString);
          switchToOtherOrder(stroke, otherReading, totalStrokes);
          return;
        }
        // The first stroke of all, in the right shape but further from the
        // centered reference than Hanzi Writer allows: accept it, and let the
        // frame follow it.
        if (isFirstStrokeAnywhere(stroke)) {
          keepDrawnStroke(stroke.drawnPath.pathString);
          noteAccepted(0, [sequence[0]], stroke.drawnPath.points);
          reportProgress({ strokesDone: 1, totalStrokes, totalMistakes: mistakes });
          writer.skipQuizStroke();
          if (totalStrokes > 1 && refitFrame()) {
            resume(1);
          }
          return;
        }
        // The expected stroke, written at a size that was not known yet:
        // accept it, and let the frame take on that size.
        if (isExpectedStrokeAtAnotherSize(stroke)) {
          keepDrawnStroke(stroke.drawnPath.pathString);
          noteAccepted(stroke.strokeNum, [sequence[stroke.strokeNum]], stroke.drawnPath.points);
          const strokesDone = stroke.strokeNum + 1;
          reportProgress({ strokesDone, totalStrokes, totalMistakes: mistakes });
          writer.skipQuizStroke();
          if (strokesDone < totalStrokes && refitFrame()) {
            resume(strokesDone);
          }
          return;
        }
        mistakes += 1;
        // mistakesOnStroke counts the misses on this one stroke, including this one.
        if (stroke.mistakesOnStroke >= HINT_AFTER_MISSES) {
          noteHint(true);
        }
        reportProgress({
          strokesDone: stroke.strokeNum,
          totalStrokes,
          totalMistakes: mistakes,
        });
      },
      onComplete: () => {
        writing = false;
        completed = true;
        let order = null;
        if (baseData.altOrder) {
          order = isStandardOrder(sequence) ? 'moe' : 'mainland';
        }
        showDemo(sequence.length); // nothing left to show
        const passed = handlers.onComplete({ totalMistakes: mistakes, hintShown, order });
        setPrintedColor(() => referenceColor(passed));
      },
    });
  }

  return {
    // Switches to a character and starts quizzing it. `script` is
    // 'traditional' or 'simplified' and decides which form is drawn.
    // `useRawInput` chooses between keeping your own strokes on screen
    // (true) and snapping to the printed strokes (false). Returns false if
    // there is no stroke data for the character.
    async showCharacter(newChar, script, useRawInput) {
      blank();
      const data = await loadCharData(newChar, script);
      if (!data) {
        return false;
      }
      char = newChar;
      rawInput = useRawInput;
      baseData = data;
      charData = data;
      sequence = data.strokes.map((stroke, index) => index);
      frame = NO_FRAME;
      framedData = data;
      acceptedStrokes = [];
      extent = extentOf(data);

      if (!writer) {
        writer = HanziWriter.create(target, char, {
          width: size,
          height: size,
          padding,
          showCharacter: false,
          showOutline: false,
          strokeColor: INVISIBLE,
          outlineColor: themeColor('--outline'),
          // Same color and width as the kept strokes, so a stroke doesn't
          // visibly change at the moment it is accepted.
          drawingColor: ink(),
          drawingWidth: penWidth,
          highlightColor: themeColor('--success'),
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

    // Empties the writing area, before a new word's stroke data loads.
    blank,

    // Whether a hint has been shown for the character being written, for
    // when it is left before it is finished (wordFlow.js keeps it).
    hintShownNow: () => hintShown,

    // Switches showing the next stroke on or off; see showDemo. It takes
    // effect from the next character or restart.
    setDemoStrokes(on) {
      demoStrokes = on;
    },

    setOutlineVisible(visible) {
      outlineVisible = visible;
      // Applied when the first character starts, or the next one after
      // blank(): shown now, it would be the outline of the one before.
      if (!writer || blanked) {
        return;
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
      animating = false;
      writing = false;
      completed = true;
      writer.cancelQuiz();
      await setPrintedColor(() => referenceColor(true));
      writer.showCharacter();
    },

    // A copy of your strokes on the writing area, with its guide lines, as a
    // picture of its own (an SVG element): for looking back at a card
    // already graded (pastCard.js). Taken as the character is finished,
    // while the printed one is still invisible, so that only your raw input
    // is in it. Its viewBox lets it be shown at any size. Empty of strokes
    // without raw input, where the printed strokes stood in for them.
    drawing() {
      const picture = document.createElementNS(SVG_NAMESPACE, 'svg');
      picture.setAttribute('viewBox', `0 0 ${size} ${size}`);
      picture.setAttribute('class', 'past-drawing');
      picture.setAttribute('aria-hidden', 'true');
      const gridLines = [...target.children].filter((child) => child.tagName === 'line');
      const strokes = drawnLayer.cloneNode(true);
      // Shown smaller, the strokes are to be thinner too: on the writing
      // area they keep their width when shrunk (zoomInk), which in a small
      // copy made them look swollen (the owner, 2026-10-21).
      for (const path of strokes.querySelectorAll('path')) {
        path.removeAttribute('vector-effect');
      }
      picture.append(...gridLines.map((line) => line.cloneNode(true)), strokes);
      return picture;
    },

    // Recolors the printed character of a finished quiz after its verdict
    // changed: red for missed (false), green otherwise.
    showVerdict(passed) {
      setPrintedColor(() => referenceColor(passed));
    },

    // Plays the stroke order, then starts the quiz again. This always shows
    // the centered character in the standard order.
    async animate() {
      clearTimeout(afterAnimationTimer);
      animating = true;
      writing = false;
      completed = false;
      writer.cancelQuiz();
      drawnLayer.replaceChildren();
      demoLayer.replaceChildren();
      handlers.onAnimateStart();
      await useOriginalData();
      await writer.hideCharacter({ duration: 0 });
      await setPrintedColor(ink);
      writer.animateCharacter({
        // The animation is canceled if you move to another character meanwhile.
        onComplete: (result) => {
          // Not if the quiz started meanwhile (a stroke begun, Clear): the
          // animation is not called off by it, and would start it again.
          if (!result.canceled && animating) {
            // Leave the finished character up for a moment before clearing it.
            afterAnimationTimer = setTimeout(start, PAUSE_AFTER_ANIMATION_MS);
          }
        },
      });
    },

    // Stops this quiz for good. Used when the writing area is rebuilt at a new size.
    destroy() {
      clearTimeout(afterAnimationTimer);
      animating = false;
      writing = false;
      endPress();
      if (writer) {
        writer.cancelQuiz();
      }
      drawnLayer.remove();
      demoLayer.remove();
    },
  };
}

// For testers (the owner, 2026-10-20; switched on under Settings › For
// testing, testerSettings.js): shows how an upward touch measured against
// the swipe's rules (describeSwipe in gestures.js), at the top of the screen
// for a few seconds, to tell whether a swipe failed on its height or its
// speed. Nothing is shown for a touch that hardly rose (`line` is null).
let swipeReadoutOn = false;
let swipeReadoutTimer = null;

export function setSwipeReadout(on) {
  swipeReadoutOn = on;
  const box = document.getElementById('swipe-readout');
  if (box && !on) {
    box.hidden = true;
  }
}

function showSwipeReadout(line) {
  if (!swipeReadoutOn || !line) {
    return;
  }
  let box = document.getElementById('swipe-readout');
  if (!box) {
    box = document.createElement('div');
    box.id = 'swipe-readout';
    // Over everything, and never in the way of a tap.
    box.style.cssText =
      'position: fixed; top: var(--space-small); left: var(--space-small); right: var(--space-small);' +
      'z-index: 1000; pointer-events: none; padding: var(--space-small); text-align: center;' +
      'background: var(--surface); color: var(--text); border: 1px solid var(--border);' +
      'border-radius: var(--radius); font-size: var(--size-small);';
    document.body.append(box);
  }
  box.textContent = line;
  box.hidden = false;
  clearTimeout(swipeReadoutTimer);
  swipeReadoutTimer = setTimeout(() => {
    box.hidden = true;
  }, 6000);
}
