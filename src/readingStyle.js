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

export const READING_STYLES = ['pinyin', 'zhuyin', 'zhuyinPinyin', 'pinyinZhuyin'];

let style = 'pinyin';

export function setReadingStyle(value) {
  style = READING_STYLES.includes(value) ? value : 'pinyin';
}

export function readingStyle() {
  return style;
}

// A stored reading ("xue2xiao4") as the learner chose to see it:
// "xuéxiào", "ㄒㄩㄝˊ ㄒㄧㄠˋ", "ㄒㄩㄝˊ ㄒㄧㄠˋ xuéxiào" or "xuéxiào ㄒㄩㄝˊ ㄒㄧㄠˋ".
// An empty reading stays empty, and one without tone numbers (a sentence's
// pinyin, typed with tone marks: docs/word-page.md) stays as it is.
export function showReading(numbered) {
  if (!numbered) {
    return '';
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
