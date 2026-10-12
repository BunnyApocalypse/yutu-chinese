// Small helpers for working with lines: lists of { x, y } points, as drawn by
// a finger or as the middle line of a textbook stroke. Shared by the files
// that compare drawn strokes with textbook ones.
//
// Nothing here touches the page, so it also runs in Node for the tests and
// the data preparation script.

// Number of evenly spaced points lines are reduced to before being compared.
export const SAMPLE_COUNT = 32;

// Turns a middle line from the stroke data ([[x, y], ...]) into { x, y } points.
export function toPoints(median) {
  return median.map(([x, y]) => ({ x, y }));
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function lineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += distance(points[i - 1], points[i]);
  }
  return total;
}

// Returns `count` points spaced evenly along the line. A finger produces many
// points where it moves slowly and few where it moves fast; this evens that
// out so two lines can be compared point by point.
export function resample(points, count = SAMPLE_COUNT) {
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
  // Rounding can leave the list a point short; fill up with the end point so
  // the result always has exactly `count` points.
  while (result.length < count) {
    result.push(points[points.length - 1]);
  }
  return result;
}

// The average distance between two lines, point by point. Both must have the
// same number of points.
export function averageDistance(lineA, lineB) {
  let total = 0;
  for (let i = 0; i < lineA.length; i++) {
    total += distance(lineA[i], lineB[i]);
  }
  return total / lineA.length;
}

// The shape of a line with its position and size taken away: moved so it
// starts at (0, 0) and scaled so its length is 1.
export function shapeOf(points) {
  const start = points[0];
  const length = lineLength(points) || 1;
  return points.map((point) => ({
    x: (point.x - start.x) / length,
    y: (point.y - start.y) / length,
  }));
}
