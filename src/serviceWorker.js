// The service worker: what makes the app work without a connection.
//
// A service worker is a small program the browser keeps beside a web app. It
// stays installed after the page is closed, and every request the app makes
// (for its page, its program, a character's stroke data) passes through it
// first. This one answers from what is saved on the device whenever it can,
// and only asks the network for what is not saved.
//
// It is not part of the app's program. scripts/build-offline.js copies it to
// dist/sw.js when the app is built and puts two lines in front of it:
//   VERSION    changes whenever any file of the app changes
//   APP_FILES  the files the app needs to start: page, program, styles, icons
// Browsers only allow service workers over https or on localhost, so the app
// does not use one under `npm run dev` (see offline.js).
//
// There are three stores ("caches"):
//   app-<VERSION>  the app's own files. A new version of the app gets a new
//                  one, and the old one is deleted once the new takes over.
//   offline-data   stroke data and the dictionary, about 60 MB. Filled by the
//                  page in the background (offline.js) and kept from one
//                  version of the app to the next.
//   offline-audio  the recordings of words that have been played (speech.js),
//                  or all of them (125 MB) if that was asked for in Settings.
//                  Kept from one version to the next as well.

/* global VERSION, APP_FILES */

const APP_CACHE = `app-${VERSION}`;

// "install" runs once for each new version: save the app's files. If any of
// them cannot be fetched, the version is not installed and the browser tries
// again later; the version in use carries on meanwhile.
self.addEventListener('install', (event) => {
  // cache: 'reload' fetches each file from the server, not from a copy the
  // browser may have kept of an older version.
  const requests = APP_FILES.map((file) => new Request(file, { cache: 'reload' }));
  event.waitUntil(caches.open(APP_CACHE).then((cache) => cache.addAll(requests)));
});

// "activate" runs when this version takes over from the one before.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('app-') && name !== APP_CACHE)
          .map((name) => caches.delete(name)),
      );
      // Take charge of pages that are already open, not only future ones.
      await self.clients.claim();
    })(),
  );
});

// A new version waits until every open page of the old one is closed, so the
// app never changes under a review in progress. The page sends this message
// when "New version ready" is tapped (offline.js), to switch at once.
self.addEventListener('message', (event) => {
  if (event.data === 'useNewVersion') {
    self.skipWaiting();
  }
});

// Every request of the app comes through here.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
    return; // not ours to answer: the browser handles it as usual
  }
  event.respondWith(
    (async () => {
      // Opening the app, by whatever address inside its folder: the page.
      if (request.mode === 'navigate') {
        const page = await caches.match('index.html', { cacheName: APP_CACHE });
        if (page) {
          return page;
        }
      }
      // caches.match looks in every store.
      return (await caches.match(request)) || fetch(request);
    })(),
  );
});
