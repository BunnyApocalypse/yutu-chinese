# Hanzi Trainer

A personal, local-first Chinese character writing trainer: a PWA built as an alternative to Skritter. One user, their own devices.

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

- **Raw squigs.** The owner's own handwriting stays on screen as drawn, instead of being replaced by the font's stroke. They also write on a tablet, so this matters on large screens with a stylus.
- **Common handwriting shortcuts are accepted.** For example 子 written in 2 strokes (㇇ and 亅 joined) instead of 3. The textbook stroke count must not be forced.
- **Grading must not be fussy.** Small, awkward strokes (e.g. the ㇇ at the top of 子) should pass when written reasonably.

## Working with the owner

The owner reads Python and JavaScript comfortably but is not a developer.

- Use US English spelling everywhere: UI text, comments, identifiers, docs ("practice", "color", "recognize").
- Keep code simple and direct. Prefer a few small, plainly named files over abstractions.
- Comment anything non-obvious, and explain new concepts (browser APIs, tooling, PWA mechanics) in plain language when they first come up.
- Ask before adding any dependency. The bar is high. Approved so far: `hanzi-writer`, `hanzi-writer-data`, `ts-fsrs`, and `vite` for development.
- Work one milestone at a time. Propose a plan before writing code for a new milestone, and don't build ahead.

## Commands

