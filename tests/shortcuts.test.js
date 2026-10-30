// Tests for recognizing two strokes written as one (src/shortcuts.js).
//
// Most of this is a simulation: for every joinable pair in the characters of
// the test word list, it "draws" strokes that are shifted, resized and
// shaky, and checks how the recognizer judges them.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { isJoinable, isShortcutStroke, joinedLine, grassTopsOf } from '../src/shortcuts.js';
import { applyFrame } from '../src/frame.js';
import { parseWordList } from '../src/wordList.js';

// The same leniency the app uses (LENIENCY in src/quiz.js).
const LENIENCY = 1.5;

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
  // at its top or on the right (懂 臟 貓 髒).
  assert.deepEqual(
    found.sort(),
    ['懂3', '臟4', '艹0', '花0', '苦0', '英0', '苹0', '茶0', '草0', '菜0', '華0', '菸0', '萬0', '落0', '蕉0', '藉0', '藍0', '藝0', '藥0', '蘋0', '貓7', '髒10'].sort(),
  );
  // Not in a 十 lower down (華, 睡, 郵) or in 女 (她).
  for (const char of ['她', '睡', '郵', '鄉', '共']) {
    if (taiwanData.has(char)) {
      assert.deepEqual(grassTopsOf(taiwanData.get(char)), [], char);
    }
  }
  // The big set writes 艹 in three strokes, or its four in another order.
  assert.deepEqual(grassTopsOf(bigSetData('花')), []);
});
