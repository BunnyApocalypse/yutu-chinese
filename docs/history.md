# History: handover, roadmap and testing sessions

The latest handover, the roadmap, and what the testing sessions taught. Trimmed on 2026-10-18 to what is still open or still guides the work; how each thing was built is in its area's file, and the session-by-session notes up to then are in git (`git show 87ed508:docs/history.md`).

## Where the work stands

**Handover from the session of 2026-10-19.** Replace this with each session's handover; keep only what the next session needs.

- **Roadmap item 5 built: importing from Anki** (`docs/anki.md`), on branch `worktree-tocfl-decision`, **committed, not pushed, not released**. The owner chose every proposal that day: sql.js and fzstd as dependencies, exact Anki due dates (an `importedSchedule` record that `replay` goes on from), the guesses shown and confirmed, writing left to the learner, tone following the pinyin card, the most-reviewed source winning, `.colpkg` too. Both suites passing (197 unit tests, 313 browser tests). **Next: the owner tries it on an export of their own** (and on a shared deck from AnkiWeb); then item 2.
- **Roadmap item 2, the same day:** a draft with "Try writing a character" in the introduction was tried by the owner and reverted ("it just interrupts the intro flow"). Built instead, and **tried by the owner**: Review and Learn with no words at all offer the suggested level as the main button, one tap from the first lesson (`docs/cards.md`, "Learn and the lesson"). The owner chose: only for someone who skipped ("None" still ends in Decks), and the first lesson left as it is. Can be deleted: `local/shoot-start-level.js`, `local/start-level-pictures/`.
- **Roadmap item 3 built the same day: streaks** (`docs/cards.md`, "Streaks"), **on the test copy (pushed to `main`), not released.** The owner chose: a minimum per day (10 cards or 2 words, both settings), a missed day breaks it with the best kept, a streak screen from whichever of Review and Learn gets there first, no reminders, and every nudge can be switched off. Then, from pictures and trying it on the dev server: the screen explains streaks the first time and is short after; 🌕🐇 where the mascot will go; "Your streak is safe for today. Keep going!", never "Today is done"; a pop and sparkles. **Next: the owner tries it on the test copy** (the line at the end of Review, the settings, a missed day), then a "What's new" entry when it is released. Pictures: `local/streak-pictures/`, `local/streak-sparkles/` in the main folder.
- **Nothing is written outside the project folder** (the owner, 2026-10-19, after finding 183 files the browser tests had saved in `~/Downloads`): the test browsers' profiles and downloads are now in `local/test-browsers/`, removed as each browser stops. The old files in `~/Downloads` are the owner's to delete.
- **Roadmap item 4 built the same day: how long studying takes** (`docs/cards.md`, "How long studying takes"), **on the test copy.** The owner chose: Learn's time recorded too (`learnDuration` on the word), and a review's clock stopping when a grade is tapped. Nothing visible; it waits for the progress tab.
- **Roadmap item 7 built the same day: data safety seen by a stranger** (`docs/interface.md`, "Keeping the data" and Settings), **on the test copy.** Settings › Your data and backups always says where the words are and that a backup is the only other copy; after Export, where the file went and to keep a copy off the device; "Keeping your words" moved there from "Offline use". Safari on a Mac gets the 7-day warning too (with the Dock), and an iPad is now told from a Mac. An app added to the Home Screen or the Dock starts empty, so words are brought over with a backup. **In the introduction, Safari's last screen is the steps** to add the app, at full size, with a plain "Start in Safari anyway" (the owner, from pictures). **The reminder now repeats** at the end of Review and between words in Learn, in every browser, while the words may be lost (the owner: "I would like to be annoying"), with "Not now" and an off switch. Pictures: `local/data-safety-pictures/` (Settings), `intro/`, `message/`. Both suites passing (214 unit tests, 333 browser tests). **Next: the owner tries it in Safari** (iPhone, iPad, Mac) and Firefox, which the tests can't drive. **Chrome without its install question** now has the reminder's "Keep my words safe" open Settings › Your data and backups (the owner's idea, 2026-10-19), and the introduction just starts there (`docs/interface.md`); **not yet seen by the owner**.
- **The logo (item 6) has been in process** with the owner since 2026-10-15.
- **What the owner still has to try is one list now**, roadmap item 9.
- **Item 8 (the TOCFL license) dropped** the same day: the list is kept knowingly (`docs/word-lists.md`).
- **To know:**
  - Every release needs its entry at the top of `src/changes.js` (CLAUDE.md, "Deploying"); none written yet for the Anki import.
  - Pictures for a decision are made with small scripts using the browser tests' harness (`startApp`, `startBrowsers`, `Page.captureScreenshot`), in the session's scratchpad or `local/`, and deleted once the point is built. The owner chooses from pictures side by side; always give the picture's path.
  - Rename by pattern only at exact places, then compare strings and comments with the original (a rename once changed text in messages too).
  - Can be deleted: `local/shoot-about.js`, `local/about-pictures/`, `local/ux-atlas-draft/`.

## Roadmap

Agreed with the owner on 2026-10-18. **The first release** means the first users beyond testers: a small group of learners and an online language-learning community, without advertising. They are strangers trying the app on their own, so it is about first impressions and keeping their data safe. **Changes to the layout come before it** (the owner: no big UX changes once there are real users, if it can be avoided). Each item is planned with the owner before it is built.

