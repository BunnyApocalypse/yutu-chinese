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

// ---- Which pairs are joinable ----

// The first stroke must end within this distance of the start of the second.
const MAX_GAP = 80;

// What is left of the second stroke after the meeting point must be at least
// this long. Joining a stroke to a dot or a tick changes its shape so little
// that "joined" could not be told apart from "just the first stroke".
const MIN_REST_LENGTH = 150;

// Joining must change the shape noticeably (see shapeOf below; the number is
// an average distance between two shapes of length 1). Two strokes that
// continue in a straight line, like the two halves of the horizontal in a
// Taiwan-style 艹, look the same joined as the first one does alone, so they
// cannot be told apart and are left out.
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
// than to the first stroke alone. Above 1 means "clearly closer", so a doubtful
// stroke is not treated as joined.
const SHAPE_MARGIN = 1.3;

// Number of evenly spaced points both lines are reduced to before comparing.
const SAMPLE_COUNT = 32;

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

// Returns `count` points spaced evenly along the line. A finger produces many
// points where it moves slowly and few where it moves fast; this evens that
// out so two lines can be compared point by point.
function resample(points, count) {
  const step = lineLength(points) / (count - 1);
  const result = [points[0]];
  let traveled = 0; // distance covered since the last point we emitted
  for (let i = 1; i < points.length; i++) {
    let from = points[i - 1];
    const to = points[i];
    let segment = distance(from, to);
    while (segment > 0 && traveled + segment >= step && result.length < count - 1) {
      const fraction = (step - traveled) / segment;
      from = {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
      };
      result.push(from);
      segment = distance(from, to);
      traveled = 0;
    }
    traveled += segment;
  }
  result.push(points[points.length - 1]);
  return result;
}

// The average distance between two lines, point by point. Both must have the
// same number of points.
function averageDistance(lineA, lineB) {
  let total = 0;
  for (let i = 0; i < lineA.length; i++) {
    total += distance(lineA[i], lineB[i]);
  }
  return total / lineA.length;
}

// The shape of a line with its position and size taken away: moved so it
// starts at (0, 0) and scaled so its length is 1.
function shapeOf(points) {
  const start = points[0];
  const length = lineLength(points) || 1;
  return points.map((point) => ({
    x: (point.x - start.x) / length,
    y: (point.y - start.y) / length,
  }));
}

// Describes how textbook strokes `strokeNum` and `strokeNum + 1` fit together.
// Returns null if there is no following stroke; otherwise:
//   first:  the middle line of the first stroke, as { x, y } points
//   rest:   the middle line of the second stroke from the point where the two
//           meet. A stroke often begins with a small lead-in that nobody draws
//           when joining; that part is left out.
//   gap:    how far apart the two are at the meeting point
function describePair(charData, strokeNum) {
  if (strokeNum + 1 >= charData.medians.length) {
    return null;
  }
  const toPoint = ([x, y]) => ({ x, y });
  const first = charData.medians[strokeNum].map(toPoint);
  const second = charData.medians[strokeNum + 1].map(toPoint);
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
  };
}

// True if textbook strokes `strokeNum` and `strokeNum + 1` (counting from 0)
// may be written as one stroke.
export function isJoinable(charData, strokeNum) {
  const pair = describePair(charData, strokeNum);
  if (pair === null || pair.gap > MAX_GAP || lineLength(pair.rest) < MIN_REST_LENGTH) {
    return false;
  }
  const joinedShape = shapeOf(resample([...pair.first, ...pair.rest], SAMPLE_COUNT));
  const firstShape = shapeOf(resample(pair.first, SAMPLE_COUNT));
  return averageDistance(joinedShape, firstShape) >= MIN_SHAPE_DIFFERENCE;
}

// True if `drawnPoints` (a list of { x, y }) looks like textbook strokes
// `strokeNum` and `strokeNum + 1` written as one stroke, and that pair is
// joinable. `charData` is the character's stroke data.
export function isShortcutStroke(charData, strokeNum, drawnPoints, leniency) {
  if (drawnPoints.length < 2 || !isJoinable(charData, strokeNum)) {
    return false;
  }
  const { first, rest } = describePair(charData, strokeNum);
  const reference = [...first, ...rest];

  const drawnLength = lineLength(drawnPoints);
  const lengthRatio = drawnLength / lineLength(reference);
  if (lengthRatio < MIN_LENGTH_RATIO || lengthRatio > MAX_LENGTH_RATIO) {
    return false;
  }

  const drawn = resample(drawnPoints, SAMPLE_COUNT);
  const target = resample(reference, SAMPLE_COUNT);

  // Is the shape more like the joined pair, or like the first stroke alone?
  // This is what stops the first stroke on its own from being taken as the
  // joined pair, which would make the app skip a stroke that was never
  // written. It compares shapes only, ignoring size, because a first stroke
  // drawn too big reaches about as far as the joined pair would.
  const drawnShape = shapeOf(drawn);
  const likeJoined = averageDistance(drawnShape, shapeOf(target));
  const likeFirstAlone = averageDistance(drawnShape, shapeOf(resample(first, SAMPLE_COUNT)));
  if (likeJoined * SHAPE_MARGIN >= likeFirstAlone) {
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
