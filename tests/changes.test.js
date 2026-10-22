// Tests for the list of what changed (src/changes.js): which entries are new
// since the app was last opened, and how a date is written.

import test from 'node:test';
import assert from 'node:assert/strict';

import { CHANGES, changesSince, changeDate } from '../src/changes.js';

const LIST = [{ id: '2026-11-02' }, { id: '2026-10-25-2' }, { id: '2026-10-25' }, { id: '2026-10-18' }];

test('every release since the last one seen is new, not only the latest', () => {
  assert.deepEqual(changesSince(LIST, '2026-10-18').map((entry) => entry.id), ['2026-11-02', '2026-10-25-2', '2026-10-25']);
});

test('nothing is new when the latest was seen', () => {
  assert.deepEqual(changesSince(LIST, '2026-11-02'), []);
});

test('never seen, or seen an entry no longer listed: everything is new', () => {
  assert.equal(changesSince(LIST, null).length, 4);
  assert.equal(changesSince(LIST, '2020-01-01').length, 4);
});

test('a date is written out in US English, on the right day', () => {
  assert.equal(changeDate('2026-10-18'), 'October 18, 2026');
  assert.equal(changeDate('2026-10-25-2'), 'October 25, 2026');
});

test('the real list has unique ids, newest first, each with something to say', () => {
  const ids = CHANGES.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort().reverse(), ids);
  for (const entry of CHANGES) {
    assert.match(entry.id, /^\d{4}-\d{2}-\d{2}(-\d+)?$/);
    assert.ok(entry.items.length > 0);
    // A translated entry has as many lines as the English.
    for (const translated of [entry.it, entry.de].filter(Boolean)) {
      assert.equal(translated.length, entry.items.length, entry.id);
    }
  }
});
