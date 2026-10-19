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

import { getAll, putAll, saveReview, saveKnown, startCardsOver, randomId } from './db.js';
import { gradeOptions, GRADES, AGAIN, GOOD } from './scheduler.js';
import { deckWithInside, isInDecks, dailyGoal, startingLevel } from './decks.js';
import { fillDeckSelect } from './decksPanel.js';
import {
  planSession,
  suggestGrade,
  judgeChar,
  formatInterval,
  cardIdFor,
  lessonSteps,
  nextToLearn,
  CARD_TYPES,
  allCardIds,
} from './session.js';
import { toneAnswers, readingsFor, describeReading } from './tones.js';
import { scriptFor, scriptFlagFor } from './words.js';
import { fillMixed } from './lang.js';
import { isLeech, lapsesOf, isSuspended, withSuspended, becameLeech } from './leeches.js';
import { speak } from './speech.js';
import { markedKnown, withStartedOver } from './cardManager.js';
import { ask } from './confirm.js';
import { isSentence, sentenceCardTypes, sentenceWriting } from './sentences.js';
import { isRadical, RADICAL_CARD_TYPES } from './radicals.js';
import { cardTip } from './cardTip.js';
import { studyByDay, streakAt, streakLine, studyDayKey } from './streak.js';
import { createStopwatch } from './timing.js';

// The same for a sentence, which has two kinds of card (see sentences.js).
const SENTENCE_LABELS = {
  writing: 'Sentence · writing',
  meaning: 'Sentence · reading',
};

const RADICAL_LABELS = {
  writing: 'Radical · writing',
  meaning: 'Radical · meaning',
};

const TYPE_LABELS = {
  writing: 'Writing',
  tone: 'Tone',
  pinyin: 'Pinyin',
  meaning: 'Meaning',
};

// While waiting for the next card to become due, look again this often.
const RECHECK_MS = 15 * 1000;

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

