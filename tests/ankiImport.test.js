// Tests for bringing a deck over from Anki (src/ankiFile.js, src/ankiImport.js),
// on small files made by Anki itself (tests/fixtures/anki/, see its README):
// the same collection exported in each format a learner may bring.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import initSqlJs from 'sql.js';

import { openAnkiFile, readCollection } from '../src/ankiFile.js';
import {
  cleanField,
  fieldsInTemplate,
  describeCollection,
  defaultChoices,
  guessRoles,
  layoutLines,
  fieldText,
  wordFromNote,
  planAnkiImport,
} from '../src/ankiImport.js';
import { readDictionary } from '../src/dictionary.js';
import { isSyllables } from '../src/pinyinSyllables.js';
import { replay, gradeOptions, GOOD } from '../src/scheduler.js';
import { planSession } from '../src/session.js';

const SQL = await initSqlJs();

async function collectionOf(name) {
  const db = await openAnkiFile(new Uint8Array(fs.readFileSync(`tests/fixtures/anki/${name}`)), SQL);
  const collection = readCollection(db);
  db.close();
  return collection;
}

// The collection's creation time (CRT in make-fixtures.py): a review card's
// due day counts from it.
const CRT = 1767240000;
const dueDay = (day) => (CRT + day * 86400) * 1000;

const DICTIONARY = readDictionary(
  [
    '你好\t\tni3hao3\thello/hi',
    '學校\t学校\txue2xiao4\tschool/CL:所[suo3]',
    '謝謝\t谢谢\txie4xie5\tto thank/thanks',
    '中國\t中国\tZhong1guo2\tChina',
    '老師\t老师\tlao3shi1\tteacher',
    '朋友\t\tpeng2you5\tfriend',
    '行\t\thang2\trow/line',
    '行\t\txing2\tto walk/to go/OK',
  ].join('\n'),
);

const NOW = Date.parse('2026-10-19T12:00:00Z');

function contextWith(changes = {}) {
  let made = 0;
  return {
    dictionary: DICTIONARY,
    likeliestEntry: (entries) => entries[0],
    meaningDetail: 'first',
    words: [],
    decks: [],
    cards: new Map(),
    settings: { script: 'traditional' },
    now: NOW,
    randomId: () => `deck-${++made}`,
    ...changes,
  };
}

test('every format Anki exports reads to the same collection', async () => {
  const fresh = await collectionOf('new.apkg');
  for (const name of ['legacy.apkg', 'whole.colpkg', 'shared.apkg']) {
    const other = await collectionOf(name);
    assert.equal(other.createdAt, CRT, name);
    assert.deepEqual(
      other.notes.map((note) => note.fields).sort(),
      fresh.notes.map((note) => note.fields).sort(),
      name,
    );
    assert.deepEqual(other.decks.map((deck) => deck.name).sort(), fresh.decks.map((deck) => deck.name).sort(), name);
    assert.equal(other.cards.length, fresh.cards.length, name);
    // A shared deck comes without its reviews.
    assert.equal(other.reviews.length, name === 'shared.apkg' ? 0 : fresh.reviews.length, name);
  }
  assert.equal(fresh.reviews.length, 16);
  const chinese = fresh.noteTypes.find((noteType) => noteType.name === 'Chinese (Yutu test)');
  assert.deepEqual(chinese.fields, ['Hanzi', 'Pinyin', 'Meaning', 'Audio']);
  assert.deepEqual(
    chinese.templates.map((template) => [template.name, template.front]),
    [
      ['Recognition', '{{Hanzi}}'],
      ['Recall', '{{Meaning}}'],
      ['Listening', '{{Audio}}'],
    ],
  );
});

test("a field is read without Anki's markup", () => {
  assert.equal(cleanField('<b>谢谢</b>'), '谢谢');
  assert.equal(cleanField('lǎoshī<br>teacher'), 'lǎoshī\nteacher');
  assert.equal(cleanField('<div>to&nbsp;eat</div><div>food &amp; drink</div>'), 'to eat\nfood & drink');
  assert.equal(cleanField('[sound:nihao.mp3]'), '');
  assert.equal(cleanField('&#20320;&#x597D;'), '你好');
});

test('a field with its accents stored apart reads as the usual letters', () => {
  // "ài" as some shared decks store it: a, then a separate grave accent.
  const apart = 'a\u0300i';
  assert.notEqual(apart, 'ài');
  assert.equal(cleanField(apart), 'ài');
  assert.equal(cleanField('l&#x01ce;oshi&#x0304;'), 'lǎoshī');
  const word = wordFromNote({ characters: '学校', pinyin: cleanField('xue\u0301xia\u0300o'), meaning: '' }, contextWith());
  assert.equal(word.word.pinyin, 'xue2xiao4');
  assert.equal(word.word.definition, 'school');
});

