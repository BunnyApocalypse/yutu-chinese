// Telling the browser which language a piece of text is in.
//
// The page as a whole is marked as English (<html lang="en">). Chinese inside
// it needs its own mark, the `lang` attribute, for two reasons:
// - a screen reader reads text in the voice of its language; Chinese left
//   marked as English is read as "CJK ideograph", or not at all;
// - the device picks the font by it, and the regional forms with it: without
//   it a phone may show Japanese or mainland shapes for a Taiwan character.
// Taiwan forms for traditional, mainland forms for simplified (CLAUDE.md).

// The `lang` value for text in this script ('traditional' or 'simplified').
export function langFor(script) {
  return script === 'traditional' ? 'zh-Hant-TW' : 'zh-Hans-CN';
}

// One syllable of zhuyin (zhuyin.js): ˙ㄇㄚ, ㄒㄩㄝˊ, ㄉㄧㄢˇㄦ; and a run of
// them with spaces or commas between, as a reading is shown.
const ZHUYIN_SYLLABLE = '˙?[\\u3105-\\u312f]+[ˊˇˋ]?ㄦ?';
const CHINESE = new RegExp(`(\\p{Script=Han}+|${ZHUYIN_SYLLABLE}(?:,? ${ZHUYIN_SYLLABLE})*)`, 'u');

// Fills `element` with `text`, which may mix English and Chinese (a deck's
// name, such as "Chinese 中文"): each run of Chinese characters is put in a
// span of its own marked as Chinese in `script`. For text whose script is
// not known, the caller passes the script the learner studies in. Zhuyin
// (a reading, as readingStyle.js shows it) is marked too, always as Taiwan's,
// where it is used.
export function fillMixed(element, text, script) {
  const parts = text.split(CHINESE).map((part, index) => {
    // split() with a group in the pattern puts the matches at odd places.
    if (index % 2 === 0) {
      return part;
    }
    const span = document.createElement('span');
    if (/\p{Script=Han}/u.test(part)) {
      span.lang = langFor(script);
    } else {
      span.lang = langFor('traditional');
      span.className = 'zhuyin'; // broken onto lines only between syllables (style.css)
    }
    span.textContent = part;
    return span;
  });
  element.replaceChildren(...parts.filter((part) => part !== ''));
}

// Fills `element` with a reading as readingStyle.js shows it ("xuéxiào",
// "ㄒㄩㄝˊ ㄒㄧㄠˋ"), or a line with one in it, its zhuyin marked.
export function fillReading(element, text) {
  fillMixed(element, text, 'traditional');
}
