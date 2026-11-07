// Tests for the sync server (server/server.js) and the app's side of it
// (src/syncServer.js): each test starts a server of its own, on a free
// port, keeping its files in a folder of its own.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createSyncServer } from '../server/server.js';
import { serverStorage, readServerAddress, serverAnswers } from '../src/syncServer.js';
import { createSync } from '../src/sync.js';
import { makeCode, keysFor } from '../src/syncCode.js';
import { twoDevices, memoryDevice, learnersData } from './fixtures/devices.js';

const ORIGIN = 'https://bunnyapocalypse.github.io';

// Starts a server; `settings` as in server.js. Returns { address, folder,
// close }.
async function startServer(settings = {}) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'yutu-sync-'));
  const server = await createSyncServer({ dataDir: folder, log: false, ...settings });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    address: `http://127.0.0.1:${server.address().port}`,
    folder,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await fs.rm(folder, { recursive: true, force: true });
    },
  };
}

// Runs `work` with a server, closing it after.
async function withServer(settings, work) {
  const server = await startServer(settings);
  try {
    await work(server);
  } finally {
    await server.close();
  }
}

// A learner's account: the keys of a new sync code and the storage on the
// server.
async function account(address) {
  const keys = await keysFor(await makeCode());
  return { keys, storage: serverStorage({ address, account: keys.account, access: keys.access }) };
}

const bytes = (text) => new TextEncoder().encode(text);

test('saves, lists, reads and deletes files', () =>
  withServer({}, async ({ address }) => {
    const { storage } = await account(address);
    assert.deepEqual(await storage.list(), []);
    await storage.save('batch-0a-0000000001', bytes('one'));
    await storage.save('batch-0a-0000000002', bytes('two!'));
    assert.deepEqual(
      (await storage.list()).sort((a, b) => (a.name < b.name ? -1 : 1)),
      [
        { name: 'batch-0a-0000000001', size: 3 },
        { name: 'batch-0a-0000000002', size: 4 },
      ],
    );
    assert.equal(new TextDecoder().decode(await storage.read('batch-0a-0000000002')), 'two!');
    await storage.remove('batch-0a-0000000001');
    assert.deepEqual((await storage.list()).map((file) => file.name), ['batch-0a-0000000002']);
    // Deleting a file that isn't there is no error.
    await storage.remove('batch-0a-0000000001');
    await assert.rejects(storage.read('batch-0a-0000000001'), { reason: 'not-found' });
  }));

test('never replaces a file', () =>
  withServer({}, async ({ address }) => {
    const { storage } = await account(address);
    await storage.save('batch-0a-0000000001', bytes('first'));
    await assert.rejects(storage.save('batch-0a-0000000001', bytes('second')), { reason: 'exists' });
    assert.equal(new TextDecoder().decode(await storage.read('batch-0a-0000000001')), 'first');
  }));

test('an account answers only to its own access secret', () =>
  withServer({}, async ({ address }) => {
    const { keys, storage } = await account(address);
    await storage.save('batch-0a-0000000001', bytes('mine'));
    const stranger = serverStorage({ address, account: keys.account, access: (await account(address)).keys.access });
    await assert.rejects(stranger.list(), { reason: 'refused' });
    await assert.rejects(stranger.read('batch-0a-0000000001'), { reason: 'refused' });
    await assert.rejects(stranger.remove('batch-0a-0000000001'), { reason: 'refused' });
    await assert.rejects(stranger.save('batch-0a-0000000002', bytes('theirs')), { reason: 'refused' });
    await assert.rejects(stranger.removeAll(), { reason: 'refused' });
    assert.equal((await storage.list()).length, 1);
    // No secret at all, or one of the wrong form.
    for (const authorization of [undefined, 'Bearer ', 'Bearer xyz', `Basic ${keys.access}`]) {
      const response = await fetch(`${address}/v1/accounts/${keys.account}`, {
        headers: authorization ? { Authorization: authorization } : {},
      });
      assert.equal(response.status, 403, String(authorization));
    }
  }));

test('accounts are kept apart', () =>
  withServer({}, async ({ address }) => {
    const one = await account(address);
    const two = await account(address);
    await one.storage.save('batch-0a-0000000001', bytes('one'));
    assert.deepEqual(await two.storage.list(), []);
    await assert.rejects(two.storage.read('batch-0a-0000000001'), { reason: 'not-found' });
  }));

