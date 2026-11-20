// Audit of the traditional/simplified pairs the app shows (read-only; nothing in the app changes).
//
//   node scripts/audit-script-forms.js
//
// Part 1, word forms: for every word of the HSK 2.0, HSK 3.0 and TOCFL lists and
// tests/words.tsv, does the dictionary's other-script lookup (otherScriptForm in
// src/dictionary.js) give the form the list has, both ways? And where the HSK lists'
// traditional form differs from the TOCFL's (Taiwan's own list) for the same simplified
// word and reading, what are the character differences?
//
// Part 2, keys: the changes src/scriptKeys.js finds between each pair of characters (the
// "keys" taught by "Also read simplified"): is each one actually a part of both
// characters, and which kinds of change are there?
//
// Output goes to local/audit/ (git-ignored): script-forms-words.tsv, script-forms-tocfl.tsv,
// script-forms-keys.tsv and script-forms-key-problems.tsv. A summary is printed.
// What this CANNOT say: whether a traditional form is Taiwan standard. The TOCFL
// comparison is the only Taiwan source here, and it covers only TOCFL's words. Not checked
// against the Taiwan Ministry of Education dictionary.

import fs from 'node:fs';
import { readDictionary, lookUp, otherScriptForm } from '../src/dictionary.js';
import { parseCharacters } from '../src/characters.js';
import { createChangeTable, keyOf, needsLearning, parsePartKeyChecks } from '../src/scriptKeys.js';

const outputFolder = 'local/audit';
fs.mkdirSync(outputFolder, { recursive: true });

const dictionary = readDictionary(
  fs.readFileSync('data/cedict/dictionary.tsv', 'utf8'),
  fs.readFileSync('data/cedict/preferred-forms.tsv', 'utf8'),
);
const characters = parseCharacters(fs.readFileSync('data/makemeahanzi/dictionary.txt', 'utf8'));

// --- Reading the lists --------------------------------------------------------------------

// The lists have: level, simplified, traditional, pinyin, Taiwan reading, group.
function readList(file, source) {
  const words = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const [level, simplified, traditional, pinyin] = line.split('\t');
    words.push({ source, level, simplified, traditional, pinyin });
  }
  return words;
}

function readTestWords() {
  const words = [];
  for (const line of fs.readFileSync('tests/words.tsv', 'utf8').split('\n')) {
    if (line === '' || line.startsWith('#')) continue;
    const [simplified, traditional, pinyin] = line.split('\t');
    words.push({ source: 'tests', level: '', simplified, traditional, pinyin });
  }
  return words;
}

const hsk2 = readList('data/wordlists/hsk/hsk-2.0.tsv', 'hsk2');
const hsk3 = readList('data/wordlists/hsk/hsk-3.0.tsv', 'hsk3');
const tocfl = readList('data/wordlists/tocfl/tocfl.tsv', 'tocfl');
const all = [...hsk2, ...hsk3, ...tocfl, ...readTestWords()];

// --- Part 1a: the lookup both ways --------------------------------------------------------

const wordRows = [];
const tally = { checked: 0, ok: 0, notInDictionary: 0, toTraditionalWrong: 0, toSimplifiedWrong: 0, undecided: 0 };
for (const word of all) {
  const { source, level, simplified, traditional, pinyin } = word;
  tally.checked++;
  const entries = lookUp(dictionary, simplified);
  const toTraditional = otherScriptForm(entries, 'simplified', simplified, pinyin);
  const toSimplified = otherScriptForm(lookUp(dictionary, traditional), 'traditional', traditional, pinyin);
  const problems = [];
  if (toTraditional !== traditional) {
    // Giving the input back unchanged is "the dictionary cannot tell"; anything else is a wrong answer.
    problems.push(toTraditional === simplified ? 'undecided→trad' : 'wrong→trad');
  }
  if (toSimplified !== simplified) {
    problems.push(toSimplified === traditional ? 'undecided→simp' : 'wrong→simp');
  }
  if (entries.length === 0 && lookUp(dictionary, traditional).length === 0) {
    problems.push('not-in-dictionary');
  }
  if (problems.length === 0) {
    tally.ok++;
    continue;
  }
  for (const problem of problems) {
    if (problem === 'not-in-dictionary') tally.notInDictionary++;
    else if (problem === 'wrong→trad') tally.toTraditionalWrong++;
    else if (problem === 'wrong→simp') tally.toSimplifiedWrong++;
    else tally.undecided++;
  }
  wordRows.push([source, level, simplified, traditional, pinyin, toTraditional, toSimplified, problems.join(',')]);
}
writeTable('script-forms-words.tsv', ['source', 'level', 'simplified', 'list traditional', 'pinyin', 'lookup → trad', 'lookup → simp', 'problems'], wordRows);

// --- Part 1b: HSK's traditional forms against TOCFL's --------------------------------------

// TOCFL (Taiwan's own list) by simplified form and reading.
const tocflForms = new Map();
for (const word of tocfl) {
  tocflForms.set(`${word.simplified}|${word.pinyin}`, word.traditional);
}
const tocflRows = [];
const charDifferences = new Map(); // "HSK char → TOCFL char" → [count, example]
let compared = 0;
for (const word of [...hsk2, ...hsk3]) {
  const theirs = tocflForms.get(`${word.simplified}|${word.pinyin}`);
  if (theirs === undefined) continue;
  compared++;
  if (theirs === word.traditional) continue;
  tocflRows.push([word.source, word.level, word.simplified, word.pinyin, word.traditional, theirs]);
  const mine = [...word.traditional];
  const taiwan = [...theirs];
  if (mine.length === taiwan.length) {
    mine.forEach((character, i) => {
      if (character !== taiwan[i]) {
        const key = `${character}→${taiwan[i]}`;
        const known = charDifferences.get(key) ?? [0, word.traditional];
        known[0]++;
        charDifferences.set(key, known);
      }
    });
  }
}
writeTable('script-forms-tocfl.tsv', ['source', 'level', 'simplified', 'pinyin', 'HSK list traditional', 'TOCFL traditional'], tocflRows);

