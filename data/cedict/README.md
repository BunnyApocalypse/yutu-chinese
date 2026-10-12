# Tone table derived from CC-CEDICT

`tones.json` is built from [CC-CEDICT](https://cc-cedict.org/wiki/), the community-maintained Chinese-English dictionary published by MDBG, by `scripts/build-tone-table.js`. The `date` field inside the file says which CC-CEDICT release it came from.

It is a small extract, not the dictionary: for each single character its readings, the characters and words whose entry notes a different "Taiwan pr.", and nothing else. The app uses it to accept both Taiwan and mainland tones on tone cards.

## License

CC-CEDICT is licensed under the [Creative Commons Attribution-ShareAlike 4.0 International License](https://creativecommons.org/licenses/by-sa/4.0/). `tones.json` is adapted from it and is under the same license, not under the GPL that covers the app's code.

## Updating

Run `node scripts/build-tone-table.js`. It downloads the current CC-CEDICT and rewrites `tones.json`.
