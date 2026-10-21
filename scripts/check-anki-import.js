// What the app's Anki import (docs/anki.md) makes of Anki files, with the
// choices the pop-up starts from, in both scripts: the decks, the guess of
// which field is which and what each card template counts for, and the
// import's report (words, copied reviews, notes that could not be used,
// with the first two as examples). For trying the import on real decks
// (local/anki-decks/, local/README.md) without the browser:
//
//   node scripts/check-anki-import.js local/anki-decks/study-data/*.apkg
import fs from 'node:fs';
import initSqlJs from 'sql.js';
import { openAnkiFile, readCollection } from '../src/ankiFile.js';
import { describeCollection, defaultChoices, planAnkiImport } from '../src/ankiImport.js';
import { readDictionary } from '../src/dictionary.js';
import { parseReadyList } from '../src/words.js';

const SQL = await initSqlJs();
const dictionary = readDictionary(fs.readFileSync('data/cedict/dictionary.tsv', 'utf8'));
const radicals = parseReadyList(fs.readFileSync('data/wordlists/radicals/radicals.tsv', 'utf8'));
for (const path of process.argv.slice(2)) {
  const started = Date.now();
  const db = await openAnkiFile(new Uint8Array(fs.readFileSync(path)), SQL);
  const collection = readCollection(db);
  db.close();
  for (const script of ['simplified', 'traditional']) {
    const description = describeCollection(collection, script);
    const choices = defaultChoices(description);
    let made = 0;
    const plan = planAnkiImport(collection, choices, {
      dictionary, likeliestEntry: (entries) => entries[0], meaningDetail: 'first', radicals,
      words: [], decks: [], cards: new Map(), settings: { script }, now: Date.now(),
      randomId: () => `deck-${++made}`,
    });
    console.log(`\n== ${path.split('/').pop()} (${script}, ${Date.now() - started} ms)`);
    if (script === 'simplified') {
      console.log('decks:', description.decks.map((d) => `${d.name} (${d.cardCount})`).join('; '));
      for (const nt of description.noteTypes) {
        console.log(`note type ${nt.name}: ${nt.noteCount} notes, roles ${JSON.stringify(nt.roles)}`);
        console.log('   templates:', nt.templates.map((t) => `${t.name}=[${t.types}]`).join(' '));
      }
      console.log('Anki reviews in file:', description.reviewCount);
    }
    console.log('words', plan.words.length, 'reviews', plan.reviews.length, 'cards', plan.cards.length);
    console.log('first words:', plan.words.slice(0, 4).map((word) => `${word[script]} ${word.pinyin || '(radical)'} · ${word.definition}`).join(' | '));
    const radicalCards = plan.cards.filter((card) => card.wordId.endsWith('|radical'));
    if (radicalCards.length > 0) {
      const types = {};
      for (const card of radicalCards) types[card.type] = (types[card.type] || 0) + 1;
      console.log('cards of radicals by kind:', JSON.stringify(types));
    }
    console.log('report', JSON.stringify(Object.fromEntries(
      Object.entries(plan.report).map(([k, v]) => [k, Array.isArray(v) ? `${v.length} e.g. ${JSON.stringify(v.slice(0, 2))}` : v]))));
  }
}
