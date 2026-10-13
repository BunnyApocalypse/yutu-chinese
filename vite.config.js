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
  },
}));
