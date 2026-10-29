// Writes each learning note in the other script (data/notes/README.md): the
// note in simplified goes in the third column, the note in traditional
// (Taiwan forms) in the ninth. A line that has only one of the two gets the
// other, converted word by word with CC-CEDICT.
//
// A conversion is left out, and the line listed in local/note-scripts/ for a
// person (or a model) to settle, when the script cannot be sure of it:
// - a word that has several forms in the other script, which the note's own
//   example sentence does not settle (里 is 裡 "inside" or 里 "a mile");
// - a part of a character that the other script writes otherwise (讠 is
//   言 in traditional), which needs the note reworded, not converted;
// - a note that talks about the forms ("simplified", "traditional").
//
//   node scripts/convert-notes.js          writes the files and the list
//   node scripts/convert-notes.js --dry    only counts
//
// Run again after adding notes: lines that already have both are left alone.

import fs from 'node:fs';
import path from 'node:path';
import { readDictionary, splitIntoWords, lookUp } from '../src/dictionary.js';

const root = path.resolve(import.meta.dirname, '..');
const dry = process.argv.includes('--dry');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const dictionary = readDictionary(read('data/cedict/dictionary.tsv'));

// The files whose third column was mostly written in traditional characters
// (data/notes/README.md); every other file's mostly in simplified. A note is
// taken to be in the script most of its own characters belong to, and in
// its file's when they don't tell (scriptOf, below): the notes written from
// 2026-10-27 have their Chinese in traditional whatever their file.
const WRITTEN_TRADITIONAL = /^(tocfl-|extra)/;

// The characters Taiwan writes: those of the TOCFL list and of the notes'
// traditional sentences, which were written in Taiwan forms. CC-CEDICT also
// gives other traditional forms (裏 beside 裡, 爲 beside 為); a form outside
// this set is used only when there is no other.
const taiwan = new Set();
for (const line of read('data/wordlists/tocfl/tocfl.tsv').split('\n')) {
  if (!line.startsWith('#')) {
    for (const char of line.split('\t')[2] || '') taiwan.add(char);
  }
}
const notesDir = path.join(root, 'data/notes');
const files = fs.readdirSync(notesDir).filter((file) => file.endsWith('.tsv')).sort();
for (const file of files) {
  for (const line of read(`data/notes/${file}`).split('\n')) {
    for (const char of line.split('\t')[4] || '') taiwan.add(char);
  }
}
// Forms the TOCFL list happens to contain but Taiwan's standard does not use
// in running text; the TOCFL writes 着 only for the simplified-looking zhe.
for (const char of '着裏爲衆綫牀麪羣峯敍啓僞') taiwan.delete(char);

// How often each character stands for each character of the other script,
// over the whole dictionary: 几 is 幾 in many words and 几 (a small table) in
// a few. Used to choose when a form stands alone (a single character).
const counts = { simplified: new Map(), traditional: new Map() };
for (const lines of new Set(dictionary.values())) {
  for (const line of lines) {
    const [traditional, simplified] = line.split('\t');
    const t = Array.from(traditional);
    const s = Array.from(simplified || traditional);
    if (t.length !== s.length) continue;
    t.forEach((char, i) => {
      add(counts.simplified, s[i], char);
      add(counts.traditional, char, s[i]);
    });
  }
}
function add(map, from, to) {
  const forms = map.get(from) || map.set(from, new Map()).get(from);
  forms.set(to, (forms.get(to) || 0) + 1);
}
// (Each line was listed under both its forms; the Set above takes each list
// once, but a line under two keys is still counted twice, which is fine for
// comparing.)

