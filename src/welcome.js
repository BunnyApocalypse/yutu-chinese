// The introduction shown the first time the app is opened: four short
// screens, one at a time, that set the app up (the look, the script with its
// pronunciation, a first level) and ask for long-term storage after saying
// why. The screens themselves are in index.html (the "welcome" dialog).
// Shortened on 2026-10-16 (the owner, after a tester found it far too
// wordy): the kinds of card are no longer chosen here (all four stay on;
// Settings has them), and the pronunciation follows the script.

import { getSetting, setSetting } from './db.js';
import { welcomeStorage } from './storageAdvice.js';
import { setTheme } from './theme.js';

const byId = (id) => document.getElementById(id);

// settings:  the current settings (see settings.js), with their change()
// keepData:  from offline.js: long-term storage and installing
// hasWords(): true if the word list is not empty
// onFinish(start): called when the last screen's button is tapped, and
//           waited for before the introduction closes. `start` is the
//           ready-made level chosen to begin with, { listId, level }, or
//           null for none.
//
// Returns { open(), openIfFirstTime() }.
export function createWelcome({ settings, keepData, hasWords, onFinish }) {
  const dialog = byId('welcome');
  const steps = [...dialog.querySelectorAll('[data-step]')];
  const progress = byId('welcome-progress');
  const backButton = byId('welcome-back');
  const nextButton = byId('welcome-next');
  const skipButton = byId('welcome-skip');
  const keepNote = byId('welcome-keep-note');
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

  // The level chosen to start with, or null.
  function startChosen() {
    const value = chosen('welcome-start');
    if (value === '') {
      return null;
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
    // On the last screen one button does what this browser needs to keep the
    // words (installing, or asking) and finishes, and "Not now" in place of
    // "Skip" finishes without it: at most three buttons on a screen (a
    // tester and the owner, 2026-10-16).
    const willAsk = last && storagePlan.action !== 'none';
    nextButton.textContent = !last
      ? 'Next'
      : storagePlan.action === 'install'
        ? 'Install the app and start'
        : storagePlan.action === 'ask'
          ? 'Keep my words safe and start'
          : startChosen()
          ? 'Start learning'
          : hasWords()
            ? 'Done'
            : 'Add my first words';
    skipButton.textContent = last ? 'Not now' : 'Skip the introduction';
    skipButton.hidden = last && !willAsk;
    // Each screen starts at its top, whatever was scrolled before.
    dialog.scrollTop = 0;
  }

  // The last screen: what this browser needs to keep the words, as
  // welcomeStorage() works it out, and a line about it.
  const mobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
  let storagePlan = { action: 'none', line: '' };
  async function showKeepState() {
    storagePlan = welcomeStorage(keepData.kind, await keepData.state(), mobile);
    keepNote.textContent = storagePlan.line;
    keepNote.hidden = storagePlan.line === '';
    // (Not while finishing: asking tells the listeners too, and the button
    // says "Adding words…" meanwhile.)
    if (!nextButton.disabled) {
      showStep();
    }
  }
  keepData.listen(showKeepState);

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
    finish(storagePlan.action);
  });

  // Saves the choices and closes, first doing what keeps the words:
  //   'install': the browser's own "install this app?" question. Asking for
  //              long-term storage too notes that it is wanted, so the app
  //              asks again by itself once installed (offline.js).
  //   'ask':     asking for long-term storage
  //   'none':    nothing (also "Not now")
  // Neither answer is waited for: Firefox puts its question at the top of
  // the page, which may stay there a while. Both are started before anything
  // is awaited, while the tap still counts as the person's own doing, which
  // browsers require for such questions.
  async function finish(storageAction) {
    if (storageAction === 'install') {
      keepData.install().catch(() => {});
    }
    if (storageAction !== 'none') {
      keepData.ask().catch(() => {});
    }
    await applyChoices();
    await setSetting('welcomeDone', true);
    // Adding a level takes a few seconds (the dictionary is read for the
    // meanings); the introduction stays up meanwhile.
    nextButton.disabled = true;
    backButton.disabled = true;
    skipButton.disabled = true;
    nextButton.textContent = startChosen() ? 'Adding words…' : nextButton.textContent;
    try {
      await onFinish(startChosen());
    } finally {
      nextButton.disabled = false;
      backButton.disabled = false;
      skipButton.disabled = false;
      dialog.close();
    }
  }

  // Skipping changes no settings. Esc closes a <dialog> too; "close" is
  // announced either way, so the introduction is not shown again unasked.
  // On the last screen the same button is "Not now": the choices are saved,
  // and only long-term storage is not asked for.
  skipButton.addEventListener('click', () => {
    if (step === steps.length - 1) {
      finish('none');
    } else {
      dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    setSetting('welcomeDone', true);
    // A look tried and then skipped is undone (after finishing, this is the
    // one just saved).
    setTheme(settings.theme);
  });

  function open() {
    // The screens start from the settings as they are.
    choose('welcome-theme', settings.theme);
    choose('welcome-script', settings.bothScripts ? `both-${settings.script}` : settings.script);
    choose('welcome-pronunciation', settings.pronunciation);
    pronunciationTouched = false;
    showPronunciation();
    startTouched = false;
    showKeepState();
    step = 0;
    showStep();
    // showModal() opens a <dialog> on top of the page and dims the rest.
    dialog.showModal();
  }

  return {
    open,
    async openIfFirstTime() {
      if (!(await getSetting('welcomeDone', false))) {
        open();
      }
    },
  };
}
