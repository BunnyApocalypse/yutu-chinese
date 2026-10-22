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

import { lookUp, readTypedPinyin, readsAs, proposeMeaning, otherScriptForm, splitIntoWords } from './dictionary.js';
import { checkWord, tidyPinyin, newWordRecords, scriptFor } from './words.js';
import { wordId } from './wordList.js';
import { isSyllables, SYLLABLES } from './pinyinSyllables.js';
import { radicalRecord, isRadical, RADICAL_CARD_TYPES } from './radicals.js';
import { cardIdFor, CARD_TYPES } from './session.js';
import { sentenceId, sentenceRecord, isSentence, SENTENCE_CARD_TYPES } from './sentences.js';
import { replay, emptyState } from './scheduler.js';
import { READY_MADE_LISTS, newDeckRecord, withDeck } from './decks.js';
import { t } from './text.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Sorts records into lists by a key: groupBy(reviews, (r) => r.cardId) is a
// Map from each card's ID to its reviews, in the order given.
function groupBy(records, keyOf) {
  const groups = new Map();
  for (const record of records) {
    const key = keyOf(record);
    if (groups.has(key)) {
      groups.get(key).push(record);
    } else {
      groups.set(key, [record]);
    }
  }
  return groups;
}

// ---- Reading a field ----

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

// A field's text as a learner would read it. Anki fields are bits of web
// page: line breaks are <br> or <div>, a word may be in <b>, a sound is
// written [sound:file.mp3], and & is written &amp;. All that is taken out;
// lines are kept, one per line break, with spaces tidied.
//
// Accented letters are put in Unicode's composed form: "à" can be stored as
// one character or as "a" followed by a separate accent, which look the
// same but are not equal as text. Some shared decks are in the second form
// (Anki itself turns a note into the first when it saves it).
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
    .join('\n')
    .normalize('NFC');
}

// The lines of a deck's layout in each field of a note type: a heading
// such as "Common Meaning" above the meaning, the same in most notes. A
// line counts as one if it is in more than half the notes where the field
// is filled (of the first 200, and at least 3), and in at least one note
// with something else in the field too, so that a field which simply holds
// the same text in most notes ("noun") is not emptied.
//
// Returns a list with a Set of lines for each field, by its index.
export function layoutLines(notes) {
  const sample = notes.slice(0, 200);
  const fieldCount = Math.max(0, ...sample.map((note) => note.fields.length));
  return Array.from({ length: fieldCount }, (_, index) => {
    const linesOf = sample.map((note) => cleanField(note.fields[index])).filter((text) => text !== '').map((text) => text.split('\n'));
    const count = new Map();
    const withOthers = new Set();
    for (const lines of linesOf) {
      for (const line of new Set(lines)) {
        count.set(line, (count.get(line) || 0) + 1);
        if (lines.length > 1) {
          withOthers.add(line);
        }
      }
    }
    const layout = new Set();
    for (const [line, times] of count) {
      if (times >= 3 && times * 2 > linesOf.length && withOthers.has(line)) {
        layout.add(line);
      }
    }
    return layout;
  });
}

// A note's field as cleanField reads it, without the lines of the deck's
// layout (`layout`, from layoutLines): "Common Meaning\nto love" becomes
// "to love".
export function fieldText(note, index, layout) {
  const lines = layout[index];
  const text = cleanField(note.fields[index]);
  if (!lines || lines.size === 0) {
    return text;
  }
  return text
    .split('\n')
    .filter((line) => !lines.has(line))
    .join('\n');
}

// The fields a template shows, by name, each once: "{{Hanzi}}<br>{{type:Pinyin}}"
// gives ['Hanzi', 'Pinyin']. Anki's own fields ({{FrontSide}}, {{Tags}}, ...) and
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
    // Each field once, though a template may use it many times (a drawing
    // script on the front of a writing card reads {{Simplified}} often).
    if (!['FrontSide', 'Tags', 'Deck', 'Subdeck', 'Card', 'Type', 'CardFlag'].includes(name) && !fields.includes(name)) {
      fields.push(name);
    }
  }
  return { fields, cloze };
}

const HAN = /\p{Script=Han}/gu;

