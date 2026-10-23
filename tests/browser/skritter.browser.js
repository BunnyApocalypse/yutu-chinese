// Importing from Skritter: choosing the .zip, checking the words it doesn't
// settle, and what the import saves, on a made-up export
// (tests/fixtures/skritter/). The calculation itself is tested in
// tests/skritterImport.test.js; this checks the pop-up, with the app's real
// dictionary, and that the file is read in a real browser.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { startApp, startBrowsers, tap, textOf, waitUntil } from './harness.js';

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

// Hands the pop-up the file as if it had been chosen with the button.
const chooseFile = (page) =>
  page.evaluate(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(fs.readFileSync('tests/fixtures/skritter/export.zip').toString('base64'))}), (c) => c.charCodeAt(0));
    const files = new DataTransfer();
    files.items.add(new File([bytes], 'export.zip'));
    const input = document.getElementById('skritter-file');
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
    return document.getElementById('skritter-file-button').disabled;
  })()`);

const START = 1767240000; // the first session (make-fixture.js)

// One browser, and the steps in order: each builds on the one before.
describe('importing from Skritter', { concurrency: false }, () => {
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

  it('reads the file and asks about the words it does not settle', async () => {
    await tap(page, 'decks-tab');
    await waitUntil(page, `document.querySelectorAll('#deck-list li').length > 0`, 'the Decks tab');
    await tap(page, 'new-deck-button');
    assert.equal(await textOf(page, 'skritter-import-button'), 'Import from Skritter');
    await tap(page, 'skritter-import-button');
    assert.equal(await page.evaluate(`document.getElementById('skritter-dialog').open`), true);
    assert.equal(await page.evaluate(`document.getElementById('new-deck-dialog').open`), false);

    // The button can't be pressed again while the file is read.
    assert.equal(await chooseFile(page), true);
    await waitUntil(page, `!document.getElementById('skritter-check-step').hidden`, 'the check step');
    assert.equal(
      await textOf(page, 'skritter-summary'),
      'In the file: 5 words you studied in Skritter, 8 cards, 10 reviews. 1 word isn’t in the app’s dictionary, so it will be left out.',
    );
    // Skritter's list, named nowhere in the file: a box for its name.
    assert.deepEqual(
      await page.evaluate(`[...document.querySelectorAll('.skritter-list')].map((row) => [row.querySelector('span').textContent, row.querySelector('input').value])`),
      [['3 words in 2 sections: 学习, 你好, 谢谢…', '']],
    );
    // 发: a group with a ticked box for each word it may be, 發 and 髮 among them.
    assert.equal(await textOf(page, 'skritter-check-title'), 'Check 1 word');
    const group = await page.evaluate(`(() => {
      const group = document.querySelector('.skritter-group');
      return {
        heading: group.querySelector('.skritter-group-heading').textContent,
        lang: group.querySelector('.skritter-group-heading span').lang,
        boxes: [...group.querySelectorAll('label')].map((label) => [label.querySelector('span span').textContent, label.querySelector('input').checked]),
        traditionalLang: group.querySelector('label span span').lang,
      };
    })()`);
    assert.equal(group.heading, '发 in Skritter · 1 review');
    assert.equal(group.lang, 'zh-Hans-CN');
    assert.equal(group.traditionalLang, 'zh-Hant-TW');
    const forms = group.boxes.map(([characters]) => characters);
    assert.ok(forms.includes('發') && forms.includes('髮'), forms.join(' '));
    assert.ok(group.boxes.every(([, checked]) => checked));
  });

  it("saves the words, decks and Skritter's schedules, without the words unticked", async () => {
    // Untick every word 发 may be but 發.
    await page.evaluate(`document.querySelectorAll('.skritter-group label').forEach((label) => {
      if (label.querySelector('span span').textContent !== '發') {
        label.querySelector('input').click();
      }
    })`);
    // The list named, as a learner types.
    await page.evaluate(`(() => {
      const input = document.querySelector('.skritter-list input');
      input.value = 'My course';
      input.dispatchEvent(new Event('input'));
    })()`);
    await tap(page, 'skritter-import-now');
    await waitUntil(page, `!document.getElementById('skritter-done-step').hidden`, 'the result');
    assert.match(
      await textOf(page, 'skritter-result'),
      /^Brought over 4 new words\.\s*7 cards keep their schedule from Skritter, with 9 reviews of history\.\s*1 word you had banned in Skritter is suspended\./,
    );
    assert.match(await textOf(page, 'skritter-left-out'), /^1 word was left out\s*㐀\s*To study one, add it yourself/);

    const words = await stored(page, 'words');
    assert.ok(words.some((word) => word.id === '發|fa1' && word.importedAt));
    assert.ok(!words.some((word) => word.traditional === '髮'));
    const decks = await stored(page, 'decks');
    const skritter = decks.find((deck) => deck.name === 'Skritter');
    assert.ok(decks.some((deck) => deck.name === 'Textbook' && deck.parentId === skritter.id));
    const course = decks.find((deck) => deck.name === 'My course');
    assert.equal(course.parentId, skritter.id);
    assert.deepEqual(
      decks.filter((deck) => deck.parentId === course.id).map((deck) => deck.name).sort(),
      ['Section 1', 'Section 2'],
    );
    const card = (await stored(page, 'cards')).find((candidate) => candidate.id === '學習|xue2xi2#writing');
    assert.equal(card.due, (START + 7 * 86400 + 10 + 20 * 86400) * 1000);

    await tap(page, 'skritter-done-button');
    await waitUntil(page, `document.getElementById('deck-list').textContent.includes('Skritter')`, 'the new deck');
  });

  it('adds nothing when the same file is imported again', async () => {
    const reviewsBefore = (await stored(page, 'reviews')).length;
    await tap(page, 'new-deck-button');
    await tap(page, 'skritter-import-button');
    await chooseFile(page);
    await waitUntil(page, `!document.getElementById('skritter-check-step').hidden`, 'the check step');
    await tap(page, 'skritter-import-now');
    await waitUntil(page, `!document.getElementById('skritter-done-step').hidden`, 'the result');
    // 髮 is ticked again this time, and new.
    assert.match(await textOf(page, 'skritter-result'), /4 words you already had were added to the Skritter deck\./);
    assert.match(await textOf(page, 'skritter-result'), /7 cards already studied here were left as they are\./);
    const reviews = await stored(page, 'reviews');
    assert.equal(reviews.filter((review) => review.wordId !== '髮|fa4').length, reviewsBefore);
  });
});
