// Writes data/unihan/character-sets.tsv: which characters are standard in
// Taiwan and on the mainland, from Unicode's Unihan database (see
// data/unihan/README.md). Used by scripts/build-part-keys.js, not by the app.
//
//   node scripts/build-character-sets.js <folder with Unihan's .txt files>
//
// Unihan.zip is in local/stroke-sources/unihan/ (local/README.md); unzip it
// into a folder of its own first.

import fs from 'node:fs';
import path from 'node:path';

const folder = process.argv[2];
if (!folder) {
  console.error('Give the folder with the unzipped Unihan .txt files.');
  process.exit(1);
}

// A line is "U+4E00<tab>kField<tab>value"; "#" begins a comment.
function readField(file, field, into) {
  for (const line of fs.readFileSync(path.join(folder, file), 'utf8').split('\n')) {
    const [codePoint, name, value] = line.split('\t');
    if (codePoint.startsWith('U+') && name === field) {
      into(String.fromCodePoint(parseInt(codePoint.slice(2), 16)), value);
    }
  }
}

const version = fs.readFileSync(path.join(folder, 'Unihan_OtherMappings.txt'), 'utf8').match(/Unicode Version ([\d.]+)/)[1];
const rows = new Map();
const row = (character) => {
  if (!rows.has(character)) {
    rows.set(character, { mainland: '', taiwan: '' });
  }
  return rows.get(character);
};
// kTGH: "2013:123", the character's number in the 通用规范汉字表.
readField('Unihan_OtherMappings.txt', 'kTGH', (character, value) => {
  row(character).mainland = value.split(':')[1];
});
// kIRG_TSource: "T1-4421", the plane of CNS 11643 it is from. Only planes
// 1 and 2 (Big5's two levels) are kept.
readField('Unihan_IRGSources.txt', 'kIRG_TSource', (character, value) => {
  const plane = value.split('-')[0];
  if (plane === 'T1' || plane === 'T2') {
    row(character).taiwan = plane;
  }
});

const kept = [...rows].filter(([, { mainland, taiwan }]) => mainland || taiwan);
kept.sort(([a], [b]) => a.codePointAt(0) - b.codePointAt(0));
const lines = [
  `# From Unihan, Unicode ${version}; written by scripts/build-character-sets.js. See README.md.`,
  '# character\tnumber in the 通用规范汉字表 (kTGH)\tplane of CNS 11643, T1 or T2 (kIRG_TSource)',
  ...kept.map(([character, { mainland, taiwan }]) => `${character}\t${mainland}\t${taiwan}`),
];
fs.mkdirSync(new URL('../data/unihan/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../data/unihan/character-sets.tsv', import.meta.url), `${lines.join('\n')}\n`);
const count = (test) => kept.filter(([, entry]) => test(entry)).length;
console.log(
  `${kept.length} characters: mainland ${count((e) => e.mainland)}, Taiwan T1 ${count((e) => e.taiwan === 'T1')}, T2 ${count((e) => e.taiwan === 'T2')}`,
);
