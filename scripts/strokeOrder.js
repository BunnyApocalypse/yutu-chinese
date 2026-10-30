// Works out whether a character's strokes are written in a different order in
// the two stroke data sets.
//
// The Taiwan set follows the stroke order of Taiwan's Ministry of Education
// (MOE). The big set follows the mainland order. For some characters the two
// have exactly the same strokes in a different sequence: 學 begins with the
// 爻 in the MOE order and with the left-hand part in the mainland order. The
// app accepts either order for those characters, and this file is how it
// finds out what the second order is.
//
// Used by copy-char-data.js when the stroke data is prepared.

import { toPoints, resample, averageDistance } from '../src/lines.js';

// Two strokes count as the same stroke if their middle lines are, on average,
// no further apart than this (on the data's 1024-unit grid). Comparing point
// by point from start to end means direction has to agree too.
const SAME_STROKE_DISTANCE = 60;

// taiwanEntry, bigSetEntry: stroke data for the same character from each set
//                           (objects with a `medians` list).
//
// Returns the mainland order as a list of Taiwan stroke numbers: [4, 5, 0, ...]
// means "the mainland order starts with what the Taiwan set calls stroke 4".
// Returns null if the order is the same, or if the two sets don't clearly
// contain the same strokes. When in doubt it returns null, so that only the
// MOE order applies.
export function findAlternativeOrder(taiwanEntry, bigSetEntry) {
  const count = taiwanEntry.medians.length;
  if (bigSetEntry.medians.length !== count) {
    return null;
  }
  const taiwanLines = taiwanEntry.medians.map((median) => resample(toPoints(median)));
  const bigSetLines = bigSetEntry.medians.map((median) => resample(toPoints(median)));

  // apart[b][t]: how far big-set stroke b is from Taiwan stroke t.
  const apart = bigSetLines.map((bigSetLine) =>
    taiwanLines.map((taiwanLine) => averageDistance(bigSetLine, taiwanLine)),
  );
  const nearestIndex = (numbers) => numbers.indexOf(Math.min(...numbers));

  const order = [];
  for (let b = 0; b < count; b++) {
    const t = nearestIndex(apart[b]);
    if (apart[b][t] > SAME_STROKE_DISTANCE) {
      return null; // this stroke has no counterpart: the shapes differ
    }
    // The pairing must hold from the other side as well: of all big-set
    // strokes, this one must be the nearest to Taiwan stroke t.
    const backToB = nearestIndex(apart.map((row) => row[t]));
    if (backToB !== b) {
      return null;
    }
    order.push(t);
  }

  const isSameOrder = order.every((t, position) => t === position);
  return isSameOrder ? null : order;
}

// ---- Strokes written in another shape ----
//
// Many strokes are written in a different shape in the two sets, in the same
// place: the stroke under 人 in 食 is nearly flat in the Taiwan standard and a
// dot in the mainland form; so is the last stroke of the 𠂉 in 監, and the top
// of 戶 is a ノ in one and a dot in the other (the owner, 2026-10-30, used to
// the mainland shapes). The app accepts both shapes, as it accepts both
// stroke orders, and this is how it finds the second shape.

// Two strokes are taken for the same stroke written in another shape if
// their middle points are no further apart than this, each is the other's
// nearest, and the second shape is not all but another stroke of the
// character.
const SAME_PLACE_DISTANCE = 80;
// A second shape is only kept if it runs in a direction (from its start to
// its end) at least this many degrees from the Taiwan stroke's: otherwise it
// is the same stroke, refused only for some detail (the short stroke in 藍's
// 臣, with a little hook in the big set, 3° apart). 食's dot and flat stroke
// are 43° apart.
const OTHER_SHAPE_MIN_TURN = 20;

function directionOf(line) {
  const [start, end] = [line[0], line[line.length - 1]];
  return (Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI;
}

function turnBetween(a, b) {
  const turn = Math.abs(directionOf(a) - directionOf(b)) % 360;
  return Math.min(turn, 360 - turn);
}

const middleOf = (line) => line[Math.floor(line.length / 2)];
const apartBy = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// taiwanEntry, bigSetEntry: as for findAlternativeOrder.
// fits(points, median): whether a stroke drawn along `points` would be
//   accepted as the stroke whose middle line is `median` (fitsStroke in
//   src/strokeMatch.js, at the app's leniency).
//
// Returns { strokeNum: median } for the Taiwan strokes the big set writes in
// a shape that would not be accepted for them, with the big set's middle
// line, or null if there are none.
export function findAlternativeShapes(taiwanEntry, bigSetEntry, fits) {
  const count = taiwanEntry.medians.length;
  if (bigSetEntry.medians.length !== count) {
    return null;
  }
  const middles = (entry) => entry.medians.map((median) => middleOf(resample(toPoints(median))));
  const taiwanMiddles = middles(taiwanEntry);
  const bigSetMiddles = middles(bigSetEntry);
  const nearest = (point, others) => {
    const distances = others.map((other) => apartBy(point, other));
    return distances.indexOf(Math.min(...distances));
  };
  const shapes = {};
  for (let t = 0; t < count; t++) {
    const b = nearest(taiwanMiddles[t], bigSetMiddles);
    if (nearest(bigSetMiddles[b], taiwanMiddles) !== t || apartBy(taiwanMiddles[t], bigSetMiddles[b]) > SAME_PLACE_DISTANCE) {
      continue;
    }
    const points = toPoints(bigSetEntry.medians[b]);
    if (fits(points, taiwanEntry.medians[t])) {
      continue; // the same stroke, or near enough to pass already
    }
    if (turnBetween(points, toPoints(taiwanEntry.medians[t])) < OTHER_SHAPE_MIN_TURN) {
      continue;
    }
    // Not where it would be all but the same as another stroke (the app
    // also checks, while writing, that the stroke drawn lies nearer this
    // shape than any stroke still to come).
    const line = resample(points);
    if (taiwanEntry.medians.some((median, other) => other !== t && averageDistance(line, resample(toPoints(median))) <= SAME_STROKE_DISTANCE)) {
      continue;
    }
    shapes[t] = bigSetEntry.medians[b];
  }
  return Object.keys(shapes).length > 0 ? shapes : null;
}
