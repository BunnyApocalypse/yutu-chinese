# 玉兔中文 (Yutu Chinese)

玉兔, the Jade Rabbit, lives on the moon.

A free, local-first app for learning to write Chinese characters, and to read, pronounce and understand the words they make. It is an alternative to Skritter: your own handwriting, graded fairly, with spaced repetition. It runs in the browser, needs no account, and works offline once it has been opened.

**Use it at https://bunnyapocalypse.github.io/yutu-chinese/**

On a phone or tablet, open that address and choose "Install app" or "Add to Home Screen" from the browser's menu, and it works like an app of its own. The first time, it saves the stroke data for about 10,600 characters and a dictionary on the device in the background (Settings shows the progress); after that it needs no connection. Recordings are kept once played, or all at once from Settings (about 125 MB). When a new version is out, a "New version ready" button appears, and "What's new" says what changed.

The interface is in English, Italian and German.

## What it does

### Writing

- **Write with your finger, a stylus or a mouse.** Your own handwriting stays on screen as you drew it ("raw input"), with the printed character shown underneath when you finish so you can compare; or each correct stroke can snap to the printed one.
- **Grading that isn't fussy.** Small, awkward strokes pass when written reasonably, and common handwriting shortcuts are accepted, such as 子 in two strokes or two strokes joined without lifting the pen. The character can be written anywhere in the box, at a natural size.
- **Traditional, simplified, or both, each first-class.** Traditional uses Taiwan-standard forms and stroke order (為 with 9 strokes, 辶 and 艹 with 4); where the mainland order differs only in the order of the same strokes, it is accepted too. You can switch script later and keep your words.
- **Gestures:** hold still on the writing area for a hint, or swipe up to start the character again.

### Studying

