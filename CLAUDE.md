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

- **Raw input.** The owner's own handwriting stays on screen as drawn, instead of being replaced by the font's stroke. (Always call it "raw input": the owner chose that name on 2026-10-12 in place of Skritter's own term for the feature, which must not appear in the app, docs or code.) They also write on a tablet, so this matters on large screens with a stylus.
- **Common handwriting shortcuts are accepted.** For example 子 written in 2 strokes (㇇ and 亅 joined) instead of 3. The textbook stroke count must not be forced.
- **Grading must not be fussy.** Small, awkward strokes (e.g. the ㇇ at the top of 子) should pass when written reasonably.

## Licensing

- The app's own code is GPL-3.0-only (`LICENSE`).
- Stroke data (`data/animcjk/`, `hanzi-writer-data`) stays under the Arphic Public License, which is GPL-incompatible. It is kept as separate data files that the app loads; never paste stroke data into source files or relicense it.
- The tone table in `data/cedict/` is CC BY-SA 4.0, as CC-CEDICT requires.
- A new dependency must have a GPL-compatible license (MIT, BSD, Apache-2.0, LGPL, GPL). New data must keep its own license in its own folder with a README, as `data/animcjk/` does.

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

- `npm test`: run the tests in `tests/` with Node's built-in test runner (no extra dependency). They cover the plain-calculation code: scheduling, session planning, grade suggestion, pinyin formatting, word list parsing, backup checking. Anything touching the page or IndexedDB is not covered by these.
- `npm run test:browser`: run the tests in `tests/browser/`, which write characters in the real app in several headless Chromium browsers at once. About half a minute. See "Browser tests" below.

## Layout

- `index.html`: the single page.
- `src/main.js`: entry point; the two modes (Review, Free practice), backup buttons, first-run seeding.
- `src/review.js`: Review mode. Picks the next card, hands it to the code for its kind, shows the grade buttons, saves the result.
- `src/recallCard.js`: meaning and pinyin cards (see the word, tap to reveal, grade yourself).
- `src/toneFlow.js`: tone cards (one tone per character, by button or drawn mark, checked automatically).
- `src/toneMark.js`: recognizes a drawn tone mark (level, rising, down-then-up, falling, dot). Plain calculation.
- `src/tones.js`: which reading of a word applies (Taiwan or mainland), lining syllables up with characters, and which tones are accepted. Plain calculation.
- `src/settings.js`: the settings and their panel.
- `src/wordFlow.js`: writing a word one character after another (slot row, status line, Restart / Outline / Animate / Next, tap to continue). Shared by both modes; tracks mistakes, hints and peeking per character, and in Review shows each character's verdict.
- `src/quiz.js`: the only file that imports Hanzi Writer. It reports plain results (strokes done, mistakes, hint shown) through handler functions. One Hanzi Writer instance is reused for all characters via `setCharacter()`.
- `src/scheduler.js`: the only file that imports `ts-fsrs`. `gradeOptions(fsrsState, now)` returns what each of the four grades would do to a card.
- `src/session.js`: plain calculation, no page or database: which card is next (`planSession`), the suggested grade for writing (`suggestGrade`, `judgeChar`), the 4:00 day boundary, the daily new-word limit, the hold between cards of one word.
- `src/db.js`: small promise wrapper around IndexedDB. The store layout is documented at the top of the file.
- `src/backup.js`: build, check and restore a backup file.
- `src/wordList.js`: parses the four-column TSV word list format (same as Skritter's export) and converts numbered pinyin to tone marks.
- `src/seed-words.tsv`: the built-in list of 109 common words, loaded into the database on first run. Hand-written, not from a frequency corpus.
- `src/charData.js`: the only place stroke data is loaded from. `loadCharData(char, script)` returns `null` when a character has no data. For `'traditional'` it uses the Taiwan set where that has the character and the big set otherwise; for `'simplified'` only the big set.
- `src/shortcuts.js`: recognizes handwriting shortcuts (two textbook strokes written as one). Plain calculation, no page or Hanzi Writer.
- `src/strokeMatch.js`: judges whether a drawn stroke fits a given textbook stroke, and keeps track of two stroke orders. Plain calculation.
- `src/frame.js`: works out where and how big a character is being written and moves stroke data there. Plain calculation.
- `src/lines.js`: shared helpers for lines of points (length, resampling, shape, distance).
- `src/style.css`: styles, phone-first.
- `scripts/copy-char-data.js`: fills the two git-ignored stroke data folders, naming files by Unicode number (`學.json` becomes `5b78.json`): `public/char-data/` from `node_modules/hanzi-writer-data/` (about 9,500 characters) and `public/char-data-tw/` from `data/animcjk/graphicsZhHant.txt` (1,013 characters, plus an `index.json` listing them and recording `TAIWAN_SET_VERSION`; raise that number whenever the script changes what it writes, or existing copies will not be regenerated).
- `scripts/strokeOrder.js`: finds a character's second stroke order by comparing the two data sets. Used by the copy script.
- `scripts/build-tone-table.js`, `data/cedict/`: the tone table extracted from CC-CEDICT (run by hand; see above).
- `data/animcjk/`: the animCJK traditional stroke data, copied unchanged from that project at a pinned commit. Its README records the source, license and how to update. This is vendored data, not an npm dependency.
- `tests/logic.test.js`, `tests/shortcuts.test.js`, `tests/strokeOrder.test.js`, `tests/toneMark.test.js`, `tests/frame.test.js`: tests for the plain-calculation code.
- `tests/browser/harness.js`: what the browser tests share: serving the app, starting the browsers, drawing strokes, reading the status line.
- `tests/browser/writing-grid.browser.js`: writes 15 characters in both stroke orders at seven positions and sizes.

## Browser tests

- **No dependency was added.** The tests start the Chromium installed on the computer (`chromium-browser`, `chromium` or `google-chrome` on the PATH, or `CHROME_PATH`) without a window, and drive it over the DevTools protocol with Node's built-in WebSocket. They start their own Vite dev server on port 5273, so `npm run dev` need not be running.
- **Parallel by sharing a pool of browsers.** `startBrowsers` starts several (half the processor's cores; `BROWSERS=3` to choose), each with its own temporary profile and so its own IndexedDB. A test asks the pool for a page with `browsers.use(...)` and gets whichever is free. Node's test runner runs as many tests at once as there are browsers (`concurrency` on the `describe`).
- **`npm test` does not run them:** it only picks up files named `*.test.js`. Browser test files are named `*.browser.js`.
- **Run part of the grid** with `CHARS=學母 npm run test:browser`.
- **Each test draws the same strokes every time**, whichever browser it lands on: its random shaking is seeded from the test's name.
- **Knowing when the next stroke can be drawn:** `src/quiz.js` puts a `data-busy` attribute on the writing area while Hanzi Writer is being handed stroke data (`setBusy`). A stroke drawn then would be lost. The tests wait for the status line to change and for `data-busy` to go, instead of pausing a fixed time. Any new place in `quiz.js` that awaits `giveWriter` must be wrapped the same way.
- **A stroke that begins outside the writing area never reaches the app**, so the grid skips a character at a position where that would happen (wide characters in "shifted left").
- **Mouse events arrive about 60 a second in headless Chromium**, which is what a run's time is made of. More browsers help; shorter waits do not.
- **Known failures on 2026-10-12** (159 of 165 runs pass, 10 skipped). The command exits with an error while any remain. None is at the first stroke any more:
  - At half size, the second or third stroke is rejected for 學 (MOE order, both half-size positions), and at the bottom right for 覺, 麼 and 謝 (MOE order). The size is not yet known that early, so the stroke is expected at full size.
  - 學 in the mainland order, shifted right so its left ノ lands on the 爻: the third stroke is rejected.
- **Not covered yet:** tone, pinyin and meaning cards, Review mode, the settings panel. Use the same harness.

## Cards, scheduling and storage

- **Four card types per word, as in Skritter**, each with its own schedule (`cards` store, keyed `<wordId>#<type>`):
  - `meaning`: see the word, recall the meaning. Reveal and self-grade.
  - `pinyin`: see the word, recall the reading. Reveal and self-grade.
  - `tone`: see the word, give each character's tone, with five buttons or by drawing the tone mark on the card. Checked automatically; a right answer moves on by itself, a wrong one waits for a tap; one wrong tone suggests Again. A word whose pinyin doesn't have one syllable per character gets no tone card.
  - `writing`: see the meaning, write the word.
- **A word's cards are introduced in the order meaning, pinyin, tone, writing**, one at a time.
- **Cards of one word are kept apart** (`SIBLING_GAP_MS`, 3 minutes), because each gives away the others' answers: a writing card ends by showing the pinyin, the others show the characters. With few words in play this makes the app say "next review in N minutes" although cards exist. That is intended.
- **New words per day counts words, not cards** (setting, default 5). A word is introduced when its first card of any type is studied. New cards of words already introduced are not limited.
- **Free practice shows any of the four card kinds without recording anything**, mainly so cards can be tried and tested. Writing works for any typed characters (`startFreePractice` in `src/main.js`); tone, pinyin and meaning need the word's reading and meaning, so the typed word must be in the word list (`practice` in `src/review.js`). A practice card gets no grade buttons, and continuing shows it again.
- **Settings** (`settings` store): `script`, `pronunciation`, `rawInput`, `newWordsPerDay`, `enabledTypes`. A type switched off never appears but keeps its cards and history. At least one type stays on.
- **Writing prompts show the meaning only.** The owner decided pinyin must not be given. A "Show pinyin" button reveals it for near-synonyms and does not affect the grade; the pinyin is shown once the word is finished. Glosses in word lists must therefore be distinguishable from each other.
- **One writing card per word.** A setting chooses the script written (traditional or simplified); the schedule is shared.
- **FSRS** with default parameters (90% target retention, learning steps of 1 and 10 minutes, fuzz on).
- **Each character gets a pass/fail verdict, and one missed character fails the word.** After a character is written, its slot turns green or red and two buttons (Missed / Got it) let the owner overrule the proposal. `judgeChar` (`src/session.js`) proposes "missed" if a hint flashed, the outline or animation was used, a finished character was restarted, or mistakes exceed a quarter of the character's strokes (one slip is always forgiven).
- **Word grade:** `suggestGrade` proposes Again if any character is missed, Hard if there were any mistakes, otherwise Good. Easy is never suggested. The owner can pick any of the four; tapping the writing area accepts the suggestion. Overruling the last character's verdict updates the suggestion live.
- **Skip and back arrows** beside the writing area. Skip (right, `›`) is there in a word of several characters: it moves past the current character and counts it as passed (the owner's request: in 為什麼, practice only 為). Mistakes made before skipping still count. Skipping the last character shows it and finishes the word. Back (left, `‹`) undoes a skip: whenever a character at or before the current one was skipped, including after the word is finished, it returns to the nearest such character to write it, with no penalty. Because of this, characters are not always finished in order: `wordFlow` tracks `finishedPerChar`, the word is done when all are finished (`wordFinished`), and Next goes to the next unfinished one (`nextUnfinished`). Don't test for "the last character" by position. Skipped characters are saved as `skippedPerChar` and shown with a dashed slot.
- Reviews store both the final verdicts (`passedPerChar`) and the proposed ones (`suggestedPerChar`), plus `mistakesPerChar`.
- **Session order:** due cards first (longest overdue first), then new cards of words already introduced, then new words in list order; the day starts at 4:00.
- **Every review is logged** in the `reviews` store and never deleted. This is what a future FSRS parameter fit, and merging between devices, will work from.
- **IDs must be the same on every device.** A word's ID is `<traditional>|<pinyin>`; review IDs are random. Never use auto-incrementing keys: two devices would hand out the same numbers, making a later merge impossible.
- **Dates are stored as numbers** (milliseconds, like `Date.now()`), and FSRS state as plain JSON with ISO date strings, so records go into a backup file unchanged.
- **No sync.** IndexedDB belongs to one browser on one device at one address, so the phone and tablet have separate progress, and moving to GitHub Pages starts empty. Export/Import backup moves the whole database as one JSON file; import replaces everything (no merge yet). The backup has a `version` number: raise it and keep reading old versions if the shape changes.
- **Changing the store layout** means raising `DATABASE_VERSION` in `src/db.js` and handling existing databases in `onupgradeneeded`, and usually raising the backup version too.

## How the must-haves are implemented

- **Raw input or snap to print** (the `rawInput` setting, on by default; the owner uses raw input, the other mode is for people who prefer tidy characters). With it off, each correct stroke is replaced by the printed stroke as Hanzi Writer does on its own: the printed strokes are shown in ink while writing, no own strokes are kept, and the character is not followed when written off-center, since the printed strokes are a visible reference. Everything else (shortcuts, both stroke orders, verdicts) is the same in both modes. `colorWhileWriting` and `referenceColor` in `src/quiz.js` hold the difference.
- **Raw input:** Hanzi Writer's printed strokes are kept invisible during a quiz (`strokeColor` fully transparent). Each accepted stroke's `drawnPath` is drawn into our own SVG layer (`g.drawn-strokes`) in `src/quiz.js`. A rejected stroke fades away and counts as a mistake. On completion the printed character appears underneath in a light color for comparison.
- **Shortcuts:** Hanzi Writer always gets the unmodified textbook data, so display, animation and textbook-form grading are untouched. Both forms must be accepted: the shortcut is an option, never a requirement. `src/shortcuts.js` works out from the stroke data which pairs of consecutive strokes may be joined, and checks whether a drawn stroke is such a joined pair. `src/quiz.js` runs that check on every stroke Hanzi Writer reports and, on a match, keeps the stroke and advances past both textbook strokes with `writer.skipQuizStroke()`. Because Hanzi Writer has already counted such a stroke as a mistake, `quiz.js` keeps its own mistake count. Do not implement shortcuts by editing the stroke data handed to Hanzi Writer: that was tried, and it forces the shortcut form on everyone.
  - **Joinable pair** (`isJoinable`): the first stroke ends where the second begins (after at most a short lead-in), both parts are long enough to matter, and the joined shape differs visibly from either stroke alone. There are no per-character lists.
  - **The error that matters is a misfire:** taking a single stroke for the joined pair. If it is the first stroke, the app skips a stroke that was never written; if it is the second, a forgotten first stroke passes unnoticed. A missed joined stroke only costs a mistake. `isShortcutStroke` therefore compares shapes with size taken away (a first stroke drawn too big reaches as far as the joined pair would), requires the joined reading to be clearly closer than either single stroke, and checks where the stroke starts.
  - `tests/shortcuts.test.js` simulates shifted, resized and shaky strokes over the built-in list and requires zero misfires of both kinds. Run it after touching any constant in `src/shortcuts.js`.
  - **Out of scope so far:** three or more strokes in one go, and shortcuts that reorder or drop strokes (口 in 2, 艹 in 3, 糸's lower part).
- **Leniency:** the `LENIENCY` constant in `src/quiz.js`.

## Taiwan and mainland pronunciation

- **A word's `pinyin` is its mainland reading; `pinyinTaiwan`, if present, its Taiwan reading** (the optional fifth column of a word list). The `pronunciation` setting (`mainland` by default, or `taiwan`) decides which is shown as the answer and expected on tone cards; the other is shown next to it, labeled. A word with no Taiwan reading is the same under both settings. `readingsFor` in `src/tones.js` is the one place that decides this.
- **Shown readings are never guessed.** The owner chose this. A Taiwan reading comes only from the word's own fifth column or from a whole-word "Taiwan pr." note in CC-CEDICT (`taiwanWords` in the tone table). The built-in list's 13 Taiwan readings were checked against Taiwan's MOE dictionary (moedict.tw). Readings recalled from memory turned out wrong for several words, so always check.
- **Accepted tones are wider than shown readings** (`toneAnswers` in `src/tones.js`). Besides the listed tones, a tone card accepts, as a *variant*: the other region's tone for the word; a tone CC-CEDICT links to the listed one as a mainland and Taiwan reading of the character; and the character's own full tone where the list says neutral. The last two are approximations that accept some things neither standard says (yìnggāi for 應該, háizǐ for 孩子), so an answer accepted only as a variant is pointed out on the card together with the listed reading.
- **Not accepted:** neutral where the list has a full tone (xīngqi for 星期), unless listed as an extra reading. Adding a reading to a word's `pinyin` would change the word's ID (`<traditional>|<pinyin>`), so that needs a different mechanism first.
- **The tone table** `data/cedict/tones.json` is built from CC-CEDICT by `scripts/build-tone-table.js`, run by hand; it is the only script that uses the internet. The table is CC BY-SA 4.0, not GPL. The app loads it with a dynamic `import()` so it is a separate file; if it fails to load, tones are judged against the word list alone.
- **Changing the built-in word list:** raise `BUILT_IN_LIST_VERSION` in `src/main.js`, or devices that already have the words keep their old copies. Never change the `pinyin` or `traditional` of an existing entry: that changes its ID and orphans its cards.

## Following where a character is written

- **The problem:** with raw input the reference is invisible, so the owner writes wherever and at whatever size feels natural, but Hanzi Writer grades against one fixed, centered position. A character begun off-center had its later strokes expected in the wrong place.
- **The fix** (`src/frame.js`, and the section of the same name in `src/quiz.js`): after each accepted stroke, a least-squares fit over all accepted strokes gives a *frame* (shift and size). If it has changed enough, Hanzi Writer is handed the stroke data moved into that frame and the quiz resumes, the same way the second stroke order is handled.
- **The data Hanzi Writer holds is always: base data, in the current stroke order, in the current frame** (`currentData` in `src/quiz.js`). Anything that compares drawn strokes with textbook ones must use the framed data (`framedData`, `charData`), never `baseData`, or it will judge against the centered position.
- **Because the data itself is moved**, hints appear where the character is being written, and the printed character at the end lines up with the handwriting.
- **Rules:** shift from the first stroke; size only once the strokes written span about 20% of the box; size limited to 0.4–1.5 and shift to about 30% of the box; no following while the outline is shown or when raw input is off; Restart, Animate and a new character go back to the centered data.
- **The first stroke may land anywhere, at any size that can be followed.** If Hanzi Writer rejects the very first stroke only for where it is or how small, `isFirstStrokeAnywhere` in `src/quiz.js` accepts it by shape, and the frame follows. The owner writes at about half the size of the box, often in a corner, so `fitsStroke` lets a first stroke be as short as 0.35 times the textbook's (0.5 for later strokes).
- **Which order a first stroke belongs to is decided by shape, not position** (`otherOrderFor`, when nothing is written yet). Written small in a corner, the mainland order's first stroke can lie nearer the MOE order's (長, 馬). Where both orders start with the same shape (學), the re-reading described under "Two accepted stroke orders" sorts it out a stroke later.
- **The size is not known after one short stroke** (`MIN_SPAN_FOR_SCALE`), so until the strokes span enough, the next ones are expected at full size around the first. At half size this still rejects the second or third stroke of some characters (see the known failures under "Browser tests").
- **Limits:** only shift and size, not slant or stretch. A wrong stroke accepted early skews the frame for the strokes after it.

## Two accepted stroke orders

- **MOE order is the standard the app teaches.** The Taiwan set's strokes are in the order of Taiwan's Ministry of Education, which differs from the mainland order for 83 of its characters (學 starts with 爻; 我, 忙, 馬, 國, 錢 and others differ too). The owner is used to the mainland order for some of these, so **both are accepted** in Traditional mode, with no penalty.
- **Finding the second order:** `scripts/strokeOrder.js` compares each Taiwan-set character with the big set when the data is prepared. If both have the same strokes (matched strictly, both ways) in a different sequence, the mainland sequence is stored in the character's file as `altOrder`. When in doubt nothing is stored and only the MOE order applies.
- **Following it during a quiz** (`src/quiz.js`, section "Two accepted stroke orders"): Hanzi Writer holds one order and grades strictly in sequence. When it rejects a stroke that fits what the other order expects next (`src/strokeMatch.js`), the stroke is accepted, Hanzi Writer is handed the same strokes rearranged via `setCharacter()`, and the quiz resumes with `quizStartStrokeNum`. Raw input make the swap invisible.
- **Which order is meant can be unclear at first, so the strokes written are re-read when needed.** 學 starts with a ノ in either order (in the middle for MOE, at the left for mainland), and with an invisible reference and a movable frame the first stroke fits both. The owner's screencast showed the result: the mainland first stroke was taken as MOE's, and the next stroke was then rejected forever. Two checks in `src/quiz.js` handle it, both built on `otherReadingOf`, which re-reads the strokes written since the two orders last agreed (`lastSyncPoint`) as the other order's:
  - `otherOrderFor`, on a rejected stroke: switch if that stroke and the earlier ones all fit the other order, in the frame that reading implies.
  - `otherOrderBeats`, on an accepted stroke: switch if the other reading fits clearly better (the 丨 of the left part can pass for a stroke of 爻 when written over it).
  Neither applies at the last stroke of a character.
- **No mixing inside a differing stretch:** changing order is only offered where the strokes written so far are a complete beginning of both orders (`remainingInOtherOrder`). A character with two separate differing stretches (錢) may use a different order in each.
- **Restart and Animate always return to the MOE order.**
- **The note:** when a character was written in the mainland order, a line under the buttons says so and links "MOE order" to Wikipedia's Stroke order article. A link the user taps is fine under the offline rule.
- Reviews store `orderPerChar`: `'moe'`, `'mainland'`, or `null` for characters with only one order.
- **Limits:** characters whose shapes differ between the sets (為) accept only the MOE order. Traditional characters outside the Taiwan set come from the big set and so follow the mainland order, with no MOE alternative.

## Things that are easy to get wrong

- **On a tone card a tap is an answer** (a dot means the neutral tone), so `toneFlow` ignores touches for the first 300 ms after a character comes up. A stroke the recognizer can't classify is not an answer and not a mistake; the card says so and waits.
- The tone mark is drawn on a layer inside the card face, which `replaceChildren` removes; `ask()` in `src/toneFlow.js` puts it back each time.

- **The study area is shared by all card kinds.** `showPartsFor` in `src/review.js` decides which parts are visible for each kind, and Free practice needs the writing parts back (`deactivate`). A new element in the study area must be added there.
- **The writing area is an SVG element, which has no `.hidden` property.** Hide its row (`#writing-row`) instead, or use `toggleAttribute('hidden', ...)`.
- **A flow that is not on screen must ignore taps.** `toneFlow` and `recallCard` both listen on the card face; each checks that it has a current card first, and `review.js` calls `stop()` on both before showing the next card.

- **Hanzi Writer remembers quiz options from one quiz to the next.** `quizStartStrokeNum` must be passed on every `quiz()` call (0 for a normal start), or a later quiz silently starts partway through.
- **Don't replace Hanzi Writer's character from inside one of its own callbacks.** `switchOrder` in `src/quiz.js` waits a tick first.
- **`charData` in `src/quiz.js` is what Hanzi Writer holds, which may be rearranged; `baseData` is the data as loaded.** Stroke numbers reported by Hanzi Writer refer to `charData`; `altOrder` and `sequence` refer to `baseData`.

- **Only 1,013 traditional characters have Taiwan-standard stroke data.** The big set (`hanzi-writer-data`, from Make Me a Hanzi) draws traditional characters in mainland-style forms: 為 as 爲 (12 strokes), 說 as 説, 辶 and 艹 with 3 strokes. The animCJK overlay fixes the characters it covers; the rest (for example 吃, 真, 骨) still come from the big set and may differ from the Taiwan standard. Taiwan's MOE data would be complete but is CC BY-NC-ND, so it cannot be converted and redistributed.
- **The script decides the form even for characters both scripts share** (花, 起, 道). Always pass the script to `loadCharData`; never cache stroke data by character alone.
- **Stroke numbers can differ between the two sets** for the same character (花 has 8 strokes in one and 7 in the other). Never hard-code a stroke number for a character; derive what you need from the data in use, as `src/shortcuts.js` does.
- The slot row sets `lang` (`zh-Hant-TW` or `zh-Hans-CN`) so the device picks the right regional font. Without it a phone may show Japanese or mainland glyphs for the same character.
- `crypto.randomUUID()` only exists on HTTPS or localhost, so it fails on the LAN dev address. `randomId()` in `src/db.js` uses `crypto.getRandomValues()`, which works everywhere.
- The four grade buttons must fit side by side at phone width, and the whole review screen should fit without scrolling. The writing area's size is worked out in `chooseSize` (`src/wordFlow.js`) by reserving a fixed height for everything else; adjust that number when adding rows to the screen.
- In Review, the outline is switched off at the start of every word. Left on, it would count as peeking and make every suggestion "Again".

- Vite's dev server answers a request for a missing file with the app's HTML page and status 200, not a 404. `loadCharData` therefore treats "not valid JSON" as "no stroke data".
- Never create a new Hanzi Writer per character: each instance adds touch listeners to the writing area and never removes them. Use `setCharacter()`. The one exception is rebuilding the writing area after a screen rotation, which is rare.
- `setCharacter()` rebuilds Hanzi Writer's layers and resets the outline to hidden, so `start()` in `src/quiz.js` re-appends the layer of drawn strokes and re-applies the outline setting each time.
- The window `resize` handler only reacts to width changes. On Android the on-screen keyboard changes the height, and that must not wipe a character in progress.
- The stroke data is under the Arphic Public License; the copy script ships `ARPHICPL.TXT` alongside it.

- Service workers and "Add to Home Screen" only work over HTTPS or on `localhost`. The LAN dev address (`http://192.168.x.x:5173`) is plain HTTP, so offline/install features cannot be tested there from the phone. The plan is to deploy the built site to GitHub Pages for that (the repo is public for this reason).
- The writing area needs `touch-action: none`, otherwise drawing scrolls the page on a phone.
- Hanzi Writer adds its SVG layers only after the character data has loaded, and later SVG elements are drawn on top. The layer of drawn strokes is therefore re-appended at the start of each quiz so it stays above them.
- Hanzi Writer colors the strokes of a character's radical separately (`radicalColor`, falling back to `strokeColor` only at creation). Changing `strokeColor` later leaves the radical's strokes in the old color, so always change both (see `setPrintedColor` in `src/quiz.js`).
- Hanzi Writer works out touch positions from the SVG's on-screen size, so the `width`/`height` passed to it must match the element's real size. Don't scale the SVG with CSS.

## Skritter import (future)

The owner wants to bring their Skritter data across eventually rather than start from scratch. Don't build it early, but keep it in mind whenever the data model is designed: it should hold words as well as single characters, both scripts, and per-item review history and scheduling state. Look at a real Skritter export before finalising the IndexedDB schema. Personal exports go in `exports/`, which is git-ignored.

## Roadmap

1. **Done:** one hardcoded character, stroke-by-stroke quiz with grading, reachable from a phone over the LAN.
2. **Done:** raw input, lenient grading, optional 2-stroke 子.
3. **Done:** practice any typed character or multi-character word; stroke data loaded on demand.
4. **Done:** FSRS scheduling of writing cards on a built-in word list, IndexedDB storage, backup export/import.
5. **Done:** Taiwan-standard stroke data for the 1,013 traditional characters animCJK covers, with the mainland stroke order also accepted where the strokes are the same. Still open: the traditional characters it does not cover.
6. **Done:** the other card types (meaning, pinyin, tone with buttons or a drawn mark), scheduling across types, the settings panel, the pronunciation setting and Taiwan/mainland tone variants. Later: zhuyin as an alternative to pinyin.
7. **Done:** two consecutive strokes joined, for every character. Still open: longer runs, and shortcuts that reorder or drop strokes.
8. PWA: manifest, service worker, GitHub Pages deploy, installable and offline on the phone.
9. Import the Skritter word list (TSV) and, if the GDPR request (sent 2026-10-12) yields it, its scheduling data. The owner does not want the word list imported without scheduling data.
10. Merge backups between devices instead of replacing; a settings screen (new words per day, target retention).
11. **To do, asked for by the owner:**
    - **Done for writing:** a browser test suite that lives in the repo and runs in parallel (see "Browser tests"). Still open: its known failures, and browser tests for the cards and settings, which are still only checked by hand.
    - The browser grid's remaining failures (listed under "Browser tests"): at half size the second or third stroke of some characters is rejected, because the size is not yet known after one short stroke; and 學 in the mainland order shifted right. The owner chose on 2026-10-12 to leave these for later. Fixing the first means estimating the size earlier than `MIN_SPAN_FOR_SCALE` allows.
    - Tapping "Free practice" before the app has finished starting throws an error in `setMode` (`src/main.js`), because `review` is not created yet. The app recovers once start-up finishes.
    - A setting for which traditional forms to use: mainland, Hong Kong or Taiwan, so that people can choose. Today Traditional always means Taiwan forms where animCJK has them. Needs stroke data for the other two regions' forms; the big set's traditional characters are mainland-style, and no Hong Kong set has been looked for yet.
    - Accepting a neutral tone where the list has a full one (xīngqi for 星期).

