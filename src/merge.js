// Combining two devices' data: what is on this device with a backup made on
// another. Plain calculation, no page or database: both sides come in as
// backups (see backup.js) and the result is a backup too.
//
// The rules, per store:
//
//   reviews   Every review of both sides is kept. They have random IDs and
//             are never changed, so the same ID is the same review.
//   words     Where both sides have a word, the one saved later (`changedAt`)
//             is kept, whole. A word whose ID was corrected on one side is
//             matched to the other side's record under the old ID through
//             `formerIds`, and the corrected one is kept.
//   decks     The one saved later is kept.
//   removed   A removal counts unless the word or deck was saved after it.
//             The marks themselves are all kept.
//   settings  The one saved later is kept, setting by setting; those that
//             belong to the device stay as they are on this device.
//   A word's `learnedAt` is the earlier of the two sides' (with that side's
//   `learnDuration`), and each time in its `startedOverAt` the later,
//   whichever record is kept.
//   cards     Not combined, but worked out afresh from the combined reviews
//             (replay in scheduler.js), unless one side already has every
//             review of the card: then its card is kept as stored.
//
// "Later" goes by each device's own clock. A record without `changedAt` was
// saved before 2026-10-13 and counts as older than any that has one. Where
// neither side is later, this device's record is kept.

import { replay } from './scheduler.js';
import { cardIdFor } from './session.js';
import { countedFrom } from './cardManager.js';

// Settings that say something about the device, not about the learner.
const DEVICE_SETTINGS = [
  'welcomeDone',
  'keepDataWanted',
  'cardsFiledByScript',
  'oldBuiltInWordsRemoved',
  'builtInListVersion',
  'studyDeck',
  'audioOffline',
  'volume',
  'lastBackupAt',
  'tipsSeen',
  'backupReminderOff',
  'tipsOn',
  'storageMessageShown',
  'theme',
];

const changedAt = (record) => (record && record.changedAt) || 0;

// Of two versions of a record, the one saved later; `mine` if neither is.
const later = (mine, theirs) => (changedAt(theirs) > changedAt(mine) ? theirs : mine);

// Records of both sides by key, the later version of each.
function laterOfEach(mine, theirs, keyName = 'id') {
  const byKey = new Map(mine.map((record) => [record[keyName], record]));
  for (const record of theirs) {
    const known = byKey.get(record[keyName]);
    byKey.set(record[keyName], known ? later(known, record) : record);
  }
  return byKey;
}

// Works out which word IDs have been replaced by another: a word whose
// characters or pinyin were corrected lists its earlier IDs in `formerIds`.
//
// Returns a function giving the ID a word (or a review's word) goes by now.
function currentIds(sides) {
  const replacedBy = new Map();
  for (const words of sides) {
    const ids = new Set(words.map((word) => word.id));
    for (const word of words) {
      for (const formerId of word.formerIds || []) {
        // If the same device has a word under the former ID as well, that is
        // a word of its own (the same characters with another reading, added
        // after the correction), not an old copy.
        if (!ids.has(formerId)) {
          replacedBy.set(formerId, word.id);
        }
      }
    }
  }
  return (id) => {
    // A word can have been corrected more than once. `seen` keeps two words
    // that each name the other from sending this round forever.
    const seen = new Set();
    while (replacedBy.has(id) && !seen.has(id)) {
      seen.add(id);
      id = replacedBy.get(id);
    }
    return id;
  };
}

// A card or review filed under its word's current ID. Card IDs begin with
// the word's ID, so they change with it.
function underCurrentId(record, currentId) {
  const wordId = currentId(record.wordId);
  if (wordId === record.wordId) {
    return record;
  }
  const cardIdName = 'cardId' in record ? 'cardId' : 'id';
  return {
    ...record,
    wordId,
    [cardIdName]: wordId + record[cardIdName].slice(record.wordId.length),
  };
}

