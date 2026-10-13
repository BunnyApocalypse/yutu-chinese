# Hanzi Trainer

A personal, local-first Chinese character writing trainer. It runs entirely in the browser: no account, no server, and (eventually) fully offline.

Stroke display and grading are done by [Hanzi Writer](https://hanziwriter.org/).

## Status

- **Review:** each word has up to four cards, scheduled separately by the [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) scheduler:
  - **Writing:** you are shown a meaning and write the word stroke by stroke. Your own handwriting stays on screen, and the printed character appears underneath when you finish so you can compare.
  - **Tone:** you are shown the word and give the tone of each character, by tapping a button or drawing the tone mark.
  - **Pinyin** and **Meaning:** you are shown the word, recall its reading or meaning, and reveal the answer.

  After each card you grade yourself; where the app can check your answer it suggests a grade.
- **Free practice:** try any kind of card for a word, or write any characters at all. Nothing is recorded.
- Traditional, simplified or both: learning one script, you are only asked for and shown that one. You can switch later and keep your words: writing the ones that differ is learned again in the new script, and what you knew in the old one is kept. Traditional uses Taiwan-standard forms and stroke order; where the mainland stroke order uses the same strokes, that is accepted too.
- Two strokes written without lifting the pen (such as the hook of 子) are accepted where one runs into the next.
- A built-in list of about 100 common words to start from, and a **Words** tab to add your own: one at a time, with the fields filled in from a built-in dictionary as you type the characters, or as a list from a TSV or CSV file. Words can be searched, changed, moved to the front of the queue, and removed.
- A choice between keeping your own handwriting on screen ("raw input") and having each correct stroke snap to the printed one.
- Settings for new words per day, which kinds of card you want, how much of a dictionary entry is filled in as a word's meaning, and pronunciation: mainland only, or both mainland and Taiwan with either one first. With both, tone cards accept both regions' tones.

## Your data

Everything is stored in your browser on your device (IndexedDB). There is no account and no sync: each device, and each address you open the app from, has its own separate progress.

Use **Export backup** to save everything as one file, and **Import backup** to load such a file on another device. Importing replaces what is on that device.

## Running it

You need [Node.js](https://nodejs.org/) 20.19 or newer.

```
npm install      # once, downloads the dependencies
npm run dev      # starts the dev server
npm test         # runs the tests
```

`npm run test:browser` runs a second set of tests that write characters in the real app, in several browsers at once. It needs Node.js 22 or newer and Chromium or Chrome installed, and takes about half a minute.

Then open:

- on this computer: http://localhost:5173
- on a phone on the same Wi-Fi: the "Network" address Vite prints, e.g. `http://192.168.10.200:5173`

Stop the server with Ctrl+C.

## Stroke data

Stroke data comes from two sources, both licensed under the Arphic Public License:

- [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data), derived from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi): about 9,500 characters.
- [animCJK](https://github.com/parsimonhi/animCJK): Taiwan-standard forms for about 1,000 traditional characters, kept in `data/animcjk/`. These are used when the script is set to Traditional. Traditional characters outside this set fall back to the first source, whose forms can differ from the Taiwan standard.

Both are copied into `public/` automatically the first time you run `npm run dev` or `npm run build`.

## License

The app's own code is free software under the GNU General Public License, version 3. See [LICENSE](LICENSE).

The stroke data is **not** covered by the GPL. It is separate material under the Arphic Public License, a free license of its own that is not compatible with the GPL, so it keeps that license:

- `data/animcjk/` (see the README in that folder)
- the `hanzi-writer-data` package, downloaded by `npm install`

The tone table and the dictionary in `data/cedict/` are adapted from [CC-CEDICT](https://cc-cedict.org/wiki/) and are under the Creative Commons Attribution-ShareAlike 4.0 license (see the README in that folder).

The libraries the app uses, [Hanzi Writer](https://github.com/chanind/hanzi-writer) and [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), are under the MIT license, which is compatible with the GPL.
