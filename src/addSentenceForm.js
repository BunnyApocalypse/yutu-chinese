// Adding a sentence: from its form on a deck's page, and from a word's page
// (its example sentence, wordPage.js). Moved here from wordsPanel.js on
// 2026-10-17, when it was split by screen. See sentences.js for what a
// sentence is.

import { putAll } from './db.js';
import { withDeck } from './decks.js';
import { sentenceId, sentenceRecord, clozeInBoth } from './sentences.js';
import { t } from './text.js';

const byId = (id) => document.getElementById(id);

// shared: what the Decks and Words tabs keep (wordsPanel.js): words(),
// getSettings(), openDeck() (the deck whose page is open), afterChange().
//
// Returns { addSentence(sentence, deckId), applySettings(both) }.
export function createSentenceForm(shared) {
  // Adds a sentence to a deck (see sentenceRecord in sentences.js for what
  // `sentence` holds). One that is there already is put in the deck as well.
  // Returns 'added', 'put in deck' or 'already there'.
  async function addSentence(sentence, deckId) {
    const existing = shared.words().find((word) => word.id === sentenceId(sentence.traditional));
    if (existing) {
      if ((existing.decks || []).includes(deckId)) {
        return 'already there';
      }
      await putAll('words', [withDeck(existing, deckId)]);
      await shared.afterChange();
      return 'put in deck';
    }
    const order = shared.words().reduce((highest, word) => Math.max(highest, word.order), -1) + 1;
    await putAll('words', [sentenceRecord(sentence, order, deckId, Date.now())]);
    await shared.afterChange();
    return 'added';
  }

  // The form on a deck's page. The first box is the sentence in the script
  // that cards are shown in; the second, only there while both scripts are
  // learned, the same sentence in the other one.
  const sentenceFields = {
    characters: byId('sentence-characters'),
    other: byId('sentence-other'),
    pinyin: byId('sentence-pinyin'),
    meaning: byId('sentence-meaning'),
    cloze: byId('sentence-cloze'),
  };
  const sentenceNote = byId('add-sentence-note');
  byId('add-sentence-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const settings = shared.getSettings();
    const own = sentenceFields.characters.value.trim();
    const other = sentenceFields.other.value.trim() || own;
    const meaning = sentenceFields.meaning.value.trim();
    const clozeOwn = sentenceFields.cloze.value.trim();
    if (own === '' || meaning === '') {
      sentenceNote.textContent = t('sentence.needsCharactersAndMeaning');
      return;
    }
    if (clozeOwn !== '' && !own.includes(clozeOwn)) {
      sentenceNote.textContent = t('sentence.notInSentence', { cloze: clozeOwn });
      return;
    }
    const cloze = clozeInBoth(own, other, clozeOwn);
    const inScript = (ownForm, otherForm) =>
      settings.script === 'traditional'
        ? { traditional: ownForm, simplified: otherForm }
        : { traditional: otherForm, simplified: ownForm };
    const result = await addSentence(
      {
        ...inScript(own, other),
        pinyin: sentenceFields.pinyin.value.trim(),
        definition: meaning,
        ...(cloze ? { cloze: inScript(cloze.own, cloze.other) } : {}),
      },
      shared.openDeck().id,
    );
    sentenceNote.textContent =
      result === 'added'
        ? t('sentence.added', { sentence: own })
        : result === 'put in deck'
          ? t('sentence.nowInDeckToo')
          : t('sentence.alreadyInDeck');
    if (result === 'added') {
      for (const field of Object.values(sentenceFields)) {
        field.value = '';
      }
    }
  });

  return {
    addSentence,
    // The box for the other script is only there while both are learned.
    applySettings(both) {
      sentenceFields.other.hidden = !both;
    },
  };
}