- **Four kinds of card for each word**, each scheduled on its own with [FSRS](https://github.com/open-spaced-repetition/ts-fsrs): **writing** (see the meaning, write the word), **tone** (tap or draw each character's tone), **pinyin** and **meaning** (recall, then reveal). Turn off the kinds you don't want.
- **Learn:** new words wait until you learn them, a set number a day. Each is taught in a short lesson: a first look, its tones, each stroke shown until you write it, then the outline, then from memory.
- **Review:** the cards that are due, the most overdue first. You grade yourself; where the app can check your answer, it suggests the grade. Choose how many cards to do, and keep practicing at the end without changing any schedule.
- **Free practice:** any kind of card for any word, or write any characters at all. Nothing is recorded.
- **Leeches:** cards you keep forgetting are pointed out, or suspended if you prefer. Download them as a list, or copy them as a prompt for an AI to make memory aids.
- **Sentences:** make cards from a word's example sentence, or your own: read the sentence, or write the missing word or the whole sentence.
- **Mainland or Taiwan pronunciation, or both** with either one first; with both, tone cards accept both regions' tones.
- **Streaks and encouragement** that can each be turned off in Settings.

### Words and decks

- **The app starts empty: you choose what to learn.** Add words one at a time, filled in from the built-in dictionary (CC-CEDICT) as you type the characters, or a whole list from a file or pasted text.
- **Ready-made lists:** HSK 3.0, HSK 2.0, TOCFL, and the 214 Kangxi radicals, added level by level, grouped into themes.
- **Decks and sub-decks.** A word can be in several decks and still has one schedule; study one deck or all of them.
- **A page for every word:** its characters and how each is built, a tip for remembering it, a learning note and example sentence for the ready-made lists' words, its cards and their history. Suspend, resume or start over any card, alone or for many words at once.
- **Hear any word**, from recordings of native speakers, or put together syllable by syllable when a word has none.
- **Progress:** today's numbers, your cards from new to mature, the days you studied, time spent, and words and characters learned over time.

### Bringing your history along

- **From Anki:** `.apkg` and `.colpkg` files, with their schedules and review history.
- **From Skritter:** the `.zip` of your data that Skritter's support sends on request. The app explains how to ask for it, with a letter ready to copy.

Importing again later adds only what is new.

### Comfort

- Three looks (Yutu light, Yutu dark, or follow the device), with colors checked for contrast in both, and the OpenDyslexic font as an option.
- A short introduction the first time, and tips that show the first time something is used (they can be switched off).

## Your data

**Everything is stored on your device**, in the browser's own database. There is no account, and nobody but you can read your words or your progress.

- **Sync between devices** (optional): your words, progress and settings stay the same on your phone, tablet and computer. Turn it on in Settings › Your data and backups, save the sync code it gives you, and enter or scan that code on your other devices. Everything is encrypted on the device before it is sent, so the sync server only ever holds files it can't read. The server is our own small free-software program, and you can run your own (below).
- **Backups:** Export backup saves everything as one file; Import backup loads it on any device, replacing what is there or combining the two.
- **Keep your sync code somewhere safe.** If every device is lost or wiped, the code is the only way to get the synced data back; without it, nobody can open it, us included.

How syncing works, and why it is built this way: `docs/sync.md`.

## Running your own sync server

Syncing goes through our server by default, but anyone can run one: for themselves, a household, a club or a school. It is a small program of our own (`server/server.js`): plain Node.js with no dependencies, keeping each learner's encrypted files in a folder of their own. How syncing works, and why the server is built this way: `docs/sync.md`.

### What you need

- **A Linux machine reachable from the internet**, such as a small rented server (a VPS). Two cores and 4 GB of memory are plenty for thousands of learners; ours is an ARM server at Hetzner in Germany, about €7 a month.
- **A domain name** with A (IPv4) and AAAA (IPv6) records pointing straight at the machine, **not through a proxy** such as Cloudflare's orange cloud: the proxy would see every request's secret, and the server must see learners' own addresses for its limits.
- An **HTTPS** front: the app only talks to a sync server over HTTPS (except one on the same computer).

### The easy way: our Ansible playbooks (AlmaLinux 10 or Rocky Linux 10)

The playbooks in `deploy/` set up a fresh machine from your own computer over SSH, the same way as ours: key-only SSH logins, a firewall, security updates by themselves, the program as a locked-down service, Caddy for HTTPS with certificates it renews by itself, the log kept at most 14 days, and an optional watch that emails you. In short:

1. Install Ansible on your computer (on Fedora: `sudo dnf install ansible`).
2. `cd deploy`, then `cp inventory.example.yml inventory.yml`, and fill in the machine's address, your domain name, and the site the app is opened from (`https://bunnyapocalypse.github.io` for ours).
3. The first run, as root: `ansible-playbook setup.yml -e ansible_user=root`. From then on the playbooks log in as an admin account of their own.
4. Later: `deploy.yml` after changing the program or a setting, `update.yml` monthly, `status.yml` to see how it is doing.

The full steps, every setting, and the watch: `deploy/README.md`.

### By hand, on any Linux

1. Install **Node.js 22** or newer, and copy `server/server.js` and `server/package.json` to the machine.
2. Run it as an account of its own with your system's service manager. Ours, for systemd, with the settings that keep the program from touching anything but its own folder, is `deploy/templates/yutu-sync.service.j2`.
3. Give it its settings in the environment (every one: `server/README.md`). At least `DATA_DIR` (where the files go), `ALLOWED_ORIGINS` (the site the app is opened from, `https://bunnyapocalypse.github.io` for ours) and `TRUST_PROXY=1`. It listens on `127.0.0.1:8787` only.
4. Put an HTTPS server in front of it, passing requests on to `127.0.0.1:8787` and **replacing** any `X-Forwarded-For` header the learner sent with their real address (Caddy does both by itself; ours is `deploy/templates/Caddyfile.j2`, four lines). Let it accept request bodies of 65 MB.
5. Check: `https://<your domain>/v1/health` answers `ok`.

### Pointing the app at it

On each device, before turning sync on or joining: Settings › Your data and backups › Sync between devices, unfold "Sync server", enter `https://<your domain>` and choose "Use this server". In the introduction it is under "Self-hosting?". A sync code's link and QR code made on such a device carry the server along, so the other devices join it by themselves.

### What running one means

- **You hold other people's data**, even though it is encrypted. The app's privacy page ("How syncing handles your data") describes our server, not yours: tell your learners who runs yours, where, and how long you keep things. In the EU, the GDPR applies to you as for us.
- **The log names an address only when it goes over a limit** (lines starting `LIMIT`). Keep the log short (ours: 14 days) and say so.
- **Keep it updated.** The playbooks do so by themselves; by hand, turn on your system's automatic security updates.
- **No backups needed:** every device keeps everything and sends it all again if the server loses it. Stopping the server loses nobody's words; syncing just stops.
- **Limits** keep one person from filling the server or using it as free storage. For a school whose class turns sync on together, give its address more room: `GENEROUS_ADDRESSES` (`server/README.md`).

## Feedback

Use "Send feedback" in the app's menu: it opens an email with the app's version and your device already filled in (nothing about your words), or points to this repository's [issue tracker](https://github.com/BunnyApocalypse/yutu-chinese/issues).

## Developing

You need [Node.js](https://nodejs.org/) 20.19 or newer (22 or newer for the browser tests and the sync server).

```
npm install            # once, downloads the dependencies
npm run dev            # the app at http://localhost:5173
npm test               # unit tests
npm run test:browser   # the real app in headless Chromium, about four minutes
npm run sync-server    # a sync server on this computer, http://127.0.0.1:8787
npm run build          # the published version, in dist/
```

On a phone on the same Wi-Fi, open the "Network" address Vite prints. The browser tests need Chromium or Chrome installed; don't change files while they run, since the dev server reloads the pages.

It is plain JavaScript with no framework, built with [Vite](https://vite.dev/). Stroke display and grading are done by [Hanzi Writer](https://hanziwriter.org/). All data stays in IndexedDB; a service worker keeps the app working offline.

- `docs/README.md` is the index of the design notes, one file per area of the app; `docs/layout.md` lists every file.
- `CLAUDE.md` holds the rules that cut across the code.
- Stroke data is copied into `public/` the first time you run `npm run dev` or `npm run build`.

**Deploying:** pushing `main` publishes the test copy at https://bunnyapocalypse.github.io/yutu-chinese/test/ (its data is kept apart from the main copy's); the `stable` branch is the main copy (`.github/workflows/deploy.yml`).

## License and credits

The app's own code is free software under the GNU General Public License, version 3 only: see [LICENSE](LICENSE).

It is built on the work of others. Each keeps its own license, and each data set has a README with its source in its own folder:

- **Stroke data:** [Make Me a Hanzi](https://github.com/skishore/makemeahanzi) (by way of [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data)) and [AnimCJK](https://github.com/parsimonhi/animCJK) for Taiwan's forms (`data/animcjk/`), under the Arphic Public License. That license is not compatible with the GPL, so the stroke data is kept as separate data files the app loads, not part of its code.
- **How characters are built:** Make Me a Hanzi's dictionary (`data/makemeahanzi/`), GNU LGPL.
- **Dictionary and tones:** [CC-CEDICT](https://cc-cedict.org/wiki/) (`data/cedict/`), CC BY-SA 4.0.
- **Recordings:** [audio-cmn](https://github.com/hugolpz/audio-cmn) (`data/audio-cmn/`), CC BY-SA.
- **Learning notes, example sentences and character tips** (`data/notes/`, `data/character-tips/`): written for this app by an AI model (Anthropic's Claude), CC BY-SA 4.0. No fluent speaker has checked them all line by line, so they may be wrong; the app says which ones have been checked.
- **Word lists:** HSK from [ivankra/hsk30](https://github.com/ivankra/hsk30) and [glxxyz/hskhsk.com](https://github.com/glxxyz/hskhsk.com) (MIT); TOCFL from the list published by Taiwan's Steering Committee for the Test of Proficiency-Huayu, which states no license; the Kangxi radicals from Unicode's CJKRadicals.txt (`data/wordlists/`).
- **The OpenDyslexic font** (`public/fonts/opendyslexic/`): SIL Open Font License 1.1, kept as separate font files.
- **Libraries:** [Hanzi Writer](https://github.com/chanind/hanzi-writer), [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), [sql.js](https://github.com/sql-js/sql.js) and [fzstd](https://github.com/101arrowz/fzstd) (reading Anki files), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT) and [jsQR](https://github.com/cozmo/jsQR) (Apache 2.0) for the sync code's QR code.

The full list is under Help › Credits and licenses in the app.

Skritter is a trademark of Inkren Inc. 玉兔中文 can import the data Skritter sends you, but is not affiliated with or endorsed by Skritter.
