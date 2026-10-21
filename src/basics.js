// "Basics of Chinese": five short screens for someone who knows no Chinese
// at all: characters, pinyin, tones, the four kinds of card, and writing
// (the owner, 2026-10-21, after tester 3 found the tone card confusing with
// almost no Chinese). The screens themselves are in index.html (the
// "basics-dialog" pop-up). Opened from the menu, Settings › Help, the
// introduction's first screen, and "What are tones?" on a tone card, which
// opens it at the screen on tones.
//
// Its recordings are kept with the app's own files (basicsSounds.js), so it
// works offline from the start.

import { closeOnTapBeside } from './dialogs.js';
import { langFor } from './lang.js';
import { playRecording } from './speech.js';
import { toneMarkPicture } from './toneFlow.js';

const byId = (id) => document.getElementById(id);

// settings: the current settings (see settings.js): the script the
//           characters are shown in, and the volume.
//
// Returns { open(stepName) }; stepName is a screen's data-basics-step
// ('tones'), or left out for the first.
export function createBasics(settings) {
  const dialog = byId('basics-dialog');
  const steps = [...dialog.querySelectorAll('[data-basics-step]')];
  const progress = byId('basics-progress');
  const backButton = byId('basics-back');
  const nextButton = byId('basics-next');
  const bar = byId('basics-bar');
  let step = 0;

  // The pictures of the tone marks, as drawn on a tone card, and the ▶ on
  // each button that plays a recording.
  for (const mark of dialog.querySelectorAll('.basics-mark')) {
    mark.innerHTML = toneMarkPicture(Number(mark.dataset.tone));
    mark.setAttribute('aria-hidden', 'true');
  }
  for (const button of dialog.querySelectorAll('[data-play]')) {
    button.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></svg>';
    button.title = button.getAttribute('aria-label');
    button.addEventListener('click', () => playRecording(button.dataset.play, settings.volume));
  }

  // The Chinese on the screens, in the script being learned: its regional
  // font (lang), and the form of a character the two scripts write apart.
  function showScript() {
    const lang = langFor(settings.script);
    for (const element of dialog.querySelectorAll('[data-zh]')) {
      element.lang = lang;
    }
    for (const element of dialog.querySelectorAll('[data-simplified]')) {
      element.textContent = element.dataset[settings.script];
      element.lang = lang;
    }
  }

  function showStep() {
    steps.forEach((section, index) => {
      section.hidden = index !== step;
    });
    progress.textContent = `${step + 1} of ${steps.length}`;
    backButton.hidden = step === 0;
    nextButton.textContent = step === steps.length - 1 ? 'Done' : 'Next';
    // Each screen starts at its top.
    dialog.scrollTop = 0;
    showCovering();
  }

  // The line above Back and Next while there is more below them (as in the
  // introduction, welcome.js).
  function showCovering() {
    bar.classList.toggle('covering', dialog.scrollTop + dialog.clientHeight < dialog.scrollHeight - 1);
  }
  dialog.addEventListener('scroll', showCovering, { passive: true });
  window.addEventListener('resize', showCovering);

  backButton.addEventListener('click', () => {
    step -= 1;
    showStep();
  });
  nextButton.addEventListener('click', () => {
    if (step === steps.length - 1) {
      dialog.close();
      return;
    }
    step += 1;
    showStep();
  });
  byId('basics-close').addEventListener('click', () => dialog.close());
  // Nothing is lost by closing it (dialogs.js).
  closeOnTapBeside(dialog);

  return {
    open(stepName) {
      showScript();
      step = Math.max(0, steps.findIndex((section) => section.dataset.basicsStep === stepName));
      showStep();
      // showModal() puts it on top of whatever is open, the introduction too.
      dialog.showModal();
      // Only now does the panel have a size to measure.
      showCovering();
    },
  };
}
