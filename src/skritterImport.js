// Bringing a learner's study over from Skritter: the words, their cards and
// their whole review history. Plain calculation, no page or database, tested
// in tests/skritterImport.test.js; the pop-up is skritterImportForm.js. The
// owner's decisions are in docs/skritter.md.
//
// Skritter has no export button. Asked for their data (under data protection
// law), its support sends a .zip of JSON files, of which the import reads:
//   UserItem         one record a card: its kind (`part`: rune = writing,
//                    rdng = pinyin, tone, defn = meaning), the script it is
//                    studied in (`style`), how many reviews, and its schedule
//                    (`next` due, `stability`, `difficulty`: Skritter uses
//                    FSRS too).
//   ProgressActivity one record a study session, with every card answered in
//                    it, in order, and the grade (`score`, 1 to 4, the same
//                    four grades as here). Times are kept for the session
//                    only, not for each answer.
//   UserVocab        what the learner changed about a word: banned (left
//                    out of study, here suspended) and their own meaning.
//   VocabListInfo    the lists the learner made, with each word's
//                    traditional form.
//
// What the file lacks: the words' pinyin and meanings. A word is named only
// by its simplified characters and a number ("zh-发-0"), so both come from
// the app's dictionary. Where that has more than one word for the characters
// (发 is 發 fā "to send" and 髮 fà "hair"), each is brought over with the
// card's history, and the learner unticks those they didn't study (the
// owner, 2026-10-23).

import { filesInZip, unpack } from './ankiFile.js';
import { lookUp, proposeMeaning } from './dictionary.js';
import { checkWord, newWordRecords, scriptFor } from './words.js';
import { wordId } from './wordList.js';
import { cardIdFor } from './session.js';
import { emptyState } from './scheduler.js';
import { READY_MADE_LISTS, newDeckRecord, withDeck } from './decks.js';
import { t } from './text.js';

// Skritter's kinds of card as the app's.
const TYPE_OF_PART = { rune: 'writing', rdng: 'pinyin', tone: 'tone', defn: 'meaning' };

// The deck everything goes into, with the learner's own lists inside it.
const DECK_NAME = 'Skritter';

// ---- The file ----

// Reads the export, as Skritter sends it (a .zip).
//
// bytes: the whole file, as a Uint8Array
//
// Returns { items, activities, vocab, lists }: the records of the files
// named above (vocab and lists empty if missing). Throws, with a message for
// the learner, if it isn't a Skritter export.
export async function readSkritterExport(bytes) {
  const files = filesInZip(bytes);
  // The files are named export_<account>_<Name>_<date>.json, in a folder.
  // A zip made on a Mac also has "__MACOSX/…/._<name>" files beside them,
  // which hold no data.
  async function read(name) {
    for (const [path, file] of files) {
      const base = path.split('/').pop();
      if (!path.startsWith('__MACOSX/') && !base.startsWith('._') && base.includes(`_${name}_`) && base.endsWith('.json')) {
        return JSON.parse(new TextDecoder().decode(await unpack(file)));
      }
    }
    return null;
  }
  const items = await read('UserItem');
  const activities = await read('ProgressActivity');
  if (!Array.isArray(items) || !Array.isArray(activities)) {
    throw new Error(t('skritter.notAnExport'));
  }
  return {
    items,
    activities,
    vocab: (await read('UserVocab')) || [],
    lists: (await read('VocabListInfo')) || [],
  };
}

// ---- Which words ----

// The Skritter word an item belongs to ("zh-学习-0"), and its characters.
// The word is the item's first in `vocabIds`; the number at its end tells
// apart Skritter's words with the same simplified characters, such as the
// traditional forms of 发 (發 and 髮), so it may differ from the number in
// the item's own ID. Items of a word since taken out of Skritter's
// dictionary have no `vocabIds`, but their ID ("<account>-zh-学习-0-rdng")
// still names it.
function vocabOf(item) {
  const vocabId = (item.vocabIds && item.vocabIds[0]) || item.id.split('-').slice(1, -1).join('-');
  return { vocabId, characters: vocabId.split('-')[1] };
}

