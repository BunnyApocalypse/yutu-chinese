# History: handover, roadmap and testing sessions

The latest handover, the roadmap, and what the testing sessions taught. Trimmed on 2026-10-18 to what is still open or still guides the work; how each thing was built is in its area's file, and the session-by-session notes up to then are in git (`git show 87ed508:docs/history.md`).

## Where the work stands

**Handover from the fourth session of 2026-10-21 (Review: correcting grades and verdicts; sentences shown better; released).** Replace this with each session's handover; keep only what the next session needs.

- **Released on 2026-10-21 to `main` and `stable`, a third time** ("What's new" entry `2026-10-21-3`): the mainland reader's notes #60 to #80, nothing else.
- **Released on 2026-10-21 to `main` and `stable`** ("What's new" entry `2026-10-21-2` in `src/changes.js`):
  - **The Anki import on real shared decks** (`docs/anki.md`): reading real decks and textbooks, the deck's own meanings, sentences as the app's sentences, the check step as a summary, "Words you already have", advice for each reason a note was left out, a turning sign. Ch_book1: 491 words and 85 sentences, 2,301 reviews copied.
  - **"✕ 姓 missed" / "✓ 姓 right" between the characters of a word** in Review, in the grades' place, with Clear / Show outline / Animate put away meanwhile (`docs/cards.md`, "Grading a written word").
  - **Going back to the last 10 cards graded** (‹ on an untouched card, or "‹ Back to the last card" at the end of Review): the raw input on each character, and a grade or a character's verdict corrected in place (the review saved again under its ID and time; `CLAUDE.md`'s rule on reviews now says so).
  - **Sentences:** the meaning and the sentence with its gap as separate lines, the gap never cut off; punctuation left out quietly; any number of characters on a card looked back at.
  - **Fixes:** a tap goes on after practicing a character gone back to; the current box keeps a blue ring over green or red.
