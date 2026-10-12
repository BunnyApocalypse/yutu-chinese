# Hanzi Trainer

A personal, local-first Chinese character writing trainer: a PWA built as an alternative to Skritter. One user, their own devices.

## Hard constraints

- **Vanilla JavaScript.** Vite is the only build tool. No frameworks (no React, Vue, Svelte, etc.) and no TypeScript.
- **No backend.** The app is static files only. Nothing is sent to a server.
- **All user data lives in IndexedDB** on the device.
- **Must work offline.** Nothing may be fetched from the internet at runtime. In particular, stroke data comes from the bundled `hanzi-writer-data` package, never from Hanzi Writer's default CDN loader.
- **Hanzi Writer** does stroke display and stroke-by-stroke quiz grading. Don't write a custom stroke recogniser.
- **Traditional and simplified characters are both first-class.** Never assume one script.

## Working with the owner

The owner reads Python and JavaScript comfortably but is not a developer.

- Keep code simple and direct. Prefer a few small, plainly named files over abstractions.
- Comment anything non-obvious, and explain new concepts (browser APIs, tooling, PWA mechanics) in plain language when they first come up.
- Ask before adding any dependency. The bar is high.
- Work one milestone at a time. Propose a plan before writing code for a new milestone, and don't build ahead.

## Commands

- `npm run dev`: start the dev server. On the PC: http://localhost:5173. On a phone on the same Wi-Fi: `http://<PC's LAN address>:5173` (Vite prints it as "Network" on startup).
- `npm run build`: bundle the app into `dist/`.
- `npm run preview`: serve the built `dist/` to check the production build.

There are no tests yet.

## Layout

- `index.html`: the single page.
- `src/main.js`: entry point; page setup and button wiring.
- `src/quiz.js`: the only file that imports Hanzi Writer. It reports plain results (strokes done, mistakes) through handler functions, so other code stays independent of the library.
- `src/charData.js`: the only place stroke data is loaded from.
- `src/style.css`: styles, phone-first.

## Things that are easy to get wrong

- Service workers and "Add to Home Screen" only work over HTTPS or on `localhost`. The LAN dev address (`http://192.168.x.x:5173`) is plain HTTP, so offline/install features cannot be tested there from the phone. The plan is to deploy the built site to GitHub Pages for that (the repo is public for this reason).
- The writing area needs `touch-action: none`, otherwise drawing scrolls the page on a phone.
- Hanzi Writer works out touch positions from the SVG's on-screen size, so the `width`/`height` passed to it must match the element's real size. Don't scale the SVG with CSS.

## Skritter import (future)

The owner wants to bring their Skritter data across eventually rather than start from scratch. Don't build it early, but keep it in mind whenever the data model is designed: it should hold words as well as single characters, both scripts, and per-item review history and scheduling state. Look at a real Skritter export before finalising the IndexedDB schema. Personal exports go in `exports/`, which is git-ignored.

## Roadmap

1. **Done in milestone 1:** one hardcoded character (學), stroke-by-stroke quiz with grading, reachable from a phone over the LAN.
2. Any character, multi-character words, stroke data loaded on demand.
3. IndexedDB storage: study items and review history.
4. Spaced-repetition scheduling.
5. PWA: manifest, service worker, GitHub Pages deploy, installable and offline on the phone.
6. Skritter import.
