// The service worker of the moving page (move.html), published as sw.js at
// the app's old address (scripts/finish-move.js; docs/offline.md, "The move
// to yutuchinese.com").
//
// An app installed or opened before at the old address has the app's service
// worker, which keeps showing the saved copy of the app without asking for
// the page, so the moving page would never be seen. But the browser still
// checks sw.js for a new version (at the latest a day after the last check),
// finds this one, and runs it: it removes itself and reloads any open window,
// which then gets the moving page.
//
// It deletes no caches and nothing in the database: the learner's words are
// read from there by the moving page.

self.addEventListener('install', () => {
  // Take over at once instead of waiting for every window to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.registration.unregister();
      const windows = await self.clients.matchAll({ type: 'window' });
      for (const client of windows) {
        client.navigate(client.url);
      }
    })(),
  );
});
