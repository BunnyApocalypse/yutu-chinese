// Tests for src/sentences.js: sentences as things to study.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { isSentence, sentenceId, sentenceRecord, sentenceWriting, sentenceCardTypes, clozeInBoth } from '../src/sentences.js';
import { cardIdFor } from '../src/session.js';
import { planSpeech } from '../src/speechPlan.js';
import { splitSyllables } from '../src/tones.js';
import { formatPinyin } from '../src/wordList.js';

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
