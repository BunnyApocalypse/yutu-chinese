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

import { formatPinyin } from './wordList.js';
import { scriptFor } from './words.js';
import { langFor, fillMixed } from './lang.js';
import { readingsFor, describeReading } from './tones.js';
import { parseNotes, noteFor, sentenceWords } from './notes.js';
import { parseCharacters, structureOf } from './characters.js';
import { deckTree, readyMadeDeck } from './decks.js';
import { fillDeckSelect } from './decksPanel.js';
import { speak } from './speech.js';
import { isRadical } from './radicals.js';
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
// showCards(word):    fills in the part of the page that has the word's
//                     cards and which of them are suspended
//
// Returns { open(word), openText(characters) }.
export function createWordPage({
  getWords,
  getDecks,
  getSettings,
  lookUp,
  splitWords,
  likeliestEntry,
  edit,
  addSentence,
  defaultDeckId,
  practice,
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
      // Each word of the sentence can be tapped; punctuation is plain text.
      for (const piece of sentenceWords(sentence, note.example.pinyin)) {
        if (Array.from(piece.text).some(isHan)) {
          const button = element('button', 'sentence-word', piece.text);
          button.type = 'button';
          button.addEventListener('click', () => peek(button, piece));
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
    // lists are those lists' words. (If there are no others, the ready-made
    // lists and their levels, without the groups inside the levels: see
    // fillDeckSelect.)
    const own = getDecks().filter((deck) => !readyMadeDeck(deck.id));
    fillDeckSelect(deckSelect, own.length > 0 ? own : getDecks(), []);
    const preferred = defaultDeckId();
    if ([...deckSelect.options].some((option) => option.value === preferred)) {
      deckSelect.value = preferred;
    }
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
      said.textContent =
        result === 'added'
          ? 'Added. Its cards come up in Review.'
          : result === 'put in deck'
            ? 'You had this sentence already. It is in that deck now too.'
            : 'This sentence is already in that deck.';
    });
    adding.append(element('span', '', 'Make cards from this sentence in'), deckSelect, addButton);
    section.append(adding, said);
    return section;
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
    const given = target.word || wordWritten(target.text);
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
        ),
      );
      // The decks it is in, as "HSK 3.0 › Level 1 › Family".
      const labels = deckTree(getDecks())
        .filter(({ deck }) => (word.decks || []).includes(deck.id))
        .map(({ label }) => label);
      if (labels.length > 0) {
        const chips = element('div', 'page-chips');
        // (A deck's name has no script of its own: the learner's is taken.)
        for (const label of labels) {
          const chip = element('span', 'chip');
          fillMixed(chip, label, settings.script);
          chips.append(chip);
        }
        parts.push(chips);
      }
      const meaning = element('p', 'page-meaning');
      fillMixed(meaning, word.definition, script);
      parts.push(meaning);
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
        const meaning = element('p', 'page-meaning');
        fillMixed(meaning, `${formatPinyin(entry.pinyin)}: ${entry.meanings.join('; ')}`, script);
        parts.push(meaning);
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
    const built = showCharacters(characters, chars, chars.length === 1 && Array.from(forms.own).length === 1, script);
    if (built) {
      parts.push(built);
    }

    body.replaceChildren(...parts);
    scroller.scrollTop = 0;
    backButton.hidden = trail.length < 2;
    editButton.hidden = !shown.word;
    practiceButton.hidden = !shown.word;
    // For the browser tests, which wait for a page to be filled in.
    dialog.dataset.shown = word ? word.id : target.text;
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
  // The popup goes with the page it was opened on.
  dialog.addEventListener('close', closePeek);

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
      // A tip the first time (tips.js); after the page is open, so it lies above it.
      document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'wordPage' }));
    }
    return show(target);
  }

  return {
    // The learning note of one of your words, or null (for the tip on a
    // card: cardTip.js). The notes are fetched the first time.
    noteOf: async (word) => noteFor(await loadNotes(), word),
    // Opens the page of one of your words.
    open: (word) => start({ word }),
    // Opens the page for some characters, whatever they are.
    openText: (text) => start({ text }),
    // Fills an element with a learning note whose words can be tapped (for
    // the tip on a card: cardTip.js).
    tappableText,
  };
}