// The answers given to each card, oldest first: Map from item ID to
// [{ time, grade, duration, key }]. `key` names the answer the same way on
// every device: the session's start and the answer's place in it.
//
// Skritter keeps one time per session, so answers are spread over it at an
// even pace. A session left open for hours (one lasted three days) is timed
// by the time actually spent in it (`time`, in seconds), not by its span.
function answersByItem(activities) {
  const byItem = new Map();
  for (const activity of activities) {
    const answered = (activity.cards || []).filter((card) => typeof card.score === 'number');
    if (answered.length === 0) {
      continue;
    }
    const start = Math.round(activity.startedAt * 1000);
    const span = Math.max(0, (activity.finishedAt || activity.startedAt) - activity.startedAt) * 1000;
    const spent = (activity.time || 0) * 1000;
    const pace = Math.max(1, Math.round(Math.min(span, spent || span) / answered.length));
    answered.forEach((card, index) => {
      if (card.score < 1 || card.score > 4) {
        return;
      }
      const answers = byItem.get(card.id) || [];
      answers.push({ time: start + index * pace, grade: card.score, duration: pace, key: `${start}-${index}` });
      byItem.set(card.id, answers);
    });
  }
  for (const answers of byItem.values()) {
    answers.sort((a, b) => a.time - b.time);
  }
  return byItem;
}

// The dictionary's words a Skritter word may be, as entries (lookUp).
//
// characters: the simplified characters Skritter names it by
// styles:     the `style` of its items: 'both' where Skritter writes it the
//             same in both scripts, 'trad' or 'simp' where it doesn't
// traditional: its traditional form, if one of the learner's lists gives it
//
// Each narrowing is kept only if something is left: a name (a capital in
// the pinyin, 王 Wáng) only if the word is nothing else, as Skritter
// teaches names rarely.
export function candidatesFor(characters, styles, traditional, dictionary) {
  const narrow = (entries, keep) => {
    const kept = entries.filter(keep);
    return kept.length > 0 ? kept : entries;
  };
  let entries = lookUp(dictionary, characters).filter((entry) => entry.simplified === characters);
  if (traditional) {
    entries = narrow(entries, (entry) => entry.traditional === traditional);
  }
  if (styles.has('trad') || styles.has('simp')) {
    entries = narrow(entries, (entry) => entry.traditional !== entry.simplified);
  } else if (styles.has('both')) {
    entries = narrow(entries, (entry) => entry.traditional === entry.simplified);
  }
  entries = narrow(entries, (entry) => !/^[A-Z]/.test(entry.pinyin));
  // One entry a word: the dictionary has a line for each reading, and a
  // reading may come twice with different meanings.
  const seen = new Set();
  return entries.filter((entry) => {
    const id = `${entry.traditional}|${entry.pinyin.toLowerCase()}`;
    return !seen.has(id) && seen.add(id);
  });
}

// What the file holds, for the check step.
//
// data:    from readSkritterExport
// context: { dictionary, meaningDetail }
//
// Returns:
//   words:   one for each Skritter word with a card studied, in the order
//            first studied: { vocabId, characters, styles, reviews,
//            candidates: [word records from checkWord] }. More than one
//            candidate: the learner checks them; none: left out.
//   cards:   cards studied
//   reviews: answers in the file's sessions
export function describeSkritter(data, context) {
  const answers = answersByItem(data.activities);
  const traditionalOf = new Map();
  for (const list of data.lists) {
    for (const section of list.sections || []) {
      for (const row of section.rows || []) {
        // Most rows repeat the simplified form as the traditional one
        // (497 of the owner's 1,201, where the dictionary's differs), so
        // only a different one is taken.
        if (row.writingTrad && row.writingTrad !== row.writing) {
          traditionalOf.set(row.vocabId, row.writingTrad);
          traditionalOf.set(row.tradVocabId, row.writingTrad);
        }
      }
    }
  }
  const ownMeaning = new Map(data.vocab.filter((vocab) => vocab.c_defn).map((vocab) => [vocab.vocab, vocab.c_defn]));
  const byVocab = new Map();
  let cards = 0;
  let reviews = 0;
  for (const item of data.items) {
    const history = answers.get(item.id) || [];
    if (history.length === 0 && !item.reviews) {
      continue; // never studied: Skritter makes items for a word's parts too
    }
    cards += 1;
    reviews += history.length;
    const { vocabId, characters } = vocabOf(item);
    const word = byVocab.get(vocabId) || { vocabId, characters, styles: new Set(), reviews: 0, first: Infinity };
    word.styles.add(item.style);
    word.reviews += history.length;
    word.first = Math.min(word.first, history.length > 0 ? history[0].time : item.created * 1000);
    byVocab.set(vocabId, word);
  }
  const words = [...byVocab.values()].sort((a, b) => a.first - b.first);
  for (const word of words) {
    const entries = context.dictionary
      ? candidatesFor(word.characters, word.styles, traditionalOf.get(word.vocabId), context.dictionary)
      : [];
    word.candidates = entries
      .map((entry) =>
        checkWord({
          traditional: entry.traditional,
          simplified: entry.simplified,
          pinyin: entry.pinyin,
          definition: ownMeaning.get(word.vocabId) || proposeMeaning(entry.meanings, context.meaningDetail),
          pinyinTaiwan: entry.pinyinTaiwan || '',
        }),
      )
      .filter((result) => result.word)
      .map((result) => ({ ...result.word, id: wordId(result.word) }));
    delete word.first;
  }
  return { words, cards, reviews };
}

