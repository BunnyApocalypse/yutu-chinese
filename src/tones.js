// Tones: lining up a word's pinyin with its characters, and judging a tone
// answer. Plain calculation, no page.
//
// Pinyin in the word list is written with tone numbers, e.g. "xue2xiao4".
// Tone 5 is the neutral tone. A word may list several readings separated by
// commas ("shan1, shan4"); any of them is accepted.

// How each tone is shown on its button and in messages: the mark on the
// letter a, which is easier to read at a glance than the bare mark. The
// neutral tone has no mark.
export const TONE_LABELS = { 1: 'ā', 2: 'á', 3: 'ǎ', 4: 'à', 5: 'a' };

// Splits one reading into syllables: "nv3'er2" → ["nv3", "er2"]. Each run of
// letters followed by a tone number is one syllable; anything else
// (apostrophes, spaces) is skipped.
export function splitSyllables(reading) {
  return reading.toLowerCase().match(/[a-zü:]+[1-5]/g) || [];
}

// Works out the tone answers for a word.
//
// pinyinField: the word's pinyin as listed, possibly several readings
// charCount:   how many characters the word has
//
// Returns one entry per character:
//   syllable: the syllable of the first listed reading, e.g. "xue2"
//   tones:    the tones accepted for it (numbers 1 to 5): the tone of every
//             listed reading at this position
// Returns null if no listed reading has exactly one syllable per character.
// Such a word can't have a tone card.
export function toneAnswers(pinyinField, charCount) {
  const readings = pinyinField
    .split(',')
    .map(splitSyllables)
    .filter((syllables) => syllables.length === charCount);
  if (readings.length === 0 || charCount === 0) {
    return null;
  }
  return readings[0].map((syllable, position) => ({
    syllable,
    tones: [...new Set(readings.map((reading) => Number(reading[position].slice(-1))))],
  }));
}
