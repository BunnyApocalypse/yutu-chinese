// The page's side of working offline: installing the service worker, saving
// the stroke data and dictionary in the background, asking the browser to
// keep the app's data, and offering a new version of the app when there is
// one. The service worker itself is src/serviceWorker.js; read its opening
// comment first.

import { getSetting, setSetting } from './db.js';
import { browserKind, storageAdvice } from './storageAdvice.js';

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

// ---- Keeping your data ----
//
// Browsers may clear a site's stored data when the device runs short of
// space. navigator.storage.persist() asks for this app's data (your words and
// reviews included) to be left alone. Some browsers ask the person; others
// decide by themselves, and say yes more readily once the app is installed
// on the home screen. The app only asks after explaining why: in the
// introduction (welcome.js) or with the button in Settings. What it says
// depends on the browser: see storageAdvice.js.

// What the page knows about long-term storage and installing, for the
// introduction and for Settings. listen(callback) is told whenever any of it
// may have changed.
const listeners = [];
const tellListeners = () => listeners.forEach((callback) => callback());

// A Chromium browser announces "beforeinstallprompt" when the app can be
// installed. Holding on to that event lets the app offer its own "Install
// the app" button instead of sending people to the browser's menu.
let installEvent = null;
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault(); // or some browsers show a banner of their own
  installEvent = event;
  tellListeners();
});

export const keepData = {
  listen(callback) {
    listeners.push(callback);
  },

  // Which family of browser this is (see storageAdvice.js).
  kind: browserKind(navigator.userAgent, navigator.userAgentData ? navigator.userAgentData.brands : []),

  // Everything storageAdvice() wants to know.
  async state() {
    return {
      canAsk: Boolean(navigator.storage && navigator.storage.persist),
      kept: Boolean(navigator.storage && navigator.storage.persisted && (await navigator.storage.persisted())),
      asked: await getSetting('keepDataWanted', false),
      // Running as an installed app: in a window of its own, or (iPhone and
      // iPad) started from the Home Screen.
      installed: window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
      canInstall: installEvent !== null,
    };
  },

  // Asks for long-term storage. Only ever called because a button was
  // tapped, after the explanation. Returns the answer: true or false.
  async ask() {
    // Remembered, so that browsers which decide by themselves can be asked
    // again later without bothering anyone (see setUpOffline).
    await setSetting('keepDataWanted', true);
    const kept = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false;
    tellListeners();
    return kept;
  },

  // Shows the browser's own "install this app?" question.
  async install() {
    if (installEvent) {
      installEvent.prompt();
      await installEvent.userChoice;
      installEvent = null; // an event can only be used once
      tellListeners();
    }
  },
};

// Once the app is installed, a browser that had said no will usually say yes.
window.addEventListener('appinstalled', async () => {
  installEvent = null;
  if ((await getSetting('keepDataWanted', false)) && navigator.storage && navigator.storage.persist) {
    await navigator.storage.persist();
  }
  tellListeners();
});

// Sets all of it going. Nothing here holds the app up: it is called once the
// app has started.
//
// elements:
//   statusElement: a line in the settings panel saying how things stand
//   updateButton:  shown when a new version of the app is ready
//   keepButton:    asks the browser for long-term storage
//   installButton: installs the app, where the browser lets the app offer that
export async function setUpOffline({ statusElement, updateButton, keepButton, installButton }) {
  // What is known so far, shown as one short paragraph.
  const state = { app: '', data: '', kept: '' };
  const show = () => {
    statusElement.textContent = [state.app, state.data, state.kept].filter(Boolean).join(' ');
  };

  // Long-term storage: say how it stands and what to do about it.
  const showKeeping = async () => {
    const keeping = await keepData.state();
    state.kept = storageAdvice(keepData.kind, keeping);
    keepButton.hidden = keeping.kept || !keeping.canAsk;
    installButton.hidden = !keeping.canInstall;
    show();
  };
  keepData.listen(showKeeping);
  keepButton.addEventListener('click', () => keepData.ask());
  installButton.addEventListener('click', () => keepData.install());
  // Someone who has asked for it before wants it. A browser that decides by
  // itself may have said no then and say yes now (after installing, or after
  // some use), so it is asked again, which shows nothing. Firefox would put
  // its question up again, so there it is left to the button.
  const keeping = await keepData.state();
  if (keeping.asked && !keeping.kept && keeping.canAsk && keepData.kind !== 'firefox') {
    await navigator.storage.persist();
  }
  await showKeeping();

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
