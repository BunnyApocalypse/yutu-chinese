// Storage. Everything the app remembers lives in IndexedDB, a database built
// into the browser. It belongs to this browser on this device and to the exact
// address the app was opened from; nothing is sent anywhere.
//
// The database has six "object stores" (roughly: tables). Each record is a
// plain JavaScript object, found by its key.
//
//   words     key: id      { id, traditional, simplified, pinyin, definition,
//                            order, addedAt, changedAt } and, for some,
//                          pinyinTaiwan, pinyinAlso, cardScript, learnedAt,
//                          learnDuration, decks, formerIds, suspended,
//                          startedOverAt. `learnDuration` is how long the
//                          word's lesson in Learn took, in milliseconds
//                          (timing.js; words learned from 2026-10-19).
//                          `suspended` lists the kinds of card that are not
//                          to come up (leeches.js); `startedOverAt` has, by
//                          kind of card, when it was last started over
//                          (cardManager.js). `importedAt` is when a word
//                          whose cards came from Anki or Skritter was
//                          brought over (ankiImport.js, skritterImport.js).
//                          New words are introduced in the order of `order`,
//                          lowest first; it may be negative.
//                          `decks` lists the IDs of the decks the word is in.
//                          `formerIds` lists the IDs the word had before its
//                          characters or pinyin were corrected, so that
//                          another device's records under an old ID can be
//                          matched to it.
//   cards     key: id      { id, wordId, type, due, firstReviewedAt, fsrsState }
//                          One per word and card type ('meaning', 'pinyin',
//                          'tone', 'writing'). The id is "<wordId>#<type>".
//                          A writing card is kept per script where the word
//                          is written differently in the two: the simplified
//                          one's id ends in "#simplified" (see cardIdFor in
//                          session.js).
//   reviews   key: id      { id, cardId, wordId, type, time, grade,
//                            suggestedGrade, mistakesPerChar, passedPerChar,
//                            suggestedPerChar, orderPerChar, script, log }
//                          One per review, never deleted. `script` is the
//                          script the card was shown or written in.
//                          `duration` is how long the answer took in
//                          milliseconds (timing.js; reviews from 2026-10-19
//                          and those from Anki).
//                          `correctedAt` is when its grade was last
//                          corrected while looking back (review.js); the
//                          one change ever made to a review.
//                          A review brought over from Anki has an ID made
//                          from Anki's ("anki-<Anki's ID>-<type>"),
//                          `fromAnki: true`, and Anki's `duration`. With
//                          each such card comes one record that is not a
//                          review but the schedule Anki gave it:
//                          `importedSchedule` in place of `grade` (replay
//                          in scheduler.js). Reviews from Skritter are
//                          the same, with "skritter-…" IDs and
//                          `fromSkritter: true` (skritterImport.js).
//                          The cardId of a review made
//                          before 2026-10-13 may be the plain id of a card
//                          since moved to its "#simplified" id (see
//                          scriptCards.js).
//                          An index by `wordId` (since version 3) finds one
//                          word's reviews without reading them all
//                          (getReviewsOfWord).
//   settings  key: key     { key, value, changedAt }
//   removed   key: id      { id, removedAt } and, for a deck, kind: 'deck'.
//                          One per word or deck that was ever removed, under
//                          its ID, with the time of the latest removal.
//                          Without it, combining this device's data with
//                          another's would bring it back. The mark stays if
//                          the word or deck is added again (it then has a
//                          later `changedAt`), because the reviews made
//                          before the removal must not count toward the new
//                          word's schedule (see merge.js). (A word's ID has
//                          a "|" in it and a deck's has none, so the two
//                          never meet.)
//   decks     key: id      { id, name, parentId, order, changedAt } and, for
//                          some, newWordsPerDay.
//                          Groups of words. `parentId` is the deck this one
//                          is inside, or null. A deck made from a ready-made
//                          list has a fixed ID ('hsk-3.0', 'hsk-3.0/1'), the
//                          same on every device; any other has a random one
//                          (see decks.js).
//
// Two more stores belong to this device alone and are never in a backup
// (syncing, sync.md):
//
//   outbox    key: key     { key, store, id, token }, key "<store>:<id>".
//                          A record changed here since the last batch was
//                          sent; one entry per record, however often it
//                          changed. The entry "everything" (sendEverything)
//                          sends all of this device's data. Written only while sync is on
//                          (setOutboxOn). `token` is new each time, so that
//                          an entry changed again while a batch was being
//                          sent stays (takeOffOutbox).
//   sync      key: key     { key, value }: what syncing keeps on this device,
//                          such as its device ID and the batches taken in.
//
// `changedAt` is when a record was last saved (a number, like Date.now()).
// It is filled in here, by putAll, so that when two devices' data are
// combined the newer version of a record can be kept. Records saved before
// 2026-10-13 have none.
//
// IndexedDB's own interface is built on callbacks and is awkward to use. The
// functions below wrap it so the rest of the app can simply "await" results.

