# Learning notes

A short note and an example sentence for each word of a level of a ready-made word list, shown on the word's page in the app: what the word is made of, something worth knowing about using it, and a sentence it occurs in.

One file per level, named like the level's group file (`hsk-3.0-1.tsv` is HSK 3.0 level 1). One word per line, in the order the level is taught, with tabs between the columns:

1. the word in simplified characters
2. its pinyin as the app stores it (tone numbers)
3. the note, in English, with Chinese in simplified characters
4. the example sentence in simplified characters
5. the same sentence in traditional characters (Taiwan forms)
6. the sentence's pinyin with tone marks, a space between words (the app tells the words of the sentence apart by these spaces)
7. the sentence in English

So far: HSK 3.0 levels 1 (509 words, written as a trial) and 2 (755 words), written on 2026-10-13; levels 3 (931 words), 4 (977) and 5 (1,056), written on 2026-10-14 (level 3 leans on usage more than on how characters are built); `tocfl-novice.tsv`, the 74 words of the TOCFL's two beginner levels that those do not cover; `tocfl-1.tsv` to `tocfl-3.tsv`, the 44, 112 and 301 words of the TOCFL's levels 1 to 3 that none of the others cover (2026-10-14); and `tocfl-4.tsv`, the 1,135 words of its level 4 that none of the others cover (2026-10-14, the same evening). A word has one note, whichever list it is met in. The notes for the HSK levels have the Chinese inside the note in simplified characters; those written for the TOCFL have it in traditional characters and describe Taiwan's usage first.

`radicals.tsv` is of another kind: notes about parts of characters. The first 60 lines are the radicals that occur most often in the lower levels' words (2026-10-13); the other 96 (2026-10-14) complete the deck of radicals (`data/wordlists/radicals/`), so that every radical there that is not a word has a note. Those 96 were written by a Sonnet model from the same sources plus the characters of the lists each radical is in; their examples were then checked by a script against Make Me a Hanzi, keeping only forms that really have the radical (the model had written pairs like 殺/杀 where only one of the two has it). It has the radical in the first column, nothing in the second, and the note in the third, with no example sentence. The app shows such a note on the page of a part of a character, whatever reading the part has. (One was rewritten by hand: 王, which the model, kept to its sources, had described as having no theme; as a radical it is jade, 玉.) These notes were written from what Make Me a Hanzi says of the characters each radical occurs in, and from Wiktionary for the radical's own origin.

## How they were made, and how far to trust them

They were written in October 2026 by an AI model (Anthropic's Claude Sonnet) working to a brief, for this project. For what it says about how characters are built, the model was given two sources and told to use nothing else: the character dictionary of Make Me a Hanzi (`data/makemeahanzi/`) and the glyph-origin sections of the English Wiktionary's entries for the characters. Usage remarks and example sentences are the model's own.

A script checked the form (every word once, lengths, that each sentence contains its word); samples were read by another model and by the project's owner. **No fluent speaker has checked them line by line.** Native speakers have checked only the notes whose writers were unsure, or that make claims about region, register or politeness: a Taiwanese reader on 2026-10-14, and a mainland reader from 2026-10-15. A note may be wrong, and an example sentence may be stiff. They are meant to be corrected by hand: edit the file.

A note does not name its sources; this file does.

## License

Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), <https://creativecommons.org/licenses/by-sa/4.0/>. Credit: the 玉兔中文 (Yutu Chinese) contributors. The notes draw on Wiktionary (<https://en.wiktionary.org>), whose text is available under CC BY-SA, and on Make Me a Hanzi's dictionary (LGPL). They are not covered by the GPL that applies to the app's code, and are kept as separate data files.