test('the fields a template shows are found by name', () => {
  assert.deepEqual(fieldsInTemplate('{{FrontSide}}<hr id=answer>{{Pinyin}}<br>{{type:Meaning}}'), {
    fields: ['Pinyin', 'Meaning'],
    cloze: false,
  });
  assert.deepEqual(fieldsInTemplate('{{#Add Reverse}}{{Back}}{{/Add Reverse}}'), { fields: ['Back'], cloze: false });
  assert.equal(fieldsInTemplate('{{cloze:Text}}').cloze, true);
});

test("each field's role and each template's cards are guessed", async () => {
  const description = describeCollection(await collectionOf('new.apkg'));
  const chinese = description.noteTypes.find((noteType) => noteType.name === 'Chinese (Yutu test)');
  assert.deepEqual(chinese.roles, { characters: 0, pinyin: 1, meaning: 2 });
  const byName = Object.fromEntries(chinese.templates.map((template) => [template.name, template]));
  assert.deepEqual(byName.Recognition.types, ['meaning', 'pinyin']);
  // Meaning to characters could be writing, but is left to the learner.
  assert.deepEqual(byName.Recall.types, []);
  assert.equal(byName.Recall.couldBeWriting, true);
  assert.deepEqual(byName.Listening.types, []);
  // Basic: the back has the pinyin, then the meaning.
  const basic = description.noteTypes.find((noteType) => noteType.name === 'Basic');
  assert.deepEqual(basic.roles, { characters: 0, pinyin: null, meaning: 1 });
  assert.deepEqual(basic.templates[0].types, ['meaning', 'pinyin']);
  assert.deepEqual(
    description.decks.map((deck) => [deck.name, deck.cardCount]),
    [
      ['Chinese', 1],
      // A template makes a card only where its front's field is filled in:
      // only 你好 in HSK 1 has a sound, so a Listening card.
      ['Chinese::Extra', 4],
      ['Chinese::HSK 1', 11],
    ],
  );
});

test('only syllables of Mandarin make pinyin', () => {
  for (const letters of ['nihao', 'xian', 'yidianr', 'lve', 'nv', 'zhuang', 'er', 'r']) {
    assert.equal(isSyllables(letters), true, letters);
  }
  for (const letters of ['hsk', 'top', 'nhat', 'hello', 'bv', '']) {
    assert.equal(isSyllables(letters), false, letters);
  }
  // A deck's level and frequency fields ("HSK 1", "Top 500") are not taken
  // for pinyin; the reading is the meaning's first line, as in Basic.
  const noteType = { fields: ['Hanzi', 'Level', 'Back'] };
  const notes = [
    ['你好', 'HSK 1', 'nǐhǎo<br>hello'],
    ['老师', 'HSK 1', 'lǎoshī<br>teacher'],
    ['学校', 'Top 500', 'xuéxiào<br>school'],
  ].map((fields) => ({ fields }));
  assert.deepEqual(guessRoles(noteType, notes), { characters: 0, pinyin: null, meaning: 2 });
});

test('a field filled in every note wins over one filled in a few', () => {
  // As in a shared deck of radicals: Simplified is filled only where the
  // radical has a simplified form; Radical always. And as in a deck of
  // characters: Examples Pinyin is often empty, Pinyin never.
  const noteType = { fields: ['Radical', 'Simplified', 'Examples Pinyin', 'Pinyin', 'Meaning'] };
  const notes = [
    ['一', '', '', 'yī', 'one'],
    ['言', '讠', 'yǔyán', 'yán', 'speech'],
    ['水', '', 'shuǐguǒ', 'shuǐ', 'water'],
    ['門', '门', '', 'mén', 'door'],
    ['口', '', 'kǒuyǔ', 'kǒu', 'mouth'],
  ].map((fields) => ({ fields }));
  assert.deepEqual(guessRoles(noteType, notes, 'simplified'), { characters: 0, pinyin: 3, meaning: 4 });
});

