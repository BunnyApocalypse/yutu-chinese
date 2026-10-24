// Handwriting shortcuts: two neighboring strokes written as a single stroke,
// e.g. the ㇇ and 亅 of 子 joined, so 子 takes 2 strokes instead of 3.
//
// Hanzi Writer only grades one drawn stroke against one textbook stroke, so it
// cannot recognize these. This file adds the missing check: "does this drawn
// stroke look like textbook strokes N and N+1 written in one go?". The textbook
// form keeps working as before, because Hanzi Writer still grades that.
//
// Which pairs may be joined is worked out from the stroke data itself, so it
// applies to every character with no lists to maintain: two strokes are
// joinable when the first ends where the second begins, the second is long
// enough to matter, and joining them gives a visibly different shape.
//
// Only pairs are handled. Three or more strokes in one go, and shortcuts that
// change the order of strokes or drop some, are not.
//
// This file has no connection to the page or to Hanzi Writer, so it can be
// tested on its own (see tests/shortcuts.test.js).
//
// All coordinates here are in the character data's own units, a grid 1024
// wide (see charData.js).

import {
  SAMPLE_COUNT,
  toPoints,
  distance,
  lineLength,
  resample,
  averageDistance,
  shapeOf,
} from './lines.js';

// ---- Which pairs are joinable ----

// The first stroke must end within this distance of the start of the second.
const MAX_GAP = 80;

// A stroke often begins with a small lead-in before the point where the
// previous stroke would run into it. Nobody draws that part when joining, so
// it is left out of the joined shape. If more than this would be left out, the
// second stroke really starts somewhere else and the pair is not joinable.
const MAX_LEAD_IN = 80;

// The first stroke, and what is left of the second after the meeting point,
// must each be at least this long. Joining a stroke to a dot or a tick changes
// its shape so little that "joined" could not be told apart from "just the
// longer of the two", and a forgotten dot would pass unnoticed.
const MIN_PART_LENGTH = 150;

// Joining must change the shape noticeably compared with either stroke on its
// own (see shapeOf in lines.js; the number is an average distance between two
// shapes of length 1). Two strokes that continue in a straight line, like the
// two halves of the horizontal in a Taiwan-style 艹, look the same joined as
// one of them does alone, so they cannot be told apart and are left out.
const MIN_SHAPE_DIFFERENCE = 0.08;

// ---- Whether a drawn stroke is the joined pair ----

// How far a drawn stroke may be from the joined reference and still count.
// Both are multiplied by the leniency setting passed in from quiz.js.
const END_TOLERANCE = 200; // how far off the start and end points may be
const AVERAGE_TOLERANCE = 130; // how far off the stroke may be on average

// The drawn stroke's length must be within these fractions of the reference's.
const MIN_LENGTH_RATIO = 0.6;
const MAX_LENGTH_RATIO = 1.7;

// The drawn stroke's shape must be this many times closer to the joined pair
// than to either of the two strokes alone. Above 1 means "clearly closer", so a doubtful
// stroke is not treated as joined.
const SHAPE_MARGIN = 1.3;

// Describes how textbook strokes `strokeNum` and `strokeNum + 1` fit together.
// Returns null if there is no following stroke; otherwise:
//   first:  the middle line of the first stroke, as { x, y } points
//   rest:   the middle line of the second stroke from the point where the two
//           meet. A stroke often begins with a small lead-in that nobody draws
//           when joining; that part is left out.
//   gap:    how far apart the two are at the meeting point
//   leadIn: the length of the part of the second stroke that was left out
function describePair(charData, strokeNum) {
  if (strokeNum + 1 >= charData.medians.length) {
    return null;
  }
  const first = toPoints(charData.medians[strokeNum]);
  const second = toPoints(charData.medians[strokeNum + 1]);
  const endOfFirst = first[first.length - 1];

  // The meeting point is looked for only near the start of the second stroke
  // (its first third). Passing close by later on doesn't make them joinable.
  const searchUpTo = Math.max(1, Math.floor(second.length / 3));
  let nearest = 0;
  for (let i = 1; i < searchUpTo; i++) {
    if (distance(second[i], endOfFirst) < distance(second[nearest], endOfFirst)) {
      nearest = i;
    }
  }
  return {
    first,
    rest: second.slice(nearest),
    gap: distance(second[nearest], endOfFirst),
    leadIn: lineLength(second.slice(0, nearest + 1)),
  };
}

