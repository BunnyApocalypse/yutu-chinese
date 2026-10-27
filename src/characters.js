// How characters are built: their parts, and which part gives the meaning
// and which the sound. From Make Me a Hanzi's dictionary (data/makemeahanzi/;
// see the README there). Plain calculation, no page.

import { readTypedPinyin } from './dictionary.js';
import { finalOf } from './zhuyin.js';

// Reads the dictionary file: one JSON object per line.
// Returns a Map from character to its entry.
export function parseCharacters(text) {
  const characters = new Map();
  for (const line of text.split('\n')) {
    if (line.trim() !== '') {
      const entry = JSON.parse(line);
      characters.set(entry.character, entry);
    }
  }
  return characters;
}

// A decomposition is written as an "ideographic description sequence": a
// sign for how the parts are arranged (⿰ side by side, ⿱ one above the
// other, and so on), followed by the parts, which can be sequences
// themselves. ？ stands for a part that has no character of its own.
const ARRANGEMENT = /[⿰-⿿]/;

// What a character is made of.
//
// Returns null for a character the dictionary does not have, otherwise
//   {
//     parts:  [{ part, role }], the parts in the order they are written;
//             role is 'meaning', 'sound' or null. A part that is not a
//             character of its own is left out.
//     kind:   'sound-meaning', 'meaning', 'picture' or null: how the
//             character came about, as far as the dictionary says
//     hint:   a few words on it ("water" for the meaning part of 河; for the
//             other kinds a short gloss, which may be a way of seeing the
//             character more than its history), or ''
//     definition, pinyin: as the dictionary gives them
//   }
export function structureOf(characters, character) {
  const entry = characters.get(character);
  if (!entry) {
    return null;
  }
  const etymology = entry.etymology || {};
  const roleOf = (part) =>
    etymology.type !== 'pictophonetic'
      ? null
      : part === etymology.semantic
        ? 'meaning'
        : part === etymology.phonetic
          ? 'sound'
          : null;
  const pieces = Array.from(entry.decomposition || '').filter(
    (piece) => !ARRANGEMENT.test(piece) && piece !== '？' && piece !== character,
  );
  // The meaning and sound parts are named even where the decomposition goes
  // into smaller pieces than they are.
  for (const named of [etymology.semantic, etymology.phonetic]) {
    if (etymology.type === 'pictophonetic' && named && !pieces.includes(named)) {
      pieces.push(named);
    }
  }
  const KINDS = { pictophonetic: 'sound-meaning', ideographic: 'meaning', pictographic: 'picture' };
  return {
    parts: [...new Set(pieces)].map((part) => ({ part, role: roleOf(part) })),
    kind: KINDS[etymology.type] || null,
    hint: etymology.hint || '',
    definition: entry.definition || '',
    pinyin: entry.pinyin || [],
  };
}

// How the sound part of a sound-meaning character sounds next to the
// character today. Sound parts were chosen some three thousand years ago,
// and many readings have drifted since: 河 hé still rhymes with 可 kě, but
// 江 jiāng sounds nothing like 工 gōng. So the page says, for each, how far
// the part still helps.
//
// Returns null for a character with no sound part (or no readings to
// compare), otherwise { part, how, reading, partReading }:
//   how: 'same' (the same syllable and tone), 'tone' (the same syllable in
//        another tone), 'rhyme' (the same final: 河 hé and 可 kě),
//        'close' (the same initial, 讲 jiǎng and 井 jǐng; or finals that
//        differ only by an i, u or ü before them, 缓 huǎn and 爰 yuán) or
//        'changed'
//   reading, partReading: the two readings compared, as stored ("ku1"),
//        the closest pair where either has several readings
const CLOSENESS = ['same', 'tone', 'rhyme', 'close', 'changed'];
export function soundClue(characters, character) {
  const entry = characters.get(character);
  const etymology = entry?.etymology;
  if (etymology?.type !== 'pictophonetic' || !etymology.phonetic) {
    return null;
  }
  const part = characters.get(etymology.phonetic);
  let best = null;
  for (const reading of (entry.pinyin || []).map(syllable).filter(Boolean)) {
    for (const partReading of (part?.pinyin || []).map(syllable).filter(Boolean)) {
      const how =
        reading.letters === partReading.letters
          ? reading.tone === partReading.tone
            ? 'same'
            : 'tone'
          : finalOf(reading.letters) === finalOf(partReading.letters)
            ? 'rhyme'
            : sameInitial(reading.letters, partReading.letters) || sameFinalWithoutGlide(reading.letters, partReading.letters)
              ? 'close'
              : 'changed';
      if (!best || CLOSENESS.indexOf(how) < CLOSENESS.indexOf(best.how)) {
        best = { part: etymology.phonetic, how, reading: reading.stored, partReading: partReading.stored };
      }
    }
  }
  return best;
}

// One reading as Make Me a Hanzi gives it ("gǔ") taken apart: its letters
// ("gu", v for ü), its tone (5 for none) and the reading as the app stores
// it ("gu3"). Null for anything but a single syllable.
function syllable(text) {
  const read = readTypedPinyin(text);
  if (!read || read.tones.length > 1 || finalOf(read.letters) === null) {
    return null;
  }
  const tone = read.tones.length ? read.tones[0].tone : 5;
  return { letters: read.letters, tone, stored: `${read.letters}${tone}` };
}

// Whether two syllables start with the same consonant (the "zh" of
// zhang); syllables with none (an, yan, wu) don't count.
function sameInitial(a, b) {
  const initial = (letters) => (/^[yw]/.test(letters) ? '' : (letters.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])/) || [''])[0]);
  return initial(a) !== '' && initial(a) === initial(b);
}

// Whether two finals are the same once the ㄧ, ㄨ or ㄩ before the rest is
// taken off (ㄨㄢ and ㄩㄢ are both ㄢ). At least one must have had one, and
// something must be left: i, u and ü alone are too short to call close.
function sameFinalWithoutGlide(a, b) {
  const [first, second] = [finalOf(a), finalOf(b)];
  const rest = (final) => final.replace(/^[ㄧㄨㄩ]/, '');
  return rest(first) !== '' && rest(first) === rest(second) && (rest(first) !== first || rest(second) !== second);
}
