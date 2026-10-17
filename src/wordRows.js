// How a word or a dictionary entry is shown as a row: its characters in the
// scripts being learned, each marked as Chinese, its pinyin, its meaning.
// For the list of words, the add form's suggestions and the Words tab's
// dictionary. Moved here from wordsPanel.js on 2026-10-17, when it was
// split by screen.

import { formatPinyin } from './wordList.js';
import { langFor, fillMixed } from './lang.js';
import { scriptsShown } from './words.js';

// How much of an entry's list of meanings is shown.
const MAX_MEANINGS_LENGTH = 140;

// A span of text that may have Chinese in it (a meaning such as "classifier
// for 門"), its Chinese marked as Chinese in `script` (lang.js).
export function mixedSpan(className, text, script) {
  const element = document.createElement('span');
  element.className = className;
  fillMixed(element, text, script);
  return element;
}

// The same as a span for a row of a list, each script's part marked with
// its language (lang.js), so that a screen reader reads it as Chinese.
export function charactersElement(word, settings) {
  const element = document.createElement('span');
  element.className = 'entry-characters';
  const parts = scriptsShown(word, settings).map((script) => {
    const part = document.createElement('span');
    part.lang = langFor(script);
    part.textContent = word[script];
    return part;
  });
  element.append(...parts.flatMap((part, index) => (index > 0 ? [' · ', part] : [part])));
  return element;
}

// A dictionary entry as a button (a row of the add form's suggestions or
// of the Words tab's dictionary); `label` is what its right-hand end says
// (nothing if null). `selected` marks it as the one filled in; `onTap` is
// what a tap does.
export function entryRow(entry, label, settings, { selected = false, onTap }) {
  const span = (className, text) => {
    const element = document.createElement('span');
    element.className = className;
    element.textContent = text;
    return element;
  };
  const meanings = entry.meanings.join(' / ');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-entry';
  button.append(
    charactersElement(entry, settings),
    span('entry-pinyin', formatPinyin(entry.pinyin)),
    mixedSpan(
      'entry-definition',
      meanings.length > MAX_MEANINGS_LENGTH ? `${meanings.slice(0, MAX_MEANINGS_LENGTH)}…` : meanings,
      settings.script,
    ),
    ...(label ? [span('entry-new', label)] : []),
  );
  button.classList.toggle('selected', selected);
  button.addEventListener('click', onTap);
  return button;
}
