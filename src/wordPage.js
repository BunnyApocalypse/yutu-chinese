// The word page: everything about one word or character, to read, not to
// change. Its characters and reading, with a loudspeaker; its meaning; a
// learning note and an example sentence, where there are any; and how each
// of its characters is built. The parts of the characters can be tapped,
// which opens their page in turn; so can the words of the example sentence,
// through a small popup with the word's reading and meaning first (a tester
// tapped one by accident, 2026-10-14; the popup since 2026-10-15).
//
// A page can be about a word in your words or about anything else that was
// tapped: then it shows what the dictionary has.
//
// The notes (data/notes/) and the dictionary of how characters are built
// (data/makemeahanzi/) are separate files, fetched the first time a page is
// opened and saved for offline use with the other big files.

import { formatPinyin, wordId } from './wordList.js';
import { scriptFor } from './words.js';
import { langFor, fillMixed } from './lang.js';
import { closeOnTapBeside } from './dialogs.js';
import { readingsFor, describeReading } from './tones.js';
import { parseNotes, noteFor, sentenceWords } from './notes.js';
import { parseCharacters, structureOf } from './characters.js';
import { deckTree, readyMadeDeck } from './decks.js';
import { fillDeckSelect } from './decksPanel.js';
import { speak } from './speech.js';
import { isRadical } from './radicals.js';
import { isSentence, sentenceId } from './sentences.js';
// "?url" makes Vite hand us each file's address instead of its contents.
import charactersUrl from '../data/makemeahanzi/dictionary.txt?url';

// Every notes file there is: { path: address }.
const NOTE_URLS = import.meta.glob('../data/notes/*.tsv', { query: '?url', import: 'default', eager: true });

const byId = (id) => document.getElementById(id);
const isHan = (char) => /\p{Script=Han}/u.test(char);

function element(tag, className, text) {
  const made = document.createElement(tag);
  if (className) {
    made.className = className;
  }
  if (text !== undefined) {
    made.textContent = text;
  }
  return made;
}

