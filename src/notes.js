// Learning notes: a short note and an example sentence for a word, from the
// files in data/notes/ (see the README there). Plain calculation, no page.

// Reads a notes file: one word per line with tabs between the columns
//   simplified, pinyin, note, example (simplified), example (traditional),
//   example pinyin (tone marks, a space between words), example in English
//
// Returns a Map from "simplified pinyin" (pinyin as stored, with tone
// numbers) to { note, example: { simplified, traditional, pinyin, english } }.
export function parseNotes(text) {
  const notes = new Map();
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) {
      continue;
    }
    const [simplified, pinyin, note, exampleSimplified, exampleTraditional, examplePinyin, english] = line.split('\t');
    notes.set(`${simplified} ${pinyin}`, {
      note,
      example: { simplified: exampleSimplified, traditional: exampleTraditional, pinyin: examplePinyin, english },
    });
  }
  return notes;
}

// The note for a word record, or null.
export function noteFor(notes, word) {
  return notes.get(`${word.simplified} ${word.pinyin}`) || null;
}

const VOWELS = 'aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
const isHan = (char) => /\p{Script=Han}/u.test(char);

// How many syllables a word of pinyin with tone marks has: "xuésheng" has
// two. Each run of vowels is one syllable; an apostrophe ends a run (nǚ'ér).
function syllableCount(pinyinWord) {
  let count = 0;
  let inVowels = false;
  for (const letter of pinyinWord.toLowerCase()) {
    const vowel = VOWELS.includes(letter);
    if (vowel && !inVowels) {
      count += 1;
    }
    inVowels = vowel;
  }
  return count;
}

// Splits an example sentence into its words and what lies between them,
// going by its pinyin, which has a space between words: 我们是同学。 with
// "Wǒmen shì tóngxué." is 我们 / 是 / 同学 / 。 This is what lets each word
// of a sentence be tapped.
//
// Returns [{ text, pinyin }]: the pieces in order. `pinyin` is the word's
// reading with tone marks, or null for punctuation. If the pinyin does not
// fit the sentence, every character is a piece of its own, with no pinyin.
export function sentenceWords(sentence, pinyin) {
  const chars = Array.from(sentence);
  // The pinyin's words, without the punctuation attached to them.
  const readings = pinyin
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}']/gu, ''))
    .filter(Boolean);
  const pieces = [];
  let position = 0;
  const takeOthers = () => {
    let text = '';
    while (position < chars.length && !isHan(chars[position])) {
      text += chars[position];
      position += 1;
    }
    if (text) {
      pieces.push({ text, pinyin: null });
    }
  };
  for (const reading of readings) {
    takeOthers();
    let left = syllableCount(reading);
    let text = '';
    while (left > 0 && position < chars.length && isHan(chars[position])) {
      text += chars[position];
      position += 1;
      left -= 1;
    }
    // An r at the end of a syllable is written with a character of its own
    // (这儿 zhèr): it belongs to the word.
    if (/r$/i.test(reading) && (chars[position] === '儿' || chars[position] === '兒')) {
      text += chars[position];
      position += 1;
    }
    if (left > 0) {
      position = -1;
      break;
    }
    pieces.push({ text, pinyin: reading });
  }
  if (position >= 0) {
    takeOthers();
  }
  if (position !== chars.length) {
    return chars.map((char) => ({ text: char, pinyin: null }));
  }
  return pieces;
}
