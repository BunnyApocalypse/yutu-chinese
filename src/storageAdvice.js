// What to tell someone about long-term storage, which depends on the browser.
//
// The app's data (words, reviews) lives in the browser. A browser may clear a
// site's data to free up space unless it has agreed not to
// (navigator.storage.persist(); see offline.js). Browsers handle that request
// very differently, so the app says what to expect and what to do:
//
//   Firefox   asks the person, with a question at the top of the page.
//   Chromium  (Chrome, Edge, Brave, Samsung Internet, ...) never asks anyone.
//             It decides by itself, and says yes for an installed app.
//   Safari    decides by itself too. On an iPhone or iPad it also deletes a
//             site's data after about a week without a visit, unless the app
//             is on the Home Screen.
//
// Plain calculation: no page, so it can be tested on its own.

// Which family of browser this is, from navigator.userAgent (a line of text
// in which a browser names itself) and, where the browser has it,
// navigator.userAgentData.brands.
//
// Returns 'firefox', 'chromium', 'safari' or 'other'.
export function browserKind(userAgent, brands = []) {
  // On an iPhone or iPad every browser is Safari underneath, whatever its name.
  if (/iPhone|iPad|iPod/.test(userAgent)) {
    return 'safari';
  }
  if (/Firefox\//.test(userAgent)) {
    return 'firefox';
  }
  // Chromium-based browsers all say "Chrome/", and so does no other.
  if (brands.some((entry) => entry.brand === 'Chromium') || /Chrom(e|ium)\//.test(userAgent)) {
    return 'chromium';
  }
  if (/Safari\//.test(userAgent)) {
    return 'safari';
  }
  return 'other';
}

const INSTALL_HOW = 'open the browser\'s menu and choose "Install app" or "Add to Home screen"';
const BACKUP = 'Until then, use Export backup in Settings now and then.';

// The advice to show.
//
// kind:  from browserKind
// state:
//   canAsk:     false if the browser has no way to ask at all
//   kept:       true if long-term storage is allowed
//   asked:      true if the button has been tapped before
//   installed:  true if the app is running as an installed app
//   canInstall: true if the app can offer its own "Install the app" button
//
// Returns a sentence or two.
export function storageAdvice(kind, { canAsk, kept, asked, installed, canInstall }) {
  if (kept) {
    return 'Long-term storage is allowed: the browser will not clear this data to free up space.';
  }
  if (!canAsk) {
    return `This browser has no way to ask for long-term storage. ${BACKUP.replace('Until then, use', 'Use')}`;
  }
  const install = canInstall ? 'tap "Install the app" below' : INSTALL_HOW;

  if (kind === 'firefox') {
    return asked
      ? 'Firefox has not allowed it. If you chose "Block" or "Not now", click the icon at the left end of the address bar, clear the entry for storing data in persistent storage, and tap the button again. ' + BACKUP
      : 'Firefox will show a question at the top of the page: may this site store data in persistent storage? Choose "Allow".';
  }
  if (kind === 'chromium') {
    if (installed) {
      return asked
        ? 'This browser has not allowed it yet, although the app is installed. It decides by itself and usually agrees once the app has been used a little; the app asks again each time it starts. ' + BACKUP
        : 'This browser will not ask you anything: it decides by itself, and usually agrees for an installed app like this one.';
    }
    return asked
      ? `This browser said no, as it does for an app that is not installed. Install the app (${install}), open it from there, and it will ask again by itself. ${BACKUP}`
      : `This browser will not ask you anything: it decides by itself, and says yes for an installed app. So install the app first (${install}), then tap the button.`;
  }
  if (kind === 'safari') {
    return installed
      ? asked
        ? 'Safari has not confirmed it, but data of an app on the Home Screen is kept. ' + BACKUP.replace('Until then, use', 'Still, use')
        : 'Safari decides by itself. Data of an app on the Home Screen, like this one, is kept.'
      : 'Safari decides by itself, and on an iPhone or iPad it deletes a site\'s data after about a week without a visit. To prevent that, put the app on the Home Screen (tap Share, then "Add to Home Screen") and use it from there.' +
          (asked ? ` ${BACKUP}` : '');
  }
  return asked
    ? `The browser did not allow it. It may once the app is installed: ${INSTALL_HOW}. ${BACKUP}`
    : 'Your browser may ask you to confirm, or decide by itself.';
}

// The last screen of the introduction: one main button that does what this
// browser needs, and at most one short line (the owner, 2026-10-16, after a
// tester found the screen wordy and its buttons too many).
//
// kind, state: as for storageAdvice
// mobile:      true on a phone or tablet (Android, iPhone, iPad)
//
// Returns { action, line }:
//   action: 'install' to show the browser's own "install this app?"
//           question (Chromium keeps only an installed app's data, and the
//           app asks again by itself once installed; see offline.js),
//           'ask' to ask for long-term storage, or 'none' if there is
//           nothing to ask
//   line:   a sentence to show, or ''
export function welcomeStorage(kind, { canAsk, kept, installed, canInstall }, mobile = false) {
  if (kept) {
    return { action: 'none', line: 'This browser already keeps them.' };
  }
  if (!canAsk) {
    return { action: 'none', line: 'This browser cannot be asked, so use Export backup in Settings now and then.' };
  }
  if (kind === 'chromium' && !installed) {
    return canInstall
      ? { action: 'install', line: 'This browser keeps the words of an installed app.' }
      : { action: 'ask', line: `This browser only keeps the words of an installed app: ${INSTALL_HOW}.` };
  }
  if (kind === 'firefox') {
    const question = 'Firefox will ask at the top of the page: choose "Allow".';
    return {
      action: 'ask',
      line: mobile ? `${question} For an icon of your own, choose Install in the browser's menu (⋮).` : question,
    };
  }
  if (kind === 'safari' && mobile && !installed) {
    return {
      action: 'ask',
      line: 'On an iPhone or iPad, Safari only keeps them for an app on the Home Screen: tap Share, then "Add to Home Screen".',
    };
  }
  return { action: 'ask', line: '' };
}
