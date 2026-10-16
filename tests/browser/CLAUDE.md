# Browser tests

Moved word for word from CLAUDE.md on 2026-10-15; see `docs/README.md` for where each former section is now.

## Browser tests

- **No dependency was added.** The tests start the Chromium installed on the computer (`chromium-browser`, `chromium` or `google-chrome` on the PATH, or `CHROME_PATH`) without a window, and drive it over the DevTools protocol with Node's built-in WebSocket. They start their own Vite dev server on port 5273, so `npm run dev` need not be running.
- **Parallel by sharing a pool of browsers.** `startBrowsers` starts several (half the processor's cores; `BROWSERS=3` to choose), each with its own temporary profile and so its own IndexedDB. A test asks the pool for a page with `browsers.use(...)` and gets whichever is free. Node's test runner runs as many tests at once as there are browsers (`concurrency` on the `describe`).
- **As many at once as free memory allows** (`tests/browser/run.js`, which `npm run test:browser` runs; the owner, 2026-10-15, after a run filled a 15 GB laptop's memory and brought the session down). Before, Node ran up to one file fewer than the cores at once, each file with its own Vite server and browser, and the writing grid with half the cores' browsers. Now the runner counts 400 MB per browser with its server (about 300 measured), uses half the memory free at the start, and prints what it chose: half the browsers that fit go to files at once (`--test-concurrency`), the rest to the grid (`BROWSERS`). `TEST_FILES=2 BROWSERS=3` set them by hand; file names after `npm run test:browser --` run only those. On the laptop with 5.6 GB free: 4 files at once, 4 grid browsers, 2.6 GB used, about two minutes.
- **The test browsers are started with their sound off** (`--mute-audio` in the harness), or the words the tests make the app speak are heard on the computer.
- **`npm test` does not run them:** it only picks up files named `*.test.js`. Browser test files are named `*.browser.js`.
- **Run part of the grid** with `CHARS=學母 npm run test:browser`.
- **Each test draws the same strokes every time**, whichever browser it lands on: its random shaking is seeded from the test's name.
- **Knowing when the next stroke can be drawn:** `src/quiz.js` puts a `data-busy` attribute on the writing area while Hanzi Writer is being handed stroke data (`setBusy`). A stroke drawn then would be lost. The tests wait for the status line to change and for `data-busy` to go, instead of pausing a fixed time. Any new place in `quiz.js` that awaits `giveWriter` must be wrapped the same way; so is the quiz's restart after a long hold (gestures).
- **A stroke that begins outside the writing area never reaches the app**, so the grid skips a character at a position where that would happen (wide characters in "shifted left").
- **Mouse events arrive about 60 a second in headless Chromium**, which is what a run's time is made of. More browsers help; shorter waits do not.
- **A pop-up the page puts up (`window.confirm`) stops everything** until it is answered, and a test's `window.confirm = () => true` is lost when the page is reloaded. Set it again after `reloadApp`.
- **No known failures since 2026-10-13:** all 165 runs of the grid pass (10 skipped). The command exits with an error if any fail.
- **Not covered yet:** grading in Review (the accessibility test only brings the grades up), drawn tone marks, the rest of the settings panel. Tone and pinyin cards are only touched by `settings.browser.js`. Use the same harness.
- **Text in a hidden part reads as empty** (`textOf` in the harness): since 2026-10-16 Settings shows one group at a time (`openSettings(page, group)`) and the forms for adding to a deck are tabs of a panel (`useAddForm(page, form)`, the panel left closed).
- **A setting is saved before it takes effect** (`change` in `src/settings.js` awaits the database), so after `choose(...)` a test waits for the effect instead of checking at once.
- **Each test file starts its own server and browsers**, and Node runs the files side by side. A file whose steps build on each other (`words.browser.js`) uses one browser and `concurrency: false`.
