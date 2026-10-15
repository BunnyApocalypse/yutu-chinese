# History: past session notes and the roadmap

Moved word for word from CLAUDE.md on 2026-10-15; see `docs/README.md` for where each former section is now.

## Where the work stands

**For the session after 2026-10-14, first of all** (put here at the owner's request, from Claude's suggestions after the first testing session and the question of Anki sync; each still to be agreed with the owner before it is built):

1. **Done on 2026-10-15** (see "The word list"): **Adding a word by its pinyin**, for a learner without a Chinese keyboard: the characters box also takes pinyin and lists the dictionary's words read that way, usual readings first (HSK and TOCFL), to choose from. Claude's advice: build this first; it is what stopped the beginner in testing.
2. **Done on 2026-10-15** (see "The stroke count" in `docs/writing.md`): **The stroke count is there and was not seen**: the status line says "Stroke 1 of 10 · no mistakes", and a tester asked for a stroke counter. A question of where and how it is shown, not a missing feature.
3. **Done on 2026-10-15** (one line each, and beside what they are about; see `docs/interface.md`): **Tips that are read:** they were ignored in testing. Shorter (one line each), or placed beside the thing they are about.
4. **Done on 2026-10-15** (see `docs/word-page.md`): **A word of an example sentence tapped by accident:** a tap shows a small popup with its pinyin and meaning and "Open its page", rather than going straight to the page.
5. **Done on 2026-10-15** (see `docs/cards.md`): **Tone buttons always show "a"** (asked in testing): showing the word's own syllable would give its reading away on a tone card; bare tone marks (ˉ ˊ ˇ ˋ ·) would not.
6. **Done another way on 2026-10-15** (the owner's idea: the words of a note can be tapped, see `docs/word-page.md`): **Pinyin in the notes of the beginner levels** (a beginner did not know 的 in a note): put the reading after each Chinese word or phrase in the notes of TOCFL Novice and HSK 3.0 levels 1 and 2, by a script.
7. **Done on 2026-10-15** (once, after the first word learned; see `docs/interface.md`): **Long-term storage:** a separate dot for it would stay on for most Chrome users (Chrome only grants it to an installed app); a message once seems better than a dot.
8. **Still open:** **Free practice under Words, and "too many buttons", the Learn screen busy:** for the pass over the looks.
9. **Dropped from the to-do list by the owner on 2026-10-15:** **Anki:** syncing through AnkiWeb is against its terms (only Anki's own clients may sync) and would need a server; the self-hosted sync server and AnkiConnect are allowed but a poor fit, since Anki has no writing check and its reviews would not carry what the scheduling uses. Claude's advice: no Anki sync; syncing through storage the learner has (see "Long-term goals") reuses the combining of backups; an export to an Anki deck file (.apkg) could come later, and would need a library (a dependency to ask about).
10. **Dropped from the to-do list by the owner on 2026-10-15:** **Note-taking in testing** (Claude's feedback, asked for by the owner): keep what was seen apart from what to do about it; fill in "While they work" and the time; mark answers that were prompted; name the notes file by a code (T1), not the tester's name.

**For the session after 2026-10-13, first of all:**

- **The owner is testing the app themselves before giving it to anyone** (their decision at the end of that session). Ask how it went, and expect remarks on the layout around the writing area, which was reworked late that day and which they had only tried on a desktop.
- **No new features until that testing and a first round with testers are done** (agreed that day). Fixing what the owner finds is the work.
- The owner's list of things to try is below; the testers' documents are in `docs/alpha/`, complete since 2026-10-14.
- Everything was pushed at the end of that session to `main` (the test copy) and to a new `stable` branch (the copy at the main address). That was the first run of the two-copy deploy.

The rest of this section was written earlier that day, oldest first.

Written on 2026-10-13 for whichever session picks the work up next (the owner works from more than one computer; everything is on `main` and published).

- **To do, the owner's: try what was built on 2026-10-13.** None of it has been tested by them (asked to be put on the list that day). Ask how it went before building further on any of it:
  - Combining backups between two real devices, and whether the `...-before-combining.json` file lands in the downloads (not verifiable in the tests' browser).
  - The Import backup panel and the ready-made lists' rows on a phone.
  - Percent learned and its bar; "Add a word" folded away.
  - The groups inside the lower HSK and TOCFL levels: only HSK 3.0 level 1 was seen by the owner.
  - Sentences: adding one from a word's page and by hand, the reading card, the gap on the writing card, writing a whole sentence on a phone.
  - The word page: its layout on a phone, whether the notes read well there, and the taps from part to part.
  - Sound: nobody has listened yet. Whether the recordings are good enough at their smallest size, how words put together from syllables sound, and what the phone's and tablet's own voices do.
  - Leeches: the two settings, the note in Review, the lists in the Decks tab, both exports, and the notice when a card is suspended.
  - The card manager: the Cards fold-out, Start over, "I know this word", the order of the list, and Select words.
- **Done that day:** the conversation about long-term goals, the database made ready for merging, and decks with the Decks tab in place of the Words tab (see "Long-term goals", "Ready for merging", "Decks").
- **Done later that day: combining backups**, number 3 in the order of work (see "Combining backups"). The owner has not tried it yet.
- **Done later that day: groups inside the lower levels** of the ready-made lists (TOCFL's topics; HSK 3.0 and 2.0 levels 1 to 3 in a teaching order), each a deck inside its level. See "Ready-made word lists". The owner saw and approved HSK 3.0 level 1; the other five HSK levels were read by Claude only.
- **Done later that day: leeches** with their two exports, and suspending a card (see "Leeches and suspended cards"). The owner has not tried it.
- **Done later that day: the card manager** (see "Managing cards"). The owner has not tried it.
- **Sentences and audio**, number 5 of the order of work, agreed with the owner on 2026-10-13 in four steps: hearing a word (**done**, see "Hearing a word"); a read-only page for each word with an Edit button (**done**, see "The word page"); sentences as items of their own (**done**, see "Sentences"); then listening cards and ready-made sentences (**next**). Also raised by the owner and not looked into: eSpeak NG or a small neural voice model in the browser.
- **Wanted by the owner for the word page (2026-10-13):** the parts that make up each character, each clickable, saying which gives the meaning and which the sound; and the characters and words of an example sentence clickable, leading to their definitions. Make Me a Hanzi's `dictionary.txt` (LGPL-3.0, 9,574 characters; the same project the big stroke set comes from) has for each character its decomposition, radical, and for sound-meaning compounds the semantic and phonetic parts. Wiktionary's data is available as JSON from kaikki.org (CC BY-SA and GFDL) and has glyph-origin text; it could be handed to the model that writes notes instead of letting it recall etymology.
- **A ready-made deck of the 部首** (the radicals): built on 2026-10-14, see "Radicals".
- **Before the session ends, push** (the owner's instruction): commits made after the last push are local only.
- **The owner has only tried the Decks tab briefly.** They asked for the Back button after their first look; expect more remarks on it.
- **Deploying:** if the deploy step fails with "Fetching artifact metadata failed", do not re-run the failed run (the re-run uploads a second copy of the site and fails on that); start a fresh one with `gh workflow run deploy.yml --ref main`.
- **The repository's address** is `BunnyApocalypse/hanzi-trainer`, with capitals; the lowercase one still works but git says it has moved.

## The first testing session (2026-10-14)

The owner watched a tester (an absolute beginner, simplified, an Anki user, on an Android phone in Chrome) and wrote the session up in `local/testing/`, which is git-ignored on purpose. **Nothing that identifies a tester goes into a file in the repository** (names, contacts, quotes that would identify them): in code, comments, commits and this file, say "a tester".

- **Fixed the same day:** a word needs Chinese characters (an English word and "word1" had gone in, `checkWord`); the deck choosers of Review, Learn and Words leave out the groups inside ready-made levels unless one is chosen (`isReadyMadeGroup`; one HSK level brought a dozen); search matches the start of a syllable or of a word of the meaning, so "ta" no longer brings words without "ta" (`matchesSearch`); a tip is moved into a pop-up panel that opens over it, since everything outside a modal panel is out of reach (`placeCard` in `src/tips.js`); the introduction's "Nothing for now" says what it means; the backup reminder can be switched off, after a warning (`backupReminderOff`, a setting of the device).
- **Seen, not yet acted on (to discuss with the owner):** the tips were not read and dismissed late; a beginner without a Chinese keyboard could not add a word (wanted: finding a word by its pinyin, with a list to choose from); too many buttons, the Learn screen busy; why Free practice is under Words; tone buttons always show "a" (showing the syllable would give the reading away); words of an example sentence tapped by accident (ideas: a small popup with pinyin and meaning first, or a sentence that has to be tapped before its words can be); a beginner did not know 的 in a note (pinyin in beginners' notes?); a separate indicator for long-term storage permission; a stroke counter as a hint; dark mode (already wanted).

## Settled with the owner on 2026-10-13

- The Script and Pronunciation settings suit them as built.
- **The owner is only testing the app for now; their real study is still in Skritter.** Nothing in the app's database on any of their devices, at the old LAN address or the published one, needs saving. Other people may be using the published app, though, so a change to the database still has to carry existing data over.
- The Skritter exports in `exports/` are plain word lists (a TSV and a CSV). The scheduling data from the GDPR request has not arrived.

## Roadmap

1. **Done:** one hardcoded character, stroke-by-stroke quiz with grading, reachable from a phone over the LAN.
2. **Done:** raw input, lenient grading, optional 2-stroke 子.
3. **Done:** practice any typed character or multi-character word; stroke data loaded on demand.
4. **Done:** FSRS scheduling of writing cards on a built-in word list, IndexedDB storage, backup export/import.
5. **Done:** Taiwan-standard stroke data for the 1,013 traditional characters animCJK covers, with the mainland stroke order also accepted where the strokes are the same. Still open: the traditional characters it does not cover.
6. **Done:** the other card types (meaning, pinyin, tone with buttons or a drawn mark), scheduling across types, the settings panel, the pronunciation setting and Taiwan/mainland tone variants. Later: zhuyin as an alternative to pinyin.
7. **Done:** two consecutive strokes joined, for every character. Still open: longer runs, and shortcuts that reorder or drop strokes.
8. **Done:** PWA: manifest, service worker, all stroke data and the dictionary saved offline, deployed to GitHub Pages on every push to `main` (see "Offline use and deployment"). Still open: the owner trying it installed on the phone and tablet.
9. Import the Skritter scheduling data, if the GDPR request (sent 2026-10-12) yields it. The word list itself can be added in the Decks tab since 2026-10-12; the owner had said they did not want it imported without scheduling data, so when to do that is theirs to decide.
10. **Done on 2026-10-13:** combine backups between devices instead of only replacing (see "Combining backups"). Still open: a setting for target retention.
11. **To do, asked for by the owner:**
    - **Done on 2026-10-13:** the conversation about long-term goals (see "Long-term goals", which also has the order of work).
    - **Done on 2026-10-13:** fit the interface to the script and pronunciation being learned (see "Fitting the interface to what is learned"). The owner has not seen it yet.
    - **Done for writing:** a browser test suite that lives in the repo and runs in parallel (see "Browser tests"). Still open: browser tests for grading in Review and for most of the settings panel.
    - **Done on 2026-10-13:** the browser grid's remaining failures (half-size second or third stroke; 學 in the mainland order shifted right). See "Following where a character is written" and "Two accepted stroke orders".
    - **Done on 2026-10-13:** a tab tapped before the app has finished starting is opened once it has (`setMode` and the end of `startUp` in `src/main.js`), instead of throwing an error.
    - **Done on 2026-10-13:** pronunciation notes inside a meaning, such as "conduct (Taiwan pr. [xing4])", are taken out whole when the dictionary is built, and the dictionary was rebuilt (same CC-CEDICT release).
    - **Gestures on the writing area, as in Skritter** (asked for by the owner on 2026-10-13): a long hold for a hint, a double tap for a hint, and a swipe up to wipe what is written and start the character again. To settle: how a long hold and a double tap are told from a short stroke or a dot (點, the neutral tone's dot on a tone card), since today every touch on the area is a stroke. **A must-have on mobile before the owner would switch from Skritter, and worth breaking the feature freeze for** (the owner, 2026-10-15).
    - **Done on 2026-10-15** (see "Dark mode" in `docs/interface.md`): **Dark mode** (asked for by the owner on 2026-10-13): a choice in Settings, presumably light, dark, or as the device has it. The colors are written out all over `src/style.css` and in a few places in the code (the writing area's ink, outline and grid in `src/quiz.js` and `src/wordFlow.js`, the manifest's colors, the icon), so the first step is to gather them into named colors.
    - **Done on 2026-10-13:** ready-made word lists for the HSK (3.0 and 2.0) and the TOCFL (see "Ready-made word lists"). Not done: TBCL, and the 79 TOCFL entries left out.
    - **Done on 2026-10-13: long meanings are cut short.** The prompt above a card shows one line, and a tap on it shows all of it in a panel (`clampWithPopup` in `src/clamp.js`, which watches the element, so code goes on setting its text as before); a card's face shows five lines and a row of the word list two (the style sheet alone); a word's page has all of it. Still to consider: proposing a shorter meaning in the first place. What was asked:
    - **Long meanings should collapse** (asked for by the owner on 2026-10-13): some words get a very long meaning from the dictionary (点 is the owner's example), which crowds a card. A meaning beyond some length should be shown cut short, with a way to see all of it. To settle: where it applies (the prompt of a writing card, the card's face, the word list), and whether proposing a shorter meaning in the first place would serve better for single characters.
    - **Done on 2026-10-13** (see "Decks"). As first written down: **Decks, as in Anki** (asked for by the owner on 2026-10-13): words grouped into decks; studying one deck at a time as well as everything together ("all words learned"); and decks inside decks, such as a textbook with its chapters. A ready-made word list would arrive as a deck, with its levels as sub-decks. To settle first: whether a word can be in several decks (a word's ID is its characters and pinyin, so it exists once), where a deck's place in the tree is stored, how the daily limit of new words works per deck and overall, and what the backup and a later merge between devices need.
    - **Nice to have, long term** (the owner's idea, 2026-10-13): a mode that helps someone go from 繁體 to 簡體 or back. Today every word whose forms differ has its writing card learned again. The mode would work by character or component instead: having learned 們 → 们 once in one word, the learner is taken to know it in 他們, 你們 and the rest, so only the characters that are new to them come up. Needs a table of which characters differ between the scripts (the word list's own pairs give most of it) and a record of which the learner has written.
    - A setting for which traditional forms to use: mainland, Hong Kong or Taiwan, so that people can choose. Today Traditional always means Taiwan forms where animCJK has them. Needs stroke data for the other two regions' forms; the big set's traditional characters are mainland-style, and no Hong Kong set has been looked for yet.
    - **Done on 2026-10-13:** a neutral tone is accepted where the dictionary has one or the owner added one to the word (see "Taiwan and mainland pronunciation").
