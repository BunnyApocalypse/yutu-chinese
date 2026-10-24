# Things that are easy to get wrong

## The study area

- **The study area is shared by all card kinds.** `showPartsFor` in `src/review.js` decides which parts show for each kind, and Free practice needs the writing parts back (`deactivate`). A new element in the study area must be added there.
- **A flow that is not on screen must ignore taps.** `toneFlow` and `recallCard` both listen on the card face; each checks it has a current card, and `review.js` calls `stop()` on both before the next card.
- **On a tone card a tap is an answer** (a dot is the neutral tone). A mark begins only on a finger coming down (`pointerdown`), so the touch that brought a character up is never taken for a dot; no pause is needed (until 2026-10-24, 300 ms). A stroke the recognizer can't classify is neither answer nor mistake; the card says so and waits. The tone mark's layer is removed by `replaceChildren`; `ask()` puts it back each time.
- **The writing area is an SVG element, which has no `.hidden` property.** Hide its row (`#writing-row`) or use `toggleAttribute('hidden', ...)`.
- **In Review the outline is switched off at the start of every word**; left on, it counts as peeking and every suggestion becomes Again. **`wordFlow.start` sets the outline before the stroke data loads**, so "Hide outline" tapped while loading isn't undone.
- **A dialog's `close` event can come late**, after the next tap is handled: closing a word's page once closed the popup of a word tapped on the card beneath, so the next tap moved a lesson on. A `close` handler must check that what it undoes belongs to its dialog (`dialog.contains(peekCard)` in `src/wordPage.js`).
- **Fold-out headings (`summary`) can't be selected**: with a pen, a tap that slides would select the text, and a tablet then neither opens nor closes the fold.

## The writing area's size

