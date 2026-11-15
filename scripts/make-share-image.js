// Draws the picture shown when a link to the site is shared, into
// site/public/share.png, from scripts/share-image.html. Run by hand after
// changing that page:
//
//   node scripts/make-share-image.js
//
// Needs Chromium (Fedora package chromium), started without a window, as in
// scripts/make-icons.js.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const page = pathToFileURL(path.resolve('scripts/share-image.html')).href;

execFileSync('chromium-browser', [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--window-size=1200,630',
  `--screenshot=${path.resolve('site/public/share.png')}`,
  page,
], { stdio: 'ignore' });
console.log('site/public/share.png');
