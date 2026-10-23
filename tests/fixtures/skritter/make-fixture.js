// Makes export.zip: a small, made-up Skritter export in the shape Skritter's
// support sends (README.md). Run from the repository's folder:
//   node tests/fixtures/skritter/make-fixture.js
// Needs the `zip` command.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ACCOUNT = '1';
const DAY = 86400;
const START = 1767240000; // 2026-01-01, the first session
const WEEK_LATER = START + 7 * DAY;

// A card ("item"). `vocab` is the word it belongs to, `idVocab` the word
// named in its own ID, which for a word studied in traditional may differ
// (Skritter numbers the traditional forms).
//
// Lists: '100' is the learner's own (VocabListInfo below), with its section
// '200'; '5000' is one of Skritter's, named nowhere in the file, with the
// sections '5001' and '5002'. Each item names its lists and sections.
const places = (vocabListIds, sectionIds) => ({ vocabListIds, sectionIds });
function item(idVocab, part, style, fields) {
  return {
    id: `${ACCOUNT}-${idVocab}-${part}`,
    base: idVocab.split('-')[1],
    lang: 'zh',
    part,
    style,
    vocabIds: [idVocab],
    vocabListIds: [],
    sectionIds: [],
    created: START - DAY,
    reviews: 0,
    successes: 0,
    last: 0,
    next: 0,
    interval: 0,
    ...fields,
  };
}

const schedule = (reviews, last, days, stability, difficulty) => ({
  reviews,
  successes: reviews - 1,
  last,
  next: last + days * DAY,
  interval: days * DAY,
  stability,
  difficulty,
});

const STUDY = places(['100', '5000'], ['200', '5001']); // 学习: in both lists
const GREETINGS = places(['5000'], ['5002']);
const items = [
  // 学习, studied in traditional (學習): all four cards, in both sessions.
  { ...item('zh-学习-0', 'rune', 'trad', schedule(2, WEEK_LATER + 10, 20, 20.5, 4.2)), ...STUDY, vocabIds: ['zh-学习-1'] },
  { ...item('zh-学习-0', 'rdng', 'trad', schedule(2, START + 50, 3, 3.1, 6.5)), ...STUDY, vocabIds: ['zh-学习-1'] },
  { ...item('zh-学习-0', 'tone', 'trad', schedule(1, WEEK_LATER + 20, 10, 10, 5)), ...STUDY, vocabIds: ['zh-学习-1'] },
  // Without Skritter's memory: the interval stands in for it.
  { ...item('zh-学习-0', 'defn', 'trad', { ...schedule(1, WEEK_LATER + 30, 15, 0, 0), stability: null, difficulty: null }), ...STUDY, vocabIds: ['zh-学习-1'] },
  // 你好, the same in both scripts: its meaning studied, its writing never.
  item('zh-你好-0', 'defn', 'both', { ...schedule(1, START + 100, 4, 4, 5), ...GREETINGS }),
  item('zh-你好-0', 'rune', 'both', GREETINGS),
  // 发: two traditional forms (發 fā, 髮 fà), which the file doesn't settle.
  { ...item('zh-发-0', 'rdng', 'trad', schedule(1, START + 150, 2, 2, 5)), ...places(['100'], ['200']), vocabIds: ['zh-发-1'] },
  // A word the dictionary doesn't have.
  item('zh-㐀-0', 'defn', 'both', schedule(1, START + 200, 1, 1, 5)),
  // 谢谢, written in simplified.
  item('zh-谢谢-0', 'rune', 'simp', { ...schedule(1, START + 250, 5, 5, 5), ...GREETINGS }),
];

const activity = (startedAt, seconds, spent, cards) => ({
  id: `${ACCOUNT}_zh_${startedAt * 1000}`,
  user: ACCOUNT,
  lang: 'zh',
  type: 'review',
  status: 'success',
  startedAt,
  finishedAt: startedAt + seconds,
  createdAt: startedAt + seconds,
  time: spent,
  cards,
});
const answer = (vocab, part, score) => ({ id: `${ACCOUNT}-${vocab}-${part}`, score });

const activities = [
  // Ten minutes open, five spent: the answers are spread over the five.
  activity(START, 600, 300, [
    answer('zh-学习-0', 'rune', 3),
    answer('zh-学习-0', 'rdng', 1),
    answer('zh-学习-0', 'rdng', 3),
    answer('zh-你好-0', 'defn', 3),
    answer('zh-发-0', 'rdng', 3),
    { id: `${ACCOUNT}-zh-你好-0-rune` }, // seen in a lesson, not graded
    answer('zh-㐀-0', 'defn', 2),
    answer('zh-谢谢-0', 'rune', 3),
  ]),
  activity(WEEK_LATER, 60, 60, [
    answer('zh-学习-0', 'rune', 3),
    answer('zh-学习-0', 'tone', 3),
    answer('zh-学习-0', 'defn', 4),
  ]),
];

const vocab = [
  { id: `${ACCOUNT}-zh-学习-1`, vocab: 'zh-学习-1', c_defn: 'to study (my own words)', banned: null, banned_parts: [] },
  { id: `${ACCOUNT}-zh-你好-0`, vocab: 'zh-你好-0', c_defn: '', banned: '2026-02-01T00:00:00.000Z', banned_parts: ['defn', 'rune'], unbanned: false },
];

const ownLists = [
  {
    id: '100',
    name: 'Textbook',
    creator: ACCOUNT,
    sections: [
      {
        id: '200',
        name: 'Section 1',
        rows: [
          { vocabId: 'zh-学习-0', tradVocabId: 'zh-学习-1', writing: '学习', writingTrad: '學習' },
          // Most rows repeat the simplified form as the traditional one.
          { vocabId: 'zh-发-0', tradVocabId: 'zh-发-1', writing: '发', writingTrad: '发' },
        ],
      },
    ],
  },
];

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'skritter-fixture-'));
const folder = path.join(work, `export-${ACCOUNT}_2026-10-22`);
fs.mkdirSync(folder);
const write = (name, records) =>
  fs.writeFileSync(path.join(folder, `export_${ACCOUNT}_${name}_2026-10-22.json`), JSON.stringify(records));
write('UserItem', items);
write('ProgressActivity', activities);
write('UserVocab', vocab);
write('VocabListInfo', ownLists);
write('UserSentence', []);
// What a Mac adds to a zip: a "._" file beside each, without the data.
fs.mkdirSync(path.join(work, '__MACOSX', path.basename(folder)), { recursive: true });
fs.writeFileSync(path.join(work, '__MACOSX', path.basename(folder), `._export_${ACCOUNT}_UserItem_2026-10-22.json`), 'not JSON');

const out = path.resolve('tests/fixtures/skritter/export.zip');
fs.rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', out, path.basename(folder), '__MACOSX'], { cwd: work });
fs.rmSync(work, { recursive: true });
console.log(`Wrote ${out}`);
