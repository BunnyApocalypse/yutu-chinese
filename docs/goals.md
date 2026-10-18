# Long-term goals, testers and the Skritter import

## Long-term goals

Agreed with the owner on 2026-10-13.

- **Who it is for:** the owner first, and any learner who wants it ("If I am putting the effort into this, why not share it?"). Wording, defaults and help text should work for a stranger.
- **Nobody's data is ever held by us.** The owner does not want to run a sync server or touch anyone's data, unless that becomes necessary. Everything stays on the device.
- **Sync without a server:** first combining backups by hand (built, `docs/merging.md`); as a very long-term goal, syncing through storage the learner already has (Google Drive, Proton Drive, iCloud, OneDrive). Both are the same merge with a different way of moving the file.
- **Better than Skritter where Anki is:** decks and sub-decks, managing cards, flagging leeches, a choice of scheduling (retention, parameters), and everything portable. Leeches can be exported as a list, and as a prompt for an AI to make mnemonics from.
- **A word can be in several decks and has one schedule.**
- **Sentences and audio:** hearing the word and sentence cards are core; listening cards and audio for sentences are nice to have.
- **The hard constraints are open to change** (vanilla JavaScript, no framework, few dependencies) if a change makes the app easier to grow or contribute to. Nothing planned needs one yet; each change is still asked for first.
- **What this means for the data model:** a removed word or card must leave a mark, or a merge brings it back; records carry the time they were last changed; a corrected word's old ID is remembered; a card's schedule can be recomputed from its reviews, which also serves changed scheduling, leeches and statistics.
- **Sharing raises the bar on licensing.** The TOCFL list has no stated license (`docs/word-lists.md`; roadmap item 8).

## Sharing the app

- **The site is where everyone's data lives.** Browsers keep data per site (`bunnyapocalypse.github.io`), not per folder: a renamed repository keeps it (except perhaps an app on an iPhone's home screen, which has storage of its own); **a new domain would leave every user with an empty app** unless they export first.
- **A stable and a test copy** (`docs/offline.md`); the app says its version (Settings, Help; from `package.json`, the latest change's name and date, `src/errors.js`), and anything uncaught brings up a red line with "Details" to copy into a report (`watchForErrors`).
- **"Credits and licenses"** under Help (`credits-dialog` in `index.html`): every source of data or code has a line there.
- **GitHub Pages' limits** (1 GB a site, a soft 100 GB of traffic a month) are the thing to watch; the two copies come to about 565 MB.
- **The name 玉兔中文** was chosen on 2026-10-15 after checking for clashes: nothing called 玉兔中文, 玉兔華語, "Yutu Chinese" or "Jade Rabbit Chinese" was found. 中文 rather than 華語 because it is written the same in both scripts. The repository moved to `BunnyApocalypse/yutu-chinese`, the old address forwarding (`docs/offline.md`, "The old address").
- **Feedback:** the email alias yutufeedback.delicious577@passmail.com and the repository's issue tracker, both under "Send feedback" (`docs/interface.md`). `docs/alpha/` has what was given to testers.
- **Not deciding now:** scheduling settings (cards can be rebuilt from reviews) and the database's layout (versioned, with upgrade code).

## Skritter import (future)

The owner wants to bring their Skritter data across eventually, but not the word list without its scheduling (the GDPR request of 2026-10-12 hasn't been answered). Keep it in mind when the data model changes: words as well as single characters, both scripts, per-item review history and scheduling state. Look at a real export first. Personal exports go in the git-ignored `exports/`.

## Translations and other languages (future)

Discussed with the owner on 2026-10-15. Nothing built yet.

- **Why:** many early users will be native German speakers, and learners worldwide in general.
- **What:** **translate the interface, and use a dictionary in the learner's language where a license-compatible one exists.** The learning notes and example sentences stay in English (the owner doesn't want to generate them again). Where no good dictionary exists, the interface alone is still worth translating.
- **Which and when:** German first, other major languages later; a long-term goal, after the first release (roadmap, "Nice to have").
- **Four layers, very different in cost:**
  1. **The interface:** text is written straight into `index.html` and the JS files (about 165 places), not gathered anywhere. Doable without a dependency: one file of strings per language (`en.js`, `de.js`), a small `t('key')` lookup, a `data-text` attribute on static HTML filled in at start-up, `Intl` for plurals, dates and numbers, and the page's `lang` following the language (the Chinese `lang` marking unchanged). The lasting cost: every new button or message in every language; a test can catch missing keys but not write them.
  2. **Dictionary meanings:** CC-CEDICT is English only; another language needs another dictionary. German (HanDeDict) and French (CFDICT) exist under CC BY-SA in the same format; most others have none, a smaller one, or no clear license.
  3. **Learning notes** (`data/notes/`, about 320,000 words): a content project, needing a speaker of the language to check; English notes with a translated interface is a middle step.
  4. **Smaller data:** TOCFL topic names, radical meanings, group names.
- **To settle when built:** HanDeDict's license and quality (believed CC BY-SA, unmaintained for years; its own folder and README); a word's meaning is copied in when added, so whether switching language offers to change existing words; each language's short words left out of search by meaning (German "der", "die", "das", "sich"); a missing string falls back to English, with a test listing what's missing; the language chosen in Settings from the browser's language, and whether it is a device setting.
