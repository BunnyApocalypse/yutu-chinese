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

// Every part found in a character, written out as keyOf writes a change's
// side (爭, or ⿱？工), split as far as compare splits: the character itself,
// its parts, their parts, and so on, DEEPEST levels down.
export function occurrences(character, characters) {
  const found = new Set();
  function walk(part, depth) {
    found.add(written(part));
    if (depth >= DEEPEST) {
      return;
    }
    const tree = split(part, characters);
    if (typeof tree !== 'string') {
      tree.parts.forEach((child) => walk(child, depth + 1));
    }
  }
  walk(character, 0);
  return found;
}

// The name of a change, the same for every character it is found in.
export function keyOf(change) {
  return `${change.from}→${change.to}`;
}

// Changes a stroke apart that are learned all the same: the owner went
// through every key a stroke apart in CC-CEDICT on a review page (2026-11-09;
// first those of HSK 3.0 and TOCFL, then the rarer ones) and found these too
// different to read without learning. Many of the rarer ones are other
// characters altogether, variants the mainland dropped (俛 for 俯, 崑 for
// 昆), only a stroke apart by count. Every other key keeps its kind's rule.
const SMALL_BUT_LEARNED = new Set([
  '⺮→穴', '⺼→口', '㿽→益', '丁→一', '二→一', '亙→亘', '亻→纟', '兄→允', '免→府',
  '八→几', '冘→冗', '刂→乚', '卑→畀', '厶→口', '又→八', '口→丄', '口→忄', '句→勾',
  '夸→库', '完→官', '屯→木', '山→人', '山→日', '巛→亠', '巛→宀', '巾→冂', '广→厂',
  '彳→亻', '心→止', '忄→冫', '曳→世', '月→木', '殳→车', '民→氏', '氵→弓', '爿→土',
  '王→土', '王→玉', '皿→汤', '石→火', '礻→禾', '禾→木', '糹→至', '罒→血', '習→聂',
  '艹→丷', '袞→衮', '辥→薛', '郎→良', '阝→土', '阝→寸',
]);

// Whether a change has to be learned (on one word) before characters with it
// can be read: all but those a stroke apart, and some of those.
export function needsLearning(change) {
  return change.kind !== 'small' || SMALL_BUT_LEARNED.has(keyOf(change));
}

