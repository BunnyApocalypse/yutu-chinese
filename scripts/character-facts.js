// Gathers what is known about how the characters of one level of a
// ready-made word list are built, as reference material for whoever (or
// whatever model) writes the learning notes for that level.
//
// For each character in the level's words, in either script, one line:
//   character <TAB> structure <TAB> glyph origin
// "structure" is from Make Me a Hanzi (data/makemeahanzi/): decomposition,
// radical and, for a sound-meaning compound, its meaning part and sound
// part. "glyph origin" is the start of Wiktionary's text on the character
// (local/wiktionary/glyph-origins.tsv; see local/README.md).
//
// For development only. Run with, for example:
//   node scripts/character-facts.js data/wordlists/hsk/hsk-3.0.tsv 1 > facts.tsv

import fs from 'node:fs';

import { parseReadyList } from '../src/words.js';

const [listFile, level] = process.argv.slice(2);
if (!listFile || !level) {
  console.error('Usage: node scripts/character-facts.js <list file> <level>');
  process.exit(1);
}
const ORIGINS = 'local/wiktionary/glyph-origins.tsv';
if (!fs.existsSync(ORIGINS)) {
  console.error(`${ORIGINS} is not there. local/README.md says how to make it.`);
  process.exit(1);
}

// How much of Wiktionary's text is passed on: the beginning says how the
// character is built; what follows is mostly about the word's history.
const ORIGIN_LENGTH = 600;

const structures = new Map(
  fs
    .readFileSync('data/makemeahanzi/dictionary.txt', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .map((entry) => [entry.character, entry]),
);
const origins = new Map(
  fs
    .readFileSync(ORIGINS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t')),
);

function structureOf(character) {
  const entry = structures.get(character);
  if (!entry) {
    return '';
  }
  const etymology = entry.etymology || {};
  const parts = [`decomposition ${entry.decomposition}`, `radical ${entry.radical}`];
  if (etymology.type === 'pictophonetic') {
    parts.push(
      `sound-meaning compound: meaning part ${etymology.semantic || '?'} (${etymology.hint || ''}), sound part ${etymology.phonetic || '?'}`,
    );
  } else if (etymology.type) {
    parts.push(`${etymology.type}: ${etymology.hint || ''}`);
  }
  return parts.join('; ');
}

const characters = new Set();
for (const entry of parseReadyList(fs.readFileSync(listFile, 'utf8')).filter((word) => word.level === level)) {
  for (const character of entry.simplified + entry.traditional) {
    if (/\p{Script=Han}/u.test(character)) {
      characters.add(character);
    }
  }
}
for (const character of characters) {
  console.log([character, structureOf(character), (origins.get(character) || '').slice(0, ORIGIN_LENGTH)].join('\t'));
}
