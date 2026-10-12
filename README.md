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
- Traditional or simplified, chosen with a switch. Traditional uses Taiwan-standard forms and stroke order; where the mainland stroke order uses the same strokes, that is accepted too.
- Two strokes written without lifting the pen (such as the hook of 子) are accepted where one runs into the next.
- A built-in list of about 100 common words to start from.
- Settings for new words per day, which kinds of card you want, and Taiwan or mainland pronunciation. Tone cards accept both regions' tones.

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

The tone table in `data/cedict/` is adapted from [CC-CEDICT](https://cc-cedict.org/wiki/) and is under the Creative Commons Attribution-ShareAlike 4.0 license (see the README in that folder).

The libraries the app uses, [Hanzi Writer](https://github.com/chanind/hanzi-writer) and [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), are under the MIT license, which is compatible with the GPL.
