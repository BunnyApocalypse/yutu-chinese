// Tests for the parts that change between traditional and simplified
// (src/scriptKeys.js), on Make Me a Hanzi's real dictionary.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parseCharacters } from '../src/characters.js';
import { partChanges, keyOf, changesOfPairs } from '../src/scriptKeys.js';

const characters = parseCharacters(fs.readFileSync('data/makemeahanzi/dictionary.txt', 'utf8'));
const changes = (traditional, simplified) => partChanges(traditional, simplified, characters);

test('a character written the same in both has no change', () => {
  assert.deepEqual(changes('人', '人'), []);
});

test('a radical form is a change of its own', () => {
  assert.deepEqual(changes('詞', '词'), [{ from: '言', to: '讠', kind: 'radical' }]);
  assert.deepEqual(changes('問', '问'), [{ from: '門', to: '门', kind: 'radical' }]);
});

test('a part simplified the same way gives the same key in every character', () => {
  const keys = ['淨净', '靜静', '掙挣'].map(([t, s]) =>
    changes(t, s).filter((change) => change.kind === 'part').map(keyOf),
  );
  assert.equal(new Set(keys.flat()).size, 1, JSON.stringify(keys));
});

test('the part of 讀 is 賣, with the radical as a second change', () => {
  assert.deepEqual(
    changes('讀', '读').map((change) => [keyOf(change), change.kind]),
    [
      ['言→讠', 'radical'],
      ['賣→卖', 'part'],
    ],
  );
});

test('a part a stroke or two apart is small', () => {
  assert.deepEqual(
    changes('說', '说').map((change) => change.kind),
    ['radical', 'small'],
  );
});

test('characters not built alike change as a whole', () => {
  assert.deepEqual(changes('為', '为'), [{ from: '為', to: '为', kind: 'whole' }]);
  assert.deepEqual(changes('夠', '够'), [{ from: '夠', to: '够', kind: 'whole' }]);
});

test('a part that is a character of its own is not split further', () => {
  assert.deepEqual(
    changes('臉', '脸').map(keyOf),
    ['僉→佥'],
  );
});

test('東 is the key of 凍 and 棟', () => {
  const found = changesOfPairs([['東', '东'], ['凍', '冻'], ['棟', '栋']], characters);
  assert.deepEqual([...found.values()].map((list) => list.map(keyOf)), [['東→东'], ['東→东'], ['東→东']]);
});

test('a character that is a part changed in another has that change', () => {
  const found = changesOfPairs([['讀', '读'], ['賣', '卖']], characters);
  assert.deepEqual(found.get('賣卖'), [{ from: '賣', to: '卖', kind: 'part' }]);
  assert.deepEqual(found.get('讀读').map(keyOf), ['言→讠', '賣→卖']);
});
