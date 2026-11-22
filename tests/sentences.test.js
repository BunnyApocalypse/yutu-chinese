// Tests for src/sentences.js: sentences as things to study.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  isSentence,
  sentenceId,
  sentenceRecord,
  sentenceWriting,
  sentenceCardTypes,
  clozeInBoth,
  looksLikeSentence,
  isSentenceReading,
  readSentenceFields,
  newSentenceRecords,
  learnedWhenAdded,
  shortForm,
} from '../src/sentences.js';
import { heldForGapWord, sentenceLessonSteps, nextToLearn } from '../src/session.js';
import { studyByDay } from '../src/streak.js';
import { cardIdFor } from '../src/session.js';
import { planSpeech } from '../src/speechPlan.js';
import { splitSyllables } from '../src/tones.js';
import { formatPinyin } from '../src/wordList.js';
import { isPinyinWord } from '../src/words.js';

const example = {
  traditional: '我們是同學。',
  simplified: '我们是同学。',
  pinyin: 'Wǒmen shì tóngxué.',
  definition: 'We are classmates.',
  cloze: { traditional: '同學', simplified: '同学' },
};

test('a sentence is a word record of its own kind', () => {
  const record = sentenceRecord(example, 7, 'chinese', 1000);
  assert.deepEqual(record, {
    id: '我們是同學。|sentence',
    kind: 'sentence',
    traditional: '我們是同學。',
    simplified: '我们是同学。',
    pinyin: 'Wǒmen shì tóngxué.',
    definition: 'We are classmates.',
    order: 7,
    addedAt: 1000,
    learnedAt: 1000,
    decks: ['chinese'],
    cloze: { traditional: '同學', simplified: '同学' },
  });
  assert.equal(isSentence(record), true);
  assert.equal(isSentence({ id: '愛|ai4' }), false);
  assert.equal(sentenceId('你好嗎？'), '你好嗎？|sentence');
  // A cloze word that is not in the sentence is left out.
  assert.equal(sentenceRecord({ ...example, cloze: { traditional: '老師', simplified: '老师' } }, 0, 'chinese', 1).cloze, undefined);
  // Its writing cards are kept per script like a word's.
  assert.equal(cardIdFor(record, 'writing', 'simplified'), '我們是同學。|sentence#writing#simplified');
});

test('the rest of the app copes with a sentence\'s pinyin', () => {
  const record = sentenceRecord(example, 0, 'chinese', 1);
  // It is shown as it is, has no syllables to check tones against, and is
  // left to the device's voice.
  assert.equal(formatPinyin(record.pinyin), 'Wǒmen shì tóngxué.');
  assert.deepEqual(splitSyllables(record.pinyin), []);
  assert.deepEqual(planSpeech(record, record.pinyin, { words: new Set(), syllables: new Set() }), { kind: 'voice', text: '我们是同学。' });
});

test('a sentence\'s writing card asks for its cloze word or for all of it', () => {
  const record = sentenceRecord(example, 0, 'chinese', 1);
  assert.deepEqual(sentenceWriting(record, 'traditional', 'word'), { text: '同學', prompt: '我們是＿＿。' });
  assert.deepEqual(sentenceWriting(record, 'simplified', 'word'), { text: '同学', prompt: '我们是＿＿。' });
  assert.deepEqual(sentenceWriting(record, 'simplified', 'sentence'), { text: '我们是同学。', prompt: null });
  // Without a cloze word there is only the whole sentence to write.
  const { cloze, ...plain } = record;
  assert.deepEqual(sentenceWriting(plain, 'traditional', 'word'), { text: '我們是同學。', prompt: null });
  // A word that stands twice in the sentence is a gap at both places, and
  // still written once.
  const twice = { ...record, traditional: '百聞不如一見，聞了才知道。', cloze: { traditional: '聞', simplified: '闻' } };
  assert.deepEqual(sentenceWriting(twice, 'traditional', 'word'), { text: '聞', prompt: '百＿不如一見，＿了才知道。' });
});

test('the word to fill in is found in the other script by its place', () => {
  assert.deepEqual(clozeInBoth('你好嗎？', '你好吗？', '嗎'), { own: '嗎', other: '吗' });
  assert.deepEqual(clozeInBoth('我們是同學。', '我们是同学。', '同學'), { own: '同學', other: '同学' });
  // Sentences of different lengths: the word as typed.
  assert.deepEqual(clozeInBoth('你好嗎？', '你好', '嗎'), { own: '嗎', other: '嗎' });
  // Not in the sentence, or nothing typed.
  assert.equal(clozeInBoth('你好嗎？', '你好吗？', '們'), null);
  assert.equal(clozeInBoth('你好嗎？', '你好吗？', ''), null);
});