import { t } from './text.js';

// The app is published twice at one site: a stable copy, and under test/ a
// copy that gets every change first. A browser keeps one set of databases
// for the whole site, so the test copy has a database of its own name; it
// could otherwise change the stable copy's database in ways that copy does
// not yet understand. (__CHANNEL__ is put in by Vite, see vite.config.js;
// it is not there when the tests run this file in Node.)
/* global __CHANNEL__ */
const CHANNEL = typeof __CHANNEL__ === 'undefined' ? '' : __CHANNEL__;
// From the app's first name, Hanzi Trainer. Renaming the database would
// leave everyone's words behind in the old one, so it stays.
const DATABASE_NAME = CHANNEL ? `hanzi-trainer-${CHANNEL}` : 'hanzi-trainer';

// Raise this number when the stores themselves change (a new store, a new
// key). The browser then runs the upgrade code below on existing databases.
const DATABASE_VERSION = 4;

// The stores a backup holds.
export const STORES = ['words', 'cards', 'reviews', 'settings', 'removed', 'decks'];

// The stores whose records are given a `changedAt` when saved.
const STAMPED = ['words', 'settings', 'decks'];

// The stores whose changes syncing sends to other devices. Cards are not
// among them: they are worked out from the reviews.
export const SYNCED = ['words', 'settings', 'decks', 'reviews', 'removed'];

// Whether changes are noted in the outbox: only while sync is on.
let outboxOn = false;

export function setOutboxOn(on) {
  outboxOn = on;
}

// Called after a change was noted in the outbox and saved (syncTiming.js
// sends it a little later).
let outboxListener = () => {};

export function onOutboxChange(listener) {
  outboxListener = listener;
}

let databasePromise = null;

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      // Runs the first time the app is opened, and whenever DATABASE_VERSION
      // goes up. `oldVersion` is the version the database on this device had
      // (0 if there was none), so only the stores it lacks are made and
      // everything already stored stays.
      request.onupgradeneeded = (event) => {
        const database = request.result;
        if (event.oldVersion < 1) {
          database.createObjectStore('words', { keyPath: 'id' });
          database.createObjectStore('cards', { keyPath: 'id' });
          database.createObjectStore('reviews', { keyPath: 'id' });
          database.createObjectStore('settings', { keyPath: 'key' });
        }
        if (event.oldVersion < 2) {
          database.createObjectStore('removed', { keyPath: 'id' });
          database.createObjectStore('decks', { keyPath: 'id' });
        }
        // An index is a second way into a store, kept up to date by the
        // browser itself: here, the reviews by the word they are of. Made over
        // the reviews already stored, once, while the app starts.
        if (event.oldVersion < 3) {
          request.transaction.objectStore('reviews').createIndex('wordId', 'wordId');
        }
        if (event.oldVersion < 4) {
          database.createObjectStore('outbox', { keyPath: 'key' });
          database.createObjectStore('sync', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        // A later version of the app, opened in another tab, cannot change
        // the stores while this tab holds the database open. Let go of it
        // when asked; this tab then needs reloading.
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      // The other way around: this is the later version, and a tab with an
      // earlier one is still open.
      request.onblocked = () =>
        reject(new Error(t('error.olderTab')));
    });
  }
  return databasePromise;
}

// Runs `work` inside a transaction: a group of changes that either all happen
// or, if anything goes wrong, none do. Resolves once the changes are safely
// stored.
async function transaction(storeNames, mode, work) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeNames, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    result = work(tx);
  });
}

