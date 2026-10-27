// Tests for turning pinyin into zhuyin (src/zhuyin.js). The table as a whole
// is checked against Wiktionary by scripts/check-zhuyin.js; these pin down
// each kind of spelling, so a change to one rule shows here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { syllableZhuyin, toZhuyin, finalOf } from '../src/zhuyin.js';
import { SYLLABLES } from '../src/pinyinSyllables.js';
import { formatPinyin } from '../src/wordList.js';

test('every syllable of Mandarin has a zhuyin spelling, each a different one', () => {
  const spellings = new Map();
  for (const letters of SYLLABLES) {
    const symbols = syllableZhuyin(letters);
    assert.ok(symbols, `no zhuyin for ${letters}`);
    assert.match(symbols, /^[ㄅ-ㄯ]+$/u, `${letters} is ${symbols}`);
    // lue and nue are lve and nve without the dots; the r of a word said
    // with an r is written as er is.
    const same = letters.replace(/^([ln])ue$/, '$1ve').replace(/^r$/, 'er');
    if (spellings.has(symbols)) {
      assert.equal(spellings.get(symbols), same, `${letters} and ${spellings.get(symbols)} are both ${symbols}`);
    }
    spellings.set(symbols, same);
  }
});

test('initials and finals', () => {
  assert.equal(syllableZhuyin('ba'), 'ㄅㄚ');
  assert.equal(syllableZhuyin('zhuang'), 'ㄓㄨㄤ');
  assert.equal(syllableZhuyin('cong'), 'ㄘㄨㄥ');
  assert.equal(syllableZhuyin('xiong'), 'ㄒㄩㄥ');
  assert.equal(syllableZhuyin('bo'), 'ㄅㄛ');
  assert.equal(syllableZhuyin('biang'), 'ㄅㄧㄤ');
});

test("pinyin's short forms of iou, uei and uen are written in full", () => {
  assert.equal(syllableZhuyin('liu'), 'ㄌㄧㄡ');
  assert.equal(syllableZhuyin('gui'), 'ㄍㄨㄟ');
  assert.equal(syllableZhuyin('dun'), 'ㄉㄨㄣ');
});

test('ü, written u after j, q, x and y', () => {
  assert.equal(syllableZhuyin('ju'), 'ㄐㄩ');
  assert.equal(syllableZhuyin('xue'), 'ㄒㄩㄝ');
  assert.equal(syllableZhuyin('quan'), 'ㄑㄩㄢ');
  assert.equal(syllableZhuyin('yun'), 'ㄩㄣ');
  assert.equal(syllableZhuyin('nv'), 'ㄋㄩ');
  assert.equal(syllableZhuyin('lü'), 'ㄌㄩ');
  assert.equal(syllableZhuyin('lu:e'), 'ㄌㄩㄝ');
  assert.equal(syllableZhuyin('nue'), 'ㄋㄩㄝ');
  assert.equal(syllableZhuyin('lu'), 'ㄌㄨ');
});

test('y and w stand in for a missing initial', () => {
  assert.equal(syllableZhuyin('yi'), 'ㄧ');
  assert.equal(syllableZhuyin('ya'), 'ㄧㄚ');
  assert.equal(syllableZhuyin('you'), 'ㄧㄡ');
  assert.equal(syllableZhuyin('ying'), 'ㄧㄥ');
  assert.equal(syllableZhuyin('yong'), 'ㄩㄥ');
  assert.equal(syllableZhuyin('wu'), 'ㄨ');
  assert.equal(syllableZhuyin('wei'), 'ㄨㄟ');
  assert.equal(syllableZhuyin('wen'), 'ㄨㄣ');
  assert.equal(syllableZhuyin('weng'), 'ㄨㄥ');
});

test('zhi, chi, shi, ri, zi, ci, si are the initial alone', () => {
  assert.deepEqual(
    ['zhi', 'chi', 'shi', 'ri', 'zi', 'ci', 'si'].map(syllableZhuyin),
    ['ㄓ', 'ㄔ', 'ㄕ', 'ㄖ', 'ㄗ', 'ㄘ', 'ㄙ'],
  );
});

