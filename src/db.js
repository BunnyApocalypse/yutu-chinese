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
//                          decks, formerIds.
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
//                          script the card was shown or written in. The
//                          cardId of a review made before 2026-10-13 may be
//                          the plain id of a card since moved to its
//                          "#simplified" id (see scriptCards.js).
//   settings  key: key     { key, value, changedAt }
//   removed   key: id      { id, removedAt } and, for a deck, kind: 'deck'.
//                          One per word or deck that was removed, under its
//                          ID. Without it, combining this device's data with
//                          another's would bring it back. Gone again once the
//                          word or deck is saved again. (A word's ID has a
//                          "|" in it and a deck's has none, so the two never
//                          meet.)
//   decks     key: id      { id, name, parentId, order, changedAt } and, for
//                          some, newWordsPerDay.
//                          Groups of words. `parentId` is the deck this one
//                          is inside, or null. A deck made from a ready-made
//                          list has a fixed ID ('hsk-3.0', 'hsk-3.0/1'), the
//                          same on every device; any other has a random one
//                          (see decks.js).
//
// `changedAt` is when a record was last saved (a number, like Date.now()).
// It is filled in here, by putAll, so that when two devices' data are
// combined the newer version of a record can be kept. Records saved before
// 2026-10-13 have none.
//
// IndexedDB's own interface is built on callbacks and is awkward to use. The
// functions below wrap it so the rest of the app can simply "await" results.

const DATABASE_NAME = 'hanzi-trainer';

// Raise this number when the stores themselves change (a new store, a new
// key). The browser then runs the upgrade code below on existing databases.
const DATABASE_VERSION = 2;

export const STORES = ['words', 'cards', 'reviews', 'settings', 'removed', 'decks'];

// The stores whose records are given a `changedAt` when saved.
const STAMPED = ['words', 'settings', 'decks'];

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
        reject(new Error('Hanzi Trainer is open in another tab in an older version. Close that tab, then reload this one.'));
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

// Saves records, replacing any that have the same key. Words, settings and
// decks are marked with the time (`changedAt`).
//
// stamp: false leaves `changedAt` as it is, for a change the app makes by
//        itself to bring old records up to date. Such a change must not make
//        a record look newer than one the owner changed on another device.
export function putAll(storeName, records, { stamp = true } = {}) {
  const changedAt = Date.now();
  const stamped = stamp && STAMPED.includes(storeName);
  // A word or deck saved is one that is there: any mark of its removal goes.
  const marked = storeName === 'words' || storeName === 'decks';
  return transaction(marked ? [storeName, 'removed'] : [storeName], 'readwrite', (tx) => {
    for (const record of records) {
      tx.objectStore(storeName).put(stamped ? { ...record, changedAt } : record);
      if (marked) {
        tx.objectStore('removed').delete(record.id);
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
  return transaction(['words', 'cards', 'removed'], 'readwrite', (tx) => {
    for (const { wordId, cardIds } of entries) {
      tx.objectStore('words').delete(wordId);
      for (const id of cardIds) {
        tx.objectStore('cards').delete(id);
      }
      tx.objectStore('removed').put({ id: wordId, removedAt });
    }
  });
}

// Removes decks, leaving a mark for each. The words in them are not touched
// here: taking the decks off their words is the caller's business.
export function removeDecks(deckIds) {
  const removedAt = Date.now();
  return transaction(['decks', 'removed'], 'readwrite', (tx) => {
    for (const id of deckIds) {
      tx.objectStore('decks').delete(id);
      tx.objectStore('removed').put({ id, kind: 'deck', removedAt });
    }
  });
}

// Gives a word a new ID (its traditional form or pinyin was corrected) and
// files its cards and reviews under it, all together. `word` is the complete
// new record, with the old ID among its `formerIds` (see withFormerId in
// words.js). Card IDs begin with the word's ID, so they change with it.
export function renameWord(oldId, word) {
  const renamed = (id) => word.id + id.slice(oldId.length);
  return transaction(['words', 'cards', 'reviews', 'removed'], 'readwrite', (tx) => {
    const words = tx.objectStore('words');
    words.delete(oldId);
    words.put({ ...word, changedAt: Date.now() });
    tx.objectStore('removed').delete(word.id);
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
