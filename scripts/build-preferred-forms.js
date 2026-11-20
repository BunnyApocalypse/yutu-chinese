// Builds data/cedict/preferred-forms.tsv: for each word the dictionary writes more than one
// way in traditional (岁 sui4 is 歲 and also the rare variant 嵗), the form Taiwan uses.
//
//     node scripts/build-preferred-forms.js
//
// Run by hand after the dictionary is rebuilt (scripts/build-dictionary.js). The app reads
// only the finished file (readDictionary in src/dictionary.js puts the form named here
// first, so the lookup of the other script finds it).
//
// It needs the Ministry of Education's dictionary, which is not in the repository (CC BY-ND:
// only the choices made from it are kept here, never its text): local/moe-dictionary/
// dict-revised.json, local/README.md says how to fetch it. The script does not run without it.
//
// For each word with several traditional forms, in this order:
//   1. data/wordlists/form-fixes.tsv: a form put right by hand (source "fix"). The form may
//      not be in the dictionary at all (帳戶, where CC-CEDICT has only 賬戶).
//   2. The ministry: of the forms, those it has as a word and not as "a variant of" another.
//      If exactly one is left, it is the one (source "moe").
//   3. Otherwise the one form the TOCFL list (Taiwan's own) or the HSK lists give for the word
//      (a list that has the word twice, in two forms, says nothing), if it is one of the forms (source "tocfl" or "hsk").
//   4. Otherwise nothing is written, and the word keeps the dictionary's order. Those words
//      are printed, to be looked at.
// The file's columns: simplified, reading, traditional, source.

import fs from 'node:fs';

const TARGET = 'data/cedict/preferred-forms.tsv';
const MOE = 'local/moe-dictionary/dict-revised.json';

if (!fs.existsSync(MOE)) {
  throw new Error(`${MOE} is missing: see local/README.md ("moe-dictionary") to fetch it.`);
}

// --- The dictionary's words, grouped by simplified form and reading ----------------------

const groups = new Map(); // "simplified|reading" → Set of traditional forms
for (const line of fs.readFileSync('data/cedict/dictionary.tsv', 'utf8').split('\n')) {
  if (line === '' || line.startsWith('#')) continue;
  const [traditional, simplified, pinyin] = line.split('\t');
  const key = `${simplified || traditional}|${pinyin}`;
  if (!groups.has(key)) groups.set(key, new Set());
  groups.get(key).add(traditional);
}

// --- The ministry's dictionary: words, and which are only a variant of another -----------

const isEncodable = (title) => !title.includes('{['); // the ministry draws rare characters as {[8ff0]}
const moeWords = new Set();
const moeVariants = new Set();
for (const entry of JSON.parse(fs.readFileSync(MOE, 'utf8'))) {
  if (!isEncodable(entry.title)) continue;
  moeWords.add(entry.title);
  const definitions = (entry.heteronyms || []).flatMap((heteronym) => (heteronym.definitions || []).map((each) => each.def || ''));
  if (definitions.length > 0 && definitions.every((definition) => /異體/.test(definition))) {
    moeVariants.add(entry.title);
  }
}

// --- The lists: the forms they give for a simplified form and reading -------------------

// A list may have a word twice with another form each (里 as 裡 and as 里), so each key has a
// set; only a set of one says anything about which form is meant.
function listForms(files) {
  const forms = new Map();
  for (const file of files) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (line === '' || line.startsWith('#')) continue;
      const [, simplified, traditional, pinyin] = line.split('\t');
      const key = `${simplified}|${pinyin}`;
      if (!forms.has(key)) forms.set(key, new Set());
      forms.get(key).add(traditional);
    }
  }
  return forms;
}
const tocflForms = listForms(['data/wordlists/tocfl/tocfl.tsv']);
const hskForms = listForms(['data/wordlists/hsk/hsk-2.0.tsv', 'data/wordlists/hsk/hsk-3.0.tsv']);

// --- The corrections made by hand --------------------------------------------------------

const fixes = new Map(); // "simplified|reading" → the form meant
for (const line of fs.readFileSync('data/wordlists/form-fixes.tsv', 'utf8').split('\n')) {
  if (line.trim() === '' || line.startsWith('#')) continue;
  const [, simplified, pinyin, , right] = line.split('\t');
  fixes.set(`${simplified}|${pinyin}`, right);
}

// --- Choosing ---------------------------------------------------------------------------

const rows = [];
const unresolved = [];
const tally = { fix: 0, moe: 0, tocfl: 0, hsk: 0 };
const keys = new Set([...fixes.keys(), ...[...groups].filter(([, forms]) => forms.size > 1).map(([key]) => key)]);
for (const key of [...keys].sort()) {
  const forms = groups.get(key) ?? new Set();
  const [simplified, pinyin] = key.split('|');
  let chosen = null;
  let source = '';
  if (fixes.has(key)) {
    chosen = fixes.get(key);
    source = 'fix';
  } else {
    const standard = [...forms].filter((form) => moeWords.has(form) && !moeVariants.has(form));
    if (standard.length === 1) {
      chosen = standard[0];
      source = 'moe';
    } else {
      for (const [name, list] of [['tocfl', tocflForms], ['hsk', hskForms]]) {
        const listed = list.get(key);
        const form = listed?.size === 1 ? [...listed][0] : null;
        // Among the ministry's standard forms, if it has several, or among all, if it has none.
        if (form && forms.has(form) && (standard.length === 0 || standard.includes(form))) {
          chosen = form;
          source = name;
          break;
        }
      }
    }
  }
  if (chosen === null) {
    unresolved.push(`${key} ${[...forms].join(',')}`);
    continue;
  }
  tally[source]++;
  rows.push([simplified, pinyin, chosen, source].join('\t'));
}

fs.writeFileSync(
  TARGET,
  '# Which traditional form to give a word the dictionary writes several ways: Taiwan\'s.\n' +
    '# Built by scripts/build-preferred-forms.js from form-fixes.tsv, the ministry\'s dictionary\n' +
    '# (choices only, not its text), the TOCFL list and the HSK lists. Columns: simplified,\n' +
    '# reading, traditional, source. Derived from CC-CEDICT (CC BY-SA 4.0); see README.md.\n' +
    rows.join('\n') +
    '\n',
);
console.log(`Wrote ${TARGET}: ${rows.length} words (${JSON.stringify(tally)}), ${unresolved.length} left to the dictionary's order.`);
console.log(unresolved.slice(0, 60).join('\n'));