// A transaction that changes records of the synced stores, with the outbox
// in it while sync is on. `work` gets the transaction and a function
// note(storeName, id) to call for each record it changes; the entry is then
// saved in the same transaction as the change.
async function changing(storeNames, work) {
  const names = outboxOn ? [...storeNames, 'outbox'] : storeNames;
  let noted = false;
  const result = await transaction(names, 'readwrite', (tx) => {
    const note = (storeName, id) => {
      if (outboxOn && SYNCED.includes(storeName)) {
        tx.objectStore('outbox').put({ key: `${storeName}:${id}`, store: storeName, id, token: randomId() });
        noted = true;
      }
    };
    return work(tx, note);
  });
  if (noted) {
    outboxListener();
  }
  return result;
}

// Returns every record in a store, as a list.
export async function getAll(storeName) {
  const request = await transaction([storeName], 'readonly', (tx) =>
    tx.objectStore(storeName).getAll(),
  );
  return request.result;
}

// The records with these keys, in one go; a key with no record is left out.
export async function getSome(storeName, keys) {
  const requests = await transaction([storeName], 'readonly', (tx) =>
    keys.map((key) => tx.objectStore(storeName).get(key)),
  );
  return requests.map((request) => request.result).filter(Boolean);
}

// How many records a store has, without reading them.
export async function countAll(storeName) {
  const request = await transaction([storeName], 'readonly', (tx) => tx.objectStore(storeName).count());
  return request.result;
}

// The reviews of one word (by its ID), through the index: reading all of
// them took seconds on a tablet with the owner's 185,000 (2026-11-06).
export async function getReviewsOfWord(wordId) {
  const request = await transaction(['reviews'], 'readonly', (tx) =>
    tx.objectStore('reviews').index('wordId').getAll(wordId),
  );
  return request.result;
}

// Reads every record in a store a part at a time, handing each part to
// `onPart` as it comes, in key order. For a store too big to read at once
// without the page freezing (the reviews: the owner has 186,000): the
// browser unpacks what is read on the page's own thread, so one getAll of
// them all held up writing for over a second on a tablet. Between parts,
// taps and strokes are handled. Each part is read on its own, so a record
// saved meanwhile may or may not be among them.
export async function getAllInParts(storeName, onPart, partSize = 5000) {
  let after = null; // the key of the last record read so far
  for (;;) {
    const range = after === null ? null : IDBKeyRange.lowerBound(after, true);
    const request = await transaction([storeName], 'readonly', (tx) =>
      tx.objectStore(storeName).getAll(range, partSize),
    );
    const part = request.result;
    if (part.length > 0) {
      onPart(part);
    }
    if (part.length < partSize) {
      return;
    }
    after = part[part.length - 1][request.source.keyPath];
  }
}

// Saves records, replacing any that have the same key. Words, settings and
// decks are marked with the time (`changedAt`).
//
// stamp: false leaves `changedAt` as it is, for a change the app makes by
//        itself to bring old records up to date. Such a change must not make
//        a record look newer than one the owner changed on another device.
//        It is not sent to other devices either: each makes it for itself.
export function putAll(storeName, records, { stamp = true } = {}) {
  const changedAt = Date.now();
  const stamped = stamp && STAMPED.includes(storeName);
  const keyName = storeName === 'settings' ? 'key' : 'id';
  return changing([storeName], (tx, note) => {
    for (const record of records) {
      tx.objectStore(storeName).put(stamped ? { ...record, changedAt } : record);
      if (stamp) {
        note(storeName, record[keyName]);
      }
    }
  });
}

// Removes a word and its cards together, and leaves a mark that it was
// removed. Its reviews stay: they are the record of what was studied, and are
// never deleted.
export function removeWord(wordId, cardIds) {
  return removeWords([{ wordId, cardIds }]);
}

// The same for several words at once. entries: [{ wordId, cardIds }].
export function removeWords(entries) {
  const removedAt = Date.now();
  return changing(['words', 'cards', 'removed'], (tx, note) => {
    for (const { wordId, cardIds } of entries) {
      tx.objectStore('words').delete(wordId);
      for (const id of cardIds) {
        tx.objectStore('cards').delete(id);
      }
      tx.objectStore('removed').put({ id: wordId, removedAt });
      note('removed', wordId);
    }
  });
}

