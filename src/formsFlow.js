// What is on the card at each step of learning a word's forms in the other
// script (Learn, on "简体字 forms"; docs/cards.md, "Reading the other
// script"), and the list at the end of the sitting. Builds the elements
// only; review.js runs the steps.
//
//   changed:   the word in the other script, its own form under it, its
//              reading and meaning; then each change it teaches (爭 → 争)
//              with a line on it
//   elsewhere: for each change, the learner's other words with it, then
//              other characters with it (from the ready-made lists)
//   read:      the word alone in the other script, to read; then its
//              reading and meaning
//
// `view`: { own, other }, the script the cards are in and the other one.
// `table`: the change table (scriptKeys.js), for which pair of the word a
// change is in.

import { t } from './text.js';
import { langFor, fillMixed } from './lang.js';
import { keyOf } from './scriptKeys.js';
import { differingPairs } from './otherScript.js';

export const FORMS_STEPS = ['changed', 'elsewhere', 'read'];

const isCharacter = (text) => [...text].length === 1;

// "in simplified", "in traditional", within a sentence.
const IN_SCRIPT = { simplified: 'learnForms.inSimplified', traditional: 'learnForms.inTraditional' };
// The line on a change, by its kind (scriptKeys.js). A change a stroke
// apart is only taught when the owner's list says so; it reads as a part.
const EXPLAIN = {
  radical: 'learnForms.explainRadical',
  part: 'learnForms.explainPart',
  small: 'learnForms.explainPart',
  whole: 'learnForms.explainWhole',
};

function element(tag, className, text = '') {
  const made = document.createElement(tag);
  made.className = className;
  made.textContent = text;
  return made;
}

function chinese(text, script, className = '') {
  const made = element('span', className, text);
  made.lang = langFor(script);
  return made;
}

// The same, its words to be tapped for their reading and meaning, as in a
// learning note, where `tappable` is given (tappableText in wordPage.js).
function tappableChinese(text, script, tappable) {
  const made = chinese(text, script);
  tappable?.(made, text, script);
  return made;
}

// The two sides of a change as shown: in the cards' script first, the other
// script after. A part with no character of its own (the right of 經) is
// shown by the characters it is in, `inside` then true.
export function changeShown(change, word, table, view) {
  const pair = differingPairs(word).find(([t, s]) =>
    table.changesOf(t, s).some((each) => keyOf(each) === keyOf(change)),
  ) ?? [change.from, change.to];
  const inside = !isCharacter(change.from) || !isCharacter(change.to);
  const traditional = isCharacter(change.from) ? change.from : pair[0];
  const simplified = isCharacter(change.to) ? change.to : pair[1];
  const [before, after] = view.other === 'simplified' ? [traditional, simplified] : [simplified, traditional];
  return { before, after, inside };
}

// "爭 → 争", larger, in the accent color.
function changeLine({ before, after }, view, tappable) {
  const line = element('p', 'forms-change');
  line.append(
    tappableChinese(before, view.own, tappable),
    element('span', 'forms-arrow', '→'),
    tappableChinese(after, view.other, tappable),
  );
  return line;
}

// A pair of characters or words, "問 → 问", its words to be tapped.
function pairShown([traditional, simplified], view, tappable) {
  const [before, after] = view.other === 'simplified' ? [traditional, simplified] : [simplified, traditional];
  const shown = element('span', 'forms-pair');
  shown.append(
    tappableChinese(before, view.own, tappable),
    element('span', 'forms-arrow', '→'),
    tappableChinese(after, view.other, tappable),
  );
  return shown;
}

// A text with {before} and {after} in it, each put in as Chinese in its own
// script; the rest of the text is filled as usual (fillMixed).
function fillChange(target, key, shown, view, values = {}) {
  const BEFORE = '\u0001';
  const AFTER = '\u0002';
  const text = t(key, { ...values, before: BEFORE, after: AFTER, inScript: t(IN_SCRIPT[view.other]) });
  for (const part of text.split(/(\u0001|\u0002)/)) {
    if (part === BEFORE) {
      target.append(chinese(shown.before, view.own));
    } else if (part === AFTER) {
      target.append(chinese(shown.after, view.other));
    } else if (part !== '') {
      const plain = document.createElement('span');
      fillMixed(plain, part, view.other);
      target.append(...plain.childNodes);
    }
  }
}

// The line saying what a change is.
function explanation(change, shown, view) {
  const line = element('p', 'face-tip-text');
  const key = shown.inside ? 'learnForms.explainInside' : EXPLAIN[change.kind];
  fillChange(line, key, shown, view);
  return line;
}

// Step 1: the word, and what changed.
// reading(element): fills an element with the word's reading (review.js)
export function changedFace(item, { table, view, reading }) {
  const { word } = item;
  const characters = element('p', 'face-word', word[view.other]);
  characters.lang = langFor(view.other);
  const own = element('p', 'face-hint');
  fillChange(own, 'learnForms.ownForm', { before: word[view.own], after: '' }, view, {
    inOwnScript: t(IN_SCRIPT[view.own]),
  });
  const pinyin = element('p', 'face-pinyin');
  reading(pinyin);
  const tip = element('div', 'face-tip');
  if (item.keys.length === 0) {
    tip.append(element('p', 'face-tip-text', t('learnForms.nothingNew')));
  }
  for (const change of item.keys) {
    const shown = changeShown(change, word, table, view);
    tip.append(changeLine(shown, view), explanation(change, shown, view));
  }
  return [characters, own, pinyin, element('p', 'face-meaning', word.definition), tip];
}

// How many of the learner's words, and of other characters, step 2 shows
// for each change: the card is no bigger than the writing area.
const WORDS_SHOWN = 3;
const CHARACTERS_SHOWN = 4;
// Changes shown in step 2; a word with more is rare.
const CHANGES_SHOWN = 2;

