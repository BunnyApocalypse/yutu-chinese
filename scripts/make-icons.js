// Draws the app's icons into public/icons/ from scripts/icon.html (which
// describes the picture). Run by hand after changing that page:
//
//   node scripts/make-icons.js
//
// Needs Chromium (Fedora package chromium) and the font AR PL UKai TW
// (Fedora package cjkuni-ukai-fonts). Chromium is started without a window
// ("headless") and told to save a picture of the page.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const page = pathToFileURL(path.resolve('scripts/icon.html')).href;

const icons = [
  { file: 'icon-192.png', kind: 'icon', size: 192 },
  { file: 'icon-512.png', kind: 'icon', size: 512 },
  { file: 'icon-maskable-512.png', kind: 'maskable', size: 512 },
  { file: 'swatch.png', kind: 'swatch', size: 192 },
];

for (const { file, kind, size } of icons) {
  execFileSync('chromium-browser', [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    `--window-size=${size},${size}`,
    `--screenshot=${path.resolve('public/icons', file)}`,
    `${page}?kind=${kind}&size=${size}`,
  ], { stdio: 'ignore' });
  console.log(`public/icons/${file}`);
}
