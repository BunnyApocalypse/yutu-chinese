// Writes dist/sbom.cdx.json: the app's "software bill of materials", a list
// of everything in the built app that comes from someone else, with its
// version, license and where it came from. Runs automatically after
// `npm run build` (the "postbuild" line in package.json), so each deployed
// copy says what it is made of, at .../sbom.cdx.json.
//
// The format is CycloneDX (https://cyclonedx.org/), a standard that tools
// for checking dependencies read. The packages from npm come from npm's own
// `npm sbom` command, which reads package-lock.json; the data that did not
// come through npm (stroke data, dictionary, recordings, font, word lists)
// is added from the list below, which repeats what the README in each data
// folder says. When one of those is updated, update its line here too.
//
// More in docs/supply-chain.md.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const TARGET = 'dist/sbom.cdx.json';

// Only what ends up in the app: not Vite and the other build tools
// ("--omit dev"). "--package-lock-only" reads the lockfile instead of
// node_modules/, where npm stumbles over the build tools' own tools.
const sbom = JSON.parse(
  execFileSync('npm', ['sbom', '--sbom-format', 'cyclonedx', '--package-lock-only', '--omit', 'dev'], {
    encoding: 'utf8',
  }),
);

// The app itself. npm names it after the folder it was built in ("stable"
// and "test" in the deploy), so the name is set here, with which copy this
// is and the commit it was built from.
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  // Not built from a git checkout.
}
sbom.metadata.lifecycles = [{ phase: 'build' }];
Object.assign(sbom.metadata.component, {
  type: 'application',
  name: pkg.name,
  externalReferences: [{ type: 'vcs', url: 'https://github.com/BunnyApocalypse/yutu-chinese' }],
  properties: [
    { name: 'yutu:channel', value: process.env.VITE_CHANNEL || 'stable' },
    { name: 'yutu:commit', value: commit },
  ],
});

// npm can't name the license of the stroke data package ("SEE LICENSE IN
// ARPHICPL.TXT"); it is the Arphic Public License.
const ARPHIC = [{ license: { id: 'Arphic-1999' } }];
for (const component of sbom.components) {
  if (component.name === 'hanzi-writer-data') {
    component.licenses = ARPHIC;
  }
}

// A file's SHA-256 checksum, for files copied unchanged from their project:
// anyone can compare it with the file there at the commit given.
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

// The data that did not come through npm. `file` is given for a file copied
// unchanged, so that its checksum goes in too.
const DATA = [
  {
    name: 'animCJK graphicsZhHant.txt',
    description: 'Stroke data for traditional characters (Taiwan forms)',
    version: '98186d55b22cf70e86a248502513c2148f2a6bdf',
    licenses: ARPHIC,
    url: 'https://github.com/parsimonhi/animCJK',
    file: 'data/animcjk/graphicsZhHant.txt',
  },
  {
    name: 'Make Me a Hanzi dictionary.txt',
    description: 'How characters are built',
    version: 'bddc96d41bef',
    licenses: [{ license: { id: 'LGPL-3.0-or-later' } }],
    url: 'https://github.com/skishore/makemeahanzi',
    file: 'data/makemeahanzi/dictionary.txt',
  },
  {
    name: 'CC-CEDICT',
    description: 'Dictionary and tone table, adapted (data/cedict/)',
    // The release the files were built from, as written in them.
    version: JSON.parse(fs.readFileSync('data/cedict/tones.json', 'utf8')).date,
    licenses: [{ license: { id: 'CC-BY-SA-4.0' } }],
    url: 'https://www.mdbg.net/chinese/dictionary?page=cedict',
  },
  {
    name: 'audio-cmn',
    description: 'Recordings of words and syllables (64k/hsk, 64k/syllabs)',
    version: 'ff9ed3d',
    licenses: [{ license: { name: 'CC BY-SA (version not stated by the project)' } }],
    url: 'https://github.com/hugolpz/audio-cmn',
  },
  {
    name: 'OpenDyslexic',
    description: 'Font, a setting',
    version: '1824da5c0e41dc3e13ffc7f3a636dcaf695d61b7',
    licenses: [{ license: { id: 'OFL-1.1' } }],
    url: 'https://github.com/antijingoist/opendyslexic',
  },
  {
    name: 'hsk30',
    description: 'HSK 3.0 word list, adapted (data/wordlists/hsk/)',
    version: '4ff9e3915ce87baaecd7ebe263085573a4ea3192',
    licenses: [{ license: { id: 'MIT' } }],
    url: 'https://github.com/ivankra/hsk30',
  },
  {
    name: 'hskhsk.com HSK Official With Definitions 2012',
    description: 'HSK 2.0 word list, adapted (data/wordlists/hsk/)',
    version: '8a6f229c699e2fd7ac8708156c55c3afb2be7e1f',
    licenses: [{ license: { id: 'MIT' } }],
    url: 'https://github.com/glxxyz/hskhsk.com',
  },
  {
    name: 'TOCFL 華語八千詞表',
    description: 'TOCFL word list, adapted (data/wordlists/tocfl/)',
    version: '8000zhuyin_202307',
    licenses: [{ license: { name: 'No license stated by the source' } }],
    url: 'https://tocfl.edu.tw/',
  },
  {
    name: 'Unicode CJKRadicals.txt',
    description: 'Kangxi radicals and their simplified forms, used to build the radicals list',
    version: '16.0.0',
    licenses: [{ license: { id: 'Unicode-3.0' } }],
    url: 'https://www.unicode.org/Public/16.0.0/ucd/CJKRadicals.txt',
  },
];

for (const item of DATA) {
  sbom.components.push({
    type: 'data',
    'bom-ref': `data:${item.name}@${item.version}`,
    name: item.name,
    version: item.version,
    description: item.description,
    licenses: item.licenses,
    externalReferences: [{ type: 'vcs', url: item.url }],
    ...(item.file && { hashes: [{ alg: 'SHA-256', content: sha256(item.file) }] }),
  });
}

fs.writeFileSync(TARGET, JSON.stringify(sbom, null, 2) + '\n');
console.log(`SBOM: ${sbom.components.length} components in ${TARGET}`);
