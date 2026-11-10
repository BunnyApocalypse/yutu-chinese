import { defineConfig } from 'vite';

// Builds the moving page (move.html, src/move.js): what the app's old
// address, https://bunnyapocalypse.github.io/yutu-chinese/, shows once the
// app is at https://yutuchinese.com/app/ (docs/offline.md, "The move to
// yutuchinese.com"). `npm run build:move` runs it, then
// scripts/finish-move.js. Published from a repository of its own
// (old-address/README.md).
//
// It is a small page, without the stroke data, recordings or dictionary: it
// only reads the learner's words from the browser and hands them over.
//
//   VITE_CHANNEL   'test' for the test copy's moving page (at test/ under
//                  the old address), with its own database, as in the app
//   VITE_MOVE_TO   where the app is now (the browser tests give their own)

const channel = process.env.VITE_CHANNEL || '';
const moveTo = process.env.VITE_MOVE_TO || `https://yutuchinese.com/app/${channel ? `${channel}/` : ''}`;

export default defineConfig({
  base: './',
  // Not the app's public/ folder (stroke data, recordings, icons).
  publicDir: false,
  define: {
    __CHANNEL__: JSON.stringify(channel),
    __MOVE_TO__: JSON.stringify(moveTo),
  },
  build: {
    outDir: channel ? `dist-move/${channel}` : 'dist-move',
    emptyOutDir: true,
    rollupOptions: { input: 'move.html' },
  },
});
