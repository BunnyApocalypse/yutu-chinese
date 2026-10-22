// A word's pop-up panel: changing it (its characters, readings, meaning,
// decks), moving it to the front of the line ("Learn this word next"), removing it; and
// on a word's page, how its cards stand and the boxes for suspending them.
// Moved here from wordsPanel.js on 2026-10-17, when it was split by screen;
// the two share the word that is open.
//
// The panel rebuilds the word from its form, so what is not in the form is
// carried over by hand (see the submit handler): decks, formerIds, learnedAt,
// learnDuration, suspended, startedOverAt, importedAt (CLAUDE.md).

import { putAll, removeWord, renameWord } from './db.js';
import { formatPinyin, wordId } from './wordList.js';
import { allCardIds } from './session.js';
import { fileCardsByScript } from './scriptCards.js';
import { deckTree, readyMadeDeck } from './decks.js';
import { ask } from './confirm.js';
import { isSentence, sentenceId, clozeInBoth } from './sentences.js';
import { isRadical } from './radicals.js';
import { checkWord, orderForStudyingNext, scriptFor, withFormerId } from './words.js';
import { t, formatList } from './text.js';

const byId = (id) => document.getElementById(id);

// shared: what the Decks and Words tabs keep (wordsPanel.js):
//   words(), decks(): the records as last read
//   isLearned(wordId)
//   getSettings()
//   asksFor(): which scripts and readings are asked for
//   charactersOf(word): its characters in the scripts being learned
//   afterChange(): reads everything afresh and shows it (a promise)
//   cardsPanel(): the card manager (cardsPanel.js)
//   applySettings(): fits the forms, this panel's included, to the settings
//
// Returns { open(word), edit(word), wordChanged(word), showCardsOnPage(word),
// applySettings(asks, both), placeReadingBoxes(taiwanFirst, pinyinLabel) }.
export function createWordDialog(shared) {
  const editDecks = byId('edit-decks');
  const dialog = byId('word-dialog');
  const dialogTitle = byId('word-dialog-title');
  const dialogStatus = byId('word-dialog-status');
  const editDefinition = byId('edit-definition');
  const editTraditional = byId('edit-traditional');
  const editSimplified = byId('edit-simplified');
  const editSimplifiedCaption = byId('edit-simplified-caption');
  const editPinyin = byId('edit-pinyin');
  const editPinyinTaiwan = byId('edit-pinyin-taiwan');
  const editPinyinAlso = byId('edit-pinyin-also');
  const editCardScript = byId('edit-card-script');
  const editCloze = byId('edit-cloze');
  const dialogNote = byId('word-dialog-note');
  const studyNextButton = byId('study-next-button');

  // The word open in the dialog.
  let openWord = null;
  // What became of it, for edit(): see there.
  let dialogResult = null;

  // ---- One word: change, study next, remove ----

  // Says at the top of the pop-up panel whether the word has been learned.
  function showDialogStatus(word) {
    dialogStatus.textContent = shared.isLearned(word.id)
      ? t('edit.learned')
      : t('edit.waiting');
  }

  // Fills in the cards part of a word's page: how its cards stand, with
  // Start over and Suspend or Resume on each (cardsPanel.js).
  function showCardsOnPage(word) {
    byId('edit-cards-row').open = false;
    return shared.cardsPanel().showCardsOf(word);
  }

  function openDialog(word) {
    // A sentence has no Taiwan reading, no readings for tone cards and no
    // script of its own; it has a word to fill in instead.
    shared.applySettings();
    const sentence = isSentence(word);
    if (sentence) {
      for (const box of [editPinyinTaiwan, editPinyinAlso, editCardScript]) {
        box.closest('label').hidden = true;
      }
    } else {
      editPinyinAlso.closest('label').hidden = false;
    }
    // A radical from the ready-made deck has only its meaning and decks to
    // change: its forms are its ID, and it has no reading (radicals.js).
    // applySettings shows the other boxes again for the next word, all but
    // the pinyin, which is shown again here.
    editPinyin.closest('label').hidden = false;
    if (isRadical(word)) {
      for (const box of [editTraditional, editSimplified, editPinyin, editPinyinTaiwan, editPinyinAlso, editCardScript]) {
        box.closest('label').hidden = true;
      }
    }
    editCloze.closest('label').hidden = !sentence;
    // The word to fill in is shown in the script the sentence is studied in.
    editCloze.value = sentence && word.cloze ? word.cloze[scriptFor(word, shared.getSettings())] : '';
    openWord = word;
    dialogResult = { changed: false, word };
    const studied = shared.isLearned(word.id);
    dialogTitle.textContent = `${word[scriptFor(word, shared.getSettings())]} ${formatPinyin(word.pinyin)}`;
    showDialogStatus(word);
    editDefinition.value = word.definition;
    editTraditional.value = word.traditional;
    editSimplified.value = word.simplified;
    editPinyin.value = word.pinyin;
    editPinyinTaiwan.value = word.pinyinTaiwan || '';
    editPinyinAlso.value = word.pinyinAlso || '';
    editCardScript.value = word.cardScript || '';
    // One checkbox per deck of the learner's own, in the fold-out "Decks".
    // The ready-made decks are not changed here (the owner, 2026-10-18: a
    // level is as the list has it): the word's are named under the boxes,
    // and kept as they are when it is saved (decksAfter).
    const tree = deckTree(shared.decks());
    const own = tree.filter(({ deck }) => !readyMadeDeck(deck.id));
    tickable = new Set(own.map(({ deck }) => deck.id));
    const boxes = own.map(({ deck, label: name }) => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.value = deck.id;
      box.checked = (word.decks || []).includes(deck.id);
      box.addEventListener('change', showDeckCount);
      const label = document.createElement('label');
      label.append(box, ` ${name}`);
      return label;
    });
    const readyMadeNames = tree
      .filter(({ deck }) => !tickable.has(deck.id) && (word.decks || []).includes(deck.id))
      .map(({ label: name }) => name);
    const readyMadeLine = document.createElement('p');
    readyMadeLine.className = 'hint';
    readyMadeLine.textContent = t('edit.alsoReadyMade', { count: readyMadeNames.length, decks: formatList(readyMadeNames) });
    readyMadeLine.hidden = readyMadeNames.length === 0;
    // The first child is the fieldset's caption, which stays.
    editDecks.replaceChildren(editDecks.firstElementChild, ...boxes, readyMadeLine);
    byId('edit-decks-row').hidden = false;
    byId('edit-decks-row').open = false;
    showDeckCount();
    dialogNote.textContent = '';
    // Only a word still waiting can be moved to the front of the line.
    studyNextButton.hidden = studied;
    // showModal() opens a <dialog> on top of the page and dims the rest.
    dialog.showModal();
  }

  // The IDs of the decks with a box in the word's panel: the learner's own.
  let tickable = new Set();

  // The decks ticked in the word's panel.
  const tickedDecks = () => [...editDecks.querySelectorAll('input:checked')].map((box) => box.value);

  // The decks the word is in once saved: those ticked, and those it is in
  // that have no box (the ready-made ones, and any not stored, which should
  // not happen). The IDs it had before are kept.
  const decksAfter = () => [...(openWord.decks || []).filter((id) => !tickable.has(id)), ...tickedDecks()];

  // Says on the fold-out how many decks the word is in, so it need not be
  // opened to see.
  function showDeckCount() {
    const count = decksAfter().length;
    byId('edit-decks-summary').textContent = count === 0 ? t('edit.decksNone') : t('edit.decksIn', { count });
  }

  byId('word-dialog-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    // The traditional form and the pinyin make up the word's ID, which its
    // cards and review history are filed under; when either is corrected,
    // those are filed under the new ID (renameWord).
    // What is not asked for (see applySettings) stays as it was stored.
    if (isSentence(openWord)) {
      // A sentence is saved by rules of its own: its pinyin is kept as
      // typed, and it has a word to fill in.
      const asksSentence = shared.asksFor();
      // A script that is not asked for cannot be typed. If the sentence in
      // the other one was changed, it is the best there is for both.
      const typed = (box, asked, stored, otherBox, otherStored) =>
        asked ? box.value.trim() : otherBox.value.trim() === otherStored ? stored : otherBox.value.trim();
      const traditional = typed(editTraditional, asksSentence.traditional, openWord.traditional, editSimplified, openWord.simplified);
      const simplified = typed(editSimplified, asksSentence.simplified, openWord.simplified, editTraditional, openWord.traditional);
      const definition = editDefinition.value.trim();
      if (traditional === '' || simplified === '' || definition === '') {
        dialogNote.textContent = t('sentence.needsCharactersAndMeaning');
        return;
      }
      const script = scriptFor(openWord, shared.getSettings());
      const [own, other] = script === 'traditional' ? [traditional, simplified] : [simplified, traditional];
      const clozeTyped = editCloze.value.trim();
      const cloze = clozeInBoth(own, other, clozeTyped);
      if (clozeTyped !== '' && !cloze) {
        dialogNote.textContent = t('sentence.notInSentence', { cloze: clozeTyped });
        return;
      }
      if (decksAfter().length === 0) {
        byId('edit-decks-row').open = true;
        dialogNote.textContent = t('sentence.needsDeck');
        return;
      }
      const { changedAt, suspended: wasSuspended, cloze: oldCloze, ...kept } = openWord;
      const sentence = {
        ...kept,
        id: sentenceId(traditional),
        traditional,
        simplified,
        pinyin: editPinyin.value.trim(),
        definition,
        decks: decksAfter(),
      };
      if (cloze) {
        sentence.cloze =
          script === 'traditional'
            ? { traditional: cloze.own, simplified: cloze.other }
            : { traditional: cloze.other, simplified: cloze.own };
      }
      // Which cards are suspended is changed on the word's page, not here.
      if (wasSuspended) {
        sentence.suspended = wasSuspended;
      }
      if (sentence.id === openWord.id) {
        await putAll('words', [sentence]);
      } else if (shared.words().some((word) => word.id === sentence.id)) {
        dialogNote.textContent = t('sentence.alreadyInWords');
        return;
      } else {
        // Its characters changed, and its ID with them: its cards and
        // reviews are filed under the new one, as for a corrected word.
        await renameWord(openWord.id, withFormerId(sentence, openWord));
      }
      await fileCardsByScript([sentence]);
      await shared.afterChange();
      dialogResult = { changed: true, word: sentence };
      dialog.close();
      return;
    }
    if (isRadical(openWord)) {
      const definition = editDefinition.value.trim();
      if (definition === '') {
        dialogNote.textContent = t('edit.radicalNeedsMeaning');
        return;
      }
      if (decksAfter().length === 0) {
        byId('edit-decks-row').open = true;
        dialogNote.textContent = t('edit.radicalNeedsDeck');
        return;
      }
      const { changedAt, ...kept } = openWord;
      const radical = {
        ...kept,
        definition,
        decks: decksAfter(),
      };
      await putAll('words', [radical]);
      await shared.afterChange();
      dialogResult = { changed: true, word: radical };
      dialog.close();
      return;
    }
    const asks = shared.asksFor();
    const checked = checkWord({
      traditional: asks.traditional ? editTraditional.value : openWord.traditional,
      pinyin: editPinyin.value,
      simplified: asks.simplified ? editSimplified.value : openWord.simplified,
      definition: editDefinition.value,
      pinyinTaiwan: asks.taiwan ? editPinyinTaiwan.value : openWord.pinyinTaiwan,
      pinyinAlso: editPinyinAlso.value,
      cardScript: asks.traditional && asks.simplified ? editCardScript.value : openWord.cardScript,
    });
    if (checked.problem) {
      dialogNote.textContent = checked.problem;
      return;
    }
    // Start from the tidied word, so a Taiwan reading that was cleared is gone.
    const saved = {
      ...checked.word,
      id: wordId(checked.word),
      order: openWord.order,
      addedAt: openWord.addedAt,
    };
    if (decksAfter().length === 0) {
      byId('edit-decks-row').open = true;
      dialogNote.textContent = t('edit.wordNeedsDeck');
      return;
    }
    saved.decks = decksAfter();
    if (openWord.formerIds) {
      saved.formerIds = openWord.formerIds;
    }
    if (openWord.learnedAt !== undefined) {
      saved.learnedAt = openWord.learnedAt;
    }
    if (openWord.learnDuration !== undefined) {
      saved.learnDuration = openWord.learnDuration;
    }
    if (openWord.startedOverAt) {
      saved.startedOverAt = openWord.startedOverAt;
    }
    if (openWord.importedAt !== undefined) {
      saved.importedAt = openWord.importedAt;
    }
    // Which cards are suspended is changed on the word's page, not here.
    if (openWord.suspended) {
      saved.suspended = openWord.suspended;
    }
    if (saved.id === openWord.id) {
      await putAll('words', [saved]);
    } else if (shared.words().some((word) => word.id === saved.id)) {
      dialogNote.textContent = t('edit.alreadyInWords', {
        characters: shared.charactersOf(saved),
        pinyin: formatPinyin(saved.pinyin),
      });
      return;
    } else {
      await renameWord(openWord.id, withFormerId(saved, openWord));
    }
    // If the two scripts now differ where they were the same, a writing card
    // learned in simplified goes under the simplified form (scriptCards.js).
    await fileCardsByScript([saved]);
    // The panel closes once the rest of the app has the changed word too.
    await shared.afterChange();
    dialogResult = { changed: true, word: saved };
    dialog.close();
  });

  studyNextButton.addEventListener('click', async () => {
    const moved = { ...openWord, order: orderForStudyingNext(shared.words()) };
    await putAll('words', [moved]);
    await shared.afterChange();
    dialogResult = { changed: true, word: moved };
    dialog.close();
  });

  // Asks, then removes the word with its cards (not its reviews). Returns
  // true if it was removed. Here, and on a word's page (wordPage.js).
  async function removeAsked(word) {
    const confirmed = await ask({
      question: t('edit.removeQuestion', { characters: shared.charactersOf(word) }),
      detail: t('edit.removeDetail'),
      yes: t('edit.remove'),
    });
    if (!confirmed) {
      return false;
    }
    await removeWord(word.id, allCardIds(word));
    await shared.afterChange();
    return true;
  }

  byId('remove-word-button').addEventListener('click', async () => {
    if (!(await removeAsked(openWord))) {
      return;
    }
    dialogResult = { changed: true, word: null };
    dialog.close();
  });

  byId('word-dialog-close').addEventListener('click', () => dialog.close());

  return {
    open: openDialog,
    remove: removeAsked,

    // Opens the panel and returns a promise for what became of the word
    // once it is closed:
    //   changed: true if anything was saved
    //   word:    the word record as it is now; null if it was removed
    edit(word) {
      openDialog(word);
      // A <dialog> announces "close" however it was closed, the Esc key included.
      return new Promise((resolve) => {
        dialog.addEventListener('close', () => resolve(dialogResult), { once: true });
      });
    },

    // The word open in the panel was changed from the card manager's
    // fold-out: the panel goes on with the new record, and reports a change
    // when closed.
    wordChanged(word) {
      openWord = word;
      dialogResult = { changed: true, word };
      studyNextButton.hidden = shared.isLearned(word.id);
      showDialogStatus(word);
    },

    showCardsOnPage,

    // Fits the panel's boxes to the settings (see applySettings in
    // wordsPanel.js): `asks` from asksFor(), `both` while both scripts are
    // learned.
    applySettings(asks, both) {
      editSimplifiedCaption.textContent = t(both ? 'edit.simplified' : 'edit.characters');
      // Each box sits in a <label>, which holds its caption.
      editTraditional.closest('label').hidden = !asks.traditional;
      editSimplified.closest('label').hidden = !asks.simplified;
      editPinyinTaiwan.closest('label').hidden = !asks.taiwan;
      // A word can only have a script of its own while both are being learned.
      editCardScript.closest('label').hidden = !both;
    },

    // The boxes for the readings: named by region, Taiwan's first where its
    // pronunciation is chosen (see showReadingBoxes in wordsPanel.js).
    placeReadingBoxes(taiwanFirst, pinyinLabel) {
      byId('edit-pinyin-caption').textContent = pinyinLabel;
      if (taiwanFirst) {
        editPinyin.closest('label').before(editPinyinTaiwan.closest('label'));
      } else {
        editPinyin.closest('label').after(editPinyinTaiwan.closest('label'));
      }
    },
  };
}
