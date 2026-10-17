# 玉兔中文 (Yutu Chinese; formerly Hanzi Trainer)

A local-first Chinese character writing trainer: a PWA built as an alternative to Skritter. For the owner first, on their own devices, and for any learner who wants it (see `docs/goals.md`).

## Hard constraints

- **Vanilla JavaScript.** Vite is the only build tool. No frameworks (no React, Vue, Svelte, etc.) and no TypeScript.
- **No backend.** The app is static files only. Nothing is sent to a server.
- **All user data lives in IndexedDB** on the device.
- **Must work offline.** Nothing may be fetched from the internet at runtime. In particular, stroke data is served from the app's own address (`public/char-data/` and `public/char-data-tw/`), never from Hanzi Writer's default CDN loader.
- **Hanzi Writer** does stroke display and stroke-by-stroke quiz grading. Don't replace its grading with a custom stroke recognizer. The one agreed exception is the small check for joined strokes in `src/shortcuts.js`, which exists because Hanzi Writer cannot grade one drawn stroke against two textbook strokes.
- **Traditional and simplified characters are both first-class.** Never assume one script.
- **Traditional means Taiwan-standard forms** (為 with 9 strokes, 辶 and 艹 with 4), not mainland or Hong Kong variants.

## Must-have writing features

The owner has said they would not use the app without these (feedback after milestone 1):

