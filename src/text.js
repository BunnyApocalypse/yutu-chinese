// The interface's text, in the learner's language (docs/interface.md,
// "Interface text and translations").
//
// Every piece of English the app shows is in src/text/en.js, under a key
// such as 'settings.script'. The code asks for it by key:
//
//   t('settings.script')                 → "Script"
//   t('review.dueAt', { when })          → "Next card due at 3:15 PM"
//   t('words.count', { count: 3 })       → "3 words"
//
// A value in braces ({when}, {count}) is filled in from the second argument.
// A number put in this way is written the way the language writes numbers
// (1,234 in English, 1.234 in German). A text whose wording changes with a
// number is given as its forms, { one: '{count} word', other: '{count}
// words' }: the browser's Intl.PluralRules says which form a number takes in
// the language (English has two, Polish four, Chinese one). With
// { count, ordinal: true } the forms are for counting in order instead:
// English { one: '{count}st', two: '{count}nd', few: '{count}rd', other: '{count}th' }.
//
// The page's own text (index.html) is marked with attributes instead and
// filled in once at start-up by applyText():
//
//   <h3 data-t="settings.chinese"></h3>               its text
//   <p data-t-html="settings.scriptHint"></p>         text with links or <b> in it
//   <button data-t-aria-label="menu.open">…</button>  an attribute (also -title,
//                                                     -placeholder, -alt)
//
// Only English exists so far. The other "language" is for testing
// (Settings › For testing): every text turned into look-alike letters and made
// longer, as other languages often are, so that text the lookup missed stands
// out in plain English, and so that a screen can be checked for room. App
// makers call this pseudo-localization.

/* global __CHANNEL__ */
import en from './text/en.js';
import { pseudoText } from './text/pseudo.js';

const CHANNEL = typeof __CHANNEL__ === 'undefined' ? '' : __CHANNEL__;
// Kept in localStorage (the browser's small store of text per site), not the
// database: it must be known before anything is shown, and reading the
// database takes a moment. It belongs to the device, like the look. The
// test copy keeps its own (CLAUDE.md: anything kept per site).
const LANGUAGE_KEY = CHANNEL ? `language-${CHANNEL}` : 'language';

export const LANGUAGES = ['en', 'pseudo'];

function readLanguage() {
  try {
    const saved = globalThis.localStorage?.getItem(LANGUAGE_KEY);
    return LANGUAGES.includes(saved) ? saved : 'en';
  } catch {
    // localStorage can be refused (a private window in some browsers).
    return 'en';
  }
}

// The language in use for this visit. Changing it reloads the page
// (setLanguage), so it never changes while the app runs.
export const language = readLanguage();

// The language's tag for the browser's Intl functions and the page's `lang`.
// The test language is English underneath.
export const locale = { en: 'en-US', pseudo: 'en-US' }[language];

const strings = language === 'pseudo' ? pseudoStrings(en) : en;
const pluralRules = new Intl.PluralRules(locale);
const ordinalRules = new Intl.PluralRules(locale, { type: 'ordinal' });
const numberFormat = new Intl.NumberFormat(locale);

function pseudoStrings(english) {
  const result = {};
  for (const [key, value] of Object.entries(english)) {
    result[key] =
      typeof value === 'string'
        ? pseudoText(value)
        : Object.fromEntries(Object.entries(value).map(([form, text]) => [form, pseudoText(text)]));
  }
  return result;
}

// The text under `key`, with {name} filled in from `values`. A key missing
// from the language falls back to English; a key missing from English too is
// a mistake, shown as the key itself (and tests/text.test.js catches it).
export function t(key, values = {}) {
  let text = strings[key] ?? en[key];
  if (text === undefined) {
    console.warn(`No text for "${key}"`);
    return key;
  }
  if (typeof text === 'object') {
    const rules = values.ordinal ? ordinalRules : pluralRules;
    text = text[rules.select(values.count ?? 0)] ?? text.other;
  }
  return text.replace(/\{(\w+)\}/g, (whole, name) => {
    if (!(name in values)) {
      return whole;
    }
    const value = values[name];
    return typeof value === 'number' ? numberFormat.format(value) : String(value);
  });
}

// A number as the language writes it (1,234).
export function formatNumber(number) {
  return numberFormat.format(number);
}

// A date (or time) as the language writes it; `options` as for the
// browser's toLocaleDateString, such as { month: 'short', day: 'numeric' }.
export function formatDate(date, options) {
  return new Date(date).toLocaleDateString(locale, options);
}

export function formatDateTime(date, options) {
  return new Date(date).toLocaleString(locale, options);
}

// Items in a plain series, "a, b, c" (in Chinese it would be "a、b、c").
export function formatList(items) {
  return items.join(t('list.separator'));
}

// Fills in the page's own text from its data-t… attributes (see the top of
// this file), under `root` (the whole page at start-up).
const ATTRIBUTES = ['title', 'aria-label', 'placeholder', 'alt'];

export function applyText(root = document) {
  for (const element of root.querySelectorAll('[data-t]')) {
    element.textContent = t(element.dataset.t);
  }
  for (const element of root.querySelectorAll('[data-t-html]')) {
    // The text comes from the app's own files, never from what someone
    // typed, so it may hold markup (links, <b>, <br>, Chinese marked with lang).
    element.innerHTML = t(element.dataset.tHtml);
  }
  for (const attribute of ATTRIBUTES) {
    for (const element of root.querySelectorAll(`[data-t-${attribute}]`)) {
      element.setAttribute(attribute, t(element.getAttribute(`data-t-${attribute}`)));
    }
  }
  if (root === document) {
    document.documentElement.lang = locale.split('-')[0];
  }
}

// Switches the language and starts the app again in it.
export function setLanguage(newLanguage) {
  try {
    if (newLanguage === 'en') {
      localStorage.removeItem(LANGUAGE_KEY);
    } else {
      localStorage.setItem(LANGUAGE_KEY, newLanguage);
    }
  } catch {
    return;
  }
  location.reload();
}
