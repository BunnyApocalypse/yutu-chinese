# Decks

Built on 2026-10-13 at the owner's request; answers marked "owner" were given to questions put to them.

## The Decks tab

- **Two sections**, chosen at the top: "My decks" and "Ready-made decks" (owner). Coming to the tab always shows My decks' front page, with no deck opened by itself (the owner, 2026-10-14: an opened "Chinese 中文" misled new learners); this is reset before anything is waited for, so a quick tap isn't undone. `openDeckId` in `src/wordsPanel.js` says which page is open.
- **The front page:** the decks inside no other, "+ New deck" beside the heading (`new-deck-dialog`; makes the deck inside the one whose page is open), and all words with the search box. A tip beside the first deck's › says what a tap does (`deckRows`).
- **Decks are listed most recently active first** (owner): `lastActivity` in `src/decks.js`, the latest of the deck's own change, a change to one of its words and a review of their cards, including decks inside it. On the front page and "Decks inside this one" only; choosers keep the tree's order. So **the browser tests open decks by name**: `openDeckPage` (with its ›) and `openLearn` in the harness.
- **A tap on a deck's row studies it** (the owner, 2026-10-16, after a tester found "way too many buttons"): Learn while any of its words wait, Review once all are learned, its page if it has no words (`mainAction` in `src/decksPanel.js`); the row says "Tap to learn", "Tap to review" or "Tap to add words" (`.deck-tap`). **› opens the deck's page** (`.deck-open`).
- **Studying a deck from Decks has "‹ Decks" in the top bar** (`study-back-button`, `studiedFrom` in `src/main.js`; tester 2's R8, 2026-10-18), back to where it was left; "‹ Words" when it came from Words. **While a card is up, the arrow alone replaces ☰** (the owner's idea; `main.focused .top-bar:has(#study-back-button:not([hidden]))`), "Back to Decks" to a screen reader.
- **A deck's page:** "‹ Decks" or "‹ <parent>" in the top bar (`deck-back-button`); "Decks › Textbook › Chapter 2" (`renderPath`) only inside another deck; the name with ⚙ for Deck settings; the counts; **one main button**, "Learn new words" with "Review" small beside it, or "Review this deck" once all are learned (the owner, 2026-10-16); the decks inside it; "+ Add to deck"; and its words, those of decks inside it marked "in Chapter 1". **A sentence or radical says so** at the row's end ("sentence · waiting"; `kind` in `renderList`; tester 2 took 我們是同學。 for 我們 added twice).
- **The way back in the top bar is decided in one place** (`renderDecks`): only while a deck's page is on screen, and the screen's name is left alone while Decks and Words aren't showing. Deciding it elsewhere once left "‹ Decks" over Learn, and "Learn" over Review's own way back.
- **Each deck shows how far it is learned** (the owner, 2026-10-13): "512 words · 37 learned (7%)" with a thin bar (`countsOf`, `fillBar`). "Learned" is `isLearned`, so 100% means every word has been through Learn, not that it is known. Rounded down.

## Adding

- **One panel, "+ Add to deck"** (`add-dialog`; the owner, 2026-10-16, from screenshots): "Add to Chinese 中文" with three tabs, One word, A list of words, A sentence (`showAddForm`). Beside "Words in this deck", or the main button on a deck without words. Ready-made levels aren't offered there. Tests pick a form with `useAddForm`, the panel left closed.
- **Words go into the deck whose page is open.** A word already there is put in this deck as well and keeps its meaning; a list with nothing new can still be "put in this deck".
- **"Learn it now" after adding a word** (the owner, 2026-10-16): under the note in the add panel while the word waits, until the next is typed; and as a bar at the top of a word's page right after adding it from the dictionary ("Added to Chinese 中文", `page-learn-now`). It puts the word first in line and opens Learn on that deck (`learnNow`). Not for lists or sentences.

## How decks work

- **Every word is in at least one deck** (owner). The app starts with "Chinese 中文" (`DEFAULT_DECK`, fixed ID `chinese`, renamable). `homeForEveryWord` puts words in no existing deck into it at every start (`fileListWordsInDecks` in `src/main.js`), making it if no deck exists, so code can rely on `word.decks` after start-up.
- **A word can be in several decks and has one schedule** (owner). `decks` lists deck IDs; studying a deck only narrows which words come up. A deck includes those inside it, to any depth (`deckWithInside`). A deck can't be put inside itself or its own inside (`canBeInside`).
- **A word's pop-up panel has a box per deck** in a fold-out, at least one ticked; "Remove" there removes the word altogether.
- **Studying a deck:** the chooser at the top of Review and Learn (`deck-select`, the `studyDeck` setting, a device setting; `studyWords` in `src/review.js`), left out with one deck, sharing a line with the counts; or a deck page's buttons (`studyDeck` callback in `src/main.js`). "All words" keeps the queue's order. If the studied deck is deleted, all words are studied.
- **A deck can have its own "New words per day"** (`dailyGoal`; owner): Learn's goal while it is studied, and Review's limit for cards to write again. Not inherited from the deck it is inside.
- **Deleting a deck asks what becomes of its words** (owner), in Deck settings; decks inside it go too. Words also in another deck stay there. For the rest: "Delete the deck, keep the words" moves them up one level, or to "Chinese 中文" (made again if needed); or "Delete the deck and remove N words". If the deck is the only place left for them, they can only be removed or moved first. A deleted deck leaves a mark in `removed` with `kind: 'deck'`.
- **Every deck chooser leaves out the groups inside ready-made levels** (`fillDeckSelect`; 2026-10-14 and 15), except a group that is the one chosen (`keep`). The groups stay on the Decks tab.

## Ready-made decks

- **Each HSK and TOCFL level is a deck of its own, inside no other** ("HSK 1 (3.0)", "TOCFL Novice 1"; the owner, 2026-10-14: a level takes months), after the decks made before it (`levelName`, `LEVEL_ORDER_BASE`). The radicals keep "Radicals 部首" with Common and Uncommon inside. `flattenedReadyMadeDecks` moved older devices' levels out of their list's deck; deck IDs, and so word IDs, didn't change. Details of the lists: `docs/word-lists.md`.
- **The ready-made decks stay as their lists have them** (the owner, 2026-10-18): nothing puts words in or out of one except on its own page. Select words' bar offers only the learner's own decks, and has no Move on a ready-made deck's page (`readyMadeDeck` in `src/cardsPanel.js`). A word's panel has boxes only for the learner's decks, names the ready-made ones under them ("Also in the ready-made deck TOCFL Novice 1 › Family.") and keeps them (`decksAfter` in `src/wordDialog.js`). "+ Add to deck" stays on a ready-made deck's page.
- **A word's example sentence goes into the word's group to begin with** (`deckChooser` in `src/wordPage.js`): the chooser offers the word's ready-made decks (group, else level) with their path, and the learner's own; for a word only in the learner's decks, the first of them.

## Not built

The browser's back button stepping through deck pages; ordering decks by hand; exporting or sharing a deck; per-deck card kinds; deck counts that allow for the hold between cards of one word ("due" is simply past their time, suspended cards left out).