test('keeps only a hash of the access secret, and nothing outside the account\'s folder', () =>
  withServer({}, async ({ address, folder }) => {
    const { keys, storage } = await account(address);
    await storage.save('batch-0a-0000000001', bytes('one'));
    assert.deepEqual(await fs.readdir(folder), [keys.account]);
    const inside = await fs.readdir(path.join(folder, keys.account));
    assert.deepEqual(inside.sort(), ['.access', 'batch-0a-0000000001']);
    const stored = await fs.readFile(path.join(folder, keys.account, '.access'));
    assert.equal(stored.length, 32);
    assert.ok(!stored.toString('hex').includes(keys.access));
  }));

test('refuses names and accounts that could reach outside their folder', () =>
  withServer({}, async ({ address }) => {
    const { keys, storage } = await account(address);
    await storage.save('batch-0a-0000000001', bytes('one'));
    const headers = { Authorization: `Bearer ${keys.access}` };
    // (A name such as %2e%2e never reaches the server as one: fetch reads it
    // as "..", going up a level, as any browser does.)
    for (const name of ['.access', '..%2F..%2Fetc', 'Batch', '-x', 'a.b', 'a'.repeat(101)]) {
      const response = await fetch(`${address}/v1/accounts/${keys.account}/files/${name}`, { headers });
      assert.ok([400, 404].includes(response.status), `${name}: ${response.status}`);
    }
    for (const id of ['..', keys.account.toUpperCase(), keys.account.slice(1), `${keys.account}0`]) {
      const response = await fetch(`${address}/v1/accounts/${id}`, { headers });
      assert.ok([400, 404].includes(response.status), `${id}: ${response.status}`);
    }
    // The secret's hash is not to be read as a file either.
    await assert.rejects(storage.read('.access'));
  }));

test('refuses a file too large, and an account or server too full', () =>
  withServer({ maxFileBytes: 100, maxAccountBytes: 250, maxTotalBytes: 450 }, async ({ address }) => {
    const { storage } = await account(address);
    await assert.rejects(storage.save('big', new Uint8Array(101)), { reason: 'too-large' });
    await storage.save('one', new Uint8Array(100));
    await storage.save('two', new Uint8Array(100));
    // 200, with the secret's hash (32 bytes): one more of 100 would be over 250.
    await assert.rejects(storage.save('three', new Uint8Array(100)), { reason: 'account-full' });
    // The server holds 232; another account's 32 and 100 make 364, and
    // another 100 would be over 450.
    const other = await account(address);
    await other.storage.save('one', new Uint8Array(100));
    await assert.rejects(other.storage.save('two', new Uint8Array(100)), { reason: 'server-full' });
    // Deleting makes room again.
    await storage.removeAll();
    await other.storage.save('two', new Uint8Array(100));
  }));

test('deleting an account deletes all its files', () =>
  withServer({}, async ({ address, folder }) => {
    const { storage } = await account(address);
    await storage.save('one', bytes('1'));
    await storage.save('two', bytes('2'));
    await storage.removeAll();
    assert.deepEqual(await fs.readdir(folder), []);
    assert.deepEqual(await storage.list(), []);
  }));

test('answers pages of the allowed sites only', () =>
  withServer({}, async ({ address }) => {
    const { keys } = await account(address);
    const url = `${address}/v1/accounts/${keys.account}`;
    // A browser's question before a request with a secret.
    const asked = await fetch(url, { method: 'OPTIONS', headers: { Origin: ORIGIN } });
    assert.equal(asked.status, 204);
    assert.equal(asked.headers.get('access-control-allow-origin'), ORIGIN);
    assert.match(asked.headers.get('access-control-allow-headers'), /Authorization/);
    const allowed = await fetch(url, { headers: { Origin: ORIGIN, Authorization: `Bearer ${keys.access}` } });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.headers.get('access-control-allow-origin'), ORIGIN);
    assert.equal(allowed.headers.get('cache-control'), 'no-store');
    for (const origin of ['https://example.com', 'https://bunnyapocalypse.github.io.example.com', 'null']) {
      const refused = await fetch(url, { headers: { Origin: origin, Authorization: `Bearer ${keys.access}` } });
      assert.equal(refused.status, 403, origin);
      assert.equal(refused.headers.get('access-control-allow-origin'), null);
    }
  }));

test('limits requests and new accounts from one address', async () => {
  await withServer({ requestsPerAddressPerMinute: 5 }, async ({ address }) => {
    const { storage } = await account(address);
    for (let count = 0; count < 5; count++) {
      await storage.list();
    }
    await assert.rejects(storage.list(), { reason: 'too-many' });
  });
  await withServer({ newAccountsPerAddressPerDay: 2 }, async ({ address }) => {
    for (let count = 0; count < 2; count++) {
      await (await account(address)).storage.save('one', bytes('1'));
    }
    await assert.rejects((await account(address)).storage.save('one', bytes('1')), { reason: 'too-many' });
  });
});

