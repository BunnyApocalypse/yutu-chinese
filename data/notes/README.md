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

So far there is one level, written as a trial: HSK 3.0 level 1, 509 words.

## How they were made, and how far to trust them

They were written in October 2026 by an AI model (Anthropic's Claude Sonnet) working to a brief, for this project. For what it says about how characters are built, the model was given two sources and told to use nothing else: the character dictionary of Make Me a Hanzi (`data/makemeahanzi/`) and the glyph-origin sections of the English Wiktionary's entries for the characters. Usage remarks and example sentences are the model's own.

A script checked the form (every word once, lengths, that each sentence contains its word); samples were read by another model and by the project's owner. **No fluent speaker has checked them line by line.** A note may be wrong, and an example sentence may be stiff. They are meant to be corrected by hand: edit the file.

A note does not name its sources; this file does.

## License

Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0), <https://creativecommons.org/licenses/by-sa/4.0/>. Credit: the Hanzi Trainer contributors. The notes draw on Wiktionary (<https://en.wiktionary.org>), whose text is available under CC BY-SA, and on Make Me a Hanzi's dictionary (LGPL). They are not covered by the GPL that applies to the app's code, and are kept as separate data files.
