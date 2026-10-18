# Ready-made word lists and radicals

## HSK and TOCFL

Asked for by the owner on 2026-10-13: HSK 3.0 first, 2.0 too, and TOCFL from the official files.

- **Where:** "Ready-made decks" on the Decks tab (`src/readyDecks.js`). A list is chosen by tapping its row (HSK 3.0, chosen to begin with; HSK 2.0, "older"; TOCFL; Radicals), each with a line saying what it is; a paragraph above explains the HSK for newcomers, with a link to Wikipedia. Its levels are listed one per row with counts and an Add button each ("Level 1: 512 words, 480 new [Add]"; the owner, 2026-10-14: levels are added one at a time), which adds the level's new words at the end of the queue and puts words already there into its deck. The radicals keep checkboxes and one Add.
- **The files:** `data/wordlists/hsk/hsk-3.0.tsv` (11,054 words), `hsk-2.0.tsv` (5,008), `data/wordlists/tocfl/tocfl.tsv` (7,433 in seven levels), built by `scripts/build-word-lists.js` (run by hand). Columns: level, simplified, traditional, pinyin, meaning, and an optional group. Separate files fetched when the section opens, saved offline with the dictionary. The HSK sources are two MIT-licensed projects at fixed versions (README in the folder).
- **The build script keeps its sources** in the git-ignored `local/word-list-sources/` (the owner, 2026-10-14); the first run downloads them (the TOCFL server can take minutes).
- **Meanings come from the app's dictionary** when a list is added, so "Dictionary meanings" applies. The few words it lacks (31 in HSK 3.0) have hand-written meanings in `data/wordlists/hsk/extra-meanings.tsv`; a test checks every listed word gets one.
- **Every listed word is matched to the dictionary** by simplified form and reading (`bestMatch`) and takes its traditional form and reading from there, so its ID is the same as when typed and the same in every list. (The HSK 3.0 source matched an older CC-CEDICT; the HSK 2.0 source had character-by-character traditional forms, 后面 for 後面, and spoken tones, yi4qi3.)
- **Don't use drkameleon/complete-hsk-vocabulary for readings**: it lists every reading CC-CEDICT has, not the one the HSK means (句 as gōu).
- **TOCFL** is read from the committee's spreadsheet without a library (`filesInZip`, `sheetsOf`). Cells hold several things (你/妳, 爸爸/爸, 車(子), zhuyin notes); `formsOf` takes them apart and `tocflMatch` finds each word, also by its Taiwan reading, with `tocflFit` giving an entry's own reading the edge (until 2026-10-13, 17 words had a Taiwan-only fit win: 打 as dá, 個 as gě). Where the list has no tone, the HSK reading decides. 79 entries the dictionary doesn't have are left out. **A reading that looks odd in a list is worth checking against the committee's sheet.** **The source states no license**; the owner chose to include it (README says so), to reconsider before a larger audience.
- **A word from a list is put in its level's deck** (`listTag` in `src/words.js`, e.g. `hsk-3.0/1`; the deck records made at the same time, `src/decks.js`). Each level is a deck of its own (`docs/decks.md`).

## Groups inside levels

The owner's idea (2026-10-13): milestones smaller than a level, each a deck inside it.

