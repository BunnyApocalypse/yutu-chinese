# Merging and backups

Moved word for word from CLAUDE.md on 2026-10-15; see `docs/README.md` for where each former section is now.

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
