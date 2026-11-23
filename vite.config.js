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

// A Vite plugin is a few functions Vite calls while it works; this one adds a
// line to the head of index.html, different for each copy, in a build only:
// - the test copy: "noindex", so search engines leave it out of their
//   results (robots.txt can't do that: it only stops them reading the page,
//   and a page they can't read can still be listed by its address);
// - the stable copy: its one true address ("canonical"), so search engines
//   count yutuchinese.com/app/ and yutuchinese.com/app/index.html as one page.
// (docs/offline.md, "The page about the app": search and sharing.)
function searchTags(command) {
  return {
    name: 'search-tags',
    transformIndexHtml() {
      if (command !== 'build') return [];
      if (process.env.VITE_CHANNEL) {
        return [{ tag: 'meta', attrs: { name: 'robots', content: 'noindex' }, injectTo: 'head' }];
      }
      return [{ tag: 'link', attrs: { rel: 'canonical', href: 'https://yutuchinese.com/app/' }, injectTo: 'head' }];
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [searchTags(command)],
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
    // The site the app was at before yutuchinese.com, whose moving page
    // hands the learner's words over (moveIn.js, docs/offline.md):
    // VITE_MOVE_FROM if given (the browser tests), in a build the old
    // address, under `npm run dev` none.
    __MOVE_FROM__: JSON.stringify(process.env.VITE_MOVE_FROM ?? (command === 'build' ? 'https://bunnyapocalypse.github.io' : '')),
    // For the moving page (move.html) when the dev server serves it, in the
    // browser tests (move.browser.js); its own build has vite.move.config.js.
    __MOVE_TO__: JSON.stringify(process.env.VITE_MOVE_TO ?? ''),
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
