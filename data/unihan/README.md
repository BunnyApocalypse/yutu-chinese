# Standard character sets, from Unihan

`character-sets.tsv` says, for 16,024 characters, whether each is standard on the mainland and in Taiwan. One character a line, tab-separated:

- its number in the mainland's 通用规范汉字表 (Table of General Standard Chinese Characters, 2013; Unihan's `kTGH`), empty if it is not in it. Numbers 1 to 3,500 are level 1, the characters in common use; 3,501 to 6,500 level 2; 6,501 to 8,105 level 3, for names, places and specialist terms;
- `T1` or `T2`, the plane of Taiwan's national character set CNS 11643 it comes from (Unihan's `kIRG_TSource`), empty if neither. Plane 1 (5,413) holds the frequently used characters and plane 2 (7,651) the less frequent ones, together the two levels of Big5, in the Ministry of Education's standard forms (為 is in plane 1; its variant 爲 is not in either). Characters from later planes are variants and rare characters, and are left out.

Used by `scripts/build-part-keys.js` (`data/script-keys/`) to check the part changes between the scripts on the characters actually used: only pairs whose traditional form is in plane 1 or 2 are checked (Taiwan's standard forms), and only a character in plane 1 or in levels 1 and 2 of the 通用规范汉字表 counts against a change. The app itself does not load this file.

## Source

Unicode's Unihan database, version 18.0.0 (`Unihan.zip`, kept in the git-ignored `local/stroke-sources/unihan/`, `local/README.md`): the fields `kTGH` (`Unihan_OtherMappings.txt`) and `kIRG_TSource` (`Unihan_IRGSources.txt`). Written by `scripts/build-character-sets.js`; to update, download `https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip` again, unzip it into a folder of its own, and run the script on that folder.

## License

Unicode License v3, a permissive license; its text, with Unicode's copyright notice, is in `LICENSE.txt` beside this file, as the license asks.