// ---- The import ----

// The record holding the schedule Skritter gave a card (see replay in
// scheduler.js): its due date, stability and difficulty as Skritter had
// them, dated just after its last review. The difficulty is FSRS's, 1 to
// 10; a card without Skritter's memory takes its interval as stability and
// a middling difficulty, as the Anki import does.
function scheduleOf(item, history) {
  const lastReview = Math.max(item.last ? item.last * 1000 : 0, history.length > 0 ? history[history.length - 1].time : 0);
  // Without a due date (none in the owner's file), due a day later.
  const due = item.next ? item.next * 1000 : lastReview + 86400 * 1000;
  // Skritter's interval, in seconds.
  const interval = item.interval ? item.interval / 86400 : Math.max(0, (due - lastReview) / (86400 * 1000));
  const fsrsState = {
    ...emptyState(new Date(lastReview)),
    due: new Date(due).toISOString(),
    stability: item.stability || Math.max(interval, 0.5),
    difficulty: Math.min(10, Math.max(1, item.difficulty || 5)),
    scheduled_days: Math.round(interval),
    reps: item.reviews || history.length,
    lapses: Math.max(0, (item.reviews || 0) - (item.successes || 0)),
    state: 2, // reviewing: Skritter has no learning steps
    last_review: new Date(lastReview).toISOString(),
  };
  return { time: lastReview + 1, importedSchedule: { fsrsState, due } };
}

const isReadyMade = (deck) => READY_MADE_LISTS.some((list) => deck.id === list.id || deck.id.startsWith(`${list.id}/`));