// Step 2: where else each change is. Null when there is nothing to show
// (no change, or none found anywhere else): the step is then left out.
// elsewhere(change): { words, characters } (whereElse in otherScript.js)
// gloss(element, word): fills an element with a word's reading and meaning
// tappable(element, text, script): makes the words in it tappable
export function elsewhereFace(item, { table, view, elsewhere, gloss, tappable }) {
  const parts = [];
  for (const change of item.keys.slice(0, CHANGES_SHOWN)) {
    const found = elsewhere(change);
    if (found.words.length === 0 && found.characters.length === 0) {
      continue;
    }
    parts.push(changeLine(changeShown(change, item.word, table, view), view, tappable));
    if (found.words.length > 0) {
      parts.push(element('p', 'forms-label', t('learnForms.inYourWords')));
      const rows = element('div', 'forms-rows');
      for (const word of found.words.slice(0, WORDS_SHOWN)) {
        const row = element('div', 'forms-row');
        const han = element('span', 'forms-han');
        han.append(pairShown([word.traditional, word.simplified], view, tappable));
        const about = element('span', 'forms-gloss');
        gloss(about, word);
        row.append(han, about);
        rows.append(row);
      }
      parts.push(rows);
    }
    if (found.characters.length > 0) {
      parts.push(element('p', 'forms-label', t('learnForms.alsoIn')));
      const more = element('p', 'forms-more');
      for (const pair of found.characters.slice(0, CHARACTERS_SHOWN)) {
        more.append(pairShown(pair, view, tappable));
      }
      parts.push(more);
    }
  }
  return parts.length > 0 ? parts : null;
}

// On the word's page, the fold-out with its forms (the owner, 2026-11-09: to
// see the cards of Learn again): the word in the other script, then for each
// change its line and what it is (as step 1), and where else it is (as step
// 2). Null for a word with no change to show.
// changes: the word's changes to learn (changesOfWord, needsLearning)
export function pageForms(word, changes, context) {
  const { table, view, tappable } = context;
  if (changes.length === 0) {
    return null;
  }
  const form = element('p', 'forms-word');
  form.append(chinese(word[view.other], view.other, 'forms-word-han'), ' ', t(IN_SCRIPT[view.other]));
  const parts = [form];
  for (const change of changes) {
    const shown = changeShown(change, word, table, view);
    const [line, ...elsewhere] = elsewhereFace({ word, keys: [change] }, context) ?? [changeLine(shown, view, tappable)];
    parts.push(line, explanation(change, shown, view), ...elsewhere);
  }
  return parts;
}

// Step 3: the word to read; once shown, its reading and meaning.
export function readFace(word, shown, { view, reading }) {
  const characters = document.createElement('p');
  characters.className = 'face-word';
  characters.append(chinese(word[view.other], view.other));
  if (!shown) {
    return [characters, element('p', 'face-hint', t('learnForms.canYouRead'))];
  }
  const pinyin = element('p', 'face-pinyin');
  reading(pinyin);
  return [characters, pinyin, element('p', 'face-meaning', word.definition)];
}

// The list at the end of the sitting: each word in the other script, its
// reading, and the changes it taught. open(word): its page.
export function summaryList(items, { table, view, reading, open }) {
  const list = element('ul', 'learned-list');
  for (const item of items) {
    const button = element('button', 'learned-word');
    button.type = 'button';
    const characters = chinese(item.word[view.other], view.other, 'learned-characters');
    const pinyin = element('span', 'learned-reading');
    reading(pinyin, item.word);
    const changes = element('span', 'learned-meaning');
    item.keys.forEach((change, index) => {
      const { before, after } = changeShown(change, item.word, table, view);
      if (index > 0) {
        changes.append('  ');
      }
      changes.append(chinese(before, view.own), ' → ', chinese(after, view.other));
    });
    button.append(characters, pinyin, changes);
    button.addEventListener('click', () => open(item.word));
    const row = document.createElement('li');
    row.append(button);
    list.append(row);
  }
  return list;
}

// Under the answer of a card in the other script in Review, in place of the
// word's learning note (the owner, 2026-11-09: the forms are what such a card
// is about): its changes, and where else each is, as step 2 has them but
// shorter, the words as pairs only; then "About this word". Null for a word
// with no change to show (it then has its note).
// changes: the word's changes to learn (changesOfWord, needsLearning)
// onMore(): opens the word's page
export function answerTip(word, changes, { table, view, elsewhere, tappable }, onMore) {
  const tip = element('div', 'face-tip forms-tip');
  for (const change of changes.slice(0, CHANGES_SHOWN)) {
    tip.append(changeLine(changeShown(change, word, table, view), view, tappable));
    const found = elsewhere(change);
    const pairs = [
      ...found.words.slice(0, WORDS_SHOWN).map((other) => [other.traditional, other.simplified]),
      ...found.characters.slice(0, CHARACTERS_SHOWN),
    ];
    if (pairs.length > 0) {
      const more = element('p', 'forms-more');
      more.append(element('span', 'forms-label', t('learnForms.alsoIn')), ...pairs.map((each) => pairShown(each, view, tappable)));
      tip.append(more);
    }
  }
  if (tip.childElementCount === 0) {
    return null;
  }
  const about = element('button', 'link-button face-tip-more', t('tip.aboutThisWord'));
  about.type = 'button';
  // A tap on the card's face reveals or moves on; a tap on this must not.
  about.addEventListener('pointerup', (event) => event.stopPropagation());
  about.addEventListener('click', (event) => {
    event.stopPropagation();
    onMore();
  });
  tip.append(about);
  return tip;
}
