# UX review and the screenshot atlas

Asked for by the owner on 2026-10-16, as groundwork for the pass over the
looks (`docs/interface.md`): a picture of every screen at phone, tablet and
desktop size in both looks, the layout measured, a review against the usual
rules of thumb, and the number of steps the common tasks take. Nothing in the
app was changed. **Each finding is a proposal**, for the owner to sort into
"plainly broken, fix now" and "for the pass over the looks". **They are on
the to-do list** at the top of `docs/history.md`, each to be discussed with
the owner before it is fixed.

## The atlas

- **Run it:** `node scripts/ux-atlas.js` (about three minutes), then open
  `local/ux-atlas/index.html` in a browser. `SIZES=phone` runs one size.
  To compare a change before making it, `TRY_CSS` adds a few lines of style
  to every screen and `OUT` puts the pictures in another folder (example at
  the top of the script); the first use, 2026-10-17, set the quiet buttons
  gray beside blue (`local/quiet-compare/`). It
  needs what the browser tests need (Chromium on the computer, the stroke
  data copied), and adds no dependency: it uses `tests/browser/harness.js`.
- **What it does:** starts the app in a fresh profile in four headless
  browsers at once, one per size (phone 390×844, small phone 375×667, tablet
  820×1180, desktop 1440×900), adds the test words, and walks 35 screens: Review empty, Free
  practice, the menu, Decks, a deck's page (folded and unfolded), Words, a
  word's page and its Cards fold-out, the word's pop-up panel, the dictionary
  search and a dictionary word, every step of a lesson for 我們 (with raw
  input halfway through a character), the screen between two words, Review's
  writing and meaning cards with their grades, Settings (as it opens and
  unfolded) and the five screens of the introduction.
- **Each picture is the whole page**, with the bottom of the screen marked by
  a dashed red line; a pop-up is pictured as seen. Under each, what was
  measured: the number of controls, those below the bottom of the screen
  ("the fold"), those under 44px (what Apple and Google recommend; the app's
  rule is 24px), anything sticking out sideways, text cut off, text under
  12px, and the writing area's size. Everything is also in
  `local/ux-atlas/report.json`.
- **It is not a test:** nothing fails. Run it again after a change to the
  looks and compare. A step that cannot be reached is listed at the top of
  the page with a picture of where it stopped (`failed-*.png`).
- **The learner in the atlas** has both scripts with cards in traditional
  and both pronunciations, as in the browser tests, and has made no backup
  (so the backup reminder's red dot shows from the start).

## What was measured (2026-10-16)

| | Phone 390×844 | Small phone 375×667 | Tablet | Desktop |
|---|---|---|---|---|
| Scrolls sideways anywhere | no | no | no | no |
| Writing area | 294px, 75% of the width | 279px, 74% | 640px, 78% | 520px, 36% |
| Writing area the same size in every step | yes | yes | yes | yes |
| Study screens with a control below the fold | none | none | none | none |
| Settings: controls / under 44px / height | 39 / 31 / 1,833px (3,760 unfolded) | 39 / 30 / 1,852px | 39 / 32 / 1,597px | 39 / 32 / 1,597px |
| A deck's page: controls / height | 141 / 8,802px | 141 / 8,802px | 141 / 8,672px | 141 / 8,672px |
| Words: controls / height | 117 / 8,371px | 117 / 8,371px | 117 / 8,245px | 117 / 8,245px |
| Introduction: Next below the fold | screen 2 | screens 2 to 5 | never | never |
| Between two words: storage message's buttons below the fold | no | yes | no | no |

What holds up well: nothing sticks out sideways at any size; the writing
area keeps its size through all five lesson steps and Review; on every study
screen all the buttons are on screen without scrolling; the two looks match.

## Findings, most important first

Severity: **high** gets in the way of studying or misleads; **medium** slows
down or confuses; **low** is polish.

1. **High. The card's face hides its own end** (lesson step 1, meaning and
   pinyin cards in Review). The note, the example sentence and "More about
   this word" are in a box that scrolls inside itself, and "More about this
   word" is cut in half at its bottom edge (`13-lesson-step1`,
   `16-review-meaning-grades`), while about 330px of the phone's screen below
   is empty. A box that scrolls inside itself is easy to miss on a touch
   screen. Possible fix without changing the writing area: put "More about
   this word" outside the box, under it.
2. **High. The red dot is there from the first minute.** It comes on as soon
   as there are words and no backup, on ☰ and on Settings, before anything
   has been studied. What it means is said only when the mouse rests on ☰
   (there is no such thing on a phone) and in the last group of Settings,
   below the fold. To a new learner it looks like an error. Possible fix:
   wait until there is something to lose (some days of reviews), and say
   what it is in a line where it shows.
3. **Medium. Settings is a long pop-up whose only way out is at its bottom.**
   On a phone it is 1,833px tall as it opens, and "Done" comes after all of
   it. A word's page already keeps its buttons in a bar along the bottom that
   stays put; Settings could do the same, or have a close button at the top.
   31 of its 39 controls are under 44px (the group headings are 24 to 34px
   tall).
