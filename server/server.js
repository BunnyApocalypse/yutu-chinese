// The sync server of 玉兔中文 (Yutu Chinese): a small box of files, one
// folder per learner. It understands nothing of the app: every file it
// holds was encrypted on the learner's device, and it can read none of them
// (docs/sync.md). Plain Node, no dependencies; HTTPS comes from Caddy in
// front of it.
//
// Copyright the 玉兔中文 authors. GPL-3.0-only (LICENSE at the top of the
// repository).
//
// What it answers, all under /v1:
//
//   GET    /v1/health                           "ok", for a watch on the server
//   GET    /v1/accounts/<account>               the files, as [{ name, size }]
//   DELETE /v1/accounts/<account>               every file of the account
//   GET    /v1/accounts/<account>/files/<name>  a file
//   PUT    /v1/accounts/<account>/files/<name>  saves a file; refused if one
//                                               of that name is there
//   DELETE /v1/accounts/<account>/files/<name>  deletes a file
//
// <account> is 32 hexadecimal letters, worked out from the learner's sync
// code (syncCode.js in the app). Every request but health carries the
// account's access secret, also from the code ("Authorization: Bearer …").
// The first file saved to an account fixes it: the server keeps only its
// SHA-256 hash (in the account's folder, `.access`), and from then on
// refuses any other. So knowing an account ID is not enough to read or
// delete anything.
//
// An account not used for EXPIRE_DAYS (365 unless set: the owner,
// 2026-11-07) is deleted, so the server keeps nothing nobody uses. "Used"
// is any request with the account's secret, from any of its devices; the
// time is kept as the `.access` file's modification time, renewed at most
// once a day. Once a day the server looks through the accounts. A device
// coming back after that finds its files gone and sends everything again
// (sync.js, startAfresh): nothing a device has is lost.
//
// The limits (the owner, 2026-11-08) are counted by account wherever the
// request carries an account's working secret, so learners sharing one
// internet address (a university, a household) never use up each other's;
// by address only for what has no account yet: new accounts, and requests
// refused or without a secret. An IPv6 address counts by its /64 block (a
// home or phone has a whole one, and could otherwise change address at
// will). A limit hit is written to the log once a minute as a line starting
// "LIMIT", with the address only for the limits one address went over (the
// privacy page says so; the server's log keeps it at most 14 days:
// deploy/templates/journald-yutu.conf). The server's watch reports those
// lines, without the addresses (deploy/templates/healthcheck.sh.j2).
//
// An error is answered with its status and { reason }, a word the app acts
// on: 'bad-request', 'refused', 'not-found', 'exists', 'too-large',
// 'account-full', 'server-full', 'too-many', 'paused', 'origin'.
//
// Run with: node server/server.js (settings from the environment, below).

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MB = 1024 * 1024;

// The settings, each with what it is when not given.
export const DEFAULTS = {
  port: 8787,
  // Where the files are kept: a folder per account.
  dataDir: './sync-data',
  // The addresses of the pages allowed to call the server from a browser
  // (CORS, below).
  allowedOrigins: ['https://bunnyapocalypse.github.io'],
  // The largest file: the owner's whole snapshot is about 6 MB.
  maxFileBytes: 64 * MB,
  // The most one account may hold: two snapshots and the batches since.
  maxAccountBytes: 256 * MB,
  // The most the whole server may hold, so the disk never fills.
  maxTotalBytes: 30 * 1024 * MB,
  // New accounts only while the server holds less than this share of
  // maxTotalBytes: the rest is kept for the learners already there, so
  // someone filling the server can't stop their syncing.
  newAccountsUntilPercent: 80,
  // New accounts a day: in all, and from one address (a whole class
  // turning sync on together at a university).
  newAccountsPerDay: 100,
  newAccountsPerAddressPerDay: 50,
  // Requests a minute from one account (a device joining takes in a
  // snapshot and up to a few hundred batches at once), and from one address
  // without a working secret (refused, or an account not made yet).
  requestsPerAccountPerMinute: 1200,
  requestsPerAddressPerMinute: 600,
  // Files being saved at once, by one account and in all.
  uploadsAtOncePerAccount: 4,
  uploadsAtOnce: 32,
  // What one account may take in an hour: a device joining takes a few
  // megabytes, or tens.
  downloadBytesPerAccountPerHour: 1024 * MB,
  // Addresses or blocks (such as a university's, '192.0.2.0/24' or
  // '2001:db8::/48') whose limits by address are ten times as high.
  generousAddresses: [],
  // Behind Caddy, the learner's address comes in X-Forwarded-For, which
  // Caddy sets; trusted only when the server is reached through it.
  trustProxy: false,
  // Syncing switched off for everyone at once (docs/sync.md, "a switch").
  paused: false,
  // An account unused this many days is deleted (0: never).
  expireDays: 365,
  // One line per request (method, what, status), never an account, an
  // address or anything in a file.
  log: true,
  // Where the log's lines go (the tests catch them).
  print: console.log,
};

