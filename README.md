# Hanzi Trainer

A personal, local-first Chinese character writing trainer. It runs entirely in the browser: no account, no server, and (eventually) fully offline.

Stroke display and grading are done by [Hanzi Writer](https://hanziwriter.org/).

## Status

Milestone 1: a single page that quizzes one character (學) stroke by stroke.

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
