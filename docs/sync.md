# Syncing between devices

**Being built, step 1 of 4** (below). Planned 2026-11-07 with the owner, who decided that day: **a server of our own, free software, first**; Google Drive set aside (it adds friction, and the owner prefers FOSS wherever possible). Syncing is opt-in; the app still works fully offline, and this is the one agreed exception to "no backend" (CLAUDE.md). The files are encrypted on the device, so the server holds nothing anyone can read.

## Why not a whole backup each time

Combining backups (`mergeBackups`, `docs/merging.md`) moves everything: the owner's backup is about 45 MB, and saving it rewrites about 190,000 records (`replaceEverything`), which froze the owner's tablet once already. Doing that at every sync would cost a lot of data and time. So each device sends **only what it changed**, as small batches, and takes in the other devices' batches one record at a time. A whole backup is moved only rarely, as a snapshot (below).

## What the storage holds

Every file is encrypted on the device before it leaves (below), so the storage, Google or our server, sees only scrambled bytes, their sizes and times.

- **One log per device.** Each device has a random device ID (`randomId()`) and writes only its own files: `batch-<device>-<number>`, numbered 1, 2, 3… with no gaps. It never changes or deletes another device's. So two devices syncing at once can never clash, and nothing needs locking.
- **Snapshots:** `snapshot-<device>-<number>`, a whole backup (the format of Export backup, compressed) together with, for each device, the last batch it covers (`{ "A": 812, "B": 230 }`).
- **What the storage must do:** save a file, list the files (or those after a name), read one, delete one. The server below does only that; so could Google Drive's app folder or a folder synced by Syncthing, later.

## On the device

