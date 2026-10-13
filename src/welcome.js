// The introduction shown the first time the app is opened: a few screens,
// one at a time, that set the app up (script, pronunciation, kinds of card),
// explain how it works, and ask for long-term storage after saying why.
// The screens themselves are in index.html (the "welcome" dialog).

import { getSetting, setSetting } from './db.js';
import { CARD_TYPES } from './session.js';
import { storageAdvice } from './storageAdvice.js';

const byId = (id) => document.getElementById(id);

// settings:  the current settings (see settings.js), with their change()
// keepData:  from offline.js: long-term storage and installing
// hasWords(): true if the word list is not empty
// onFinish(): called when the last screen's button is tapped
//
// Returns { open(), openIfFirstTime() }.
export function createWelcome({ settings, keepData, hasWords, onFinish }) {
  const dialog = byId('welcome');
  const steps = [...dialog.querySelectorAll('[data-step]')];
  const progress = byId('welcome-progress');
  const backButton = byId('welcome-back');
  const nextButton = byId('welcome-next');
  const typeBoxes = [...dialog.querySelectorAll('[data-welcome-type]')];
  const typesNote = byId('welcome-types-note');
  const keepButton = byId('welcome-keep-button');
  const keepNote = byId('welcome-keep-note');
  const installButton = byId('welcome-install-button');

  // Which screen is showing, counting from 0.
  let step = 0;

  // The radio button that is chosen in a group, and choosing one.
  const chosen = (name) => dialog.querySelector(`input[name="${name}"]:checked`).value;
  const choose = (name, value) => {
    dialog.querySelector(`input[name="${name}"][value="${value}"]`).checked = true;
  };

  function showStep() {
    steps.forEach((section, index) => {
      section.hidden = index !== step;
    });
    const last = step === steps.length - 1;
    progress.textContent = `${step + 1} of ${steps.length}`;
    backButton.hidden = step === 0;
    nextButton.textContent = !last ? 'Next' : hasWords() ? 'Done' : 'Add my first words';
    // Each screen starts at its top, whatever was scrolled before.
    dialog.scrollTop = 0;
  }

  // The last screen: what this browser will do when asked, or what it said,
  // and what to do about it.
  async function showKeepState() {
    const state = await keepData.state();
    keepNote.textContent = storageAdvice(keepData.kind, state);
    keepButton.hidden = state.kept || !state.canAsk;
    installButton.hidden = !state.canInstall;
  }
  keepData.listen(showKeepState);
  keepButton.addEventListener('click', () => keepData.ask());
  installButton.addEventListener('click', () => keepData.install());

  // Saves what was chosen on the screens.
  async function applyChoices() {
    const script = chosen('welcome-script');
    await settings.change('bothScripts', script.startsWith('both-'));
    await settings.change('script', script.replace('both-', ''));
    await settings.change('pronunciation', chosen('welcome-pronunciation'));
    const types = typeBoxes.filter((box) => box.checked).map((box) => box.dataset.welcomeType);
    // In the standard order, whatever order they were ticked in.
    await settings.change('enabledTypes', CARD_TYPES.filter((type) => types.includes(type)));
  }

  backButton.addEventListener('click', () => {
    step -= 1;
    showStep();
  });

  nextButton.addEventListener('click', async () => {
    // With no kind of card there would be nothing to review.
    if (steps[step].contains(typeBoxes[0]) && !typeBoxes.some((box) => box.checked)) {
      typesNote.textContent = 'Keep at least one kind of card.';
      return;
    }
    typesNote.textContent = '';
    if (step < steps.length - 1) {
      step += 1;
      showStep();
      return;
    }
    await applyChoices();
    await setSetting('welcomeDone', true);
    dialog.close();
    onFinish();
  });

  // Skipping changes no settings. Esc closes a <dialog> too; "close" is
  // announced either way, so the introduction is not shown again unasked.
  byId('welcome-skip').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => setSetting('welcomeDone', true));

  function open() {
    // The screens start from the settings as they are.
    choose('welcome-script', settings.bothScripts ? `both-${settings.script}` : settings.script);
    choose('welcome-pronunciation', settings.pronunciation);
    for (const box of typeBoxes) {
      box.checked = settings.enabledTypes.includes(box.dataset.welcomeType);
    }
    typesNote.textContent = '';
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