// Combines the words of both sides. Returns them by ID.
function mergeWords(mine, theirs, currentId, removedAt) {
  // When each word was learned, under its current ID: the earliest known on
  // either side, whichever record is kept, with how long that lesson took:
  // { learnedAt, learnDuration }.
  const learned = new Map();
  const formerIds = new Map();
  // When each kind of card of a word was last started over, on either side:
  // the later time, whichever record is kept.
  const startedOverAt = new Map();
  for (const word of [...mine, ...theirs]) {
    const id = currentId(word.id);
    if (word.learnedAt !== undefined && word.learnedAt < (learned.get(id)?.learnedAt ?? Infinity)) {
      learned.set(id, { learnedAt: word.learnedAt, learnDuration: word.learnDuration });
    }
    for (const [type, time] of Object.entries(word.startedOverAt || {})) {
      const known = startedOverAt.get(id) || {};
      startedOverAt.set(id, { ...known, [type]: Math.max(time, known[type] ?? -1) });
    }
    formerIds.set(id, [...(formerIds.get(id) || []), ...(word.formerIds || [])]);
  }

  // A record still under an ID that was corrected elsewhere is an old copy:
  // the corrected word takes its place.
  const isCurrent = (word) => currentId(word.id) === word.id;
  const words = laterOfEach(mine.filter(isCurrent), theirs.filter(isCurrent));

  for (const [id, word] of words) {
    if (changedAt(word) <= (removedAt.get(id) ?? -1)) {
      words.delete(id);
      continue;
    }
    const merged = { ...word };
    if (learned.has(id)) {
      merged.learnedAt = learned.get(id).learnedAt;
      delete merged.learnDuration;
      if (learned.get(id).learnDuration !== undefined) {
        merged.learnDuration = learned.get(id).learnDuration;
      }
    }
    if (startedOverAt.has(id)) {
      merged.startedOverAt = startedOverAt.get(id);
    }
    const former = [...new Set(formerIds.get(id))].filter((formerId) => formerId !== id);
    if (former.length > 0) {
      merged.formerIds = former;
    }
    words.set(id, merged);
  }
  return words;
}

// The cards of the combined words.
//
// words:     the combined words, by ID
// reviews:   the combined reviews, under their words' current IDs
// sides:     for each side, { cards, reviewIds }: its cards (under current
//            IDs) and the IDs of the reviews it has
// removedAt: when each removed word was last removed, by ID
function mergeCards(words, reviews, sides, removedAt) {
  // A word's cards of one kind are looked at together: its writing cards in
  // the two scripts share their reviews' history (see scriptCards.js).
  const groupOf = (record) => `${record.wordId}#${record.type}`;
  const reviewsOf = new Map();
  for (const review of reviews) {
    if (words.has(review.wordId)) {
      reviewsOf.set(groupOf(review), [...(reviewsOf.get(groupOf(review)) || []), review]);
    }
  }
  // Each side's cards by group, so that they need not be searched each time.
  const cardsOf = new Map(sides.map((side) => [side, new Map()]));
  for (const side of sides) {
    for (const card of side.cards) {
      const known = cardsOf.get(side).get(groupOf(card)) || [];
      cardsOf.get(side).set(groupOf(card), [...known, card]);
    }
  }
  const storedCards = (side, group) => cardsOf.get(side).get(group) || [];

  const cards = [];
  for (const [group, all] of reviewsOf) {
    const word = words.get(all[0].wordId);
    // Reviews made before the word was removed belong to the word as it was
    // then. Added again, it starts from scratch. So does a kind of card that
    // was started over (cardManager.js).
    const removed = Math.max(removedAt.get(word.id) ?? -1, countedFrom(word, all[0].type));
    const counted = all.filter((review) => review.time > removed);

    // A side that has made or already taken in every one of these reviews
    // has the cards as they should be. They are kept as stored, so that
    // combining never changes a schedule without a reason.
    const complete = sides.find(
      (side) => storedCards(side, group).length > 0 && all.every((review) => side.reviewIds.has(review.id)),
    );
    if (complete && counted.length === all.length) {
      cards.push(...storedCards(complete, group));
      continue;
    }

    // Otherwise each card's schedule is worked out afresh from its reviews.
    // Which card a review belongs to goes by the script it was made in, not
    // by its `cardId`: a review made before 2026-10-13 can carry the plain ID
    // of a card that has since been moved to its "#simplified" ID.
    const reviewsOfCard = new Map();
    for (const review of counted) {
      const id = cardIdFor(word, review.type, review.script === 'simplified' ? 'simplified' : 'traditional');
      reviewsOfCard.set(id, [...(reviewsOfCard.get(id) || []), review]);
    }
    for (const [id, cardReviews] of reviewsOfCard) {
      const times = cardReviews.map((review) => review.time);
      cards.push({
        id,
        wordId: word.id,
        type: cardReviews[0].type,
        ...replay(cardReviews),
        firstReviewedAt: Math.min(...times),
        lastReviewedAt: Math.max(...times),
      });
    }
  }

  // A card without any review (none is made today; an import of another
  // app's schedule would make them) cannot be worked out afresh, so it is
  // kept as stored, this device's first.
  const known = new Set(cards.map((card) => card.id));
  for (const side of sides) {
    for (const card of side.cards) {
      if (words.has(card.wordId) && !reviewsOf.has(groupOf(card)) && !known.has(card.id)) {
        known.add(card.id);
        cards.push(card);
      }
    }
  }
  return cards;
}