**Before the first release**, roughly in this order:

1. **Done on 2026-10-18:** "too many buttons" and the busy Learn screen (`docs/cards.md`, `docs/interface.md`). Clear, Show outline and Animate while writing stay (the owner: three is within the tester's rule).
2. **Done on 2026-10-19: easy to try without studying it first** (tester 2's main point): someone arriving from a link should be writing a character within a minute. With no words, Review offers the suggested level, one tap from the first lesson (`docs/cards.md`); tried by the owner. The introduction stays as it is.
3. **Built on 2026-10-19, on the test copy (to try: item 9): streaks** (`docs/cards.md`, "Streaks"). A day counts after 10 cards or 2 words learned (both settings), from 4:00; a missed day breaks it, the best kept; a streak screen the first time a day counts, from Review or Learn, with room for the mascot; a line at the end of Review; all of it can be switched off. No reminders.
4. **Built on 2026-10-19: recording how long studying takes** (`docs/cards.md`, "How long studying takes"): each review's `duration` (until a grade is tapped, as in Anki) and each learned word's `learnDuration`, each step at most 60 seconds, time out of sight left out. Nothing shows it until the progress tab.
5. **Built on 2026-10-19, on the test copy (to try: item 9): importing from Anki** (.apkg and .colpkg, `docs/anki.md`). Schedules kept exactly, the guesses confirmed by the learner, writing left to the learner, tone following pinyin (the owner's choices that day). sql.js and fzstd added.
6. **In process since 2026-10-15: the finished 兔 logo** from a calligrapher, in place of the drawn one (`scripts/icon.html`). Its license must allow its use in the app.
7. **Built on 2026-10-19, on the test copy (to try: item 9): data safety, seen by a stranger** (`docs/interface.md`): what Settings says about where the words are and backups, Safari's 7-day deletion on every Apple device with the steps to add the app, and a reminder repeated while the words may be lost.
8. **Dropped on 2026-10-19: the TOCFL list's license.** The owner chose to keep the list and take the risk knowingly, without asking the committee (`docs/word-lists.md`).
9. **The owner's testing list:** everything built but not yet tried, on the test copy (https://bunnyapocalypse.github.io/yutu-chinese/test/). Strike an entry here once tried.
   - **Importing from Anki** (item 5): an export of the owner's own, and a shared deck from AnkiWeb.
   - **Data safety** (item 7): Safari on an iPhone, an iPad and a Mac (the introduction's steps, the reminder, adding to the Home Screen or the Dock and bringing the words over with a backup), and Firefox; the tests can't drive either.
   - **Streaks** (item 3): the streak screen, the settings, a missed day. (The line at the end of Review is fine for now, the owner, 2026-10-19.)
   - **"Keep my words safe" opening Settings** in Chrome when it hasn't offered to install (item 7).
   - **Sentences:** adding one, the reading card, the gap on the writing card, a whole sentence on a phone.
   - **Combining backups** between two real devices, and whether the `...-before-combining.json` file lands in downloads.
   - **Leeches:** the two settings, the note in Review, the lists, both exports.
   - **Sound** (nobody has listened yet): the recordings at their smallest size, words put together from syllables, the devices' own voices.
   - **The app installed** on the phone and the tablet.
10. **Done on 2026-10-18:** "What's new" after an update and "Send feedback" in the menu (`docs/interface.md`).

**Near-term:**

- **A progress tab, inspired by Anki's** (the owner, 2026-10-18): time spent studying, streaks, words learned and so on.
- "Show more" past a list's first 200 words (`MAX_ROWS`); today the rest are reached only by searching. Raised with the owner, not decided.
- A setting for target retention.
- **An Android app through F-Droid** (the owner, 2026-10-19), alongside the web app, which stays: the same app wrapped for Android (likely Capacitor, MIT; a dependency to approve when planned), so its data is the app's own and no browser can delete it. F-Droid first (free, and it builds GPL apps from source); the Play Store and iPhone/iPad only if heavily requested (the Play Store needs a closed test with 12 testers for 14 days; Apple needs a Mac and $99 a year). The app's data is separate from the website's: moving over is Export backup, then restore.
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
- Someone who skips the introduction starts with no words (2026-10-16); since 2026-10-19 Review offers them a level to start with.
- **Anything inside the introduction for trying the app first** (the owner, 2026-10-19, after trying a draft with "Try writing a character" on its first screen): it interrupts the introduction; help for newcomers comes after it.

## The testing sessions

Notes and transcripts are in the git-ignored `local/testing/`. Every point raised was built, settled or dropped by 2026-10-18; what is still open is in the roadmap.

- **2026-10-14, tester 1:** an absolute beginner, simplified, an Anki user, Android phone in Chrome. Taught: a beginner without a Chinese keyboard couldn't add a word (now added by pinyin, or by meaning); tips weren't read (now one line, beside what they are about); "too many buttons", the Learn screen busy.
- **2026-10-16 and 2026-10-17, tester 2:** a designer, no Chinese, no study apps before; a Mac in Chrome, then the owner's tablet with a pen. Taught: far less text (the introduction became four short screens); **at most three buttons on a screen**, one of them main; **people must be able to try the app without studying it first** (roadmap item 2). Liked: writing with one's own strokes, the hints, the information about every word, the progress, looking up English.
- **For the first release:** the learners the owner means to share it with are not all very serious, so it must be clear without reading.
