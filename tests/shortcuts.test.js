// Tests for recognizing two strokes written as one (src/shortcuts.js).
//
// Most of this is a simulation: for every joinable pair in the characters of
// the test word list, it "draws" strokes that are shifted, resized and
// shaky, and checks how the recognizer judges them.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  isJoinable,
  isShortcutStroke,
  joinedLine,
  grassTopsOf,
  crossByCrossGrassOf,
  startsWithMainlandHeart,
  inTaiwanOrder,
  fangsOf,
  withFangInEitherOrder,
} from '../src/shortcuts.js';
import { applyFrame } from '../src/frame.js';
import { parseWordList } from '../src/wordList.js';

// The same leniency the app uses (LENIENCY in src/quiz.js).
const LENIENCY = 1.8;

// ---- Loading stroke data the way the app chooses it ----

const taiwanData = new Map();
for (const line of fs.readFileSync('data/animcjk/graphicsZhHant.txt', 'utf8').split('\n')) {
  if (line.trim() !== '') {
    const entry = JSON.parse(line);
    taiwanData.set(entry.character, entry);
  }
}

function bigSetData(char) {
  return JSON.parse(fs.readFileSync(`node_modules/hanzi-writer-data/${char}.json`, 'utf8'));
}

// Traditional uses the Taiwan set where it has the character; see src/charData.js.
function charData(char, script) {
  if (script === 'traditional' && taiwanData.has(char)) {
    return taiwanData.get(char);
  }
  return bigSetData(char);
}

// ---- Making imperfect strokes ----

// A stand-in for Math.random() that gives the same numbers on every run, so a
// failing test fails the same way each time.
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Each entry: resize around the starting point, shift sideways and up, and
// shake every point by up to `jitter`.
const VARIATIONS = [
  { scale: 1, dx: 0, dy: 0, jitter: 0 },
  { scale: 0.85, dx: 30, dy: -20, jitter: 10 },
  { scale: 1.15, dx: -30, dy: 25, jitter: 10 },
  { scale: 1, dx: 40, dy: 40, jitter: 15 },
  { scale: 0.9, dx: -40, dy: -30, jitter: 15 },
  { scale: 0.8, dx: 0, dy: 0, jitter: 8 },
  { scale: 1.2, dx: 0, dy: 0, jitter: 8 },
  // Much too small or too big. A first stroke drawn too big is the hard case:
  // it reaches about as far as the joined pair would.
  { scale: 0.7, dx: 0, dy: 0, jitter: 10 },
  { scale: 1.4, dx: 0, dy: 0, jitter: 10 },
  { scale: 0.75, dx: 40, dy: -40, jitter: 20 },
  { scale: 1.25, dx: -50, dy: 30, jitter: 20 },
];

function vary(points, { scale, dx, dy, jitter }, random) {
  const start = points[0];
  return points.map((point) => ({
    x: start.x + (point.x - start.x) * scale + dx + (random() * 2 - 1) * jitter,
    y: start.y + (point.y - start.y) * scale + dy + (random() * 2 - 1) * jitter,
  }));
}

const toPoints = (median) => median.map(([x, y]) => ({ x, y }));

// Every joinable pair in the characters of the test word list, in both scripts.
function joinablePairsInWordList() {
  const words = parseWordList(fs.readFileSync('tests/words.tsv', 'utf8'));
  const pairs = [];
  for (const script of ['traditional', 'simplified']) {
    const chars = new Set(words.flatMap((word) => Array.from(word[script])));
    for (const char of chars) {
      const data = charData(char, script);
      for (let strokeNum = 0; strokeNum < data.medians.length - 1; strokeNum++) {
        if (isJoinable(data, strokeNum)) {
          pairs.push({ char, script, data, strokeNum });
        }
      }
    }
  }
  return pairs;
}

// ---- Tests ----

test('the hook of 子 may be joined wherever 子 appears', () => {
  // For each character: the stroke number (counting from 0) of the ㇇.
  const expected = { 子: 0, 字: 3, 好: 3, 孩: 0, 學: 13, 了: 0 };
  for (const [char, strokeNum] of Object.entries(expected)) {
    assert.ok(isJoinable(charData(char, 'traditional'), strokeNum), `${char} in the Taiwan set`);
    assert.ok(isJoinable(bigSetData(char), strokeNum), `${char} in the big set`);
  }
});