// Works out everything an import adds or changes.
//
// data:        from readSkritterExport
// description: from describeSkritter
// choices:     { leftOut: a Set of the words the learner unticked, as
//              "<Skritter's characters>><word ID>" ("发>髮|fa4"): Skritter
//              may have two words with the same characters (发 for 發 and
//              for 髮), checked together, so a word unticked is left out
//              of both }
// context:
//   words, decks: the word and deck records there are
//   cards:    a Map from card ID to the card records there are
//   settings: the current settings (for the script, see scriptFor)
//   now:      the time, as from Date.now()
//   randomId: makes a random ID (randomId in db.js), for new decks
//
// Returns { words, decks, reviews, cards, report }, as planAnkiImport
// (ankiImport.js), saved by saveImport (db.js). report:
//   { newWords, wordsThere, cardsWithSchedule, reviewsCopied,
//     alreadyStudied, suspended, leftOut: [characters] }
//   `leftOut`: Skritter words the dictionary doesn't have
export function planSkritterImport(data, description, choices, context) {
  const { settings, now } = context;
  const answers = answersByItem(data.activities);
  const report = {
    newWords: 0,
    wordsThere: 0,
    cardsWithSchedule: 0,
    reviewsCopied: 0,
    alreadyStudied: 0,
    suspended: 0,
    leftOut: [],
  };

  // Each word to bring, with the Skritter items behind its kinds of card.
  // A word that two Skritter words may be (发-0 and 发-1 both 發 fā) keeps,
  // for each kind, the item with the most reviews, as the Anki import does.
  const itemsOf = new Map();
  for (const item of data.items) {
    const { vocabId } = vocabOf(item);
    itemsOf.set(vocabId, [...(itemsOf.get(vocabId) || []), item]);
  }
  const reviewCount = (item) => (answers.get(item.id) || []).length;
  // A card Skritter counts reviews for, though none is in the sessions
  // exported, still brings its schedule.
  const studied = (item) => reviewCount(item) > 0 || item.reviews > 0;
  const banned = new Map(
    data.vocab.filter((vocab) => vocab.banned && !vocab.unbanned).map((vocab) => [vocab.vocab, vocab.banned_parts || []]),
  );
  const found = new Map(); // word ID → { word, vocabIds, sources: { type: item } }
  for (const skritterWord of description.words) {
    const kept = skritterWord.candidates.filter((word) => !choices.leftOut.has(`${skritterWord.characters}>${word.id}`));
    if (skritterWord.candidates.length === 0) {
      report.leftOut.push(skritterWord.characters);
    }
    for (const word of kept) {
      const entry = found.get(word.id) || { word, vocabIds: [], sources: {} };
      entry.vocabIds.push(skritterWord.vocabId);
      for (const item of itemsOf.get(skritterWord.vocabId) || []) {
        const type = TYPE_OF_PART[item.part];
        if (type && studied(item) && (!entry.sources[type] || reviewCount(item) > reviewCount(entry.sources[type]))) {
          entry.sources[type] = item;
        }
      }
      found.set(word.id, entry);
    }
  }

  // The deck "Skritter", and inside it a deck for each list the learner
  // made, each made where missing, so importing twice makes no new ones.
  const decks = [...context.decks];
  const newDecks = [];
  function deckNamed(name, parentId) {
    let deck = decks.find((candidate) => candidate.name === name && candidate.parentId === parentId && !isReadyMade(candidate));
    if (!deck) {
      deck = newDeckRecord(context.randomId(), name, parentId, decks);
      decks.push(deck);
      newDecks.push(deck);
    }
    return deck.id;
  }
  const listsOf = new Map(); // Skritter word → names of the learner's lists
  for (const list of data.lists) {
    for (const section of list.sections || []) {
      for (const row of section.rows || []) {
        // A word studied in traditional is under `tradVocabId`.
        for (const vocabId of new Set([row.vocabId, row.tradVocabId])) {
          listsOf.set(vocabId, new Set([...(listsOf.get(vocabId) || []), list.name]));
        }
      }
    }
  }

  const existing = new Map(context.words.map((word) => [word.id, word]));
  const { toAdd } = newWordRecords(
    [...found.values()].map(({ word }) => word),
    context.words,
    now,
  );
  const added = new Map(toAdd.map((word) => [word.id, word]));
  const words = [];
  const reviews = [];
  const cards = [];
  for (const [id, { vocabIds, sources }] of found) {
    let word = existing.get(id) || added.get(id);
    report[existing.has(id) ? 'wordsThere' : 'newWords'] += 1;
    const homeId = deckNamed(DECK_NAME, null);
    const listNames = new Set(vocabIds.flatMap((vocabId) => [...(listsOf.get(vocabId) || [])]));
    for (const name of listNames) {
      word = withDeck(word, deckNamed(name, homeId));
    }
    if (listNames.size === 0) {
      word = withDeck(word, homeId);
    }
    const suspended = new Set(word.suspended || []);
    for (const part of vocabIds.flatMap((vocabId) => banned.get(vocabId) || [])) {
      if (TYPE_OF_PART[part]) {
        suspended.add(TYPE_OF_PART[part]);
      }
    }
    let gotCards = false;
    for (const [type, item] of Object.entries(sources)) {
      // The script the card was studied in: a writing card has one of its
      // own in each script (cardIdFor).
      const script = item.style === 'simp' ? 'simplified' : item.style === 'trad' ? 'traditional' : scriptFor(word, settings);
      const cardId = cardIdFor(word, type, script);
      if (context.cards.has(cardId)) {
        report.alreadyStudied += 1;
        continue;
      }
      // Each copied review's ID is made from the session's start and the
      // answer's place in it, so importing the same file again adds
      // nothing, on this device or another.
      const history = (answers.get(item.id) || []).map((answer) => ({
        id: `skritter-${answer.key}-${id}`,
        cardId,
        wordId: id,
        type,
        time: answer.time,
        grade: answer.grade,
        script,
        duration: answer.duration,
        fromSkritter: true,
      }));
      const schedule = {
        id: `skritter-${item.id.split('-').slice(1).join('-')}-${id}-schedule`,
        cardId,
        wordId: id,
        type,
        script,
        fromSkritter: true,
        ...scheduleOf(item, history),
      };
      const all = [...history, schedule];
      reviews.push(...all);
      // The schedule record comes after every copied review, so the card is
      // what `replay(all)` would give, without replaying.
      cards.push({
        id: cardId,
        wordId: id,
        type,
        fsrsState: schedule.importedSchedule.fsrsState,
        due: schedule.importedSchedule.due,
        firstReviewedAt: all[0].time,
        lastReviewedAt: schedule.time,
      });
      report.cardsWithSchedule += 1;
      report.reviewsCopied += history.length;
      gotCards = true;
    }
    if (suspended.size > (word.suspended || []).length) {
      report.suspended += 1;
      word = { ...word, suspended: [...suspended] };
    }
    // Its cards without a history in Skritter come a few a day, as an Anki
    // word's do (planSession in session.js).
    if (gotCards) {
      word = { ...word, importedAt: word.importedAt ?? now };
    }
    words.push(word);
  }
  return { words, decks: newDecks, reviews, cards, report };
}
