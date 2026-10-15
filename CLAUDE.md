# Hanzi Trainer

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
- `npm run test:browser`: run the tests in `tests/browser/`, which write characters in the real app in several headless Chromium browsers at once. About half a minute. See `tests/browser/CLAUDE.md`.

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
- **Always pass the script to `loadCharData`**; never cache stroke data by character alone, never hard-code a stroke number.
- **Addresses are built with `import.meta.env.BASE_URL`**, never a leading `/` (the build is relative).
- **Anything kept per site** (a cache, `localStorage`, a database) must be named apart for the test copy (`__CHANNEL__`), or the test copy changes what the stable one relies on.
- **A new source of data or code** gets its README with source and license, and a line in "Credits and licenses" (`credits-dialog` in `index.html`).
- **Nothing that identifies a tester** goes into the repository (names, contacts, identifying quotes): say "a tester". Testing notes live in the git-ignored `local/testing/`.
- **Content from Skritter stays on the owner's devices**: never commit an export or anything derived from one; `exports/` is git-ignored; print counts, not words.
- **Looks are not worked on** until the pass over the looks (with dark mode), except what is plainly broken. **The writing area must stay the biggest thing on the screen** and the same size in every step; room is found by trimming the rows around it (`docs/pitfalls.md`).

## Deploying

- Two copies: **stable** from the `stable` branch at https://bunnyapocalypse.github.io/hanzi-trainer/ (testers, and the owner's data), **test** from `main` at `.../hanzi-trainer/test/`. Pushing `main` publishes the test copy.
- **To release:** ask the owner first, then `git push origin main:stable` and `gh workflow run deploy.yml --ref main` (a run started by the push to `stable` is refused by the environment's rules).
- If the deploy fails with "Fetching artifact metadata failed", don't re-run it; start a fresh run with the command above.
- The repository is `BunnyApocalypse/hanzi-trainer`, with capitals.
- **Before the session ends, push** (the owner's instruction).

## Layout, in short

Full list in `docs/layout.md`.

- `index.html`, `src/main.js` (start-up, the menu and modes, backups), `src/style.css`.
- Decks and Words tabs: `src/wordsPanel.js` (about 1,600 lines; serves both tabs, the add forms, the pop-up panel), `src/decksPanel.js`, `src/cardsPanel.js`, `src/wordPage.js`.
- Review and Learn: `src/review.js`, with `src/wordFlow.js` (writing a word), `src/recallCard.js`, `src/toneFlow.js`, `src/cardTip.js`.
- Writing: `src/quiz.js` (the only file importing Hanzi Writer), `src/charData.js` (the only place stroke data is loaded), `src/shortcuts.js`, `src/strokeMatch.js`, `src/frame.js`, `src/lines.js`.
- Storage: `src/db.js` (store layout documented at its top), `src/backup.js`, `src/merge.js`, `src/offline.js`, `src/serviceWorker.js`.
- Plain calculation, tested in `tests/*.test.js`: `src/session.js`, `src/scheduler.js` (the only file importing ts-fsrs), `src/words.js`, `src/wordList.js`, `src/dictionary.js`, `src/decks.js`, `src/tones.js`, `src/toneMark.js`, `src/leeches.js`, `src/cardManager.js`, `src/sentences.js`, `src/radicals.js`, `src/notes.js`, `src/characters.js`, `src/speechPlan.js`, `src/readingFixes.js`, `src/storageAdvice.js`.
- Data (each folder with its README and license): `data/cedict/`, `data/wordlists/`, `data/notes/`, `data/animcjk/`, `data/makemeahanzi/`, `data/audio-cmn/`. Build scripts run by hand in `scripts/`. Development downloads in the git-ignored `local/`.
- `tests/words.tsv`: 109 test words; the app itself starts with none.

## Where the work stands

Past session notes are in `docs/history.md`.

- **No new features until the owner's own testing and a first round with testers are done** (agreed 2026-10-13); fixing what testing finds is the work. Exceptions are agreed one by one, like the list below.
- **Suggestions from the first testing session** (2026-10-14; each to be agreed with the owner before it is built):
  1. **Done 2026-10-15:** adding a word by its pinyin (`docs/words.md`).
  2. **Done 2026-10-15:** the stroke count as "3/7", hidden in Review unless a setting shows it (`docs/writing.md`).
  3. **Done 2026-10-15:** tips of one line each, those about one thing beside it when it first matters (`docs/interface.md`).
  4. **Done 2026-10-15:** a word of an example sentence shows a popup first (`docs/word-page.md`).
  5. **Done 2026-10-15:** tone buttons show bare tone marks (`docs/cards.md`).
  6. **Pinyin in the notes of the beginner levels** (TOCFL Novice, HSK 3.0 levels 1 and 2), by a script: a beginner did not know 的 in a note.
  7. **Long-term storage:** a message once rather than a dot (Chrome grants it only to an installed app, so a dot would stay on).
  8. **Free practice under Words, "too many buttons", the Learn screen busy:** for the pass over the looks.
  9. **Anki:** no sync (AnkiWeb's terms forbid it, and it would need a server); syncing through the learner's own storage reuses the combining of backups; an `.apkg` export could come later and would need a library (ask first).
  10. **Note-taking in testing:** keep what was seen apart from what to do about it; fill in "While they work" and the time; mark prompted answers; name the file by a code (T1).
- **The owner has not tried** most of what was built on 2026-10-13 and 14 (combining backups between real devices, sound, sentences, leeches, the card manager, the word page on a phone, the groups of the higher levels, radicals); the full list is in `docs/history.md`. Ask how it went before building further on any of it.
- **The general page of notes for a native speaker** has not been answered (the Taiwan one was; `data/notes/CLAUDE.md`).
- **The TOCFL list has no stated license**: to be reconsidered before a larger audience.
- **Refactoring** (`src/wordsPanel.js` split by screen, old names such as the mode `'words'` and `practice-tab`, colors gathered into named values): after the testers' round, together with the pass over the looks.
- **The owner's real study is still in Skritter**; the Skritter scheduling data (GDPR request, 2026-10-12) has not arrived.