- `npm run dev`: start the dev server. On the PC: http://localhost:5173. On a phone on the same Wi-Fi: `http://<PC's LAN address>:5173` (Vite prints it as "Network" on startup).
- `npm run build`: bundle the app into `dist/`.
- Both of these first run `scripts/copy-char-data.js` automatically (npm's `predev`/`prebuild` hooks), which copies the stroke data into `public/char-data/` and `public/char-data-tw/` if it isn't there yet.
- `npm run preview`: serve the built `dist/` to check the production build.

- `npm test`: run the tests in `tests/` with Node's built-in test runner (no extra dependency). They cover the plain-calculation code: scheduling, session planning, grade suggestion, pinyin formatting, word list parsing, backup checking. Anything touching the page or IndexedDB is not covered; verify that in a browser.

## Layout

- `index.html`: the single page.
- `src/main.js`: entry point; the two modes (Review, Free practice), the script setting, backup buttons, first-run seeding.
- `src/review.js`: Review mode. Shows the due word's meaning, runs the word flow, shows grade buttons, saves the result.
- `src/wordFlow.js`: writing a word one character after another (slot row, status line, Restart / Outline / Animate / Next, tap to continue). Shared by both modes; tracks mistakes, hints and peeking per character, and in Review shows each character's verdict.
- `src/quiz.js`: the only file that imports Hanzi Writer. It reports plain results (strokes done, mistakes, hint shown) through handler functions. One Hanzi Writer instance is reused for all characters via `setCharacter()`.
- `src/scheduler.js`: the only file that imports `ts-fsrs`. `gradeOptions(fsrsState, now)` returns what each of the four grades would do to a card.
- `src/session.js`: plain calculation, no page or database: which word is next (`planSession`), the suggested grade (`suggestGrade`), the 4:00 day boundary, the daily new-word limit.
- `src/db.js`: small promise wrapper around IndexedDB. The store layout is documented at the top of the file.
- `src/backup.js`: build, check and restore a backup file.
- `src/wordList.js`: parses the four-column TSV word list format (same as Skritter's export) and converts numbered pinyin to tone marks.
- `src/seed-words.tsv`: the built-in list of 109 common words, loaded into the database on first run. Hand-written, not from a frequency corpus.
- `src/charData.js`: the only place stroke data is loaded from. `loadCharData(char, script)` returns `null` when a character has no data. For `'traditional'` it uses the Taiwan set where that has the character and the big set otherwise; for `'simplified'` only the big set.
- `src/shortcuts.js`: recognizes handwriting shortcuts (two textbook strokes written as one).
- `src/style.css`: styles, phone-first.
- `scripts/copy-char-data.js`: fills the two git-ignored stroke data folders, naming files by Unicode number (`學.json` becomes `5b78.json`): `public/char-data/` from `node_modules/hanzi-writer-data/` (about 9,500 characters) and `public/char-data-tw/` from `data/animcjk/graphicsZhHant.txt` (1,013 characters, plus an `index.json` listing them).
- `data/animcjk/`: the animCJK traditional stroke data, copied unchanged from that project at a pinned commit. Its README records the source, license and how to update. This is vendored data, not an npm dependency.
- `tests/logic.test.js`: tests for the plain-calculation code.

## Cards, scheduling and storage

- **Four card types per word, as in Skritter:** `writing` (shown the meaning, write the characters), `tone`, `pinyin` and `meaning` (each shown the characters). Only `writing` is built. Each card has its own schedule; the `cards` store is keyed `<wordId>#<type>` so the others can be added without changing storage.
- **Writing prompts show the meaning only.** The owner decided pinyin must not be given. A "Show pinyin" button reveals it for near-synonyms and does not affect the grade; the pinyin is shown once the word is finished. Glosses in word lists must therefore be distinguishable from each other.
- **One writing card per word.** A setting chooses the script written (traditional or simplified); the schedule is shared.
- **FSRS** with default parameters (90% target retention, learning steps of 1 and 10 minutes, fuzz on).
- **Each character gets a pass/fail verdict, and one missed character fails the word.** After a character is written, its slot turns green or red and two buttons (Missed / Got it) let the owner overrule the proposal. `judgeChar` (`src/session.js`) proposes "missed" if a hint flashed, the outline or animation was used, a finished character was restarted, or mistakes exceed a quarter of the character's strokes (one slip is always forgiven).
- **Word grade:** `suggestGrade` proposes Again if any character is missed, Hard if there were any mistakes, otherwise Good. Easy is never suggested. The owner can pick any of the four; tapping the writing area accepts the suggestion. Overruling the last character's verdict updates the suggestion live.
- Reviews store both the final verdicts (`passedPerChar`) and the proposed ones (`suggestedPerChar`), plus `mistakesPerChar`.
- **Session order:** due cards first (longest overdue first), then new words in list order, 10 new per day, day starting at 4:00.
- **Every review is logged** in the `reviews` store and never deleted. This is what a future FSRS parameter fit, and merging between devices, will work from.
- **IDs must be the same on every device.** A word's ID is `<traditional>|<pinyin>`; review IDs are random. Never use auto-incrementing keys: two devices would hand out the same numbers, making a later merge impossible.
- **Dates are stored as numbers** (milliseconds, like `Date.now()`), and FSRS state as plain JSON with ISO date strings, so records go into a backup file unchanged.
- **No sync.** IndexedDB belongs to one browser on one device at one address, so the phone and tablet have separate progress, and moving to GitHub Pages starts empty. Export/Import backup moves the whole database as one JSON file; import replaces everything (no merge yet). The backup has a `version` number: raise it and keep reading old versions if the shape changes.
- **Changing the store layout** means raising `DATABASE_VERSION` in `src/db.js` and handling existing databases in `onupgradeneeded`, and usually raising the backup version too.

## How the must-haves are implemented

- **Raw squigs:** Hanzi Writer's printed strokes are kept invisible during a quiz (`strokeColor` fully transparent). Each accepted stroke's `drawnPath` is drawn into our own SVG layer (`g.squigs`) in `src/quiz.js`. A rejected stroke fades away and counts as a mistake. On completion the printed character appears underneath in a light color for comparison.
- **Shortcuts:** Hanzi Writer always gets the unmodified textbook data, so display, animation and textbook-form grading are untouched. Both forms must be accepted: the shortcut is an option, never a requirement. `src/shortcuts.js` lists where a shortcut may begin (`shortcutStarts`, currently hand-written per character) and checks whether a drawn stroke matches the two textbook strokes joined. `src/quiz.js` runs that check on every stroke Hanzi Writer reports and, on a match, keeps the stroke and advances past both textbook strokes with `writer.skipQuizStroke()`. Because Hanzi Writer has already counted such a stroke as a mistake, `quiz.js` keeps its own mistake count. Do not implement shortcuts by editing the stroke data handed to Hanzi Writer: that was tried, and it forces the shortcut form on everyone.
- **Leniency:** the `LENIENCY` constant in `src/quiz.js`.

## Things that are easy to get wrong

- **Only 1,013 traditional characters have Taiwan-standard stroke data.** The big set (`hanzi-writer-data`, from Make Me a Hanzi) draws traditional characters in mainland-style forms: 為 as 爲 (12 strokes), 說 as 説, 辶 and 艹 with 3 strokes. The animCJK overlay fixes the characters it covers; the rest (for example 吃, 真, 骨) still come from the big set and may differ from the Taiwan standard. Taiwan's MOE data would be complete but is CC BY-NC-ND, so it cannot be converted and redistributed.
- **The script decides the form even for characters both scripts share** (花, 起, 道). Always pass the script to `loadCharData`; never cache stroke data by character alone.
- **Stroke numbers can differ between the two sets** for the same character (花 has 8 strokes in one and 7 in the other). The stroke numbers in `shortcutStarts` (`src/shortcuts.js`) must be checked against both.
- The slot row sets `lang` (`zh-Hant-TW` or `zh-Hans-CN`) so the device picks the right regional font. Without it a phone may show Japanese or mainland glyphs for the same character.
- `crypto.randomUUID()` only exists on HTTPS or localhost, so it fails on the LAN dev address. `randomId()` in `src/db.js` uses `crypto.getRandomValues()`, which works everywhere.
- The four grade buttons must fit side by side at phone width, and the whole review screen should fit without scrolling. The writing area's size is worked out in `chooseSize` (`src/wordFlow.js`) by reserving a fixed height for everything else; adjust that number when adding rows to the screen.
- In Review, the outline is switched off at the start of every word. Left on, it would count as peeking and make every suggestion "Again".

- Vite's dev server answers a request for a missing file with the app's HTML page and status 200, not a 404. `loadCharData` therefore treats "not valid JSON" as "no stroke data".
- Never create a new Hanzi Writer per character: each instance adds touch listeners to the writing area and never removes them. Use `setCharacter()`. The one exception is rebuilding the writing area after a screen rotation, which is rare.
- `setCharacter()` rebuilds Hanzi Writer's layers and resets the outline to hidden, so `start()` in `src/quiz.js` re-appends the squig layer and re-applies the outline setting each time.
- The window `resize` handler only reacts to width changes. On Android the on-screen keyboard changes the height, and that must not wipe a character in progress.
- The stroke data is under the Arphic Public License; the copy script ships `ARPHICPL.TXT` alongside it.

- Service workers and "Add to Home Screen" only work over HTTPS or on `localhost`. The LAN dev address (`http://192.168.x.x:5173`) is plain HTTP, so offline/install features cannot be tested there from the phone. The plan is to deploy the built site to GitHub Pages for that (the repo is public for this reason).
- The writing area needs `touch-action: none`, otherwise drawing scrolls the page on a phone.
- Hanzi Writer adds its SVG layers only after the character data has loaded, and later SVG elements are drawn on top. The squig layer is therefore re-appended at the start of each quiz so it stays above them.
- Hanzi Writer colors the strokes of a character's radical separately (`radicalColor`, falling back to `strokeColor` only at creation). Changing `strokeColor` later leaves the radical's strokes in the old color, so always change both (see `setPrintedColor` in `src/quiz.js`).
- Hanzi Writer works out touch positions from the SVG's on-screen size, so the `width`/`height` passed to it must match the element's real size. Don't scale the SVG with CSS.

## Skritter import (future)

The owner wants to bring their Skritter data across eventually rather than start from scratch. Don't build it early, but keep it in mind whenever the data model is designed: it should hold words as well as single characters, both scripts, and per-item review history and scheduling state. Look at a real Skritter export before finalising the IndexedDB schema. Personal exports go in `exports/`, which is git-ignored.

## Roadmap

1. **Done:** one hardcoded character, stroke-by-stroke quiz with grading, reachable from a phone over the LAN.
2. **Done:** raw squigs, lenient grading, optional 2-stroke 子 (in 學 only).
3. **Done:** practice any typed character or multi-character word; stroke data loaded on demand.
4. **Done:** FSRS scheduling of writing cards on a built-in word list, IndexedDB storage, backup export/import.
5. **Done:** Taiwan-standard stroke data for the 1,013 traditional characters animCJK covers. Still open: the traditional characters it does not cover.
6. The other card types: tone, pinyin (with zhuyin as an alternative), meaning.
7. Shortcuts for every character, not just 學 (candidate: allow joining any two consecutive strokes that meet end to start; or explicit rules per component).
8. PWA: manifest, service worker, GitHub Pages deploy, installable and offline on the phone.
9. Import the Skritter word list (TSV) and, if the GDPR request (sent 2026-10-12) yields it, its scheduling data. The owner does not want the word list imported without scheduling data.
10. Merge backups between devices instead of replacing; a settings screen (new words per day, target retention).
