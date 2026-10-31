// How readings are shown: in pinyin, in zhuyin, or both, either first (the
// setting `readingStyle`; the owner, 2026-10-26; docs/words.md, "Zhuyin").
// A reading is stored as numbered pinyin whatever is chosen; only what is
// shown changes.
//
// Like the font (font.js), the choice is kept here once the settings are
// read, so that any code showing a reading can ask for it without being
// handed the settings.
//
// Shown text with zhuyin in it goes on the page through fillMixed
// (lang.js), which marks the zhuyin as Chinese.

import { formatPinyin } from './wordList.js';
import { toZhuyin } from './zhuyin.js';
// speechPlan.js imports tones.js, which imports this file; that is fine,
// since nothing is called while the files are being loaded.
import { spokenSyllables } from './speechPlan.js';

export const READING_STYLES = ['pinyin', 'zhuyin', 'zhuyinPinyin', 'pinyinZhuyin'];

let style = 'pinyin';

export function setReadingStyle(value) {
  style = READING_STYLES.includes(value) ? value : 'pinyin';
}

export function readingStyle() {
  return style;
}

// A numbered syllable, as stored ("xue2", "nu:3").
const SYLLABLE = /[a-zA-ZüÜ:]+[1-5]/g;

// Syllables with the tones of 一 and 不 as spoken before the next one
// (spokenSyllables in speechPlan.js), as many textbooks write them: 不是
// búshì, 一個 yígè, 一天 yìtiān (the owner, 2026-10-31). The change of a third
// tone before a third is not written: nobody writes nǐhǎo as níhǎo.
// chars: the word's characters, one per syllable; otherwise nothing changes.
export function writtenSyllables(syllables, chars) {
  if (!chars || chars.length !== syllables.length || !chars.some((char) => char === '一' || char === '不')) {
    return syllables;
  }
  const spoken = spokenSyllables(chars, syllables.map((syllable) => syllable.toLowerCase()));
  return syllables.map((syllable, index) =>
    chars[index] === '一' || chars[index] === '不' ? syllable.slice(0, -1) + spoken[index].slice(-1) : syllable,
  );
}

// A stored reading with 一 and 不 written as spoken (writtenSyllables), each
// of several listed readings ("bu4shi4, bu2shi4") on its own, anything
// between the syllables kept. Only for showing: the stored reading, which
// sound and tone answers go by, is left alone.
function withWrittenTones(numbered, chars) {
  return numbered
    .split(',')
    .map((reading) => {
      const written = writtenSyllables(reading.match(SYLLABLE) || [], chars);
      let index = 0;
      return reading.replace(SYLLABLE, () => written[index++]);
    })
    .join(',');
}

// A stored reading ("xue2xiao4") as the learner chose to see it:
// "xuéxiào", "ㄒㄩㄝˊ ㄒㄧㄠˋ", "ㄒㄩㄝˊ ㄒㄧㄠˋ xuéxiào" or "xuéxiào ㄒㄩㄝˊ ㄒㄧㄠˋ".
// An empty reading stays empty, and one without tone numbers (a sentence's
// pinyin, typed with tone marks: docs/word-page.md) stays as it is.
// chars: the word's characters (Array.from), if known, so that 一 and 不 are
// written as spoken (withWrittenTones).
export function showReading(numbered, chars = null) {
  if (!numbered) {
    return '';
  }
  if (chars) {
    numbered = withWrittenTones(numbered, chars);
  }
  const pinyin = formatPinyin(numbered);
  if (style === 'pinyin' || !/[a-zA-ZüÜ:]+[1-5]/.test(numbered)) {
    return pinyin;
  }
  const zhuyin = toZhuyin(numbered, formatPinyin);
  if (style === 'zhuyin') {
    return zhuyin;
  }
  return style === 'zhuyinPinyin' ? `${zhuyin} ${pinyin}` : `${pinyin} ${zhuyin}`;
}
