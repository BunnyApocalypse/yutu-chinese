// Review mode: picks the card that is due, shows it, asks for a grade and
// saves the result.
//
// A word can have four kinds of card (see CARD_TYPES in session.js). Each kind
// is shown by its own piece of code:
//   writing          wordFlow.js
//   tone             toneFlow.js
//   meaning, pinyin  recallCard.js
// What they share lives here: choosing the next card, the grade buttons, and
// saving.

import { getAll, saveReview, randomId } from './db.js';
import { gradeOptions, GRADES, AGAIN, GOOD } from './scheduler.js';
import { planSession, suggestGrade, judgeChar, formatInterval, cardIdFor } from './session.js';
import { toneAnswers, readingsFor, describeReading } from './tones.js';
import { scriptFor, scriptFlagFor } from './words.js';

const TYPE_LABELS = {
  writing: 'Writing',
  tone: 'Tone',
  pinyin: 'Pinyin',
  meaning: 'Meaning',
};

// While waiting for the next card to become due, look again this often.
const RECHECK_MS = 15 * 1000;

// elements: the page elements review controls:
//   countsElement, typeElement, meaningElement, pinyinElement, pinyinButton,
//   gradeRow, donePanel, doneMessage, studyArea, scriptFlag,
//   and the parts of the study area that differ per kind of card:
//   wordRow, statusRow, verdictRow, writingRow, writingButtons, cardFace,
//   toneButtonRow, orderNote
// flows:    { writing, tone, recall }: the three pieces of code named above
// settings: the current settings (see settings.js)
//
// Returns { load, activate, deactivate, practice, refresh }.
export function createReview(elements, flows, settings) {
  const {
    countsElement,
    typeElement,
    meaningElement,
    pinyinElement,
    pinyinButton,
    gradeRow,
    donePanel,
    doneMessage,
    studyArea,
    scriptFlag,
    wordRow,
    statusRow,
    verdictRow,
    writingRow,
    writingButtons,
    cardFace,
    toneButtonRow,
    orderNote,
  } = elements;

  let words = [];
  // Card ID → card, for every card that has been studied.
  const cards = new Map();
  // The tone table (see data/cedict/README.md), loaded at startup. Supplies
  // Taiwan readings and tone variants.
  let toneTable = null;
  // Words whose characters turned out to have no stroke data. They can't have
  // a writing card; left out for this session.
  const unwritable = new Set();

  // True while Review is the mode on screen.
  let active = false;
  // True while a card is being shown for Free practice: it is not scheduled,
  // gets no grade buttons, and nothing is saved.
  let practicing = false;
  let recheckTimer = null;

  // The card on screen: { word, type, card }, with card null if never studied.
  let current = null;
  // Set once the card has been answered: the time, what each grade would do,
  // which grade is suggested, and details of the answer to save.
  let finishedAt = null;
  let options = null;
  let suggested = null;
  let answerDetails = null;

  // Shows the parts of the study area that the given kind of card uses, and
  // hides the rest.
  function showPartsFor(type) {
    const writing = type === 'writing';
    const tone = type === 'tone';
    writingRow.hidden = !writing;
    writingButtons.hidden = !writing;
    cardFace.hidden = writing;
    toneButtonRow.hidden = !tone;
    wordRow.hidden = !(writing || tone);
    statusRow.hidden = !(writing || tone);
    // These two belong to the writing card and may be left over from the last one.
    verdictRow.hidden = true;
    orderNote.hidden = true;
  }

  // Above the card: a note if this word is in another script than the rest
  // of the deck. Pass null to take it away.
  function showScriptFlag(word) {
    scriptFlag.textContent = word ? scriptFlagFor(word, settings) : '';
    scriptFlag.hidden = scriptFlag.textContent === '';
  }

  function stopFlows() {
    flows.tone.stop();
    flows.recall.stop();
  }

  // Which reading of a word to show and expect, going by the pronunciation setting.
  function readingOf(word) {
    return readingsFor(word, settings.pronunciation, toneTable);
  }

  // The tone answers for a word, or null if it can't have a tone card. The
  // tone table is keyed by traditional characters, whatever script is shown.
  function toneAnswersOf(word) {
    const reading = readingOf(word);
    return toneAnswers(
      Array.from(word.traditional),
      reading.primary,
      reading.other,
      toneTable,
      settings.pronunciation !== 'mainlandOnly',
    );
  }

  function showPinyin() {
    const described = describeReading(readingOf(current.word));
    pinyinElement.textContent = described.other
      ? `${described.main} (${described.other})`
      : described.main;
    pinyinElement.hidden = false;
    pinyinButton.hidden = true;
  }

  pinyinButton.addEventListener('click', showPinyin);

  function hideGrades() {
    gradeRow.hidden = true;
    options = null;
  }

  // Saves the review with the chosen grade and moves on.
  async function grade(value) {
    if (practicing) {
      // In Free practice, "continue" just shows the same card again.
      practice(current.word, current.type);
      return;
    }
    if (!options) {
      return; // already graded, e.g. a double tap
    }
    const chosen = options[value];
    options = null;
    const { word, type, card } = current;
    const time = finishedAt.getTime();

    const newCard = {
      // Writing cards are kept per script (see cardIdFor).
      id: cardIdFor(word, type, scriptFor(word, settings)),
      wordId: word.id,
      type,
      due: chosen.due,
      firstReviewedAt: card ? card.firstReviewedAt : time,
      lastReviewedAt: time,
      fsrsState: chosen.fsrsState,
    };
    const review = {
      id: randomId(),
      cardId: newCard.id,
      wordId: word.id,
      type,
      time,
      grade: value,
      suggestedGrade: suggested,
      script: scriptFor(current.word, settings),
      log: chosen.log,
      // What was answered; the fields depend on the kind of card.
      ...answerDetails,
    };
    await saveReview(newCard, review);
    cards.set(newCard.id, newCard);
    showNext();
  }

  // Shows the four grade buttons with the suggested one highlighted.
  function renderGrades() {
    gradeRow.replaceChildren();
    for (const { value, label } of GRADES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = value === suggested ? 'grade primary' : 'grade';
      // Each button says when the card would come back.
      const wait = document.createElement('span');
      wait.className = 'wait';
      wait.textContent = formatInterval(options[value].due - finishedAt.getTime());
      button.append(label, wait);
      button.addEventListener('click', () => grade(value));
      gradeRow.appendChild(button);
    }
    gradeRow.hidden = false;
  }

  // The card has been answered: work out what each grade would do and offer
  // the grade buttons.
  function offerGrades(suggestedGrade, details) {
    if (practicing) {
      return;
    }
    finishedAt = new Date();
    options = gradeOptions(current.card ? current.card.fsrsState : null, finishedAt);
    suggested = suggestedGrade;
    answerDetails = details;
    renderGrades();
  }

  // ---- The four kinds of card ----

  // Returns false if the word can't be written (no stroke data).
  async function showWritingCard() {
    const { word } = current;
    meaningElement.textContent = word.definition;
    pinyinButton.hidden = false;

    // What to save about a written word.
    const details = (result) => ({
      mistakesPerChar: result.mistakesPerChar,
      // The verdict on each character (true = passed), and what the app had
      // proposed before any overruling.
      passedPerChar: result.passedPerChar,
      suggestedPerChar: result.suggestedPerChar,
      // For characters with two accepted stroke orders, which one was
      // written: 'moe' or 'mainland'. null for all other characters.
      orderPerChar: result.orderPerChar,
      // True for characters that were skipped with the skip button.
      skippedPerChar: result.skippedPerChar,
    });

    return flows.writing.start(word[scriptFor(word, settings)], {
      script: scriptFor(word, settings),
      rawInput: settings.rawInput,
      continueLabel: null,
      hideOutline: true,
      judgeChar,
      // Starting a character over after the word was finished takes the grade
      // buttons away again until it is finished once more.
      onCharStart: hideGrades,
      onWordDone(result) {
        showPinyin();
        offerGrades(suggestGrade(result), details(result));
      },
      // The last character's verdict was overruled, which can change the suggestion.
      onVerdictChange(result) {
        if (options) {
          suggested = suggestGrade(result);
          answerDetails = details(result);
          renderGrades();
        }
      },
      // Tapping the writing area accepts the suggested grade.
      onContinue: () => grade(suggested),
    });
  }

  function showToneCard() {
    const { word } = current;
    flows.tone.start({
      word,
      script: scriptFor(word, settings),
      reading: readingOf(word),
      answers: toneAnswersOf(word),
      onDone({ givenTones, passedPerChar, variantPerChar }) {
        // One wrong tone fails the card.
        const allRight = passedPerChar.every(Boolean);
        offerGrades(allRight ? GOOD : AGAIN, {
          givenTones,
          passedPerChar,
          // True where a tone was accepted only as a regional or neutral-tone variant.
          variantPerChar,
          pronunciation: settings.pronunciation,
        });
      },
      onContinue: () => grade(suggested),
    });
  }

  // Meaning and pinyin cards: nothing is checked, so "Good" is highlighted
  // and you choose.
  function showRecallCard(ask) {
    flows.recall.start({
      word: current.word,
      script: scriptFor(current.word, settings),
      reading: readingOf(current.word),
      ask,
      onReveal: () => offerGrades(GOOD, {}),
      onContinue: () => grade(suggested),
    });
  }

  // Shows a tone, pinyin or meaning card for Free practice. Returns false if
  // the word can't have that kind of card. (Writing practice is handled by
  // main.js, since it works for any characters, not only words in the list.)
  function practice(word, type) {
    stopFlows();
    hideGrades();
    if (type === 'tone' && toneAnswersOf(word) === null) {
      return false;
    }
    practicing = true;
    current = { word, type, card: null };
    showScriptFlag(word);
    showPartsFor(type);
    if (type === 'tone') {
      showToneCard();
    } else {
      showRecallCard(type);
    }
    return true;
  }

  // ---- Choosing the next card ----

  function hasCardType(word, type) {
    if (type === 'writing') {
      return !unwritable.has(word.id);
    }
    if (type === 'tone') {
      // The pinyin must have one syllable per character.
      return toneAnswersOf(word) !== null;
    }
    return true;
  }

  function describeWait(nextDueAt, now) {
    if (nextDueAt === null) {
      return 'Nothing is scheduled yet.';
    }
    const minutes = Math.ceil((nextDueAt - now) / 60000);
    if (minutes <= 60) {
      return `Next review in ${minutes <= 1 ? 'about a minute' : `${minutes} minutes`}.`;
    }
    const when = new Date(nextDueAt).toLocaleString([], {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Next review: ${when}.`;
  }

  // Works out what is next and puts it on screen.
  async function showNext() {
    clearTimeout(recheckTimer);
    if (!active) {
      return;
    }
    practicing = false;
    stopFlows();
    const now = Date.now();
    const plan = planSession(words, cards, now, {
      newWordsPerDay: settings.newWordsPerDay,
      enabledTypes: settings.enabledTypes,
      hasCardType,
      scriptOf: (word) => scriptFor(word, settings),
    });
    countsElement.textContent =
      `Due ${plan.dueCount} · New cards ${plan.newCardCount} · New words ${plan.newWordsLeftToday}`;
    hideGrades();
    meaningElement.textContent = '';
    pinyinElement.hidden = true;
    pinyinButton.hidden = true;

    if (!plan.next) {
      current = null;
      studyArea.hidden = true;
      typeElement.textContent = '';
      doneMessage.textContent = `All done for now. ${describeWait(plan.nextDueAt, now)}`;
      donePanel.hidden = false;
      // Cards come back after a few minutes, so keep checking.
      recheckTimer = setTimeout(showNext, RECHECK_MS);
      return;
    }

    current = plan.next;
    donePanel.hidden = true;
    studyArea.hidden = false;
    typeElement.textContent = TYPE_LABELS[current.type];
    showScriptFlag(current.word);
    showPartsFor(current.type);

    if (current.type === 'writing') {
      const started = await showWritingCard();
      if (!started) {
        unwritable.add(current.word.id);
        showNext();
      }
    } else if (current.type === 'tone') {
      showToneCard();
    } else {
      showRecallCard(current.type);
    }
  }

  return {
    // Reads words and cards from the database. Call once at startup.
    async load() {
      words = await getAll('words');
      // import() fetches the table as its own file, so it doesn't make the
      // main program bigger. If it can't be loaded, tones are judged against
      // the word list alone.
      try {
        toneTable = (await import('../data/cedict/tones.json')).default;
      } catch {
        toneTable = null;
      }
      cards.clear();
      for (const card of await getAll('cards')) {
        cards.set(card.id, card);
      }
    },

    activate() {
      active = true;
      return showNext();
    },

    // Leaves the page ready for Free practice, which uses the writing parts.
    deactivate() {
      active = false;
      practicing = false;
      clearTimeout(recheckTimer);
      stopFlows();
      donePanel.hidden = true;
      studyArea.hidden = false;
      showScriptFlag(null);
      showPartsFor('writing');
      hideGrades();
    },

    // Free practice of a tone, pinyin or meaning card. Call deactivate() first.
    practice,

    // Works out the next card afresh, e.g. after a setting changed.
    refresh() {
      return showNext();
    },
  };
}