// Sets the page up.
//
// getWords, getDecks, getSettings: what the Decks tab has read
// lookUp(characters): a promise for the dictionary's entries for some
//                     characters (see lookUp in dictionary.js); [] if none
// edit(word):         opens the word's pop-up panel, to change it
// addSentence(sentence, deckId): adds an example sentence to a deck as a
//                     thing to study (see sentences.js); returns a promise
//                     for 'added', 'put in deck' or 'already there'
// addEntry(entry, deckId): adds a dictionary entry to a deck as one of your
//                     words (the Words tab's dictionary, 2026-10-15); returns a
//                     promise for 'added', 'put in deck' or 'already there'
// learnNow(wordId, deckId): "Learn it now" for a word just added from the
//                     dictionary: the word first in line, and Learn opened
//                     on that deck
// isLearned(word):    true once the word has been through Learn (or has a card)
// defaultDeckId():    the deck first offered for that and for a sentence
// remove(word):       asks, then removes the word; true if it was removed
// practice(word):     opens Free practice with the word
// canPractice():      false where leaving for it would lose something
//                     (Review and Learn): "Practice" is not offered, and
//                     the deck boxes do not open their deck
// showDeck(deckId, word): opens the Decks tab on that deck's page, the way
//                     back going to this word's page
// showCards(word):    fills in the part of the page that has the word's
//                     cards and which of them are suspended
//
// Returns { open(word), openText(characters), openEntry(entry) }.
export function createWordPage({
  getWords,
  getDecks,
  getSettings,
  lookUp,
  splitWords,
  likeliestEntry,
  edit,
  remove,
  addSentence,
  addEntry,
  learnNow,
  isLearned,
  defaultDeckId,
  practice,
  canPractice,
  showDeck,
  showCards,
}) {
  const dialog = byId('word-page');
  // The part that scrolls, and inside it what this file fills in. (Under
  // that, for one of the learner's words, are its cards: showCards.)
  const scroller = byId('word-page-body');
  const body = byId('word-page-content');
  const cardsPart = byId('word-page-cards');
  const backButton = byId('word-page-back');
  const editButton = byId('word-page-edit');
  const practiceButton = byId('word-page-practice');
  const removeButton = byId('word-page-remove');

  // The big files, fetched once. A file that cannot be fetched is left out:
  // the page then simply has less on it.
  let notesPromise = null;
  let charactersPromise = null;
  function loadNotes() {
    notesPromise =
      notesPromise ||
      Promise.all(
        Object.values(NOTE_URLS).map((url) =>
          fetch(url)
            .then((response) => response.text())
            .catch(() => ''),
        ),
      ).then((texts) => parseNotes(texts.join('\n')));
    return notesPromise;
  }
  function loadCharacters() {
    charactersPromise =
      charactersPromise ||
      fetch(charactersUrl)
        .then((response) => response.text())
        .then(parseCharacters)
        .catch(() => {
          charactersPromise = null;
          return new Map();
        });
    return charactersPromise;
  }

  // The pages gone through to get to this one, for the Back button. Each is
  // what open() or openText() was given.
  let trail = [];
  // What the page on screen is about: { word } for one of your words,
  // otherwise { text, entries } with what the dictionary has for it.
  let shown = null;

  const region = () => (getSettings().pronunciation === 'taiwan' ? 'taiwan' : 'mainland');

  // A round button with a loudspeaker on it that speaks `word` when tapped.
  function loudspeaker(word, reading) {
    const button = element('button', 'icon-button');
    button.type = 'button';
    button.title = 'Hear it';
    button.setAttribute('aria-label', 'Hear it');
    // The same picture as the loudspeaker in Review (index.html).
    button.innerHTML = byId('listen-button').innerHTML;
    button.addEventListener('click', async () => {
      const spoken = await speak(word, reading, region(), getSettings().volume);
      button.dataset.spoken = String(spoken);
      button.classList.toggle('no-sound', !spoken);
    });
    return button;
  }

  // A word of yours written like this, in either script, if there is one.
  const wordWritten = (text) =>
    getWords().find((word) => word.simplified === text || word.traditional === text) || null;

  // ---- The parts of the page ----

  // Puts a sentence into `line` with each of its words a button that shows
  // the word's popup (peek); punctuation is plain text. `pinyin` is the
  // sentence's, which says where its words begin and end and how each is
  // read there (sentenceWords).
  function fillSentence(line, sentence, pinyin) {
    for (const piece of sentenceWords(sentence, pinyin)) {
      if (Array.from(piece.text).some(isHan)) {
        const button = element('button', 'sentence-word', piece.text);
        button.type = 'button';
        button.addEventListener('click', () => peek(button, piece));
        line.append(button);
      } else {
        line.append(piece.text);
      }
    }
  }

  // The characters, big, in the script or scripts being learned. For a
  // sentence, `sentencePinyin` is its pinyin, and its words can be tapped
  // as those of an example sentence can (the owner, 2026-10-18).
  function showHeading(forms, reading, other, speakable, sentencePinyin = null) {
    const settings = getSettings();
    const heading = element('div', 'page-heading');
    const shownForms = settings.bothScripts
      ? [...new Set([forms[settings.script], forms[settings.script === 'traditional' ? 'simplified' : 'traditional']])]
      : [forms.own];
    shownForms.forEach((form, index) => {
      const characters = element('p', index === 0 ? 'page-word' : 'page-word second');
      if (sentencePinyin === null) {
        characters.textContent = form;
      } else {
        fillSentence(characters, form, sentencePinyin);
      }
      // A sentence is shown smaller than a word, so that it fits.
      characters.classList.toggle('long', Array.from(form).length > 6);
      // Tells the browser which regional font to use.
      characters.lang = form === forms.traditional ? 'zh-Hant-TW' : 'zh-Hans-CN';
      heading.append(characters);
    });
    const line = element('div', 'page-reading');
    line.append(element('span', 'entry-pinyin', reading));
    // (A radical with no reading has nothing to speak: see radicals.js.)
    if (settings.sound !== 'off' && speakable) {
      line.append(loudspeaker(speakable.word, speakable.reading));
    }
    heading.append(line);
    if (other) {
      heading.append(element('p', 'hint', other));
    }
    return heading;
  }

  // The learning note and the example sentence. `forms`: the page's word in
  // both scripts, which is the word to fill in if the sentence is studied.
  function showNote(note, forms) {
    const settings = getSettings();
    const section = element('section', 'page-section');
    const noteText = element('p', 'page-note');
    tappableText(noteText, note.note);
    section.append(element('h3', '', 'Learning tips'), noteText);

    // A note about a part of a character has no example sentence.
    if (!note.example) {
      return section;
    }

    const scripts = settings.bothScripts
      ? [settings.script, settings.script === 'traditional' ? 'simplified' : 'traditional']
      : [settings.script];
    const sentences = [...new Set(scripts.map((script) => note.example[script]))];
    sentences.forEach((sentence) => {
      const line = element('p', 'page-sentence');
      const traditional = sentence === note.example.traditional;
      line.lang = traditional ? 'zh-Hant-TW' : 'zh-Hans-CN';
      // With the sentence in both scripts, each says which it is (the owner,
      // 2026-10-15: in English only, as English and Chinese were too busy).
      // The label is English inside a line marked as Chinese (lang.js).
      if (sentences.length > 1) {
        const label = element('span', 'sentence-script', traditional ? 'trad.' : 'simp.');
        label.lang = 'en';
        line.append(label);
      }
      // Each word of the sentence can be tapped.
      fillSentence(line, sentence, note.example.pinyin);
      section.append(line);
    });
    section.append(element('p', 'page-pinyin', note.example.pinyin), element('p', 'page-english', note.example.english));

    // The sentence can be studied too: it goes into a deck, in both scripts.
    // Once it is one of yours, a line saying so in place of the way to add
    // it (tester 2, 2026-10-17: a live Add for a sentence already added was
    // puzzling; the owner chose this on 2026-10-18). Putting it in another
    // deck too is then done from the deck's page.
    const studied = () => getWords().find((word) => word.id === sentenceId(note.example.traditional));
    if (studied()) {
      section.append(sentenceStudiedLine(studied()));
      return section;
    }
    const adding = element('div', 'page-add-sentence');
    const deckSelect = deckChooser('Deck to add the sentence to');
    // Worded so that it is plain a card is made (the owner, 2026-10-14:
    // "Study this sentence in" did not say so).
    const addButton = element('button', 'small', 'Add');
    addButton.type = 'button';
    const said = element('p', 'note');
    addButton.addEventListener('click', async () => {
      const result = await addSentence(
        {
          traditional: note.example.traditional,
          simplified: note.example.simplified,
          pinyin: note.example.pinyin,
          definition: note.example.english,
          cloze: { traditional: forms.traditional, simplified: forms.simplified },
        },
        deckSelect.value,
      );
      const word = studied();
      if (word) {
        adding.replaceWith(sentenceStudiedLine(word));
      }
      said.textContent = result === 'added' ? 'Added. Its cards come up in Review.' : '';
    });
    adding.append(element('span', '', 'Make cards from this sentence in'), deckSelect, addButton);
    section.append(adding, said);
    return section;
  }

  // The decks a word is in, each in a box, as "HSK 3.0 › Level 1 › Family";
  // null if it is in none. Under a word's heading, and under an example
  // sentence that is one of your words.
  //
  // "Deck:" before them, since a box alone did not say what it was (the
  // owner, 2026-10-18: a deck named "Chinese 中文" under a sentence could
  // read as a label of its language). A tap on a box opens that deck's
  // page, except where leaving would lose a card or lesson (Review and
  // Learn, as for "Practice"): there they are plain boxes.
  function deckChips(word) {
    const rows = deckTree(getDecks()).filter(({ deck }) => (word.decks || []).includes(deck.id));
    if (rows.length === 0) {
      return null;
    }
    const chips = element('div', 'page-chips');
    chips.append(element('span', 'chips-label', rows.length > 1 ? 'Decks:' : 'Deck:'));
    const canLeave = canPractice();
    // (A deck's name has no script of its own: the learner's is taken.)
    for (const { deck, label } of rows) {
      const chip = element(canLeave ? 'button' : 'span', canLeave ? 'chip chip-button' : 'chip');
      fillMixed(chip, label, getSettings().script);
      if (canLeave) {
        chip.type = 'button';
        chip.title = 'Open this deck';
        chip.addEventListener('click', () => {
          dialog.close();
          showDeck(deck.id, word);
        });
      }
      chips.append(chip);
    }
    return chips;
  }

  // For an example sentence that is one of your words: its decks, in boxes
  // as under a word's heading (the owner, 2026-10-18, in place of a line of
  // text). `word` is the sentence. A sentence in no deck shows nothing.
  function sentenceStudiedLine(word) {
    const chips = deckChips(word) || element('div');
    chips.classList.add('page-sentence-studied');
    return chips;
  }

  // A drop-down list of decks to add something to, with the deck first
  // offered (defaultDeckId) chosen. Only the learner's own decks are offered:
  // the decks of the ready-made lists are those lists' words. (If there are
  // no others, the ready-made lists and their levels, without the groups
  // inside the levels: see fillDeckSelect.)
  function deckChooser(label) {
    const deckSelect = element('select', 'deck-select');
    deckSelect.setAttribute('aria-label', label);
    const own = getDecks().filter((deck) => !readyMadeDeck(deck.id));
    fillDeckSelect(deckSelect, own.length > 0 ? own : getDecks(), []);
    const preferred = defaultDeckId();
    if ([...deckSelect.options].some((option) => option.value === preferred)) {
      deckSelect.value = preferred;
    }
    return deckSelect;
  }

  // For a word that is not one of yours: a way to add it to a deck (the
  // owner, 2026-10-15), in place of being told to type it on a deck's page.
  // The word gets the dictionary's meaning as a word typed on a deck's page
  // does (addEntry). With several readings, the one to add is chosen; the
  // first is the one tapped in the Words tab, or else the likeliest.
  function showAdding(entries) {
    const adding = element('div', 'page-add-sentence page-add-word');
    let readingSelect = null;
    if (entries.length > 1) {
      readingSelect = element('select', 'deck-select');
      readingSelect.setAttribute('aria-label', 'Which reading to add');
      entries.forEach((entry, index) => {
        const option = element('option', '', formatPinyin(entry.pinyin));
        option.value = String(index);
        readingSelect.append(option);
      });
    }
    const deckSelect = deckChooser('Deck to add the word to');
    const addButton = element('button', 'small', 'Add');
    addButton.type = 'button';
    const said = element('p', 'note');
    said.setAttribute('role', 'status');
    addButton.addEventListener('click', async () => {
      const entry = entries[readingSelect ? Number(readingSelect.value) : 0];
      addButton.disabled = true;
      const result = await addEntry(entry, deckSelect.value);
      const word = getWords().find((own) => own.id === wordId(entry));
      if (result === 'already there' || !word) {
        said.textContent = 'This word is already in that deck.';
        addButton.disabled = false;
        return;
      }
      // Now one of your words: its own page, with its cards, and "Learn it
      // now" at its top (show).
      if (dialog.open) {
        trail[trail.length - 1] = { word, addedTo: deckSelect.value };
        show({ word, addedTo: deckSelect.value });
      }
    });
    adding.append(
      ...(readingSelect ? [element('span', '', 'Add'), readingSelect, element('span', '', 'to your words, in')] : [element('span', '', 'Add to your words, in')]),
      deckSelect,
      addButton,
    );
    return [adding, said];
  }

  // How each character is built. `chars`: the characters to show, written
  // in `script` (for marking them as Chinese, lang.js).
  function showCharacters(characters, chars, single, script) {
    // Text with Chinese in it, its Chinese marked.
    const mixed = (tag, className, text) => {
      const made = element(tag, className);
      fillMixed(made, text, script);
      return made;
    };
    const section = element('section', 'page-section');
    section.append(element('h3', '', single ? 'How it is built' : 'Characters'));
    let any = false;
    for (const char of chars) {
      const structure = structureOf(characters, char);
      if (!structure) {
        continue;
      }
      any = true;
      const card = element('div', 'character-card');
      if (!single) {
        const big = element('button', 'character-big', char);
        big.type = 'button';
        big.lang = langFor(script);
        big.addEventListener('click', () => go({ text: char }));
        const about = mixed('p', '', `${structure.pinyin.join(', ')}  ${structure.definition}`);
        const top = element('div', 'character-top');
        top.append(big, about);
        card.append(top);
      }
      if (structure.parts.length > 0) {
        const parts = element('div', 'character-parts');
        for (const { part, role } of structure.parts) {
          const button = element('button', `part ${role || ''}`.trim());
          button.type = 'button';
          const partCharacter = element('span', 'part-character', part);
          partCharacter.lang = langFor(script);
          button.append(partCharacter);
          if (role) {
            // "meaning" or "sound": what this part does in the character.
            button.append(element('span', 'part-role', role));
          }
          button.addEventListener('click', () => go({ text: part }));
          parts.append(button);
        }
        card.append(parts);
      }
      const KINDS = {
        'sound-meaning': structure.hint
          ? `One part gives the meaning (${structure.hint}) and one the sound.`
          : 'One part gives the meaning and one the sound.',
        // The dictionary's gloss for these two kinds is often a way of
        // seeing the character more than its history, and is worded so.
        meaning: structure.hint ? `One way to see it: ${structure.hint.replace(/\.$/, '')}.` : '',
        picture: structure.hint ? `Seen as a picture: ${structure.hint.replace(/\.$/, '')}.` : 'Seen as a picture.',
      };
      if (KINDS[structure.kind]) {
        card.append(mixed('p', 'hint', KINDS[structure.kind]));
      }
      section.append(card);
    }
    return any ? section : null;
  }

  // Shows a page. target: { word } or { text }.
  async function show(target) {
    closePeek();
    const settings = getSettings();
    // The word as it is stored now: what this was called with may be a copy
    // from before something on the page changed it.
    // A dictionary entry tapped (target.entry) is one of your words only if
    // it has the same reading: you may have 行 xíng, and this be 行 háng.
    const given =
      target.word ||
      (target.entry
        ? getWords().find((entry) => entry.id === wordId(target.entry)) || null
        : wordWritten(target.text));
    const word = given ? getWords().find((entry) => entry.id === given.id) || given : null;
    const parts = [];
    // The word's cards are shown at once, before the files below are waited
    // for: by then the word may have been changed from this very page, and
    // the copy held here must not be handed on as if it were current.
    cardsPart.hidden = !word;
    if (word) {
      showCards(word);
    }
    let forms;
    let chars;
    // The script the page's characters are in.
    let script = settings.script;

    if (word) {
      script = scriptFor(word, settings);
      shown = { word };
      forms = { simplified: word.simplified, traditional: word.traditional, own: word[script] };
      const described = describeReading(readingsFor(word, settings.pronunciation, null));
      parts.push(
        showHeading(
          forms,
          described.main,
          described.other,
          isRadical(word) ? null : { word, reading: readingsFor(word, settings.pronunciation, null).primary },
          isSentence(word) ? word.pinyin : null,
        ),
      );
      const chips = deckChips(word);
      if (chips) {
        parts.push(chips);
      }
      const meaning = element('p', 'page-meaning');
      fillMixed(meaning, word.definition, script);
      parts.push(meaning);
    } else {
      // Not one of your words: what the dictionary says, the entry tapped
      // in the Words tab first.
      const found = await lookUp(target.text);
      const tapped = target.entry && found.find((entry) => wordId(entry) === wordId(target.entry));
      const entries = tapped ? [tapped, ...found.filter((entry) => entry !== tapped)] : found;
      shown = { text: target.text, entries };
      const [first] = entries;
      forms = first
        ? { simplified: first.simplified, traditional: first.traditional, own: first[settings.script] }
        : { simplified: target.text, traditional: target.text, own: target.text };
      const speakable = first
        ? { word: first, reading: first.pinyin }
        : { word: { simplified: target.text, traditional: target.text, pinyin: '' }, reading: '' };
      parts.push(showHeading(forms, first ? formatPinyin(first.pinyin) : '', null, speakable));
      // Every reading the dictionary has, each with its meanings.
      for (const entry of entries) {
        const meaning = element('p', 'page-meaning');
        fillMixed(meaning, `${formatPinyin(entry.pinyin)}: ${entry.meanings.join('; ')}`, script);
        parts.push(meaning);
      }
      if (entries.length > 0) {
        parts.push(...showAdding(entries));
      } else {
        parts.push(element('p', 'hint', 'Not in your words or the dictionary. To add it, type it on a deck\'s page.'));
      }
    }
    chars = [...new Set(Array.from(forms.own).filter(isHan))];

    const notes = await loadNotes();
    const note = noteFor(notes, word || { simplified: forms.simplified, pinyin: shown.entries?.[0]?.pinyin || '' });
    if (note) {
      parts.push(showNote(note, forms));
    }
    const characters = await loadCharacters();
    const built = showCharacters(characters, chars, chars.length === 1 && Array.from(forms.own).length === 1, script);
    if (built) {
      parts.push(built);
    }

    // Opened from a card in Review: a strip under the word for that card,
    // with Suspend and Start over (UX review, item 16; the owner,
    // 2026-10-17). The rest of the word's cards are at the bottom, as ever.
    if (word && target.thisCard && target.thisCard.wordId === word.id) {
      parts.splice(1, 0, showThisCard(target.thisCard));
    }

    // Just added from the dictionary, and still to be learned: "Learn it now"
    // (the owner, 2026-10-16). At the top, not among the buttons at the
    // bottom, which are four already.
    if (word && target.addedTo && !isLearned(word)) {
      const added = element('div', 'page-learn-now');
      const deck = getDecks().find((entry) => entry.id === target.addedTo);
      const deckName = element('span');
      fillMixed(deckName, deck ? deck.name : '', settings.script);
      const learnButton = element('button', 'small', 'Learn it now');
      learnButton.type = 'button';
      learnButton.addEventListener('click', () => {
        dialog.close();
        learnNow(word.id, target.addedTo);
      });
      const said = element('span');
      said.append('Added to ', deckName);
      added.append(said, learnButton);
      parts.unshift(added);
    }
    body.replaceChildren(...parts);
    scroller.scrollTop = 0;
    backButton.hidden = trail.length < 2;
    editButton.hidden = !shown.word;
    practiceButton.hidden = !shown.word || !canPractice();
    removeButton.hidden = !shown.word || !canPractice();
    // For the browser tests, which wait for a page to be filled in.
    dialog.dataset.shown = word ? word.id : target.text;
  }

  // The strip for the card the page was opened from (see show).
  function showThisCard(thisCard) {
    const strip = element('div', 'page-this-card');
    const said = element('span');
    said.append(element('b', '', `This card: ${thisCard.label}`));
    if (thisCard.facts) {
      said.append(` · ${thisCard.facts}`);
    }
    const buttons = element('div', 'page-this-card-buttons');
    for (const [label, act] of [
      ['Suspend', thisCard.suspend],
      ['Start over', thisCard.startOver],
    ]) {
      const button = element('button', 'small', label);
      button.type = 'button';
      button.addEventListener('click', async () => {
        if (await act()) {
          dialog.close();
        }
      });
      buttons.append(button);
    }
    strip.append(said, buttons);
    return strip;
  }

  // ---- A word of the example sentence, tapped ----

  const peekCard = byId('word-peek');
  // The piece of the sentence the popup is about: { text, pinyin }.
  let peeked = null;

  // The gap between the word and the popup, and the room kept at the
  // screen's edges.
  const PEEK_GAP = 6;
  const PEEK_MARGIN = 12;

  // Shows the popup for a word that was tapped, under the word (or above
  // it, if there is no room under it). `piece`: { text, pinyin }, the word
  // and, for a word of an example sentence, its reading there with tone
  // marks (from sentenceWords; null if the sentence's pinyin did not fit
  // it), which is the one shown, since a word with two readings is read one
  // way there. A word of a learning note has no such reading (null): one of
  // the learner's words shows theirs, any other the usual one (likeliestEntry).
  async function peek(button, piece) {
    peeked = piece;
    const settings = getSettings();
    const own = wordWritten(piece.text);
    let entry = null;
    if (!own && piece.pinyin) {
      // The dictionary's entry for the reading in the sentence, if it has one.
      const entries = await lookUp(piece.text);
      const plain = (pinyin) => (pinyin || '').toLowerCase().replace(/\s+/g, '');
      entry = entries.find((candidate) => plain(formatPinyin(candidate.pinyin)) === plain(piece.pinyin)) || entries[0];
    } else if (!own) {
      entry = await likeliestEntry(piece.text);
    }
    if (peeked !== piece) {
      return; // another word was tapped meanwhile
    }

    byId('word-peek-word').textContent = piece.text;
    // The same regional font as the sentence it is from.
    byId('word-peek-word').lang = button.closest('[lang]')?.lang || '';
    byId('word-peek-pinyin').textContent =
      piece.pinyin || (own ? formatPinyin(own.pinyin) : entry ? formatPinyin(entry.pinyin) : '');
    byId('word-peek-meaning').textContent = own
      ? own.definition
      : entry
        ? entry.meanings.join('; ')
        : 'Not in the dictionary.';
    // The loudspeaker, made afresh for this word, on the word's line.
    peekCard.querySelector('.icon-button')?.remove();
    const speakable = own
      ? { word: own, reading: readingsFor(own, settings.pronunciation, null).primary }
      : entry
        ? { word: entry, reading: entry.pinyin }
        : null;
    if (settings.sound !== 'off' && speakable) {
      peekCard.querySelector('.word-peek-line').append(loudspeaker(speakable.word, speakable.reading));
    }

    // Inside the pop-up panel the word is in, if any (outside it nothing can
    // be tapped), else in the page: a word on a card in Review.
    const host = button.closest('dialog') || document.body;
    if (peekCard.parentElement !== host) {
      host.append(peekCard);
    }
    peekCard.showPopover();
    const box = button.getBoundingClientRect();
    const width = peekCard.offsetWidth;
    const height = peekCard.offsetHeight;
    const below = box.bottom + PEEK_GAP + height <= window.innerHeight - PEEK_MARGIN;
    const left = Math.min(Math.max(box.left, PEEK_MARGIN), window.innerWidth - PEEK_MARGIN - width);
    peekCard.style.left = `${left}px`;
    peekCard.style.top = `${below ? box.bottom + PEEK_GAP : box.top - PEEK_GAP - height}px`;
  }

  function closePeek() {
    peeked = null;
    if (peekCard.matches(':popover-open')) {
      peekCard.hidePopover();
    }
  }

  byId('word-peek-open').addEventListener('click', () => {
    const { text } = peeked;
    closePeek();
    // From a word's page, on to the next with Back to return; from a card,
    // the page opens.
    if (dialog.open) {
      go({ text });
    } else {
      start({ text });
    }
  });
  // The popup goes with the page it was opened on, and only then: the page's
  // "close" event can come late, after a word on a card under it was
  // tapped, and it closed that word's popup, so the next tap went to the card
  // (a lesson moved on; found 2026-10-17 by a browser test failing one run in
  // five).
  dialog.addEventListener('close', () => {
    if (dialog.contains(peekCard)) {
      closePeek();
    }
  });
  // A tap beside the page closes it too (dialogs.js).
  closeOnTapBeside(dialog);

  // The tap that closes the popup does nothing else: the browser closes it
  // on a tap anywhere outside it, and that tap must not also reveal a card's
  // answer, move on, or open something on the page. Listening in the
  // "capture" phase (the `true`) hears the tap on its way down, before what
  // it was aimed at does, so it can be stopped there.
  let tapClosesPeek = false;
  document.addEventListener(
    'pointerdown',
    (event) => {
      tapClosesPeek = peekCard.matches(':popover-open') && !peekCard.contains(event.target);
    },
    true,
  );
  // A finger that scrolled instead of tapping brings no click.
  document.addEventListener('pointercancel', () => (tapClosesPeek = false), true);
  for (const type of ['pointerup', 'click']) {
    document.addEventListener(
      type,
      (event) => {
        if (tapClosesPeek) {
          event.stopPropagation();
          event.preventDefault();
          // The click is the tap's last event: the next one is a tap of its own.
          if (type === 'click') {
            tapClosesPeek = false;
          }
        }
      },
      true,
    );
  }

  // A button for a word of a learning note, which shows the popup. On a
  // card, a tap on the card's face reveals or moves on; a tap on this must
  // not.
  function noteWordButton(piece) {
    const button = element('button', 'note-word', piece.text);
    button.type = 'button';
    // Marked as Chinese for screen readers and the font (lang.js). A note's
    // Chinese may be in either script (data/notes/CLAUDE.md), so the
    // learner's is taken.
    button.lang = langFor(getSettings().script);
    button.addEventListener('pointerup', (event) => event.stopPropagation());
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      peek(button, { text: piece.text, pinyin: null });
    });
    return button;
  }

  // Fills `target` with `text`, a learning note, whose Chinese words can be
  // tapped for the popup. The text is there at once; its words become
  // buttons once the dictionary is there to split it into words (the first
  // time, it is fetched). The owner asked for this on 2026-10-15, in place of
  // pinyin written into the notes of the beginner levels.
  function tappableText(target, text) {
    // Its Chinese marked as Chinese from the start (lang.js), in the
    // learner's script, as the buttons below are.
    fillMixed(target, text, getSettings().script);
    splitWords(text).then((pieces) => {
      // (Unless the element was given other text meanwhile, or the text has
      // no Chinese in it.)
      if (target.textContent !== text || !pieces.some((piece) => piece.word)) {
        return;
      }
      const parts = [];
      pieces.forEach((piece, index) => {
        if (!piece.word) {
          // Punctuation right after a word went with it (below).
          const after = pieces[index - 1]?.word ? piece.text.replace(/^[^\s\p{L}\p{N}]+/u, '') : piece.text;
          parts.push(after);
          return;
        }
        // A word and the punctuation right after it ("们,") are kept on one
        // line, or the comma could start the next.
        const next = pieces[index + 1];
        const punctuation = next && !next.word ? next.text.match(/^[^\s\p{L}\p{N}]+/u)?.[0] : null;
        if (punctuation) {
          const together = element('span', 'nowrap');
          together.append(noteWordButton(piece), punctuation);
          parts.push(together);
        } else {
          parts.push(noteWordButton(piece));
        }
      });
      target.replaceChildren(...parts);
    });
  }

  // Goes on to another page from the one on screen.
  function go(target) {
    trail.push(target);
    return show(target);
  }

  backButton.addEventListener('click', () => {
    trail.pop();
    show(trail.at(-1));
  });
  byId('word-page-close').addEventListener('click', () => dialog.close());
  editButton.addEventListener('click', () => {
    if (!dialog.open || !shown.word) {
      return;
    }
    const { word } = shown;
    dialog.close();
    edit(word);
  });

  // Remove, beside Edit (tester 2, 2026-10-17: removing a word should not
  // need Edit first; the owner, 2026-10-18). Asked first, as in the word's
  // panel; the page closes once it is gone. Not in Review or Learn, as
  // Practice is not (canPractice): there the card shown is the word's.
  removeButton.addEventListener('click', async () => {
    if (!dialog.open || !shown.word) {
      return;
    }
    if (await remove(shown.word)) {
      dialog.close();
    }
  });

  practiceButton.addEventListener('click', () => {
    if (!dialog.open || !shown.word) {
      return;
    }
    const { word } = shown;
    dialog.close();
    practice(word);
  });

  function start(target) {
    trail = [target];
    // The buttons work at once; the rest is filled in as the files arrive.
    shown = target.word ? { word: target.word } : { text: target.text, entries: [] };
    editButton.hidden = !target.word;
    practiceButton.hidden = !target.word || !canPractice();
    removeButton.hidden = !target.word || !canPractice();
    backButton.hidden = true;
    body.replaceChildren();
    delete dialog.dataset.shown;
    if (!dialog.open) {
      dialog.showModal();
      // A tip the first time (tips.js); after the page is open, so it lies above it.
      document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'wordPage' }));
    }
    return show(target);
  }

  return {
    // The learning note of one of your words, or null (for the tip on a
    // card: cardTip.js). The notes are fetched the first time.
    noteOf: async (word) => noteFor(await loadNotes(), word),
    // Opens the page of one of your words. thisCard, when opened from a card
    // in Review: { wordId, label, facts, suspend(), startOver() }, for the
    // strip at the top; suspend and startOver return true once done.
    open: (word, thisCard = null) => start({ word, thisCard }),
    // Opens the page for some characters, whatever they are.
    openText: (text) => start({ text }),
    // Opens the page of a dictionary entry (the Words tab's dictionary), in
    // the script being learned, with that entry's reading first.
    openEntry: (entry) => start({ text: entry[getSettings().script], entry }),
    // Fills an element with a learning note whose words can be tapped (for
    // the tip on a card: cardTip.js).
    tappableText,
  };
}