// elements: the page elements review controls:
//   countsElement, typeElement, meaningElement, pinyinElement, pinyinButton,
//   gradeRow, practiceAgainButton, editWordButton, leechNote, donePanel, doneMessage, studyArea, scriptFlag,
//   lessonNote, skipLessonButton, lessonNextButton, learnNextButton, addWordsButton,
//   startLevelButton, otherLevelButton, lessonBackButton, countsRow,
//   and the parts of the study area that differ per kind of card:
//   wordRow, statusRow, strokeCountElement, writingRow, writingButtons, cardFace,
//   toneButtonRow, orderNote
// flows:    { writing, tone, recall }: the three pieces of code named above
// settings: the current settings (see settings.js)
// editWord(word): opens the word's panel to change it; returns a promise for
//           { changed, word } (see edit() in wordsPanel.js)
// showWord(word, thisCard): opens the word's page; thisCard, if given, is the
//                  card it was opened from, for the strip at its top (wordPage.js)
// noteOf(word): a promise for the word's learning note, or null
// tappableText(element, text): fills an element with a learning note whose
//   words can be tapped (see cardTip.js)
// streakScreen: the pop-up for a day that counts for the streak
//   (streakScreen.js)
//
// The deck studied is chosen with `deckSelect`, at the top of Review and
// Learn (see "Studying one deck").
//
// Returns { load, activate, deactivate, practice, refresh }.
export function createReview(elements, flows, settings, editWord, showWord, noteOf, tappableText, streakScreen) {
  const {
    deckSelect,
    countsElement,
    typeElement,
    meaningElement,
    pinyinElement,
    pinyinButton,
    gradeRow,
    practiceAgainButton,
    editWordButton,
    aboutWordButton,
    leechNote,
    leechSuspendButton,
    listenButton,
    noticeElement,
    donePanel,
    doneMessage,
    studyArea,
    scriptFlag,
    lessonNote,
    skipLessonButton,
    lessonNextButton,
    learnNextButton,
    addWordsButton,
    startLevelButton,
    otherLevelButton,
    lessonBackButton,
    countsRow,
    wordRow,
    statusRow,
    strokeCountElement,
    writingRow,
    writingButtons,
    cardFace,
    toneButtonRow,
    orderNote,
  } = elements;

  let words = [];
  let decks = [];
  // Card ID → card, for every card that has been studied.
  const cards = new Map();
  // When each review was made and of which card, for the streak (streak.js):
  // { cardId, wordId, time, markedKnown }, the rest of each review left out.
  let reviewTimes = [];
  // The tone table (see data/cedict/README.md), loaded at startup. Supplies
  // Taiwan readings and tone variants.
  let toneTable = null;
  // The reading of words and cards that is under way or was last done (see load).
  let loading = Promise.resolve();
  // Words whose characters turned out to have no stroke data. They can't have
  // a writing card; left out for this session.
  const unwritable = new Set();

  // True while Review or Learn is the mode on screen, and which of the two:
  // 'review' shows the cards of learned words that are due; 'learn' teaches
  // the words that are waiting (see "Learning new words" below).
  let active = false;
  let mode = 'review';
  // True while the end of Review, or of today's words in Learn, is on
  // screen (showNext sets it): a moment for the streak screen.
  let atEnd = false;
  // True while a card is being shown for Free practice: it is not scheduled,
  // gets no grade buttons, and nothing is saved.
  let practicing = false;
  let recheckTimer = null;
  // "About this word" inside the card's frame (showCardAbout).
  const cardAboutButton = document.getElementById('card-about-button');

  // The card on screen: { word, type, card }, with card null if never studied.
  let current = null;
  // Set once the card has been answered: the time, what each grade would do,
  // which grade is suggested, and details of the answer to save.
  let finishedAt = null;
  let options = null;
  let suggested = null;
  let answerDetails = null;
  // How long the card on screen, or the word in Learn, has taken so far
  // (timing.js): started when it comes up, stopped when it is graded or
  // learned. Time while the app is out of sight doesn't count.
  const stopwatch = createStopwatch();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopwatch.pause();
    } else {
      stopwatch.resume();
    }
  });

  // Shows the parts of the study area that the given kind of card uses, and
  // hides the rest.
  function showPartsFor(type) {
    // A tip on the face belongs to the card it was put on (addTip).
    cardFace.classList.remove('with-tip');
    const writing = type === 'writing';
    const tone = type === 'tone';
    writingRow.hidden = !writing;
    writingButtons.hidden = !writing;
    writingButtons.classList.remove('tools-away');
    endPractice();
    cardFace.hidden = writing;
    toneButtonRow.hidden = !tone;
    // The row of slots and the status line belong to writing and tone cards.
    // On the other kinds they keep their room and are only made invisible
    // ("ghost"), so that the card sits at the same height whatever kind it
    // is: going from one step of a lesson to the next must not make it jump.
    wordRow.hidden = false;
    statusRow.hidden = false;
    wordRow.classList.toggle('ghost', !(writing || tone));
    statusRow.classList.toggle('ghost', !(writing || tone));
    // A word of one character has no row of slots on any of its cards.
    if (current) {
      wordRow.classList.toggle('single', Array.from(current.word[scriptFor(current.word, settings)]).length === 1);
    }
    // These belong to the writing card and may be left over from the last
    // one. (A writing card shows its stroke count again when it starts.)
    orderNote.hidden = true;
    strokeCountElement.hidden = true;
    // A sentence's writing card lets its prompt run to two lines (see there).
    meaningElement.style.webkitLineClamp = '';
    meaningElement.style.maxHeight = '';
  }

  // Above the card: a note if this word is in another script than the rest
  // of the deck. Pass null to take it away.
  function showScriptFlag(word) {
    fillMixed(scriptFlag, word ? scriptFlagFor(word, settings) : '', word ? scriptFor(word, settings) : settings.script);
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
      word.pinyinAlso,
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

  // Practicing again (see practiceWhenDone in wordFlow.js): the grades stay
  // where they are, and Clear, Show outline and Animate come back under
  // them (the owner, 2026-10-17: above, they would push the grades down).
  function startPractice() {
    practiceAgainButton.hidden = true;
    // Out of the way of the writing while practicing.
    cardAboutButton.hidden = true;
    writingButtons.hidden = false;
    studyArea.classList.add('practicing');
  }

  function endPractice() {
    studyArea.classList.remove('practicing');
  }

  // In a lesson's writing steps, once the word is written, Clear, Show
  // outline and Animate are put away and only the way on stays ("Next step"
  // or "Done"), with "Practice again" under it, as in Review once answered
  // (roadmap item 1, draft of 2026-10-18). Writing it again brings them back.
  function putToolsAway(away) {
    writingButtons.classList.toggle('tools-away', away);
    practiceAgainButton.hidden = !away;
  }

  practiceAgainButton.addEventListener('click', () => flows.writing.practiceAgain());

  function hideGrades() {
    gradeRow.hidden = true;
    practiceAgainButton.hidden = true;
    editWordButton.hidden = true;
    aboutWordButton.hidden = true;
    cardAboutButton.hidden = true;
    leechNote.hidden = true;
    leechSuspendButton.hidden = true;
    options = null;
  }

  // ---- Hearing the word ----

  // ---- Focus ----
  //
  // While a card is up, the name in the top bar and the line with the deck
  // and the counts are put away (the style sheet does it, for main.focused),
  // so that the writing area has their room; the menu button stays in the
  // corner. Between cards, and when there is nothing to study, they are there.
  const page = document.querySelector('main');
  function setFocus(on) {
    page.classList.toggle('focused', on);
  }

  // The loudspeaker beside the kind of card. It is there whenever hearing
  // the word does not give the answer away: all through a new word's lesson;
  // from the start on a meaning card (which shows the word) and on a writing
  // card (whose pinyin can be shown at any time without it counting); and on
  // a pinyin or tone card once the answer is given.
  function offerListen(wanted) {
    listenButton.classList.remove('no-sound');
    listenButton.title = 'Hear the word';
    // A radical with no reading is not said aloud (see radicals.js).
    listenButton.hidden = !wanted || settings.sound === 'off' || (current !== null && isRadical(current.word));
  }

  // Speaks the word of the card on screen, in the reading shown for it.
  async function speakCurrent() {
    if (!current || isRadical(current.word)) {
      return;
    }
    const { word } = current;
    const spoken = await speak(
      word,
      readingOf(word).primary,
      settings.pronunciation === 'taiwan' ? 'taiwan' : 'mainland',
      settings.volume,
    );
    // How it was spoken is noted on the button for the browser tests; and
    // the button says so if the word could not be spoken at all.
    listenButton.dataset.spoken = `${word.id} ${spoken}`;
    if (!spoken && current && current.word === word) {
      listenButton.classList.add('no-sound');
      listenButton.title = 'No sound for this word on this device';
    }
  }

  listenButton.addEventListener('click', speakCurrent);

  // With sound playing by itself, a word being learned is spoken whenever a
  // step of its lesson is finished: its tones given, the word written.
  function speakAfterStep() {
    if (settings.sound === 'auto') {
      speakCurrent();
    }
  }

  // "About this word", shown with the grades: the word's page, with its
  // note, an example sentence and how its characters are built.
  // Opened from a card, the page has a strip at its top for that card, with
  // Suspend and Start over (UX review, item 16; the owner, 2026-10-17): from
  // Words that is five or six taps. Either one takes the card out of Review
  // there and then, ungraded, and the next one comes, as "Suspend this card"
  // does for a leech.
  // "About this word" inside the card's frame once it is answered, on every
  // kind of card (the owner, 2026-10-18: as on a meaning card, where it was
  // at the bottom of the learning note; it replaces "About" in the top
  // line). On a writing card it lies over the writing area's bottom edge;
  // on the other kinds it is moved into the card's face. A learning note on
  // the face brings its own (cardTip.js), which does the same.
  function showCardAbout() {
    cardAboutButton.textContent = isSentence(current.word) ? 'About this sentence' : 'About this word';
    if (!writingRow.hidden) {
      writingRow.append(cardAboutButton);
      cardAboutButton.hidden = false;
      return;
    }
    cardFace.append(cardAboutButton);
    cardAboutButton.hidden = Boolean(cardFace.querySelector('.face-tip-more'));
  }
  // A tap on it must not also count as a tap on the card's face.
  cardAboutButton.addEventListener('pointerup', (event) => event.stopPropagation());
  cardAboutButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openAbout();
  });

  aboutWordButton.addEventListener('click', () => openAbout());
  function openAbout() {
    if (!current) {
      return;
    }
    const shown = current;
    const { word, type, card } = current;
    // Free practice has no card of its own to manage, and a card already
    // graded is done with.
    const thisCard = practicing || !options
      ? null
      : {
          wordId: word.id,
          label: typeElement.textContent,
          facts: lapsesOf(card) > 0 ? `forgotten ${lapsesOf(card)} time${lapsesOf(card) === 1 ? '' : 's'}` : '',
          // Each returns true once done, and the page then closes.
          async suspend() {
            if (current !== shown || !options) {
              return false;
            }
            options = null;
            await suspend(word, type);
            showNotice(
              `Suspended: the ${type} card of ${word[scriptFor(word, settings)]}. ` +
                'Resume it from the word\'s page (Words tab).',
            );
            showNext();
            return true;
          },
          async startOver() {
            if (current !== shown || !options) {
              return false;
            }
            const confirmed = await ask({
              question: `Start the ${type} card of this word over?`,
              detail: 'It becomes a new card, as if never studied. Its reviews are kept in the history but no longer count.',
              yes: 'Start over',
            });
            if (!confirmed || current !== shown || !options) {
              return false;
            }
            options = null;
            await startOver(word, type);
            showNotice(`Started over: the ${type} card of ${word[scriptFor(word, settings)]} is new again.`);
            showNext();
            return true;
          },
        };
    showWord(word, thisCard);
  }

  // "Edit word", shown with the grades: a mistake in a word is usually
  // noticed when its answer is on screen. Opens the word's panel.
  editWordButton.addEventListener('click', async () => {
    const shown = current;
    const before = current.word;
    const result = await editWord(before);
    // Nothing saved, or the card moved on in the meantime.
    if (!result.changed || current !== shown) {
      return;
    }
    const after = result.word;
    // The Decks tab has had Review read the words and cards afresh (load()).
    const fields = new Set([...Object.keys(before), ...Object.keys(after || {})]);
    fields.delete('definition');
    // When the word was saved is filled in by the database, and always differs.
    fields.delete('changedAt');
    // Compared as text, since some fields are lists (`decks`).
    const same = (field) => JSON.stringify(before[field]) === JSON.stringify(after[field]);
    const onlyMeaningChanged = after && [...fields].every(same);
    if (onlyMeaningChanged) {
      // The answer stays up with the corrected meaning, still to be graded.
      current.word = after;
      if (current.type === 'writing') {
        meaningElement.textContent = after.definition;
      }
      flows.recall.update(after);
      flows.tone.update(after);
    } else {
      // Anything else changes what the card asks or which answers are right,
      // so the card is shown again (or the next one, if the word is gone).
      showNext();
    }
  });

  // A line above the card for something that just happened; '' takes it away.
  function showNotice(text) {
    noticeElement.textContent = text;
    noticeElement.hidden = text === '';
  }

  // "Suspend this card", offered with the note on a leech: the card is taken
  // out of Review there and then, ungraded, and the next one comes.
  leechSuspendButton.addEventListener('click', async () => {
    if (!current || !options) {
      return;
    }
    const { word, type, card } = current;
    options = null;
    await suspend(word, type);
    showNotice(
      `Suspended: the ${type} card of ${word[scriptFor(word, settings)]}, forgotten ${lapsesOf(card)} times. ` +
        'Resume it from the word\'s page (Words tab).',
    );
    showNext();
  });

  // Suspends one kind of card of a word, here and in the database.
  async function suspend(word, type) {
    // `changedAt` is put on by the database when the word is saved.
    const { changedAt, ...suspended } = withSuspended(word, type);
    await putAll('words', [suspended]);
    words = words.map((entry) => (entry.id === word.id ? suspended : entry));
  }

  // Starts one kind of card of a word over, here and in the database: the
  // card is removed and the word notes when (see withStartedOver), in both
  // scripts for a writing card, as the word's page does (cardsPanel.js).
  async function startOver(word, type) {
    const { changedAt, ...startedOver } = withStartedOver(word, type, Date.now());
    const ids = allCardIds(word).filter((id) => id.startsWith(`${word.id}#${type}`));
    await startCardsOver(startedOver, ids);
    words = words.map((entry) => (entry.id === word.id ? startedOver : entry));
    for (const id of ids) {
      cards.delete(id);
    }
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
    showNotice('');
    const chosen = options[value];
    options = null;
    const duration = stopwatch.stop();
    const { word, type, card } = current;
    const time = finishedAt.getTime();
    // A word of one character has no verdict of its own to overrule (its
    // row of slots is not shown): the grade is the verdict, Again for
    // missed and the others for passed.
    if (type === 'writing' && answerDetails?.passedPerChar?.length === 1) {
      answerDetails = { ...answerDetails, passedPerChar: [value !== AGAIN] };
    }

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
      // How long it took, in milliseconds (timing.js).
      ...(duration !== null && { duration }),
    };
    await saveReview(newCard, review);
    cards.set(newCard.id, newCard);
    reviewTimes.push(reviewTime(review));
    // Forgotten once too often: with that setting, the card is suspended.
    if (settings.leechAction === 'suspend' && becameLeech(card, newCard, settings.leechLapses)) {
      await suspend(word, type);
      // Said above the next card, until that one is graded.
      showNotice(
        `Suspended: the ${type} card of ${word[scriptFor(word, settings)]}, forgotten ${lapsesOf(newCard)} times. ` +
          'It will not come up again until you resume it from the word\'s page (Words tab).',
      );
    }
    showNext();
    noteStreak();
  }

  // ---- Streaks (streak.js) ----

  const reviewTime = ({ cardId, wordId, time, markedKnown }) => ({ cardId, wordId, time, markedKnown });
  const streakGoal = () => ({ cards: settings.streakCards, words: settings.streakWords });

  function streakNow(now) {
    return streakAt(studyByDay(reviewTimes, words), now, streakGoal());
  }

  // After a grade or a word learned, the moment today may start to count
  // (streakScreen.js says when what is shown): the streak screen at once the
  // first time ever, or when this was the end of Review or of today's words
  // in Learn; otherwise the small pill, so studying goes on undisturbed.
  // showNext() has just set `atEnd`: it does so before it first waits.
  function noteStreak() {
    if (!settings.streaks) {
      return;
    }
    const now = Date.now();
    const shown = atEnd || streakScreen.isFirst() ? showStreakIfWaiting() : false;
    if (!shown) {
      streakScreen.showPill(streakNow(now), studyDayKey(now), streakGoal());
    }
  }

  // The streak screen, if today counts and it hasn't been shown today: at
  // a pause in studying. then: what to do once it is closed. True if shown.
  function showStreakIfWaiting(then = null) {
    if (!settings.streaks) {
      return false;
    }
    const now = Date.now();
    return streakScreen.showIfNew(streakNow(now), studyDayKey(now), streakGoal(), then);
  }

  // Shows the four grade buttons with the suggested one highlighted.
  function renderGrades() {
    gradeRow.replaceChildren();
    for (const [index, { value, label }] of GRADES.entries()) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = value === suggested ? 'grade primary' : 'grade';
      // Its key on a keyboard (see gradeByKey): shown when the mouse rests
      // on it, and told to screen readers by aria-keyshortcuts.
      button.title = `${label} (key ${index + 1})`;
      button.setAttribute('aria-keyshortcuts', String(index + 1));
      // Each button says when the card would come back.
      const wait = document.createElement('span');
      wait.className = 'wait';
      wait.textContent = formatInterval(options[value].due - finishedAt.getTime());
      button.append(label, wait);
      button.addEventListener('click', () => grade(value));
      gradeRow.appendChild(button);
    }
    gradeRow.hidden = false;
    editWordButton.hidden = false;
    showCardAbout();
    offerListen(true);
    // A card that keeps being forgotten is pointed out, now that its answer
    // is in view: the moment to think of a way to remember it.
    const lapses = lapsesOf(current.card);
    leechNote.textContent = `Leech: you have forgotten this card ${lapses} times. Words, in the menu, lists your leeches.`;
    leechNote.hidden = !isLeech(current.card, settings.leechLapses);
    leechSuspendButton.hidden = leechNote.hidden;
  }

  // On a keyboard, the keys 1 to 4 press the grade buttons, Again to Easy
  // (the owner, 2026-10-15; Anki and Skritter do the same). Only while the
  // grades are showing and no pop-up panel is open, and not while typing
  // in a box.
  function gradeByKey(event) {
    const number = Number(event.key);
    if (!Number.isInteger(number) || number < 1 || number > GRADES.length) {
      return;
    }
    const typing = event.target.closest?.('input, select, textarea, [contenteditable]');
    // (offsetParent is null when the row is not on screen, e.g. while
    // another tab is open with a card still waiting to be graded.)
    if (gradeRow.offsetParent === null || typing || event.repeat || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }
    if (document.querySelector('dialog[open]')) {
      return;
    }
    event.preventDefault();
    gradeRow.children[number - 1]?.click();
  }
  document.addEventListener('keydown', gradeByKey);

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
    // Once answered, only the grades are under the card: Clear, Show
    // outline and Animate, or the tone buttons, are no use any more (UX
    // review item 10; the owner chose this from pictures on 2026-10-17, over
    // keeping Animate as a quiet button). The next card's showPartsFor
    // brings back what it needs.
    writingButtons.hidden = true;
    toneButtonRow.hidden = true;
    // A written word can be practiced again, as often as wanted, without
    // changing its grade (the owner, 2026-10-17).
    practiceAgainButton.hidden = writingRow.hidden;
    renderGrades();
    // A tip beside them, the first time (tips.js).
    document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'grades' }));
    if (settings.sound === 'auto') {
      speakCurrent();
    }
  }

  // ---- The four kinds of card ----

  // Returns false if the word can't be written (no stroke data).
  async function showWritingCard() {
    const { word } = current;
    const script = scriptFor(word, settings);
    // What is written: the word; or for a sentence its missing word, with
    // the sentence and its gap shown under the meaning, or all of it.
    const asked = isSentence(word)
      ? sentenceWriting(word, script, settings.sentenceWriting)
      : { text: word[script], prompt: null };
    const showPrompt = (sentence) => {
      meaningElement.textContent = word.definition;
      // The prompt is cut off after one line (clamp.js); a sentence with its
      // gap is a second line that has to stay in view.
      meaningElement.style.webkitLineClamp = sentence ? '2' : '';
      meaningElement.style.maxHeight = sentence ? 'none' : '';
      if (sentence) {
        const line = document.createElement('span');
        line.className = 'cloze-sentence';
        line.lang = script === 'traditional' ? 'zh-Hant-TW' : 'zh-Hans-CN';
        line.textContent = sentence;
        meaningElement.append(line);
      }
    };
    showPrompt(asked.prompt);
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
      // True where the next stroke was flashed as a hint.
      hintPerChar: result.hintPerChar,
    });

    return flows.writing.start(asked.text, {
      script,
      rawInput: settings.rawInput,
      continueLabel: null,
      hideOutline: true,
      // The stroke count is a hint: kept out of sight in Review unless the
      // setting says otherwise, but shown while a word is being taught (the
      // last step of a lesson comes here too). The owner's choice, 2026-10-15.
      hideStrokeCount: !settings.strokeCountInReview && lesson === null,
      // How a hint counts is a setting (the owner, 2026-10-15).
      judgeChar: (facts) => judgeChar({ ...facts, hintCountsAs: settings.hintCountsAs }),
      // Starting a character over after the word was finished (the back
      // arrow to a skipped one) takes the grade buttons away
      // again until it is finished once more, and brings back Clear, Show
      // outline and Animate, which offerGrades put away.
      onCharStart: () => {
        hideGrades();
        writingButtons.hidden = false;
      },
      // Once written, it can be practiced again (practice-again-button, or a
      // swipe up), which changes nothing.
      practiceWhenDone: true,
      onPracticeStart: startPractice,
      // Back from practicing an earlier character to the one still to be
      // written (the arrows, wordFlow.js).
      onPracticeEnd: endPractice,
      onWordDone(result) {
        showPinyin();
        // The gap is filled in: the whole sentence is shown.
        if (asked.prompt) {
          showPrompt(word[script]);
        }
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
    const { word } = current;
    const script = scriptFor(word, settings);
    flows.recall.start({
      word,
      script,
      reading: readingOf(current.word),
      ask,
      onReveal: () => offerGrades(GOOD, {}),
      onContinue: () => grade(suggested),
      // Under the answer, the word's learning tip (cardTip.js).
      onAnswerShown: () => addTip(word, script, () => current && current.word === word && current.type === ask),
    });
  }

  // Puts the word's learning tip on the card's face once its note is there,
  // if the card is still the one it was for (`still()` says so). A word
  // without a note gets nothing.
  function addTip(word, script, still) {
    noteOf(word)
      .then((note) => {
        if (note && still()) {
          cardFace.classList.add('with-tip');
          cardFace.append(cardTip(note, script, openAbout, tappableText));
          // The note's own "About this word" takes the place of the card's.
          cardAboutButton.hidden = true;
        }
      })
      .catch(() => {});
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
    offerListen(false);
    endLesson();
    showScriptFlag(word);
    showPartsFor(type);
    if (type === 'tone') {
      showToneCard();
    } else {
      showRecallCard(type);
    }
    return true;
  }

  // ---- The lesson for a new word ----
  //
  // A word is taught before it is tested. In the Learn tab a word that is new
  // altogether goes through the whole lesson: a look at the word, its tones,
  // writing it stroke by stroke as each stroke is shown, writing over the
  // bare outline, and then writing it from memory. Nothing in the Learn tab
  // is graded (the owner, 2026-10-16): all of the word's cards then start in
  // Review, where it is tested. Until that day the last step was the writing
  // card itself, graded, so a word just learned had little in Review.
  //
  // In Review, a writing card that is new for a word not taught in the Learn
  // tab (a word from before there was a Learn tab, or one to be written again
  // in another script) gets the same lesson without the first look. There the
  // last step is the writing card, graded.

  // The lesson in progress: { steps, index }, or null.
  let lesson = null;

  const LESSON_NOTES = {
    // Kept short: each shares a line with "I know this word", and a second
    // line pushes the writing area down the screen.
    meet: 'A new word: have a look.',
    // The same step in a lesson repeated, of a word already learned.
    meetAgain: 'Have another look.',
    tone: 'First its tones.',
    trace: 'Write each stroke as it is shown.',
    outline: 'Again, over the bare outline.',
    test: 'From memory. This one counts.',
    // The same step in the Learn tab, where it is practice.
    learnTest: 'Now from memory.',
  };

  function endLesson() {
    lesson = null;
    lessonNote.hidden = true;
    skipLessonButton.hidden = true;
    lessonNextButton.hidden = true;
  }

  // The steps for the word on screen.
  function stepsFor(word, newWord) {
    return lessonSteps({
      newWord,
      toneCardsOn: settings.enabledTypes.includes('tone'),
      canHaveToneCard: toneAnswersOf(word) !== null,
      canBeWritten: settings.enabledTypes.includes('writing') && !unwritable.has(word.id),
    });
  }

  // Shows the lesson's current step. Returns false if the word turns out to
  // have no stroke data, so that it cannot be written at all.
  async function showLessonStep() {
    const { word } = current;
    const step = lesson.steps[lesson.index];
    // A lesson repeated is of a word already learned, not a new one (the
    // owner, 2026-10-18).
    const kind = current.repeating ? 'Repeat lesson' : isRadical(word) ? 'New radical' : 'New word';
    typeElement.textContent = `${kind} · step ${lesson.index + 1} of ${lesson.steps.length}`;
    const note = step === 'test' && current.learning ? 'learnTest' : step === 'meet' && current.repeating ? 'meetAgain' : step;
    lessonNote.textContent = LESSON_NOTES[note];
    lessonNote.hidden = false;
    // "I know this word" is offered at every step, but not in a lesson
    // repeated, which saves nothing.
    skipLessonButton.hidden = Boolean(current.repeating);
    // A tip beside it, the first time (tips.js).
    document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'lesson' }));
    lessonNextButton.hidden = true;
    stopFlows();
    hideGrades();
    // A word being learned can be heard at every step.
    offerListen(true);

    const script = scriptFor(word, settings);
    if (step === 'test') {
      pinyinElement.hidden = true;
      showPartsFor('writing');
      if (!current.learning) {
        return showWritingCard();
      }
      // In the Learn tab: from memory, as practice. The character is still
      // judged, so that writing it well turns it green, and starting again
      // clears the slate. Nothing is saved.
      return flows.writing.start(word[script], {
        script,
        rawInput: settings.rawInput,
        hideOutline: true,
        freshRestart: true,
        continueLabel: 'Done',
        judgeChar: (facts) => judgeChar({ ...facts, hintCountsAs: settings.hintCountsAs }),
        onCharStart: () => putToolsAway(false),
        onWordDone() {
          showPinyin();
          putToolsAway(true);
          speakAfterStep();
        },
        onContinue: () => nextLessonStep(),
      });
    }

    if (step === 'meet') {
      // The word, its reading and its meaning, on the card's face.
      meaningElement.textContent = '';
      pinyinElement.hidden = true;
      pinyinButton.hidden = true;
      showPartsFor('meaning');
      const face = (className, text) => {
        const element = document.createElement('p');
        element.className = className;
        element.textContent = text;
        return element;
      };
      const characters = face('face-word', word[script]);
      // Tells the browser which regional font to use for the characters.
      characters.lang = script === 'traditional' ? 'zh-Hant-TW' : 'zh-Hans-CN';
      const described = describeReading(readingOf(word));
      cardFace.replaceChildren(
        characters,
        face('face-pinyin', described.main),
        ...(described.other ? [face('face-hint', described.other)] : []),
        face('face-meaning', word.definition),
      );
      // The word's learning tip, so that every word's is seen once, as it is
      // met (cardTip.js).
      const lessonNow = lesson;
      addTip(word, script, () => lesson === lessonNow && lesson.steps[lesson.index] === 'meet');
      lessonNextButton.hidden = false;
      // The word is spoken by itself only once something has been tapped
      // here: not on arriving at the tab, when a voice out of nowhere would
      // startle (and a browser may not allow sound yet anyway).
      if (settings.sound === 'auto' && tappedSinceArriving) {
        speakCurrent();
      }
      return true;
    }

    // While it is being learned, the word's meaning and reading are in view.
    meaningElement.textContent = word.definition;
    pinyinButton.hidden = true;
    showPinyin();
    if (step === 'tone') {
      showPartsFor('tone');
      flows.tone.start({
        word,
        script,
        reading: readingOf(word),
        answers: toneAnswersOf(word),
        // Practice: nothing is saved, and the tone card comes by itself later.
        onDone() {
          lessonNextButton.hidden = false;
          speakAfterStep();
        },
        onContinue: () => nextLessonStep(),
      });
      return true;
    }
    showPartsFor('writing');
    return flows.writing.start(word[script], {
      script,
      rawInput: settings.rawInput,
      showOutline: true,
      demoStrokes: step === 'trace',
      // The character is on screen in these steps, so the slots can show it.
      showCharacters: step === 'trace' || step === 'outline',
      // Practice: starting again clears the mistakes.
      freshRestart: true,
      continueLabel: 'Next step',
      onCharStart: () => putToolsAway(false),
      // The word is heard each time a step of its lesson is finished.
      onWordDone() {
        putToolsAway(true);
        speakAfterStep();
      },
      onContinue: () => nextLessonStep(),
    });
  }

  async function nextLessonStep(toIndex = lesson.index + 1) {
    const shown = current;
    if (toIndex >= lesson.steps.length && current.repeating) {
      endLesson();
      stopFlows();
      showRepeatDone();
      return;
    }
    // Each step of a lesson counts up to the limit of its own (timing.js).
    stopwatch.lap();
    if (toIndex >= lesson.steps.length) {
      // A lesson without writing (writing cards are off, or the word has no
      // stroke data) ends here; with writing it ends when the test is graded.
      await finishLearning();
      return;
    }
    lesson.index = toIndex;
    if (!(await showLessonStep()) && current === shown) {
      unwritable.add(current.word.id);
      showNext();
    }
  }

  lessonNextButton.addEventListener('click', () => {
    if (lesson) {
      nextLessonStep();
    }
  });
  // At a new word's first look, a tap on the card does the same as "Next
  // step". (On the other steps the card's face belongs to the tone card or
  // is out of sight; those flows listen for their own taps.)
  cardFace.addEventListener('click', () => {
    if (lesson && lesson.steps[lesson.index] === 'meet' && !lessonNextButton.hidden) {
      nextLessonStep();
    }
  });

  // True once anything in Review or Learn has been tapped since the tab was
  // opened (see where a new word is first spoken). "pointerdown" comes for a
  // finger, a stylus and a mouse alike; `true` hears it before anything else.
  let tappedSinceArriving = false;
  for (const part of [studyArea, donePanel, typeElement.parentElement.parentElement]) {
    part.addEventListener(
      'pointerdown',
      () => {
        tappedSinceArriving = true;
      },
      true,
    );
  }

  // "I know this word": the lesson is skipped altogether. Each of the word's
  // cards that is still new is answered "Easy" (markedKnown in
  // cardManager.js), the word counts as learned, and the next one comes. In
  // the Learn tab the next word starts at once, without the stop that says
  // how the day stands: someone going through a list they half know would
  // otherwise be stopped at every word.
  skipLessonButton.addEventListener('click', async () => {
    // (Not offered in a lesson repeated, which saves nothing.)
    if (!lesson || !current || current.repeating) {
      return;
    }
    const { word, learning } = current;
    // Skipping isn't studying: the time so far is not kept.
    stopwatch.stop();
    const known = markedKnown(
      word,
      [...cards.values()],
      CARD_TYPES.filter((type) => hasCardType(word, type)),
      scriptFor(word, settings),
      Date.now(),
      randomId,
    );
    await saveKnown([known]);
    for (const card of known.cards) {
      cards.set(card.id, card);
    }
    reviewTimes.push(...known.reviews.map(reviewTime));
    words = words.map((entry) => (entry.id === word.id ? known.word : entry));
    stopFlows();
    endLesson();
    if (learning) {
      justLearned = null;
      const { learnedToday, waiting } = learnCounts();
      countsElement.textContent = `${learnedToday} of ${goalForToday()} learned today · ${waiting} waiting`;
      startNextWord();
    } else {
      showNext();
    }
  });

  // ---- Learning new words (the Learn tab) ----
  //
  // A word added to the app waits until it is learned here; only then do its
  // cards come up in Review. Learn takes the waiting words one at a time, in
  // the order of the queue, and teaches each with the lesson above. The
  // "new words per day" setting is a goal, shown as progress; one can go on
  // past it.

  // The word just learned, for the screen between two words; null otherwise.
  let justLearned = null;

  // True if the word's writing was taught in the Learn tab, so that its new
  // writing card in Review needs no lesson: the word was learned there
  // (`learnedAt`), and its writing card is not one to learn again in the
  // other script, which has a card of its own already studied. (A word learned
  // in one script and switched to the other before its writing card was ever
  // reviewed gets no lesson either; rare enough to leave.)
  function taughtInLearn(word) {
    if (word.learnedAt === undefined) {
      return false;
    }
    const script = scriptFor(word, settings);
    const otherScript = script === 'traditional' ? 'simplified' : 'traditional';
    const otherId = cardIdFor(word, 'writing', otherScript);
    return otherId === cardIdFor(word, 'writing', script) || !cards.has(otherId);
  }

  // The word on screen has been through its lesson: mark it as learned.
  async function finishLearning() {
    // How long the lesson took, in milliseconds (timing.js).
    const learnDuration = stopwatch.stop();
    const learned = { ...current.word, learnedAt: Date.now(), ...(learnDuration !== null && { learnDuration }) };
    await putAll('words', [learned]);
    words = words.map((word) => (word.id === learned.id ? learned : word));
    justLearned = learned;
    showNext();
    noteStreak();
  }

  function learnCounts() {
    // (Sentences are not learned here and do not count toward the day's words.)
    const plan = planSession(studyWords().filter((word) => !isSentence(word)), cards, Date.now(), {
      newWordsPerDay: goalForToday(),
      // Every kind: hasCardType says which are switched on, since
      // sentences have settings of their own.
      enabledTypes: CARD_TYPES,
      hasCardType,
      scriptOf: (word) => scriptFor(word, settings),
    });
    return { learnedToday: plan.learnedToday, waiting: plan.waitingCount };
  }

  // "Add words", which opens Decks, or nothing (on: false). With no words at
  // all, a ready-made level to start with comes first, as the main button,
  // with "Add my own words" and "Choose another level" (roadmap item 2; the
  // owner, 2026-10-19: someone who skipped the introduction is led from
  // here rather than left on an empty screen). main.js handles the taps.
  function offerAdding(on) {
    const start = on && words.length === 0 ? startingLevel(settings) : null;
    addWordsButton.hidden = !on;
    addWordsButton.textContent = start ? 'Add my own words' : 'Add words';
    // One main button on a screen.
    addWordsButton.classList.toggle('primary', !start);
    startLevelButton.hidden = !start;
    otherLevelButton.hidden = !start;
    if (start) {
      startLevelButton.textContent = `Start with ${start.name}`;
    }
  }

  // Shows a message where the card would be, and optionally the button that
  // goes on to the next word.
  // canAdd: also offer "Add words", which opens Decks (offerAdding)
  function showLearnMessage(message, canGoOn, canAdd = false) {
    current = null;
    setFocus(false);
    offerListen(false);
    studyArea.hidden = true;
    typeElement.textContent = '';
    doneMessage.textContent = message;
    learnNextButton.textContent = 'Learn the next word';
    learnNextButton.hidden = !canGoOn;
    offerAdding(canAdd);
    lessonBackButton.hidden = true;
    donePanel.hidden = false;
  }

  async function startNextWord() {
    justLearned = null;
    const word = nextToLearn(studyWords(), cards);
    if (!word) {
      showNextToLearn();
      return;
    }
    current = { word, type: 'writing', card: null, learning: true };
    stopwatch.start();
    setFocus(true);
    lesson = { steps: stepsFor(word, true), index: 0 };
    donePanel.hidden = true;
    studyArea.hidden = false;
    showScriptFlag(word);
    const shown = current;
    if (!(await showLessonStep()) && current === shown) {
      // No stroke data after all: the lesson starts again without writing.
      unwritable.add(word.id);
      startNextWord();
    }
  }

  // In Review the same button opens Learn (main.js does that).
  learnNextButton.addEventListener('click', () => {
    if (mode === 'learn') {
      startNextWord();
    } else if (mode === 'lesson') {
      startRepeat();
    }
  });

  // ---- Repeating a word's lesson ----
  //
  // "Repeat lesson" on the page of a word already learned (tester 2's R6,
  // 2026-10-17: a learner wanting more guided rounds before feeling at ease;
  // the owner, 2026-10-18): the lesson of the Learn tab for that word alone,
  // as practice. Nothing is saved: no review, no learnedAt, the schedule as
  // it was, and no "I know this word", which would grade the word's cards.
  // At the end, "Repeat lesson" again; the way back to the word's page is in
  // the top bar and beside it (main.js).

  // The word whose lesson is repeated, in the mode 'lesson'.
  let repeatedWord = null;

  async function startRepeat() {
    const word = words.find((entry) => entry.id === repeatedWord.id) || repeatedWord;
    current = { word, type: 'writing', card: null, learning: true, repeating: true };
    setFocus(true);
    lesson = { steps: stepsFor(word, true), index: 0 };
    donePanel.hidden = true;
    lessonBackButton.hidden = true;
    studyArea.hidden = false;
    showScriptFlag(word);
    const shown = current;
    if (!(await showLessonStep()) && current === shown) {
      // No stroke data after all: the lesson starts again without writing.
      unwritable.add(word.id);
      startRepeat();
    }
  }

  function showRepeatDone() {
    showLearnMessage('Lesson done.', true);
    learnNextButton.textContent = 'Repeat lesson';
    lessonBackButton.hidden = false;
  }

  // What the Learn tab shows: the next word's lesson or, between two words
  // and when there is nothing to learn, a message.
  function showNextToLearn() {
    const { learnedToday, waiting } = learnCounts();
    const goal = goalForToday();
    countsElement.textContent = `${learnedToday} of ${goal} learned today · ${waiting} waiting`;
    // The end of today's words: the goal reached, or nothing left to learn.
    atEnd = waiting === 0 || learnedToday >= goal;
    const progress =
      learnedToday >= goal && goal > 0
        ? `That is today's goal: ${learnedToday} of ${goal}. Stop here, or go on if you like.`
        : `${learnedToday} of ${goal} today.`;

    if (justLearned) {
      const name = justLearned[scriptFor(justLearned, settings)];
      showLearnMessage(
        // The count is on the line above; only reaching the goal is said here
        // (the owner, 2026-10-18: "1 of 5 today" twice on one screen).
        `${name} is learned: its cards will come up in Review.` +
          (learnedToday >= goal && goal > 0 ? ` ${progress}` : '') +
          (waiting === 0 ? ' No more words are waiting.' : ''),
        waiting > 0,
      );
      // The moment for the message about long-term storage (storageMessage.js).
      document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'learned' }));
    } else if (waiting === 0) {
      showLearnMessage(
        words.length === 0
          ? 'You have no words yet.'
          : studyDeck()
            ? 'No words of this deck are waiting to be learned.'
            : 'No words are waiting to be learned.',
        false,
        words.length === 0 || !studyDeck(),
      );
    } else if (learnedToday >= goal) {
      showLearnMessage(progress, true);
    } else {
      startNextWord();
    }
  }

  // ---- Studying one deck ----

  // The deck chosen at the top of Review and Learn, or null for all words
  // (also if the deck chosen has since been deleted).
  function studyDeck() {
    return decks.find((deck) => deck.id === settings.studyDeck) || null;
  }

  // The words studied: all of them, or those in the chosen deck and the
  // decks inside it. A word in several decks still has one set of cards, so
  // this only narrows down which words come up.
  function studyWords() {
    const deck = studyDeck();
    if (!deck) {
      return words;
    }
    const ids = deckWithInside(decks, deck.id);
    return words.filter((word) => isInDecks(word, ids));
  }

  // The goal for new words a day: the deck's own, or the one in Settings.
  function goalForToday() {
    return dailyGoal(studyDeck(), settings.newWordsPerDay);
  }

  // The list of decks to choose from. With only the deck the app starts
  // with there is nothing to choose, and it is left out.
  function showDeckChoice() {
    // (The groups inside the ready-made levels are left out, unless one is
    // the deck studied: see fillDeckSelect.)
    fillDeckSelect(deckSelect, decks, [{ value: '', label: 'All words' }], { keep: settings.studyDeck });
    deckSelect.value = studyDeck() ? settings.studyDeck : '';
    deckSelect.hidden = decks.length < 2;
  }

  // Saving the setting has the next card worked out afresh (see refresh).
  deckSelect.addEventListener('change', () => settings.change('studyDeck', deckSelect.value));

  // ---- Choosing the next card ----

  function hasCardType(word, type) {
    // A suspended card does not come up (see leeches.js).
    if (isSuspended(word, type)) {
      return false;
    }
    // Which kinds are switched on: sentences have settings of their own.
    const wanted = isSentence(word) ? sentenceCardTypes(settings) : settings.enabledTypes;
    if (!wanted.includes(type)) {
      return false;
    }
    // A radical with no reading has meaning and writing cards only.
    if (isRadical(word) && !RADICAL_CARD_TYPES.includes(type)) {
      return false;
    }
    if (type === 'writing') {
      return !unwritable.has(word.id);
    }
    if (type === 'tone') {
      // The pinyin must have one syllable per character.
      return toneAnswersOf(word) !== null;
    }
    return true;
  }

  // When the next card comes, for the summary at the end of Review.
  function describeWait(nextDueAt, now) {
    if (nextDueAt === null) {
      return 'Nothing is scheduled yet';
    }
    const minutes = Math.ceil((nextDueAt - now) / 60000);
    if (minutes <= 60) {
      return `Next card in ${minutes <= 1 ? 'about a minute' : `${minutes} minutes`}`;
    }
    if (minutes < 12 * 60) {
      const hours = Math.round(minutes / 60);
      return `Next card in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
    }
    const when = new Date(nextDueAt).toLocaleString([], {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Next card: ${when}`;
  }

  // The end of Review (UX review, 2026-10-17; the owner said yes to it): a
  // heading, how many cards were reviewed today, when the next comes and how
  // many more today and tomorrow, and the words waiting in Learn. A small
  // screen of its own, with room for more later (a streak, the rabbit).
  function doneSummary(plan, now, waiting) {
    const line = (text, className) => {
      const element = document.createElement('p');
      element.textContent = text;
      if (className) {
        element.className = className;
      }
      return element;
    };
    const heading = document.createElement('h2');
    heading.className = 'done-heading';
    heading.textContent = 'All done for now';
    const parts = [heading];
    if (plan.reviewedToday > 0) {
      parts.push(line(`You reviewed ${plural(plan.reviewedToday, 'card')} today.`));
    }
    const streak = settings.streaks ? streakLine(streakNow(now), streakGoal()) : '';
    if (streak) {
      parts.push(line(streak, 'done-streak'));
    }
    const coming = [describeWait(plan.nextDueAt, now)];
    if (plan.laterToday > 1) {
      // The next card is one of those later today.
      coming.push(`${plan.laterToday - 1} more later today`);
    }
    if (plan.tomorrow > 0) {
      coming.push(`${plan.tomorrow} tomorrow`);
    }
    parts.push(line(coming.join(' · '), 'done-next'));
    if (waiting) {
      parts.push(line(waiting));
    }
    return parts;
  }

  // Works out what is next and puts it on screen.
  async function showNext() {
    clearTimeout(recheckTimer);
    if (!active) {
      return;
    }
    practicing = false;
    atEnd = false;
    stopFlows();
    endLesson();
    hideGrades();
    learnNextButton.hidden = true;
    offerAdding(false);
    lessonBackButton.hidden = true;
    meaningElement.textContent = '';
    pinyinElement.hidden = true;
    pinyinButton.hidden = true;
    if (mode === 'learn') {
      showNextToLearn();
      return;
    }
    if (mode === 'lesson') {
      startRepeat();
      return;
    }
    justLearned = null;
    const now = Date.now();
    const studied = studyWords();
    const plan = planSession(studied, cards, now, {
      newWordsPerDay: goalForToday(),
      // Every kind: hasCardType says which are switched on, since
      // sentences have settings of their own.
      enabledTypes: CARD_TYPES,
      hasCardType,
      scriptOf: (word) => scriptFor(word, settings),
    });
    countsElement.textContent =
      `${plan.dueCount} to review · ${plan.newCardCount} new` +
      // Writing cards to be learned again after a change of script, or
      // cards of words from Anki that have no history there.
      (plan.newWordsLeftToday > 0
        ? ` · ${plan.newWordsLeftToday} ${plan.fromAnki ? 'more new today' : 'to write again'}`
        : '');

    if (!plan.next) {
      current = null;
      setFocus(false);
      offerListen(false);
      studyArea.hidden = true;
      typeElement.textContent = '';
      // The app starts with no words at all, and words wait to be learned.
      const waiting =
        plan.waitingCount > 0
          ? ` ${plan.waitingCount} ${plan.waitingCount === 1 ? 'word is' : 'words are'} waiting in Learn.`
          : '';
      if (words.length === 0) {
        doneMessage.textContent = 'You have no words yet.';
      } else if (studied.length === 0) {
        doneMessage.textContent = 'This deck has no words yet. Put some in it in Decks.';
      } else if (plan.waitingCount === studied.length) {
        doneMessage.textContent = `Nothing to review yet.${waiting}`;
      } else {
        // Review looks again every few seconds: put the summary in only
        // when it has changed, or it would be read out again each time.
        // The end of Review, after studying (the streak screen's moment).
        atEnd = true;
        const summary = doneSummary(plan, now, waiting.trim());
        const fresh = document.createElement('div');
        fresh.append(...summary);
        if (fresh.innerHTML !== doneMessage.innerHTML) {
          doneMessage.replaceChildren(...fresh.childNodes);
        }
      }
      // Learn is not in the menu (it is opened from a deck), so Review offers
      // the way there when words are waiting.
      learnNextButton.textContent = 'Learn new words';
      learnNextButton.hidden = plan.waitingCount === 0;
      offerAdding(words.length === 0);
      // The end of Review with words studied, as it comes up (not at each
      // look again): the moment for the message about keeping the words
      // (storageMessage.js).
      const arriving = donePanel.hidden;
      donePanel.hidden = false;
      if (arriving && words.length > 0 && studied.length > 0 && plan.waitingCount < studied.length) {
        document.dispatchEvent(new CustomEvent('screen-shown', { detail: 'reviewDone' }));
      }
      // Cards come back after a few minutes, so keep checking.
      recheckTimer = setTimeout(showNext, RECHECK_MS);
      return;
    }

    current = plan.next;
    stopwatch.start();
    setFocus(true);
    donePanel.hidden = true;
    studyArea.hidden = false;
    typeElement.textContent = isSentence(current.word)
      ? SENTENCE_LABELS[current.type]
      : isRadical(current.word)
        ? RADICAL_LABELS[current.type]
        : TYPE_LABELS[current.type];
    showScriptFlag(current.word);
    showPartsFor(current.type);
    offerListen(current.type === 'writing' || current.type === 'meaning');

    if (current.type === 'writing') {
      // A writing card that is new starts with its lesson, unless the word
      // was just taught in the Learn tab.
      // (Not a sentence: tracing its characters would teach little.)
      if (settings.lessons && !current.card && !isSentence(current.word) && !taughtInLearn(current.word)) {
        lesson = { steps: stepsFor(current.word, false), index: 0 };
      }
      const started = lesson ? await showLessonStep() : await showWritingCard();
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
    // Reads words and cards from the database: at startup, and again whenever
    // the Decks tab has changed them.
    load() {
      loading = (async () => {
        // Everything is read first and put in place together, so that nothing
        // sees new words beside old cards.
        const newWords = await getAll('words');
        const newCards = await getAll('cards');
        const newDecks = await getAll('decks');
        const newReviewTimes = (await getAll('reviews')).map(reviewTime);
        // import() fetches the table as its own file, so it doesn't make the
        // main program bigger. If it can't be loaded, tones are judged
        // against the word list alone.
        let table = null;
        try {
          table = (await import('../data/cedict/tones.json')).default;
        } catch {
          // left as null
        }
        words = newWords;
        decks = newDecks;
        showDeckChoice();
        toneTable = table;
        reviewTimes = newReviewTimes;
        cards.clear();
        for (const card of newCards) {
          cards.set(card.id, card);
        }
      })();
      return loading;
    },

    // Shows Review. If the words are being read afresh just now (a word was
    // changed a moment ago), that is waited for, or the card shown would be
    // chosen from what was there before.
    //
    // newMode: 'review', 'learn' for the Learn tab, or 'lesson' for
    //          repeating `word`'s lesson ("Repeat lesson" on its page)
    async activate(newMode = 'review', { word = null } = {}) {
      active = true;
      mode = newMode;
      repeatedWord = word;
      // The style sheet centers the kind of card in Learn (main.learning),
      // and in a lesson repeated, which looks the same.
      page.classList.toggle('learning', mode === 'learn' || mode === 'lesson');
      // A lesson repeated has no deck or counts: it is one word's.
      countsRow.hidden = mode === 'lesson';
      tappedSinceArriving = false;
      justLearned = null;
      await loading;
      showDeckChoice(); // the deck studied may have been chosen on its page
      const shown = showNext();
      // Back to studying the same study day, the streak screen not yet seen
      // (after the app was closed, say): now, before the next card.
      if (mode !== 'lesson') {
        showStreakIfWaiting();
      }
      return shown;
    },

    // The streak screen if it is waiting, at a pause: when the menu is opened
    // (the owner, 2026-10-19). then: what to do once it is closed. True if
    // it was shown (and then will be done), false if not.
    showStreakIfWaiting,

    // How many words wait in Learn for the deck studied (the menu shows it).
    waitingToLearn() {
      return learnCounts().waiting;
    },

    // Leaves the page ready for Free practice, which uses the writing parts.
    deactivate() {
      setFocus(false);
      page.classList.remove('learning');
      countsRow.hidden = false;
      showNotice('');
      offerListen(false);
      active = false;
      practicing = false;
      // The card is put away unanswered; its time is not kept.
      stopwatch.stop();
      clearTimeout(recheckTimer);
      stopFlows();
      donePanel.hidden = true;
      learnNextButton.hidden = true;
      offerAdding(false);
      studyArea.hidden = false;
      endLesson();
      showScriptFlag(null);
      showPartsFor('writing');
      hideGrades();
    },

    // Free practice of a tone, pinyin or meaning card. Call deactivate() first.
    practice,

    // True if a word can have this kind of card now (the Progress tab).
    hasCardType,

    // Works out the next card afresh, e.g. after a setting changed.
    refresh() {
      showDeckChoice(); // the deck studied may have been chosen elsewhere
      return showNext();
    },
  };
}
