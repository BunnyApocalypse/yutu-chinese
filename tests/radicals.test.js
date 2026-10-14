// Tests for src/radicals.js and the ready-made deck of radicals
// (data/wordlists/radicals/radicals.tsv, built by scripts/build-radicals.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { isRadical, radicalId, radicalRecord } from '../src/radicals.js';
import { parseReadyList, levelsOfReadyList, entryId, newWordRecords } from '../src/words.js';
import { readDictionary, lookUp } from '../src/dictionary.js';

const entries = parseReadyList(fs.readFileSync('data/wordlists/radicals/radicals.tsv', 'utf8'));

test('a line with no reading becomes a radical with its own ID and meaning', () => {
  const entry = { level: 'Common', simplified: '纟', traditional: '糹', pinyin: '', meaning: 'silk, thread', group: '' };
  const record = radicalRecord(entry);
  assert.deepEqual(record, {
    id: '糹|radical', kind: 'radical', traditional: '糹', simplified: '纟', pinyin: '', definition: 'silk, thread',
  });
  assert.ok(isRadical(record));
  assert.equal(entryId(entry), radicalId('糹'));
  assert.equal(entryId({ ...entry, simplified: '水', traditional: '水', pinyin: 'shui3' }), '水|shui3');
  // It keeps its ID when it is queued.
  const { toAdd } = newWordRecords([record], [], 5);
  assert.equal(toAdd[0].id, '糹|radical');
});

test('a radical already there counts as not new', () => {
  const [level] = levelsOfReadyList(
    [{ level: 'Common', simplified: '氵', traditional: '氵', pinyin: '', meaning: 'water', group: '' }],
    [{ id: '氵|radical' }],
  );
  assert.equal(level.newCount, 0);
});

test('the deck has the 214 radicals, every line can be studied, and a word is the lists\' own', () => {
  assert.deepEqual(levelsOfReadyList(entries, []).map((level) => level.level), ['Common', 'Uncommon']);
  // Every word of the HSK and TOCFL lists, by ID.
  const listIds = new Set();
  for (const file of ['hsk/hsk-3.0.tsv', 'hsk/hsk-2.0.tsv', 'tocfl/tocfl.tsv']) {
    for (const entry of parseReadyList(fs.readFileSync(`data/wordlists/${file}`, 'utf8'))) {
      listIds.add(entryId(entry));
    }
  }
  const dictionary = readDictionary(fs.readFileSync('data/cedict/dictionary.tsv', 'utf8'));
  const ids = new Set();
  for (const entry of entries) {
    const id = entryId(entry);
    assert.ok(!ids.has(id), `${id} is listed twice`);
    ids.add(id);
    for (const form of [entry.simplified, entry.traditional]) {
      assert.equal(Array.from(form).length, 1, id);
      const file = `node_modules/hanzi-writer-data/${form}.json`;
      assert.ok(fs.existsSync(file), `${form} has no stroke data`);
    }
    if (entry.pinyin === '') {
      assert.ok(entry.meaning !== '', `${id} has no meaning`);
    } else {
      assert.ok(listIds.has(id), `${id} is not a word of the HSK or TOCFL lists`);
      assert.ok(lookUp(dictionary, entry.traditional).some((found) => found.pinyin === entry.pinyin), `${id} is not in the dictionary`);
    }
  }
  assert.equal(entries.length, 230);
});
