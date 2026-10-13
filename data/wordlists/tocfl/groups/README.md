# Groups inside the TOCFL levels that have no topics

The committee's list sorts the words of the four lower levels under twelve topics, which the app uses as they are. From level 3 on it gives none, and the words are in alphabetical order. The files here sort such a level into small themed groups in an order for learning, exactly as `data/wordlists/hsk/groups/` does for the HSK: see the README there for the file format, how the groups were made (by AI models to a brief, checked by a script, meant to be corrected by hand) and how to change them.

One file per level: `tocfl-3.tsv` is level 3 (進階級). The words are given in simplified characters with the pinyin the app stores, which is how the build script finds them; the app shows them in whichever script is being learned.

The grouping and the group names are under the MIT License, with the same notice as in `data/wordlists/hsk/groups/README.md` (Copyright (c) 2026 the Hanzi Trainer contributors). The words themselves are the TOCFL list's; see the README one folder up.