// Combines two backups.
//
// mine:   everything on this device, as buildBackup() gives it
// theirs: the backup from the other device, already checked by checkBackup()
//
// Returns { data, summary }:
//   data:    the combined contents, one list of records per store
//   summary: counts of what combining changes on this device (see below)
export function mergeBackups(mine, theirs) {
  // An older backup does not have every store.
  const of = (side, storeName) => side[storeName] || [];

  // When each word or deck was last removed, on either side.
  const removedAt = new Map();
  const marks = new Map();
  for (const mark of [...of(mine, 'removed'), ...of(theirs, 'removed')]) {
    if (mark.removedAt > (removedAt.get(mark.id) ?? -1)) {
      removedAt.set(mark.id, mark.removedAt);
      marks.set(mark.id, mark);
    }
  }

  const currentId = currentIds([of(mine, 'words'), of(theirs, 'words')]);
  const words = mergeWords(of(mine, 'words'), of(theirs, 'words'), currentId, removedAt);

  const decks = laterOfEach(of(mine, 'decks'), of(theirs, 'decks'));
  for (const [id, deck] of decks) {
    if (changedAt(deck) <= (removedAt.get(id) ?? -1)) {
      decks.delete(id);
    }
  }

  const reviews = new Map();
  for (const review of [...of(mine, 'reviews'), ...of(theirs, 'reviews')]) {
    if (!reviews.has(review.id)) {
      reviews.set(review.id, underCurrentId(review, currentId));
    }
  }

  const sides = [mine, theirs].map((side) => ({
    cards: of(side, 'cards').map((card) => underCurrentId(card, currentId)),
    reviewIds: new Set(of(side, 'reviews').map((review) => review.id)),
  }));
  const cards = mergeCards(words, [...reviews.values()], sides, removedAt);

  const isDevices = (setting) => DEVICE_SETTINGS.includes(setting.key);
  // Cards from a device that has not yet filed its writing cards by script
  // (scriptCards.js) may come in unfiled; without the note that it was done
  // here, the app does it again when it next starts.
  const theirsAreFiled = of(theirs, 'settings').some((setting) => setting.key === 'cardsFiledByScript' && setting.value);
  const settings = [
    ...of(mine, 'settings').filter(
      (setting) => isDevices(setting) && (theirsAreFiled || setting.key !== 'cardsFiledByScript'),
    ),
    ...laterOfEach(
      of(mine, 'settings').filter((setting) => !isDevices(setting)),
      of(theirs, 'settings').filter((setting) => !isDevices(setting)),
      'key',
    ).values(),
  ];

  const data = {
    words: [...words.values()],
    cards,
    reviews: [...reviews.values()],
    settings,
    removed: [...marks.values()],
    decks: [...decks.values()],
  };
  return { data, summary: summarize(mine, data) };
}

// Counts what combining changes on this device.
//
// Returns { wordsAdded, wordsChanged, wordsRemoved, decksAdded, decksRemoved,
//           reviewsAdded, cardsChanged, settingsChanged }.
function summarize(mine, data) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const compare = (storeName, keyName = 'id') => {
    const before = new Map((mine[storeName] || []).map((record) => [record[keyName], record]));
    const after = new Map(data[storeName].map((record) => [record[keyName], record]));
    return {
      added: [...after.keys()].filter((key) => !before.has(key)).length,
      removed: [...before.keys()].filter((key) => !after.has(key)).length,
      changed: [...after].filter(([key, record]) => before.has(key) && !same(before.get(key), record)).length,
    };
  };
  const words = compare('words');
  const decks = compare('decks');
  const cards = compare('cards');
  return {
    wordsAdded: words.added,
    wordsChanged: words.changed,
    wordsRemoved: words.removed,
    decksAdded: decks.added,
    decksRemoved: decks.removed,
    reviewsAdded: compare('reviews').added,
    // A card that is new here, gone, or due at another time than before.
    cardsChanged: cards.added + cards.removed + cards.changed,
    settingsChanged: compare('settings', 'key').added + compare('settings', 'key').changed,
  };
}

// The summary as lines of text for the person, leaving out what is zero.
// Returns an empty list if combining changes nothing on this device.
export function describeMerge(summary) {
  const count = (number, one, many) => `${number} ${number === 1 ? one : many}`;
  const lines = [
    [summary.wordsAdded, count(summary.wordsAdded, 'new word', 'new words')],
    [summary.wordsChanged, `${count(summary.wordsChanged, 'word', 'words')} changed on the other device`],
    [summary.wordsRemoved, `${count(summary.wordsRemoved, 'word', 'words')} removed on the other device`],
    [summary.decksAdded, count(summary.decksAdded, 'new deck', 'new decks')],
    [summary.decksRemoved, `${count(summary.decksRemoved, 'deck', 'decks')} deleted on the other device`],
    [summary.reviewsAdded, count(summary.reviewsAdded, 'new review', 'new reviews')],
    [summary.cardsChanged, `${count(summary.cardsChanged, 'card', 'cards')} with a new schedule`],
    [summary.settingsChanged, `${count(summary.settingsChanged, 'setting', 'settings')} changed on the other device`],
  ];
  return lines.filter(([number]) => number > 0).map(([, text]) => text);
}