test("the headings of a deck's layout are left out of a field", () => {
  // As in a shared deck whose meaning field has a heading above it, and
  // whose part of speech is the same in most notes.
  const notes = [
    ['爱', '<div class="title">Common Meaning</div><div>to love</div>', 'verb'],
    ['八', '<div class="title">Common Meaning</div><div>eight</div>', 'numeral'],
    ['爸爸', '<div class="title">Common Meaning</div><div>father</div>', 'noun'],
    ['杯子', '<div class="title">Common Meaning</div>', 'noun'],
    ['北京', '', 'noun'],
  ].map((fields) => ({ fields }));
  const layout = layoutLines(notes);
  assert.deepEqual([...layout[1]], ['Common Meaning']);
  assert.equal(layout[2].size, 0);
  assert.equal(fieldText(notes[0], 1, layout), 'to love');
  assert.equal(fieldText(notes[3], 1, layout), '');
  assert.equal(fieldText(notes[2], 2, layout), 'noun');
});

test('an example sentence is not cut down to a word at a bracket', () => {
  const context = contextWith();
  const problem = wordFromNote({ characters: '我(不)看書。', pinyin: '', meaning: 'I (do not) read books.' }, context);
  assert.match(problem.problem, /sentence/);
  // Both forms with a bracket are still one word.
  assert.equal(wordFromNote({ characters: '学校 (學校)', pinyin: '', meaning: '' }, context).word.traditional, '學校');
});

test('a note becomes a word with the help of the dictionary', () => {
  const context = contextWith();
  const word = (characters, pinyin, meaning) => wordFromNote({ characters, pinyin, meaning }, context).word;
  // Tone marks without a space between syllables: the dictionary splits them.
  assert.deepEqual(word('你好', 'nǐhǎo', 'hello'), {
    traditional: '你好',
    simplified: '你好',
    pinyin: 'ni3hao3',
    definition: 'hello',
  });
  // Simplified characters: the traditional form comes from the dictionary.
  assert.equal(word('学校', 'xué xiào', 'school').traditional, '學校');
  // No pinyin: the dictionary's (likeliest) reading. No meaning: its meaning.
  assert.equal(word('老師', '', 'teacher').pinyin, 'lao3shi1');
  assert.equal(word('朋友', 'péngyou', '').definition, 'friend');
  // The reading the note gives decides between two words written alike.
  assert.equal(word('行', 'háng', 'row').pinyin, 'hang2');
  // Pinyin, then the meaning, in one field.
  assert.deepEqual(
    [word('老师', '', 'lǎoshī\nteacher').pinyin, word('老师', '', 'lǎoshī\nteacher').definition],
    ['lao3shi1', 'teacher'],
  );
  // A word the dictionary lacks keeps the note's pinyin if it can be read.
  assert.equal(word('玉兔', 'yù tù', 'jade rabbit').pinyin, 'yu4tu4');
  // Both forms in one field: the first is taken.
  assert.equal(word('學校/学校', 'xué xiào', 'school').simplified, '学校');
  assert.match(wordFromNote({ characters: '', pinyin: '', meaning: 'measure words' }, context).problem, /characters/);
  assert.match(wordFromNote({ characters: '你好吗？', pinyin: '', meaning: 'how are you?' }, context).problem, /sentence/);
});

test("an import copies Anki's reviews and keeps its due dates", async () => {
  const collection = await collectionOf('new.apkg');
  const plan = planAnkiImport(collection, defaultChoices(describeCollection(collection)), contextWith());
  assert.deepEqual(plan.report.problems.map((problem) => problem.text), ['Measure words']);
  assert.equal(plan.report.newWords, 6);
  assert.equal(plan.report.sameWord, 1);
  // Anki's decks, one inside the other.
  assert.deepEqual(
    plan.decks.map((deck) => [deck.name, deck.parentId]),
    [
      ['Chinese', null],
      ['HSK 1', 'deck-1'],
      ['Extra', 'deck-1'],
    ],
  );
  const word = (id) => plan.words.find((candidate) => candidate.id === id);
  const card = (id) => plan.cards.find((candidate) => candidate.id === id);
  assert.deepEqual(word('你好|ni3hao3').decks, ['deck-2']);
  assert.equal(word('你好|ni3hao3').definition, 'hello');
  assert.equal(word('你好|ni3hao3').importedAt, NOW);

  // 你好's Recognition card stands for its meaning and pinyin cards, and its
  // tone card goes by the pinyin card. Due on Anki's day 300.
  for (const type of ['meaning', 'pinyin', 'tone']) {
    assert.equal(card(`你好|ni3hao3#${type}`).due, dueDay(300), type);
  }
  assert.equal(card('你好|ni3hao3#meaning').fsrsState.lapses, 1);
  assert.equal(card('你好|ni3hao3#writing'), undefined);
  const copied = plan.reviews.filter((review) => review.cardId === '你好|ni3hao3#meaning');
  assert.equal(copied.filter((review) => review.grade).length, 6);
  assert.deepEqual(
    copied.filter((review) => review.grade).map((review) => review.duration),
    [6000, 3000, 2500, 90000, 5000, 1500],
  );
  // The most-reviewed of the two 你好 notes counts: the first one.
  assert.ok(copied.every((review) => review.time < Date.UTC(2026, 0, 30)));

  // Anki's FSRS memory is kept.
  assert.equal(card('學校|xue2xiao4#meaning').fsrsState.stability, 9.5);
  assert.equal(card('學校|xue2xiao4#meaning').fsrsState.difficulty, 4.25);
  // A card suspended in Anki stays suspended.
  assert.deepEqual(word('謝謝|xie4xie5').suspended, ['meaning', 'pinyin', 'tone']);
  // A card in its learning steps is due at the moment Anki said.
  assert.equal(card('中國|Zhong1guo2#meaning').due, (CRT + 40 * 86400 + 600) * 1000);
  // A note never studied waits in Learn.
  assert.equal(word('朋友|peng2you5').importedAt, undefined);
  assert.ok(!plan.cards.some((candidate) => candidate.wordId === '朋友|peng2you5'));
});

