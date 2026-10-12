// Backups: the whole database as one file, to keep safe or to carry to
// another device.
//
// Importing a backup replaces everything on the device. It does not merge.

import { STORES, getAll, replaceEverything } from './db.js';

const FORMAT_NAME = 'hanzi-trainer-backup';

// Raise this when the shape of the backup changes, and teach checkBackup()
// below to read the older shapes too.
const FORMAT_VERSION = 1;

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
    throw new Error('This file is not a Hanzi Trainer backup.');
  }
  if (data.version !== FORMAT_VERSION) {
    throw new Error(
      `This backup is format version ${data.version}, but this app reads version ${FORMAT_VERSION}. Update the app and try again.`,
    );
  }
  for (const storeName of STORES) {
    const records = data[storeName];
    if (!Array.isArray(records)) {
      throw new Error(`The backup is damaged: "${storeName}" is missing.`);
    }
    // Every record needs its key, or the database would refuse it halfway.
    const keyName = storeName === 'settings' ? 'key' : 'id';
    if (records.some((record) => !record || typeof record[keyName] !== 'string')) {
      throw new Error(`The backup is damaged: a record in "${storeName}" has no ${keyName}.`);
    }
  }
}

// A one-line description of what a backup (or the current database, in the
// same shape) contains.
export function describeBackup(data) {
  const lastReview = data.reviews.reduce((latest, review) => Math.max(latest, review.time), 0);
  const when = lastReview ? `last review ${new Date(lastReview).toLocaleString()}` : 'no reviews';
  return `${data.words.length} words, ${data.cards.length} cards studied, ${data.reviews.length} reviews, ${when}`;
}

// Replaces everything in the database with the backup's contents.
export function restoreBackup(data) {
  checkBackup(data);
  return replaceEverything(data);
}
