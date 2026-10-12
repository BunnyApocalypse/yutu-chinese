// Tests for adding words and looking after the list (src/words.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tidyPinyin,
  checkWord,
  splitCsvLine,
  readWordList,
  newWordRecords,
  orderForStudyingNext,
  matchesSearch,
} from '../src/words.js';

test('pinyin is tidied to one way of writing it', () => {
  assert.equal(tidyPinyin('xue2xi2'), 'xue2xi2');
  assert.equal(tidyPinyin('xue2 xi2'), 'xue2xi2');
  assert.equal(tidyPinyin('san1-xin1'), 'san1xin1');
  assert.equal(tidyPinyin("nü3'er2"), "nv3'er2");
  assert.equal(tidyPinyin('lu:4'), 'lv4');
  assert.equal(tidyPinyin('Zhong1guo2'), 'Zhong1guo2');
  assert.equal(tidyPinyin('di4fang5,di4fang1'), 'di4fang5, di4fang1');
});

test('pinyin without tone numbers is refused', () => {
  assert.equal(tidyPinyin('xuexi'), null);
  assert.equal(tidyPinyin('xuéxí'), null);
  assert.equal(tidyPinyin('xue2xi'), null);
  assert.equal(tidyPinyin('xue6'), null);
  assert.equal(tidyPinyin(''), null);
});

test('a typed word is tidied', () => {
  const { word } = checkWord({
    traditional: ' 學習 ',
    simplified: '学习',
    pinyin: 'xue2 xi2',
    definition: '  to study;  to learn ',
    pinyinTaiwan: '',
  });
  assert.deepEqual(word, {
    simplified: '学习',
    traditional: '學習',
    pinyin: 'xue2xi2',
    definition: 'to study; to learn',
  });
});

test('one script may be left out when both are the same', () => {
  assert.equal(checkWord({ traditional: '你好', pinyin: 'ni3hao3', definition: 'hello' }).word.simplified, '你好');
  assert.equal(checkWord({ simplified: '你好', pinyin: 'ni3hao3', definition: 'hello' }).word.traditional, '你好');
});

test('a Taiwan reading is kept only if it differs', () => {
  const fields = { traditional: '星期', pinyin: 'xing1qi1', definition: 'week' };
  assert.equal(checkWord({ ...fields, pinyinTaiwan: 'xing1qi2' }).word.pinyinTaiwan, 'xing1qi2');
  assert.equal('pinyinTaiwan' in checkWord({ ...fields, pinyinTaiwan: 'xing1 qi1' }).word, false);
});

test('what is wrong with a word is said in words', () => {
  const good = { traditional: '學習', simplified: '学习', pinyin: 'xue2xi2', definition: 'to study' };
  assert.match(checkWord({ ...good, traditional: '', simplified: '' }).problem, /characters/);
  assert.match(checkWord({ ...good, simplified: '学' }).problem, /same number/);
  assert.match(checkWord({ ...good, traditional: '學 習', simplified: '学 习' }).problem, /spaces/);
  assert.match(checkWord({ ...good, pinyin: '' }).problem, /pinyin is missing/);
  assert.match(checkWord({ ...good, pinyin: 'xuéxí' }).problem, /tone numbers/);
  assert.match(checkWord({ ...good, definition: ' ' }).problem, /meaning is missing/);
  assert.match(checkWord({ ...good, pinyinTaiwan: 'xue' }).problem, /Taiwan reading/);
});

test('a CSV line is split at commas, except inside quotes', () => {
  assert.deepEqual(splitCsvLine('看,看,kan4,"to see, to watch"'), ['看', '看', 'kan4', 'to see, to watch']);
  assert.deepEqual(splitCsvLine('a,"say ""hi""",b'), ['a', 'say "hi"', 'b']);
  // A quote that doesn't wrap the whole field is an ordinary character.
  assert.deepEqual(splitCsvLine('啊,啊,a5,"a" sound, as in ah'), ['啊', '啊', 'a5', '"a" sound', ' as in ah']);
});

