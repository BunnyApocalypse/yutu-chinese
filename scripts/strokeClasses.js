// Sorts a stroke (its median line) into the five classes of the mainland stroke-order
// standard: 1 level (incl. rising), 2 down (incl. hooked), 3 down-left, 4 dot or
// down-right, 5 anything with a turn. A guess from the shape; the audit scripts use it
// (audit-stroke-order.js, audit-order-triage.js).

const length = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// Ramer-Douglas-Peucker: keeps only the points where the line really bends.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const [start, end] = [points[0], points[points.length - 1]];
  const span = length(start, end) || 1;
  let farthest = 0;
  let farthestIndex = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const cross = Math.abs(
      (end[0] - start[0]) * (start[1] - points[i][1]) - (start[0] - points[i][0]) * (end[1] - start[1]),
    );
    if (cross / span > farthest) {
      farthest = cross / span;
      farthestIndex = i;
    }
  }
  if (farthest <= tolerance) return [start, end];
  const left = simplify(points.slice(0, farthestIndex + 1), tolerance);
  const right = simplify(points.slice(farthestIndex), tolerance);
  return [...left.slice(0, -1), ...right];
}

// Degrees, 0 = right, 90 = up, -90 = down (the stroke data's y axis points up).
const angleOf = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
const turnBetween = (first, second) => {
  const turn = Math.abs(first - second) % 360;
  return turn > 180 ? 360 - turn : turn;
};

const LONG_SEGMENT = 90; // a turn counts only between two segments this long: the brush's
// entry dab and the little hook at the end of a down stroke are shorter
const MIN_TURN = 55; // degrees
const DOT_LENGTH = 150; // a stroke going down that is shorter than this is a dot, not a down stroke

export function strokeClass(median) {
  const line = simplify(median, 30);
  const segments = [];
  for (let i = 1; i < line.length; i++) {
    segments.push({
      length: length(line[i - 1], line[i]),
      angle: angleOf(line[i - 1], line[i]),
      end: line[i],
    });
  }
  const total = segments.reduce((sum, segment) => sum + segment.length, 0);
  const long = segments.filter((segment) => segment.length >= LONG_SEGMENT);

  // A turn between two long segments: a stroke with a corner (class 5), except the hook of
  // a down stroke (竖钩): the last segment, going left, under half as long as the stroke down.
  let endPoint = median[median.length - 1];
  for (let i = 1; i < long.length; i++) {
    if (turnBetween(long[i - 1].angle, long[i].angle) < MIN_TURN) continue;
    const isHook =
      i === long.length - 1 &&
      long[i - 1].angle >= -100 &&
      long[i - 1].angle <= -60 &&
      long[i].length < 0.5 * long[i - 1].length &&
      (long[i].angle >= 135 || long[i].angle <= -150);
    if (!isHook) return 5;
    endPoint = long[i - 1].end; // the direction is the stroke down, not the hook
  }

  // Otherwise the direction is from the start to the end (without a hook).
  const direction = angleOf(median[0], endPoint);

  if (direction > -8 && direction <= 75) return 1; // level, or rising
  if (direction < -100 || direction > 150) return 3; // down-left
  if (total >= DOT_LENGTH && direction >= -100 && direction <= -60) return 2; // down
  return 4; // a dot or down-right
}