- **The writing area is the point of the app and must stay the biggest thing on the screen** (the owner, 2026-10-14, after it was made smaller to fit a lesson's rows; that was undone). **The rule, in the owner's words: the top and the bottom are sized to hold everything that can appear in Learn and in Review, and the canvas stays a constant size.** `chooseSize` in `src/wordFlow.js` reserves a fixed height for everything else (380). Room is found by trimming the rows around it, never by raising that number. The four grade buttons must fit side by side at phone width, and the review screen fit without scrolling. So:
  - every line above the area keeps its room when empty (meaning, pinyin, the slots and status line), and nothing is reserved under the buttons; **nothing is added under the grades, and nothing above the area changes height while a word is written** (the owner, from a screencast);
  - **focus:** while a card is up, the screen's name and the counts line are put away (`main.focused`, `setFocus`) and ☰ (or the way back) sits in the corner;
  - **the meaning takes one line**, bold at `--size-big` in the room the smaller size had (its min-height and line-height in `src/style.css`; change them together), a tap on a cut-off one opening it in a panel (`clampWithPopup` in `src/clamp.js`); a sentence's writing card allows two;
  - **the slots and the status line share one row** (`.progress-row`); a word of one character has no slots (`.word-row.single`) but the row keeps its height. Only a word too long for the width wraps it;
  - **a lesson's note must fit beside "I know this word" on one line on a phone**, or the area moves down at that step;
  - **the card's top line** (kind of card, About and Edit, the loudspeaker) keeps 30px clear of the corner under 600px wide, with tighter gaps under 390px (`main.focused .type-row`). It **sits on the corner's center line** (main's top padding 6px while a card is up; the owner, 2026-10-18). **In Learn the kind of card is centered** (`main.learning`), at the left in Review. It is `--size-small`, except in Review under 390px wide, where it would take two lines.
- **The card sits at the same height whatever its kind** (the owner: the canvas jumped between a lesson's steps): `showPartsFor` makes the slots and status line invisible (`ghost`) rather than removing them, and the card's face is exactly the writing area's size. With a tip on it, the face scrolls and "About this word" stays at its bottom edge (`position: sticky`); when the tip fits, word and tip are centered above it. **A tone card's face looks like the writing area**, its guide lines a picture used as a stencil (`mask-image`) over `--grid`, since a named color can't be used inside a picture.
- **Two columns on a screen held sideways** (2026-10-17; the owner: "we wont be able to stop people from going into landscape"): where clearly bigger (`chooseSize`: wider than tall, at least 60px gained), the area or card face is placed on the right (☰ stays clear, buttons away from a right-hand pen), up to 760px, the rest in a 360px column on its left (`data-layout="wide"`, `WIDE_SIDE_COLUMN`, `--wide-side`). **Not to do again:** as a grid, text widening the second column shifted the area under the pen; and a column taller than the screen made the atlas's full-page picture resize the window, which rebuilt the area and wiped the character. The atlas has `tablet-wide` and `phone-wide`. **The grades on a tablet held sideways** (the owner, 2026-10-20, from pictures, after tester 3 found them small): stacked one a line across the 360px column (`--tap-large`), Again at the top, at the column's bottom with their bottom level with the card's (main as tall as the area, the study area filling it, the grades `order: 10` and `margin-top: auto`, the empty footer taking no room). Only from 640px tall (`@media (min-height: 640px)`): on a phone held sideways the stack made the column taller than the screen, which scrolled the page and wiped the character in the atlas; there the four stay side by side.
- **A card's text grows with it** (the owner: "comically small" on a big screen): `.card-face` is zoomed by `--face-zoom` (area size over 400, at least 1). **`zoom` also scales placement and what is measured on it**: `top`/`right` are divided by the zoom in two columns, and so are the tone mark's points (`zoomOf` in `src/toneFlow.js`).
- The window `resize` handler reacts only to width changes: on Android the keyboard changes the height, and that must not wipe a character in progress.

## Hanzi Writer

- **It remembers quiz options from one quiz to the next.** Pass `quizStartStrokeNum` on every `quiz()` call (0 for a normal start), or a later quiz silently starts partway through.
- **Don't replace its character from inside one of its own callbacks.** `resume` in `src/quiz.js` waits a tick first.
- **`charData` in `src/quiz.js` is what Hanzi Writer holds, which may be rearranged; `baseData` is the data as loaded.** Its stroke numbers refer to `charData`; `altOrder` and `sequence` to `baseData`.
- **Never create a new Hanzi Writer per character**: each adds touch listeners that are never removed. Use `setCharacter()` (the one exception: rebuilding after a screen rotation).
- **`setCharacter()` rebuilds its layers and hides the outline**, and it adds its layers only once the data has loaded, later ones on top; so `start()` re-appends the layer of drawn strokes and re-applies the outline setting each time.
- **It colors a radical's strokes separately** (`radicalColor`, defaulting to `strokeColor` only at creation): change both (`setPrintedColor`).
- **It works out touch positions from the SVG's on-screen size**, so the `width`/`height` passed to it must match the real size. Don't scale the SVG with CSS. The area needs `touch-action: none`, or drawing scrolls the page on a phone.

## Stroke data

- **Only 1,013 traditional characters have Taiwan-standard stroke data.** The big set (`hanzi-writer-data`, from Make Me a Hanzi) draws traditional characters in mainland forms: 為 as 爲 (12 strokes), 說 as 説, 辶 and 艹 with 3 strokes. animCJK fixes those it covers; the rest (吃, 真, 骨) may differ from the Taiwan standard. Taiwan's MOE data would be complete but is CC BY-NC-ND, so it can't be converted and redistributed.
- **The script decides the form even for characters both scripts share** (花, 起, 道), and **stroke numbers can differ between the sets** (花: 8 in one, 7 in the other). Always pass the script to `loadCharData`; never cache by character alone; derive stroke numbers from the data in use, as `src/shortcuts.js` does.
- The slot row sets `lang` so the device picks the right regional font, not Japanese or mainland glyphs.
- Vite's dev server answers a missing file with the app's HTML page and status 200, so `loadCharData` treats "not valid JSON" as "no stroke data".
- The copy script ships `ARPHICPL.TXT` alongside the stroke data.

## The browser and the network

- `crypto.randomUUID()` only exists on HTTPS or localhost, so it fails on the LAN dev address; `randomId()` in `src/db.js` uses `crypto.getRandomValues()`.
- Service workers and installing only work over HTTPS or on `localhost`, so they can't be tested from a phone on the LAN dev address: use the deployed test copy, or the built app at a `localhost` address on the computer (`docs/offline.md`).
