// Tones and readings: which reading of a word applies, lining its syllables
// up with its characters, and which tones are accepted. Plain calculation, no
// page.
//
// Pinyin in the word list is written with tone numbers, e.g. "xue2xiao4".
// Tone 5 is the neutral tone. A word may list several readings separated by
// commas ("shan1, shan4"); any of them is accepted.
//
// Words are pronounced differently in Taiwan and on the mainland more often
// than one might expect, mostly in tone: 星期 is xīngqī on the mainland and
// xīngqí in Taiwan. A word's `pinyin` is its mainland reading; `pinyinTaiwan`,
// if present, its Taiwan reading. The "tone table" used below is
// data/cedict/tones.json (see the README in that folder).

import { formatPinyin } from './wordList.js';

// How each tone is shown on its button and in messages: the mark on the
// letter a, which is easier to read at a glance than the bare mark. The
// neutral tone has no mark.
export const TONE_LABELS = { 1: 'ā', 2: 'á', 3: 'ǎ', 4: 'à', 5: 'a' };

// Splits one reading into syllables: "nv3'er2" → ["nv3", "er2"]. Each run of
// letters followed by a tone number is one syllable; anything else
// (apostrophes, spaces) is skipped.
export function splitSyllables(reading) {
  return reading.toLowerCase().replaceAll('u:', 'v').match(/[a-zü]+[1-5]/g) || [];
}

const lettersOf = (syllable) => syllable.slice(0, -1);
const toneOf = (syllable) => Number(syllable.slice(-1));

// Works out which readings of a word to show and expect.
//
// word:          the word record
// pronunciation: 'mainlandOnly', 'mainland' or 'taiwan' (the setting). With
//                'mainlandOnly' a Taiwan reading is never shown or expected.
// table:         the tone table, or null if it isn't available
//
// Returns:
//   primary:    the reading to show as the answer (as listed, with numbers)
//   other:      the other region's reading if it is known and different,
//               otherwise null
//   otherLabel: 'Taiwan' or 'mainland', saying which region `other` is
export function readingsFor(word, pronunciation, table) {
  const taiwan = word.pinyinTaiwan || (table && table.taiwanWords[word.traditional]) || null;
  // A radical with no reading (radicals.js) has none in either region.
  if (pronunciation === 'mainlandOnly' || !taiwan || taiwan === word.pinyin || word.pinyin === '') {
    return { primary: word.pinyin, other: null, otherLabel: null };
  }
  return pronunciation === 'taiwan'
    ? { primary: taiwan, other: word.pinyin, otherLabel: 'mainland' }
    : { primary: word.pinyin, other: taiwan, otherLabel: 'Taiwan' };
}

// Turns the result of readingsFor into text for the page:
//   main:  the expected reading with tone marks, e.g. "xīngqí"
//   other: the other region's reading with its label, e.g. "mainland: xīngqī",
//          or null if there is none
export function describeReading(reading) {
  return {
    main: formatPinyin(reading.primary),
    other: reading.other ? `${reading.otherLabel}: ${formatPinyin(reading.other)}` : null,
  };
}

// The listed readings (a comma-separated field) that have exactly one
// syllable per character, each as a list of syllables.
function fittingReadings(pinyinField, charCount) {
  return (pinyinField || '')
    .split(',')
    .map(splitSyllables)
    .filter((syllables) => syllables.length === charCount && charCount > 0);
}

// Works out the tone answers for a word.
//
// chars:   the word's characters, as a list (traditional form, which is what
//          the tone table is keyed by)
// primary: the reading to expect (from readingsFor)
// other:   the other region's reading, or null
// also:    readings the owner added to the word as accepted too (its
//          `pinyinAlso`), or null. Their tones are simply right.
// table:   the tone table, or null
// regional: false to leave out the tones that are only accepted because the
//          other region uses them (for someone who learns one region's
//          pronunciation only)
//
// Returns one entry per character:
//   syllable:     the syllable of the first listed reading, e.g. "xue2"
//   tones:        the tones that are simply right (numbers 1 to 5): the tone
//                 of every listed reading at this position
//   variantTones: tones that are also accepted, but pointed out as variants:
//                 - the other region's tone for this word
//                 - a tone the tone table links to a listed one as a mainland
//                   and Taiwan reading of this character (期: qī and qí)
//                 - the character's own full tone where the list says neutral
//                   (友 in 朋友: péngyou, or péngyǒu as in Taiwan)
//                 - the neutral tone where the dictionary also gives the word
//                   a reading with it (道 in 知道: zhīdào, also zhīdao); see
//                   neutralWords in scripts/build-tone-table.js
//                 The second and third are approximations and accept some things
//                 neither standard says, which is why they are pointed out.
// Returns null if no listed reading has exactly one syllable per character.
// Such a word can't have a tone card.
export function toneAnswers(chars, primary, other, table, regional = true, also = null) {
  const listedReadings = fittingReadings(primary, chars.length);
  if (listedReadings.length === 0) {
    return null;
  }
  const readings = [...listedReadings, ...fittingReadings(also, chars.length)];
  const otherReadings = fittingReadings(other, chars.length);
  // The dictionary's neutral-tone readings of this word that are a listed
  // reading with some of its tones made neutral.
  const sameButNeutral = (neutral, full) =>
    neutral.every(
      (syllable, index) =>
        syllable === full[index] ||
        (toneOf(syllable) === 5 && lettersOf(syllable) === lettersOf(full[index])),
    );
  const neutralReadings = fittingReadings(
    ((table && table.neutralWords && table.neutralWords[chars.join('')]) || []).join(','),
    chars.length,
  ).filter((neutral) => listedReadings.some((full) => sameButNeutral(neutral, full)));

  return chars.map((char, position) => {
    const listed = readings.map((reading) => reading[position]);
    const tones = new Set(listed.map(toneOf));
    const variants = new Set(
      [...otherReadings, ...neutralReadings].map((reading) => toneOf(reading[position])),
    );

    if (table) {
      for (const syllable of listed) {
        for (const [mainland, taiwan] of regional ? table.regional[char] || [] : []) {
          const samePair = lettersOf(mainland) === lettersOf(syllable);
          if (samePair && (mainland === syllable || taiwan === syllable)) {
            variants.add(toneOf(mainland));
            variants.add(toneOf(taiwan));
          }
        }
        if (toneOf(syllable) === 5) {
          for (const reading of table.readings[char] || []) {
            if (lettersOf(reading) === lettersOf(syllable)) {
              variants.add(toneOf(reading));
            }
          }
        }
      }
    }
    return {
      syllable: listed[0],
      tones: [...tones],
      variantTones: [...variants].filter((tone) => !tones.has(tone)),
    };
  });
}
