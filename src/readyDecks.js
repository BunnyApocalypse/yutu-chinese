// The Ready-made decks section of the Decks tab: the HSK and TOCFL lists and
// the radicals, each level added as a deck. Moved here from wordsPanel.js on
// 2026-10-17, when it was split by screen. The levels are worked out by
// words.js and the decks by decks.js.

import { getAll, putAll } from './db.js';
import { wordId } from './wordList.js';
import { READY_MADE_LISTS, missingReadyMadeDecks, readyMadeDeck } from './decks.js';
import { radicalRecord } from './radicals.js';
import { checkWord, newWordRecords, levelsOfReadyList, listTag, groupName } from './words.js';
import { lookUp, proposeMeaning } from './dictionary.js';
import { t } from './text.js';

const byId = (id) => document.getElementById(id);

// shared: what the Decks and Words tabs keep (wordsPanel.js): words(),
// getSettings(), afterChange().
// dictionaryLoader: dictionaryLoader.js (the lists, and the meanings).
//
// Returns { show(), addReadyLevels(listId, levels) }.
export function createReadyDecks(shared, dictionaryLoader) {
  // The rows to choose a list with, and the list chosen: the first to begin
  // with.
  const readyRows = [...document.querySelectorAll('#ready-list button')];
  let readyListId = readyRows[0].dataset.list;
  const readyLevels = byId('ready-levels');
  const readyReport = byId('ready-report');

  // Lists the levels of the chosen list, one row each with how many of its
  // words are new and a button that adds it (the owner, 2026-10-14: a level
  // is months of work, so levels are added one at a time). The levels of a
  // list that keeps a deck of its own with its levels inside (the radicals)
  // get a checkbox each instead, and one button under them that adds the
  // ones ticked, since they make one deck.
  async function showReadyLevels() {
    const listId = readyListId;
    for (const row of readyRows) {
      const chosen = row.dataset.list === listId;
      row.classList.toggle('selected', chosen);
      // Says to a screen reader which row is the chosen one.
      row.setAttribute('aria-pressed', chosen);
      if (chosen) {
        byId('ready-levels-title').textContent = t('ready.levelsOf', { list: row.firstElementChild.textContent });
      }
    }
    let entries;
    try {
      entries = await dictionaryLoader.readyEntries(listId);
    } catch {
      readyLevels.replaceChildren();
      readyReport.textContent = t('ready.fetchFailed');
      return;
    }
    if (listId !== readyListId) {
      return; // another list was tapped while this one was being fetched
    }
    const together = !READY_MADE_LISTS.find((list) => list.id === listId).levelName;
    byId('ready-levels-hint').textContent = together
      ? t('ready.together', { deck: readyMadeDeck(listId).name })
      : t('ready.apart');
    const rows = levelsOfReadyList(entries, shared.words()).map(({ level, count, newCount }) => {
      const row = document.createElement('li');
      const text = document.createElement('span');
      // TOCFL has two levels with names of their own before its level 1.
      text.textContent =
        t('ready.levelWords', { level: /^\d/.test(level) ? t('ready.level', { level }) : level, count }) +
        (newCount === count ? '' : newCount === 0 ? t('ready.allHaveAlready') : t('ready.newCount', { count: newCount }));
      if (together) {
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.value = level;
        box.addEventListener('change', () => {
          addTogether.disabled = !readyLevels.querySelector('input:checked');
        });
        const label = document.createElement('label');
        label.append(box, text);
        row.append(label);
        return row;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'small';
      button.textContent = t('ready.add');
      button.dataset.level = level;
      button.addEventListener('click', () => addReadyLevels(listId, [level]));
      row.append(text, button);
      return row;
    });
    // The one button for the levels ticked.
    const addTogether = document.createElement('button');
    addTogether.type = 'button';
    addTogether.className = 'small primary';
    addTogether.id = 'add-ready-button';
    addTogether.textContent = t('ready.add');
    addTogether.disabled = true;
    addTogether.addEventListener('click', () =>
      addReadyLevels(listId, [...readyLevels.querySelectorAll('input:checked')].map((box) => box.value)),
    );
    if (together) {
      const row = document.createElement('li');
      row.append(addTogether);
      rows.push(row);
    }
    readyLevels.replaceChildren(...rows);
  }

  for (const row of readyRows) {
    row.addEventListener('click', () => {
      readyListId = row.dataset.list;
      readyReport.textContent = '';
      showReadyLevels();
    });
  }

  // Adds levels of a list: their new words at the end of the queue, lowest
  // level first, and the words that were there already into their decks as
  // well. Also used by the introduction (welcome.js), through the panel's
  // addReadyLevels. Returns how many words were added.
  async function addReadyLevels(listId, levels) {
    const entries = (await dictionaryLoader.readyEntries(listId)).filter((entry) => levels.includes(entry.level));
    for (const button of readyLevels.querySelectorAll('button')) {
      button.disabled = true;
    }
    readyReport.textContent = t('ready.adding');
    // Meanings come from the dictionary, as for a word typed by hand.
    await dictionaryLoader.load();
    const dictionary = dictionaryLoader.get();
    const { meaningDetail } = shared.getSettings();
    const candidates = [];
    const tags = new Map(); // word ID → the tag for this list and level
    const groupNames = new Map(); // a group's deck ID → its name
    let noMeaning = 0;
    for (const entry of entries) {
      // A line with no reading is a radical of its own, with its meaning in
      // the list (see radicals.js).
      if (entry.pinyin === '') {
        const radical = radicalRecord(entry);
        candidates.push(radical);
        tags.set(radical.id, listTag(listId, entry.level, entry.group));
        continue;
      }
      const inDictionary = dictionary ? lookUp(dictionary, entry.traditional) : [];
      const sameWord = inDictionary.find(
        (found) => found.traditional === entry.traditional && found.pinyin === entry.pinyin,
      );
      const definition = sameWord
        ? proposeMeaning(sameWord.meanings, meaningDetail)
        : entry.meaning || (inDictionary[0] ? proposeMeaning(inDictionary[0].meanings, meaningDetail) : '');
      const checked = checkWord({ ...entry, definition });
      if (!checked.word) {
        noMeaning += 1; // only without the dictionary, for want of a meaning
        continue;
      }
      candidates.push(checked.word);
      const tag = listTag(listId, entry.level, entry.group);
      tags.set(wordId(checked.word), tag);
      if (entry.group !== '') {
        groupNames.set(tag, groupName(entry.group));
      }
    }
    const withTag = (word) => ({ ...word, decks: [...new Set([...(word.decks || []), tags.get(word.id)])] });
    const { toAdd, alreadyHave } = newWordRecords(candidates, shared.words(), Date.now());
    // Words that were there already are put in the level's deck too.
    const marked = shared.words().filter((word) => tags.has(word.id) && !(word.decks || []).includes(tags.get(word.id)));
    const tagged = [...toAdd, ...marked].map(withTag);
    await putAll('words', tagged);
    // The level (and the list, for the radicals) become decks, if they are
    // not there yet.
    await putAll('decks', missingReadyMadeDecks(tagged, await getAll('decks'), groupNames));
    await shared.afterChange();
    await showReadyLevels();
    readyReport.textContent =
      t('ready.added', { count: toAdd.length }) +
      (alreadyHave > 0 ? t('ready.alreadyHad', { count: alreadyHave }) : '') +
      (noMeaning > 0 ? t('ready.noMeaning', { count: noMeaning }) : '') +
      t('ready.whereAdded', { deck: (readyMadeDeck(listId) || readyMadeDeck(listTag(listId, levels[0]))).name });
    return toAdd.length;
  }

  return {
    // Shows the section afresh, as it is opened.
    show() {
      readyReport.textContent = '';
      showReadyLevels();
    },
    addReadyLevels,
  };
}
