# Importing from Anki

Roadmap item 5, built on 2026-10-19, for learners moving from Anki. Decided with the owner that day, from Claude's proposals: the libraries, keeping schedules exactly, the learner confirming the guesses, writing left to the learner, tone cards following pinyin, the most-reviewed source winning, and `.colpkg` accepted too.

## What it does

- **Where:** on the Decks tab's front page the button beside the heading reads "+ New / import deck", and its panel has "Coming from Anki? Import a deck from Anki" under the name box (`anki-import-button`, which closes that panel; the owner, 2026-10-19). On a deck's page the button is "+ New deck" and the link is hidden, since the import makes decks of its own. It opens a pop-up (`anki-dialog`) in three steps: choose a file; check the guesses; what was brought over.
- **Files:** a deck export (`.apkg`) or a whole collection (`.colpkg`), from any Anki version: `collection.anki21b` (current Anki, zstd-compressed, schema 18), `collection.anki21` ("support older Anki versions" ticked, schema 11) or `collection.anki2` (Anki 2.0; a current Anki puts a stand-in there too, so it is read last). Audio and pictures are not read.
- **Decks to bring:** a checkbox per Anki deck that has cards. Anki's decks become the app's, nested as in Anki ("Chinese::HSK 1" is HSK 1 inside Chinese); a deck with the same name in the same place is reused, so a second import makes no new decks. Ready-made decks are never used.
- **Which field is which**, per note type: three lists (Characters, Pinyin, Meaning), each field shown with the first note's text, and "First note: 你好 nǐhǎo · hello" updated as they change (`guessRoles`: the share of a field's notes that look like characters, pinyin or English; the field's name decides between alike ones). A note type without a field of characters is left out. Where there is no pinyin field and the meaning's first line is pinyin (Anki's Basic with "lǎoshī<br>teacher" on the back), that line is the pinyin.
- **What each card counts for**, per template: checkboxes Meaning, Pinyin, Tone, Writing (`guessCardTypes`). Characters on the front → Meaning, and Pinyin if the reading is only on the back. Meaning on the front and characters on the back → nothing ticked, with "Anki can't check handwriting. Tick Writing only if you wrote the characters out…" (the owner: let the learner choose). Audio on the front, or a cloze → nothing.
- **Notes become words** through the dictionary (`wordFromNote`): the reading the note gives picks the dictionary entry (tone marks with or without spaces, numbers; `readsAs` in `src/dictionary.js`), which gives the other script's form, the Taiwan reading, and a meaning where the note has none; a note without pinyin takes the usual reading (`likeliestEntry`). Then `checkWord`, as for a typed word. Notes that fail are listed afterwards with the reason, as the list import does.
- **The result:** new words, words already there put in the decks, cards that keep their schedule with how many reviews, words waiting in Learn, cards left alone, notes that were the same word as another, notes that could not be used.

## Schedules

- **Exact due dates** (the owner, 2026-10-19). For each card brought over, every review in Anki's log is copied as a review here (`fromAnki: true`, `grade` = Anki's button, `duration` = how long the answer took in ms), and one more record holds the schedule Anki gave the card: `importedSchedule: { fsrsState, due }` in place of a grade, dated a millisecond after its last Anki review. `replay` in `src/scheduler.js` goes on from that record, so the card is due when Anki said and the app's FSRS takes over at its next review, while rebuilding from reviews and combining backups still give the same card.
- **The FSRS state** in that record: the one the copied reviews give, with Anki's due date, interval, `reps`, `lapses` and state; stability and difficulty are Anki's own where Anki used FSRS (`{"s":…,"d":…}` in the card's `data`), otherwise those worked out from the reviews (as Anki does when someone switches to FSRS). A card without a log gets the interval as stability and difficulty 5.
- **Which reviews count:** those after the last "Forget" (a manual log entry with no interval), without manual changes of due date or anything ungraded. A card new in Anki brings nothing; a word whose cards are all new waits in Learn, in Anki's order of new cards.
- **One source per card** (the owner): where two templates feed one kind, or two notes are the same word, the Anki card with the most reviews counts; `report.sameWord` counts such notes.
- **Tone cards follow the pinyin card** (the owner): where no template is ticked for Tone and the word can have a tone card (a syllable per character), the pinyin card's reviews and schedule are copied to it.
- **Suspended in Anki** (queue −1) stays suspended here (the word's `suspended`).
- **Cards without history** (usually writing, and any kind no template was ticked for) come in Review a few a day: a word with cards from Anki has `importedAt`, and its missing cards join the queue of cards learned again after a change of script (`toLearnAgain` in `planSession`), limited by new words per day, with the lesson; the counts say "· 3 more new today" (`fromAnki`).
- **Importing again** changes nothing studied: a card already here is left as it is (`report.alreadyStudied`), and copied reviews are named after Anki's (`anki-<Anki's review ID>-<type>`, the schedule `anki-<Anki's card ID>-<type>-schedule`), the one exception to random review IDs, so the same file imported on two devices gives the same reviews when combined.

## Names in the code

- `src/ankiFile.js`: `filesInZip`, `unpack` (the browser's `DecompressionStream`), `openAnkiFile(bytes, SQL)`, `readCollection(db)` (both schemas into one shape). Anki's tables are kept in its own text order, "unicase", which sql.js can't be taught; the copy in memory is told it is SQLite's NOCASE and opened again.
- `src/ankiImport.js` (plain calculation, `tests/ankiImport.test.js`): `cleanField`, `fieldsInTemplate`, `guessRoles`, `guessCardTypes`, `describeCollection`, `defaultChoices`, `wordFromNote`, `planAnkiImport` → `{ words, decks, reviews, cards, report }`.
- `src/ankiImportForm.js`: the pop-up; `saveImport` in `src/db.js` saves it all in one transaction.
- **Libraries** (the owner's approval, 2026-10-19): `sql.js` (SQLite compiled to WebAssembly, MIT; fetched only when a file is read: a 40 KB script and a 685 KB `.wasm`, kept offline across versions with the dictionary, `scripts/build-offline.js`) and `fzstd` (zstd, MIT, 24 KB). Credits in `credits-dialog`.
- **Tests:** `tests/fixtures/anki/` holds a small collection made by Anki itself in four exports, with the script that makes them (`make-fixtures.py`, needs `pip install anki`); `tests/browser/anki.browser.js` imports in the real app.

## Not built

- Audio and pictures from the notes; tags; sentences or cloze notes as sentences.
- Anki's own scheduling settings (retention, FSRS parameters): the app's defaults take over after the first review.
- An export to Anki (`docs/history.md`, "Nice to have").
- A very large collection is read whole into memory; with media in it, exporting without media keeps it small.
- **Not yet tried by the owner** on a real Anki export of their own.
