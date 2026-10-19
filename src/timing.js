// How long studying takes (roadmap item 4; the owner, 2026-10-19), kept for
// a later progress tab. A review in Review saves its `duration`, and a word
// learned in Learn its `learnDuration`, both in milliseconds (db.js).
//
// The time is measured with a stopwatch: started when a card (or a word's
// lesson) comes up, stopped when it is graded (or the lesson ends). Each step
// counts at most MAX_STEP_MS, as in Anki (its "maximum answer seconds",
// 60 by default), so a card left on screen while the learner does something
// else doesn't count as an hour of study. A lesson's steps are counted one
// by one ("laps"), each up to the limit. While the app is out of sight
// (another app or tab, the screen locked) the stopwatch is paused.

export const MAX_STEP_MS = 60 * 1000;

// clock: gives the time in milliseconds; Date.now unless a test passes its own
//
// Returns { start, lap, pause, resume, stop }:
//   start()  starts afresh (anything measured before is dropped)
//   lap()    ends one step and begins the next (a lesson's steps)
//   pause()  and resume(): while the app is out of sight
//   stop()   stops, and returns the time measured in whole milliseconds,
//            or null if the stopwatch was not running
export function createStopwatch(clock = Date.now) {
  let running = false;
  let paused = false;
  // Time of the steps already ended, each cut to the limit.
  let total = 0;
  // Time of the step under way, up to the last pause.
  let step = 0;
  // When the step last started or resumed (meaningless while paused).
  let since = 0;

  // Adds the time since the step last started or resumed to it.
  function catchUp() {
    if (running && !paused) {
      const now = clock();
      step += Math.max(0, now - since);
      since = now;
    }
  }

  function endStep() {
    catchUp();
    total += Math.min(step, MAX_STEP_MS);
    step = 0;
  }

  return {
    start() {
      running = true;
      paused = false;
      total = 0;
      step = 0;
      since = clock();
    },
    lap() {
      if (running) {
        endStep();
      }
    },
    pause() {
      catchUp();
      paused = true;
    },
    resume() {
      if (paused) {
        paused = false;
        since = clock();
      }
    },
    stop() {
      if (!running) {
        return null;
      }
      endStep();
      running = false;
      return Math.round(total);
    },
  };
}
