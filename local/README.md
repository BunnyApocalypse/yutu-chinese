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