// Removes decks, leaving a mark for each. The words in them are not touched
// here: taking the decks off their words is the caller's business.
export function removeDecks(deckIds) {
  const removedAt = Date.now();
  return changing(['decks', 'removed'], (tx, note) => {
    for (const id of deckIds) {
      tx.objectStore('decks').delete(id);
      tx.objectStore('removed').put({ id, kind: 'deck', removedAt });
      note('removed', id);
    }
  });
}

// Gives a word a new ID (its traditional form or pinyin was corrected) and
// files its cards and reviews under it, all together. `word` is the complete
// new record, with the old ID among its `formerIds` (see withFormerId in
// words.js). Card IDs begin with the word's ID, so they change with it.
// Only the word goes to other devices: its `formerIds` tell them to move
// their cards and reviews the same way (merge.js).
export function renameWord(oldId, word) {
  const renamed = (id) => word.id + id.slice(oldId.length);
  return changing(['words', 'cards', 'reviews'], (tx, note) => {
    const words = tx.objectStore('words');
    words.delete(oldId);
    words.put({ ...word, changedAt: Date.now() });
    note('words', word.id);
    // getAll() answers later, through onsuccess; the transaction stays open
    // until the work started there is done.
    const cards = tx.objectStore('cards');
    cards.getAll().onsuccess = (event) => {
      for (const card of event.target.result.filter((entry) => entry.wordId === oldId)) {
        cards.delete(card.id);
        cards.put({ ...card, id: renamed(card.id), wordId: word.id });
      }
    };
    const reviews = tx.objectStore('reviews');
    reviews.getAll().onsuccess = (event) => {
      for (const review of event.target.result.filter((entry) => entry.wordId === oldId)) {
        reviews.put({ ...review, cardId: renamed(review.cardId), wordId: word.id });
      }
    };
  });
}

// Starts cards over: removes them and saves their word, which carries the
// time (see withStartedOver in cardManager.js), together. Their reviews stay.
export function startCardsOver(word, cardIds) {
  return changing(['words', 'cards'], (tx, note) => {
    tx.objectStore('words').put({ ...word, changedAt: Date.now() });
    note('words', word.id);
    for (const id of cardIds) {
      tx.objectStore('cards').delete(id);
    }
  });
}

// Saves words marked as known with the cards and reviews that go with it
// (see markedKnown in cardManager.js), all together.
// entries: [{ word, cards, reviews }]
export function saveKnown(entries) {
  const changedAt = Date.now();
  return changing(['words', 'cards', 'reviews'], (tx, note) => {
    for (const { word, cards, reviews } of entries) {
      tx.objectStore('words').put({ ...word, changedAt });
      note('words', word.id);
      for (const card of cards) {
        tx.objectStore('cards').put(card);
      }
      for (const review of reviews) {
        tx.objectStore('reviews').put(review);
        note('reviews', review.id);
      }
    }
  });
}

// Saves what an import from Anki brings (see planAnkiImport in
// ankiImport.js) all together, so that a failure leaves nothing half done.
// Words and decks are marked with the time.
export function saveImport({ words, decks, cards, reviews }) {
  const changedAt = Date.now();
  return changing(['words', 'decks', 'cards', 'reviews'], (tx, note) => {
    for (const deck of decks) {
      tx.objectStore('decks').put({ ...deck, changedAt });
      note('decks', deck.id);
    }
    for (const word of words) {
      tx.objectStore('words').put({ ...word, changedAt });
      note('words', word.id);
    }
    for (const card of cards) {
      tx.objectStore('cards').put(card);
    }
    for (const review of reviews) {
      tx.objectStore('reviews').put(review);
      note('reviews', review.id);
    }
  });
}

// Gives cards new IDs. moves: [{ from, to }], card IDs.
export function moveCards(moves) {
  return transaction(['cards'], 'readwrite', (tx) => {
    const cards = tx.objectStore('cards');
    for (const { from, to } of moves) {
      cards.get(from).onsuccess = (event) => {
        if (event.target.result) {
          cards.delete(from);
          cards.put({ ...event.target.result, id: to });
        }
      };
    }
  });
}