test('a pair is joinable at any size the character is written', () => {
  // The character moved into a frame at 0.6 of its size, as quiz.js does
  // for small writing: the same pairs, given the scale.
  const small = { scale: 0.6, dx: 0.4 * 512, dy: 0.4 * 388 };
  for (const char of '這子學道好') {
    const data = charData(char, 'traditional');
    const framed = applyFrame(data, small);
    for (let strokeNum = 0; strokeNum < data.medians.length - 1; strokeNum++) {
      assert.equal(isJoinable(framed, strokeNum, small.scale), isJoinable(data, strokeNum), `${char} stroke ${strokeNum}`);
    }
  }
  // The top of 辶 in 這, written in one go at that size (the owner, 2026-10-24).
  const zhe = charData('這', 'traditional');
  const joined = joinedLine(applyFrame(zhe, small), 8);
  assert.ok(isShortcutStroke(applyFrame(zhe, small), 8, joined, LENIENCY, small.scale));
});

test('the top of 辶 may be joined even where 辶 is small', () => {
  // The Taiwan form: the dot, then the top in two strokes, then the long one.
  for (const char of '隨這遠還') {
    const data = charData(char, 'traditional');
    const top = data.medians.length - 3;
    assert.ok(isJoinable(data, top), char);
    assert.ok(isShortcutStroke(data, top, joinedLine(data, top), LENIENCY), char);
  }
});

test('the short ノ of 亟 may be joined to the ㇆ after it', () => {
  // In the Taiwan 極 they are two strokes, the ノ 149 units long; the big set
  // has them as one (the owner, 2026-11-01).
  const ji = charData('極', 'traditional');
  assert.ok(isJoinable(ji, 5));
  assert.ok(isShortcutStroke(ji, 5, joinedLine(ji, 5), LENIENCY));
});

test('strokes that do not meet end to start are not joinable', () => {
  const kou = bigSetData('口');
  for (let strokeNum = 0; strokeNum < kou.medians.length; strokeNum++) {
    assert.equal(isJoinable(kou, strokeNum), false, `口 stroke ${strokeNum}`);
  }
  // The horizontal of a Taiwan-style 艹 is two strokes in a straight line.
  // Joined, they look the same as the first one alone, so they are left out.
  const ying = charData('英', 'traditional');
  assert.equal(isJoinable(ying, 1), false, '英 stroke 1');
  // The last stroke of a character has nothing after it to join.
  const zi = bigSetData('子');
  assert.equal(isJoinable(zi, zi.medians.length - 1), false);
});

test('a joined stroke where the pair is not joinable is rejected', () => {
  const kou = bigSetData('口');
  const bothStrokes = [...toPoints(kou.medians[0]), ...toPoints(kou.medians[1])];
  assert.equal(isShortcutStroke(kou, 0, bothStrokes, LENIENCY), false);
});

test('the first stroke alone is never taken as the joined pair', () => {
  const random = makeRandom(1);
  const pairs = joinablePairsInWordList();
  assert.ok(pairs.length > 30, 'expected a good number of joinable pairs to test');
  for (const { char, script, data, strokeNum } of pairs) {
    const firstAlone = toPoints(data.medians[strokeNum]);
    for (const variation of VARIATIONS) {
      const drawn = vary(firstAlone, variation, random);
      assert.equal(
        isShortcutStroke(data, strokeNum, drawn, LENIENCY),
        false,
        `${char} (${script}) stroke ${strokeNum}, variation ${JSON.stringify(variation)}`,
      );
    }
  }
});

test('the second stroke alone is never taken as the joined pair', () => {
  // Otherwise forgetting the first stroke of a pair would go unnoticed.
  const random = makeRandom(4);
  for (const { char, script, data, strokeNum } of joinablePairsInWordList()) {
    const secondAlone = toPoints(data.medians[strokeNum + 1]);
    for (const variation of VARIATIONS) {
      const drawn = vary(secondAlone, variation, random);
      assert.equal(
        isShortcutStroke(data, strokeNum, drawn, LENIENCY),
        false,
        `${char} (${script}) stroke ${strokeNum + 1}, variation ${JSON.stringify(variation)}`,
      );
    }
  }
});

