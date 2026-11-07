// Settings › Your data and backups › Sync between devices (syncPanel.js,
// syncControl.js), against a sync server of the test's own
// (server/server.js), started on a free port with its files in a folder of
// its own.
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { startApp, startBrowsers, tap, type, waitUntil, openSettings, textOf, ANSWER_YES } from './harness.js';
import { createSyncServer } from '../../server/server.js';

// The files the server holds, all accounts together.
async function filesOnServer(folder) {
  const names = [];
  for (const account of await fs.readdir(folder)) {
    names.push(...(await fs.readdir(path.join(folder, account))).filter((name) => !name.startsWith('.')));
  }
  return names;
}

const shown = (id) => `!document.getElementById('${id}').hidden`;
const CODE_SHOWN = /^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/;

// One browser, and the steps in order: each builds on the one before.
describe('sync in Settings', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;
  let server;
  let folder;
  let code;

  before(async () => {
    app = await startApp();
    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'yutu-sync-settings-'));
    server = await createSyncServer({ dataDir: folder, log: false, allowedOrigins: [new URL(app.url).origin] });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    // This device syncs with the test's server.
    await page.evaluate(`import('/src/db.js').then((db) => db.setSyncValue('server', 'http://127.0.0.1:${server.address().port}'))`);
    await page.evaluate(ANSWER_YES);
    await openSettings(page, 'settings-data');
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    await new Promise((resolve) => server?.close(resolve));
    await fs.rm(folder, { recursive: true, force: true });
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('offers sync, and shows a new code before turning anything on', async () => {
    assert.ok(await page.evaluate(shown('sync-setting')));
    assert.ok(await page.evaluate(shown('sync-off')));
    await tap(page, 'sync-on-button');
    await waitUntil(page, shown('sync-code-step'), 'the code');
    assert.match(await textOf(page, 'sync-code'), CODE_SHOWN);
    // Cancel: nothing was turned on or sent.
    await tap(page, 'sync-code-cancel');
    await waitUntil(page, shown('sync-off'), 'sync off again');
    assert.deepEqual(await filesOnServer(folder), []);
  });

  it('turns sync on with the code once it is saved, and sends this device\'s data', async () => {
    await tap(page, 'sync-on-button');
    await waitUntil(page, shown('sync-code-step'), 'the code');
    code = await textOf(page, 'sync-code');
    await tap(page, 'sync-file-button');
    await waitUntil(page, `document.getElementById('sync-code-note').textContent.includes('yutu-chinese-sync-code.txt')`, 'the file saved');
    await tap(page, 'sync-saved-button');
    await waitUntil(page, `document.getElementById('sync-status').textContent.startsWith('Last synced')`, 'the first sync');
    assert.ok(await page.evaluate(shown('sync-on')));
    assert.equal((await filesOnServer(folder)).filter((name) => name.startsWith('batch-')).length, 1);
    // The data group says the words are synced now.
    assert.match(await textOf(page, '#settings-data .hint'), /synced/);
  });

  it('shows the code again only after a warning, and hides it again', async () => {
    await tap(page, 'sync-show-code-button');
    await waitUntil(page, shown('sync-code-step'), 'the code');
    assert.equal(await textOf(page, 'sync-code'), code);
    assert.ok(await page.evaluate(`document.getElementById('sync-saved-button').hidden`));
    await tap(page, 'sync-code-hide');
    await waitUntil(page, shown('sync-on'), 'sync on again');
  });

  it('turns sync off, keeping the words and forgetting the code', async () => {
    await tap(page, 'sync-off-button');
    await waitUntil(page, shown('sync-off'), 'sync off');
    const kept = await page.evaluate(`import('/src/db.js').then(async (db) => ({
      code: await db.getSyncValue('code', null),
      outbox: (await db.getAll('outbox')).length,
    }))`);
    assert.deepEqual(kept, { code: null, outbox: 0 });
  });

  it('joins with a code typed in, telling a typing mistake apart', async () => {
    // The server's address went with the rest; this device is pointed at
    // the test's server again.
    await page.evaluate(`import('/src/db.js').then((db) => db.setSyncValue('server', 'http://127.0.0.1:${server.address().port}'))`);
    await tap(page, 'sync-join-button');
    const wrong = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6);
    await type(page, 'sync-code-input', wrong);
    await page.evaluate(`document.getElementById('sync-join-form').requestSubmit()`);
    await waitUntil(page, shown('sync-join-error'), 'the mistake');
    assert.match(await textOf(page, 'sync-join-error'), /wrong/);
    // Typed in small letters without dashes: read all the same.
    await type(page, 'sync-code-input', code.replace(/-/g, '').toLowerCase());
    await page.evaluate(`document.getElementById('sync-join-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('sync-status').textContent.startsWith('Last synced')`, 'the sync');
    assert.equal(await textOf(page, 'sync-status').then((text) => text.includes('didn')), false);
  });

  it('deletes everything synced after asking, and turns sync off', async () => {
    assert.ok((await filesOnServer(folder)).length > 0);
    await tap(page, 'sync-delete-button');
    await waitUntil(page, shown('sync-off'), 'sync off');
    assert.deepEqual(await fs.readdir(folder), []);
  });
});
