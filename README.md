# 玉兔中文 (Yutu Chinese)

玉兔, the Jade Rabbit, lives on the moon.

A personal, local-first Chinese character writing trainer. It runs entirely in the browser: no account, no server, and it works offline once it has been opened.

**Use it at https://bunnyapocalypse.github.io/yutu-chinese/.** On a phone or tablet, open that address and choose "Install app" or "Add to Home Screen" from the browser's menu. The first time, it saves itself, the stroke data for about 10,600 characters and a dictionary on the device (about 18 MB to download, 45 MB stored); Settings shows the progress. After that it needs no connection. When a newer version has been published, a "New version ready" button appears.

Stroke display and grading are done by [Hanzi Writer](https://hanziwriter.org/).

## Status

- **Review:** each word has up to four cards, scheduled separately by the [FSRS](https://github.com/open-spaced-repetition/ts-fsrs) scheduler:
  - **Writing:** you are shown a meaning and write the word stroke by stroke. Your own handwriting stays on screen, and the printed character appears underneath when you finish so you can compare.
  - **Tone:** you are shown the word and give the tone of each character, by tapping a button or drawing the tone mark.
  - **Pinyin** and **Meaning:** you are shown the word, recall its reading or meaning, and reveal the answer.

  After each card you grade yourself; where the app can check your answer it suggests a grade.
- **Learn:** words you add wait until you learn them. Each is taught in a short lesson: a look at the word, its tones, each stroke shown until you write it, the outline, then from memory. Only then does it come up in Review.
- **Free practice:** try any kind of card for a word, or write any characters at all. Nothing is recorded.
- Traditional, simplified or both: learning one script, you are only asked for and shown that one. You can switch later and keep your words: writing the ones that differ is learned again in the new script, and what you knew in the old one is kept. Traditional uses Taiwan-standard forms and stroke order; where the mainland stroke order uses the same strokes, that is accepted too.
- Two strokes written without lifting the pen (such as the hook of 子) are accepted where one runs into the next.
- A short introduction the first time, which sets up the script, pronunciation and kinds of card, and explains why the app asks to store its data for the long term.
- Ready-made word lists to start from: HSK 3.0, HSK 2.0 and TOCFL, added level by level.
- A **Words** tab to add your words (the app starts with none): one at a time, with the fields filled in from a built-in dictionary as you type the characters, or as a list from a TSV or CSV file. Words can be searched, changed, moved to the front of the queue, and removed. A word can also be corrected from the answer page of a review.
- A choice between keeping your own handwriting on screen ("raw input") and having each correct stroke snap to the printed one.
- Settings for new words per day, which kinds of card you want, how much of a dictionary entry is filled in as a word's meaning, and pronunciation: mainland only, or both mainland and Taiwan with either one first. With both, tone cards accept both regions' tones.

## Your data

Everything is stored in your browser on your device (IndexedDB). There is no account and no sync: each device, and each address you open the app from, has its own separate progress.

Use **Export backup** to save everything as one file, and **Import backup** to load such a file on another device. Importing replaces what is on that device.

Syncing between devices is being tested in the test copy (https://bunnyapocalypse.github.io/yutu-chinese/test/). It is optional, and everything is encrypted on the device before it is sent, so the sync server can't read it. You can run your own sync server: see "Running your own sync server" below.

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

`npm run build` makes the version that is published, in `dist/`. Every push to `main` builds and publishes it to the address above (`.github/workflows/deploy.yml`).

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

The HSK word lists in `data/wordlists/hsk/` are built from [ivankra/hsk30](https://github.com/ivankra/hsk30) and [glxxyz/hskhsk.com](https://github.com/glxxyz/hskhsk.com), both under the MIT License (see the README in that folder). The TOCFL word list in `data/wordlists/tocfl/` is built from the file published by the test's committee, which states no license (see the README there).

The tone table and the dictionary in `data/cedict/` are adapted from [CC-CEDICT](https://cc-cedict.org/wiki/) and are under the Creative Commons Attribution-ShareAlike 4.0 license (see the README in that folder).

The libraries the app uses, [Hanzi Writer](https://github.com/chanind/hanzi-writer) and [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs), are under the MIT license, which is compatible with the GPL.
