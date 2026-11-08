import { defineConfig, searchForWorkspaceRoot } from 'vite';
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
  // https://<name>.github.io/yutu-chinese/ and at http://localhost:4173/.
  base: command === 'build' ? './' : '/',
  // Vite puts these values in place of the names wherever the program uses them.
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
    // Which of the two published copies of the app this is: '' for the
    // stable one, 'test' for the one that gets every change first (see
    // .github/workflows/deploy.yml). The test copy keeps its own database.
    __CHANNEL__: JSON.stringify(process.env.VITE_CHANNEL || ''),
    // The sync server's address (docs/sync.md): VITE_SYNC_SERVER if given;
    // otherwise, under `npm run dev`, the one `npm run sync-server` starts on
    // this computer, and in a build none yet (step 4), so Settings doesn't
    // offer syncing.
    __SYNC_SERVER__: JSON.stringify(process.env.VITE_SYNC_SERVER ?? (command === 'build' ? '' : 'http://127.0.0.1:8787')),
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
    // The dev server serves only files inside the project. In a git worktree
    // (.claude/worktrees/…), node_modules is a link to the main copy's, which
    // lies outside it, so files loaded by their address (sql.js's .wasm, for
    // reading Anki files) were refused and the Anki tests failed there. Its
    // real folder is allowed too; elsewhere it is inside the project anyway.
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), fs.realpathSync('node_modules')],
    },
  },
}));
