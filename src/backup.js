// Backups: the whole database as one file, to keep safe or to carry to
// another device.
//
// A backup can replace everything on the device (restoreBackup below), or be
// combined with what is there (merge.js).
//
// Format versions:
//   1  words, cards, reviews, settings.
//   2  (2026-10-13) also `removed` and `decks`; see the top of db.js. A
//      version 1 backup is read as having none of either. Its words may
//      carry `lists` instead of `decks`, which the app converts when it
//      starts (decks.js).

import { STORES, getAll, replaceEverything } from './db.js';
import { t, formatDateTime } from './text.js';

// From the app's first name, Hanzi Trainer. It stays, so that every backup
// made so far can still be read.
const FORMAT_NAME = 'hanzi-trainer-backup';

// Raise this when the shape of the backup changes, and teach checkBackup()
// below to read the older shapes too.
const FORMAT_VERSION = 2;

// The stores each older version had; a backup need not have the later ones.
const STORES_IN_VERSION = { 1: ['words', 'cards', 'reviews', 'settings'], 2: STORES };

// Collects everything in the database into one plain object.
export async function buildBackup() {
  const backup = {
    format: FORMAT_NAME,
    version: FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
  };
  for (const storeName of STORES) {
    backup[storeName] = await getAll(storeName);
  }
  return backup;
}

// The whole backup as a file's contents (a Blob, a file held in memory).
export function backupFile(backup) {
  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

// An Error saying why a file can't be used: its message, and the key and
// values of that text (`textKey`, `values`), so that the page can say it in
// the learner's language when the check ran on a second thread
// (importWorker.js), which doesn't know the language chosen in Settings.
function unusable(textKey, values = {}) {
  return Object.assign(new Error(t(textKey, values)), { textKey, values });
}

// Checks that `data` (already parsed from the file) is a backup this version
// of the app can read. Throws an Error with a readable message if not (see
// unusable above).
export function checkBackup(data) {
  if (!data || typeof data !== 'object' || data.format !== FORMAT_NAME) {
    throw unusable('backup.notABackup');
  }
  if (!STORES_IN_VERSION[data.version]) {
    throw unusable('backup.tooNew', { version: data.version, newest: FORMAT_VERSION });
  }
  for (const storeName of STORES_IN_VERSION[data.version]) {
    const records = data[storeName];
    if (!Array.isArray(records)) {
      throw unusable('backup.storeMissing', { store: storeName });
    }
    // Every record needs its key, or the database would refuse it halfway.
    const keyName = storeName === 'settings' ? 'key' : 'id';
    if (records.some((record) => !record || typeof record[keyName] !== 'string')) {
      throw unusable('backup.recordWithoutKey', { store: storeName, key: keyName });
    }
  }
}

// What a backup (or the current database, in the same shape) contains, in
// counts: { words, cards, reviews, lastReview } (a time, or 0 for none).
export function backupContents(data) {
  return {
    words: data.words.length,
    cards: data.cards.length,
    reviews: data.reviews.length,
    lastReview: data.reviews.reduce((latest, review) => Math.max(latest, review.time), 0),
  };
}

// A one-line description of what backupContents gave.
export function describeBackup({ words, cards, reviews, lastReview }) {
  const when = lastReview ? t('backup.lastReview', { when: formatDateTime(lastReview) }) : t('backup.noReviews');
  return t('backup.contents', {
    words: t('backup.words', { count: words }),
    cards: t('backup.cards', { count: cards }),
    reviews: t('backup.reviews', { count: reviews }),
    when,
  });
}

// Replaces everything in the database with the backup's contents.
// onProgress: as for replaceEverything in db.js.
export function restoreBackup(data, onProgress) {
  checkBackup(data);
  // Stores an older backup does not have are left empty.
  const everything = {};
  for (const storeName of STORES) {
    everything[storeName] = data[storeName] || [];
  }
  return replaceEverything(everything, onProgress);
}