// The changes of many characters at once, as a Map from "繁简" (the two forms
// written together) to the list partChanges gives, except that a character
// which is itself a part changed in another (賣, a part of 讀) has that one
// change: it is where the key is first met. With `checks` (a Map from key
// to verdict, parsePartKeyChecks), each list is as `checked` gives it.
export function changesOfPairs(pairs, characters, checks = null) {
  const changes = new Map(pairs.map(([traditional, simplified]) => [
    traditional + simplified,
    checked(traditional, simplified, partChanges(traditional, simplified, characters), checks),
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
      changes.set(traditional + simplified, selfChange(traditional, simplified, checks));
    }
  }
  return changes;
}

// The one change of a character that is itself a part changed in another
// (賣 → 卖), checked like any other.
function selfChange(traditional, simplified, checks) {
  return checked(traditional, simplified, [{ from: traditional, to: simplified, kind: 'part' }], checks);
}

// The same for characters met as they come (the app's words, and the
// ready-made lists' characters for "also in"): add(pairs) takes them in,
// changesOf(traditional, simplified) gives a pair's changes, each worked
// out once. A character which is a part changed in any pair taken in so far
// has that one change, as in changesOfPairs, so take everything in first.
// `checks` as for changesOfPairs.
export function createChangeTable(characters, checks = null) {
  const known = new Map();
  const selves = new Map();
  const partKeys = new Set();
  const own = (traditional, simplified) => {
    const pair = traditional + simplified;
    if (!known.has(pair)) {
      known.set(pair, checked(traditional, simplified, partChanges(traditional, simplified, characters), checks));
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
      const pair = traditional + simplified;
      if (partKeys.has(`${traditional}→${simplified}`)) {
        if (!selves.has(pair)) {
          selves.set(pair, selfChange(traditional, simplified, checks));
        }
        return selves.get(pair);
      }
      return own(traditional, simplified);
    },
  };
}

// --- Checking part keys against the whole dictionary ----------------------
//
// A part change's card says the part "is written … in every character that
// has it". The owner found that untrue of 畫 → 画 (2026-11-20): 聿 → 一
// there, but 律 keeps 聿 and 筆 → 笔 makes it 毛. It goes wrong two ways:
//   - the two forms happen to split alike, so a character redrawn as a whole
//     looks like a part change (畫's 聿 → 一, 東's 木 → 七): such a key is
//     found in that one character only;
//   - the change is real but not everywhere (堇 → 又 in 漢 難 艱, but 勤
//     keeps 堇).
// checkPartKeys looks at every pair of a whole dictionary (CC-CEDICT's
// one-character entries, those written alike too; scripts/build-part-keys.js
// writes the result to data/script-keys/) and gives each key a verdict:
//   'once':       found in one character only: a change of that character
//                 alone (時's 寺 → 寸), or, if more of it changed, the
//                 character redrawn as a whole ("畫 is written 画"); see
//                 `checked`
//   'some':       found in several, but the part is kept in others (律) or
//                 changes another way (筆): the card says "in some
//                 characters"
//   'everywhere': wherever the part is, it changes this way (爭 → 争)
// Checked are the changes whose card makes the claim: `part`, and the
// `small` ones learned. A part inside a character that changes as a whole
// or by a bigger part (書 → 书) counts neither way.

const isClaimed = (change) => change.kind === 'part' || (change.kind === 'small' && needsLearning(change));

// pairs: [traditional, simplified], every character of a dictionary, those
// written alike as well. Returns a Map from key to
//   { verdict, found, kept, other }
// `found`: the pairs ("繁简") with the key; `kept`: those keeping the part
// (a character written alike, or "繁简"); `other`: those changing it another
// way ("筆笔→毛").
export function checkPartKeys(pairs, characters) {
  const changes = changesOfPairs(pairs, characters);
  const parts = new Map();
  const partsOf = (character) => {
    if (!parts.has(character)) {
      parts.set(character, occurrences(character, characters));
    }
    return parts.get(character);
  };
  const keys = new Map();
  const add = (change, pair) => {
    const key = keyOf(change);
    if (!keys.has(key)) {
      keys.set(key, { change, found: new Set() });
    }
    keys.get(key).found.add(pair);
  };
  for (const [traditional, simplified] of pairs) {
    for (const change of changes.get(traditional + simplified)) {
      if (isClaimed(change)) {
        add(change, traditional + simplified);
      }
    }
  }
  // A character that is itself a part changed in another (東, in 凍) has
  // that one change here, but in the app, before any character with it is
  // met, its own split (東's 木 → 七). Those keys get a verdict too, from
  // such characters alone.
  const keysFound = new Set(keys.keys());
  for (const [traditional, simplified] of pairs) {
    const [only] = changes.get(traditional + simplified);
    if (only?.from === traditional && only.to === simplified && only.kind === 'part') {
      for (const change of partChanges(traditional, simplified, characters)) {
        if (isClaimed(change) && !keysFound.has(keyOf(change))) {
          add(change, traditional + simplified);
        }
      }
    }
  }
  const result = new Map();
  for (const [key, { change, found }] of keys) {
    const kept = [];
    const other = [];
    for (const [traditional, simplified] of pairs) {
      const pair = traditional + simplified;
      if (found.has(pair) || !partsOf(traditional).has(change.from)) {
        continue;
      }
      if (traditional === simplified) {
        kept.push(traditional);
      } else if (partsOf(simplified).has(change.from)) {
        kept.push(pair);
      } else {
        const elsewhere = changes.get(pair).find((each) => each.from === change.from && each.to !== change.to);
        if (elsewhere) {
          other.push(`${pair}→${elsewhere.to}`);
        }
      }
    }
    const verdict = found.size === 1 ? 'once' : kept.length > 0 || other.length > 0 ? 'some' : 'everywhere';
    result.set(key, { verdict, found: [...found], kept, other });
  }
  return result;
}

// A Map from key to verdict, from the file scripts/build-part-keys.js
// writes (key, verdict, then counts and examples, tab-separated; "#" begins
// a comment).
export function parsePartKeyChecks(text) {
  const checks = new Map();
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }
    const [key, verdict] = line.split('\t');
    checks.set(key, verdict);
  }
  return checks;
}

// A pair's changes with the verdicts applied:
//   - a key found 'once' that is the character's only change, a radical
//     form on its side apart (時's 寺 → 寸, 線's 泉 → 戋), is kept with
//     `only: true`: a real change, of this character only, its card saying
//     so;
//   - any other key found 'once' (畫's 聿 → 一 beside 田 → 凵田: the whole
//     character was redrawn) is taken out, and the character changes as a
//     whole, that change first, before its others (a radical form, or a
//     part changed in other characters too, as 變's 䜌 → 亦);
//   - a claimed change not checked 'everywhere' gets `some: true`, its card
//     saying "in some characters"; so does a key the file lacks (a
//     character missing from the dictionary it was made from), unchecked.
// Without `checks`, the changes as they are.
export function checked(traditional, simplified, changes, checks) {
  if (!checks) {
    return changes;
  }
  const verdictOf = (change) => checks.get(keyOf(change)) ?? 'some';
  const once = changes.filter((change) => isClaimed(change) && verdictOf(change) === 'once');
  const notRadical = changes.filter((change) => change.kind !== 'radical');
  if (once.length === 1 && notRadical.length === 1) {
    return changes.map((change) => (change === once[0] ? { ...change, only: true } : change));
  }
  const rest = changes
    .filter((change) => !once.includes(change))
    .map((change) => (isClaimed(change) && verdictOf(change) !== 'everywhere' ? { ...change, some: true } : change));
  return once.length > 0 ? [{ from: traditional, to: simplified, kind: 'whole' }, ...rest] : rest;
}
