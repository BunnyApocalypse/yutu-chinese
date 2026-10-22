// The test language (src/text.js): English made to look foreign, so that
// text not yet going through t() stands out, and longer, so that a screen
// can be checked for room. "Settings" becomes "[Šéţţîñĝš ···]".
//
// Left as they are: the {name} gaps filled in later, markup (<b>, <a href="…">)
// and entities (&nbsp;), and Chinese.

const LOOK_ALIKES = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

// German and Finnish run about 30% longer than English, more for short
// texts; a third more, at least two characters, is a fair test.
const LONGER_BY = 1 / 3;

export function pseudoText(english) {
  let letters = 0;
  // The pieces not to touch are matched first, so they are kept whole.
  const changed = english.replace(/(\{\w+\}|<[^>]*>|&\w+;)|([A-Za-z])/g, (whole, keep, letter) => {
    if (keep) {
      return keep;
    }
    letters += 1;
    return LOOK_ALIKES[letter];
  });
  if (letters === 0) {
    return english;
  }
  const padding = '·'.repeat(Math.max(2, Math.round(letters * LONGER_BY)));
  return `[${changed} ${padding}]`;
}
