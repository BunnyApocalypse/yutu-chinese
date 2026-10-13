// Working out how a word is to be spoken. Plain calculation, no page and no
// sound; speech.js does the playing.
//
// There are three ways, tried in this order:
//   1. A recording of the word itself (data/audio-cmn/words). They are named
//      by the word's characters, so a recording speaks the word's usual
//      (mainland) reading, whatever the card says.
//   2. Recordings of its syllables, one after another (data/audio-cmn/
//      syllables). This speaks exactly the reading asked for, a Taiwan
//      reading included, and needs every syllable to have a recording; few
//      neutral-tone syllables have one.
//   3. The device's own voice reading the characters, where the device has a
//      Chinese voice. It cannot be told the reading.

import { splitSyllables } from './tones.js';

// The name of a word's recording, without ".mp3": its characters' Unicode
// numbers in hexadecimal, joined by hyphens. The same function is in
// scripts/copy-audio.js; the two must agree.
export const wordFileName = (word) =>
  Array.from(word, (char) => char.codePointAt(0).toString(16)).join('-');

const toneOf = (syllable) => Number(syllable.at(-1));
const withTone = (syllable, tone) => syllable.slice(0, -1) + tone;

const NUMBERS = '一二三四五六七八九十零〇';

// The syllables as they are spoken, from the syllables as dictionaries list
// them: Mandarin changes a few tones depending on the tone that follows
// ("tone sandhi"), and dictionaries, like this app's word lists, write the
// tone before the change.
//   - A third tone before another third tone is spoken as a second:
//     nǐ hǎo is said ní hǎo.
//   - 不 (bù) before a fourth tone is spoken bú: bú shì.
//   - 一 (yī) before a fourth tone is spoken yí, before any other tone yì:
//     yí gè, yì tiān. Not where it is a number being read out (第一, 一九九八).
//
// chars:     the word's characters, or null if they do not line up with the
//            syllables one to one (then only the first rule is applied)
// syllables: as splitSyllables gives them, e.g. ['ni3', 'hao3']
export function spokenSyllables(chars, syllables) {
  return syllables.map((syllable, index) => {
    const next = syllables[index + 1];
    if (!next) {
      return syllable;
    }
    const char = chars ? chars[index] : null;
    if (char === '不' && syllable === 'bu4' && toneOf(next) === 4) {
      return 'bu2';
    }
    const isNumber = chars && (chars[index - 1] === '第' || NUMBERS.includes(chars[index + 1]) || NUMBERS.includes(chars[index - 1] || ' '));
    if (char === '一' && syllable === 'yi1' && !isNumber && toneOf(next) !== 5) {
      return toneOf(next) === 4 ? 'yi2' : 'yi4';
    }
    if (toneOf(syllable) === 3 && toneOf(next) === 3) {
      return withTone(syllable, 2);
    }
    return syllable;
  });
}

// Decides how to speak a word.
//
// word:    the word record (simplified, traditional, pinyin)
// reading: the reading to speak, as stored (e.g. the Taiwan reading where
//          that is the one shown); word.pinyin if left out
// index:   what recordings there are: { words: Set, syllables: Set }
//
// Returns one of
//   { kind: 'word', file }           a recording of the word: "w/5b66-4e60"
//   { kind: 'syllables', files }     its syllables: ["s/xue2", "s/xi2"]
//   { kind: 'voice', text }          the device's voice, reading the characters
export function planSpeech(word, reading, index) {
  const wanted = reading || word.pinyin;
  // A recording speaks the usual reading. A word with several listed
  // readings ("hai2, huan2") is ambiguous, and one whose reading here is
  // another than the listed one is not what was recorded.
  const usual = wanted === word.pinyin && !wanted.includes(',');
  if (usual) {
    const recorded = [word.simplified, word.traditional].find((form) => index.words.has(form));
    if (recorded) {
      return { kind: 'word', file: `w/${wordFileName(recorded)}` };
    }
  }
  const syllables = splitSyllables(wanted.split(',')[0]);
  const chars = Array.from(word.simplified);
  const spoken = spokenSyllables(chars.length === syllables.length ? chars : null, syllables);
  if (spoken.length > 0 && spoken.every((syllable) => index.syllables.has(syllable))) {
    return { kind: 'syllables', files: spoken.map((syllable) => `s/${syllable}`) };
  }
  return { kind: 'voice', text: word.simplified };
}
