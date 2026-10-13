// Settings: what they are, their defaults, and the panel for changing them.
// They are kept in the database's `settings` store, one record per setting.

import { getSetting, setSetting } from './db.js';
import { DEFAULT_MEANING_DETAIL } from './dictionary.js';
import { CARD_TYPES, DEFAULT_NEW_WORDS_PER_DAY } from './session.js';

const MAX_NEW_WORDS_PER_DAY = 50;

// elements: the panel's parts:
//   panel, openButton, closeButton, scriptSelect, pronunciationSelect,
//   handwritingSelect, lessonsCheckbox, newWordsInput,
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
//   meaningDetail:  'first', 'everyday' or 'all': how much of a dictionary
//                   entry is filled in as a word's meaning (see
//                   proposeMeaning in dictionary.js)
//   lessons:        true to teach a word before it is first written from
//                   memory (tones, tracing; see review.js)
//   newWordsPerDay: a number
//   enabledTypes:   the card types switched on, e.g. ['meaning', 'writing']
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
    lessonsCheckbox,
    meaningDetailSelect,
    newWordsInput,
    typeCheckboxes,
  } = elements;

  const settings = {
    script: await getSetting('script', 'simplified'),
    bothScripts: await getSetting('bothScripts', false),
    pronunciation: await getSetting('pronunciation', 'mainlandOnly'),
    // Saved as 'rawSquigs' before the setting was renamed; a device that still
    // has it under the old name keeps its choice.
    rawInput: await getSetting('rawInput', await getSetting('rawSquigs', true)),
    lessons: await getSetting('lessons', true),
    meaningDetail: await getSetting('meaningDetail', DEFAULT_MEANING_DETAIL),
    newWordsPerDay: await getSetting('newWordsPerDay', DEFAULT_NEW_WORDS_PER_DAY),
    enabledTypes: await getSetting('enabledTypes', CARD_TYPES),
  };

  // Shows the current settings in the panel's controls.
  function fillPanel() {
    // The Script list has four choices, for the two settings together.
    scriptSelect.value = settings.bothScripts ? `both-${settings.script}` : settings.script;
    pronunciationSelect.value = settings.pronunciation;
    handwritingSelect.value = settings.rawInput ? 'raw' : 'snap';
    lessonsCheckbox.checked = settings.lessons;
    meaningDetailSelect.value = settings.meaningDetail;
    newWordsInput.value = settings.newWordsPerDay;
    for (const checkbox of typeCheckboxes) {
      checkbox.checked = settings.enabledTypes.includes(checkbox.dataset.cardType);
    }
  }

  async function change(key, value) {
    settings[key] = value;
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

  lessonsCheckbox.addEventListener('change', () => change('lessons', lessonsCheckbox.checked));

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

  // showModal() opens a <dialog> on top of the page and dims the rest.
  openButton.addEventListener('click', () => {
    fillPanel();
    panel.showModal();
  });
  closeButton.addEventListener('click', () => panel.close());

  fillPanel();
  settings.change = change;
  return settings;
}
