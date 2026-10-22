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

// Checks that `data` (already parsed from the file) is a backup this version
// of the app can read. Throws an Error with a readable message if not.
export function checkBackup(data) {
  if (!data || typeof data !== 'object' || data.format !== FORMAT_NAME) {
    throw new Error(t('backup.notABackup'));
  }
  if (!STORES_IN_VERSION[data.version]) {
    throw new Error(
      t('backup.tooNew', { version: data.version, newest: FORMAT_VERSION }),
    );
  }
  for (const storeName of STORES_IN_VERSION[data.version]) {
    const records = data[storeName];
    if (!Array.isArray(records)) {
      throw new Error(t('backup.storeMissing', { store: storeName }));
    }
    // Every record needs its key, or the database would refuse it halfway.
    const keyName = storeName === 'settings' ? 'key' : 'id';
    if (records.some((record) => !record || typeof record[keyName] !== 'string')) {
      throw new Error(t('backup.recordWithoutKey', { store: storeName, key: keyName }));
    }
  }
}

// A one-line description of what a backup (or the current database, in the
// same shape) contains.
export function describeBackup(data) {
  const lastReview = data.reviews.reduce((latest, review) => Math.max(latest, review.time), 0);
  const when = lastReview ? t('backup.lastReview', { when: formatDateTime(lastReview) }) : t('backup.noReviews');
  return t('backup.contents', {
    words: t('backup.words', { count: data.words.length }),
    cards: t('backup.cards', { count: data.cards.length }),
    reviews: t('backup.reviews', { count: data.reviews.length }),
    when,
  });
}

// Replaces everything in the database with the backup's contents.
export function restoreBackup(data) {
  checkBackup(data);
  // Stores an older backup does not have are left empty.
  const everything = {};
  for (const storeName of STORES) {
    everything[storeName] = data[storeName] || [];
  }
  return replaceEverything(everything);
}
