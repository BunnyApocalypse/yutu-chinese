// The little box at the top of 骨, written in more than one way.
//
// Inside the 冂 at the top of 骨 are two short strokes: a 丨 in the middle,
// and a level stroke beside its top. The two stroke data sets disagree on
// them:
//
//   - the big set (骨 itself, 滑, 骼, 髓…) writes them as one ㇕, the level
//     stroke on the left running into the 丨 (the mainland form);
//   - the Taiwan set writes them as two strokes, the level stroke to the
//     right of the 丨, but in 體 the 丨 comes first and in 髒 the level
//     stroke (and 體's level stroke runs from right to left).
//
// The owner writes the level stroke first, then the 丨 (2026-11-02), in
// every character with 骨, and the standard could not be confirmed. So when
// writing traditional, both orders are accepted, with the level stroke
// running left to right, and in the big set's characters, written first,
// on either side of the 丨. Each such way is a second form of the character (`altForms`),
// which src/quiz.js switches to where it parts from the data (otherFormFor),
// as for 充.
//
// Nothing here touches the page, so it is tested in Node
// (tests/innerBox.test.js).

// The characters with 骨 in them written in traditional (from
// data/makemeahanzi/dictionary.txt's decompositions; 骨 itself first).
export const BONE_CHARS = '骨滑猾骯骰骱骶骷骸骺骼髀髁髂髑髒髓體髕髖鶻';

// A stroke runs "mostly" one way when that way is at least this many times
// the other (髕's level stroke slants a little).
const MOSTLY = 1.5;

// How far outside the box of the 冂 a stroke inside it may reach, in the
// data's units (1024 across).
const INSIDE_SLACK = 20;

const start = (median) => median[0];
const end = (median) => median[median.length - 1];

// A 丨: running mostly downward (y runs upward in the data).
function isUpright(median) {
  const [dx, dy] = [end(median)[0] - start(median)[0], end(median)[1] - start(median)[1]];
  return -dy > MOSTLY * Math.abs(dx);
}

// A level stroke, either way.
function isLevel(median) {
  const [dx, dy] = [end(median)[0] - start(median)[0], end(median)[1] - start(median)[1]];
  return Math.abs(dx) > MOSTLY * Math.abs(dy);
}

// Where a ㇕ turns: its top right point.
function cornerIndex(median) {
  const sums = median.map(([x, y]) => x + y);
  return sums.indexOf(Math.max(...sums));
}

// A ㇕: across to the right, then down.
function isTurn(median) {
  const at = cornerIndex(median);
  const corner = median[at];
  return at > 0 && at < median.length - 1 && isLevel([start(median), corner]) && corner[0] > start(median)[0] &&
    isUpright([corner, end(median)]);
}

// Whether every point of each median lies in the box of the `around` medians.
function inside(medians, around) {
  const points = around.flat();
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const [left, right] = [Math.min(...xs) - INSIDE_SLACK, Math.max(...xs) + INSIDE_SLACK];
  const [bottom, top] = [Math.min(...ys) - INSIDE_SLACK, Math.max(...ys) + INSIDE_SLACK];
  return medians.flat().every(([x, y]) => x >= left && x <= right && y >= bottom && y <= top);
}

// Where the box is in a character's data: { at, oneStroke }, `at` being the
// first stroke inside the 冂 (after its 丨 and ㇕), `oneStroke` true for the
// big set's ㇕. Null if the character has no such box.
export function findInnerBox(data) {
  const { medians } = data;
  for (let at = 2; at < medians.length; at++) {
    const frame = [medians[at - 2], medians[at - 1]];
    if (!isUpright(frame[0]) || !isTurn(frame[1])) {
      continue;
    }
    if (isTurn(medians[at]) && inside([medians[at]], frame)) {
      return { at, oneStroke: true };
    }
    const pair = medians.slice(at, at + 2);
    if (pair.length === 2 && inside(pair, frame) &&
      ((isUpright(pair[0]) && isLevel(pair[1])) || (isLevel(pair[0]) && isUpright(pair[1])))) {
      return { at, oneStroke: false };
    }
  }
  return null;
}

