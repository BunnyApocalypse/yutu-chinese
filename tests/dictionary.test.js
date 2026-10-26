// Tests for looking words up in the dictionary (src/dictionary.js), on a few
// made-up lines and on the real file in data/cedict/.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  readDictionary,
  lookUp,
  proposeMeaning,
  meaningWithoutChinese,
  otherScriptForm,
  splitIntoWords,
} from '../src/dictionary.js';
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

// ---------------------------------------------------------------------------
// Looking a word up by its pinyin

import { lookUpByPinyin, readTypedPinyin } from '../src/dictionary.js';
import { parseReadyList } from '../src/words.js';

const BY_SOUND = readDictionary(
  [
    '是\t\tshi4\tis; are; am; yes; to be',
    '十\t\tshi2\tten',
    '柿\t\tshi4\tpersimmon',
    '丗\t\tshi4\tlife/age/generation',
    '世\t\tshi4\tlife/age/generation',
    '時\t时\tshi2\ttime',
    '時候\t时候\tshi2hou5\ttime; length of time',
    '事情\t\tshi4qing5\taffair; matter',
    '石\t\tShi2\tsurname Shi',
    "西安\t\txi1'an1\tXi'an, capital of Shaanxi",
    '先\t\txian1\tearly; prior; former',
    '女\t\tnv3\tfemale; woman',
    '',
  ].join('\n'),
);
// 是 and 世 are in the lists, in that order; 時 and 柿 are in no list.
const LISTED = [
  { traditional: '是', simplified: '是', pinyin: 'shi4' },
  { traditional: '世', simplified: '世', pinyin: 'shi4' },
];
const found = (text) => lookUpByPinyin(BY_SOUND, text, LISTED).map((entry) => entry.traditional);

test('pinyin is read however it is typed', () => {
  for (const text of ['nihao', 'ni hao', 'ni3hao3', 'nǐhǎo', 'NI3 HAO3', "ni'hao"]) {
    assert.equal(readTypedPinyin(text).letters, 'nihao', text);
  }
  assert.deepEqual(readTypedPinyin('ni3hao').tones, [{ at: 1, tone: 3 }]);
  assert.deepEqual(readTypedPinyin('nǐhǎo').tones, [{ at: 1, tone: 3 }, { at: 3, tone: 3 }]);
  assert.deepEqual(readTypedPinyin('ma0').tones, [{ at: 1, tone: 5 }]);
  for (const text of ['lv3', 'lü3', 'lu:3', 'lǚ']) {
    assert.equal(readTypedPinyin(text).letters, 'lv', text);
  }
  // Characters, other signs, a number alone, or nothing are not pinyin.
  for (const text of ['你好', 'ni好', 'X光', 'a+b', '3', '', '  ']) {
    assert.equal(readTypedPinyin(text), null, text);
  }
});

test('words read as typed come first, listed words before the others, names after those', () => {
  assert.deepEqual(found('shi'), ['是', '世', '十', '柿', '時', '丗', '石', '時候', '事情']);
});

test('tones typed narrow the words down, unless none has them', () => {
  assert.deepEqual(found('shi4'), ['是', '世', '柿', '丗', '事情']);
  assert.deepEqual(found('shì'), found('shi4'));
  assert.deepEqual(found('shi2hou'), ['時候']);
  // A tone on a later syllable: shi4 with qing5 but not hou5.
  assert.deepEqual(found('shiqing5'), ['事情']);
  // No word has this tone: the learner may have it wrong, so all are shown.
  assert.deepEqual(found('shi1'), found('shi'));
});

test('a word not typed out yet is found by how it begins', () => {
  assert.deepEqual(found('shih'), ['時候']);
  assert.deepEqual(found('shiq'), ['事情']);
});

test('a variant is put after the word it is a variant of, but a listed word never is one', () => {
  assert.ok(found('shi4').indexOf('丗') > found('shi4').indexOf('柿'));
  // With neither listed, the first in the file is taken for the word.
  assert.deepEqual(
    lookUpByPinyin(BY_SOUND, 'shi4').map((entry) => entry.traditional),
    ['是', '柿', '丗', '世', '事情'],
  );
});

test('syllables are found across apostrophes, and ü as v', () => {
  assert.deepEqual(found('xian'), ['先', '西安']);
  assert.deepEqual(found('xi an'), ['先', '西安']);
  assert.deepEqual(found('nü3'), ['女']);
  assert.deepEqual(found('ni hao'), []);
  assert.deepEqual(found('你'), []);
});

