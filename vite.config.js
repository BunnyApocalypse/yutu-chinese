import { defineConfig } from 'vite';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

// Which version of the app this is, shown in Settings and put into error
// reports: the number in package.json, the short name of the latest change
// in git, and its date. ("unknown" where git is not at hand.)
function appVersion() {
  const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  try {
    const change = execSync('git log -1 --format=%h,%cs', { encoding: 'utf8' }).trim().split(',');
    return `${version} (${change[0]}, ${change[1]})`;
  } catch {
    return `${version} (unknown)`;
  }
}

export default defineConfig(({ command }) => ({
  // The folder the built app is served from. './' makes every address in the
  // build relative to the page, so the same build works at
  // https://<name>.github.io/hanzi-trainer/ and at http://localhost:4173/.
  base: command === 'build' ? './' : '/',
  // Vite puts these values in place of the names wherever the program uses them.
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
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
