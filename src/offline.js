// The page's side of working offline: installing the service worker, saving
// the stroke data and dictionary in the background, asking the browser to
// keep the app's data, and offering a new version of the app when there is
// one. The service worker itself is src/serviceWorker.js; read its opening
// comment first.

// BASE_URL is the folder the app is served from.
const BASE = import.meta.env.BASE_URL;
// The same as a full address, for naming what goes into the cache.
const baseAddress = new URL(BASE, window.location.href);

// The store the stroke data and dictionary are saved in (see serviceWorker.js).
const DATA_CACHE = 'offline-data';
// Where the list of what there is to save is kept, for when there is no
// connection to ask for it. (Not under its own address: the service worker
// would then answer with the saved copy and a new list would never be seen.)
const SAVED_INDEX = 'offline/index.saved.json';
// A pack that has been unpacked leaves this mark in the store.
const markFor = (packFile) => `offline/done/${packFile}`;

const address = (file) => new URL(file, baseAddress).href;

// What kind of file a path is, for the browser's benefit.
function typeOf(file) {
  return file.endsWith('.json') ? 'application/json' : 'text/plain; charset=utf-8';
}

// Saves the stroke data and the dictionary on the device, picking up where an
// earlier visit left off.
//
// report({ done, total }): called as it goes; counts packs and big files
//
// Returns true if everything is saved, false if it could not be finished
// (no connection, or the device is full). It can simply be called again.
async function saveOfflineData(report) {
  const cache = await caches.open(DATA_CACHE);

  // The list of what to save: fresh from the network if possible, otherwise
  // the copy kept from last time.
  let index;
  try {
    // 'no-cache' makes the browser check with the server instead of reusing
    // a copy it may have kept.
    const response = await fetch(address('offline/index.json'), { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`offline/index.json: ${response.status}`);
    }
    await cache.put(address(SAVED_INDEX), response.clone());
    index = await response.json();
  } catch {
    const saved = await cache.match(address(SAVED_INDEX));
    if (!saved) {
      return false;
    }
    index = await saved.json();
  }

  const total = index.packs.length + index.files.length;
  let done = 0;
  let complete = true;
  report({ done, total });

  for (const pack of index.packs) {
    if (!(await cache.match(address(markFor(pack.file))))) {
      try {
        const response = await fetch(address(pack.file));
        if (!response.ok) {
          throw new Error(`${pack.file}: ${response.status}`);
        }
        // A pack is one object: each file's path and its text. Every file
        // goes into the store under its own address, as if it had been
        // fetched by itself; that is where the service worker looks.
        const contents = await response.json();
        await Promise.all(
          Object.entries(contents).map(([file, text]) =>
            cache.put(address(file), new Response(text, { headers: { 'Content-Type': typeOf(file) } })),
          ),
        );
        await cache.put(address(markFor(pack.file)), new Response('done'));
      } catch {
        complete = false;
        continue;
      }
    }
    done += 1;
    report({ done, total });
  }

  for (const file of index.files) {
    if (!(await cache.match(address(file)))) {
      try {
        await cache.add(address(file));
      } catch {
        complete = false;
        continue;
      }
    }
    done += 1;
    report({ done, total });
  }

  if (complete) {
    // Clear out what an earlier version saved and this one no longer has:
    // marks of packs that were replaced, and an older dictionary.
    const current = new Set(
      [SAVED_INDEX, ...index.files, ...index.packs.map((pack) => markFor(pack.file))].map(address),
    );
    for (const request of await cache.keys()) {
      const isMarkOrBigFile =
        request.url.startsWith(address('offline/')) || request.url.startsWith(address('assets/'));
      if (isMarkOrBigFile && !current.has(request.url)) {
        await cache.delete(request);
      }
    }
  }
  return complete;
}

// Sets all of it going. Nothing here holds the app up: it is called once the
// app has started.
//
// elements:
//   statusElement: a line in the settings panel saying how things stand
//   updateButton:  shown when a new version of the app is ready
export async function setUpOffline({ statusElement, updateButton }) {
  // What is known so far, shown as one short paragraph.
  const state = { app: '', data: '', kept: '' };
  const show = () => {
    statusElement.textContent = [state.app, state.data, state.kept].filter(Boolean).join(' ');
  };

  // import.meta.env.PROD is true in the built app and false under `npm run dev`.
  if (!import.meta.env.PROD) {
    state.app = 'Offline use is switched off while developing (npm run dev).';
    show();
    return;
  }
  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    state.app = 'This browser cannot save the app for offline use.';
    show();
    return;
  }

  // ---- The app itself ----

  let registration;
  try {
    registration = await navigator.serviceWorker.register(address('sw.js'));
  } catch {
    state.app = 'The app could not be saved for offline use.';
    show();
    return;
  }
  state.app = 'The app is saved on this device.';
  show();

  // A new version has been fetched and is waiting to take over.
  const offerUpdate = () => {
    updateButton.hidden = false;
  };
  // "controller" is the service worker in charge of this page; there is none
  // the very first time, when a waiting worker is not an update but the first.
  if (registration.waiting && navigator.serviceWorker.controller) {
    offerUpdate();
  }
  registration.addEventListener('updatefound', () => {
    const arriving = registration.installing;
    arriving.addEventListener('statechange', () => {
      if (arriving.state === 'installed' && navigator.serviceWorker.controller) {
        offerUpdate();
      }
    });
  });
  let reloadWanted = false;
  updateButton.addEventListener('click', () => {
    reloadWanted = true;
    updateButton.disabled = true;
    registration.waiting?.postMessage('useNewVersion');
  });
  // The new version has taken over: load the page afresh with its files.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadWanted) {
      window.location.reload();
    }
  });

  // ---- Keeping your data ----

  // Browsers may clear a site's stored data when the device runs short of
  // space. persist() asks for this app's data (your words and reviews
  // included) to be left alone. The browser decides; it says yes more readily
  // once the app is installed on the home screen.
  if (navigator.storage && navigator.storage.persist) {
    const kept = await navigator.storage.persist();
    state.kept = kept
      ? 'The browser has agreed not to clear this data to free up space.'
      : 'The browser may clear this data if the device runs out of space, so export a backup now and then. Installing the app on the home screen usually prevents it.';
    show();
  }

  // ---- Stroke data and dictionary ----

  const complete = await saveOfflineData(({ done, total }) => {
    state.data =
      done === total
        ? 'Stroke data and dictionary are saved too.'
        : `Saving stroke data and dictionary: ${Math.round((done / total) * 100)}%.`;
    show();
  });
  if (!complete) {
    state.data += ' Not finished; it continues the next time the app is opened with a connection.';
    show();
  }
}