test('in the real dictionary, the common words come first for a single syllable', () => {
  const dictionary = readDictionary(fs.readFileSync('data/cedict/dictionary.tsv', 'utf8'));
  const listed = ['data/wordlists/hsk/hsk-3.0.tsv', 'data/wordlists/tocfl/tocfl.tsv'].flatMap((file) =>
    parseReadyList(fs.readFileSync(file, 'utf8')),
  );
  const all = (text) => lookUpByPinyin(dictionary, text, listed).map((entry) => entry.simplified);
  assert.deepEqual(all('shi4').slice(0, 4).sort(), ['事', '是', '试', '市'].sort());
  assert.equal(all('nihao')[0], '你好');
  assert.equal(all('zhongguo')[0], '中国');
  assert.ok(all('zhongg').slice(0, 3).includes('中国'));
  // 辭典 is in the TOCFL list, so it is not taken for a variant of 詞典.
  assert.ok(all('cidian').indexOf('辞典') < 3, all('cidian').join(' '));
  // Characters in no list but common in listed words come before rare ones.
  const yi = all('yi4');
  assert.ok(yi.indexOf('义') < 12 && yi.indexOf('义') < yi.indexOf('㑊'), yi.slice(0, 20).join(''));
  // The rare variants of 世 come after every ordinary shi4 word.
  assert.ok(all('shi4').indexOf('丗') > all('shi4').indexOf('逝'), all('shi4').join(''));
  // One letter finds only what is read that way, not every word it begins.
  assert.ok(all('a').length < 30);
});

test('text is split into the longest words the dictionary knows, the rest kept as it is', () => {
  const dictionary = readDictionary(
    ['我們\t我们\two3men5\twe', '老師\t老师\tlao3shi1\tteacher', '的\t\tde5\tof', '老\t\tlao3\told', ''].join('\n'),
  );
  const pieces = splitIntoWords(dictionary, 'Put 的 after it: 我们的老师.');
  assert.deepEqual(pieces, [
    { text: 'Put ', word: false },
    { text: '的', word: true },
    { text: ' after it: ', word: false },
    { text: '我们', word: true },
    { text: '的', word: true },
    { text: '老师', word: true },
    { text: '.', word: false },
  ]);
  // A character that starts no word known is a word by itself.
  assert.deepEqual(splitIntoWords(dictionary, '你老'), [
    { text: '你', word: true },
    { text: '老', word: true },
  ]);
});

// Looking a word up by its English meaning

import { lookUpByMeaning } from '../src/dictionary.js';

const BY_MEANING = readDictionary(
  [
    '教師\t教师\tjiao4shi1\tteacher',
    '老師\t老师\tlao3shi1\tteacher/(honorific) teacher',
    '班主任\t\tban1zhu3ren4\thead teacher; class supervisor',
    '師範\t师范\tshi1fan4\tteachers\' college',
    '教\t\tjiao1\tto teach',
    '吃\t\tchi1\tto eat; to consume/to eat at (a cafeteria etc)',
    '吃飯\t吃饭\tchi1fan4\tto have a meal; to eat',
    '海灘\t海滩\thai3tan1\tbeach',
    '師\t师\tShi1\tsurname Shi/teacher',
    '',
  ].join('\n'),
);
const MEANING_LISTED = [
  { traditional: '老師', simplified: '老师', pinyin: 'lao3shi1' },
  { traditional: '吃', simplified: '吃', pinyin: 'chi1' },
  { traditional: '吃飯', simplified: '吃饭', pinyin: 'chi1fan4' },
];
const meant = (text) => lookUpByMeaning(BY_MEANING, text, MEANING_LISTED).map((entry) => entry.traditional);

test('words are found by meaning, the whole meaning first, then a whole word, then the start of one', () => {
  // 老師 is in the lists, so before 教師; the name 師 after them; then "head
  // teacher" (a whole word), then "teachers'" (the start of one).
  assert.deepEqual(meant('teacher'), ['老師', '教師', '師', '班主任', '師範']);
  // "to", "a" and "the" are left out; one gloss of a meaning is enough.
  assert.deepEqual(meant('eat'), ['吃', '吃飯']);
  assert.deepEqual(meant('to eat'), ['吃', '吃飯']);
  // Only at the start of a word: "each" is not found in "teacher" or "beach".
  assert.deepEqual(meant('each'), []);
  // "teach" is a whole word only in 教; in the rest it begins a word, so
  // the shorter 師範 comes before 班主任, and the name 師 after both.
  assert.deepEqual(meant('teach'), ['教', '老師', '教師', '師範', '班主任', '師']);
  // Fewer than three letters find nothing.
  assert.deepEqual(meant('te'), []);
  // Typed in capitals, or with marks a search could not take as they are.
  assert.deepEqual(meant('TEACHER'), meant('teacher'));
  assert.deepEqual(meant('teacher('), []);
});

