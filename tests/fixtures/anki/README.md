# Anki test files

Small Anki exports that `tests/ankiImport.test.js` reads, to check that the app reads every format a learner may bring from Anki (`docs/anki.md`):

| File | What it is |
|---|---|
| `new.apkg` | A deck exported from a current Anki: the collection compressed with zstd, laid out in "schema 18". |
| `legacy.apkg` | The same deck with "Support older Anki versions" ticked: schema 11, not compressed. |
| `shared.apkg` | The same deck without scheduling information, as shared decks come. |
| `whole.colpkg` | The whole collection, as Anki's "Export collection" makes it. |

They hold one made-up collection: a note type for Chinese with three cards (Recognition, Recall, Listening), Anki's Basic, nested decks, and cards in every state the import handles (reviews with a lapse, Anki's FSRS memory, a suspended card, a card reset to new, a card in its learning steps, a word in two notes, a note that is not a word, a note never studied). What each card is meant to show is commented in the script.

## Making them again

`make-fixtures.py` makes all four with Anki's own Python package (version 26.09.3 when they were made), which is not one of the app's dependencies:

```
python3 -m venv local/anki-venv
local/anki-venv/bin/pip install anki
local/anki-venv/bin/python -I tests/fixtures/anki/make-fixtures.py
```

Anki gives notes and cards new IDs each time, so the files change with every run; the tests don't depend on the IDs.

## License

The words, meanings and schedules were written for this project. The files are made by Anki (AGPL-3.0-or-later) and carry its standard note types (Basic, Cloze and the like, with their templates) and, in `collection.anki2`, the stand-in note a current Anki puts there for older versions. They are test data only: nothing here is part of the app or shipped with it.