// The parts of a character (Make Me a Hanzi), and their parts, as a set.
const decompositions = new Map();
for (const line of read('data/makemeahanzi/dictionary.txt').split('\n')) {
  if (line.trim()) {
    const entry = JSON.parse(line);
    decompositions.set(entry.character, entry.decomposition || '');
  }
}
function partsOf(char, found = new Set()) {
  for (const part of Array.from(decompositions.get(char) || '')) {
    if (/\p{Script=Han}/u.test(part) && part !== char && !found.has(part)) {
      found.add(part);
      partsOf(part, found);
    }
  }
  return found;
}

// The form to use when nothing in the note settles it, for words and
// characters whose other forms are rare or a narrow sense (了 is 瞭 only for
// "understand", 你 is 妳 only for a woman). Where Taiwan writes a word two
// ways, the Ministry of Education's standard form (the owner, 2026-10-29:
// Taiwan's standard by default): 臺 not 台, 溼 not 濕, 複習 not 復習.
// Characters whose form depends on the meaning (里, 发, 干, 只, 面, 系, 著)
// are not here: they are left for a reader.
const DEFAULT_FORM = {
  traditional: {
    了: '了', 你: '你', 家: '家', 向: '向', 出: '出', 帚: '帚', 冗: '冗', 兜: '兜', 奶: '奶',
    于: '於', 湿: '溼', 晒: '曬', 沉: '沉', 获: '獲', 恤: '恤', 回: '回', 尝: '嘗',
    关系: '關係', 联系: '聯繫', 品尝: '品嘗', 卷起: '捲起', 词汇: '詞彙', 复习: '複習', 伙伴: '夥伴',
    台湾: '臺灣', 电视台: '電視臺', 阳台: '陽臺', 讲台: '講臺', 广播电台: '廣播電臺',
  },
  simplified: {
    於: '于',
    // The mainland's forms where CC-CEDICT gives an older one.
    計畫: '计划', 帳戶: '账户', 結帳: '结账', 清帳: '清账',
  },
};

// Forms CC-CEDICT gives that Taiwan writes otherwise in every word: 帳戶,
// 帳號, 帳單; 燒毀. And parts kept as Make Me a Hanzi draws them (the
// mainland's shapes), which Taiwan writes otherwise: 戶 in 房, 勻 in 均.
const TAIWAN_FORM = { 賬: '帳', 燬: '毀', 户: '戶', 匀: '勻' };
const taiwanForm = (text) => Array.from(text).map((char) => TAIWAN_FORM[char] || char).join('');

// Characters of one script only: in CC-CEDICT, a character that stands for
// a different one of the other script and is never a form of that script
// itself (們 is only traditional, 们 only simplified; 后 is both).
const onlyIn = { traditional: new Set(), simplified: new Set() };
{
  const seen = { traditional: new Set(), simplified: new Set() };
  const changed = { traditional: new Set(), simplified: new Set() };
  for (const lines of new Set(dictionary.values())) {
    for (const line of lines) {
      const [traditional, simplified] = line.split('\t');
      const t = Array.from(traditional);
      const s = Array.from(simplified || traditional);
      if (t.length !== s.length) continue;
      t.forEach((char, i) => {
        seen.traditional.add(char);
        seen.simplified.add(s[i]);
        if (char !== s[i]) {
          changed.traditional.add(char);
          changed.simplified.add(s[i]);
        }
      });
    }
  }
  for (const script of ['traditional', 'simplified']) {
    const other = script === 'traditional' ? 'simplified' : 'traditional';
    for (const char of changed[script]) {
      if (!seen[other].has(char)) onlyIn[script].add(char);
    }
  }
}

// The script a note's Chinese is in, by its characters; `fallback` when
// they don't tell.
function scriptOf(note, fallback) {
  const count = (script) => Array.from(note).filter((char) => onlyIn[script].has(char)).length;
  const traditional = count('traditional');
  const simplified = count('simplified');
  if (traditional === simplified) return fallback;
  return traditional > simplified ? 'traditional' : 'simplified';
}

// A remark about the forms of the other script (the owner, 2026-10-29: to
// be taken out), as the notes put it.
const FORMS = /simplif|traditional|(short|shortened|simple|full|old|older|complex) form|cut down from|comes from \p{Script=Han}/iu;

