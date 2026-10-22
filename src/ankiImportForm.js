// The pop-up for importing from Anki (#anki-dialog in index.html), opened by
// "Import a deck from Anki" in the new deck's panel. Three steps: choosing the file,
// checking what the app guessed of its layout, and what was brought over.
// The file is read by ankiFile.js and the import worked out by
// ankiImport.js; docs/anki.md has the owner's decisions.

import { saveImport, randomId } from './db.js';
import { openAnkiFile, readCollection } from './ankiFile.js';
import {
  describeCollection,
  defaultChoices,
  planAnkiImport,
  itemFromNote,
  isRadicalDeck,
  isSentenceDeck,
  countSentenceNotes,
  countOtherMeanings,
} from './ankiImport.js';
import { isRadical } from './radicals.js';
import { formatPinyin } from './wordList.js';
import { CARD_TYPES } from './session.js';
import { fillMixed } from './lang.js';
import { t, formatList, formatAndList } from './text.js';

const byId = (id) => document.getElementById(id);

// (Keys of their text, src/text/en.js.)
const TYPE_LABELS = { meaning: 'anki.typeMeaning', pinyin: 'anki.typePinyin', tone: 'anki.typeTone', writing: 'anki.typeWriting' };
const ROLE_LABELS = { characters: 'anki.roleCharacters', pinyin: 'anki.rolePinyin', meaning: 'anki.roleMeaning' };
const MAX_PROBLEMS_SHOWN = 20;

