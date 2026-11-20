// The character pairs the part changes are checked on
// (scripts/build-part-keys.js, and the unit test that keeps its file up to
// date), chosen once here so the two agree.
//
// read(path): the text of a file of the project.
// Returns { pairs, isCommon, isTaiwanForm, release, setsVersion }:
//   pairs:    [traditional, simplified] for every one-character entry of
//             CC-CEDICT, each once (written alike too: 人 is ['人', '人']),
//             whose traditional form is one of Taiwan's standard ones, in
//             plane 1 or 2 of CNS 11643 (the owner, 2026-11-20: variants
//             such as 爲 and 擧 muddied the check)
//   isCommon: (traditional, simplified) => whether a pair is in common use,
//             and so counts against a change (the owner, 2026-11-20: 會 → 会
//             is not "some" because of 廥): its traditional form in plane 1
//             (Taiwan's frequently used characters) and its simplified
//             form in levels 1 and 2 of the 通用规范汉字表 (the first
//             6,500); both, or a rare variant with a common simplified form
//             (槼 for 规) would count
//   isTaiwanForm: (character) => whether it is in plane 1 or 2
//   release, setsVersion: the sources' versions, for the file's header
// (data/unihan/README.md has the character sets.)

const MAINLAND_COMMON = 6500;

export function partKeyPairs(read) {
  const mainland = new Map();
  const taiwan = new Map();
  const setsText = read('data/unihan/character-sets.tsv');
  for (const line of setsText.split('\n')) {
    if (line.startsWith('#') || line === '') {
      continue;
    }
    const [character, number, plane] = line.split('\t');
    if (number) {
      mainland.set(character, Number(number));
    }
    if (plane) {
      taiwan.set(character, plane);
    }
  }
  const dictionary = read('data/cedict/dictionary.tsv');
  const pairs = [];
  const seen = new Set();
  for (const line of dictionary.split('\n')) {
    if (line.startsWith('#')) {
      continue;
    }
    // The simplified column is empty when it is the same.
    const [traditional, simplified] = line.split('\t');
    const s = simplified || traditional;
    if (
      traditional &&
      [...traditional].length === 1 &&
      [...s].length === 1 &&
      taiwan.has(traditional) &&
      !seen.has(traditional + s)
    ) {
      seen.add(traditional + s);
      pairs.push([traditional, s]);
    }
  }
  const isCommon = (traditional, simplified) =>
    taiwan.get(traditional) === 'T1' && (mainland.get(simplified) ?? Infinity) <= MAINLAND_COMMON;
  const isTaiwanForm = (character) => taiwan.has(character);
  return {
    pairs,
    isCommon,
    isTaiwanForm,
    release: dictionary.split('\n')[0].replace(/^#\s*/, ''),
    setsVersion: setsText.match(/Unicode [\d.]+/)[0],
  };
}