// True if textbook strokes `strokeNum` and `strokeNum + 1` (counting from 0)
// may be written as one stroke.
//
// `scale`: how big `charData` is drawn compared with the stroke data as it
// comes (the frame's scale in quiz.js, frame.js). Whether two strokes may be
// joined belongs to the character, not to how big it is written, so the
// distances above are scaled with it. Until 2026-10-24 they were not, and
// the top of 辶 in 這 written at two thirds of the size could not be joined
// (the owner's recording of their raw input).
export function isJoinable(charData, strokeNum, scale = 1) {
  const pair = describePair(charData, strokeNum);
  if (pair === null || pair.gap > MAX_GAP * scale || pair.leadIn > MAX_LEAD_IN * scale) {
    return false;
  }
  if (lineLength(pair.first) < MIN_PART_LENGTH * scale || lineLength(pair.rest) < MIN_PART_LENGTH * scale) {
    return false;
  }
  const joinedShape = shapeOf(resample([...pair.first, ...pair.rest]));
  return (
    averageDistance(joinedShape, shapeOf(resample(pair.first))) >= MIN_SHAPE_DIFFERENCE &&
    averageDistance(joinedShape, shapeOf(resample(pair.rest))) >= MIN_SHAPE_DIFFERENCE
  );
}

// True if `drawnPoints` (a list of { x, y }) looks like textbook strokes
// `strokeNum` and `strokeNum + 1` written as one stroke, and that pair is
// joinable. `charData` is the character's stroke data, drawn at `scale` (see
// isJoinable).
export function isShortcutStroke(charData, strokeNum, drawnPoints, leniency, scale = 1) {
  if (drawnPoints.length < 2 || !isJoinable(charData, strokeNum, scale)) {
    return false;
  }
  const { first, rest } = describePair(charData, strokeNum);
  const reference = [...first, ...rest];

  const drawnLength = lineLength(drawnPoints);
  const lengthRatio = drawnLength / lineLength(reference);
  if (lengthRatio < MIN_LENGTH_RATIO || lengthRatio > MAX_LENGTH_RATIO) {
    return false;
  }

  const drawn = resample(drawnPoints);
  const target = resample(reference);

  // Is the shape more like the joined pair, or like one of the two strokes
  // alone? This is what stops a single stroke from being taken as the joined
  // pair, which would make the app skip a stroke that was never written. It
  // compares shapes only, ignoring size, because a first stroke drawn too big
  // reaches about as far as the joined pair would.
  const drawnShape = shapeOf(drawn);
  const likeJoined = averageDistance(drawnShape, shapeOf(target));
  const likeFirstAlone = averageDistance(drawnShape, shapeOf(resample(first)));
  const likeSecondAlone = averageDistance(drawnShape, shapeOf(resample(rest)));
  if (likeJoined * SHAPE_MARGIN >= Math.min(likeFirstAlone, likeSecondAlone)) {
    return false;
  }

  // A joined stroke begins where the first stroke begins. One that begins
  // nearer to where the second stroke takes over is the second stroke alone.
  if (distance(drawn[0], first[0]) >= distance(drawn[0], rest[0])) {
    return false;
  }

  // Is it also in the right place and about the right size?
  const endTolerance = END_TOLERANCE * leniency;
  const last = SAMPLE_COUNT - 1;
  if (distance(drawn[0], target[0]) > endTolerance) return false;
  if (distance(drawn[last], target[last]) > endTolerance) return false;

  return averageDistance(drawn, target) <= AVERAGE_TOLERANCE * leniency;
}

// The middle line of a joined pair, as it would be drawn in one go. Used by
// the tests to produce a joined stroke to try.
export function joinedLine(charData, strokeNum) {
  const { first, rest } = describePair(charData, strokeNum);
  return [...first, ...rest];
}
