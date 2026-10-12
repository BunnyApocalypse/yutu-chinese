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
