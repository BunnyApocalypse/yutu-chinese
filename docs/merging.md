# Merging and backups

## What the database keeps for merging

Built on 2026-10-13, so that two devices' data can be combined.

- **`changedAt` on words, settings and decks**, filled in by `putAll` in `src/db.js` (and `renameWord`), never by callers. A change the app makes by itself to old records passes `{ stamp: false }`, so it doesn't look newer than a change made on another device.
- **A record read from the database has `changedAt`; one about to be saved does not.** Compare field by field without it (as "Edit word" in `src/review.js` does), and compare lists such as `decks` by content.
- **A removed word leaves a mark** in `removed` (`{ id, removedAt }`), which stays when a word with that ID is saved again. A word or deck exists if it is in its store; the mark only matters when combining.
- **A corrected word remembers its old IDs** in `formerIds` (`withFormerId` in `src/words.js`). The pop-up panel builds the word from its form, so fields not in the form are carried over by hand (CLAUDE.md lists them).
- **A card's schedule can be rebuilt from its reviews** (`replay` in `src/scheduler.js`). A test checks it gives exactly the saved state, which relies on ts-fsrs varying intervals the same way for the same review, and on a review's `time` being the time handed to `gradeOptions`.
- **Decks:** a `decks` store (`{ id, name, parentId, order }`) and a `decks` list on each word; ready-made decks have fixed IDs (`readyMadeDeck`). `READY_MADE_LISTS` in `src/decks.js` repeats the lists' levels; a test checks it against the files.
- **A tab running an older version blocks an upgrade.** The app closes its connection when a newer version asks (`onversionchange`), and a newer one kept waiting says to close the other tab (`onblocked`).
- **Backup format 2** adds `removed` and `decks`; version 1 files are still read.
- **The database is at version 4** (2026-11-07): the stores `outbox` and `sync`, which belong to the device and are never in a backup (`docs/sync.md`). The backup format doesn't change.

## Combining backups

Built on 2026-10-13 to a plan the owner agreed to; the same calculation a later sync through the learner's own storage would use. **The owner hasn't tried it between real devices**, and nobody has seen the panel on a phone.

- **Where:** "Import backup" in Settings. A panel (`import-dialog`) says in counts what the backup holds, what the device holds and what combining would bring, and offers "Combine with this device", "Replace everything on this device" (asked once more) and Cancel. Combine is off when it would change nothing.
- **The work is done on a second thread** (`src/importWorker.js`, a Web Worker, 2026-11-08; the owner's request after measuring): reading and checking the file, working out what combining would bring, the copy saved before combining, combining and saving. The page (`askImportWorker` in `src/main.js`) only shows "Reading the backup…" (`import.reading`, in the `export-done` line, with Import turned off, and in a pill over the top bar, `import-pill`, so it is seen on any screen while the page is used meanwhile; the owner, 2026-11-08, reusing the streak pill's look), then the panel (over whatever screen is up) and the count of records saved. Measured on the owner's backup at tablet speed before the change: choosing the file held the page up for up to 8 s on an empty device and 14 s on one with data, Combine for up to 11 s; after, at most 0.2 s anywhere (reading about 24 s, or 35 s with data on the device; the saving takes as long as before: it is the browser's own database writing, `docs/sync.md`, "Speed"). A file that can't be used is told in the learner's language: `checkBackup`'s errors carry `textKey` and `values`, which the page puts into words (the worker doesn't know the language chosen in Settings). Sync's outbox is on in the worker only if the page says so (`isOutboxOn`). Tested in `tests/browser/merge.browser.js` (the panel's counts, a file that can't be used, the copy before combining).
- **A backup of the device is downloaded before combining** (the owner), `...-before-combining.json`, since combining can't be undone. Not before replacing.
- **Saving the backup, combined or replacing, goes in parts** (`replaceEverything` in `src/db.js`, 2026-10-23): the stores are emptied and the settings saved together, then the rest 2,000 records a transaction (`RECORDS_AT_A_TIME`). In one transaction, a 45 MB backup (181,000 reviews from Skritter) froze the owner's tablet in Firefox on Android and never finished. The panel turns its buttons off and Esc does nothing while it saves, and `import-note` counts the records ("Saving: 45,000 of 192,680 records").
- **An import cut off halfway is not all-or-nothing any more:** the setting `importUnfinished` (`IMPORT_UNFINISHED`, a device setting) is saved first and removed last. While it is there, the app says when it starts that the last import did not finish and to import again. Until then the device holds only part of the backup (its settings are all there, being saved first).
- **`mergeBackups(mine, theirs)` in `src/merge.js`** gives the combined contents and a summary; the import's worker writes them with `replaceEverything`, and the page reloads. The rules (at the top of the file):
  - Reviews: all of both sides; of two copies of one review (a grade corrected while looking back, `correctedAt`), the one corrected later.
  - Words, decks, settings: the record saved later (`changedAt`), whole; this device's if neither is later. A word's earliest `learnedAt` is kept whichever wins, with that side's `learnDuration`; `startedOverAt` keeps the later time.
  - A removal counts unless the record was saved after it. All marks are kept.
  - A word corrected on one device (`formerIds`) replaces the record under the old ID on the other, whose cards and reviews move to the new ID. If the correcting device also has a word under the old ID, that is a word of its own.
  - Device settings are never taken from the backup (`DEVICE_SETTINGS`; the list in `src/merge.js` is the one to trust).
- **Cards are worked out from the reviews** (`replay`), except where one side already has every review of a word's cards of one kind: its cards are kept as stored. So combining never changes a schedule only one device contributed to.
- **A card goes on from a side's stored card** where that side has its reviews up to the card's `lastReviewedAt` (and none that no longer count) and all the others are later: only those are replayed (`startingPoint`, 2026-11-07, for syncing; the same result, much quicker).
- **A review's card** is found by its word, kind and `script`, not its `cardId` (old reviews may carry a plain ID of a card since moved).
- **A word removed and added again starts from scratch**: reviews before the removal mark don't count, on either side.
- **Limits, accepted with the owner:** the later save wins whole (a meaning changed on one device and a deck on the other: one is lost); "later" trusts each device's clock; making two devices equal takes two rounds.
- **Tests:** `tests/merge.test.js` (same result from either device, nothing new the second time, a case per rule) and `tests/browser/merge.browser.js` (hands a file to the hidden input, `chooseBackup`).