test('a list is read from TSV and from CSV alike', () => {
  const tsv = '学习\t學習\txue2xi2\tto study, to learn\n地方\t地方\tdi4fang5\tplace\tdi4fang1, di4fang5\n';
  const csv = '学习,學習,xue2xi2,"to study, to learn"\r\n地方,地方,di4fang5,place,"di4fang1, di4fang5"\r\n';
  const fromTsv = readWordList(tsv);
  assert.equal(fromTsv.problems.length, 0);
  assert.equal(fromTsv.words[0].definition, 'to study, to learn');
  assert.equal(fromTsv.words[1].pinyinTaiwan, 'di4fang1, di4fang5');
  assert.deepEqual(readWordList(csv), fromTsv);
});

test('a CSV without quotes around commas is still read', () => {
  // As Skritter writes it: two readings and a meaning with commas, unwrapped.
  const { words, problems } = readWordList('地方,地方,di4fang5, di4fang1,place, region, part\n');
  assert.equal(problems.length, 0);
  assert.equal(words[0].pinyin, 'di4fang5, di4fang1');
  assert.equal(words[0].definition, 'place, region, part');
});

test('lines that cannot be used are reported with their line number', () => {
  const { words, problems } = readWordList('学习\t學習\txue2xi2\tto study\n\nsimplified,traditional,pinyin,meaning\n好\t好\n');
  assert.equal(words.length, 1);
  assert.deepEqual(problems.map((problem) => problem.lineNumber), [3, 4]);
  assert.ok(problems[0].problem); // a header line is not a word
  assert.match(problems[1].problem, /four columns/);
});

const stored = [
  { id: '學習|xue2xi2', traditional: '學習', simplified: '学习', pinyin: 'xue2xi2', definition: 'to study', order: 0, addedAt: 1 },
  { id: '地方|di4fang5', traditional: '地方', simplified: '地方', pinyin: 'di4fang5', definition: 'place', pinyinTaiwan: 'di4fang1', order: 7, addedAt: 1 },
];

test('new words are queued after the others; known and repeated ones are left out', () => {
  const cat = { traditional: '貓', simplified: '猫', pinyin: 'mao1', definition: 'cat' };
  const dog = { traditional: '狗', simplified: '狗', pinyin: 'gou3', definition: 'dog' };
  const study = { traditional: '學習', simplified: '学习', pinyin: 'xue2xi2', definition: 'to learn' };
  const { toAdd, alreadyHave } = newWordRecords([cat, study, dog, cat], stored, 99);
  assert.equal(alreadyHave, 2);
  assert.deepEqual(toAdd.map((word) => [word.id, word.order, word.addedAt]), [
    ['貓|mao1', 8, 99],
    ['狗|gou3', 9, 99],
  ]);
});

test('the same characters with another reading are a different word', () => {
  const { toAdd } = newWordRecords([{ traditional: '地方', simplified: '地方', pinyin: 'di4fang1', definition: 'local' }], stored, 0);
  assert.equal(toAdd.length, 1);
});

test('studying a word next puts it ahead of every other word', () => {
  assert.equal(orderForStudyingNext(stored), -1);
  assert.equal(orderForStudyingNext([...stored, { order: -4 }]), -5);
});

test('search finds characters, meaning and pinyin however it is written', () => {
  const [study, place] = stored;
  for (const search of ['學', '学习', 'STUDY', 'xue2', 'xuexi', 'xuéxí', '']) {
    assert.equal(matchesSearch(study, search), true, search);
  }
  assert.equal(matchesSearch(study, 'place'), false);
  assert.equal(matchesSearch(place, 'difang1'.slice(0, 6)), true);
  assert.equal(matchesSearch(place, 'dìfāng'), true); // the Taiwan reading
});
