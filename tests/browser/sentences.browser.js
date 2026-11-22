// Sentences as things to study: added from a word's page or by hand on a
// deck's page, and studied in Review as a reading card and a writing card.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  startApp,
  startBrowsers,
  tap,
  type,
  choose,
  textOf,
  waitUntil,
  openDeckPage,
  openLearn,
  isShown,
  useAddForm,
  pasteList,
  writingArea,
  drawStroke,
  loadStrokeData,
} from './harness.js';

// Everything in one store of the app's database, read through a connection
// of the test's own.
const stored = (page, storeName) =>
  page.evaluate(`new Promise((resolve, reject) => {
    const request = indexedDB.open('hanzi-trainer');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const all = request.result.transaction(['${storeName}']).objectStore('${storeName}').getAll();
      all.onsuccess = () => {
        request.result.close();
        resolve(all.result);
      };
    };
  })`);

const cardType = (text) => `document.getElementById('card-type').textContent === ${JSON.stringify(text)}`;

// One browser, and the steps in order: each builds on the one before.
describe('sentences', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('adds a word\'s example sentence to a deck from the word\'s page', async () => {
    await openDeckPage(page);
    await type(page, 'add-traditional', '我們');
    await type(page, 'add-simplified', '我们');
    await type(page, 'add-pinyin', 'wo3men5');
    await type(page, 'add-definition', 'we; us');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.querySelectorAll('#word-list li').length === 1`, 'the word');
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(page, `document.getElementById('word-page').dataset.shown === '我們|wo3men5'`, 'the word\'s page');

    await page.evaluate(`document.querySelector('#word-page-body .page-add-sentence button:not(.deck-choice-button)').click()`);
    await waitUntil(page, `[...document.querySelectorAll('#word-page-body .page-section .note')].some((line) => line.textContent.startsWith('Added'))`, 'the sentence added');
    const sentence = (await stored(page, 'words')).find((word) => word.kind === 'sentence');
    assert.equal(sentence.id, '我們是同學。|sentence');
    assert.equal(sentence.simplified, '我们是同学。');
    assert.equal(sentence.pinyin, 'Wǒmen shì tóngxué.');
    assert.equal(sentence.definition, 'We are classmates.');
    // The word of the page is the one to fill in.
    assert.deepEqual(sentence.cloze, { traditional: '我們', simplified: '我们' });
    assert.deepEqual(sentence.decks, ['chinese']);
    assert.equal(typeof sentence.learnedAt, 'number');
    // The way to add it is gone, its deck in a box in its place, and so it
    // stays when the page is opened again.
    const studiedChips = `[...document.querySelectorAll('#word-page-body .page-sentence-studied .chip')].length`;
    assert.equal(await page.evaluate(`document.querySelector('#word-page-body .page-add-sentence')`), null);
    assert.equal(await page.evaluate(studiedChips), 1);
    await tap(page, 'word-page-close');
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(page, `document.querySelector('#word-page-body .page-sentence-studied') !== null`, 'the line again');
    assert.equal(await page.evaluate(`document.querySelector('#word-page-body .page-add-sentence')`), null);
    await tap(page, 'word-page-close');
    assert.equal((await stored(page, 'words')).length, 2);
  });

  it('lets the words of a sentence be tapped at the top of its own page', async () => {
    await type(page, 'word-search', '是同學');
    await waitUntil(page, `document.querySelectorAll('#word-list li').length === 1`, 'the sentence in the list');
    // Its row says it is a sentence, so it is not taken for 我們 again.
    assert.equal(await textOf(page, '#word-list li .entry-new'), 'sentence');
    await page.evaluate(`document.querySelector('#word-list li button').click()`);
    await waitUntil(
      page,
      `document.getElementById('word-page').dataset.shown === '我們是同學。|sentence' && document.querySelector('#word-page-body .page-word .sentence-word')`,
      'the sentence\'s page',
    );
    const heading = (selector) =>
      page.evaluate(`[...document.querySelectorAll('#word-page-body .page-heading ${selector}')].map((part) => part.textContent)`);
    // Its words, split by its pinyin; the full stop is plain text.
    assert.deepEqual(await heading('.page-word:not(.second) .sentence-word'), ['我們', '是', '同學']);
    assert.deepEqual(await heading('.page-word:not(.second)'), ['我們是同學。']);

    await page.evaluate(`document.querySelectorAll('#word-page-body .page-word .sentence-word')[2].click()`);
    await waitUntil(
      page,
      `document.getElementById('word-peek').matches(':popover-open') && document.getElementById('word-peek-word').textContent === '同學'`,
      'the popup for 同學',
    );
    assert.equal(await textOf(page, 'word-peek-pinyin'), 'tóngxué');
    await tap(page, 'word-page-close');
    await type(page, 'word-search', '');
  });

  it('asks for the missing word, or for the whole sentence, on its writing card', async () => {
    // Only the writing card, to begin with.
    await tap(page, 'settings-button');
    await tap(page, 'sentence-reading-checkbox');
    await tap(page, 'settings-close');
    await tap(page, 'review-tab');
    // The word itself is still waiting in the Learn tab; the sentence is not.
    await waitUntil(page, cardType('Sentence · writing'), 'the sentence\'s writing card');
    assert.equal(await textOf(page, 'prompt-meaning'), 'We are classmates.＿＿是同學。');
    assert.equal(await isShown(page, 'lesson-note'), false);
    await waitUntil(page, `document.getElementById('stroke-count').textContent.startsWith('1/')`, 'the first character to write');
    // Two characters to write: those of the missing word.
    await waitUntil(page, `document.querySelectorAll('#word-row > *').length === 2`, 'two characters');

    await tap(page, 'settings-button');
    await choose(page, 'sentence-writing-select', 'sentence');
    await tap(page, 'settings-close');
    await waitUntil(page, `document.getElementById('prompt-meaning').textContent === 'We are classmates.'`, 'the whole sentence asked for');
    // Five characters; the full stop is not written.
    await waitUntil(page, `document.querySelectorAll('#word-row > *').length === 5`, 'five characters');
  });

  it('shows the sentence to read, and grades it', async () => {
    await tap(page, 'settings-button');
    await tap(page, 'sentence-reading-checkbox');
    await choose(page, 'sentence-writing-select', 'off');
    await tap(page, 'settings-close');
    await waitUntil(page, cardType('Sentence · reading'), 'the sentence\'s reading card');
    assert.match(await textOf(page, 'card-face'), /^我們是同學。/);
    await page.evaluate(`['pointerdown', 'pointerup'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
    await waitUntil(page, `!document.getElementById('grade-row').hidden`, 'the grades');
    // The sentence, its pinyin, then its meaning, as on every card.
    assert.match(await textOf(page, 'card-face'), /Wǒmen shì tóngxué\.We are classmates\.About this sentence$/);
    // Good.
    await page.evaluate(`document.querySelectorAll('#grade-row button')[2].click()`);
    await waitUntil(page, `document.getElementById('grade-row').hidden`, 'the card graded');
    const cards = await stored(page, 'cards');
    assert.deepEqual(cards.map((card) => card.id), ['我們是同學。|sentence#meaning']);
  });

  it('adds a sentence by hand on a deck\'s page, and changes its meaning', async () => {
    await openDeckPage(page);
    await useAddForm(page, 'add-sentence-fold');
    await type(page, 'sentence-characters', '你好嗎？');
    await type(page, 'sentence-other', '你好吗？');
    await type(page, 'sentence-meaning', 'How are you');
    await type(page, 'sentence-cloze', '嗎');
    await page.evaluate(`document.getElementById('add-sentence-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-sentence-note').textContent.startsWith('Added')`, 'the sentence added');
    let greeting = (await stored(page, 'words')).find((word) => word.id === '你好嗎？|sentence');
    assert.equal(greeting.simplified, '你好吗？');
    // The word to fill in, in both scripts.
    assert.deepEqual(greeting.cloze, { traditional: '嗎', simplified: '吗' });
    assert.equal(greeting.pinyin, '');

    // Its panel has what can be changed about a sentence.
    await type(page, 'word-search', '你好');
    await waitUntil(page, `document.querySelectorAll('#word-list li').length === 1`, 'the sentence in the list');
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    // (Each box sits in a <label>, which is what is put out of sight.)
    const boxHidden = (id) => page.evaluate(`document.getElementById('${id}').closest('label').hidden`);
    assert.equal(await boxHidden('edit-pinyin-also'), true);
    assert.equal(await boxHidden('edit-cloze'), false);
    assert.equal(await page.evaluate(`document.getElementById('edit-cloze').value`), '嗎');
    // Two cards at most: reading and writing.
    await waitUntil(page, `document.querySelectorAll('#edit-cards li').length === 2`, 'the sentence\'s two cards');
    await type(page, 'edit-definition', 'How are you?');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `!document.getElementById('word-dialog').open`, 'the panel to close');
    greeting = (await stored(page, 'words')).find((word) => word.id === '你好嗎？|sentence');
    assert.equal(greeting.definition, 'How are you?');
    assert.equal(greeting.kind, 'sentence');
    assert.deepEqual(greeting.cloze, { traditional: '嗎', simplified: '吗' });

    // Its characters, pinyin and word to fill in can be changed too. The ID
    // follows the characters, and the old one is remembered.
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await type(page, 'edit-traditional', '你們好嗎？');
    await type(page, 'edit-simplified', '你们好吗？');
    await type(page, 'edit-pinyin', 'Nǐmen hǎo ma?');
    await type(page, 'edit-cloze', '你們');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `!document.getElementById('word-dialog').open`, 'the panel to close');
    const all = await stored(page, 'words');
    assert.equal(all.some((word) => word.id === '你好嗎？|sentence'), false);
    const changed = all.find((word) => word.id === '你們好嗎？|sentence');
    assert.equal(changed.simplified, '你们好吗？');
    assert.equal(changed.pinyin, 'Nǐmen hǎo ma?');
    assert.deepEqual(changed.cloze, { traditional: '你們', simplified: '你们' });
    assert.deepEqual(changed.formerIds, ['你好嗎？|sentence']);
    assert.equal(changed.definition, 'How are you?');
    // A word that is not in the sentence is refused.
    await type(page, 'word-search', '你們好');
    await waitUntil(page, `document.querySelectorAll('#word-list li').length === 1`, 'the changed sentence');
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await type(page, 'edit-cloze', '老師');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('word-dialog-note').textContent === '"老師" is not in the sentence.'`, 'the refusal');
    await tap(page, 'word-dialog-close');
    // A word's panel has all its boxes again.
    await type(page, 'word-search', 'wo3men');
    await waitUntil(page, `document.querySelectorAll('#word-list li').length === 1`, 'the word in the list');
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    assert.equal(await boxHidden('edit-pinyin-also'), false);
    assert.equal(await boxHidden('edit-cloze'), true);
    await tap(page, 'word-dialog-close');
    await type(page, 'word-search', '');
  });

  it('adds sentences from a list, beside its words', async () => {
    await openDeckPage(page);
    // Under "A sentence", a link to the list, which takes sentences too.
    await useAddForm(page, 'add-sentence-fold');
    await tap(page, 'sentence-list-button');
    assert.equal(await page.evaluate(`document.getElementById('add-list-fold').hidden`), false);
    const list = [
      '学习\t學習\txue2xi2\tto study',
      // In both scripts, with a word to fill in.
      '这个老城区保留了很多传统建筑。\t這個老城區保留了很多傳統建築。\tZhège lǎo chéngqū bǎoliú le hěnduō chuántǒng jiànzhù.\tThis old town has kept many traditional buildings.\t保留',
      // In one script, as CSV with commas in quotes; the other script is looked up.
      '即使下雨，我也会去。,"Jíshǐ xiàyǔ, wǒ yě huì qù.","Even if it rains, I will still go.",即使',
      // Already there.
      '我们是同学。\tWe are classmates.',
      // No meaning.
      '谢谢你！\tXièxie nǐ!',
    ].join('\n');
    await pasteList(page, list);
    // Words and sentences on a line each.
    // (The panel is closed in the tests, so the break is looked for, not the text's lines.)
    assert.deepEqual(
      await page.evaluate(`[...document.getElementById('list-report').childNodes].map((node) => node.textContent || node.nodeName)`),
      ['1 word: 1 new, 0 already yours.', 'BR', '3 sentences: 2 new, 1 already yours.'],
    );
    // The first lines as the list has them, words and sentences mixed.
    assert.deepEqual(
      await page.evaluate(`[...document.querySelectorAll('#list-preview li')].map((row) => row.className)`),
      ['', 'sentence', 'sentence', 'sentence'],
    );
    await waitUntil(page, `!document.getElementById('add-list-button').hidden`, 'the add button');
    assert.match(await textOf(page, 'add-list-button'), /^Add 1 word and 2 sentences to /);
    assert.match(await textOf(page, 'list-problems'), /Line 5 .*A sentence needs its meaning\./);
    await tap(page, 'add-list-button');
    await waitUntil(page, `!document.getElementById('list-done').hidden`, 'the list added');
    assert.match(await textOf(page, 'list-done-text'), /2 sentences added to .*They wait in Learn\./);

    const all = await stored(page, 'words');
    const town = all.find((word) => word.id === '這個老城區保留了很多傳統建築。|sentence');
    assert.equal(town.kind, 'sentence');
    assert.equal(town.simplified, '这个老城区保留了很多传统建筑。');
    assert.deepEqual(town.cloze, { simplified: '保留', traditional: '保留' });
    // It waits in Learn (the next test).
    assert.equal(town.learnedAt, undefined);
    const rain = all.find((word) => word.id === '即使下雨，我也會去。|sentence');
    assert.equal(rain.simplified, '即使下雨，我也会去。');
    assert.equal(rain.pinyin, 'Jíshǐ xiàyǔ, wǒ yě huì qù.');
    assert.equal(rain.definition, 'Even if it rains, I will still go.');
    assert.deepEqual(rain.decks, ['chinese']);
    // The sentences come after the new word in the queue.
    const study = all.find((word) => word.id === '學習|xue2xi2');
    assert.ok(study.order < town.order && town.order < rain.order);
  });

  it('teaches sentences in Learn, after the word in their gap', { timeout: 60000 }, async () => {
    const tapFace = () =>
      page.evaluate(`['pointerdown', 'pointerup', 'click'].forEach((type) => document.getElementById('card-face').dispatchEvent(new PointerEvent(type, { bubbles: true, isPrimary: true })))`);
    const current = () => textOf(page, '#learn-strip .current .chip-word');
    const stepOf = (text) => `document.getElementById('card-type').textContent.endsWith(${JSON.stringify(text)})`;
    // Writes a character in the writing area.
    const write = async (char) => {
      await waitUntil(
        page,
        `document.getElementById('stroke-count').textContent.startsWith('1/') && !document.getElementById('writing-area').hasAttribute('data-busy')`,
        `${char} to be writable`,
      );
      const area = await writingArea(page);
      for (const median of loadStrokeData(char).medians) {
        await drawStroke(page, area, median);
      }
    };
    // On to the next character: Enter, as a tap on the area.
    const nextCharacter = async () => {
      for (const type of ['keyDown', 'keyUp']) {
        await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      }
    };
    // "I know this word" (or sentence) on what is up, then the next one.
    const skip = async (expected) => {
      await waitUntil(page, `document.querySelector('#learn-strip .current .chip-word')?.textContent === ${JSON.stringify(expected)}`, expected);
      await tap(page, 'skip-lesson-button');
    };

    // The gap word's writing card asks for the word.
    await tap(page, 'settings-button');
    await choose(page, 'sentence-writing-select', 'word');
    await tap(page, 'settings-close');
    // A sentence before the word in its gap.
    await openDeckPage(page);
    await pasteList(page, '他们支持我。\tTāmen zhīchí wǒ.\tThey support me.\t支持\n支持\t支持\tzhi1chi2\tto support');
    await tap(page, 'add-list-button');
    await waitUntil(page, `!document.getElementById('list-done').hidden`, 'the list added');
    // Queued in the list's order, the sentence first.
    const added = await stored(page, 'words');
    const orderOf = (id) => added.find((word) => word.id === id).order;
    assert.ok(orderOf('他們支持我。|sentence') < orderOf('支持|zhi1chi2'));
    // In the deck's list, a sentence is a row of its own kind (one line under another).
    await waitUntil(page, `document.querySelector('#word-list button.word-entry.sentence') !== null`, 'a sentence row');

    await openLearn(page);
    await skip('我們');
    // The sentence added by hand waits in Learn too, as one of the day's words.
    await waitUntil(page, stepOf('New sentence · step 1 of 4'), 'the sentence\'s first look');
    assert.equal(await current(), '你們…');
    assert.equal(await textOf(page, 'lesson-note'), 'A new sentence.');
    assert.equal(await textOf(page, 'skip-lesson-button'), 'I know this one');
    assert.match(await textOf(page, 'card-face'), /^你們好嗎？/);
    await tap(page, 'lesson-next-button');
    // Read it: the sentence alone, nothing above it; a tap shows the answer.
    await waitUntil(page, stepOf('step 2 of 4'), 'reading it');
    assert.equal(await textOf(page, 'lesson-note'), 'Read it, then tap.');
    assert.equal(await textOf(page, 'prompt-meaning'), '');
    assert.equal(await isShown(page, 'lesson-next-button'), false);
    await tapFace();
    await waitUntil(page, `!document.getElementById('lesson-next-button').hidden`, 'the answer');
    assert.match(await textOf(page, 'card-face'), /How are you\?/);
    await tap(page, 'lesson-next-button');
    // Its gap word over the outline, in the gap of the sentence.
    await waitUntil(page, stepOf('step 3 of 4'), 'the gap word over its outline');
    assert.equal(await textOf(page, 'prompt-meaning'), 'How are you?＿＿好嗎？');
    // Known: its cards are answered Easy.
    await tap(page, 'skip-lesson-button');
    await waitUntil(page, `document.querySelector('#learn-strip .current .chip-word')?.textContent !== '你們…'`, 'the next one');
    const known = (await stored(page, 'cards')).filter((card) => card.id.startsWith('你們好嗎？|sentence'));
    assert.deepEqual(known.map((card) => card.id).sort(), ['你們好嗎？|sentence#meaning', '你們好嗎？|sentence#writing']);

    await skip('學習');
    await skip('這個…');
    await skip('即使…');
    // 支持 before the sentence with it in its gap, though added after it.
    await skip('支持');
    await waitUntil(page, `document.querySelector('#learn-strip .current .chip-word')?.textContent === '他們…'`, 'the sentence after its word');
    await tap(page, 'lesson-next-button');
    await waitUntil(page, stepOf('step 2 of 4'), 'reading it');
    await tapFace();
    await waitUntil(page, `!document.getElementById('lesson-next-button').hidden`, 'the answer');
    await tap(page, 'lesson-next-button');
    await waitUntil(page, stepOf('step 3 of 4'), 'over the outline');
    await write('支');
    await nextCharacter();
    await write('持');
    await waitUntil(page, `!document.getElementById('next-button').hidden`, 'Next step');
    await tap(page, 'next-button');
    await waitUntil(page, stepOf('step 4 of 4'), 'from memory');
    assert.equal(await textOf(page, 'lesson-note'), 'Now from memory.');
    await write('支');
    await nextCharacter();
    await write('持');
    // The gap filled in, the whole sentence shows.
    await waitUntil(page, `document.getElementById('prompt-meaning').textContent === 'They support me.他們支持我。'`, 'the whole sentence');
    await tap(page, 'next-button');

    // Learned: it is in the summary of today's words, on a line of its own.
    await waitUntil(page, `document.querySelector('.learned-word.sentence') !== null`, 'the summary');
    assert.match(await textOf(page, '.learned-word.sentence'), /^他們支持我。They support me\.$/);
    const sentence = (await stored(page, 'words')).find((word) => word.id === '他們支持我。|sentence');
    assert.ok(sentence.learnedAt > sentence.addedAt);
    // Its cards are new in Review now; the sentence added from a word's
    // page was never in Learn and is not among today's words.
    assert.equal(await page.evaluate(`[...document.querySelectorAll('.learned-word')].some((row) => row.textContent.startsWith('我們是同學'))`), false);
  });
});
