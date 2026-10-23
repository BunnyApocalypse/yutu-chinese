// Import backup: combining a backup from another device with what is on this
// one, and replacing what is on this one.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, type, textOf, waitUntil, openDeckPage, ANSWER_YES } from './harness.js';

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

// Hands the app a backup as if its file had been chosen with "Import backup".
const chooseBackup = (page, backup) =>
  page.evaluate(`(() => {
    const files = new DataTransfer();
    files.items.add(new File([${JSON.stringify(JSON.stringify(backup))}], 'backup.json', { type: 'application/json' }));
    const input = document.getElementById('import-file');
    input.files = files.files;
    input.dispatchEvent(new Event('change'));
  })()`);

// Waits until the app has loaded again by itself and started.
async function waitForRestart(page) {
  for (let attempt = 0; attempt < 100; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    try {
      const started = await page.evaluate(`!window.loadedBefore && (
        document.getElementById('card-type').textContent !== '' ||
        !document.getElementById('done-panel').hidden)`);
      if (started) {
        return;
      }
    } catch {
      // The page was between two loads; try again.
    }
  }
  throw new Error('The app did not start again.');
}

const DAY = 24 * 60 * 60 * 1000;

// A backup from another device: one word, learned and reviewed there once,
// and a deck of its own.
function otherDevice(now) {
  const cat = {
    id: '貓|mao1',
    traditional: '貓',
    simplified: '猫',
    pinyin: 'mao1',
    definition: 'cat',
    order: 0,
    addedAt: now - 3 * DAY,
    learnedAt: now - 2 * DAY,
    decks: ['animals'],
    changedAt: now - 2 * DAY,
  };
  const fsrsState = {
    due: new Date(now + 5 * DAY).toISOString(),
    stability: 3,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 5,
    learning_steps: 0,
    reps: 1,
    lapses: 0,
    state: 2,
    last_review: new Date(now - 2 * DAY).toISOString(),
  };
  return {
    format: 'hanzi-trainer-backup',
    version: 2,
    exportedAt: new Date(now).toISOString(),
    words: [cat],
    cards: [
      {
        id: '貓|mao1#meaning',
        wordId: cat.id,
        type: 'meaning',
        due: now + 5 * DAY,
        firstReviewedAt: now - 2 * DAY,
        lastReviewedAt: now - 2 * DAY,
        fsrsState,
      },
    ],
    reviews: [
      { id: 'review-from-the-other-device', cardId: '貓|mao1#meaning', wordId: cat.id, type: 'meaning', time: now - 2 * DAY, grade: 3, script: 'traditional' },
    ],
    settings: [
      { key: 'newWordsPerDay', value: 12, changedAt: now + DAY },
      { key: 'welcomeDone', value: false, changedAt: now + DAY },
    ],
    removed: [],
    decks: [{ id: 'animals', name: 'Animals', parentId: null, order: 1, changedAt: now - 3 * DAY }],
  };
}

