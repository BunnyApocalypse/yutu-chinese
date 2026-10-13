// Picks out of Wiktionary's data what it says about how each character came
// to be written as it is ("glyph origin"), and writes it to a small file
// that other scripts can read quickly.
//
// For development only: neither the big file nor the small one is shipped
// with the app. See local/README.md for where the data comes from and how
// to fetch it.
//
// Run with: node scripts/wiktionary-glyph-origins.js

import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';

const SOURCE = 'local/wiktionary/kaikki.org-dictionary-Chinese.jsonl.gz';
const TARGET = 'local/wiktionary/glyph-origins.tsv';

if (!fs.existsSync(SOURCE)) {
  console.error(`${SOURCE} is not there. local/README.md says how to fetch it.`);
  process.exit(1);
}

// The file is 1.2 GB unpacked, so it is read line by line as it is unpacked
// and never held in memory whole.
const lines = readline.createInterface({ input: fs.createReadStream(SOURCE).pipe(zlib.createGunzip()) });

const origins = new Map();
for await (const line of lines) {
  // A quick look at the text first: taking every line apart would take minutes.
  if (!line.includes('"pos": "character"') || !line.includes('"etymology_text"')) {
    continue;
  }
  const entry = JSON.parse(line);
  // One character, and the first entry that says something about it.
  if (entry.pos === 'character' && Array.from(entry.word).length === 1 && entry.etymology_text && !origins.has(entry.word)) {
    // On one line, with " / " where the text had line breaks.
    const text = entry.etymology_text
      .split('\n')
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' / ')
      .replace(/\t/g, ' ');
    origins.set(entry.word, text);
  }
}

fs.writeFileSync(TARGET, [...origins].map(([character, text]) => `${character}\t${text}`).join('\n') + '\n');
console.log(`Wrote ${TARGET}: ${origins.size} characters.`);
