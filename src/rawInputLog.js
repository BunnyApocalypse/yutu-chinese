// Recording raw input for tuning the grading (the owner, 2026-10-24: writing
// felt too strict, and small writing let wrong strokes pass; a model of a
// hand could only guess, the owner's own strokes settle it). Switched on
// under Settings › For testing (testerSettings.js), so only in the test copy
// and while developing.
//
// For each character written: which one, in which script, how big the
// writing area was, and every stroke drawn as quiz.js judged it: its points
// (in the stroke data's units, 0 to 1024 across, upward from -124), what it
// was taken for or that it was a mistake, and where the app thought the
// character was being written then (the frame, frame.js). Zooms are noted
// too. Kept in this browser (localStorage) until saved as a file or cleared.

/* global __CHANNEL__ */
import { APP_VERSION } from './errors.js';

// Named apart for the test copy, like everything kept per site.
const KEY = __CHANNEL__ ? `raw-input-log-${__CHANNEL__}` : 'raw-input-log';
// The newest characters kept, the oldest dropped beyond this: each is a few
// thousand characters of text, and localStorage holds about five million.
const KEEP_AT_MOST = 500;

let recording = false;
let log = null; // the characters recorded, read from localStorage when first needed
let current = null; // the character being written

function load() {
  if (log === null) {
    try {
      log = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    } catch {
      log = [];
    }
  }
  return log;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(load().slice(-KEEP_AT_MOST)));
  } catch {
    // Full or not allowed: the recording stays in memory until the page closes.
  }
}

const round = (number) => Math.round(number * 10) / 10;
const roundFrame = (frame) => ({ scale: Math.round(frame.scale * 1000) / 1000, dx: round(frame.dx), dy: round(frame.dy) });

export function setRecording(on) {
  recording = on;
  if (!on) {
    current = null;
  }
}

// A character starts, or starts again (Clear, a swipe up). `details`:
// { char, script, strokeCount, size (the writing area in pixels), rawInput,
// outlineVisible }.
export function beginCharacter(details) {
  if (!recording) {
    return;
  }
  // One left without a stroke (opened and left, or started again at once)
  // says nothing: dropped.
  if (current && current.strokes.length === 0) {
    load().splice(load().indexOf(current), 1);
  }
  current = { time: new Date().toISOString(), ...details, strokes: [], zooms: [] };
  load().push(current);
}

// A stroke was drawn and judged. `verdict`: 'accepted', 'shortcut' (two
// strokes joined), 'otherOrder', 'firstAnywhere' (the first stroke, by its
// shape alone), 'atAnotherSize', 'otherShape' (in its mainland shape), or
// 'mistake'. `expected`: the stroke asked
// for, by its number in the stroke data; `frame`: the frame in use when it
// was judged.
export function noteStroke({ points, verdict, expected, frame, hintShown }) {
  if (!current) {
    return;
  }
  current.strokes.push({
    points: points.map((point) => [round(point.x), round(point.y)]),
    verdict,
    expected,
    frame: roundFrame(frame),
    ...(hintShown && { hintShown: true }),
  });
}

// Everything written so far was shrunk by `zoom` (zoomToFit in frame.js).
export function noteZoom(zoom) {
  if (current) {
    current.zooms.push({ afterStroke: current.strokes.length, ...roundFrame(zoom) });
  }
}

// The character is finished: how it was judged.
export function endCharacter({ mistakes, passed, hintShown }) {
  if (!current) {
    return;
  }
  Object.assign(current, { mistakes, passed, hintShown });
  current = null;
  save();
}

// How many characters are recorded (finished or not).
export function recordedCount() {
  return load().length;
}

// Saves the recording as a file in the device's Downloads folder, the way
// a backup is saved (downloadBackup in main.js).
export function downloadRecording() {
  save();
  const file = { format: 'yutu-raw-input', version: 1, app: APP_VERSION, userAgent: navigator.userAgent, characters: load() };
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' }));
  const now = new Date();
  const twoDigits = (number) => String(number).padStart(2, '0');
  link.download =
    `yutu-raw-input-${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}` +
    `-${twoDigits(now.getHours())}${twoDigits(now.getMinutes())}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function clearRecording() {
  log = [];
  current = null;
  save();
}
