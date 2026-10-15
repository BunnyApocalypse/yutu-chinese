// The light or dark look (the owner asked for dark mode on 2026-10-13; built
// on 2026-10-15). The colors themselves are in style.css, named, with a
// value for each look. This file only says which look is used:
//
//   'auto'   as the device is set (the default). The style sheet follows
//            the device by itself, through "prefers-color-scheme", so the
//            page has the right look from the very first moment, before
//            the settings have been read from the database.
//   'light'  always light, whatever the device says
//   'dark'   always dark
//
// It does that with a data-theme attribute on the <html> element, which the
// style sheet looks at. Code that needs a color as a value (Hanzi Writer
// does: see quiz.js) reads it with themeColor() and listens for the
// 'theme-changed' event on document to set it again.

// Asks the browser whether the device is set to dark; `change` fires when
// that changes (on a phone, at sunset for instance).
const deviceDark = window.matchMedia('(prefers-color-scheme: dark)');
let choice = 'auto';

// The value of one of the named colors in style.css, such as '--ink', as it
// is for the look on screen now.
export function themeColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function apply() {
  const root = document.documentElement;
  if (choice === 'light' || choice === 'dark') {
    root.dataset.theme = choice;
  } else {
    delete root.dataset.theme;
  }
  // The color a phone's browser paints its own bar at the top in.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor('--bg'));
  document.dispatchEvent(new CustomEvent('theme-changed'));
}

// Uses the look chosen in Settings: 'auto', 'light' or 'dark'.
export function setTheme(value) {
  choice = value;
  apply();
}

deviceDark.addEventListener('change', () => {
  if (choice === 'auto') {
    apply();
  }
});
