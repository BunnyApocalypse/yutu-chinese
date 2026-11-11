# Local development data

Large files that are fetched once for development and never shipped with the app. Everything here except this file is git-ignored.

## `wiktionary/`

Wiktionary's Chinese entries as machine-readable data, from [kaikki.org](https://kaikki.org/dictionary/Chinese/) (made with Wiktextract; CC BY-SA and GFDL, as Wiktionary is). Kept here so that scripts look things up locally instead of asking kaikki.org's server character by character (the owner's request, 2026-10-13).

- `kaikki.org-dictionary-Chinese.jsonl.gz`: every Chinese entry, one JSON object per line, about 155 MB compressed (1.2 GB unpacked; it is read compressed). Fetch it with:

      curl -o local/wiktionary/kaikki.org-dictionary-Chinese.jsonl.gz https://kaikki.org/dictionary/Chinese/kaikki.org-dictionary-Chinese.jsonl.gz

- `glyph-origins.tsv`: made from it by `node scripts/wiktionary-glyph-origins.js`: one line per character with what Wiktionary says about how the character came to be written as it is (`character<TAB>text`). This is what the scripts that prepare material for learning notes read.

## `word-list-sources/`

The files `scripts/build-word-lists.js` builds the HSK and TOCFL lists from (and Unicode's `CJKRadicals.txt`, which `scripts/build-radicals.js` builds the deck of radicals from), kept so that a rebuild does not download them again (the owner's wish, 2026-10-14; the TOCFL committee's server can take minutes for its 10 MB zip). The script fetches whatever is missing by itself, from the addresses at its top, so there is nothing to do by hand. Delete a file to have it fetched again.

The app itself uses none of this. What is written with its help (the learning notes) has to carry Wiktionary's license, CC BY-SA.

## `anki-decks/`

Real shared Anki decks, for trying the Anki import (`docs/anki.md`) on something bigger and messier than `tests/fixtures/anki/` (2026-10-21). AnkiWeb hands out its download links only to someone signed in, so these come from GitHub, where their makers publish them as files. Their licenses are unclear or non-commercial: they stay here, never in the app or the repository.

- `downloads/`: the decks as published, with no study history. Fetch them with:

      cd local/anki-decks/downloads
      gh release download v2.4 -R krmanik/Anki-xiehanzi -p 'Anki-xiehanzi-Old-HSK-2012.apkg' -p 'Anki-xiehanzi-Kangxi-Radicals-Free.apkg'
      curl -sSLO https://github.com/mrinalmanu/hanzi_3000_anki/raw/HEAD/hanzi_3000.apkg
      curl -sSLO https://github.com/missermann/anki-chinese/raw/HEAD/Ch_book1.apkg

  - `Anki-xiehanzi-Old-HSK-2012.apkg`: simplified, HSK 1–6 of 2012 in six nested decks, 4,995 notes with audio ([Anki-xiehanzi](https://github.com/krmanik/Anki-xiehanzi); word lists by Alan Davies, non-commercial).
  - `Anki-xiehanzi-Kangxi-Radicals-Free.apkg`: the 214 radicals, two note types in a Recognize and a Write deck.
  - `hanzi_3000.apkg`: 3,184 traditional characters with zhuyin ([hanzi_3000_anki](https://github.com/mrinalmanu/hanzi_3000_anki), no license given).
  - `Ch_book1.apkg`: the words and grammar points of a Taiwan textbook's first book, traditional, ten kinds of card a word ([anki-chinese](https://github.com/missermann/anki-chinese), no license given).
- `study-data/`: the same decks with made-up study histories of three learners, exported by Anki itself in its different formats. Made by `scripts/anki-study-data.py` (what each learner does is written there); it needs `local/anki-venv` (`tests/fixtures/anki/README.md`):

      local/anki-venv/bin/python -I scripts/anki-study-data.py local/anki-decks/downloads local/anki-decks/study-data

## `strictness/`

Tools for tuning the writing grading (the owner's feedback, task 9, 2026-10-24; findings in `strictness/README.md`). `hw.cjs` is a copy of `node_modules/hanzi-writer/dist/index.cjs.js` with `strokeMatches` and `parseCharData` exported at its end (MIT); make it again after updating Hanzi Writer:

    { cat node_modules/hanzi-writer/dist/index.cjs.js; echo; echo "module.exports.__strokeMatches = strokeMatches; module.exports.__parseCharData = parseCharData;"; } > local/strictness/hw.cjs

`recordings/` holds the owner's files from "Record my raw input" (Settings › For testing): their own writing, kept here, never committed.

## `source-check/`

The trial of the "From the sources" check on learning notes (`docs/history.md`, roadmap, "How sure a note is"; 2026-10-25). `sources.mjs` gives the three sources as keyed entries (`wikt:`, `mmah:`, `cedict:`); `gather.mjs` picks notes spread over a file and writes their sources for the claim-splitting pass; `verify.mjs` checks every quote word for word in its entry and writes the judge's input (claim and passage only); `tally.mjs` puts the passes together into `results.json` and `report.md`. `trial/` holds the first 50 notes of HSK 3.0 level 1 with every pass's output.

## wikipedia-dynasties/

English Wikipedia's articles on the Chinese dynasties and periods of the 朝代歌 (Xia to Qing, the Three Kingdoms' states, Yinxu, the Grand Canal, "Dynasties of China"), as plain text, fetched once on 2026-11-05 so the Opus judge of `study-aids/batch-20` could check the dynasty notes' history claims (the owner: Wikipedia, for these dynasty facts only). Source: `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&formatversion=2&titles=<title>`, one request per article, paced for the API's rate limit. CC BY-SA 4.0; used for checking, nothing copied into notes.

## logo/ (icon drafts, 2026-11-10)

- `logo-original.png`: the commissioned 兔 (three versions), copied from the owner's Downloads; `tu-1..3.png` cut from it.
- `paper.jpg`: cropped from "Old paper2.jpg", Wikimedia Commons, public domain (https://commons.wikimedia.org/wiki/File:Old_paper2.jpg; originally The Digital Yard Sale's free textures). Fetched through the Commons API at 1280px.
- `styles.html`: draft icon styles A/B/C (`?style=a&size=512`), drawn with headless Chromium.
- `washi.jpg`: a 250px square of the cream sheet in "Washi(Sugihara paper).JPG", Wikimedia Commons, by Tomomarusan, CC BY 2.5 (https://commons.wikimedia.org/wiki/File:Washi(Sugihara_paper).JPG), enlarged to 512 and brightened 12%. Full photo in `paper-candidates/washi-full.jpg`.
- `moon.html`: the moon icon with real paper, no glow (`?paper=old|washi&turn=180&size=512`); `moon-compare.png` compares them with the current icon.
- `sky-ink.jpg`: the inside of "Ink-stain-texture-15.jpg", Wikimedia Commons, by designshard, CC BY 2.0 (https://commons.wikimedia.org/wiki/File:Ink-stain-texture-15.jpg), a white spot patched, lightness mapped onto the night greens. Full photo in `ink-candidates/`.
- `dot-1..3.png`: the dot stroke (丶) cut from each 兔, used small as stars.
- `moon.html` now also takes `tu=1|2|3`, `sky=ink`, `stars=dots`, `rough=1`; `bg-compare.png` shows them.
- `speck-1..4.png`: four tiny real ink specks from the calligrapher's sheet, used as stars (`starstyle=specks`); `moon.html` also takes `layout=c` and `starstyle=mixed|aligned|specks`; `starstyle-compare.png` shows them.
- The commissioned 兔 (`logo-original.png`): by the calligrapher 南蠻大熊, licensed CC BY 4.0 (the owner, 2026-11-10). Credit them by that name.
