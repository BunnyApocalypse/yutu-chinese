// Judges whether a drawn stroke fits a textbook stroke.
//
// Hanzi Writer does this itself for the stroke it expects next. This file is
// for the one case it can't handle: a character that may be written in two
// stroke orders. When Hanzi Writer rejects a stroke, quiz.js asks here whether
// the stroke fits what the other order expects at this point.
//
// Plain calculation: no page and no Hanzi Writer, so it can be tested on its
// own. Coordinates are in the character data's units (see charData.js).

import { toPoints, distance, lineLength, resample, averageDistance, shapeOf } from './lines.js';

// How far the drawn stroke may be from the textbook stroke. Both are
// multiplied by the leniency setting passed in from quiz.js.
const END_TOLERANCE = 170; // how far off the start and end points may be
const AVERAGE_TOLERANCE = 110; // how far off the stroke may be on average

// The drawn stroke's length must be within these fractions of the textbook's.
const MIN_LENGTH_RATIO = 0.5;
const MAX_LENGTH_RATIO = 2;
// The same for the first stroke of a character. Until it is written nothing
// says how big the character will be, and a character written at half size
// has a first stroke half as long. The lower limit sits a little under the
// smallest size that is followed (MIN_SCALE in frame.js).
const MIN_LENGTH_RATIO_FIRST_STROKE = 0.45;

// How different the shapes may be once position and size are taken away
// (see shapeOf in lines.js). Not multiplied by leniency.
const SHAPE_TOLERANCE = 0.2;

// ---- The brush's entry ----
//
// Many strokes of the Taiwan set begin with a short dab down or down-right,
// where the brush of the printed form pressed in, before the stroke proper
// turns down-left or down. Nobody writes that dab with a finger, and with it
// the stroke's shape can be far from what is written: the ノ at the left of
// 學's 臼 runs at 62° with it and at 41° without (the owner's own ran at about
// 40°, and were refused as the mainland order's first stroke, 2026-10-25).
// So a stroke that begins like that is also compared without its first point.
// About 760 of the Taiwan set's 10,561 strokes do.
//
// Judged by direction and share of the stroke, not by length: the stroke may
// come here shrunk into a frame (frame.js). Coordinates have y going up (see
// charData.js), so "down" is a negative angle. Real turns such as the top of
// 𠃍 (across, then down) or 𠃊 (down, then across) don't fit these directions.
const ENTRY_MAX_SHARE = 0.35; // of the whole stroke's length
const ENTRY_DIRECTIONS = [-110, -20]; // the dab: down to down-right, in degrees
const AFTER_ENTRY_DIRECTIONS = [-180, -80]; // then: down to down-left
const ENTRY_MIN_TURN = 45; // degrees between the dab and what follows

const directionOf = (from, to) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
const isBetween = (angle, [low, high]) => angle >= low && angle <= high;

// The textbook stroke (a list of { x, y }) without its first point, if it
// begins with the brush's entry; otherwise null.
export function withoutEntry(textbook) {
  if (textbook.length < 3) {
    return null;
  }
  const [start, turn, next] = textbook;
  const entry = directionOf(start, turn);
  const after = directionOf(turn, next);
  const turned = Math.abs(entry - after);
  const isEntry =
    distance(start, turn) < ENTRY_MAX_SHARE * lineLength(textbook) &&
    isBetween(entry, ENTRY_DIRECTIONS) &&
    isBetween(after, AFTER_ENTRY_DIRECTIONS) &&
    Math.min(turned, 360 - turned) > ENTRY_MIN_TURN;
  return isEntry ? textbook.slice(1) : null;
}

// How different the shapes of two lines are (both resampled lists of
// { x, y }), with position and size taken away.
const shapeDifference = (drawn, target) => averageDistance(shapeOf(drawn), shapeOf(target));