test('the settings say which cards sentences have', () => {
  assert.deepEqual(sentenceCardTypes({ sentenceReading: true, sentenceWriting: 'word' }), ['meaning', 'writing']);
  assert.deepEqual(sentenceCardTypes({ sentenceReading: false, sentenceWriting: 'sentence' }), ['writing']);
  assert.deepEqual(sentenceCardTypes({ sentenceReading: true, sentenceWriting: 'off' }), ['meaning']);
});

// ---- Sentences in a list ----

const read = (line) => readSentenceFields(line.includes('\t') ? line.split('\t') : line.split(','), line.includes('\t'), isPinyinWord);

test('a line is a sentence when it has a sentence\'s punctuation', () => {
  assert.equal(looksLikeSentence('我们是同学。'), true);
  assert.equal(looksLikeSentence('你好吗?'), true);
  // A grammar pattern with gaps is not a sentence (Skritter's lists have them).
  assert.equal(looksLikeSentence('……，这样……'), false);
  assert.equal(looksLikeSentence('越...越...'), false);
  assert.equal(looksLikeSentence('同学'), false);
  assert.equal(looksLikeSentence('。'), false);
});

test('a sentence\'s reading is told from its meaning', () => {
  assert.equal(isSentenceReading('Wǒmen shì tóngxué.', isPinyinWord), true);
  assert.equal(isSentenceReading('wo3men5 shi4', isPinyinWord), true);
  assert.equal(isSentenceReading('ㄨㄛˇ ㄇㄣ˙ ㄕˋ ㄊㄨㄥˊ ㄒㄩㄝˊ。', isPinyinWord), true);
  assert.equal(isSentenceReading('We are classmates.', isPinyinWord), false);
  assert.equal(isSentenceReading('同学', isPinyinWord), false);
  assert.equal(isSentenceReading('', isPinyinWord), false);
});

test('a sentence\'s columns: both scripts, one, or one left empty', () => {
  const full = { first: '我们是同学。', second: '我們是同學。', pinyin: 'Wǒmen shì tóngxué.', definition: 'We are classmates.', cloze: '同学' };
  assert.deepEqual(read('我们是同学。\t我們是同學。\tWǒmen shì tóngxué.\tWe are classmates.\t同学'), full);
  // The second script left empty, or left out.
  const oneScript = { ...full, second: null };
  assert.deepEqual(read('我们是同学。\t\tWǒmen shì tóngxué.\tWe are classmates.\t同学'), oneScript);
  assert.deepEqual(read('我们是同学。\tWǒmen shì tóngxué.\tWe are classmates.\t同学'), oneScript);
  // Without a reading or a word to fill in.
  assert.deepEqual(read('我们是同学。\tWe are classmates.'), { ...oneScript, pinyin: '', cloze: null });
  assert.deepEqual(read('我们是同学。\t\t\tWe are classmates.'), { ...oneScript, pinyin: '', cloze: null });
  // Zhuyin is kept as it is.
  assert.equal(read('我们是同学。\tㄨㄛˇ ㄇㄣ˙ ㄕˋ ㄊㄨㄥˊ ㄒㄩㄝˊ。\tWe are classmates.').pinyin, 'ㄨㄛˇ ㄇㄣ˙ ㄕˋ ㄊㄨㄥˊ ㄒㄩㄝˊ。');
});

test('a CSV sentence split at its commas is put back together', () => {
  const line = '即使下雨，我也会去。,Jíshǐ xiàyǔ, wǒ yě huì qù.,Even if it rains, I will still go.,即使';
  assert.deepEqual(read(line), {
    first: '即使下雨，我也会去。',
    second: null,
    pinyin: 'Jíshǐ xiàyǔ, wǒ yě huì qù.',
    definition: 'Even if it rains, I will still go.',
    cloze: '即使',
  });
});