// How much higher the limits by address are for generousAddresses.
const GENEROUS_TIMES = 10;

// The settings from the environment, as on the server (server/README.md).
export function settingsFromEnvironment(env = process.env) {
  const number = (name, fallback) => (env[name] ? Number(env[name]) : fallback);
  return {
    ...DEFAULTS,
    port: number('PORT', DEFAULTS.port),
    dataDir: env.DATA_DIR || DEFAULTS.dataDir,
    allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()) : DEFAULTS.allowedOrigins,
    maxFileBytes: number('MAX_FILE_MB', DEFAULTS.maxFileBytes / MB) * MB,
    maxAccountBytes: number('MAX_ACCOUNT_MB', DEFAULTS.maxAccountBytes / MB) * MB,
    maxTotalBytes: number('MAX_TOTAL_MB', DEFAULTS.maxTotalBytes / MB) * MB,
    newAccountsUntilPercent: number('NEW_ACCOUNTS_UNTIL_PERCENT', DEFAULTS.newAccountsUntilPercent),
    newAccountsPerDay: number('NEW_ACCOUNTS_PER_DAY', DEFAULTS.newAccountsPerDay),
    newAccountsPerAddressPerDay: number('NEW_ACCOUNTS_PER_ADDRESS_PER_DAY', DEFAULTS.newAccountsPerAddressPerDay),
    requestsPerAccountPerMinute: number('REQUESTS_PER_ACCOUNT_PER_MINUTE', DEFAULTS.requestsPerAccountPerMinute),
    requestsPerAddressPerMinute: number('REQUESTS_PER_ADDRESS_PER_MINUTE', DEFAULTS.requestsPerAddressPerMinute),
    uploadsAtOncePerAccount: number('UPLOADS_AT_ONCE_PER_ACCOUNT', DEFAULTS.uploadsAtOncePerAccount),
    uploadsAtOnce: number('UPLOADS_AT_ONCE', DEFAULTS.uploadsAtOnce),
    downloadBytesPerAccountPerHour: number('DOWNLOAD_MB_PER_ACCOUNT_PER_HOUR', DEFAULTS.downloadBytesPerAccountPerHour / MB) * MB,
    generousAddresses: (env.GENEROUS_ADDRESSES || '').split(',').map((entry) => entry.trim()).filter(Boolean),
    trustProxy: env.TRUST_PROXY === '1',
    paused: env.SYNC_PAUSED === '1',
    expireDays: number('EXPIRE_DAYS', DEFAULTS.expireDays),
    log: env.LOG !== '0',
  };
}

const ACCOUNT = /^[0-9a-f]{32}$/;
const ACCESS = /^[0-9a-f]{64}$/;
// A file's name: small letters, digits and dashes, not starting with a dash.
// No dots and no slashes, so a name can never reach outside its folder or
// name the `.access` file.
const NAME = /^[a-z0-9][a-z0-9-]{0,99}$/;

const sha256 = (text) => crypto.createHash('sha256').update(text).digest();

const DAY_MS = 24 * 60 * 60 * 1000;

// An error answered as { reason } with its status.
class Refusal extends Error {
  constructor(status, reason) {
    super(reason);
    this.status = status;
    this.reason = reason;
  }
}

// Past this many addresses or accounts in one stretch, new ones are all
// counted together: someone changing address at will limits themselves
// instead of filling the server's memory.
const MOST_COUNTED = 100000;

