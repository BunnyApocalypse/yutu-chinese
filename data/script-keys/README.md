# Checked part changes between the scripts

`part-keys.tsv` lists every change of a part between a traditional character and its simplified form that the app teaches as a "key" ("Also read simplified", `docs/cards.md`, "Reading the other script"), each checked against the whole dictionary: is the part written that way in every character that has it?

One key a line, tab-separated: the key (`爭→争`), the verdict, how many characters have the change, keep the part, or change it another way, then up to five examples of each. The verdicts:

- `everywhere`: wherever the part is, it changes this way (爭 → 争 in 淨, 靜, 掙…).
- `some`: found in several characters, but others keep the part or change it another way (堇 → 又 in 漢 and 難, but 勤 keeps 堇). The card says "in some characters".
- `once`: found in one character only. If it is that character's only change (a radical form on its side apart), it is a change of that character alone (時: 寺 → 寸, while 侍 and 待 keep 寺), and the card says so. If more of the character changed, it was redrawn as a whole and its two forms just happen to split alike (畫 → 画 split as 聿 → 一 and 田 → 凵田, although 律 keeps 聿 and 筆 → 笔 makes it 毛): the app teaches that character as a whole.

The app reads only the first two columns (`parsePartKeyChecks` in `src/scriptKeys.js`); the rest is for people checking it.

## Source

Built by `scripts/build-part-keys.js` (run it again after updating either source) from:

- every one-character entry of CC-CEDICT (`data/cedict/dictionary.tsv`; the release is named in the file's header), for which characters exist and how each is simplified;
- Make Me a Hanzi's dictionary (`data/makemeahanzi/dictionary.txt`), for how each character is built.

## License

Derived from CC-CEDICT, so under the Creative Commons Attribution-ShareAlike 4.0 license (<https://creativecommons.org/licenses/by-sa/4.0/>), and from Make Me a Hanzi's dictionary, under the GNU Lesser General Public License, version 3 or later. Kept as a separate data file the app loads.
