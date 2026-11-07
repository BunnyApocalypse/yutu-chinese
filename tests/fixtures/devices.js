// Two devices' data, made up for the sync tests (syncBatch.test.js,
// sync.test.js): records as the app would have saved them, and what the
// database does with them, held in memory.

import { gradeOptions, GOOD, HARD, AGAIN, EASY } from '../../src/scheduler.js';
import { DEVICE_SETTINGS } from '../../src/merge.js';

export const DAY = 24 * 60 * 60 * 1000;
export const START = new Date('2026-09-01T09:00:00').getTime();

// A word record. `changedAt` is given in days after START.
export function word(traditional, pinyin, { day, ...rest } = {}) {
  return {
    id: `${traditional}|${pinyin}`,
    traditional,
    simplified: traditional,
    pinyin,
    definition: 'meaning',
    order: 0,
    decks: ['chinese'],
    ...(day === undefined ? {} : { changedAt: START + day * DAY }),
    ...rest,
  };
}

// A device's data, as a backup: its words, and for each entry of `studied`
// a card with the reviews that made it, as the app would have saved them.
//
// studied: [{ word, type, grades: [[day, grade], ...], name }]
//          `name` makes the review IDs; reviews of the same name and number
//          are the same review on two devices.
export function device({ words = [], studied = [], removed = [], decks = [], settings = [] } = {}) {
  const cards = [];
  const reviews = [];
  for (const { word: studiedWord, type = 'meaning', grades, name = 'r' } of studied) {
    let state = null;
    let due = null;
    const id = `${studiedWord.id}#${type}`;
    grades.forEach(([day, grade], index) => {
      const time = START + day * DAY;
      ({ fsrsState: state, due } = gradeOptions(state, new Date(time))[grade]);
      reviews.push({ id: `${name}-${id}-${index}`, cardId: id, wordId: studiedWord.id, type, time, grade, script: 'traditional' });
    });
    cards.push({
      id,
      wordId: studiedWord.id,
      type,
      due,
      firstReviewedAt: START + grades[0][0] * DAY,
      lastReviewedAt: START + grades.at(-1)[0] * DAY,
      fsrsState: state,
    });
  }
  return { words, cards, reviews, settings, removed, decks };
}

// What readSlice in db.js reads, from data held in memory.
export function sliceOf(data, wordIds) {
  return {
    words: data.words,
    decks: data.decks,
    settings: data.settings,
    removed: data.removed,
    reviews: data.reviews.filter((review) => wordIds.has(review.wordId)),
    cards: data.cards.filter((card) => wordIds.has(card.id.slice(0, card.id.indexOf('#')))),
  };
}

// What saveTakenIn in db.js does, to data held in memory.
export function saveChanges(data, { put, remove }) {
  const result = {};
  for (const [storeName, records] of Object.entries(data)) {
    const keyName = storeName === 'settings' ? 'key' : 'id';
    const byKey = new Map(records.map((record) => [record[keyName], record]));
    for (const key of remove[storeName] || []) {
      byKey.delete(key);
    }
    for (const record of put[storeName] || []) {
      byKey.set(record[keyName], record);
    }
    result[storeName] = [...byKey.values()];
  }
  return result;
}

// Lists in a fixed order, so that two results can be compared.
export function sorted(data) {
  const result = {};
  for (const [storeName, records] of Object.entries(data)) {
    const key = (record) => record.id ?? record.key;
    result[storeName] = [...records].sort((a, b) => (key(a) < key(b) ? -1 : 1));
  }
  return result;
}

