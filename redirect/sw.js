// Replaces the app's service worker at the old address. A phone that opened
// the app at /hanzi-trainer/ has the old service worker, which keeps showing
// the saved copy of the app without asking the server for the page, so the
// redirect page would never be seen. But the browser does still check this
// file for a new version now and then (at the latest a day after the last
// check), finds this one, and runs it: it removes itself and sends any open
// window of the app to the same place in the new folder.
//
// It deletes no caches: the new copy of the app uses the same names (the
// browser keeps them per site, not per folder), and it cleans up what the
// old one left (forgetOldFolder in src/offline.js).

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
        client.navigate(client.url.replace('/hanzi-trainer/', '/yutu-chinese/'));
      }
    })(),
  );
});