// The same against a textbook stroke, with or without the brush's entry,
// whichever is nearer.
function shapeDifferenceFrom(drawn, textbook) {
  const plain = shapeDifference(drawn, resample(textbook));
  const body = withoutEntry(textbook);
  return body ? Math.min(plain, shapeDifference(drawn, resample(body))) : plain;
}

// True if `drawnPoints` (a list of { x, y }) is an acceptable attempt at the
// textbook stroke whose middle line is `median` ([[x, y], ...]).
// `isFirstStroke` says nothing of the character has been written yet, so its
// size is not known: a shorter stroke is then accepted.
export function fitsStroke(drawnPoints, median, leniency, isFirstStroke = false) {
  if (drawnPoints.length < 2) {
    return false;
  }
  const textbook = toPoints(median);
  const lengthRatio = lineLength(drawnPoints) / lineLength(textbook);
  const minLengthRatio = isFirstStroke ? MIN_LENGTH_RATIO_FIRST_STROKE : MIN_LENGTH_RATIO;
  if (lengthRatio < minLengthRatio || lengthRatio > MAX_LENGTH_RATIO) {
    return false;
  }

  const drawn = resample(drawnPoints);
  const target = resample(textbook);
  const last = drawn.length - 1;
  const endTolerance = END_TOLERANCE * leniency;
  if (distance(drawn[0], target[0]) > endTolerance) return false;
  if (distance(drawn[last], target[last]) > endTolerance) return false;
  if (averageDistance(drawn, target) > AVERAGE_TOLERANCE * leniency) return false;
  return shapeDifferenceFrom(drawn, textbook) <= SHAPE_TOLERANCE;
}

// How far `drawnPoints` is, on average, from the textbook stroke `median`.
// Smaller means a closer fit. Used to say which of two strokes was meant.
export function distanceFromStroke(drawnPoints, median) {
  return averageDistance(resample(drawnPoints), resample(toPoints(median)));
}

// How different the drawn stroke's shape is from the textbook stroke's, with
// position and size taken away. Smaller means more alike. Used for the first
// stroke of a character, whose position says nothing yet.
export function shapeDifferenceFromStroke(drawnPoints, median) {
  return shapeDifferenceFrom(resample(drawnPoints), toPoints(median));
}

// ---- Strokes of the same shape ----
//
// Two strokes of a character are twins if nobody could tell them apart by
// shape when writing: the three strokes of 巛 in 經, the two ノ at the right
// of 癶 in 發. Then only the order says which one is meant (twinStrokeFor in
// quiz.js). Each is compared as printed and without its first point (where
// the brush presses in: 發's ノ both begin with a short dab), whichever
// versions are more alike; and their lengths must be alike too, so that a
// short and a long level stroke (上) are no twins. Measured over the Taiwan
// set (local/strictness/README.md, 2026-11-06): 發's two ノ differ by 0.069
// without their dabs, and with these limits 7,099 of 59,630 pairs of strokes are twins.
const TWIN_SHAPE_LIMIT = 0.09;
const TWIN_LENGTH_RATIO = 1.7;

// True if the textbook strokes `a` and `b` ([[x, y], ...]) are twins.
export function areTwins(a, b) {
  const versionsOf = (median) => {
    const points = toPoints(median);
    return points.length >= 3 ? [points, points.slice(1)] : [points];
  };
  return versionsOf(a).some((one) =>
    versionsOf(b).some((other) => {
      const ratio = lineLength(one) / lineLength(other);
      return (
        ratio < TWIN_LENGTH_RATIO && ratio > 1 / TWIN_LENGTH_RATIO && shapeDifference(resample(one), resample(other)) < TWIN_SHAPE_LIMIT
      );
    }),
  );
}

