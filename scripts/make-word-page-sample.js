// Takes the app's own page for a word, as markup and styles, for the page
// about the app (site/index.html, "Words, taken apart"). Run by hand, after
// the word page or its styles change:
//
//   node scripts/make-word-page-sample.js
//
// It uses the browser tests' harness, so it needs Chromium and starts the
// app in a fresh profile, as scripts/ux-atlas.js does. It adds 姐姐 (the same
// in both scripts), opens its page, and writes two files:
//
//   site/word-page-sample.html   the page's markup, in the pop-up's own wrappers
//                                (put into site/index.html when it is built,
//                                vite.site.config.js)
//   site/word-page-sample.css    the style rules that markup uses, copied from
//                                the app's style sheet and put under
//                                .app-sample so they touch nothing else, with
//                                the app's named colors and sizes in the light
//                                and the dark look
//
// Both are made files: change the app, not them.

import fs from 'node:fs';

import { startApp, startBrowsers, reloadApp, type, waitUntil, openDeckPage } from '../tests/browser/harness.js';

const HTML_FILE = 'site/word-page-sample.html';
const CSS_FILE = 'site/word-page-sample.css';

// Runs in the page. Returns the markup and the style text.
const COLLECT = `(() => {
  const dialog = document.getElementById('word-page');
  const body = document.getElementById('word-page-body');
  const content = document.getElementById('word-page-content');
  const parts = [dialog, body, content, ...content.querySelectorAll('*')];

  // ---- The markup ----
  const copy = content.cloneNode(true);
  copy.querySelectorAll('.note:empty').forEach((empty) => empty.remove());
  // The first "AI" box starts open, as a learner who tapped it sees it.
  const firstBadge = copy.querySelector('.note-badge');
  const firstText = copy.querySelector('#' + firstBadge.getAttribute('aria-controls'));
  firstText.hidden = false;
  firstBadge.setAttribute('aria-expanded', 'true');

  // ---- The named colors and sizes ----
  const tokenNames = new Set();
  const visit = (rules, each) => {
    for (const rule of rules) {
      if (rule.cssRules && !rule.selectorText) visit(rule.cssRules, each);
      else if (rule.selectorText) each(rule);
    }
  };
  const sheet = [...document.styleSheets].find((s) => s.cssRules.length > 100);
  visit(sheet.cssRules, (rule) => {
    if (rule.selectorText.trim().startsWith(':root')) {
      for (const name of rule.style) if (name.startsWith('--')) tokenNames.add(name);
    }
  });
  const rootStyle = getComputedStyle(document.documentElement);
  const read = (look) => {
    document.documentElement.dataset.theme = look;
    return [...tokenNames].map((name) => '  ' + name + ': ' + rootStyle.getPropertyValue(name).trim() + ';').join('\\n');
  };
  const light = read('light');
  const dark = read('dark');
  const bodyStyle = getComputedStyle(document.body);
  const base = [
    '  font-family: ' + bodyStyle.fontFamily + ';',
    '  font-size: ' + bodyStyle.fontSize + ';',
    '  line-height: ' + bodyStyle.lineHeight + ';',
    '  color: var(--text);',
    '  text-align: start;',
  ].join('\\n');

  // ---- The rules this markup uses ----
  // A rule is kept if one of its selectors matches something in the
  // markup; what only shows on hover or focus, or as ::before, is looked for
  // without that part, but kept whole.
  const withoutStates = (selector) =>
    selector
      .replace(/::?(before|after|placeholder|marker|-webkit-[a-z-]+|-moz-[a-z-]+)/g, '')
      .replace(/:(hover|active|focus|focus-visible|focus-within|disabled|checked|visited|link)(\\([^)]*\\))?/g, '');
  const splitSelectors = (text) => {
    const found = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if ('(['.includes(text[i])) depth++;
      else if (')]'.includes(text[i])) depth--;
      else if (text[i] === ',' && depth === 0) {
        found.push(text.slice(start, i));
        start = i + 1;
      }
    }
    found.push(text.slice(start));
    return found.map((s) => s.trim()).filter(Boolean);
  };
  const used = (selector) => {
    if (/^(html|body|:root)\\b/.test(selector.trim())) return false;
    const looked = withoutStates(selector).trim();
    if (!looked) return false;
    try {
      return parts.some((part) => part.matches(looked));
    } catch {
      return false;
    }
  };
  const convert = (rules) => {
    const out = [];
    for (const rule of rules) {
      if (rule.selectorText) {
        const kept = splitSelectors(rule.selectorText).filter(used);
        if (kept.length > 0) {
          out.push(kept.map((s) => '.app-sample ' + s).join(',\\n') + ' { ' + rule.style.cssText + ' }');
        }
      } else if (rule.cssRules && rule.conditionText !== undefined) {
        const inner = convert(rule.cssRules);
        if (inner.length > 0) out.push('@media ' + rule.conditionText + ' {\\n' + inner.join('\\n') + '\\n}');
      }
    }
    return out;
  };
  const rules = convert(sheet.cssRules);
  document.documentElement.dataset.theme = 'light';

  return {
    html: copy.outerHTML,
    light,
    dark,
    base,
    rules: rules.join('\\n'),
  };
})()`;

const app = await startApp();
const browsers = await startBrowsers(app.url, 1);
try {
  await browsers.use(async (page) => {
    await reloadApp(page);
    await openDeckPage(page);
    await type(page, 'add-traditional', '姐姐');
    await type(page, 'add-simplified', '姐姐');
    await type(page, 'add-pinyin', 'jie3jie5');
    await type(page, 'add-definition', 'older sister');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.querySelectorAll('#word-list li').length === 1`, 'the word');
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(
      page,
      `document.getElementById('word-page').open && document.querySelector('#word-page-content .character-tip') && document.querySelector('#word-page-content .sentence-word')`,
      "the word's page, with its note and tip",
      15000,
    );
    const { html, light, dark, base, rules } = await page.evaluate(COLLECT);

    // The pop-up's own wrappers, so that the rules written for the page in
    // the app (.settings-panel .setting, #word-page .page-heading) still apply.
    const wrapped =
      '<div class="app-sample" lang="en">\n' +
      '  <div id="word-page" class="settings-panel word-page">\n' +
      '    <div id="word-page-body" class="word-page-body">\n' +
      html +
      '\n    </div>\n  </div>\n</div>\n';
    fs.writeFileSync(HTML_FILE, wrapped);

    const css =
      '/* Made by scripts/make-word-page-sample.js from the app\'s style sheet: change the app, not this. */\n' +
      `.app-sample {\n${light}\n${base}\n}\n` +
      `@media (prefers-color-scheme: dark) {\n.app-sample {\n${dark}\n}\n}\n` +
      rules +
      '\n';
    fs.writeFileSync(CSS_FILE, css);
    console.log(`${HTML_FILE} (${wrapped.length} characters), ${CSS_FILE} (${css.length} characters)`);
  });
} finally {
  browsers.close();
  await app.close();
}
