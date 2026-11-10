# yutuchinese-site: 玉兔中文 at yutuchinese.com, for now

玉兔中文 (Yutu Chinese), an app for learning to read and write Chinese, is moving from https://bunnyapocalypse.github.io/yutu-chinese/ to https://yutuchinese.com/app/. Its code is at https://github.com/BunnyApocalypse/yutu-chinese.

This repository only publishes the app at the new address while its own repository still publishes at the old one, where learners bring their words over. Once they have, the app's repository publishes at yutuchinese.com itself and this repository is deleted.

## How it is published

`.github/workflows/deploy.yml` builds the app's `stable` branch into `app/`, its `main` into `app/test/`, puts a page forwarding to `app/` at the top, and publishes it with GitHub Pages (Settings › Pages: source GitHub Actions, custom domain `yutuchinese.com`). Started by hand after a change to the app:

    gh workflow run deploy.yml -R BunnyApocalypse/yutuchinese-site

## Changing it

The workflow and this README are kept in the app's repository, in `site-repo/`: edit them there, then copy them here (`deploy.yml` as `.github/workflows/deploy.yml`).

GPL-3.0-only, as the rest of the app.
