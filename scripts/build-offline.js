// Makes the built app in dist/ work offline. Runs automatically after
// `npm run build` (the "postbuild" line in package.json).
//
// It writes three things:
//
//   dist/sw.js            the service worker (src/serviceWorker.js) with the
//                         list of the app's own files and a version in front
//   dist/offline/         the stroke data packed into a few big files. The
//                         app fetches these in the background and unpacks
//                         them on the device (src/offline.js): fetching the
//                         10,600 characters one file at a time would take a
//                         phone very long.
//   dist/offline/index.json   which packs there are, and which other big
//                         files to save (the dictionary)
//
// The single files in dist/char-data/ and dist/char-data-tw/ stay as they
// are: the app uses them until the packs have been unpacked.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIST = 'dist';
const STROKE_FOLDERS = ['char-data', 'char-data-tw'];
// How many characters go into one pack. A pack of this size is 2 to 3 MB.
const CHARS_PER_PACK = 600;

// A short fingerprint of some text: it changes whenever the text does.
const fingerprint = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);

// Every file under a folder, as paths from DIST with forward slashes.
function filesUnder(folder) {
  return fs
    .readdirSync(path.join(DIST, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(DIST, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

// ---- The packs ----

fs.rmSync(path.join(DIST, 'offline'), { recursive: true, force: true });
fs.mkdirSync(path.join(DIST, 'offline'));

const strokeFiles = STROKE_FOLDERS.flatMap(filesUnder);
const packs = [];
for (let start = 0; start < strokeFiles.length; start += CHARS_PER_PACK) {
  // A pack is one JSON object: each file's path and its text.
  const contents = {};
  for (const file of strokeFiles.slice(start, start + CHARS_PER_PACK)) {
    contents[file] = fs.readFileSync(path.join(DIST, file), 'utf8');
  }
  const text = JSON.stringify(contents);
  // The fingerprint in the name means a pack whose contents have not changed
  // keeps its name, and a device that has it does not fetch it again.
  const name = `offline/pack-${String(packs.length).padStart(2, '0')}.${fingerprint(text)}.json`;
  fs.writeFileSync(path.join(DIST, name), text);
  packs.push({ file: name, count: Object.keys(contents).length });
}

// The dictionary, the word lists, the notes (.tsv) and the dictionary of how
// characters are built (.txt) are one big file each already, so they are
// saved as they are. Vite puts a fingerprint in their names too. So is
// sql.js's WebAssembly file (.wasm, for importing from Anki, ankiFile.js):
// kept across versions, it isn't fetched again with each new one.
const bigFiles = filesUnder('assets').filter(
  (file) => file.endsWith('.tsv') || file.endsWith('.txt') || file.endsWith('.wasm'),
);

// ---- The recordings ----
//
// About 10,000 small sound files (see scripts/copy-audio.js), 125 MB together.
// They are not saved on the device by themselves: each is kept once it has
// been played, and all of them only if asked for in Settings. For that they
// are packed like the stroke data, but as they are (sound is not text): a
// pack is the files one after another, and the list says how long each is.
const FILES_PER_AUDIO_PACK = 400;
// The test copy of the app (see db.js) goes without the packs: it would put
// another 125 MB on the site for something that is tried on the stable copy.
// There a recording is still kept once it has been played.
const CHANNEL = process.env.VITE_CHANNEL || '';
const audioFiles = CHANNEL ? [] : filesUnder('audio').filter((file) => file.endsWith('.mp3'));
const audioPacks = [];
for (let start = 0; start < audioFiles.length; start += FILES_PER_AUDIO_PACK) {
  const files = audioFiles.slice(start, start + FILES_PER_AUDIO_PACK);
  const contents = files.map((file) => fs.readFileSync(path.join(DIST, file)));
  const joined = Buffer.concat(contents);
  const name = `offline/audio-${String(audioPacks.length).padStart(2, '0')}.${fingerprint(joined)}.bin`;
  fs.writeFileSync(path.join(DIST, name), joined);
  // entries: each file's path and its length in bytes, in the pack's order.
  audioPacks.push({ file: name, entries: files.map((file, index) => [file, contents[index].length]) });
}

fs.writeFileSync(path.join(DIST, 'offline/index.json'), JSON.stringify({ packs, files: bigFiles, audioPacks }));

// ---- The service worker ----

// The app's own files: everything except the stroke data, the recordings
// (but the list of them is one), the packs, the dictionary, and the service
// worker itself.
const appFiles = fs
  .readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.relative(DIST, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
  .filter(
    (file) =>
      file !== 'sw.js' &&
      !file.startsWith('offline/') &&
      !(file.startsWith('audio/') && file !== 'audio/index.json') &&
      !STROKE_FOLDERS.some((folder) => file.startsWith(`${folder}/`)) &&
      !bigFiles.includes(file),
  )
  .sort();

const version = fingerprint(
  appFiles.map((file) => file + fingerprint(fs.readFileSync(path.join(DIST, file)))).join('\n'),
);
// The test copy is named as such where the phone shows an installed app's name.
if (CHANNEL) {
  const manifestFile = path.join(DIST, 'manifest.webmanifest');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  manifest.name = `${manifest.name} (${CHANNEL})`;
  manifest.short_name = `${manifest.short_name} ${CHANNEL}`;
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
}

const worker = fs.readFileSync('src/serviceWorker.js', 'utf8');
fs.writeFileSync(
  path.join(DIST, 'sw.js'),
  `const VERSION = ${JSON.stringify(version)};\nconst APP_FILES = ${JSON.stringify(appFiles)};\n` +
    `const CHANNEL = ${JSON.stringify(CHANNEL)};\n\n${worker}`,
);

console.log(
  `Offline: version ${version}, ${appFiles.length} app files, ` +
    `${strokeFiles.length} stroke data files in ${packs.length} packs, ` +
    `${bigFiles.length} other big file${bigFiles.length === 1 ? '' : 's'}, ` +
    `${audioFiles.length} recordings in ${audioPacks.length} packs.`,
);
