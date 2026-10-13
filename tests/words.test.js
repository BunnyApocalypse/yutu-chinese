// Tests for adding words and looking after the list (src/words.js).

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  tidyPinyin,
  checkWord,
  splitCsvLine,
  readWordList,
  charactersShown,
  scriptFor,
  scriptFlagFor,
  parseReadyList,
  levelsOfReadyList,
  listTag,
  groupName,
  withFormerId,
  newWordRecords,
  wordsWithSameCharacters,
  orderForStudyingNext,
  matchesSearch,
} from '../src/words.js';

test('pinyin is tidied to one way of writing it', () => {
  assert.equal(tidyPinyin('xue2xi2'), 'xue2xi2');
  assert.equal(tidyPinyin('xue2 xi2'), 'xue2xi2');
  assert.equal(tidyPinyin('san1-xin1'), 'san1xin1');
  assert.equal(tidyPinyin("nü3'er2"), "nv3'er2");
  // The apostrophe is put in, or taken out, wherever it was typed.
  assert.equal(tidyPinyin('nv3er2'), "nv3'er2");
  assert.equal(tidyPinyin("xue2'xi2"), 'xue2xi2');
  assert.equal(tidyPinyin('ke3 ai4'), "ke3'ai4");
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

test('a list with one column of characters is read too', () => {
  // The second column being pinyin is what gives it away.
  const toBoth = (characters, pinyin) => ({ simplified: characters, traditional: `${characters}(${pinyin})` });
  const tsv = readWordList('学习\txue2 xi2\tto study\n垃圾\tla1ji1\ttrash\tle4se4\n', toBoth);
  assert.equal(tsv.problems.length, 0);
  assert.deepEqual(tsv.words[0], { simplified: '学习', traditional: '学习(xue2xi2)', pinyin: 'xue2xi2', definition: 'to study' });
  assert.equal(tsv.words[1].pinyinTaiwan, 'le4se4');
  // Skritter-style CSV, without quotes around the commas.
  const csv = readWordList('地方,di4fang5, di4fang1,place, region, part\n', toBoth);
  assert.equal(csv.words[0].pinyin, 'di4fang5, di4fang1');
  assert.equal(csv.words[0].definition, 'place, region, part');
  // Without anything to ask, both scripts are taken to be the same.
  assert.equal(readWordList('学习\txue2xi2\tto study\n').words[0].traditional, '学习');
  // Two columns of characters are left as they are.
  assert.equal(readWordList('学习\t學習\txue2xi2\tto study\n', toBoth).words[0].traditional, '學習');
});

test('characters are shown in the script being learned', () => {
  const study = { traditional: '學習', simplified: '学习' };
  const settings = (script, bothScripts) => ({ script, bothScripts });
  assert.equal(charactersShown(study, settings('traditional', false)), '學習');
  assert.equal(charactersShown(study, settings('simplified', false)), '学习');
  assert.equal(charactersShown(study, settings('traditional', true)), '學習 · 学习');
  assert.equal(charactersShown(study, settings('simplified', true)), '学习 · 學習');
  assert.equal(charactersShown({ traditional: '好', simplified: '好' }, settings('simplified', true)), '好');
});

test("a word's own script counts only while both scripts are learned", () => {
  const plain = { traditional: '學習', simplified: '学习' };
  const own = { ...plain, cardScript: 'simplified' };
  assert.equal(scriptFor(plain, { script: 'traditional', bothScripts: true }), 'traditional');
  assert.equal(scriptFor(own, { script: 'traditional', bothScripts: true }), 'simplified');
  assert.equal(scriptFor(own, { script: 'traditional', bothScripts: false }), 'traditional');
  assert.equal(charactersShown(own, { script: 'traditional', bothScripts: true }), '学习 · 學習');
  // Such a word is flagged on its cards, unless it is written the same either way.
  assert.equal(scriptFlagFor(own, { script: 'traditional', bothScripts: true }), 'simp. 简体');
  assert.equal(scriptFlagFor({ ...plain, cardScript: 'traditional' }, { script: 'simplified', bothScripts: true }), 'trad. 繁體');
  assert.equal(scriptFlagFor(plain, { script: 'traditional', bothScripts: true }), '');
  assert.equal(scriptFlagFor(own, { script: 'simplified', bothScripts: true }), '');
  assert.equal(scriptFlagFor(own, { script: 'traditional', bothScripts: false }), '');
  assert.equal(scriptFlagFor({ traditional: '好', simplified: '好', cardScript: 'simplified' }, { script: 'traditional', bothScripts: true }), '');
  // checkWord keeps it, and drops anything else.
  const fields = { traditional: '學習', simplified: '学习', pinyin: 'xue2xi2', definition: 'to study' };
  assert.equal(checkWord({ ...fields, cardScript: 'simplified' }).word.cardScript, 'simplified');
  assert.equal('cardScript' in checkWord({ ...fields, cardScript: '' }).word, false);
  // Readings also accepted are tidied, and those already listed are dropped.
  assert.equal(checkWord({ ...fields, pinyinAlso: 'Xue2 xi5, xue2xi2' }).word.pinyinAlso, 'Xue2xi5');
  assert.equal('pinyinAlso' in checkWord({ ...fields, pinyinAlso: 'xue2xi2' }).word, false);
  assert.match(checkWord({ ...fields, pinyinAlso: 'xuéxi' }).problem, /also accepted/);
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

test('words written the same way are found in either script', () => {
  const same = (word) => wordsWithSameCharacters(word, stored).map((found) => found.id);
  assert.deepEqual(same({ traditional: '地方', simplified: '地方' }), ['地方|di4fang5']);
  assert.deepEqual(same({ traditional: '学习', simplified: '学习' }), ['學習|xue2xi2']);
  assert.deepEqual(same({ traditional: '貓', simplified: '猫' }), []);
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

test('a word whose ID changes remembers the IDs it had', () => {
  const once = withFormerId({ id: 'b' }, { id: 'a' });
  assert.deepEqual(once.formerIds, ['a']);
  assert.deepEqual(withFormerId({ id: 'c' }, once).formerIds, ['a', 'b']);
  // Corrected back to what it was: its present ID is not a former one.
  assert.deepEqual(withFormerId({ id: 'a' }, once).formerIds, ['b']);
});

// ---- Ready-made lists ----

test('a ready-made list is read, and its levels counted against the words there are', () => {
  const entries = parseReadyList('# a comment\n1\t爱\t愛\tai4\n1\t车上\t車上\tche1shang5\tin the car\n2\t爱好\t愛好\tai4hao4\n');
  assert.deepEqual(entries[0], { level: '1', simplified: '爱', traditional: '愛', pinyin: 'ai4', meaning: '', group: '' });
  assert.equal(entries[1].meaning, 'in the car');
  assert.deepEqual(levelsOfReadyList(entries, [{ id: '愛|ai4' }]), [
    { level: '1', count: 2, newCount: 1 },
    { level: '2', count: 1, newCount: 1 },
  ]);
  assert.equal(listTag('hsk-3.0', '7-9'), 'hsk-3.0/7-9');
  // A word in a group of its level, without and with a meaning of its own.
  const grouped = parseReadyList('1\t爱\t愛\tai4\t\t02 Feelings\n1\t车上\t車上\tche1shang5\tin the car\t05 Travel\n');
  assert.deepEqual(grouped.map((entry) => [entry.meaning, entry.group]), [['', '02 Feelings'], ['in the car', '05 Travel']]);
  // The deck's ID has the group's number; its name is kept apart.
  assert.equal(listTag('hsk-3.0', '1', grouped[0].group), 'hsk-3.0/1/02');
  assert.equal(groupName(grouped[1].group), 'Travel');
  assert.equal(groupName('03 Education 教育'), 'Education 教育');
});

test('the ready-made lists are well formed, and every word can get a meaning', async () => {
  const fs = await import('node:fs');
  const { readDictionary, lookUp } = await import('../src/dictionary.js');
  const dictionary = readDictionary(fs.readFileSync('data/cedict/dictionary.tsv', 'utf8'));
  for (const [file, count, levels] of [['hsk/hsk-3.0.tsv', 11054, 7], ['hsk/hsk-2.0.tsv', 5008, 6], ['tocfl/tocfl.tsv', 7433, 7]]) {
    const entries = parseReadyList(fs.readFileSync(`data/wordlists/${file}`, 'utf8'));
    assert.equal(entries.length, count, file);
    assert.equal(levelsOfReadyList(entries, []).length, levels, file);
    const ids = new Set();
    for (const entry of entries) {
      const where = `${file}: ${entry.simplified}`;
      assert.equal(tidyPinyin(entry.pinyin), entry.pinyin, where);
      assert.equal(Array.from(entry.simplified).length, Array.from(entry.traditional).length, where);
      const id = `${entry.traditional}|${entry.pinyin}`;
      assert.ok(!ids.has(id), `${where} is listed twice`);
      ids.add(id);
      // Its meaning is either its own or the dictionary's for this very word.
      const inDictionary = lookUp(dictionary, entry.traditional).some(
        (found) => found.traditional === entry.traditional && found.pinyin === entry.pinyin,
      );
      assert.ok(entry.meaning !== '' || inDictionary, `${where} has no meaning`);
      // And it passes as a word.
      assert.equal(checkWord({ ...entry, definition: entry.meaning || 'x' }).problem, undefined, where);
    }
  }
});
