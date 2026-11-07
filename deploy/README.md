# Running the sync server

Ansible playbooks that set up, update and look after a sync server for 玉兔中文 (Yutu Chinese) on **AlmaLinux 10** (Rocky Linux 10 should work the same). They run from your own computer and log in to the server over SSH: nothing needs installing on the server first. How syncing works and why the server is built this way: `docs/sync.md`.

The owner's server is `yutu.bunnyapocalypse.space` (Hetzner, ARM, Germany; `inventory.yml`). To run your own, see "Your own server" below.

## What you need on your computer

- **Ansible**, with its collections `ansible.posix` and `community.general`. On Fedora: `sudo dnf install ansible ansible-lint` (both collections come with it). Elsewhere, with only `ansible-core`: `ansible-galaxy collection install -r requirements.yml`.
- **The SSH key** the server was made with. The owner's is `~/.ssh/yutu_sync`, with a passphrase: load it once per session with `ssh-add ~/.ssh/yutu_sync`.
- **This repository**: the playbooks copy the server's program from `server/`.

Run everything from this folder: `cd deploy`.

## The playbooks

| Command | What it does | When |
|---|---|---|
| `ansible-playbook setup.yml` | Everything, from nothing: an admin account and key-only logins, updates (security ones daily by themselves, a weekly restart if one is needed), the firewall, Node, Caddy (HTTPS), the program as a service. Safe to run again: it puts back whatever drifted. | Once, then after changing `setup.yml` or its templates |
| `ansible-playbook deploy.yml` | The program from `server/` and its settings, restarting it if anything changed. | After changing `server/server.js` or a setting |
| `ansible-playbook update.yml` | Every update, and a restart now if one is needed. | Monthly |
| `ansible-playbook status.yml` | How it is doing: the program, Caddy, the disk, how many accounts, updates waiting, the last log lines. Changes nothing. | Whenever |
| `ansible-playbook deploy.yml -e sync_paused=true` | Switches syncing off for everyone (`false` switches it on again). Learners' apps keep everything and try later. | If something is wrong |

Each ends by checking that `https://<your domain>/v1/health` answers.

## Your own server

1. **A machine** with AlmaLinux 10 (2 cores and 4 GB is plenty for thousands of learners; ARM or x86), your SSH key installed for root, and its IPv4 and IPv6 addresses.
2. **A name for it:** A and AAAA records pointing at those addresses. **Not through a proxy** such as Cloudflare's orange cloud ("DNS only"): Caddy gets its own certificate, the server must see learners' addresses for its limits, and a proxy would see every request's secret.
3. **Your inventory:** `cp inventory.example.yml inventory.yml` and fill it in: the address, the name, and the site your copy of the app is served from (`sync_allowed_origins`). Every other setting is in `group_vars/all.yml`, with what it does; set any of them in your inventory to change it.
4. **The first run, as root:** `ansible-playbook setup.yml -e ansible_user=root`. From then on root can't log in; the playbooks log in as the admin account (`yutu`, with the same key) by themselves.
5. **Your app** needs to know the address: build it with `VITE_SYNC_SERVER=https://<your domain>` (`vite.config.js`).

## A watch on the server (optional)

Set `healthcheck_url` in the inventory to a ping URL from [Healthchecks](https://healthchecks.io) (free, and free software you can run yourself). Every 5 minutes the server tells it whether it answers through HTTPS and its disk is under 90% full; Healthchecks emails you when it says no, or when it stops hearing anything (the whole machine down). Then run `setup.yml` again.

## How they were tested

`ansible-lint` passes at its "production" level. `setup.yml`, `deploy.yml`, `update.yml` and `status.yml` were run in an AlmaLinux 10 container (`podman`, with systemd) from nothing and then again, which changed nothing; the parts a container can't have (SSH, the firewall, SELinux, restarts) were tried on the owner's server.