// Two devices that have studied some of the same words, each with words and
// a deck of its own, and one word removed on the other device.
export function twoDevices() {
  const love = word('愛', 'ai4', { day: 1 });
  const loveLater = word('愛', 'ai4', { day: 5, definition: 'love (corrected)' });
  const cat = word('貓', 'mao1', { day: 2 });
  const dog = word('狗', 'gou3', { day: 1 });
  const fish = word('魚', 'yu2', { day: 3 });
  const shared = [[1, GOOD], [3, HARD]];
  const mine = device({
    words: [love, dog],
    studied: [
      { word: love, grades: shared },
      { word: dog, grades: [[1, GOOD], [4, AGAIN]] },
    ],
    decks: [{ id: 'chinese', name: 'Chinese', parentId: null, order: 0, changedAt: START }],
    settings: [
      { key: 'theme', value: 'dark', changedAt: START + 9 * DAY },
      { key: 'newWordsPerDay', value: 5, changedAt: START },
    ],
  });
  const theirs = device({
    words: [loveLater, cat, fish],
    studied: [
      { word: loveLater, grades: [...shared, [6, GOOD], [12, EASY]] },
      { word: cat, type: 'pinyin', grades: [[2, GOOD], [5, GOOD]], name: 's' },
      { word: fish, type: 'writing', grades: [[3, AGAIN], [3.01, GOOD]], name: 's' },
    ],
    removed: [{ id: dog.id, removedAt: START + 6 * DAY }],
    decks: [{ id: 'hsk', name: 'HSK', parentId: null, order: 1, changedAt: START + 2 * DAY }],
    settings: [
      { key: 'theme', value: 'light', changedAt: START + 10 * DAY },
      { key: 'newWordsPerDay', value: 10, changedAt: START + 3 * DAY },
    ],
  });
  return { mine, theirs };
}

// The other device's data as its outbox would hold it: no cards.
export const outboxOf = (data) => ({ ...data, cards: undefined });


const KEYS = { words: 'id', cards: 'id', reviews: 'id', settings: 'key', removed: 'id', decks: 'id' };
const SYNCED = ['words', 'settings', 'decks', 'reviews', 'removed'];

// A device's database held in memory, with what db.js offers syncing.
// Everything in `initial` was saved while sync was on, so it is all in the
// outbox, except cards, which are never sent; or, with `before`, it was
// there before sync was turned on, and the outbox says "everything".
export function memoryDevice(initial = {}, { before = false } = {}) {
  let data = Object.fromEntries(Object.keys(KEYS).map((storeName) => [storeName, [...(initial[storeName] || [])]]));
  const outbox = new Map();
  const values = new Map();
  let tokens = 0;
  const note = (storeName, key) => {
    const entryKey = `${storeName}:${key}`;
    outbox.set(entryKey, { key: entryKey, store: storeName, id: key, token: ++tokens });
  };
  if (before) {
    outbox.set('everything', { key: 'everything', store: null, id: null, token: ++tokens });
  } else {
    for (const storeName of SYNCED) {
      for (const record of data[storeName]) {
        note(storeName, record[KEYS[storeName]]);
      }
    }
  }
  return {
    data: () => data,
    outbox,
    // What the app does when the learner saves records, with sync on.
    save(storeName, records) {
      data = saveChanges(data, { put: { [storeName]: records }, remove: {} });
      for (const record of records) {
        note(storeName, record[KEYS[storeName]]);
      }
    },
    async getSyncValue(key, fallback) {
      return values.has(key) ? structuredClone(values.get(key)) : fallback;
    },
    async setSyncValue(key, value) {
      values.set(key, structuredClone(value));
    },
    async readOutbox() {
      const entries = [...outbox.values()].map((entry) => ({ ...entry }));
      if (outbox.has('everything')) {
        return { entries, records: structuredClone(data) };
      }
      const records = Object.fromEntries(SYNCED.map((storeName) => [storeName, []]));
      for (const entry of entries) {
        const record = data[entry.store].find((found) => found[KEYS[entry.store]] === entry.id);
        if (record) {
          records[entry.store].push(record);
        }
      }
      return { entries, records };
    },
    async takeOffOutbox(entries) {
      for (const entry of entries) {
        if (outbox.get(entry.key)?.token === entry.token) {
          outbox.delete(entry.key);
        }
      }
    },
    async getAll(storeName) {
      return data[storeName];
    },
    async readSlice(wordIds) {
      return sliceOf(data, wordIds);
    },
    async readEverything() {
      return structuredClone(data);
    },
    async saveTakenIn(changes) {
      data = saveChanges(data, changes);
    },
  };
}

// A device's data without the settings that belong to it, which differ
// between devices by design.
export const learnersData = (data) =>
  sorted({ ...data, settings: data.settings.filter((setting) => !DEVICE_SETTINGS.includes(setting.key)) });
