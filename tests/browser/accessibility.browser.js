// Accessibility: goes through the app's screens in the light and the dark
// look, and checks on each what can be measured (the review of 2026-10-15,
// docs/interface.md, "Accessibility"):
// - text stands out from what is behind it: a contrast of at least 4.5 to 1,
//   or 3 to 1 for large text (the WCAG guidelines, level AA);
// - the edge of a text box or drop-down list stands out at 3 to 1;
// - everything that can be tapped is at least 24px by 24px (WCAG 2.2, AA);
// - everything that can be tapped has a name a screen reader can say;
// - Chinese text is marked as Chinese (lang.js), or a screen reader reads
//   it with an English voice; zhuyin too, with readings shown in it (the
//   last test).
// Not checked here: what a screen reader actually says, and the order Tab
// goes through things. Those need a person.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, waitUntil, addTestWords, openLearn, openDeckPage, reloadApp, ANSWER_YES, useAddForm, openSettings } from './harness.js';

// Runs in the page; returns a list of what fails, one line each.
const CHECK = `(() => {
  // A color as computed by the browser ("rgb(1, 2, 3)" or "rgba(...)").
  const parse = (color) => {
    const numbers = color.match(/[\\d.]+/g).map(Number);
    return { r: numbers[0], g: numbers[1], b: numbers[2], a: numbers.length > 3 ? numbers[3] : 1 };
  };
  // A see-through color laid over a solid one.
  const over = (top, under) => ({
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
  });
  // The guidelines' formula for how light a color looks, and the contrast
  // between two colors from it.
  const luminance = ({ r, g, b }) => {
    const channel = (value) => {
      value /= 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const contrast = (one, two) => {
    const [light, dark] = [luminance(one), luminance(two)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  };
  // What is behind an element: the backgrounds of it and the elements it is
  // in, up to the first solid one.
  const backgroundOf = (element) => {
    const layers = [];
    for (let at = element; at; at = at.parentElement) {
      const color = parse(getComputedStyle(at).backgroundColor);
      if (color.a > 0) {
        layers.push(color);
        if (color.a === 1) break;
      }
    }
    return layers.reverse().reduce((under, top) => over(top, under), { r: 255, g: 255, b: 255, a: 1 });
  };
  const opacityOf = (element) => {
    let opacity = 1;
    for (let at = element; at; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
    return opacity;
  };
  const shown = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && opacityOf(element) > 0;
  };
  const describe = (element) => {
    let text = element.tagName.toLowerCase() + (element.id ? '#' + element.id : '');
    if (!element.id && typeof element.className === 'string' && element.className.trim()) {
      text += '.' + element.className.trim().split(/\\s+/).join('.');
    }
    const words = (element.innerText || element.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ');
    return text + (words ? ' "' + words.slice(0, 30) + '"' : '');
  };
  const failures = [];

  for (const element of document.querySelectorAll('body *')) {
    if (!shown(element) || element.closest('svg, option, textarea')) continue;
    const ownText = [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('');
    if (ownText.trim() === '') continue;
    const style = getComputedStyle(element);
    // Contrast. (Something switched off need not stand out: the guidelines
    // leave it out.)
    if (!element.closest(':disabled')) {
      const background = backgroundOf(element);
      const color = parse(style.color);
      const text = over({ ...color, a: color.a * opacityOf(element) }, background);
      const size = parseFloat(style.fontSize);
      const large = size >= 24 || (Number(style.fontWeight) >= 700 && size >= 18.66);
      const ratio = contrast(text, background);
      if (ratio < (large ? 3 : 4.5)) {
        failures.push('text contrast ' + ratio.toFixed(2) + ': ' + describe(element));
      }
    }
    // Chinese marked as Chinese, zhuyin too (readingStyle.js).
    if (/[\\p{Script=Han}\\p{Script=Bopomofo}]/u.test(ownText) && !element.closest('[lang]').lang.startsWith('zh')) {
      failures.push('Chinese not marked as Chinese: ' + describe(element));
    }
  }

  const controls = document.querySelectorAll(
    'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex="0"]',
  );
  for (const element of controls) {
    if (element.closest('[hidden]') || getComputedStyle(element).visibility === 'hidden') continue;
    let box = element.getBoundingClientRect();
    const tickBox = element.type === 'radio' || element.type === 'checkbox';
    // A tick box or radio button is tapped through its label too; one kept
    // out of sight (the samples of the looks) only through its label.
    if (tickBox && element.closest('label')) {
      box = element.closest('label').getBoundingClientRect();
    }
    if (box.width === 0 || box.height === 0 || opacityOf(element) === 0) continue;
    // An invisible layer laid over a button makes its area to tap bigger
    // (button.note-word::after in style.css).
    const layer = getComputedStyle(element, '::after');
    let { width, height } = box;
    if (layer.content !== 'none' && layer.position === 'absolute') {
      height -= Math.min(0, parseFloat(layer.top) || 0) + Math.min(0, parseFloat(layer.bottom) || 0);
      width -= Math.min(0, parseFloat(layer.left) || 0) + Math.min(0, parseFloat(layer.right) || 0);
    }
    // A word inside a line of text may be as narrow as the word: the
    // guidelines leave targets inside a sentence out.
    const inSentence = element.matches('.note-word, .sentence-word');
    if (Math.round(height) < 24 || (!inSentence && Math.round(width) < 24)) {
      failures.push('too small to tap (' + Math.round(width) + 'x' + Math.round(height) + '): ' + describe(element));
    }
    // A name for screen readers: its text, a label, or aria-label.
    const named =
      element.getAttribute('aria-label') ||
      element.getAttribute('aria-labelledby') ||
      element.labels?.length ||
      (!['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) && element.textContent.trim());
    if (!named) {
      failures.push('no name for screen readers: ' + describe(element));
    }
    // The edge of a box to type in or choose from.
    if (element.matches('select, textarea, input:not([type=radio], [type=checkbox], [type=range], [type=file])')) {
      const style = getComputedStyle(element);
      const edge = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none' ? parse(style.borderTopColor) : null;
      const ratio = edge ? contrast(over(edge, backgroundOf(element.parentElement)), backgroundOf(element.parentElement)) : 0;
      if (ratio < 3) {
        failures.push('edge of a box contrast ' + ratio.toFixed(2) + ': ' + describe(element));
      }
    }
  }
  return failures;
})()`;

