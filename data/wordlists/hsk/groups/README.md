# Groups inside the HSK levels

The official HSK lists are alphabetical by pinyin inside each level, which is no order to learn words in. The files here sort the words of the lower levels into small themed groups, in an order for learning: easy, concrete, useful words first, and the grammar words fed in a few at a time between them. The app makes a deck of each group inside its level, and teaches the words in this order.

One file per level, named `<list>-<level>.tsv` (`hsk-3.0-1.tsv` is HSK 3.0 level 1). One word per line with tabs between the columns: group number, group name, simplified, pinyin. Groups are numbered in the order they are learned, and the lines of a group are in the order its words are learned. `scripts/build-word-lists.js` reads these files when it writes the lists (`withGroups`); a level without a file stays as it is.

## Where they come from

They were written for this project in October 2026, at the owner's request, and are not part of the HSK or of the projects the word lists come from. The grouping is a matter of judgment, not an official order: it was made by AI models (Anthropic's Claude) working to a brief, checked by a script for completeness (every word of the level exactly once, groups of 12 to 40 words) and read through once more afterwards. A word may well sit better elsewhere; the files are meant to be corrected by hand.

Only the grouping and the group names are this project's own. The words themselves are those of the lists in the folder above, whose README has their sources and license.

## License

The grouping and the group names are under the MIT License, like the word lists beside them (the owner's choice, 2026-10-13):

> Copyright (c) 2026 the 玉兔中文 (Yutu Chinese) contributors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Changing them

Edit a file, then run the build script. Changing a group's name or number changes the ID of its deck in the app (see `listTag` in `src/words.js`), so words already added from the list stay in a deck with the old name.
