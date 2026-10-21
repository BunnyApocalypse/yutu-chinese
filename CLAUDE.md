# 玉兔中文 (Yutu Chinese; formerly Hanzi Trainer)

A local-first Chinese character writing trainer: a PWA built as an alternative to Skritter. For the owner first, on their own devices, and for any learner who wants it (`docs/goals.md`).

## Hard constraints

- **Vanilla JavaScript.** Vite is the only build tool. No frameworks and no TypeScript.
- **No backend.** Static files only; nothing is sent to a server. **All user data lives in IndexedDB** on the device.
- **Must work offline.** Nothing is fetched from the internet at runtime; stroke data is served from the app's own address (`public/char-data/`, `public/char-data-tw/`), never from Hanzi Writer's CDN loader.
- **Hanzi Writer** does stroke display and grading; don't replace it with a custom recognizer. The one agreed exception is the joined-stroke check in `src/shortcuts.js` (Hanzi Writer can't grade one drawn stroke against two textbook strokes).
- **Traditional and simplified are both first-class.** Never assume one script. **Traditional means Taiwan-standard forms** (為 with 9 strokes, 辶 and 艹 with 4).

## Must-have writing features

The owner would not use the app without these:

- **Raw input:** the learner's own handwriting stays on screen as drawn. Always call it "raw input" (the owner, 2026-10-12); Skritter's term for it must not appear in the app, docs or code. It matters on a tablet with a stylus too.
- **Common handwriting shortcuts are accepted** (子 in 2 strokes); the textbook stroke count is not forced.
- **Grading is not fussy:** small, awkward strokes (the ㇇ of 子) pass when written reasonably.

## Licensing

- App code: GPL-3.0-only (`LICENSE`).
- Stroke data (`data/animcjk/`, `hanzi-writer-data`): Arphic Public License, GPL-incompatible. Kept as separate data files the app loads; never paste it into source or relicense it.
- `data/cedict/` (dictionary, tone table): CC BY-SA 4.0.
- New dependencies must be GPL-compatible (MIT, BSD, Apache-2.0, LGPL, GPL). New data or code keeps its license in its own folder with a README (source and license), and gets a line in "Credits and licenses" (`credits-dialog` in `index.html`).

## Working with the owner

The owner reads Python and JavaScript comfortably but is not a developer.

- US English spelling everywhere (UI, comments, identifiers, docs).
- Simple, direct code; a few small, plainly named files over abstractions. Comment anything non-obvious, and explain new concepts (browser APIs, tooling, PWA mechanics) in plain language the first time.
- **Ask before adding any dependency**; the bar is high. Approved: `hanzi-writer`, `hanzi-writer-data`, `ts-fsrs`, `sql.js` and `fzstd` (reading Anki files, 2026-10-19), `vite` (development).
- **Fetch bulk data once and read it locally** rather than sending many requests to someone's server (2026-10-13). Development downloads go in the git-ignored `local/`, with source and fetch command in `local/README.md`.
- One milestone at a time: propose a plan before building something new, and don't build ahead.

## Commands

