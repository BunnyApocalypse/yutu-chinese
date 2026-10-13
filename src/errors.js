// Showing when something has gone wrong.
//
// The app sends nothing anywhere, so nobody but the person using it can know
// that it stumbled. This file catches errors that nothing else caught, says
// so in a line at the bottom of the page, and offers the details as text to
// copy into a message: the app's version, the browser, and what failed. No
// words and nothing about the person's studying is in them.

/* global __APP_VERSION__, __CHANNEL__ */

// The app's version (see vite.config.js).
// The test copy of the app says that it is one (see db.js).
export const APP_VERSION = __APP_VERSION__ + (__CHANNEL__ ? `, ${__CHANNEL__} version` : '');

const byId = (id) => document.getElementById(id);

// elements: the line at the bottom (`banner`), its "Details" button, and the
// panel with the text and its "Copy" and "Close" buttons.
export function watchForErrors({ banner, detailsButton, dialog, textElement, copyButton, closeButton }) {
  // The last few errors, newest last.
  const errors = [];

  const describe = () =>
    [
      `Hanzi Trainer ${APP_VERSION}`,
      `Browser: ${navigator.userAgent}`,
      `Screen: ${window.innerWidth} by ${window.innerHeight}`,
      '',
      ...errors.map((error) => `${error.when}\n${error.what}`),
    ].join('\n');

  function note(what) {
    errors.push({ when: new Date().toISOString(), what: String(what).slice(0, 2000) });
    if (errors.length > 5) {
      errors.shift();
    }
    banner.hidden = false;
  }

  // "error": something in the program threw and nothing caught it.
  window.addEventListener('error', (event) => {
    note(event.error && event.error.stack ? event.error.stack : `${event.message} (${event.filename}:${event.lineno})`);
  });
  // "unhandledrejection": the same for work that was waited for (a promise).
  window.addEventListener('unhandledrejection', (event) => {
    const { reason } = event;
    note(reason && reason.stack ? reason.stack : reason);
  });

  detailsButton.addEventListener('click', () => {
    textElement.value = describe();
    copyButton.textContent = 'Copy';
    dialog.showModal();
  });
  copyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textElement.value);
      copyButton.textContent = 'Copied';
    } catch {
      // Where the browser will not let a page copy, the text is selected, to
      // be copied by hand.
      textElement.select();
    }
  });
  closeButton.addEventListener('click', () => {
    dialog.close();
    banner.hidden = true;
  });
}

// Fills in the line in Settings that says which version this is.
export function showVersion() {
  byId('app-version').textContent = `Version ${APP_VERSION}`;
  if (__CHANNEL__) {
    document.title = `${document.title} (${__CHANNEL__})`;
  }
}
