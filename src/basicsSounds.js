// The recordings "Basics of Chinese" plays (basics.js), named as in
// public/audio/ (scripts/copy-audio.js): "s/" a syllable with its tone,
// "w/" a word by its characters' numbers. Kept with the app's own files
// (scripts/build-offline.js), so that the page works offline from the first
// time it is opened, before any recording has been played or saved (the
// owner, 2026-10-21).
//
// Every name here must be a recording that exists; the unit tests check it.
export const BASICS_RECORDINGS = [
  // Pinyin: the letters that don't sound as in English.
  's/xi1',
  's/qi1',
  's/ci1',
  's/zi4',
  's/zhi1',
  's/lv4',
  // The four tones on one syllable, and the neutral tone in 妈妈.
  's/ma1',
  's/ma2',
  's/ma3',
  's/ma4',
  'w/5988-5988',
];
