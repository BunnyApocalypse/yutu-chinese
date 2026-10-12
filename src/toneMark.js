// Recognizes a tone mark drawn with a finger, stylus or mouse:
//
//   tone 1  ˉ  a level stroke, left to right
//   tone 2  ˊ  a stroke rising to the right
//   tone 3  ˇ  down, then up
//   tone 4  ˋ  a stroke falling to the right
//   neutral ·  a dot or a tap
//
// Plain calculation, no page, so it can be tested on its own. Points are
// { x, y } in screen pixels, where y grows downward.

import { lineLength, resample } from './lines.js';

// A mark no bigger than this share of the drawing area is a dot.
const DOT_SIZE_SHARE = 0.06;

// A stroke within this many degrees of horizontal is level (tone 1).
const LEVEL_WITHIN_DEGREES = 18;

// Steeper than this, a stroke is neither clearly rising nor clearly falling
// to the right, and is not recognized.
const STEEPEST_DEGREES = 82;

// For tone 3 the lowest point must lie this far below both ends, as a share
// of the mark's size, and must not be right at either end.
const DIP_DEPTH_SHARE = 0.2;
const DIP_FROM_END_SHARE = 0.15;

// A straight stroke may be at most this many times longer than the distance
// between its ends, and may stray from the line between them by at most this
// share of that distance.
const MAX_LENGTH_FOR_STRAIGHT = 1.6;
const MAX_BEND_FOR_STRAIGHT = 0.3;

// points:   the drawn stroke
// areaSize: the width of the area it was drawn in, in pixels
//
// Returns the tone (1 to 4, or 5 for neutral), or null if the stroke doesn't
// look like any tone mark, for example one drawn from right to left.
export function recognizeToneMark(points, areaSize) {
  if (points.length === 0) {
    return null;
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const size = Math.max(width, height);
  if (size <= areaSize * DOT_SIZE_SHARE) {
    return 5;
  }

  // Evenly spaced points, so a slow start or end doesn't count for more.
  const line = resample(points, 24);
  const start = line[0];
  const end = line[line.length - 1];

  // Tone 3: somewhere in the middle the stroke dips well below both ends.
  // (Lower on screen means a larger y.)
  let lowest = 0;
  line.forEach((point, index) => {
    if (point.y > line[lowest].y) {
      lowest = index;
    }
  });
  const fromEnd = Math.round(line.length * DIP_FROM_END_SHARE);
  const dipsInMiddle = lowest >= fromEnd && lowest <= line.length - 1 - fromEnd;
  const depth = Math.min(line[lowest].y - start.y, line[lowest].y - end.y);
  if (dipsInMiddle && depth >= size * DIP_DEPTH_SHARE && end.x > start.x) {
    return 3;
  }

  // Otherwise it should be one fairly straight stroke going to the right:
  // not much longer than the distance between its ends (as a stroke that
  // doubles back would be), and never far from the straight line between them
  // (as an arch would be).
  const across = end.x - start.x;
  const up = start.y - end.y;
  const direct = Math.hypot(across, up);
  if (across <= 0 || lineLength(line) > direct * MAX_LENGTH_FOR_STRAIGHT) {
    return null;
  }
  // The distance of a point from the line through start and end.
  const offLine = (point) =>
    Math.abs((point.x - start.x) * up + (point.y - start.y) * across) / direct;
  if (Math.max(...line.map(offLine)) > direct * MAX_BEND_FOR_STRAIGHT) {
    return null;
  }
  const degrees = (Math.atan2(up, across) * 180) / Math.PI;
  if (Math.abs(degrees) > STEEPEST_DEGREES) {
    return null;
  }
  if (Math.abs(degrees) <= LEVEL_WITHIN_DEGREES) {
    return 1;
  }
  return degrees > 0 ? 2 : 4;
}
