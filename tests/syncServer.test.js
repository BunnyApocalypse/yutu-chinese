// Tests for the sync server (server/server.js) and the app's side of it
// (src/syncServer.js): each test starts a server of its own, on a free
// port, keeping its files in a folder of its own.
//
// Run with: npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { createSyncServer, addressKey } from '../server/server.js';
import { serverStorage, readServerAddress, serverAnswers } from '../src/syncServer.js';
import { createSync } from '../src/sync.js';
import { makeCode, keysFor } from '../src/syncCode.js';
import { twoDevices, memoryDevice, learnersData } from './fixtures/devices.js';

const ORIGIN = 'https://bunnyapocalypse.github.io';

// Starts a server; `settings` as in server.js. Returns { address, folder,
// server, close }.
async function startServer(settings = {}) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'yutu-sync-'));
  const server = await createSyncServer({ dataDir: folder, log: false, print: () => {}, ...settings });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    address: `http://127.0.0.1:${server.address().port}`,
    folder,
    server,
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

// Saves a file as a learner at `from` would, through Caddy, which says who
// is asking (X-Forwarded-For; the server trusts it with trustProxy).
// Returns the status.
async function saveFrom(address, from, keys, name = 'one') {
  const response = await fetch(`${address}/v1/accounts/${keys.account}/files/${name}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${keys.access}`, 'X-Forwarded-For': from },
    body: bytes('1'),
  });
  return response.status;
}

