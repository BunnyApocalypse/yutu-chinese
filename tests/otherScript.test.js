// Tests for working out which word teaches which change between the scripts
// (src/otherScript.js), on Make Me a Hanzi's real dictionary.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parseCharacters } from '../src/characters.js';
import { changesOfPairs, keyOf } from '../src/scriptKeys.js';
import { differingPairs, changesOfWord, formsToLearn, whereElse } from '../src/otherScript.js';

const characters = parseCharacters(fs.readFileSync('data/makemeahanzi/dictionary.txt', 'utf8'));

// Words as the app stores them, enough of them for these tests.
const word = (traditional, simplified, more = {}) => ({ id: `${traditional}|x`, traditional, simplified, ...more });
const WORDS = [
  word('安靜', '安静'),
  word('乾淨', '干净'),
  word('我們', '我们'),
  word('問題', '问题'),
  word('人', '人'),
  word('讀書', '读书'),
  word('說', '说'),
];

// The changes of every character pair in the words, as the app will work
// them out (a character that is itself a key in another gets that key).
const pairs = WORDS.flatMap(differingPairs);
const table = changesOfPairs(pairs, characters);
const changesOf = (t, s) => table.get(t + s) ?? [];
const keysOf = (item) => item.keys.map(keyOf);

test('a word lists the character pairs that differ', () => {
  assert.deepEqual(differingPairs(word('安靜', '安静')), [['靜', '静']]);
  assert.deepEqual(differingPairs(word('人', '人')), []);
});

test("a word's changes are each listed once", () => {
  assert.deepEqual(changesOfWord(word('們們', '们们'), changesOf).map(keyOf), ['門→门']);
});

test('the first word with a key teaches it; later words with it need nothing', () => {
  const items = formsToLearn(WORDS, { mode: 'different', changesOf });
  const byWord = new Map(items.map((item) => [item.word.traditional, keysOf(item)]));
  assert.deepEqual(byWord.get('安靜'), ['爭→争']);
  // 乾淨 has 爭 → 争 too, already taught by 安靜; it still teaches 乾 → 干.
  assert.ok(byWord.get('乾淨').includes('乾→干'));
  assert.ok(!byWord.get('乾淨').includes('爭→争'));
  assert.deepEqual(byWord.get('我們'), ['門→门']);
  // 問 has only 門 → 门, which 我們 teaches.
  assert.ok(byWord.get('問題').every((key) => key !== '門→门'));
  assert.ok(!byWord.has('人'));
  // 說 → 说: 言 → 讠 (taught by 讀書, before it) and a part a stroke apart.
  assert.ok(!byWord.has('說'));
});

test('a word already taught takes its keys with it', () => {
  const words = WORDS.map((w) => (w.traditional === '安靜' ? { ...w, formsLearnedAt: 1 } : w));
  const items = formsToLearn(words, { mode: 'different', changesOf });
  assert.ok(!items.some((item) => item.word.traditional === '安靜'));
  assert.ok(!items.some((item) => keysOf(item).includes('爭→争')));
});

test('"all" lists every word written differently, even with nothing new to teach', () => {
  const items = formsToLearn(WORDS, { mode: 'all', changesOf });
  assert.deepEqual(
    items.map((item) => item.word.traditional),
    ['安靜', '乾淨', '我們', '問題', '讀書', '說'],
  );
  assert.deepEqual(keysOf(items.at(-1)), []);
});

test('nothing to learn with the setting off', () => {
  assert.deepEqual(formsToLearn(WORDS, { mode: 'off', changesOf }), []);
});

test('where else a key is: the other words first, then characters from the lists', () => {
  const more = [['箏', '筝'], ['淨', '净'], ['睜', '睁']];
  const table2 = changesOfPairs([...pairs, ...more], characters);
  const found = whereElse('爭→争', {
    words: WORDS,
    except: WORDS[0],
    morePairs: more,
    changesOf: (t, s) => table2.get(t + s) ?? [],
  });
  assert.deepEqual(found.words.map((w) => w.traditional), ['乾淨']);
  // 淨 is in 乾淨 already, so not listed again.
  assert.deepEqual(found.characters, [['箏', '筝'], ['睜', '睁']]);
});