- **A list file's sixth column has the word's group** as number and name (`03 Education 教育`). The deck's ID uses the number only (`listTag(listId, level, group)` → `tocfl/1/03`), and `readyMadeDeck` names it from the list file (`groupName`; "Group 3" without the list at hand). So no table of groups is in the code, every device makes the same decks, and a group can be renamed safely; renumbering groups or moving words between them still changes things for people who have the list.
- **TOCFL:** Novice 1 to Level 2 use the committee's twelve topics, in its order (`TOCFL_TOPICS`, English names Claude's translations). Level 3 is grouped like HSK (`data/wordlists/tocfl/groups/`).
- **HSK:** `withGroups` reads `data/wordlists/hsk/groups/<list>-<level>.tsv` (group number, name, simplified, pinyin) and puts the level in that order: a teaching order by judgment, not frequency (the owner's idea; frequency would put grammar words first). Written by subagents to Claude's brief, checked by a script (every word once, groups of 12 to 40) and reread by Claude; MIT License (the owner). The owner approved HSK 3.0 level 1; from level 4 up only samples were read, and the higher levels' abstract vocabulary groups less cleanly.
- **Counts:** HSK 3.0 levels 1 to 6: 28, 39, 47, 60, 70, 78 groups; HSK 2.0 levels 1 to 5: 11, 10, 17, 37, 77; TOCFL level 3: 74.
- **Held back for their size:** HSK 3.0 level 7-9 (5,634 words), HSK 2.0 level 6 (2,500), TOCFL levels 4 (2,267) and 5 (2,707). A word at two levels is kept at the lower, so the build reports it "not in" the higher level's group file: expected. A test checks every word of a grouped level has a group.

## Reading fixes

- **Twenty-seven readings are put right by hand** (`data/wordlists/reading-fixes.tsv`, 2026-10-14), applied after matching. Matching by tones picked a rarer entry where the source writes a full tone that the everyday word reads neutral (说法 "to expound Buddhist teachings", 标致 Peugeot, 告诉 "to press charges", 妻子 "wife and children"), or a wrong Taiwan pairing (著 as zhāo). A correction takes the entry with the word's own traditional form; group files and notes keyed by the reading change with it. Found by comparing each word with the dictionary's other entries of the same letters.
- **Devices that added such a word are put right at start-up** (`applyReadingFixes` in `src/main.js`, `src/readingFixes.js`; the owner, 2026-10-14): a word in one of that list's decks under the wrong reading is renamed with `renameWord` (cards and reviews move, old ID into `formerIds`); its meaning is replaced only if still the wrong entry's proposal. A word typed by hand is left alone, as is one whose right reading the device has too. The dictionary is fetched only when there is something to fix.
- **A reading stays part of the ID**: the same characters are often two words (行 xíng and háng, 地道 dìdào and dìdao; 56 such in HSK 3.0).
- **The dictionary follows pointers**: entries that only say "variant of 詞典" or "erhua variant of 一點" get their target's meanings (`scripts/build-dictionary.js`; 7,142 of 124,481 entries), so 一点儿 and 辞典 can be found.

## Radicals

Built on 2026-10-14 at the owner's request; they haven't tried it.

- **"Radicals 部首"**, a ready-made list with two levels, **Common** and **Uncommon** (the owner: all 214 Kangxi radicals, clearly separated); decks `radicals`, `radicals/Common`, `radicals/Uncommon` (`READY_MADE_LISTS` in `src/decks.js`).
- **Common is decided by data**: the radical of at least 10 characters of the HSK and TOCFL lists (Make Me a Hanzi's `radical`, all forms counted together): 80 radicals covering 88% of the lists' characters. Each level is most useful first.
- **A radical that is a word of the lists, written the same, is that word** (the owner): 水, 口, 馬/马 have the word's ID, one schedule, all four kinds of card.
- **Any other form is a record of `kind: 'radical'`** (`src/radicals.js`): ID `<traditional>|radical`, empty `pinyin`, meaning from the list file. **Meaning and writing cards only** (the owner; `RADICAL_CARD_TYPES`, enforced in `hasCardType` and the card manager). Nothing speaks it. Taught in Learn as "New radical" (four steps, no tones). Its panel changes only meaning and decks. A list line with no reading is a radical (`entryId`).
- **A common radical brings each form that is the radical of at least 3 list characters** (心 and 忄) and its main form if that is a word; side forms that differ by script are one item (糹/纟, 言/讠). 230 items: 96 common, 134 uncommon.
- **Meanings of non-word radicals** are hand-written in `data/wordlists/radicals/meanings.tsv`; a side form names its full form ("water (side form of 水)"), since prompts show only the meaning. The build stops if one is missing.
- **Built by `scripts/build-radicals.js`** (run by hand) from Unicode's `CJKRadicals.txt`, Make Me a Hanzi and the word lists; details in the folder's README.
- **Every non-word radical has a note** (`data/notes/radicals.tsv`, 156).
- **Not done:** Chinese names of radicals (三點水); a radical's page listing its characters.