// Counts by address or account over a stretch of time (requests, or bytes
// with `amount`), forgetting each stretch when it is over.
function counter(stretchMs) {
  const counts = new Map();
  let started = Date.now();
  return (key, amount = 1) => {
    if (Date.now() - started > stretchMs) {
      counts.clear();
      started = Date.now();
    }
    if (!counts.has(key) && counts.size >= MOST_COUNTED) {
      key = 'many';
    }
    const count = (counts.get(key) || 0) + amount;
    counts.set(key, count);
    return count;
  };
}

// What an address is counted as: an IPv4 address as it is (also when it
// comes as IPv6, ::ffff:192.0.2.1), an IPv6 address by its /64 block, the
// first four of its eight groups (a home, an office or a phone gets a whole
// block, and can pick any address in it).
export function addressKey(address = '') {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) {
    return mapped[1];
  }
  if (!net.isIPv6(address)) {
    return address;
  }
  // "::" stands for as many groups of zeros as are missing; an IPv4 address
  // written at the end counts as two groups. (%eth0 and such: which network
  // card, not part of the address.)
  const groupsOf = (part) => (part ? part.split(':').flatMap((group) => (group.includes('.') ? ['0', '0'] : [group])) : []);
  const halves = address.split('%')[0].toLowerCase().split('::');
  const head = groupsOf(halves[0]);
  const tail = halves.length > 1 ? groupsOf(halves[1]) : [];
  const groups = halves.length > 1 ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  return `${groups.slice(0, 4).map((group) => parseInt(group, 16).toString(16)).join(':')}::/64`;
}

// Whether an address is one of `entries` ('192.0.2.7', '192.0.2.0/24',
// '2001:db8::/48'), with Node's own list of addresses and blocks.
function addressList(entries) {
  const list = new net.BlockList();
  for (const entry of entries) {
    const [address, prefix] = entry.split('/');
    const type = net.isIPv6(address) ? 'ipv6' : 'ipv4';
    if (prefix) {
      list.addSubnet(address, Number(prefix), type);
    } else {
      list.addAddress(address, type);
    }
  }
  return (address = '') => {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    const plain = mapped ? mapped[1] : address.split('%')[0];
    const version = net.isIP(plain);
    return version !== 0 && list.check(plain, version === 6 ? 'ipv6' : 'ipv4');
  };
}

