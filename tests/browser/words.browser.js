// The Decks tab in a real browser: add a word, find it, have it come up in
// Review, change it, add a list, remove a word, and check that it all
// survives closing and reopening the app.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, reloadApp, tap, type, choose, textOf, waitUntil, addTestWords, openDeckPage, openLearn, ANSWER_YES, openSettings, useAddForm } from './harness.js';

// Text for "the Decks tab's list has this many rows".
const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;
const wordCount = (page) => textOf(page, 'word-count').then(Number);

// One browser, and the steps in order: each builds on the one before.
describe('the Decks tab', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;
  let countAtStart;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // The app starts without any words, and says so in Review.
    await tap(page, 'review-tab');
    await waitUntil(
      page,
      `document.getElementById('done-message').textContent === 'You have no words yet.'`,
      'the note that there are no words',
    );
    await openDeckPage(page);
    assert.equal(await textOf(page, 'word-count'), '0');
    await addTestWords(page);
    // The pop-up that asks before a word is removed: answer OK.
    await page.evaluate(ANSWER_YES);
    await openDeckPage(page);
    await waitUntil(page, `document.getElementById('word-count').textContent !== '0'`, 'the word list');
    countAtStart = await wordCount(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('adds a typed word', async () => {
    await type(page, 'add-traditional', '貓頭鷹');
    await type(page, 'add-simplified', '猫头鹰');
    await type(page, 'add-pinyin', 'mao1 tou2 ying1');
    assert.equal(await textOf(page, 'add-pinyin-preview'), 'māo tóu yīng');
    await type(page, 'add-definition', 'owl');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('word-count').textContent === '${countAtStart + 1}'`);
    assert.match(await textOf(page, 'add-word-note'), /^Added 貓頭鷹/);
    // A word still to be learned can be learned at once (tested below, in
    // Learn); typing the next word puts the button away.
    // (The panel is left closed in the tests, so the button is checked for
    // being switched on, not for being in view.)
    const learnNowOn = `!document.getElementById('add-learn-now').hidden`;
    assert.equal(await page.evaluate(learnNowOn), true);
    await type(page, 'add-traditional', '貓');
    assert.equal(await page.evaluate(learnNowOn), false);
    await type(page, 'add-traditional', '');
  });

  it('refuses the same word twice, and a word with bad pinyin', async () => {
    await type(page, 'add-traditional', '貓頭鷹');
    await type(page, 'add-pinyin', 'mao1tou2ying1');
    await type(page, 'add-definition', 'owl again');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.includes('already')`);

    await type(page, 'add-pinyin', 'māotóuyīng');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.includes('tone numbers')`);
    assert.equal(await wordCount(page), countAtStart + 1);
  });

  it('finds the word by searching', async () => {
    await type(page, 'word-search', 'owl');
    await waitUntil(page, rows(1));
    const row = await textOf(page, '#word-list li');
    assert.match(row, /貓頭鷹 · 猫头鹰/);
    assert.match(row, /māotóuyīng/);
    assert.match(row, /waiting$/);
  });

  it('changes the meaning and moves the word to the front', async () => {
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await type(page, 'edit-definition', 'owl (the bird)');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.querySelector('#word-list li').textContent.includes('the bird')`);

    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await tap(page, 'study-next-button');
    await type(page, 'word-search', '');
    await waitUntil(page, `document.querySelector('#word-list li').textContent.includes('貓頭鷹')`, 'the word at the top of the list');
  });

  it('brings the word up as the next one in the Learn tab', async () => {
    await openLearn(page);
    // A lesson starts with a look at the word.
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('貓頭鷹')`, 'the lesson for the new word');
    assert.equal(await textOf(page, 'words-panel'), '');
  });

  it('fills in a word from the dictionary', async () => {
    await openDeckPage(page);
    // (An empty form: a field with something typed in it is left alone.)
    for (const field of ['traditional', 'simplified', 'pinyin', 'definition']) {
      await type(page, `add-${field}`, '');
    }
    await type(page, 'add-simplified', '图书馆');
    await waitUntil(page, `document.querySelector('#add-suggestions button') !== null`, 'a dictionary entry');
    assert.match(await textOf(page, '#add-suggestions button'), /圖書館 · 图书馆.*túshūguǎn.*library/);
    // Filled in by itself, from the first entry, without a tap.
    const fields = () => page.evaluate(`['traditional', 'simplified', 'pinyin', 'definition'].map(
      (name) => document.getElementById('add-' + name).value)`);
    await waitUntil(page, `document.getElementById('add-pinyin').value !== ''`, 'the fields filled in');
    assert.deepEqual(await fields(), ['圖書館', '图书馆', 'tu2shu1guan3', 'library']);
    assert.match(await textOf(page, '#add-suggestions button'), /filled in$/);

    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('word-count').textContent === '${countAtStart + 2}'`);
    assert.equal(await textOf(page, 'add-suggestions'), '');
  });

  it('fills in another reading when its entry is tapped, and keeps a meaning typed by hand', async () => {
    await type(page, 'add-traditional', '行');
    await waitUntil(page, `document.querySelectorAll('#add-suggestions button').length > 1`, 'the entries for 行');
    // The dictionary lists háng first; the usual reading, from the HSK list, is filled in.
    await waitUntil(page, `document.getElementById('add-pinyin').value === 'xing2'`, 'the usual reading of 行');
    // Tapping another entry fills in that one, and it stays.
    await page.evaluate(`document.querySelectorAll('#add-suggestions button')[0].click()`);
    assert.equal(await page.evaluate(`document.getElementById('add-pinyin').value`), 'hang2');
    assert.match(await textOf(page, '#add-suggestions button'), /filled in$/);
    // A meaning typed by hand stays when the characters change.
    await type(page, 'add-definition', 'my own meaning');
    await type(page, 'add-traditional', '走');
    await waitUntil(page, `document.getElementById('add-pinyin').value === 'zou3'`, 'the reading of 走');
    assert.equal(await page.evaluate(`document.getElementById('add-definition').value`), 'my own meaning');
    // Characters the dictionary does not have take out what was filled in by itself.
    await type(page, 'add-traditional', '');
    await waitUntil(page, `document.getElementById('add-pinyin').value === ''`, 'the reading taken out');
    await type(page, 'add-definition', '');
  });

  it('says so when the characters typed are in the list already', async () => {
    await type(page, 'add-traditional', '圖書館');
    await waitUntil(page, `document.getElementById('add-suggestions').textContent.includes('Already in your words')`);
    await type(page, 'add-traditional', '');
  });

  it('finds a word by its pinyin, for a learner without a Chinese keyboard', async () => {
    const entries = `document.querySelectorAll('#add-suggestions .word-entry')`;
    await type(page, 'add-traditional', 'shi4');
    await waitUntil(page, `${entries}.length === 8`, 'the first eight words read shì');
    // The words of the lists first.
    assert.match(await textOf(page, '#add-suggestions .word-entry'), /^是/);
    // Nothing is filled in until a word is chosen.
    assert.equal(await page.evaluate(`document.getElementById('add-pinyin').value`), '');
    // Tones were typed, so there is no advice to type them.
    assert.doesNotMatch(await textOf(page, 'add-suggestions'), /Add tone numbers/);
    await page.evaluate(`document.querySelector('#add-suggestions .more-entries').click()`);
    await waitUntil(page, `${entries}.length === 16`, 'eight more words');

    await type(page, 'add-traditional', 'shi');
    await waitUntil(page, `${entries}.length === 8`, 'the list starting again from eight');
    assert.match(await textOf(page, 'add-suggestions'), /Add tone numbers/);

    // Pinyin left in the box is not added as the word.
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    assert.match(await textOf(page, 'add-word-note'), /Choose the word from the list/);

    // A word the test list has is marked, and a tap fills in the form.
    await type(page, 'add-traditional', 'peng you');
    await waitUntil(page, `${entries}.length > 0`, 'the words read péngyou');
    assert.match(await textOf(page, '#add-suggestions .word-entry'), /^朋友.*in your words$/);
    await page.evaluate(`${entries}[0].click()`);
    const fields = await page.evaluate(`['traditional', 'simplified', 'pinyin'].map(
      (name) => document.getElementById('add-' + name).value)`);
    assert.deepEqual(fields, ['朋友', '', 'peng2you5']);
    assert.notEqual(await page.evaluate(`document.getElementById('add-definition').value`), '');
    // The box now has characters, so the dictionary's entries for them are listed.
    assert.match(await textOf(page, '#add-suggestions .word-entry'), /filled in$/);
    for (const field of ['traditional', 'simplified', 'pinyin', 'definition']) {
      await type(page, `add-${field}`, '');
    }
    await page.evaluate(`document.getElementById('add-word-note').textContent = ''`);
  });

  it('fills in as much of the meaning as the setting asks for', async () => {
    // Types the word, taps its dictionary entry and returns the meaning filled in.
    const meaningFilledIn = async () => {
      await type(page, 'add-traditional', '');
      await type(page, 'add-traditional', '聯絡');
      await waitUntil(page, `document.querySelector('#add-suggestions button') !== null`, 'a dictionary entry');
      await page.evaluate(`document.querySelector('#add-suggestions button').click()`);
      return page.evaluate(`document.getElementById('add-definition').value`);
    };
    const everyday = 'to get in touch with; to contact; to stay in contact (with); liaison';
    assert.equal(await meaningFilledIn(), everyday);
    await choose(page, 'meaning-detail-select', 'first');
    assert.equal(await meaningFilledIn(), 'to get in touch with');
    await choose(page, 'meaning-detail-select', 'all');
    assert.equal(await meaningFilledIn(), `${everyday}; (math.) connection`);
    await choose(page, 'meaning-detail-select', 'everyday');
    for (const field of ['traditional', 'simplified', 'pinyin', 'definition']) {
      await type(page, `add-${field}`, '');
    }
  });

  it('explains that setting when its "?" is tapped', async () => {
    await openSettings(page, 'settings-learning');
    assert.equal(await textOf(page, 'meaning-detail-hint'), '');
    await tap(page, 'meaning-detail-help');
    assert.match(await textOf(page, 'meaning-detail-hint'), /specialist field/);
    await tap(page, 'meaning-detail-help');
    assert.equal(await textOf(page, 'meaning-detail-hint'), '');
    await tap(page, 'settings-close');
  });

  it('adds a list, pasted as CSV', async () => {
    await useAddForm(page, 'add-list-fold');
    await type(
      page,
      'list-text',
      '猫头鹰,貓頭鷹,mao1tou2ying1,owl\n企鹅,企鵝,qi4e2,"penguin, the bird"\n孔雀,孔雀,kong3que4,peacock\nnot a word\n',
    );
    await tap(page, 'check-list-button');
    assert.equal(await textOf(page, 'list-report'), "2 new words, 1 you already have, 1 line that can't be read.");
    assert.match(await textOf(page, 'list-problems'), /^Line 4/);
    await tap(page, 'add-list-button');
    await waitUntil(page, `document.getElementById('word-count').textContent === '${countAtStart + 4}'`);
    await type(page, 'word-search', 'penguin');
    await waitUntil(page, rows(1));
    assert.match(await textOf(page, '#word-list li'), /penguin, the bird/);
  });

  it('adds a ready-made list by level', { timeout: 60000 }, async () => {
    const before = await wordCount(page);
    await tap(page, 'ready-decks-button');
    // HSK 3.0 is offered first; its levels appear with their word counts.
    await waitUntil(page, `document.querySelectorAll('#ready-levels li').length === 7`, 'the levels of HSK 3.0');
    assert.match(await textOf(page, '#ready-levels li span'), /^Level 1: 512 words, \d+ new$/);
    // Taiwan's list has two levels with names of their own, then five.
    await page.evaluate(`document.querySelector('#ready-list button[data-list="tocfl"]').click()`);
    await waitUntil(page, `document.querySelector('#ready-levels li span')?.textContent.startsWith('Novice 1:')`, 'the levels of TOCFL');
    assert.equal(await page.evaluate(`document.querySelectorAll('#ready-levels li').length`), 7);
    // The older list has six, each with a button that adds it.
    await page.evaluate(`document.querySelector('#ready-list button[data-list="hsk-2.0"]').click()`);
    await waitUntil(page, `document.querySelectorAll('#ready-levels li').length === 6`, 'the levels of HSK 2.0');
    const level = await textOf(page, '#ready-levels li span');
    assert.match(level, /^Level 1: 150 words, \d+ new$/);
    const adding = Number(level.match(/(\d+) new/)[1]);
    // Some of the 150 are among the test words already.
    assert.ok(adding > 50 && adding < 150, level);

    await page.evaluate(`document.querySelector('#ready-levels button[data-level="1"]').click()`);
    // Reading the dictionary and adding the words takes a few seconds.
    let report = '';
    for (let attempt = 0; attempt < 120 && !report.startsWith('Added'); attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      report = await textOf(page, 'ready-report');
    }
    assert.match(report, new RegExp(`^Added ${adding} words`));
    assert.match(report, /in the deck HSK 1 \(2\.0\) under My decks/);
    await waitUntil(page, `document.querySelector('#ready-levels li span')?.textContent === 'Level 1: 150 words, all in your words already'`, 'the level counted afresh');
    // They are under My decks, in a deck of their own: the front page has
    // the level's deck beside the one the app started with, and all words.
    await tap(page, 'my-decks-button');
    await page.evaluate(`document.querySelector('#deck-path button').click()`);
    await waitUntil(page, `document.querySelectorAll('#deck-list li').length === 2`, 'the two decks');
    assert.match(await textOf(page, '#deck-list li:first-child .deck-entry'), /^HSK 1 \(2\.0\)150 words · 0 learned \(0%\) · 11 decks insideTap to learn$/);
    assert.equal(await wordCount(page), before + adding);
    // The steps after this one count from the start; they count these in too.
    countAtStart += adding;
    // A word from the list has both scripts, and its meaning from the dictionary.
    await type(page, 'word-search', '不客气');
    await waitUntil(page, rows(1));
    const row = await textOf(page, '#word-list li');
    assert.match(row, /^不客氣 · 不客气/);
    assert.match(row, /you're welcome/);
    // Back to the search the next step expects.
    await type(page, 'word-search', 'penguin');
    await waitUntil(page, rows(1));
  });

  it('removes a word', async () => {
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await tap(page, 'remove-word-button');
    await waitUntil(page, rows(0));
    assert.equal(await wordCount(page), countAtStart + 3);
  });

  it('keeps it all when the app is opened again', async () => {
    await reloadApp(page);
    await openLearn(page);
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('貓頭鷹')`, 'the word still first in line');
    // The front page of Decks lists every word.
    await tap(page, 'decks-tab');
    await waitUntil(page, `document.getElementById('word-count').textContent === '${countAtStart + 3}'`);
    await type(page, 'word-search', 'peacock');
    await waitUntil(page, rows(1));
  });
});
