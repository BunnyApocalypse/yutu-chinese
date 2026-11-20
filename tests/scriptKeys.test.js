// Tests for the parts that change between traditional and simplified
// (src/scriptKeys.js), on Make Me a Hanzi's real dictionary.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parseCharacters } from '../src/characters.js';
import {
  partChanges,
  keyOf,
  changesOfPairs,
  needsLearning,
  createChangeTable,
  checkPartKeys,
  parsePartKeyChecks,
  checked,
} from '../src/scriptKeys.js';

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

test('a change a stroke apart is readable, unless the owner chose to learn it', () => {
  const [, small] = changes('說', '说');
  assert.equal(needsLearning(small), false);
  // 強 → 强: 厶 → 口, one stroke, but chosen to learn.
  assert.deepEqual(changes('強', '强').map((change) => [keyOf(change), needsLearning(change)]), [['厶→口', true]]);
  assert.equal(needsLearning({ from: '門', to: '门', kind: 'radical' }), true);
});

test('every key chosen to learn is still found a stroke apart', () => {
  // A change of the sorting could leave a chosen key unused without anyone
  // noticing; the pairs the owner judged show it.
  const pairs = [['強', '强'], ['廚', '厨'], ['災', '灾'], ['砲', '炮'], ['沈', '沉'], ['俛', '俯'], ['崑', '昆'], ['邨', '村']];
  for (const [traditional, simplified] of pairs) {
    const found = changes(traditional, simplified);
    assert.ok(found.some((change) => change.kind === 'small' && needsLearning(change)), traditional);
  }
});

test('a table of changes gives the same as changesOfPairs, each pair worked out once', () => {
  const pairs = [['讀', '读'], ['賣', '卖'], ['說', '说']];
  const table = createChangeTable(characters);
  table.add(pairs);
  const all = changesOfPairs(pairs, characters);
  for (const [t, s] of pairs) {
    assert.deepEqual(table.changesOf(t, s), all.get(t + s));
  }
  assert.equal(table.changesOf('讀', '读'), table.changesOf('讀', '读'));
});

// --- Part keys checked against the whole dictionary (data/script-keys/) ---

const checks = parsePartKeyChecks(fs.readFileSync('data/script-keys/part-keys.tsv', 'utf8'));
const checkedChanges = (traditional, simplified) =>
  checked(traditional, simplified, changes(traditional, simplified), checks);

test('a key found in one character only: 聿 → 一 is no part change, 畫 changes as a whole', () => {
  // The owner found the card for 畫 saying 聿 is written 一 in every
  // character (2026-11-20); 律 keeps 聿 and 筆 → 笔 makes it 毛.
  const found = checkPartKeys([['畫', '画'], ['律', '律'], ['筆', '笔'], ['書', '书']], characters);
  assert.equal(found.get('聿→一').verdict, 'once');
  assert.deepEqual(found.get('聿→一').kept, ['律']);
  assert.deepEqual(checkedChanges('畫', '画'), [{ from: '畫', to: '画', kind: 'whole' }]);
});

test('a key found once that is the only change is a change of that character alone', () => {
  // 筆 → 笔: only 聿 changed, to 毛, in no other character.
  assert.deepEqual(checkedChanges('筆', '笔'), [{ from: '聿', to: '毛', kind: 'part', only: true }]);
  // 時 → 时, with nothing else changed.
  assert.deepEqual(checkedChanges('時', '时'), [{ from: '寺', to: '寸', kind: 'part', only: true }]);
  // A radical form beside it doesn't count (線 → 线).
  assert.deepEqual(checkedChanges('線', '线').map((change) => [keyOf(change), change.only ?? false]), [
    ['糹→纟', false],
    ['泉→戋', true],
  ]);
});

test('a character changed as a whole keeps its other changes', () => {
  // 變 → 变: 䜌 → 亦 as in 戀 and 彎, but 攵 → 又 in 變 only.
  assert.deepEqual(checkedChanges('變', '变').map((change) => [keyOf(change), change.kind]), [
    ['變→变', 'whole'],
    ['䜌→亦', 'part'],
  ]);
});

test('a key true of only some characters with the part says so', () => {
  // 堇 → 又 in 漢 and 難, but 勤 keeps 堇.
  assert.deepEqual(checkedChanges('漢', '汉'), [{ from: '堇', to: '又', kind: 'part', some: true }]);
  // 爭 → 争 everywhere.
  const [, part] = checkedChanges('淨', '净');
  assert.deepEqual(part, { from: '爭', to: '争', kind: 'part' });
});

test('a character that is a part of another is checked on its own too', () => {
  // 東 alone splits as 木 → 七, found nowhere else; with 凍 it is 東 → 东.
  // (Its 日 → 小, a stroke apart, is readable and never taught.)
  assert.deepEqual(checkedChanges('東', '东').filter(needsLearning).map(keyOf), ['東→东']);
  const found = changesOfPairs([['東', '东'], ['凍', '冻']], characters, checks);
  assert.deepEqual(found.get('東东'), [{ from: '東', to: '东', kind: 'part' }]);
});

test('a table of changes with checks gives the same as changesOfPairs with them', () => {
  const pairs = [['畫', '画'], ['漢', '汉'], ['淨', '净'], ['爭', '争'], ['鐵', '铁']];
  const table = createChangeTable(characters, checks);
  table.add(pairs);
  const all = changesOfPairs(pairs, characters, checks);
  for (const [t, s] of pairs) {
    assert.deepEqual(table.changesOf(t, s), all.get(t + s));
  }
});

test('data/script-keys/part-keys.tsv is up to date (else: node scripts/build-part-keys.js)', () => {
  const pairs = [];
  const seen = new Set();
  for (const line of fs.readFileSync('data/cedict/dictionary.tsv', 'utf8').split('\n')) {
    const [traditional, simplified] = line.split('\t');
    const s = simplified || traditional;
    if (!line.startsWith('#') && traditional && [...traditional].length === 1 && [...s].length === 1 && !seen.has(traditional + s)) {
      seen.add(traditional + s);
      pairs.push([traditional, s]);
    }
  }
  const fresh = checkPartKeys(pairs, characters);
  assert.equal(fresh.size, checks.size);
  for (const [key, { verdict }] of fresh) {
    assert.equal(checks.get(key), verdict, key);
  }
});
