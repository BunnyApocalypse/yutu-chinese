# Long-term goals, testers and the Skritter import

Moved word for word from CLAUDE.md on 2026-10-15; see `docs/README.md` for where each former section is now.

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

## Before other people use it

A review by Claude on 2026-10-13 of what having testers changes; the decisions are the owner's and were open when this was written. `docs/alpha/` has what to give testers and how to run a first round.

- **The address is where everyone's data lives.** Words and progress are kept by the browser under the address the app was opened at. Moving the app later (a domain of its own, a renamed repository) leaves every tester with an empty app unless they export first. Decide the address before the first tester.
- **Done on 2026-10-13: a stable copy and a test copy** (see "Offline use and deployment").
- **Done on 2026-10-13: the app says which version it is** (Settings, Help; number from `package.json`, the latest change's short name and date; `src/errors.js`), **and shows errors**: anything nothing else caught brings up a red line at the bottom with "Details", a panel with the version, browser and what failed, to copy into a report (`watchForErrors`). Still missing: a list of what changed between versions.
- **Done on 2026-10-13: the IDs of the group decks no longer hold the groups' names** (see "Ready-made word lists").
- **Done on 2026-10-13: "Credits and licenses"** under "Help, feedback and licenses" in Settings (`credits-dialog` in `index.html`). **A new source of data or code has to be added there** as well as getting its README.
- **The TOCFL list has no stated license.** The owner takes that risk for the testers' round (2026-10-13) and wants it **considered again before the app goes to a larger audience**.
- **The address and the name stay as they are for now** (the owner, 2026-10-14): testers use https://bunnyapocalypse.github.io/hanzi-trainer/, and their data is tied to it. GitHub Pages' limits (1 GB per published site, a soft 100 GB of traffic a month) are the thing to watch; the two copies come to about 565 MB.
- **The app needs a new name before any new users** (the owner, 2026-10-15): there are many other "hanzi-trainer" projects. A renamed repository moves the address, so existing testers would have to export and import their data; names kept per site (database, caches, `localStorage`) are worth checking at the same time.
- **Feedback** (2026-10-14): the email alias hanzifeedback.veggie892@passmail.com and the repository's issue tracker. Both are in `docs/alpha/` and under Help in Settings.
- **Reconsider refactoring the code once the testers' round is over** (the owner, 2026-10-13); see the note on the code below.
- **What does not need deciding now:** scheduling settings (cards can be rebuilt from reviews), looks, and the database's layout, which has version numbers and upgrade code already.
- **The code** (asked about by the owner the same day): works and is tested, but `src/wordsPanel.js` (about 1,400 lines) now serves two tabs, three forms and a pop-up panel; some names are behind the times (the mode `'words'` is the Decks tab, `practice-tab` is no longer a tab, `edit-cards` is on the word's page); most browser tests read the word list while it is out of view; and colors and sizes are written out all over `src/style.css`. Claude's advice: leave it until the testers' feedback has settled the structure, then split `wordsPanel.js` by what the screen shows and rename, in one go with the pass over the looks.

## Skritter import (future)

The owner wants to bring their Skritter data across eventually rather than start from scratch. Don't build it early, but keep it in mind whenever the data model is designed: it should hold words as well as single characters, both scripts, and per-item review history and scheduling state. Look at a real Skritter export before finalising the IndexedDB schema. Personal exports go in `exports/`, which is git-ignored.

## Translations and other languages (future)

Discussed with the owner on 2026-10-15. Nothing built yet.

- **Why** (the owner, 2026-10-15): the first batch of users will largely be native German speakers, and accessibility to learners worldwide in general.
- **What** (the owner, 2026-10-15): **translate the interface, and use a dictionary in the learner's language where a license-compatible one exists.** The learning notes and example sentences stay in English; the owner does not want to generate them again. Where no good dictionary exists, the interface alone is still worth translating, with English meanings.
- **Which languages:** German first, other major languages later.
- **When** (the owner, 2026-10-15): a long-term goal, not urgent. German comes after the testers' round, so that round is in English.

- **Four layers, very different in cost:**
  1. **The interface** (buttons, Settings, tips, introduction, errors): written straight into `index.html` and the JS files (about 165 places set text in code), not gathered anywhere. Doable without a dependency: one file of strings per language (`en.js`, `de.js`, …), a small `t('key')` lookup, a `data-text` attribute on static HTML filled in at start-up, the browser's own `Intl` for plurals, dates and numbers, and the page's `lang` following the language (the Chinese `lang` marking is unchanged). The lasting cost: every new button or message has to be written in every language; a test can catch missing keys but not write them. The docs name things by their English labels, which stays fine as long as English is the reference language.
  2. **Dictionary meanings:** CC-CEDICT (`data/cedict/`, about 124,000 entries) is English only. Another language needs another dictionary, not a translation. German (HanDeDict) and French (CFDICT) exist under CC BY-SA in the same format; most other languages have none, a much smaller one, or one without a clear license, to check one by one. Search by meaning (`lookUpByMeaning`) leaves out English words ("to", "a", "the"), so each language needs its own such list.
  3. **Learning notes and example sentences** (`data/notes/`, about 6,000 lines, 320,000 words of English): a content project. Claude can draft, but someone who speaks the language has to check it, as with the Taiwan notes. A middle step: a translated interface with English notes, notes translated level by level (HSK 1 and 2 first).
  4. **Smaller data:** TOCFL topic names, radical meanings, the lists' group names.
- **Claude's advice, before the owner's answers:** nothing now (it is a feature, and the interface's wording keeps changing until the pass over the looks); gather all interface text into one English strings file during the refactor after the testers' round, then add languages.
- **Things to settle when it is built:**
  - **HanDeDict's license and state** must be checked before use (believed CC BY-SA, edited by volunteers and not updated for years; quality, size and readings against CC-CEDICT to be compared). It goes in its own folder with its README, and in "Credits and licenses".
  - **A word's meaning is copied into the word when it is added**, so the dictionary language decides the meaning of words added from then on. Words already added keep theirs; whether switching language offers to change them is to be decided.
  - **Search by meaning** needs each language's own short words left out (German "der", "die", "das", "sich", …), and perhaps English meanings searched as well.
  - **Fallback:** a string missing in a language shows the English one, and a test lists what is missing.
  - **The language is chosen in Settings**, starting from the browser's language; whether it belongs to the device (`DEVICE_SETTINGS`) is to be decided.
