# yutu-chinese: the old address of 玉兔中文

玉兔中文 (Yutu Chinese), an app for learning to read and write Chinese, was at https://bunnyapocalypse.github.io/yutu-chinese/ until it moved to https://yutuchinese.com/app/. Its code is at https://github.com/BunnyApocalypse/yutuchinese.

This repository keeps the old address working. A browser keeps each site's words and progress apart, so the words studied at the old address can only be read there: it shows a page that hands them to the app at the new address, in a few taps (or with the sync code, or a backup file). Someone with no words there is sent on at once. Nothing is deleted at the old address.

## How it is published

`.github/workflows/deploy.yml` builds the moving page from the app's own code (its `npm run build:move`) and publishes it with GitHub Pages; the test copy's at `test/`. It is started by hand:

    gh workflow run deploy.yml -R BunnyApocalypse/yutu-chinese

Settings › Pages › Source: GitHub Actions.

## Changing it

The workflow and this README are kept in the app's repository, in the folder `old-address/`: edit them there, then copy them here (`deploy.yml` as `.github/workflows/deploy.yml`). The page itself is `move.html` and `src/move.js` in the app's repository; `docs/offline.md` there has how the move works.

GPL-3.0-only, as the rest of the app.
