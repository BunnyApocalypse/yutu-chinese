// Bringing a deck over from Anki: what the notes say, which of the app's
// cards Anki's cards stand for, and their schedules. Plain calculation, no
// page or database, tested in tests/ankiImport.test.js; the file is read by
// ankiFile.js and the pop-up is ankiImportForm.js. The owner's decisions are
// in docs/anki.md.
//
// How Anki is laid out, for what follows:
//   - A *note* is one thing learned, say a word, with *fields*: Hanzi,
//     Pinyin, Meaning, Audio. Every deck names and orders its fields its own
//     way, so the app guesses which field is which and the learner confirms.
//   - A note's *note type* has one or more *card templates*, and each makes
//     one card from the note: "Recognition" shows {{Hanzi}} and asks for the
//     rest, "Recall" shows {{Meaning}}. The app guesses which of its own
//     kinds of card (meaning, pinyin, tone, writing) each template stands
//     for, and the learner confirms that too.
//   - Each card has its schedule and its reviews (the "review log").
//
// What happens to a card's schedule (the owner, 2026-10-19): every review in
// Anki's log is copied, and one record more holds the schedule Anki had
// given the card (`importedSchedule`, see replay in scheduler.js), so the
// card is due on the day Anki said and the app's FSRS takes over from its
// next review.

