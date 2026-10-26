// The pop-up for importing from Skritter (#skritter-dialog in index.html),
// opened by "Import from Skritter" in the new deck's panel. Three steps:
// choosing the .zip Skritter sends, checking the words its file doesn't
// settle, and what was brought over. The import is worked out by
// skritterImport.js; docs/skritter.md has the owner's decisions.

import { saveImport, randomId } from './db.js';
import { readSkritterExport, describeSkritter, planSkritterImport, readyLevels, defaultListNames } from './skritterImport.js';
import { READY_MADE_LISTS } from './decks.js';
import { showReading } from './readingStyle.js';
import { fillMixed, langFor } from './lang.js';
import { t, formatList } from './text.js';

const byId = (id) => document.getElementById(id);

// A word's first few senses, enough to tell it from the others to check:
// the whole meaning of 子 was ten lines on a phone.
const SENSES_SHOWN = 3;
function shortMeaning(definition) {
  const senses = definition.split('; ');
  return senses.length > SENSES_SHOWN ? `${senses.slice(0, SENSES_SHOWN).join('; ')}; …` : definition;
}

// shared: words(), decks(), cards(), getSettings(), afterChange(), as the
//         Decks tab keeps them (wordsPanel.js)
// dictionaryLoader: dictionaryLoader.js
export function createSkritterImport(shared, dictionaryLoader) {
  const dialog = byId('skritter-dialog');
  const fileInput = byId('skritter-file');
  const noteElement = byId('skritter-note');
  const note = (text) => {
    noteElement.classList.remove('working');
    noteElement.textContent = text;
  };
  // A turning sign while the file is read or the import saved, as the Anki
  // import has it (showWorking in ankiImportForm.js, which explains the two
  // frames waited for).
  async function showWorking(text, button) {
    button.disabled = true;
    const sign = document.createElement('span');
    sign.className = 'working-sign';
    sign.setAttribute('aria-hidden', 'true');
    noteElement.classList.add('working');
    noteElement.replaceChildren(sign, text);
    await new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
      setTimeout(resolve, 100);
    });
  }
  // The file read, what it holds, and the learner's choices: the words
  // unticked, as "<Skritter's characters>><word ID>", and the names given
  // to Skritter's lists.
  let data = null;
  let description = null;
  const leftOut = new Set();
  let listNames = new Map();

  // The ready-made lists' levels, to suggest names for Skritter's lists
  // from (readyLevels in skritterImport.js). A list that can't be fetched
  // suggests nothing.
  async function loadReadyLevels() {
    const lists = READY_MADE_LISTS.filter((list) => list.levelName);
    const entries = await Promise.all(lists.map((list) => dictionaryLoader.readyEntries(list.id).catch(() => [])));
    return readyLevels(lists.map((list, index) => ({ list, entries: entries[index] })));
  }

  function showStep(step) {
    for (const name of ['choose', 'check', 'done']) {
      byId(`skritter-${name}-step`).hidden = name !== step;
    }
  }

  byId('skritter-import-button').addEventListener('click', () => {
    data = null;
    showStep('choose');
    note('');
    dialog.showModal();
  });
  byId('skritter-cancel-button').addEventListener('click', () => dialog.close());
  byId('skritter-done-button').addEventListener('click', () => dialog.close());

  // The real file chooser is a hidden <input type="file">; the button opens it.
  byId('skritter-file-button').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = ''; // so choosing the same file again still counts
    if (!file) {
      return;
    }
    const button = byId('skritter-file-button');
    await showWorking(t('anki.reading'), button);
    try {
      const [read, levels] = await Promise.all([
        readSkritterExport(new Uint8Array(await file.arrayBuffer())),
        loadReadyLevels(),
        dictionaryLoader.load(),
      ]);
      data = read;
      if (!dictionaryLoader.get()) {
        note(t('skritter.noDictionary'));
        return;
      }
      description = describeSkritter(data, {
        dictionary: dictionaryLoader.get(),
        meaningDetail: shared.getSettings().meaningDetail,
        readyLevels: levels,
      });
      leftOut.clear();
      listNames = defaultListNames(description);
      renderCheck();
      showStep('check');
      note('');
    } catch (error) {
      note(t('anki.couldNotRead', { reason: error.message }));
    } finally {
      button.disabled = false;
    }
  });

  // What the file holds, and a checkbox for each word an unsettled
  // Skritter word could be, grouped under its characters. Skritter may have
  // two words with the same characters (发 for 發 and 髮); they share one
  // group, and a box unticked leaves the word out of both.
  function renderCheck() {
    const settings = shared.getSettings();
    const missing = description.words.filter((word) => word.candidates.length === 0).length;
    byId('skritter-summary').textContent = [
      t('skritter.inFile', {
        words: t('skritter.words', { count: description.words.length }),
        cards: t('anki.cards', { count: description.cards }),
        reviews: t('anki.reviews', { count: description.reviews }),
      }),
      missing > 0 ? t('skritter.notInDictionary', { count: missing }) : '',
    ]
      .filter(Boolean)
      .join(' ');

    renderLists();

    const groups = new Map(); // characters → { reviews, candidates by ID }
    for (const word of description.words.filter((candidate) => candidate.candidates.length > 1)) {
      const group = groups.get(word.characters) || { reviews: 0, candidates: new Map() };
      group.reviews += word.reviews;
      for (const candidate of word.candidates) {
        group.candidates.set(candidate.id, candidate);
      }
      groups.set(word.characters, group);
    }
    byId('skritter-check').hidden = groups.size === 0;
    byId('skritter-check-title').textContent = t('skritter.checkTitle', { count: groups.size });
    byId('skritter-choices').replaceChildren(
      ...[...groups].map(([characters, group]) => {
        const box = document.createElement('div');
        box.className = 'skritter-group';
        // Skritter's characters are simplified ones.
        const heading = document.createElement('p');
        heading.className = 'skritter-group-heading';
        fillMixed(heading, t('skritter.groupHeading', { characters, reviews: t('anki.reviews', { count: group.reviews }) }), 'simplified');
        const choices = document.createElement('div');
        choices.className = 'anki-choices';
        for (const candidate of group.candidates.values()) {
          const key = `${characters}>${candidate.id}`;
          const label = document.createElement('label');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.checked = !leftOut.has(key);
          input.addEventListener('change', () => {
            if (input.checked) {
              leftOut.delete(key);
            } else {
              leftOut.add(key);
            }
          });
          // The traditional form tells the words apart (發, 髮), so it is
          // shown whatever the learner's script.
          const text = document.createElement('span');
          const chinese = document.createElement('span');
          chinese.lang = langFor('traditional');
          chinese.textContent = candidate.traditional;
          const rest = document.createElement('span');
          fillMixed(
            rest,
            t('skritter.candidate', { pinyin: showReading(candidate.pinyin), meaning: shortMeaning(candidate.definition) }),
            settings.script,
          );
          text.append(chinese, ' ', rest);
          label.append(input, text);
          choices.append(label);
        }
        box.append(heading, choices);
        return box;
      }),
    );
  }

  // A box for each of Skritter's lists, which the file doesn't name: its
  // size and first words, and its name, filled in where the words are
  // nearly all one ready-made level (the owner, 2026-10-23). A list named
  // becomes a deck inside "Skritter", with a deck for each section.
  function renderLists() {
    const unnamed = description.lists.filter((list) => !list.own);
    byId('skritter-lists').hidden = unnamed.length === 0;
    byId('skritter-list-rows').replaceChildren(
      ...unnamed.map((list) => {
        const label = document.createElement('label');
        label.className = 'skritter-list';
        const about = document.createElement('span');
        // Skritter's characters are simplified ones.
        fillMixed(
          about,
          t('skritter.listAbout', {
            words: t('skritter.words', { count: list.words }),
            sections: t('skritter.sections', { count: list.sections.length }),
            sample: formatList(list.sample),
          }),
          'simplified',
        );
        const input = document.createElement('input');
        input.type = 'text';
        input.autocomplete = 'off';
        input.placeholder = t('skritter.listNamePlaceholder');
        input.value = listNames.get(list.id) || '';
        input.addEventListener('input', () => listNames.set(list.id, input.value));
        label.append(about, input);
        return label;
      }),
    );
  }

  byId('skritter-import-now').addEventListener('click', async () => {
    const button = byId('skritter-import-now');
    await showWorking(t('anki.importing'), button);
    try {
      const plan = planSkritterImport(
        data,
        description,
        { leftOut, listNames },
        {
          words: shared.words(),
          decks: shared.decks(),
          cards: new Map(shared.cards().map((card) => [card.id, card])),
          settings: shared.getSettings(),
          now: Date.now(),
          randomId,
        },
      );
      await saveImport(plan);
      await shared.afterChange();
      showResult(plan.report);
      note('');
    } catch (error) {
      note(t('anki.failed', { reason: error.message }));
    } finally {
      button.disabled = false;
    }
  });

  // What was brought over, a line for each thing, then the words left out.
  function showResult(report) {
    const lines = [
      t('skritter.newWords', { count: report.newWords }),
      report.wordsThere > 0 ? t('skritter.wordsThere', { count: report.wordsThere }) : '',
      report.cardsWithSchedule > 0
        ? t('skritter.withSchedule', {
            count: report.cardsWithSchedule,
            reviews: t('anki.reviews', { count: report.reviewsCopied }),
          })
        : '',
      report.suspended > 0 ? t('skritter.suspended', { count: report.suspended }) : '',
      report.alreadyStudied > 0 ? t('anki.alreadyStudied', { count: report.alreadyStudied }) : '',
    ];
    byId('skritter-result').replaceChildren(
      ...lines.filter(Boolean).map((line) => Object.assign(document.createElement('p'), { textContent: line })),
    );
    byId('skritter-left-out').hidden = report.leftOut.length === 0;
    byId('skritter-left-out-title').textContent = t('skritter.leftOut', { count: report.leftOut.length });
    fillMixed(byId('skritter-left-out-words'), formatList(report.leftOut), 'simplified');
    showStep('done');
  }
}
