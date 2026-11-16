// Tests for the characters whose second stroke order is listed by hand
// (src/standardOrders.js).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { withListedOrder, LISTED_CHARS } from '../src/standardOrders.js';

const bigSetData = (char) => JSON.parse(fs.readFileSync(`node_modules/hanzi-writer-data/${char}.json`, 'utf8'));

test('each listed character gets its order as a second order, a permutation of its strokes', () => {
  assert.deepEqual([...LISTED_CHARS].sort(), [...'衮滚磙虐谑盖芈陧尨'].sort());
  for (const char of LISTED_CHARS) {
    const data = bigSetData(char);
    const { altOrder, altOrderIsFang } = withListedOrder(char, data);
    const identity = data.strokes.map((stroke, index) => index);
    assert.deepEqual([...altOrder].sort((a, b) => a - b), identity, `${char} uses every stroke once`);
    assert.notDeepEqual(altOrder, identity, `${char}'s second order differs from its first`);
    assert.equal(altOrderIsFang, true, char);
  }
  assert.deepEqual(withListedOrder('盖', bigSetData('盖')).altOrder, [0, 1, 2, 3, 5, 4, 6, 7, 8, 9, 10]);
  assert.deepEqual(withListedOrder('尨', bigSetData('尨')).altOrder, [0, 1, 2, 4, 5, 6, 3]);
});

test('anything not listed, or not as listed, is left as it is', () => {
  const gong = bigSetData('公');
  assert.equal(withListedOrder('公', gong), gong);
  // Data with a second order already keeps it.
  const withOrder = { ...bigSetData('盖'), altOrder: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
  assert.equal(withListedOrder('盖', withOrder), withOrder);
  // Data with another number of strokes is not the data the list was made for.
  const other = bigSetData('蓋');
  assert.equal(withListedOrder('盖', other), other);
});