test('an IPv6 address counts by its /64 block', () => {
  assert.equal(addressKey('192.0.2.7'), '192.0.2.7');
  assert.equal(addressKey('::ffff:192.0.2.7'), '192.0.2.7');
  assert.equal(addressKey('2001:db8:1:2:3:4:5:6'), '2001:db8:1:2::/64');
  assert.equal(addressKey('2001:0db8:0001:0002::'), '2001:db8:1:2::/64');
  assert.equal(addressKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(addressKey('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(addressKey('::1'), '0:0:0:0::/64');
  assert.equal(addressKey('64:ff9b::192.0.2.7'), '64:ff9b:0:0::/64');
  // By its /48 block, for new accounts.
  assert.equal(addressKey('2001:db8:1:2:3:4:5:6', 3), '2001:db8:1::/48');
});

test('requests count by account, so learners sharing an address don\'t limit each other', () =>
  withServer({ requestsPerAccountPerMinute: 5, requestsPerAddressPerMinute: 3 }, async ({ address }) => {
    // Each save makes its account: before it exists, counted by address.
    const one = await account(address);
    const two = await account(address);
    await one.storage.save('one', bytes('1'));
    await two.storage.save('one', bytes('1'));
    for (let count = 0; count < 5; count++) {
      await one.storage.list();
    }
    await assert.rejects(one.storage.list(), { reason: 'too-many' });
    // The other learner, at the same address, is not held up.
    await two.storage.list();
  }));

test('refused requests count by address, without holding up its learners', () =>
  withServer({ requestsPerAddressPerMinute: 3 }, async ({ address }) => {
    const learner = await account(address);
    await learner.storage.save('one', bytes('1'));
    const stranger = serverStorage({ address, account: learner.keys.account, access: (await account(address)).keys.access });
    // The save above was one, before its account existed.
    await assert.rejects(stranger.list(), { reason: 'refused' });
    await assert.rejects(stranger.list(), { reason: 'refused' });
    await assert.rejects(stranger.list(), { reason: 'too-many' });
    assert.equal((await fetch(`${address}/v1/health`)).status, 429);
    await learner.storage.list();
  }));

test('limits new accounts by address (an IPv6 block as one) and in all', async () => {
  await withServer({ newAccountsPerAddressPerDay: 2, trustProxy: true }, async ({ address }) => {
    assert.equal(await saveFrom(address, '2001:db8:1:2::1', (await account(address)).keys), 201);
    assert.equal(await saveFrom(address, '2001:db8:1:2::2', (await account(address)).keys), 201);
    assert.equal(await saveFrom(address, '2001:db8:1:2:ffff::3', (await account(address)).keys), 429);
    // Another block, another household.
    assert.equal(await saveFrom(address, '2001:db8:1:3::1', (await account(address)).keys), 201);
  });
  await withServer({ newAccountsPerDay: 2, trustProxy: true }, async ({ address }) => {
    assert.equal(await saveFrom(address, '192.0.2.1', (await account(address)).keys), 201);
    assert.equal(await saveFrom(address, '192.0.2.2', (await account(address)).keys), 201);
    assert.equal(await saveFrom(address, '192.0.2.3', (await account(address)).keys), 429);
  });
  // A generous address (a university's) may make ten times as many.
  await withServer({ newAccountsPerAddressPerDay: 1, generousAddresses: ['192.0.2.0/24'], trustProxy: true }, async ({ address }) => {
    for (let count = 0; count < 10; count++) {
      assert.equal(await saveFrom(address, '192.0.2.9', (await account(address)).keys), 201);
    }
    assert.equal(await saveFrom(address, '192.0.2.9', (await account(address)).keys), 429);
    assert.equal(await saveFrom(address, '198.51.100.1', (await account(address)).keys), 201);
    assert.equal(await saveFrom(address, '198.51.100.1', (await account(address)).keys), 429);
  });
});

test('a few sources can\'t use up the day\'s new accounts for everyone', async () => {
  // An IPv6 /48 block (one home's /56 is in one) gets four addresses' worth,
  // however many /64s it uses.
  await withServer({ newAccountsPerAddressPerDay: 1, trustProxy: true }, async ({ address }) => {
    for (let block = 0; block < 4; block++) {
      assert.equal(await saveFrom(address, `2001:db8:1:${block}::1`, (await account(address)).keys), 201);
    }
    assert.equal(await saveFrom(address, '2001:db8:1:ff::1', (await account(address)).keys), 429);
    assert.equal(await saveFrom(address, '2001:db8:2:0::1', (await account(address)).keys), 201);
  });
  // An address refused again and again uses none of the whole server's.
  await withServer({ newAccountsPerAddressPerDay: 1, newAccountsPerDay: 2, trustProxy: true }, async ({ address }) => {
    assert.equal(await saveFrom(address, '192.0.2.1', (await account(address)).keys), 201);
    for (let tries = 0; tries < 5; tries++) {
      assert.equal(await saveFrom(address, '192.0.2.1', (await account(address)).keys), 429);
    }
    assert.equal(await saveFrom(address, '192.0.2.2', (await account(address)).keys), 201);
  });
});

test('limits files being saved at once from one address, across its accounts', () =>
  withServer({ uploadsAtOncePerAddress: 1 }, async ({ address }) => {
    const first = await account(address);
    const second = await account(address);
    await first.storage.save('one', bytes('1'));
    await second.storage.save('one', bytes('1'));
    // A save of the first account's that has begun and not ended.
    const url = new URL(`${address}/v1/accounts/${first.keys.account}/files/slow`);
    const slow = http.request(url, { method: 'PUT', headers: { Authorization: `Bearer ${first.keys.access}` } }, (response) => response.resume());
    const ended = new Promise((resolve) => slow.on('close', resolve));
    slow.write('part');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await assert.rejects(second.storage.save('two', bytes('2')), { reason: 'too-many' });
    slow.end('end');
    await ended;
    await second.storage.save('two', bytes('2'));
  }));

test('keeps the last of the room for accounts already there', () =>
  withServer({ maxTotalBytes: 1000, newAccountsUntilPercent: 50 }, async ({ address }) => {
    const { storage } = await account(address);
    await storage.save('one', new Uint8Array(500));
    // The server holds 532 of 1000: no new account, but this one goes on.
    await assert.rejects((await account(address)).storage.save('one', bytes('1')), { reason: 'server-full' });
    await storage.save('two', new Uint8Array(100));
  }));

test('limits files being saved at once by one account', () =>
  withServer({ uploadsAtOncePerAccount: 1 }, async ({ address }) => {
    const { keys, storage } = await account(address);
    await storage.save('one', bytes('1'));
    // A save that has begun and not ended (a slow connection).
    const url = new URL(`${address}/v1/accounts/${keys.account}/files/slow`);
    let answered;
    const slow = http.request(url, { method: 'PUT', headers: { Authorization: `Bearer ${keys.access}` } }, (response) => {
      answered = response.statusCode;
      response.resume();
    });
    const ended = new Promise((resolve) => slow.on('close', resolve));
    slow.write('part');
    await new Promise((resolve) => setTimeout(resolve, 100));
    await assert.rejects(storage.save('two', bytes('2')), { reason: 'too-many' });
    slow.end('end');
    await ended;
    assert.equal(answered, 201);
    // Sent in parts, without saying its size up front: kept whole.
    assert.equal(new TextDecoder().decode(await storage.read('slow')), 'partend');
    await storage.save('two', bytes('2'));
  }));

test('limits what one account takes in an hour', () =>
  withServer({ downloadBytesPerAccountPerHour: 250 }, async ({ address }) => {
    const { storage } = await account(address);
    await storage.save('one', new Uint8Array(100));
    await storage.read('one');
    await storage.read('one');
    await assert.rejects(storage.read('one'), { reason: 'too-many' });
  }));

test('writes the limits hit to the log, with the address only for those of one address', async () => {
  const lines = [];
  await withServer(
    { print: (line) => lines.push(line), requestsPerAddressPerMinute: 1, maxAccountBytes: 100 },
    async ({ address, server }) => {
      const { storage } = await account(address);
      await storage.save('one', new Uint8Array(50));
      await assert.rejects(storage.save('two', new Uint8Array(50)), { reason: 'account-full' });
      // The first save was the address's one request (its account was not
      // made yet): these are over.
      await fetch(`${address}/v1/health`);
      await fetch(`${address}/v1/health`);
      server.writeLimits();
      assert.deepEqual(lines.sort(), ['LIMIT account-full refused 1', 'LIMIT requests-per-address refused 2 from 127.0.0.1']);
      // Written once: nothing new, no line.
      server.writeLimits();
      assert.equal(lines.length, 2);
    },
  );
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
    // B sent everything just now: its snapshot waits for its next sync,
    // so as not to pack it all twice at once.
    assert.equal((await syncB()).snapshotMade, false);
    await syncA();
    assert.equal((await syncB()).snapshotMade, true);
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