// Saves a card and the review that changed it together, so the two can never
// get out of step.
export function saveReview(card, review) {
  return changing(['cards', 'reviews'], (tx, note) => {
    tx.objectStore('cards').put(card);
    tx.objectStore('reviews').put(review);
    note('reviews', review.id);
  });
}

export async function getSetting(key, fallback) {
  const request = await transaction(['settings'], 'readonly', (tx) =>
    tx.objectStore('settings').get(key),
  );
  return request.result ? request.result.value : fallback;
}

export function setSetting(key, value) {
  return putAll('settings', [{ key, value }]);
}

// How many records replaceEverything saves in one transaction. A backup can
// hold hundreds of thousands of reviews (a Skritter history), and saved in
// one transaction they froze a tablet and ran Firefox on Android out of
// memory (2026-10-23). In parts, the browser draws the page between them.
const RECORDS_AT_A_TIME = 2000;

// The setting that says an import was started and has not finished. It is
// saved first and removed last, so it is only there if the app was closed
// (or the browser gave up) halfway; startUp in main.js then says so.
export const IMPORT_UNFINISHED = 'importUnfinished';

// Empties every store and fills it from `data`, an object with one list of
// records per store name. Used when a backup is imported.
//
// onProgress(saved, total) is called after each part, with counts of records.
//
// The stores are emptied and the settings saved together, first; the other
// records follow in parts. A failure halfway leaves part of the backup, with
// IMPORT_UNFINISHED among the settings.
export async function replaceEverything(data, onProgress = () => {}) {
  const settings = data.settings.filter((setting) => setting.key !== IMPORT_UNFINISHED);
  const total = STORES.reduce((sum, storeName) => sum + data[storeName].length, 0);
  let saved = settings.length;
  await transaction(STORES, 'readwrite', (tx) => {
    for (const storeName of STORES) {
      tx.objectStore(storeName).clear();
    }
    for (const setting of settings) {
      tx.objectStore('settings').put(setting);
    }
    tx.objectStore('settings').put({ key: IMPORT_UNFINISHED, value: Date.now() });
  });
  onProgress(saved, total);
  for (const storeName of STORES.filter((name) => name !== 'settings')) {
    const records = data[storeName];
    for (let start = 0; start < records.length; start += RECORDS_AT_A_TIME) {
      const part = records.slice(start, start + RECORDS_AT_A_TIME);
      await transaction([storeName], 'readwrite', (tx) => {
        for (const record of part) {
          tx.objectStore(storeName).put(record);
        }
      });
      saved += part.length;
      onProgress(saved, total);
    }
  }
  await transaction(['settings'], 'readwrite', (tx) => tx.objectStore('settings').delete(IMPORT_UNFINISHED));
  // Everything changed at once: the next batch sends it all (sync.md).
  if (outboxOn) {
    await sendEverything();
  }
}

// Syncing (sync.md, syncBatch.js).

// What syncing keeps under `key` on this device, or `fallback`.
export async function getSyncValue(key, fallback) {
  const request = await transaction(['sync'], 'readonly', (tx) => tx.objectStore('sync').get(key));
  return request.result ? request.result.value : fallback;
}

export function setSyncValue(key, value) {
  return transaction(['sync'], 'readwrite', (tx) => tx.objectStore('sync').put({ key, value }));
}

// Puts all of this device's data in the next batch: when sync is turned on
// (what was here before must reach the other devices too) and after a
// backup replaced everything. One entry, not one per record.
export function sendEverything() {
  return transaction(['outbox'], 'readwrite', (tx) =>
    tx.objectStore('outbox').put({ key: 'everything', store: null, id: null, token: randomId() }),
  );
}

// Forgets everything syncing kept on this device: the sync store and the
// outbox (syncControl.js, turning sync off).
export function forgetSync() {
  return transaction(['sync', 'outbox'], 'readwrite', (tx) => {
    tx.objectStore('sync').clear();
    tx.objectStore('outbox').clear();
  });
}

