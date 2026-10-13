# HSK word lists

The word lists of the HSK (Hanyu Shuiping Kaoshi, 汉语水平考试), mainland China's test of Chinese for learners, which the app offers under "Add a ready-made list".

| File | List | Words |
|---|---|---|
| `hsk-3.0.tsv` | HSK 3.0, the standard published in 2021: levels 1 to 6 and an advanced band 7-9 | 11,054 |
| `hsk-2.0.tsv` | HSK 2.0, the six-level standard of 2012 that it replaces | 5,008 |

Both are built by `scripts/build-word-lists.js`, one word per line with tabs between the columns: level, simplified, traditional, pinyin, meaning. The meaning is empty wherever the app's dictionary has the word with that reading (nearly always); the app then proposes one from the dictionary.

## Sources

- **HSK 3.0:** [ivankra/hsk30](https://github.com/ivankra/hsk30), `hsk30-expanded.csv` at commit `4ff9e39`: the official list cleaned up, with each term matched to its CC-CEDICT entry. That match was made against an older CC-CEDICT, so each term is matched again to the app's dictionary, by its characters and reading, and takes its traditional form and reading from there. Rows that are only examples of a prefix or suffix are left out, and a term listed in two variants is two words.
- **HSK 2.0:** [glxxyz/hskhsk.com](https://github.com/glxxyz/hskhsk.com), the "HSK Official With Definitions 2012" files at commit `8a6f229`. Only its words and levels are used as they are. Its traditional forms were converted character by character and its pinyin has tones as spoken, so each word takes its traditional form and reading from the same word in the HSK 3.0 list or in the app's dictionary; the source's reading decides where there are several.
- **`extra-meanings.tsv`:** readings and meanings for the 50 terms that CC-CEDICT has no entry for, or reads differently (车上, 不太, 打篮球 and the like). Written by hand for this project.

## License

Both source projects are under the MIT License, which asks that this notice stay with copies of their data:

> Copyright (c) 2023 Ivan Krasilnikov, Copyright (c) 2021 Shawky (ivankra/hsk30)
> Copyright (c) 2020 Alan Davies (glxxyz/hskhsk.com)
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The files here, being derived from them, are offered under the same license. `extra-meanings.tsv` is this project's own and under the GPL like the app's code.

## Updating

Change the two version constants at the top of `scripts/build-word-lists.js` and run it. It reads `data/cedict/dictionary.tsv`, so rebuild the dictionary first if that is to change too.
