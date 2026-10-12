// Copies the stroke data for every character out of the hanzi-writer-data
// package into public/char-data/, where the app can fetch it one character at
// a time. Anything in public/ is served by Vite as a plain file and copied
// into the final build unchanged.
//
// Runs automatically before `npm run dev` and `npm run build` (see the
// "predev" and "prebuild" lines in package.json).
//
// Files are renamed to the character's Unicode number in hexadecimal, so
// 學.json becomes 5b78.json. Non-ASCII file names in web addresses are a
// common source of hosting trouble; this avoids it.

import fs from 'node:fs';
import path from 'node:path';

const source = 'node_modules/hanzi-writer-data';
const target = 'public/char-data';

// The package also contains a few non-character files (package.json etc.).
// A character file is named with exactly one character.
const characterFiles = fs
  .readdirSync(source)
  .filter((name) => name.endsWith('.json') && Array.from(path.basename(name, '.json')).length === 1);

fs.mkdirSync(target, { recursive: true });

// +1 for the license file copied below.
if (fs.readdirSync(target).length === characterFiles.length + 1) {
  console.log(`Stroke data already in ${target}, nothing to copy.`);
} else {
  for (const name of characterFiles) {
    const char = path.basename(name, '.json');
    const unicodeNumber = char.codePointAt(0).toString(16);
    fs.copyFileSync(path.join(source, name), path.join(target, `${unicodeNumber}.json`));
  }
  // The stroke data is under the Arphic Public License, which asks that the
  // license text travels with the data.
  fs.copyFileSync(path.join(source, 'ARPHICPL.TXT'), path.join(target, 'ARPHICPL.TXT'));
  console.log(`Copied stroke data for ${characterFiles.length} characters to ${target}.`);
}
