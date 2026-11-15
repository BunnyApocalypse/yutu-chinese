// The page about the app, at https://yutuchinese.com, and how it and the app
// know each other (docs/offline.md, "The page about the app").
//
// The page and the app are at one site, so they share the browser's storage.
// The app leaves a mark here each time it starts; the page (site/index.html)
// reads it and sends someone who has used the app on to the app, so only a
// new device sees the page first. `?about` after the address shows the page
// without sending anyone on (the link in Help, and the page's own logo).
//
// The test copy has a mark of its own: it is at the same site, and must not
// make the page send people to the stable app on its account.

/* global __CHANNEL__ */
const USED_KEY = __CHANNEL__ ? `yutu-used-${__CHANNEL__}` : 'yutu-used';

// Where "About the app" in Help leads.
export const ABOUT_ADDRESS = 'https://yutuchinese.com/?about';

// Called when the app starts.
export function noteAppUsed() {
  try {
    localStorage.setItem(USED_KEY, '1');
  } catch {
    // Storage refused (a private window): the page shows first next time.
  }
}
