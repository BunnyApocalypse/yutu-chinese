// Which parts change between a character's traditional and simplified forms,
// for the setting "Also read simplified" (docs/cards.md, "Reading the other
// script"). Plain calculation, no page.
//
// The idea (the owner, 2026-11-09): most simplified characters differ from
// their traditional form by a part that changes the same way in many
// characters. 爭 → 争 turns 淨 into 净, 靜 into 静 and 掙 into 挣; 門 → 门
// turns 問 into 问. Learning that change once, on one word, makes the others
// readable, so each change is a "key", and only the first word with a key
// needs cards. A part only a stroke or two apart (兌 → 兑 in 說 → 说) needs
// no learning at all.
//
// How characters are built comes from Make Me a Hanzi's dictionary
// (data/makemeahanzi/, read with parseCharacters in characters.js): each
// character's decomposition, an "ideographic description sequence" such as
// ⿰言司 for 詞 (⿰: side by side), and its strokes (`matches` has one entry
// a stroke).

// Radical forms: a part that has its own shape on the side of a simplified
// character. The keys of the most common kind, each taught once.
export const RADICAL_FORMS = {
  言: '讠', 訁: '讠', 金: '钅', 釒: '钅', 食: '饣', 飠: '饣', 糸: '纟', 糹: '纟',
  門: '门', 貝: '贝', 見: '见', 車: '车', 馬: '马', 鳥: '鸟', 魚: '鱼', 頁: '页',
  風: '风', 韋: '韦', 齒: '齿', 麥: '麦', 龍: '龙',
};

// A part whose stroke count differs by this much or less, with nothing else
// to tell them apart in the dictionary, counts as readable without learning.
// One, not two: the owner marked 爭 → 争 (two strokes) as something to learn.
const SMALL_STROKE_DIFFERENCE = 1;

// How deep into a character's parts to look; deeper parts are a stroke or
// two and say nothing a learner would notice.
const DEEPEST = 4;

const ARRANGEMENT = /[⿰-⿻]/u;

// Reads a decomposition into a tree: a character, or
// { arrangement, parts: [...] }. ⿲ and ⿳ (three in a row) take three parts,
// the others two.
function parse(sequence) {
  const signs = [...sequence];
  let next = 0;
  function read() {
    const sign = signs[next++];
    if (!ARRANGEMENT.test(sign)) {
      return sign;
    }
    const count = sign === '⿲' || sign === '⿳' ? 3 : 2;
    const parts = [];
    for (let i = 0; i < count; i++) {
      parts.push(read());
    }
    return { arrangement: sign, parts };
  }
  return read();
}

// A part's own decomposition, or the part itself if it has none (a single
// character, one the dictionary lacks, or ？).
function split(part, characters) {
  if (typeof part !== 'string') {
    return part;
  }
  const decomposition = characters.get(part)?.decomposition;
  return decomposition && ARRANGEMENT.test(decomposition[0]) ? parse(decomposition) : part;
}

// Whether a tree has a part with no character of its own (？) in it: the
// dictionary doesn't know that part, so it can't be compared further.
function hasUnknown(part) {
  return typeof part === 'string' ? part === '？' : part.parts.some(hasUnknown);
}

// A part written out: the character itself, or its sequence (⿱？工).
function written(part) {
  return typeof part === 'string' ? part : part.arrangement + part.parts.map(written).join('');
}

function strokes(part, characters) {
  return typeof part === 'string' ? (characters.get(part)?.matches?.length ?? null) : null;
}

// The changes between a traditional character and its simplified form, as a
// list of { from, to, kind }:
//   kind 'radical': a radical form (from 門 to 门)
//   kind 'part':    another part (爭 to 争, 賣 to 卖); `to` may be a written
//                   sequence such as ⿱？工 when the part has no character
//   kind 'small':   a part a stroke or two apart (兌 to 兑), readable as is
//   kind 'whole':   the character as a whole (為 to 为, 夠 to 够), when the
//                   two are not built alike
// An empty list for a character written the same in both.
export function partChanges(traditional, simplified, characters) {
  return compare(traditional, simplified, characters, 0);
}