// What to do about the notes left out for a reason, under them (the owner,
// 2026-10-21: "One word" was the advice for sentences too). A sentence
// without Chinese is an explanation, as Ch_book1's grammar notes are; the
// app has no card for those (a new kind of card, the owner).
//
// reason: the problem's name (ankiImport.js, checkWord in words.js)
function adviceFor(reason) {
  if (reason === 'sentenceNoChinese') {
    return t('ankiReason.adviceExplains');
  }
  return t(reason === 'sentenceNoMeaning' ? 'ankiReason.adviceSentence' : 'ankiReason.adviceWord');
}

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
    byId('anki-note').classList.remove('working');
    byId('anki-note').textContent = text;
  };
  // A turning sign before the note while the file is read or the import
  // worked out, with the button disabled: both hold up the page for a
  // second or more on a big file, and the button seemed not to have worked
  // (the owner, 2026-10-21). The work runs in one go on the page's main
  // thread, the one that also draws the page, so the sign is drawn first:
  // a requestAnimationFrame callback runs just before the browser draws,
  // so the second one comes once the sign is on the screen. The sign turns
  // by a CSS animation of `transform`, which the browser runs apart from
  // that thread, so it keeps turning while the work goes on. The next
  // note() takes it away. A page out of sight draws no frames, so the work
  // goes ahead after a tenth of a second whatever happens.
  async function showWorking(text, button) {
    button.disabled = true;
    const sign = document.createElement('span');
    sign.className = 'working-sign';
    sign.setAttribute('aria-hidden', 'true');
    byId('anki-note').classList.add('working');
    byId('anki-note').replaceChildren(sign, text);
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
      setTimeout(resolve, 100);
    });
  }
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
    const button = byId('anki-file-button');
    await showWorking(t('anki.reading'), button);
    try {
      await readFile(file);
    } catch (error) {
      // Not left turning if something unforeseen goes wrong.
      note(t('anki.couldNotRead', { reason: error.message }));
    } finally {
      button.disabled = false;
    }
  });

  // Reads the chosen file and shows the check step, or says what is wrong.
  async function readFile(file) {
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
      note(t('anki.couldNotRead', { reason: error.message }));
      return;
    }
    if (collection.notes.length === 0) {
      note(t('anki.noNotes'));
      return;
    }
    // The usual readings decide a word's reading where a note has none.
    await dictionaryLoader.loadUsualReadings();
    radicals = await dictionaryLoader.readyEntries('radicals').catch(() => []);
    description = describeCollection(collection, shared.getSettings().script);
    choices = defaultChoices(description);
    renderChoices();
    showStep('check');
    note(dictionaryLoader.get() ? '' : t('anki.noDictionary'));
  }

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
      t('anki.inFile', {
        notes: t('anki.notes', { count: noteCount }),
        decks: t('anki.decks', { count: description.decks.length }),
        reviews: t('anki.reviews', { count: description.reviewCount }),
      }) + (description.reviewCount === 0 ? ` ${t('anki.noHistory')}` : '');

    byId('anki-decks').replaceChildren(
      ...description.decks.map((deck) => {
        const label = checkbox('', true, (checked) => {
          if (checked) {
            choices.deckIds.add(deck.id);
          } else {
            choices.deckIds.delete(deck.id);
          }
          showMoreChoices();
        });
        // A deck's name may have Chinese in it.
        const name = document.createElement('span');
        fillMixed(
          name,
          t('anki.deckRow', { name: deck.name.split('::').join(' › '), cards: t('anki.cards', { count: deck.cardCount }) }),
          shared.getSettings().script,
        );
        label.append(name);
        return label;
      }),
    );

    moreChoices = document.createElement('div');
    byId('anki-note-types').replaceChildren(...description.noteTypes.map(noteTypeChoices), moreChoices);
    showMoreChoices();
  }

  // The boxes after the note types, about sentences and words already
  // there, each shown only if there are some. Their counts follow the
  // decks ticked and the fields chosen, so they are made again at each
  // change; what the learner chose in them is kept in `choices`.
  let moreChoices = null;
  function showMoreChoices() {
    const sentences = sentenceChoice();
    const meanings = meaningsChoice();
    moreChoices.replaceChildren(...(sentences ? [sentences] : []), ...(meanings ? [meanings] : []));
  }

  // What planAnkiImport needs besides the file and the choices.
  function planContext() {
    const settings = shared.getSettings();
    return {
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
    };
  }

  // Words the learner already has keep their meaning, unless they choose
  // the deck's here (the owner, 2026-10-21: off by default; only where the
  // deck has a meaning of its own and it differs). Shown only if there are
  // such words.
  function meaningsChoice() {
    const count = countOtherMeanings(collection, choices, planContext());
    if (count === 0) {
      return null;
    }
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'setting anki-note-type';
    const legend = document.createElement('legend');
    legend.textContent = t('anki.wordsYouHave');
    const label = checkbox(
      t('anki.useDeckMeanings', { count }),
      choices.useDeckMeanings,
      (checked) => {
        choices.useDeckMeanings = checked;
      },
    );
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = t('anki.keepMeaning');
    fieldset.append(legend, label, hint);
    return fieldset;
  }

  // Notes that are a sentence come over as the app's sentences (the owner,
  // 2026-10-21): a reading card, and a writing card for the whole sentence
  // or none, as the learner chooses here. Shown only if the file has some.
  function sentenceChoice() {
    const count = countSentenceNotes(collection, choices);
    if (count === 0) {
      return null;
    }
    const fieldset = document.createElement('fieldset');
    fieldset.className = 'setting anki-note-type';
    const legend = document.createElement('legend');
    legend.textContent = t('anki.sentences', { notes: t('anki.notes', { count }) });
    const about = document.createElement('p');
    about.textContent = t('anki.sentencesAbout');
    const question = document.createElement('p');
    question.textContent = t('anki.theirWritingCard');
    const options = document.createElement('div');
    options.className = 'anki-choices';
    for (const [value, text] of [
      ['whole', t('anki.writeWhole')],
      ['none', t('anki.noWritingCard')],
    ]) {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'anki-sentence-writing';
      input.value = value;
      input.checked = choices.sentenceWriting === value;
      input.addEventListener('change', () => {
        choices.sentenceWriting = value;
      });
      label.append(input, ` ${text}`);
      options.append(label);
    }
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = t('anki.writingLater');
    fieldset.append(legend, about, question, options, hint);
    return fieldset;
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
    fillMixed(legend, t('anki.noteType', { name: noteType.name, notes: t('anki.notes', { count: noteType.noteCount }) }), settings.script);
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
    changeSummary.textContent = t('anki.changeThis');
    change.append(changeSummary);
    fieldset.append(becomes, countsFor, startsNew, change);

    const notesOfType = collection.notes.filter((candidate) => candidate.noteTypeId === noteType.id);
    // What the first note becomes, as the import would make it.
    function showExample() {
      if (choice.roles.characters === null) {
        becomes.textContent = t('anki.noCharactersField');
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
          sentences: isSentenceDeck(notesOfType, choice.roles.characters),
        },
      );
      if (result.problem) {
        fillMixed(becomes, t('anki.firstLeftOut', { problem: result.problem }), settings.script);
        return false;
      }
      if (result.sentence) {
        becomes.textContent = t('anki.becomesSentence');
        const example = document.createElement('strong');
        fillMixed(example, `${result.sentence[settings.script]} · ${result.sentence.definition}`, settings.script);
        becomes.append(example);
        return true;
      }
      const { word } = result;
      // A radical has no reading of its own.
      const reading = isRadical(word) ? t('anki.radical') : formatPinyin(word.pinyin);
      becomes.textContent = t('anki.becomesWord');
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
      // Sentences: their reading card is the one a meaning template counts
      // for; writing is asked under "Sentences" below.
      if (isSentenceDeck(notesOfType, choice.roles.characters)) {
        const counted = noteType.templates.some(
          (template) => template.cardCount > 0 && choice.templates[template.ord].includes('meaning'),
        );
        countsFor.textContent = counted
          ? t('anki.countsForReading')
          : t('anki.sentencesStartNew');
        startsNew.hidden = true;
        return;
      }
      const counted = CARD_TYPES.filter((type) =>
        noteType.templates.some((template) => template.cardCount > 0 && choice.templates[template.ord].includes(type)),
      );
      const names = (types) => formatAndList(types.map((type) => t(TYPE_LABELS[type])));
      countsFor.textContent =
        counted.length > 0 ? t('anki.countsFor', { types: names(counted) }) : t('anki.allStartNew');
      const fresh = CARD_TYPES.filter((type) => !counted.includes(type));
      startsNew.textContent =
        fresh.length > 0 && counted.length > 0 ? t('anki.startNew', { count: fresh.length, types: names(fresh) }) : '';
      startsNew.hidden = startsNew.hidden || startsNew.textContent === '';
    }

    // Each part of "Change this" says what it asks, in words for someone who
    // never made an Anki deck (the owner, 2026-10-21: "I still don't
    // understand what the checkboxes and dropdowns mean").
    change.append(
      foldPart(t('anki.whereParts'), t('anki.wherePartsHint')),
    );
    for (const role of ['characters', 'pinyin', 'meaning']) {
      const label = document.createElement('label');
      label.className = 'setting anki-role';
      const select = document.createElement('select');
      const none = new Option(t('anki.none'), '');
      select.append(
        none,
        ...noteType.fields.map((name, index) => {
          const example = noteType.example[index].replace(/\n/g, ' ');
          const shown = example.length > 16 ? `${example.slice(0, 15)}…` : example;
          return new Option(shown ? t('anki.fieldExample', { name, example: shown }) : name, String(index));
        }),
      );
      select.value = choice.roles[role] === null ? '' : String(choice.roles[role]);
      select.addEventListener('change', () => {
        choice.roles[role] = select.value === '' ? null : Number(select.value);
        showExample();
        showMoreChoices();
      });
      label.append(t(ROLE_LABELS[role]), select);
      change.append(label);
    }

    change.append(
      foldPart(t('anki.whatPracticed'), t('anki.whatPracticedHint')),
    );
    // Rows only for the templates the guesses use; the others (Ch_book1's
    // grammar notes have 13: Explanation, Structure, Correction 1 to 4…) are
    // named on one line, with a link that shows their rows (the owner,
    // 2026-10-21: 23 rows of four checkboxes were too many). Split by the
    // guesses, not the ticks, so that a row doesn't vanish when its last box
    // is unticked. If no template is guessed, every row is shown.
    const withCards = noteType.templates.filter((candidate) => candidate.cardCount > 0);
    const used = withCards.filter((template) => template.types.length > 0);
    const unused = used.length > 0 ? withCards.filter((template) => template.types.length === 0) : [];
    const hiddenRows = [];
    for (const template of withCards) {
      const row = document.createElement('div');
      row.className = 'anki-template';
      const name = document.createElement('p');
      fillMixed(
        name,
        template.front.length > 0
          ? t('anki.templateFront', {
              name: template.name,
              cards: t('anki.cards', { count: template.cardCount }),
              front: formatList(template.front),
            })
          : t('anki.template', { name: template.name, cards: t('anki.cards', { count: template.cardCount }) }),
        settings.script,
      );
      const boxes = document.createElement('div');
      boxes.className = 'anki-choices anki-types';
      for (const type of CARD_TYPES) {
        boxes.append(
          checkbox(t(TYPE_LABELS[type]), choice.templates[template.ord].includes(type), (checked) => {
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
        hint.textContent = t('anki.noHandwriting');
        row.append(hint);
      }
      if (unused.includes(template)) {
        row.hidden = true;
        hiddenRows.push(row);
      } else {
        change.append(row);
      }
    }
    if (unused.length > 0) {
      const line = document.createElement('p');
      line.className = 'anki-unused';
      fillMixed(line, `${t('anki.notBroughtOver', { names: formatList(unused.map((template) => template.name)) })} `, settings.script);
      const show = document.createElement('button');
      show.type = 'button';
      show.className = 'link-button';
      show.textContent = t('anki.showCheckboxes', { count: unused.length });
      show.addEventListener('click', () => {
        for (const row of hiddenRows) {
          row.hidden = false;
        }
        line.remove();
        // The link is gone: focus goes on to what it showed.
        hiddenRows[0].querySelector('input').focus();
      });
      line.append(show);
      // The hidden rows after the line, so that they open where it was.
      change.append(line, ...hiddenRows);
    }

    // Opened at once where the first note would be left out, so the lists
    // to fix it are in sight.
    change.open = !showExample();
    showCountsFor();
    return fieldset;
  }

  byId('anki-import-now').addEventListener('click', async () => {
    const button = byId('anki-import-now');
    await showWorking(t('anki.importing'), button);
    try {
      const plan = planAnkiImport(collection, choices, planContext());
      await saveImport(plan);
      await shared.afterChange();
      showResult(plan);
      note('');
    } catch (error) {
      note(t('anki.failed', { reason: error.message }));
    } finally {
      button.disabled = false;
    }
  });

  // "Brought over 12 new words and 3 radicals.", or as many as there are.
  function broughtOver({ newWords, newRadicals, newSentences, wordsThere }) {
    const brought = [
      newWords > 0 || (newRadicals === 0 && newSentences === 0 && wordsThere === 0)
        ? t('anki.newWords', { count: newWords })
        : '',
      newRadicals > 0 ? t('anki.radicals', { count: newRadicals }) : '',
      newSentences > 0 ? t('anki.sentenceCount', { count: newSentences }) : '',
    ].filter(Boolean);
    return brought.length > 0 ? t('anki.broughtOver', { things: formatAndList(brought) }) : t('anki.noNewWords');
  }

  // What was brought over, a line for each thing, then the notes left out
  // with why and what to do about them (the owner, 2026-10-21: one long
  // paragraph was cramped, and what became of the notes left out unclear).
  function showResult({ report }) {
    const { waiting } = report;
    const lines = [
      broughtOver(report),
      report.wordsThere > 0 ? t('anki.wordsThere', { count: report.wordsThere }) : '',
      report.otherMeanings > 0 && choices.useDeckMeanings ? t('anki.otherMeanings', { count: report.otherMeanings }) : '',
      report.cardsWithSchedule > 0
        ? t('anki.withSchedule', {
            count: report.cardsWithSchedule,
            reviews: t('anki.reviews', { count: report.reviewsCopied }),
          })
        : '',
      waiting > 0 ? t('anki.waiting', { count: waiting }) : '',
      report.alreadyStudied > 0 ? t('anki.alreadyStudied', { count: report.alreadyStudied }) : '',
      report.sameWord > 0 ? t('anki.sameWord', { count: report.sameWord }) : '',
    ];
    byId('anki-result').replaceChildren(
      ...lines.filter(Boolean).map((line) => Object.assign(document.createElement('p'), { textContent: line })),
    );

    const leftOut = report.problems.length;
    byId('anki-left-out').hidden = leftOut === 0;
    byId('anki-left-out-title').textContent = t('anki.leftOut', { count: leftOut });
    // Grouped by why, each reason once with its notes under it: seven
    // notes left out for the same reason were seven long lines.
    const byReason = new Map();
    const reasonOf = new Map();
    for (const { text, problem, reason } of report.problems) {
      byReason.set(problem, [...(byReason.get(problem) || []), text.slice(0, 30)]);
      reasonOf.set(problem, reason);
    }
    const items = [...byReason].map(([problem, texts]) => {
      const item = document.createElement('li');
      const notes = document.createElement('p');
      notes.className = 'anki-problem-notes';
      const shown = formatList(texts.slice(0, MAX_PROBLEMS_SHOWN));
      fillMixed(
        notes,
        texts.length > MAX_PROBLEMS_SHOWN ? t('anki.andMore', { shown, count: texts.length - MAX_PROBLEMS_SHOWN }) : shown,
        shared.getSettings().script,
      );
      const advice = document.createElement('p');
      advice.className = 'hint';
      advice.textContent = adviceFor(reasonOf.get(problem));
      item.append(problem, notes, advice);
      return item;
    });
    byId('anki-problems').replaceChildren(...items);
    showStep('done');
  }
}