import { lookUp, readTypedPinyin, readsAs, proposeMeaning, otherScriptForm } from './dictionary.js';
import { checkWord, tidyPinyin, newWordRecords, scriptFor } from './words.js';
import { wordId } from './wordList.js';
import { cardIdFor, CARD_TYPES } from './session.js';
import { replay, emptyState } from './scheduler.js';
import { READY_MADE_LISTS, newDeckRecord, withDeck } from './decks.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// ---- Reading a field ----

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// A field's text as a learner would read it. Anki fields are bits of web
// page: line breaks are <br> or <div>, a word may be in <b>, a sound is
// written [sound:file.mp3], and & is written &amp;. All that is taken out;
// lines are kept, one per line break, with spaces tidied.
export function cleanField(text) {
  return (text || '')
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<br\s*\/?>|<\/(?:div|p|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
      if (name[0] === '#') {
        const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
        return String.fromCodePoint(code);
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '')
    .join('\n');
}

// The fields a template shows, by name: "{{Hanzi}}<br>{{type:Pinyin}}" gives
// ['Hanzi', 'Pinyin']. Anki's own fields ({{FrontSide}}, {{Tags}}, ...) and
// the conditions around parts of a template ({{#Field}}...{{/Field}}, shown
// only if the field is filled in) are left out.
//
// Returns { fields, cloze }: `cloze` is true for a template that blanks out
// parts of a text ({{cloze:Text}}), which is not a word to learn.
export function fieldsInTemplate(text) {
  const fields = [];
  let cloze = false;
  for (const [, inside] of (text || '').matchAll(/\{\{([^}]+)\}\}/g)) {
    const tag = inside.trim();
    if (/^[#^/]/.test(tag)) {
      continue;
    }
    const parts = tag.split(':');
    if (parts.slice(0, -1).some((part) => part.trim() === 'cloze')) {
      cloze = true;
    }
    const name = parts[parts.length - 1].trim();
    if (!['FrontSide', 'Tags', 'Deck', 'Subdeck', 'Card', 'Type', 'CardFlag'].includes(name)) {
      fields.push(name);
    }
  }
  return { fields, cloze };
}

const HAN = /\p{Script=Han}/gu;

// Whether a line is pinyin: with tone numbers (ni3hao3) or tone marks
// (nǐhǎo, nǐ hǎo). Without either it could as well be English ("hen").
function isPinyin(line) {
  if (tidyPinyin(line) !== null) {
    return true;
  }
  const typed = readTypedPinyin(line);
  return typed !== null && typed.tones.length > 0;
}

// What a field holds, by its text: 'characters' (mostly Chinese
// characters), 'pinyin', 'meaning' (other text in letters), or '' if empty
// or none of those.
function kindOf(text) {
  const clean = cleanField(text);
  if (clean === '') {
    return '';
  }
  const han = (clean.match(HAN) || []).length;
  if (han > 0) {
    return han * 2 >= clean.replace(/\s/g, '').length ? 'characters' : '';
  }
  if (!clean.includes('\n') && isPinyin(clean)) {
    return 'pinyin';
  }
  return /[a-z]/i.test(clean) ? 'meaning' : '';
}

// Field names that say what a field holds, for when its contents leave it
// open (an empty Pinyin field on a new deck, say).
const NAME_HINTS = {
  characters: /hanzi|chinese|character|simplified|traditional|^word$|expression|front|中文|汉字|漢字/i,
  pinyin: /pinyin|reading|pronunciation|拼音/i,
  meaning: /meaning|english|definition|translation|gloss|back|意思/i,
};

// The roles of a note type's fields, guessed from its notes.
//
// noteType: from readCollection (ankiFile.js)
// notes:    that note type's notes (the first 200 are looked at)
// script:   the script learned, 'traditional' or 'simplified': of two fields
//           of characters, the one named after it is taken
//
// Returns { characters, pinyin, meaning }: the index of the field holding
// each, or null for none. A note type of cards with one side in Chinese and
// the other "pinyin, then the meaning" (Anki's Basic, often) has no pinyin
// field; the pinyin is then taken from the meaning's first line (wordFromNote).
export function guessRoles(noteType, notes, script = 'traditional') {
  const sample = notes.slice(0, 200);
  const roles = { characters: null, pinyin: null, meaning: null };
  const taken = new Set();
  for (const role of ['characters', 'pinyin', 'meaning']) {
    let best = null;
    let bestScore = 0;
    noteType.fields.forEach((name, index) => {
      if (taken.has(index)) {
        return;
      }
      const filled = sample.filter((note) => cleanField(note.fields[index]) !== '');
      const matching = filled.filter((note) => kindOf(note.fields[index]) === role).length;
      // Mostly the right kind of text counts most; the name decides between
      // fields alike, or for a field still empty.
      let score = filled.length > 0 ? matching / filled.length : 0;
      if (score < 0.5 && filled.length > 0) {
        score = 0;
      }
      if (NAME_HINTS[role].test(name)) {
        score += filled.length > 0 ? 0.1 : 0.6;
      }
      if (role === 'characters' && /trad|simp|繁|简/i.test(name)) {
        const wanted = script === 'simplified' ? /simp|简/i : /trad|繁/i;
        score += wanted.test(name) ? 0.05 : 0;
      }
      if (score > bestScore) {
        best = index;
        bestScore = score;
      }
    });
    if (best !== null && bestScore >= 0.5) {
      roles[role] = best;
      taken.add(best);
    }
  }
  return roles;
}

// Which of the app's kinds of card each of a note type's templates stands
// for, guessed from what the template shows on the front.
//
// roles: from guessRoles
//
// Returns { [ord]: { types, couldBeWriting } }:
//   types:          the app's card types the template's cards feed
//   couldBeWriting: the front shows the meaning and the back the characters,
//                   so the learner may count it for writing. Anki can't
//                   check writing, so this is never ticked by itself (the
//                   owner, 2026-10-19: "let the learner choose").
export function guessCardTypes(noteType, roles) {
  const nameOf = (role) => (roles[role] === null ? null : noteType.fields[roles[role]]);
  const guesses = {};
  for (const template of noteType.templates) {
    const front = fieldsInTemplate(template.front);
    const back = fieldsInTemplate(template.back);
    const onFront = (role) => nameOf(role) !== null && front.fields.includes(nameOf(role));
    const onBack = (role) => nameOf(role) !== null && back.fields.includes(nameOf(role));
    const types = [];
    let couldBeWriting = false;
    if (front.cloze || back.cloze) {
      // Not a word to learn.
    } else if (onFront('characters')) {
      types.push('meaning');
      // The reading is asked for if it is only on the back: in its own
      // field, or with the meaning where there is no field for it.
      const readingAsked = roles.pinyin !== null ? !onFront('pinyin') && onBack('pinyin') : onBack('meaning');
      if (readingAsked) {
        types.push('pinyin');
      }
    } else if (onFront('meaning') && onBack('characters')) {
      couldBeWriting = true;
    }
    guesses[template.ord] = { types, couldBeWriting };
  }
  return guesses;
}

// What a learner is shown before importing, and the guesses the pop-up
// starts from.
//
// collection: from readCollection (ankiFile.js)
// script:     the script learned (for guessRoles)
//
// Returns:
//   decks:     [{ id, name, cardCount }], the decks with cards, by name
//   noteTypes: [{ id, name, fields, noteCount, example, roles, templates }]
//              for the note types that have notes. `example` is the first
//              note's fields, cleaned; `templates` is [{ ord, name, front,
//              cardCount, types, couldBeWriting }], `front` the fields its
//              front shows. `roles`, `types`: the guesses.
//   reviewCount: how many reviews the file holds (none in a shared deck)
export function describeCollection(collection, script = 'traditional') {
  const cardCount = new Map();
  for (const card of collection.cards) {
    cardCount.set(card.deckId, (cardCount.get(card.deckId) || 0) + 1);
  }
  const decks = collection.decks
    .filter((deck) => cardCount.has(deck.id))
    .map((deck) => ({ id: deck.id, name: deck.name, cardCount: cardCount.get(deck.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const notesOf = new Map();
  for (const note of collection.notes) {
    notesOf.set(note.noteTypeId, [...(notesOf.get(note.noteTypeId) || []), note]);
  }
  const noteTypes = collection.noteTypes
    .filter((noteType) => notesOf.has(noteType.id))
    .map((noteType) => {
      const notes = notesOf.get(noteType.id);
      const noteIds = new Set(notes.map((note) => note.id));
      const roles = guessRoles(noteType, notes, script);
      const guesses = guessCardTypes(noteType, roles);
      return {
        id: noteType.id,
        name: noteType.name,
        fields: noteType.fields,
        noteCount: notes.length,
        example: notes[0].fields.map(cleanField),
        roles,
        templates: noteType.templates.map((template) => ({
          ord: template.ord,
          name: template.name,
          front: fieldsInTemplate(template.front).fields,
          cardCount: collection.cards.filter((card) => noteIds.has(card.noteId) && card.ord === template.ord).length,
          ...guesses[template.ord],
        })),
      };
    });
  return { decks, noteTypes, reviewCount: collection.reviews.length };
}

// The choices the pop-up starts with: every deck, and the guesses.
//
// Returns { deckIds: Set, noteTypes: { [id]: { roles, templates: { [ord]: types } } } }
export function defaultChoices(description) {
  return {
    deckIds: new Set(description.decks.map((deck) => deck.id)),
    noteTypes: Object.fromEntries(
      description.noteTypes.map((noteType) => [
        noteType.id,
        {
          roles: { ...noteType.roles },
          templates: Object.fromEntries(noteType.templates.map((template) => [template.ord, [...template.types]])),
        },
      ]),
    ),
  };
}

// ---- A note as a word ----

// Pinyin with tone marks and a space or ' between syllables ("nǐ hǎo")
// turned into the app's numbered pinyin ("ni3hao3"), for a word the
// dictionary doesn't have. Without a separator between syllables the
// dictionary is needed to tell where they end, so that gives null.
function numberedPinyin(text) {
  const syllables = text.split(/[\s'’-]+/).filter(Boolean);
  const numbered = [];
  for (const syllable of syllables) {
    const typed = readTypedPinyin(syllable);
    if (!typed || typed.tones.length > 1) {
      return null;
    }
    numbered.push(typed.letters + (typed.tones.length === 1 ? typed.tones[0].tone : 5));
  }
  return tidyPinyin(numbered.join(''));
}

// Makes a word out of a note's characters, pinyin and meaning, checked as
// a typed word is (checkWord), with the dictionary's help: it gives the
// other script's form, the reading where the note has none (or has it with
// tone marks the app can't split by itself), and a meaning where the note
// has none.
//
// texts:   { characters, pinyin, meaning }, cleaned fields ('' if none)
// context: { dictionary, likeliestEntry(entries, characters), meaningDetail }
//          `dictionary` may be null; `likeliestEntry` picks the entry with
//          the usual reading (dictionaryLoader.js)
//
// Returns { word } or { problem }, as checkWord does.
export function wordFromNote(texts, context) {
  const characters = texts.characters.replace(/\s+/g, '');
  let pinyinText = texts.pinyin.split('\n')[0] || '';
  let meaning = texts.meaning;
  // No pinyin field: the meaning's first line may be the reading (Basic).
  if (pinyinText === '' && meaning !== '') {
    const [first, ...rest] = meaning.split('\n');
    if (isPinyin(first)) {
      pinyinText = first;
      meaning = rest.join('; ');
    }
  }
  meaning = meaning.split('\n').join('; ');

  const entries = context.dictionary ? lookUp(context.dictionary, characters) : [];
  let entry = null;
  let pinyin = '';
  if (pinyinText !== '') {
    const typed = readTypedPinyin(pinyinText);
    entry = (typed && entries.find((candidate) => readsAs(candidate, typed))) || null;
    pinyin = entry ? entry.pinyin : tidyPinyin(pinyinText) || numberedPinyin(pinyinText) || pinyinText;
  } else if (entries.length > 0) {
    entry = context.likeliestEntry ? context.likeliestEntry(entries, characters) : entries[0];
    pinyin = entry.pinyin;
  }
  // Which script the note is written in: traditional unless the dictionary
  // says these characters are the simplified form.
  const script = entries.some((candidate) => candidate.traditional === characters) || entries.length === 0
    ? 'traditional'
    : 'simplified';
  const other = script === 'traditional' ? 'simplified' : 'traditional';
  const otherForm = entry ? entry[other] : otherScriptForm(entries, script, characters, tidyPinyin(pinyin) || '');
  if (meaning === '' && entry) {
    meaning = proposeMeaning(entry.meanings, context.meaningDetail);
  }
  return checkWord({
    [script]: characters,
    [other]: otherForm,
    pinyin,
    definition: meaning,
    pinyinTaiwan: entry && entry.pinyinTaiwan && entry.pinyin === pinyin ? entry.pinyinTaiwan : '',
  });
}

// ---- Schedules ----

// The reviews of an Anki card that count, oldest first: all after the last
// time it was reset to new ("Forget" in Anki, logged as a manual entry
// with no interval, as Start over is here), leaving out manual changes of
// due date and anything without a grade.
//
// Anki's log types: 0 learning, 1 review, 2 relearning, 3 in a filtered
// deck, 4 manual, 5 rescheduled.
function countedReviews(reviews) {
  let start = 0;
  reviews.forEach((review, index) => {
    if (review.type === 4 && review.interval === 0) {
      start = index + 1;
    }
  });
  return reviews.slice(start).filter((review) => review.type <= 3 && review.ease >= 1 && review.ease <= 4);
}

// When an Anki card is due, in milliseconds since 1970. A review card's
// `due` counts days from the collection's creation (whose time is at the
// hour Anki's day starts); a card in its learning steps is due at a moment,
// in seconds, unless its next step is a day or more away (then in days too).
function dueOf(card, createdAt) {
  const inSeconds = card.due > 1e9;
  return inSeconds ? card.due * 1000 : (createdAt + card.due * 86400) * 1000;
}

// Anki's FSRS memory of a card, kept in its `data` as {"s":…,"d":…}, or null.
function memoryOf(card) {
  try {
    const data = JSON.parse(card.data || '{}');
    return typeof data.s === 'number' && typeof data.d === 'number' ? { stability: data.s, difficulty: data.d } : null;
  } catch {
    return null;
  }
}

// ts-fsrs's names for where a card is: Anki's card types 1 to 3 are the same.
const FSRS_STATES = { 1: 1, 2: 2, 3: 3 };

// The record holding the schedule Anki gave a card (see replay in
// scheduler.js), and the time it is dated: just after the card's last
// review in Anki, or for a card whose log is missing, when that review
// would have been.
//
// The FSRS state is the one the copied reviews give, with Anki's due date,
// interval and counts. Its memory (stability and difficulty) is Anki's own
// where Anki used FSRS; otherwise it is worked out from the reviews, as
// Anki itself does when someone switches to FSRS.
function importedSchedule(card, history, createdAt) {
  const due = dueOf(card, createdAt);
  const lastReview =
    history.length > 0
      ? history[history.length - 1].time
      : card.type === 2
        ? due - card.interval * DAY_MS
        : due - 10 * 60 * 1000;
  const rebuilt = history.length > 0 ? replay(history).fsrsState : emptyState(new Date(lastReview));
  const memory = memoryOf(card);
  const fsrsState = {
    ...rebuilt,
    due: new Date(due).toISOString(),
    stability: memory ? memory.stability : rebuilt.stability || Math.max(card.interval, 0.5),
    difficulty: memory ? memory.difficulty : rebuilt.difficulty || 5,
    scheduled_days: card.type === 2 ? card.interval : 0,
    reps: card.reps,
    lapses: card.lapses,
    state: FSRS_STATES[card.type],
    last_review: new Date(lastReview).toISOString(),
  };
  return { time: lastReview + 1, importedSchedule: { fsrsState, due } };
}

// ---- The import ----

// Whether a deck is one of the ready-made ones (decks.js); Anki's words are
// never put in those.
const isReadyMade = (deck) => READY_MADE_LISTS.some((list) => deck.id === list.id || deck.id.startsWith(`${list.id}/`));

// Works out everything an import adds or changes.
//
// collection: from readCollection (ankiFile.js)
// choices:    as from defaultChoices, changed by the learner
// context:
//   dictionary, likeliestEntry, meaningDetail: for wordFromNote
//   words:    the word records there are
//   decks:    the deck records there are
//   cards:    a Map from card ID to the card records there are
//   settings: the current settings (for the script, see scriptFor)
//   now:      the time, as from Date.now()
//   randomId: makes a random ID (randomId in db.js), for new decks
//
// Returns:
//   words:   word records to save: new ones, and ones there already that
//            were put in a deck or given cards
//   decks:   new deck records, one for each Anki deck not already here by
//            name (in the same deck), so importing twice makes no new ones
//   reviews: review records to save: Anki's reviews and imported schedules
//   cards:   card records to save, worked out from those reviews
//   report:  { notesRead, newWords, wordsThere, cardsWithSchedule,
//              reviewsCopied, alreadyStudied, sameWord, problems }
//            `problems`: [{ text, problem }] for notes left out;
//            `alreadyStudied`: cards left as they are, studied here already;
//            `sameWord`: notes that are a word another note is too
export function planAnkiImport(collection, choices, context) {
  const { settings, now } = context;
  const reviewsOf = new Map();
  for (const review of collection.reviews) {
    reviewsOf.set(review.cardId, [...(reviewsOf.get(review.cardId) || []), review]);
  }
  const cardsOf = new Map();
  for (const card of collection.cards) {
    cardsOf.set(card.noteId, [...(cardsOf.get(card.noteId) || []), card]);
  }
  for (const cards of cardsOf.values()) {
    cards.sort((a, b) => a.ord - b.ord);
  }
  const deckName = new Map(collection.decks.map((deck) => [deck.id, deck.name]));

  // The notes to bring: of a note type with a field of characters, with a
  // card in a chosen deck. In Anki's order for new cards (`due` is a new
  // card's place in line), so that words wait in Learn in that order.
  const linePlace = (note) =>
    Math.min(...(cardsOf.get(note.id) || []).map((card) => (card.type === 0 ? card.due : -1)), Infinity);
  const notes = collection.notes
    .filter((note) => {
      const choice = choices.noteTypes[note.noteTypeId];
      return (
        choice &&
        choice.roles.characters !== null &&
        (cardsOf.get(note.id) || []).some((card) => choices.deckIds.has(card.deckId))
      );
    })
    .sort((a, b) => linePlace(a) - linePlace(b) || a.id - b.id);

  const report = {
    notesRead: notes.length,
    newWords: 0,
    wordsThere: 0,
    cardsWithSchedule: 0,
    reviewsCopied: 0,
    alreadyStudied: 0,
    sameWord: 0,
    problems: [],
  };

  // Each note made into a word, and the Anki cards behind each of the
  // word's kinds of card. A word in two notes keeps, for each kind, the
  // card with the most reviews (the owner, 2026-10-19).
  const found = new Map(); // word ID → { word, deckId, sources: { type: card } }
  const reviewCount = (card) => countedReviews(reviewsOf.get(card.id) || []).length;
  for (const note of notes) {
    const { roles, templates } = choices.noteTypes[note.noteTypeId];
    const text = (role) => (roles[role] === null ? '' : cleanField(note.fields[roles[role]]));
    const texts = { characters: text('characters'), pinyin: text('pinyin'), meaning: text('meaning') };
    const result = wordFromNote(texts, context);
    if (result.problem) {
      report.problems.push({ text: texts.characters || cleanField(note.fields[0]), problem: result.problem });
      continue;
    }
    const id = wordId(result.word);
    const cards = cardsOf.get(note.id) || [];
    if (found.has(id)) {
      report.sameWord += 1;
    } else {
      const home = cards.find((card) => choices.deckIds.has(card.deckId));
      found.set(id, { word: result.word, deckId: home.deckId, sources: {} });
    }
    const { sources } = found.get(id);
    for (const card of cards) {
      for (const type of templates[card.ord] || []) {
        if (!sources[type] || reviewCount(card) > reviewCount(sources[type])) {
          sources[type] = card;
        }
      }
    }
  }

  // Anki's decks as the app's, made where missing: "Chinese::HSK 1" is the
  // deck HSK 1 inside the deck Chinese.
  const decks = [...context.decks];
  const newDecks = [];
  const appDeckOf = new Map();
  function appDeck(ankiDeckId) {
    if (!appDeckOf.has(ankiDeckId)) {
      let parentId = null;
      for (const name of (deckName.get(ankiDeckId) || 'Anki').split('::')) {
        let deck = decks.find((candidate) => candidate.name === name && candidate.parentId === parentId && !isReadyMade(candidate));
        if (!deck) {
          deck = newDeckRecord(context.randomId(), name, parentId, decks);
          decks.push(deck);
          newDecks.push(deck);
        }
        parentId = deck.id;
      }
      appDeckOf.set(ankiDeckId, parentId);
    }
    return appDeckOf.get(ankiDeckId);
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
  for (const [id, { deckId, sources }] of found) {
    let word = existing.get(id) || added.get(id);
    report[existing.has(id) ? 'wordsThere' : 'newWords'] += 1;
    word = withDeck(word, appDeck(deckId));
    const script = scriptFor(word, settings);
    // Recalling the pinyin is recalling its tones, so a tone card no
    // template was chosen for goes by the pinyin card (the owner,
    // 2026-10-19), if the word can have one: a syllable per character.
    const syllables = (reading) => (reading.match(/[a-z]+[1-5]/gi) || []).length;
    const canHaveTone = word.pinyin
      .split(', ')
      .some((reading) => syllables(reading) === Array.from(word.traditional).length);
    if (!sources.tone && sources.pinyin && canHaveTone) {
      sources.tone = sources.pinyin;
    }
    const suspended = new Set(word.suspended || []);
    let gotCards = false;
    for (const type of CARD_TYPES) {
      const card = sources[type];
      // A card new in Anki has nothing to bring; the word is learned here.
      if (!card || card.type === 0) {
        continue;
      }
      const cardId = cardIdFor(word, type, script);
      if (context.cards.has(cardId)) {
        report.alreadyStudied += 1;
        continue;
      }
      // Each copied review's ID is made from Anki's own, so importing the
      // same file again adds nothing, on this device or another.
      const history = countedReviews(reviewsOf.get(card.id) || []).map((review) => ({
        id: `anki-${review.id}-${type}`,
        cardId,
        wordId: id,
        type,
        time: review.id,
        grade: review.ease,
        script,
        duration: review.took,
        fromAnki: true,
      }));
      const schedule = {
        id: `anki-${card.id}-${type}-schedule`,
        cardId,
        wordId: id,
        type,
        script,
        fromAnki: true,
        ...importedSchedule(card, history, collection.createdAt),
      };
      const all = [...history, schedule];
      const times = all.map((review) => review.time);
      reviews.push(...all);
      cards.push({
        id: cardId,
        wordId: id,
        type,
        ...replay(all),
        firstReviewedAt: Math.min(...times),
        lastReviewedAt: Math.max(...times),
      });
      report.cardsWithSchedule += 1;
      report.reviewsCopied += history.length;
      gotCards = true;
      // Anki's queue -1: suspended by the learner.
      if (card.queue === -1) {
        suspended.add(type);
      }
    }
    if (suspended.size > 0) {
      word = { ...word, suspended: [...suspended] };
    }
    // Marks a word whose cards came from Anki: the cards it has no history
    // for come in a few a day, not all at once (planSession in session.js).
    if (gotCards) {
      word = { ...word, importedAt: word.importedAt ?? now };
    }
    words.push(word);
  }
  return { words, decks: newDecks, reviews, cards, report };
}