test('a sentence without a meaning, or with too many columns, is reported', () => {
  assert.deepEqual(read('我们是同学。'), { reason: 'sentenceMeaning' });
  assert.deepEqual(read('我们是同学。\tWǒmen shì tóngxué.'), { reason: 'sentenceMeaning' });
  assert.deepEqual(read('我们是同学。\tWe are classmates.\tA note\tAnother'), { reason: 'sentenceColumns' });
});

test('a sentence may wait in Learn, and one learned as it was added is told apart', () => {
  const waiting = sentenceRecord(example, 0, 'chinese', 1000, { waiting: true });
  assert.equal(waiting.learnedAt, undefined);
  assert.equal(learnedWhenAdded(waiting), false);
  // From a word's page: learned as it is added.
  assert.equal(learnedWhenAdded(sentenceRecord(example, 0, 'chinese', 1000)), true);
  // Learned in Learn, later.
  assert.equal(learnedWhenAdded({ ...waiting, learnedAt: 5000 }), false);
  // A word is never one.
  assert.equal(learnedWhenAdded({ id: '同學|tong2xue2', addedAt: 1, learnedAt: 1 }), false);
});

test('a sentence is shown by its first characters in a small box', () => {
  const record = sentenceRecord(example, 0, 'chinese', 1);
  assert.equal(shortForm(record, 'simplified'), '我们…');
  assert.equal(shortForm({ ...record, simplified: '好！' }, 'simplified'), '好！');
  assert.equal(shortForm({ traditional: '圖書館', simplified: '图书馆' }, 'traditional'), '圖書館');
  assert.equal(shortForm({ traditional: '圖書館員', simplified: '图书馆员' }, 'traditional'), '圖書館員');
});

test('a list\'s new sentences are queued after every word, each once', () => {
  const existing = [{ id: '同學|tong2xue2', order: 4 }, { id: '我們是同學。|sentence', order: 2 }];
  const sentences = [example, { ...example, traditional: '你好嗎？', simplified: '你好吗？', cloze: undefined }, { ...example, traditional: '你好嗎？' }];
  const { toAdd, alreadyHave } = newSentenceRecords(sentences, existing, 'deck', 9);
  assert.deepEqual(toAdd.map((record) => [record.id, record.order, record.decks]), [['你好嗎？|sentence', 5, ['deck']]]);
  assert.equal(alreadyHave, 2);
  // They wait in Learn.
  assert.equal(toAdd[0].learnedAt, undefined);
});

// ---- Sentences in Learn ----

test('a sentence waits in Learn until the word in its gap is learned', () => {
  const word = { id: '同學|tong2xue2', traditional: '同學', simplified: '同学', order: 5 };
  const sentence = sentenceRecord(example, 1, 'chinese', 1000, { waiting: true });
  const other = sentenceRecord({ ...example, traditional: '你好嗎？', simplified: '你好吗？', cloze: { traditional: '嗎', simplified: '吗' } }, 2, 'chinese', 1000, { waiting: true });
  const cards = new Map();
  assert.deepEqual([...heldForGapWord([word, sentence, other], cards)], ['我們是同學。|sentence']);
  // So the word comes first, though the sentence is earlier in the queue,
  // and the sentence whose gap word isn't among the words is not held.
  const learnable = (words) => {
    const held = heldForGapWord(words, cards);
    return words.filter((entry) => !held.has(entry.id));
  };
  assert.equal(nextToLearn(learnable([word, sentence, other]), cards).id, '你好嗎？|sentence');
  assert.equal(nextToLearn(learnable([word, sentence]), cards).id, '同學|tong2xue2');
  // Once the word is learned, the sentence is free.
  assert.deepEqual([...heldForGapWord([{ ...word, learnedAt: 2000 }, sentence], cards)], []);
});

test('a sentence\'s lesson: a look, reading it, and its gap word written', () => {
  assert.deepEqual(sentenceLessonSteps({ canWriteGap: true }), ['meet', 'read', 'outline', 'test']);
  assert.deepEqual(sentenceLessonSteps({ canWriteGap: false }), ['meet', 'read']);
});

test('a sentence counts for the streak once learned in Learn, not as it was added', () => {
  const day = new Date(2026, 10, 22, 12).getTime();
  const added = sentenceRecord(example, 0, 'chinese', day);
  const learned = { ...sentenceRecord({ ...example, traditional: '你好嗎？' }, 1, 'chinese', day - 1000, { waiting: true }), learnedAt: day };
  const [counts] = [...studyByDay([], [added, learned]).values()];
  assert.equal(counts.words, 1);
});