// Whether a line is pinyin: with tone numbers (ni3hao3) or tone marks
// (nǐhǎo, nǐ hǎo), or several readings with commas between ("hang2,
// xing2"). Without tones it could as well be English ("hen"). Its letters
// must make syllables of Mandarin, so that "HSK 1" or "Top 500" (the level
// and frequency fields of some decks) are not taken for pinyin.
function isPinyin(line) {
  return line.split(/[,，;；]/).every((part) => {
    const typed = readTypedPinyin(part);
    return typed !== null && typed.tones.length > 0 && isSyllables(typed.letters);
  });
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

// The same hints as a whole name: "Pinyin", but not "Examples Pinyin".
const EXACT_NAME_HINTS = Object.fromEntries(
  Object.entries(NAME_HINTS).map(([role, hint]) => [role, new RegExp(`^(?:${hint.source})s?$`, 'i')]),
);

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
      // The right kind of text counts most: in at least half the notes
      // where the field is filled, and the more notes of all the better, so
      // that a field filled in a few notes (Simplified, in a deck of
      // radicals) loses to one filled in all, and one often empty (Examples
      // Pinyin) to the field for the word's own reading. The name decides
      // between fields alike, a name that is exactly a hint ("Pinyin") more
      // than one with a hint in it ("Examples Pinyin"), and it alone decides
      // for a field still empty.
      let score = 0;
      if (filled.length > 0 && matching / filled.length >= 0.5) {
        score = (matching / filled.length + matching / sample.length) / 2;
      }
      if (NAME_HINTS[role].test(name)) {
        score += filled.length === 0 ? 0.6 : EXACT_NAME_HINTS[role].test(name.trim()) ? 0.2 : 0.1;
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

// A field named for a meaning, but not for an example's ("Example 2
// English") or a sentence's.
const SPARE_MEANING_NAME = /meaning|definition|english|gloss|意思/i;
const EXAMPLE_NAME = /example|sentence|例/i;

// A second field to take a note's meaning from where the field chosen for
// the meaning is empty: the HSK 2012 deck leaves its short SimpleMeaning
// empty in 578 notes and has their meaning in "Definitions" (the owner,
// 2026-10-21: the deck's own definitions come before the dictionary's).
// Only a field named for a meaning, since many decks have fields of other
// English (stroke counts, Japanese readings, translations of examples),
// and only one filled in at least half the notes; of those, the one with
// meanings (meaningsIn) in most notes.
//
// roles: from guessRoles; a field chosen for a role is not taken
//
// Returns the field's index, or null for none.
export function guessSpareMeaning(noteType, notes, roles) {
  const sample = notes.slice(0, 200);
  let best = null;
  let bestCount = 0;
  noteType.fields.forEach((name, index) => {
    if (Object.values(roles).includes(index) || !SPARE_MEANING_NAME.test(name) || EXAMPLE_NAME.test(name)) {
      return;
    }
    const count = sample.filter((note) => meaningsIn(cleanField(note.fields[index])).length > 0).length;
    if (count * 2 >= sample.length && count > bestCount) {
      best = index;
      bestCount = count;
    }
  });
  return best;
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
      // Recalling the pinyin is recalling its tones too, which is how most
      // people practice tones in Anki, so Tone is ticked with it (the owner,
      // 2026-10-21; before, a hidden rule copied the pinyin card to the tone
      // card, and the unticked box read as "starts new").
      const readingAsked = roles.pinyin !== null ? !onFront('pinyin') && onBack('pinyin') : onBack('meaning');
      if (readingAsked) {
        types.push('pinyin', 'tone');
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
//   noteTypes: [{ id, name, fields, noteCount, example, roles, spareMeaning, templates }]
//              for the note types that have notes. `example` is the first
//              note's fields, cleaned and without the deck's headings
//              (fieldText); `templates` is [{ ord, name, front,
//              cardCount, types, couldBeWriting }], `front` the fields its
//              front shows. `roles`, `types`: the guesses;
//              `spareMeaning`: guessSpareMeaning's field, or null.
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

  const notesOf = groupBy(collection.notes, (note) => note.noteTypeId);
  const noteTypes = collection.noteTypes
    .filter((noteType) => notesOf.has(noteType.id))
    .map((noteType) => {
      const notes = notesOf.get(noteType.id);
      const noteIds = new Set(notes.map((note) => note.id));
      const roles = guessRoles(noteType, notes, script);
      const spareMeaning = guessSpareMeaning(noteType, notes, roles);
      const guesses = guessCardTypes(noteType, roles);
      const layout = layoutLines(notes);
      return {
        id: noteType.id,
        name: noteType.name,
        fields: noteType.fields,
        noteCount: notes.length,
        example: notes[0].fields.map((_, index) => fieldText(notes[0], index, layout)),
        roles,
        spareMeaning,
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
// Returns { deckIds: Set, noteTypes: { [id]: { roles, spareMeaning, templates: { [ord]: types } } },
//           sentenceWriting }: `sentenceWriting` is 'whole' (a sentence's
//           writing card asks for all of it) or 'none' (it comes suspended)
export function defaultChoices(description) {
  return {
    deckIds: new Set(description.decks.map((deck) => deck.id)),
    sentenceWriting: 'whole',
    useDeckMeanings: false,
    noteTypes: Object.fromEntries(
      description.noteTypes.map((noteType) => [
        noteType.id,
        {
          roles: { ...noteType.roles },
          spareMeaning: noteType.spareMeaning,
          templates: Object.fromEntries(noteType.templates.map((template) => [template.ord, [...template.types]])),
        },
      ]),
    ),
  };
}

// How many notes would be sentences (looksLikeSentence), with the
// choices as they are: the pop-up asks about their writing card only then.
export function countSentenceNotes(collection, choices) {
  let count = 0;
  for (const [id, notes] of groupBy(collection.notes, (note) => note.noteTypeId)) {
    const choice = choices.noteTypes[id];
    if (!choice || choice.roles.characters === null) {
      continue;
    }
    const layout = layoutLines(notes);
    count += isSentenceDeck(notes, choice.roles.characters)
      ? notes.length
      : notes.filter((note) => looksLikeSentence(fieldText(note, choice.roles.characters, layout))).length;
  }
  return count;
}

// How many words already there would take the deck's meaning
// (planAnkiImport's `otherMeanings`), quickly enough to be counted again at
// every change in the check step: making every note into a word takes a
// second or more on a big file, so only notes whose characters hold one of
// those words' forms are. (A form put together from two parts of a field,
// 臺 / 台灣 → 臺灣, is missed: the count is for the box, the import
// itself goes through every note.)
//
// The arguments are planAnkiImport's.
export function countOtherMeanings(collection, choices, context) {
  const forms = new Set(context.words.flatMap((word) => [word.traditional, word.simplified]));
  if (forms.size === 0) {
    return 0;
  }
  const lengths = [...new Set([...forms].map((form) => [...form].length))];
  const holdsAForm = (text) => {
    const characters = text.match(HAN) || [];
    return characters.some((_, start) =>
      lengths.some((length) => forms.has(characters.slice(start, start + length).join(''))),
    );
  };
  return planAnkiImport(collection, choices, { ...context, onlyCharacters: holdsAForm }).report.otherMeanings;
}

// ---- A note as a word ----

// Pinyin with tone marks and a space or ' between syllables ("nǐ hǎo")
// turned into the app's numbered pinyin ("ni3hao3"), for a word the
// dictionary doesn't have. Without a separator between syllables the
// dictionary is needed to tell where they end, so that gives null.
//
// A run of several syllables ("Gōngchē") is split by the table of
// syllables (splitByTones), so that each mark falls in a syllable of its
// own.
function numberedPinyin(text) {
  const numbered = [];
  for (const run of text.split(/[\s'’-]+/).filter(Boolean)) {
    const typed = readTypedPinyin(run);
    const syllables = typed && splitByTones(typed);
    if (!syllables) {
      return null;
    }
    numbered.push(...syllables);
  }
  return tidyPinyin(numbered.join(''));
}

// Letters with tone marks (from readTypedPinyin) split into syllables of
// Mandarin, each with at most one tone, as few as can be: "gongche" with
// marks on its o and e gives ["gong1", "che1"]. A syllable without a mark
// has the neutral tone. Returns null if they can't be split so.
function splitByTones({ letters, tones }) {
  // best[i]: the fewest syllables the first i letters split into.
  const best = [[]];
  for (let end = 1; end <= letters.length; end++) {
    for (let start = Math.max(0, end - 6); start < end; start++) {
      const inside = tones.filter(({ at }) => at >= start && at < end);
      if (!best[start] || !SYLLABLES.has(letters.slice(start, end)) || inside.length > 1) {
        continue;
      }
      const syllable = letters.slice(start, end) + (inside.length === 1 ? inside[0].tone : 5);
      if (!best[end] || best[start].length + 1 < best[end].length) {
        best[end] = [...best[start], syllable];
      }
    }
  }
  return best[letters.length] || null;
}

// The line of the ready-made list of radicals (data/wordlists/radicals/
// radicals.tsv, as parseReadyList reads it) for a note's characters, in
// either form, or undefined.
function radicalEntry(characters, radicals) {
  const plain = characters.replace(/\s+/g, '');
  return (radicals || []).find((entry) => entry.traditional === plain || entry.simplified === plain);
}

// Whether a note type is a deck of radicals: most of its notes (more than
// half of the first 200) have characters that are one of the app's
// radicals. Only then is a note made a radical (itemFromNote); in a deck of
// words or characters, 言 stays the word yán, though the list pairs it with
// the side form 讠 as one radical.
//
// notes:      the note type's notes
// index:      the field of characters (roles.characters), or null
// radicals:   the list's lines
export function isRadicalDeck(notes, index, radicals) {
  if (index === null || !radicals || radicals.length === 0) {
    return false;
  }
  const sample = notes.slice(0, 200);
  const matching = sample.filter((note) => radicalEntry(cleanField(note.fields[index]), radicals)).length;
  return matching * 2 > sample.length;
}

// Makes the app's item out of a note: in a deck of radicals (isRadicalDeck),
// one of the app's radicals with no reading of its own (丨, 氵, 糹/纟: a
// record of kind 'radical', with the list's meaning, see radicals.js) where
// the note's characters are one (the owner, 2026-10-21); otherwise a word
// (wordFromNote). A radical that is a word (水, 口) is that word, as in the
// ready-made deck of radicals. A sentence or phrase is one of the app's
// sentences (sentenceFromNote).
//
// texts:   as for wordFromNote
// context: as for wordFromNote, and `radicals`, the list's lines, given only
//          for a deck of radicals; `sentences`, true for a note type of
//          sentences (isSentenceDeck), whose every note is a sentence
//
// Returns { word, fromDeck }, { sentence } or { problem, reason }; a sentence's
// meaning is always the note's own, a radical's never.
export function itemFromNote(texts, context) {
  const radical = radicalEntry(texts.characters, context.radicals);
  if (radical && radical.pinyin === '') {
    return { word: radicalRecord(radical) };
  }
  return context.sentences || looksLikeSentence(texts.characters)
    ? sentenceFromNote(texts, context)
    : wordFromNote(texts, context);
}

// Whether a note type is one of sentences: more than half of the notes
// with characters (in the field `index`, of the first 200) are sentences
// (looksLikeSentence). Then its every note is a sentence, the phrases among
// them too: the examples of Ch_book1's grammar notes are 我姓王。 and
// 書在哪兒？, but also 這個人 and 我的書, which the dictionary doesn't have
// as words.
export function isSentenceDeck(notes, index) {
  if (index === null) {
    return false;
  }
  const layout = layoutLines(notes);
  const filled = notes
    .slice(0, 200)
    .map((note) => fieldText(note, index, layout))
    .filter((text) => text !== '');
  return filled.filter(looksLikeSentence).length * 2 > filled.length;
}

// Whether a note's characters are a sentence or phrase, not a word: with a
// sentence's punctuation anywhere ("我(不)看書。", so that it isn't taken for
// 我 with something in brackets), or with any punctuation in the part a word
// is read from (before a slash or bracket: "學校/学校" is a word).
export function looksLikeSentence(characters) {
  if (/[。？！?!「」『』…：]/.test(characters)) {
    return true;
  }
  return /[\p{P}\p{S}]/u.test(characters.split(/[/|｜,，;；()（）[\]【】]/)[0].replace(/\s+/g, ''));
}

// A label before an example in a textbook deck: "a: 我來學中文。", "a/b:", "1. ".
const EXAMPLE_LABEL = /^[a-z0-9]{1,2}(?:\/[a-z0-9]{1,2})?\s*[:：.)]\s*/i;

// A sentence in both scripts, from one: word by word, with the dictionary
// (splitIntoWords, otherScriptForm). It is taken for simplified if some
// word in it is written so only in simplified; a word the dictionary can't
// tell stays as it is.
function sentenceForms(text, dictionary) {
  const words = dictionary ? splitIntoWords(dictionary, text) : [{ text, word: false }];
  const entriesOf = words.map((piece) => (piece.word ? lookUp(dictionary, piece.text) : []));
  const onlyIn = (script, index) =>
    entriesOf[index].some((entry) => entry[script] === words[index].text) &&
    !entriesOf[index].some((entry) => entry[script === 'simplified' ? 'traditional' : 'simplified'] === words[index].text);
  const script = words.some((_, index) => onlyIn('simplified', index)) && !words.some((_, index) => onlyIn('traditional', index))
    ? 'simplified'
    : 'traditional';
  const other = words
    .map((piece, index) => (piece.word ? otherScriptForm(entriesOf[index], script, piece.text, '') : piece.text))
    .join('');
  return script === 'traditional' ? { traditional: text, simplified: other } : { traditional: other, simplified: text };
}

// Makes one of the app's sentences (sentences.js) out of a note whose
// characters are a sentence (looksLikeSentence): Ch_book1's 我姓王。 "My
// name is Wang.". Its pinyin is kept as the note writes it, for reading; a
// label before it ("a: ") is left out.
//
// texts, context: as for wordFromNote
//
// Returns { sentence: { traditional, simplified, pinyin, definition } } for
// sentenceRecord, or { problem, reason }.
export function sentenceFromNote(texts, context) {
  const firstLine = (text) => (text.split('\n')[0] || '').replace(EXAMPLE_LABEL, '').trim();
  const characters = firstLine(texts.characters).replace(/\s+/g, '');
  if (!/\p{Script=Han}/u.test(characters)) {
    return { problem: t('ankiReason.sentenceNoChinese'), reason: 'sentenceNoChinese' };
  }
  const meaning = texts.meaning
    .split('\n')
    .map((line) => line.replace(EXAMPLE_LABEL, '').trim())
    .filter((line) => line !== '')
    .join(' ');
  if (meaning === '') {
    return { problem: t('ankiReason.sentenceNoMeaning'), reason: 'sentenceNoMeaning' };
  }
  return {
    sentence: {
      ...sentenceForms(characters, context.dictionary),
      pinyin: firstLine(texts.pinyin),
      definition: meaning,
    },
  };
}

const ZHUYIN = /[\u3100-\u312f\u31a0-\u31bf]/u;

// Meanings that say nothing about what the word means, left out as the
// app's dictionary leaves them out (NOT_A_MEANING in
// scripts/build-dictionary.js): measure words, notes on pronunciation and
// spelling, and pointers to other entries.
const NOT_A_MEANING = [
  /^CL:/,
  /^Taiwan pr\./,
  /^also pr\./,
  /^(also|sometimes) written/,
  /^(old |archaic |Japanese |erhua |dialectal |ancient )?variant of/,
  /^see (also )?[^a-z]/,
];

// The meanings in a field that holds more than the meaning, as a list for
// proposeMeaning: the HSK 2012 deck's "Definitions" repeats the word's
// characters, pinyin and zhuyin above numbered meanings, a dictionary
// entry for each reading:
//
//   鱼 / 魚 / Yú / ㄩˊ / surname Yu / 鱼 / 魚 / yú / ㄩˊ / 1. fish / 2. used in…
//
// gives ['fish', 'used in…'] for the reading yú. Lines of characters,
// pinyin or zhuyin are left out, and the numbers before a meaning.
//
// text:      the field, cleaned (fieldText), a line for each part
// isReading: whether a line of pinyin is the word's reading: where the
//            field has several readings, the lines under that one are
//            taken (all of them if none is)
export function meaningsIn(text, isReading = () => false) {
  let lines = text.split('\n');
  const readingAt = lines.findIndex((line) => isPinyin(line) && isReading(line));
  if (readingAt >= 0) {
    const after = lines.slice(readingAt + 1);
    const next = after.findIndex((line) => isPinyin(line));
    lines = next >= 0 ? after.slice(0, next) : after;
  }
  return lines
    .filter((line) => {
      const han = (line.match(HAN) || []).length;
      return /[a-z]/i.test(line) && han * 2 < line.replace(/\s/g, '').length && !ZHUYIN.test(line) && !isPinyin(line);
    })
    .map((line) =>
      line
        .replace(/^\d+\.\s*/, '')
        // The deck adds a word's measure words to its last meaning, without
        // a space: "mountain rangemeasure word條/条tiao2".
        .replace(/\s*measure word\s*\p{Script=Han}.*$/u, '')
        // As the app's dictionary has them (scripts/build-dictionary.js): no
        // note on pronunciation inside a meaning, and references to other
        // words cut short, 學習|学习[xue2 xi2] → 學習.
        .replace(/\s*\((?:Taiwan|also) pr\. \[[^\]]*\]\)/g, '')
        .replace(/([^\s|[\]]+)\|[^\s|[\]]+/g, '$1')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line !== '' && !NOT_A_MEANING.some((pattern) => pattern.test(line)));
}

// The breve some decks type for the third tone's mark: they look alike.
const BREVES = { ă: 'ǎ', ĕ: 'ě', ĭ: 'ǐ', ŏ: 'ǒ', ŭ: 'ǔ', Ă: 'Ǎ', Ĕ: 'Ě', Ĭ: 'Ǐ', Ŏ: 'Ǒ', Ŭ: 'Ǔ' };

// A note's pinyin as the app can read it, from the ways textbook decks write
// it (Ch_book1): notes in brackets left out ("Yèlǐ (li)", "xuéqī (tw:
// xuéqí)"), an erhua written apart joined to its syllable ("Yīdiǎn er" →
// "Yīdiǎnr"), and a breve read as the third tone (Făguó → Fǎguó).
function tidyNotePinyin(text) {
  return text
    .replace(/\s*[(（][^)）]*[)）]/g, '')
    .replace(/\s+er\b/g, 'r')
    .replace(/[ăĕĭŏŭĂĔĬŎŬ]/g, (letter) => BREVES[letter])
    .trim();
}

// The word in a note's field of characters, which may hold more than one
// form of it: "學校/学校", "学校 (學校)", Ch_book1's "照相（像）機" (照相機 or
// 照像機) and "臺 / 台灣" (臺灣 or 台灣). Of the forms it could mean, the
// first the dictionary reads as the note's pinyin; failing that, the
// field's first part, the dictionary finding the other script.
//
// The forms tried: the field without what is in brackets (照相機); a single
// character, then a word, the character written into the word (臺灣); each
// part.
function charactersOf(field, pinyinText, dictionary) {
  const plain = (text) => text.replace(/\s+/g, '');
  const parts = field.split(/[/|｜,，;；()（）[\]【】]/).map(plain).filter((part) => part !== '');
  const first = parts[0] || '';
  const typed = pinyinText !== '' && dictionary ? readTypedPinyin(pinyinText) : null;
  if (!typed) {
    return first;
  }
  const [one, word] = parts.map((part) => Array.from(part));
  const candidates = [
    plain(field.replace(/[(（][^)）]*[)）]/g, '')),
    ...(one && word && one.length === 1 && word.length > 1 ? [[...one, ...word.slice(1)].join('')] : []),
    ...parts,
  ].filter((candidate) => /^\p{Script=Han}+$/u.test(candidate));
  const fits = (candidate) =>
    lookUp(dictionary, candidate).some(
      (entry) => readsAs(entry, typed) || readsAs(entry, typed, { fullForNeutral: true }),
    );
  return candidates.find(fits) || first;
}

// Makes a word out of a note's characters, pinyin and meaning, checked as
// a typed word is (checkWord), with the dictionary's help: it gives the
// other script's form, the reading where the note has none (or has it with
// tone marks the app can't split by itself), and a meaning where the note
// has none.
//
// texts:   { characters, pinyin, meaning, spareMeaning }, cleaned fields
//          ('' if none); `spareMeaning` (guessSpareMeaning's field) gives
//          the meaning where `meaning` is empty, before the dictionary
// context: { dictionary, likeliestEntry(entries, characters), meaningDetail }
//          `dictionary` may be null; `likeliestEntry` picks the entry with
//          the usual reading (dictionaryLoader.js)
//
// Returns { word, fromDeck } or { problem, reason }, as checkWord does; `fromDeck`
// is true where the meaning is the note's own, not the dictionary's.
export function wordFromNote(texts, context) {
  // A sentence or phrase is not a word: itemFromNote makes it a sentence.
  if (looksLikeSentence(texts.characters)) {
    return { problem: t('ankiReason.looksLikeSentence'), reason: 'looksLikeSentence' };
  }
  const notePinyin = texts.pinyin.split('\n')[0] || '';
  let pinyinText = tidyNotePinyin(notePinyin);
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
  const characters = charactersOf(texts.characters, pinyinText, context.dictionary);

  const entries = context.dictionary ? lookUp(context.dictionary, characters) : [];
  // One reading as the note writes it: the dictionary's entry read so, and
  // its pinyin (the note's own, numbered, where no entry is).
  const readingOf = (text) => {
    const typed = readTypedPinyin(text);
    // A Taiwan textbook's full tones where the dictionary has a neutral one
    // (Ch_book1's 對不起 "Duìbùqǐ", 謝謝 "Xièxiè") take the dictionary's
    // reading, as a learner typing them would; tone cards accept the full
    // tone there (toneAnswers in tones.js). An entry read so in the
    // mainland comes before one read so only in Taiwan: 打 "dǎ" is dǎ "to
    // hit", not dá "dozen" (Taiwan dǎ).
    const found =
      (typed &&
        (entries.find((candidate) => readsAs({ pinyin: candidate.pinyin }, typed)) ||
          entries.find((candidate) => readsAs(candidate, typed)) ||
          entries.find((candidate) => readsAs(candidate, typed, { fullForNeutral: true })))) ||
      null;
    return { entry: found, pinyin: found ? found.pinyin : tidyPinyin(text) || numberedPinyin(text) || '' };
  };
  // Several readings of one character ("Hái, huán", "kān / kàn"): one word
  // with all of them (the owner, 2026-10-21, as Anki had one card), its
  // pinyin "hai2, huan2" as the app keeps several readings; a pinyin card
  // shows them all, a tone card takes any. Only readings of Mandarin
  // syllables, one for each character, and only those the dictionary has
  // where it has any (會 "huèi, huì" gives huì; 像片 "xiàng piàn / xiàng
  // piàn er" leaves out the reading of 像片兒). A reading without a tone
  // mark is the neutral tone (得 "děi, de").
  const parts = pinyinText.split(/\s*[,，/／]\s*/).filter((part) => part !== '');
  let readings = [];
  if (parts.length > 1) {
    for (const part of parts) {
      const typed = readTypedPinyin(part);
      if (!typed || !isSyllables(typed.letters)) {
        continue;
      }
      const reading = readingOf(typed.tones.length === 0 ? `${part}5` : part);
      const syllables = reading.pinyin.match(/[a-zA-Z]+[1-5]/g) || [];
      if (syllables.length === [...characters].length && !readings.some((other) => other.pinyin === reading.pinyin)) {
        readings.push(reading);
      }
    }
    if (readings.some((reading) => reading.entry)) {
      readings = readings.filter((reading) => reading.entry);
    }
  }
  let entry = null;
  let pinyin = '';
  if (readings.length > 1) {
    entry = readings[0].entry;
    pinyin = readings.map((reading) => reading.pinyin).join(', ');
  } else if (pinyinText !== '') {
    ({ entry, pinyin } = readings.length === 1 ? readings[0] : readingOf(pinyinText));
    // Pinyin that fits none of the dictionary's entries, for a word it has
    // with one reading only, is taken for a slip: 咖啡 "kāifēi" is kāfēi.
    const dictionaryReadings = new Set(entries.map((candidate) => candidate.pinyin.toLowerCase()));
    if (!entry && dictionaryReadings.size === 1) {
      entry = entries[0];
      pinyin = entry.pinyin;
    }
    pinyin = pinyin || pinyinText;
  } else if (entries.length > 0) {
    entry = context.likeliestEntry ? context.likeliestEntry(entries, characters) : entries[0];
    pinyin = entry.pinyin;
  }
  // Which script the note is written in: traditional unless the dictionary
  // says these characters are the simplified form. A word the dictionary
  // lacks is put in the other script word by word, as a sentence is
  // (公車站: 公车 and 站).
  const forms = entries.length === 0 ? sentenceForms(characters, context.dictionary) : null;
  const script = forms
    ? forms.traditional === characters
      ? 'traditional'
      : 'simplified'
    : entries.some((candidate) => candidate.traditional === characters)
      ? 'traditional'
      : 'simplified';
  const other = script === 'traditional' ? 'simplified' : 'traditional';
  const otherForm = forms
    ? forms[other]
    : entry
      ? entry[other]
      : otherScriptForm(entries, script, characters, tidyPinyin(pinyin) || '');
  // The deck's other meaning field, under the word's own reading: the one
  // of the dictionary's entry, with a capital only if that has one (the
  // HSK 2012 deck writes 冷 "Lěng" when it means lěng "cold", not the
  // surname); without an entry, the note's.
  if (meaning === '' && texts.spareMeaning) {
    const startsWithCapital = (text) => text[0] !== text[0].toLowerCase();
    const isReading = entry
      ? (line) => {
          const typed = readTypedPinyin(line);
          return typed !== null && readsAs(entry, typed) && startsWithCapital(line) === startsWithCapital(entry.pinyin);
        }
      : (line) => line === pinyinText;
    meaning = proposeMeaning(meaningsIn(texts.spareMeaning, isReading), context.meaningDetail);
  }
  // Whether the meaning is the deck's own, not the dictionary's: only that
  // one may replace the meaning of a word already there (planAnkiImport).
  const fromDeck = meaning !== '';
  if (meaning === '' && readings.length > 1) {
    meaning = readings
      .filter((reading) => reading.entry)
      .map((reading) => proposeMeaning(reading.entry.meanings, context.meaningDetail))
      .join('; ');
  } else if (meaning === '' && entry) {
    meaning = proposeMeaning(entry.meanings, context.meaningDetail);
  }
  // Why a note is left out, said about the note: checkWord's own words are
  // advice for typing a word ("Write pinyin with tone numbers…"), so the
  // ones a note can give are put another way.
  const notInDictionary = t(entries.length === 0 ? 'ankiReason.notInDictionary' : 'ankiReason.otherReading');
  const result = checkWord({
    [script]: characters,
    [other]: otherForm,
    pinyin,
    definition: meaning,
    pinyinTaiwan: entry && entry.pinyinTaiwan && entry.pinyin === pinyin ? entry.pinyinTaiwan : '',
  });
  if (!result.problem) {
    return { ...result, fromDeck };
  }
  if (result.reason === 'pinyinMissing') {
    return { problem: t('ankiReason.noPinyin', { why: notInDictionary }), reason: 'noPinyin' };
  }
  if (result.reason === 'meaningMissing') {
    return { problem: t('ankiReason.noMeaning', { why: notInDictionary }), reason: 'noMeaning' };
  }
  if (result.reason === 'notPinyin') {
    return { problem: t('ankiReason.pinyinUnreadable', { pinyin: notePinyin }), reason: 'pinyinUnreadable' };
  }
  return result;
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
//   dictionary, likeliestEntry, meaningDetail, radicals: for itemFromNote
//   words:    the word records there are
//   decks:    the deck records there are
//   cards:    a Map from card ID to the card records there are
//   settings: the current settings (for the script, see scriptFor)
//   now:      the time, as from Date.now()
//   randomId: makes a random ID (randomId in db.js), for new decks
//   onlyCharacters: if given, only notes whose characters field it says
//            yes to are made into words, and nothing but the report's
//            counts of words is worked out: no cards or reviews
//            (countOtherMeanings)
//
// Returns:
//   words:   word records to save: new ones, and ones there already that
//            were put in a deck or given cards
//   decks:   new deck records, one for each Anki deck not already here by
//            name (in the same deck), so importing twice makes no new ones
//   reviews: review records to save: Anki's reviews and imported schedules
//   cards:   card records to save, worked out from those reviews
//   report:  { notesRead, newWords, newRadicals, newSentences, wordsThere, waiting,
//              cardsWithSchedule, reviewsCopied, alreadyStudied, sameWord,
//              otherMeanings, problems }
//            `newRadicals`: new radicals of kind 'radical' (not counted in
//            newWords); `newSentences`: new sentences (sentences.js), whose
//            writing card comes suspended if `choices.sentenceWriting` is
//            'none';
//            `waiting`: new words (and radicals) with no cards, which wait
//            in Learn;
//            `problems`: [{ text, problem, reason }] for notes left out;
//            `alreadyStudied`: cards left as they are, studied here already;
//            `sameWord`: notes that are a word another note is too;
//            `otherMeanings`: words already there whose meaning differs
//            from the deck's own, given the deck's if
//            `choices.useDeckMeanings` (the owner, 2026-10-21: off by
//            default, and a meaning the learner wrote is replaced too)
export function planAnkiImport(collection, choices, context) {
  const { settings, now } = context;
  const reviewsOf = groupBy(collection.reviews, (review) => review.cardId);
  const cardsOf = groupBy(collection.cards, (card) => card.noteId);
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
    newRadicals: 0,
    newSentences: 0,
    wordsThere: 0,
    waiting: 0,
    cardsWithSchedule: 0,
    reviewsCopied: 0,
    alreadyStudied: 0,
    sameWord: 0,
    otherMeanings: 0,
    problems: [],
  };

  // Each note made into a word, and the Anki cards behind each of the
  // word's kinds of card. A word in two notes keeps, for each kind, the
  // card with the most reviews (the owner, 2026-10-19).
  const found = new Map(); // word ID → { word, sentence, deckMeaning, deckId, sources: { type: card } }
  const reviewCount = (card) => countedReviews(reviewsOf.get(card.id) || []).length;
  // The headings of each note type's layout, left out of its fields' text.
  // And which note types are decks of radicals, whose notes become the
  // app's radicals (itemFromNote).
  const notesOfType = groupBy(collection.notes, (note) => note.noteTypeId);
  const layoutOf = new Map([...notesOfType].map(([id, ofType]) => [id, layoutLines(ofType)]));
  const radicalDecks = new Set(
    [...notesOfType]
      .filter(([id, ofType]) => choices.noteTypes[id] && isRadicalDeck(ofType, choices.noteTypes[id].roles.characters, context.radicals))
      .map(([id]) => id),
  );
  const sentenceDecks = new Set(
    [...notesOfType]
      .filter(([id, ofType]) => choices.noteTypes[id] && isSentenceDeck(ofType, choices.noteTypes[id].roles.characters))
      .map(([id]) => id),
  );
  for (const note of notes) {
    const { roles, spareMeaning = null, templates } = choices.noteTypes[note.noteTypeId];
    const layout = layoutOf.get(note.noteTypeId);
    const text = (role) => (roles[role] === null ? '' : fieldText(note, roles[role], layout));
    const characters = text('characters');
    if (context.onlyCharacters && !context.onlyCharacters(characters)) {
      continue;
    }
    const texts = {
      characters,
      pinyin: text('pinyin'),
      meaning: text('meaning'),
      spareMeaning: spareMeaning === null || Object.values(roles).includes(spareMeaning) ? '' : fieldText(note, spareMeaning, layout),
    };
    const result = itemFromNote(texts, {
      ...context,
      radicals: radicalDecks.has(note.noteTypeId) ? context.radicals : null,
      sentences: sentenceDecks.has(note.noteTypeId),
    });
    if (result.problem) {
      report.problems.push({ text: texts.characters || cleanField(note.fields[0]), problem: result.problem, reason: result.reason });
      continue;
    }
    // A radical comes with its ID; a word's is worked out.
    const id = result.sentence ? sentenceId(result.sentence.traditional) : result.word.id || wordId(result.word);
    const cards = cardsOf.get(note.id) || [];
    if (found.has(id)) {
      report.sameWord += 1;
    } else {
      const home = cards.find((card) => choices.deckIds.has(card.deckId));
      // The deck's own meaning, if the note has one (not the dictionary's).
      const deckMeaning = result.sentence
        ? result.sentence.definition
        : result.fromDeck
          ? result.word.definition
          : null;
      found.set(id, { word: result.word || null, sentence: result.sentence || null, deckMeaning, deckId: home.deckId, sources: {} });
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
    [...found.values()].filter(({ word }) => word).map(({ word }) => word),
    context.words,
    now,
  );
  const added = new Map(toAdd.map((word) => [word.id, word]));
  // New sentences go after everything, in the file's order.
  let nextOrder = Math.max(-1, ...[...context.words, ...toAdd].map((word) => word.order)) + 1;
  const words = [];
  const reviews = [];
  const cards = [];
  for (const [id, { sentence, deckMeaning, deckId, sources }] of found) {
    let word = existing.get(id) || added.get(id);
    if (!word && sentence) {
      word = sentenceRecord(sentence, nextOrder, appDeck(deckId), now);
      nextOrder += 1;
    }
    report[existing.has(id) ? 'wordsThere' : isSentence(word) ? 'newSentences' : isRadical(word) ? 'newRadicals' : 'newWords'] += 1;
    // A word already there keeps its meaning unless the learner chose the
    // deck's (a switch in the check step). Its pinyin is the note's
    // already: it is part of the word's ID.
    if (existing.has(id) && deckMeaning && deckMeaning !== word.definition) {
      report.otherMeanings += 1;
      if (choices.useDeckMeanings) {
        word = { ...word, definition: deckMeaning };
      }
    }
    // Only counting: the schedules are most of the work.
    if (context.onlyCharacters) {
      continue;
    }
    word = withDeck(word, appDeck(deckId));
    const script = scriptFor(word, settings);
    // A tone card only for a word that can have one: a syllable per
    // character (not 一点儿, yīdiǎnr).
    const syllables = (reading) => (reading.match(/[a-z]+[1-5]/gi) || []).length;
    const canHaveTone = word.pinyin
      .split(', ')
      .some((reading) => syllables(reading) === Array.from(word.traditional).length);
    if (!canHaveTone) {
      delete sources.tone;
    }
    const suspended = new Set(word.suspended || []);
    // A sentence has a reading card and, if the learner wants one, a
    // writing card for the whole sentence (Anki doesn't say which word was
    // the point); without, the card comes suspended, to be switched on in
    // its pop-up panel.
    if (isSentence(word) && !existing.has(id) && choices.sentenceWriting === 'none') {
      suspended.add('writing');
      delete sources.writing;
    }
    let gotCards = false;
    for (const type of isSentence(word) ? SENTENCE_CARD_TYPES : CARD_TYPES) {
      const card = sources[type];
      // A card new in Anki has nothing to bring; the word is learned here.
      // A radical has only meaning and writing cards.
      if (!card || card.type === 0 || (isRadical(word) && !RADICAL_CARD_TYPES.includes(type))) {
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
      // The schedule record comes after every copied review, so the card is
      // what `replay(all)` would give: Anki's schedule, without replaying.
      cards.push({
        id: cardId,
        wordId: id,
        type,
        fsrsState: schedule.importedSchedule.fsrsState,
        due: schedule.importedSchedule.due,
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
    // A sentence is not taught: its new cards are in Review at once.
    if (isSentence(word)) {
      // Nothing to mark.
    } else if (gotCards) {
      word = { ...word, importedAt: word.importedAt ?? now };
    } else if (!existing.has(id)) {
      report.waiting += 1;
    }
    words.push(word);
  }
  return { words, decks: newDecks, reviews, cards, report };
}
