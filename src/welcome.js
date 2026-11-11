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
// opens a screen of its own for joining with a code, which skips the
// choices, since the words and settings come from the other device (choices
// made here would be newer and win); once joined, it says what came and
// goes on to the last screen's lines on keeping the words, without the
// choice to turn sync on (the owner, 2026-11-08). On the last screen, "Turn on sync" shows a new code, and the screen's button waits until
// it is ticked as saved. Both have "Self-hosting?" folded away, for choosing
// another sync server (syncServerChoice.js; the owner, 2026-11-08).

import { getSetting, setSetting, countAll } from './db.js';
import { startingLevel } from './decks.js';
import { welcomeStorage } from './storageAdvice.js';
import { setTheme } from './theme.js';
import { t } from './text.js';
import { makeCode, readCode } from './syncCode.js';
import { scanForCode } from './syncScan.js';
import { showCode, copyCode, saveCodeFile, printCode, problemText, codeProblemText, progressText } from './syncCodeView.js';
import { createServerChoice, hostOf } from './syncServerChoice.js';

const byId = (id) => document.getElementById(id);

// settings:  the current settings (see settings.js), with their change()
// keepData:  from offline.js: long-term storage and installing
// hasWords(): true if the word list is not empty
// onFinish(start): called when the last screen's button is tapped, and
//           waited for before the introduction closes. `start` is the
//           ready-made level chosen to begin with, { listId, level },
//           { anki: true } for a deck to import from Anki, or null for none.
// sync:     { available, control, join(code), turnOn(code) }
//           (syncControl.js, through main.js): whether there is a sync
//           server; the sync control, for choosing a server; joining with
//           a code, giving the status after the first sync (whose changes,
//           settings too, are in effect by then); turning sync on with a
//           new code, once the introduction is finished
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
  // 'steps': the screens one at a time; 'join': the screen for joining
  // another device; 'joined': after joining, the last screen with what came.
  let mode = 'steps';
  // While finishing: the buttons are off, and nothing redraws the screen.
  let finishing = false;

  // ---- Syncing ----

  const joinPart = byId('welcome-join');
  const joinScreen = byId('welcome-join-screen');
  const joinedPart = byId('welcome-joined');
  const joinForm = byId('welcome-join-form');
  const joinInput = byId('welcome-code-input');
  const joinNote = byId('welcome-join-note');
  const syncPart = byId('welcome-sync');
  const codePart = byId('welcome-sync-code');
  const codeNote = byId('welcome-code-note');
  const savedBox = byId('welcome-code-saved');
  // The new code shown on the last screen, made when "Turn on sync" is
  // first chosen, and the server in its link (linkServer in syncControl.js).
  let newCode = null;
  let newServer = '';
  async function showNewCode() {
    newServer = await sync.control.linkServer();
    showCode({ codeElement: byId('welcome-code'), qrElement: byId('welcome-qr') }, newCode, newServer);
  }

  // "Self-hosting?": the same server for both, chosen in either. A server
  // chosen after the code was shown goes into its QR code.
  const joinServer = createServerChoice('welcome-join', sync.control);
  createServerChoice('welcome-sync', sync.control, {
    onChosen: async () => {
      if (newCode) {
        await showNewCode();
      }
    },
  });
  // (None is chosen until the introduction is first opened.)
  const syncChosen = () => dialog.querySelector('input[name="welcome-sync"]:checked')?.value === 'on';

  // Whether a join is under way, with its progress shown (showSyncStatus).
  let joining = false;

  // In Safari outside the Home Screen or the Dock (storagePlan.addTo), the
  // app put there keeps its words apart from Safari's, so the screen says to
  // add it and sync there, and the code box waits behind "Sync in Safari
  // anyway" (the owner, 2026-11-08). A code from a link shows it at once.
  function openJoin({ fromLink = false } = {}) {
    mode = 'join';
    const inSafari = storagePlan.addTo === 'homeScreen' || storagePlan.addTo === 'dock';
    byId('welcome-join-safari').hidden = !inSafari;
    byId('welcome-join-home-screen').hidden = storagePlan.addTo !== 'homeScreen';
    byId('welcome-join-dock').hidden = storagePlan.addTo !== 'dock';
    showJoinParts(!inSafari || fromLink);
    showStep();
    if (!inSafari || fromLink) {
      joinInput.focus();
    }
  }
  function showJoinParts(shown) {
    byId('welcome-join-parts').hidden = !shown;
    byId('welcome-join-anyway').hidden = shown;
  }
  byId('welcome-join-button').addEventListener('click', () => openJoin());
  byId('welcome-join-anyway').addEventListener('click', () => {
    showJoinParts(true);
    joinInput.focus();
  });

  // A code scanned goes in the box; joining is still a tap on the button.
  byId('welcome-scan-button').addEventListener('click', async () => {
    const found = await scanForCode();
    if (found) {
      joinInput.value = found.code;
      if (found.server) {
        joinServer.useFromLink(found.server);
      }
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
    const controls = [...joinForm.elements, backButton];
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
    // Joined: the words and settings are here and in effect. Saved now, so
    // that the introduction doesn't come back if the app is closed before
    // the last screen's button.
    await setSetting('welcomeDone', true);
    await showJoined();
  });

  // After joining: what came from the other device, then the last screen's
  // lines on keeping the words.
  async function showJoined() {
    const address = await sync.control.server();
    const lines = [
      t('welcome.joinedWords', { count: await countAll('words') }),
      t('welcome.joinedSettings'),
      address ? t('sync.through', { host: hostOf(address) }) : '',
    ].filter(Boolean);
    byId('welcome-joined-details').replaceChildren(...lines.map((line) => {
      const item = document.createElement('li');
      item.textContent = line;
      return item;
    }));
    mode = 'joined';
    step = steps.length - 1;
    await showKeepState();
  }

  async function showSyncChoice() {
    if (syncChosen() && !newCode) {
      newCode = await makeCode();
      await showNewCode();
    }
    codePart.hidden = !syncChosen();
    // With sync on, the line about this browser keeping the words no
    // longer says to export backups (welcomeStorage).
    showKeepState();
  }
  for (const radio of dialog.querySelectorAll('input[name="welcome-sync"]')) {
    radio.addEventListener('change', showSyncChoice);
  }
  savedBox.addEventListener('change', () => showStep());
  byId('welcome-copy-button').addEventListener('click', async () => {
    codeNote.textContent = await copyCode(newCode);
  });
  byId('welcome-file-button').addEventListener('click', () => {
    codeNote.textContent = saveCodeFile(newCode, newServer);
  });
  byId('welcome-print-button').addEventListener('click', () => printCode(newCode, newServer));

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
      section.hidden = mode === 'join' || index !== step;
    });
    joinScreen.hidden = mode !== 'join';
    joinedPart.hidden = mode !== 'joined';
    syncPart.hidden = !sync.available || mode === 'joined';
    progress.hidden = mode !== 'steps';
    nextButton.hidden = mode === 'join';
    // Joining: the form's own button joins, and Back goes back to the first
    // screen; nothing is skipped from here.
    if (mode === 'join') {
      backButton.hidden = false;
      skipButton.hidden = true;
      dialog.scrollTop = 0;
      showCovering();
      return;
    }
    if (steps[step].contains(startRadios[0])) {
      suggestStart();
    }
    const last = step === steps.length - 1;
    progress.textContent = t('welcome.stepOf', { step: step + 1, steps: steps.length });
    backButton.hidden = step === 0 || mode === 'joined';
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
              : mode === 'joined'
                ? 'welcome.startLearning'
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
    const waiting = last && mode === 'steps' && syncChosen() && !savedBox.checked;
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
    const synced = syncChosen() || mode === 'joined';
    storagePlan = welcomeStorage(keepData.kind, await keepData.state(), keepData.mobile, synced);
    // With sync, the words are kept on the sync server too, and Safari's app
    // on the Home Screen or in the Dock, which starts empty, is synced again.
    byId('welcome-keep-heading').textContent = t(synced ? 'welcome.keepOnThisDevice' : 'welcome.keepYourWordsSafe');
    byId('welcome-stored').textContent = t(
      synced ? 'welcome.yourWordsAreSynced' : sync.available ? 'welcome.yourWordsAreStoredSync' : 'welcome.yourWordsAreStored',
    );
    byId('welcome-open-home').innerHTML = t(synced ? 'welcome.openFromYourHomeSynced' : 'welcome.openFromYourHome');
    byId('welcome-open-dock').innerHTML = t(synced ? 'welcome.openFromTheDockSynced' : 'welcome.openFromTheDock');
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
    if (mode === 'join') {
      mode = 'steps';
    } else {
      step -= 1;
    }
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
    // After joining, everything else came from the other device.
    if (mode === 'joined') {
      dialog.close();
      return;
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
    joinPart.hidden = !sync.available;
    mode = 'steps';
    joinInput.value = '';
    byId('welcome-join-server-fold').open = false;
    byId('welcome-sync-server-fold').open = false;
    joinNote.hidden = true;
    byId('welcome-from-link').hidden = true;
    // Sync is chosen at first where it is offered (the owner, 2026-11-09):
    // the code shows at once, and finishing still waits for "I've saved my
    // sync code", or for "Just this device for now".
    choose('welcome-sync', sync.available ? 'on' : '');
    newCode = null;
    savedBox.checked = false;
    codeNote.textContent = '';
    showSyncChoice();
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
    // screen, in the box with a warning, never joined by itself; the link's
    // server, if any, tried and chosen.
    offerJoin({ text, server }) {
      if (!dialog.open) {
        open();
      }
      joinInput.value = text;
      byId('welcome-from-link').hidden = false;
      if (server) {
        joinServer.useFromLink(server);
      }
      openJoin({ fromLink: true });
    },
  };
}