// A choice among forms of the other script is clear when one is used at
// least this many times as often as the next.
const CLEAR = 5;

// The forms of `text` (one dictionary word or one character) in script `to`,
// most likely first; `context` is text known to be in `to` (the note's own
// example sentence and word), which settles a choice it contains; `parts`,
// when given, the parts of the word's characters in each script
// ({ from, to }): a part named in the note stays the part the other form
// has (你 is built with 尔 in both scripts, so its 尔 is not made 爾).
// Returns { form } or { choices } when it can't tell.
function convertPiece(text, from, to, context, parts = null) {
  if (DEFAULT_FORM[to][text]) return { form: DEFAULT_FORM[to][text] };
  let forms = [...new Set(lookUp(dictionary, text).filter((entry) => entry[from] === text).map((entry) => entry[to]))];
  if (forms.length === 0) {
    // Not a word of the dictionary: character by character.
    const chars = Array.from(text);
    if (chars.length > 1) {
      const results = chars.map((char) => convertPiece(char, from, to, context));
      const unclear = results.find((result) => !result.form);
      return unclear || { form: results.map((result) => result.form).join('') };
    }
    const seen = counts[from].get(text);
    forms = seen ? [...seen.keys()] : [text];
  }
  if (parts && parts.from.has(text)) {
    const asParts = [...new Set([text, ...forms])].filter((form) => parts.to.has(form));
    if (asParts.length === 1) return { form: asParts[0] };
  }
  if (to === 'traditional') {
    const inTaiwan = forms.filter((form) => Array.from(form).every((char) => taiwan.has(char)));
    if (inTaiwan.length > 0) forms = inTaiwan;
  }
  if (forms.length === 1) return { form: forms[0] };
  const inContext = forms.filter((form) => context.includes(form));
  if (inContext.length === 1) return { form: inContext[0] };
  // A character standing alone can't be settled by how often each form is
  // used: 里 is mostly 里 in words (公里) but mostly 裡 after a noun (湯裡).
  if (Array.from(text).length === 1) return { choices: forms };
  // A word, by how often each form is used, character by character.
  const score = (form) => Array.from(form).reduce((sum, char, i) => {
    const original = Array.from(text)[i];
    return sum + Math.log((counts[from].get(original)?.get(char) || 0) + 1);
  }, 0);
  forms.sort((a, b) => score(b) - score(a));
  if (score(forms[0]) - score(forms[1]) >= Math.log(CLEAR)) return { form: forms[0] };
  return { choices: forms };
}

// Converts one note. Returns { text, problems }, problems a list of strings
// (empty when the conversion can be trusted).
function convertNote(note, from, to, word, context, radical) {
  const problems = [];
  const wordChars = Array.from(word[from]);
  const otherChars = Array.from(word[to]);
  const fromParts = new Set(wordChars.flatMap((char) => [...partsOf(char)]));
  const toParts = new Set(otherChars.flatMap((char) => [char, ...partsOf(char)]));
  let text = '';
  for (const piece of splitIntoWords(dictionary, note)) {
    if (!piece.word) {
      text += piece.text;
      continue;
    }
    const result = convertPiece(piece.text, from, to, context, { from: fromParts, to: toParts });
    const choices = (result.choices || [result.form]).map((form) => (to === 'traditional' ? taiwanForm(form) : form));
    if (choices.length > 1) {
      problems.push(`unclear: ${piece.text} → ${choices.join('/')}`);
    }
    text += choices[0];
  }
  // A part of the word's characters that the other form doesn't have (讠
  // in 请, where 請 has 言), which needs the note reworded.
  const said = Array.from(note);
  const converted = Array.from(text);
  if (said.length === converted.length) {
    said.forEach((char, i) => {
      if (fromParts.has(char) && !wordChars.includes(char) && !toParts.has(converted[i])) {
        problems.push(`part: ${char} → ${converted[i]} is not a part of ${word[to]}`);
      }
    });
  }
  // A note about a part of a character (radicals.tsv, no reading) gives
  // characters with that part as examples: each must still have it.
  if (radical && said.length === converted.length) {
    said.forEach((char, i) => {
      if (partsOf(char).has(radical) && !partsOf(converted[i]).has(radical)) {
        problems.push(`part: ${char} → ${converted[i]} has no ${radical}`);
      }
    });
  }
  if (FORMS.test(note)) {
    problems.push('forms: talks about the forms');
  }
  // Chinese of the other script inside the note: a form named, or a word
  // quoted as the other side writes it, to be written in each version's own.
  const other = [...new Set(said.filter((char) => onlyIn[to].has(char)))];
  if (!radical && other.length > 0) {
    problems.push(`mixed: ${other.join('')} is ${to}`);
  }
  return { text, problems: [...new Set(problems)] };
}

