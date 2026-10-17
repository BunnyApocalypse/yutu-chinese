// The screenshot atlas and layout report, for the pass over the looks
// (docs/ux-review.md). Run by hand: node scripts/ux-atlas.js
//
// It goes through the app's screens the way a learner would (the same steps
// as the browser tests, with the same harness and no dependency), at the
// size of a phone, a small phone, a tablet and a desktop, and on each screen:
// - takes a picture in the light and the dark look;
// - measures what can be measured about the layout: anything sticking out
//   sideways, buttons below the bottom of the screen, how many buttons there
//   are, buttons under the 44px Apple and Google recommend, text cut off or
//   very small, and the size of the writing area.
// Everything goes into local/ux-atlas/ (git-ignored): the pictures,
// report.json, and index.html, a page to look through them side by side.
// Open it in a browser: local/ux-atlas/index.html
//
// The app starts with the test words (tests/words.tsv) in a fresh profile,
// both scripts with cards in traditional, as in the browser tests. The four
// sizes run in four browsers at once, each started at its own size, so that
// nothing is measured after a resize a real device would not have.
//
// SIZES=phone node scripts/ux-atlas.js runs one size only.
// To compare a change in the looks before making it: TRY_CSS adds a few
// lines of style to every screen, and OUT puts the pictures elsewhere, e.g.
//   SIZES=phone OUT=local/ux-atlas-blue TRY_CSS=':root{--quiet-text:var(--accent)}' node scripts/ux-atlas.js

import fs from 'node:fs';
import path from 'node:path';

import {
  startApp,
  startBrowsers,
  reloadApp,
  tap,
  type,
  waitUntil,
  addTestWords,
  openLearn,
  openDeckPage,
  writingArea,
  drawStroke,
  loadStrokeData,
  ANSWER_YES,
} from '../tests/browser/harness.js';

