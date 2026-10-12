// Review mode: shows the word that is due, lets you write it, asks for a
// grade and saves the result.
//
// Only writing cards exist so far: you are shown the meaning and write the
// characters. Tone, pinyin and meaning cards will be added later.

import { getAll, saveReview, randomId } from './db.js';
import { gradeOptions, GRADES } from './scheduler.js';
import { planSession, suggestGrade, judgeChar, formatInterval } from './session.js';
import { formatPinyin } from './wordList.js';

const CARD_TYPE = 'writing';

// While waiting for the next word to become due, look again this often.
const RECHECK_MS = 15 * 1000;

// elements: the page elements review controls:
//   countsElement, meaningElement, pinyinElement, pinyinButton,
//   gradeRow, donePanel, doneMessage, studyArea
// flow:      the word flow (see wordFlow.js)
// getScript: a function returning 'traditional' or 'simplified'
//
// Returns { load, activate, deactivate, refresh }.
export function createReview(elements, flow, getScript) {
  const {
    countsElement,
    meaningElement,
    pinyinElement,
    pinyinButton,
    gradeRow,
    donePanel,
    doneMessage,
    studyArea,
  } = elements;

  let words = [];
  // Word ID → that word's writing card. A word with no entry is new.
  const cards = new Map();
  // Words that turned out to have no stroke data; left out for this session.
  const unusable = new Set();

  // True while Review is the mode on screen.
  let active = false;
  let recheckTimer = null;

  // The word on screen and its card (null for a new word).
  let current = null;
  // Set once the word has been written: how it went, the time it was
  // finished, what each grade would do, and which grade is suggested.
  let result = null;
  let finishedAt = null;
  let options = null;
  let suggested = null;

  function showPinyin() {
    pinyinElement.textContent = formatPinyin(current.word.pinyin);
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
    if (!options) {
      return; // already graded, e.g. a double tap
    }
    const chosen = options[value];
    options = null;
    const { word, card } = current;
    const time = finishedAt.getTime();

    const newCard = {
      id: `${word.id}#${CARD_TYPE}`,
      wordId: word.id,
      type: CARD_TYPE,
      due: chosen.due,
      firstReviewedAt: card ? card.firstReviewedAt : time,
      fsrsState: chosen.fsrsState,
    };
    const review = {
      id: randomId(),
      cardId: newCard.id,
      wordId: word.id,
      type: CARD_TYPE,
      time,
      grade: value,
      suggestedGrade: suggested,
      mistakesPerChar: result.mistakesPerChar,
      // The verdict on each character (true = passed), and what the app had
      // proposed before any overruling.
      passedPerChar: result.passedPerChar,
      suggestedPerChar: result.suggestedPerChar,
      script: getScript(),
      log: chosen.log,
    };
    await saveReview(newCard, review);
    cards.set(word.id, newCard);
    showNext();
  }

  // Shows the four grade buttons with the suggested one highlighted.
  function renderGrades() {
    suggested = suggestGrade(result);
    gradeRow.replaceChildren();
    for (const { value, label } of GRADES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = value === suggested ? 'grade primary' : 'grade';
      // Each button says when the word would come back.
      const wait = document.createElement('span');
      wait.className = 'wait';
      wait.textContent = formatInterval(options[value].due - finishedAt.getTime());
      button.append(label, wait);
      button.addEventListener('click', () => grade(value));
      gradeRow.appendChild(button);
    }
    gradeRow.hidden = false;
  }

  // The word has been written: show the answer's pinyin and the grade buttons.
  function onWordDone(wordResult) {
    result = wordResult;
    finishedAt = new Date();
    options = gradeOptions(current.card ? current.card.fsrsState : null, finishedAt);
    showPinyin();
    renderGrades();
  }

  // The last character's verdict was overruled, which can change the suggestion.
  function onVerdictChange(wordResult) {
    if (!options) {
      return;
    }
    result = wordResult;
    renderGrades();
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
    const now = Date.now();
    const usableWords = words.filter((word) => !unusable.has(word.id));
    const plan = planSession(usableWords, cards, now);
    countsElement.textContent = `Due ${plan.dueCount} · New ${plan.newLeftToday}`;
    hideGrades();

    if (!plan.next) {
      current = null;
      studyArea.hidden = true;
      meaningElement.textContent = '';
      pinyinElement.hidden = true;
      pinyinButton.hidden = true;
      doneMessage.textContent = `All done for now. ${describeWait(plan.nextDueAt, now)}`;
      donePanel.hidden = false;
      // Freshly learned words come back after a few minutes, so keep checking.
      recheckTimer = setTimeout(showNext, RECHECK_MS);
      return;
    }

    current = plan.next;
    donePanel.hidden = true;
    studyArea.hidden = false;
    meaningElement.textContent = current.word.definition;
    pinyinElement.hidden = true;
    pinyinButton.hidden = false;

    const started = await flow.start(current.word[getScript()], {
      continueLabel: null,
      hideOutline: true,
      // Starting a character over after the word was finished takes the grade
      // buttons away again until it is finished once more.
      judgeChar,
      onCharStart: hideGrades,
      onWordDone,
      onVerdictChange,
      // Tapping the writing area accepts the suggested grade.
      onContinue: () => grade(suggested),
    });
    if (!started) {
      unusable.add(current.word.id);
      showNext();
    }
  }

  return {
    // Reads words and cards from the database. Call once at startup.
    async load() {
      words = await getAll('words');
      cards.clear();
      for (const card of await getAll('cards')) {
        if (card.type === CARD_TYPE) {
          cards.set(card.wordId, card);
        }
      }
    },

    activate() {
      active = true;
      return showNext();
    },

    deactivate() {
      active = false;
      clearTimeout(recheckTimer);
      donePanel.hidden = true;
      studyArea.hidden = false;
      hideGrades();
    },

    // Shows the current word again from the start, e.g. after the script
    // setting changed.
    refresh() {
      return showNext();
    },
  };
}
