# Syncing between devices

**A plan, not built.** Written 2026-11-07 from a talk with the owner (a sync server of our own, sending only changes, when to sync); the open decisions at the end are the owner's. It extends the roadmap's "Syncing through the learner's own storage" (`docs/history.md`) and doesn't replace it: the design below works over Google Drive's app folder as well as over a server of our own. `docs/goals.md` still says nobody's data is held by us; a server changes that only once the owner decides so.

## Why not a whole backup each time

Combining backups (`mergeBackups`, `docs/merging.md`) moves everything: the owner's backup is about 45 MB, and saving it rewrites about 190,000 records (`replaceEverything`), which froze the owner's tablet once already. Doing that at every sync would cost a lot of data and time. So each device sends **only what it changed**, as small batches, and takes in the other devices' batches one record at a time. A whole backup is moved only rarely, as a snapshot (below).

## What the storage holds

Every file is encrypted on the device before it leaves (below), so the storage, Google or our server, sees only scrambled bytes, their sizes and times.

- **One log per device.** Each device has a random device ID (`randomId()`) and writes only its own files: `batch-<device>-<number>`, numbered 1, 2, 3… with no gaps. It never changes or deletes another device's. So two devices syncing at once can never clash, and nothing needs locking.
- **Snapshots:** `snapshot-<device>-<number>`, a whole backup (the format of Export backup, compressed) together with, for each device, the last batch it covers (`{ "A": 812, "B": 230 }`).
- **What the storage must do:** save a file, list the files (or those after a name), read one, delete one. Google Drive's app folder does all four; so would the server below, or a folder synced by Syncthing.

## On the device

