// Tests for src/readingFixes.js: words added from a ready-made list before
// the list's reading of them was put right.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { parseReadingFixes, wordsToCorrect, correctedWord } from '../src/readingFixes.js';
import { readDictionary, lookUp, proposeMeaning } from '../src/dictionary.js';

const FIXES = parseReadingFixes('# a comment\nhsk-3.0\t说法\tshuo1fa3\tshuo1fa5\tBuddhist\n');

const word = (fields) => ({
  id: '說法|shuo1fa3',
  traditional: '說法',
  simplified: '说法',
  pinyin: 'shuo1fa3',
  definition: 'to expound Buddhist teachings',
  decks: ['hsk-3.0/5/27'],
  order: 3,
  learnedAt: 100,
  changedAt: 200,
  ...fields,
});

const ENTRIES = [
  { traditional: '說法', simplified: '说法', pinyin: 'shuo1fa3', meanings: ['to expound Buddhist teachings'] },
  { traditional: '說法', simplified: '说法', pinyin: 'shuo1fa5', meanings: ['way of speaking', 'wording', 'one\'s version (of events)'] },
];

test('reads the corrections file, leaving out comments', () => {
  assert.deepEqual(FIXES, [{ list: 'hsk-3.0', simplified: '说法', wrong: 'shuo1fa3', right: 'shuo1fa5' }]);
});

test('finds a word of the list under the wrong reading', () => {
  const found = wordsToCorrect(FIXES, [word(), word({ id: '說|shuo1', simplified: '说', pinyin: 'shuo1' })]);
  assert.equal(found.length, 1);
  assert.equal(found[0].word.id, '說法|shuo1fa3');
});

test('leaves alone a word in no deck of that list, a sentence, and a word whose right reading is there already', () => {
  assert.deepEqual(wordsToCorrect(FIXES, [word({ decks: ['chinese'] })]), []);
  assert.deepEqual(wordsToCorrect(FIXES, [word({ decks: ['tocfl/5'] })]), []);
  assert.deepEqual(wordsToCorrect(FIXES, [word({ kind: 'sentence' })]), []);
  assert.deepEqual(wordsToCorrect(FIXES, [word(), word({ id: '說法|shuo1fa5', pinyin: 'shuo1fa5' })]), []);
  // The list's own deck, and a level of it, count.
  assert.equal(wordsToCorrect(FIXES, [word({ decks: ['hsk-3.0'] })]).length, 1);
  assert.equal(wordsToCorrect(FIXES, [word({ decks: ['chinese', 'hsk-3.0/5'] })]).length, 1);
});

test('gives the word its new reading and ID, remembers the old one, and keeps the rest', () => {
  const corrected = correctedWord(word({ formerIds: ['說法|shuo1fa4'] }), FIXES[0], ENTRIES, 'everyday');
  assert.equal(corrected.id, '說法|shuo1fa5');
  assert.equal(corrected.pinyin, 'shuo1fa5');
  assert.deepEqual(corrected.formerIds, ['說法|shuo1fa4', '說法|shuo1fa3']);
  assert.deepEqual(corrected.decks, ['hsk-3.0/5/27']);
  assert.equal(corrected.learnedAt, 100);
  assert.equal(corrected.order, 3);
  assert.equal('changedAt' in corrected, false);
});

test("replaces the wrong entry's meaning, under any setting, with the right one's", () => {
  for (const detail of ['first', 'everyday', 'all']) {
    const proposed = proposeMeaning(ENTRIES[0].meanings, detail);
    const corrected = correctedWord(word({ definition: proposed }), FIXES[0], ENTRIES, 'everyday');
    assert.equal(corrected.definition, "way of speaking; wording; one's version (of events)");
  }
  assert.equal(correctedWord(word(), FIXES[0], ENTRIES, 'first').definition, 'way of speaking');
});

test('keeps a meaning the learner wrote, and the meaning when there is no dictionary', () => {
  assert.equal(correctedWord(word({ definition: 'a view' }), FIXES[0], ENTRIES, 'everyday').definition, 'a view');
  assert.equal(correctedWord(word(), FIXES[0], [], 'everyday').definition, 'to expound Buddhist teachings');
});

test("every correction in the real file has both readings in the dictionary, and the lists have the right one", () => {
  const fixes = parseReadingFixes(fs.readFileSync('data/wordlists/reading-fixes.tsv', 'utf8'));
  assert.ok(fixes.length > 0);
  const dictionary = readDictionary(fs.readFileSync('data/cedict/dictionary.tsv', 'utf8'));
  const files = {
    'hsk-3.0': 'data/wordlists/hsk/hsk-3.0.tsv',
    'hsk-2.0': 'data/wordlists/hsk/hsk-2.0.tsv',
    tocfl: 'data/wordlists/tocfl/tocfl.tsv',
  };
  for (const fix of fixes) {
    const readings = lookUp(dictionary, fix.simplified).map((entry) => entry.pinyin);
    assert.ok(readings.includes(fix.wrong), `${fix.simplified} ${fix.wrong} is not in the dictionary`);
    assert.ok(readings.includes(fix.right), `${fix.simplified} ${fix.right} is not in the dictionary`);
    const listed = fs
      .readFileSync(files[fix.list], 'utf8')
      .split('\n')
      .map((line) => line.split('\t'))
      .filter((columns) => columns[1] === fix.simplified)
      .map((columns) => columns[3]);
    assert.ok(listed.includes(fix.right), `${fix.list} does not list ${fix.simplified} ${fix.right}`);
    assert.ok(!listed.includes(fix.wrong), `${fix.list} still lists ${fix.simplified} ${fix.wrong}`);
  }
});
