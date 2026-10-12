# Data derived from CC-CEDICT

Both files here are built from [CC-CEDICT](https://cc-cedict.org/wiki/), the community-maintained Chinese-English dictionary published by MDBG.

## `tones.json`

Built by `scripts/build-tone-table.js`. The `date` field inside the file says which CC-CEDICT release it came from.

It is a small extract, not the dictionary: for each single character its readings, the characters and words whose entry notes a different "Taiwan pr.", and nothing else. The app uses it to accept both Taiwan and mainland tones on tone cards.

## `dictionary.tsv`

Built by `scripts/build-dictionary.js`. Its first line says which CC-CEDICT release it came from.

It is the dictionary itself in a plainer form, one entry per line with tabs between the columns: traditional, simplified (empty if the same), pinyin, meanings, Taiwan reading. Compared with CC-CEDICT:

- pinyin is written the way the app's word lists write it (`xue2xi2`, `nv3'er2`);
- cross-references such as `學習|学习[xue2 xi2]` are reduced to the traditional form;
- measure words, notes on pronunciation and spelling, and bare pointers to other entries ("variant of", "see") are taken out of the meanings;
- a "Taiwan pr." note becomes the last column;
- entries whose reading is not plain pinyin syllables (Latin letters, digits, punctuation), and entries left with no meaning, are left out.

The app looks words up in it when a word is added in the Words tab.

## License

CC-CEDICT is licensed under the [Creative Commons Attribution-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-sa/4.0/). Both files are adapted from it and are under the same license, not under the GPL that covers the app's code.

## Updating

Run `node scripts/build-tone-table.js` and `node scripts/build-dictionary.js`. Each downloads the current CC-CEDICT and rewrites its file. Then run `npm test`, which checks that every line of the dictionary is well formed.
