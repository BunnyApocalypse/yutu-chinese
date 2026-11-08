// Syncing on a second thread (a "Web Worker": code the browser runs beside
// the page, so the page keeps answering taps and drawing while it works).
// Taking in a whole history means opening about 47 MB of text and saving
// 190,000 records (the owner's): on the page itself that held it up for up
// to 6 seconds at a time on their tablet (2026-11-07). Here it doesn't.
//
// The page (syncControl.js) sends messages, each with an id it is answered
// under:
//   { type: 'connect', id, code, address }  the sync code and the server
//   { type: 'sync', id, options }          a sync (sync.js's syncNow)
// and is answered { type: 'done', id, result } or { type: 'failed', id,
// reason, message }; meanwhile { type: 'progress', progress } (sync.js's
// onProgress), at most about ten times a second.
//
// The worker has its own connection to the same database (db.js), which
// IndexedDB keeps in step with the page's.

import * as db from './db.js';
import { createSync } from './sync.js';
import { keysFor } from './syncCode.js';
import { serverStorage } from './syncServer.js';

let sync = null;

// Progress, not more often than every 100 ms, except a change of step.
let lastTold = 0;
let lastPhase = null;
function tellProgress(progress) {
  const now = Date.now();
  if (progress.phase === lastPhase && now - lastTold < 100) {
    return;
  }
  lastTold = now;
  lastPhase = progress.phase;
  self.postMessage({ type: 'progress', progress });
}

self.addEventListener('message', async ({ data: message }) => {
  try {
    if (message.type === 'connect') {
      const keys = await keysFor(message.code);
      const storage = serverStorage({ address: message.address, account: keys.account, access: keys.access });
      sync = createSync({ local: db, storage, key: keys.encryption, onProgress: tellProgress });
      self.postMessage({ type: 'done', id: message.id, result: null });
    } else if (message.type === 'sync') {
      const result = await sync.syncNow(message.options);
      lastPhase = null;
      self.postMessage({ type: 'done', id: message.id, result });
    }
  } catch (error) {
    lastPhase = null;
    self.postMessage({ type: 'failed', id: message.id, reason: error.reason, message: String(error.message || error) });
  }
});