- **First:** the owner reviews tester 4's feedback, made into to-dos at the top of the roadmap; then the Italian interface (high priority, to plan).
- **Next:** the owner tries it in real study; the Anki import on an export of their own and a shared deck (testing list, item 9).
- **New on the roadmap** ("Near-term"): the writing area on short phones (one row of buttons below; the owner's idea of dropping Next for a tap); card types and fields, with a grammar card; zhuyin. Long-term: the Anki import's button for each reason and keeping the page usable during a long import.
- **To check the Anki import:** `node scripts/check-anki-import.js <file>…` with the study data's full paths (`local/anki-decks/study-data/` in the main checkout; elsewhere `local/README.md`). Helper scripts in the main checkout's `local/anki-scripts/`.
- **Learned:** in a copy of the raw input shown smaller, the strokes must lose `vector-effect: non-scaling-stroke` or they look swollen (`quiz.drawing()`). The meaning line's cut-off (`clamp.js`) can cut only a part marked `data-clamp`. CC-CEDICT gives some entries a Taiwan reading that is another entry's mainland one (打): match the mainland reading first. **Never wait on a process with `until ! pgrep -f <name>`** (the waiting shell's own command holds the name). A worktree session's commands are refused when they chain steps or carry a computed program: put the script in a file under the job's `tmp/` and run it alone.

- **Released on 2026-10-21** (`5c56afb` on `main` and `stable`, "What's new" entry `2026-10-21`; the deploy checked live): **"Basics of Chinese"** (`docs/interface.md`), five screens (Characters, Pinyin, Tones, Writing, Four kinds of card; the owner's order), from the menu, Settings › Help, the introduction's first screen, and "What are tones?" on a tone card's face until 3 tone cards are graded; its 11 recordings are app files, so it plays offline. Also: **Settings last in the menu** (the owner), the mainland reader's notes #43 to #61, and space between a row of buttons and the hint under it (Send feedback, Import backup).
- **Decided, not built:** no second "New to Chinese?" link at the introduction's end (the owner, 2026-10-21: the last screen is for keeping the words safe). If a beginner tester misses the basics, add one to the level screen (screen 3).
- **The mainland reader's notes:** #1 to #80 of the general page worked in (`data/notes/CLAUDE.md`), the last batch (#60 to #80) on 2026-10-21. **Next batch starts at #81**. Their answers are translated and condensed, never copied in whole.
- **Waiting on tester 3:** the owner sends `local/testing/T3-brave-check-instructions.md` (five steps with screenshots: from Discord, in Brave, in the installed app, back in a tab, after a few days). Reading them: fewer words in Discord's than in Brave's means Discord's own browser (a separate copy of the words) was the cause; "Keeps the words for good: yes" in the installed app means only a tab needs "open the app from the home screen"; still "no" after days means Brave never agrees, so Brave gets weekly backups as its advice (`src/storageAdvice.js`). Plan the fix with the owner then.
- **Suggested next** (the owner's choice): the owner tries the basics and the rest of the testing list (item 9); the reader's next batch when it comes.
- **Still open from tester 3:** Brave's reminder at the end of Review and Learn asking to install an app already installed (in a tab, `persisted()` stayed false; `local/testing/T3-2026-10-20.md`). In Chromium the tab and the installed app share whether the data is kept, so Brave hadn't agreed even for the installed app; the owner suspects the link opened from Discord. **To find out first** (2026-10-20): the readout under Settings › For testing, with steps for the tester in `local/testing/T3-brave-check-instructions.md`. Then: if Brave never agrees, Brave is named apart and told to make weekly backups, not to install; if it agrees for the installed app, a tab says to open the app from the home screen.
- **Settings › For testing** (`src/testerSettings.js`, `docs/interface.md`): only on the test copy and under `npm run dev`; today the swipe readout. New switches for trying things go there.
- **The logo (item 6) has been in process** with the owner since 2026-10-15.
- **To know:**
  - Pictures for a decision: the atlas with `SIZES=` and `TRY_CSS=` for a look (`scripts/ux-atlas.js`), or a small script on the browser tests' harness for anything else. Put them in `local/`, delete them once the point is built, and always give the picture's path. The owner chooses from pictures side by side.
  - **A background session inside a worktree can't run git in the main checkout**, nor write files there: to `git pull` the owner's checkout, leave the worktree first (ExitWorktree, keep), and copy files for `local/` across with `cp`.
  - **A new worktree needs a real copy of `node_modules`** (`cp -a`), not a link: Vite won't serve files from outside the project, and the Anki import tests fail. It also needs `node scripts/copy-char-data.js` and `node scripts/copy-audio.js` before a picture script; the test command does that by itself.
  - **Running commands in a worktree:** a command that changes directory, chains steps around version control, or runs `sed` with a computed program is refused as unverifiable; write scripts to files and run plain separate commands.
  - **`reloadApp` in the harness switches the page to both scripts, mostly traditional**, even after `startBrowsers(..., { keepWelcome: true })`: a picture script that reloads shows traditional forms whatever the app's default.
  - Two browser tests fail now and then in a full run only (`tests/browser/CLAUDE.md`): run the file alone before suspecting a change.
  - A label beside a heading must fit on a 360px phone: measure it in the page rather than guess.
  - Rename by pattern only at exact places, then compare strings and comments with the original.
  - Files in `~/Downloads` (the old test files, tester 3's `notes.txt`, now in `local/testing/`) are the owner's to delete.

## Roadmap

**First: the owner reviews tester 4's feedback** (2026-10-21; notes in `local/testing/T4-2026-10-21.md`). About A2, a Skritter user switching from simplified to traditional, on release `2026-10-21-2`. Liked hearing words; added a word and looked one up without trouble. Not reached: changing a setting or a grade, the Progress tab, a backup. Nothing below is planned yet; the owner decides what is built, changed or dropped.

- **Bugs**
  - [ ] **"Show outline" shows the outline on both characters** of a two-character word, not just the one being written.
  - [ ] **你's meaning has 您 in it** (CC-CEDICT's "as opposed to courteous 您"): check how it reads on the card; on a meaning card it may give away nothing, on a writing card it may confuse.
- **Adding words and sentences**
  - [ ] **Added the sentence but not the word**, and was confused by adding the sentence to a deck in the extra details. Rethink adding: perhaps the add-word button beside the add-sentence button.
  - [ ] **Importing a list (TSV, CSV, one per line):** trim whitespace at the ends of lines; fill missing pinyin or meanings from the dictionary.
  - [ ] **"HSK 3.0" read as a level**: make clear 3.0 is the version of the list.
- **Studying**
  - [ ] **After the one card, didn't see there was more to do**: make the way on clearer.
  - [ ] **The prompt was too small** when asked to write 你: bolder and more central. They began writing the wrong character.
  - [ ] **Didn't like the count of mistakes**: hidden by default, or a setting to hide it.
  - [ ] **A goal of a set number of cards** to study, as an option.
- **The word's panel and page**
  - [ ] **The "Cards" tab was confusing**: a short explanation of what it is (a pop-up or a line on the tab).
  - [ ] **Layout:** pinyin below the characters, the meaning after; the top part (characters, pinyin, meaning) bigger than the extra information below it.
- **Settings and accessibility**
  - [ ] **A dyslexia-friendly font** as a setting (a font is new data: its license and a README, ask first).
  - [ ] **The Progress tab with a screen reader**: its charts and numbers readable.

**High priority: an Italian interface** (the owner, 2026-10-21), ahead of the German one. Translating the interface only (layer 1 in `docs/goals.md`, "Translations and other languages"): the strings gathered into one file per language, then Italian. To plan with the owner first: who checks the Italian, whether a dictionary in Italian is wanted, and where it falls against the first release.

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
   - **Basics of Chinese** (released 2026-10-21): the five screens on the phone and the tablet, the ▶ sounds (also offline), the link on the introduction, "What are tones?" until 3 tone cards are graded, Settings at the bottom of the menu.
   - **Tester 3's points** (released 2026-10-20; the swipe readout under Settings › For testing on the test copy only, https://bunnyapocalypse.github.io/yutu-chinese/test/): a quick swipe up on the tablet with a pen and a finger, and before the rising stroke of 氵 (Settings › For testing shows how each measured); the first Review after learning a few words (kinds mixed, the line about the wait); the tone card's example marks; the stacked grades on the tablet held sideways; "Grade buttons" set to two.
10. **Done on 2026-10-18:** "What's new" after an update and "Send feedback" in the menu (`docs/interface.md`).

**Near-term:**

- **Built on 2026-10-19, on the test copy: a progress tab, inspired by Anki's** (`docs/cards.md`, "The Progress tab"). Not built: one deck at a time, Anki's other charts.
- **Finish the learning notes for the HSK and TOCFL lists** (the owner, 2026-10-21), **first anything up to about B2.** Counted that day (words without a note, `data/notes/`): HSK 3.0 levels 1 to 5 and TOCFL Novice to level 4 complete; **HSK 2.0 levels 2 to 5: 154** (6, 4, 14, 130), the gaps between the two HSK versions; **HSK 3.0 level 6: 723 of 1,134**. Then the rest: HSK 2.0 level 6 (1,637 of 2,500), TOCFL level 5 (2,330 of 2,707), HSK 3.0 7-9 (4,949 of 5,634). TOCFL level 4 is B2 by the committee's own scale; for the HSK, B2 is usually put around 3.0 level 5 or 6 and 2.0 level 4 or 5, a rough match. Written as before (`data/notes/CLAUDE.md`: no word twice, the Taiwanese reader's points in the brief, the checks after a run). The mainland reader's page continues from #81.
- **How sure a note is: two small tags under it** (the owner, 2026-10-21; planned, not built). **"From the sources"**: every fact the note states is in Wiktionary (glyph origins), Make Me a Hanzi (parts) or CC-CEDICT (readings, meanings); the example sentence is left out of this check. **"Usage checked by a native speaker"** (the narrow wording, the owner's choice): the notes on the mainland and Taiwanese readers' pages, sentence included, since the readers saw the whole card. A note with neither shows nothing (proposed; one line in Settings › Help explains the tags). Stored as an eighth column in the notes files (`sources`, `native`, or both), explained in the folder's README. **The sources check must not rest on a model's word** (the owner asked): for each claim the checker quotes the passage from the local source files, a script confirms each quote appears word for word in that character's or word's entry (else the note fails), a second independent pass judges only "does this passage say this?", the tag goes on only when both agree, and the owner reads a random sample of passed notes with their quotes before release. Start with HSK 3.0 levels 1 to 3 to see how many pass.
- "Show more" past a list's first 200 words (`MAX_ROWS`); today the rest are reached only by searching. Raised with the owner, not decided.
- A setting for target retention.
- **The writing area isn't as big as it could be on short phones** (the owner, 2026-10-21: "if the canvas isn't optimally large on small phones then thats a problem"). `chooseSize` (`src/wordFlow.js`) keeps 380px of the height for the rows above (213) and below (167, two rows of buttons), so where the height is the limit the area is smaller than the width allows: on a 360×640 phone 260px where the width would give 328, the arrows then sitting beside it. A typical phone (390×844) is limited by its width and is unaffected. **Ideas, not decided:** one row of buttons below instead of two (about 60px more: 260 → about 320), which means dropping Next between characters in favor of a tap on the area with a hint such as "Tap to go on" (the owner's idea), no Clear / Show outline / Animate under the grades while practicing after answering, and the same for Free practice's Next; and room above, such as the pinyin line, which keeps its height before "Show pinyin" is tapped. Check every screen with pictures (`docs/pitfalls.md`, "The writing area's size").
- **Card types and fields** (the owner, 2026-10-21: nearer-term). A card for a **grammar explanation** (Ch_book1's grammar notes, left out by the Anki import: they explain rather than give something to write), and a general look at which card types and fields the app should have, starting from what the Anki import leaves out of the shared decks, which of them the app should keep or support itself. The import uses only characters, pinyin and meaning. The shared decks also have, for example: example sentences with pinyin and translation, part of speech, measure words, etymology or a breakdown into components, mnemonics or keywords, zhuyin, audio, stroke-order pictures, HSK level and frequency, variants, and (the Kangxi deck) Japanese, Korean and Sino-Vietnamese readings. Some match what the word page already shows from the dictionary or could (`docs/word-page.md`); the rest would need new fields on a word (`docs/merging.md` for what that means for backups). A note type's fields are listed by `describeCollection` (`src/ankiImport.js`).
- **Zhuyin** (the owner, 2026-10-21: moved up from "Nice to have"), beside or in place of pinyin.
- **Released on 2026-10-21: "Basics of Chinese"** (the owner, 2026-10-20, after tester 3, who had almost no Chinese and found the tone card confusing): a pop-up of five screens (characters, pinyin, tones, the four kinds of card, writing) with recordings kept offline, from the menu, Settings › Help, the introduction's first screen, and "What are tones?" on a tone card until 3 have been graded (`docs/interface.md`, "Basics of Chinese"). Not yet tried by a beginner.
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
- A German interface after the Italian one, then other languages (`docs/goals.md`, "Translations").
- The Skritter import, if the GDPR data arrives (the owner doesn't want the word list imported without its scheduling).
- A mode for going from 繁體 to 簡體 or back, by character rather than by word (having written 們 → 们 once, the learner isn't asked again in 他們, 你們).
- Mainland, Hong Kong or Taiwan traditional forms (needs stroke data for the other two); longer shortcuts (more strokes joined, reordered or dropped).
- Stroke data for the traditional characters animCJK doesn't cover.
- Listening cards and ready-made sentences (the last step of "sentences and audio"); eSpeak NG or a small neural voice in the browser (raised, not looked into).
- The TBCL list, and the 79 TOCFL entries left out (`docs/word-lists.md`).
- Proposing a shorter meaning for single characters, in place of cutting long ones short.
- **From the Anki import** (the owner, 2026-10-21: long-term; `docs/anki.md`, "Not built"): keeping the page usable during a long import (planning in batches first, a Web Worker if the reading is the slow part; Mei's HSK deck holds a phone's page about 13 s), and a button for each reason a note was left out, opening the right add form.
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
- **2026-10-20, tester 3:** almost no Chinese; an Android tablet in Brave, at times held sideways. A short session; **open, not yet planned with the owner** (`local/testing/T3-2026-10-20.md` has what the code says on each): a slow swipe up cleared the character (**built on 2026-10-20, to try on the tablet:** a swipe must take at most 300 ms and rise a third of the area, `docs/writing.md`, the owner's own swipes measured with the readout now under Settings › For testing); Brave's reminder at the end of Review and Learn asked to install an app already installed but opened in the browser (`persisted()` stayed false there); on the tone card it wasn't clear what to draw (the owner had to explain that the area takes a tone mark; **built on 2026-10-20:** the five marks drawn faintly above "Draw one of these here", `docs/cards.md`); a right/wrong choice in place of the four grades, as a setting (**built on 2026-10-20:** "Grade buttons", Wrong and Right, `docs/cards.md`); the grade buttons small on a tablet held sideways (**built on 2026-10-20:** stacked at the bottom of the side column, `docs/pitfalls.md`); Review right after Learn showed only meaning cards (each word offered its next new card in a fixed order, its others held back by `SIBLING_GAP_MS`) (**built on 2026-10-20:** each word starts at a different kind, and the wait is explained, `docs/cards.md`).
- **2026-10-21, tester 4:** about A2, a Skritter user switching from simplified to traditional. Open, not yet reviewed: the to-dos at the top of the roadmap.
- **For the first release:** the learners the owner means to share it with are not all very serious, so it must be clear without reading.