// --- Part 2: the keys ---------------------------------------------------------------------

// Every pair of characters, found by lining up a word's two forms (same length is required
// of every word), where the two differ.
const pairs = new Map(); // "繁简" → { traditional, simplified, words: [..] }
for (const word of all) {
  const trad = [...word.traditional];
  const simp = [...word.simplified];
  if (trad.length !== simp.length) continue;
  trad.forEach((character, i) => {
    if (character === simp[i]) return;
    const id = character + simp[i];
    const known = pairs.get(id) ?? { traditional: character, simplified: simp[i], words: new Set() };
    known.words.add(word.traditional);
    pairs.set(id, known);
  });
}

// With the checks against the whole dictionary applied, as in the app
// (data/script-keys/, scripts/build-part-keys.js).
const table = createChangeTable(characters, parsePartKeyChecks(fs.readFileSync('data/script-keys/part-keys.tsv', 'utf8')));
table.add([...pairs.values()].map((pair) => [pair.traditional, pair.simplified]));

// All the parts in a character, all the way down (the dictionary's decomposition, which
// has one level at a time).
function partsOf(character, seen = new Set(), depth = 0) {
  if (depth > 6) return seen;
  const decomposition = characters.get(character)?.decomposition;
  if (!decomposition) return seen;
  for (const part of decomposition) {
    if (/[⿰-⿿？]/.test(part) || seen.has(part)) continue;
    seen.add(part);
    partsOf(part, seen, depth + 1);
  }
  return seen;
}

const keys = new Map(); // key → { kind, learn, count, examples }
const problemRows = [];
for (const pair of pairs.values()) {
  const { traditional, simplified } = pair;
  const example = [...pair.words][0];
  if (!characters.has(traditional) || !characters.has(simplified)) {
    problemRows.push([traditional, simplified, '', '', 'character missing from Make Me a Hanzi', example]);
    continue;
  }
  const traditionalParts = partsOf(traditional);
  const simplifiedParts = partsOf(simplified);
  for (const change of table.changesOf(traditional, simplified)) {
    const key = keyOf(change);
    const known = keys.get(key) ?? { kind: change.kind, learn: needsLearning(change), count: 0, examples: [] };
    known.count++;
    if (known.examples.length < 4) known.examples.push(`${traditional}→${simplified}`);
    keys.set(key, known);
    // A 'whole' change is the character itself, so it is trivially "in" both.
    // A part change has to be a part of the character it is said to come from.
    const wholeOrSelf = change.kind === 'whole' || change.from === traditional;
    const fromParts = [...change.from].filter((part) => !/[⿰-⿿？]/.test(part));
    const toParts = [...change.to].filter((part) => !/[⿰-⿿？]/.test(part));
    const fromFound = wholeOrSelf || fromParts.every((part) => traditionalParts.has(part));
    const toFound = wholeOrSelf || change.to === simplified || toParts.every((part) => simplifiedParts.has(part));
    if (!fromFound || !toFound) {
      problemRows.push([traditional, simplified, key, change.kind, `${fromFound ? '' : 'from-part not in traditional; '}${toFound ? '' : 'to-part not in simplified'}`, example]);
    }
  }
}
const keyRows = [...keys.entries()]
  .sort((a, b) => b[1].count - a[1].count)
  .map(([key, { kind, learn, count, examples }]) => [key, kind, learn ? 'learn' : 'readable', count, examples.join(' ')]);
writeTable('script-forms-keys.tsv', ['key', 'kind', 'taught?', 'characters', 'examples'], keyRows);
writeTable('script-forms-key-problems.tsv', ['traditional', 'simplified', 'key', 'kind', 'problem', 'example word'], problemRows);

// --- Summary ------------------------------------------------------------------------------

console.log('Part 1a, lookup both ways, over', tally.checked, 'list rows:');
console.log(' ', JSON.stringify(tally));
console.log(`Part 1b, HSK against TOCFL: ${compared} words in both, ${tocflRows.length} with another traditional form.`);
const topDifferences = [...charDifferences.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 25);
for (const [key, [count, example]] of topDifferences) {
  console.log(`   HSK ${key}  ${count}×  (e.g. ${example})`);
}
console.log(`Part 2, ${pairs.size} differing character pairs, ${keys.size} keys, ${problemRows.length} problems.`);
const byKind = {};
for (const { kind, learn } of keys.values()) {
  const name = `${kind}${learn ? '' : ' (readable)'}`;
  byKind[name] = (byKind[name] ?? 0) + 1;
}
console.log(' ', JSON.stringify(byKind));
console.log('Written to', outputFolder + '/script-forms-*.tsv');

function writeTable(name, header, rows) {
  const lines = [header.join('\t'), ...rows.map((row) => row.join('\t'))];
  fs.writeFileSync(`${outputFolder}/${name}`, lines.join('\n') + '\n');
}
