// The pop-up for importing from Anki (#anki-dialog in index.html), opened by
// "Import a deck from Anki" in the new deck's panel. Three steps: choosing the file,
// checking what the app guessed of its layout, and what was brought over.
// The file is read by ankiFile.js and the import worked out by
// ankiImport.js; docs/anki.md has the owner's decisions.

import { saveImport, randomId } from './db.js';
import { openAnkiFile, readCollection } from './ankiFile.js';
import { describeCollection, defaultChoices, planAnkiImport, itemFromNote } from './ankiImport.js';
import { isRadical } from './radicals.js';
import { formatPinyin } from './wordList.js';
import { CARD_TYPES } from './session.js';
import { fillMixed } from './lang.js';

const byId = (id) => document.getElementById(id);

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
// The verb for one or more: was/were, waits/wait.
const verb = (count, one, more) => (count === 1 ? one : more);

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

  // The choices for one note type: which field is which, with the first
  // note shown as the word it would become, and what each template's cards
  // count for.
  function noteTypeChoices(noteType) {
    const choice = choices.noteTypes[noteType.id];
    const settings = shared.getSettings();
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'setting anki-note-type';
    const legend = document.createElement('legend');
    fillMixed(legend, `${noteType.name} · ${plural(noteType.noteCount, 'note')}`, settings.script);
    fieldset.append(legend);

    const preview = document.createElement('p');
    preview.className = 'hint';
    function showPreview() {
      if (choice.roles.characters === null) {
        preview.textContent = 'Without a field of characters, these notes are left out.';
        return;
      }
      const text = (role) => (choice.roles[role] === null ? '' : noteType.example[choice.roles[role]]);
      const result = itemFromNote(
        { characters: text('characters'), pinyin: text('pinyin'), meaning: text('meaning') },
        {
          dictionary: dictionaryLoader.get(),
          likeliestEntry: dictionaryLoader.likeliestEntry,
          meaningDetail: settings.meaningDetail,
          radicals,
        },
      );
      if (result.problem) {
        fillMixed(preview, `First note: left out. ${result.problem}`, settings.script);
      } else {
        const { word } = result;
        // A radical has no reading of its own.
        const reading = isRadical(word) ? '(radical)' : formatPinyin(word.pinyin);
        fillMixed(preview, `First note: ${word[settings.script]} ${reading} · ${word.definition}`, settings.script);
      }
    }

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
        showPreview();
      });
      label.append(ROLE_LABELS[role], select);
      fieldset.append(label);
    }
    fieldset.append(preview);
    showPreview();

    const cardsTitle = document.createElement('p');
    cardsTitle.className = 'anki-cards-title';
    cardsTitle.textContent = 'What each kind of card counts for here:';
    fieldset.append(cardsTitle);
    for (const template of noteType.templates.filter((candidate) => candidate.cardCount > 0)) {
      const row = document.createElement('div');
      row.className = 'anki-template';
      const name = document.createElement('p');
      fillMixed(
        name,
        `${template.name}${template.front.length > 0 ? ` (shows ${template.front.join(', ')})` : ''} · ` +
          plural(template.cardCount, 'card'),
        settings.script,
      );
      const boxes = document.createElement('div');
      boxes.className = 'anki-choices anki-types';
      for (const type of CARD_TYPES) {
        boxes.append(
          checkbox(TYPE_LABELS[type], choice.templates[template.ord].includes(type), (checked) => {
            const types = choice.templates[template.ord].filter((other) => other !== type);
            choice.templates[template.ord] = checked ? [...types, type] : types;
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
      fieldset.append(row);
    }
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

  function showResult({ report }) {
    const { waiting } = report;
    const lines = [
      broughtOver(report),
      report.wordsThere > 0 ? `${plural(report.wordsThere, 'word')} you had already went into the decks.` : '',
      report.cardsWithSchedule > 0
        ? `${plural(report.cardsWithSchedule, 'card')} ${verb(report.cardsWithSchedule, 'keeps its', 'keep their')} schedule from Anki, with ` +
          `${plural(report.reviewsCopied, 'review')} of history.`
        : '',
      waiting > 0 ? `${plural(waiting, 'word')} not yet studied in Anki ${verb(waiting, 'waits', 'wait')} in Learn.` : '',
      report.alreadyStudied > 0
        ? `${plural(report.alreadyStudied, 'card')} already studied here ${verb(report.alreadyStudied, 'was', 'were')} left as ${verb(report.alreadyStudied, 'it is', 'they are')}.`
        : '',
      report.sameWord > 0
        ? `${plural(report.sameWord, 'note')} ${verb(report.sameWord, 'was', 'were')} the same word as another note.`
        : '',
      report.problems.length > 0 ? `${plural(report.problems.length, 'note')} could not be used:` : '',
    ];
    byId('anki-result').textContent = lines.filter(Boolean).join(' ');
    const items = report.problems.slice(0, MAX_PROBLEMS_SHOWN).map(({ text, problem }) => {
      const item = document.createElement('li');
      fillMixed(item, `${text.slice(0, 30)}: ${problem}`, shared.getSettings().script);
      return item;
    });
    if (report.problems.length > MAX_PROBLEMS_SHOWN) {
      const more = document.createElement('li');
      more.textContent = `… and ${report.problems.length - MAX_PROBLEMS_SHOWN} more.`;
      items.push(more);
    }
    byId('anki-problems').replaceChildren(...items);
    showStep('done');
  }
}
