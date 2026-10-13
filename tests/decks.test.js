// Tests for src/decks.js. Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { READY_MADE_LISTS, readyMadeDeck, missingReadyMadeDecks, wordsWithListsAsDecks } from '../src/decks.js';
import { parseReadyList, levelsOfReadyList, listTag } from '../src/words.js';

test('a ready-made list and its levels have decks with fixed IDs', () => {
  assert.deepEqual(readyMadeDeck('hsk-3.0'), { id: 'hsk-3.0', name: 'HSK 3.0', parentId: null, order: 0 });
  assert.deepEqual(readyMadeDeck('hsk-3.0/7-9'), { id: 'hsk-3.0/7-9', name: 'Level 7-9', parentId: 'hsk-3.0', order: 6 });
  assert.deepEqual(readyMadeDeck('tocfl/Novice 2'), { id: 'tocfl/Novice 2', name: 'Novice 2', parentId: 'tocfl', order: 1 });
  assert.equal(readyMadeDeck('hsk-3.0/12'), null);
  assert.equal(readyMadeDeck('my textbook'), null);
});

test('the levels listed for the decks are those in the list files', () => {
  const files = { 'hsk-3.0': 'hsk/hsk-3.0.tsv', 'hsk-2.0': 'hsk/hsk-2.0.tsv', tocfl: 'tocfl/tocfl.tsv' };
  assert.deepEqual(READY_MADE_LISTS.map((list) => list.id), Object.keys(files));
  for (const list of READY_MADE_LISTS) {
    const entries = parseReadyList(fs.readFileSync(`data/wordlists/${files[list.id]}`, 'utf8'));
    assert.deepEqual(levelsOfReadyList(entries, []).map((entry) => entry.level), list.levels, list.id);
    // Every level's tag, as the Words tab makes it, has a deck.
    for (const level of list.levels) {
      assert.equal(readyMadeDeck(listTag(list.id, level)).parentId, list.id);
    }
  }
});

test('only the decks that are not stored yet are made, with the list they are in', () => {
  const words = [
    { id: 'a', decks: ['hsk-3.0/1'] },
    { id: 'b', decks: ['hsk-3.0/1', 'hsk-2.0/2', 'made by hand'] },
    { id: 'c' },
  ];
  assert.deepEqual(missingReadyMadeDecks(words, []).map((deck) => deck.id), ['hsk-3.0', 'hsk-3.0/1', 'hsk-2.0', 'hsk-2.0/2']);
  assert.deepEqual(missingReadyMadeDecks(words, [{ id: 'hsk-3.0' }, { id: 'hsk-3.0/1' }]).map((deck) => deck.id), ['hsk-2.0', 'hsk-2.0/2']);
});

test('the list tags of words added before there were decks become their decks', () => {
  const words = [{ id: 'a', lists: ['hsk-3.0/1', 'hsk-2.0/1'], order: 3 }, { id: 'b' }, { id: 'c', decks: ['x'] }];
  assert.deepEqual(wordsWithListsAsDecks(words), [{ id: 'a', order: 3, decks: ['hsk-3.0/1', 'hsk-2.0/1'] }]);
});
