// Tests for src/leeches.js: which cards are leeches, and the two exports.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { isLeech, lapsesOf, findLeeches, describeLeech, leechList, leechPrompt } from '../src/leeches.js';
import { gradeOptions, AGAIN, GOOD } from '../src/scheduler.js';
import { formatPinyin } from '../src/wordList.js';

const study = { id: '學習|xue2xi2', traditional: '學習', simplified: '学习', pinyin: 'xue2xi2', definition: 'to study;\tto learn', order: 2 };
const love = { id: '愛|ai4', traditional: '愛', simplified: '爱', pinyin: 'ai4', definition: 'to love', order: 1 };
const card = (word, type, lapses, suffix = '') => ({ id: `${word.id}#${type}${suffix}`, wordId: word.id, type, fsrsState: { lapses } });
const traditional = () => 'traditional';

test('a lapse is counted when a card that had been learned is forgotten', () => {
  // Learn a card, then forget it twice, a month apart each time.
  let state = null;
  let time = new Date('2026-01-05T09:00:00').getTime();
  for (const grade of [GOOD, GOOD, GOOD, AGAIN, GOOD, GOOD, AGAIN, GOOD]) {
    state = gradeOptions(state, new Date(time))[grade].fsrsState;
    time += 30 * 24 * 60 * 60 * 1000;
  }
  assert.equal(lapsesOf({ fsrsState: state }), 2);
  assert.equal(isLeech({ fsrsState: state }, 2), true);
  assert.equal(isLeech({ fsrsState: state }, 3), false);
  // A card never studied is no leech.
  assert.equal(lapsesOf(null), 0);
  assert.equal(isLeech(null, 2), false);
});

test('the leeches are found, most forgotten first, with the character missed most', () => {
  const cards = [
    card(love, 'meaning', 6),
    card(love, 'pinyin', 5),
    card(study, 'writing', 9, '#simplified'),
    card({ id: 'gone|x' }, 'meaning', 20),
  ];
  const review = (passedPerChar, script = 'simplified') => ({ wordId: study.id, type: 'writing', script, passedPerChar });
  const reviews = [
    review([true, false]),
    review([false, false]),
    review([true, true]),
    // The traditional card's reviews, and one from when the word was longer, do not count.
    review([false, true], 'traditional'),
    review([false, true, true]),
  ];
  const leeches = findLeeches([love, study], cards, reviews, 6);
  assert.deepEqual(leeches.map((leech) => [leech.card.id, leech.lapses]), [
    ['學習|xue2xi2#writing#simplified', 9],
    ['愛|ai4#meaning', 6],
  ]);
  assert.deepEqual(leeches[0].missedChar, { char: '习', missed: 2, of: 3 });
  assert.equal(leeches[0].script, 'simplified');
  assert.equal(leeches[1].missedChar, null);
  assert.equal(describeLeech(leeches[0]), 'writing · forgotten 9 times · 习 missed 2 of 3 times');
  assert.equal(describeLeech(leeches[1]), 'meaning · forgotten 6 times');
  // Without the reviews, the leeches are found all the same.
  assert.equal(findLeeches([love, study], cards, [], 6)[0].missedChar, null);
});

test('the leeches can be taken elsewhere as a list and as a prompt', () => {
  const leeches = findLeeches([love, study], [card(love, 'tone', 7), card(love, 'meaning', 6), card(study, 'writing', 8, '#simplified')], [], 6);
  // A writing card is listed in the script it is written in, the others in
  // the script the word is shown in.
  assert.equal(
    leechList(leeches, traditional, formatPinyin),
    'word\tpinyin\tmeaning\tcard\ttimes forgotten\tcharacter missed most\n' +
      '学习\txuéxí\tto study; to learn\twriting\t8\t\n' +
      '愛\tài\tto love\ttones\t7\t\n' +
      '愛\tài\tto love\tmeaning\t6\t\n',
  );
  const prompt = leechPrompt(leeches, traditional, formatPinyin);
  // One line per word, with everything forgotten about it.
  assert.match(prompt, /^- 学习 \(xuéxí\): to study; to learn\. I keep forgetting: writing \(forgotten 8 times\)\.$/m);
  assert.match(prompt, /^- 愛 \(ài\): to love\. I keep forgetting: tones \(forgotten 7 times\); meaning \(forgotten 6 times\)\.$/m);
  assert.match(prompt, /mnemonic/);
});
