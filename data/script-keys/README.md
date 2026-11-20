# Checked part changes between the scripts

`part-keys.tsv` lists every change of a part between a traditional character and its simplified form that the app teaches as a "key" ("Also read simplified", `docs/cards.md`, "Reading the other script"), each checked against the whole dictionary: is the part written that way in every character that has it?

The claim is checked both ways, as it is made both ways: to a learner of traditional, "爭 is written 争 in simplified, in every character that has it"; to a learner of simplified, "争 is written 爭 in traditional, …". The two are not always equally true: every 雲 becomes 云, but 云 "to say" is 云 in both scripts, and 层 is 層.

One key a line, tab-separated: the key (`爭→争`), the verdict of the claim "in simplified", the verdict of the claim "in traditional", how many characters have the change, how many common ones are against each claim, then up to five examples of each. The verdicts:

- `everywhere`: wherever the part is, it changes this way (爭 → 争 in 淨, 靜, 掙…).
- `some`: found in several characters, but a character in common use keeps the part or changes it another way (堇 → 又 in 漢 and 難, but 勤 keeps 堇). The card says "in some characters".
- `once` (both ways): found in one character only. If it is that character's only change (a radical form on its side apart), it is a change of that character alone (時: 寺 → 寸, while 侍 and 待 keep 寺), and the card says so. If more of the character changed, it was redrawn as a whole and its two forms just happen to split alike (畫 → 画 split as 聿 → 一 and 田 → 凵田, although 律 keeps 聿 and 筆 → 笔 makes it 毛): the app teaches that character as a whole.

Which characters are looked at (`scripts/partKeyPairs.js`):

- Only pairs whose traditional form is one of Taiwan's standard forms (plane 1 or 2 of CNS 11643, `data/unihan/`), so variants such as 爲 and 擧 are left out.
- Only characters in common use count against a claim: the traditional form in plane 1 (Taiwan's frequently used characters) and the simplified one in levels 1 and 2 of the mainland's 通用规范汉字表. 廥 keeps 會, but nobody writes it, so 會 → 会 is `everywhere`.
- Make Me a Hanzi sometimes builds a traditional character from a simplified part (錚 from 争, where it should be 爭); such a character doesn't count as keeping that part.

The app reads only the first three columns (`parsePartKeyChecks` in `src/scriptKeys.js`); the rest is for people checking it.

## Source

Built by `scripts/build-part-keys.js` (run it again after updating any source; a unit test fails while the file is out of date) from:

- every one-character entry of CC-CEDICT (`data/cedict/dictionary.tsv`; the release is named in the file's header), for which characters exist and how each is simplified;
- Make Me a Hanzi's dictionary (`data/makemeahanzi/dictionary.txt`), for how each character is built;
- the standard character sets from Unihan (`data/unihan/character-sets.tsv`).

## License

Derived from CC-CEDICT, so under the Creative Commons Attribution-ShareAlike 4.0 license (<https://creativecommons.org/licenses/by-sa/4.0/>); also from Make Me a Hanzi's dictionary (GNU Lesser General Public License, version 3 or later) and Unicode's Unihan database (Unicode License v3, `data/unihan/LICENSE.txt`). Kept as a separate data file the app loads.
