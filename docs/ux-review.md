# UX review and the screenshot atlas

The owner asked on 2026-10-16 for a picture of every screen at several sizes in both looks, the layout measured, a review against the usual rules of thumb, and the steps common tasks take. The review's 17 findings were all built, kept as they were, or dropped by 2026-10-17 (their outcomes are in the area files; the full review is in git, `git show 87ed508:docs/ux-review.md`). The atlas stays, for checking any change to the looks.

## The atlas

- **Run it:** `node scripts/ux-atlas.js` (about three minutes), then open `local/ux-atlas/index.html`. `SIZES=phone` runs one size. To try a style before making it, `TRY_CSS` adds lines of style to every screen from the page's first moment, and `OUT` puts the pictures in another folder (example at the top of the script). It needs what the browser tests need and uses `tests/browser/harness.js`; no dependency.
- **What it does:** starts the app in a fresh profile in headless browsers, one per size (phone 390×844, small phone 375×667, tablet 820×1180, desktop 1440×900, and held sideways: `tablet-wide`, `phone-wide`), adds the test words, and walks every screen: Review, Free practice, the menu, Decks, a deck's page, "+ Add to deck" on each tab, Words, a word's page and its Cards, the word's panel, the dictionary search, every step of a lesson for 我們, the screen between two words, one Review card of each kind before and after answering, each Settings group, and the introduction.
- **Each picture is the whole page**, the bottom of the screen marked by a dashed red line. Under each: controls, those below the fold, those under 44px, anything sticking out sideways, text cut off, text under 12px, the writing area's size; all in `local/ux-atlas/report.json`. Round buttons' invisible tap layer can't be seen by it, so they are listed as small.
- **It is not a test**: nothing fails. Run it before and after a change to the looks and compare. A step that can't be reached is listed at the top with a picture (`failed-*.png`).
- **The learner in it** has both scripts (cards in traditional) and both pronunciations, as in the browser tests, and no backup.
- The look must be changed through the app's `theme-changed` event, or Hanzi Writer keeps the other look's colors (pictures before 2026-10-17 have the outline wrong in the light look).

## What the review found, in short

- **Held up well:** nothing scrolled sideways at any size; the writing area kept its size through every step; on study screens every button was on screen.
- **Changed after it:** "About this word" kept visible on a card with a tip; the backup dot waiting until there is something to lose; Settings' Done at the top and one group at a time; a bigger writing area on a usual phone (arrows over its edges); one layout for the card's top line; a shorter introduction with Back and Next kept in view; "Add words" in an empty Review; only the grades once a card is answered; "Write the first stroke"; the characters shown faintly in the tracing steps; no text under 12.8px; 44px buttons; Learn back in the menu; a card's actions reachable from Review.
- **Kept as they were** (the owner): a deck's long page (it builds at most 200 rows, and its buttons are at the top); the skip arrow in the lesson's teaching steps (the owner uses it).
