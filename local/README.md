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
