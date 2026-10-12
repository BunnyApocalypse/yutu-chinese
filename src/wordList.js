// Reading word lists, and showing pinyin nicely.
//
// A word list is plain text with one word per line and four columns separated
// by tabs: simplified, traditional, pinyin, definition. This is the format of
// Skritter's TSV export, and of the built-in list in seed-words.tsv.
//
// An optional fifth column gives the word's reading in Taiwan where that
// differs from the pinyin column, which holds the mainland reading. Either
// column may list several readings separated by commas.
//
// Pinyin in these lists is written with tone numbers and "v" for ü, for
// example "nv3'er2" for nǚ'ér. Tone 5 is the neutral tone.

// Turns the text of a word list into a list of word objects. Lines that don't
// have all four columns are left out.
export function parseWordList(text) {
  const words = [];
  for (const line of text.split('\n')) {
    const columns = line.split('\t').map((column) => column.trim());
    if (columns.length < 4 || columns[0] === '' || columns[1] === '') {
      continue;
    }
    const [simplified, traditional, pinyin, definition, pinyinTaiwan] = columns;
    const word = { simplified, traditional, pinyin, definition };
    if (pinyinTaiwan) {
      word.pinyinTaiwan = pinyinTaiwan;
    }
    words.push(word);
  }
  return words;
}

// A word's ID is built from its content, not a counter or a random value, so
// the same word gets the same ID on every device. That is what will allow two
// devices' progress to be merged later.
export function wordId(word) {
  return `${word.traditional}|${word.pinyin}`;
}

const TONE_MARKS = {
  a: 'āáǎà',
  e: 'ēéěè',
  i: 'īíǐì',
  o: 'ōóǒò',
  u: 'ūúǔù',
  ü: 'ǖǘǚǜ',
};

// Adds the tone mark for `tone` (1 to 4) to one syllable written without marks.
function markSyllable(syllable, tone) {
  // The mark goes on a or e if there is one, on the o of "ou", and otherwise
  // on the last vowel.
  const lower = syllable.toLowerCase();
  let index = lower.search(/[ae]/);
  if (index === -1) {
    index = lower.indexOf('ou');
  }
  if (index === -1) {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('iouü'.includes(lower[i])) {
        index = i;
        break;
      }
    }
  }
  if (index === -1) {
    return syllable; // no vowel, e.g. the "r" of an erhua ending
  }
  const marked = TONE_MARKS[lower[index]][tone - 1];
  const wasCapital = syllable[index] !== lower[index];
  return (
    syllable.slice(0, index) +
    (wasCapital ? marked.toUpperCase() : marked) +
    syllable.slice(index + 1)
  );
}

// Turns numbered pinyin into pinyin with tone marks: "xue2xiao4" → "xuéxiào".
export function formatPinyin(numbered) {
  return numbered
    .replace(/u:|v/g, 'ü')
    .replace(/U:|V/g, 'Ü')
    // Each run of letters followed by a tone number is one syllable.
    .replace(/([a-zA-ZüÜ]+)([1-5])/g, (match, syllable, tone) =>
      tone === '5' ? syllable : markSyllable(syllable, Number(tone)),
    );
}
