// Tests for the interface's text (src/text.js, src/text/): every key the
// app asks for is in the English file, every key there is used, and the
// lookup fills in gaps and plurals.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import en from '../src/text/en.js';
import { t, formatNumber } from '../src/text.js';
import { pseudoText } from '../src/text/pseudo.js';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const sources = readdirSync(new URL('src/', root))
  .filter((name) => name.endsWith('.js'))
  .map((name) => read(`src/${name}`))
  // Comments left out: they quote keys as examples.
  .map((source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));
const page = read('index.html');

// Keys asked for by t('…') in the code, and by data-t… in the page.
const askedInCode = sources.flatMap((source) => [...source.matchAll(/\bt\(\s*'([^']+)'/g)].map((match) => match[1]));
const askedInPage = [...page.matchAll(/data-t(?:-[a-z-]+)?="([^"]+)"/g)].map((match) => match[1]);
// Any quoted text in the code that looks like a key counts as used: a key
// may be kept in a list and looked up later (t(CARD_NAMES[type])).
const quotedInCode = new Set(
  sources.flatMap((source) => [...source.matchAll(/'([a-z][A-Za-z]*\.[A-Za-z0-9.]+)'/g)].map((match) => match[1])),
);

test('every key the app asks for is in the English text', () => {
  const missing = [...new Set([...askedInCode, ...askedInPage])].filter((key) => !(key in en));
  assert.deepEqual(missing, []);
});

test('every key in the English text is used', () => {
  const pageKeys = new Set(askedInPage);
  const unused = Object.keys(en).filter((key) => !pageKeys.has(key) && !quotedInCode.has(key));
  assert.deepEqual(unused, []);
});

test('a text with forms for numbers always has the form "other"', () => {
  const lacking = Object.entries(en).filter(([, value]) => typeof value === 'object' && !('other' in value));
  assert.deepEqual(lacking.map(([key]) => key), []);
});

test('text put in with data-t has no markup (data-t-html is for that)', () => {
  const plainKeys = [...page.matchAll(/data-t="([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(plainKeys.filter((key) => /<[a-z]/.test(en[key])), []);
});

// The parts of the page moved over to data-t… so far (docs/interface.md,
// "Interface text and translations"); once all are, the whole page is checked.
const MOVED_OVER = [
  'settings-panel',
  'side-menu',
  'import-dialog',
  'storage-message',
  'review-header',
  'word-form',
  'done-panel',
  'study-area',
  'words-panel',
  'word-dialog',
  'error-banner',
  'error-dialog',
  'credits-dialog',
  'whats-new-dialog',
  'streak-dialog',
  'feedback-dialog',
  'deck-dialog',
];

test('nothing in the parts moved over is written straight into the page', () => {
  // Text between tags (not in comments, scripts or pictures) with an English
  // word in it. Chinese, symbols and numbers alone are fine.
  const visible = page.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, '');
  const written = MOVED_OVER.flatMap((id) => {
    const start = visible.lastIndexOf('<', visible.indexOf(`id="${id}"`));
    const name = visible.slice(start + 1).match(/^[a-z]+/)[0];
    // To the tag that closes this one, past any of the same kind inside it.
    const tags = new RegExp(`<(/?)${name}\\b`, 'g');
    tags.lastIndex = start + 1;
    let depth = 1;
    let end = start;
    while (depth > 0) {
      const match = tags.exec(visible);
      depth += match[1] ? -1 : 1;
      end = match.index;
    }
    const part = visible.slice(start, end);
    return [...part.matchAll(/>([^<]*)</g)].map((match) => match[1].trim()).filter((text) => /[A-Za-z]{2,}/.test(text));
  });
  assert.deepEqual(written, []);
});

test('gaps are filled in, and numbers written as the language writes them', () => {
  assert.equal(t('testing.askedJustNow', { answer: 'yes' }), 'Asked just now: the browser said yes.');
  assert.equal(t('testing.words', { count: 1234 }), 'Words here: 1,234.');
  assert.equal(formatNumber(1234), '1,234');
});

test('the test language keeps gaps, markup and Chinese, and is longer', () => {
  const text = pseudoText('Like <b>{word}</b> and 學, at&nbsp;once');
  assert.match(text, /^\[Ļîķé <b>\{word\}<\/b> áñð 學, áţ&nbsp;öñçé ·+\]$/);
  assert.equal(pseudoText('3/7'), '3/7');
});