- **Raw input.** The owner's own handwriting stays on screen as drawn, instead of being replaced by the font's stroke. (Always call it "raw input": the owner chose that name on 2026-10-12 in place of Skritter's own term for the feature, which must not appear in the app, docs or code.) They also write on a tablet, so this matters on large screens with a stylus.
- **Common handwriting shortcuts are accepted.** For example 子 written in 2 strokes (㇇ and 亅 joined) instead of 3. The textbook stroke count must not be forced.
- **Grading must not be fussy.** Small, awkward strokes (e.g. the ㇇ at the top of 子) should pass when written reasonably.

## Licensing

- The app's own code is GPL-3.0-only (`LICENSE`).
- Stroke data (`data/animcjk/`, `hanzi-writer-data`) stays under the Arphic Public License, which is GPL-incompatible. It is kept as separate data files that the app loads; never paste stroke data into source files or relicense it.
- The tone table and the dictionary in `data/cedict/` are CC BY-SA 4.0, as CC-CEDICT requires.
- A new dependency must have a GPL-compatible license (MIT, BSD, Apache-2.0, LGPL, GPL). New data must keep its own license in its own folder with a README, as `data/animcjk/` does.

## Working with the owner

The owner reads Python and JavaScript comfortably but is not a developer.

- Use US English spelling everywhere: UI text, comments, identifiers, docs ("practice", "color", "recognize").
- Keep code simple and direct. Prefer a few small, plainly named files over abstractions.
- Comment anything non-obvious, and explain new concepts (browser APIs, tooling, PWA mechanics) in plain language when they first come up.
- Ask before adding any dependency. The bar is high. Approved so far: `hanzi-writer`, `hanzi-writer-data`, `ts-fsrs`, and `vite` for development.
- **Fetch bulk data once and read it locally** instead of sending many requests to someone's server (the owner, 2026-10-13), as long as the file is not prohibitively large. Development-only downloads go in the git-ignored `local/` folder, with the source and the fetch command in `local/README.md`.
- Work one milestone at a time. Propose a plan before writing code for a new milestone, and don't build ahead.

## Commands

- `npm run dev`: start the dev server. On the PC: http://localhost:5173. On a phone on the same Wi-Fi: `http://<PC's LAN address>:5173` (Vite prints it as "Network" on startup).
- `npm run build`: bundle the app into `dist/`, then (npm's `postbuild` hook) pack the stroke data and write the service worker there.
- Both of these first run `scripts/copy-char-data.js` automatically (npm's `predev`/`prebuild` hooks), which copies the stroke data into `public/char-data/` and `public/char-data-tw/` if it isn't there yet.
- `npm run preview`: serve the built `dist/` to check the production build.

- `npm test`: run the tests in `tests/` with Node's built-in test runner (no extra dependency). They cover the plain-calculation code: scheduling, session planning, grade suggestion, pinyin formatting, word list parsing, backup checking. Anything touching the page or IndexedDB is not covered by these.
- `npm run test:browser`: run the tests in `tests/browser/`, which write characters in the real app in several headless Chromium browsers at once, as many as half the free memory allows (`tests/browser/run.js`). About two minutes on the laptop. See `tests/browser/CLAUDE.md`.

## Read before working on an area

How each part of the app works, and why, is in `docs/` (index: `docs/README.md`). Before changing an area, read its file; it has the names in the code, the owner's decisions with their dates, and what is not built.

- Adding words, dictionary lookup (characters and pinyin), scripts, Taiwan/mainland readings: `docs/words.md`
- Card kinds, FSRS, Review and Learn, the lesson, per-script writing cards, leeches, suspending, the card manager: `docs/cards.md`
- Decks: `docs/decks.md`
- `changedAt`, removal marks, `formerIds`, combining backups: `docs/merging.md`
- The word page, sentences, sound and recordings: `docs/word-page.md`
- Writing a character (raw input, shortcuts, following the frame, two stroke orders): `docs/writing.md`
- **Before touching the study area, `src/quiz.js`, `src/wordFlow.js`, Hanzi Writer, or anything that changes heights on the review screen: `docs/pitfalls.md`**
- HSK, TOCFL and radical lists, reading fixes, groups: `docs/word-lists.md`
- Service worker, offline packs, the two deployed copies: `docs/offline.md`
- Introduction, tips, menu, tabs, Settings' groups: `docs/interface.md`
- The pass over the looks: `docs/ux-review.md` (findings, task steps; pictures of every screen with `node scripts/ux-atlas.js`)
- Every file, one line each: `docs/layout.md`
- Long-term goals, testers, Skritter import: `docs/goals.md`
- Past session notes and the roadmap: `docs/history.md`
- Browser tests: `tests/browser/CLAUDE.md`; writing learning notes: `data/notes/CLAUDE.md` (both load by themselves when files there are touched)

**When something is built or changed**, write the decision into its area's file (what it does, names in the code, the owner's choice and date where it settles a question), and add to this file only a rule that cuts across the whole code or the open work below. Keep this file short: it is loaded into every session.

## Rules that cut across the code

- **IDs must be the same on every device.** A word's ID is `<traditional>|<pinyin>` (a sentence `<traditional>|sentence`, a radical `<traditional>|radical`); review IDs are random (`randomId()` in `src/db.js`, since `crypto.randomUUID()` fails on the LAN address). Never use auto-incrementing keys.
- **Every review is logged and never deleted**; cards can be rebuilt from reviews (`replay` in `src/scheduler.js`). Removing a word deletes its cards, never its reviews, and leaves a mark in `removed`.
- **`changedAt` is stamped by `putAll` in `src/db.js`, never by callers**; a change the app makes by itself to old records passes `{ stamp: false }`. Compare records without it.
- **The word's pop-up panel rebuilds the word from its form**, so fields not in the form are carried over by hand: `decks`, `formerIds`, `learnedAt`, `suspended`, `startedOverAt`. A new such field must be added there.
- **Changing the store layout** means raising `DATABASE_VERSION` in `src/db.js` and handling existing databases in `onupgradeneeded` by `oldVersion`, and usually raising the backup version (both at 2; old backups must still be read). Testers' data must always be carried over.
- **A setting that belongs to the device** goes in `DEVICE_SETTINGS` in `src/merge.js`, or combining backups takes it from the other device.
- **A word's script is decided by `scriptFor(word, settings)`** in `src/words.js`; never read `settings.script` for a word. Card IDs come from `cardIdFor` / `allCardIds` in `src/session.js`, never built by hand.
- **`word.pinyin` may be empty or not syllables** (sentences, radicals); code reading it must cope.
- **Chinese put on the page is marked with `lang`** (`langFor` / `fillMixed` in `src/lang.js`), and anything tapped is at least 24px tall; `tests/browser/accessibility.browser.js` checks both, with contrast, in both looks.
- **Always pass the script to `loadCharData`**; never cache stroke data by character alone, never hard-code a stroke number.
- **Addresses are built with `import.meta.env.BASE_URL`**, never a leading `/` (the build is relative).
- **Anything kept per site** (a cache, `localStorage`, a database) must be named apart for the test copy (`__CHANNEL__`), or the test copy changes what the stable one relies on.
- **A new source of data or code** gets its README with source and license, and a line in "Credits and licenses" (`credits-dialog` in `index.html`).
- **Nothing that identifies a tester** goes into the repository (names, contacts, identifying quotes): say "a tester". Testing notes live in the git-ignored `local/testing/`.
- **Content from Skritter stays on the owner's devices**: never commit an export or anything derived from one; `exports/` is git-ignored; print counts, not words.
- **Looks are not worked on** until the pass over the looks, except what is plainly broken. **Colors are named once at the top of `src/style.css`, with a light and a dark value, and so are sizes of text, space and corners and the height of what is tapped**; use `var(--name)` (add a name, in both looks for a color, only if none fits), never a color or size written out (`docs/interface.md`, "Dark mode" and "Shared sizes"). Buttons are of four kinds: `primary` (one a screen), plain, quiet `link-button`, `danger`. **The writing area must stay the biggest thing on the screen** and the same size in every step; room is found by trimming the rows around it (`docs/pitfalls.md`).

## Deploying

- Two copies: **stable** from the `stable` branch at https://bunnyapocalypse.github.io/yutu-chinese/ (testers, and the owner's data), **test** from `main` at `.../yutu-chinese/test/`. The old address, `.../hanzi-trainer/`, forwards there from a repository of its own (`redirect/`). Pushing `main` publishes the test copy.
- **To release:** ask the owner first, then `git push origin main:stable` and `gh workflow run deploy.yml --ref main` (a run started by the push to `stable` is refused by the environment's rules).
- If the deploy fails with "Fetching artifact metadata failed", don't re-run it; start a fresh run with the command above.
- The repository is `BunnyApocalypse/yutu-chinese`, with capitals. `BunnyApocalypse/hanzi-trainer` is now only the forwarding site; never push the app there.
- **Never push unless the owner has said to** (the owner, 2026-10-15): not `main`, not another branch, not at the end of a session or a background job. Commit freely; say what is committed and not pushed.

## Layout, in short

Full list in `docs/layout.md`.

- `index.html`, `src/main.js` (start-up, the menu and modes, backups), `src/style.css`.
- Decks and Words tabs: `src/wordsPanel.js` (both tabs, a deck's page, the list; sets up the rest), `src/addWordForm.js`, `src/addListForm.js`, `src/addSentenceForm.js`, `src/readyDecks.js`, `src/wordDialog.js` (a word's pop-up panel), `src/decksPanel.js`, `src/cardsPanel.js`, `src/wordPage.js`; `src/dictionaryLoader.js`, `src/wordRows.js`.
- Review and Learn: `src/review.js`, with `src/wordFlow.js` (writing a word), `src/recallCard.js`, `src/toneFlow.js`, `src/cardTip.js`.
- Writing: `src/quiz.js` (the only file importing Hanzi Writer), `src/charData.js` (the only place stroke data is loaded), `src/shortcuts.js`, `src/strokeMatch.js`, `src/frame.js`, `src/lines.js`.
- Storage: `src/db.js` (store layout documented at its top), `src/backup.js`, `src/merge.js`, `src/offline.js`, `src/serviceWorker.js`.
- Plain calculation, tested in `tests/*.test.js`: `src/session.js`, `src/scheduler.js` (the only file importing ts-fsrs), `src/words.js`, `src/wordList.js`, `src/dictionary.js`, `src/decks.js`, `src/tones.js`, `src/toneMark.js`, `src/leeches.js`, `src/cardManager.js`, `src/sentences.js`, `src/radicals.js`, `src/notes.js`, `src/characters.js`, `src/speechPlan.js`, `src/readingFixes.js`, `src/storageAdvice.js`.
- Data (each folder with its README and license): `data/cedict/`, `data/wordlists/`, `data/notes/`, `data/animcjk/`, `data/makemeahanzi/`, `data/audio-cmn/`. Build scripts run by hand in `scripts/`. Development downloads in the git-ignored `local/`.
- `tests/words.tsv`: 109 test words; the app itself starts with none.

## Where the work stands

Past session notes are in `docs/history.md`. **Start with its handover from 2026-10-17** (at the top of "Where the work stands"): nothing pushed, and what is waiting for the owner.

- **No big new features; improvements to how the app is used are welcome** (the owner, 2026-10-16, ending the freeze agreed on 2026-10-13: the aim is not to get distracted by large additions). Fixing what testing finds is still the main work.
- **The UX review of 2026-10-16 left 17 tasks** (list at the top of `docs/history.md`, details in `docs/ux-review.md`). Sorted with the owner that day: 1, 2, 3, 8, 11, 15, 17 and part of 6 fixed; 9 kept as it is; the rest for the pass over the looks.
- **The first testing session's suggestions (2026-10-14) were all built on 2026-10-15** (list and where each is documented: `docs/history.md`), except **"too many buttons" and the busy Learn screen: for the pass over the looks** (Free practice moved to Settings on 2026-10-17).
- **The app is named 玉兔中文** (Yùtù Zhōngwén, "Jade Rabbit Chinese"; the owner, 2026-10-15), at `.../yutu-chinese/`, with a jade 兔 on a paper moon as its icon (`scripts/icon.html`) until a calligrapher's 兔 replaces it. Where Chinese can't be marked with `lang` (plain-text reports, file names) it is "Yutu Chinese". The database (`hanzi-trainer`) and the backup format name (`hanzi-trainer-backup`) keep the old name for good. The move: `docs/offline.md`, "The old address".
- **Gestures on the writing area** (a must-have for the owner on mobile, breaking the feature freeze) **were built on 2026-10-15**: hold for a hint, swipe up to start again (`docs/writing.md`). Tried by the owner on their phone and released the same day.
- **The accessibility review was done and fixed on 2026-10-15** (`docs/interface.md`, "Accessibility"). Open: checking by hand with VoiceOver or TalkBack.
- **The owner has not tried** sentences, combining backups between real devices, and leeches. Ask how it went before building further on them. The rest built on 2026-10-13 and 14 they test as they use it (the owner, 2026-10-15).
- **The general page of notes for a native speaker** is being answered by a mainland reader in batches: #1 to #20 worked in on 2026-10-15, #21 to #42 on 2026-10-17, #43 to #131 to come (`data/notes/CLAUDE.md`).
- **The TOCFL list has no stated license**: to be reconsidered before a larger audience.
- **The pass over the looks** goes in an agreed order (2026-10-17; `docs/history.md`, after the UX review's tasks): shared styles, the study screen and the managing screens done (2026-10-17: the top bar stays, item 16, Free practice in Settings), the wording, and the Yutu looks in place of the plain ones (2026-10-17, `docs/interface.md`). `src/wordsPanel.js` was split by screen on 2026-10-17 (`docs/layout.md`), and the modes renamed (`'decks'`, `'words'`; `practice-button`).
- **The owner's real study is still in Skritter**; the Skritter scheduling data (GDPR request, 2026-10-12) has not arrived.
