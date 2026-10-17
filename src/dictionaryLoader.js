// The dictionary and the ready-made lists, each fetched once and kept (moved
// here from wordsPanel.js on 2026-10-17, when it was split by screen). The
// add form, a word's page, the Words tab's search and the ready-made decks
// all use them. No page code here: who wants to know when the dictionary or
// the usual readings have arrived passes onReady.

import { readDictionary, lookUp, otherScriptForm } from './dictionary.js';
import { parseReadyList } from './words.js';
// "?url" makes Vite hand us the file's address instead of its contents, so
// the dictionary stays a separate file that is only fetched when needed.
import dictionaryUrl from '../data/cedict/dictionary.tsv?url';
// The ready-made lists are separate files in the same way (data/wordlists/).
import hsk3Url from '../data/wordlists/hsk/hsk-3.0.tsv?url';
import hsk2Url from '../data/wordlists/hsk/hsk-2.0.tsv?url';
import tocflUrl from '../data/wordlists/tocfl/tocfl.tsv?url';
import radicalsUrl from '../data/wordlists/radicals/radicals.tsv?url';

// Where each ready-made list is fetched from, by the `data-list` of its row
// in the Ready-made decks section (index.html).
const READY_LIST_URLS = { 'hsk-3.0': hsk3Url, 'hsk-2.0': hsk2Url, tocfl: tocflUrl, radicals: radicalsUrl };

// onReady(): called when the dictionary has arrived, and again when the
// usual readings have (the add form's suggestions are shown afresh then).
export function createDictionaryLoader(onReady) {
  // The dictionary once it has been fetched (see dictionary.js), and the
  // fetch itself, so it is only made once.
  let dictionary = null;
  let dictionaryLoading = null;

  // The lists fetched so far: list ID → its entries (see parseReadyList).
  const readyLists = new Map();

  async function readyEntries(listId) {
    if (!readyLists.has(listId)) {
      const response = await fetch(READY_LIST_URLS[listId]);
      readyLists.set(listId, parseReadyList(await response.text()));
    }
    return readyLists.get(listId);
  }

  // The reading a word usually has, where the dictionary has several: the
  // first one the HSK 3.0 list gives it (the list goes from the lowest level
  // up, so that is the reading learned first: 行 xíng, not háng), else the
  // TOCFL list's. By either form; filled in once both lists are fetched,
  // which happens with the dictionary. (The dictionary itself lists a
  // word's readings alphabetically, which says nothing of which is usual.)
  const usualReading = new Map();
  // The words of both lists, HSK 3.0's first: what lists words looked up by
  // pinyin the likeliest first (lookUpByPinyin). Replaced, never changed,
  // since lookUpByPinyin keeps what it works out from it.
  let readyListWords = [];
  let usualReadingsLoading = null;
  function loadUsualReadings() {
    usualReadingsLoading =
      usualReadingsLoading ||
      Promise.all(['hsk-3.0', 'tocfl'].map((listId) => readyEntries(listId).catch(() => [])))
        .then((lists) => {
          for (const entry of lists.flat()) {
            for (const form of [entry.simplified, entry.traditional]) {
              if (!usualReading.has(form)) {
                usualReading.set(form, entry.pinyin);
              }
            }
          }
          readyListWords = lists.flat();
          onReady();
        });
    return usualReadingsLoading;
  }

  // Returns a promise that is done once the dictionary is there, or could
  // not be fetched.
  function load() {
    if (!dictionaryLoading) {
      dictionaryLoading = fetch(dictionaryUrl)
        .then((response) => response.text())
        .then((text) => {
          dictionary = readDictionary(text);
          onReady();
          loadUsualReadings();
        })
        // Without the dictionary the fields are simply filled in by hand.
        .catch(() => {
          dictionaryLoading = null;
        });
    }
    return dictionaryLoading;
  }

  return {
    load,
    loadUsualReadings,
    readyEntries,
    // The dictionary, or null until it is there (or if it could not be fetched).
    get: () => dictionary,
    readyListWords: () => readyListWords,

    // The entry to fill in by itself: the one with the usual reading, if the
    // lists know it, otherwise the dictionary's first.
    likeliestEntry(entries, typed) {
      const usual = usualReading.get(typed);
      return entries.find((entry) => entry.pinyin === usual) || entries[0] || null;
    },

    // How a word typed in one script is written in both, for someone who is
    // only asked for one (`script` says which): from `tapped`, the dictionary
    // entry that was tapped to fill in the fields (if one was) or, failing
    // that, from the dictionary's entries for those characters. Where the
    // dictionary cannot tell, both are taken to be the same.
    //
    // Returns { traditional, simplified }.
    completeForms(script, characters, pinyin, tapped = null) {
      const other = script === 'traditional' ? 'simplified' : 'traditional';
      const entries = [...(tapped ? [tapped] : []), ...(dictionary ? lookUp(dictionary, characters) : [])];
      return {
        [script]: characters,
        [other]: otherScriptForm(entries, script, characters, pinyin),
      };
    },
  };
}
