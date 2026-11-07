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
// An error is answered with its status and { reason }, a word the app acts
// on: 'bad-request', 'refused', 'not-found', 'exists', 'too-large',
// 'account-full', 'server-full', 'too-many', 'paused', 'origin'.
//
// Run with: node server/server.js (settings from the environment, below).

import http from 'node:http';
import fs from 'node:fs/promises';
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
  // New accounts a day from one address, and requests a minute: enough for
  // a household, too few for someone using the server as free storage.
  newAccountsPerAddressPerDay: 10,
  requestsPerAddressPerMinute: 600,
  // Behind Caddy, the learner's address comes in X-Forwarded-For, which
  // Caddy sets; trusted only when the server is reached through it.
  trustProxy: false,
  // Syncing switched off for everyone at once (docs/sync.md, "a switch").
  paused: false,
  // One line per request (method, what, status), never an account, an
  // address or anything in a file.
  log: true,
};

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
    newAccountsPerAddressPerDay: number('NEW_ACCOUNTS_PER_DAY', DEFAULTS.newAccountsPerAddressPerDay),
    requestsPerAddressPerMinute: number('REQUESTS_PER_MINUTE', DEFAULTS.requestsPerAddressPerMinute),
    trustProxy: env.TRUST_PROXY === '1',
    paused: env.SYNC_PAUSED === '1',
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

// An error answered as { reason } with its status.
class Refusal extends Error {
  constructor(status, reason) {
    super(reason);
    this.status = status;
    this.reason = reason;
  }
}

// Counts requests by address over a stretch of time, forgetting each
// stretch when it is over.
function counter(stretchMs) {
  const counts = new Map();
  let started = Date.now();
  return (address) => {
    if (Date.now() - started > stretchMs) {
      counts.clear();
      started = Date.now();
    }
    const count = (counts.get(address) || 0) + 1;
    counts.set(address, count);
    return count;
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

  const requestsThisMinute = counter(60 * 1000);
  const accountsToday = counter(24 * 60 * 60 * 1000);

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
    return true;
  }

  // Makes a new account with this access secret. Two first saves at once:
  // the second finds the first's secret and is checked against it.
  async function makeAccount(request, folder, address) {
    if (accountsToday(address) > settings.newAccountsPerAddressPerDay) {
      throw new Refusal(429, 'too-many');
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

  // Reads a request's body, refusing it as soon as it is too large.
  async function readBody(request, limit) {
    const parts = [];
    let size = 0;
    for await (const part of request) {
      size += part.length;
      if (size > limit) {
        throw new Refusal(413, 'too-large');
      }
      parts.push(part);
    }
    return Buffer.concat(parts);
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
    const url = new URL(request.url, 'http://server');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'v1') {
      throw new Refusal(404, 'not-found');
    }
    if (parts[1] === 'health' && parts.length === 2 && request.method === 'GET') {
      return send(response, 200, 'ok');
    }
    if (settings.paused) {
      throw new Refusal(503, 'paused');
    }
    if (parts[1] !== 'accounts' || !(parts.length === 3 || (parts.length === 5 && parts[3] === 'files'))) {
      throw new Refusal(404, 'not-found');
    }
    const folder = folderOf(parts[2]);
    const exists = await checkAccess(request, folder);

    if (parts.length === 3) {
      if (request.method === 'GET') {
        return send(response, 200, JSON.stringify(exists ? await listFiles(folder) : []), 'application/json');
      }
      if (request.method === 'DELETE') {
        if (exists) {
          totalBytes -= await accountBytes(folder);
          await fs.rm(folder, { recursive: true, force: true });
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
      let bytes;
      try {
        bytes = await fs.readFile(file);
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Refusal(404, 'not-found');
        }
        throw error;
      }
      return send(response, 200, bytes, 'application/octet-stream');
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
      const body = await readBody(request, settings.maxFileBytes);
      if (totalBytes + body.length > settings.maxTotalBytes) {
        throw new Refusal(507, 'server-full');
      }
      if (!exists) {
        await makeAccount(request, folder, address);
      } else if ((await accountBytes(folder)) + body.length > settings.maxAccountBytes) {
        throw new Refusal(413, 'account-full');
      }
      // Written under a name of its own first, then given its real name with
      // link(), which fails if that name is taken: so a file is never seen
      // half written, and never replaced.
      const temporary = path.join(folder, `.saving-${crypto.randomBytes(8).toString('hex')}`);
      await fs.writeFile(temporary, body);
      try {
        await fs.link(temporary, file);
      } catch (error) {
        if (error.code === 'EEXIST') {
          throw new Refusal(409, 'exists');
        }
        throw error;
      } finally {
        await fs.unlink(temporary);
      }
      totalBytes += body.length;
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
      if (requestsThisMinute(address) > settings.requestsPerAddressPerMinute) {
        throw new Refusal(429, 'too-many');
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
        // The kind of request only: no account, name or address.
        const kind = request.url.startsWith('/v1/accounts/') ? (request.url.includes('/files/') ? 'file' : 'account') : request.url;
        console.log(`${request.method} ${kind} ${response.statusCode}`);
      }
    }
  });
  return server;
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