// The word of a line in the other script: from the dictionary, by its
// reading, else character by character.
function wordForms(simplified, pinyin) {
  const entries = lookUp(dictionary, simplified).filter((entry) => entry.simplified === simplified);
  // Taiwan's forms first (這裡, not 這裏).
  const inTaiwan = (e) => Array.from(e.traditional).every((char) => taiwan.has(char));
  entries.sort((a, b) => Number(inTaiwan(b)) - Number(inTaiwan(a)));
  const entry = entries.find((e) => e.pinyin.toLowerCase() === pinyin.toLowerCase()) || entries[0];
  if (entry) return { simplified, traditional: entry.traditional };
  return { simplified, traditional: convertPiece(simplified, 'simplified', 'traditional', '').form || simplified };
}

const listed = [];
const totals = { lines: 0, done: 0, converted: 0, listed: 0 };
for (const file of files) {
  const lines = read(`data/notes/${file}`).split('\n');
  const writtenTraditional = WRITTEN_TRADITIONAL.test(file);
  const changed = lines.map((line, number) => {
    if (line.trim() === '' || line.startsWith('#')) return line;
    totals.lines += 1;
    const columns = line.split('\t');
    while (columns.length < 9) columns.push('');
    if (columns[2] && columns[8]) {
      totals.done += 1;
      return line;
    }
    // Which column has the note, and which is to be filled.
    const from = columns[8] ? 'traditional' : scriptOf(columns[2], writtenTraditional ? 'traditional' : 'simplified');
    const to = from === 'traditional' ? 'simplified' : 'traditional';
    const note = from === 'traditional' ? (columns[8] || columns[2]) : columns[2];
    const word = wordForms(columns[0], columns[1]);
    const context = `${word[to]} ${to === 'traditional' ? columns[4] : columns[3]}`;
    const { text, problems } = convertNote(note, from, to, word, context, columns[1] ? null : columns[0]);
    if (problems.length > 0) {
      totals.listed += 1;
      listed.push({ file, line: number + 1, word: `${word.simplified} ${word.traditional}`, from, note, draft: text, problems });
      return line;
    }
    totals.converted += 1;
    columns[2] = from === 'simplified' ? note : text;
    columns[8] = from === 'traditional' ? note : text;
    return columns.join('\t');
  });
  if (!dry) fs.writeFileSync(path.join(notesDir, file), changed.join('\n'));
}

console.log(totals);
const kinds = {};
for (const item of listed) {
  for (const problem of item.problems) {
    const kind = problem.split(':')[0];
    kinds[kind] = (kinds[kind] || 0) + 1;
  }
}
console.log('problems by kind:', kinds);
if (!dry) {
  fs.mkdirSync(path.join(root, 'local/note-scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'local/note-scripts/listed.json'), JSON.stringify(listed, null, 1));
  console.log('listed in local/note-scripts/listed.json');
}