- **The outbox:** a new store, a list in the order things happened. An entry is written in the same transaction as the change itself, so one can't be saved without the other:
  - a review saved, and a review corrected while looking back (`correct` in `src/review.js`: same ID, new grade);
  - a word, deck or setting saved by `putAll` with a stamp (changes with `{ stamp: false }` are the app tidying old records, which every device does for itself, and aren't sent);
  - a removal mark;
  - a word renamed (`renameWord`: "from this ID to that one"), so the other device moves cards and reviews the same way;
  - never a device setting (`DEVICE_SETTINGS`) and never cards: cards are worked out from reviews.
- **Why an outbox and not "everything with a later `changedAt`":** reviews have no `changedAt`, a corrected review keeps its time, and a rename is a move, not a record. Each would be missed.
- **Sending:** the outbox is bundled into one batch (the records as they are now, renames as instructions, in order), compressed (`CompressionStream`, built into the browser), encrypted and saved under the next number. Only once the storage says it's saved are those entries taken off the outbox. A batch sent twice by a retry is harmless: taking it in twice changes nothing.
- **A big import** (Anki, Skritter, a backup combined or replaced) would make a huge batch; it sends a snapshot instead.
- **Taking in:** the device remembers, for each other device, the last batch it has taken in, and reads only the newer ones, in order. Each record goes through the same rules as `mergeBackups`: reviews added if missing (IDs are the same everywhere); words, decks and settings by the later `changedAt`, kept as it came (not stamped again); removal marks, `learnedAt`, `startedOverAt` and renames as now. **What it takes in doesn't go into its own outbox**, or devices would echo each other's changes forever.
- **Cards:** only the cards of words that got new reviews are worked out again (`replay`). Anki's imported schedules are records among the reviews, so they replay too. To check when building: `mergeBackups` keeps a card as stored when one side has every review of it, so that combining never changes a schedule without a reason; the batch version needs the same care.
- **The test that holds it together:** for the same data, taking batches in one by one must give exactly what `mergeBackups` gives on the whole backups, in whatever order the batches come. The rules then live in one place where possible, and a test catches any difference.

## Snapshots

- **What for:** a new device, or one away for months, starts from the newest snapshot instead of every batch since the first. If it already has data of its own, it combines the snapshot with it once with `mergeBackups` and sends what the other devices lack as a snapshot of its own.
- **Who writes one:** any device, when the batches since the last snapshot add up to more than a set size (a number to settle by trying, something like 2 MB). The newest two snapshots are kept; a batch is deleted once a snapshot covers it.
- **A batch missing** (a gap in a device's numbers that no snapshot covers) means something went wrong: the device says so and takes the newest snapshot, rather than carrying on with a hole.

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

## Over Google Drive

The same files, kept in the learner's Drive instead of on a server of ours (the roadmap's first step, `docs/history.md`). Nobody's data is then held by us.

- **Where:** Drive's **app folder** (the `drive.appdata` permission): a hidden folder only this app can see, counted in the learner's Drive space. The learner can't browse it, but can see how much it holds and delete it, in Drive's settings under "Manage apps". The app sees nothing else in their Drive.
- **Talking to Google directly** with `fetch`, as the roadmap says: no script of Google's, no dependency. Drive's API accepts calls from a web page (CORS). The service worker must leave these calls alone.
- **Signing in:** a web app with no server gets an **access token** (a pass Google gives after signing in) that lasts about an hour, and no long-lived one (Google gives those only to apps with a server). When it runs out, the app needs Google again: quietly, by visiting Google and coming straight back when the learner is still signed in there and has agreed before, but that is a page load, or else a tap ("Sync paused: tap to reconnect"). Which of these fits syncing on opening and on hiding is **to try early**, on the owner's devices, before building the rest of this step.
- **The account:** Google keeps each learner's app folder apart, so the account ID isn't needed to find the files; they are still put under it, so files left by an older code are recognized and deleted.
- **Names:** Drive allows two files with the same name. A device writes only its own names, so a twin can only come from a retry, with the same contents; one is kept, the other deleted.
- **Encrypted or not** (the owner's decision, below). Encrypted, it is the design above: a sync code besides signing in to Google, and Google can't read the data. Not encrypted: joining and recovering are only signing in with the same Google account, no code to keep, but Google holds readable study data. **Claude recommends encrypting**: one design and one way to recover whichever storage, and moving between Drive and a server of ours stays a copy of files.
- **Recovery over Drive:** sign in with the same Google account, then the code (if encrypted).
- **Registering with Google** (the owner does it, with Claude's help): a Google Cloud project, the consent screen ("玉兔中文 wants to see its own files in your Drive"), a client ID (public, fine in the repository), the stable and test addresses as the places allowed to sign in, and `localhost` for development. Google doesn't allow a LAN address, so a phone on the dev server tests against the stand-in only. Until Google has checked the app, at most 100 named test users; checking a non-sensitive permission asks for the privacy page, a home page and proof of owning the domain. **To find out before starting:** whether Google accepts `bunnyapocalypse.github.io` for that, or whether a domain of our own is needed.
- **In the Android app later:** Google refuses sign-in inside an app's built-in browser, so the Capacitor app signs in through the phone's own browser or a plugin (a dependency to approve then).

## If we run the server ourselves

- **What it is:** a few dozen lines of plain JavaScript on Cloudflare Workers, files kept in Cloudflare R2 (both have free tiers likely to cover a small group). It understands nothing of the app:
  - `PUT /files/<account>/<name>`: save, refused if a file of that name exists (a log is only added to; snapshots are new names);
  - `GET /files/<account>?after=<name>`: list; `GET /files/<account>/<name>`: read;
  - `DELETE /files/<account>/<name>`, and `DELETE /files/<account>` for "delete everything".
- **Knowing the account ID is the key to the box**, as with a link to a private document: it is 128 bits worked out from the code, too many to guess. (To look at when building: a second secret, also from the code, sent with each request, so that someone who sees an account ID in a log still can't delete the files.)
- **Limits:** a size cap per file and per account, a cap on requests per address, only requests from our two sites (CORS, the browser's rule for which sites may call a server), and a spending cap at Cloudflare so no surprise bill.
- **Logs** keep no file contents and IP addresses only briefly.
- **Test and stable** use separate places (`__CHANNEL__`), as everything else kept per site.
- **Stopping the server** loses nothing: every device has everything, and syncing just stops.
- **A privacy page** (needed for Google Drive too) saying the above in plain words, and a way to delete everything from Settings.

## Making sure it is secure

The owner isn't a developer, so the safety has to come from the design and from evidence, not from reading every line:

- **Mistakes cost little by design:** with the files encrypted and no passwords, a bug in the server or storage exposes only scrambled bytes; the server is tiny and has no dependencies.
- **A test for each claim**, which Claude shows rather than asserts: another account's files are refused; a wrong code can't open a file; a changed file is caught; a too-big file is refused; a request from another site is refused; the stored bytes hold no readable Chinese or pinyin; the sync code is in no backup.
- **Reviews:** `/security-review` and `/code-review` on the branch; a fresh session asked to break it; GitHub's free checks (Dependabot, secret scanning, CodeQL); before real testers use it, an hour of an experienced person's time on the server and the encryption code.
- **Running it:** two-factor sign-in on Cloudflare, GitHub and any domain; Cloudflare's keys only in GitHub's secrets, never in the repository; the narrowest keys that work; a switch to turn syncing off for everyone at once.

## Order of building

One step at a time, each agreed before it starts:

1. **The batches without a network:** the outbox, batches, taking them in, snapshots, against a stand-in storage in memory; the test against `mergeBackups`. A database version raised for the outbox and the sync store, existing data carried over.
2. **Encryption and the sync code**, with their tests.
3. **The first real storage** (the owner's choice, below; for Drive, signing in tried first on the owner's devices), then the timing and the Settings section. Browser tests against a stand-in; one real check on the owner's devices.
4. **The other storage**, if wanted.

## Decisions for the owner

- **Google Drive first, or a server of our own first** (the roadmap says Drive; the design fits both).
- **Encrypt on Google Drive too?** It keeps Google from reading the data, but needs the sync code there as well, besides signing in to Google ("Over Google Drive"; Claude recommends it).
- **A QR code for pairing:** making one needs a library (a dependency to approve) or a few hundred lines of our own; reading one with the camera doesn't work in Firefox. Typing the code or opening a link may be enough.
- **A reminder of the sync code** now and then, or none.
- **The numbers:** 30 seconds after the last change, the cap between sends, the snapshot size.
