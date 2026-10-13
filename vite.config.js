import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // The folder the built app is served from. './' makes every address in the
  // build relative to the page, so the same build works at
  // https://<name>.github.io/hanzi-trainer/ and at http://localhost:4173/.
  base: command === 'build' ? './' : '/',
  server: {
    // By default the dev server only answers requests from this computer.
    // host: true makes it answer on the LAN too, so the phone can reach it.
    host: true,
    watch: {
      // The dev server watches the project's files to reload the page when
      // one changes. The recordings and stroke data are tens of thousands
      // of files that never change while it runs, and watching them all
      // uses up what the system allows ("ENOSPC: System limit for number of
      // file watchers reached").
      ignored: ['**/data/audio-cmn/**', '**/public/audio/**', '**/public/char-data/**', '**/public/char-data-tw/**', '**/local/**', '**/dist/**'],
    },
  },
}));
