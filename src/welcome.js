// The introduction shown the first time the app is opened: four short
// screens, one at a time, that set the app up (the look, the script with its
// pronunciation, a first level) and ask for long-term storage after saying
// why. The screens themselves are in index.html (the "welcome" dialog).
// Shortened on 2026-10-16 (the owner, after a tester found it far too
// wordy): the kinds of card are no longer chosen here (all four stay on;
// Settings has them), and the pronunciation follows the script.
//
// Syncing (the owner, 2026-11-07; docs/sync.md), where there is a sync
// server: on the first screen, "Already using 玉兔中文 on another device?"
// joins with a code and skips the rest, since the words and settings come
// from the other device (choices made here would be newer and win); on the
// last, "Turn on sync" shows a new code, and the screen's button waits until
// it is ticked as saved.

import { getSetting, setSetting } from './db.js';
import { startingLevel } from './decks.js';
import { welcomeStorage } from './storageAdvice.js';
import { setTheme } from './theme.js';
import { t } from './text.js';
import { makeCode, readCode } from './syncCode.js';
import { scanForCode } from './syncScan.js';
import { showCode, copyCode, saveCodeFile, printCode, problemText, codeProblemText, progressText } from './syncCodeView.js';

const byId = (id) => document.getElementById(id);

// settings:  the current settings (see settings.js), with their change()
// keepData:  from offline.js: long-term storage and installing
// hasWords(): true if the word list is not empty
// onFinish(start): called when the last screen's button is tapped, and
//           waited for before the introduction closes. `start` is the
//           ready-made level chosen to begin with, { listId, level },
//           { anki: true } for a deck to import from Anki, or null for none.
// sync:     { available, join(code), joined(), turnOn(code) } (syncControl.js,
//           through main.js): whether there is a sync server; joining with
//           a code, giving the status after the first sync; what to do once
//           the introduction has closed after joining (main.js starts the
//           app again with what came); turning sync on with a new code, once
//           the introduction is finished
//
// Returns { open(), openIfFirstTime(), offerJoin(text) }.
export function createWelcome({ settings, keepData, hasWords, onFinish, sync }) {
  const dialog = byId('welcome');
  const steps = [...dialog.querySelectorAll('[data-step]')];
  const progress = byId('welcome-progress');
  const backButton = byId('welcome-back');
  const nextButton = byId('welcome-next');
  const skipButton = byId('welcome-skip');
  const bar = byId('welcome-bar');
  const keepNote = byId('welcome-keep-note');
  // The last screen's text: in general, or the steps to install in Safari
  // or in a Chromium browser without its install question (index.html).
  const keepTexts = {
    general: byId('welcome-keep-general'),
    homeScreen: byId('welcome-keep-home-screen'),
    dock: byId('welcome-keep-dock'),
    installPhone: byId('welcome-keep-install-phone'),
    installComputer: byId('welcome-keep-install-computer'),
  };
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
  const PRONUNCIATION_NAMES = {
    mainlandOnly: 'welcome.pronunciationMainland',
    taiwan: 'welcome.pronunciationTaiwan',
    mainland: 'welcome.pronunciationBoth',
  };
  let pronunciationTouched = false;
  function showPronunciation() {
    pronunciationSummary.textContent = t('welcome.pronunciationSummary', {
      name: t(PRONUNCIATION_NAMES[chosen('welcome-pronunciation')]),
    });
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
  // While finishing: the buttons are off, and nothing redraws the screen.
  let finishing = false;

  // ---- Syncing ----

  const joinPart = byId('welcome-join');
  const joinForm = byId('welcome-join-form');
  const joinInput = byId('welcome-code-input');
  const joinNote = byId('welcome-join-note');
  const syncPart = byId('welcome-sync');
  const codePart = byId('welcome-sync-code');
  const codeNote = byId('welcome-code-note');
  const savedBox = byId('welcome-code-saved');
  // The new code shown on the last screen, made when "Turn on sync" is
  // first chosen.
  let newCode = null;
  const syncChosen = () => chosen('welcome-sync') === 'on';

  // Whether a join is under way, with its progress shown (showSyncStatus).
  let joining = false;

  function openJoin() {
    joinForm.hidden = false;
    joinInput.focus();
  }
  byId('welcome-join-button').addEventListener('click', openJoin);

  // A code scanned goes in the box; joining is still a tap on the button.
  byId('welcome-scan-button').addEventListener('click', async () => {
    const code = await scanForCode();
    if (code) {
      joinInput.value = code;
      joinNote.hidden = true;
      byId('welcome-join-submit').focus();
    }
  });

  joinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const { code, reason } = await readCode(joinInput.value);
    joinNote.hidden = false;
    if (reason) {
      joinNote.textContent = codeProblemText(reason);
      return;
    }
    joinNote.textContent = t('welcome.joining');
    joining = true;
    const controls = [...joinForm.elements, nextButton, skipButton];
    controls.forEach((control) => {
      control.disabled = true;
    });
    const status = await sync.join(code);
    joining = false;
    controls.forEach((control) => {
      control.disabled = false;
    });
    if (status.problem) {
      // Sync is on all the same and tries again later; the introduction
      // stays, to be skipped or tried again.
      joinNote.textContent = problemText(status.problem);
      return;
    }
    // Saved before anything else, so that the introduction doesn't come back
    // when the app starts again.
    await setSetting('welcomeDone', true);
    dialog.close();
    await sync.joined();
  });

  for (const radio of dialog.querySelectorAll('input[name="welcome-sync"]')) {
    radio.addEventListener('change', async () => {
      if (syncChosen() && !newCode) {
        newCode = await makeCode();
        showCode({ codeElement: byId('welcome-code'), qrElement: byId('welcome-qr') }, newCode);
      }
      codePart.hidden = !syncChosen();
      showStep();
    });
  }
  savedBox.addEventListener('change', () => showStep());
  byId('welcome-copy-button').addEventListener('click', async () => {
    codeNote.textContent = await copyCode(newCode);
  });
  byId('welcome-file-button').addEventListener('click', () => {
    codeNote.textContent = saveCodeFile(newCode);
  });
  byId('welcome-print-button').addEventListener('click', () => printCode(newCode));

  // The radio button that is chosen in a group, and choosing one.
  const chosen = (name) => dialog.querySelector(`input[name="${name}"]:checked`).value;
  const choose = (name, value) => {
    dialog.querySelector(`input[name="${name}"][value="${value}"]`).checked = true;
  };

  // The level suggested to start with (startingLevel in decks.js: Taiwan's
  // list for traditional characters or Taiwan's pronunciation, the
  // mainland's otherwise); none for someone who has words already.
  function suggestStart() {
    if (startTouched) {
      return;
    }
    const { listId, level } = startingLevel({
      script: chosen('welcome-script').replace('both-', ''),
      pronunciation: chosen('welcome-pronunciation'),
    });
    choose('welcome-start', hasWords() ? '' : `${listId}|${level}`);
  }

  // The level chosen to start with, { from: 'anki' } or { from: 'skritter' }
  // for importing, or null.
  function startChosen() {
    const value = chosen('welcome-start');
    if (value === '') {
      return null;
    }
    if (value === 'anki' || value === 'skritter') {
      return { from: value };
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
    progress.textContent = t('welcome.stepOf', { step: step + 1, steps: steps.length });
    backButton.hidden = step === 0;
    // On the last screen one button does what this browser needs to keep the
    // words (installing, or asking) and finishes, and "Not now" in place of
    // "Skip" finishes without it: at most three buttons on a screen (a
    // tester and the owner, 2026-10-16).
    // ('later' starts as usual, with nothing to say "Not now" to.)
    const willAsk = last && (storagePlan.action === 'install' || storagePlan.action === 'ask');
    // Where the screen is steps to install (Safari, or Chromium without its
    // install question), they are what to do; starting here is the
    // exception, so its button is not the main one.
    const installSteps = last && Boolean(storagePlan.addTo);
    nextButton.classList.toggle('primary', !installSteps);
    nextButton.textContent = t(
      !last
        ? 'welcome.next'
        : installSteps
          ? keepData.kind === 'safari'
            ? 'welcome.startInSafari'
            : 'welcome.startInBrowser'
          : storagePlan.action === 'install'
            ? 'welcome.installAndStart'
            : storagePlan.action === 'ask'
              ? 'welcome.keepAndStart'
              : startChosen()?.from === 'anki'
                ? 'welcome.importAnki'
                : startChosen()?.from === 'skritter'
                  ? 'welcome.importSkritter'
                  : startChosen()
                    ? 'welcome.startLearning'
                    : hasWords()
                      ? 'welcome.done'
                      : 'welcome.addFirstWords',
    );
    skipButton.textContent = t(last ? 'welcome.notNow' : 'welcome.skip');
    skipButton.hidden = last && !willAsk;
    // With sync chosen, finishing waits until the code is ticked as saved.
    const waiting = last && syncChosen() && !savedBox.checked;
    nextButton.disabled = waiting;
    skipButton.disabled = waiting;
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

  // The last screen: what this browser needs to keep the words, as
  // welcomeStorage() works it out, and a line about it.
  let storagePlan = { action: 'none', line: '' };
  async function showKeepState() {
    storagePlan = welcomeStorage(keepData.kind, await keepData.state(), keepData.mobile);
    keepNote.textContent = storagePlan.line;
    keepNote.hidden = storagePlan.line === '';
    for (const [name, element] of Object.entries(keepTexts)) {
      element.hidden = name !== (storagePlan.addTo || 'general');
    }
    // (Not while finishing: asking tells the listeners too, and the button
    // says "Adding words…" meanwhile.)
    if (!finishing) {
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
  //   'later':   the same, quietly: in Chromium it only notes that it is
  //              wanted, for once the app is installed
  //   'none':    nothing (also "Not now")
  // Neither answer is waited for: Firefox puts its question at the top of
  // the page (the bottom on a phone), which may stay there a while. Both are started before anything
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
    finishing = true;
    nextButton.disabled = true;
    backButton.disabled = true;
    skipButton.disabled = true;
    nextButton.textContent = startChosen() && !startChosen().from ? t('welcome.addingWords') : nextButton.textContent;
    const syncCode = syncChosen() ? newCode : null;
    try {
      await onFinish(startChosen());
    } finally {
      finishing = false;
      nextButton.disabled = false;
      backButton.disabled = false;
      skipButton.disabled = false;
      dialog.close();
    }
    // After the level is added, so that the first sync sends it too (it
    // sends everything there is either way). Not waited for.
    if (syncCode) {
      sync.turnOn(syncCode);
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
    // Where sync is offered, "nothing sent anywhere" and "only in this
    // browser" hold until it is turned on, and the lines say so.
    byId('welcome-promise').textContent = t(sync.available ? 'welcome.learnToReadAndSync' : 'welcome.learnToReadAnd');
    byId('welcome-stored').textContent = t(sync.available ? 'welcome.yourWordsAreStoredSync' : 'welcome.yourWordsAreStored');
    joinPart.hidden = !sync.available;
    joinForm.hidden = true;
    joinNote.hidden = true;
    byId('welcome-from-link').hidden = true;
    syncPart.hidden = !sync.available;
    choose('welcome-sync', '');
    newCode = null;
    codePart.hidden = true;
    savedBox.checked = false;
    codeNote.textContent = '';
    showKeepState();
    step = 0;
    showStep();
    // showModal() opens a <dialog> on top of the page and dims the rest.
    dialog.showModal();
    // Only now does the panel have a size to measure.
    showCovering();
  }

  return {
    open,
    async openIfFirstTime() {
      if (!(await getSetting('welcomeDone', false))) {
        open();
      }
    },
    // What syncing is doing (syncControl.js's status): while joining, its
    // progress under the code box.
    showSyncStatus(status) {
      if (joining && status.progress) {
        joinNote.textContent = progressText(status.progress);
      }
    },
    // A code from a link (takeCodeFromLink in syncCodeView.js): on the first
    // screen, in the box with a warning, never joined by itself.
    offerJoin(text) {
      if (!dialog.open) {
        open();
      }
      joinInput.value = text;
      byId('welcome-from-link').hidden = false;
      openJoin();
    },
  };
}