// Looking a word up by letters typed: pinyin or English

import { lookUpByLetters } from '../src/dictionary.js';

test('letters typed find words read so, then words meaning so, then readings that only begin so', () => {
  const dictionary = readDictionary(
    [
      '鋼琴\t钢琴\tgang1qin2\tpiano',
      "駢偶\t骈偶\tpian2'ou3\tparallel and antithetical (style)",
      '片\t\tpian4\tthin piece; flake',
      '偏\t\tpian1\tinclined to one side',
      '',
    ].join('\n'),
  );
  const found = (text) => lookUpByLetters(dictionary, text).map((entry) => entry.traditional);
  // "piano" begins the reading of 駢偶, but it means 鋼琴.
  assert.deepEqual(found('piano'), ['鋼琴', '駢偶']);
  // Read exactly so first: 片 and 偏, then 駢偶, whose reading only begins so.
  assert.deepEqual(found('pian').slice(-1), ['駢偶']);
  assert.deepEqual(new Set(found('pian').slice(0, 2)), new Set(['片', '偏']));
  // English that is not pinyin at all.
  assert.deepEqual(found('flake'), ['片']);
  // Each word once: 鋼琴 is read gangqin and means nothing like it.
  assert.deepEqual(found('gangqin'), ['鋼琴']);
});

// Looking a word up by characters typed

import { lookUpByCharacters } from '../src/dictionary.js';

test('characters typed find the words written so, then the longer words beginning so', () => {
  const dictionary = readDictionary(
    ['老\t\tlao3\told', '老鼠\t\tlao3shu3\trat', '老師\t老师\tlao3shi1\tteacher', '老百姓\t\tlao3bai3xing4\tcommon people', '姥\t\tlao3\tgrandma', ''].join('\n'),
  );
  const listed = [{ traditional: '老師', simplified: '老师', pinyin: 'lao3shi1' }];
  // 老師 is in the lists; 老鼠 is shorter than 老百姓.
  assert.deepEqual(lookUpByCharacters(dictionary, '老', listed).map((entry) => entry.traditional), ['老', '老師', '老鼠', '老百姓']);
  // Either script.
  assert.deepEqual(lookUpByCharacters(dictionary, '老师', listed).map((entry) => entry.traditional), ['老師']);
});

test('a writing card leaves Chinese out of the meaning', () => {
  assert.equal(meaningWithoutChinese('you (informal, as opposed to courteous 您)'), 'you (informal, as opposed to courteous …)');
  assert.equal(meaningWithoutChinese('knife; blade (CL:把)/(slang) dollar'), 'knife; blade/(slang) dollar');
  assert.equal(meaningWithoutChinese('classifier (CL:個|个[ge4])'), 'classifier');
  assert.equal(meaningWithoutChinese('abbr. for 動詞, verb'), 'abbr. for …, verb');
  assert.equal(meaningWithoutChinese('to eat (with chopsticks)'), 'to eat (with chopsticks)');
  // A meaning typed all in Chinese is kept.
  assert.equal(meaningWithoutChinese('你們'), '你們');
});

test('a writing card keeps a radical\'s full form in the meaning', () => {
  assert.equal(meaningWithoutChinese('clothing (side form of 衣)'), 'clothing (side form of 衣)');
  assert.equal(meaningWithoutChinese('fire (bottom form of 火)'), 'fire (bottom form of 火)');
  assert.equal(meaningWithoutChinese('the left-radical form of Kangxi radical 145, 衣'), 'the left-radical form of Kangxi radical 145, 衣');
  assert.equal(meaningWithoutChinese('Kangxi radical 61 (心) as a vertical side element'), 'Kangxi radical 61 (心) as a vertical side element');
  assert.equal(
    meaningWithoutChinese('Kangxi radical 18 (刀) as a vertical side element, referred to as 立刀旁 or 側刀旁'),
    'Kangxi radical 18 (刀) as a vertical side element, referred to as … or …',
  );
  // What shows the shape still goes (the owner, 2026-10-26).
  assert.equal(meaningWithoutChinese('"right open box" radical (Kangxi radical 22), occurring in 区, 医, 匹 etc'), '"right open box" radical (Kangxi radical 22), occurring in …, …, … etc');
  // And other forms, which would give the answer away.
  assert.equal(meaningWithoutChinese('erhua form of 一點'), 'erhua form of …');
});