// ---- A dot written steeply down ----
//
// The mainland shape of some dots (altShapes in charData.js: the dot under
// 人 in 食 and 飠, the dots of 雨, of 今) runs only 20° to 50° below level,
// and a shape more than about 20° off is refused (SHAPE_TOLERANCE). Many
// write such a dot steeply down (the owner, 2026-11-04: 飽's dot refused).
// So a dot also has steep shapes: the same length, around the same middle,
// turned to these directions. Each covers about 20° either side, so the two
// cover from about 40° to straight down.
const DOT_MAX_LENGTH = 180; // longer is a stroke, not a dot
const DOT_DIRECTIONS = [-55, -5]; // a dot going down-right, in degrees
const STEEP_DOT_DIRECTIONS = [-60, -85];

// The dot `median` ([[x, y], ...]) turned steeply down, as middle lines;
// [] if it is no dot going down-right.
export function steepDotsOf(median) {
  const points = toPoints(median);
  const [start, end] = [points[0], points[points.length - 1]];
  const length = lineLength(points);
  if (length > DOT_MAX_LENGTH || !isBetween(directionOf(start, end), DOT_DIRECTIONS)) {
    return [];
  }
  const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  return STEEP_DOT_DIRECTIONS.map((degrees) => {
    const angle = (degrees * Math.PI) / 180;
    const [dx, dy] = [(Math.cos(angle) * length) / 2, (Math.sin(angle) * length) / 2];
    return [
      [middle.x - dx, middle.y - dy],
      [middle.x, middle.y],
      [middle.x + dx, middle.y + dy],
    ];
  });
}

// ---- Keeping track of two stroke orders ----
//
// Some characters have two accepted stroke orders (see `altOrder` in
// charData.js). While such a character is being written, quiz.js keeps a
// `sequence`: all the stroke numbers, in the order it currently expects them.
// The first `written` of them are already on the page.

// Returns the strokes still to be written, in the order of the *other*
// accepted stroke order, or null if there is nothing to choose between right
// now. That is the case when:
//   - both orders expect the same stroke next, or
//   - the strokes written so far are partway through a stretch where the two
//     orders differ. Having started such a stretch in one order, you have to
//     finish it in that order; anything else would be a mix of the two that
//     neither standard describes.
//
// sequence: all stroke numbers in the order currently expected
// written:  how many of them have been written
// altOrder: the character's second order, or null/undefined if it has none
export function remainingInOtherOrder(sequence, written, altOrder) {
  if (!altOrder) {
    return null;
  }
  const done = new Set(sequence.slice(0, written));
  // The standard order is simply the stroke numbers counting up, so its first
  // `written` strokes are the numbers below `written`.
  const startOfStandard = sequence.map((stroke, index) => index).slice(0, written);
  const startOfAlternative = altOrder.slice(0, written);
  const sameStrokes = (strokes) => strokes.every((stroke) => done.has(stroke));
  if (!sameStrokes(startOfStandard) || !sameStrokes(startOfAlternative)) {
    return null; // partway through a differing stretch
  }

  // Both orders have the same strokes left; only their sequence may differ.
  const remaining = sequence.slice(written);
  const standard = [...remaining].sort((a, b) => a - b);
  const alternative = altOrder.slice(written);
  const followingStandard = remaining.every((stroke, i) => stroke === standard[i]);
  const other = followingStandard ? alternative : standard;
  return other.length > 0 && other[0] !== remaining[0] ? other : null;
}

// The last point, at or before `written` strokes, where the strokes written
// were a complete beginning of both orders: the same strokes, whichever order
// they came in. Everything written since then lies inside one stretch where
// the two orders differ. Returns that number of strokes (0 if only the very
// start qualifies).
export function lastSyncPoint(sequence, written, altOrder) {
  for (let count = written; count > 0; count--) {
    const done = new Set(sequence.slice(0, count));
    const isBeginningOf = (order) => order.slice(0, count).every((stroke) => done.has(stroke));
    const standard = sequence.map((stroke, index) => index);
    if (isBeginningOf(standard) && isBeginningOf(altOrder)) {
      return count;
    }
  }
  return 0;
}

// True if `sequence` is the standard order: stroke numbers counting up.
export function isStandardOrder(sequence) {
  return sequence.every((stroke, position) => stroke === position);
}