const OUT = process.env.OUT || 'local/ux-atlas';
const ALL_SIZES = {
  phone: { width: 390, height: 844, mobile: true },
  // A small phone (the iPhone SE's size), where room is shortest.
  small: { width: 375, height: 667, mobile: true },
  tablet: { width: 820, height: 1180, mobile: true },
  desktop: { width: 1440, height: 900, mobile: false },
};
const SIZES = Object.fromEntries(
  Object.entries(ALL_SIZES).filter(([name]) => !process.env.SIZES || process.env.SIZES.split(',').includes(name)),
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs in the page; returns the measurements of what is on screen now. "On
// screen" is the open pop-up (a modal <dialog>) if there is one, the page
// otherwise.
const MEASURE = `(() => {
  const vw = innerWidth;
  const vh = innerHeight;
  const opacityOf = (element) => {
    let opacity = 1;
    for (let at = element; at; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
    return opacity;
  };
  const shown = (element) => {
    if (element.closest('[hidden], dialog:not([open])')) return false;
    const box = element.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(element).visibility !== 'hidden' && opacityOf(element) > 0;
  };
  const nameOf = (element) => {
    const words = (element.getAttribute('aria-label') || element.innerText || element.value || element.title || '')
      .trim().replace(/\\s+/g, ' ').slice(0, 40);
    const id = element.id ? '#' + element.id : '';
    return (element.tagName.toLowerCase() + id + (words ? ' "' + words + '"' : '')).trim();
  };
  // The layer on top: the last modal dialog opened, or the page.
  const dialogs = [...document.querySelectorAll('dialog[open]')].filter((d) => d.matches(':modal'));
  const layer = dialogs[dialogs.length - 1] || document.body;
  const layerBox = layer === document.body ? { top: 0, bottom: vh } : layer.getBoundingClientRect();
  // The bottom of what can be seen without scrolling.
  const fold = Math.min(vh, layerBox.bottom);
  const inLayer = (element) => layer.contains(element) && (layer !== document.body || !element.closest('dialog[open]'));

  const controls = [...document.querySelectorAll(
    'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex="0"]',
  )].filter((element) => inLayer(element) && shown(element));

  // Where a control really is on the page, as if nothing were scrolled: a
  // control in a scrolled box or a scrolled page counts from the top.
  // Only the boxes inside the layer count: a pop-up does not move when the
  // page under it is scrolled.
  const scrolledBy = (element) => {
    let by = 0;
    for (let at = element.parentElement; at; at = at.parentElement) {
      by += at.scrollTop || 0;
      if (at === layer) break;
    }
    if (layer === document.body) by += document.scrollingElement.scrollTop;
    return by;
  };
  const belowFold = controls
    .filter((element) => element.getBoundingClientRect().top + scrolledBy(element) >= fold - 4)
    .map(nameOf);

  const small = [];
  for (const element of controls) {
    let box = element.getBoundingClientRect();
    if ((element.type === 'radio' || element.type === 'checkbox') && element.closest('label')) {
      box = element.closest('label').getBoundingClientRect();
    }
    // Words inside a sentence or note are left out, as by the guidelines.
    if (element.matches('.note-word, .sentence-word')) continue;
    if (Math.round(box.height) < 44 || Math.round(box.width) < 44) {
      small.push(nameOf(element) + ' ' + Math.round(box.width) + 'x' + Math.round(box.height));
    }
  }

  // Sticking out sideways: the page wider than the screen, and the elements
  // reaching past its right edge (not those inside a box that scrolls).
  const scrollsSideways = (element) => {
    for (let at = element.parentElement; at && at !== document.body; at = at.parentElement) {
      const x = getComputedStyle(at).overflowX;
      if (x === 'auto' || x === 'scroll' || x === 'hidden' || x === 'clip') return true;
    }
    return false;
  };
  const sticksOut = [];
  for (const element of layer.querySelectorAll('*')) {
    if (sticksOut.length >= 10) break;
    if (!shown(element) || element.closest('svg') || scrollsSideways(element)) continue;
    const box = element.getBoundingClientRect();
    if (box.right > vw + 1 || box.left < -1) {
      sticksOut.push(nameOf(element) + ' ' + Math.round(box.left) + '..' + Math.round(box.right));
    }
  }

  // Text cut off (an ellipsis, or a box too small for it), and text under
  // 12px. Meanings cut short on purpose (clamp.js) are listed apart.
  const cutOff = [];
  const tiny = [];
  for (const element of layer.querySelectorAll('*')) {
    if (!shown(element) || element.closest('svg')) continue;
    const ownText = [...element.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join('').trim();
    if (!ownText) continue;
    const style = getComputedStyle(element);
    if (parseFloat(style.fontSize) < 12 && tiny.length < 10) {
      tiny.push(nameOf(element) + ' ' + style.fontSize);
    }
    const hides = style.overflow !== 'visible' || style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none';
    if (hides && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1) && cutOff.length < 10) {
      const onPurpose = style.webkitLineClamp !== 'none' || element.closest('[data-clamped], .clamped');
      cutOff.push((onPurpose ? '(on purpose) ' : '') + nameOf(element));
    }
  }

  // The writing area, and what else is as big.
  let writing = null;
  const area = document.getElementById('writing-area');
  if (area && inLayer(area) && shown(area)) {
    const box = area.getBoundingClientRect();
    writing = {
      size: Math.round(box.width) + 'x' + Math.round(box.height),
      shareOfWidth: Math.round((box.width / vw) * 100),
      shareOfScreen: Math.round(((box.width * box.height) / (vw * vh)) * 100),
      bottom: Math.round(box.bottom + scrolledBy(area)),
      belowFold: box.bottom + scrolledBy(area) > fold + 1,
    };
  }
  return {
    viewport: vw + 'x' + vh,
    layer: layer === document.body ? 'page' : nameOf(layer).split(' ')[0],
    pageHeight: layer === document.body ? document.documentElement.scrollHeight : Math.round(layer.scrollHeight),
    sidewaysScroll: document.documentElement.scrollWidth - vw,
    controls: controls.length,
    belowFold,
    under44: small,
    sticksOut,
    cutOff,
    tiny,
    writing,
  };
})()`;

// Tone numbers of a pinyin with numbers, such as wo3men5 → [3, 5].
const tonesOf = (pinyin) => [...pinyin.matchAll(/[a-zü:]+([1-5])/gi)].map((match) => Number(match[1]));

// The test words, to know the reading of the word a lesson teaches.
const TEST_WORDS = fs
  .readFileSync('tests/words.tsv', 'utf8')
  .split('\n')
  .filter((line) => line.trim())
  .map((line) => {
    const [simplified, traditional, pinyin, definition] = line.split('\t');
    return { simplified, traditional, pinyin, definition };
  });

// Walks the app at one size, filling `shots` (one entry per screen).
async function walk(page, sizeName, size, shots) {
  const log = (text) => console.log(`[${sizeName}] ${text}`);
  await page.send('Emulation.setDeviceMetricsOverride', { ...size, deviceScaleFactor: 1 });
  await reloadApp(page);

  // Takes the screen as it is now: measured once, pictured in both looks.
  async function shoot(key, title) {
    if (process.env.TRY_CSS) {
      // Added again whenever the page has been reloaded since.
      await page.evaluate(`document.getElementById('try-css') || document.head.append(Object.assign(document.createElement('style'), { id: 'try-css', textContent: ${JSON.stringify(process.env.TRY_CSS)} }))`);
    }
    await sleep(350); // animations of pop-ups and Hanzi Writer settle
    const measures = await page.evaluate(MEASURE);
    const pictures = {};
    for (const look of ['light', 'dark']) {
      // The look is changed as theme.js changes it, with its event: the
      // writing area's colors are values, set again on that event. Without
      // it, the outline kept the browser's own look (dark in headless
      // Chromium) and looked like ink in the light pictures (until
      // 2026-10-17).
      await page.evaluate(`document.documentElement.dataset.theme = '${look}'; document.dispatchEvent(new CustomEvent('theme-changed'))`);
      await sleep(120);
      // The whole page, below the bottom of the screen too (a pop-up scrolls
      // inside itself and is pictured as seen).
      const height = measures.layer === 'page'
        ? Math.min(Math.max(size.height, await page.evaluate('document.documentElement.scrollHeight')), 6000)
        : size.height;
      const { data } = await page.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: height > size.height,
        clip: { x: 0, y: 0, width: size.width, height, scale: 1 },
      });
      const file = `${key}-${sizeName}-${look}.png`;
      fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
      pictures[look] = file;
    }
    await page.evaluate(`delete document.documentElement.dataset.theme; document.dispatchEvent(new CustomEvent('theme-changed'))`);
    shots.push({ key, title, size: sizeName, measures, pictures });
    log(`${key}: ${measures.controls} controls, ${measures.belowFold.length} below the fold`);
  }

  // A step that fails is noted and the walk goes on with the next.
  async function step(description, task) {
    try {
      await task();
    } catch (error) {
      log(`could not take "${description}": ${error.message.split('\n')[0]}`);
      // What the screen showed when it failed, for finding out why.
      const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(OUT, `failed-${sizeName}-${description.replace(/\W+/g, '-')}.png`), Buffer.from(data, 'base64'));
      log(`status line then: ${await page.evaluate(`document.getElementById('stroke-count').textContent + ' | ' + document.getElementById('status').textContent`)}`);
      shots.push({ key: 'failed', title: description, size: sizeName, error: error.message.split('\n')[0] });
    }
  }

  const closeDialogs = () =>
    page.evaluate(`document.querySelectorAll('dialog[open]').forEach((dialog) => dialog.close())`);

  await step('Review with no words', async () => {
    await tap(page, 'review-tab');
    await waitUntil(page, `!document.getElementById('done-panel').hidden`, 'Review');
    await shoot('01-review-empty', 'Review, before any word is added');
  });

  await step('Free practice', async () => {
    await tap(page, 'practice-tab');
    await waitUntil(page, `document.getElementById('stroke-count').textContent.startsWith('1/')`, 'Free practice');
    await shoot('02-free-practice', 'Free practice, its default word');
  });

  await step('adding the test words', () => addTestWords(page));

  await step('the menu', async () => {
    await tap(page, 'menu-button');
    await waitUntil(page, `document.getElementById('side-menu').open`, 'the menu');
    await shoot('03-menu', 'The menu');
    await page.evaluate(`document.getElementById('side-menu').close()`);
  });

  await step('Decks', async () => {
    await tap(page, 'decks-tab');
    await waitUntil(page, `document.querySelector('#deck-list li')`, 'the decks');
    await shoot('04-decks', 'Decks, the front page');
    await openDeckPage(page);
    await shoot('05-deck-page', "A deck's page");
    // "+ Add to deck": the panel for adding, on each of its three tabs.
    await tap(page, 'add-to-deck-button');
    await waitUntil(page, `document.getElementById('add-dialog').open`, 'the panel for adding');
    const tabs = [
      ['add-word-fold', 'word', 'one word'],
      ['add-list-fold', 'list', 'a list of words'],
      ['add-sentence-fold', 'sentence', 'a sentence'],
    ];
    for (const [fold, short, title] of tabs) {
      await page.evaluate(`document.querySelector('#add-choices [data-add="${fold}"]').click()`);
      await waitUntil(page, `!document.getElementById('${fold}').hidden`, `the tab for ${title}`);
      await shoot(`06-deck-add-${short}`, `"+ Add to deck", adding ${title}`);
    }
    await tap(page, 'add-close');
  });

  await step('Words', async () => {
    await tap(page, 'words-tab');
    await waitUntil(page, `document.querySelector('#word-list li')`, 'the words');
    await shoot('07-words', 'Words');
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(page, `document.getElementById('word-page').open && document.querySelector('#word-page .sentence-word')`, "the word's page");
    await shoot('08-word-page', "A word's page");
    await page.evaluate(`document.querySelectorAll('#word-page details').forEach((group) => { group.open = true; })`);
    await shoot('09-word-page-cards', "A word's page, Cards unfolded (the card manager)");
    // Its Edit button: the pop-up panel with the word's form.
    const edited = await page.evaluate(`(() => {
      const edit = [...document.querySelectorAll('#word-page button')].find((b) => b.textContent.trim() === 'Edit' && b.offsetParent);
      if (edit) edit.click();
      return Boolean(edit);
    })()`);
    if (edited) {
      await waitUntil(page, `document.getElementById('word-dialog').open`, 'the word panel');
      await shoot('10-word-panel', "The word's pop-up panel (Edit)");
    }
    await closeDialogs();
    await type(page, 'word-search', 'gate');
    await waitUntil(page, `document.querySelectorAll('#dictionary-list li').length > 0`, "the dictionary's words");
    await shoot('11-words-search', 'Words, searching "gate": the dictionary under your words');
    await page.evaluate(`document.querySelector('#dictionary-list li button').click()`);
    await waitUntil(page, `document.querySelector('#word-page .page-add-word')`, "a dictionary word's page");
    await shoot('12-dictionary-word', "A dictionary word's page, with Add");
    await closeDialogs();
    await type(page, 'word-search', '');
  });

  // The lesson, every step of the first word to learn (我們, two characters).
  await step('Learn', async () => {
    await openLearn(page);
    for (let number = 1; number <= 8; number++) {
      const label = await page.evaluate(`document.getElementById('card-type').textContent`);
      const match = label.match(/step (\d+) of (\d+)/);
      if (!match) break;
      await sleep(400);
      const word = await currentWord();
      await shoot(`13-lesson-step${match[1]}`, `A lesson in Learn: ${label}`);
      // Moving on: the look and the tones have "Next"; the writing steps are written.
      if (await isShownNow('lesson-next-button')) {
        await tap(page, 'lesson-next-button');
      } else if (await page.evaluate(`Boolean(document.querySelector('#tone-buttons:not([hidden]) [data-tone]')?.offsetParent)`)) {
        for (const tone of tonesOf(word.pinyin)) {
          await page.evaluate(`document.querySelector('#tone-buttons [data-tone="${tone}"]').click()`);
          // The next character comes up half a second after a right tone
          // (MOVE_ON_AFTER_MS in src/toneFlow.js).
          await sleep(800);
        }
        await waitUntil(page, `document.getElementById('status').textContent === 'All tones right'`, 'the tones');
        await tap(page, 'lesson-next-button');
      } else {
        await writeWord(word, async (index, strokeIndex, last) => {
          // Halfway through the first character: raw input on screen.
          if (number === 3 && index === 0 && strokeIndex === 2) {
            await shoot('13-lesson-step3-writing', 'A lesson, writing over the shown strokes (raw input)');
          }
          if (number === 3 && index === 0 && last) {
            await shoot('13-lesson-step3-char-done', 'A lesson, the first character of the word written');
          }
        });
        if (await page.evaluate(`!document.getElementById('grade-row').hidden`)) {
          await shoot('14-lesson-graded', 'The last step of a lesson, written, with the grades');
          await page.evaluate(`document.querySelector('#grade-row button.primary').click()`);
          break;
        }
        await shoot(`13-lesson-step${match[1]}-written`, `A lesson: ${label}, written`);
        await tap(page, 'next-button');
      }
      await waitUntil(page, `!document.getElementById('card-type').textContent.endsWith(${JSON.stringify(match[0])})`, 'the next step');
    }
    await waitUntil(page, `!document.getElementById('learn-next-button').hidden`, 'the screen between two words');
    await shoot('15-learn-between', 'Learn, between two words (and the message about storage)');
    await page.evaluate(`document.getElementById('storage-message-close')?.click()`);
    // Four more words marked known, so that Review has several words' cards
    // (the cards of one word hold each other back for a while).
    await tap(page, 'learn-next-button');
    for (let skipped = 0; skipped < 4; skipped++) {
      await waitUntil(page, `document.getElementById('card-type').textContent.includes('step 1 of')`, 'the next word');
      const before = await page.evaluate(`document.getElementById('card-face').textContent`);
      await tap(page, 'skip-lesson-button');
      await waitUntil(page, `document.getElementById('card-face').textContent !== ${JSON.stringify(before)}`, 'the word skipped');
    }
  });

  // Review: one card of each kind. Only the cards of that kind are made
  // due, since Review shows one card of a word at a time and meaning cards
  // come first (until 2026-10-17 eight cards in a row showed only those).
  for (const type of ['meaning', 'pinyin', 'tone', 'writing']) {
    await step(`Review, a ${type} card`, async () => {
      await page.evaluate(`new Promise((resolve, reject) => {
        const opening = indexedDB.open('hanzi-trainer');
        opening.onsuccess = () => {
          const tx = opening.result.transaction('cards', 'readwrite');
          const store = tx.objectStore('cards');
          store.getAll().onsuccess = (event) => {
            for (const card of event.target.result) {
              const due = card.type === '${type}' ? 0 : Date.now() + 365 * 86400000;
              store.put({ ...card, due, lastReviewedAt: 1 });
            }
          };
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        };
      })`);
      await reloadApp(page);
      await tap(page, 'review-tab');
      await waitUntil(page, `!document.getElementById('study-area').hidden && document.getElementById('card-type').textContent !== ''`, 'a card');
      const kind = (await page.evaluate(`document.getElementById('card-type').textContent`)).trim();
      await shoot(`16-review-${type}`, `Review: ${kind}`);
      // The answer: the word written, a tone given, or a tap on the card.
      if (type === 'writing') {
        await writeWord(await currentWord(), async (index, strokeIndex) => {
          if (index === 0 && strokeIndex === 2) await shoot(`16-review-${type}-writing`, `Review: ${kind}, partly written`);
        });
      } else if (type === 'tone') {
        for (const tone of tonesOf((await currentWord()).pinyin)) {
          await page.evaluate(`document.querySelector('#tone-buttons [data-tone="${tone}"]').click()`);
          await sleep(800);
        }
      } else {
        await page.evaluate(`document.getElementById('card-face').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);
      }
      await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
      await shoot(`16-review-${type}-grades`, `Review: ${kind}, answered, with the grades`);
      if (type === 'writing') {
        // Practicing it again: the tools come back under the grades.
        await tap(page, 'practice-again-button');
        await waitUntil(page, `document.getElementById('study-area').classList.contains('practicing')`, 'practice');
        await shoot('16-review-writing-practice', `Review: ${kind}, practicing it again`);
      }
      await page.evaluate(`document.querySelector('#grade-row button.primary').click()`);
      await sleep(400);
    });
  }

  await step('Settings and the introduction', async () => {
    await page.evaluate(ANSWER_YES);
    await tap(page, 'settings-button');
    await waitUntil(page, `document.getElementById('settings-panel').open`, 'Settings');
    await shoot('17-settings', 'Settings, as it opens');
    // One group at a time, as Settings shows them (2026-10-16): on a phone
    // the group in place of the list, on a wide screen beside it.
    const groups = await page.evaluate(`[...document.querySelectorAll('#settings-nav [data-group]')].map((b) => [b.dataset.group, b.textContent.trim()])`);
    for (const [index, [group, name]] of groups.entries()) {
      await page.evaluate(`document.querySelector('#settings-nav [data-group="${group}"]').click()`);
      await waitUntil(page, `!document.getElementById('${group}').hidden`, `the group ${name}`);
      await shoot(`18-settings-${index + 1}`, `Settings: ${name}`);
    }
    await page.evaluate(`document.getElementById('settings-back')?.click()`);
    await tap(page, 'welcome-again-button');
    await waitUntil(page, `document.getElementById('welcome').open`, 'the introduction');
    for (let screen = 1; screen <= 8; screen++) {
      await shoot(`19-welcome-${screen}`, `The introduction, ${await page.evaluate(`document.getElementById('welcome-progress').textContent`) || 'screen ' + screen}`);
      if (!(await isShownNow('welcome-next'))) break;
      const before = await page.evaluate(`document.getElementById('welcome-progress').textContent`);
      await tap(page, 'welcome-next');
      await sleep(200);
      if ((await page.evaluate(`document.getElementById('welcome-progress').textContent`)) === before) break;
    }
    await page.evaluate(`document.getElementById('welcome-skip').click()`);
  });

  // Writes the word's characters (traditional, as the test settings have
  // it), tapping Next between two characters as a learner does
  // (wordFlow.js). `afterStroke(index, strokeIndex, lastOfChar)` is called
  // after each stroke, for pictures in between.
  async function writeWord(word, afterStroke = async () => {}) {
    const chars = [...word.traditional];
    for (const [index, char] of chars.entries()) {
      await waitUntil(
        page,
        `document.getElementById('stroke-count').textContent.startsWith('1/') && !document.getElementById('writing-area').hasAttribute('data-busy')`,
        'the character to be writable',
      );
      const box = await writingArea(page);
      const strokes = loadStrokeData(char).medians;
      for (const [strokeIndex, median] of strokes.entries()) {
        await drawStroke(page, box, median);
        await afterStroke(index, strokeIndex, strokeIndex === strokes.length - 1);
      }
      if (index < chars.length - 1) {
        await waitUntil(page, `!document.getElementById('next-button').hidden`, 'Next');
        await tap(page, 'next-button');
      }
    }
  }

  // The word being studied, found in the test words by the meaning shown
  // (or, on a card without it, by the characters on the card's face).
  async function currentWord() {
    const { meaning, face } = await page.evaluate(`({
      meaning: document.getElementById('prompt-meaning')?.textContent.trim() || '',
      face: document.getElementById('card-face')?.textContent || '',
    })`);
    return (
      TEST_WORDS.find((w) => meaning && w.definition === meaning) ||
      TEST_WORDS.find((w) => face.startsWith(w.traditional) || face.startsWith(w.simplified)) ||
      TEST_WORDS[0]
    );
  }

  async function isShownNow(id) {
    return page.evaluate(`(() => {
      const e = document.getElementById(${JSON.stringify(id)});
      return Boolean(e && !e.closest('[hidden]') && e.offsetParent);
    })()`);
  }
}

// The page to look through the pictures: one row per screen, the sizes side
// by side, light above dark, with what was measured beside each.
function writeIndex(shots) {
  const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const screens = new Map();
  for (const shot of shots) {
    if (!shot.pictures) continue;
    if (!screens.has(shot.key)) screens.set(shot.key, { title: shot.title, bySize: {} });
    screens.get(shot.key).bySize[shot.size] = shot;
  }
  const list = (items) => (items.length ? `<ul>${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : ' none');
  const cell = (shot) => {
    if (!shot) return '<td class="missing">not reached</td>';
    const m = shot.measures;
    const fold = ALL_SIZES[shot.size].height;
    return `<td>
      <div class="pics">${['light', 'dark']
        .map((look) => `<a href="${shot.pictures[look]}"><span class="pic" style="--fold:${fold}px"><img loading="lazy" src="${shot.pictures[look]}" alt="${escape(shot.title)}, ${shot.size}, ${look}"><span class="fold"></span></span></a>`)
        .join('')}</div>
      <details><summary>${m.controls} controls · ${m.belowFold.length} below the fold · ${m.under44.length} under 44px${m.sidewaysScroll > 0 ? ' · <b>scrolls sideways ' + m.sidewaysScroll + 'px</b>' : ''}${m.writing ? ' · writing area ' + m.writing.size + ' (' + m.writing.shareOfWidth + '% of the width)' + (m.writing.belowFold ? ' <b>below the fold</b>' : '') : ''}</summary>
        <p><b>Below the fold:</b>${list(m.belowFold)}</p>
        <p><b>Under 44px:</b>${list(m.under44)}</p>
        <p><b>Sticking out sideways:</b>${list(m.sticksOut)}</p>
        <p><b>Text cut off:</b>${list(m.cutOff)}</p>
        <p><b>Text under 12px:</b>${list(m.tiny)}</p>
      </details></td>`;
  };
  const failed = shots.filter((shot) => shot.key === 'failed');
  const sizes = Object.keys(SIZES);
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>UX atlas</title>
<style>
  body { font: 14px/1.4 system-ui, sans-serif; margin: 16px; background: #f4f2ec; color: #222; }
  table { border-collapse: collapse; }
  th, td { vertical-align: top; padding: 8px; border-bottom: 1px solid #ccc; text-align: left; }
  .pics { display: flex; gap: 6px; }
  .pic { position: relative; display: block; }
  img { display: block; width: auto; height: 420px; border: 1px solid #999; }
  /* The bottom of the screen, scaled with the picture. */
  .fold { position: absolute; left: 0; right: 0; border-top: 2px dashed #d22; top: calc(420px * var(--fold) / var(--h, 99999px)); }
  details { max-width: 520px; font-size: 12px; }
  .missing { color: #888; }
</style>
<h1>UX atlas</h1>
<p>Made by <code>node scripts/ux-atlas.js</code> on ${new Date().toISOString().slice(0, 16).replace('T', ' ')}. Each picture is the whole page; the dashed red line is the bottom of the screen. Click a picture for full size, the line under it for what was measured.</p>
${failed.length ? `<p><b>Not reached:</b> ${failed.map((f) => escape(`${f.size}: ${f.title} (${f.error})`)).join('; ')}</p>` : ''}
<table><tr><th>Screen</th>${sizes.map((s) => `<th>${s} ${ALL_SIZES[s].width}×${ALL_SIZES[s].height}</th>`).join('')}</tr>
${[...screens.entries()].map(([key, screen]) => `<tr id="${key}"><th>${escape(screen.title)}</th>${sizes.map((s) => cell(screen.bySize[s])).join('')}</tr>`).join('\n')}
</table>
<script>
  // Places each fold line once the picture's real height is known.
  document.querySelectorAll('.pic img').forEach((img) => {
    const place = () => img.parentElement.style.setProperty('--h', img.naturalHeight + 'px');
    img.complete ? place() : img.addEventListener('load', place);
  });
</script>`;
  fs.writeFileSync(path.join(OUT, 'index.html'), html);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const app = await startApp();
const sizeNames = Object.keys(SIZES);
const browsers = await startBrowsers(app.url, sizeNames.length);
const shots = [];
try {
  await Promise.all(sizeNames.map((name) => browsers.use((page) => walk(page, name, SIZES[name], shots))));
} finally {
  const errors = browsers.errors();
  browsers.close();
  await app.close();
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ shots, pageErrors: errors }, null, 2));
  writeIndex(shots);
  console.log(`\n${shots.filter((s) => s.pictures).length} screens taken. Open ${OUT}/index.html`);
  if (errors.length) console.log(`The page threw errors:\n${errors.join('\n')}`);
}
