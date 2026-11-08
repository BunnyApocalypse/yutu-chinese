// Import backup on a second thread (a "Web Worker": code the browser runs
// beside the page, so the page keeps answering taps and drawing while it
// works), as syncWorker.js does for syncing. With the owner's backup (47 MB,
// 190,000 records) at tablet speed, on the page itself choosing the file
// held the page up for up to 14 seconds at a time, and Combine for up to 11
// (2026-11-08). The page (main.js) only shows the panel and the progress.
//
// The page sends messages, each with an id it is answered under:
//   { type: 'open', id, file }  read and check the chosen file, and work out
//                               what combining would do; answered with
//                               { backup, device, summary }: backupContents
//                               of the file and of the device, and
//                               mergeBackups's summary
//   { type: 'safetyCopy', id }  the device's data as it was at 'open', as a
//                               file to save before combining (a Blob)
//   { type: 'combine', id, outboxOn }  combine and save
//   { type: 'replace', id, outboxOn }  replace everything with the file
// and is answered { type: 'done', id, result } or { type: 'failed', id,
// message, textKey, values } (textKey and values for a file that can't be
// used: checkBackup in backup.js); while saving, { type: 'progress', saved,
// total }, at most about ten times a second. outboxOn: whether sync is on,
// so that what is saved is sent to the other devices too.
//
// The worker has its own connection to the same database (db.js), which
// IndexedDB keeps in step with the page's.

import * as db from './db.js';
import { backupContents, backupFile, buildBackup, checkBackup, restoreBackup } from './backup.js';
import { mergeBackups } from './merge.js';

// The chosen backup and what was on the device, between 'open' and saving.
let chosen = null;
let onDevice = null;

let lastTold = 0;
function tellProgress(saved, total) {
  const now = Date.now();
  if (now - lastTold < 100 && saved < total) {
    return;
  }
  lastTold = now;
  self.postMessage({ type: 'progress', saved, total });
}

async function answer(message) {
  if (message.type === 'open') {
    let text = await message.file.text();
    try {
      chosen = JSON.parse(text);
    } catch {
      // JSON.parse fails with a technical message; this one is readable.
      throw Object.assign(new Error('Not a backup'), { textKey: 'backup.notABackup', values: {} });
    }
    text = null;
    checkBackup(chosen);
    onDevice = await buildBackup();
    return {
      backup: backupContents(chosen),
      device: backupContents(onDevice),
      summary: mergeBackups(onDevice, chosen).summary,
    };
  }
  if (message.type === 'safetyCopy') {
    return backupFile(onDevice);
  }
  db.setOutboxOn(message.outboxOn);
  if (message.type === 'combine') {
    // Worked out again from the database as it is now, in case something was
    // studied in another tab since the panel opened.
    onDevice = null;
    const { data } = mergeBackups(await buildBackup(), chosen, { summarize: false });
    await db.replaceEverything(data, tellProgress);
    return null;
  }
  if (message.type === 'replace') {
    await restoreBackup(chosen, tellProgress);
    return null;
  }
  throw new Error(`Unknown message: ${message.type}`);
}

self.addEventListener('message', async ({ data: message }) => {
  try {
    const result = await answer(message);
    self.postMessage({ type: 'done', id: message.id, result });
  } catch (error) {
    self.postMessage({
      type: 'failed',
      id: message.id,
      message: String(error.message || error),
      textKey: error.textKey,
      values: error.values,
    });
  }
});
