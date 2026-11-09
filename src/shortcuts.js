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
// Only pairs are handled, and one shortcut that changes the order: 艹 in 3
// strokes (see "艹 in three strokes" below). At the end, the big set's 艹 and
// 忄 are put in the Taiwan order for traditional writing, and 方 gets its
// ノ before its ㇆ as a second order in both scripts. Three or more
// strokes in one go, and other shortcuts that change the order of strokes
// or drop some, are not.
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
// longer of the two", and a forgotten dot would pass unnoticed. 145, not
// 150 (the owner, 2026-11-01): the short ノ of 亟 in the Taiwan 極 is 149,
// and is written joined to the ㇆ after it, as the big set has it. This
// made 4 more pairs of the Taiwan set joinable (受 節 顧 besides), 43 of the
// big set's 1,873, with still no misfires in tests/shortcuts.test.js.
const MIN_PART_LENGTH = 145;
// But two parts of much the same length (the shorter at least
// SIMILAR_PARTS_SHARE of the longer) may each be as short as this: neither is
// a dot beside a long stroke. For a small component, such as the 辶 of 隨,
// whose top is two parts of about 125 (the owner, 2026-10-24). Allowing this
// made 23 more pairs of the Taiwan set joinable (of 166), among them the
// 辶 of 遠 and 還, the two dots of 衤 in 衫 and 裡, and those of 雨.
const SHORT_PART_LENGTH = 115;
const SIMILAR_PARTS_SHARE = 0.5;

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
  const shorter = Math.min(lineLength(pair.first), lineLength(pair.rest));
  const longer = Math.max(lineLength(pair.first), lineLength(pair.rest));
  const longEnough =
    shorter >= MIN_PART_LENGTH * scale ||
    (shorter >= SHORT_PART_LENGTH * scale && shorter >= SIMILAR_PARTS_SHARE * longer);
  if (!longEnough) {
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

// ---- 艹 in three strokes ----
//
// The Taiwan standard writes 艹 in four strokes, as two 十: 丨 一 一 丨 (left
// upright, left half of the level stroke, right half, right upright). Most
// fonts, and the mainland, show it in three: one level stroke across, then the
// two uprights (the owner, 2026-10-30, writes it so). That is a join of the
// two halves plus a change of order, so quiz.js handles it apart from the
// pairs above: a level stroke written where the left upright or the left
// half is expected, that fits both halves joined, counts for both, and the
// uprights are expected after it.
//
// 艹 is found in the stroke data by its shape: four strokes in a row, an
// upright crossing a level stroke, then a level stroke going on from it and
// crossed by an upright, with nothing above them, or with a 丨 running down
// between the halves (垂). Found so in 27 of the Taiwan set's characters
// (花 茶 草 藍 萬 懂 貓 觀 郵 睡…), and nowhere else.

// Directions, in degrees, with y going up (charData.js): level is within
// this much of straight across; upright between these, going down (the left
// upright of 艹 leans, at about -65°, the right one at about -97°).
const LEVEL_WITHIN = 15;
const UPRIGHT_DIRECTIONS = [-105, -55];
// The right half may begin this far from where the left half ends (85 to
// 115 in the Taiwan set).
const MAX_HALVES_GAP = 150;
// An upright must reach this far above and below its level stroke.
const MIN_CROSSING = 30;
// An upright may stand this far past its level stroke's end rather than
// across it: the right upright of 觀, 警 and 護 is just left of the right
// half (about 40 units).
const UPRIGHT_PAST_END = 60;
// No other stroke reaches above the level strokes between their ends, less
// this much at each side (豸 of 貓 comes close on the left).
const SIDE_MARGIN = 40;

const angleOf = (median) => {
  const [start, end] = [median[0], median[median.length - 1]];
  return (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180) / Math.PI;
};
const isLevel = (median) => Math.abs(angleOf(median)) < LEVEL_WITHIN;
const isUpright = (median) => angleOf(median) > UPRIGHT_DIRECTIONS[0] && angleOf(median) < UPRIGHT_DIRECTIONS[1];
const heightOf = (median) => (median[0][1] + median[median.length - 1][1]) / 2;
const crosses = (upright, level) => {
  const middleX = (upright[0][0] + upright[upright.length - 1][0]) / 2;
  const [left, right] = [level[0][0], level[level.length - 1][0]].sort((a, b) => a - b);
  return (
    middleX > left - UPRIGHT_PAST_END &&
    middleX < right + UPRIGHT_PAST_END &&
    upright[0][1] > heightOf(level) + MIN_CROSSING &&
    upright[upright.length - 1][1] < heightOf(level) - MIN_CROSSING
  );
};

// The 十 十 of 垂 (郵, 睡, the lower part of 華) has a long 丨 running down
// between the two halves, and strokes above it; the owner writes its level
// stroke in one go too (2026-11-02). So strokes above don't matter where a
// 丨 crosses the level stroke between the halves, between the uprights.
const runsDownBetween = (median, leftUpright, rightUpright, level) => {
  const middleX = (median[0][0] + median[median.length - 1][0]) / 2;
  const [left, right] = [leftUpright, rightUpright].map((upright) => (upright[0][0] + upright[upright.length - 1][0]) / 2);
  return (
    isUpright(median) &&
    middleX > left &&
    middleX < right &&
    median[0][1] > level + MIN_CROSSING &&
    median[median.length - 1][1] < level - MIN_CROSSING
  );
};

// The stroke numbers at which a four-stroke 艹 begins in `charData` (its
// left upright), in the data's own order: [] for most characters.
export function grassTopsOf(charData) {
  const { medians } = charData;
  const found = [];
  for (let at = 0; at + 3 < medians.length; at++) {
    const [leftUpright, leftHalf, rightHalf, rightUpright] = medians.slice(at, at + 4);
    if (!isUpright(leftUpright) || !isLevel(leftHalf) || !isLevel(rightHalf) || !isUpright(rightUpright)) {
      continue;
    }
    const endOfLeft = leftHalf[leftHalf.length - 1];
    const gap = Math.hypot(rightHalf[0][0] - endOfLeft[0], rightHalf[0][1] - endOfLeft[1]);
    if (gap > MAX_HALVES_GAP || rightHalf[0][0] <= leftHalf[0][0]) {
      continue;
    }
    if (!crosses(leftUpright, leftHalf) || !crosses(rightUpright, rightHalf)) {
      continue;
    }
    const left = leftHalf[0][0] + SIDE_MARGIN;
    const right = rightHalf[rightHalf.length - 1][0] - SIDE_MARGIN;
    const level = Math.min(heightOf(leftHalf), heightOf(rightHalf));
    const onTop = medians.every(
      (median, strokeNum) =>
        (strokeNum >= at && strokeNum < at + 4) || median.every(([x, y]) => x < left || x > right || y < level),
    );
    const cutDownTheMiddle = medians.some(
      (median, strokeNum) =>
        (strokeNum < at || strokeNum >= at + 4) && runsDownBetween(median, leftUpright, rightUpright, level),
    );
    if (onTop || cutDownTheMiddle) {
      found.push(at);
    }
  }
  return found;
}

// ---- 艹 as 十 十, each 十 in turn ----
//
// The big set writes the four-stroke 艹 of its traditional characters (薦,
// 夢, 舊, 蓋, 蘭…; 111 not in the Taiwan set) as one 十 after the
// other: 丨 一 丨 一. Nobody writes it so (the owner, 2026-11-04, could not
// write 薦's 艹 at all), and in that order the three-stroke 艹 isn't found.
// So when writing traditional, charData.js puts it in the Taiwan order,
// 丨 一 一 丨 (inTaiwanOrder), and keeps the data's own order as the
// second accepted one (altOrder).
//
// Found as a 艹 (grassTopsOf) once the last two are swapped, whose left
// level stroke begins well left of its upright: in 叟 (嫂, 艘) and 臿 (插),
// the level strokes of the top begin at their uprights.

// The stroke numbers at which such a 艹 begins in `charData`: [] for most.
export function crossByCrossGrassOf(charData) {
  const { medians } = charData;
  const found = [];
  for (let at = 0; at + 3 < medians.length; at++) {
    const swapped = [...medians];
    [swapped[at + 2], swapped[at + 3]] = [medians[at + 3], medians[at + 2]];
    if (!grassTopsOf({ medians: swapped }).includes(at)) {
      continue;
    }
    const [leftUpright, leftHalf] = [medians[at], medians[at + 1]];
    const uprightX = (leftUpright[0][0] + leftUpright[leftUpright.length - 1][0]) / 2;
    if (leftHalf[0][0] < uprightX - MIN_CROSSING) {
      found.push(at);
    }
  }
  return found;
}

// ---- 忄 as 丶 丨 丶 ----
//
// Taiwan writes 忄 left dot, upright, right dot; the mainland writes both
// dots first. The Taiwan set has both orders for its characters (快, 情),
// but the big set has only the mainland one, so 愉 refused the Taiwan
// order (the owner, 2026-11-06). When writing traditional, charData.js adds
// the Taiwan order as altOrder. Unlike 艹, the data's own order stays the
// first: the strokes are then told apart by the long upright, not by a dot
// (handed to Hanzi Writer the other way round, a right dot written small was
// refused in the mainland order now and then, in 憶 and 懶, as fitsStroke
// judges the shape of a stroke that small more strictly than Hanzi Writer).
//
// Found as the first three strokes only: two short strokes going down, one
// ending left of a tall upright, one starting right of it and going right,
// both beside it: 167 characters of the big set, 157 of them not in the
// Taiwan set (愉 悅 惱 懶 憶…). Further in, the same test finds a few shapes
// that are no 忄 (in 赧 and 椭).

// How short each dot must be, as a share of the upright's height.
const HEART_DOT_SHARE = 0.3;
// How tall the upright must be at least.
const HEART_MIN_UPRIGHT = 400;

// True if `charData` begins with a 忄 written 丶 丶 丨.
export function startsWithMainlandHeart(charData) {
  if (charData.medians.length < 3) {
    return false;
  }
  const [left, right, upright] = charData.medians;
  const first = (median) => ({ x: median[0][0], y: median[0][1] });
  const last = (median) => ({ x: median[median.length - 1][0], y: median[median.length - 1][1] });
  const height = first(upright).y - last(upright).y;
  const uprightX = (first(upright).x + last(upright).x) / 2;
  const isUpright = height >= HEART_MIN_UPRIGHT && height > 3 * Math.abs(first(upright).x - last(upright).x);
  // Short, going down, its middle within the upright's height.
  const isDot = (median) => {
    const middleY = (first(median).y + last(median).y) / 2;
    return (
      distance(first(median), last(median)) < HEART_DOT_SHARE * height &&
      last(median).y < first(median).y &&
      middleY < first(upright).y &&
      middleY > last(upright).y
    );
  };
  return (
    isUpright &&
    isDot(left) &&
    isDot(right) &&
    last(left).x < uprightX &&
    first(right).x > uprightX &&
    last(right).x > first(right).x
  );
}

// ---- Handing the big set's characters over in the Taiwan order ----

// A copy of `charData` with each 艹 written 丨 一 丨 一 in the Taiwan order,
// 丨 一 一 丨, and a second accepted order (`altOrder`): the data's own for
// the 艹, the Taiwan 丶 丨 丶 for a 忄 written 丶 丶 丨. `charData` itself if
// it has neither. A 忄 alone is marked `altOrderIsTaiwan`, so a review says
// which order was used the right way round (in 懞, with both, the second
// order is a mix of the two).
export function inTaiwanOrder(charData) {
  const tops = crossByCrossGrassOf(charData);
  const heart = startsWithMainlandHeart(charData);
  if (tops.length === 0 && !heart) {
    return charData;
  }
  // order[newNumber] = the data's stroke number. Swapping two strokes is
  // undone by the same swap, so `order` is also the data's own order in the
  // new numbers.
  const order = charData.strokes.map((stroke, index) => index);
  for (const top of tops) {
    [order[top + 2], order[top + 3]] = [order[top + 3], order[top + 2]];
  }
  const altOrder = [...order];
  if (heart) {
    [altOrder[1], altOrder[2]] = [altOrder[2], altOrder[1]];
  }
  return {
    ...charData,
    strokes: order.map((strokeNum) => charData.strokes[strokeNum]),
    medians: order.map((strokeNum) => charData.medians[strokeNum]),
    ...(charData.radStrokes && { radStrokes: charData.radStrokes.map((strokeNum) => order.indexOf(strokeNum)) }),
    altOrder,
    ...(heart && tops.length === 0 && { altOrderIsTaiwan: true }),
  };
}

// ---- 方 with its ノ before its ㇆ ----
//
// Both sets write 方 丶 一 ㇆ ノ. Many native writers put the ノ before the ㇆
// (the owner, 2026-11-09, asked one who does), so that order is accepted
// too, wherever 方 stands (放, 房, 旁, 訪, 旅, 族, 遊…), in both scripts:
// charData.js adds it as altOrder (withFangInEitherOrder).
//
// Found by shape, as four strokes in a row: a short dot above a level
// stroke, then a ㇆ and a ノ both hanging from the level stroke, the ㇆ going
// right and turning down, the ノ going down and to the left of the ㇆. In
// the Taiwan set 13 characters, in the big set 88: every one Make Me a
// Hanzi lists with a 方 in it, and 贅, 聱 and 鏊, whose 敖 is written with
// a 方 in that set (tests/shortcuts.test.js).

// The dot is at most this share of the level stroke's length.
const FANG_DOT_SHARE = 0.75;
// The ㇆ goes right at least this share of the level stroke's length, then
// down at least FANG_TURN_DROP of it.
const FANG_TURN_RIGHT = 0.15;
const FANG_TURN_DROP = 0.25;
// The ノ ends at least this share of the level stroke's length left of
// where the ㇆ begins, and that much and more below where it begins itself.
const FANG_SWEEP_LEFT = 0.2;
const FANG_SWEEP_DROP = 0.3;

// The stroke numbers at which a 方 written 丶 一 ㇆ ノ begins: [] for most.
export function fangsOf(charData) {
  const { medians } = charData;
  const first = (median) => ({ x: median[0][0], y: median[0][1] });
  const last = (median) => ({ x: median[median.length - 1][0], y: median[median.length - 1][1] });
  const found = [];
  for (let at = 0; at + 3 < medians.length; at++) {
    const [dot, level, turn, sweep] = medians.slice(at, at + 4);
    const length = last(level).x - first(level).x;
    if (length <= 0 || !isLevel(level)) {
      continue;
    }
    const levelY = heightOf(level);
    const over = (x) => x > first(level).x && x < last(level).x;
    // The dot: short, going down, over the level stroke.
    const isDot =
      distance(first(dot), last(dot)) < FANG_DOT_SHARE * length &&
      last(dot).y < first(dot).y &&
      (first(dot).y + last(dot).y) / 2 > levelY &&
      over((first(dot).x + last(dot).x) / 2);
    // The ㇆: from under the level stroke, right as far as its corner, then down.
    const corner = turn.reduce((best, point) => (point[0] > best[0] ? point : best));
    const lowest = Math.min(...turn.map((point) => point[1]));
    const isTurn =
      first(turn).y < levelY &&
      over(first(turn).x) &&
      corner[0] - first(turn).x > FANG_TURN_RIGHT * length &&
      corner[1] - lowest > FANG_TURN_DROP * length;
    // The ノ: from under the level stroke, down to the left of the ㇆.
    const isSweep =
      first(sweep).y < levelY &&
      over(first(sweep).x) &&
      last(sweep).x < first(turn).x - FANG_SWEEP_LEFT * length &&
      last(sweep).y < first(sweep).y - FANG_SWEEP_DROP * length;
    if (isDot && isTurn && isSweep) {
      found.push(at);
    }
  }
  return found;
}

// A copy of `charData` whose second accepted order (`altOrder`) also has
// the ノ of each 方 before its ㇆; `charData` itself if it has no 方. With no
// second order before, the 方 is all that differs, which is marked
// `altOrderIsFang`, so a review says 'other' for the order used, not
// 'mainland'. With one (the 忄 of 愣 in traditional), the 方 joins it: the
// two orders part in separate places, and each place may be written either
// way (quiz.js, "Two accepted stroke orders"); the order a review notes is
// then the 忄's or the 艹's.
export function withFangInEitherOrder(charData) {
  const fangs = fangsOf(charData);
  if (fangs.length === 0) {
    return charData;
  }
  const altOrder = charData.altOrder ? [...charData.altOrder] : charData.strokes.map((stroke, index) => index);
  for (const at of fangs) {
    const turnAt = altOrder.indexOf(at + 2);
    // Only where the second order has the ㇆ and the ノ next to each other.
    if (altOrder[turnAt + 1] === at + 3) {
      [altOrder[turnAt], altOrder[turnAt + 1]] = [at + 3, at + 2];
    }
  }
  return { ...charData, altOrder, ...(!charData.altOrder && { altOrderIsFang: true }) };
}
