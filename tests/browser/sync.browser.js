// Syncing's part of the database (sync.md): the outbox of changes to send,
// and taking in a batch from another device, in a real browser's IndexedDB.
// The calculation itself is tested in tests/syncBatch.test.js.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startApp, startBrowsers, tap, waitUntil, ANSWER_YES } from './harness.js';

const NOW = Date.now();

const love = { id: '愛|ai4', traditional: '愛', simplified: '爱', pinyin: 'ai4', definition: 'love', order: 0 };
const cat = { id: '貓|mao1', traditional: '貓', simplified: '猫', pinyin: 'mao1', definition: 'cat', order: 1 };
const loveCard = { id: '愛|ai4#meaning', wordId: love.id, type: 'meaning', due: NOW, firstReviewedAt: NOW, fsrsState: null };
const loveReview = { id: 'review-1', cardId: loveCard.id, wordId: love.id, type: 'meaning', time: NOW, grade: 3, script: 'traditional' };

// One browser, and the steps in order: each builds on the one before.
describe('syncing in the database', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Runs `code` in the page with the app's own modules, as `db` and `sync`
  // (the same modules the app has loaded, so setOutboxOn reaches it), and
  // returns what it returns.
  const inApp = (code) =>
    page.evaluate(`(async () => {
      const db = await import('/src/db.js');
      const sync = await import('/src/syncBatch.js');
      ${code}
    })()`);

  const outboxKeys = () => inApp(`return (await db.getAll('outbox')).map((entry) => entry.key).sort();`);

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

  it('has the outbox and the sync store, and notes nothing while sync is off', async () => {
    const names = await page.evaluate(`new Promise((resolve) => {
      const request = indexedDB.open('hanzi-trainer');
      request.onsuccess = () => {
        resolve([...request.result.objectStoreNames]);
        request.result.close();
      };
    })`);
    assert.ok(names.includes('outbox') && names.includes('sync'), names.join(', '));
    await inApp(`await db.putAll('words', [${JSON.stringify(love)}]); await db.setSetting('newWordsPerDay', 7);`);
    assert.deepEqual(await outboxKeys(), []);
  });

  it('notes each change while sync is on, once per record', async () => {
    await inApp(`
      db.setOutboxOn(true);
      await db.putAll('words', [${JSON.stringify(love)}]);
      await db.putAll('words', [{ ...${JSON.stringify(love)}, definition: 'to love' }]);
      await db.saveReview(${JSON.stringify(loveCard)}, ${JSON.stringify(loveReview)});
      await db.setSetting('lastBackupAt', 1);
      await db.putAll('words', [${JSON.stringify(cat)}], { stamp: false });
      await db.removeDecks(['old-deck']);
    `);
    // The word tidied with { stamp: false } is not sent; the last backup's
    // time (a device setting) is noted, and left out when the batch is made.
    assert.deepEqual(await outboxKeys(), ['removed:old-deck', 'reviews:review-1', 'settings:lastBackupAt', 'words:愛|ai4']);
    const batch = await inApp(`
      const { records } = await db.readOutbox();
      return sync.buildBatch({ device: 'A', number: 1, madeAt: 0, records });
    `);
    assert.deepEqual(batch.words.map((word) => word.definition), ['to love']);
    assert.deepEqual(batch.reviews.map((review) => review.id), ['review-1']);
    assert.deepEqual(batch.settings, []);
    assert.deepEqual(batch.removed.map((mark) => mark.id), ['old-deck']);
  });

  it('takes sent entries off the outbox, but not one changed again meanwhile', async () => {
    await inApp(`
      const { entries } = await db.readOutbox();
      await db.putAll('words', [{ ...${JSON.stringify(love)}, definition: 'to love; love' }]);
      await db.takeOffOutbox(entries);
    `);
    assert.deepEqual(await outboxKeys(), ['words:愛|ai4']);
  });

  it('takes in another device\'s batch without noting it in the outbox', async () => {
    const theirReview = { ...loveReview, id: 'review-2', time: NOW + 60000, grade: 1 };
    const changes = await inApp(`
      const batch = sync.buildBatch({ device: 'B', number: 1, madeAt: 0, records: {
        words: [{ ...${JSON.stringify(cat)}, changedAt: ${NOW} }],
        reviews: [${JSON.stringify(theirReview)}],
      } });
      const words = await db.getAll('words');
      const slice = await db.readSlice(sync.wordsTouched(batch, words));
      const changes = sync.applyBatch(slice, batch);
      await db.saveTakenIn(changes);
      return changes;
    `);
    assert.deepEqual(changes.put.reviews.map((review) => review.id), ['review-2']);
    const stored = await inApp(`return {
      reviews: (await db.getReviewsOfWord('愛|ai4')).map((review) => review.id).sort(),
      card: (await db.getSome('cards', ['愛|ai4#meaning']))[0],
      cat: (await db.getSome('words', ['貓|mao1']))[0],
    };`);
    assert.deepEqual(stored.reviews, ['review-1', 'review-2']);
    // The card was worked out again from both reviews: the second, Again,
    // brings it back within minutes.
    assert.ok(stored.card.due < NOW + 60000 + 60 * 60 * 1000, String(stored.card.due - NOW));
    assert.equal(stored.cat.changedAt, NOW);
    assert.deepEqual(await outboxKeys(), ['words:愛|ai4']);
  });

  it('syncs with another device through a storage, encrypted, with the real database', async () => {
    const result = await inApp(`
      const { createSync, encodeFile, decodeFile } = await import('/src/sync.js');
      const { makeCode, keysFor } = await import('/src/syncCode.js');
      const files = new Map();
      const storage = {
        list: async () => [...files].map(([name, bytes]) => ({ name, size: bytes.length })),
        read: async (name) => files.get(name),
        save: async (name, bytes) => {
          if (files.has(name)) throw Object.assign(new Error('exists'), { reason: 'exists' });
          files.set(name, bytes);
        },
        remove: async (name) => files.delete(name),
      };
      const key = (await keysFor(await makeCode())).encryption;
      db.setOutboxOn(true);
      // Another device's batch, as it would have saved it.
      const theirName = 'batch-0b0b-0000000001';
      files.set(theirName, await encodeFile(sync.buildBatch({ device: '0b0b', number: 1, madeAt: 0, records: {
        words: [{ id: '茶|cha2', traditional: '茶', simplified: '茶', pinyin: 'cha2', definition: 'tea', order: 2, changedAt: ${NOW} }],
      } }), key, theirName));
      const outcome = await createSync({ local: db, storage, key }).syncNow();
      db.setOutboxOn(false);
      const mine = [...files.keys()].find((name) => name !== theirName);
      const sent = await decodeFile(files.get(mine), key, mine);
      return {
        outcome,
        sentWords: sent.words.map((word) => word.id),
        tea: (await db.getSome('words', ['茶|cha2'])).length,
        outbox: (await db.getAll('outbox')).length,
        readable: new TextDecoder('latin1').decode(files.get(mine)).includes('ai4'),
      };
    `);
    assert.equal(result.outcome.sent, 1);
    assert.equal(result.outcome.takenIn, 1);
    assert.deepEqual(result.outcome.problems, []);
    assert.deepEqual(result.sentWords, ['愛|ai4']);
    assert.equal(result.tea, 1);
    assert.equal(result.outbox, 0);
    assert.equal(result.readable, false);
    // Back to sync on, for the next step.
    await inApp(`db.setOutboxOn(true);`);
  });

  it('sends everything after a backup replaces everything', async () => {
    const batch = await inApp(`
      const data = await db.readEverything();
      await db.replaceEverything(data);
      const { records } = await db.readOutbox();
      db.setOutboxOn(false);
      return sync.buildBatch({ device: 'A', number: 2, madeAt: 0, records });
    `);
    assert.deepEqual(await outboxKeys(), ['everything']);
    assert.deepEqual(batch.words.map((word) => word.id).sort(), ['愛|ai4', '茶|cha2', '貓|mao1']);
    assert.deepEqual(batch.reviews.map((review) => review.id).sort(), ['review-1', 'review-2']);
    assert.equal(batch.cards.length, 1);
  });

  // The same through Import backup's panel, whose saving runs on a second
  // thread (importWorker.js) with its own copy of db.js: the page tells it
  // whether sync is on. Without that, an import would quietly stop reaching
  // the other devices.
  for (const syncOn of [true, false]) {
    it(`sends everything after Import backup replaces everything${syncOn ? '' : ', only while sync is on'}`, async () => {
      await inApp(`await db.forgetSync(); db.setOutboxOn(${syncOn});`);
      assert.deepEqual(await outboxKeys(), []);
      await page.evaluate(`(async () => {
        const backup = await (await import('/src/backup.js')).buildBackup();
        const files = new DataTransfer();
        files.items.add(new File([JSON.stringify(backup)], 'backup.json', { type: 'application/json' }));
        const input = document.getElementById('import-file');
        input.files = files.files;
        input.dispatchEvent(new Event('change'));
      })()`);
      await waitUntil(page, `document.getElementById('import-dialog').open`, 'the import panel', 20000);
      await page.evaluate(`${ANSWER_YES}; window.loadedBefore = true`);
      await tap(page, 'import-replace-button');
      // Saved, then the app loads again by itself.
      for (let attempt = 0; ; attempt++) {
        assert.ok(attempt < 200, 'the app did not load again');
        await new Promise((resolve) => setTimeout(resolve, 100));
        const loaded = await page.evaluate(`!window.loadedBefore && document.readyState === 'complete'`).catch(() => false);
        if (loaded) {
          break;
        }
      }
      assert.deepEqual(await outboxKeys(), syncOn ? ['everything'] : []);
    });
  }
});
