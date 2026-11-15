import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Builds the page about the app (site/index.html, site/main.js): what
// https://yutuchinese.com shows at its top, with the app itself at /app/.
// The practice square on it is the app's own writing code (src/quiz.js), so
// a visitor can try the real grading before opening the app.
//
// The page lives at the site's top and the stroke data at /app/char-data/,
// so the page is told that is where the app's files are (BASE_URL below,
// which src/charData.js reads). `npm run dev:site` serves it on this
// computer; `npm run build:site` builds it into dist-site/.

const APP_FILES = './app/';

// While developing, there is no /app/ folder, and the dev server may not
// apply the BASE_URL below (it does in a build): answer both /app/char-data/…
// and /char-data/… from the app's own public/ folder, where the stroke data
// is kept.
function appFilesFromPublic() {
  return {
    name: 'app-files-from-public',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        // The page sends anyone who has used the app on to /app/. Here that
        // is nowhere: the dev server would answer with this page again, and
        // the page would look for its stroke data under /app/app/. Say so.
        if (/^\/app(\/(index\.html)?)?(\?.*)?$/.test(request.url)) {
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          return response.end(
            '<!doctype html><meta charset="utf-8"><title>No app here</title>' +
              '<body style="font: 18px/1.5 system-ui; max-width: 36rem; margin: 3rem auto; padding: 0 1rem">' +
              '<p>The app is not served from this dev server (<code>npm run dev:site</code>). ' +
              'Start its own with <code>npm run dev</code>.</p>' +
              '<p>This browser is marked as using the app, so the page sent it here. ' +
              '<a href="/?about">See the page about the app</a>, or clear the mark with ' +
              '<code>localStorage.clear()</code> in the console.</p>',
          );
        }
        const match = request.url.match(/^\/(?:app\/)?(char-data(?:-tw)?\/(?:[0-9a-f]+|index)\.json)/);
        if (!match) return next();
        const file = path.join('public', match[1]);
        if (!fs.existsSync(file)) {
          response.statusCode = 404;
          return response.end();
        }
        response.setHeader('Content-Type', 'application/json');
        response.end(fs.readFileSync(file));
      });
    },
  };
}

// Puts the app's own page for a word (site/word-page-sample.html, made by
// scripts/make-word-page-sample.js) where site/index.html has the comment, so
// its text is in the page's HTML for anyone reading it without scripts.
function wordPageSample() {
  return {
    name: 'word-page-sample',
    transformIndexHtml(html) {
      return html.replace('<!-- word-page-sample -->', () => fs.readFileSync('site/word-page-sample.html', 'utf8'));
    },
  };
}

export default defineConfig({
  root: 'site',
  base: './',
  // The page's own files (the share picture, robots.txt, sitemap.xml,
  // llms.txt), copied to the top of the built site as they are. Not the
  // app's public/ folder (stroke data, recordings, icons).
  publicDir: 'public',
  plugins: [appFilesFromPublic(), wordPageSample()],
  define: {
    // Names the app's code expects Vite to fill in (vite.config.js).
    __APP_VERSION__: JSON.stringify('site'),
    __CHANNEL__: JSON.stringify(''),
    'import.meta.env.BASE_URL': JSON.stringify(APP_FILES),
  },
  server: {
    // Only this computer; the page is for looking at while it is written.
    host: '127.0.0.1',
    fs: { allow: ['..'] },
  },
  build: {
    outDir: '../dist-site',
    emptyOutDir: true,
    // Two pages: the one about the app, and the guide to importing from
    // Skritter (a folder of its own, so its address is /import-from-skritter/).
    rollupOptions: {
      input: {
        main: path.resolve('site/index.html'),
        skritter: path.resolve('site/import-from-skritter/index.html'),
      },
    },
  },
});
