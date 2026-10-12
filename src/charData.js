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
// Strokes are numbered from 0, in writing order. Coordinates run from 0 to
// 1024 across, and from about -124 (bottom) to 900 (top) upwards.

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
    if (taiwanChars.has(char)) {
      const data = await fetchCharFile('char-data-tw', char);
      if (data) {
        return data;
      }
    }
  }
  return fetchCharFile('char-data', char);
}
