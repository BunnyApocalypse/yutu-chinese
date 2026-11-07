// The sync server as syncing's storage (sync.js): list, read, save and
// remove, as requests to the server (server/server.js, docs/sync.md).
//
// Every request carries the account's access secret; the files themselves
// are already encrypted (syncCode.js), so the server never sees what is in
// them. A failure is thrown as an error with a `reason` the app acts on:
//
//   'offline'       no answer at all (no connection, or the server down)
//   'exists'        a file of that name is there already (sync.js moves on)
//   'refused'       the access secret doesn't match the account's
//   'too-large', 'account-full', 'server-full', 'too-many', 'paused',
//   'origin', 'not-found', 'bad-request', 'server-error'
//                   as the server says (server.js)

// A sync server's address as typed in Settings (syncPanel.js), checked:
// https://, or http:// on this computer only (a server being tried out), and
// nothing after the name but a "/" (taken off). Returns { address } or
// { reason }: 'notAddress' or 'notSecure'.
export function readServerAddress(typed) {
  let url;
  try {
    url = new URL(String(typed).trim());
  } catch {
    return { reason: 'notAddress' };
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    return { reason: url.protocol === 'http:' ? 'notSecure' : 'notAddress' };
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username) {
    return { reason: 'notAddress' };
  }
  return { address: url.origin };
}

// Whether a sync server answers this page (its health check): false if it
// can't be reached, or doesn't accept requests from this copy of the app
// (the browser then hides its answer: CORS, server.js).
export async function serverAnswers(address, fetch = globalThis.fetch.bind(globalThis)) {
  try {
    const response = await fetch(`${address}/v1/health`, { cache: 'no-store' });
    return response.ok && (await response.text()) === 'ok';
  } catch {
    return false;
  }
}

// Requests sent with `keepalive` may finish after the page is closed, but
// browsers allow it only for small ones (64 KB together).
const KEEPALIVE_BYTES = 60 * 1024;

// address: the server's address, as "https://sync.example.org" (no / at the
//          end)
// account, access: from the sync code (keysFor in syncCode.js)
// fetch:   the browser's fetch (another in the tests)
export function serverStorage({ address, account, access, fetch = globalThis.fetch.bind(globalThis) }) {
  const base = `${address}/v1/accounts/${account}`;

  async function request(path, { method = 'GET', body, keepalive = false } = {}) {
    let response;
    try {
      response = await fetch(base + path, {
        method,
        body,
        keepalive,
        headers: { Authorization: `Bearer ${access}` },
        // Nothing synced is to be kept in the browser's cache.
        cache: 'no-store',
      });
    } catch {
      throw Object.assign(new Error('The sync server could not be reached.'), { reason: 'offline' });
    }
    if (!response.ok) {
      let reason = 'server-error';
      try {
        reason = (await response.json()).reason || reason;
      } catch {
        // An answer that isn't the server's own (a proxy's page, say).
      }
      throw Object.assign(new Error(`The sync server said ${response.status} (${reason}).`), { reason, status: response.status });
    }
    return response;
  }

  return {
    async list() {
      return (await request('')).json();
    },
    async read(name) {
      return new Uint8Array(await (await request(`/files/${name}`)).arrayBuffer());
    },
    async save(name, bytes) {
      await request(`/files/${name}`, { method: 'PUT', body: bytes, keepalive: bytes.length < KEEPALIVE_BYTES });
    },
    async remove(name) {
      await request(`/files/${name}`, { method: 'DELETE' });
    },
    // Every file of the account ("Delete synced data" in Settings).
    async removeAll() {
      await request('', { method: 'DELETE' });
    },
  };
}