test('a dot followed by a long stroke is not a joinable pair', () => {
  // The last two strokes of 錢 in the Taiwan set: a short dot, then a long
  // stroke starting right next to it.
  const qian = charData('錢', 'traditional');
  assert.equal(isJoinable(qian, 14), false);
});

test('a joined stroke is nearly always recognized', () => {
  const random = makeRandom(2);
  let trials = 0;
  const missed = [];
  for (const { char, script, data, strokeNum } of joinablePairsInWordList()) {
    const joined = joinedLine(data, strokeNum);
    for (const variation of VARIATIONS) {
      trials += 1;
      if (!isShortcutStroke(data, strokeNum, vary(joined, variation, random), LENIENCY)) {
        missed.push(`${char} (${script}) stroke ${strokeNum}`);
      }
    }
  }
  assert.ok(
    // Some of the variations are extreme on purpose, so a few misses are expected.
    missed.length <= trials * 0.04,
    `${missed.length} of ${trials} joined strokes were not recognized: ${missed.join(', ')}`,
  );
});

test('a four-stroke 艹 is found where the Taiwan set has one, and nowhere else', () => {
  const found = [...taiwanData]
    .filter(([, entry]) => grassTopsOf(entry).length > 0)
    .map(([char, entry]) => `${char}${grassTopsOf(entry).join(',')}`);
  // Measured 2026-10-30: every character of the set with a four-stroke 艹,
  // at its top or on the right (懂 臟 貓 髒); 觀 警 護 added 2026-10-31, their
  // right upright standing just left of the right half; the 十 十 of 垂
  // (郵 睡, and 華 lower down) added 2026-11-02.
  assert.deepEqual(
    found.sort(),
    ['懂3', '臟4', '艹0', '花0', '苦0', '英0', '苹0', '茶0', '草0', '菜0', '華0,5', '菸0', '萬0', '落0', '蕉0', '藉0', '藍0', '藝0', '藥0', '蘋0', '貓7', '髒10', '觀0', '警0', '護7', '睡8', '郵3'].sort(),
  );
  // Not in 女 (她), or where the two 十 aren't side by side (鄉, 共).
  for (const char of ['她', '鄉', '共']) {
    if (taiwanData.has(char)) {
      assert.deepEqual(grassTopsOf(taiwanData.get(char)), [], char);
    }
  }
  // The big set writes 艹 in three strokes, or its four in another order.
  assert.deepEqual(grassTopsOf(bigSetData('花')), []);
});

test('a 艹 written 丨 一 丨 一 is found in the big set, and not the top of 叟 or 臿', () => {
  // charData.js puts these in the Taiwan order, 丨 一 一 丨 (the owner,
  // 2026-11-04: 薦's 艹 couldn't be written).
  for (const char of ['薦', '夢', '舊', '蓋', '蘭', '驚', '錨']) {
    const tops = crossByCrossGrassOf(bigSetData(char));
    assert.equal(tops.length, 1, char);
    // Swapped into the Taiwan order, it is a 艹 the three-stroke check knows.
    const medians = [...bigSetData(char).medians];
    const at = tops[0];
    [medians[at + 2], medians[at + 3]] = [medians[at + 3], medians[at + 2]];
    assert.deepEqual(grassTopsOf({ medians }), [at], char);
  }
  // Their level strokes begin at the uprights: no 艹.
  for (const char of ['嫂', '艘', '插', '腴']) {
    assert.deepEqual(crossByCrossGrassOf(bigSetData(char)), [], char);
  }
  // Already in the Taiwan order, or in three strokes.
  assert.deepEqual(crossByCrossGrassOf(taiwanData.get('花')), []);
  assert.deepEqual(crossByCrossGrassOf(bigSetData('花')), []);
});

test('a 忄 written 丶 丶 丨 is found at the start of big-set characters', () => {
  // charData.js puts these in the Taiwan order, 丶 丨 丶 (the owner,
  // 2026-11-06: 愉 refused it, while 快 from the Taiwan set took it).
  for (const char of ['愉', '悅', '惱', '懶', '憶', '忄']) {
    assert.ok(startsWithMainlandHeart(bigSetData(char)), char);
  }
  // Other shapes of three strokes: 巾, 火, 小, 心 at the bottom.
  for (const char of ['帆', '伙', '小', '惫', '恩']) {
    assert.ok(!startsWithMainlandHeart(bigSetData(char)), char);
  }
  // Already in the Taiwan order, with the mainland one as altOrder.
  assert.ok(!startsWithMainlandHeart(taiwanData.get('快')));
  // The data's own order first, the Taiwan one second.
  const yu = inTaiwanOrder(bigSetData('愉'));
  assert.deepEqual(yu.altOrder.slice(0, 4), [0, 2, 1, 3]);
  assert.deepEqual(yu.medians, bigSetData('愉').medians);
  assert.equal(yu.altOrderIsTaiwan, true);
});