function compare(from, to, characters, depth) {
  if (from === to) {
    return [];
  }
  if (typeof from === 'string' && RADICAL_FORMS[from] === to) {
    return [{ from, to, kind: 'radical' }];
  }
  // Inside a character, a part that is a character of its own on both sides
  // is the change itself (爭 to 争 in 淨), not split further: that is what
  // is learned once and seen again in other characters.
  const bothCharacters = depth > 0 && isCharacter(from) && isCharacter(to);
  if (!bothCharacters && depth < DEEPEST) {
    const fromTree = split(from, characters);
    const toTree = split(to, characters);
    if (
      typeof fromTree !== 'string' &&
      typeof toTree !== 'string' &&
      fromTree.arrangement === toTree.arrangement &&
      fromTree.parts.length === toTree.parts.length &&
      !hasUnknown(fromTree) &&
      !hasUnknown(toTree) &&
      !swapped(fromTree, toTree)
    ) {
      const changes = fromTree.parts.flatMap((part, i) => compare(part, toTree.parts[i], characters, depth + 1));
      // Small changes that add up to a different look (東 to 东) are a
      // change of the whole.
      if (depth > 0 || !changes.every((change) => change.kind === 'small') || closeInStrokes(from, to, characters)) {
        return changes;
      }
    }
  }
  if (depth === 0) {
    return [{ from, to, kind: 'whole' }];
  }
  const kind = closeInStrokes(from, to, characters) ? 'small' : 'part';
  return [{ from: written(from), to: written(to), kind }];
}

function isCharacter(part) {
  return typeof part === 'string' && part !== '？';
}

function closeInStrokes(from, to, characters) {
  const fromStrokes = strokes(from, characters);
  const toStrokes = strokes(to, characters);
  return fromStrokes !== null && toStrokes !== null && Math.abs(fromStrokes - toStrokes) <= SMALL_STROKE_DIFFERENCE;
}

// Whether the two have the same two parts the other way round (夠 and 够):
// a different look, though no part changed.
function swapped(fromTree, toTree) {
  const [a, b] = fromTree.parts;
  const [c, d] = toTree.parts;
  return fromTree.parts.length === 2 && a !== b && written(a) === written(d) && written(b) === written(c);
}

// The name of a change, the same for every character it is found in.
export function keyOf(change) {
  return `${change.from}→${change.to}`;
}

// Changes a stroke apart that are learned all the same: the owner went
// through every key of HSK 3.0 and TOCFL and found these too different to
// read without learning (2026-11-09). Every other key keeps its kind's rule.
const SMALL_BUT_LEARNED = new Set([
  '⺮→穴', '⺼→口', '丁→一', '亙→亘', '冘→冗', '卑→畀', '厶→口', '又→八', '句→勾',
  '巛→亠', '巛→宀', '巾→冂', '广→厂', '彳→亻', '心→止', '曳→世', '月→木', '爿→土',
  '王→土', '皿→汤', '石→火', '礻→禾', '禾→木', '糹→至', '艹→丷', '袞→衮',
]);

// Whether a change has to be learned (on one word) before characters with it
// can be read: all but those a stroke apart, and some of those.
export function needsLearning(change) {
  return change.kind !== 'small' || SMALL_BUT_LEARNED.has(keyOf(change));
}

// The changes of many characters at once, as a Map from "繁简" (the two forms
// written together) to the list partChanges gives, except that a character
// which is itself a part changed in another (賣, a part of 讀) has that one
// change: it is where the key is first met.
export function changesOfPairs(pairs, characters) {
  const changes = new Map(pairs.map(([traditional, simplified]) => [
    traditional + simplified,
    partChanges(traditional, simplified, characters),
  ]));
  const partKeys = new Set();
  for (const list of changes.values()) {
    for (const change of list) {
      if (change.kind === 'part') {
        partKeys.add(keyOf(change));
      }
    }
  }
  for (const [traditional, simplified] of pairs) {
    if (partKeys.has(`${traditional}→${simplified}`)) {
      changes.set(traditional + simplified, [{ from: traditional, to: simplified, kind: 'part' }]);
    }
  }
  return changes;
}

// The same for characters met as they come (the app's words, and the
// ready-made lists' characters for "also in"): add(pairs) takes them in,
// changesOf(traditional, simplified) gives a pair's changes, each worked
// out once. A character which is a part changed in any pair taken in so far
// has that one change, as in changesOfPairs, so take everything in first.
export function createChangeTable(characters) {
  const known = new Map();
  const partKeys = new Set();
  const own = (traditional, simplified) => {
    const pair = traditional + simplified;
    if (!known.has(pair)) {
      known.set(pair, partChanges(traditional, simplified, characters));
    }
    return known.get(pair);
  };
  return {
    add(pairs) {
      for (const [traditional, simplified] of pairs) {
        for (const change of own(traditional, simplified)) {
          if (change.kind === 'part') {
            partKeys.add(keyOf(change));
          }
        }
      }
    },
    changesOf(traditional, simplified) {
      if (partKeys.has(`${traditional}→${simplified}`)) {
        return [{ from: traditional, to: simplified, kind: 'part' }];
      }
      return own(traditional, simplified);
    },
  };
}
