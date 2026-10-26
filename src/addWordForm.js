// Adding one word to the deck whose page is open: its boxes, the pinyin
// shown with tone marks, the dictionary filling in what it can as the
// characters are typed, the entries to choose from (and words read as pinyin
// typed), and "Learn it now" once it is added. Moved here from wordsPanel.js
// on 2026-10-17, when it was split by screen.

import { putAll } from './db.js';
import { wordId } from './wordList.js';
import { showReading } from './readingStyle.js';
import { fillMixed, fillReading } from './lang.js';
import { withDeck } from './decks.js';
import { entryRow } from './wordRows.js';
import { checkWord, newWordRecords, wordsWithSameCharacters, tidyPinyin } from './words.js';
import { lookUp, lookUpByLetters, readTypedPinyin, proposeMeaning } from './dictionary.js';
import { t } from './text.js';

const byId = (id) => document.getElementById(id);

// How many dictionary entries are offered for the characters typed.
const MAX_SUGGESTIONS = 8;

// shared: what the Decks and Words tabs keep (wordsPanel.js):
//   words(), isLearned(wordId), getSettings(), asksFor(),
//   charactersOf(word), openDeck() (the deck whose page is open),
//   afterChange(), applySettings() (fits all the forms to the settings),
//   learnNow(wordId, deckId), closeAdding() (closes the panel for adding)
// dictionaryLoader: dictionaryLoader.js
//
// Returns { showSuggestions(), clearNote(), applySettings(asks, both),
// placeReadingBoxes(taiwanFirst, pinyinLabel) }.
export function createAddWordForm(shared, dictionaryLoader) {
  const addForm = byId('add-word-form');
  const addFields = {
    traditional: byId('add-traditional'),
    simplified: byId('add-simplified'),
    pinyin: byId('add-pinyin'),
    pinyinTaiwan: byId('add-pinyin-taiwan'),
    definition: byId('add-definition'),
    cardScript: byId('add-card-script'),
  };
  const pinyinPreview = byId('add-pinyin-preview');
  const suggestions = byId('add-suggestions');
  const addNote = byId('add-word-note');
  const addLearnNow = byId('add-learn-now');

  // The one script the Add a word form asks for: 'traditional' or
  // 'simplified'; null if it asks for both. That is the script being learned
  // or, with both learned, the one chosen for this word under "Cards in".
  function scriptAsked() {
    const { script, bothScripts } = shared.getSettings();
    return bothScripts ? addFields.cardScript.value || null : script;
  }

  // Shows the pinyin with tone marks (or in zhuyin, readingStyle.js) as it
  // is typed, to check it by eye.
  function showPinyinPreview() {
    fillReading(pinyinPreview, showReading(addFields.pinyin.value.trim()));
  }
  addFields.pinyin.addEventListener('input', showPinyinPreview);

  // The characters field last typed in, which is what gets looked up.
  let lookedUpField = null;
  // The dictionary entry the fields were last filled in from, by itself or
  // by a tap, until the characters are typed over.
  let filledEntry = null;
  // Whether that entry was tapped, rather than chosen by itself (a tapped
  // one is kept; one chosen by itself gives way to a likelier one).
  let entryTapped = false;
  // What was last put in each field by itself (see autoFill), so that a
  // field the learner has typed in is told apart and left alone.
  const autoValues = new Map();

  const paragraph = (className, text) => {
    const element = document.createElement('p');
    element.className = className;
    element.textContent = text;
    return element;
  };
  // The same with Chinese or zhuyin in it, marked as such (lang.js).
  const mixedParagraph = (className, text) => {
    const element = paragraph(className, '');
    fillMixed(element, text, shared.getSettings().script);
    return element;
  };

  // Puts a dictionary entry into the fields, ready to be edited.
  // Puts a dictionary entry's characters into the box or boxes on show.
  function fillInCharacters(entry) {
    const asked = scriptAsked();
    if (asked) {
      // The other script is worked out when the word is added (completeForms).
      addFields[asked].value = entry[asked];
    } else {
      addFields.traditional.value = entry.traditional;
      addFields.simplified.value = entry.simplified === entry.traditional ? '' : entry.simplified;
    }
  }

  function fillIn(entry) {
    const asks = shared.asksFor();
    filledEntry = entry;
    entryTapped = true;
    fillInCharacters(entry);
    // Chosen from pinyin typed in the simplified box, a word written the same
    // in both scripts leaves that box empty: the traditional one has it.
    if (lookedUpField.value === '') {
      lookedUpField = addFields.traditional;
    }
    addFields.pinyin.value = entry.pinyin;
    addFields.pinyinTaiwan.value = asks.taiwan ? entry.pinyinTaiwan || '' : '';
    addFields.definition.value = proposeMeaning(entry.meanings, shared.getSettings().meaningDetail);
    // What a tap put there may be replaced by itself, as when filled in by
    // itself, should the characters be typed over.
    for (const field of [addFields.pinyin, addFields.pinyinTaiwan, addFields.definition]) {
      autoValues.set(field, field.value);
    }
    showPinyinPreview();
    addNote.textContent = '';
    showSuggestions();
    // The meaning is the part most likely to want changing.
    addFields.definition.focus();
  }

  // Fills in the reading and meaning by themselves as the characters are
  // typed, from the dictionary's first entry for them (the owner,
  // 2026-10-14: having to tap an entry was one step too many); the entries
  // listed under the box can still be tapped for another reading. A field
  // the learner has typed in is left as it is, and so is the box being
  // typed in; with `entry` null (nothing in the dictionary) what was filled
  // in by itself is taken out again.
  // Each lookup gives new records, so entries are compared by what they say.
  const sameEntry = (a, b) =>
    Boolean(a && b) && a.traditional === b.traditional && a.simplified === b.simplified && a.pinyin === b.pinyin;

  function autoFill(entry) {
    const asks = shared.asksFor();
    const put = (field, value) => {
      const free = field.value === '' || field.value === autoValues.get(field);
      if (free) {
        field.value = value;
        autoValues.set(field, value);
      }
    };
    filledEntry = entry;
    entryTapped = false;
    put(addFields.pinyin, entry ? entry.pinyin : '');
    put(addFields.pinyinTaiwan, entry && asks.taiwan ? entry.pinyinTaiwan || '' : '');
    put(addFields.definition, entry ? proposeMeaning(entry.meanings, shared.getSettings().meaningDetail) : '');
    // The other script's box, where both are asked for. (The simplified
    // box is left empty when the forms are the same, as its caption says.)
    if (!scriptAsked()) {
      if (lookedUpField === addFields.traditional) {
        put(addFields.simplified, entry && entry.simplified !== entry.traditional ? entry.simplified : '');
      } else {
        put(addFields.traditional, entry ? entry.traditional : '');
      }
    }
    showPinyinPreview();
  }

  // A dictionary entry as a button that fills in the form; `label` is what
  // its right-hand end says (nothing if null).
  const entryButton = (entry, label) =>
    entryRow(entry, label, shared.getSettings(), { selected: sameEntry(entry, filledEntry), onTap: () => fillIn(entry) });

  // How many words read as typed are listed under the box; "Show more"
  // lists more, and typing starts again from the first few.
  let pinyinShown = MAX_SUGGESTIONS;

  // Whether what is typed in the box is pinyin or English, not characters:
  // letters, with no Chinese among them.
  const isLatin = (typed) =>
    Boolean(readTypedPinyin(typed)) || (/[a-z]/i.test(typed) && !/\p{Script=Han}/u.test(typed));

  // The dictionary's words for pinyin or English typed in the box: read
  // that way or with that meaning (lookUpByLetters; tester 2, 2026-10-17,
  // wanted to add "piano" without knowing its pinyin, as the Words tab's
  // search allows; the owner, 2026-10-18).
  function latinEntries(dictionary, typed) {
    return lookUpByLetters(dictionary, typed, dictionaryLoader.readyListWords());
  }

  // What is listed under the box when pinyin or English is typed in it
  // (latinEntries), to choose from. Nothing is filled in by itself, since the
  // word is not known until one is chosen.
  function latinSuggestions(typed) {
    autoFill(null);
    const dictionary = dictionaryLoader.get();
    if (!dictionary) {
      return [];
    }
    const entries = latinEntries(dictionary, typed);
    if (entries.length === 0) {
      return [paragraph('hint', t('add.noSuchWord'))];
    }
    const have = new Set(shared.words().map((word) => word.id));
    const parts = entries
      .slice(0, pinyinShown)
      .map((entry) => entryButton(entry, t(have.has(wordId(entry)) ? 'add.inYourWords' : 'add.useThis')));
    const more = entries.length - pinyinShown;
    if (more > 0) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'link-button more-entries';
      button.textContent = t('words.showMore', { count: more });
      button.addEventListener('click', () => {
        pinyinShown += MAX_SUGGESTIONS;
        showSuggestions();
      });
      parts.push(button);
      const pinyin = readTypedPinyin(typed);
      if (pinyin && pinyin.tones.length === 0) {
        parts.push(paragraph('hint', t('add.toneNumbers')));
      }
    }
    return parts;
  }

  // Shows, under the characters typed, the words in the list written the
  // same way and what the dictionary has for them; or, under pinyin typed,
  // the words read that way.
  function showSuggestions() {
    // The form has not been set up yet (nothing typed since the app
    // started): nothing to suggest. Called then when the usual readings
    // have loaded for a word of a learning note tapped on a card, and until
    // 2026-10-17 it threw there, so the word's popup did not open.
    if (!lookedUpField) {
      return;
    }
    const typed = lookedUpField.value.trim();
    const dictionary = dictionaryLoader.get();
    // Nothing typed: what was filled in by itself goes too.
    if (typed === '' && !entryTapped) {
      autoFill(null);
    }
    if (isLatin(typed)) {
      suggestions.replaceChildren(...latinSuggestions(typed));
      return;
    }
    const parts = [];
    if (typed !== '') {
      const alreadyHave = wordsWithSameCharacters({ traditional: typed, simplified: typed }, shared.words());
      for (const word of alreadyHave) {
        parts.push(
          mixedParagraph(
            'note',
            t('add.alreadyInYourWords', {
              characters: shared.charactersOf(word),
              pinyin: showReading(word.pinyin),
              meaning: word.definition,
            }),
          ),
        );
      }
      const entries = dictionary ? lookUp(dictionary, typed) : [];
      // The fields follow the characters typed, unless an entry was tapped
      // for these very characters.
      if (dictionary && !(entryTapped && entries.some((entry) => sameEntry(entry, filledEntry)))) {
        autoFill(dictionaryLoader.likeliestEntry(entries, typed));
      }
      for (const entry of entries.slice(0, MAX_SUGGESTIONS)) {
        parts.push(entryButton(entry, t(sameEntry(entry, filledEntry) ? 'add.filledIn' : 'add.useThis')));
      }
      if (dictionary && entries.length === 0 && alreadyHave.length === 0) {
        parts.push(paragraph('hint', t('add.notInDictionary')));
      }
    }
    suggestions.replaceChildren(...parts);
  }

  for (const field of [addFields.traditional, addFields.simplified]) {
    // Fetch the dictionary as soon as a word is about to be typed, so it is
    // usually there by the time the characters are.
    field.addEventListener('focus', dictionaryLoader.load);
    field.addEventListener('input', () => {
      filledEntry = null; // the characters are no longer the tapped entry's
      entryTapped = false;
      lookedUpField = field;
      pinyinShown = MAX_SUGGESTIONS;
      dictionaryLoader.load(); // in case the text arrived without the box being tapped
      showSuggestions();
    });
  }

  // Choosing a script for the word leaves only that script's box. What was
  // typed in the other box goes with it; characters that came from a
  // dictionary entry are put back in the script now asked for.
  addFields.cardScript.addEventListener('change', () => {
    shared.applySettings();
    if (filledEntry) {
      fillInCharacters(filledEntry);
    }
    showSuggestions();
  });

  let learnNowTarget = null;
  addLearnNow.addEventListener('click', async () => {
    const target = learnNowTarget;
    shared.closeAdding();
    await shared.learnNow(target.wordId, target.deckId);
  });
  addForm.addEventListener('input', () => {
    addLearnNow.hidden = true;
  });

  addForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // or the browser would reload the page
    const typed = Object.fromEntries(
      Object.entries(addFields).map(([name, input]) => [name, input.value]),
    );
    // Pinyin or English still in the box: the word is to be chosen from the
    // list.
    const dictionary = dictionaryLoader.get();
    const inBox = lookedUpField.value.trim();
    if (dictionary && isLatin(inBox) && latinEntries(dictionary, inBox).length > 0) {
      addNote.textContent = t('add.chooseFromList');
      return;
    }
    const asked = scriptAsked();
    if (asked) {
      // Only one script was typed; the dictionary supplies the other.
      await dictionaryLoader.load();
      Object.assign(
        typed,
        dictionaryLoader.completeForms(asked, typed[asked].trim(), tidyPinyin(typed.pinyin.trim()) || '', filledEntry),
      );
    }
    const checked = checkWord(typed);
    if (checked.problem) {
      addNote.textContent = checked.problem;
      return;
    }
    // The word goes into the deck whose page is open.
    const deck = shared.openDeck();
    const { toAdd } = newWordRecords([checked.word], shared.words(), Date.now());
    const name = `${shared.charactersOf(checked.word)} (${showReading(checked.word.pinyin)})`;
    // A word that is there already is put in this deck as well.
    const existing = toAdd.length === 0 ? shared.words().find((word) => word.id === wordId(checked.word)) : null;
    if (existing && existing.decks.includes(deck.id)) {
      fillMixed(addNote, t('add.alreadyInDeck', { name }), shared.getSettings().script);
      return;
    }
    const added = withDeck(existing || toAdd[0], deck.id);
    await putAll('words', [added]);
    addForm.reset();
    filledEntry = null;
    autoValues.clear();
    shared.applySettings(); // "Cards in" is back to "As in Settings", so both boxes are

    pinyinPreview.textContent = '';
    suggestions.replaceChildren();
    fillMixed(
      addNote,
      existing ? t('add.nowInDeckToo', { name }) : t('add.added', { characters: shared.charactersOf(toAdd[0]) }),
      shared.getSettings().script,
    );
    await shared.afterChange();
    // "Learn it now", for a word still to be learned; typing the next word
    // puts it away.
    learnNowTarget = shared.isLearned(added.id) ? null : { wordId: added.id, deckId: deck.id };
    addLearnNow.hidden = learnNowTarget === null;
    lookedUpField.focus();
  });

  return {
    showSuggestions,

    // The note under the form, and "Learn it now", go when the panel is
    // opened again or another deck's page is.
    clearNote() {
      addNote.textContent = '';
      addLearnNow.hidden = true;
    },

    // Fits the boxes to the settings (see applySettings in wordsPanel.js):
    // `asks` from asksFor(), `both` while both scripts are learned.
    applySettings(asks, both) {
      const asked = scriptAsked();
      // A box that is out of sight is also emptied, so nothing stale is used.
      const showBox = (box, shown) => {
        box.hidden = !shown;
        if (!shown) {
          box.value = '';
        }
      };
      showBox(addFields.traditional, asked !== 'simplified');
      showBox(addFields.simplified, asked !== 'traditional');
      showBox(addFields.pinyinTaiwan, asks.taiwan);
      // With one script learned there is nothing to tell apart, so its box is
      // simply where the word goes.
      const caption = (box, text) => {
        box.placeholder = text;
        box.setAttribute('aria-label', text); // what a screen reader calls the box
      };
      // Either box also takes pinyin or English, to choose the word from a
      // list.
      caption(addFields.traditional, t(both ? 'add.traditionalOrSearch' : 'add.wordTraditional'));
      caption(
        addFields.simplified,
        t(both ? (asked ? 'add.simplified' : 'add.simplifiedIfDifferent') : 'add.wordSimplified'),
      );
      if (!lookedUpField || lookedUpField.hidden) {
        lookedUpField = asked === 'simplified' ? addFields.simplified : addFields.traditional;
      }
      // A word can only have a script of its own while both are being learned.
      byId('add-card-script-row').hidden = !both;
      if (!both) {
        addFields.cardScript.value = '';
      }
    },

    // The boxes for the readings: named by region, Taiwan's first where its
    // pronunciation is chosen (see showReadingBoxes in wordsPanel.js).
    placeReadingBoxes(taiwanFirst, pinyinLabel) {
      // (The example shows the tone numbers; spelled out, it did not fit a phone.)
      addFields.pinyin.placeholder = t('add.readingExample', { label: pinyinLabel });
      addFields.pinyin.setAttribute('aria-label', t('add.readingLabel', { label: pinyinLabel }));
      if (taiwanFirst) {
        addFields.pinyin.before(addFields.pinyinTaiwan);
      } else {
        pinyinPreview.after(addFields.pinyinTaiwan);
      }
    },
  };
}
