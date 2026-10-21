# Importing from Anki

Roadmap item 5, built on 2026-10-19, for learners moving from Anki. Decided with the owner that day, from Claude's proposals: the libraries, keeping schedules exactly, the learner confirming the guesses, writing left to the learner, tone cards following pinyin, the most-reviewed source winning, and `.colpkg` accepted too.

## What it does

- **Where:** on the Decks tab's front page the button beside the heading reads "+ New / import deck", and its panel has "Import a deck from Anki" under the name box (`anki-import-button`, which closes that panel; the owner, 2026-10-19). The introduction's starting level offers "A deck from Anki" too, which ends in Decks with the import open. On a deck's page the button is "+ New deck" and the link is hidden, since the import makes decks of its own. It opens a pop-up (`anki-dialog`) in three steps: choose a file; check the guesses; what was brought over.
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
- **Tests:** `tests/fixtures/anki/` holds a small collection made by Anki itself in four exports, with the script that makes them (`make-fixtures.py`, needs `pip install anki`); `tests/browser/anki.browser.js` imports in the real app. For trying it by hand on real decks: four shared decks from GitHub in the git-ignored `local/anki-decks/downloads/`, and `scripts/anki-study-data.py`, which gives them the made-up histories of three learners in Anki (SM-2 and FSRS, leeches, Forget, Set due date, a filtered deck, a lapsed backlog, an export in the middle of a session) and exports them in every format to `local/anki-decks/study-data/` (`local/README.md`).

## Planned: real shared decks (2026-10-21)

Tried on four real shared decks and their made-up study histories (`local/anki-decks/`, `local/README.md`), the import fails on most notes of three of them. Planned with the owner on 2026-10-21; **two milestones**, the first in progress. Each step is checked with `node scripts/check-anki-import.js` (what the import makes of a file with the default choices) on the four downloads and five study-data files, before and after.

**What goes wrong** (measured that day):

| Deck | Fails | Cause |
|---|---|---|
| Anki-xiehanzi HSK 2012 (download) | 2,892 of 4,995, "The meaning is missing" | Its text is in Unicode's decomposed form ("a" + a separate accent: 4,993 notes), so "ài" isn't read as pinyin; and the pinyin check takes "HSK 1" and "Top 500" for pinyin (`tidyPinyin` gives "HSK1"), so the HskLevel field becomes the pinyin, no dictionary entry matches, and no meaning is filled in. The same deck once Anki has saved it (composed form) fails on 9. |
| hanzi_3000 | 2,191 of 3,184 | `guessRoles` scores a field by the share of its *filled* notes that fit: Examples Pinyin (178 of 178 filled) beats Pinyin (194 of 200). |
| Kangxi radicals (Anki-xiehanzi) | 414 of 428 | The same: Simplified (15 of 15 filled, and its name) beats Radical (200 of 200). |
| All | meanings | Headings of the deck's layout come along: "Common Meaning; to love". |
| Mei's study data | 14 s (simplified) to 28 s (traditional) in Node | 12 of 12.5 s in `replay`/`gradeOptions` (`src/scheduler.js`): every review works out all four grades and turns each into plain data (`toPlainData`, a JSON round trip, 9 s alone), and `planAnkiImport` replays each card's whole history twice (in `importedSchedule` and again for the card record, whose result is the imported schedule anyway). |

**Milestone 1: reading real decks** (in this order; the owner, 2026-10-21):

1. **Done: composed form.** `cleanField` normalizes to NFC (`.normalize('NFC')`, last, so that `&#…;` codes are covered too), as Anki does when it saves a note. The HSK 2012 download alone went from 2,892 notes that could not be used to 9.
2. **Pinyin only if every syllable is Mandarin:** a plain list of the ~410 syllables of standard Mandarin in a small file of its own (facts, no license; no dependency), used by `isPinyin` in `src/ankiImport.js` so that "HSK 1", "Top 500" and Vietnamese "nhất" aren't pinyin. Check `tidyPinyin`'s other callers before changing it rather than `isPinyin`.
3. **Field guessing** (`guessRoles`): count a field by how many of *all* sampled notes fit (with the share of filled notes still required to be at least half), and give a field named exactly Pinyin, Meaning, Hanzi (and the like) more than one whose name only contains the word. Worked out on paper: score = (fit / filled + fit / sampled) / 2, name contains a hint +0.2, name is exactly a hint +0.3 (empty field: as now). It picks Pinyin over Examples Pinyin (1.27 to 1.15), Radical over Simplified (1.0 to 0.79), and SimpleMeaning over PartOfSpeech (1.10 to 0.97); check on all nine files and the fixtures that no right guess turns wrong.
4. **Headings dropped:** a line that is in more than half a field's notes is the deck's layout ("Common Meaning", "Radical"), not content; left out of that field's text, in the import and in the pop-up's "First note:" line.
5. **Radicals as the app's radicals** (the owner chose this over leaving them out or bringing them in as words, 2026-10-21: "the most complete"). A note whose characters are one of the app's radicals (`src/radicals.js`, `docs/word-lists.md`, "Radicals") becomes that item, not a word: the word itself where the radical is a word of the lists (水), else the `kind: 'radical'` record (`<traditional>|radical`, the list's meaning, meaning and writing cards only, `RADICAL_CARD_TYPES`). Its Anki reviews go to the meaning card; a pinyin choice for it is ignored. To decide in the building: whether the radical list is loaded for the import (it is a ready-made list file), and whether such notes go into the Anki deck only or also the ready-made Radicals deck (likely only the Anki deck, as for words). The Kangxi deck's Write cards (front: the meaning, back: the radical, drawn in Anki) could be offered for Writing as for words (`couldBeWriting`).
6. **Tests and docs:** unit tests in `tests/ankiImport.test.js` with small made-up notes in each of these shapes (never the decks themselves: their licenses); `npm test`, then `tests/browser/anki.browser.js` in the background; this section rewritten as what is true.

**Milestone 2: speed** (separate, since `replay` is used by studying and combining backups): `planAnkiImport` takes the card record's schedule from the imported-schedule record instead of replaying again; `replay` works out only the grade given (ts-fsrs `next`) and turns the state into plain data once at the end. Before switching, check that the old and new `replay` give identical results on all of Mei's 51,178 copied reviews and on the tests. Aim: under 3 s for Mei's file.

## Not built

- Audio and pictures from the notes; tags; sentences or cloze notes as sentences.
- Anki's own scheduling settings (retention, FSRS parameters): the app's defaults take over after the first review.
- An export to Anki (`docs/history.md`, "Nice to have").
- A very large collection is read whole into memory; with media in it, exporting without media keeps it small.
- **Not yet tried by the owner** on a real Anki export of their own.
