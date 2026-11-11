# Running the sync server

Ansible playbooks that set up, update and look after a sync server for 玉兔中文 (Yutu Chinese) on **AlmaLinux 10** (Rocky Linux 10 should work the same). They run from your own computer and log in to the server over SSH: nothing needs installing on the server first. How syncing works and why the server is built this way: `docs/sync.md`.

The owner's server is `sync.yutuchinese.com` (Hetzner, ARM, Germany; `inventory.yml`), also answering as `yutu.bunnyapocalypse.space`, its first name, which apps built before 2026-11-10 use (`sync_extra_domains`). To run your own, see "Your own server" below.

## What you need on your computer

- **Ansible**, with its collections `ansible.posix` and `community.general`. On Fedora: `sudo dnf install ansible ansible-lint` (both collections come with it). Elsewhere, with only `ansible-core`: `ansible-galaxy collection install -r requirements.yml`.
- **The SSH key** the server was made with. The owner's is `~/.ssh/yutu_sync`, with a passphrase: load it once per session with `ssh-add ~/.ssh/yutu_sync`.
- **This repository**: the playbooks copy the server's program from `server/`.

Run everything from this folder: `cd deploy`.

## The playbooks

| Command | What it does | When |
|---|---|---|
| `ansible-playbook setup.yml` | Everything, from nothing: an admin account and key-only logins, updates (security ones daily by themselves, Caddy's weekly, a weekly restart if one is needed), the firewall, the log kept at most 14 days, Node, Caddy (HTTPS), the program as a service. Safe to run again: it puts back whatever drifted. | Once, then after changing `setup.yml` or its templates |
| `ansible-playbook deploy.yml` | The program from `server/` and its settings, restarting it if anything changed. | After changing `server/server.js` or a setting |
| `ansible-playbook update.yml` | Every update, and a restart now if one is needed. | Monthly |
| `ansible-playbook status.yml` | How it is doing: the program, Caddy, the disk, how many accounts, updates waiting, the limits hit today (without addresses), the last log lines. Changes nothing. | Whenever |
| `ansible-playbook deploy.yml -e sync_paused=true` | Switches syncing off for everyone (`false` switches it on again). Learners' apps keep everything and try later. | If something is wrong |

Each ends by checking that `https://<your domain>/v1/health` answers.

## Your own server

1. **A machine** with AlmaLinux 10 (2 cores and 4 GB is plenty for thousands of learners; ARM or x86), your SSH key installed for root, and its IPv4 and IPv6 addresses.
2. **A name for it:** A and AAAA records pointing at those addresses. **Not through a proxy** such as Cloudflare's orange cloud ("DNS only"): Caddy gets its own certificate, the server must see learners' addresses for its limits, and a proxy would see every request's secret.
3. **Your inventory:** `cp inventory.example.yml inventory.yml` and fill it in: the address, the name, and the site your copy of the app is served from (`sync_allowed_origins`). Every other setting is in `group_vars/all.yml`, with what it does; set any of them in your inventory to change it.
4. **The first run, as root:** `ansible-playbook setup.yml -e ansible_user=root`. From then on root can't log in; the playbooks log in as the admin account (`yutu`, with the same key) by themselves.
5. **Your app:** in 玉兔中文, Settings › Your data and backups › Sync between devices, unfold "Sync server" and enter `https://<your domain>` (on each device, before turning sync on or joining). The app checks that your server answers it first; for that, `sync_allowed_origins` must name the site your app is opened from. Or, for a copy of the app of your own, build it with `VITE_SYNC_SERVER=https://<your domain>` (`vite.config.js`) to make it the usual server.

## A watch on the server (optional)

Set `healthcheck_url` to a ping URL from [Healthchecks](https://healthchecks.io) (free, and free software you can run yourself). Every 5 minutes the server tells it whether it answers through HTTPS and its disk is under 90% full; Healthchecks emails you when it says no, or when it stops hearing anything (the whole machine down). Put it in `host_vars/<your host's name in the inventory>/private.yml` (as `healthcheck_url: https://hc-ping.com/…`), which git leaves out: anyone with the URL could send false pings. Then run `setup.yml` again. The check asks Caddy on the server itself, so a moment when its name can't be looked up doesn't count as down.

**Period and grace time** (Healthchecks waits the period, then the grace time, before saying a check that stopped pinging is down; a ping saying "fail" counts at once, whatever the grace time):

| Check | Period | Grace time | Why |
|---|---|---|---|
| The server (`healthcheck_url`) | 5 minutes | 10 minutes | The weekly restart for updates leaves up to about 8 minutes without a ping (the last one before it, the restart, 2 minutes after starting): longer than that, something is wrong. |
| The limits (`healthcheck_limits_url`) | 5 minutes | 1 hour | Its pings stop when the whole server is down, which the first check already says: the long grace time spares a second email for the same thing. |

**The limits, on a check of their own:** make a second check in Healthchecks ("Yutu limits", as in the table) and put its ping URL in the same file, as `healthcheck_limits_url: https://hc-ping.com/…`. It goes red, and Healthchecks emails you once, when the server refused something for a limit since the last look, or holds 70% of the most it may (`sync_warn_percent`); green again when a look finds nothing new. Its event log in Healthchecks shows which limits and how often, without addresses.

**Looking into a limit hit:** on the server (`ssh -i ~/.ssh/yutu_sync yutu@<server>`):

    sudo journalctl -u yutu-sync --grep '^LIMIT ' --since today

Each line says which limit, how many refusals in that minute and, for the limits one address went over, which address (an IPv6 one as its /64 block). The log is kept at most 14 days, as the privacy page promises; on ours it is kept in memory only, so a restart (such as the weekly one after updates) empties it sooner: look before then. A school's address that keeps hitting the limits for new accounts can be given ten times as many: `sync_generous_addresses` in the inventory, then `deploy.yml`.

## How they were tested

`ansible-lint` passes at its "production" level. `setup.yml`, `deploy.yml`, `update.yml` and `status.yml` were run in an AlmaLinux 10 container (`podman`, with systemd) from nothing and then again, which changed nothing; the parts a container can't have (SSH, the firewall, SELinux, restarts) were tried on the owner's server.