test('syllables with no initial, and the interjections', () => {
  assert.equal(syllableZhuyin('ai'), 'ㄞ');
  assert.equal(syllableZhuyin('er'), 'ㄦ');
  assert.equal(syllableZhuyin('ng'), 'ㄫ');
  assert.equal(syllableZhuyin('hm'), 'ㄏㄇ');
  assert.equal(syllableZhuyin('ê'), 'ㄝ');
});

test('not a syllable', () => {
  assert.equal(syllableZhuyin('hsk'), null);
  assert.equal(syllableZhuyin('bv'), null);
});

test('tones: none for the first, marks after for 2 to 4, a dot before the neutral', () => {
  assert.equal(toZhuyin('ma1'), 'ㄇㄚ');
  assert.equal(toZhuyin('ma2'), 'ㄇㄚˊ');
  assert.equal(toZhuyin('ma3'), 'ㄇㄚˇ');
  assert.equal(toZhuyin('ma4'), 'ㄇㄚˋ');
  assert.equal(toZhuyin('ma5'), '˙ㄇㄚ');
  assert.equal(toZhuyin('ma1ma5'), 'ㄇㄚ ˙ㄇㄚ');
});

test('words: a space between syllables, apostrophes and spaces dropped', () => {
  assert.equal(toZhuyin('xue2xiao4'), 'ㄒㄩㄝˊ ㄒㄧㄠˋ');
  assert.equal(toZhuyin("nv3'er2"), 'ㄋㄩˇ ㄦˊ');
  assert.equal(toZhuyin('Bei3 jing1'), 'ㄅㄟˇ ㄐㄧㄥ');
  assert.equal(toZhuyin('Xi1an1'), 'ㄒㄧ ㄢ');
});

test('several readings keep their commas', () => {
  assert.equal(toZhuyin('shan1, shan4'), 'ㄕㄢ, ㄕㄢˋ');
});

test('the r of a word said with an r is ㄦ joined to the syllable before', () => {
  assert.equal(toZhuyin('yi1xia4r5'), 'ㄧ ㄒㄧㄚˋㄦ');
  assert.equal(toZhuyin('yi1 dian3 r5'), 'ㄧ ㄉㄧㄢˇㄦ');
  // 兒 by itself
  assert.equal(toZhuyin('r5'), '˙ㄦ');
});

test('Latin letters stay as they are', () => {
  assert.equal(toZhuyin('ka3 la1 O K'), 'ㄎㄚˇ ㄌㄚ O K');
  assert.equal(toZhuyin('Aquan1r5'), 'A ㄑㄩㄢㄦ');
  assert.equal(toZhuyin('DNA jian4 ding4'), 'DNA ㄐㄧㄢˋ ㄉㄧㄥˋ');
});

test("a syllable zhuyin can't spell is shown by the function given", () => {
  // CC-CEDICT's xx5, for a character it has no reading for
  assert.equal(toZhuyin('xx5 ma1'), 'xx5 ㄇㄚ');
  assert.equal(toZhuyin('xx5 ma1', formatPinyin), 'xx ㄇㄚ');
});

test('an empty reading stays empty', () => {
  assert.equal(toZhuyin(''), '');
});

test('a syllable\'s final, the same however pinyin spells it', () => {
  assert.equal(finalOf('gu'), 'ㄨ');
  assert.equal(finalOf('ku'), 'ㄨ');
  assert.equal(finalOf('yan'), finalOf('jian')); // ㄧㄢ
  assert.equal(finalOf('wei'), finalOf('gui')); // ㄨㄟ
  assert.equal(finalOf('xue'), finalOf('yue')); // ㄩㄝ
  assert.equal(finalOf('shi'), '');
  assert.equal(finalOf('bv'), null);
});
