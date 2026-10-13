// The word page: everything about one word or character, to read, not to
// change. Its characters and reading, with a loudspeaker; its meaning; a
// learning note and an example sentence, where there are any; and how each
// of its characters is built. The words of the example sentence and the
// parts of the characters can be tapped, which opens their page in turn.
//
// A page can be about a word in your words or about anything else that was
// tapped: then it shows what the dictionary has.
//
// The notes (data/notes/) and the dictionary of how characters are built
// (data/makemeahanzi/) are separate files, fetched the first time a page is
// opened and saved for offline use with the other big files.

import { formatPinyin } from './wordList.js';
import { scriptFor } from './words.js';
import { readingsFor, describeReading } from './tones.js';
import { parseNotes, noteFor, sentenceWords } from './notes.js';
import { parseCharacters, structureOf } from './characters.js';
import { deckTree, readyMadeDeck } from './decks.js';
import { fillDeckSelect } from './decksPanel.js';
import { speak } from './speech.js';
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
// defaultDeckId():    the deck first offered for that
// practice(word):     opens Free practice with the word
//
// Returns { open(word), openText(characters) }.
export function createWordPage({ getWords, getDecks, getSettings, lookUp, edit, addSentence, defaultDeckId, practice }) {
  const dialog = byId('word-page');
  const body = byId('word-page-body');
  const backButton = byId('word-page-back');
  const editButton = byId('word-page-edit');
  const practiceButton = byId('word-page-practice');

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

  // The characters, big, in the script or scripts being learned.
  function showHeading(forms, reading, other, speakable) {
    const settings = getSettings();
    const heading = element('div', 'page-heading');
    const shownForms = settings.bothScripts
      ? [...new Set([forms[settings.script], forms[settings.script === 'traditional' ? 'simplified' : 'traditional']])]
      : [forms.own];
    shownForms.forEach((form, index) => {
      const characters = element('p', index === 0 ? 'page-word' : 'page-word second', form);
      // A sentence is shown smaller than a word, so that it fits.
      characters.classList.toggle('long', Array.from(form).length > 6);
      // Tells the browser which regional font to use.
      characters.lang = form === forms.traditional ? 'zh-Hant-TW' : 'zh-Hans-CN';
      heading.append(characters);
    });
    const line = element('div', 'page-reading');
    line.append(element('span', 'entry-pinyin', reading));
    if (settings.sound !== 'off') {
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
    section.append(element('h3', '', 'Learning tips'), element('p', 'page-note', note.note));

    const scripts = settings.bothScripts
      ? [settings.script, settings.script === 'traditional' ? 'simplified' : 'traditional']
      : [settings.script];
    const sentences = [...new Set(scripts.map((script) => note.example[script]))];
    sentences.forEach((sentence) => {
      const line = element('p', 'page-sentence');
      line.lang = sentence === note.example.traditional ? 'zh-Hant-TW' : 'zh-Hans-CN';
      // Each word of the sentence can be tapped; punctuation is plain text.
      for (const piece of sentenceWords(sentence, note.example.pinyin)) {
        if (Array.from(piece.text).some(isHan)) {
          const button = element('button', 'sentence-word', piece.text);
          button.type = 'button';
          button.addEventListener('click', () => go({ text: piece.text }));
          line.append(button);
        } else {
          line.append(piece.text);
        }
      }
      section.append(line);
    });
    section.append(element('p', 'page-pinyin', note.example.pinyin), element('p', 'page-english', note.example.english));

    // The sentence can be studied too: it goes into a deck, in both scripts.
    const adding = element('div', 'page-add-sentence');
    const deckSelect = element('select', 'deck-select');
    deckSelect.setAttribute('aria-label', 'Deck to add the sentence to');
    // Only the learner's own decks are offered: the decks of the ready-made
    // lists are those lists' words, and there are hundreds of them. (All of
    // them, if there are no others.)
    const own = getDecks().filter((deck) => !readyMadeDeck(deck.id));
    fillDeckSelect(deckSelect, own.length > 0 ? own : getDecks(), []);
    const preferred = defaultDeckId();
    if ([...deckSelect.options].some((option) => option.value === preferred)) {
      deckSelect.value = preferred;
    }
    const addButton = element('button', 'small', 'Add sentence');
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
      said.textContent =
        result === 'added'
          ? 'Added. Its cards come up in Review.'
          : result === 'put in deck'
            ? 'You had this sentence already. It is in that deck now too.'
            : 'This sentence is already in that deck.';
    });
    adding.append(element('span', '', 'Study this sentence in'), deckSelect, addButton);
    section.append(adding, said);
    return section;
  }

  // How each character is built. `chars`: the characters to show.
  function showCharacters(characters, chars, single) {
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
        big.addEventListener('click', () => go({ text: char }));
        const about = element('p', '', `${structure.pinyin.join(', ')}  ${structure.definition}`);
        const top = element('div', 'character-top');
        top.append(big, about);
        card.append(top);
      }
      if (structure.parts.length > 0) {
        const parts = element('div', 'character-parts');
        for (const { part, role } of structure.parts) {
          const button = element('button', `part ${role || ''}`.trim());
          button.type = 'button';
          button.append(element('span', 'part-character', part));
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
        card.append(element('p', 'hint', KINDS[structure.kind]));
      }
      section.append(card);
    }
    return any ? section : null;
  }

  // Shows a page. target: { word } or { text }.
  async function show(target) {
    const settings = getSettings();
    const word = target.word || wordWritten(target.text);
    const parts = [];
    let forms;
    let chars;

    if (word) {
      const script = scriptFor(word, settings);
      shown = { word };
      forms = { simplified: word.simplified, traditional: word.traditional, own: word[script] };
      const described = describeReading(readingsFor(word, settings.pronunciation, null));
      parts.push(
        showHeading(forms, described.main, described.other, {
          word,
          reading: readingsFor(word, settings.pronunciation, null).primary,
        }),
      );
      // The decks it is in, as "HSK 3.0 › Level 1 › Family".
      const labels = deckTree(getDecks())
        .filter(({ deck }) => (word.decks || []).includes(deck.id))
        .map(({ label }) => label);
      if (labels.length > 0) {
        const chips = element('div', 'page-chips');
        labels.forEach((label) => chips.append(element('span', 'chip', label)));
        parts.push(chips);
      }
      parts.push(element('p', 'page-meaning', word.definition));
    } else {
      // Not one of your words: what the dictionary says.
      const entries = await lookUp(target.text);
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
        parts.push(element('p', 'page-meaning', `${formatPinyin(entry.pinyin)}: ${entry.meanings.join('; ')}`));
      }
      parts.push(element('p', 'hint', 'Not in your words. To add it, type it on a deck\'s page.'));
    }
    chars = [...new Set(Array.from(forms.own).filter(isHan))];

    const notes = await loadNotes();
    const note = noteFor(notes, word || { simplified: forms.simplified, pinyin: shown.entries?.[0]?.pinyin || '' });
    if (note) {
      parts.push(showNote(note, forms));
    }
    const characters = await loadCharacters();
    const built = showCharacters(characters, chars, chars.length === 1 && Array.from(forms.own).length === 1);
    if (built) {
      parts.push(built);
    }

    body.replaceChildren(...parts);
    body.scrollTop = 0;
    backButton.hidden = trail.length < 2;
    editButton.hidden = !shown.word;
    practiceButton.hidden = !shown.word;
    // For the browser tests, which wait for a page to be filled in.
    dialog.dataset.shown = word ? word.id : target.text;
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
    practiceButton.hidden = !target.word;
    backButton.hidden = true;
    body.replaceChildren();
    delete dialog.dataset.shown;
    if (!dialog.open) {
      dialog.showModal();
    }
    return show(target);
  }

  return {
    // Opens the page of one of your words.
    open: (word) => start({ word }),
    // Opens the page for some characters, whatever they are.
    openText: (text) => start({ text }),
  };
}