describe('accessibility', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    await addTestWords(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  // Checks what is on screen in both looks; fails with the whole list.
  async function check(screen) {
    const failures = [];
    for (const look of ['light', 'dark']) {
      await page.evaluate(`document.documentElement.dataset.theme = '${look}'`);
      for (const failure of await page.evaluate(CHECK)) {
        failures.push(`${look}: ${failure}`);
      }
    }
    await page.evaluate(`delete document.documentElement.dataset.theme`);
    assert.deepEqual(failures, [], `on ${screen}`);
  }

  it('Free practice', async () => {
    await check('Free practice');
  });

  it('the Decks tab', async () => {
    await tap(page, 'decks-tab');
    await waitUntil(page, `document.querySelector('#deck-list li')`, 'the decks');
    await check('the front page of Decks');
    await openDeckPage(page);
    await check("a deck's page");
    // The panel for adding to it, each of its three forms.
    await tap(page, 'add-to-deck-button');
    for (const form of ['add-word-fold', 'add-list-fold', 'add-sentence-fold']) {
      await useAddForm(page, form);
      await check(`adding to a deck, ${form}`);
    }
    await tap(page, 'add-close');
  });

  it('the menu', async () => {
    await tap(page, 'menu-button');
    await waitUntil(page, `document.getElementById('side-menu').open`, 'the menu');
    await check('the menu');
    // The place shown (the Decks tab, from the test before) is marked for
    // screen readers.
    assert.equal(await page.evaluate(`document.querySelector('#side-menu [aria-current="page"]')?.id`), 'decks-tab');
    await page.evaluate(`document.getElementById('side-menu').close()`);
  });

  it('Basics of Chinese, each of its screens', async () => {
    await tap(page, 'basics-button');
    await waitUntil(page, `document.getElementById('basics-dialog').open`, 'the basics');
    for (let step = 1; step <= 5; step += 1) {
      await check(`Basics of Chinese, screen ${step}`);
      if (step < 5) {
        await tap(page, 'basics-next');
      }
    }
    await tap(page, 'basics-close');
  });

  it('the Words tab and a word\'s page', async () => {
    await tap(page, 'words-tab');
    await waitUntil(page, `document.querySelector('#word-list li')`, 'the words');
    await check('the Words tab');
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(page, `document.getElementById('word-page').open && document.querySelector('#word-page .sentence-word')`, "the word's page");
    await check("a word's page");
    await page.evaluate(`document.getElementById('word-page').close()`);
    // Searching: the dictionary's words under yours, and the page of one,
    // with its reading to choose and Add.
    await type(page, 'word-search', 'gate');
    await waitUntil(page, `document.querySelectorAll('#dictionary-list li').length > 0`, "the dictionary's words");
    await check('the dictionary on the Words tab');
    await page.evaluate(`document.querySelector('#dictionary-list li button').click()`);
    await waitUntil(page, `document.querySelector('#word-page .page-add-word')`, "a dictionary word's page");
    await check("a dictionary word's page");
    await page.evaluate(`document.getElementById('word-page').close()`);
    await type(page, 'word-search', '');
  });

  it('the Progress tab', async () => {
    await tap(page, 'progress-tab');
    await waitUntil(page, `document.querySelector('#progress-today b')`, 'the Progress tab');
    // A day tapped, so its line is checked too.
    await page.evaluate(`document.querySelector('#progress-days .today').click()`);
    await check('the Progress tab, a month');
    await page.evaluate(`document.querySelector('#progress-range [data-range="year"]').click()`);
    await check('the Progress tab, a year');
  });

  it('a lesson in Learn', async () => {
    await openLearn(page);
    // The first look at the word, with its note, whose words can be tapped.
    await waitUntil(page, `document.querySelector('.note-word')`, 'the note');
    await check('a lesson');
  });

  it('Review, with the grades', async () => {
    // The word of the lesson is known: its cards are answered Easy, and so
    // learned. Made due now, and reviewed long ago (or the word's cards hold
    // each other back for a while), they come up in Review.
    const word = await page.evaluate(`document.getElementById('card-face').textContent`);
    await tap(page, 'skip-lesson-button');
    await waitUntil(page, `document.getElementById('card-face').textContent !== ${JSON.stringify(word)}`, 'the next word');
    await page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction('cards', 'readwrite');
        const store = tx.objectStore('cards');
        store.getAll().onsuccess = (event) => {
          for (const card of event.target.result) store.put({ ...card, due: 0, lastReviewedAt: 1 });
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      };
    })`);
    await reloadApp(page);
    await tap(page, 'review-tab');
    await waitUntil(page, `!document.getElementById('study-area').hidden && document.getElementById('card-type').textContent !== ''`, 'a card');
    await check('a card in Review');
    // The answer, whatever kind of card it is: tapped on a meaning or pinyin
    // card, a tone given on a tone card.
    await page.evaluate(`(() => {
      const tone = document.querySelector('#tone-buttons:not([hidden]) [data-tone]');
      if (tone) tone.click();
      else ['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })));
    })()`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    await check('the grades in Review');
    // The grades from the keyboard: 3 is Good. Not while a panel is open.
    const key = async (name) => {
      await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: name, text: name });
      await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: name });
    };
    const reviews = `new Promise((resolve) => {
      indexedDB.open('hanzi-trainer').onsuccess = (event) => {
        event.target.result.transaction('reviews').objectStore('reviews').count().onsuccess = (counted) => resolve(counted.target.result);
      };
    })`;
    const before = await page.evaluate(reviews);
    await tap(page, 'menu-button');
    await key('3');
    assert.equal(await page.evaluate(reviews), before, 'graded behind the menu');
    await page.evaluate(`document.getElementById('side-menu').close()`);
    await key('3');
    await waitUntil(page, `document.getElementById('grade-row').hidden`, 'the card graded');
    assert.equal(await page.evaluate(reviews), before + 1);
  });

  it('the start of Review, asking how many cards', async () => {
    // It needs more than 20 cards to do; shown here by hand, over the page
    // as it is, with the box for another number open.
    await page.evaluate(`(() => {
      document.getElementById('study-area').hidden = true;
      document.getElementById('done-panel').hidden = true;
      document.getElementById('review-start-count').textContent = '243 cards to review';
      document.getElementById('review-other-form').hidden = false;
      document.getElementById('review-start').hidden = false;
    })()`);
    await check('the start of Review');
    await page.evaluate(`document.getElementById('review-start').hidden = true`);
  });

  it('the streak screen, and its settings', async () => {
    // Filled in by hand: what is in it is tested in streak.browser.js.
    await page.evaluate(`(() => {
      // The first time's, which has the most in it.
      document.getElementById('streak-kicker').textContent = 'New: streaks';
      document.getElementById('streak-number').textContent = '12';
      document.getElementById('streak-label').textContent = 'days in a row!';
      document.getElementById('streak-detail').textContent = 'Each day you review 10 cards or learn 2 words, your streak grows by one.';
      document.getElementById('streak-off').hidden = false;
      document.getElementById('streak-dialog').showModal();
    })()`);
    // Measured once the pop is over: halfway through, the rabbit and the
    // number are see-through and read as too faint.
    await page.evaluate(`Promise.all(document.getElementById('streak-dialog').getAnimations({ subtree: true }).map((animation) => animation.finished))`);
    await check('the streak screen');
    await tap(page, 'streak-continue');
    // The browser tests start with streaks off, which hides how much makes a
    // day count; on for this check, and off again after.
    const setStreaks = (on) =>
      page.evaluate(`(() => {
        const box = document.getElementById('streaks-checkbox');
        box.checked = ${on};
        box.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
    await openSettings(page, 'settings-studying');
    await setStreaks(true);
    await check('Settings, streaks on');
    await setStreaks(false);
    await tap(page, 'settings-close');
  });

  it('readings in zhuyin and pinyin: the Words tab, a word\'s page, a lesson', async () => {
    const choose = (style) =>
      page.evaluate(`(() => {
        const select = document.getElementById('reading-style-select');
        select.value = '${style}';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
    await openSettings(page, 'settings-learning');
    await choose('zhuyinPinyin');
    await tap(page, 'settings-close');
    await tap(page, 'words-tab');
    await waitUntil(page, `/[\\u3105-\\u312f]/u.test(document.querySelector('#word-list .entry-pinyin')?.textContent ?? '')`, 'the words in zhuyin');
    await check('the Words tab in zhuyin');
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(page, `document.getElementById('word-page').open && document.querySelector('#word-page .page-reading')`, "the word's page");
    await check("a word's page in zhuyin");
    await page.evaluate(`document.getElementById('word-page').close()`);
    await openLearn(page);
    await waitUntil(page, `document.querySelector('#card-face .face-pinyin')`, 'the first look at a word');
    await check('a lesson in zhuyin');
    await openSettings(page, 'settings-learning');
    await choose('pinyin');
    await tap(page, 'settings-close');
  });

  it('Settings and the introduction', async () => {
    await page.evaluate(ANSWER_YES);
    await tap(page, 'settings-button');
    await waitUntil(page, `document.getElementById('settings-panel').open`, 'Settings');
    // The list of groups, then each group (one at a time since 2026-10-16).
    await check('Settings');
    const groups = await page.evaluate(`[...document.querySelectorAll('#settings-nav button')].map((button) => button.dataset.group)`);
    for (const group of groups) {
      await page.evaluate(`document.querySelector('#settings-nav [data-group="${group}"]').click()`);
      await check(`Settings, ${group}`);
      await tap(page, 'settings-back');
    }
    await tap(page, 'welcome-again-button');
    await waitUntil(page, `document.getElementById('welcome').open`, 'the introduction');
    await check('the introduction');
  });
});
