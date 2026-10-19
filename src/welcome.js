// The introduction shown the first time the app is opened: three short
// screens, one at a time, that set the app up (the look, the script with its
// pronunciation, a first level). The screens themselves are in index.html
// (the "welcome" dialog).
// Shortened on 2026-10-16 (the owner, after a tester found it far too
// wordy): the kinds of card are no longer chosen here (all four stay on;
// Settings has them), and the pronunciation follows the script.
//
// Roadmap item 2 (draft of 2026-10-19; tester 2: people want to try an app
// before studying it): the first screen's main button, "Try writing a
// character", closes the introduction for a character written as in a
// lesson, nothing saved (the mode 'try', main.js and review.js), and
// "Start learning" there opens it again where it was left (resume). The
// screen about keeping the words safe is gone from here: Learn says it once
// the first word is learned, when there is something to lose
// (storageMessage.js).

import { getSetting, setSetting } from './db.js';
import { setTheme } from './theme.js';

const byId = (id) => document.getElementById(id);

// settings:  the current settings (see settings.js), with their change()
// hasWords(): true if the word list is not empty
// onTry():   called when "Try writing a character" is tapped, after the
//           introduction has closed
// onSkip():  called when the introduction is closed without finishing it
// onFinish(start): called when the last screen's button is tapped, and
//           waited for before the introduction closes. `start` is the
//           ready-made level chosen to begin with, { listId, level },
//           { anki: true } for a deck to import from Anki, or null for none.
//
// Returns { open(), openIfFirstTime(), resume(step) }.
export function createWelcome({ settings, hasWords, onTry, onSkip, onFinish }) {
  const dialog = byId('welcome');
  const steps = [...dialog.querySelectorAll('[data-step]')];
  const progress = byId('welcome-progress');
  const backButton = byId('welcome-back');
  const nextButton = byId('welcome-next');
  const skipButton = byId('welcome-skip');
  const tryButton = byId('welcome-try');
  const bar = byId('welcome-bar');
  const startRadios = [...dialog.querySelectorAll('input[name="welcome-start"]')];
  // Whether the level to start with was chosen by hand; until it is, it
  // follows the script and pronunciation chosen before.
  let startTouched = false;
  startRadios.forEach((radio) => radio.addEventListener('change', () => {
    startTouched = true;
    showStep();
  }));

  // The pronunciation follows the script chosen, until it is chosen by hand
  // under "Pronunciation" on the same screen.
  const pronunciationSummary = byId('welcome-pronunciation-summary');
  const PRONUNCIATION_FOR_SCRIPT = {
    simplified: 'mainlandOnly',
    traditional: 'taiwan',
    // Both scripts: both readings accepted, the mainland one listed first
    // (the owner, 2026-10-16).
    'both-simplified': 'mainland',
    'both-traditional': 'mainland',
  };
  const PRONUNCIATION_NAMES = { mainlandOnly: 'Mainland China', taiwan: 'Taiwan', mainland: 'Accept both' };
  let pronunciationTouched = false;
  function showPronunciation() {
    pronunciationSummary.textContent = `Pronunciation: ${PRONUNCIATION_NAMES[chosen('welcome-pronunciation')]}`;
  }
  for (const radio of dialog.querySelectorAll('input[name="welcome-script"]')) {
    radio.addEventListener('change', () => {
      if (!pronunciationTouched) {
        choose('welcome-pronunciation', PRONUNCIATION_FOR_SCRIPT[radio.value]);
        showPronunciation();
      }
    });
  }
  for (const radio of dialog.querySelectorAll('input[name="welcome-pronunciation"]')) {
    radio.addEventListener('change', () => {
      pronunciationTouched = true;
      showPronunciation();
    });
  }

  // The look is shown at once as it is chosen, before it is saved.
  for (const radio of dialog.querySelectorAll('input[name="welcome-theme"]')) {
    radio.addEventListener('change', () => setTheme(radio.value));
  }

  // Which screen is showing, counting from 0.
  let step = 0;

  // The radio button that is chosen in a group, and choosing one.
  const chosen = (name) => dialog.querySelector(`input[name="${name}"]:checked`).value;
  const choose = (name, value) => {
    dialog.querySelector(`input[name="${name}"][value="${value}"]`).checked = true;
  };

  // The level suggested to start with: Taiwan's list for someone learning
  // traditional characters or Taiwan's pronunciation first, the mainland's
  // otherwise; none for someone who has words already.
  function suggestStart() {
    if (startTouched) {
      return;
    }
    const taiwanese = chosen('welcome-script').endsWith('traditional') || chosen('welcome-pronunciation') === 'taiwan';
    choose('welcome-start', hasWords() ? '' : taiwanese ? 'tocfl|Novice 1' : 'hsk-3.0|1');
  }

  // The level chosen to start with, { anki: true }, or null.
  function startChosen() {
    const value = chosen('welcome-start');
    if (value === '') {
      return null;
    }
    if (value === 'anki') {
      return { anki: true };
    }
    const [listId, level] = value.split('|');
    return { listId, level };
  }

  function showStep() {
    steps.forEach((section, index) => {
      section.hidden = index !== step;
    });
    if (steps[step].contains(startRadios[0])) {
      suggestStart();
    }
    const last = step === steps.length - 1;
    progress.textContent = `${step + 1} of ${steps.length}`;
    backButton.hidden = step === 0;
    // On the first screen the main button is "Try writing a character", so
    // Next is a plain one there: one main button on a screen.
    nextButton.classList.toggle('primary', step !== 0);
    nextButton.textContent = !last
      ? 'Next'
      : startChosen()?.anki
        ? 'Import my Anki deck'
        : startChosen()
          ? 'Start learning'
          : hasWords()
            ? 'Done'
            : 'Add my first words';
    skipButton.hidden = last;
    // Each screen starts at its top, whatever was scrolled before.
    dialog.scrollTop = 0;
    showCovering();
  }

  // The line above Back and Next (style.css, .welcome-bar), while there is
  // more of the screen below them to scroll to. Looked at again when the
  // panel scrolls, a fold opens or closes, or the screen turns. ("toggle"
  // does not travel up from the fold to the panel, so it is caught on the
  // way down: the `true` below. "passive" tells the browser this never stops
  // the scrolling.)
  function showCovering() {
    bar.classList.toggle('covering', dialog.scrollTop + dialog.clientHeight < dialog.scrollHeight - 1);
  }
  dialog.addEventListener('scroll', showCovering, { passive: true });
  dialog.addEventListener('toggle', showCovering, true);
  window.addEventListener('resize', showCovering);

  // Saves what was chosen on the screens.
  async function applyChoices() {
    await settings.change('theme', chosen('welcome-theme'));
    const script = chosen('welcome-script');
    await settings.change('bothScripts', script.startsWith('both-'));
    await settings.change('script', script.replace('both-', ''));
    await settings.change('pronunciation', chosen('welcome-pronunciation'));
  }

  backButton.addEventListener('click', () => {
    step -= 1;
    showStep();
  });

  nextButton.addEventListener('click', () => {
    if (step < steps.length - 1) {
      step += 1;
      showStep();
      return;
    }
    finish();
  });

  // True from "Try writing a character" until the introduction's "close"
  // event, which then neither marks the introduction done nor undoes the
  // look being tried: it is only put aside.
  let tryingOut = false;
  // Set by finish(), so that its "close" is not taken for a skip.
  let finished = false;
  tryButton.addEventListener('click', () => {
    tryingOut = true;
    dialog.close();
    onTry();
  });

  // Saves the choices and closes.
  async function finish() {
    await applyChoices();
    await setSetting('welcomeDone', true);
    // Adding a level takes a few seconds (the dictionary is read for the
    // meanings); the introduction stays up meanwhile.
    nextButton.disabled = true;
    backButton.disabled = true;
    nextButton.textContent = startChosen() && !startChosen().anki ? 'Adding words…' : nextButton.textContent;
    try {
      await onFinish(startChosen());
    } finally {
      nextButton.disabled = false;
      backButton.disabled = false;
      finished = true;
      dialog.close();
    }
  }

  // Skipping changes no settings. Esc closes a <dialog> too; "close" is
  // announced either way, so the introduction is not shown again unasked.
  skipButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (tryingOut) {
      tryingOut = false;
      return;
    }
    setSetting('welcomeDone', true);
    // A look tried and then skipped is undone (after finishing, this is the
    // one just saved).
    setTheme(settings.theme);
    if (!finished) {
      onSkip();
    }
    finished = false;
  });

  function open() {
    // The screens start from the settings as they are.
    choose('welcome-theme', settings.theme);
    choose('welcome-script', settings.bothScripts ? `both-${settings.script}` : settings.script);
    choose('welcome-pronunciation', settings.pronunciation);
    pronunciationTouched = false;
    showPronunciation();
    startTouched = false;
    resume(0);
  }

  // Opens the introduction at a screen, with the choices as they were left
  // (after trying a character, "Start learning" goes on to the second).
  function resume(atStep) {
    step = atStep;
    showStep();
    // showModal() opens a <dialog> on top of the page and dims the rest.
    dialog.showModal();
    // Only now does the panel have a size to measure.
    showCovering();
  }

  return {
    open,
    resume,
    async openIfFirstTime() {
      if (!(await getSetting('welcomeDone', false))) {
        open();
      }
    },
  };
}
