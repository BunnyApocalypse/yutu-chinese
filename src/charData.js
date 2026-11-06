// Supplies the stroke data Hanzi Writer needs to draw and grade a character.
//
// Hanzi Writer's default is to download this from a CDN on the internet, which
// would break offline use. Instead the data sits in the app's own public/
// folder (put there by scripts/copy-char-data.js) and is fetched from the
// app's own address, one small file per character, when needed.
//
// There are two sets:
//
//   char-data/     about 9,500 characters, from the hanzi-writer-data package.
//                  Its traditional characters are drawn in mainland-style
//                  forms: 為 as 爲, 辶 with three strokes, and so on.
//   char-data-tw/  about 1,000 traditional characters in Taiwan-standard
//                  forms, from the animCJK project.
//
// When writing traditional, the Taiwan set is used wherever it has the
// character, and the big set otherwise. When writing simplified, only the big
// set is used. The script matters even for characters that both scripts
// share, such as 花: Taiwan writes its 艹 with four strokes.
//
// The data for one character looks like this:
//   strokes:    one SVG outline per stroke (the printed shape)
//   medians:    one list of [x, y] points per stroke, running down its middle.
//               This is what a drawn stroke is graded against.
//   radStrokes: which stroke numbers belong to the radical (big set only)
//   altOrder:   Taiwan set only, and only for some characters: a second
//               accepted stroke order, as a list of stroke numbers. The
//               strokes themselves are listed in the order of Taiwan's
//               Ministry of Education; altOrder is the mainland order.
//               Also added when loaded to the big set's characters with a
//               艹 written 丨 一 丨 一 (the data's own order) or a 忄 written
//               丶 丶 丨 (the Taiwan order, then marked altOrderIsTaiwan;
//               inTaiwanOrder in shortcuts.js).
//   altShapes:  Taiwan set only, for some characters: strokes the mainland
//               form writes in another shape in the same place, as
//               { strokeNum: median } (the dot under 人 in 食, where Taiwan's
//               stroke is nearly flat). Either shape is accepted.
//   altForm:    Taiwan set only, for 充, 流 and 育: the big set's form, a
//               stroke more, as { strokes, medians, from }.
//   altForms:   added when loaded, traditional only: every second form,
//               altForm's and those of the box at the top of 骨
//               (innerBox.js), each with `from`, the first stroke where it
//               differs, and maybe `altShapes` of its own.
// Strokes are numbered from 0, in writing order. Coordinates run from 0 to
// 1024 across, and from about -124 (bottom) to 900 (top) upwards.

import { innerBoxForms } from './innerBox.js';
import { inTaiwanOrder } from './shortcuts.js';

// BASE_URL is the folder the app is served from ("/" during development).
const BASE = import.meta.env.BASE_URL;

// Data loaded so far, so each file is only fetched once. The key is the
// folder plus the character.
const loaded = new Map();

// Fetches one character's file from one of the two folders. Returns null if
// there is none.
//
// "async" means the function returns immediately with a promise, and the
// caller uses "await" to wait for the result without freezing the page.
async function fetchCharFile(folder, char) {
  const key = `${folder}/${char}`;
  if (loaded.has(key)) {
    return loaded.get(key);
  }

  // Files are named by the character's Unicode number in hexadecimal: 學 is 5b78.
  const unicodeNumber = char.codePointAt(0).toString(16);
  let data;
  try {
    const response = await fetch(`${BASE}${folder}/${unicodeNumber}.json`);
    if (!response.ok) {
      return null;
    }
    // Vite's dev server answers a request for a missing file with the app's
    // HTML page rather than a "not found" error. That page isn't valid JSON,
    // so json() fails and we land in the catch below.
    data = await response.json();
  } catch {
    return null;
  }

  loaded.set(key, data);
  return data;
}

// The characters the Taiwan set contains, as one long string. Fetched once,
// so we know where to look without asking for files that don't exist.
let taiwanCharsPromise = null;

function loadTaiwanChars() {
  if (!taiwanCharsPromise) {
    taiwanCharsPromise = fetch(`${BASE}char-data-tw/index.json`)
      .then((response) => response.json())
      .then((index) => new Set(Array.from(index.characters)))
      // If the list can't be loaded, carry on with the big set alone.
      .catch(() => new Set());
  }
  return taiwanCharsPromise;
}

// Fetches the stroke data for one character.
//
// script: 'traditional' or 'simplified'
//
// Returns null if there is no data for the character (zhuyin, punctuation,
// Latin letters, rare characters).
export async function loadCharData(char, script) {
  if (script === 'traditional') {
    const taiwanChars = await loadTaiwanChars();
    let data = taiwanChars.has(char) ? await fetchCharFile('char-data-tw', char) : null;
    if (!data) {
      const bigSetData = await fetchCharFile('char-data', char);
      data = bigSetData && inTaiwanOrder(bigSetData);
    }
    return data && withSecondForms(char, data);
  }
  return fetchCharFile('char-data', char);
}

// The traditional character's data with all its second forms as `altForms`:
// the one stored with it (`altForm`, 充) and the other ways to write the box
// at the top of 骨 (innerBox.js). A copy, as the big set's data is shared
// with simplified, which has none of these.
function withSecondForms(char, data) {
  const altForms = [...(data.altForm ? [data.altForm] : []), ...innerBoxForms(char, data)];
  return altForms.length > 0 ? { ...data, altForms } : data;
}