4. **Medium. A deck's page is the longest screen in the app:** 141 controls
   and 8,800px on a phone for 109 words. Back, the path, three buttons, the
   decks inside, three fold-outs for adding, then every word. The same list
   is on the Words tab. With an HSK level of 500 words this will be the
   screen that feels heaviest. Possible fix: the first rows and "All its
   words" (which opens Words on that deck), or the list folded away like the
   ways of adding.
5. **Medium. On a usual phone the writing area could be bigger.** It is
   294px on a 390×844 phone, with 280 to 330px empty under the buttons in
   every step. On a small phone (375×667) it is 279px and the fullest step
   (the lesson's last, with the grades) fits with about 50px to spare: the
   area seems sized for the smallest screen and not to grow with a taller
   one. It is the biggest thing on the screen, as the rule says, but a
   390×844 phone has room for about 350px. Growing it with the height of the
   screen would have to keep it the same size in every step
   (`docs/pitfalls.md`).
6. **Medium. The top line changes between steps.** In the lesson's last step
   and in Review, "About" and "Edit" appear next to the kind of card and the
   line moves to the left; in the other steps they are not there. The lesson
   has no title of its own ("Learn" is shown only between two words), and ☰
   is the only way out of it. On a small phone (375px) the line is full:
   "NEW WORD · STEP 5 OF 5" runs up against ☰ and its red dot
   (`14-lesson-graded`, small): plainly broken, if small.
7. **Medium. The introduction's second screen asks two questions** (script
   and pronunciation) with five paragraphs; on a phone, Next is below the
   fold, so the screen looks finished before it is. On a small phone Next is
   below the fold on screens 2 to 5, and so are the storage message's
   buttons on the screen between two words.
8. **Medium. Review with no words says "Add some in Decks, in the menu"**
   without a button there, while Review with words waiting in Learn has one
   ("Learn new words"). A button "Add words" to Decks would make the first
   step one tap.
9. **Low-medium. The skip arrow (›) is close to the writing area** (8px on
   a phone, 28×96px, a symbol only) and appears in the lesson's teaching
   steps too. A tap on it counts the character as passed. The back arrow
   undoes it, so this is a question rather than a fault: is skipping wanted
   while a word is still being taught?
10. **Low-medium. Two rows of buttons under the writing area at the end of a
    lesson and in Review**: Restart, Show outline, Animate, then the four
    grades, all the same shape. This is part of the "busy" Learn screen from
    the first testing session. One idea: once the word is done, show only
    the grades (the tools are no use then).
11. **Low. "No mistakes" before the first stroke** (Free practice, Review's
    writing card). It reads as praise for nothing; the stroke count alone, or
    "Write the first stroke", would say where one stands.
12. **Low. In a lesson's step 3 the boxes for the characters show "·"**
    while the word's reading and meaning are shown above; the characters
    themselves could be shown there, since this step teaches them.
13. **Low. Text under 12px:** "MEANING" and "SOUND" under the parts on a
    word's page (11.2px).
14. **Low. Most buttons are 32 to 40px tall**, under the 44px recommended
    (already noted in `docs/interface.md`, "Accessibility"). The atlas lists
    them per screen.

## How many steps the common tasks take

On a phone, from the app as it opens (it opens in Review). A step is a tap;
typing is not counted.

| Task | Steps | The way |
|---|---|---|
| Review what is due | 0 | It opens there |
| Learn new words, nothing due | 1 | "Learn new words" in Review |
| Learn new words, cards due | 3 | ☰ › Decks › Learn on the deck's row |
| Look at the word of a card | 1 | About |
| Correct a word's meaning, from its card | 2 | Edit › Save |
| Correct a word's meaning, otherwise | 5 | ☰ › Words › its row › Edit › Save (with a search: typing) |
| Add one word | 5 | ☰ › Decks › the deck › Add a word › Add word |
| Add HSK 3.0 level 1 | 4 | ☰ › Decks › Ready-made decks › Add on Level 1 |
| Suspend a card Review calls a leech | 1 | "Suspend this card" under the grades |
| Suspend any other card | 5 | ☰ › Words › its row › Suspended cards › its box |
| Start a card over | 6 | ☰ › Words › its row › Cards › Start over › Yes |
| Practice any character | 4 | ☰ › Words › Free practice › Practice |
| A hint while writing | 0 or 1 | Hold on the writing area, or Show outline |
| Export a backup | 3 or 4 | ☰ › Settings › (Your data and backups) › Export backup, with scrolling |
| Change the script | 3 | ☰ › Settings › the Script list |

What this shows:

- **Studying is short**; managing is not. Every task about one word goes
  through ☰ › Words and its row, and suspending or starting over a card is
  then one fold-out further.
- **Suspending a leech is no longer six steps**: `docs/interface.md` lists
  that among the structure review of 2026-10-13; "Suspend this card" in
  Review has made it one.
- **Free practice takes four steps** and is under Words; where it belongs is
  already on the list for the pass over the looks.
- **Learn takes three steps whenever cards are due**, which is most days
  once studying has started. A Learn button in Review next to the counts
  (or Learn back in the menu) would make it one.
