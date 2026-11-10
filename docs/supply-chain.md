# Supply chain: what the app takes from others

Everything in the app and the sync server that someone else wrote or collected, how far each is trusted, how updates are taken, and what to do when one goes wrong. Asked for by the owner on 2026-11-07, when syncing added `qrcode-generator` and `jsqr`; built 2026-11-08. The sync server's own security notes are in `docs/sync.md`.

"Supply chain" means the people and services the app depends on to stay safe: a package's maintainer whose account is taken over can publish a version that steals data, and the app would ship it with the next build.

## What the app is made of: the SBOM

Every build writes `dist/sbom.cdx.json`, a **software bill of materials**: a list of everything in the built app that comes from someone else, with version, license and source. It is published with each copy, at `.../yutu-chinese/sbom.cdx.json` and `.../yutu-chinese/test/sbom.cdx.json` (the owner, 2026-11-08: shipped, not only made on request).

- **Format:** CycloneDX 1.5 (<https://cyclonedx.org/>), which tools that check dependencies read.
- **Made by** `scripts/sbom.js`, run by `postbuild` after `scripts/build-offline.js`, so it is not in the service worker's list and is never saved on devices.
- **The npm packages** come from npm's own `npm sbom --package-lock-only --omit dev`: only what is shipped, read from `package-lock.json`, each with its checksum. (Without `--package-lock-only`, npm 10 stumbles over the build tools' own development tools.) npm can't name `hanzi-writer-data`'s license; the script sets it to the Arphic Public License (`Arphic-1999`).
- **The data** that didn't come through npm is listed in `DATA` in the script, from the README of each data folder: source, commit or version, license; a checksum for the files copied unchanged (AnimCJK, Make Me a Hanzi). **When a data folder's README changes its commit, change `DATA` too.**
- **The app itself** is named `yutu-chinese`, with the commit it was built from and the copy (`yutu:channel`, `stable` or `test`).
- The app's own content (learning notes, tips, radicals' meanings) is not listed: it is not taken from others.

## The packages, and how far each is trusted

As of 2026-11-08. All come from registry.npmjs.org, all 24 installed packages have verified registry signatures and 12 have attestations of where they were built (`npm audit signatures`), none runs a script when installed, and `npm audit` finds nothing.

| Package | Version | Released | Kept by | What it can reach | Note |
|---|---|---|---|---|---|
| `hanzi-writer` | 3.7.3 | 2025-09 | one person | the writing area, every review | central; no dependencies |
| `hanzi-writer-data` | 2.0.1 | 2018-10 | one person | data only (stroke files) | finished; never runs |
| `ts-fsrs` | 5.4.2 | 2026-09 | one person, in the FSRS project | every card's schedule | 6.0 is out: see "Planned" |
| `sql.js` | 1.15.0 | 2026-10 | two people | Anki files being imported | WebAssembly build of SQLite |
| `fzstd` | 0.1.1 | 2024-03 | one person | Anki files being imported | small, finished |
| `qrcode-generator` | 2.0.4 | 2025-08 | one person | the sync code shown as a QR code | |
| `jsqr` | 1.4.0 | 2021-04 | two people | the camera picture when scanning a sync code | looks abandoned |
| `vite` (development) | 8.3.4 | 2026-10 | the Vite team | the build and the dev server | pulls in about 16 build packages |

Everything shipped runs in the learner's browser, with their words and progress in reach, and (for the sync code) their sync key. That is why each new dependency needs the owner's yes (CLAUDE.md) and the bar is high.

## The data

Fetched once into the repository, each folder with a README giving source and license (CLAUDE.md, "Licensing"), and reviewed as a `git diff` when it changes:

- **Fixed to a commit or version:** AnimCJK, the recordings (`audio-cmn`), Make Me a Hanzi, OpenDyslexic, the HSK lists (`scripts/build-word-lists.js` downloads them at a commit), Unicode's `CJKRadicals.txt` (version 16.0.0).
- **Checked against a checksum** where the address alone could be swapped: the TOCFL zip (`TOCFL_SHA256` in `scripts/build-word-lists.js`) and `CJKRadicals.txt` (`UNICODE_SHA256` in `scripts/build-radicals.js`). A different file stops the script; if the source changes the file on purpose, look at what changed, then update the checksum.
- **CC-CEDICT** can't be fixed in advance: MDBG offers only today's release. Its date is written into `data/cedict/` and the SBOM, and a refresh is read as a `git diff` before committing.

## The build and the deploy

