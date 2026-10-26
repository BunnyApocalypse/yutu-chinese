// Zhuyin (注音符號, also called bopomofo): the way of writing readings used
// in Taiwan, with symbols of its own in place of Latin letters. Plain
// calculation, no page.
//
// A reading is still stored as numbered pinyin ("xue2xiao4"); this turns it
// into zhuyin for showing: "ㄒㄩㄝˊ ㄒㄧㄠˋ". Pinyin and zhuyin spell the
// same sounds, so every pinyin syllable has exactly one zhuyin spelling. The
// syllable is taken apart into its initial (the consonant at the start, such
// as x) and its final (the rest, such as üe), and each part has its symbols.
// Checked against Wiktionary's zhuyin for every character and word it gives
// both for (docs/words.md, "Zhuyin").
//
// The tones: the first has no mark, the second to fourth ˊ ˇ ˋ after the
// syllable, and the neutral tone a dot ˙ in front of it (˙ㄇㄚ).

import { SYLLABLES } from './pinyinSyllables.js';

const INITIALS = {
  b: 'ㄅ', p: 'ㄆ', m: 'ㄇ', f: 'ㄈ',
  d: 'ㄉ', t: 'ㄊ', n: 'ㄋ', l: 'ㄌ',
  g: 'ㄍ', k: 'ㄎ', h: 'ㄏ',
  j: 'ㄐ', q: 'ㄑ', x: 'ㄒ',
  zh: 'ㄓ', ch: 'ㄔ', sh: 'ㄕ', r: 'ㄖ',
  z: 'ㄗ', c: 'ㄘ', s: 'ㄙ',
};

// Finals as pinyin writes them after an initial, v standing for ü. Pinyin
// shortens three of them (iou to iu, uei to ui, uen to un); zhuyin writes
// them in full, and the long forms are here for y and w (below).
const FINALS = {
  a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ',
  an: 'ㄢ', en: 'ㄣ', ang: 'ㄤ', eng: 'ㄥ', er: 'ㄦ', ong: 'ㄨㄥ',
  i: 'ㄧ', ia: 'ㄧㄚ', io: 'ㄧㄛ', ie: 'ㄧㄝ', iai: 'ㄧㄞ', iao: 'ㄧㄠ',
  iu: 'ㄧㄡ', iou: 'ㄧㄡ', ian: 'ㄧㄢ', in: 'ㄧㄣ', iang: 'ㄧㄤ', ing: 'ㄧㄥ',
  iong: 'ㄩㄥ',
  u: 'ㄨ', ua: 'ㄨㄚ', uo: 'ㄨㄛ', uai: 'ㄨㄞ', ui: 'ㄨㄟ', uei: 'ㄨㄟ',
  uan: 'ㄨㄢ', un: 'ㄨㄣ', uen: 'ㄨㄣ', uang: 'ㄨㄤ', ueng: 'ㄨㄥ',
  v: 'ㄩ', ve: 'ㄩㄝ', van: 'ㄩㄢ', vn: 'ㄩㄣ',
};

// Syllables spelled differently from the rule above:
// - zhi, chi, shi, ri, zi, ci, si: the i is only there because pinyin
//   needs a vowel; zhuyin writes the initial alone;
// - the interjections m, n, ng, hm, hng (ㄫ is the old symbol for ng);
// - r alone, which is how CC-CEDICT writes 兒 as a suffix ("r5"; joined
//   to the syllable before it, toZhuyin below);
// - ê, the e of 欸, which CC-CEDICT writes "e^" or "ê".
const WHOLE = {
  zhi: 'ㄓ', chi: 'ㄔ', shi: 'ㄕ', ri: 'ㄖ', zi: 'ㄗ', ci: 'ㄘ', si: 'ㄙ',
  m: 'ㄇ', n: 'ㄋ', ng: 'ㄫ', hm: 'ㄏㄇ', hng: 'ㄏㄫ',
  r: 'ㄦ',
  'e^': 'ㄝ', 'ê': 'ㄝ',
};

const TONE_AFTER = { 1: '', 2: 'ˊ', 3: 'ˇ', 4: 'ˋ', 5: '' };
// The neutral tone's dot, which goes in front.
const NEUTRAL_DOT = '˙';

