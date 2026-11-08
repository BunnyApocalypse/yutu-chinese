// Tests for src/syncTiming.js: when syncing has been failing long enough
// for the app to say so. (The timing itself is tried in
// tests/browser/syncSettings.browser.js.)
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { syncIsLate, SYNC_LATE_AFTER_MS } from '../src/syncTiming.js';

test('syncing is late only when it is on, the last try failed, and none worked for a while', () => {
  const now = 100 * SYNC_LATE_AFTER_MS;
  const long = now - SYNC_LATE_AFTER_MS - 1;
  const short = now - SYNC_LATE_AFTER_MS + 60 * 1000;
  assert.equal(syncIsLate({ on: true, problem: 'offline', lastWorkedAt: long }, now), true);
  // A short outage (a server restarting, a day without a connection).
  assert.equal(syncIsLate({ on: true, problem: 'offline', lastWorkedAt: short }, now), false);
  // The last try worked: an old time is only the app not having been opened.
  assert.equal(syncIsLate({ on: true, problem: null, lastWorkedAt: long }, now), false);
  assert.equal(syncIsLate({ on: false, problem: 'offline', lastWorkedAt: long }, now), false);
  // Synced before the time was kept: counted from the next sync that works.
  assert.equal(syncIsLate({ on: true, problem: 'offline', lastWorkedAt: null }, now), false);
});
