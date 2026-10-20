# History: handover, roadmap and testing sessions

The latest handover, the roadmap, and what the testing sessions taught. Trimmed on 2026-10-18 to what is still open or still guides the work; how each thing was built is in its area's file, and the session-by-session notes up to then are in git (`git show 87ed508:docs/history.md`).

## Where the work stands

**Handover from the session of 2026-10-19 (the dark look, the streak pill, the release).** Replace this with each session's handover; keep only what the next session needs.

- **Released on 2026-10-19** (the owner): everything that was on the test copy is on the stable one too, with its "What's new" entry (`src/changes.js`, `2026-10-19`): the Anki import, streaks, the Progress tab, the level to start from, data safety, how long studying takes (shown on the Progress tab), and the two changes of this session.
- **The dark look's jade** is a grayer nephrite with a warm moonlight behind what is chosen (`docs/interface.md`, "Dark mode and the looks"); the owner chose draft B of four from pictures and liked it on the screen.
- **The streak screen no longer interrupts studying** (`docs/cards.md`, "Streaks"): the first ever opens at once; after that a pill over the top bar while studying, and the screen at a pause (the end of Review or of Learn's day, opening the menu, coming back the same study day, a tap on the pill). Not covered by a test: the end of Learn.
- **What the owner still has to try is one list**, roadmap item 9, now on the stable copy as well.
- **The logo (item 6) has been in process** with the owner since 2026-10-15.
- **To know:**
  - Pictures for a decision are made with small scripts using the browser tests' harness (`startApp`, `startBrowsers`, `Page.captureScreenshot`), in `local/`, and deleted once the point is built. The owner chooses from pictures side by side; always give the picture's path.
  - A label beside a heading must fit on a 360px phone: measure it in the page (a label's top against the heading's) rather than guess.
  - Rename by pattern only at exact places, then compare strings and comments with the original (a rename once changed text in messages too).
  - The old files the browser tests once saved in `~/Downloads` are the owner's to delete.

## Roadmap

Agreed with the owner on 2026-10-18. **The first release** means the first users beyond testers: a small group of learners and an online language-learning community, without advertising. They are strangers trying the app on their own, so it is about first impressions and keeping their data safe. **Changes to the layout come before it** (the owner: no big UX changes once there are real users, if it can be avoided). Each item is planned with the owner before it is built.

**Before the first release**, roughly in this order:

1. **Done on 2026-10-18:** "too many buttons" and the busy Learn screen (`docs/cards.md`, `docs/interface.md`). Clear, Show outline and Animate while writing stay (the owner: three is within the tester's rule).
2. **Done on 2026-10-19: easy to try without studying it first** (tester 2's main point): someone arriving from a link should be writing a character within a minute. With no words, Review offers the suggested level, one tap from the first lesson (`docs/cards.md`); tried by the owner. The introduction stays as it is.
3. **Released on 2026-10-19 (to try: item 9): streaks** (`docs/cards.md`, "Streaks"). A day counts after 10 cards or 2 words learned (both settings), from 4:00; a missed day breaks it, the best kept; a pill while studying and a streak screen at a pause, with room for the mascot; a line at the end of Review; all of it can be switched off. No reminders.
4. **Released on 2026-10-19: recording how long studying takes** (`docs/cards.md`, "How long studying takes"): each review's `duration` (until a grade is tapped, as in Anki) and each learned word's `learnDuration`, each step at most 60 seconds, time out of sight left out. Shown on the Progress tab.
5. **Released on 2026-10-19 (to try: item 9): importing from Anki** (.apkg and .colpkg, `docs/anki.md`). Schedules kept exactly, the guesses confirmed by the learner, writing left to the learner, tone following pinyin (the owner's choices that day). sql.js and fzstd added.
6. **In process since 2026-10-15: the finished 兔 logo** from a calligrapher, in place of the drawn one (`scripts/icon.html`). Its license must allow its use in the app.
7. **Released on 2026-10-19 (to try: item 9): data safety, seen by a stranger** (`docs/interface.md`): what Settings says about where the words are and backups, Safari's 7-day deletion on every Apple device with the steps to add the app, and a reminder repeated while the words may be lost.
8. **Dropped on 2026-10-19: the TOCFL list's license.** The owner chose to keep the list and take the risk knowingly, without asking the committee (`docs/word-lists.md`).
9. **The owner's testing list:** everything built but not yet tried, released on 2026-10-19 (https://bunnyapocalypse.github.io/yutu-chinese/; the test copy has the same). Strike an entry here once tried.
   - **The Progress tab:** with the owner's own study, the ranges, tapping days and bars, and the switch "Split 简体字/繁體字" with both scripts.
   - **Importing from Anki** (item 5): an export of the owner's own, and a shared deck from AnkiWeb.
   - **Data safety** (item 7): Safari on an iPhone, an iPad and a Mac (the introduction's steps, the reminder, adding to the Home Screen or the Dock and bringing the words over with a backup), and Firefox; the tests can't drive either.
   - **Streaks** (item 3): the streak screen, the settings, a missed day; the pill while studying, a tap on it, the screen at the end of Review or Learn and when the menu is opened. (The line at the end of Review is fine for now, the owner, 2026-10-19.)
   - **"Keep my words safe" opening Settings** in Chrome when it hasn't offered to install (item 7).
   - **Sentences:** adding one, the reading card, the gap on the writing card, a whole sentence on a phone.
   - **Combining backups** between two real devices, and whether the `...-before-combining.json` file lands in downloads.
   - **Leeches:** the two settings, the note in Review, the lists, both exports.
   - **The app installed** on the phone and the tablet.
10. **Done on 2026-10-18:** "What's new" after an update and "Send feedback" in the menu (`docs/interface.md`).

**Near-term:**

- **Built on 2026-10-19, on the test copy: a progress tab, inspired by Anki's** (`docs/cards.md`, "The Progress tab"). Not built: one deck at a time, Anki's other charts.
- "Show more" past a list's first 200 words (`MAX_ROWS`); today the rest are reached only by searching. Raised with the owner, not decided.
- A setting for target retention.
- **An Android app through F-Droid** (the owner, 2026-10-19), alongside the web app, which stays: the same app wrapped for Android (likely Capacitor, MIT; a dependency to approve when planned), so its data is the app's own and no browser can delete it. F-Droid first (free, and it builds GPL apps from source); the Play Store and iPhone/iPad only if heavily requested (the Play Store needs a closed test with 12 testers for 14 days; Apple needs a Mac and $99 a year). The app's data is separate from the website's: moving over is Export backup, then restore.
- **Syncing through the learner's own storage** (the owner, 2026-10-20: after the first release, after the testing list). The same combining as `mergeBackups`, with the file kept in the learner's storage instead of moved by hand. Opt-in, and the one agreed exception to "nothing from the internet": the app still works fully offline and syncs when it can. A synced copy also brings words back after Safari deletes them. In this order:
  1. **Google Drive**, talking to Google directly (no script of Google's, no dependency), in the app's own hidden folder (`drive.appdata`, a non-sensitive scope: only basic verification). The owner registers the app with Google and puts up a short privacy page. Syncing when the app opens and after a session, and a "Sync" switch in Settings; two devices saving at once is fixed by syncing again, since combining the same data twice changes nothing; the file compressed as reviews grow. Browser tests use a stand-in for Google; one real check on the owner's devices.
  2. **A file picked with Android's own file picker** in the F-Droid app (Drive, OneDrive, Syncthing, maybe Proton Drive).
  3. **OneDrive or Dropbox** if asked for (both work from a web app, a folder of the app's own).
  4. **Proton Drive** once Proton supports other apps; in October 2026 its SDK is not supported for them and has no signing in (to look at again in 2027).
  - **Not iCloud**: the web route needs Apple's $99 a year; on an iPhone, a backup saved to iCloud Drive by hand.
- **A mascot**, mainly for the streaks screen (the owner, 2026-10-18; likely November 2026): a bunny, commissioned from an artist, happy or sad with the streak.

**Nice to have:**

- Checking by hand with VoiceOver or TalkBack (`docs/interface.md`, "Accessibility").
- A German interface, then other languages (`docs/goals.md`, "Translations").
- The Skritter import, if the GDPR data arrives (the owner doesn't want the word list imported without its scheduling).
- A mode for going from 繁體 to 簡體 or back, by character rather than by word (having written 們 → 们 once, the learner isn't asked again in 他們, 你們).
- Mainland, Hong Kong or Taiwan traditional forms (needs stroke data for the other two); zhuyin; longer shortcuts (more strokes joined, reordered or dropped).
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

Notes and transcripts are in the git-ignored `local/testing/`. Every point raised by testers 1 and 2 was built, settled or dropped by 2026-10-18; what is still open is in the roadmap.

- **2026-10-14, tester 1:** an absolute beginner, simplified, an Anki user, Android phone in Chrome. Taught: a beginner without a Chinese keyboard couldn't add a word (now added by pinyin, or by meaning); tips weren't read (now one line, beside what they are about); "too many buttons", the Learn screen busy.
- **2026-10-16 and 2026-10-17, tester 2:** a designer, no Chinese, no study apps before; a Mac in Chrome, then the owner's tablet with a pen. Taught: far less text (the introduction became four short screens); **at most three buttons on a screen**, one of them main; **people must be able to try the app without studying it first** (roadmap item 2). Liked: writing with one's own strokes, the hints, the information about every word, the progress, looking up English.
- **2026-10-20, tester 3:** almost no Chinese; an Android tablet in Brave, at times held sideways. A short session; **open, not yet planned with the owner** (`local/testing/T3-2026-10-20.md` has what the code says on each): a slow swipe up cleared the character (**built on 2026-10-20, to try on the tablet:** a swipe must take at most 300 ms and rise a third of the area, `docs/writing.md`, the owner's own swipes measured with the readout now under Settings › For testing); Brave's reminder at the end of Review and Learn asked to install an app already installed but opened in the browser (`persisted()` stayed false there); on the tone card it wasn't clear what to draw (the owner had to explain that the area takes a tone mark); a right/wrong choice in place of the four grades, as a setting; the grade buttons small on a tablet held sideways; Review right after Learn showed only meaning cards (each word offers its next new card in the fixed order, its others held back by `SIBLING_GAP_MS`), which with few words is a strange first Review.
- **For the first release:** the learners the owner means to share it with are not all very serious, so it must be clear without reading.
