// Tests for what the word page is made from: learning notes (src/notes.js)
// and the parts of characters (src/characters.js).
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parseNotes, noteFor, sentenceWords } from '../src/notes.js';
import { parseCharacters, structureOf } from '../src/characters.js';

test('an example sentence is split into its words by its pinyin', () => {
  const texts = (sentence, pinyin) => sentenceWords(sentence, pinyin).map((piece) => piece.text);
  assert.deepEqual(sentenceWords('我们是同学。', 'Wǒmen shì tóngxué.'), [
    { text: '我们', pinyin: 'Wǒmen' },
    { text: '是', pinyin: 'shì' },
    { text: '同学', pinyin: 'tóngxué' },
    { text: '。', pinyin: null },
  ]);
  // Punctuation in the middle, a syllable that is only a vowel, an r with a
  // character of its own, and an apostrophe between syllables.
  assert.deepEqual(texts('我饿了，我们吃饭吧。', 'Wǒ è le, wǒmen chīfàn ba.'), ['我', '饿', '了', '，', '我们', '吃饭', '吧', '。']);
  assert.deepEqual(texts('你坐这儿吧。', 'Nǐ zuò zhèr ba.'), ['你', '坐', '这儿', '吧', '。']);
  assert.deepEqual(texts('我女儿很高。', "Wǒ nǚ'ér hěn gāo."), ['我', '女儿', '很', '高', '。']);
  assert.deepEqual(texts('他有儿子。', 'Tā yǒu érzi.'), ['他', '有', '儿子', '。']);
  // Pinyin that does not fit: one piece per character, without readings.
  assert.deepEqual(sentenceWords('你好吗', 'Nǐ hǎo'), [
    { text: '你', pinyin: null },
    { text: '好', pinyin: null },
    { text: '吗', pinyin: null },
  ]);
});

test('a character\'s parts are listed, with the one for meaning and the one for sound', () => {
  const characters = parseCharacters(fs.readFileSync('data/makemeahanzi/dictionary.txt', 'utf8'));
  assert.ok(characters.size > 9000);
  const river = structureOf(characters, '河');
  assert.deepEqual(river.parts, [{ part: '氵', role: 'meaning' }, { part: '可', role: 'sound' }]);
  assert.equal(river.kind, 'sound-meaning');
  assert.equal(river.hint, 'water');
  // A compound of meanings, and a picture: parts without roles, or none.
  const good = structureOf(characters, '好');
  assert.deepEqual(good.parts, [{ part: '女', role: null }, { part: '子', role: null }]);
  assert.equal(good.kind, 'meaning');
  assert.equal(structureOf(characters, '山').kind, 'picture');
  assert.equal(structureOf(characters, '𠀀'), null);
});