test('paused, it answers only whether it is up', () =>
  withServer({ paused: true }, async ({ address }) => {
    assert.equal(await (await fetch(`${address}/v1/health`)).text(), 'ok');
    const { storage } = await account(address);
    await assert.rejects(storage.list(), { reason: 'paused' });
  }));

test('a server that can\'t be reached is "offline"', async () => {
  const server = await startServer();
  const { address } = server;
  await server.close();
  const { storage } = await account(address);
  await assert.rejects(storage.list(), { reason: 'offline' });
});

test('two devices sync through the server, and it holds nothing readable', () =>
  withServer({}, async ({ address, folder }) => {
    const { mine, theirs } = twoDevices();
    const { keys, storage } = await account(address);
    const a = memoryDevice(mine, { before: true });
    const b = memoryDevice(theirs, { before: true });
    const syncA = createSync({ local: a, storage, key: keys.encryption }).syncNow;
    const syncB = createSync({ local: b, storage, key: keys.encryption, snapshotAfterBytes: 1 }).syncNow;
    await syncA();
    const second = await syncB();
    assert.equal(second.snapshotMade, true);
    await syncA();
    assert.deepEqual(learnersData(a.data()), learnersData(b.data()));
    for (const name of await fs.readdir(path.join(folder, keys.account))) {
      const seen = (await fs.readFile(path.join(folder, keys.account, name))).toString('latin1');
      for (const piece of ['ai4', 'love', 'meaning', Buffer.from('愛').toString('latin1')]) {
        assert.ok(!seen.includes(piece), `${piece} in ${name}`);
      }
    }
  }));

test('deletes accounts unused for a year, and a request counts as use', () =>
  withServer({}, async ({ address, folder }) => {
    const old = await account(address);
    const used = await account(address);
    await old.storage.save('one', new Uint8Array(100));
    await used.storage.save('one', new Uint8Array(100));
    // Both last used two years ago, as their secrets' files say.
    const longAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
    for (const { keys } of [old, used]) {
      await fs.utimes(path.join(folder, keys.account, '.access'), longAgo, longAgo);
    }
    // One is used now. (Through a second server on the same folder: the
    // first has marked both today already, when they were made, and marks
    // an account at most once a day.)
    const second = await createSyncServer({ dataDir: folder, log: false });
    await new Promise((resolve) => second.listen(0, '127.0.0.1', resolve));
    try {
      const secondAddress = `http://127.0.0.1:${second.address().port}`;
      await serverStorage({ address: secondAddress, account: used.keys.account, access: used.keys.access }).list();
      assert.equal(await second.expireUnused(), 1);
      assert.deepEqual(await fs.readdir(folder), [used.keys.account]);
      // With 0 days, never.
      const keeping = await createSyncServer({ dataDir: folder, log: false, expireDays: 0 });
      await fs.utimes(path.join(folder, used.keys.account, '.access'), longAgo, longAgo);
      assert.equal(await keeping.expireUnused(), 0);
    } finally {
      await new Promise((resolve) => second.close(resolve));
    }
  }));

test('a device whose account was deleted for being unused sends everything again', () =>
  withServer({}, async ({ address, folder }) => {
    const { mine } = twoDevices();
    const { keys, storage } = await account(address);
    const a = memoryDevice(mine, { before: true });
    const syncA = createSync({ local: a, storage, key: keys.encryption }).syncNow;
    await syncA();
    // A year and more later, the account is gone.
    await fs.rm(path.join(folder, keys.account), { recursive: true });
    const result = await syncA();
    assert.equal(result.startedAfresh, true);
    assert.ok((await storage.list()).some((file) => file.name.startsWith('batch-')));
  }));

test('a server address typed in Settings is read, or said what is wrong with it', () => {
  assert.deepEqual(readServerAddress(' https://sync.example.org/ '), { address: 'https://sync.example.org' });
  assert.deepEqual(readServerAddress('https://sync.example.org:8443'), { address: 'https://sync.example.org:8443' });
  assert.deepEqual(readServerAddress('http://localhost:8787'), { address: 'http://localhost:8787' });
  assert.deepEqual(readServerAddress('http://sync.example.org'), { reason: 'notSecure' });
  assert.deepEqual(readServerAddress('sync.example.org'), { reason: 'notAddress' });
  assert.deepEqual(readServerAddress('https://sync.example.org/path'), { reason: 'notAddress' });
  assert.deepEqual(readServerAddress('javascript:alert(1)'), { reason: 'notAddress' });
});

test('whether a server answers', () =>
  withServer({}, async ({ address }) => {
    assert.equal(await serverAnswers(address), true);
    assert.equal(await serverAnswers('http://127.0.0.1:9'), false);
  }));
