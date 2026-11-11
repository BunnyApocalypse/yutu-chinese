// Tests for src/syncTiming.js: when syncing has been failing long enough
// for the app to say so. (The timing itself is tried in
// tests/browser/syncSettings.browser.js.)
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { syncIsLate, SYNC_LATE_AFTER_MS } from '../src/syncTiming.js';

const HOUR = 60 * 60 * 1000;

test('syncing is late only when it is on, the last try failed, and none worked for a while', () => {
  const now = 1000 * SYNC_LATE_AFTER_MS.offline;
  const late = now - SYNC_LATE_AFTER_MS.offline - 1;
  assert.equal(syncIsLate({ on: true, problem: 'offline', lastWorkedAt: late }, now), true);
  // The last try worked: an old time is only the app not having been opened.
  assert.equal(syncIsLate({ on: true, problem: null, lastWorkedAt: late }, now), false);
  assert.equal(syncIsLate({ on: false, problem: 'offline', lastWorkedAt: late }, now), false);
  // Synced before the time was kept: counted from the next sync that works.
  assert.equal(syncIsLate({ on: true, problem: 'offline', lastWorkedAt: null }, now), false);
});

test('no connection is late after 3 days, anything else after 1', () => {
  const now = 1000 * SYNC_LATE_AFTER_MS.offline;
  const twoDays = now - 48 * HOUR;
  const halfDay = now - 12 * HOUR;
  // A day or two without a connection sorts itself out.
  assert.equal(syncIsLate({ on: true, problem: 'offline', lastWorkedAt: twoDays }, now), false);
  for (const problem of ['server-error', 'paused', 'refused', 'account-full']) {
    assert.equal(syncIsLate({ on: true, problem, lastWorkedAt: twoDays }, now), true, problem);
    // A server restarting for an update: hours at most.
    assert.equal(syncIsLate({ on: true, problem, lastWorkedAt: halfDay }, now), false, problem);
  }
});
