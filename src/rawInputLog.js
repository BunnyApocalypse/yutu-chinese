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
//
// Also, for each character, every touch on the writing area as the browser
// reported it ("contacts", below), whether Hanzi Writer took it for a stroke
// or not (the owner, 2026-11-20: on the tablet, a patch of the writing area
// cut every stroke drawn across it, until the page was reloaded).

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
// outlineVisible, leniency (quiz.js) }.
export function beginCharacter(details) {
  if (!recording) {
    return;
  }
  // One left without a stroke (opened and left, or started again at once)
  // says nothing: dropped.
  if (current && current.strokes.length === 0) {
    load().splice(load().indexOf(current), 1);
  }
  current = {
    time: new Date().toISOString(),
    ...details,
    ...placeOnScreen(),
    writingAreasMade,
    strokes: [],
    zooms: [],
    contacts: [],
  };
  characterStartedAt = performance.now();
  load().push(current);
}

// ---- Every touch, as the browser reported it ----
//
// "Pointer events" are the browser's reports of a finger, pen or mouse:
// pointerdown when it lands, pointermove, then pointerup when it is lifted,
// or pointercancel when the browser or Android takes it away (to scroll the
// page, say). Each pointer has a number (pointerId) for as long as it is down.
// Hanzi Writer itself listens to the older touch and mouse events, which come
// just after these; it ignores a cancelled touch, so a stroke after one can be
// lost without a mistake being counted.
//
// For each touch that lands on the writing area, a contact is noted:
// { type: 'pen' | 'touch' | 'mouse', at (milliseconds into the character),
// others (how many other pointers were down then: a hand resting on the
// glass, or one the browser never reported lifted), from and to (where it
// landed and where it was last, in pixels from the writing area's top left
// corner), ms (how long it lasted), end: 'up' | 'cancel', and under (only
// when it ended over something that is not the writing area: what that was) }.

// How many writing areas (each with its own Hanzi Writer) this page has made:
// one, plus one each time the window's width changed, as when the screen is
// rotated (rebuild in wordFlow.js, called from main.js).
let writingAreasMade = 0;
// When the character being written started (performance.now(), the clock
// pointer events' timeStamp uses).
let characterStartedAt = 0;
// The writing area, for working out positions in it.
let area = null;
// The pointers down anywhere on the page: pointerId → its last position on
// the screen.
const down = new Map();
// The contacts not yet ended: pointerId → { contact, startedAt }.
const open = new Map();

// Where the writing area and the window are, so that a patch of the screen
// can be told from a patch of the writing area across recordings.
function placeOnScreen() {
  if (!area) {
    return {};
  }
  const box = area.getBoundingClientRect();
  return {
    screen: { width: window.innerWidth, height: window.innerHeight, orientation: screen.orientation?.type },
    areaAt: [Math.round(box.left), Math.round(box.top)],
  };
}

function inArea(point) {
  const box = area.getBoundingClientRect();
  return [Math.round(point.x - box.left), Math.round(point.y - box.top)];
}

// A short name for a page element: its tag, id and classes ("div#toast.shown").
function describe(element) {
  if (!element) {
    return 'nothing';
  }
  const id = element.id ? `#${element.id}` : '';
  const classes = [...element.classList].map((name) => `.${name}`).join('');
  return `${element.tagName.toLowerCase()}${id}${classes}`;
}

function endContact(event, end) {
  const last = down.get(event.pointerId);
  down.delete(event.pointerId);
  const opened = open.get(event.pointerId);
  open.delete(event.pointerId);
  if (!opened || !last) {
    return;
  }
  const { contact, startedAt } = opened;
  contact.to = inArea(last);
  contact.ms = Math.round(event.timeStamp - startedAt);
  contact.end = end;
  const under = document.elementFromPoint(last.x, last.y);
  if (!area.contains(under)) {
    contact.under = describe(under);
  }
}

// Called by quiz.js for each writing area it makes. Listens on the whole
// page ("capture": before anything else on the page hears the event;
// "passive": never stops it), so that pointers down elsewhere are counted too.
let listening = false;
export function watchContacts(writingArea) {
  area = writingArea;
  writingAreasMade += 1;
  if (listening) {
    return;
  }
  listening = true;
  const options = { capture: true, passive: true };
  window.addEventListener(
    'pointerdown',
    (event) => {
      const point = { x: event.clientX, y: event.clientY };
      down.set(event.pointerId, point);
      if (!current || !area.contains(event.target)) {
        return;
      }
      const contact = {
        type: event.pointerType,
        at: Math.round(event.timeStamp - characterStartedAt),
        others: down.size - 1,
        from: inArea(point),
      };
      current.contacts.push(contact);
      open.set(event.pointerId, { contact, startedAt: event.timeStamp });
    },
    options,
  );
  window.addEventListener(
    'pointermove',
    (event) => {
      if (down.has(event.pointerId)) {
        down.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
    },
    options,
  );
  window.addEventListener('pointerup', (event) => endContact(event, 'up'), options);
  window.addEventListener('pointercancel', (event) => endContact(event, 'cancel'), options);
}

// A stroke was drawn and judged. `verdict`: 'accepted', 'shortcut' (two
// strokes joined), 'otherOrder', 'firstAnywhere' (the first stroke, by its
// shape alone), 'atAnotherSize', 'otherShape' (in its mainland shape),
// 'grassLevel' (the level stroke of 艹 in three strokes), 'twin' (nearer a
// later stroke of the same shape), or 'mistake'. `expected`: the stroke asked
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
  const file = { format: 'yutu-raw-input', version: 2, app: APP_VERSION, userAgent: navigator.userAgent, characters: load() };
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
