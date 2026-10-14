# Radicals (部首)

The ready-made deck of radicals, which the app offers in the Decks tab beside the HSK and TOCFL lists (asked for by the owner on 2026-10-14).

`radicals.tsv` has all 214 Kangxi radicals in the format of the other lists (level, simplified, traditional, reading, meaning), in two levels, each most useful first:

- **Common:** the 80 radicals that are the radical of at least 10 of the 4,316 characters in the HSK and TOCFL lists. Together they are the radical of 88% of those characters.
- **Uncommon:** the other 134.

Usefulness is counted with all of a radical's forms together (氵 and 水 are one radical). A common radical brings each of its forms that is the radical of at least 3 of those characters (心 and 忄, 火 and 灬); an uncommon one brings its main form. That makes 230 lines: 96 common, 134 uncommon.

A line with a reading is a word of the HSK or TOCFL lists written the same way (水, 口, 馬/马): the app treats it as that word, with the same ID, and takes its meaning from the dictionary. A line with no reading is a radical of its own (氵, 扌, 糹/纟), with meaning and writing cards only (`src/radicals.js`); its meaning comes from `meanings.tsv`. A word whose only reading in the lists is neutral (子 as the suffix zi) is a radical of its own instead, since that word is not the radical.

Three Kangxi forms are old shapes and are replaced by the shapes written today: 靑 by 青, 襾 by 覀, and 戶 has 户 as its simplified form. 阝 is two Kangxi radicals (阜 on the left, 邑 on the right) but one form; it is counted under 阜, and 邑 is among the uncommon ones.

## How it is made

`node scripts/build-radicals.js` builds `radicals.tsv` from:

- Unicode's `CJKRadicals.txt` (version 16.0.0), which lists each Kangxi radical and its simplified form. It is downloaded once into the git-ignored `local/word-list-sources/`. Unicode License v3, a permissive license; only the radicals' numbers and forms are used.
- Make Me a Hanzi's `data/makemeahanzi/dictionary.txt`, for each character's radical (LGPL-3.0; only the counts are used).
- The HSK and TOCFL lists in `data/wordlists/`.
- `meanings.tsv`: the meanings of the radicals that are not words, written by hand for this app from the radicals' traditional names. A side form's meaning names its full form ("water (side form of 水)"), since the meaning is what a writing card asks for.

## License

`radicals.tsv` and `meanings.tsv` are under the MIT License, like the groups of the HSK lists.