// One browser, and the steps in order: each builds on the one before.
describe('importing a backup', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;
  let backup;

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    backup = otherDevice(Date.now());
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('says what is in the backup and what combining would bring', async () => {
    // A word of this device's own.
    await openDeckPage(page);
    await type(page, 'add-traditional', '愛');
    await type(page, 'add-simplified', '爱');
    await type(page, 'add-pinyin', 'ai4');
    await type(page, 'add-definition', 'to love');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('word-count').textContent === '1'`, 'the word');

    await chooseBackup(page, backup);
    await waitUntil(page, `document.getElementById('import-dialog').open`, 'the import panel');
    assert.match(await textOf(page, 'import-backup-text'), /^In the backup: 1 word, 1 card studied, 1 review/);
    assert.match(await textOf(page, 'import-device-text'), /^On this device now: 1 word, 0 cards studied, 0 reviews, no reviews/);
    assert.equal(
      await textOf(page, 'import-combine-text'),
      'Combining would bring this device: 1 new word, 1 new deck, 1 new review, 1 card with a new schedule, 1 setting changed on the other device.',
    );
    // Cancel changes nothing.
    await tap(page, 'import-cancel-button');
    assert.equal(await page.evaluate(`document.getElementById('import-dialog').open`), false);
    assert.equal((await stored(page, 'words')).length, 1);
  });

  it('combines the backup with what is on the device', async () => {
    await chooseBackup(page, backup);
    await waitUntil(page, `document.getElementById('import-dialog').open`, 'the import panel');
    await page.evaluate('window.loadedBefore = true');
    await tap(page, 'import-combine-button');
    await waitForRestart(page);

    assert.deepEqual((await stored(page, 'words')).map((word) => word.id).sort(), ['愛|ai4', '貓|mao1']);
    assert.deepEqual((await stored(page, 'cards')).map((card) => card.id), ['貓|mao1#meaning']);
    assert.equal((await stored(page, 'reviews')).length, 1);
    assert.deepEqual((await stored(page, 'decks')).map((deck) => deck.id).sort(), ['animals', 'chinese']);
    const settings = Object.fromEntries((await stored(page, 'settings')).map((setting) => [setting.key, setting.value]));
    assert.equal(settings.newWordsPerDay, 12);
    // The introduction, done on this device, does not come up again.
    assert.equal(settings.welcomeDone, true);
    assert.equal(await page.evaluate(`document.getElementById('welcome').open`), false);

    // The app shows both words, and the other device's deck.
    await tap(page, 'decks-tab');
    await tap(page, 'my-decks-button');
    await waitUntil(page, `document.getElementById('word-count').textContent === '2'`, 'both words');
    assert.match(await textOf(page, 'deck-list'), /Animals/);
  });

  it('has nothing to combine the second time', async () => {
    await chooseBackup(page, backup);
    await waitUntil(page, `document.getElementById('import-dialog').open`, 'the import panel');
    assert.match(await textOf(page, 'import-combine-text'), /^Combining would change nothing/);
    assert.equal(await page.evaluate(`document.getElementById('import-combine-button').disabled`), true);
  });

  it('replaces everything when asked to', async () => {
    // The pop-up that asks before everything is replaced: answer OK.
    await page.evaluate(`${ANSWER_YES}; window.loadedBefore = true`);
    await tap(page, 'import-replace-button');
    await waitForRestart(page);
    assert.deepEqual((await stored(page, 'words')).map((word) => word.id), ['貓|mao1']);
    assert.equal((await stored(page, 'settings')).some((setting) => setting.key === 'importUnfinished'), false);
  });

  it('saves a big backup in parts', async () => {
    // More reviews than replaceEverything (db.js) saves in one transaction.
    const reviews = Array.from({ length: 4500 }, (_, i) => ({ ...backup.reviews[0], id: `review-${i}`, time: backup.reviews[0].time - i }));
    await chooseBackup(page, { ...backup, reviews });
    await waitUntil(page, `document.getElementById('import-dialog').open`, 'the import panel');
    await page.evaluate(`${ANSWER_YES}; window.loadedBefore = true`);
    await tap(page, 'import-replace-button');
    await waitForRestart(page);
    assert.equal((await stored(page, 'reviews')).length, 4500);
    assert.equal((await stored(page, 'settings')).some((setting) => setting.key === 'importUnfinished'), false);
  });

  it('says so when the last import did not finish', async () => {
    // As replaceEverything leaves it when the app is closed halfway.
    await page.evaluate(`new Promise((resolve, reject) => {
      const request = indexedDB.open('hanzi-trainer');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction(['settings'], 'readwrite');
        tx.objectStore('settings').put({ key: 'importUnfinished', value: Date.now() });
        tx.oncomplete = () => {
          request.result.close();
          resolve();
        };
      };
    })`);
    await page.evaluate('window.loadedBefore = true');
    await page.send('Page.reload');
    let shown = false;
    for (let attempt = 0; attempt < 100 && !shown; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Fails while the page is between two loads; then it is looked at again.
      shown = await page.evaluate(`!window.loadedBefore && document.getElementById('confirm-dialog').open`).catch(() => false);
    }
    assert.ok(shown, 'the message came up');
    assert.equal(await textOf(page, 'confirm-question'), 'The last import did not finish');
    await tap(page, 'confirm-yes');
    await waitForRestart(page);
  });
});
