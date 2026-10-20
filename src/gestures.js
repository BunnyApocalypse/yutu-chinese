// Gestures on the writing area (the owner, 2026-10-15, as in Skritter):
//
//   a long hold, with the finger or pen kept still, shows the next stroke
//   as a hint;
//   a quick swipe straight up wipes what is written and starts the character
//   again.
//
// Everything else drawn on the area is a stroke. This file only decides what
// a touch was; src/quiz.js, which talks to Hanzi Writer, acts on it.

// A hold: the finger or pen stays down this long...
export const HOLD_MS = 500;
// ...without moving further than this from where it landed, in pixels. A
// finger always wobbles a little. A dot (點) moves further and is over in
// well under HOLD_MS, so it stays a stroke.
export const HOLD_STILLNESS_PX = 12;

// A swipe up must rise by at least this share of the writing area's height
// (the owner, 2026-10-20: half was too tall, the owner's own swipes rising
// 36 to 40%)...
const SWIPE_MIN_RISE_SHARE = 1 / 3;
// ...or by this much when the stroke expected next itself goes steeply up,
// as the rising stroke (提) of 氵 in 滿 does: then a big, quick 提 must not
// wipe the character, which in Skritter it can (the owner, 2026-10-15).
// Half is above the tallest such stroke written a fifth bigger than the
// stroke data's box (0.48), itself bigger than the app draws it (the owner,
// 2026-10-20: three quarters failed the owner's own swipes).
const SWIPE_MIN_RISE_SHARE_STRICT = 1 / 2;
// ...and stay near vertical: for each unit it rises, it may drift at most
// this far sideways (about 22 degrees from straight up).
//
// The rising stroke (提) of 氵 in a tall character (滿, 灣) is nearly as
// steep, but short: at most 0.4 of the character's height, in any character
// of either stroke data set, so about 0.35 of the writing area as the app
// draws it; only 3 of all strokes reach a third. They are guarded by the
// stricter share above whenever they are the stroke expected next.
// tests/gestures.test.js tries every stroke.
const SWIPE_MAX_DRIFT = 0.4;
// It may first go down below where it started by at most this share of its
// rise, so that a stroke going down and back up is not taken for one.
const SWIPE_MAX_DIP_SHARE = 0.1;
// ...and be quick: from the finger landing to its lifting, at most this many
// milliseconds (the owner, 2026-10-20, after a tester's slow line upward
// wiped the character). The owner's own swipes take 120 to 150 ms; a line
// drawn on purpose takes longer, and is graded as a stroke.
export const SWIPE_MAX_MS = 300;

// True if a stroke from the stroke data goes steeply up: it ends higher than
// it starts, and rises more than it goes sideways (steeper than 45 degrees).
// `median` is the stroke's [x, y] points as in the stroke data, where y grows
// upward. A horizontal stroke (橫) often rises a little, but far less steeply.
export function risesSteeply(median) {
  const [startX, startY] = median[0];
  const [endX, endY] = median[median.length - 1];
  const rise = endY - startY;
  return rise > 0 && Math.abs(endX - startX) < rise;
}

// True if the points drawn are a swipe up. `points` are { x, y } in screen
// pixels (y grows downward), `areaSize` the writing area's height in pixels.
// `strict` asks for a longer swipe, for when the stroke expected next rises
// steeply (risesSteeply). `durationMs` is how long the touch lasted (left
// out, the shape alone is looked at).
export function isSwipeUp(points, areaSize, strict = false, durationMs = 0) {
  if (points.length < 2 || durationMs > SWIPE_MAX_MS) {
    return false;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const rise = first.y - last.y;
  const minRise = strict ? SWIPE_MIN_RISE_SHARE_STRICT : SWIPE_MIN_RISE_SHARE;
  if (rise < areaSize * minRise) {
    return false;
  }
  if (Math.abs(last.x - first.x) > rise * SWIPE_MAX_DRIFT) {
    return false;
  }
  const lowest = Math.max(...points.map((point) => point.y));
  return lowest - first.y <= rise * SWIPE_MAX_DIP_SHARE;
}

// TEMPORARY (the owner, 2026-10-20, while trying out SWIPE_MAX_MS on the
// tablet; remove before a release): a line saying how an upward touch
// measured against each rule of isSwipeUp, shown by quiz.js. Null for a touch
// that hardly rose, which nobody meant as a swipe.
export function describeSwipe(points, areaSize, strict, durationMs) {
  if (points.length < 2) {
    return null;
  }
  const first = points[0];
  const last = points[points.length - 1];
  const rise = first.y - last.y;
  if (rise < areaSize * 0.2) {
    return null;
  }
  const minRise = strict ? SWIPE_MIN_RISE_SHARE_STRICT : SWIPE_MIN_RISE_SHARE;
  const lean = (Math.atan(Math.abs(last.x - first.x) / rise) * 180) / Math.PI;
  const maxLean = (Math.atan(SWIPE_MAX_DRIFT) * 180) / Math.PI;
  const dip = Math.max(...points.map((point) => point.y)) - first.y;
  const mark = (ok) => (ok ? '✓' : '✕');
  const parts = [
    `rise ${Math.round((rise / areaSize) * 100)}% (≥ ${Math.round(minRise * 100)}%) ${mark(rise >= areaSize * minRise)}`,
    `lean ${Math.round(lean)}° (≤ ${Math.round(maxLean)}°) ${mark(Math.abs(last.x - first.x) <= rise * SWIPE_MAX_DRIFT)}`,
    `dip ${mark(dip <= rise * SWIPE_MAX_DIP_SHARE)}`,
    `${Math.round(durationMs)} ms (≤ ${SWIPE_MAX_MS}) ${mark(durationMs <= SWIPE_MAX_MS)}`,
  ];
  const verdict = isSwipeUp(points, areaSize, strict, durationMs) ? 'Swipe' : 'Not a swipe';
  return `${verdict}: ${parts.join(' · ')}`;
}
