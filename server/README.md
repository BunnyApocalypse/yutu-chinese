# The sync server

A small box of files for syncing 玉兔中文 (Yutu Chinese) between a learner's devices: one folder per learner, holding files the learner's devices encrypted before sending. The server can read none of them. How syncing works, and why the server is built this way: `docs/sync.md`.

- **Code:** `server.js`, plain Node (version 22 or later), no dependencies. GPL-3.0-only, as the app (`LICENSE` at the top of the repository).
- **Tests:** `tests/syncServer.test.js`, run with the app's `npm test`.

## Running it on your own computer

    npm run sync-server

It listens on http://127.0.0.1:8787, keeps its files in `local/sync-data/` (git-ignored) and answers the app's dev server and preview (`localhost:5173`, `localhost:4173`).

## Settings

From the environment:

| Name | What | When not given |
|---|---|---|
| `PORT` | the port, on 127.0.0.1 only | 8787 |
| `DATA_DIR` | the folder for the files | `./sync-data` |
| `ALLOWED_ORIGINS` | the sites whose pages may call it, separated by commas | `https://bunnyapocalypse.github.io` |
| `MAX_FILE_MB` | the largest file | 64 |
| `MAX_ACCOUNT_MB` | the most one learner may hold | 256 |
| `MAX_TOTAL_MB` | the most the server may hold | 30720 (30 GB) |
| `NEW_ACCOUNTS_PER_DAY` | new learners a day from one address | 10 |
| `REQUESTS_PER_MINUTE` | requests a minute from one address | 600 |
| `TRUST_PROXY` | `1` behind Caddy, so the learner's address is read from it | off |
| `EXPIRE_DAYS` | an account not used for this many days is deleted (`0`: never) | 365 |
| `SYNC_PAUSED` | `1` turns syncing off for everyone (it answers only `/v1/health`) | off |
| `LOG` | `0` for no log; the log never has an account, a file's name or an address | on |

## Running it for others

To be written with the owner when the server is set up (`docs/sync.md`, step 4): a small rented machine with Debian, Caddy in front for HTTPS, `systemd` to keep it running, security updates by themselves.
