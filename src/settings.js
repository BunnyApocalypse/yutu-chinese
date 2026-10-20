// Settings: what they are, their defaults, and the panel for changing them.
// They are kept in the database's `settings` store, one record per setting.

import { getSetting, setSetting } from './db.js';
import { DEFAULT_MEANING_DETAIL } from './dictionary.js';
import { CARD_TYPES, DEFAULT_NEW_WORDS_PER_DAY } from './session.js';
import { DEFAULT_LEECH_LAPSES, MIN_LEECH_LAPSES, MAX_LEECH_LAPSES } from './leeches.js';
import { speak } from './speech.js';
import { setTheme } from './theme.js';
import { closeOnTapBeside } from './dialogs.js';
import {
  DEFAULT_STREAK_CARDS,
  DEFAULT_STREAK_WORDS,
  MAX_STREAK_CARDS,
  MAX_STREAK_WORDS,
} from './streak.js';

const MAX_NEW_WORDS_PER_DAY = 50;

// elements: the panel's parts:
//   panel, openButton, closeButton, scriptSelect, pronunciationSelect,
//   handwritingSelect, themeRadios (the three choices of look), lessonsCheckbox, strokeCountCheckbox,
//   hintSelect, newWordsInput, gradeButtonsSelect,
//   meaningDetailSelect,
//   typeCheckboxes (a list of the four checkboxes; each has a
//   data-card-type attribute saying which type it is)
// onChange: called after any setting changes
//
// Returns an object whose properties are the current settings:
// A new device starts out learning simplified only, with mainland
// pronunciation only: the owner's choice (2026-10-13) of what suits most
// learners, to whom a "Taiwan reading" box would only be confusing. The
// introduction asks about all of it straight away.
//
//   script:         'traditional' or 'simplified': the script cards are
//                   shown and written in
//   bothScripts:    true if both scripts are being learned; false if only
//                   `script` is, and the other one is kept out of sight
//   pronunciation:  which reading is shown and expected where a word is
//                   pronounced differently in Taiwan:
//                   'mainland' or 'taiwan': that one, with the other shown
//                   beside it and its tones accepted too
//                   'mainlandOnly': the mainland one, and Taiwan readings
//                   are kept out of sight
//   rawInput:      true to keep your own strokes on screen when writing,
//                   false to replace each correct stroke with the printed one
//   theme:          'auto' (the default: as the device is set, where the
//                   browser can tell; light otherwise), 'light' or 'dark'
//                   (see theme.js); belongs to the device
//   meaningDetail:  'first', 'everyday' or 'all': how much of a dictionary
//                   entry is filled in as a word's meaning (see
//                   proposeMeaning in dictionary.js)
//   lessons:        true to teach a word before it is first written from
//                   memory (tones, tracing; see review.js)
//   strokeCountInReview: true to show how many strokes a character has
//                   ("3/7") in Review too; it is always shown in Learn and
//                   Free practice. Off by default, since it is a hint (the
//                   owner, 2026-10-15).
//   gradeButtons:   'four' (the default: Again, Hard, Good, Easy) or 'two'
//                   (Wrong and Right, Right recorded as Good; gradeButtons in
//                   scheduler.js). The owner, 2026-10-20, after tester 3.
//   hintCountsAs:   'missed' (the default) or 'hard': how a character
//                   written with a hint is judged (judgeChar in session.js)
//   newWordsPerDay: a number
//   sound:          'auto' (the default) to speak a word by itself when
//                   its answer shows and when the loudspeaker is tapped,
//                   'tap' for the loudspeaker only, 'off' for no sound and
//                   no loudspeaker (see speech.js)
//   volume:         how loud words are spoken, from 0 (silent) to 1 (as loud
//                   as the device is set); belongs to the device
//   sentenceReading, sentenceWriting: which cards sentences have (see
//                   sentences.js): true or false, and 'word', 'sentence'
//                   or 'off'
//   leechLapses:    how many times a card has to be forgotten to be pointed
//                   out as a leech (see leeches.js)
//   leechAction:    'flag' to only point a leech out, 'suspend' to also
//                   suspend the card when it becomes one
//   streaks:        true to count a streak of days studied (streak.js): the
//                   streak screen and its line at the end of Review
//   streakCards, streakWords: how many cards reviewed, or words learned, make
//                   a day count for the streak
//   enabledTypes:   the card types switched on, e.g. ['meaning', 'writing']
//   studyDeck:      the ID of the deck studied in Review and Learn, or ''
//                   for all words. Chosen at the top of those two tabs, not
//                   in the panel.
// and one function, for setting them from elsewhere (the introduction):
//   change(key, value): saves a setting and tells the rest of the app
export async function createSettings(elements, onChange) {
  const {
    panel,
    openButton,
    closeButton,
    scriptSelect,
    pronunciationSelect,
    handwritingSelect,
    themeRadios,
    lessonsCheckbox,
    strokeCountCheckbox,
    hintSelect,
    gradeButtonsSelect,
    meaningDetailSelect,
    newWordsInput,
    leechInput,
    leechActionSelect,
    streaksCheckbox,
    streakCardsInput,
    streakWordsInput,
    streakGoal,
    soundSelect,
    volumeInput,
    sentenceReadingCheckbox,
    sentenceWritingSelect,
    typeCheckboxes,
  } = elements;

  const settings = {
    script: await getSetting('script', 'simplified'),
    bothScripts: await getSetting('bothScripts', false),
    pronunciation: await getSetting('pronunciation', 'mainlandOnly'),
    // Saved as 'rawSquigs' before the setting was renamed; a device that still
    // has it under the old name keeps its choice.
    rawInput: await getSetting('rawInput', await getSetting('rawSquigs', true)),
    theme: await getSetting('theme', 'auto'),
    lessons: await getSetting('lessons', true),
    strokeCountInReview: await getSetting('strokeCountInReview', false),
    hintCountsAs: await getSetting('hintCountsAs', 'missed'),
    gradeButtons: await getSetting('gradeButtons', 'four'),
    meaningDetail: await getSetting('meaningDetail', DEFAULT_MEANING_DETAIL),
    newWordsPerDay: await getSetting('newWordsPerDay', DEFAULT_NEW_WORDS_PER_DAY),
    leechLapses: await getSetting('leechLapses', DEFAULT_LEECH_LAPSES),
    leechAction: await getSetting('leechAction', 'flag'),
    streaks: await getSetting('streaks', true),
    streakCards: await getSetting('streakCards', DEFAULT_STREAK_CARDS),
    streakWords: await getSetting('streakWords', DEFAULT_STREAK_WORDS),
    sound: await getSetting('sound', 'auto'),
    volume: await getSetting('volume', 1),
    sentenceReading: await getSetting('sentenceReading', true),
    sentenceWriting: await getSetting('sentenceWriting', 'word'),
    enabledTypes: await getSetting('enabledTypes', CARD_TYPES),
    studyDeck: await getSetting('studyDeck', ''),
  };
  // "Follow device theme" needs nothing: the style sheet does that by itself.
  setTheme(settings.theme);

  // Shows the current settings in the panel's controls.
  function fillPanel() {
    // The Script list has four choices, for the two settings together.
    scriptSelect.value = settings.bothScripts ? `both-${settings.script}` : settings.script;
    pronunciationSelect.value = settings.pronunciation;
    handwritingSelect.value = settings.rawInput ? 'raw' : 'snap';
    for (const radio of themeRadios) {
      radio.checked = radio.value === settings.theme;
    }
    lessonsCheckbox.checked = settings.lessons;
    strokeCountCheckbox.checked = settings.strokeCountInReview;
    hintSelect.value = settings.hintCountsAs;
    gradeButtonsSelect.value = settings.gradeButtons;
    meaningDetailSelect.value = settings.meaningDetail;
    newWordsInput.value = settings.newWordsPerDay;
    leechInput.value = settings.leechLapses;
    leechActionSelect.value = settings.leechAction;
    streaksCheckbox.checked = settings.streaks;
    streakCardsInput.value = settings.streakCards;
    streakWordsInput.value = settings.streakWords;
    // How much makes a day count matters only with streaks on.
    streakGoal.hidden = !settings.streaks;
    soundSelect.value = settings.sound;
    volumeInput.value = Math.round(settings.volume * 100);
    sentenceReadingCheckbox.checked = settings.sentenceReading;
    sentenceWritingSelect.value = settings.sentenceWriting;
    for (const checkbox of typeCheckboxes) {
      checkbox.checked = settings.enabledTypes.includes(checkbox.dataset.cardType);
    }
  }

  async function change(key, value) {
    settings[key] = value;
    // The look changes at once, before the setting is saved.
    if (key === 'theme') {
      setTheme(value);
    }
    await setSetting(key, value);
    onChange();
  }

  scriptSelect.addEventListener('change', async () => {
    // Both halves of the choice are set before either is saved, so nothing
    // that looks at the settings meanwhile sees one without the other.
    const both = scriptSelect.value.startsWith('both-');
    settings.bothScripts = both;
    settings.script = scriptSelect.value.replace('both-', '');
    await setSetting('bothScripts', both);
    await change('script', settings.script);
  });
  pronunciationSelect.addEventListener('change', () =>
    change('pronunciation', pronunciationSelect.value),
  );

  handwritingSelect.addEventListener('change', () =>
    change('rawInput', handwritingSelect.value === 'raw'),
  );

  for (const radio of themeRadios) {
    radio.addEventListener('change', () => change('theme', radio.value));
  }

  lessonsCheckbox.addEventListener('change', () => change('lessons', lessonsCheckbox.checked));

  strokeCountCheckbox.addEventListener('change', () =>
    change('strokeCountInReview', strokeCountCheckbox.checked),
  );

  hintSelect.addEventListener('change', () => change('hintCountsAs', hintSelect.value));
  gradeButtonsSelect.addEventListener('change', () => change('gradeButtons', gradeButtonsSelect.value));

  meaningDetailSelect.addEventListener('change', () =>
    change('meaningDetail', meaningDetailSelect.value),
  );

  // A "?" beside a setting shows its explanation: while a mouse is over it,
  // and on a tap or click until the next one (a finger cannot hover). Which
  // explanation is the button's, its aria-controls attribute says.
  for (const helpButton of panel.querySelectorAll('.help-button')) {
    const hint = document.getElementById(helpButton.getAttribute('aria-controls'));
    let pinned = false;
    const showHint = (shown) => {
      hint.hidden = !shown;
      helpButton.setAttribute('aria-expanded', String(shown));
    };
    helpButton.addEventListener('click', () => {
      pinned = !pinned;
      showHint(pinned);
    });
    // Pointer events cover mouse, finger and pen; pointerType says which.
    helpButton.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'mouse') {
        showHint(true);
      }
    });
    helpButton.addEventListener('pointerleave', (event) => {
      if (event.pointerType === 'mouse') {
        showHint(pinned);
      }
    });
  }

  newWordsInput.addEventListener('change', () => {
    // Whatever was typed, end up with a whole number in the allowed range.
    const typed = Math.round(Number(newWordsInput.value));
    const value = Number.isFinite(typed) ? Math.min(MAX_NEW_WORDS_PER_DAY, Math.max(0, typed)) : settings.newWordsPerDay;
    newWordsInput.value = value;
    change('newWordsPerDay', value);
  });

  leechActionSelect.addEventListener('change', () => change('leechAction', leechActionSelect.value));
  soundSelect.addEventListener('change', () => change('sound', soundSelect.value));
  sentenceReadingCheckbox.addEventListener('change', () => change('sentenceReading', sentenceReadingCheckbox.checked));
  sentenceWritingSelect.addEventListener('change', () => change('sentenceWriting', sentenceWritingSelect.value));
  // "change" comes when the slider is let go of. A word is spoken then, so
  // the new volume can be heard against whatever else is playing.
  volumeInput.addEventListener('change', async () => {
    await change('volume', Number(volumeInput.value) / 100);
    speak({ simplified: '中文', traditional: '中文', pinyin: 'Zhong1wen2' }, 'Zhong1wen2', 'mainland', settings.volume);
  });

  leechInput.addEventListener('change', () => {
    const typed = Math.round(Number(leechInput.value));
    const value = Number.isFinite(typed)
      ? Math.min(MAX_LEECH_LAPSES, Math.max(MIN_LEECH_LAPSES, typed))
      : settings.leechLapses;
    leechInput.value = value;
    change('leechLapses', value);
  });

  streaksCheckbox.addEventListener('change', () => {
    streakGoal.hidden = !streaksCheckbox.checked;
    change('streaks', streaksCheckbox.checked);
  });
  // Whatever was typed, a whole number from 1 up to the largest allowed.
  const streakNumber = (input, key, max) =>
    input.addEventListener('change', () => {
      const typed = Math.round(Number(input.value));
      const value = Number.isFinite(typed) ? Math.min(max, Math.max(1, typed)) : settings[key];
      input.value = value;
      change(key, value);
    });
  streakNumber(streakCardsInput, 'streakCards', MAX_STREAK_CARDS);
  streakNumber(streakWordsInput, 'streakWords', MAX_STREAK_WORDS);

  for (const checkbox of typeCheckboxes) {
    checkbox.addEventListener('change', () => {
      const enabled = typeCheckboxes.filter((box) => box.checked).map((box) => box.dataset.cardType);
      if (enabled.length === 0) {
        // With no card type on there would be nothing to review.
        checkbox.checked = true;
        return;
      }
      change('enabledTypes', enabled);
    });
  }

  // ---- One group at a time ----
  //
  // The panel shows one group of settings at a time (the owner, 2026-10-16,
  // from a tester's suggestion; until then each group folded away). On a
  // narrow screen it opens on the list of groups, a tap on one shows only
  // that group, and "‹ Settings" goes back to the list. On a wide screen the
  // list stays at the side, and the first group is shown to begin with.
  // `data-view` on the panel ('list' or 'group') tells the style sheet which
  // to show on a narrow screen.
  const wide = window.matchMedia('(min-width: 720px)');
  const navButtons = [...panel.querySelectorAll('#settings-nav button')];
  const groups = [...panel.querySelectorAll('.settings-group')];
  const backButton = panel.querySelector('#settings-back');
  const title = panel.querySelector('#settings-title');

  // Shows the group with this ID, or the list if it is null.
  function showGroup(id) {
    for (const group of groups) {
      group.hidden = group.id !== id;
    }
    for (const button of navButtons) {
      button.setAttribute('aria-current', String(button.dataset.group === id));
    }
    panel.dataset.view = id === null ? 'list' : 'group';
    // "‹ Settings" in place of the title, on a narrow screen inside a group.
    const inGroup = id !== null && !wide.matches;
    backButton.hidden = !inGroup;
    title.hidden = inGroup;
    panel.scrollTop = 0;
  }

  for (const button of navButtons) {
    button.addEventListener('click', () => showGroup(button.dataset.group));
  }
  backButton.addEventListener('click', () => showGroup(null));
  // Turning a tablet can make the screen wide or narrow while it is open.
  wide.addEventListener('change', () => {
    const shown = groups.find((group) => !group.hidden);
    showGroup(shown ? shown.id : wide.matches ? groups[0].id : null);
  });

  // showModal() opens a <dialog> on top of the page and dims the rest.
  openButton.addEventListener('click', () => {
    fillPanel();
    showGroup(wide.matches ? groups[0].id : null);
    panel.showModal();
  });
  closeButton.addEventListener('click', () => panel.close());
  // A tap beside the panel closes it too (dialogs.js).
  closeOnTapBeside(panel);

  fillPanel();
  settings.change = change;
  return settings;
}
