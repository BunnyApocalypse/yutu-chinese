// Following where a character is being written.
//
// With raw input the reference character is invisible, so the writer chooses
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
const MIN_SPAN_FOR_SCALE = 200;

// The frame never goes beyond these. A character written smaller, bigger or
// further off than this is no longer followed.
const MIN_SCALE = 0.4;
const MAX_SCALE = 1.5;
const MAX_SHIFT = 320; // how far the middle of the character may move

// Number of evenly spaced points each stroke contributes to the fit, so that
// long strokes don't count for more just because they have more points.
const POINTS_PER_STROKE = 16;

function centerOf(points) {
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

// How much room the reference strokes take up, across or down, whichever is
// more. `reference` is all their points together.
function spanOf(reference) {
  const xs = reference.map((point) => point.x);
  const ys = reference.map((point) => point.y);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
}

// True if these strokes (pairs as for fitFrame) are enough to tell how big
// the character is being written. Until then fitFrame only says where.
export function sizeIsKnown(pairs) {
  return (
    pairs.length > 0 &&
    spanOf(pairs.flatMap((pair) => resample(pair.reference, POINTS_PER_STROKE))) >= MIN_SPAN_FOR_SCALE
  );
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
  if (spanOf(reference) >= MIN_SPAN_FOR_SCALE) {
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

// ---- Zooming out when the character would not fit ----
//
// A character begun big (the left part of 鋼 across half the box) is expected
// to go on at that size, so its other part lands beyond the writing area,
// where no stroke can be drawn. When that happens the strokes written so far
// are shrunk, and the reference with them, until the whole character fits
// again: as if the writer had stepped back from the paper.

// Where a character may reach: the box the stroke data is drawn in (0 to
// 1024 across, -124 to 900 upward) and the margin the writing area leaves
// around it (PADDING_SHARE in quiz.js, about 70 units), to the area's edge.
// Until 2026-10-24 only halfway into the margin.
export const ROOM = { left: -70, right: 1094, bottom: -194, top: 970 };
// A zoom leaves the character this much inside the room, so that a writer
// who goes on a little big is not zoomed after every stroke.
const ZOOM_SLACK = 25;

// The box around everything a character's printed outlines cover:
// { left, right, bottom, top } in the data's units.
export function extentOf(charData) {
  const numbers = charData.strokes.join(' ').match(/-?\d*\.?\d+(?:e-?\d+)?/gi).map(Number);
  // The numbers come in x, y pairs (see moveOutline).
  const xs = numbers.filter((number, index) => index % 2 === 0);
  const ys = numbers.filter((number, index) => index % 2 === 1);
  return { left: Math.min(...xs), right: Math.max(...xs), bottom: Math.min(...ys), top: Math.max(...ys) };
}

// True if the stroke whose printed outline is `outline` would reach beyond
// the writing area in `frame`. A zoom waits for this, for the next stroke
// to be written (the owner, 2026-10-24: strokes were zoomed too often).
// Zooming as soon as the whole character would not fit caught one
// character in five written at exactly full size: its size is guessed from
// the first few strokes, and a guess a little big made it "not fit"
// (measured over both stroke data sets; local/strictness/ in the main
// checkout). Waiting for the next stroke, about one in a hundred.
export function strokeLeavesRoom(outline, frame) {
  const box = extentOf({ strokes: [outline] });
  return (
    frame.scale * box.left + frame.dx < ROOM.left ||
    frame.scale * box.right + frame.dx > ROOM.right ||
    frame.scale * box.bottom + frame.dy < ROOM.bottom ||
    frame.scale * box.top + frame.dy > ROOM.top
  );
}

// The frame that does `inner` first and then `outer`.
export function combineFrames(outer, inner) {
  return {
    scale: outer.scale * inner.scale,
    dx: outer.scale * inner.dx + outer.dx,
    dy: outer.scale * inner.dy + outer.dy,
  };
}

// If a character whose outlines cover `extent` (from extentOf) would reach
// beyond the writing area in `frame`, returns the zoom that brings it back:
// a frame (as above) to apply to everything written so far, and to `frame`.
// Otherwise returns null.
//
// It shrinks toward the middle of the box, not toward where there is room,
// so that the movement gives away as little as possible about where the
// rest of the character goes (the owner, 2026-10-18, worried about an
// accidental hint). Only if that is not enough does it also shift.
export function zoomToFit(extent, frame) {
  const left = frame.scale * extent.left + frame.dx;
  const right = frame.scale * extent.right + frame.dx;
  const bottom = frame.scale * extent.bottom + frame.dy;
  const top = frame.scale * extent.top + frame.dy;
  if (left >= ROOM.left && right <= ROOM.right && bottom >= ROOM.bottom && top <= ROOM.top) {
    return null;
  }
  const target = {
    left: ROOM.left + ZOOM_SLACK,
    right: ROOM.right - ZOOM_SLACK,
    bottom: ROOM.bottom + ZOOM_SLACK,
    top: ROOM.top - ZOOM_SLACK,
  };
  const scale = Math.min(1, (target.right - target.left) / (right - left), (target.top - target.bottom) / (top - bottom));
  // Shrunk toward the middle of the box.
  let dx = (1 - scale) * BOX_CENTER.x;
  let dy = (1 - scale) * BOX_CENTER.y;
  // Then moved in from whichever edge it is still beyond. It is now no wider
  // or taller than the target, so it is beyond one edge of each pair at most.
  const shiftInto = (low, high, targetLow, targetHigh) => {
    if (low < targetLow) {
      return targetLow - low;
    }
    if (high > targetHigh) {
      return targetHigh - high;
    }
    return 0;
  };
  dx += shiftInto(scale * left + dx, scale * right + dx, target.left, target.right);
  dy += shiftInto(scale * bottom + dy, scale * top + dy, target.bottom, target.top);
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
