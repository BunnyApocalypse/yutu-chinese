# Offline use and deployment

The owner chose (2026-10-13): all stroke data saved on the device, and automatic deployment.

## The two copies

- **Two copies at one site** (the owner, 2026-10-13). `.github/workflows/deploy.yml` builds both whenever either branch is pushed (after `npm test` on each; not the browser tests):
  - **stable**, from the `stable` branch, at https://bunnyapocalypse.github.io/yutu-chinese/: what people use, the owner's data included;
  - **test**, from `main`, at `.../yutu-chinese/test/`: live within minutes of a push to `main`.
- **To release** (ask the owner first): the entry at the top of `src/changes.js`, then `git push origin main:stable` and `gh workflow run deploy.yml --ref main`. The second is needed because the `github-pages` environment only lets `main` publish: a run started by the push to `stable` is refused ("not allowed to deploy due to environment protection rules"), so the workflow is started by `main` or by hand and builds both branches either way. If it fails with "Fetching artifact metadata failed", start a fresh run; a re-run uploads a second copy and fails.
- **The test copy is told apart by `VITE_CHANNEL=test`** (`__CHANNEL__`, `vite.config.js`). A browser keeps one set of databases and caches for the whole site, so the test copy has its own database (`hanzi-trainer-test`, `src/db.js`) and app-file store (`test-app-…`), and the stable service worker leaves `test/` alone. It says "(test)" in its title, version line and home-screen name, and has no recording packs (to stay under GitHub's 1 GB; the two copies are about 565 MB). **Anything else kept per site must be kept apart the same way.**
- **The build is relative** (`base: './'`), so `dist/` works in any folder; build addresses with `import.meta.env.BASE_URL`, never a leading `/`.

## The service worker and offline data

- **`src/serviceWorker.js`** is copied by `scripts/build-offline.js` (`postbuild`) to `dist/sw.js` with `VERSION` (a fingerprint of the app's files) and `APP_FILES` in front. It answers from the device's caches if it can, the network otherwise. None under `npm run dev`.
- **The recordings of "Basics of Chinese" are app files** (`BASICS_RECORDINGS` in `src/basicsSounds.js`, 11 small files; 2026-10-21), so that page plays offline from the start; every other recording is kept once played or saved from Settings.
- **Two caches:** `app-<VERSION>`, replaced each version; `offline-data` (stroke data, dictionary, word lists, notes), kept across versions. Recordings have their own store (`docs/word-page.md`).
- **Stroke data is saved in the background, in packs**: 10,600 files one by one is too slow for a phone, so they are packed 600 to a file into `dist/offline/` (18 packs, 35 MB; about 14 MB downloaded), listed in `offline/index.json`. `saveOfflineData` in `src/offline.js` puts every file into the cache under its own address, so `loadCharData` and the service worker know nothing of packs. A pack's name carries a fingerprint and a finished pack leaves a mark, so an interrupted download resumes and unchanged packs aren't fetched again. The single files stay in `dist/` until the packs are in.
- **A new version waits** for "New version ready: tap to reload" in the footer, so the app never changes under a review; without the tap it takes over once every window of the app is closed.
- **Long-term storage** (`navigator.storage.persist()`) is asked for in the introduction or from Settings, never by itself (`docs/interface.md`); Settings shows how it stands under "Offline use", with the download's progress.
- **`tests/browser/offline.browser.js`** builds the app, serves `dist/` from a sub-folder with a plain file server (`startBuiltApp`, like GitHub Pages), waits for everything to be saved, fakes a new version, stops the server and checks writing, the dictionary and tone cards. It leaves `dist/` built.
- **Not tested here:** installing on a real phone, and airplane mode on it.

## Icons

- **`public/icons/`** (2026-10-15): 兔 in jade green on a full moon that is also a sheet of paper (grain, the grid's dashed cross), in a night sky (the owner's idea). The character is in AR PL UKai TW (Fedora `cjkuni-ukai-fonts`; the owner's choice). Drawn as an SVG in `scripts/icon.html` and made into pictures by `node scripts/make-icons.js`, run by hand. The maskable one keeps the moon inside the middle 80%; `swatch.png` is the paper and 兔 alone, for the looks' samples. Drafts: `local/icon-drafts/`.
- **To be redone with a calligrapher's 兔** (roadmap item 6); as a browser tab's icon the night sky's dark square looks bad, not worth fixing before then.

## The old address

The repository was renamed from `hanzi-trainer` to `yutu-chinese` on 2026-10-15, moving the site. GitHub forwards a renamed repository's code and remotes but not its Pages site, so:

- **Words and progress came along by themselves** (data is kept per site, not per folder); possibly not in an app on an iPhone's home screen, untested.
- **A new repository `BunnyApocalypse/hanzi-trainer`** publishes only `redirect/` (see its README): a page, also as `404.html`, sending any address under `/hanzi-trainer/` to the same place under `/yutu-chinese/`, and a `sw.js` (also `test/sw.js`) that replaces the old service workers, removes itself and sends open windows on, since an installed copy never asks for the page but does check `sw.js`. Because that repository exists, GitHub no longer forwards the old name: remotes must point to `yutu-chinese`.
- **`forgetOldFolder` in `src/offline.js`** deletes once (`old-folder-forgotten` in `localStorage`) the service workers and saved data under `/hanzi-trainer/` (about 45 MB), never while served from there. Tested in `tests/browser/offline.browser.js`.
