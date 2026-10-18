# History: handover, roadmap and testing sessions

The latest handover, the roadmap, and what the testing sessions taught. Trimmed on 2026-10-18 to what is still open or still guides the work; how each thing was built is in its area's file, and the session-by-session notes up to then are in git (`git show 87ed508:docs/history.md`).

## Where the work stands

**Handover from the fourth session of 2026-10-18.** Replace this with each session's handover; keep only what the next session needs.

- **Everything released to test and stable** (the owner's word), both suites passing (187 unit tests, 309 browser tests). Roadmap items 1 and 10 done. **Next: item 2**, easy to try without studying it first.
- **To know:**
  - Every release needs its entry at the top of `src/changes.js` (CLAUDE.md, "Deploying").
  - Pictures for a decision are made with small scripts using the browser tests' harness (`startApp`, `startBrowsers`, `Page.captureScreenshot`), in the session's scratchpad or `local/`, and deleted once the point is built. The owner chooses from pictures side by side; always give the picture's path.
  - Rename by pattern only at exact places, then compare strings and comments with the original (a rename once changed text in messages too).
  - Can be deleted: `local/shoot-about.js`, `local/about-pictures/`, `local/ux-atlas-draft/`.

## Roadmap

Agreed with the owner on 2026-10-18. **The first release** means the first users beyond testers: a small group of learners and an online language-learning community, without advertising. They are strangers trying the app on their own, so it is about first impressions and keeping their data safe. **Changes to the layout come before it** (the owner: no big UX changes once there are real users, if it can be avoided). Each item is planned with the owner before it is built.

**Before the first release**, roughly in this order:

1. **Done on 2026-10-18:** "too many buttons" and the busy Learn screen (`docs/cards.md`, `docs/interface.md`). Clear, Show outline and Animate while writing stay (the owner: three is within the tester's rule).
2. **Easy to try without studying it first** (tester 2's main point): someone arriving from a link should be writing a character within a minute.
3. **Streaks.** Must be possible to turn off. To settle: what counts as a day studied and when it ends (local midnight, or later as in Anki); whether a day of Learn alone counts (nothing in Learn is saved, `docs/cards.md`); whether a missed day breaks it; reminders, which only the device itself could send (no server; browsers' support for a reminder while the app is closed is limited, to check per browser and for an installed app); where it shows.
4. **Recording how long each review takes**, so a later progress tab has real data. As in Anki, a review counts at most a set time (60 seconds). Old reviews just lack the field; the store layout needn't change.
5. **Importing an Anki deck (.apkg)**, for learners moving from Anki. The file is a zip holding an SQLite database (newer ones compressed with zstd), so it needs libraries: dependencies to ask about. To settle: what to do with the writing cards (Anki has no writing check: start new, take Anki's history as a hint, or let the learner choose; the owner's open question); which of a note's fields hold characters, pinyin and meaning (every deck differs); whether meaning and pinyin cards take over Anki's scheduling.
6. **The finished 兔 logo** from a calligrapher, in place of the drawn one (`scripts/icon.html`). Takes an artist's time, so start early; its license must allow its use in the app.
7. **Data safety, seen by a stranger:** that everything stays on their device, why backups matter, Safari clearing a site not opened for 7 days.
8. **The TOCFL list's license** (none stated): permission asked, the list hidden until then, or the risk taken knowingly.
9. **The owner trying what was built but not yet tried:** sentences (adding one, the reading card, the gap on the writing card, a whole sentence on a phone); combining backups between two real devices (and whether the `...-before-combining.json` file lands in downloads); leeches (the two settings, the note in Review, the lists, both exports); sound (nobody has listened yet: the recordings at their smallest size, words put together from syllables, the devices' own voices); the app installed on the phone and tablet.
10. **Done on 2026-10-18:** "What's new" after an update and "Send feedback" in the menu (`docs/interface.md`).

**Near-term:**

- **A progress tab, inspired by Anki's** (the owner, 2026-10-18): time spent studying, streaks, words learned and so on.
- "Show more" past a list's first 200 words (`MAX_ROWS`); today the rest are reached only by searching. Raised with the owner, not decided.
- A setting for target retention.
- **A mascot**, mainly for the streaks screen (the owner, 2026-10-18; likely November 2026): a bunny, commissioned from an artist, happy or sad with the streak.

**Nice to have:**

- Checking by hand with VoiceOver or TalkBack (`docs/interface.md`, "Accessibility").
- A German interface, then other languages (`docs/goals.md`, "Translations").
- The Skritter import, if the GDPR data arrives (the owner doesn't want the word list imported without its scheduling).
- A mode for going from 繁體 to 簡體 or back, by character rather than by word (having written 們 → 们 once, the learner isn't asked again in 他們, 你們).
- Mainland, Hong Kong or Taiwan traditional forms (needs stroke data for the other two); zhuyin; longer shortcuts (more strokes joined, reordered or dropped); syncing through storage the learner already has (`docs/goals.md`).
- Stroke data for the traditional characters animCJK doesn't cover.
- Listening cards and ready-made sentences (the last step of "sentences and audio"); eSpeak NG or a small neural voice in the browser (raised, not looked into).
- The TBCL list, and the 79 TOCFL entries left out (`docs/word-lists.md`).
- Proposing a shorter meaning for single characters, in place of cutting long ones short.
- An export to an Anki deck file (needs a library); strokes whose width follows the pen's pressure (the owner's idea).

**Decided against** (so they aren't proposed again):

- **Anki sync** (the owner, 2026-10-15): syncing through AnkiWeb is against its terms and would need a server; the self-hosted server and AnkiConnect are a poor fit, since Anki has no writing check.
- **A handwriting-style font (楷体)** for the characters being learned (the owner, 2026-10-17): the gap between printed and handwritten shapes "represents the realities of handwriting vs computer fonts in the sinosphere"; the writing area teaches the written shapes, the rest stays in the device's font.
- **Separating a word's facts from what to do to its cards** in its panel (tester 2's idea): the owner often wants both at once, as with a leech.
- Someone who skips the introduction starts with no words: left as it is (2026-10-16).

## The testing sessions

Notes and transcripts are in the git-ignored `local/testing/`. Every point raised was built, settled or dropped by 2026-10-18; what is still open is in the roadmap.

- **2026-10-14, tester 1:** an absolute beginner, simplified, an Anki user, Android phone in Chrome. Taught: a beginner without a Chinese keyboard couldn't add a word (now added by pinyin, or by meaning); tips weren't read (now one line, beside what they are about); "too many buttons", the Learn screen busy.
- **2026-10-16 and 2026-10-17, tester 2:** a designer, no Chinese, no study apps before; a Mac in Chrome, then the owner's tablet with a pen. Taught: far less text (the introduction became four short screens); **at most three buttons on a screen**, one of them main; **people must be able to try the app without studying it first** (roadmap item 2). Liked: writing with one's own strokes, the hints, the information about every word, the progress, looking up English.
- **For the first release:** the learners the owner means to share it with are not all very serious, so it must be clear without reading.
