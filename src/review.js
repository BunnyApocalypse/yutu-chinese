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

import { getAll, putAll, saveReview, saveKnown, randomId } from './db.js';
import { gradeOptions, GRADES, AGAIN, GOOD } from './scheduler.js';
import { deckWithInside, isInDecks, dailyGoal } from './decks.js';
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
} from './session.js';
import { toneAnswers, readingsFor, describeReading } from './tones.js';
import { scriptFor, scriptFlagFor } from './words.js';
import { isLeech, lapsesOf, isSuspended, withSuspended, becameLeech } from './leeches.js';
import { speak } from './speech.js';
import { markedKnown } from './cardManager.js';
import { isSentence, sentenceCardTypes, sentenceWriting } from './sentences.js';
import { isRadical, RADICAL_CARD_TYPES } from './radicals.js';

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

// elements: the page elements review controls:
//   countsElement, typeElement, meaningElement, pinyinElement, pinyinButton,
//   gradeRow, editWordButton, leechNote, donePanel, doneMessage, studyArea, scriptFlag,
//   lessonNote, skipLessonButton, lessonNextButton, learnNextButton,
//   and the parts of the study area that differ per kind of card:
//   wordRow, statusRow, writingRow, writingButtons, cardFace,
//   toneButtonRow, orderNote
// flows:    { writing, tone, recall }: the three pieces of code named above
// settings: the current settings (see settings.js)
// editWord(word): opens the word's panel to change it; returns a promise for
//           { changed, word } (see edit() in wordsPanel.js)
//
// The deck studied is chosen with `deckSelect`, at the top of Review and
// Learn (see "Studying one deck").
//
// Returns { load, activate, deactivate, practice, refresh }.
export function createReview(elements, flows, settings, editWord, showWord) {
  const {
    deckSelect,
    countsElement,
    typeElement,
    meaningElement,
    pinyinElement,
    pinyinButton,
    gradeRow,
    editWordButton,
    aboutWordButton,
    focusExit,
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
    wordRow,
    statusRow,
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
    // This belongs to the writing card and may be left over from the last one.
    orderNote.hidden = true;
    // A sentence's writing card lets its prompt run to two lines (see there).
    meaningElement.style.webkitLineClamp = '';
    meaningElement.style.maxHeight = '';
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

  function hideGrades() {
    gradeRow.hidden = true;
    editWordButton.hidden = true;
    aboutWordButton.hidden = true;
    leechNote.hidden = true;
    leechSuspendButton.hidden = true;
    options = null;
  }

  // ---- Hearing the word ----

  // ---- Focus ----
  //
  // While a card is up, the tabs and the line with the deck and the counts
  // are put away (the style sheet does it, for main.focused), so that the
  // writing area has their room. "‹ Menu" brings them back until the next
  // card; between cards, and when there is nothing to study, they are there.
  const page = document.querySelector('main');
  function setFocus(on) {
    page.classList.toggle('focused', on);
    page.classList.remove('show-nav');
    focusExit.hidden = !on;
  }
  focusExit.addEventListener('click', () => page.classList.add('show-nav'));

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
  aboutWordButton.addEventListener('click', () => {
    if (current) {
      showWord(current.word);
    }
  });

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
        'Switch it back on from the word\'s page (Words tab).',
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
    };
    await saveReview(newCard, review);
    cards.set(newCard.id, newCard);
    // Forgotten once too often: with that setting, the card is suspended.
    if (settings.leechAction === 'suspend' && becameLeech(card, newCard, settings.leechLapses)) {
      await suspend(word, type);
      // Said above the next card, until that one is graded.
      showNotice(
        `Suspended: the ${type} card of ${word[scriptFor(word, settings)]}, forgotten ${lapsesOf(newCard)} times. ` +
          'It will not come up again until you switch it back on in the word\'s panel (Decks tab).',
      );
    }
    if (current.learning) {
      // That was the last step of a new word's lesson.
      await finishLearning();
      return;
    }
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
    editWordButton.hidden = false;
    aboutWordButton.hidden = false;
    offerListen(true);
    // A card that keeps being forgotten is pointed out, now that its answer
    // is in view: the moment to think of a way to remember it.
    const lapses = lapsesOf(current.card);
    leechNote.textContent = `Leech: you have forgotten this card ${lapses} times. The Decks tab lists your leeches.`;
    leechNote.hidden = !isLeech(current.card, settings.leechLapses);
    leechSuspendButton.hidden = leechNote.hidden;
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
    });

    return flows.writing.start(asked.text, {
      script,
      rawInput: settings.rawInput,
      continueLabel: null,
      hideOutline: true,
      judgeChar,
      // Starting a character over after the word was finished takes the grade
      // buttons away again until it is finished once more.
      onCharStart: hideGrades,
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
  // bare outline, and only then writing it from memory. That last step is the
  // writing card as it always was: the only step that is graded, and what
  // starts the card's schedule. In Review, a writing card that is new for a
  // word already learned (a word from before there was a Learn tab, or one
  // to be written again in another script) gets the same lesson without the
  // first look.

  // The lesson in progress: { steps, index }, or null.
  let lesson = null;

  const LESSON_NOTES = {
    // Kept short: each shares a line with "I know this word", and a second
    // line pushes the writing area down the screen.
    meet: 'A new word: have a look.',
    tone: 'First its tones.',
    trace: 'Write each stroke as it is shown.',
    outline: 'Again, over the bare outline.',
    test: 'From memory. This one counts.',
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
    const kind = isRadical(word) ? 'New radical' : 'New word';
    typeElement.textContent = `${kind} · step ${lesson.index + 1} of ${lesson.steps.length}`;
    lessonNote.textContent = LESSON_NOTES[step];
    lessonNote.hidden = false;
    // "I know this word" is offered at every step.
    skipLessonButton.hidden = false;
    lessonNextButton.hidden = true;
    stopFlows();
    hideGrades();
    // A word being learned can be heard at every step.
    offerListen(true);

    if (step === 'test') {
      pinyinElement.hidden = true;
      showPartsFor('writing');
      return showWritingCard();
    }

    const script = scriptFor(word, settings);
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
      continueLabel: 'Next step',
      // The word is heard each time a step of its lesson is finished.
      onWordDone: speakAfterStep,
      onContinue: () => nextLessonStep(),
    });
  }

  async function nextLessonStep(toIndex = lesson.index + 1) {
    const shown = current;
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
    if (!lesson || !current) {
      return;
    }
    const { word, learning } = current;
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
    words = words.map((entry) => (entry.id === word.id ? known.word : entry));
    stopFlows();
    endLesson();
    if (learning) {
      justLearned = null;
      const { learnedToday, waiting } = learnCounts();
      countsElement.textContent = `Learned today ${learnedToday} of ${goalForToday()} · ${waiting} waiting`;
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

  // The word on screen has been through its lesson: mark it as learned.
  async function finishLearning() {
    const learned = { ...current.word, learnedAt: Date.now() };
    await putAll('words', [learned]);
    words = words.map((word) => (word.id === learned.id ? learned : word));
    justLearned = learned;
    showNext();
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

  // Shows a message where the card would be, and optionally the button that
  // goes on to the next word.
  function showLearnMessage(message, canGoOn) {
    current = null;
    setFocus(false);
    offerListen(false);
    studyArea.hidden = true;
    typeElement.textContent = '';
    doneMessage.textContent = message;
    learnNextButton.hidden = !canGoOn;
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

  learnNextButton.addEventListener('click', startNextWord);

  // What the Learn tab shows: the next word's lesson or, between two words
  // and when there is nothing to learn, a message.
  function showNextToLearn() {
    const { learnedToday, waiting } = learnCounts();
    const goal = goalForToday();
    countsElement.textContent = `Learned today ${learnedToday} of ${goal} · ${waiting} waiting`;
    const progress =
      learnedToday >= goal && goal > 0
        ? `That is today's goal: ${learnedToday} of ${goal}. Stop here, or go on if you like.`
        : `${learnedToday} of ${goal} today.`;

    if (justLearned) {
      const name = justLearned[scriptFor(justLearned, settings)];
      showLearnMessage(
        `${name} is learned: its cards will come up in Review. ${progress}` +
          (waiting === 0 ? ' No more words are waiting.' : ''),
        waiting > 0,
      );
    } else if (waiting === 0) {
      showLearnMessage(
        words.length === 0
          ? 'You have no words yet. Add some in the Decks tab.'
          : studyDeck()
            ? 'No words of this deck are waiting to be learned.'
            : 'No words are waiting to be learned. Add more in the Decks tab.',
        false,
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
    fillDeckSelect(deckSelect, decks, [{ value: '', label: 'All words' }]);
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
    endLesson();
    hideGrades();
    learnNextButton.hidden = true;
    meaningElement.textContent = '';
    pinyinElement.hidden = true;
    pinyinButton.hidden = true;
    if (mode === 'learn') {
      showNextToLearn();
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
      `Due ${plan.dueCount} · New cards ${plan.newCardCount}` +
      // Writing cards to be learned again after a change of script.
      (plan.newWordsLeftToday > 0 ? ` · To write again ${plan.newWordsLeftToday}` : '');

    if (!plan.next) {
      current = null;
      setFocus(false);
      offerListen(false);
      studyArea.hidden = true;
      typeElement.textContent = '';
      // The app starts with no words at all, and words wait to be learned.
      const waiting =
        plan.waitingCount > 0
          ? ` ${plan.waitingCount} ${plan.waitingCount === 1 ? 'word is' : 'words are'} waiting in the Learn tab.`
          : '';
      if (words.length === 0) {
        doneMessage.textContent = 'You have no words yet. Add some in the Decks tab.';
      } else if (studied.length === 0) {
        doneMessage.textContent = 'This deck has no words yet. Put some in it in the Decks tab.';
      } else if (plan.waitingCount === studied.length) {
        doneMessage.textContent = `Nothing to review yet.${waiting}`;
      } else {
        doneMessage.textContent = `All done for now. ${describeWait(plan.nextDueAt, now)}${waiting}`;
      }
      donePanel.hidden = false;
      // Cards come back after a few minutes, so keep checking.
      recheckTimer = setTimeout(showNext, RECHECK_MS);
      return;
    }

    current = plan.next;
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
      // A writing card that is new starts with its lesson.
      // (Not a sentence: tracing its characters would teach little.)
      if (settings.lessons && !current.card && !isSentence(current.word)) {
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
    // newMode: 'review', or 'learn' for the Learn tab
    async activate(newMode = 'review') {
      active = true;
      mode = newMode;
      tappedSinceArriving = false;
      justLearned = null;
      await loading;
      showDeckChoice(); // the deck studied may have been chosen on its page
      return showNext();
    },

    // Leaves the page ready for Free practice, which uses the writing parts.
    deactivate() {
      setFocus(false);
      showNotice('');
      offerListen(false);
      active = false;
      practicing = false;
      clearTimeout(recheckTimer);
      stopFlows();
      donePanel.hidden = true;
      learnNextButton.hidden = true;
      studyArea.hidden = false;
      endLesson();
      showScriptFlag(null);
      showPartsFor('writing');
      hideGrades();
    },

    // Free practice of a tone, pinyin or meaning card. Call deactivate() first.
    practice,

    // Works out the next card afresh, e.g. after a setting changed.
    refresh() {
      showDeckChoice(); // the deck studied may have been chosen elsewhere
      return showNext();
    },
  };
}
