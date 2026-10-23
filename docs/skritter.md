# Importing from Skritter

Built on 2026-10-23, after the owner's GDPR request of 2026-10-12 was answered with a .zip on 2026-10-22. Decided with the owner that day, from Claude's proposals: **in the app** (for testers who come from Skritter too), not a script for the owner alone; **the whole review history**, not only today's schedules; and for a word the file doesn't settle, **every word it could be, for the learner to untick** ("make multiple cards, let the user check").

## What Skritter sends

Skritter has no export button: its support sends a .zip on request. Inside, a folder of `export_<account>_<Name>_<date>.json` files (and, made on a Mac, `__MACOSX/…/._…` files with no data, skipped). The import reads four:

- **`UserItem`**: one record a card. `part` is its kind (`rune` writing, `rdng` pinyin, `tone`, `defn` meaning); `style` the script it is studied in (`trad`, `simp`, or `both` for a word written the same in both; `none` for the parts of words Skritter makes items for, nearly all never studied); `vocabIds[0]` the word; `reviews`, `successes`; the schedule: `last` and `next` (seconds), `interval`, and FSRS's `stability` (days) and `difficulty` (1 to 10), which Skritter uses too.
- **`ProgressActivity`**: one record a study session (`learn`, `review`, `rejuvenate`): `startedAt`, `finishedAt`, `time` (seconds spent), and `cards`, every card answered in it in order, with `score` 1 to 4 (the same four grades as here). A card failed is asked again in the same session, so it may appear twice. An entry without a score was seen in a lesson, not graded.
- **`UserVocab`**: words the learner changed: `banned` with `banned_parts`, and `c_defn`, a meaning of their own.
- **`VocabListInfo`**: the lists the learner made (Skritter's own lists are named by ID only, `list7`, and not in the file): `name` and `sections[].rows[]` with `vocabId`, `tradVocabId`, `writing`, `writingTrad`.

**What it lacks: pinyin and meanings.** A word is named only as `zh-<simplified characters>-<number>`. The number tells apart Skritter's words with the same simplified form (a word studied in traditional is usually `-1` or `-2`, and an item's own ID may say `-0` while its `vocabIds` say `-1`), but **it doesn't follow the dictionary's order** (checked on the owner's lists), so it can't settle which word is meant. A list's `writingTrad` mostly repeats the simplified form (497 of the owner's 1,201 rows, where the dictionary's differs), so only a different one is taken.

The owner's file: 9,912 cards, 9,440 studied, of 2,476 words; 2,043 sessions with 180,079 graded answers from May 2025; 4 lists of their own.

## What it does

- **Where:** "Import from Skritter" under "Import a deck from Anki" in the Decks tab's "+ New / import deck" panel, on the front page only (`skritter-import-button`, which closes that panel). It opens a pop-up (`skritter-dialog`, styled as the Anki one) in three steps: choose the .zip; check; what was brought over. The introduction's starting level doesn't offer it.
- **The check step:** what the file holds ("2,476 words you studied in Skritter, 9,440 cards, 180,079 reviews") and how many words the dictionary lacks; a line on where pinyin and meanings come from; then **"Check 180 words"**: a group for each set of Skritter characters with more than one word it could be ("子 in Skritter · 47 reviews"), a checkbox each, all ticked: the traditional form (marked as such, since it is what tells 發 from 髮), the pinyin and the first three senses. A box unticked leaves that word out (`choices.leftOut`, `"<characters>><word ID>"`); two Skritter words with the same characters share a group and the choice.
- **Which words** (`candidatesFor`): the dictionary's entries with those simplified characters, narrowed where something is left by: a list's traditional form; for a word studied as `trad` or `simp`, entries whose forms differ, for `both`, entries whose forms are the same; names (a capital in the pinyin) only if there is nothing else; one entry a traditional form and reading. Pinyin and the Taiwan reading are the entry's, the meaning the learner's own (`c_defn`) or the dictionary's (`proposeMeaning`, the "Dictionary meanings" setting). A word with no entry is left out and listed in the result, with how to add one (the owner's file: 150, mostly zhuyin symbols, radicals and phrases).
- **The words** are new words in the order first studied (`newWordRecords`), or words already there, which keep everything and are put in the decks.
- **Decks:** a deck "Skritter", and inside it one for each list of the learner's own; a word in such a list goes in that deck, any other in "Skritter". Decks with those names in that place are reused, so a second import makes none.
- **Banned** in Skritter (and not unbanned): those kinds suspended (`suspended`). In the owner's file the banned words were never studied, so they don't come over at all.
- **The result:** new words, words already there, cards keeping Skritter's schedule with how many reviews, words suspended, cards left alone; then the words left out, by their characters.

## Schedules

- **Every graded answer is copied as a review** (`fromSkritter: true`), with the grade as given. Skritter keeps one time a session, so the answers are spread over it at an even pace, by the time actually spent (`time`) where the session stayed open longer (one lasted three days); `duration` is that pace.
- **One more record holds Skritter's schedule** (`importedSchedule`, as for Anki; `replay` in `src/scheduler.js` goes on from it): due at Skritter's `next`, with its stability and difficulty (difficulty kept within 1 to 10); without Skritter's memory (no stability), the interval as stability and difficulty 5. State "review" (Skritter has no learning steps), `reps` its review count, `lapses` reviews less successes. Dated a millisecond after the later of Skritter's `last` and the last copied answer.
- **A card in the script it was studied in:** `simp` gives the simplified writing card (`cardIdFor`), `trad` the traditional one, `both` the learner's script. A writing card studied only in the other script is learned again when wanted, as after a change of script.
- **Several sources for one card** (a word two Skritter words may be): the item with the most answers counts.
- **A word with cards from Skritter gets `importedAt`**, so its cards without history (usually none) come a few a day, as for Anki.
- **Importing again changes nothing studied:** a card already here is left as it is. Review IDs are made from the session's start and the answer's place in it, `skritter-<start ms>-<place>-<word ID>`, the schedule's `skritter-<item ID without the account>-<word ID>-schedule`, so the same file imported on two devices gives the same reviews when combined.
- **Speed:** the owner's file reads in about 0.7 s and imports in about 10 s in the test browser on the laptop, most of it saving 186,000 reviews; the turning sign shows meanwhile (`showWorking`, as the Anki pop-up).

## Names in the code

- `src/skritterImport.js` (plain calculation, `tests/skritterImport.test.js`): `readSkritterExport(bytes)` (with `filesInZip` and `unpack` from `src/ankiFile.js`), `candidatesFor`, `describeSkritter(data, context)` → `{ words: [{ vocabId, characters, styles, reviews, candidates }], cards, reviews }`, `planSkritterImport(data, description, choices, context)` → `{ words, decks, reviews, cards, report }`, saved by `saveImport` in `src/db.js`.
- `src/skritterImportForm.js`: the pop-up.
- **Tests:** `tests/fixtures/skritter/export.zip`, a made-up export in Skritter's shape (made by `make-fixture.js`, see its README); `tests/browser/skritter.browser.js` imports it in the real app.

## Not built

- **The words left out:** zhuyin symbols and radicals could become the app's radicals (`<traditional>|radical`) where the ready-made list has them, and phrases its sentences, if their meaning came from somewhere (the file has none).
- **The starting level** in the introduction doesn't offer Skritter.
- Skritter's own lists by name (the file names them `list7`), its mnemonics, sentences (`UserSentence`, empty in the owner's file) and settings.
- **Not yet tried by the owner** in the app.