// The outbox's entries and the records they name, as they are now:
// { entries, records: { words: [...], ... } }. A record since deleted is
// left out (a word's removal is sent as its mark in `removed`). With the
// entry "everything", the records are all there are, cards too, which
// spare the other devices working them out.
export async function readOutbox() {
  const entries = await getAll('outbox');
  if (entries.some((entry) => entry.key === 'everything')) {
    return { entries, records: await readEverything() };
  }
  const requests = await transaction(SYNCED, 'readonly', (tx) =>
    entries.map((entry) => ({ store: entry.store, request: tx.objectStore(entry.store).get(entry.id) })),
  );
  const records = Object.fromEntries(SYNCED.map((storeName) => [storeName, []]));
  for (const { store, request } of requests) {
    if (request.result) {
      records[store].push(request.result);
    }
  }
  return { entries, records };
}

// Takes these entries off the outbox once their batch is safely stored, but
// not one whose record changed again meanwhile (its token is new): that
// change still has to be sent.
export function takeOffOutbox(entries) {
  return transaction(['outbox'], 'readwrite', (tx) => {
    const outbox = tx.objectStore('outbox');
    for (const entry of entries) {
      outbox.get(entry.key).onsuccess = (event) => {
        if (event.target.result && event.target.result.token === entry.token) {
          outbox.delete(entry.key);
        }
      };
    }
  });
}

// The part of this device's data that taking in a batch about these words
// needs (see applyBatch in syncBatch.js): every word, deck, setting and
// removal mark (a few thousand small records), and the reviews and cards of
// these words only. Card IDs begin with "<word ID>#".
export async function readSlice(wordIds) {
  const slice = {};
  for (const storeName of ['words', 'decks', 'settings', 'removed']) {
    slice[storeName] = await getAll(storeName);
  }
  const requests = await transaction(['reviews', 'cards'], 'readonly', (tx) =>
    [...wordIds].map((wordId) => ({
      reviews: tx.objectStore('reviews').index('wordId').getAll(wordId),
      cards: tx.objectStore('cards').getAll(IDBKeyRange.bound(`${wordId}#`, `${wordId}#\uffff`)),
    })),
  );
  slice.reviews = requests.flatMap((request) => request.reviews.result);
  slice.cards = requests.flatMap((request) => request.cards.result);
  return slice;
}

// Everything in the stores a backup holds, as { storeName: [records] }: what
// a snapshot is made of, and taken in against (sync.js). The reviews are
// read a part at a time (getAllInParts), as Review does.
export async function readEverything() {
  const data = {};
  for (const storeName of STORES.filter((name) => name !== 'reviews')) {
    data[storeName] = await getAll(storeName);
  }
  data.reviews = [];
  await getAllInParts('reviews', (part) => data.reviews.push(...part));
  return data;
}

// Saves what taking in a batch or a snapshot gives (applyBatch in
// syncBatch.js): records as they came, not stamped again and not put in the
// outbox (or two devices would send each other's changes back and forth
// forever). changes: { put: { words: [...], ... }, remove: { words: [ids], ... } }
//
// The deletions go first, then the records RECORDS_AT_A_TIME a transaction:
// a snapshot taken in on a new device is all of a learner's history, too
// much for one (see replaceEverything). Stopped halfway, the batch is taken
// in again at the next sync (sync.js notes it as taken in only after), and
// taking it in twice changes nothing.
export async function saveTakenIn({ put, remove }) {
  const removing = Object.keys(remove);
  if (removing.length > 0) {
    await transaction(removing, 'readwrite', (tx) => {
      for (const [storeName, keys] of Object.entries(remove)) {
        for (const key of keys) {
          tx.objectStore(storeName).delete(key);
        }
      }
    });
  }
  for (const [storeName, records] of Object.entries(put)) {
    for (let start = 0; start < records.length; start += RECORDS_AT_A_TIME) {
      const part = records.slice(start, start + RECORDS_AT_A_TIME);
      await transaction([storeName], 'readwrite', (tx) => {
        for (const record of part) {
          tx.objectStore(storeName).put(record);
        }
      });
    }
  }
}

// A random ID for records that have no natural one (reviews). Random rather
// than counting up, so two devices never produce the same ID.
export function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
