// Tests for looking words up in the dictionary (src/dictionary.js), on a few
// made-up lines and on the real file in data/cedict/.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { readDictionary, lookUp, proposeMeaning, otherScriptForm } from '../src/dictionary.js';
import { checkWord, tidyPinyin } from '../src/words.js';

const SMALL = [
  '# a comment',
  '學習\t学习\txue2xi2\tto learn; to study',
  '地方\t\tdi4fang1\tregion/regional/local',
  '地方\t\tdi4fang5\tplace; location; area; space; territory/aspect; part',
  '垃圾\t\tla1ji1\ttrash/refuse/garbage\tle4se4',
  '王\t\tWang2\tsurname Wang',
  '王\t\twang2\tking; monarch',
  '',
].join('\n');

test('a word is found by its traditional or its simplified characters', () => {
  const dictionary = readDictionary(SMALL);
  const expected = [{
    traditional: '學習',
    simplified: '学习',
    pinyin: 'xue2xi2',
    meanings: ['to learn; to study'],
  }];
  assert.deepEqual(lookUp(dictionary, '學習'), expected);
  assert.deepEqual(lookUp(dictionary, '学习'), expected);
  assert.deepEqual(lookUp(dictionary, '學'), []);
});

test('a word with several readings has an entry for each, names last', () => {
  const dictionary = readDictionary(SMALL);
  assert.deepEqual(lookUp(dictionary, '地方').map((entry) => entry.pinyin), ['di4fang1', 'di4fang5']);
  assert.deepEqual(lookUp(dictionary, '王').map((entry) => entry.pinyin), ['wang2', 'Wang2']);
});

test('a Taiwan reading is passed on, and simplified filled in where it is the same', () => {
  const [entry] = lookUp(readDictionary(SMALL), '垃圾');
  assert.equal(entry.pinyinTaiwan, 'le4se4');
  assert.equal(entry.simplified, '垃圾');
});

const LIAISON = ['to get in touch with', 'to contact', 'to stay in contact (with)', 'liaison', '(math.) connection'];

test('the proposed meaning leaves out specialist meanings unless told otherwise', () => {
  const everyday = 'to get in touch with; to contact; to stay in contact (with); liaison';
  assert.equal(proposeMeaning(LIAISON), everyday);
  assert.equal(proposeMeaning(LIAISON, 'everyday'), everyday);
  assert.equal(proposeMeaning(LIAISON, 'first'), 'to get in touch with');
  assert.equal(proposeMeaning(LIAISON, 'all'), `${everyday}; (math.) connection`);
});

test('a specialist meaning is known by any of its labels', () => {
  assert.equal(proposeMeaning(['(Tw) (computing) folder', 'clip']), 'clip');
  assert.equal(proposeMeaning(['(math., physics) field', 'meadow']), 'meadow');
  // Not specialist: a label that says how the word is used, or brackets that are not a label.
  assert.equal(proposeMeaning(['(Tw) taxi', '(slang) cab']), '(Tw) taxi; (slang) cab');
  assert.equal(proposeMeaning(['to stay in contact (with)', 'liaison (law)']), 'to stay in contact (with); liaison (law)');
});

test('a word with only specialist meanings keeps them', () => {
  assert.equal(proposeMeaning(['(computing) mouse', '(computing) pointer']), '(computing) mouse; (computing) pointer');
  assert.equal(proposeMeaning(['(computing) mouse', '(computing) pointer'], 'first'), '(computing) mouse');
});

test('the first meaning is the first everyday one, with its group kept whole', () => {
  assert.equal(proposeMeaning(['(math.) locus', 'place; location; area; space; territory', 'aspect; part'], 'first'), 'place; location; area; space; territory');
});

test('grammar and style labels are dropped, except when everything is asked for', () => {
  assert.equal(proposeMeaning(['(bound form) row; line', '(literary) trade']), 'row; line; trade');
  assert.equal(proposeMeaning(['(bound form) row; line', '(literary) trade'], 'all'), '(bound form) row; line; (literary) trade');
  assert.equal(proposeMeaning(['week', 'day of the week']), 'week; day of the week');
});

const realText = fs.readFileSync('data/cedict/dictionary.tsv', 'utf8');

test('the other script is taken from the entry with the same reading', () => {
  const dictionary = readDictionary(realText);
  const other = (script, characters, pinyin) =>
    otherScriptForm(lookUp(dictionary, characters), script, characters, pinyin);
  assert.equal(other('simplified', '学习', 'xue2xi2'), '學習');
  assert.equal(other('traditional', '學習', 'xue2xi2'), '学习');
  // 发 is two words, written differently in traditional.
  assert.equal(other('simplified', '发', 'fa1'), '發');
  assert.equal(other('simplified', '发', 'fa4'), '髮');
  // Another reading than the dictionary's still finds the word if there is only one way to write it.
  assert.equal(other('simplified', '学习', 'xue2xi5'), '學習');
  // Where the dictionary cannot tell, the characters stay as they are.
  assert.equal(other('simplified', '发', 'fa3'), '发');
  assert.equal(other('simplified', '不在词典里的词', 'bu4'), '不在词典里的词');
});

test('the real dictionary is well formed', () => {
  const lines = realText.split('\n').filter((line) => line !== '' && !line.startsWith('#'));
  assert.ok(lines.length > 100000, `only ${lines.length} entries`);
  for (const line of lines) {
    const [traditional, simplified, pinyin, meanings, pinyinTaiwan, extra] = line.split('\t');
    assert.equal(extra, undefined, line);
    assert.ok(traditional && meanings, line);
    assert.notEqual(simplified, traditional, line); // empty when the same
    assert.equal(tidyPinyin(pinyin), pinyin, line);
    if (pinyinTaiwan) {
      assert.equal(tidyPinyin(pinyinTaiwan), pinyinTaiwan, line);
    }
  }
});

test('entries of the real dictionary can be added as words unchanged', () => {
  const dictionary = readDictionary(realText);
  for (const characters of ['學習', '女儿', '垃圾', '為什麼', '行', '孩子']) {
    const entries = lookUp(dictionary, characters);
    assert.ok(entries.length > 0, characters);
    for (const entry of entries) {
      const { word, problem } = checkWord({ ...entry, definition: proposeMeaning(entry.meanings) });
      assert.equal(problem, undefined, `${characters}: ${problem}`);
      assert.equal(word.pinyin, entry.pinyin);
    }
  }
  assert.equal(lookUp(dictionary, '女儿')[0].pinyin, "nv3'er2");
});