- **`npm ci --ignore-scripts`** in `.github/workflows/deploy.yml`: installs exactly what `package-lock.json` lists, and stops any package from running code while being installed. (Not in a project-wide `.npmrc`: there it would also switch off this project's own `predev`, `prebuild` and `postbuild`.)
- **Actions named by commit**, with the version as a comment (`actions/checkout@3d3c42e… # v7.0.1`): a version name can be moved to other code by whoever controls the action, a commit can't. `upload-pages-artifact` names the action it uses by commit too.
- **The workflow's permissions** are only reading the code and publishing to Pages; it uses no secrets of its own.
- **The moving page's workflow** (`old-address/deploy.yml`, for the repository at the old address; `docs/offline.md`) names the same actions by the same commits, and has the same permissions and no secrets. Dependabot doesn't look at it here: when it proposes newer actions for `.github/workflows/deploy.yml`, copy the commits there too.

## The sync server

- **No packages, for good:** `server/server.js` imports only Node's own modules (`node:…`), and `server/package.json` has no dependencies. A change that would add one needs the owner's yes and a good reason.
- **Node** from AlmaLinux's own packages, **Caddy** from its official COPR repository (approved 2026-11-07); both updated by themselves (`docs/sync.md`). `ansible-playbook status.yml` prints the versions running (2026-11-08: Node v22.23.2, Caddy v2.11.7, AlmaLinux 10.2): this is the server's bill of materials, which changes by itself every week, so it is not kept in a file.
- **The Ansible collections** in `deploy/requirements.yml` are at exact versions (`ansible.posix` 2.2.2, `community.general` 13.4.0), the ones the playbooks were tested with. On the owner's computer they come from Fedora's packages.

## Taking updates

**Dependabot** (`.github/dependabot.yml`) looks once a week and opens pull requests: one for the week's small npm updates, one for each new major version, one for the actions. A **cooldown of 7 days** holds back any release younger than a week: a package taken over by an attacker is usually found out and withdrawn within days. Security fixes are proposed apart, right away. The major version of `ts-fsrs` is left out (see "Planned").

Before merging one:

1. Read the release notes.
2. Look at what changed in the code: `npm diff --diff=<package>@<old> --diff=<package>@<new>` (for a big package, at least the files that run in the app).
3. Look at `package-lock.json` in the pull request: a new `node_modules/…` entry is a **new package**, which needs the owner's yes like any dependency.
4. `npm ci`, `npm audit signatures`, `npm test`, and the browser suite. **Not in a worktree** (`.claude/worktrees/…`): its `node_modules` is often a link to the main copy's, and `npm ci` empties that through the link (it happened on 2026-11-08); check with `ls -ld node_modules` first.
5. Merge into `main`, which publishes the test copy; it reaches `stable` with the next release.

**Security alerts** (Dependabot alerts, `npm audit`):

- In a **shipped package**, in code the app uses: fixed within a week, released to `stable` without waiting for other work.
- In **Vite or its tools** only: these run on the development computer, not in the app. Taken with the next weekly round, unless the alert is about the dev server, which `npm run dev` makes reachable on the Wi-Fi: then right away.
- In code the app doesn't use: with the next weekly round, saying so in the pull request.

## When a dependency goes wrong

**A compromised release** (found out by an alert, the news, or a strange diff):

1. Don't merge its pull request. The lockfile keeps the version already there, and `npm ci` installs only that.
2. If it was already taken: revert the commit that changed `package-lock.json`, push, and release; check the advisory for what the bad version did, and whether it ran in a copy learners used (the SBOM of each copy says which version it had).
3. If it ran while building: the workflow has no secrets to steal, but check the published site and the repository for changes nobody made.

**An abandoned package** (no releases, unanswered issues), in order of preference:

1. **Keep the version** (the lockfile already does): fine while no security problem is found.
2. **Copy it into the repository** (a folder with its `LICENSE` and a README giving source and version, as for the data), and fix it there if needed. Possible for all of them, being MIT or Apache-2.0 licensed.
3. **Replace it.** `jsqr`: the browser's own `BarcodeDetector`, where the browser has it, else a copied `jsqr`. `fzstd`: copied (one small file).

## Planned

- **ts-fsrs 6 and FSRS-7** (roadmap, "Near-term"; the owner, 2026-11-08). 6.0.0 (2026-10-28) brings the FSRS-7 model, with intervals of part of a day and a separate short-term memory, and a new package from the same project, `@open-spaced-repetition/srs-kit` (BSD-3-Clause). Not a routine update: about ten breaking changes (`get_retrievability` is gone, card fields renamed, other fuzz), Node 24 required, and moving cards to FSRS-7 means rebuilding them from their complete review history. Its own milestone once 6.0 has settled.

## GitHub's own checks

The repository's settings (the owner's): Dependabot alerts and security updates, secret scanning and push protection, and **CodeQL** (switched on 2026-11-08, "Default" setup: JavaScript, the workflow, the Python script), which reads the code for common security mistakes on every push to `main` and shows them under the repository's Security tab.

**CodeQL's first findings** (2026-11-08), none a hole:

- **In the tests** (9): the browser tests build a line of JavaScript for the test browser from their own fixed values, quoted with `JSON.stringify`; `tests/text.test.js` searches `index.html` with regular expressions. Nothing from outside reaches either.
- **In the app** (1): `cleanField` in `src/ankiImport.js` turns an Anki field into text that may contain `<` (from `&lt;`). Safe because of a rule: **text from outside (imported decks and backups, synced data, anything typed) is only ever shown with `textContent` or `fillMixed`, never with `innerHTML`.** The app's `innerHTML` takes only fixed pictures and its own interface texts (`data-t-html`, without values put in). A new finding in `src/` is read before anything else.
