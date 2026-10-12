# Hanzi Trainer

A personal, local-first Chinese character writing trainer. It runs entirely in the browser: no account, no server, and (eventually) fully offline.

Stroke display and grading are done by [Hanzi Writer](https://hanziwriter.org/).

## Status

Type any character or word and write it stroke by stroke. Your own handwriting stays on screen, and the printed character appears underneath when you finish so you can compare.

## Running it

You need [Node.js](https://nodejs.org/) 20.19 or newer.

```
npm install      # once, downloads the dependencies
npm run dev      # starts the dev server
```

Then open:

- on this computer: http://localhost:5173
- on a phone on the same Wi-Fi: the "Network" address Vite prints, e.g. `http://192.168.10.200:5173`

Stop the server with Ctrl+C.

## Stroke data

Stroke data comes from [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data), which is derived from [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) and licensed under the Arphic Public License. It is copied into `public/char-data/` automatically the first time you run `npm run dev` or `npm run build`.