// Makes the server (not yet listening). settings: as DEFAULTS, any left out
// as there.
export async function createSyncServer(given = {}) {
  const settings = { ...DEFAULTS, ...given };
  const dataDir = path.resolve(settings.dataDir);
  await fs.mkdir(dataDir, { recursive: true });

  // How much the server holds, worked out once and then kept up to date.
  let totalBytes = 0;
  for (const account of await fs.readdir(dataDir)) {
    totalBytes += await accountBytes(path.join(dataDir, account));
  }

  const requestsByAccount = counter(60 * 1000);
  const requestsByAddress = counter(60 * 1000);
  const accountsByAddress = counter(DAY_MS);
  const accountsInAll = counter(DAY_MS);
  const downloadsByAccount = counter(60 * 60 * 1000);
  const isGenerous = addressList(settings.generousAddresses);
  // Files being saved now, by account, and in all.
  const uploadsByAccount = new Map();
  let uploads = 0;

  // The limits hit since the log was last written, as "limit|address" (the
  // address left empty for the limits of the whole server or an account's
  // room) and how many times.
  const limitsHit = new Map();

  // A refusal for a limit, noted for the log.
  function overLimit(limit, address, status, reason) {
    const key = `${limit}|${address ?? ''}`;
    limitsHit.set(key, (limitsHit.get(key) || 0) + 1);
    return new Refusal(status, reason);
  }

  // Writes the limits hit to the log, one line each, and forgets them.
  function writeLimits() {
    for (const [key, count] of limitsHit) {
      const [limit, address] = key.split('|');
      settings.print(`LIMIT ${limit} refused ${count}${address ? ` from ${address}` : ''}`);
    }
    limitsHit.clear();
  }

  function folderOf(account) {
    if (!ACCOUNT.test(account)) {
      throw new Refusal(400, 'bad-request');
    }
    return path.join(dataDir, account);
  }

  function fileIn(folder, name) {
    if (!NAME.test(name)) {
      throw new Refusal(400, 'bad-request');
    }
    return path.join(folder, name);
  }

  // Checks the access secret against the one the account was made with.
  // Returns true if the account exists, false if not (yet).
  async function checkAccess(request, folder) {
    const match = /^Bearer ([0-9a-f]+)$/.exec(request.headers.authorization || '');
    if (!match || !ACCESS.test(match[1])) {
      throw new Refusal(403, 'refused');
    }
    let stored;
    try {
      stored = await fs.readFile(path.join(folder, '.access'));
    } catch (error) {
      if (error.code === 'ENOENT') {
        return false;
      }
      throw error;
    }
    // Compared in a time that doesn't depend on where they differ.
    if (!crypto.timingSafeEqual(stored, sha256(match[1]))) {
      throw new Refusal(403, 'refused');
    }
    await markUsed(folder);
    return true;
  }

  // Notes that an account was used, at most once a day (see the top).
  const markedAt = new Map();
  async function markUsed(folder) {
    const now = Date.now();
    if (now - (markedAt.get(folder) ?? 0) < DAY_MS) {
      return;
    }
    markedAt.set(folder, now);
    const time = new Date(now);
    await fs.utimes(path.join(folder, '.access'), time, time);
  }

  // Deletes the accounts not used for settings.expireDays. Returns how many.
  async function expireUnused() {
    if (!settings.expireDays) {
      return 0;
    }
    const before = Date.now() - settings.expireDays * DAY_MS;
    let deleted = 0;
    for (const account of await fs.readdir(dataDir)) {
      const folder = path.join(dataDir, account);
      let usedAt;
      try {
        usedAt = (await fs.stat(path.join(folder, '.access'))).mtimeMs;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
        // A folder without a secret: an account whose first save failed
        // halfway, or not an account at all. Its folder's own time counts.
        // (Gone meanwhile, deleted by its learner: nothing to do.)
        const found = await fs.stat(folder).catch(() => null);
        if (!found) {
          continue;
        }
        usedAt = found.mtimeMs;
      }
      if (usedAt < before) {
        totalBytes -= await accountBytes(folder);
        await removeFolder(folder);
        markedAt.delete(folder);
        deleted += 1;
      }
    }
    return deleted;
  }

  // Makes a new account with this access secret. Two first saves at once:
  // the second finds the first's secret and is checked against it.
  async function makeAccount(request, folder, address) {
    if (totalBytes >= (settings.maxTotalBytes * settings.newAccountsUntilPercent) / 100) {
      throw overLimit('new-accounts-room', null, 507, 'server-full');
    }
    const generous = isGenerous(address) ? GENEROUS_TIMES : 1;
    if (accountsByAddress(addressKey(address)) > settings.newAccountsPerAddressPerDay * generous) {
      throw overLimit('new-accounts-per-address', addressKey(address), 429, 'too-many');
    }
    if (accountsInAll('all') > settings.newAccountsPerDay) {
      throw overLimit('new-accounts-per-day', null, 429, 'too-many');
    }
    await fs.mkdir(folder, { recursive: true });
    const access = /^Bearer ([0-9a-f]+)$/.exec(request.headers.authorization)[1];
    try {
      await fs.writeFile(path.join(folder, '.access'), sha256(access), { flag: 'wx' });
      // Counted in what the server holds, as at the start.
      totalBytes += 32;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      await checkAccess(request, folder);
    }
  }

  // Writes a request's body into a file as it comes, never holding it all
  // in memory, refusing it as soon as it is too large. Returns its size.
  // (pipeline: Node's way to pass what one stream gives on to another, here
  // through a step that counts.)
  async function saveBody(request, file, limit) {
    let size = 0;
    await pipeline(
      request,
      async function* (parts) {
        for await (const part of parts) {
          size += part.length;
          if (size > limit) {
            throw new Refusal(413, 'too-large');
          }
          yield part;
        }
      },
      createWriteStream(file, { flags: 'wx' }),
    );
    return size;
  }

  async function listFiles(folder) {
    let names;
    try {
      names = await fs.readdir(folder);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const files = [];
    for (const name of names.filter((entry) => NAME.test(entry))) {
      files.push({ name, size: (await fs.stat(path.join(folder, name))).size });
    }
    return files;
  }

  // The answers, by what was asked.
  async function handle(request, response, address) {
    const source = addressKey(address);
    // A request without an account's working secret, counted by address.
    const countAddress = () => {
      const generous = isGenerous(address) ? GENEROUS_TIMES : 1;
      if (requestsByAddress(source) > settings.requestsPerAddressPerMinute * generous) {
        throw overLimit('requests-per-address', source, 429, 'too-many');
      }
    };

    const url = new URL(request.url, 'http://server');
    const parts = url.pathname.split('/').filter(Boolean);
    const isAccounts = parts[0] === 'v1' && parts[1] === 'accounts'
      && (parts.length === 3 || (parts.length === 5 && parts[3] === 'files'));
    if (!isAccounts) {
      countAddress();
      if (parts[0] === 'v1' && parts[1] === 'health' && parts.length === 2 && request.method === 'GET') {
        return send(response, 200, 'ok');
      }
      throw new Refusal(404, 'not-found');
    }
    if (settings.paused) {
      throw new Refusal(503, 'paused');
    }
    let folder;
    let exists;
    try {
      folder = folderOf(parts[2]);
      exists = await checkAccess(request, folder);
    } catch (error) {
      if (error instanceof Refusal) {
        countAddress();
      }
      throw error;
    }
    if (!exists) {
      countAddress();
    } else if (requestsByAccount(parts[2]) > settings.requestsPerAccountPerMinute) {
      throw overLimit('requests-per-account', source, 429, 'too-many');
    }

    if (parts.length === 3) {
      if (request.method === 'GET') {
        return send(response, 200, JSON.stringify(exists ? await listFiles(folder) : []), 'application/json');
      }
      if (request.method === 'DELETE') {
        if (exists) {
          totalBytes -= await accountBytes(folder);
          await removeFolder(folder);
        }
        return send(response, 204);
      }
      throw new Refusal(405, 'bad-request');
    }

    const file = fileIn(folder, parts[4]);
    if (request.method === 'GET') {
      if (!exists) {
        throw new Refusal(404, 'not-found');
      }
      let size;
      try {
        size = (await fs.stat(file)).size;
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Refusal(404, 'not-found');
        }
        throw error;
      }
      if (downloadsByAccount(parts[2], size) > settings.downloadBytesPerAccountPerHour) {
        throw overLimit('downloads-per-account', source, 429, 'too-many');
      }
      // Sent as it is read, never held whole in memory. A learner's device
      // going away halfway is no error of the server's.
      response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': size });
      await pipeline(createReadStream(file), response).catch(() => response.destroy());
      return;
    }
    if (request.method === 'DELETE') {
      if (exists) {
        try {
          const { size } = await fs.stat(file);
          await fs.unlink(file);
          totalBytes -= size;
        } catch (error) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }
      }
      return send(response, 204);
    }
    if (request.method === 'PUT') {
      // The size the request says it has, if it says (the app's always do):
      // a file too large is refused before any of it is read.
      const declared = Number(request.headers['content-length'] ?? 0);
      if (declared > settings.maxFileBytes) {
        throw new Refusal(413, 'too-large');
      }
      if (totalBytes + declared > settings.maxTotalBytes) {
        throw overLimit('server-full', null, 507, 'server-full');
      }
      if (!exists) {
        await makeAccount(request, folder, address);
      } else if ((await accountBytes(folder)) + declared > settings.maxAccountBytes) {
        throw overLimit('account-full', null, 413, 'account-full');
      }
      const account = parts[2];
      if ((uploadsByAccount.get(account) || 0) >= settings.uploadsAtOncePerAccount) {
        throw overLimit('uploads-at-once-per-account', source, 429, 'too-many');
      }
      if (uploads >= settings.uploadsAtOnce) {
        throw overLimit('uploads-at-once', null, 429, 'too-many');
      }
      uploadsByAccount.set(account, (uploadsByAccount.get(account) || 0) + 1);
      uploads += 1;
      // Written under a name of its own first, then given its real name with
      // link(), which fails if that name is taken: so a file is never seen
      // half written, and never replaced.
      const temporary = path.join(folder, `.saving-${crypto.randomBytes(8).toString('hex')}`);
      let size;
      try {
        size = await saveBody(request, temporary, settings.maxFileBytes);
        // Checked again with the real size, for a request that didn't say
        // it. (The account's bytes now include this file, as written.)
        if (totalBytes + size > settings.maxTotalBytes) {
          throw overLimit('server-full', null, 507, 'server-full');
        }
        if ((await accountBytes(folder)) > settings.maxAccountBytes) {
          throw overLimit('account-full', null, 413, 'account-full');
        }
        await fs.link(temporary, file);
      } catch (error) {
        if (error.code === 'EEXIST') {
          throw new Refusal(409, 'exists');
        }
        throw error;
      } finally {
        await fs.rm(temporary, { force: true });
        uploads -= 1;
        if (uploadsByAccount.get(account) === 1) {
          uploadsByAccount.delete(account);
        } else {
          uploadsByAccount.set(account, uploadsByAccount.get(account) - 1);
        }
      }
      totalBytes += size;
      return send(response, 201);
    }
    throw new Refusal(405, 'bad-request');
  }

  const server = http.createServer(async (request, response) => {
    const address = settings.trustProxy
      ? (request.headers['x-forwarded-for'] || '').split(',')[0].trim() || request.socket.remoteAddress
      : request.socket.remoteAddress;
    // Nothing the server answers is to be kept by a browser or in between.
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      // CORS: a page may call the server only if its address is allowed.
      // (A browser asks first, with OPTIONS, before a request carrying a
      // secret.) Requests not from a browser carry no Origin.
      const origin = request.headers.origin;
      if (origin !== undefined) {
        if (!settings.allowedOrigins.includes(origin)) {
          throw new Refusal(403, 'origin');
        }
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        response.setHeader('Access-Control-Max-Age', '86400');
        return send(response, 204);
      }
      await handle(request, response, address);
    } catch (error) {
      if (error instanceof Refusal) {
        send(response, error.status, JSON.stringify({ reason: error.reason }), 'application/json');
      } else {
        console.error(error);
        send(response, 500, JSON.stringify({ reason: 'server-error' }), 'application/json');
      }
    } finally {
      if (settings.log) {
        // The kind of request only: no account, file name or address, nor
        // whatever else was asked for (the internet's scanners try every
        // address they know: 2026-11-07, within minutes of starting).
        const kind = request.url === '/v1/health'
          ? 'health'
          : request.url.startsWith('/v1/accounts/')
            ? request.url.includes('/files/') ? 'file' : 'account'
            : 'other';
        settings.print(`${request.method} ${kind} ${response.statusCode}`);
      }
    }
  });

  // Unused accounts: looked for a minute after the start, then once a day.
  // (unref: these timers alone don't keep the program running.)
  const sweep = () =>
    expireUnused()
      .then((deleted) => {
        if (deleted > 0 && settings.log) {
          settings.print(`Deleted ${deleted} accounts unused for ${settings.expireDays} days`);
        }
      })
      .catch((error) => console.error(error));
  const sweeper = setInterval(sweep, DAY_MS);
  const firstSweep = setTimeout(sweep, 60 * 1000);
  // The limits hit, written once a minute: one line for many refusals.
  const limitWriter = setInterval(writeLimits, 60 * 1000);
  sweeper.unref();
  firstSweep.unref();
  limitWriter.unref();
  server.on('close', () => {
    clearInterval(sweeper);
    clearTimeout(firstSweep);
    clearInterval(limitWriter);
    writeLimits();
  });
  // For the tests, and for running it by hand.
  server.expireUnused = expireUnused;
  server.writeLimits = writeLimits;
  return server;
}

// Deletes an account's folder. A file being saved into it at that moment can
// keep the folder from going (ENOTEMPTY): then again, a few times.
async function removeFolder(folder) {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rm(folder, { recursive: true, force: true });
      return;
    } catch (error) {
      if (error.code !== 'ENOTEMPTY' || attempt === 5) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

// How many bytes an account's folder holds.
async function accountBytes(folder) {
  let bytes = 0;
  try {
    for (const name of await fs.readdir(folder)) {
      bytes += (await fs.stat(path.join(folder, name))).size;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  return bytes;
}

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  if (response.headersSent) {
    return;
  }
  response.statusCode = status;
  if (body !== undefined) {
    response.setHeader('Content-Type', type);
    response.end(body);
  } else {
    response.end();
  }
}

// Run directly (node server/server.js): listen, on this computer only. The
// world reaches it through Caddy.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const settings = settingsFromEnvironment();
  const server = await createSyncServer(settings);
  server.listen(settings.port, '127.0.0.1', () => {
    console.log(`Sync server on http://127.0.0.1:${settings.port}, files in ${path.resolve(settings.dataDir)}`);
  });
}
