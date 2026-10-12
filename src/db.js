// Storage. Everything the app remembers lives in IndexedDB, a database built
// into the browser. It belongs to this browser on this device and to the exact
// address the app was opened from; nothing is sent anywhere.
//
// The database has four "object stores" (roughly: tables). Each record is a
// plain JavaScript object, found by its key.
//
//   words     key: id      { id, traditional, simplified, pinyin, definition,
//                            order, addedAt } and, for some, pinyinTaiwan.
//                          New words are introduced in the order of `order`,
//                          lowest first; it may be negative.
//   cards     key: id      { id, wordId, type, due, firstReviewedAt, fsrsState }
//                          One per word and card type. `type` is 'writing' for
//                          now; 'tone', 'pinyin' and 'meaning' will follow.
//                          The id is "<wordId>#<type>".
//   reviews   key: id      { id, cardId, wordId, type, time, grade,
//                            suggestedGrade, mistakesPerChar, passedPerChar,
//                            suggestedPerChar, orderPerChar, script, log }
//                          One per review, never deleted.
//   settings  key: key     { key, value }
//
// IndexedDB's own interface is built on callbacks and is awkward to use. The
// functions below wrap it so the rest of the app can simply "await" results.

const DATABASE_NAME = 'hanzi-trainer';

// Raise this number when the stores themselves change (a new store, a new
// key). The browser then runs the upgrade code below on existing databases.
const DATABASE_VERSION = 1;

export const STORES = ['words', 'cards', 'reviews', 'settings'];

let databasePromise = null;

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      // Runs the first time the app is opened, and whenever DATABASE_VERSION goes up.
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('words', { keyPath: 'id' });
        database.createObjectStore('cards', { keyPath: 'id' });
        database.createObjectStore('reviews', { keyPath: 'id' });
        database.createObjectStore('settings', { keyPath: 'key' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
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

// Returns every record in a store, as a list.
export async function getAll(storeName) {
  const request = await transaction([storeName], 'readonly', (tx) =>
    tx.objectStore(storeName).getAll(),
  );
  return request.result;
}

// Saves records, replacing any that have the same key.
export function putAll(storeName, records) {
  return transaction([storeName], 'readwrite', (tx) => {
    for (const record of records) {
      tx.objectStore(storeName).put(record);
    }
  });
}

// Removes a word and its cards together. Its reviews stay: they are the
// record of what was studied, and are never deleted.
export function removeWord(wordId, cardIds) {
  return transaction(['words', 'cards'], 'readwrite', (tx) => {
    tx.objectStore('words').delete(wordId);
    for (const id of cardIds) {
      tx.objectStore('cards').delete(id);
    }
  });
}

// Saves a card and the review that changed it together, so the two can never
// get out of step.
export function saveReview(card, review) {
  return transaction(['cards', 'reviews'], 'readwrite', (tx) => {
    tx.objectStore('cards').put(card);
    tx.objectStore('reviews').put(review);
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

// Empties every store and fills it from `data`, an object with one list of
// records per store name. Used when a backup is imported. Because it is one
// transaction, a failure halfway leaves the old data untouched.
export function replaceEverything(data) {
  return transaction(STORES, 'readwrite', (tx) => {
    for (const storeName of STORES) {
      const store = tx.objectStore(storeName);
      store.clear();
      for (const record of data[storeName]) {
        store.put(record);
      }
    }
  });
}

// A random ID for records that have no natural one (reviews). Random rather
// than counting up, so two devices never produce the same ID.
export function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
