# TOCFL word list

The word list of the TOCFL (Test of Chinese as a Foreign Language, 華語文能力測驗), Taiwan's test of Chinese for learners, which the app offers under "Add a ready-made list".

`tocfl.tsv` has 7433 words in seven levels: Novice 1 and 2 (準備級), then levels 1 to 5 (入門級, 基礎級, 進階級, 高階級, 流利級). One word per line with tabs between the columns: level, simplified, traditional, pinyin, meaning (always empty: the app proposes a meaning from its dictionary).

The four lower levels (Novice 1 to Level 2) have a sixth column, the word's topic. The committee's sheets for those levels sort the words under twelve topics (任務領域, "contexts"), the same in each; the higher levels have none. The app makes a deck of each topic inside its level. The column holds the topic's number within the level and its name, as in `03 Education 教育`. The English names are this project's translations (`TOCFL_TOPICS` in the build script), not the committee's.

## Source

The 華語八千詞表 of July 2023, published by the test's Steering Committee (國家華語測驗推動工作委員會): `8000zhuyin_202307.zip` from <https://tocfl.edu.tw/>, which holds a spreadsheet with one sheet per level. `scripts/build-word-lists.js` downloads and reads it.

The list gives each word in traditional characters with its pinyin in tone marks, and nothing else. So every word is matched to the app's dictionary, by its characters and reading, for its simplified form and for a reading written the way the app writes them. Where a cell holds several things (你/妳, 爸爸/爸, 車(子)), each form is a word here.

**79 of the list's entries are left out**, because the dictionary does not have them with that reading. Most are spellings Taiwan uses and CC-CEDICT files under another character (汙染, 祕密, 電台, 部份), or rows where the list itself has a slip. The script prints them when it runs.

## License

**The source states no license.** Neither the file nor the page it is offered on says under what terms it may be reused. It is the official word list of a public test, published for learners and teachers to use, and the project's owner decided on 2026-10-13 to include it on that understanding, and on 2026-10-19 to keep it without asking the committee; it will be removed if the committee asks. It is not covered by the GPL that applies to the app's code, and anyone passing it on should check the committee's terms for themselves.

## Updating

When the committee publishes a newer file, change `TOCFL_SOURCE` at the top of the TOCFL part of `scripts/build-word-lists.js` and run the script.
