// Tests for the box at the top of 骨 written in more than one way
// (src/innerBox.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { BONE_CHARS, findInnerBox, innerBoxForms } from '../src/innerBox.js';

// The data the app writes a traditional character with: the Taiwan set's,
// else the big set's. Read from where scripts/copy-char-data.js takes them,
// since public/ is filled only by a build or the dev server.
const taiwanData = new Map();
for (const line of fs.readFileSync('data/animcjk/graphicsZhHant.txt', 'utf8').split('\n')) {
  if (line.trim() !== '') {
    const entry = JSON.parse(line);
    taiwanData.set(entry.character, entry);
  }
}

function traditionalData(char) {
  return taiwanData.get(char) ?? JSON.parse(fs.readFileSync(`node_modules/hanzi-writer-data/${char}.json`, 'utf8'));
}

const start = (median) => median[0];
const end = (median) => median.at(-1);
const isLeftToRight = (median) => end(median)[0] > start(median)[0];

test('骨 itself: its ㇕ cut into the level stroke and the 丨, in either order', () => {
  const data = traditionalData('骨');
  assert.deepEqual(findInnerBox(data), { at: 2, oneStroke: true });
  const [levelFirst, uprightFirst] = innerBoxForms('骨', data);
  for (const form of [levelFirst, uprightFirst]) {
    assert.equal(form.medians.length, data.medians.length + 1);
    assert.equal(form.from, 2);
    // The strokes after the box are the data's.
    assert.deepEqual(form.medians.slice(4), data.medians.slice(3));
  }
  // The level stroke first, left to right, ending where the 丨 begins.
  assert.ok(isLeftToRight(levelFirst.medians[2]));
  assert.deepEqual(end(levelFirst.medians[2]), start(levelFirst.medians[3]));
  // Or on the right of the 丨, as the Taiwan set has it.
  assert.ok(start(levelFirst.altShapes[2])[0] >= end(levelFirst.medians[2])[0]);
  // The 丨 first, then the level stroke on its right (the Taiwan order).
  assert.ok(start(uprightFirst.medians[3])[0] >= start(uprightFirst.medians[2])[0]);
  assert.equal(uprightFirst.altShapes, undefined);
});

test('體 and 髒: the two strokes in the other order, the level stroke left to right', () => {
  // 體 has the 丨 first, its level stroke running right to left.
  // With a stroke in another shape (altShapes; the big set's 8th, as
  // copy-char-data.js finds it), to see that it is kept.
  const body = { ...traditionalData('體'), altShapes: { 8: traditionalData('體').medians[8] } };
  const bodyForms = innerBoxForms('體', body);
  assert.deepEqual(bodyForms.map((form) => form.from), [2, 3]);
  assert.deepEqual(bodyForms[0].medians[3], body.medians[2]);
  assert.ok(isLeftToRight(bodyForms[0].medians[2]));
  assert.deepEqual(bodyForms[1].medians[2], body.medians[2]);
  assert.ok(isLeftToRight(bodyForms[1].medians[3]));
  // Its stroke in another shape (altShapes, from the big set) is kept.
  assert.ok(bodyForms.every((form) => form.altShapes?.[8]));
  // 髒 already has the level stroke first, left to right: only the 丨 first.
  const dirty = traditionalData('髒');
  const [dirtyForm] = innerBoxForms('髒', dirty);
  assert.equal(innerBoxForms('髒', dirty).length, 1);
  assert.equal(dirtyForm.from, 2);
  assert.deepEqual(dirtyForm.medians[2], dirty.medians[3]);
  assert.deepEqual(dirtyForm.medians[3], dirty.medians[2]);
});

test('滑: the box found after 氵', () => {
  assert.deepEqual(findInnerBox(traditionalData('滑')), { at: 5, oneStroke: true });
  assert.ok(innerBoxForms('滑', traditionalData('滑')).every((form) => form.from === 5));
});

test('the box is found in the characters with 骨 that have stroke data for it', () => {
  // 鶻's data has no level stroke in the box.
  const notFound = Array.from(BONE_CHARS).filter((char) => !findInnerBox(traditionalData(char)));
  assert.deepEqual(notFound, ['鶻']);
});

test('no second forms for other characters, even with a box like it', () => {
  for (const char of ['咼', '過', '同', '學']) {
    assert.deepEqual(innerBoxForms(char, traditionalData(char)), []);
  }
});
