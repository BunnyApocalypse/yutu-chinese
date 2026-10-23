# Skritter test file

`export.zip` is a small, **made-up** Skritter export that `tests/skritterImport.test.js` and `tests/browser/skritter.browser.js` read (`docs/skritter.md`). It has the shape of the .zip Skritter's support sends when asked for a learner's data: a folder of JSON files named `export_<account>_<Name>_<date>.json`, and the `__MACOSX` files a Mac adds. Only the files and fields the import reads are in it. Nothing in it comes from a real export.

What each card is meant to show is commented in `make-fixture.js`: a word studied in traditional with all four cards, one of them without Skritter's memory; a word the same in both scripts with a card never studied and banned in Skritter; a word with two traditional forms; a word the dictionary lacks; a writing card studied in simplified; a list of the learner's own; an answer seen in a lesson without a grade.

## Making it again

```
node tests/fixtures/skritter/make-fixture.js
```

It needs the `zip` command. Written by the project, under the app's license (GPL-3.0-only).
