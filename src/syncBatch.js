// Syncing between devices, the calculation: making a batch of this device's
// changes, and taking in a batch made on another device. Plain calculation,
// no page or database (db.js reads and saves; sync.md has the whole plan).
//
// A batch is what one device changed since its last batch:
//
//   { format: 1, device, number, madeAt,
//     words: [...], decks: [...], settings: [...], removed: [...], reviews: [...] }
//
// and, in a batch of everything a device has (sendEverything in db.js),
// `cards` too.
//
// `device` is the random ID of the device that made it, and `number` counts
// that device's batches, 1, 2, 3…, so another device can tell which it has
// already taken in and whether one is missing.
//
// Taking a batch in is combining backups (mergeBackups in merge.js) on a
// small scale, so the rules live in one place: this device's side is a slice
// of it (all its words, decks, settings and removal marks, and the reviews
// and cards of the words the batch touches), the other side is the batch.
// What comes out is compared with the slice to give what to save and what to
// delete.

import { mergeBackups, DEVICE_SETTINGS } from './merge.js';

export const BATCH_FORMAT = 1;

// The stores a batch carries, and the key each one's records go by.
const KEYS = { words: 'id', decks: 'id', settings: 'key', removed: 'id', reviews: 'id' };

// Makes a batch from the outbox's records (readOutbox in db.js).
//
// records: { words: [...], decks: [...], ... }, the records as they are now
export function buildBatch({ device, number, madeAt, records }) {
  const batch = { format: BATCH_FORMAT, device, number, madeAt };
  for (const storeName of Object.keys(KEYS)) {
    batch[storeName] = records[storeName] || [];
  }
  // A batch of everything this device has (sendEverything in db.js): a
  // whole history, cards and all, which a device joining can take as it is.
  if (records.cards) {
    batch.cards = records.cards;
    batch.everything = true;
  }
  // A setting that belongs to this device (the theme, the volume…) stays
  // here, as it does when combining backups.
  batch.settings = batch.settings.filter((setting) => !DEVICE_SETTINGS.includes(setting.key));
  return batch;
}

// Whether a batch carries nothing.
export function isEmptyBatch(batch) {
  return Object.keys(KEYS).every((storeName) => batch[storeName].length === 0);
}

// The IDs of the words whose reviews and cards taking in `batch` may change,
// so that only those need reading (readSlice in db.js).
//
// myWords: every word on this device
//
// Besides the words the batch names, a word corrected on either side
// (`formerIds`, see merge.js) brings the IDs it had and has, since cards and
// reviews filed under one of them move to the other.
export function wordsTouched(batch, myWords) {
  const touched = new Set();
  for (const word of batch.words) {
    touched.add(word.id);
    for (const formerId of word.formerIds || []) {
      touched.add(formerId);
    }
  }
  for (const review of batch.reviews) {
    touched.add(review.wordId);
  }
  for (const mark of batch.removed) {
    touched.add(mark.id);
  }
  // This device's words related to those by a correction, until no more
  // turn up (a word can have been corrected more than once).
  let grown = true;
  while (grown) {
    grown = false;
    for (const word of myWords) {
      const related = [word.id, ...(word.formerIds || [])];
      if (related.some((id) => touched.has(id)) && !related.every((id) => touched.has(id))) {
        related.forEach((id) => touched.add(id));
        grown = true;
      }
    }
  }
  return touched;
}

// Takes in a batch from another device.
//
// slice: this device's records, as readSlice(wordsTouched(batch, words))
//        gives them
// batch: the other device's batch; or a snapshot's data (sync.js), with
//        `slice` all of this device's: it has cards too, which are then
//        kept as stored where that side has every review of them
//
// Returns { put, remove }:
//   put:     { storeName: [records to save] }
//   remove:  { storeName: [keys of records to delete] }
// Stores with nothing to do are left out of both.
export function applyBatch(slice, batch) {
  const theirs = { words: [], cards: [], reviews: [], settings: [], removed: [], decks: [] };
  for (const storeName of Object.keys(KEYS)) {
    theirs[storeName] = batch[storeName] || [];
  }
  theirs.cards = batch.cards || [];
  const { data } = mergeBackups(slice, theirs, { summarize: false });

  const put = {};
  const remove = {};
  // The same object is unchanged (see mergeBackups); others are compared
  // as text, which is slow, but few are left by then.
  const same = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
  const compare = (storeName, keyName, { removing = true } = {}) => {
    const before = new Map((slice[storeName] || []).map((record) => [record[keyName], record]));
    const after = new Map(data[storeName].map((record) => [record[keyName], record]));
    const changed = [...after.values()].filter((record) => !same(before.get(record[keyName]), record));
    const gone = removing ? [...before.keys()].filter((key) => !after.has(key)) : [];
    if (changed.length > 0) {
      put[storeName] = changed;
    }
    if (gone.length > 0) {
      remove[storeName] = gone;
    }
  };
  compare('words', 'id');
  compare('decks', 'id');
  compare('removed', 'id');
  compare('reviews', 'id');
  // The slice holds only the cards of the words touched, and the result only
  // cards worked out from them, so the two can be compared whole.
  compare('cards', 'id');
  // Settings are never deleted. (mergeBackups leaves out this device's note
  // that its cards were filed by script when the other side's settings lack
  // it, as a batch's always do: a whole backup would bring the other's.)
  compare('settings', 'key', { removing: false });
  return { put, remove };
}

// A whole history (a snapshot's data, or a batch of everything) as changes
// for a device with no words or reviews yet: everything as it is, since it
// is one device's data, combined already, and so what mergeBackups would
// give, without combining 190,000 records with nothing (sync.js,
// takeInWhole). Settings as mergeBackups takes them: this device's own stay,
// and of the others, those saved later than this device's.
//
// mySettings: this device's settings
export function wholeAsChanges(data, mySettings) {
  const put = {};
  for (const storeName of ['words', 'decks', 'removed', 'reviews', 'cards']) {
    if ((data[storeName] || []).length > 0) {
      put[storeName] = data[storeName];
    }
  }
  const mine = new Map(mySettings.map((setting) => [setting.key, setting]));
  const settings = (data.settings || []).filter(
    (setting) =>
      !DEVICE_SETTINGS.includes(setting.key) &&
      (!mine.has(setting.key) || (setting.changedAt || 0) > (mine.get(setting.key).changedAt || 0)),
  );
  if (settings.length > 0) {
    put.settings = settings;
  }
  return { put, remove: {} };
}
