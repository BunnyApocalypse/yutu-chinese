// Handwriting shortcuts: two neighboring strokes written as a single stroke,
// e.g. the ㇇ and 亅 of 子 joined, so 子 takes 2 strokes instead of 3.
//
// Hanzi Writer only grades one drawn stroke against one textbook stroke, so it
// cannot recognize these. This file adds the missing check: "does this drawn
// stroke look like textbook strokes N and N+1 written in one go?". The textbook
// form keeps working as before, because Hanzi Writer still grades that.
//
// All coordinates here are in the character data's own units (see charData.js).

// For each character, the stroke numbers (counting from 0) where a shortcut
// may begin. 13 means "strokes 13 and 14 may be written as one".
//
// For now this is a hand-written list per character. Later it should become
// rules per component (e.g. "子 may always be 2 strokes") applied automatically.
const shortcutStarts = {
  學: [13],
};

// How far a drawn stroke may be from the joined reference and still count.
// Both are multiplied by the leniency setting passed in from quiz.js.
const END_TOLERANCE = 200; // how far off the start and end points may be
const AVERAGE_TOLERANCE = 130; // how far off the stroke may be on average

// A joined stroke must be at least this fraction of the reference's length.
// This is what tells "㇇ and 亅 in one go" apart from "just the ㇇".
const MIN_LENGTH_RATIO = 0.6;
const MAX_LENGTH_RATIO = 1.7;

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
    while (traveled + segment >= step && result.length < count - 1) {
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

// The middle line of textbook strokes `first` and `first + 1` as one line.
function joinedMedian(charData, first) {
  const toPoint = ([x, y]) => ({ x, y });
  const firstLine = charData.medians[first].map(toPoint);
  const secondLine = charData.medians[first + 1].map(toPoint);

  // The second stroke often begins with a small lead-in that nobody draws when
  // joining the two, so we skip ahead to its point nearest the end of the first.
  const endOfFirst = firstLine[firstLine.length - 1];
  let nearest = 0;
  for (let i = 1; i < secondLine.length; i++) {
    if (distance(secondLine[i], endOfFirst) < distance(secondLine[nearest], endOfFirst)) {
      nearest = i;
    }
  }
  return [...firstLine, ...secondLine.slice(nearest)];
}

// True if `drawnPoints` (a list of { x, y }) looks like strokes `strokeNum`
// and `strokeNum + 1` of `char` written as one stroke, and that pair is a
// known shortcut. `charData` is the character's stroke data.
export function isShortcutStroke(char, charData, strokeNum, drawnPoints, leniency) {
  const starts = shortcutStarts[char] || [];
  if (!starts.includes(strokeNum) || drawnPoints.length < 2) {
    return false;
  }

  const reference = joinedMedian(charData, strokeNum);

  const lengthRatio = lineLength(drawnPoints) / lineLength(reference);
  if (lengthRatio < MIN_LENGTH_RATIO || lengthRatio > MAX_LENGTH_RATIO) {
    return false;
  }

  const drawn = resample(drawnPoints, SAMPLE_COUNT);
  const target = resample(reference, SAMPLE_COUNT);

  const endTolerance = END_TOLERANCE * leniency;
  const last = SAMPLE_COUNT - 1;
  if (distance(drawn[0], target[0]) > endTolerance) return false;
  if (distance(drawn[last], target[last]) > endTolerance) return false;

  let total = 0;
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    total += distance(drawn[i], target[i]);
  }
  return total / SAMPLE_COUNT <= AVERAGE_TOLERANCE * leniency;
}
