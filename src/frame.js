// Following where a character is being written.
//
// With raw squigs the reference character is invisible, so the writer chooses
// where in the box to write and how big. The reference, though, sits at one
// fixed place. This file works out the "frame" being written in, from the
// strokes accepted so far, and moves the reference into it, so that the
// remaining strokes are expected where the writer will naturally put them.
//
// A frame is { scale, dx, dy }: a point (x, y) of the reference belongs at
// (scale * x + dx, scale * y + dy).
//
// Plain calculation, no page. Coordinates are in the character data's units
// (see charData.js): a box 1024 wide.

import { resample } from './lines.js';

// The frame that changes nothing.
export const NO_FRAME = { scale: 1, dx: 0, dy: 0 };

// The middle of the box the characters are drawn in.
const BOX_CENTER = { x: 512, y: 388 };

// The size is only estimated once the reference strokes written so far span
// at least this much, across or down. One short stroke says where the
// character is, but nothing reliable about how big it is.
const MIN_SPAN_FOR_SCALE = 300;

// The frame never goes beyond these. A character written smaller, bigger or
// further off than this is no longer followed.
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.5;
const MAX_SHIFT = 320; // how far the middle of the character may move

// Number of evenly spaced points each stroke contributes to the fit, so that
// long strokes don't count for more just because they have more points.
const POINTS_PER_STROKE = 16;

function centerOf(points) {
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// Finds the frame that best maps reference strokes onto the strokes drawn.
//
// pairs: a list of { reference, drawn }, one per accepted stroke. Both are
//        lines of { x, y } points: the textbook stroke's middle line, and the
//        stroke as it was drawn.
//
// Returns { scale, dx, dy }. With no strokes it returns NO_FRAME.
export function fitFrame(pairs) {
  if (pairs.length === 0) {
    return NO_FRAME;
  }
  const reference = pairs.flatMap((pair) => resample(pair.reference, POINTS_PER_STROKE));
  const drawn = pairs.flatMap((pair) => resample(pair.drawn, POINTS_PER_STROKE));
  const referenceCenter = centerOf(reference);
  const drawnCenter = centerOf(drawn);

  // The size that fits best, by least squares: compare how the points are
  // spread around their centers in the reference and in the drawing.
  let scale = 1;
  const xs = reference.map((point) => point.x);
  const ys = reference.map((point) => point.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (span >= MIN_SPAN_FOR_SCALE) {
    let spread = 0;
    let together = 0;
    reference.forEach((point, index) => {
      const rx = point.x - referenceCenter.x;
      const ry = point.y - referenceCenter.y;
      spread += rx * rx + ry * ry;
      together += rx * (drawn[index].x - drawnCenter.x) + ry * (drawn[index].y - drawnCenter.y);
    });
    scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, together / spread));
  }

  // The shift that puts the reference's center on the drawing's center.
  let dx = drawnCenter.x - scale * referenceCenter.x;
  let dy = drawnCenter.y - scale * referenceCenter.y;

  // Limit how far the middle of the character moves.
  const movedX = scale * BOX_CENTER.x + dx - BOX_CENTER.x;
  const movedY = scale * BOX_CENTER.y + dy - BOX_CENTER.y;
  const moved = Math.hypot(movedX, movedY);
  if (moved > MAX_SHIFT) {
    const shrink = MAX_SHIFT / moved;
    dx -= movedX * (1 - shrink);
    dy -= movedY * (1 - shrink);
  }
  return { scale, dx, dy };
}

// A new fit is only worth acting on if it differs from the frame in use by
// more than these.
const SCALE_DIFFERENCE_THAT_MATTERS = 0.03;
const SHIFT_DIFFERENCE_THAT_MATTERS = 15;

// True if two frames differ enough to matter.
export function framesDiffer(a, b) {
  const movedX = (a.scale - b.scale) * BOX_CENTER.x + a.dx - b.dx;
  const movedY = (a.scale - b.scale) * BOX_CENTER.y + a.dy - b.dy;
  return (
    Math.abs(a.scale - b.scale) > SCALE_DIFFERENCE_THAT_MATTERS ||
    Math.hypot(movedX, movedY) > SHIFT_DIFFERENCE_THAT_MATTERS
  );
}

const isNoFrame = (frame) => frame.scale === 1 && frame.dx === 0 && frame.dy === 0;
const rounded = (number) => Math.round(number * 10) / 10;

// Moves a printed outline into a frame. An outline is SVG path text such as
// "M 302 513 Q 340 529 384 518 L 400 510 Z": letters saying what to draw, and
// numbers that come in x, y pairs. The stroke data only uses M, L, Q, C and Z,
// for which every number is a plain coordinate, so we can walk through the
// numbers and move them two at a time.
function moveOutline(path, frame) {
  let isX = true;
  return path.replace(/-?\d*\.?\d+(?:e-?\d+)?/gi, (number) => {
    const moved = frame.scale * Number(number) + (isX ? frame.dx : frame.dy);
    isX = !isX;
    return String(rounded(moved));
  });
}

// Returns a copy of a character's stroke data with every middle line and
// every printed outline moved into the frame.
export function applyFrame(charData, frame) {
  if (isNoFrame(frame)) {
    return charData;
  }
  return {
    ...charData,
    strokes: charData.strokes.map((outline) => moveOutline(outline, frame)),
    medians: charData.medians.map((median) =>
      median.map(([x, y]) => [rounded(frame.scale * x + frame.dx), rounded(frame.scale * y + frame.dy)]),
    ),
  };
}
