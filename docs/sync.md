# Syncing between devices

**Being built: steps 1 and 2 of 4 done** (below). Planned 2026-11-07 with the owner, who decided that day: **a server of our own, free software, first**; Google Drive set aside (it adds friction, and the owner prefers FOSS wherever possible). Syncing is opt-in; the app still works fully offline, and this is the one agreed exception to "no backend" (CLAUDE.md). The files are encrypted on the device, so the server holds nothing anyone can read.

## Why not a whole backup each time

Combining backups (`mergeBackups`, `docs/merging.md`) moves everything: the owner's backup is about 45 MB, and saving it rewrites about 190,000 records (`replaceEverything`), which froze the owner's tablet once already. Doing that at every sync would cost a lot of data and time. So each device sends **only what it changed**, as small batches, and takes in the other devices' batches one record at a time. A whole backup is moved only rarely, as a snapshot (below).

## What the storage holds

Every file is encrypted on the device before it leaves (below), so the storage, Google or our server, sees only scrambled bytes, their sizes and times.

- **One log per device.** Each device has a random device ID (`randomId()`) and writes only its own files: `batch-<device>-<number>`, numbered 1, 2, 3… with no gaps. It never changes or deletes another device's. So two devices syncing at once can never clash, and nothing needs locking.
- **Snapshots:** `snapshot-<time>-<device>`, everything a device had then (the stores of a backup, without the device's own settings), and beside it `covers-<time>-<device>`, a small file saying, for each device, the last batch it includes (`{ "A": 812, "B": 230 }`), so a device can tell whether it needs the snapshot without reading it. The covers file is saved second: a snapshot without one isn't there yet.
- **What the storage must do:** save a file, list the files (or those after a name), read one, delete one. The server below does only that; so could Google Drive's app folder or a folder synced by Syncthing, later.

## On the device

- **The outbox** (store `outbox`, `src/db.js`): one entry per record changed, `{ key: "<store>:<id>", store, id, token }`, written in the same transaction as the change, so one can't be saved without the other. A record changed twice has one entry. **Only while sync is on** (`setOutboxOn`). Turning it on, and a backup replacing everything (`replaceEverything`), put one entry `everything` instead (`sendEverything`): the next batch is then all of the device's data, cards too (which spare the others working them out). So **every change is in some device's batches**, and a snapshot is only a shortcut. What goes in:
  - a review saved, and a review corrected while looking back (`correct` in `src/review.js`: same ID, new grade, and `correctedAt`);
  - a word, deck or setting saved with a stamp (changes with `{ stamp: false }` are the app tidying old records, which every device does for itself, and aren't sent);
  - a removal mark;
  - never cards: cards are worked out from reviews. Device settings (`DEVICE_SETTINGS` in `src/merge.js`) are left out when the batch is made.
- **A renamed word** (`renameWord`) needs no instruction of its own: the word goes in the outbox with its old ID in `formerIds`, and taking it in moves the other device's cards and reviews, as combining backups does.
- **Why an outbox and not "everything with a later `changedAt`":** reviews have no `changedAt`, and a corrected review keeps its time. Both would be missed.
- **A corrected review** carries `correctedAt`; of two copies of one review, combining (`mergeBackups`) keeps the one corrected later, and a side's cards count as complete only if it has the same copy of every review. Before syncing, no other device could have the first copy; with it, one can.
- **Sending:** the outbox is bundled into one batch (`buildBatch` in `src/syncBatch.js`: the records as they are now), compressed (`CompressionStream`, built into the browser), encrypted and saved under the next number. Only once the storage says it's saved are those entries taken off the outbox, and only if not changed again meanwhile (`token`). A batch sent twice by a retry is harmless: taking it in twice changes nothing.
- **A big import** (Anki, Skritter) makes a big batch, once; a backup combined or replaced sends everything, as above. A batch over the snapshot size is soon followed by a snapshot, which replaces it.
- **Taking in** (`applyBatch` in `src/syncBatch.js`): **it is `mergeBackups` itself**, run on a slice of this device: all its words, decks, settings and removal marks (a few thousand small records), and only the reviews and cards of the words the batch touches (by the reviews' `wordId` index and the cards' IDs). It gives what to save and what to delete; records are saved as they came (`changedAt` not stamped again). So the rules live in one place. **What it takes in doesn't go into its own outbox**, or devices would echo each other's changes forever.
- **Cards:** only the cards of the words touched are worked out again (`replay`), going on from the stored card when the new reviews are all later (`startingPoint` in `src/merge.js`), and a card stays as stored when this device already has every review of it, as in combining. Anki's imported schedules are records among the reviews, so they replay too.
- **Speed** (measured 2026-11-07 on the owner's backup, in Node on the computer): taking in a day of another device's reviews (526, touching 299 words and their 26,000 reviews) takes about 150 ms, a month at once (7,324) about 1.5 s; about six times that on the owner's tablet. Most was comparing records as text: `mergeBackups` skips its summary for syncing (`{ summarize: false }`), and a record it leaves unchanged is the same object, compared at a glance. Batches are usually minutes of study; to measure in the browser when syncing is switched on (step 3).
- **The test that holds it together** (`tests/syncBatch.test.js`): taking another device's batches in one by one gives what `mergeBackups` gives on the whole backups, in whatever order they come, and taking one in twice changes nothing.

## Snapshots

- **Taken in** on a device's first sync (`joined` in the sync store), quicker than every batch since the beginning, and where a device's next batch is gone but the newest snapshot covers it (deleted, or the device was away long). Taking one in is `applyBatch` with all of this device's data as the slice (`readEverything` in `src/db.js`) and the snapshot's data, cards and all, as the batch; then `taken` goes up to what it covers. Only the newest snapshot ever counts.
- **Made** by any device whose sync finds the batches the newest snapshot doesn't cover add up to more than `SNAPSHOT_AFTER_BYTES` (2 MB, to settle by trying) or number more than `SNAPSHOT_AFTER_BATCHES` (200; `src/sync.js`), so that a list of files stays short. The owner's whole snapshot would be about 5.7 MB.
- **Tidying** (`tidy`): each device deletes only its own files: its batches the newest snapshot covers, and its older snapshots (covers file first). Only once it has opened that snapshot itself (made it, or read it through once: `checkedSnapshot`), so a snapshot that can't be opened never costs the batches it would replace.
- **A batch missing** that no snapshot covers means something went wrong: the device reports `missing-batch` and takes nothing more of that device's, rather than carrying on with a hole.
- **The server holds nothing that can't be replaced:** every device has everything. A device that finds its files gone (a server's disk lost, a move to another host, a server run afresh) sends everything again (to build in step 3: noticing it). So the server needs **no backups**, and moving it moves no data.

## When to sync

Changes should leave a device before the learner picks up the next one, and arrive before they study on it.

- **Sending, only when the outbox isn't empty:**
  - when the app goes out of sight (the screen locked, another app, the tab closed; the browser's `visibilitychange` event, the last moment a phone reliably lets a page run code). Sent with `keepalive`, which lets the request finish after the page is gone, up to 64 KB; a bigger outbox goes at the next chance;
  - at the end of a Review or Learn session;
  - while studying, 30 seconds after the last change, and at least every few minutes (both numbers to tune).
- **Fetching:** when the app opens, when it comes back into sight, and when the connection comes back (the `online` event). "Anything new?" is a quick listing, so it can be asked often.
- **"Sync now"** in Settings, with "Last synced 2 minutes ago".
- **Never in the way:** studying never waits for a sync. Nothing heavy runs while a character is being written (the tablet already lags; `docs/pitfalls.md` to get a line when built); records taken in during Review are written between cards, and the due counts update quietly.
- **Offline or failing:** changes wait in the outbox; retries come later and later (a minute, five, half an hour), never in a tight loop.
- **The same card on two devices within seconds:** it may be shown on both. Both reviews are kept, and `replay` puts them in time order: one review done twice, nothing lost.
- **Not relied on:** syncing with the app closed (Periodic Background Sync exists only in Chromium browsers, not Firefox or Safari). The Android app could do it later; syncing on hiding and on opening should make it unneeded.

## Encryption and pairing

- **The sync code** (`src/syncCode.js`): 32 letters of Crockford's base 32 (digits and capitals without I, L, O, U), shown in eight groups of four (`formatCode`): 30 random (150 bits, `makeCode`) and 2 that check them (from their SHA-256), so a typing mistake is told apart from a code with nothing synced. `readCode` takes it however typed (any case, spaces or dashes, O for 0, I or L for 1) and gives `{ code }` or a `reason`: `length`, `letters`, `mistyped`. Another device joins by typing it in (or opening a link with the code after `#`, which the browser never sends to a server). There are no accounts and no passwords.
- **Three things are worked out from the code** (`keysFor`) with HKDF-SHA-256 (WebCrypto's standard way to make several keys from one secret; salt "yutu-chinese sync 1", one name for each): an **account ID** (128 bits as hex), which the server files the learner's files under; an **access** secret (256 bits), sent with each request so that knowing an account ID isn't enough to delete files; and the **encryption key** (AES-GCM, 256 bits), which never leaves the device and can't be read out even by the app (`extractable: false`). None reveals another.
- **Every file** is compressed, then encrypted with AES-GCM (`encrypt`, `decrypt`; WebCrypto, no dependency, no encryption of our own making): a version byte (1), 12 random bytes (the IV, new each time), the encrypted bytes. The file's name is bound into the encryption, so the storage can't pass off one file as another; a file changed, renamed or made with another code fails to open (`reason: 'cannot-open'`), and syncing reports it and takes nothing from it.
- **Against quantum computers** (asked by the owner, 2026-11-07; the code kept at 32 letters): the design has no public-key cryptography, which is what quantum computers break (Shor's algorithm), since the devices never agree on a key over the network: the learner carries the code. AES-256 and SHA-256 only lose about half their bits to Grover's algorithm and are counted safe; the code's 150 bits would take about 2^75 steps, one after another, each a whole key calculation in a quantum computer. The connection to the server (HTTPS) does use public-key cryptography, but what it carries is encrypted already: recorded and broken later, it would give away the account ID and access secret (deleting files, which devices send again), never the data.
- **Only on a secure address:** browsers offer WebCrypto only over HTTPS or on `localhost`, so syncing can't work on the dev server's LAN address (as `crypto.randomUUID()`, CLAUDE.md); a phone tries it on the test copy.
- **Losing the code** loses nothing on the devices: the learner turns sync off and on again with a new code. We can't recover a code, by design.
- **The code is kept out of backups:** a backup file holding it would hold the key to everything synced. It goes in the `sync` store, not in `settings` (the database is named apart for the test copy already, `__CHANNEL__`).
- **What the storage still learns:** an account ID, how many files, their sizes and times, and (for a server) the IP addresses that ask. Not a word of the learner's study.

## Getting the data back: recovery

The sync code is the only key, so it is also how a learner gets everything back (the owner, 2026-11-07: something the learner can save when pairing). One code, for joining and for recovery: two codes would be more to explain and to lose, and protect nothing more, since either would have to open the data.

- **One device lost, another left:** nothing to do; the one left has everything. Pair the new device with it.
- **Every device lost:** on the new device, "Restore from sync" (the same as joining) and the code. It reads the newest snapshot and the batches after it; cards come back from the reviews, schedules and all.
- **Every device and the code lost:** the synced data can't be opened, by anyone, us included. Said plainly when the code is shown.
- **Saving the code when sync is turned on**, before anything is sent, a step of its own:
  - the code, large, in groups, with Copy;
  - "Save as file": a small text file with the code, the date, the site's address and how to restore (saved as the app saves backups);
  - "Print": a page to keep with one's papers (the browser's print, nothing added);
  - a line suggesting a password manager;
  - "I've saved it" to go on: a confirmation, not a test.
- **"Show sync code"** in Settings, on any paired device, behind a tap saying that anyone with the code can read and delete the synced data. So a lost copy of the code doesn't matter while one device is left.
- **A reminder now and then** ("Do you still have your sync code?") only if wanted, with an off switch like every nudge.
- **A code that got out:** "Change sync code" in Settings deletes the files under the old code, sends a snapshot under a new one (shown and saved as above), and the other devices pair again. The old code then opens nothing.
- **Not covered by the code:** the storage itself going (our server stopped, the Drive files deleted, the Google account lost). Export backup stays in Settings as the copy that depends on nobody, and the privacy page says so.

## Over Google Drive: set aside

**Not planned** (the owner, 2026-11-07: Google adds friction, and FOSS is preferred). Kept for if it is ever wanted: the same files, kept in the learner's Drive instead of on a server of ours.

- **Where:** Drive's **app folder** (the `drive.appdata` permission): a hidden folder only this app can see, counted in the learner's Drive space. The learner can't browse it, but can see how much it holds and delete it, in Drive's settings under "Manage apps". The app sees nothing else in their Drive.
- **Talking to Google directly** with `fetch`, as the roadmap says: no script of Google's, no dependency. Drive's API accepts calls from a web page (CORS). The service worker must leave these calls alone.
- **Signing in:** a web app with no server gets an **access token** (a pass Google gives after signing in) that lasts about an hour, and no long-lived one (Google gives those only to apps with a server). When it runs out, the app needs Google again: quietly, by visiting Google and coming straight back when the learner is still signed in there and has agreed before, but that is a page load, or else a tap ("Sync paused: tap to reconnect"). Which of these fits syncing on opening and on hiding is **to try early**, on the owner's devices, before building the rest of this step.
- **The account:** Google keeps each learner's app folder apart, so the account ID isn't needed to find the files; they are still put under it, so files left by an older code are recognized and deleted.
- **Names:** Drive allows two files with the same name. A device writes only its own names, so a twin can only come from a retry, with the same contents; one is kept, the other deleted.
- **Encrypted or not** (to decide then). Encrypted, it is the design above: a sync code besides signing in to Google, and Google can't read the data. Not encrypted: joining and recovering are only signing in with the same Google account, no code to keep, but Google holds readable study data. **Claude recommends encrypting**: one design and one way to recover whichever storage, and moving between Drive and a server of ours stays a copy of files.
- **Recovery over Drive:** sign in with the same Google account, then the code (if encrypted).
- **Registering with Google** (the owner does it, with Claude's help): a Google Cloud project, the consent screen ("玉兔中文 wants to see its own files in your Drive"), a client ID (public, fine in the repository), the stable and test addresses as the places allowed to sign in, and `localhost` for development. Google doesn't allow a LAN address, so a phone on the dev server tests against the stand-in only. Until Google has checked the app, at most 100 named test users; checking a non-sensitive permission asks for the privacy page, a home page and proof of owning the domain. **To find out before starting:** whether Google accepts `bunnyapocalypse.github.io` for that, or whether a domain of our own is needed.
- **In the Android app later:** Google refuses sign-in inside an app's built-in browser, so the Capacitor app signs in through the phone's own browser or a plugin (a dependency to approve then).

## The server

- **What it is** (`server/server.js`, built 2026-11-07): a small program of our own, free software (GPL, `server/`): plain Node with **no npm dependencies**, keeping files on disk (a folder per account), behind **Caddy** (Apache-2.0), which provides HTTPS and renews its certificates by itself. On a small rented machine (a VPS) at Hetzner, running AlmaLinux 10, set up by the playbooks in `deploy/`. It understands nothing of the app, all under `/v1`:
  - `GET /health`: "ok", for a watch on the server;
  - `GET /accounts/<account>`: the files, `[{ name, size }]`; `DELETE /accounts/<account>`: all of them;
  - `GET`, `PUT`, `DELETE /accounts/<account>/files/<name>`: a file; `PUT` refused (409, `exists`) if one of that name is there: written under a name of its own, then linked to its real name, so a file is never seen half written or replaced.
- **The access secret** (from the code, `keysFor`) goes with every request (`Authorization: Bearer …`). The first file saved makes the account and fixes it: the server keeps only its SHA-256 hash (`.access` in the account's folder) and compares in constant time. So an account ID seen in a log is not enough to read or delete anything.
- **Names** are small letters, digits and dashes (no dots or slashes), accounts 32 hex letters: nothing can reach outside its folder or name `.access`.
- **Unused accounts are deleted** after 365 days (the owner, 2026-11-07; `EXPIRE_DAYS`, 0 for never): "used" is any request with the account's secret, kept as the `.access` file's modification time, renewed at most once a day; the server looks a minute after it starts and then daily (`expireUnused`). A device coming back later finds its files gone and sends everything again (`startAfresh`): nothing a device has is lost. The privacy page is to say so. Files a lost or reset device left in an account still used stay (at most its last snapshot and 2 MB of batches).
- **Limits** (`server/README.md`): 64 MB a file, 256 MB an account, 30 GB the whole server, 10 new accounts a day and 600 requests a minute from one address; only pages from the allowed sites (CORS, the browser's rule for which sites may call a server; a request from another refused); `SYNC_PAUSED=1` switches it off for everyone. Every answer is `no-store`. An error is `{ reason }` (listed at the top of `server.js`).
- **The log** has one line a request (method, account or file, status): never an account, a file's name or an address.
- **In the app** (`src/syncServer.js`): `serverStorage({ address, account, access })` gives the storage `sync.js` uses, plus `removeAll`; no answer at all is `reason: 'offline'`; a save under 60 KB is sent with `keepalive` (it may finish after the page is closed).
- **On this computer:** `npm run sync-server` (http://127.0.0.1:8787, files in `local/sync-data/`).
- **Anyone can run one:** the app has a "Sync server" address in Settings, ours by default. A learner with a home server, a club or a school can run the same program; that is also the answer to "what if the owner stops?".
- **Logs** keep no file contents and IP addresses only briefly.
- **Test and stable** use separate places (`__CHANNEL__`), as everything else kept per site.
- **Stopping the server** loses nothing: every device has everything, and syncing just stops. Said with notice.
- **A privacy page** saying the above in plain words, and a way to delete everything from Settings. The owner is the data controller under the GDPR; with no names, no emails and only encrypted files, that is mostly the page, deletion and an EU host (not legal advice).

## Cost and upkeep

Estimated 2026-11-07 from the owner's own backup (47 MB as a file, **5.7 MB compressed**; 6,406 reviews in 30 days, **0.4 MB compressed a month**), and **again once the code was written** (same day):

- **Space a learner:** the newest snapshot, the batches since (up to 2 MB or 200), and for a while an older snapshot until its device tidies it. The owner about 8 MB, 14 MB at most; a typical learner (a year at 50 reviews a day) 1–3 MB. Turning sync on sends everything twice, once: a batch of all of it, then the snapshot it brings on (about 12 MB for the owner).
- **Requests an active learner a day:** a send at most every 5 minutes of study, a whole sync on each opening or return (10–20 a day), and, since each request carries the access secret in a header, the browser's question before most of them (CORS: remembered per address, and each batch has a new one): **100–200**.
- **Found while recalculating, and fixed:** a snapshot after 2 MB alone would have left a lighter learner with thousands of small batches, their list read at every whole sync (about 100 KB each, 2 MB a day on a phone): now also after 200 (`SNAPSHOT_AFTER_BATCHES`). And nothing deleted accounts nobody uses: now after 365 days (`EXPIRE_DAYS`, the server).

| Learners | Space (with old accounts) | Requests | Traffic | About |
|---|---|---|---|---|
| 10 to 1,000 | up to 3 GB | about 2 a second | about 10 GB a month | €4–6 a month: the smallest VPS (2 cores, 4 GB, 40 GB disk, 20 TB traffic) |
| 10,000 | 30 GB | about 20 a second | about 100 GB a month | €5–10 a month |
| 100,000 | 300 GB | about 200 a second | about 1 TB a month | €30–50 a month: larger, with a disk added |

**The domain costs nothing more:** `yutu.bunnyapocalypse.space`, a subdomain of the owner's own (the owner, 2026-11-07). Prices as known in mid-2026; to check before renting. Traffic stays far inside what is included.

**Upkeep is kept small by design:** nothing on the server is irreplaceable (no backups), downtime is no emergency (the app is offline-first), there are no accounts, passwords or emails (no resets, no support), and no dependencies (no stream of warnings). What remains:

- **By itself:** security updates (`dnf-automatic`, daily) and a weekly restart if one is needed, certificates (Caddy), restarts after a crash (`systemd`), unused accounts deleted, and, once a Healthchecks URL is set, an email if the server is down or the disk fills.
- **Monthly, 15–30 minutes:** a look at the alerts and the disk; Node's security releases (or automatic).
- **Monthly:** `ansible-playbook update.yml` (everything else, and a restart if needed) and `status.yml`. **Now and then:** the next Node version when AlmaLinux offers it. **About 2035:** AlmaLinux's next major release (AlmaLinux 10 is supported until then; no upgrade every two years, the owner's reason for it).
- **Now and then:** blocking someone who uses it as free file storage; a security alert to act on.
- **The owner holds** the host account, the domain and the SSH key (the key that logs in to the server), all with two-factor sign-in. Whether Claude may log in to do upgrades is the owner's choice.

## Making sure it is secure

The owner isn't a developer, so the safety has to come from the design and from evidence, not from reading every line:

- **Mistakes cost little by design:** with the files encrypted and no passwords, a bug in the server or storage exposes only scrambled bytes; the server is tiny and has no dependencies.
- **A test for each claim**, which Claude shows rather than asserts: another account's files are refused; a wrong code can't open a file; a changed file is caught; a too-big file is refused; a request from another site is refused; the stored bytes hold no readable Chinese or pinyin; the sync code is in no backup.
- **Reviews:** `/security-review` and `/code-review` on the branch; a fresh session asked to break it; GitHub's free checks (Dependabot, secret scanning, CodeQL); before real testers use it, an hour of an experienced person's time on the server and the encryption code.
- **Running it:** two-factor sign-in at the host, GitHub and the domain; the SSH key and any other secret never in the repository; logging in by key only, no passwords; a switch to turn syncing off for everyone at once.

## What is built

Step 1, done 2026-11-07, with nothing yet turning it on:

- **The database at version 4** (`src/db.js`): the stores `outbox` and `sync` (`getSyncValue`, `setSyncValue`), never in a backup. Every function that saves words, decks, settings, reviews or removal marks notes them through `changing` while `setOutboxOn(true)`; `readOutbox`, `takeOffOutbox`, `readSlice`, `readEverything`, `saveTakenIn` (in parts of `RECORDS_AT_A_TIME`, as a snapshot may be a whole history), `sendEverything` (also called by `replaceEverything` while sync is on).
- **`src/syncBatch.js`:** `buildBatch`, `isEmptyBatch`, `wordsTouched`, `applyBatch`.
- **`src/sync.js`:** `createSync({ local, storage, key })` gives `syncNow()`: the device's ID (`device` in the sync store, made the first time); sending the outbox as `batch-<device>-<number>` (ten digits, so names sort by number; `nextNumber`; a number found taken moves on to the next); the newest snapshot's covers (`snapshotCovers`, read once); a snapshot taken in where needed; the other devices' batches in order (`taken`, by device, noted after each); a snapshot made when due; tidying. It returns `{ sent, takenIn, snapshotTakenIn, snapshotMade, changed, problems }`; a problem is `missing-batch` (later batches of that device wait), `bad-batch` (a file isn't the batch its name says) or `cannot-open`. A sync asked for while one runs waits, then one more runs for all that asked. Files are gzip-compressed JSON, encrypted (`encodeFile`, `decodeFile`). `local` is `db.js` in the app; the storage is handed in (`list` giving `{ name, size }`, `read`, `save` refusing an existing name with `reason: 'exists'`, `remove`).
- **`src/syncCode.js`:** the sync code and encryption (above).
- **Step 3 so far, 2026-11-07:** the server and `src/syncServer.js` (above, "The server"), and **Settings › Your data and backups › Sync between devices** (`sync-setting` in `index.html`, `src/syncPanel.js`), offered only where there is a server (`DEFAULT_SERVER` in `src/syncControl.js`, from `__SYNC_SERVER__` in `vite.config.js`: `VITE_SYNC_SERVER`, else the local one under `npm run dev`, none in a build yet). Three parts, one at a time:
  - **Off** (`sync-off`): what it is ("encrypted on this device…"), "Turn on sync", "I have a sync code" (a box, read with `readCode`; a wrong code says which way it is wrong, `sync.codeProblem.*`).
  - **The code** (`sync-code-step`): made, shown in groups before anything is sent, with Copy, Save as file (`yutu-chinese-sync-code.txt`, the code with the date, the app's address and how to use it, `sync.keepingText`), Print (the same text in a hidden frame, so only it goes on paper), a line suggesting a password manager, then "I've saved it" (primary, turns sync on) or Cancel. "Show sync code" shows it again, after a warning, with "Hide the code".
  - **On** (`sync-on`): "Last synced …" or "Syncing…", with what went wrong (`PROBLEMS` in `syncPanel.js`); Sync now, Show sync code, Turn off sync (asks; the words stay; `forgetSync` in `db.js` empties the sync store and the outbox), Delete synced data (danger, asks; `removeAll` on the server, then off).
  - The data group's first line says the words are synced while sync is on (`settings.dataWhereSynced`).
  - `src/syncControl.js` (`createSyncControl`): `start` (picks sync up at start), `turnOn(code)` (keeps the code and server, sends everything, syncs), `syncNow`, `turnOff`, `deleteSyncedData`, `status()`. After a sync brought changes, `review.load()` and the word list (`main.js`), as after the Decks tab.
  - **A QR code** of the link with the code (the owner, 2026-11-07: `qrcode-generator`, MIT, approved that day; `src/syncCodeView.js` draws it as an SVG, dark on light in both looks, `--qr-dark`, `--qr-light`, `--qr-size`). The link is the app's address with `#sync=<code>`: another device's own camera opens the app with it, and what follows `#` never reaches a server. **It never joins by itself** (`takeCodeFromLink`, in `main.js` at start): the code goes in the box to join, the introduction's or Settings', with a warning to use only a code from one's own device (`sync.fromLink`), since a link with someone else's code would sync the learner's words into an account that person can read; and it is taken out of the address. On an iPhone the link opens Safari, not the app on the Home Screen, which keeps its words apart: there the code is typed. The file and the printed page hold the link too, and the printed page the QR code.
  - **Scanning a QR code** (the owner, 2026-11-07: "an option to scan a QR code in the intro flow"; `jsqr`, Apache-2.0, approved that day, last released 2021): "Scan a QR code" beside "Sync with this code", in the introduction's code box and in Settings' (`src/syncScan.js`, `scanForCode`). A pop-up (`scan-dialog`) shows the camera (`getUserMedia`, the camera facing away; the browser asks first); five times a second the picture, made at most 640 pixels wide, is searched with jsQR (loaded only then, its own file in the build, 130 KB, kept for offline use). A code found (from the link, `codeIn`, and readable by `readCode`) closes the pop-up and goes in the box; joining is still the learner's tap. Another QR code says so and goes on looking. No camera, refused, or not starting: said in the pop-up, with typing as the way. The browser test gives the page a canvas showing the link's QR code as its camera.
  - **The code view** (`syncCodeView.js`, shared with the introduction): the code, what it is, Copy / Save as file / Print, the password manager line, then the QR code and how to scan it, then the buttons to go on.
  - **Joining brings the other device's settings**, which the app reads only at start: a join that changed anything starts the app again (`location.reload()`, as after importing a backup).
  - **In the introduction** (the owner, 2026-11-07, two places; `docs/interface.md`): on the first screen, "Already using 玉兔中文 on another device?" (`welcome-join`) opens the code box; joining saves `welcomeDone` and starts the app again with the other device's words and settings, skipping the rest (choices made in the introduction would be newer and win over the other device's). On the last screen, "Sync between devices" (`welcome-sync`) as two choices, not buttons (at most three on a screen): "Turn on sync" shows a new code with its QR code at once, and the screen's button (and "Not now") wait until "I've saved my sync code" is ticked; "Just this device for now" is chosen at first. Sync is turned on after the introduction's level is added.
  - Tested in `tests/browser/syncSettings.browser.js`, against a server of the test's own: Settings, and in the introduction turning on, joining (with the other device's script) and a link. Pictures: `local/sync-pictures/` (`node local/sync-pictures/shoot.js`).
- **Step 2, done 2026-11-07:** encryption and the sync code, snapshots, sending everything.
- **Corrected reviews** carry `correctedAt` (`correct` in `src/review.js`), and `mergeBackups` keeps the later-corrected copy.
- **Tests:** `tests/syncBatch.test.js` (against `mergeBackups`, any order, twice, removals, corrections both ways, a corrected review), a case in `tests/merge.test.js`, `tests/sync.test.js` (two devices through a storage in memory: the same data as combining backups, nothing sent back, no connection, a number taken, a record changed while sending, a missing or wrong batch, syncs asked for at once, nothing readable in the storage, another code, everything from before, snapshots made, joined from, caught up through and tidied, a snapshot without its covers file), with the made-up devices in `tests/fixtures/devices.js`; `tests/syncCode.test.js` (the code typed in any way, mistakes caught, the same keys on every device, the key not readable, a file unreadable, changed or renamed); and `tests/browser/sync.browser.js` (the outbox, taking a batch in, a whole encrypted sync with the real database, sending everything after a backup, in a real browser).
- **Syncing by itself** (`src/syncTiming.js`, `startSyncTiming`, started in `main.js`), as planned under "When to sync": sending only (`syncNow({ sendOnly: true })`, which reads no listing and takes nothing in) 30 s after a change and at least every 5 minutes while changes keep coming (`onOutboxChange` in `db.js` tells it of each), and at once when the page is put away (`visibilitychange` to hidden); a whole sync when the app starts, comes back into view and when the connection comes back (`online`), retried after a failure that may pass (`offline`, `too-many`, `paused`, `server-error`) 1, 5, then 30 minutes later. **Never while writing:** a whole sync waits while a finger or pen is on the writing area and for 4 s after (`WRITING_REST_MS`, `isBusy` in `main.js`), looking again every 2 s. Syncs asked for together run once more after the one under way, a whole one if any asked for that.
- **Settings from another device take effect at once:** after a sync that changed anything, `settings.reload()` (`src/settings.js`) reads them again and, if any differ, applies the look, font, reading style and target, refills Settings and tells the screens, as a change made here does.
- **Files lost on the server** (`filesLost`, `startAfresh` in `src/sync.js`): a device that has sent batches but finds none of its own and no snapshot covering them starts afresh: a new device ID (so its batches are numbered from 1 and a device joining later finds none missing), `taken` forgotten, and everything sent again (`startedAfresh` in the result). Each device does so at its next sync; the others take what comes in, changing nothing they had.
- **Speed in the browser** (measured 2026-11-07 on the owner's backup at 6x CPU slowdown, as on their tablet): taking in a typical batch (20 reviews, 19 words) about 0.4 s in all, the page held up at most 0.2 s; a whole day at once (526 reviews, 299 words) 0.9 s reading, 0.8 s working out, 0.4 s saving, held up at most 1.1 s. Both only when nothing is being written. If that is too much, the working out could move to a worker (a second thread) later.
- Tested in `tests/browser/syncSettings.browser.js` ("syncing by itself": a setting sent when put away and in effect on the other device when shown; nothing taken in while a stroke is being written) and `tests/sync.test.js` (send-only syncs, files lost).
- **Step 4 so far, 2026-11-07: the server runs** at `https://yutu.bunnyapocalypse.space`: Hetzner, ARM (2 cores, 4 GB, 40 GB), Germany, **AlmaLinux 10** (the owner, over Debian: they use Fedora, and its ten years of support spare a major upgrade every two years), €7.13 a month (€5.99 and 19% VAT). DNS straight to it, **not through Cloudflare's proxy** (tried, and turned off: it would see every secret and every learner's address, and the server would count all learners as Cloudflare's few addresses). Certificate from Let's Encrypt through Caddy; IPv4 and IPv6.
- **Set up and kept by Ansible playbooks** (`deploy/`, the owner's request: runnable without Claude, and by anyone self-hosting; `deploy/README.md`): `setup.yml` (an admin account `yutu` logging in with the owner's key `~/.ssh/yutu_sync`, root and passwords refused; every update, then security ones daily by `dnf-automatic` and a weekly restart if one is needed, `yutu-reboot.timer`; firewalld with SSH, HTTP, HTTPS only, Cockpit closed; Node 22 from AlmaLinux; Caddy from its COPR repository, `epel-10` build; the program as `yutu-sync.service`, sandboxed by systemd, its files in `/var/lib/yutu-sync`; an optional Healthchecks ping, `healthcheck_url`), `deploy.yml` (the program from `server/`, `-e sync_paused=true` to switch syncing off), `update.yml`, `status.yml`. Tested in an AlmaLinux 10 container (`podman --privileged --systemd=always`: systemd's sandbox needs it), twice for no changes the second time, and on the server. `ansible-lint` passes at "production".
- **Checked on the server:** root refused, the admin account with sudo, HTTPS with a valid certificate, two test devices syncing through it (three syncs in 0.6 s) and their account deleted after. Internet scanners came within minutes, all answered "not found"; the log now names only the kind of request (`health`, `account`, `file`, `other`).
- **Not yet:** the app pointed at it (`VITE_SYNC_SERVER` in the deploy workflow, for the test copy first), one real check on the owner's phone and tablet, the privacy page, a Healthchecks account for the alerts.

## Order of building

One step at a time, each agreed before it starts:

1. **The batches without a network** (done 2026-11-07): the outbox, batches, taking them in, against a stand-in storage in memory; the test against `mergeBackups`. Database version 4 for the outbox and the sync store; nothing in backups changes.
2. **Encryption and the sync code**, with their tests; snapshots (done 2026-11-07).
3. **The server** (`server/`, with its tests), run locally; then the timing, the Settings section and recovery. Browser tests against the local server.
4. **Running it:** renting the machine and the domain with the owner, setting it up, one real check on the owner's devices, the privacy page.

## Decisions for the owner

- **Host: Hetzner** (the owner, 2026-11-07, over OVHcloud, Infomaniak and Netcup: hourly billing, no contract): ARM, Germany, AlmaLinux 10, €7.13 a month with VAT; **domain: `yutu.bunnyapocalypse.space`**. Running (above).
- **A reminder of the sync code** now and then, or none.
- **The numbers:** 30 seconds after the last change, the cap between sends, the snapshot size.
