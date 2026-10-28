# Character tips

"How to remember it": a short memory aid for a character, shown on its card in the word page's "Characters" section, under Make Me a Hanzi's line and the line on its sound part (`docs/word-page.md`). Read by `src/characterTips.js`.

`tips.tsv` has one character form a line (學 and 学 have lines of their own, as their parts differ), with tabs between the columns:

1. the character
2. the tip, in English, naming the character's parts by their characters
3. optionally, a sentence on where the character really came from, which the page shows before the tip

## How they were made, and how far to trust them

Written in October 2026 by an AI model (Anthropic's Claude Sonnet) to a brief, for this project. For each character the model was given its parts and their meanings from Make Me a Hanzi (`data/makemeahanzi/`), what the page already shows, its meanings from CC-CEDICT (`data/cedict/`) and Wiktionary's account of its origin. A tip is a way to remember the character, not its history, and says so on the page.

Checked by script: a tip names no character but the character itself and its own parts (Make Me a Hanzi's decomposition), and the origin sentence, where there is one, is backed by a passage found word for word in Wiktionary's entry. Then a second model (Claude Opus) read each tip for parts given a wrong meaning, place or look, for parts left out (so that the learner would write the character wrong), for history passed off as fact, and for tips that don't help; the tips it questioned were reworded or dropped, and it judged each origin sentence against its passage. **No person has checked them.** They may be wrong, and are meant to be corrected by hand: edit the file.

From 2026-10-28 a tip is written together with the learning note of a word it is in (`data/notes/README.md`), by the same writer from the same sources, for the forms the owner studies (traditional), and read by the same Opus judge; a character gets a tip only where it adds to Make Me a Hanzi's line, with no hint at the sound.

So far: 32 tips from a trial on 50 characters (2026-10-27); 45 and 83 more from the first two batches written with notes (2026-10-28, 92 and 156 characters, the others declined).

## License

Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), <https://creativecommons.org/licenses/by-sa/4.0/>. Credit: the 玉兔中文 (Yutu Chinese) contributors. The origin sentences draw on Wiktionary (<https://en.wiktionary.org>), whose text is available under CC BY-SA, and the tips on Make Me a Hanzi's dictionary (LGPL). They are not covered by the GPL that applies to the app's code, and are kept as separate data files.