test('a template ticked for writing brings its history to the writing card', async () => {
  const collection = await collectionOf('new.apkg');
  const choices = defaultChoices(describeCollection(collection));
  const chinese = collection.noteTypes.find((noteType) => noteType.name === 'Chinese (Yutu test)');
  choices.noteTypes[chinese.id].templates[1] = ['writing'];
  const plan = planAnkiImport(collection, choices, contextWith());
  assert.equal(plan.cards.find((card) => card.id === '你好|ni3hao3#writing').due, dueDay(290));
  // 學校's Recall card was reset to new in Anki: no writing card.
  assert.ok(!plan.cards.some((card) => card.id === '學校|xue2xiao4#writing'));
});

test('importing the same file again changes nothing that was studied', async () => {
  const collection = await collectionOf('new.apkg');
  const choices = defaultChoices(describeCollection(collection));
  const first = planAnkiImport(collection, choices, contextWith());
  const again = planAnkiImport(
    collection,
    choices,
    contextWith({
      words: first.words,
      decks: first.decks,
      cards: new Map(first.cards.map((card) => [card.id, card])),
    }),
  );
  assert.equal(again.decks.length, 0);
  assert.equal(again.reviews.length, 0);
  assert.equal(again.report.newWords, 0);
  assert.equal(again.report.alreadyStudied, first.cards.length);
  // Review IDs come from Anki's, so the same import on two devices agrees.
  assert.ok(first.reviews.every((review) => review.id.startsWith('anki-')));
});

test("a card goes on from Anki's schedule, not from its rebuilt reviews", async () => {
  const collection = await collectionOf('new.apkg');
  const plan = planAnkiImport(collection, defaultChoices(describeCollection(collection)), contextWith());
  const reviews = plan.reviews.filter((review) => review.cardId === '你好|ni3hao3#meaning');
  assert.equal(replay(reviews).due, dueDay(300));
  // A review made here later goes on from the imported schedule.
  const later = new Date(dueDay(300));
  const schedule = reviews.find((review) => review.importedSchedule).importedSchedule;
  const expected = gradeOptions(schedule.fsrsState, later)[GOOD].due;
  assert.equal(replay([...reviews, { time: later.getTime(), grade: GOOD }]).due, expected);
});

test("an imported word's cards without history come a few a day", () => {
  const day = Date.parse('2026-10-19T12:00:00');
  const studied = (id, type) => ({ id: `${id}#${type}`, due: day - 1, firstReviewedAt: day - 30 * 86400000, lastReviewedAt: day - 86400000 });
  const words = ['一', '二', '三'].map((char, index) => ({
    id: `${char}|x${index}`,
    traditional: char,
    simplified: char,
    pinyin: 'yi1',
    order: index,
    importedAt: day - 86400000,
  }));
  const cards = new Map(words.map((word) => [`${word.id}#meaning`, { ...studied(word.id, 'meaning'), due: day + 86400000 }]));
  const plan = planSession(words, cards, day, { newWordsPerDay: 2, enabledTypes: ['meaning', 'writing'] });
  // Three writing cards without history, two allowed today.
  assert.equal(plan.newCardCount, 0);
  assert.equal(plan.newWordsLeftToday, 2);
  assert.equal(plan.fromAnki, true);
  assert.deepEqual([plan.next.word.id, plan.next.type], ['一|x0', 'writing']);
});
