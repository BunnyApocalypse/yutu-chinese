# hanzi-trainer: the old address of 玉兔中文

玉兔中文 (Yutu Chinese), an app for learning to read and write Chinese, was called Hanzi Trainer until 2026-10-15. It is now at https://bunnyapocalypse.github.io/yutu-chinese/, and its code at https://github.com/BunnyApocalypse/yutu-chinese.

This repository only keeps the old address, https://bunnyapocalypse.github.io/hanzi-trainer/, working: it sends everyone to the same place at the new one. Words and progress saved in the app are kept by the browser for the whole site, so they are still there at the new address.

## The files

- `index.html`: sends the visitor to the same place in the new folder (`/hanzi-trainer/test/` becomes `/yutu-chinese/test/`).
- `404.html`: an exact copy of `index.html`. GitHub Pages shows it for any address that has no file.
- `sw.js`, also published as `test/sw.js`: replaces the app's service workers for its two copies at the old address. A phone that opened the app there keeps showing a saved copy without asking for the page, so it would never see the forwarding page; but the browser still checks `sw.js` for a new version (at least daily), gets this one, which removes itself and sends open windows to the new address.
- `.nojekyll`: tells GitHub Pages to publish the files as they are.

GitHub Pages publishes this repository's `main` branch, top folder.

## Changing them

A copy is kept in the app's own repository, in the folder `redirect/` (there `sw.js` is kept once, because a folder named `test` would be taken for tests). Edit it there, then copy the files here, `sw.js` to both places.

GPL-3.0-only, as the rest of the app.
