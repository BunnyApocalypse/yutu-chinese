// Lists what a translation of the interface still lacks, against the English
// (src/text/en.js; src/text.js says how the text is used).
//
//   node scripts/missing-text.js de
//
// reads src/text/de.js and prints:
// - keys with no German text yet (shown in English meanwhile);
// - keys no longer in the English (left over: remove them);
// - texts whose {gaps} differ from the English (a gap misspelled is shown
//   as it is, "{count}", rather than filled in);
// - texts with forms for numbers where the English has none, or the other
//   way round.

import { existsSync } from 'node:fs';
import en from '../src/text/en.js';

const language = process.argv[2];
const file = new URL(`../src/text/${language}.js`, import.meta.url);
if (!language || !existsSync(file)) {
  console.error('Give a language whose file is in src/text/, such as: node scripts/missing-text.js de');
  process.exit(1);
}
const translation = (await import(file)).default;

const gapsIn = (value) => {
  const texts = typeof value === 'string' ? [value] : Object.values(value);
  return [...new Set(texts.flatMap((text) => text.match(/\{\w+\}/g) ?? []))].sort().join(' ');
};

const missing = Object.keys(en).filter((key) => !(key in translation));
const leftOver = Object.keys(translation).filter((key) => !(key in en));
const shared = Object.keys(en).filter((key) => key in translation);
// "other" is enough for a language with one form, such as Chinese; English
// gaps may be left out of a form ("one word" for {count}).
const formsDiffer = shared.filter((key) => (typeof en[key] === 'string') !== (typeof translation[key] === 'string'));
const gapsDiffer = shared.filter(
  (key) => !formsDiffer.includes(key) && typeof en[key] === 'string' && gapsIn(en[key]) !== gapsIn(translation[key]),
);

const report = (heading, keys) => {
  console.log(`${heading}: ${keys.length}`);
  for (const key of keys) {
    console.log(`  ${key}`);
  }
};
report('Not yet translated', missing);
report('No longer in the English', leftOver);
report('Gaps differ from the English', gapsDiffer);
report('Forms for numbers differ from the English', formsDiffer);
console.log(`Translated: ${shared.length} of ${Object.keys(en).length}.`);
