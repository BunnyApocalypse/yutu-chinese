// Settings: what they are, their defaults, and the panel for changing them.
// They are kept in the database's `settings` store, one record per setting.

import { getSetting, setSetting } from './db.js';
import { CARD_TYPES, DEFAULT_NEW_WORDS_PER_DAY } from './session.js';

const MAX_NEW_WORDS_PER_DAY = 50;

// elements: the panel's parts:
//   panel, openButton, closeButton, scriptSelect, pronunciationSelect,
//   handwritingSelect, newWordsInput,
//   typeCheckboxes (a list of the four checkboxes; each has a
//   data-card-type attribute saying which type it is)
// onChange: called after any setting changes
//
// Returns an object whose properties are the current settings:
//   script:         'traditional' or 'simplified'
//   pronunciation:  'mainland' or 'taiwan': which reading is shown and
//                   expected where a word is pronounced differently
//   rawSquigs:      true to keep your own strokes on screen when writing,
//                   false to replace each correct stroke with the printed one
//   newWordsPerDay: a number
//   enabledTypes:   the card types switched on, e.g. ['meaning', 'writing']
export async function createSettings(elements, onChange) {
  const {
    panel,
    openButton,
    closeButton,
    scriptSelect,
    pronunciationSelect,
    handwritingSelect,
    newWordsInput,
    typeCheckboxes,
  } = elements;

  const settings = {
    script: await getSetting('script', 'traditional'),
    pronunciation: await getSetting('pronunciation', 'mainland'),
    rawSquigs: await getSetting('rawSquigs', true),
    newWordsPerDay: await getSetting('newWordsPerDay', DEFAULT_NEW_WORDS_PER_DAY),
    enabledTypes: await getSetting('enabledTypes', CARD_TYPES),
  };

  // Shows the current settings in the panel's controls.
  function fillPanel() {
    scriptSelect.value = settings.script;
    pronunciationSelect.value = settings.pronunciation;
    handwritingSelect.value = settings.rawSquigs ? 'raw' : 'snap';
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

  scriptSelect.addEventListener('change', () => change('script', scriptSelect.value));
  pronunciationSelect.addEventListener('change', () =>
    change('pronunciation', pronunciationSelect.value),
  );

  handwritingSelect.addEventListener('change', () =>
    change('rawSquigs', handwritingSelect.value === 'raw'),
  );

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
  return settings;
}
