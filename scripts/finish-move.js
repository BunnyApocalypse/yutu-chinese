// Finishes the moving page's build (`npm run build:move`, after
// vite.move.config.js): its page becomes index.html, and its service worker
// (src/moveServiceWorker.js) sw.js, which replaces the app's at the old
// address. VITE_CHANNEL=test for the test copy's, in dist-move/test/.

import fs from 'node:fs';
import path from 'node:path';

const channel = process.env.VITE_CHANNEL || '';
const folder = channel ? path.join('dist-move', channel) : 'dist-move';

fs.renameSync(path.join(folder, 'move.html'), path.join(folder, 'index.html'));
fs.copyFileSync('src/moveServiceWorker.js', path.join(folder, 'sw.js'));
console.log(`Moving page ready in ${folder}/`);
