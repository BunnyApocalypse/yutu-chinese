// What learning forms in the other script needs from the app's own files
// (docs/cards.md, "Reading the other script"): how characters are built
// (Make Me a Hanzi, data/makemeahanzi/), for the changes between the scripts
// (scriptKeys.js), and the character pairs of the ready-made lists (HSK 3.0,
// then TOCFL), for the characters a change is also in. Fetched the first time
// they are needed, once; nothing from the internet.

import { parseCharacters } from './characters.js';
import { createChangeTable } from './scriptKeys.js';
import charactersUrl from '../data/makemeahanzi/dictionary.txt?url';
import hsk3Url from '../data/wordlists/hsk/hsk-3.0.tsv?url';
import tocflUrl from '../data/wordlists/tocfl/tocfl.tsv?url';

// The pairs of characters written differently in a list's lines (columns:
// level, simplified, traditional, …; "#" begins a comment), each once, in
// the list's order.
export function listPairs(text) {
  const pairs = [];
  const seen = new Set();
  for (const line of text.split('\n')) {
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }
    const [, simplified = '', traditional = ''] = line.split('\t');
    const s = [...simplified];
    const t = [...traditional];
    if (s.length !== t.length) {
      continue;
    }
    t.forEach((char, i) => {
      if (char !== s[i] && !seen.has(char + s[i])) {
        seen.add(char + s[i]);
        pairs.push([char, s[i]]);
      }
    });
  }
  return pairs;
}

const fetchText = (url) =>
  fetch(url)
    .then((response) => (response.ok ? response.text() : ''))
    .catch(() => '');

let loading = null;

// Resolves to { table, morePairs }: `table` a change table (scriptKeys.js)
// with the lists' pairs already taken in, `morePairs` those pairs. If the
// files can't be read, the table knows no character and every pair is a
// change of the whole.
export function loadForms() {
  loading =
    loading ||
    Promise.all([fetchText(charactersUrl), fetchText(hsk3Url), fetchText(tocflUrl)]).then(
      ([charactersText, hsk, tocfl]) => {
        const table = createChangeTable(parseCharacters(charactersText));
        const morePairs = [...listPairs(hsk), ...listPairs(tocfl)];
        table.add(morePairs);
        return { table, morePairs };
      },
    );
  return loading;
}
