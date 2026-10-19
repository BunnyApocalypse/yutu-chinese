// Tests for src/timing.js: the stopwatch that measures how long a review or
// a lesson took.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';

import { createStopwatch, MAX_STEP_MS } from '../src/timing.js';

// A clock the test moves by hand: `clock.now` is the time it gives.
function fakeClock() {
  const clock = () => clock.now;
  clock.now = 1000;
  clock.pass = (ms) => {
    clock.now += ms;
  };
  return clock;
}

test('measures the time from start to stop', () => {
  const clock = fakeClock();
  const watch = createStopwatch(clock);
  watch.start();
  clock.pass(4200);
  assert.equal(watch.stop(), 4200);
});

test('a step counts at most a minute', () => {
  const clock = fakeClock();
  const watch = createStopwatch(clock);
  watch.start();
  clock.pass(10 * 60 * 1000);
  assert.equal(watch.stop(), MAX_STEP_MS);
});

test("a lesson's steps are each cut to the limit, then added up", () => {
  const clock = fakeClock();
  const watch = createStopwatch(clock);
  watch.start();
  clock.pass(5000);
  watch.lap();
  clock.pass(90 * 1000); // left on screen: counts 60 seconds
  watch.lap();
  clock.pass(20 * 1000);
  assert.equal(watch.stop(), 5000 + MAX_STEP_MS + 20 * 1000);
});

test('time out of sight does not count', () => {
  const clock = fakeClock();
  const watch = createStopwatch(clock);
  watch.start();
  clock.pass(3000);
  watch.pause();
  clock.pass(60 * 60 * 1000);
  watch.resume();
  clock.pass(2000);
  assert.equal(watch.stop(), 5000);
});

test('stopped while out of sight, only the time before counts', () => {
  const clock = fakeClock();
  const watch = createStopwatch(clock);
  watch.start();
  clock.pass(3000);
  watch.pause();
  clock.pass(10000);
  assert.equal(watch.stop(), 3000);
});

test('a pause or resume without a start changes nothing', () => {
  const clock = fakeClock();
  const watch = createStopwatch(clock);
  watch.pause();
  watch.resume();
  watch.start();
  clock.pass(1500);
  assert.equal(watch.stop(), 1500);
});

test('stop gives null when not running, and start begins afresh', () => {
  const clock = fakeClock();
  const watch = createStopwatch(clock);
  assert.equal(watch.stop(), null);
  watch.start();
  clock.pass(8000);
  watch.start();
  clock.pass(1000);
  assert.equal(watch.stop(), 1000);
  assert.equal(watch.stop(), null);
});

test('a clock going backwards counts nothing rather than less than nothing', () => {
  const clock = fakeClock();
  const watch = createStopwatch(clock);
  watch.start();
  clock.pass(-5000);
  assert.equal(watch.stop(), 0);
});
