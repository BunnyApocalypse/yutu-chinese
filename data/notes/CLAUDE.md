# Writing learning notes

Read before writing or checking notes in this folder. The file format, the tags and how the notes were made are in `README.md`; how a batch is run now (notes and tips together, Sonnet writers, one Opus judge) is in the git-ignored `local/study-aids/README.md`. This file holds the owner's rules and what readers and past runs taught. Older detail is in git (`git log -- data/notes/CLAUDE.md`).

## The owner's rules

- **No word gets a note twice** (2026-10-13). Notes are found by a word's simplified characters and pinyin, whichever list it came from, so the words that already have a note in any file here are taken out of the input (`gather.mjs` does this). A word a list has twice with the same simplified form and reading (了解/瞭解) gets one note.
- **A note never names its source** ("Wiktionary says…"); the credit is in `README.md` and the credits. Notes leaning on Wiktionary are CC BY-SA 4.0. Skritter's own notes are never copied.
- **Every note is in both scripts** (2026-10-29), traditional in Taiwan's standard forms (臺, 溼, 帳, 複習, 聯繫); new notes are written in both or converted with `scripts/convert-notes.js`. Every word has an example sentence, in both scripts.
- **A plain word gets only its example sentence** (2026-10-29), its note empty in both scripts, rather than filler. But a pattern that unlocks other words is worth a note even in a clear compound (公 for a male animal in 公鸡; 机 for a machine or aircraft; 条 for long thin things), as is a second everyday sense or how it differs from a close word met alongside it. That the traditional form differs is not (each script's note stands alone).
- **No bare remarks on the other script's form** (2026-10-14, 2026-10-29): "学 is the simplified form of 學", "the traditional 禮 is more complicated" are taken out. The other script is mentioned only where it explains something (发 for both 發 and 髮; 進 has 隹); a sentence on parts the other form lacks is reworded for that version.
- **Parts of characters** stay in a note only where they matter for sound or meaning and the word page's parts (tagged "meaning" and "sound" from Make Me a Hanzi) and its sound line can't say it. Facts about parts and origins come from the sources (Make Me a Hanzi, Wiktionary), not the model's memory. No "do not confuse X with Y" unless the pair really is confusable; no filler.
- **A note is about the word, wherever it is said** (2026-10-27): Taiwan or the mainland comes up only for a word or use that really differs or is used only there, and then the note gives both sides ("in Taiwan 全素, on the mainland usually 纯素"). A Taiwan fact that changes how the word is used stays (tipping, 119, ordering drinks); trivia is cut (2026-10-29). The script of a note's Chinese decides nothing about this.
- **Taiwan filler is taken out** (2026-10-25): a sentence that only repeats a traditional form or says Taiwan has or says the same ("written 麵包 in Taiwan"). A real difference stays (Taiwan says 塑膠).
- **A reader's answer is condensed, not copied in whole** (2026-10-15): a typical note is about 125 characters and 9 in 10 under 180; a correction may make one longer, but extras are trimmed to what a learner needs. Readers' answers stay on the owner's devices.
- **The Chinese in a note can be tapped** (`docs/word-page.md`), split into words by the dictionary, longest first, so no pinyin is written in, and a phrase in a note should be made of ordinary dictionary words.

## The tags

- **`native`:** every note on a reader's page that the reader has answered (silence meaning fine) gets it, corrected or not, **in the same commit as the batch's answers**. A note on a page not yet answered gets nothing. **`sources`:** see `README.md` and `local/source-check/`. **`judged`:** written checked by an Opus judge (`README.md`).
- **A tagged note rewritten for anything but its reader's answer loses `native`**, and one rewritten loses `sources` until checked again, since the reader or the check did not see the new text. Removing a sentence only keeps the tag (the reader saw all that is left).
- **The readers' pages** are private artifacts in the owner's claude.ai gallery: 台灣華語筆記校對 (80 notes, all answered and tagged), 学习笔记校对 (131 notes; #1 to #80 answered and tagged, **#81 onward next**) and TOCFL 第4級筆記校對 (148 notes, a second round for the Taiwanese reader; no answers yet). New notes' sentences marked `ask` (Taiwan and mainland usage) wait for a page.

## What readers taught, for future notes

- **The Taiwanese reader** (2026-10-14): people say 中文 (國語 is official, formal or old); 機車 is a scooter, 摩托車 an ordinary motorcycle, 重機 a big one; Taiwan says 網路, never 網絡, and writes only 著; a city bus is 公車; 姊/姐 and 念/唸 are both fine; 鼻水 and 鼻涕 are two things; drinks are ordered 正常冰, 少冰, 微冰, 去冰; most say 熊貓; 捷運 even for Japan's metro; never 台灣地區 (a mainland framing); "the word is the same in Taiwan" is filler.
- **The mainland reader** (2026-10-15 to 2026-10-21): 饭店 is a restaurant on the mainland and a hotel in Taiwan; 爱人 is a spouse, rather formal, and 情人 in everyday mainland speech usually means a partner in an affair; 计算机 is formal; check what a literal gloss really means (对不起 is "not do right by", not "cannot face you"). Each point worked in is in git.

## What runs taught

- Writers skip the character material unless told to look up every character, and leave out the character sentence unless told it is required (batches 14 to 16); count character sentences per file before judging.
- They write the spoken tone changes of 一 and 不 (yì, bú) though asked for yī and bù; check after a run.
- They put Taiwan's usual form in a traditional sentence instead of the list's (報導 for 報道), which breaks the link to the word.
- The word must stand alone in the example's pinyin (a particle split off, "wàng zhe"); a single character may be shown inside a compound (大象). The rule can push a writer into a stilted sentence; a set phrase fixes it.
- Writers running side by side must not share script names in the scratchpad.
