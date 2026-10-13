# Hanzi Trainer

A local-first Chinese character writing trainer: a PWA built as an alternative to Skritter. For the owner first, on their own devices, and for any learner who wants it (see "Long-term goals").

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
- `npm run test:browser`: run the tests in `tests/browser/`, which write characters in the real app in several headless Chromium browsers at once. About half a minute. See "Browser tests" below.

## Layout

- `index.html`: the single page.
- `src/main.js`: entry point; the four tabs (Review, Learn, Free practice, Decks), backup buttons.
- `src/wordsPanel.js`: the Decks tab (called the Words tab until 2026-10-13): its two sections, the words of the deck whose page is open (add a word, add a list, search), the ready-made decks, and a pop-up panel per word to change it, study it next or remove it.
- `src/words.js`: the plain calculation behind the Decks tab: checking a typed word, reading a TSV or CSV list, working out which words are new, searching.
- `src/dictionary.js`: looks a word up in the dictionary and proposes a meaning. Plain calculation.
- `scripts/build-dictionary.js`, `data/cedict/dictionary.tsv`: the dictionary made from CC-CEDICT (run by hand, uses the internet, like the tone table script). About 124,000 entries, 8.4 MB.
- `src/review.js`: Review and Learn. Picks the next card or the next word to learn, hands it to the code for its kind, runs the lesson, shows the grade buttons, saves the result.
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
- `src/decks.js`: the plain calculation behind decks: the tree, which words are in a deck, a deck's daily goal, the decks of the ready-made lists.
- `src/decksPanel.js`: the decks in the Decks tab: the front page and a deck's page (the line saying where you are, the decks inside, adding one) and Deck settings (rename, move, daily goal, delete). Set up by `src/wordsPanel.js`. Also `fillDeckSelect`, which every list of decks to choose from is filled with.
- `src/offline.js`, `src/serviceWorker.js`, `scripts/build-offline.js`, `public/manifest.webmanifest`, `.github/workflows/deploy.yml`: offline use and deployment (see that section).
- `src/welcome.js`, `src/storageAdvice.js`: the introduction shown on first use, and what it says about long-term storage in each browser (see that section).
- `src/scriptCards.js`: files writing cards under the script they were learned in (see "Switching script").
- `src/backup.js`: build, check and restore a backup file.
- `src/wordPage.js`: the page of a word or character (see "The word page"); `src/notes.js` and `src/characters.js` are the plain calculation behind it (learning notes and example sentences; the parts of characters).
- `data/notes/`: learning notes and example sentences per level, CC BY-SA 4.0. `local/`: development-only downloads, git-ignored.
- `src/sentences.js`: sentences as things to study (see "Sentences"). Plain calculation.
- `src/speechPlan.js`, `src/speech.js`: speaking a word (see "Hearing a word"): which recordings to play, as plain calculation, and playing them.
- `scripts/copy-audio.js`, `data/audio-cmn/`: the recordings, and the script that puts them in the git-ignored `public/audio/` under plain file names with an `index.json` listing them.
- `data/makemeahanzi/`: how each character is built (parts, radical, meaning part and sound part), LGPL-3.0. Not used by the app yet; it is for the word page.
- `src/cardManager.js`, `src/cardsPanel.js`: managing cards by hand (see "Managing cards"): the plain calculation, and its page side in the Decks tab.
- `src/leeches.js`: which cards are leeches, suspended cards, and the two leech exports (see "Leeches and suspended cards"). Plain calculation.
- `src/merge.js`: combines what is on the device with a backup from another device (see "Combining backups"). Plain calculation.
- `src/wordList.js`: parses the four-column TSV word list format (same as Skritter's export) and converts numbered pinyin to tone marks.
- `tests/words.tsv`: 109 common words, hand-written, for the tests only. The app itself starts with no words (the owner's decision, 2026-10-13: this list had been loaded into every new database, and they did not want test words in their app). Browser tests that need words add it through the Decks tab (`addTestWords` in the harness).
- `src/charData.js`: the only place stroke data is loaded from. `loadCharData(char, script)` returns `null` when a character has no data. For `'traditional'` it uses the Taiwan set where that has the character and the big set otherwise; for `'simplified'` only the big set.
- `src/shortcuts.js`: recognizes handwriting shortcuts (two textbook strokes written as one). Plain calculation, no page or Hanzi Writer.
- `src/strokeMatch.js`: judges whether a drawn stroke fits a given textbook stroke, and keeps track of two stroke orders. Plain calculation.
- `src/frame.js`: works out where and how big a character is being written and moves stroke data there. Plain calculation.
- `src/lines.js`: shared helpers for lines of points (length, resampling, shape, distance).
- `src/style.css`: styles, phone-first.
- `scripts/copy-char-data.js`: fills the two git-ignored stroke data folders, naming files by Unicode number (`學.json` becomes `5b78.json`): `public/char-data/` from `node_modules/hanzi-writer-data/` (about 9,500 characters) and `public/char-data-tw/` from `data/animcjk/graphicsZhHant.txt` (1,013 characters, plus an `index.json` listing them and recording `TAIWAN_SET_VERSION`; raise that number whenever the script changes what it writes, or existing copies will not be regenerated).
- `scripts/strokeOrder.js`: finds a character's second stroke order by comparing the two data sets. Used by the copy script.
- `scripts/build-tone-table.js`, `data/cedict/`: the tone table extracted from CC-CEDICT (run by hand; see above).
- `scripts/build-word-lists.js`, `data/wordlists/`: the ready-made word lists (run by hand, uses the internet; see "Ready-made word lists").
- `data/animcjk/`: the animCJK traditional stroke data, copied unchanged from that project at a pinned commit. Its README records the source, license and how to update. This is vendored data, not an npm dependency.
- `tests/logic.test.js`, `tests/shortcuts.test.js`, `tests/strokeOrder.test.js`, `tests/toneMark.test.js`, `tests/frame.test.js`, `tests/storageAdvice.test.js`: tests for the plain-calculation code.
- `tests/browser/harness.js`: what the browser tests share: serving the app, starting the browsers, drawing strokes, reading the status line.
- `tests/browser/writing-grid.browser.js`: writes 15 characters in both stroke orders at seven positions and sizes.
- `tests/browser/words.browser.js`: the Decks tab from adding a word to finding it in Review.
- `tests/browser/settings.browser.js`: the Script and Pronunciation settings, on cards and on the Decks tab.
- `tests/browser/lesson.browser.js`, `tests/browser/welcome.browser.js`, `tests/browser/offline.browser.js`: the Learn tab and its lesson, the introduction, and offline use.
- `tests/browser/database.browser.js`: a database from before brought up to date, and what is kept for merging (removal marks, `changedAt`, `formerIds`).
- `tests/decks.test.js`: tests for `src/decks.js`.
- `tests/browser/decks.browser.js`: decks from making one to deleting it, and studying one in Learn.
- `tests/cardManager.test.js`, `tests/browser/cards.browser.js`: managing cards, as a calculation and in the app.
- `tests/leeches.test.js`, `tests/browser/leeches.browser.js`: leeches and suspending, as a calculation and in the app.
- `tests/merge.test.js`, `tests/browser/merge.browser.js`: combining backups, as a calculation and in the app.
- `tests/words.test.js`, `tests/dictionary.test.js`: tests for `src/words.js` and `src/dictionary.js`; the second also checks every line of the real dictionary.

## Browser tests

- **No dependency was added.** The tests start the Chromium installed on the computer (`chromium-browser`, `chromium` or `google-chrome` on the PATH, or `CHROME_PATH`) without a window, and drive it over the DevTools protocol with Node's built-in WebSocket. They start their own Vite dev server on port 5273, so `npm run dev` need not be running.
- **Parallel by sharing a pool of browsers.** `startBrowsers` starts several (half the processor's cores; `BROWSERS=3` to choose), each with its own temporary profile and so its own IndexedDB. A test asks the pool for a page with `browsers.use(...)` and gets whichever is free. Node's test runner runs as many tests at once as there are browsers (`concurrency` on the `describe`).
- **`npm test` does not run them:** it only picks up files named `*.test.js`. Browser test files are named `*.browser.js`.
- **Run part of the grid** with `CHARS=學母 npm run test:browser`.
- **Each test draws the same strokes every time**, whichever browser it lands on: its random shaking is seeded from the test's name.
- **Knowing when the next stroke can be drawn:** `src/quiz.js` puts a `data-busy` attribute on the writing area while Hanzi Writer is being handed stroke data (`setBusy`). A stroke drawn then would be lost. The tests wait for the status line to change and for `data-busy` to go, instead of pausing a fixed time. Any new place in `quiz.js` that awaits `giveWriter` must be wrapped the same way.
- **A stroke that begins outside the writing area never reaches the app**, so the grid skips a character at a position where that would happen (wide characters in "shifted left").
- **Mouse events arrive about 60 a second in headless Chromium**, which is what a run's time is made of. More browsers help; shorter waits do not.
- **A pop-up the page puts up (`window.confirm`) stops everything** until it is answered, and a test's `window.confirm = () => true` is lost when the page is reloaded. Set it again after `reloadApp`.
- **No known failures since 2026-10-13:** all 165 runs of the grid pass (10 skipped). The command exits with an error if any fail.
- **Not covered yet:** grading in Review, drawn tone marks, the rest of the settings panel. Tone and pinyin cards are only touched by `settings.browser.js`. Use the same harness.
- **A setting is saved before it takes effect** (`change` in `src/settings.js` awaits the database), so after `choose(...)` a test waits for the effect instead of checking at once.
- **Each test file starts its own server and browsers**, and Node runs the files side by side. A file whose steps build on each other (`words.browser.js`) uses one browser and `concurrency: false`.

## The word list

- **Words are added in the Decks tab**, one at a time or as a list pasted or chosen as a file. A device starts with none.
- **Dictionary lookup when adding one word:** as the characters are typed (either script), the entries CC-CEDICT has for them are listed under the box, one per reading, names last. Tapping one fills in every field, with a proposed meaning (`proposeMeaning`). How much of the entry that is depends on the "Dictionary meanings" setting (`meaningDetail`): `first` (the first meaning), `everyday` (the default: every meaning except those whose label names a specialist field, such as "(math.)"; the fields are listed in `SPECIALIST_FIELDS`) or `all`. The owner chose this on 2026-10-13, because CC-CEDICT separates near-synonyms with slashes as often as with semicolons, so cutting at the first slash lost shades of meaning. A word with only specialist meanings keeps them. Only a label at the start of a meaning counts. Nothing is filled in without a tap, and everything stays editable: writing prompts show only the meaning, so the owner words it.
- **The dictionary is a separate 8.4 MB file, fetched only when a word is about to be typed** (`loadDictionary` in `src/wordsPanel.js`, through a `?url` import so Vite keeps it out of the program). Its lines are indexed by word and only taken apart on lookup. If it can't be fetched, the fields are filled in by hand as before. The app saves it for offline use (see "Offline use and deployment").
- **A word typed that is already in the list under any reading is pointed out** ("Already in your words"), and the list check counts new words that share their characters with an existing one (`wordsWithSameCharacters`). Dictionaries disagree on neutral tones, so the same word can arrive as two readings (péngyou, péngyǒu); since the ID includes the pinyin, nothing else would catch that.
- **A word is its traditional characters plus its pinyin** (the ID). Both can be edited in the word's pop-up panel (the pinyin since 2026-10-13), which moves the word's cards and reviews to the new ID (`renameWord`; see "Switching script"); so can the meaning, simplified form and Taiwan reading.
- **"Edit word" on Review's answer page** (asked for by the owner on 2026-10-13) opens the same pop-up panel, through `edit(word)` in `src/wordsPanel.js`, whenever the grade buttons are showing. If only the meaning was changed, the answer stays up with the new meaning and is still to be graded (`update(word)` in `src/recallCard.js` and `src/toneFlow.js`). Any other change alters what the card asks or which answers are right, so the card is shown again unanswered; if the word was removed, the next card comes. Not offered in Free practice, nor before the answer is shown.
- **The pop-up panel closes only after the rest of the app has read the changed word** (`afterChange` awaits `onChange`). A `<dialog>`'s "close" event arrives a moment after it closes, which is what `edit()` waits for. The same characters with another reading are a different word.
- **Pinyin is stored tidied** (`tidyPinyin` in `src/words.js`): tone numbers required, no spaces or hyphens, `v` for ü, an apostrophe before a later syllable starting with a, e or o and nowhere else, several readings joined by a comma and a space. The dictionary is built with the same function, so its entries get the same IDs as typed or imported words. Tone marks are not accepted as input.
- **Lists are read as TSV or CSV**, line by line; a line with a tab is TSV. Skritter's CSV export does not put quotes around fields with commas, so `columnsFromCsv` works out which fields are pinyin and which are the meaning. Both of the owner's exports read to the same 2,298 words; the 40 lines left out are zhuyin symbols and patterns like "yue4 ... yue4".
- **New words go to the end of the queue** (`order` one above the highest). "Study next" gives a word an `order` below every other, so `order` can be negative.
- **Removing a word deletes its cards but never its reviews** (`removeWord` in `src/db.js`).
- **After the Decks tab changes anything**, Review and Free practice read the words afresh (`createWordsPanel`'s callback in `src/main.js`).
- **The word list on screen shows at most 200 rows** and relies on the search box beyond that.
- **Content from Skritter stays on the owner's devices.** The meanings in a Skritter export may be Skritter's own text. Never commit an export, a list derived from one, or test data copied from one. `exports/` is git-ignored; when checking an import against the real files, print counts, not words.

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
- **Settings** (`settings` store): `script`, `pronunciation`, `rawInput`, `newWordsPerDay`, `enabledTypes`, `leechLapses`, `leechAction`, `sound`, `sentenceReading`, `sentenceWriting`. A type switched off never appears but keeps its cards and history. At least one type stays on.
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
- **No sync.** IndexedDB belongs to one browser on one device at one address, so the phone and tablet have separate progress, and moving to GitHub Pages starts empty. Export/Import backup moves the whole database as one JSON file; importing either combines it with what is on the device or replaces everything (see "Combining backups"). The backup has a `version` number: raise it and keep reading old versions if the shape changes.
- **Changing the store layout** means raising `DATABASE_VERSION` in `src/db.js` and handling existing databases in `onupgradeneeded` (by `oldVersion`, so nothing stored is lost), and usually raising the backup version too. Both are at 2.

## Decks

Built on 2026-10-13, first as a section of a Words tab, then the same day, at the owner's request, as the tab itself. The answers marked "owner" were given to questions put to them. (This file said "Words tab" throughout until then; `src/wordsPanel.js`, `words-panel` and the mode name `'words'` in `src/main.js` still carry the old name.)

- **The Decks tab replaces the Words tab** (owner), and has two sections, chosen with the buttons at its top: "My decks" and "Ready-made decks" (owner: two sections of one tab, not a tab of its own). The ready-made section has the HSK and TOCFL lists; what is added from it appears under My decks, a deck per list with a deck per level inside.
- **Every word is in at least one deck** (owner). The app starts with one deck, "Chinese 中文" (`DEFAULT_DECK` in `src/decks.js`, fixed ID `chinese`, so every device has the same one; it can be renamed). `homeForEveryWord` puts words that are in no deck that exists into it, at every start (`fileListWordsInDecks` in `src/main.js`), and makes it if there is no deck at all. Code may therefore rely on `word.decks` being there for words read after start-up.
- **My decks has a front page and a page per deck** (owner: tapping a deck brings up a page with it and the decks inside it, where words are added and removed). `openDeckId` in `src/wordsPanel.js` says which is open; it is kept while the app is open, and the first time, with only one deck, that deck's page is opened, since that is where the first words go.
  - **"My decks" tapped on a deck's page** goes to the front page.
  - **The front page:** the decks inside no other, a form to add one, and all words with the search box. No forms for adding words.
  - **"Add a word" is folded away on a deck's page** (owner, 2026-10-13), like "Add a list", so the deck's words are near the top; it is open on a deck without words (`foldAddWord` in `src/wordsPanel.js`, decided when the page is opened, not while words are being added).
  - **A deck's page:** a "‹ Back" button that goes up one level (the owner asked for it on 2026-10-13: the line beside it was not obvious enough as the way out), a line saying where you are ("Decks › Textbook › Chapter 2", each part a button; `renderPath`), the deck's counts, "Review this deck", "Learn this deck" and "Deck settings", the decks right inside it and a form to add one there, Add a word and Add a list, and its words. Words of the decks inside it are listed too, marked "in Chapter 1".
- **Each deck shows how far it is learned** (asked for by the owner on 2026-10-13): "512 words · 37 learned (7%)" with a thin bar under it, on its row and on its page (`countsOf` and `fillBar` in `src/decksPanel.js`). "Learned" is `isLearned`, so 100% means every word has been through the Learn tab, not that every word is known. The percentage is rounded down, and a deck without words has none.
- **Words are added into the deck whose page is open.** A word that is there already is put in this deck as well ("was already in your words"), and keeps its meaning as it was; so are the words of a list that were there already, and a list with nothing new can still be "put in this deck".
- **A word's pop-up panel has a checkbox per deck** in a fold-out, and at least one has to stay ticked. "Remove" there removes the word altogether.
- **A word can be in several decks and has one schedule** (owner). A word's `decks` field lists deck IDs; studying a deck only narrows down which words come up. A deck includes the decks inside it (`deckWithInside`), to any depth.
- **Studying a deck:** the chooser at the top of Review and Learn (`deck-select`, the `studyDeck` setting; `studyWords` in `src/review.js`), which is left out while there is only one deck, or the two buttons on a deck's page, which choose the deck and open the tab (`studyDeck` callback in `src/main.js`). "All words" keeps the queue's order (owner). If the deck studied is deleted, all words are studied again.
- **A deck can have its own "New words per day"** (owner: a deck *can* have its own number, otherwise the one in Settings is the default); `dailyGoal`. It is the goal Learn shows while that deck is studied, counting the words of that deck learned today, and the limit Review uses for cards to be written again. A deck inside another does not take its number from the one it is inside.
- **Deleting a deck asks what becomes of its words** (owner: ask each time), in Deck settings. The decks inside it go too. Words that are in another deck as well just stay there. For those that are in no other, the panel offers "Delete the deck, keep the words", which moves them to the deck it was inside or, for a deck inside no other, to "Chinese 中文" (made again if it was deleted); and "Delete the deck and remove N words". If the deck being deleted is the only place left for them (it is or contains "Chinese 中文" and is inside no other), they can only be removed, or moved by hand first. Deleting the last deck leaves "Chinese 中文", empty. A deleted deck leaves a mark in `removed` with `kind: 'deck'`.
- **A deck cannot be put inside itself or a deck inside it** (`canBeInside`); Deck settings does not offer those.
- **The chooser shares a line with the counts** in Review and Learn, and wraps onto a line of its own when they do not fit (on a phone, with a long deck name). `chooseSize` in `src/wordFlow.js` was not changed for it.
- **Browser tests:** `openDeckPage` in the harness opens the Decks tab on a deck's page, for tests that add words.
- **Not built:** the browser's back button does not step back through deck pages; changing the order of decks (they go by when they were made, "Chinese 中文" first); exporting or sharing a deck; per-deck card kinds; moving many words at once; and deck counts that take the hold between cards of one word into account ("due" there is simply cards past their time).
- **For the merge:** `studyDeck` is a setting that belongs to the device.

## Ready for merging

Built on 2026-10-13 as the first step of the order of work in "Long-term goals". Nothing on screen changed; the database now keeps what combining two devices' data will need.

- **`changedAt` on words, settings and decks**, filled in by `putAll` in `src/db.js` (and `renameWord`), never by the callers. Records from before have none. A change the app makes by itself to bring old records up to date passes `{ stamp: false }`, so that it does not look newer than a change the owner made on another device.
- **A record read from the database has `changedAt`; the one about to be saved does not.** Comparing the two field by field must leave it out (as "Edit word" in `src/review.js` does), and compare lists such as `decks` by content.
- **A removed word leaves a mark** in the `removed` store (`{ id, removedAt }`). The mark stays when a word with that ID is saved again (changed on 2026-10-13, for the merge: until then it was taken away). A word or deck is there if it is in its store; the mark only matters when two devices' data are combined.
- **A corrected word remembers its old IDs** in `formerIds` (`withFormerId` in `src/words.js`). The pop-up panel builds the saved word from the form, so every field that is not in the form has to be carried over there by hand: `decks`, `formerIds`, `learnedAt`.
- **A card's schedule can be rebuilt from its reviews**: `replay` in `src/scheduler.js`. A test checks that it gives exactly the saved state, which relies on ts-fsrs varying intervals the same way for the same review, and on a review's `time` being the time handed to `gradeOptions`.
- **Decks:** a `decks` store (`{ id, name, parentId, order }`) and a `decks` list on each word. The ready-made lists' decks have fixed IDs so every device makes the same ones (`readyMadeDeck`). `READY_MADE_LISTS` in `src/decks.js` repeats the lists' levels; a test checks it against the files. See "Decks" for the rest.
- **A tab still running an older version keeps the database from being upgraded.** The app now closes its connection when a newer version asks (`onversionchange`), and a newer version that is kept waiting says to close the other tab (`onblocked`). The version published before 2026-10-13 does not let go, so the message can appear once on a device with two tabs open.
- **Backup format 2** adds `removed` and `decks`; a version 1 file is still read.

## Combining backups

Built on 2026-10-13 to a plan the owner agreed to. It is number 3 of the order of work in "Long-term goals", and the same calculation a later sync through the learner's own storage would use.

- **Where:** "Import backup" in Settings. Once a file is chosen, a panel (`import-dialog`) says what the backup holds, what the device holds and what combining would bring, in counts, and offers "Combine with this device", "Replace everything on this device" (which asks once more) and Cancel. Combine is switched off when it would change nothing.
- **A backup of the device is downloaded before combining** (owner), named `...-before-combining.json`, since combining cannot be undone. Not before replacing.
- **`mergeBackups(mine, theirs)` in `src/merge.js`** takes two backups and gives the combined contents and a summary; the page writes them with `replaceEverything`, in one transaction, and reloads. The rules are at the top of the file:
  - Reviews: all of both sides.
  - Words, decks, settings: the record saved later (`changedAt`), whole; this device's if neither is later. A word's earliest `learnedAt` is kept whichever record wins.
  - A removal counts unless the record was saved after it. All marks are kept.
  - A word corrected on one device (`formerIds`) takes the place of the record still under the old ID on the other, and that side's cards and reviews are filed under the new ID. If the device that corrected it also has a word under the old ID, that is a word of its own.
  - Settings that belong to the device are never taken from the backup (`DEVICE_SETTINGS`: `welcomeDone`, `keepDataWanted`, `cardsFiledByScript`, `oldBuiltInWordsRemoved`, `builtInListVersion`, `studyDeck`, `audioOffline`, `volume`). A new setting of that kind must be added there.
- **Cards are not combined but worked out from the reviews** (`replay`), with one exception that Claude added to the plan: where one side already has every review of a word's cards of one kind, its cards are kept as stored. So combining never changes a schedule that only one device contributed to, and a device's cards that do not come out of `replay` exactly as stored (anything from before 2026-10-13 that was moved by `fileCardsByScript`) are left alone.
- **Which card a review belongs to** goes by its word, kind and `script`, not its `cardId` (reviews from before 2026-10-13 can carry a plain ID of a card since moved).
- **A word removed and added again starts from scratch:** reviews made before the removal mark do not count toward its cards, on either device's side.
- **Limits, accepted with the owner:** if one device changes a word's meaning and the other puts it in a deck, the later save wins whole and the other change is lost; "later" trusts each device's clock; and making two devices equal takes two steps (export A, combine on B, export B, combine or replace on A).
- **Tests:** `tests/merge.test.js` (same result from either device, nothing new the second time, and a case per rule) and `tests/browser/merge.browser.js` (the panel, combining, replacing). The browser test hands the app a file through the hidden file input (`chooseBackup`).
- **Not done:** the owner has not tried it between their real devices, and nobody has looked at the panel on a phone.

## Leeches and suspended cards

Built on 2026-10-13 to a plan the owner agreed to; number 4 of the order of work in "Long-term goals", first half. The second half, the rest of the card manager, is in "Where the work stands".

- **A leech is a card forgotten often**: graded Again at least `leechLapses` times after it had been learned (setting, default 6, the owner's number; 2 to 30). The count is ts-fsrs's own `lapses` in the card's `fsrsState`, so nothing is stored for it and it comes out the same when cards are rebuilt from reviews. `isLeech`, `lapsesOf` in `src/leeches.js`.
- **What happens to a leech is a setting** (owner, 2026-10-13): `leechAction`, `flag` (the default: only pointed out) or `suspend`. The owner wants, in the long run, as many scheduling options as Anki has; settings of this kind are welcome.
- **Pointed out in two places:** a line under the grades in Review when a leech's answer is showing (`leech-note`), and the "Show" list above the words in the Decks tab (`word-filter`): All words, Leeches, Words with a suspended card. The list follows the deck page that is open and the search box. A leech's row says what is forgotten: "writing · forgotten 7 times · 習 missed 5 of 9 times" (the character from the reviews' `passedPerChar`; the reviews are only read once the leeches are listed).
- **Two exports**, with the leeches listed: "Download list" (a TSV) and "Copy as AI prompt" (the list inside a request for component breakdowns and mnemonics; `leechPrompt`). The prompt goes to the clipboard, or into a file where the browser will not allow that (the LAN dev address). The app sends nothing anywhere.
- **Suspended cards are on the word**: `suspended`, a list of card kinds, because cards are rebuilt from reviews when backups are combined and a mark on a card would be lost. A word's writing cards in both scripts are suspended together. `hasCardType` in `src/review.js` keeps a suspended kind out of Review; the card keeps its history and schedule. Like `decks` and `formerIds`, the field has to be carried over by hand where a word is rebuilt from a form (the pop-up panel does).
- **Switching a card off or back on:** the "Suspended cards" fold-out in the word's pop-up panel, a checkbox per kind.
- **With `suspend`, a card is suspended at the review that makes it a leech** (`becameLeech`: forgotten once more, and now at or over the number). A card switched back on is therefore suspended again the next time it is forgotten. A line above the next card says so (`review-notice`; the owner asked for it), until that card is graded.

## Managing cards

Built on 2026-10-13, the second half of number 4 of the order of work. The owner agreed to the outline and to the two choices marked "owner"; they have not tried it.

- **Inside the Decks tab, not a tab of its own** (owner). Three parts: the "Cards" fold-out in a word's pop-up panel, the "Order" list above the words, and "Select words".
- **The Cards fold-out** lists the word's cards in the script it is studied in (and a writing card that exists only in the other script): when it is next due, how many reviews, how often forgotten, whether suspended; with "Start over" on each studied card and "I know this word already" under them (`cardsOfWord` in `src/cardManager.js`, `showCardsOf` in `src/cardsPanel.js`). Both act at once, without Save, and the panel goes on with the changed word (`onWordChanged`).
- **Start over** makes a card new again: the card is removed and the word notes the time in `startedOverAt`, by kind of card (`withStartedOver`; `startCardsOver` in `src/db.js` does both together). Reviews are never deleted, so this time is what keeps the old ones from counting: `mergeCards` leaves out reviews of that kind made before it (`countedFrom`), and combining keeps the later time of the two sides whichever word record wins. A word's writing cards in both scripts are started over together. `startedOverAt` is one more field the pop-up panel has to carry over by hand when it saves.
- **"I know this word" is an ordinary review graded Easy** on each card of the word that is still new, of the kinds switched on (owner: wanted for adding a list one already half knows; `markedKnown`, `saveKnown`). The word counts as learned without its lesson. The reviews carry `markedKnown: true` and otherwise combine and replay like any other. With the default scheduler an Easy first answer brings a card back in about 8 days, so the claim is checked.
- **Setting the next due date by hand was left out** (owner, on Claude's advice): it works against the scheduler, would need a mark of its own to survive combining, and suspending covers "not now".
- **Order:** learning order, next due first (words without a studied card last), most forgotten first.
- **Select words** turns taps on rows into picking them (a blue edge), and shows a bar: Select all listed (every word the list has, not only the 200 rows shown), I know these, Suspend, Switch back on, Start over, Remove, and Add to a deck. Start over and Remove ask first. The selection is kept after an action, less any words removed.
- **Not built:** a row per card instead of per word; taking a word out of a deck for several words at once; undo.

## The word page

Built on 2026-10-13, step 2 of "sentences and audio". The owner asked for it after Skritter's word screen; they have not seen it yet.

- **What it is:** a read-only `<dialog>` (`word-page`, `src/wordPage.js`) with the word in the script or scripts being learned, its reading with a loudspeaker, the decks it is in, its meaning, its learning note and example sentence where there is one, and each of its characters with its parts.
- **Where it opens:** a tap on a word in the Decks tab's list (which used to open the pop-up panel for changing the word; that is now behind the page's Edit button), and "About this word" beside "Edit word" on Review's answer page (`showWord` in `src/wordsPanel.js`).
- **Everything that can be tapped leads on:** a word of the example sentence, a character, a part of a character. Each opens a page of its own, with Back to return (`trail`). A page for something that is not one of the learner's words shows the dictionary's entries for it and says it is not in their words; adding it from there is not built.
- **The example sentence is split into words by the spaces in its pinyin** (`sentenceWords` in `src/notes.js`), which is why the notes' pinyin must have one space between words and none inside them. It is shown in both scripts only when both are being learned.
- **Parts of characters come from data, not from the notes** (`structureOf` in `src/characters.js`, from Make Me a Hanzi): each part is a button, labeled "meaning" or "sound" for a sound-meaning compound. The dictionary's glosses for the other kinds of character are often mnemonics, so the page words them as "One way to see it" and "Seen as a picture", never as history.
- **Notes are found by simplified characters and pinyin** (`noteFor`), whichever list or deck the word is in. All files in `data/notes/` are read (`import.meta.glob`).
- **The two big files** (the notes, and `data/makemeahanzi/dictionary.txt`, 2.5 MB) are fetched when a page is first opened, like the dictionary, and saved for offline use with it (`scripts/build-offline.js` saves `.tsv` and `.txt` files among the build's assets).
- **The page's buttons work before its contents are there** (`start`), which the browser tests rely on: they tap a row and the Edit button in one go. `data-shown` on the dialog says what the filled-in page is about.
- **Not built yet:** adding the example sentence to a deck (needs sentences as items, step 3); adding a word that is not in the learner's words; the word's cards and statistics on the page (they are in the pop-up panel); stroke order of a character; words that contain a character.

## Sentences

Built on 2026-10-13, step 3 of "sentences and audio". The owner agreed the outline (a sentence stored as a word record; all three kinds of card possible); the details below are Claude's and theirs to change. They have not tried it.

- **A sentence is a word record with `kind: 'sentence'`** (`src/sentences.js`), so decks, scheduling, leeches, suspending, the card manager and combining backups need nothing new. Its ID is `<traditional>|sentence`. Its `pinyin` is for reading only: tone marks, spaces between words, punctuation, or empty. Code that takes a word's pinyin apart (`splitSyllables`) finds no syllables in it, which is what keeps tone cards and recordings away from it; `formatPinyin` leaves it as it is. **Anything new that reads `word.pinyin` has to cope with that.**
- **Two cards, three things asked** (`sentenceCardTypes`, `sentenceWriting`):
  - the `meaning` card is "reading": the sentence is shown, its meaning recalled (`sentenceReading` setting, on by default);
  - the `writing` card asks for the sentence's `cloze` word, written into a gap shown under the meaning ("我們是＿＿。"), or for the whole sentence (`sentenceWriting` setting: `word`, the default, `sentence` or `off`). A sentence without a cloze word is written whole. The two share one schedule: the owner wanted all three possible, and this was the way that needed no new kind of card.
  - Review labels them "Sentence · reading" and "Sentence · writing".
- **Sentences have their own settings, apart from "Card types"**, which is why `planSession` is now given every kind of card and `hasCardType` in `src/review.js` decides which are switched on, for words and for sentences.
- **A sentence is not taught**: it has `learnedAt` from the moment it is added, never waits in the Learn tab, gets no lesson before its first writing card, and does not count in "Learned today".
- **Where they come from:** "Add this sentence to the deck" under the example sentence on a word's page (the page's word becomes the cloze word; the sentence is stored in both scripts, as the notes have it), and "Add a sentence" on a deck's page (the sentence in the script studied, in the other one too while both are learned, optional pinyin, the meaning, an optional word to fill in). Adding one that is there puts it in the deck as well.
- **Writing a sentence leaves out what is not a character**: the writing flow already skips anything without stroke data, punctuation included.
- **The pop-up panel for a sentence** has its characters, pinyin (kept as typed), meaning, word to fill in (`edit-cloze`, only shown for a sentence), decks, cards and suspended cards; not the Taiwan reading, the readings for tone cards or "Cards in". It is saved by a branch of its own in the panel's submit handler. Changing the characters changes the ID, and the cards and reviews move with it (`renameWord`, `formerIds`), as for a corrected word; the owner asked why this was left out at first (it had been a shortcut).
- **Its sound is the device's own voice**, the only thing that can read a sentence; a device without a Chinese voice has none.
- **Not built:** sentences in a pasted list; ready-made sentences; choosing the cloze word by tapping it; a filter for sentences in the word list; more than one cloze word per sentence; listening cards (step 4).

## Hearing a word

Built on 2026-10-13, step 1 of "sentences and audio" (number 5 of the order of work). The owner chose the sources; nobody has listened to the result yet, Claude cannot.

- **Three ways to speak a word, tried in order** (`planSpeech` in `src/speechPlan.js`):
  1. A recording of the word itself: about 8,500 words and characters of the HSK list of 2000 (`data/audio-cmn/words`). They are named by characters, so a recording speaks the usual reading. It is only used when the reading asked for is the word's listed `pinyin`, and that is a single reading.
  2. Recordings of its syllables played back to back (the owner's idea): 1,679 syllables with tone (`data/audio-cmn/syllables`). This speaks exactly the reading asked for, so a Taiwan reading shown on a card is what is heard. `spokenSyllables` applies the tone changes dictionaries do not write: third tone before third, 不 before a fourth tone, 一 except where it is a number read out. The silence at either end of each recording is cut (`soundSpan` in `src/speech.js`).
  3. The device's own Chinese voice (`speechSynthesis`), where it has one that works without a connection. It reads the characters and cannot be told the reading. This is what is left for a word with a neutral-tone syllable and no recording: only 19 neutral syllables are recorded.
- **Coverage**, measured that day: 80 to 95% of each level up to HSK 3.0 level 5, HSK 2.0 level 6 and TOCFL level 4 has a recording of its own, and nearly all the rest can be put together from syllables.
- **The recordings are CC BY-SA** (`hugolpz/audio-cmn`, its 64k version, about 125 MB in the repository; the owner listened to the three versions on 2026-10-13 and found the smaller two audibly compressed), kept as separate files with their README.
- **Where it is heard:** a loudspeaker button beside the kind of card at the top of Review and Learn (`listen-button`; the owner did not want a button that says "Listen", nor one that comes and goes during a lesson). `offerListen` in `src/review.js` shows it whenever hearing the word gives nothing away: all through a new word's lesson; from the start on a meaning card and on a writing card (whose pinyin can be shown at any time without it counting); on a pinyin or tone card once the answer is given. **Still wanted by the owner: to hear a word by tapping on it**, which is to come with the word page. The `sound` setting: `auto` (the default, the owner's choice: spoken by itself when a card's answer shows and at a new word's first look, and with the loudspeaker), `tap` (the loudspeaker only) or `off` (no loudspeaker). Each word has one recording, so it sounds the same every time; the words are one speaker and the syllables another. The button's `data-spoken` says how the last word was spoken (`word`, `syllables`, `voice` or `null`), for the browser tests, which cannot hear.
- **Volume** (asked for by the owner, for reviewing with music on): a slider in Settings, the `volume` setting from 0 to 1, which belongs to the device. Letting go of the slider speaks 中文 as a sample (你好 has no recording of its own). Recordings go through a gain node with the value squared, so that half-way on the slider sounds about half as loud; the device's voice takes the value as it is.
- **Offline, the recordings are an exception to "everything is saved by itself"** (agreed with the owner): a recording is fetched from the app's own address when first played and kept from then on, in a store of its own (`offline-audio`). "Save all recordings for offline use" under Offline use in Settings fetches all of them, in about 26 packs (`audioPacks` in `offline/index.json`; `saveAudio` in `src/offline.js`), and the `audioOffline` setting, which belongs to the device, has later versions fetched at each start.
- **Recordings must not go in the `offline-data` store.** With their ten thousand files in it, `saveOfflineData`'s clearing out of old data (which lists everything in the store) no longer finished within a minute.
- **The service worker's list of app files leaves the recordings out** (`scripts/build-offline.js`), or installing the app would fetch all 125 MB; `audio/index.json` is an app file.
- **A browser keeps sound asleep until the page has been tapped.** `playRecordings` waits 300 ms for that and goes on, so nothing hangs; with `auto` the first card's sound can be lost if nothing was tapped yet.
- **Not built:** Listen in Free practice and in the word's pop-up panel; a speed setting; a choice of voice; sentences (which will use the device's voice).

## How the must-haves are implemented

- **Raw input or snap to print** (the `rawInput` setting, on by default; the owner uses raw input, the other mode is for people who prefer tidy characters). With it off, each correct stroke is replaced by the printed stroke as Hanzi Writer does on its own: the printed strokes are shown in ink while writing, no own strokes are kept, and the character is not followed when written off-center, since the printed strokes are a visible reference. Everything else (shortcuts, both stroke orders, verdicts) is the same in both modes. `colorWhileWriting` and `referenceColor` in `src/quiz.js` hold the difference.
- **Raw input:** Hanzi Writer's printed strokes are kept invisible during a quiz (`strokeColor` fully transparent). Each accepted stroke's `drawnPath` is drawn into our own SVG layer (`g.drawn-strokes`) in `src/quiz.js`. A rejected stroke fades away and counts as a mistake. On completion the printed character appears underneath in a light color for comparison.
- **Shortcuts:** Hanzi Writer always gets the unmodified textbook data, so display, animation and textbook-form grading are untouched. Both forms must be accepted: the shortcut is an option, never a requirement. `src/shortcuts.js` works out from the stroke data which pairs of consecutive strokes may be joined, and checks whether a drawn stroke is such a joined pair. `src/quiz.js` runs that check on every stroke Hanzi Writer reports and, on a match, keeps the stroke and advances past both textbook strokes with `writer.skipQuizStroke()`. Because Hanzi Writer has already counted such a stroke as a mistake, `quiz.js` keeps its own mistake count. Do not implement shortcuts by editing the stroke data handed to Hanzi Writer: that was tried, and it forces the shortcut form on everyone.
  - **Joinable pair** (`isJoinable`): the first stroke ends where the second begins (after at most a short lead-in), both parts are long enough to matter, and the joined shape differs visibly from either stroke alone. There are no per-character lists.
  - **The error that matters is a misfire:** taking a single stroke for the joined pair. If it is the first stroke, the app skips a stroke that was never written; if it is the second, a forgotten first stroke passes unnoticed. A missed joined stroke only costs a mistake. `isShortcutStroke` therefore compares shapes with size taken away (a first stroke drawn too big reaches as far as the joined pair would), requires the joined reading to be clearly closer than either single stroke, and checks where the stroke starts.
  - `tests/shortcuts.test.js` simulates shifted, resized and shaky strokes over the test word list and requires zero misfires of both kinds. Run it after touching any constant in `src/shortcuts.js`.
  - **Out of scope so far:** three or more strokes in one go, and shortcuts that reorder or drop strokes (口 in 2, 艹 in 3, 糸's lower part).
- **Leniency:** the `LENIENCY` constant in `src/quiz.js`.

## Fitting the interface to what is learned

Built on 2026-10-13, at the owner's request, without them at the keyboard; the choices below are Claude's and are theirs to change.

- **Two lists in Settings, three stored settings.** Script: "Traditional only", "Simplified only", "Both, cards in traditional", "Both, cards in simplified" (`script` plus `bothScripts`). Pronunciation: "Mainland only", "Both, mainland first", "Both, Taiwan first" (`pronunciation`: `mainlandOnly`, `mainland`, `taiwan`). **A new device starts with simplified only and mainland pronunciation only** (the owner's choice on 2026-10-13, as what suits most learners: a "Taiwan reading" box would only confuse a beginner); the introduction asks straight away. A device from before keeps what it had: `keepOldDefaults` in `src/main.js` writes down the old defaults (both scripts with cards in traditional; both pronunciations, mainland first) on any device that has settings stored but none for these. The browser tests choose those old defaults when they start (`openFreePractice` in the harness), since they were written for that.
- **`script` is the script cards are shown and written in**, unless the word has its own (below). `bothScripts` only decides what the Decks tab asks for and shows.
- **One script learned:** the Add a word form has one characters box, captioned "Word or phrase 漢字" (or 汉字) instead of with the script's name (the owner asked for that on 2026-10-13), list rows, the pop-up panel's title and messages show that script only (`charactersShown` in `src/words.js`), and the pop-up panel has no Simplified box for a traditional-only learner. Search still matches both scripts.
- **Every word still stores both scripts**, because the ID is `<traditional>|<pinyin>`. For a word typed in one script the other comes from the dictionary (`completeForms` in `src/wordsPanel.js`, `otherScriptForm` in `src/dictionary.js`): the entry that was tapped, else the entry with the same characters and reading (so 头发 fà becomes 頭髮, not 頭發), else the dictionary's form if all its entries agree, else the characters as typed. So a simplified-only learner's word that is not in the dictionary gets its simplified form as its "traditional" one and as its ID. After a switch to traditional such a word still shows its simplified form, until its traditional form is corrected in the pop-up panel (see "Switching script").
- **A list may have one column of characters** (characters, pinyin, meaning), whatever the setting; `readWordList` tells it by its second column being pinyin, and the other script is looked up the same way, in the script of the `script` setting. Checking a list therefore fetches the dictionary first. The hint above the box is worded to suit the settings.
- **Mainland only:** no Taiwan reading box when adding or changing a word, no "Taiwan:" reading on cards (`readingsFor` returns no other reading, even for a word that has one stored), and tone cards do not accept the Taiwan tone, neither the word's own nor the character-level pairs from the tone table (`toneAnswers`' `regional` argument). The neutral-tone variant is still accepted. A dictionary entry's Taiwan reading is not stored when the box is hidden; nothing is lost, since `readingsFor` also reads the tone table, which has the same notes.
- **What is out of sight is kept:** saving a word in the pop-up panel keeps a simplified form or Taiwan reading that is not shown. A list's Taiwan column is stored whatever the setting.
- **A word can have a script of its own** (`cardScript`: `traditional`, `simplified`, or absent for "As in Settings"), for a mixed deck: mostly traditional with a few words in simplified, say. The owner asked for it on 2026-10-13. The "Cards in" list is in the Add a word form and the pop-up panel (choosing a script in the Add a word form leaves only that script's box, and the other form is looked up as for a one-script learner; `scriptAsked` in `src/wordsPanel.js`), and only shown with one of the "Both" settings; with one script learned a stored `cardScript` is kept but ignored. `scriptFor(word, settings)` in `src/words.js` is the one place that decides a word's script; cards, Review, Free practice and the word list all ask it, so never read `settings.script` for a word directly. A list of words cannot set it. A card for a word in another script than the Script setting's says so above the card, in gray: "simp. 简体" or "trad. 繁體" (`scriptFlagFor`, the `script-flag` element at the top of the study area), so the owner does not take a simplified word for the traditional form.
- **There is no "Taiwan only".** A word's `pinyin` is its mainland reading and part of its ID, so it has to be asked for anyway.

## Learning and reviewing: the Learn tab and the lesson

Asked for by the owner on 2026-10-13, after Skritter. The answers marked "owner" were given to questions put to them.

- **A word in the app is either waiting or learned** (`isLearned` in `src/session.js`): learned once it has been through the Learn tab, which sets its `learnedAt`, or once it has any studied card (every word from before 2026-10-13). Adding a word to the app, by hand or from a list, only puts it in line (owner: words typed by hand wait too).
- **Review only ever shows learned words.** `planSession` skips the rest and reports how many are waiting. It no longer introduces new words.
- **The Learn tab** takes the waiting words one at a time, in the order of `order` (`nextToLearn`), and teaches each with the lesson. Finishing the lesson marks the word learned; its other cards then come up in Review as new cards, a few minutes apart, as before. Between two words it says how the day stands and offers "Learn the next word".
- **"New words per day" is a goal, not a limit** (owner). Learn shows "Learned today 3 of 5" and says when the goal is reached, but goes on if asked. The number still limits writing cards started again after a change of script, which Review handles.
- **The lesson** (`lessonSteps` in `src/session.js`; "The lesson for a new word" in `src/review.js`): a look at the word (characters, reading, meaning); its tones, as practice; writing over the outline while each next stroke is shown; writing over the bare outline; writing from memory. A word of several characters goes through each step whole.
- **Only the last step is graded** (owner). It is the writing card as it always was (`showWritingCard`) and counts as that card's first review. The tone step saves nothing. With writing cards off, or for a word without stroke data, the lesson ends after the tones and the word is learned without a card.
- **Each stroke is shown until it is written** (owner, who did not want to watch the whole character animate first): `showDemo` in `src/quiz.js` draws the next stroke in blue over and over, as a thick line along the stroke's middle line cut to its printed shape, animated by the style sheet (`.stroke-demo-line`). Hanzi Writer cannot animate a stroke while its quiz runs, hence our own layer. `wordFlow` asks for it with `demoStrokes`, and for the outline with `showOutline`.
- **"I know this word: skip its lesson"** (every step; the owner, 2026-10-13: "the app should trust me") skips the lesson altogether: the word's new cards are answered "Easy" as by the card manager's "I know this word" (`markedKnown`), and in the Learn tab the next word starts at once, without the stop between two words. Such a word counts in "Learned today", so that number can pass the goal quickly. Until that day the button only jumped to the last step, which still had to be written.
- **In Review** a writing card that is new for a learned word (a word from before the Learn tab, or one to be written again in another script) gets the lesson without the first look. The `lessons` setting ("In Review, teach before testing") switches that off; it does not affect the Learn tab.
- **Review and Learn are one piece of code** (`createReview`; `activate('learn')`), sharing the top of the page and the study area. `review.load()` is waited for by `activate`, so a card is never chosen from words read before a change.
- **`tests/browser/lesson.browser.js`** covers Learn and the lesson. A tap on a tone card is ignored for 600 ms after the last answer.

## Switching script: writing cards per script

Asked for by the owner on 2026-10-13: someone who learned simplified and moves to traditional (or the other way) should keep their words, with the characters that differ studied as if new. The two choices below are theirs.

- **Writing cards are kept per script; meaning, pinyin and tone cards are not** (`PER_SCRIPT_TYPES` in `src/session.js`). Their answers are the same whichever script the word is shown in, so they keep their schedule. A word written the same in both scripts has one writing card.
- **Card IDs:** `cardIdFor(word, type, script)` in `src/session.js`. The traditional card has the plain `<wordId>#writing`, as the word's own ID is built on its traditional form; the simplified one is `<wordId>#writing#simplified`. `allCardIds(word)` lists both. Use these, never `cardId` alone, for anything about a word's cards.
- **After a switch**, a writing card known only in the other script is learned again (`toLearnAgain` in `planSession`): it counts toward the daily limit of new words, comes before words never seen, in the order the words were first learned, and starts from scratch. The other script's card stays stored, so switching back loses nothing. The counts line shows them under "New words".
- **A word's own script** ("Cards in") goes through the same thing: `planSession` is given `scriptOf(word)`.
- **Cards from before this** sit under the plain ID whatever script they were learned in. `fileCardsByScript` in `src/scriptCards.js` moves a plain writing card to the simplified ID if its latest review was in simplified (reviews have always recorded `script`). It runs once at start-up (setting `cardsFiledByScript`; an older backup does not have it, so it runs again after one is restored) and whenever a word is saved in its pop-up panel. Reviews keep the `cardId` they were made with.
- **The traditional form can be corrected in the pop-up panel** (not shown to a simplified-only learner). That changes the word's ID, so `renameWord` in `src/db.js` files the word, its cards and its reviews under the new one in a single transaction. This is what fixes a word the dictionary could not supply a traditional form for. The pinyin can be corrected the same way.
- **Not handled:** making a word's two forms the same again leaves its `#simplified` card unused. A list import cannot correct traditional forms in bulk.

## Offline use and deployment (the PWA)

Built on 2026-10-13. The owner chose: all stroke data saved on the device, and automatic deployment.

- **Where it runs:** https://bunnyapocalypse.github.io/hanzi-trainer/, published by `.github/workflows/deploy.yml` on every push to `main` (after `npm test`; the browser tests are not run there). So anything pushed to `main` is live within minutes: run the tests before pushing.
- **The build is relative** (`base: './'` in `vite.config.js`, for builds only), so the same `dist/` works in any folder. `import.meta.env.BASE_URL` is `./` there; build addresses with it, as `src/charData.js` and `src/offline.js` do, never with a leading `/`.
- **`src/serviceWorker.js`** is not part of the program. `scripts/build-offline.js` (npm's `postbuild`) copies it to `dist/sw.js` with `VERSION` (a fingerprint of the app's files) and `APP_FILES` (page, program, styles, tone table, icons, manifest) in front. It answers every request from the device's caches if it can and from the network otherwise. There is no service worker under `npm run dev`.
- **Two caches.** `app-<VERSION>` holds the app's files and is replaced with each version. `offline-data` holds the stroke data and dictionary and is kept across versions.
- **Stroke data is saved in the background, in packs.** Fetching 10,600 files one by one is too slow for a phone, so `build-offline.js` packs them 600 to a file into `dist/offline/` (18 packs, 35 MB; about 14 MB as downloaded) with a list in `offline/index.json`. `saveOfflineData` in `src/offline.js` fetches each pack and puts every file into the cache under its own address, so `loadCharData` and the service worker need to know nothing about packs. A pack's name carries a fingerprint of its contents and a finished pack leaves a mark in the cache, so an interrupted download resumes and unchanged packs are never fetched again. The dictionary is saved whole. The single files stay in `dist/` for use until the packs are in.
- **A new version waits** until the "New version ready: tap to reload" button in the footer is tapped, so the app never changes under a review. Without the tap it takes over once every tab and window of the app has been closed.
- **`navigator.storage.persist()`** keeps the browser from clearing the database to free space. It is asked for in the introduction or with a button in Settings, never by itself (see "The introduction"). How it stands is shown under "Offline use" in Settings, with the progress of the download.
- **The database at the Pages address is a different one** from the LAN dev address (see "No sync"). Moving over is Export backup there, Import backup here, once per device.
- **Icons** (`public/icons/`) are 字 in AR PL UKai TW (a Kai-style font, Fedora package `cjkuni-ukai-fonts`; the owner chose it on 2026-10-13) on the writing grid, rendered once with headless Chromium from an SVG; there is no script for it. The maskable one has the wider margin Android's icon shapes need.
- **`tests/browser/offline.browser.js`** builds the app, serves `dist/` from a sub-folder with a plain file server (`startBuiltApp` in the harness, like GitHub Pages), waits for everything to be saved, fakes a new version, then stops the server and checks writing, the dictionary and tone cards. It leaves `dist/` built.
- **Not tested here:** installing on a real phone, and airplane mode on it. Only the owner can.

## Ready-made word lists (HSK and TOCFL)

Asked for by the owner on 2026-10-13: HSK 3.0 first, 2.0 supported too, and TOCFL from the official files.

- **Where:** the "Ready-made decks" section of the Decks tab (see "Decks"). A list is chosen by tapping its row (HSK 3.0, HSK 2.0 marked "older", or TOCFL; rows like those of My decks, each with a line saying what it is, in place of a drop-down list since 2026-10-13, at the owner's request; the chosen one has a heavy edge and HSK 3.0 is chosen to begin with), its levels appear with checkboxes and counts ("Level 1: 512 words, 480 new"), and the button adds the chosen levels' new words at the end of the queue, lowest level first. A paragraph above explains what the HSK is and which list to pick, with a link to Wikipedia, for someone new to it.
- **The files** are `data/wordlists/hsk/hsk-3.0.tsv` (11,054 words) and `hsk-2.0.tsv` (5,008), built by `scripts/build-word-lists.js` from two MIT-licensed projects at fixed versions; the folder's README has the sources and the license notice. Columns: level, simplified, traditional, pinyin, meaning. They are separate files (`?url` imports in `src/wordsPanel.js`), fetched when the section is opened and saved for offline use with the dictionary (`scripts/build-offline.js` saves every `.tsv` among the build's files).
- **Meanings come from the app's dictionary** when a list is added, like for a word typed by hand, so the "Dictionary meanings" setting applies. A list only carries a meaning for the few words the dictionary lacks (31 in HSK 3.0); those, with their readings, are hand-written in `data/wordlists/hsk/extra-meanings.tsv`. A test checks that every listed word can get a meaning.
- **Every listed word is matched to the dictionary** by its simplified form and reading (`bestMatch` in the build script) and takes its traditional form and reading from there, so that its ID is the same as when the word is typed by hand, and the same in both lists. The sources could not be used as they are: the HSK 3.0 source was matched to an older CC-CEDICT, and the HSK 2.0 source has character-by-character traditional forms (后面 for 後面) and tones as spoken (yi4qi3).
- **Do not use drkameleon/complete-hsk-vocabulary for readings.** It was the first source looked at; it lists every reading CC-CEDICT has for a word, not the one the HSK means (句 as gōu).
- **TOCFL** (`data/wordlists/tocfl/tocfl.tsv`, 7,431 words in seven levels) is built by the same script from the spreadsheet the test's committee publishes, read without any library (`filesInZip`, `sheetsOf`). The sheet has only traditional characters and tone-marked pinyin, with several things in a cell (你/妳, 爸爸/爸, 車(子), zhuyin notes); `formsOf` takes them apart and `tocflMatch` finds each word in the dictionary, also by its Taiwan reading. 79 entries the dictionary does not have that way are left out. **The source states no license**; the owner chose to include it, and the folder's README says so.
- **A word from a list is put in that level's deck**: its `decks` field gets the deck's ID, like `hsk-3.0/1` (`listTag` in `src/words.js`); a word already there gets it too. The deck records are made at the same time (`src/decks.js`). Until 2026-10-13 the field was called `lists`; `fileListWordsInDecks` in `src/main.js` converts it at every start.
- **A level can be divided into groups of words, each a deck inside the level** (asked for by the owner on 2026-10-13, as milestones smaller than a level). A list file's optional sixth column has the word's group, as its number within the level and its name (`03 Education 教育`); `listTag(listId, level, group)` makes the deck's ID from it (`tocfl/1/03 Education 教育`), and `readyMadeDeck` makes the deck from the ID alone, so no table of groups is kept in the code and every device makes the same decks. A word carries its group's ID only; it counts for the level and the list because those contain the group. Renaming a group changes its ID.
  - **TOCFL:** Novice 1 to Level 2 use the twelve topics of the committee's own sheets, in its order (`TOCFL_TOPICS` in the build script has the English names, which are Claude's translations). Levels 3 to 5 have no topics; level 3 is grouped like the HSK levels.
  - **HSK:** the lists are alphabetical inside a level. `withGroups` in the build script reads `data/wordlists/hsk/groups/<list>-<level>.tsv` (group number, group name, simplified, pinyin) where there is one, puts the level's words in that order and gives them their group. The owner's idea: a teaching order made by judgment, not by frequency, which would put the grammar words first. The owner approved the level 1 grouping on 2026-10-13. The files were written by Sonnet subagents to Claude's brief, checked by a script (every word once, groups of 12 to 40) and reread by Claude. They are under the MIT License (owner, 2026-10-13); the folder's README says how they were made.
  - **Group counts:** HSK 3.0 levels 1 to 6 have 28, 39, 47, 60, 70 and 78 groups; HSK 2.0 levels 1 to 5 have 11, 10, 17, 37 and 77; TOCFL level 3, which has no topics of the committee's, has 74 (`data/wordlists/tocfl/groups/`, read by the same `withGroups`). From level 4 up the owner has not read the groups; Claude read samples. The abstract vocabulary of the higher levels groups less cleanly: expect some loose groups of verbs and adjectives.
  - **Held back for their size** (2026-10-13): HSK 3.0 level 7-9 (5,634 words), HSK 2.0 level 6 (2,500), TOCFL levels 4 (2,267) and 5 (2,707). One agent sorted up to about 1,300 words well; twice that has not been tried. A word listed at two levels is kept at the lower one, so the build script reports such words as "not in" the higher level's group file; that is expected. A test checks that every word of a grouped level has a group.
  - **Rebuilding the lists downloads the TOCFL spreadsheet, which takes several minutes.** With a copy of the zip file at hand, `TOCFL_ZIP=<file> node scripts/build-word-lists.js` uses that.
- **The dictionary now follows pointers.** Many CC-CEDICT entries only say "erhua variant of 一點" or "variant of 詞典", and were left out of the dictionary for having no meaning, so 一点儿 and 辞典 could not be found. `scripts/build-dictionary.js` now gives such an entry the meanings of the one it points to (7,142 entries; the dictionary has 124,481 and is 8.4 MB).

## The introduction (first use)

Asked for by the owner on 2026-10-13; the screens' wording and the extras noted below are Claude's.

- **Six screens in one `<dialog>`** (`welcome` in `index.html`, run by `src/welcome.js`): welcome; script and pronunciation; the four kinds of card, with a checkbox each; how it works; your words; keeping your data. Next and Back move between them; the last button ends in the Decks tab if there are no words yet.
- **It opens by itself once per device**, while the `welcomeDone` setting is missing, so every existing device sees it once too. It starts from the settings as they are. Choices are saved only when the last screen is finished; "Skip the introduction" and Esc change nothing. "Show the introduction again" in Settings reopens it.
- **Long-term storage is only asked for after it has been explained.** The last screen says why, and its button calls `keepData.ask()` (`navigator.storage.persist()`, in `src/offline.js`). Settings has the same button under "Offline use" while the answer is no.
- **What the app says depends on the browser** (the owner asked for this on 2026-10-13): `browserKind` and `storageAdvice` in `src/storageAdvice.js`, plain calculation with tests. Firefox asks the person, so the app says to expect the question and, after a refusal, how to undo it. Chromium browsers never ask and say yes for an installed app, so the app says to install first, and after a no, that it will ask again by itself. Safari decides by itself and on an iPhone or iPad deletes a site's data after about a week unless the app is on the Home Screen, so the app says to put it there. Every refusal ends with "use Export backup".
- **"Install the app" button:** a Chromium browser announces `beforeinstallprompt` when the app can be installed; `src/offline.js` keeps the event and shows the button in the introduction and in Settings. Other browsers get the menu instructions in the advice.
- **Asking again without bothering anyone:** once the button has been tapped (`keepDataWanted` setting), browsers that decide by themselves are asked again at every start and when the app is installed (`appinstalled`), which shows nothing. Firefox is not, because it would put its question up again.
- **Not tried in Firefox or Safari:** the browser tests can only drive Chromium. The wording for the other two follows their documented behavior; the owner should try Firefox, which is installed on their computer.
- **The scripts and pronunciations are explained where they are chosen** (asked for by the owner on 2026-10-13), for someone new to Chinese: where each script is used and an example of a character that differs, with "Simplified" and "Traditional" linking to their Wikipedia articles, and a link to "Taiwanese Mandarin" for the pronunciation. The same text is in the introduction and behind a "?" beside Script and Pronunciation in Settings. Any `.help-button` in the settings panel shows the element named in its `aria-controls` (`src/settings.js`). The owner preferred one link per script over Wikipedia's "Debate on traditional and simplified Chinese characters", which is long and about the argument.
- **Beyond what was asked:** pronunciation is chosen on the same screen as the script, and the kinds of card can be switched off where they are explained.
- **It is opened before the first tab is shown** (`startUp` in `src/main.js`), which the browser tests rely on: `startBrowsers` skips it as soon as the app has started, since a `<dialog>` lies over the page and would catch the strokes. `{ keepWelcome: true }` leaves it, for `tests/browser/welcome.browser.js`.
- **Settings is a cog wheel in the upper right corner of the page** (`settings-cog`; the owner, 2026-10-13: the button at the bottom center looked bad), placed against `main`, so it scrolls with the page. On a phone the tabs sit at the left and are a little smaller to leave it room. The footer only holds the "New version ready" button now. Above the list of words, "Show", "Order" and "Select words" share one row (`list-tools`).
- **A review of the app's structure was done on 2026-10-13** (by Claude, from screenshots at phone size and counts; nobody else has reviewed it). Its findings, for whoever restructures:
  - The Decks tab does five jobs: moving between decks, adding things (three forms), finding words, managing cards (filters, order, selecting several) and the ready-made lists. A deck's page is over ten screens long with a hundred words on it.
  - Settings is one list of 27 controls, 2.7 phone screens long, under three headings; Export and Import backup are near its bottom although the data exists nowhere else.
  - One word has three surfaces: its page (to read), its pop-up panel (to change it, with its decks, cards and suspended cards) and two buttons on Review's answer page. In the panel some things act at once and others only on Save.
  - Free practice is a tab of its own although it is mainly for trying cards out.
  - On a 390 by 844 phone a lesson's writing step is 46px taller than the screen, so "I know this word" is below the fold.
  - To suspend a card that Review has just called a leech takes leaving Review and six steps.
  - Claude's advice was to stop adding features, publish what is built, and have the owner (and anyone else willing) study with it for a week or two before restructuring, since use will say which of these hurt.
- **A round button needs `min-height: 0`.** Every button is at least 48px tall (the `button` rule), so one given a width and a `border-radius` of 50% comes out oblong unless it says otherwise; `button.icon-button` does.
- **A pass over the app's looks is its own task, for when the features have reached what a version 1.0 needs** (the owner, 2026-10-13; until then only what is plainly broken is fixed, and looks are not otherwise worked on). It came up after several things looked off: oblong round buttons, a button stranded in the center, a drop-down that looked like a text box). Claude's advice was to do it as one piece of work together with dark mode, since both begin with gathering the colors and sizes into named values, and to look at every screen at phone, tablet and desktop width.
- **The app starts with no words.** Until 2026-10-13 a new database was given 109 test words. `removeOldBuiltInWords` in `src/main.js` removes them, studied or not, once from every device that was given them (it has the `builtInListVersion` setting): the owner asked for that. Their IDs are in `src/oldBuiltInWords.js`.

## Taiwan and mainland pronunciation

- **A word's `pinyin` is its mainland reading; `pinyinTaiwan`, if present, its Taiwan reading** (the optional fifth column of a word list). The `pronunciation` setting (`mainland` or `taiwan`; a new device starts on `mainlandOnly`) decides which is shown as the answer and expected on tone cards; the other is shown next to it, labeled. (With `mainlandOnly` there is no other; see the section above.) A word with no Taiwan reading is the same under both settings. `readingsFor` in `src/tones.js` is the one place that decides this.
- **Shown readings are never guessed.** The owner chose this. A Taiwan reading comes only from the word's own fifth column or from a whole-word "Taiwan pr." note in CC-CEDICT (`taiwanWords` in the tone table). The test word list's 13 Taiwan readings were checked against Taiwan's MOE dictionary (moedict.tw). Readings recalled from memory turned out wrong for several words, so always check.
- **Accepted tones are wider than shown readings** (`toneAnswers` in `src/tones.js`). Besides the listed tones, a tone card accepts, as a *variant*: the other region's tone for the word; a tone CC-CEDICT links to the listed one as a mainland and Taiwan reading of the character; and the character's own full tone where the list says neutral. The last two are approximations that accept some things neither standard says (yìnggāi for 應該, háizǐ for 孩子), so an answer accepted only as a variant is pointed out on the card together with the listed reading.
- **A neutral tone where the list has a full one** is accepted in two cases (the owner's choice, 2026-10-13). By default, as a pointed-out variant, where CC-CEDICT also gives the word a neutral reading, as an entry of its own (東西 dōngxī and dōngxi) or in an "also pr." note (知道): `neutralWords` in the tone table, 122 words. And as simply right where the owner added the reading to the word: "Readings also accepted on tone cards" in the word's pop-up panel, stored as `pinyinAlso`, which is not part of the word's ID. Anywhere else neutral is wrong (xīngqi for 星期 until it is added). `pinyinAlso` takes any reading, not only neutral ones; it is only used by tone cards and search, and is not shown on cards.
- **The tone table** `data/cedict/tones.json` is built from CC-CEDICT by `scripts/build-tone-table.js`, run by hand; it is the only script that uses the internet. The table is CC BY-SA 4.0, not GPL. The app loads it with a dynamic `import()` so it is a separate file; if it fails to load, tones are judged against the word list alone.

## Following where a character is written

- **The problem:** with raw input the reference is invisible, so the owner writes wherever and at whatever size feels natural, but Hanzi Writer grades against one fixed, centered position. A character begun off-center had its later strokes expected in the wrong place.
- **The fix** (`src/frame.js`, and the section of the same name in `src/quiz.js`): after each accepted stroke, a least-squares fit over all accepted strokes gives a *frame* (shift and size). If it has changed enough, Hanzi Writer is handed the stroke data moved into that frame and the quiz resumes, the same way the second stroke order is handled.
- **The data Hanzi Writer holds is always: base data, in the current stroke order, in the current frame** (`currentData` in `src/quiz.js`). Anything that compares drawn strokes with textbook ones must use the framed data (`framedData`, `charData`), never `baseData`, or it will judge against the centered position.
- **Because the data itself is moved**, hints appear where the character is being written, and the printed character at the end lines up with the handwriting.
- **Rules:** shift from the first stroke; size only once the strokes written span about 20% of the box; size limited to 0.4–1.5 and shift to about 30% of the box; no following while the outline is shown or when raw input is off; Restart, Animate and a new character go back to the centered data.
- **The first stroke may land anywhere, at any size that can be followed.** If Hanzi Writer rejects the very first stroke only for where it is or how small, `isFirstStrokeAnywhere` in `src/quiz.js` accepts it by shape, and the frame follows. The owner writes at about half the size of the box, often in a corner, so `fitsStroke` lets a first stroke be as short as 0.35 times the textbook's (0.5 for later strokes).
- **Which order a first stroke belongs to is decided by shape, not position** (`otherOrderFor`, when nothing is written yet). Written small in a corner, the mainland order's first stroke can lie nearer the MOE order's (長, 馬). Where both orders start with the same shape (學), the re-reading described under "Two accepted stroke orders" sorts it out a stroke later.
- **The size is not known after one short stroke** (`MIN_SPAN_FOR_SCALE`), so until the strokes span enough, the next ones are expected at full size around the first. Written at half size, the second or third stroke then lands too close to the first and Hanzi Writer rejects it. `isExpectedStrokeAtAnotherSize` in `src/quiz.js` catches that: taking the rejected stroke as the expected one, it fits a frame to it and the strokes before it, and accepts the stroke if all of them sit on their references at that size (judged by `fitsStroke`, more strictly the smaller the size). It only applies until the size is known (`sizeIsKnown` in `src/frame.js`). `otherOrderFor` counts the rejected stroke into its frame in the same way, or a character re-read into the other order would still be expected at full size.
- **Limits:** only shift and size, not slant or stretch. A wrong stroke accepted early skews the frame for the strokes after it.

## Two accepted stroke orders

- **MOE order is the standard the app teaches.** The Taiwan set's strokes are in the order of Taiwan's Ministry of Education, which differs from the mainland order for 83 of its characters (學 starts with 爻; 我, 忙, 馬, 國, 錢 and others differ too). The owner is used to the mainland order for some of these, so **both are accepted** in Traditional mode, with no penalty.
- **Finding the second order:** `scripts/strokeOrder.js` compares each Taiwan-set character with the big set when the data is prepared. If both have the same strokes (matched strictly, both ways) in a different sequence, the mainland sequence is stored in the character's file as `altOrder`. When in doubt nothing is stored and only the MOE order applies.
- **Following it during a quiz** (`src/quiz.js`, section "Two accepted stroke orders"): Hanzi Writer holds one order and grades strictly in sequence. When it rejects a stroke that fits what the other order expects next (`src/strokeMatch.js`), the stroke is accepted, Hanzi Writer is handed the same strokes rearranged via `setCharacter()`, and the quiz resumes with `quizStartStrokeNum`. Raw input make the swap invisible.
- **Which order is meant can be unclear at first, so the strokes written are re-read when needed.** 學 starts with a ノ in either order (in the middle for MOE, at the left for mainland), and with an invisible reference and a movable frame the first stroke fits both. The owner's screencast showed the result: the mainland first stroke was taken as MOE's, and the next stroke was then rejected forever. Two checks in `src/quiz.js` handle it, both built on `otherReadingOf`, which re-reads the strokes written since the two orders last agreed (`lastSyncPoint`) as the other order's:
  - `otherOrderFor`, on a rejected stroke: switch if that stroke and the earlier ones all fit the other order, in the frame that reading implies.
  - `otherOrderBeats`, on an accepted stroke: switch if the other reading fits clearly better (the 丨 of the left part can pass for a stroke of 爻 when written over it).
  Neither applies at the last stroke of a character.
- **A rejected stroke can pass both as a shortcut and as the other order's next stroke.** Written to the right, the left 丨 of 學 runs alongside the 丶 and ノ of the 爻 joined up. `otherOrderIsCloser` decides by which of the two the stroke lies nearer to; before 2026-10-13 the shortcut always won.
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

- Service workers and "Add to Home Screen" only work over HTTPS or on `localhost`. The LAN dev address (`http://192.168.x.x:5173`) is plain HTTP, so offline/install features cannot be tested there from the phone. The app is deployed to GitHub Pages for that (see "Offline use and deployment"); on the computer, the built app can be tried at a `localhost` address.
- The writing area needs `touch-action: none`, otherwise drawing scrolls the page on a phone.
- Hanzi Writer adds its SVG layers only after the character data has loaded, and later SVG elements are drawn on top. The layer of drawn strokes is therefore re-appended at the start of each quiz so it stays above them.
- Hanzi Writer colors the strokes of a character's radical separately (`radicalColor`, falling back to `strokeColor` only at creation). Changing `strokeColor` later leaves the radical's strokes in the old color, so always change both (see `setPrintedColor` in `src/quiz.js`).
- Hanzi Writer works out touch positions from the SVG's on-screen size, so the `width`/`height` passed to it must match the element's real size. Don't scale the SVG with CSS.

## Skritter import (future)

The owner wants to bring their Skritter data across eventually rather than start from scratch. Don't build it early, but keep it in mind whenever the data model is designed: it should hold words as well as single characters, both scripts, and per-item review history and scheduling state. Look at a real Skritter export before finalising the IndexedDB schema. Personal exports go in `exports/`, which is git-ignored.

## Long-term goals

Agreed with the owner on 2026-10-13, in the conversation that had been put first on the to-do list.

- **Who it is for:** the owner first, and any learner who wants it ("If I am putting the effort into this, why not share it?"). Wording, defaults and help text should work for a stranger.
- **Nobody's data is ever held by us.** The owner does not want to make or run a sync server or touch anyone's data, unless that becomes necessary. Everything stays on the device.
- **Sync without a server:** first merging backups by hand; as a very long-term goal, syncing through storage the learner already has (Google Drive, Proton Drive, iCloud, OneDrive). Both are the same merge with a different way of moving the file, so the merge is built once.
- **Better than Skritter where Anki is:** decks and sub-decks, managing cards, flagging leeches, a choice of scheduling (retention, parameters), and everything portable. Leeches can be exported as a list, and as a prompt for an AI to make mnemonics from.
- **A word can be in several decks and has one schedule.** Studying a deck filters the same cards.
- **Sentences and audio:** hearing the word and sentence cards (without audio) are core. Listening cards, example sentences on a word's answer page and audio for sentences are nice to have.
- **The hard constraints are open to change** (vanilla JavaScript, no framework, few dependencies) if a change makes the app easier to grow or to contribute to. Nothing planned needs one yet, so they stand until a concrete case comes up; each change is still asked for first.
- **Order of work:**
  1. **Done on 2026-10-13:** settle the data model for decks and merging (see "Ready for merging"). The Skritter scheduling data has not arrived, so the import was not looked at.
  2. **Done on 2026-10-13:** decks, with the Decks tab in place of the Words tab (see "Decks"). Swapped with merging that day: the owner is only testing for now, so decks were of more use to them first.
  3. **Done on 2026-10-13:** merge backups (see "Combining backups").
  4. Leeches with their export, and a card manager.
  5. Sentences and audio.
  6. Statistics.
  - The Skritter import comes whenever the GDPR data arrives. Dark mode and collapsing long meanings fit in between.
- **Consequences for the data model**, as Claude sees them: a removed word or card must leave a mark, or a merge brings it back; records need the time they were last changed; a corrected word's old ID must be remembered; and a card's schedule should be recomputable from its reviews, which also serves changed scheduling, leeches and statistics.
- **Sharing raises the bar on licensing.** The TOCFL list has no stated license (see "Ready-made word lists").

## Where the work stands

Written on 2026-10-13 for whichever session picks the work up next (the owner works from more than one computer; everything is on `main` and published).

- **To do, the owner's: try what was built on 2026-10-13.** None of it has been tested by them (asked to be put on the list that day). Ask how it went before building further on any of it:
  - Combining backups between two real devices, and whether the `...-before-combining.json` file lands in the downloads (not verifiable in the tests' browser).
  - The Import backup panel and the ready-made lists' rows on a phone.
  - Percent learned and its bar; "Add a word" folded away.
  - The groups inside the lower HSK and TOCFL levels: only HSK 3.0 level 1 was seen by the owner.
  - Sentences: adding one from a word's page and by hand, the reading card, the gap on the writing card, writing a whole sentence on a phone.
  - The word page: its layout on a phone, whether the notes read well there, and the taps from part to part.
  - Sound: nobody has listened yet. Whether the recordings are good enough at their smallest size, how words put together from syllables sound, and what the phone's and tablet's own voices do.
  - Leeches: the two settings, the note in Review, the lists in the Decks tab, both exports, and the notice when a card is suspended.
  - The card manager: the Cards fold-out, Start over, "I know this word", the order of the list, and Select words.
- **Done that day:** the conversation about long-term goals, the database made ready for merging, and decks with the Decks tab in place of the Words tab (see "Long-term goals", "Ready for merging", "Decks").
- **Done later that day: combining backups**, number 3 in the order of work (see "Combining backups"). The owner has not tried it yet.
- **Done later that day: groups inside the lower levels** of the ready-made lists (TOCFL's topics; HSK 3.0 and 2.0 levels 1 to 3 in a teaching order), each a deck inside its level. See "Ready-made word lists". The owner saw and approved HSK 3.0 level 1; the other five HSK levels were read by Claude only.
- **Done later that day: leeches** with their two exports, and suspending a card (see "Leeches and suspended cards"). The owner has not tried it.
- **Done later that day: the card manager** (see "Managing cards"). The owner has not tried it.
- **Sentences and audio**, number 5 of the order of work, agreed with the owner on 2026-10-13 in four steps: hearing a word (**done**, see "Hearing a word"); a read-only page for each word with an Edit button (**done**, see "The word page"); sentences as items of their own (**done**, see "Sentences"); then listening cards and ready-made sentences (**next**). Also raised by the owner and not looked into: eSpeak NG or a small neural voice model in the browser.
- **Wanted by the owner for the word page (2026-10-13):** the parts that make up each character, each clickable, saying which gives the meaning and which the sound; and the characters and words of an example sentence clickable, leading to their definitions. Make Me a Hanzi's `dictionary.txt` (LGPL-3.0, 9,574 characters; the same project the big stroke set comes from) has for each character its decomposition, radical, and for sound-meaning compounds the semantic and phonetic parts. Wiktionary's data is available as JSON from kaikki.org (CC BY-SA and GFDL) and has glyph-origin text; it could be handed to the model that writes notes instead of letting it recall etymology.
- **Wiktionary's data is kept locally for development** (owner, 2026-10-13: no asking kaikki.org's server character by character): `local/` is git-ignored except its README, which says how to fetch the 155 MB file. `scripts/wiktionary-glyph-origins.js` makes a small file of glyph origins from it, and `scripts/character-facts.js <list file> <level>` prints, for a level's characters, their parts (Make Me a Hanzi) and glyph origin (Wiktionary) as reference material for writing notes. None of it is shipped. Each computer needs its own copy.
- **A second run of the notes pilot** was started with that material and a tighter brief (parts of characters from the sources only, with meaning part and sound part; no needless "do not confuse"; no filler). The first run is `data/notes/hsk-3.0-1.tsv`. Notes that lean on Wiktionary are to be CC BY-SA 4.0.
- **Decided by the owner on the notes (2026-10-13), after reading the second run:** go on with them at that quality and cost. A note never names its source ("Wiktionary says…"); the credit goes in the data's license notice. Every word has an example sentence, always stored in both scripts and shown in both only when both scripts are being learned. Parts of characters stay in a note only where they matter for sound or meaning and the word page's clickable parts cannot say it (the parts are to be tagged "meaning" and "sound" there, from Make Me a Hanzi). **Wanted on the word page:** a button to add the example sentence to a deck, in the script or scripts being learned (needs sentences as items, step 3).
- **The notes for HSK 3.0 level 1 are in `data/notes/hsk-3.0-1.tsv`** (the second run, with the 160 notes that named Wiktionary reworded by a further Sonnet pass), CC BY-SA 4.0; the folder's README says how they were made and that no fluent speaker has checked them. `src/notes.js` reads them and splits an example sentence into its words by the spaces in its pinyin (`sentenceWords`); `src/characters.js` reads Make Me a Hanzi's dictionary and gives a character's parts with their roles (`structureOf`).
- **Which script a note's own text uses** (the owner, 2026-10-13): simplified is fine for the notes of the HSK lists; the notes written for the TOCFL lists are to use traditional characters. (The example sentence is in both either way.) So a traditional learner reading an HSK word's note sees simplified characters inside the English text; that is accepted.
- **No word gets a note twice** (the owner, 2026-10-13). Notes are found by a word's simplified characters and pinyin, whichever list it came from, so before notes are written for another level or list (HSK 2.0, TOCFL), the words that already have a note in any file of `data/notes/` are taken out of the input.
- **Wanted by the owner: a ready-made deck of the 部首** (the radicals), beside the HSK and TOCFL lists. Not started. To settle: which set (the 214 Kangxi radicals, or the ones that actually occur as meaning parts in the lists), their names and meanings, and what the cards ask, since many radicals are not words and have no reading in everyday use.
- **Before the session ends, push** (the owner's instruction): commits made after the last push are local only.
- **Under way: a pilot of learning notes.** The owner asked for notes on each word's page as in Skritter (a breakdown, a usage point, an example sentence), for the levels up to about B2. A Sonnet subagent was writing them for HSK 3.0 level 1 (509 words) as a trial of quality; it came back with 509 notes for about 198,000 tokens. The owner read a sample and found it fine, with two wishes for a next round: no "do not confuse X with Y" unless the pair is really confusable, and more on each character's parts, for meaning and for sound, which is better taken from data than from the model's memory. The app has no page to show them on yet. Skritter's own notes must not be copied.
- **The owner has only tried the Decks tab briefly.** They asked for the Back button after their first look; expect more remarks on it.
- **Deploying:** if the deploy step fails with "Fetching artifact metadata failed", do not re-run the failed run (the re-run uploads a second copy of the site and fails on that); start a fresh one with `gh workflow run deploy.yml --ref main`.
- **The repository's address** is `BunnyApocalypse/hanzi-trainer`, with capitals; the lowercase one still works but git says it has moved.

## Settled with the owner on 2026-10-13

- The Script and Pronunciation settings suit them as built.
- **The owner is only testing the app for now; their real study is still in Skritter.** Nothing in the app's database on any of their devices, at the old LAN address or the published one, needs saving. Other people may be using the published app, though, so a change to the database still has to carry existing data over.
- The Skritter exports in `exports/` are plain word lists (a TSV and a CSV). The scheduling data from the GDPR request has not arrived.

## Roadmap

1. **Done:** one hardcoded character, stroke-by-stroke quiz with grading, reachable from a phone over the LAN.
2. **Done:** raw input, lenient grading, optional 2-stroke 子.
3. **Done:** practice any typed character or multi-character word; stroke data loaded on demand.
4. **Done:** FSRS scheduling of writing cards on a built-in word list, IndexedDB storage, backup export/import.
5. **Done:** Taiwan-standard stroke data for the 1,013 traditional characters animCJK covers, with the mainland stroke order also accepted where the strokes are the same. Still open: the traditional characters it does not cover.
6. **Done:** the other card types (meaning, pinyin, tone with buttons or a drawn mark), scheduling across types, the settings panel, the pronunciation setting and Taiwan/mainland tone variants. Later: zhuyin as an alternative to pinyin.
7. **Done:** two consecutive strokes joined, for every character. Still open: longer runs, and shortcuts that reorder or drop strokes.
8. **Done:** PWA: manifest, service worker, all stroke data and the dictionary saved offline, deployed to GitHub Pages on every push to `main` (see "Offline use and deployment"). Still open: the owner trying it installed on the phone and tablet.
9. Import the Skritter scheduling data, if the GDPR request (sent 2026-10-12) yields it. The word list itself can be added in the Decks tab since 2026-10-12; the owner had said they did not want it imported without scheduling data, so when to do that is theirs to decide.
10. **Done on 2026-10-13:** combine backups between devices instead of only replacing (see "Combining backups"). Still open: a setting for target retention.
11. **To do, asked for by the owner:**
    - **Done on 2026-10-13:** the conversation about long-term goals (see "Long-term goals", which also has the order of work).
    - **Done on 2026-10-13:** fit the interface to the script and pronunciation being learned (see "Fitting the interface to what is learned"). The owner has not seen it yet.
    - **Done for writing:** a browser test suite that lives in the repo and runs in parallel (see "Browser tests"). Still open: browser tests for grading in Review and for most of the settings panel.
    - **Done on 2026-10-13:** the browser grid's remaining failures (half-size second or third stroke; 學 in the mainland order shifted right). See "Following where a character is written" and "Two accepted stroke orders".
    - **Done on 2026-10-13:** a tab tapped before the app has finished starting is opened once it has (`setMode` and the end of `startUp` in `src/main.js`), instead of throwing an error.
    - **Done on 2026-10-13:** pronunciation notes inside a meaning, such as "conduct (Taiwan pr. [xing4])", are taken out whole when the dictionary is built, and the dictionary was rebuilt (same CC-CEDICT release).
    - **Dark mode** (asked for by the owner on 2026-10-13): a choice in Settings, presumably light, dark, or as the device has it. The colors are written out all over `src/style.css` and in a few places in the code (the writing area's ink, outline and grid in `src/quiz.js` and `src/wordFlow.js`, the manifest's colors, the icon), so the first step is to gather them into named colors.
    - **Done on 2026-10-13:** ready-made word lists for the HSK (3.0 and 2.0) and the TOCFL (see "Ready-made word lists"). Not done: TBCL, and the 79 TOCFL entries left out.
    - **Long meanings should collapse** (asked for by the owner on 2026-10-13): some words get a very long meaning from the dictionary (点 is the owner's example), which crowds a card. A meaning beyond some length should be shown cut short, with a way to see all of it. To settle: where it applies (the prompt of a writing card, the card's face, the word list), and whether proposing a shorter meaning in the first place would serve better for single characters.
    - **Done on 2026-10-13** (see "Decks"). As first written down: **Decks, as in Anki** (asked for by the owner on 2026-10-13): words grouped into decks; studying one deck at a time as well as everything together ("all words learned"); and decks inside decks, such as a textbook with its chapters. A ready-made word list would arrive as a deck, with its levels as sub-decks. To settle first: whether a word can be in several decks (a word's ID is its characters and pinyin, so it exists once), where a deck's place in the tree is stored, how the daily limit of new words works per deck and overall, and what the backup and a later merge between devices need.
    - **Nice to have, long term** (the owner's idea, 2026-10-13): a mode that helps someone go from 繁體 to 簡體 or back. Today every word whose forms differ has its writing card learned again. The mode would work by character or component instead: having learned 們 → 们 once in one word, the learner is taken to know it in 他們, 你們 and the rest, so only the characters that are new to them come up. Needs a table of which characters differ between the scripts (the word list's own pairs give most of it) and a record of which the learner has written.
    - A setting for which traditional forms to use: mainland, Hong Kong or Taiwan, so that people can choose. Today Traditional always means Taiwan forms where animCJK has them. Needs stroke data for the other two regions' forms; the big set's traditional characters are mainland-style, and no Hong Kong set has been looked for yet.
    - **Done on 2026-10-13:** a neutral tone is accepted where the dictionary has one or the owner added one to the word (see "Taiwan and mainland pronunciation").

