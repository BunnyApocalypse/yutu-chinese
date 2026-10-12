import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // By default the dev server only answers requests from this computer.
    // host: true makes it answer on the LAN too, so the phone can reach it.
    host: true,
  },
});
