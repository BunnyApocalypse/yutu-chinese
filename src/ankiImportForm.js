// The pop-up for importing from Anki (#anki-dialog in index.html), opened by
// "Import a deck from Anki" in the new deck's panel. Three steps: choosing the file,
// checking what the app guessed of its layout, and what was brought over.
// The file is read by ankiFile.js and the import worked out by
// ankiImport.js; docs/anki.md has the owner's decisions.

import { saveImport, randomId } from './db.js';
import { openAnkiFile, readCollection } from './ankiFile.js';
import { describeCollection, defaultChoices, planAnkiImport, itemFromNote, isRadicalDeck } from './ankiImport.js';
import { isRadical } from './radicals.js';
import { formatPinyin } from './wordList.js';
import { CARD_TYPES } from './session.js';
import { fillMixed } from './lang.js';

const byId = (id) => document.getElementById(id);

// Numbers with commas, as in the rest of the app's English: 4,862.
const plural = (count, noun) => `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
// The verb for one or more: was/were, waits/wait.
const verb = (count, one, more) => (count === 1 ? one : more);
// "Meaning", "Meaning and Pinyin", "Meaning, Pinyin and Tone".
const andList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

const TYPE_LABELS = { meaning: 'Meaning', pinyin: 'Pinyin', tone: 'Tone', writing: 'Writing' };
const ROLE_LABELS = { characters: 'Characters', pinyin: 'Pinyin', meaning: 'Meaning' };
const MAX_PROBLEMS_SHOWN = 20;

// sql.js, fetched the first time a file is read: its WebAssembly file (see
// ankiFile.js) is 700 KB, which nobody but an Anki user needs. The "?url"
// import gives the file's address, as for the dictionary.
let sqlJsLoading = null;
function loadSqlJs() {
  sqlJsLoading =
    sqlJsLoading ||
    Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]).then(
      ([{ default: initSqlJs }, { default: wasmUrl }]) => initSqlJs({ locateFile: () => wasmUrl }),
    );
  return sqlJsLoading;
}

// shared: words(), decks(), cards(), getSettings(), afterChange(), as the
//         Decks tab keeps them (wordsPanel.js)
// dictionaryLoader: dictionaryLoader.js
export function createAnkiImport(shared, dictionaryLoader) {
  const dialog = byId('anki-dialog');
  const fileInput = byId('anki-file');
  const note = (text) => {
    byId('anki-note').textContent = text;
  };
  // The file read, what it holds, and the learner's choices.
  let collection = null;
  let description = null;
  let choices = null;
  // The ready-made list of radicals: a note that is one of them becomes
  // that radical (itemFromNote in ankiImport.js). Empty if it could not be
  // fetched; such notes are then words where the dictionary has them.
  let radicals = [];

  function showStep(step) {
    for (const name of ['choose', 'check', 'done']) {
      byId(`anki-${name}-step`).hidden = name !== step;
    }
  }

  byId('anki-import-button').addEventListener('click', () => {
    collection = null;
    showStep('choose');
    note('');
    dialog.showModal();
  });
  byId('anki-cancel-button').addEventListener('click', () => dialog.close());
  byId('anki-done-button').addEventListener('click', () => dialog.close());

  // The real file chooser is a hidden <input type="file">; the button opens it.
  byId('anki-file-button').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // so choosing the same file again still counts
    if (!file) {
      return;
    }
    note('Reading the file…');
    try {
      // The dictionary is fetched meanwhile: it fills in what notes lack.
      const [SQL] = await Promise.all([loadSqlJs(), dictionaryLoader.load()]);
      const db = await openAnkiFile(new Uint8Array(await file.arrayBuffer()), SQL);
      try {
        collection = readCollection(db);
      } finally {
        db.close();
      }
    } catch (error) {
      note(`That file could not be read. ${error.message}`);
      return;
    }
    if (collection.notes.length === 0) {
      note('There are no notes in this file.');
      return;
    }
    // The usual readings decide a word's reading where a note has none.
    await dictionaryLoader.loadUsualReadings();
    radicals = await dictionaryLoader.readyEntries('radicals').catch(() => []);
    description = describeCollection(collection, shared.getSettings().script);
    choices = defaultChoices(description);
    renderChoices();
    showStep('check');
    note(dictionaryLoader.get() ? '' : 'The dictionary could not be fetched, so notes without pinyin will be left out.');
  });

  // A checkbox with its text, as Settings has them.
  function checkbox(text, checked, onChange) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', () => onChange(input.checked));
    label.append(input, ` ${text}`);
    return label;
  }

  function renderChoices() {
    const noteCount = collection.notes.length;
    byId('anki-summary').textContent =
      `In the file: ${plural(noteCount, 'note')} in ${plural(description.decks.length, 'deck')}, ` +
      `${plural(description.reviewCount, 'review')}.` +
      (description.reviewCount === 0
        ? ' It has no review history (a shared deck, or exported without scheduling), so its words will wait in Learn.'
        : '');

    byId('anki-decks').replaceChildren(
      ...description.decks.map((deck) => {
        const label = checkbox('', true, (checked) => {
          if (checked) {
            choices.deckIds.add(deck.id);
          } else {
            choices.deckIds.delete(deck.id);
          }
        });
        // A deck's name may have Chinese in it.
        const name = document.createElement('span');
        fillMixed(name, `${deck.name.split('::').join(' › ')} · ${plural(deck.cardCount, 'card')}`, shared.getSettings().script);
        label.append(name);
        return label;
      }),
    );

    byId('anki-note-types').replaceChildren(...description.noteTypes.map(noteTypeChoices));
  }

  // A heading inside "Change this", with what it asks under it.
  function foldPart(title, explanation) {
    const part = document.createElement('div');
    part.className = 'anki-fold-part';
    const heading = document.createElement('p');
    heading.className = 'anki-fold-title';
    heading.textContent = title;
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = explanation;
    part.append(heading, hint);
    return part;
  }

  // One note type: first a summary in plain words of what its notes become
  // and what the Anki reviews count for, then the choices behind it, folded
  // away under "Change this" since the guesses are usually right (the owner,
  // 2026-10-21, who found the open lists and checkboxes unclear): which field
  // is which, and what each template's cards count for. The summary follows
  // every change.
  function noteTypeChoices(noteType) {
    const choice = choices.noteTypes[noteType.id];
    const settings = shared.getSettings();
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'setting anki-note-type';
    const legend = document.createElement('legend');
    fillMixed(legend, `${noteType.name} · ${plural(noteType.noteCount, 'note')}`, settings.script);
    fieldset.append(legend);

    const becomes = document.createElement('p');
    becomes.className = 'anki-becomes';
    const countsFor = document.createElement('p');
    countsFor.className = 'anki-counts-for';
    const startsNew = document.createElement('p');
    startsNew.className = 'hint';
    const change = document.createElement('details');
    change.className = 'anki-change';
    const changeSummary = document.createElement('summary');
    changeSummary.textContent = 'Change this';
    change.append(changeSummary);
    fieldset.append(becomes, countsFor, startsNew, change);

    const notesOfType = collection.notes.filter((candidate) => candidate.noteTypeId === noteType.id);
    // What the first note becomes, as the import would make it.
    function showExample() {
      if (choice.roles.characters === null) {
        becomes.textContent = 'These notes are left out: no field is chosen for the characters.';
        return false;
      }
      const text = (role) => (choice.roles[role] === null ? '' : noteType.example[choice.roles[role]]);
      const spare = choice.spareMeaning;
      const result = itemFromNote(
        {
          characters: text('characters'),
          pinyin: text('pinyin'),
          meaning: text('meaning'),
          spareMeaning: spare === null || Object.values(choice.roles).includes(spare) ? '' : noteType.example[spare],
        },
        {
          dictionary: dictionaryLoader.get(),
          likeliestEntry: dictionaryLoader.likeliestEntry,
          meaningDetail: settings.meaningDetail,
          radicals: isRadicalDeck(notesOfType, choice.roles.characters, radicals) ? radicals : null,
        },
      );
      if (result.problem) {
        fillMixed(becomes, `The first note would be left out. ${result.problem}`, settings.script);
        return false;
      }
      const { word } = result;
      // A radical has no reading of its own.
      const reading = isRadical(word) ? '(radical)' : formatPinyin(word.pinyin);
      becomes.textContent = 'Each note becomes a word, like:';
      const example = document.createElement('strong');
      fillMixed(example, `${word[settings.script]} ${reading} · ${word.definition}`, settings.script);
      becomes.append(example);
      return true;
    }
    // What the Anki reviews count for, all templates together, and what
    // starts new. Without review history in the file, every card starts new
    // and the summary at the top says so.
    function showCountsFor() {
      countsFor.hidden = startsNew.hidden = description.reviewCount === 0;
      const counted = CARD_TYPES.filter((type) =>
        noteType.templates.some((template) => template.cardCount > 0 && choice.templates[template.ord].includes(type)),
      );
      const names = (types) => andList(types.map((type) => TYPE_LABELS[type]));
      countsFor.textContent =
        counted.length > 0
          ? `Your Anki reviews count for: ${names(counted)}.`
          : 'Your Anki reviews aren’t used: every card starts new.';
      const fresh = CARD_TYPES.filter((type) => !counted.includes(type));
      startsNew.textContent =
        fresh.length > 0 && counted.length > 0
          ? `${names(fresh)} ${fresh.length === 1 ? 'starts' : 'start'} new: a few words a day in Review, with a lesson.`
          : '';
      startsNew.hidden = startsNew.hidden || startsNew.textContent === '';
    }

    // Each part of "Change this" says what it asks, in words for someone who
    // never made an Anki deck (the owner, 2026-10-21: "I still don't
    // understand what the checkboxes and dropdowns mean").
    change.append(
      foldPart(
        'Where the notes keep each part of the word',
        'An Anki note keeps a word in boxes, named by whoever made the deck. Choose the box for each part; ' +
          'in brackets is what the first note has there.',
      ),
    );
    for (const role of ['characters', 'pinyin', 'meaning']) {
      const label = document.createElement('label');
      label.className = 'setting anki-role';
      const select = document.createElement('select');
      const none = new Option('(none)', '');
      select.append(
        none,
        ...noteType.fields.map((name, index) => {
          const example = noteType.example[index].replace(/\n/g, ' ');
          const shown = example.length > 16 ? `${example.slice(0, 15)}…` : example;
          return new Option(shown ? `${name} (${shown})` : name, String(index));
        }),
      );
      select.value = choice.roles[role] === null ? '' : String(choice.roles[role]);
      select.addEventListener('change', () => {
        choice.roles[role] = select.value === '' ? null : Number(select.value);
        showExample();
      });
      label.append(ROLE_LABELS[role], select);
      change.append(label);
    }

    change.append(
      foldPart(
        'What your Anki reviews practiced',
        'Each word here has four cards. A card ticked keeps your schedule from Anki; one not ticked starts new.',
      ),
    );
    for (const template of noteType.templates.filter((candidate) => candidate.cardCount > 0)) {
      const row = document.createElement('div');
      row.className = 'anki-template';
      const name = document.createElement('p');
      fillMixed(
        name,
        `Reviewing Anki’s “${template.name}” (${plural(template.cardCount, 'card')}` +
          `${template.front.length > 0 ? `, showing ${template.front.join(', ')} on the front` : ''}), you practiced:`,
        settings.script,
      );
      const boxes = document.createElement('div');
      boxes.className = 'anki-choices anki-types';
      for (const type of CARD_TYPES) {
        boxes.append(
          checkbox(TYPE_LABELS[type], choice.templates[template.ord].includes(type), (checked) => {
            const types = choice.templates[template.ord].filter((other) => other !== type);
            choice.templates[template.ord] = checked ? [...types, type] : types;
            showCountsFor();
          }),
        );
      }
      row.append(name, boxes);
      // Anki can't check writing: the learner decides (the owner, 2026-10-19).
      if (template.couldBeWriting) {
        const hint = document.createElement('p');
        hint.className = 'hint';
        hint.textContent =
          'Anki can’t check handwriting. Tick Writing only if you wrote the characters out for these cards; ' +
          'otherwise writing starts new, with a lesson.';
        row.append(hint);
      }
      change.append(row);
    }

    // Opened at once where the first note would be left out, so the lists
    // to fix it are in sight.
    change.open = !showExample();
    showCountsFor();
    return fieldset;
  }

  byId('anki-import-now').addEventListener('click', async () => {
    const button = byId('anki-import-now');
    button.disabled = true;
    note('Importing…');
    try {
      const settings = shared.getSettings();
      const plan = planAnkiImport(collection, choices, {
        dictionary: dictionaryLoader.get(),
        likeliestEntry: dictionaryLoader.likeliestEntry,
        meaningDetail: settings.meaningDetail,
        radicals,
        words: shared.words(),
        decks: shared.decks(),
        cards: new Map(shared.cards().map((card) => [card.id, card])),
        settings,
        now: Date.now(),
        randomId,
      });
      await saveImport(plan);
      await shared.afterChange();
      showResult(plan);
      note('');
    } catch (error) {
      note(`The import failed, and nothing was changed. ${error.message}`);
    } finally {
      button.disabled = false;
    }
  });

  // "Brought over 12 new words and 3 radicals.", or as many as there are.
  function broughtOver({ newWords, newRadicals, wordsThere }) {
    const brought = [
      newWords > 0 || (newRadicals === 0 && wordsThere === 0) ? plural(newWords, 'new word') : '',
      newRadicals > 0 ? plural(newRadicals, 'radical') : '',
    ].filter(Boolean);
    return brought.length > 0 ? `Brought over ${brought.join(' and ')}.` : 'No new words.';
  }

  // What was brought over, a line for each thing, then the notes left out
  // with why and what to do about them (the owner, 2026-10-21: one long
  // paragraph was cramped, and what became of the notes left out unclear).
  function showResult({ report }) {
    const { waiting } = report;
    const lines = [
      broughtOver(report),
      report.wordsThere > 0
        ? `${plural(report.wordsThere, 'word')} you already had ${verb(report.wordsThere, 'was', 'were')} added to these decks.`
        : '',
      report.cardsWithSchedule > 0
        ? `${plural(report.cardsWithSchedule, 'card')} ${verb(report.cardsWithSchedule, 'keeps its', 'keep their')} schedule from Anki, with ` +
          `${plural(report.reviewsCopied, 'review')} of history.`
        : '',
      waiting > 0
        ? `${plural(waiting, 'word')} you hadn’t studied in Anki yet ${verb(waiting, 'waits', 'wait')} in Learn.`
        : '',
      report.alreadyStudied > 0
        ? `${plural(report.alreadyStudied, 'card')} already studied here ${verb(report.alreadyStudied, 'was', 'were')} left as ${verb(report.alreadyStudied, 'it is', 'they are')}.`
        : '',
      report.sameWord > 0
        ? `${plural(report.sameWord, 'note')} ${verb(report.sameWord, 'was the same word as another; it was', 'were the same word as others; each word was')} brought over once.`
        : '',
    ];
    byId('anki-result').replaceChildren(
      ...lines.filter(Boolean).map((line) => Object.assign(document.createElement('p'), { textContent: line })),
    );

    const leftOut = report.problems.length;
    byId('anki-left-out').hidden = leftOut === 0;
    byId('anki-left-out-title').textContent = `${plural(leftOut, 'note')} ${verb(leftOut, 'was', 'were')} left out`;
    // Grouped by why, each reason once with its notes under it: seven
    // notes left out for the same reason were seven long lines.
    const byReason = new Map();
    for (const { text, problem } of report.problems) {
      byReason.set(problem, [...(byReason.get(problem) || []), text.slice(0, 30)]);
    }
    const items = [...byReason].map(([problem, texts]) => {
      const item = document.createElement('li');
      const notes = document.createElement('p');
      notes.className = 'anki-problem-notes';
      const shown = texts.slice(0, MAX_PROBLEMS_SHOWN).join(', ');
      fillMixed(
        notes,
        texts.length > MAX_PROBLEMS_SHOWN ? `${shown} and ${(texts.length - MAX_PROBLEMS_SHOWN).toLocaleString('en-US')} more` : shown,
        shared.getSettings().script,
      );
      item.append(problem, notes);
      return item;
    });
    byId('anki-problems').replaceChildren(...items);
    showStep('done');
  }
}