// The same middle line, from its other end.
const reversed = (median) => [...median].reverse();

// A level middle line made to run left to right.
const leftToRight = (median) => (start(median)[0] > end(median)[0] ? reversed(median) : median);

// A second form: the data with the strokes from `at` on replaced by
// `pieces` ({ stroke, median } each) where `count` strokes were, and
// `altShapes` for its strokes (given as { offset from `at`: median }) with
// the data's own carried over. `from` is the first stroke where it differs.
function formWith(data, at, count, pieces, extraShapes = {}) {
  const strokes = [...data.strokes.slice(0, at), ...pieces.map((piece) => piece.stroke), ...data.strokes.slice(at + count)];
  const medians = [...data.medians.slice(0, at), ...pieces.map((piece) => piece.median), ...data.medians.slice(at + count)];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let from = at;
  while (from < at + pieces.length && from < at + count && same(medians[from], data.medians[from])) {
    from += 1;
  }
  // The data's strokes in another shape (altShapes) keep theirs: one before
  // the box keeps its number, one after it moves with the strokes after it.
  // Inside the box, the shapes given here.
  const shift = pieces.length - count;
  const altShapes = {};
  for (const [strokeNum, median] of Object.entries(data.altShapes ?? {})) {
    const number = Number(strokeNum);
    if (number < at) {
      altShapes[number] = median;
    } else if (number >= at + count) {
      altShapes[number + shift] = median;
    }
  }
  for (const [offset, median] of Object.entries(extraShapes)) {
    altShapes[at + Number(offset)] = median;
  }
  const form = { strokes, medians, from };
  if (Object.keys(altShapes).length > 0) {
    form.altShapes = altShapes;
  }
  return form;
}

// The other ways to write the box of a character with 骨, as second forms
// ({ strokes, medians, from, altShapes? }; see formWith), or none: for any
// other character, or one whose box isn't found.
export function innerBoxForms(char, data) {
  if (!BONE_CHARS.includes(char)) {
    return [];
  }
  const box = findInnerBox(data);
  if (!box) {
    return [];
  }
  const { at } = box;
  if (box.oneStroke) {
    // The big set's ㇕, cut where it turns: the level stroke on the left,
    // and the 丨. Each keeps the ㇕'s whole printed shape, so the printed
    // character looks the same (the hint flashes the whole ㇕). The level
    // stroke may also be on the right of the 丨 as in the Taiwan set, as
    // long as the left one, at the 丨's top; written after the 丨, it is
    // only taken there (the Taiwan order, in the Taiwan shape): on the left
    // after the 丨 is neither form, and at half size was refused anyway.
    const turn = data.medians[at];
    const cut = cornerIndex(turn);
    const levelLeft = turn.slice(0, cut + 1);
    const upright = turn.slice(cut);
    const [cornerX, cornerY] = turn[cut];
    const width = cornerX - start(turn)[0];
    const levelRight = [[cornerX, cornerY], [cornerX + width, cornerY]];
    const outline = data.strokes[at];
    return [
      formWith(data, at, 1, [{ stroke: outline, median: levelLeft }, { stroke: outline, median: upright }], { 0: levelRight }),
      formWith(data, at, 1, [{ stroke: outline, median: upright }, { stroke: outline, median: levelRight }]),
    ];
  }
  // The Taiwan set's two strokes: each order, the level stroke left to right.
  const pair = [at, at + 1].map((strokeNum) => ({ stroke: data.strokes[strokeNum], median: data.medians[strokeNum] }));
  const [level, upright] = isUpright(pair[0].median) ? [pair[1], pair[0]] : [pair[0], pair[1]];
  const levelForward = { ...level, median: leftToRight(level.median) };
  return [
    formWith(data, at, 2, [levelForward, upright]),
    formWith(data, at, 2, [upright, levelForward]),
  ].filter((form) => form.from < at + 2);
}
