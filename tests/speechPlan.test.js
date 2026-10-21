// Tests for src/speechPlan.js: how a word is to be spoken.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { planSpeech, spokenSyllables, wordFileName } from '../src/speechPlan.js';
import { wordFileName as copiedFileName } from '../scripts/copy-audio.js';
import { BASICS_RECORDINGS } from '../src/basicsSounds.js';

const index = {
  words: new Set(['学习', '你好']),
  syllables: new Set(['ni2', 'ni3', 'hao3', 'xing1', 'qi1', 'qi2', 'bu2', 'bu4', 'shi4', 'yi1', 'yi2', 'yi4', 'tian1', 'ge4', 'di4', 'hen3', 'hen2']),
};
const word = (simplified, pinyin, traditional = simplified) => ({ simplified, traditional, pinyin });

test('a recorded word is played from its recording', () => {
  assert.deepEqual(planSpeech(word('学习', 'xue2xi2', '學習'), null, index), { kind: 'word', file: 'w/5b66-4e60' });
  assert.equal(wordFileName('学习'), '5b66-4e60');
  // The script that names the files and the app agree.
  assert.equal(copiedFileName('学习'), wordFileName('学习'));
});

test('another reading than the usual one is spoken syllable by syllable', () => {
  const week = word('星期', 'xing1qi1');
  // No recording: its syllables.
  assert.deepEqual(planSpeech(week, null, index), { kind: 'syllables', files: ['s/xing1', 's/qi1'] });
  // The Taiwan reading, exactly as asked for, even if the word were recorded.
  const recorded = { ...index, words: new Set(['星期']) };
  assert.deepEqual(planSpeech(week, 'xing1qi2', recorded), { kind: 'syllables', files: ['s/xing1', 's/qi2'] });
  assert.deepEqual(planSpeech(week, 'xing1qi1', recorded), { kind: 'word', file: 'w/661f-671f' });
});

test('a word with a syllable that has no recording is left to the device\'s voice', () => {
  // Few neutral-tone syllables are recorded.
  assert.deepEqual(planSpeech(word('朋友', 'peng2you5'), null, index), { kind: 'voice', text: '朋友' });
  assert.deepEqual(planSpeech(word('好', 'hao3, hao4'), null, { ...index, words: new Set(['好']) }), { kind: 'syllables', files: ['s/hao3'] });
});

test('tones are spoken as they change before other tones', () => {
  assert.deepEqual(spokenSyllables(['你', '好'], ['ni3', 'hao3']), ['ni2', 'hao3']);
  assert.deepEqual(spokenSyllables(['不', '是'], ['bu4', 'shi4']), ['bu2', 'shi4']);
  assert.deepEqual(spokenSyllables(['不', '好'], ['bu4', 'hao3']), ['bu4', 'hao3']);
  assert.deepEqual(spokenSyllables(['一', '个'], ['yi1', 'ge4']), ['yi2', 'ge4']);
  assert.deepEqual(spokenSyllables(['一', '天'], ['yi1', 'tian1']), ['yi4', 'tian1']);
  // A number read out keeps its tone, and so does 一 at the end.
  assert.deepEqual(spokenSyllables(['第', '一', '天'], ['di4', 'yi1', 'tian1']), ['di4', 'yi1', 'tian1']);
  assert.deepEqual(spokenSyllables(['十', '一'], ['shi2', 'yi1']), ['shi2', 'yi1']);
  // Without characters to go by, only the third-tone rule applies.
  assert.deepEqual(spokenSyllables(null, ['yi1', 'ge4', 'hen3', 'hao3']), ['yi1', 'ge4', 'hen2', 'hao3']);
});

test('the recordings in the repository are those the README describes', () => {
  const words = fs.readdirSync('data/audio-cmn/words');
  const syllables = fs.readdirSync('data/audio-cmn/syllables');
  assert.ok(words.length > 8000 && words.includes('cmn-学习.mp3'));
  assert.ok(syllables.includes('cmn-ma1.mp3') && syllables.includes('cmn-lv4.mp3'));
});

test('every recording "Basics of Chinese" plays is in the repository', () => {
  const nameOf = (file) => file.replace(/^cmn-|\.mp3$/g, '');
  const words = new Set(fs.readdirSync('data/audio-cmn/words').map((file) => `w/${copiedFileName(nameOf(file))}`));
  const syllables = new Set(fs.readdirSync('data/audio-cmn/syllables').map((file) => `s/${nameOf(file)}`));
  for (const name of BASICS_RECORDINGS) {
    assert.ok(words.has(name) || syllables.has(name), name);
  }
});
