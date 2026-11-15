// Copies the pictures of the cards used on the page about the app
// ("How it looks" in site/index.html) from the screenshot atlas into
// site/images/cards/. Run by hand, after the looks of the cards change.
// Two runs of the atlas (scripts/ux-atlas.js, which takes each screen in the
// light and the dark look at the phone size), because the writing card and
// the lesson are best with 兔子 and the other cards with 姐姐, which Review
// would otherwise hold back (a word's cards come one kind at a time):
//
//   SIZES=phone README=1 OUT=local/ux-atlas-writing node scripts/ux-atlas.js
//   SIZES=phone README=1 CARD_WORD=姐姐 OUT=local/ux-atlas-words node scripts/ux-atlas.js
//   node scripts/copy-card-pictures.js
//
// The names on the left are the atlas's.

import fs from 'node:fs';
import path from 'node:path';

const TO = 'site/images/cards';
const WRITING = 'local/ux-atlas-writing';
const WORDS = 'local/ux-atlas-words';

// atlas name: [folder it is taken from, name here]
const PICTURES = {
  '16-review-writing-writing': [WRITING, 'writing-writing'],
  '16-review-writing-grades': [WRITING, 'writing-graded'],
  '16-review-tone': [WORDS, 'tone'],
  '16-review-pinyin-grades': [WORDS, 'pinyin'],
  '16-review-meaning-grades': [WORDS, 'meaning'],
  '13-lesson-step3-writing': [WRITING, 'lesson'],
};

fs.mkdirSync(TO, { recursive: true });
for (const [from, [folder, to]] of Object.entries(PICTURES)) {
  for (const look of ['light', 'dark']) {
    const source = path.join(folder, `${from}-phone-${look}.png`);
    const target = path.join(TO, `${to}-${look}.png`);
    if (!fs.existsSync(source)) {
      // The writing card's step sometimes fails in the atlas (Review holds
      // 兔子's writing card back behind its other cards): the picture kept
      // here from an earlier run stays.
      if (!fs.existsSync(target)) {
        throw new Error(`${source} is missing: run the atlas first (see the top of this file).`);
      }
      console.log(`${source} is missing: kept ${target}`);
      continue;
    }
    fs.copyFileSync(source, target);
  }
  console.log(`${to} (light and dark)`);
}