- `npm run dev`: dev server at http://localhost:5173; on a phone on the same Wi-Fi, the "Network" address Vite prints.
- `npm run build`: bundle into `dist/`, then (`postbuild`) pack the stroke data and write the service worker. `npm run preview` serves `dist/`.
- Both first run `scripts/copy-char-data.js` (`predev`/`prebuild`), which copies stroke data into `public/` if missing.
- `npm test`: unit tests in `tests/` (Node's test runner) for the plain-calculation code; nothing touching the page or IndexedDB.
- `npm run test:browser`: the real app in several headless Chromium browsers at once, about two minutes (`tests/browser/CLAUDE.md`). **Don't change files while it runs**: the dev server reloads the pages and tests fail.

## Read before working on an area

Each area's file in `docs/` (index `docs/README.md`) has the names in the code, the owner's decisions with dates, and what is not built. Read it before changing that area.

- Adding words, dictionary, scripts, Taiwan/mainland readings: `docs/words.md`
- Cards, FSRS, Review and Learn, the lesson, leeches, suspending, the card manager, the Progress tab: `docs/cards.md`
- Decks: `docs/decks.md`; HSK, TOCFL and radical lists, reading fixes: `docs/word-lists.md`
- Importing from Anki (.apkg, .colpkg), imported schedules: `docs/anki.md`
- `changedAt`, removal marks, `formerIds`, combining backups: `docs/merging.md`
- The word page, sentences, sound: `docs/word-page.md`
- Writing a character (raw input, shortcuts, the frame, stroke orders, gestures): `docs/writing.md`
- **Before touching the study area, `src/quiz.js`, `src/wordFlow.js`, Hanzi Writer, or anything that changes heights on the review screen: `docs/pitfalls.md`**
- Service worker, offline packs, the two deployed copies: `docs/offline.md`
- Introduction, tips, menu, Settings, looks, shared sizes, accessibility: `docs/interface.md`; the pass over the looks: `docs/ux-review.md` (pictures of every screen: `node scripts/ux-atlas.js`)
- Every file, one line each: `docs/layout.md`
- Long-term goals, testers, Skritter import: `docs/goals.md`
- Handover, roadmap, testing sessions: `docs/history.md`
- Browser tests: `tests/browser/CLAUDE.md`; learning notes: `data/notes/CLAUDE.md` (both load by themselves)

**When something is built or changed**, write the decision into its area's file: what it does, names in the code, the owner's choice and date. Keep it to what is true now, not how it got there; git has the rest. Add to this file only a rule that cuts across the whole code. It is loaded into every session.

## Rules that cut across the code

- **IDs are the same on every device.** A word's ID is `<traditional>|<pinyin>` (a sentence `<traditional>|sentence`, a radical `<traditional>|radical`); review IDs are random (`randomId()` in `src/db.js`; `crypto.randomUUID()` fails on the LAN address), except reviews brought over from Anki, named after Anki's own (`anki-…`, `docs/anki.md`) so a second import adds nothing. Never auto-incrementing keys.
- **Every review is logged and never deleted**, and never changed except when corrected in the same sitting of Review (looking back, `docs/cards.md`); cards can be rebuilt from reviews (`replay` in `src/scheduler.js`). Removing a word deletes its cards, never its reviews, and leaves a mark in `removed`.
- **`changedAt` is stamped by `putAll` in `src/db.js`, never by callers**; a change the app makes by itself to old records passes `{ stamp: false }`. Compare records without it.
- **The word's pop-up panel rebuilds the word from its form**, so fields not in the form are carried over by hand: `decks`, `formerIds`, `learnedAt`, `suspended`, `startedOverAt`, `importedAt`. A new such field must be added there.
- **Changing the store layout** means raising `DATABASE_VERSION` in `src/db.js`, handling existing databases in `onupgradeneeded` by `oldVersion`, and usually raising the backup version (both at 2; old backups must still be read). Testers' data is always carried over.
- **A setting that belongs to the device** goes in `DEVICE_SETTINGS` in `src/merge.js`, or combining backups takes it from the other device.
- **A word's script comes from `scriptFor(word, settings)`** (`src/words.js`), never `settings.script`. Card IDs come from `cardIdFor` / `allCardIds` (`src/session.js`), never built by hand.
- **`word.pinyin` may be empty or not syllables** (sentences, radicals); code reading it must cope.
- **Chinese on the page is marked with `lang`** (`langFor` / `fillMixed` in `src/lang.js`), and anything tapped is at least 24px tall; `tests/browser/accessibility.browser.js` checks both, with contrast, in both looks.
- **Always pass the script to `loadCharData`** (`src/charData.js`, the only place stroke data is loaded); never cache stroke data by character alone, never hard-code a stroke number. `src/quiz.js` is the only file importing Hanzi Writer, `src/scheduler.js` the only one importing ts-fsrs.
- **Addresses are built with `import.meta.env.BASE_URL`**, never a leading `/` (the build is relative).
- **Anything kept per site** (a cache, `localStorage`, a database) is named apart for the test copy (`__CHANNEL__`), or the test copy changes what the stable one relies on.
- **Nothing that identifies a tester** goes into the repository (names, contacts, identifying quotes): say "a tester". Testing notes live in the git-ignored `local/testing/`.
- **Content from Skritter stays on the owner's devices**: never commit an export or anything derived from one (`exports/` is git-ignored); print counts, not words.
- **Colors, text sizes, spacing, corners and tap heights are named once at the top of `src/style.css`** (colors with a light and a dark value); use `var(--name)`, never a value written out (`docs/interface.md`, "Dark mode" and "Shared sizes"). Buttons are of four kinds: `primary` (one a screen), plain, quiet `link-button`, `danger`. **The writing area stays the biggest thing on the screen** and the same size in every step; room is found by trimming the rows around it (`docs/pitfalls.md`).

## Deploying

- **Stable** from the `stable` branch at https://bunnyapocalypse.github.io/yutu-chinese/ (testers, the owner's data); **test** from `main` at `.../yutu-chinese/test/`. Pushing `main` publishes the test copy. The old `.../hanzi-trainer/` forwards from a repository of its own (`redirect/`).
- **Never push unless the owner has said to** (2026-10-15): no branch, not at the end of a session or a background job. Commit freely; say what is committed and not pushed. **Except** (2026-10-19): right after a push the owner asked for, when they ask to clean up or hand over, commits of handover notes and other docs only (nothing in the app) are pushed without asking; say so.
- **To release:** ask the owner, write the entry at the top of `src/changes.js` (the "What's new" pop-up: what a learner will notice, a few lines), then `git push origin main:stable` and `gh workflow run deploy.yml --ref main` (a run started by the push to `stable` is refused by the environment's rules).
- **No need to watch a deploy run** after pushing (the owner, 2026-10-19): push and move on, unless the change could affect the build itself (`package.json`, `vite.config.js`, `scripts/`, the workflow, the service worker or offline packs).
- If a deploy fails with "Fetching artifact metadata failed", don't re-run it; start a fresh run with the command above.
- The repository is `BunnyApocalypse/yutu-chinese`, with capitals. Never push the app to `BunnyApocalypse/hanzi-trainer` (only the forwarding site).

## Standing facts

- **Start with the handover at the top of `docs/history.md`**; the roadmap (agreed 2026-10-18) follows it.
- **The name is 玉兔中文** (Yùtù Zhōngwén, "Jade Rabbit Chinese"; the owner, 2026-10-15); "Yutu Chinese" where Chinese can't be marked with `lang` (plain text, file names); the browser tab and the home-screen label are "玉兔 Yutu" (`docs/goals.md`). The database (`hanzi-trainer`) and backup format (`hanzi-trainer-backup`) keep the old name for good.
- **The owner's real study is still in Skritter**; its scheduling data (GDPR request, 2026-10-12) has not arrived.
- **The owner has not tried** sentences, combining backups between real devices, or leeches: ask how it went before building further on them.
- `tests/words.tsv` has 109 test words; the app itself starts with none.
