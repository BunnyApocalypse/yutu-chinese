// Supplies the stroke data Hanzi Writer needs to draw and grade a character.
//
// Hanzi Writer's default is to download this from a CDN on the internet, which
// would break offline use. Instead we read it from the hanzi-writer-data
// package, so the data ships inside the app.
//
// Milestone 1 only knows one character. Later this file will load any
// character on demand; the rest of the app won't need to change.

import xue from 'hanzi-writer-data/學.json';

const bundledCharacters = {
  學: xue,
};

// Returns the stroke data for one character, or throws if we don't have it.
export function getCharData(char) {
  const data = bundledCharacters[char];
  if (!data) {
    throw new Error(`No stroke data bundled for "${char}"`);
  }
  return data;
}
