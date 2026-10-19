// What to tell someone about long-term storage, which depends on the browser.
//
// The app's data (words, reviews) lives in the browser. A browser may clear a
// site's data to free up space unless it has agreed not to
// (navigator.storage.persist(); see offline.js). Browsers handle that request
// very differently, so the app says what to expect and what to do:
//
//   Firefox   asks the person, with a question at the top of the page on a
//             computer and at the bottom of the screen on a phone.
//   Chromium  (Chrome, Edge, Brave, Samsung Internet, ...) never asks anyone.
//             It decides by itself, and says yes for an installed app.
//   Safari    decides by itself too. It also deletes a site's data after
//             about a week without a visit, on a Mac as on an iPhone or iPad,
//             unless the app is on the Home Screen (or, on a Mac, in the
//             Dock: macOS 14 and later). An app put there starts with
//             storage of its own: words studied in Safari don't come along
//             and are brought over with a backup.
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

// True on a phone or tablet. An iPad's Safari names itself as a Mac, so a
// "Mac" with a touch screen is taken for an iPad (Macs have none).
//
// userAgent:      navigator.userAgent
// maxTouchPoints: navigator.maxTouchPoints, how many fingers the screen takes
export function isMobile(userAgent, maxTouchPoints = 0) {
  return /Android|iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

const INSTALL_HOW = 'open the browser\'s menu and choose "Install app" or "Add to Home screen"';
// Safari's app on the Home Screen or in the Dock starts with nothing.
const BRING_OVER = 'Words studied here in Safari don\'t come along by themselves: use Export backup here, then Import backup in the app.';
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
// mobile: true on a phone or tablet (isMobile)
//
// Returns a sentence or two.
export function storageAdvice(kind, { canAsk, kept, asked, installed, canInstall }, mobile = false) {
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
      : 'Firefox will show a question: may this site store data in persistent storage? Choose "Allow".';
  }
  if (kind === 'chromium') {
    if (installed) {
      return asked
        ? 'This browser has not allowed it yet, although the app is installed. It decides by itself and usually agrees once the app has been used a little; the app asks again each time it starts. ' + BACKUP
        : 'This browser will not ask you anything: it decides by itself, and usually agrees for an installed app like this one.';
    }
    return asked
      ? `This browser said no, as it does for an app that is not installed. Install the app (${install}), open it from there, and it will ask again by itself. ${BACKUP}`
      : `This browser will not ask you anything: it decides by itself, and says yes for an installed app. So install the app first (${install}) and use it from there: it then asks by itself.`;
  }
  if (kind === 'safari') {
    return installed
      ? asked
        ? 'Safari has not confirmed it, but data of an app on the Home Screen is kept. ' + BACKUP.replace('Until then, use', 'Still, use')
        : 'Safari decides by itself. Data of an app on the Home Screen, like this one, is kept.'
      : 'Safari decides by itself, and it deletes a site\'s data after about a week without a visit. ' +
          (mobile
            ? 'To prevent that, put the app on the Home Screen (tap Share, or ⋯ then Share, then "Add to Home Screen") and use it from there. '
            : 'To prevent that, add the app to the Dock (in Safari\'s File menu, "Add to Dock", on macOS 14 or later) and use it from there. ') +
          BRING_OVER;
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
//   addTo:  in Safari, where the person should put the app instead:
//           'homeScreen' or 'dock' (the screen then shows the steps); else absent
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
    // At the bottom of the screen on a phone (the owner, 2026-10-16).
    const question = `Firefox will ask at the ${mobile ? 'bottom of the screen' : 'top of the page'}: choose "Allow".`;
    return {
      action: 'ask',
      line: mobile ? `${question} For an icon of your own, choose Install in the browser's menu (⋮).` : question,
    };
  }
  // What keeps them in Safari is the Home Screen or the Dock, which only the
  // person can do: no button that would seem to have done it (as in
  // storageMessageLine). The screen shows the steps (index.html).
  if (kind === 'safari' && !installed) {
    return { action: 'none', line: '', addTo: mobile ? 'homeScreen' : 'dock' };
  }
  return { action: 'ask', line: '' };
}

// How long a backup counts as recent enough, for a browser that can't be
// asked to keep the data: there a backup is the only safety.
export const RECENT_BACKUP_MS = 7 * 24 * 60 * 60 * 1000;

// True if the words on this device may be lost, so that the message below
// is shown again and again until that's fixed (the owner, 2026-10-19: "I
// would like to be annoying if the alternative is having users accidentally
// lose their data"):
//   - Safari outside the Home Screen or the Dock: it deletes a site's data
//     after a week without a visit, whatever else it has promised;
//   - any other browser that hasn't promised to keep the data, except one
//     that can't be asked at all: there only a backup helps, and the words
//     count as safe for a week after one.
//
// kind, state:  as for storageAdvice
// lastBackupAt: when a backup was last made on this device, or null
// now:          the time, as from Date.now()
export function wordsAtRisk(kind, { canAsk, kept, installed }, lastBackupAt, now) {
  if (kind === 'safari') {
    return !installed;
  }
  if (kept) {
    return false;
  }
  if (!canAsk) {
    return lastBackupAt === null || now - lastBackupAt > RECENT_BACKUP_MS;
  }
  return true;
}

// The message while the words are at risk (wordsAtRisk; storageMessage.js),
// at the end of Review and between two words in Learn: one line after
// "Keep your words safe." and one main button that does what this browser
// needs (the owner chose the wording on 2026-10-18).
//
// kind, state, mobile: as for welcomeStorage
//
// Returns { action, line }, with action as for welcomeStorage, or 'export'
// for Export backup: where nothing can be asked, and in Safari, whose app
// on the Home Screen or in the Dock starts empty, so the words are brought
// over in a backup. The line names the app as 玉兔中文, to be marked as
// Chinese where it is shown.
export function storageMessageLine(kind, { canAsk, kept, installed, canInstall }, mobile = false) {
  if (kind === 'safari' && !installed) {
    return {
      action: 'export',
      line: mobile
        ? 'Safari deletes them after a week without a visit. Add 玉兔中文 to your Home Screen (Share, or ⋯ then Share, then "Add to Home Screen") and study there. To bring your words along, export a backup here and import it there.'
        : 'Safari deletes them after a week without a visit. Add 玉兔中文 to the Dock (File › Add to Dock) and study there. To bring your words along, export a backup here and import it there.',
    };
  }
  if (kept) {
    return { action: 'none', line: '' };
  }
  if (!canAsk) {
    return { action: 'export', line: "Your browser may delete them, and it can't be asked not to. Save a backup every week." };
  }
  if (kind === 'chromium' && !installed) {
    return canInstall
      ? { action: 'install', line: "Install 玉兔中文 as an app so your browser doesn't delete them." }
      : { action: 'ask', line: `Install 玉兔中文 as an app so your browser doesn't delete them: ${INSTALL_HOW}.` };
  }
  if (kind === 'firefox') {
    return { action: 'ask', line: "When Firefox asks, choose Allow so it doesn't delete them." };
  }
  return { action: 'ask', line: "Tap below so your browser doesn't delete them." };
}
