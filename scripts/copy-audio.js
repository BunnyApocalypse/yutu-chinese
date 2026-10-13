// Puts the recordings where the app can fetch them one at a time, as
// copy-char-data.js does for the stroke data.
//
//   data/audio-cmn/words/      →  public/audio/w/   one recording per word
//   data/audio-cmn/syllables/  →  public/audio/s/   one per syllable and tone
//
// and writes public/audio/index.json, which lists what there is, so that the
// app never has to ask for a recording that does not exist.
//
// Runs automatically before `npm run dev` and `npm run build` (see the
// "predev" and "prebuild" lines in package.json).
//
// A word's file is named by its characters' Unicode numbers in hexadecimal,
// joined by hyphens, so 学习 becomes 5b66-4e60.mp3 (see copy-char-data.js for
// why). A syllable's file keeps its name: ma1.mp3, lv4.mp3 (v for ü).

import fs from 'node:fs';
import path from 'node:path';

const SOURCE = 'data/audio-cmn';
const TARGET = 'public/audio';
// Raise this when the script changes what it writes, or existing copies
// will not be made again.
const AUDIO_VERSION = 1;

// The name of a word's file, without ".mp3". The same function is in
// src/speech.js; the two must agree.
export const wordFileName = (word) =>
  Array.from(word, (char) => char.codePointAt(0).toString(16)).join('-');

// "cmn-学习.mp3" → "学习"
const itemOf = (fileName) => path.basename(fileName, '.mp3').replace(/^cmn-/, '');

// The set also has patterns with gaps (从_到_) and a few interjections with
// names of their own (_hm1); only whole words and plain syllables are used.
const words = fs
  .readdirSync(`${SOURCE}/words`)
  .filter((name) => /^\p{Script=Han}+$/u.test(itemOf(name)));
const syllables = fs
  .readdirSync(`${SOURCE}/syllables`)
  .filter((name) => /^[a-z]+[1-5]$/.test(itemOf(name)));

const indexFile = `${TARGET}/index.json`;
const index = {
  version: AUDIO_VERSION,
  words: words.map(itemOf).sort(),
  syllables: syllables.map(itemOf).sort(),
};

function isUpToDate() {
  try {
    const existing = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    return (
      existing.version === AUDIO_VERSION &&
      existing.words.length === index.words.length &&
      fs.readdirSync(`${TARGET}/w`).length === words.length &&
      fs.readdirSync(`${TARGET}/s`).length === syllables.length
    );
  } catch {
    return false;
  }
}

if (isUpToDate()) {
  console.log(`Recordings already in ${TARGET}, nothing to copy.`);
} else {
  fs.rmSync(TARGET, { recursive: true, force: true });
  fs.mkdirSync(`${TARGET}/w`, { recursive: true });
  fs.mkdirSync(`${TARGET}/s`, { recursive: true });
  for (const name of words) {
    fs.copyFileSync(`${SOURCE}/words/${name}`, `${TARGET}/w/${wordFileName(itemOf(name))}.mp3`);
  }
  for (const name of syllables) {
    fs.copyFileSync(`${SOURCE}/syllables/${name}`, `${TARGET}/s/${itemOf(name)}.mp3`);
  }
  // The recordings are CC BY-SA, which asks that the credit travels with them.
  fs.copyFileSync(`${SOURCE}/README.md`, `${TARGET}/README.md`);
  fs.writeFileSync(indexFile, JSON.stringify(index));
  console.log(`Copied recordings of ${words.length} words and ${syllables.length} syllables to ${TARGET}.`);
}
