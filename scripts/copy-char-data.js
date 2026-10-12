// Puts the stroke data where the app can fetch it one character at a time.
// Anything in public/ is served by Vite as a plain file and copied into the
// final build unchanged.
//
//   node_modules/hanzi-writer-data/    →  public/char-data/
//   data/animcjk/graphicsZhHant.txt    →  public/char-data-tw/
//
// The second set holds Taiwan-standard forms of traditional characters; see
// src/charData.js for how the two are used.
//
// Runs automatically before `npm run dev` and `npm run build` (see the
// "predev" and "prebuild" lines in package.json).
//
// Files are named by the character's Unicode number in hexadecimal, so 學
// becomes 5b78.json. Non-ASCII file names in web addresses are a common
// source of hosting trouble; this avoids it.

import fs from 'node:fs';
import path from 'node:path';

function fileNameFor(char) {
  return `${char.codePointAt(0).toString(16)}.json`;
}

// ---- The big set, from the hanzi-writer-data package ----

const packageFolder = 'node_modules/hanzi-writer-data';
const mainTarget = 'public/char-data';

// The package also contains a few non-character files (package.json etc.).
// A character file is named with exactly one character.
const characterFiles = fs
  .readdirSync(packageFolder)
  .filter((name) => name.endsWith('.json') && Array.from(path.basename(name, '.json')).length === 1);

fs.mkdirSync(mainTarget, { recursive: true });

// +1 for the license file copied below.
if (fs.readdirSync(mainTarget).length === characterFiles.length + 1) {
  console.log(`Stroke data already in ${mainTarget}, nothing to copy.`);
} else {
  for (const name of characterFiles) {
    const char = path.basename(name, '.json');
    fs.copyFileSync(path.join(packageFolder, name), path.join(mainTarget, fileNameFor(char)));
  }
  // The stroke data is under the Arphic Public License, which asks that the
  // license text travels with the data.
  fs.copyFileSync(path.join(packageFolder, 'ARPHICPL.TXT'), path.join(mainTarget, 'ARPHICPL.TXT'));
  console.log(`Copied stroke data for ${characterFiles.length} characters to ${mainTarget}.`);
}

// ---- The Taiwan set, from animCJK ----

const taiwanSource = 'data/animcjk/graphicsZhHant.txt';
const taiwanTarget = 'public/char-data-tw';

// The source is one file with one character per line, each line a piece of
// JSON: { "character": "學", "strokes": [...], "medians": [...] }.
const taiwanEntries = fs
  .readFileSync(taiwanSource, 'utf8')
  .split('\n')
  .filter((line) => line.trim() !== '')
  .map((line) => JSON.parse(line));

fs.mkdirSync(taiwanTarget, { recursive: true });

// +1 for index.json written below.
if (fs.readdirSync(taiwanTarget).length === taiwanEntries.length + 1) {
  console.log(`Stroke data already in ${taiwanTarget}, nothing to copy.`);
} else {
  for (const entry of taiwanEntries) {
    const data = { strokes: entry.strokes, medians: entry.medians };
    fs.writeFileSync(path.join(taiwanTarget, fileNameFor(entry.character)), JSON.stringify(data));
  }
  // A list of the characters in this set, so the app knows which ones to look
  // for here without asking for files that don't exist.
  const characters = taiwanEntries.map((entry) => entry.character).join('');
  fs.writeFileSync(path.join(taiwanTarget, 'index.json'), JSON.stringify({ characters }));
  console.log(`Copied stroke data for ${taiwanEntries.length} characters to ${taiwanTarget}.`);
}
