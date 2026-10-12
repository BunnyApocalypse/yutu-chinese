// Supplies the stroke data Hanzi Writer needs to draw and grade a character.
//
// Hanzi Writer's default is to download this from a CDN on the internet, which
// would break offline use. Instead the data for every character sits in
// public/char-data/ (put there by scripts/copy-char-data.js) and is fetched
// from the app's own address, one small file per character, when needed.
//
// The data for one character looks like this:
//   strokes:    one SVG outline per stroke (the printed shape)
//   medians:    one list of [x, y] points per stroke, running down its middle.
//               This is what a drawn stroke is graded against.
//   radStrokes: which stroke numbers belong to the radical
// Strokes are numbered from 0, in writing order. Coordinates run from 0 to
// 1024 across, and from about -124 (bottom) to 900 (top) upwards.

// Characters loaded so far, so each one is only fetched once.
const loaded = new Map();

// Fetches the stroke data for one character. Returns null if there is none
// (zhuyin, punctuation, Latin letters, rare characters).
//
// "async" means the function returns immediately with a promise, and the
// caller uses "await" to wait for the result without freezing the page.
export async function loadCharData(char) {
  if (loaded.has(char)) {
    return loaded.get(char);
  }

  // Files are named by the character's Unicode number in hexadecimal: 學 is 5b78.
  const unicodeNumber = char.codePointAt(0).toString(16);
  // BASE_URL is the folder the app is served from ("/" during development).
  const url = `${import.meta.env.BASE_URL}char-data/${unicodeNumber}.json`;

  let data;
  try {
    const response = await fetch(url);
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

  loaded.set(char, data);
  return data;
}

// Returns stroke data that loadCharData() has already fetched. Hanzi Writer
// asks for data through a function that must answer straight away, so quiz.js
// loads the character first and then hands it over with this.
export function getLoadedCharData(char) {
  const data = loaded.get(char);
  if (!data) {
    throw new Error(`Stroke data for "${char}" has not been loaded`);
  }
  return data;
}