test('懞, with both 忄 and a 艹 written 丨 一 丨 一, gets both swaps', () => {
  const data = bigSetData('懞');
  const tops = crossByCrossGrassOf(data);
  assert.ok(startsWithMainlandHeart(data) && tops.length === 1);
  // The 艹 in the Taiwan order, its data's own second; the 忄 the other
  // way round.
  const { altOrder, altOrderIsTaiwan } = inTaiwanOrder(data);
  assert.deepEqual(altOrder.slice(0, 3), [0, 2, 1]);
  assert.deepEqual(altOrder.slice(tops[0], tops[0] + 4), [tops[0], tops[0] + 1, tops[0] + 3, tops[0] + 2]);
  assert.equal(altOrderIsTaiwan, undefined);
});

test('a 方 is found by shape, and its ノ before its ㇆ accepted', () => {
  // The owner, 2026-11-09: native writers put the ノ first too.
  assert.deepEqual(fangsOf(taiwanData.get('方')), [0]);
  assert.deepEqual(fangsOf(bigSetData('方')), [0]);
  for (const char of ['房', '放', '旁', '旅', '族', '訪', '遊', '邊', '防']) {
    assert.equal(fangsOf(taiwanData.get(char)).length, 1, char);
  }
  for (const char of ['芳', '傍', '激', '旗', '漩', '纺', '谤']) {
    assert.equal(fangsOf(bigSetData(char)).length, 1, char);
  }
  // Other shapes with a dot over a level stroke: 文, 立, 六, 亡, 市, 京.
  for (const char of ['文', '立', '六', '亡', '市', '京', '刀', '力']) {
    assert.deepEqual(fangsOf(bigSetData(char)), [], char);
  }
  const fang = withFangInEitherOrder(taiwanData.get('方'));
  assert.deepEqual(fang.altOrder, [0, 1, 3, 2]);
  assert.equal(fang.altOrderIsFang, true);
  assert.equal(withFangInEitherOrder(taiwanData.get('快')), taiwanData.get('快'));
});

test('a 方 joins a second order already there (愣 in traditional)', () => {
  const data = inTaiwanOrder(bigSetData('愣'));
  assert.ok(data.altOrder);
  const [at] = fangsOf(data);
  const { altOrder, altOrderIsFang } = withFangInEitherOrder(data);
  // The 忄 as before, the 方 swapped.
  assert.deepEqual(altOrder.slice(0, at), data.altOrder.slice(0, at));
  assert.deepEqual(altOrder.slice(at), [at, at + 1, at + 3, at + 2]);
  assert.equal(altOrderIsFang, undefined);
  assert.equal(withFangInEitherOrder(data).altOrderIsTaiwan, true);
});

test('no 方 is found where Make Me a Hanzi has none (both sets)', () => {
  const dictionary = fs
    .readFileSync('data/makemeahanzi/dictionary.txt', 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  const byChar = new Map(dictionary.map((entry) => [entry.character, entry]));
  // 敖 (in 贅, 聱, 鏊) has a 方 in the stroke data, but no part named 方.
  const hasFang = (char, seen = new Set()) => {
    if (char === '方' || char === '敖') return true;
    const entry = byChar.get(char);
    if (!entry || seen.has(char)) return false;
    seen.add(char);
    return Array.from(entry.decomposition).some((part) => part !== char && hasFang(part, seen));
  };
  const wrong = [];
  for (const [char, data] of taiwanData) {
    if (fangsOf(data).length > 0 && !hasFang(char)) wrong.push(char);
  }
  for (const { character } of dictionary) {
    if (!fs.existsSync(`node_modules/hanzi-writer-data/${character}.json`)) continue;
    if (fangsOf(bigSetData(character)).length > 0 && !hasFang(character)) wrong.push(character);
  }
  assert.deepEqual(wrong, []);
});