- **The outbox** (store `outbox`, `src/db.js`): one entry per record changed, `{ key: "<store>:<id>", store, id, token }`, written in the same transaction as the change, so one can't be saved without the other. A record changed twice has one entry. **Only while sync is on** (`setOutboxOn`); turning it on starts with a snapshot, so nothing before is needed. What goes in:
  - a review saved, and a review corrected while looking back (`correct` in `src/review.js`: same ID, new grade, and `correctedAt`);
  - a word, deck or setting saved with a stamp (changes with `{ stamp: false }` are the app tidying old records, which every device does for itself, and aren't sent);
  - a removal mark;
  - never cards: cards are worked out from reviews. Device settings (`DEVICE_SETTINGS` in `src/merge.js`) are left out when the batch is made.
- **A renamed word** (`renameWord`) needs no instruction of its own: the word goes in the outbox with its old ID in `formerIds`, and taking it in moves the other device's cards and reviews, as combining backups does.
- **Why an outbox and not "everything with a later `changedAt`":** reviews have no `changedAt`, and a corrected review keeps its time. Both would be missed.
- **A corrected review** carries `correctedAt`; of two copies of one review, combining (`mergeBackups`) keeps the one corrected later, and a side's cards count as complete only if it has the same copy of every review. Before syncing, no other device could have the first copy; with it, one can.
- **Sending:** the outbox is bundled into one batch (`buildBatch` in `src/syncBatch.js`: the records as they are now), compressed (`CompressionStream`, built into the browser), encrypted and saved under the next number. Only once the storage says it's saved are those entries taken off the outbox, and only if not changed again meanwhile (`token`). A batch sent twice by a retry is harmless: taking it in twice changes nothing.
- **A big import** (Anki, Skritter, a backup combined or replaced) would make a huge batch; it sends a snapshot instead.
- **Taking in** (`applyBatch` in `src/syncBatch.js`): **it is `mergeBackups` itself**, run on a slice of this device: all its words, decks, settings and removal marks (a few thousand small records), and only the reviews and cards of the words the batch touches (by the reviews' `wordId` index and the cards' IDs). It gives what to save and what to delete; records are saved as they came (`changedAt` not stamped again). So the rules live in one place. **What it takes in doesn't go into its own outbox**, or devices would echo each other's changes forever.
- **Cards:** only the cards of the words touched are worked out again (`replay`), and a card stays as stored when this device already has every review of it, as in combining. Anki's imported schedules are records among the reviews, so they replay too.
- **The test that holds it together** (`tests/syncBatch.test.js`): taking another device's batches in one by one gives what `mergeBackups` gives on the whole backups, in whatever order they come, and taking one in twice changes nothing.

## Snapshots

- **What for:** a new device, or one away for months, starts from the newest snapshot instead of every batch since the first. If it already has data of its own, it combines the snapshot with it once with `mergeBackups` and sends what the other devices lack as a snapshot of its own.
- **Who writes one:** any device, when the batches since the last snapshot add up to more than a set size (a number to settle by trying, something like 2 MB). The newest two snapshots are kept; a batch is deleted once a snapshot covers it.
- **A batch missing** (a gap in a device's numbers that no snapshot covers) means something went wrong: the device says so and takes the newest snapshot, rather than carrying on with a hole.
- **The server holds nothing that can't be replaced:** every device has everything. A device that finds its files gone (a server's disk lost, a move to another host, a server run afresh) sends a snapshot again. So the server needs **no backups**, and moving it moves no data.

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

- **The sync code:** turning sync on creates a random secret of 160 bits, shown as about 32 letters and digits in groups. Another device joins by typing it in (or opening a link with the code after `#`, which the browser never sends to a server). There are no accounts and no passwords.
- **Two things are worked out from the code** with HKDF (WebCrypto's standard way to make several keys from one secret): an **account ID**, which the storage sees and files the learner's files under, and the **encryption key**, which never leaves the device. The ID doesn't reveal the key.
- **Every file** is encrypted with AES-GCM (WebCrypto; no dependency, no encryption of our own making), with a fresh random value (IV) each time. The file's name is bound into the encryption, so the storage can't pass off one batch as another; a changed file fails to open, and the device says so.
- **Losing the code** loses nothing on the devices: the learner turns sync off and on again with a new code. We can't recover a code, by design.
- **The code is kept out of backups:** a backup file holding it would hold the key to everything synced. It goes in a place of its own on the device, not in `settings` (and named apart for the test copy, `__CHANNEL__`).
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

- **What it is:** a small program of our own, free software (GPL, in this repository, `server/`): plain Node with **no npm dependencies**, keeping files on disk, behind **Caddy** (Apache-2.0), which provides HTTPS and renews its certificates by itself. On a small rented machine (a VPS) at an EU host such as Hetzner, running Debian. It understands nothing of the app:
  - `PUT /files/<account>/<name>`: save, refused if a file of that name exists (a log is only added to; snapshots are new names);
  - `GET /files/<account>?after=<name>`: list; `GET /files/<account>/<name>`: read;
  - `DELETE /files/<account>/<name>`, and `DELETE /files/<account>` for "delete everything".
- **Knowing the account ID is the key to the box**, as with a link to a private document: it is 128 bits worked out from the code, too many to guess. (To look at when building: a second secret, also from the code, sent with each request, so that someone who sees an account ID in a log still can't delete the files.)
- **Limits:** a size cap per file and per account, a cap on requests and new accounts per address, a cap on the whole disk, and only requests from our two sites (CORS, the browser's rule for which sites may call a server).
- **Anyone can run one:** the app has a "Sync server" address in Settings, ours by default. A learner with a home server, a club or a school can run the same program; that is also the answer to "what if the owner stops?".
- **Logs** keep no file contents and IP addresses only briefly.
- **Test and stable** use separate places (`__CHANNEL__`), as everything else kept per site.
- **Stopping the server** loses nothing: every device has everything, and syncing just stops. Said with notice.
- **A privacy page** saying the above in plain words, and a way to delete everything from Settings. The owner is the data controller under the GDPR; with no names, no emails and only encrypted files, that is mostly the page, deletion and an EU host (not legal advice).

## Cost and upkeep

Estimated 2026-11-07 from the owner's own backup: 47 MB as a file, **5.7 MB compressed**; 6,406 reviews in 30 days (about 210 a day), **0.4 MB compressed a month**. With two snapshots and the batches since, about 13 MB on the server for the heaviest learner; about 3 MB a learner on average is generous.

| Learners | Space | Requests | Machine | About |
|---|---|---|---|---|
| 10 to 1,000 | up to 3 GB | under 1 a second | the smallest VPS (2 cores, 4 GB, 40 GB disk, 20 TB traffic) | €5–6 a month |
| 10,000 | 30 GB | about 6 a second | the same, maybe one size up | €6–12 a month |
| 100,000 | 300 GB | about 60 a second | larger, with a disk added | €30–50 a month |

Plus a domain, about €10–15 a year, so the address doesn't depend on the host. Prices as known in mid-2026; to check before renting. Traffic never matters (a day's batch is kilobytes).

**Upkeep is kept small by design:** nothing on the server is irreplaceable (no backups), downtime is no emergency (the app is offline-first), there are no accounts, passwords or emails (no resets, no support), and no dependencies (no stream of warnings). What remains:

- **By itself:** Debian's security updates (`unattended-upgrades`), certificates (Caddy), restarts after a crash (`systemd`), an email if the server is down or the disk fills.
- **Monthly, 15–30 minutes:** a look at the alerts and the disk; Node's security releases (or automatic).
- **Every 1–2 years:** the next long-term version of Node (each is supported about two and a half years), an hour or two with Claude; **every 2 years or so:** Debian's next release, half a day.
- **Now and then:** blocking someone who uses it as free file storage; a security alert to act on.
- **The owner holds** the host account, the domain and the SSH key (the key that logs in to the server), all with two-factor sign-in. Whether Claude may log in to do upgrades is the owner's choice.

## Making sure it is secure

The owner isn't a developer, so the safety has to come from the design and from evidence, not from reading every line:

- **Mistakes cost little by design:** with the files encrypted and no passwords, a bug in the server or storage exposes only scrambled bytes; the server is tiny and has no dependencies.
- **A test for each claim**, which Claude shows rather than asserts: another account's files are refused; a wrong code can't open a file; a changed file is caught; a too-big file is refused; a request from another site is refused; the stored bytes hold no readable Chinese or pinyin; the sync code is in no backup.
- **Reviews:** `/security-review` and `/code-review` on the branch; a fresh session asked to break it; GitHub's free checks (Dependabot, secret scanning, CodeQL); before real testers use it, an hour of an experienced person's time on the server and the encryption code.
- **Running it:** two-factor sign-in at the host, GitHub and the domain; the SSH key and any other secret never in the repository; logging in by key only, no passwords; a switch to turn syncing off for everyone at once.

## Order of building

One step at a time, each agreed before it starts:

1. **The batches without a network** (started 2026-11-07): the outbox, batches, taking them in, against a stand-in storage in memory; the test against `mergeBackups`. Database version 4 for the outbox and the sync store; nothing in backups changes.
2. **Encryption and the sync code**, with their tests; snapshots.
3. **The server** (`server/`, with its tests), run locally; then the timing, the Settings section and recovery. Browser tests against the local server.
4. **Running it:** renting the machine and the domain with the owner, setting it up, one real check on the owner's devices, the privacy page.

## Decisions for the owner

- **The host and the domain name** (step 4).
- **A QR code for pairing:** making one needs a library (a dependency to approve) or a few hundred lines of our own; reading one with the camera doesn't work in Firefox. Typing the code or opening a link may be enough.
- **A reminder of the sync code** now and then, or none.
- **The numbers:** 30 seconds after the last change, the cap between sends, the snapshot size.