// One syllable's letters (lowercase, v or ü for ü) in zhuyin, without its
// tone, or null if they are not a syllable of Mandarin.
export function syllableZhuyin(letters) {
  const spelled = letters.replace(/u:|ü/g, 'v');
  if (spelled in WHOLE) {
    return WHOLE[spelled];
  }
  // Only the syllables Mandarin has: the rules below would also spell
  // letters that are none, such as bv.
  if (!SYLLABLES.has(spelled) && !SYLLABLES.has(spelled.replace(/^([ln])ve$/, '$1ue'))) {
    return null;
  }
  // y and w only stand in for a missing initial: yi is i, ya is ia, yu is
  // ü, wu is u, wa is ua, wei is uei.
  if (spelled.startsWith('y')) {
    const rest = spelled.slice(1);
    const final = rest.startsWith('u') ? `v${rest.slice(1)}` : rest.startsWith('i') ? rest : `i${rest}`;
    return FINALS[final] ?? null;
  }
  if (spelled.startsWith('w')) {
    const rest = spelled.slice(1);
    return FINALS[rest.startsWith('u') ? rest : `u${rest}`] ?? null;
  }
  const initial = /^[zcs]h/.test(spelled) ? spelled.slice(0, 2) : spelled[0];
  if (!(initial in INITIALS)) {
    return FINALS[spelled] ?? null; // no initial at all: a, ai, er
  }
  let final = spelled.slice(initial.length);
  // After j, q and x, u is ü (ju, xue, quan); so it is in lue and nue,
  // where the dots are often left out.
  if ('jqx'.includes(initial) || ((initial === 'l' || initial === 'n') && final === 'ue')) {
    final = final.replace(/^u/, 'v');
  }
  const symbols = FINALS[final];
  return symbols === undefined ? null : INITIALS[initial] + symbols;
}

// One syllable with its tone (1 to 5) in zhuyin, or null if the letters
// are not a syllable.
function withTone(letters, tone) {
  const symbols = syllableZhuyin(letters);
  if (symbols === null) {
    return null;
  }
  return tone === 5 ? NEUTRAL_DOT + symbols : symbols + TONE_AFTER[tone];
}

// A syllable, or capital Latin letters running into one (A圈兒 is
// "Aquan1r5" in CC-CEDICT): the letters stay as they are, with a space, and
// the syllable is in zhuyin ("A ㄑㄩㄢ"). Null if it is no syllable: a few
// words of dialect or slang have syllables standard Mandarin hasn't (覅
// fiao4, 沒誰了 mei2sei2le5), and those stay in pinyin.
function withLettersBefore(letters, tone) {
  const whole = withTone(letters.toLowerCase(), tone);
  if (whole !== null) {
    return whole;
  }
  const [, capitals, rest] = letters.match(/^([A-Z]+)(.+)$/) || [];
  const symbols = rest === undefined ? null : withTone(rest.toLowerCase(), tone);
  return symbols === null ? null : `${capitals} ${symbols}`;
}

// Numbered pinyin in zhuyin, a space between syllables: "xue2xiao4" →
// "ㄒㄩㄝˊ ㄒㄧㄠˋ". Several readings ("shan1, shan4") keep their commas.
// The r of a word said with an r (CC-CEDICT's "yi1xia4r5") is ㄦ joined to
// the syllable before it, after its tone mark: "ㄧ ㄒㄧㄚˋㄦ", as Taiwan's
// dictionaries and Wiktionary write it.
// What isn't a syllable with a tone number ("O K" in "ka3 la1 O K") stays
// as it is; so does a syllable zhuyin has no spelling for, shown in
// pinyin by `pinyinOf` (wordList.js' formatPinyin, passed in to keep this
// file free of others).
export function toZhuyin(numbered, pinyinOf = (syllable) => syllable) {
  return numbered
    .split(/,\s*/)
    .map((reading) => {
      const parts = [];
      // Whether the last part is a syllable an r can be joined to.
      let afterSyllable = false;
      for (const [whole, letters, tone] of reading.matchAll(/([a-zA-ZüÜêÊ:^]+?)([1-5])|[^\s'0-9]+/g)) {
        const symbols = letters === undefined ? null : withLettersBefore(letters, Number(tone));
        if (afterSyllable && letters?.toLowerCase() === 'r' && tone === '5') {
          parts[parts.length - 1] += 'ㄦ';
          afterSyllable = false;
        } else {
          parts.push(symbols ?? (letters === undefined ? whole : pinyinOf(whole)));
          afterSyllable = symbols !== null;
        }
      }
      return parts.join(' ');
    })
    .join(', ');
}
