# Hanzi Trainer

A personal, local-first Chinese character writing trainer. It runs entirely in the browser: no account, no server, and (eventually) fully offline.

Stroke display and grading are done by [Hanzi Writer](https://hanziwriter.org/).

## Status

- **Review:** you are shown a meaning and write the word stroke by stroke. Your own handwriting stays on screen, and the printed character appears underneath when you finish so you can compare. You then grade yourself (the app suggests a grade from your mistakes), and the [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) scheduler decides when the word comes back.
- **Free practice:** type any character or word and write it. Nothing is recorded.
- Traditional or simplified, chosen with a switch. Traditional uses Taiwan-standard forms and stroke order; where the mainland stroke order uses the same strokes, that is accepted too.
- Two strokes written without lifting the pen (such as the hook of 子) are accepted where one runs into the next.
- A built-in list of about 100 common words to start from.

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
