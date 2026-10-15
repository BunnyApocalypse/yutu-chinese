# The old address

What is published at https://bunnyapocalypse.github.io/hanzi-trainer/, the app's address before it was renamed 玉兔中文 (2026-10-15). It sends everyone to https://bunnyapocalypse.github.io/yutu-chinese/.

These files are kept here so they are not lost; they are published from a separate repository, `BunnyApocalypse/hanzi-trainer`, which holds only them (GitHub Pages publishes a repository at `<owner>.github.io/<repository name>/`, so the old address needs a repository with the old name). Its Pages setting: publish from the `main` branch, the top folder.

- `index.html`: sends the visitor to the same place in the new folder.
- `404.html`: an exact copy of `index.html`. GitHub Pages shows it for any address that has no file, such as `/hanzi-trainer/test/`.
- `sw.js`, published twice, as `sw.js` and as `test/sw.js` (kept once here: a folder named `test` would be taken for tests by `npm test`): replaces the app's service workers for the stable and test copies at the old address. See the comment at the top of `sw.js`.
- `.nojekyll`: tells GitHub Pages to publish the files as they are.

To change them: edit here, copy to that repository, push there.

GPL-3.0-only, as the rest of the app.
