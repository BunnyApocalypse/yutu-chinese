// Reading a file exported from Anki: a deck (.apkg) or a whole collection
// (.colpkg). No page here, so the tests can read real Anki files in Node
// (tests/ankiImport.test.js); what is done with the contents is in
// ankiImport.js, and the pop-up is ankiImportForm.js.
//
// Such a file is a zip archive. Inside it, the cards, notes and review
// history are an SQLite database: a whole database in one file, the kind
// many programs keep their data in. Which file holds it depends on the Anki
// that made it:
//
//   collection.anki21b  a current Anki (2.1.50 and later). The database is
//                       compressed with zstd, a compression method newer than
//                       the zip's own, and laid out in "schema 18".
//   collection.anki21   Anki 2.1 before that, or a current one asked to
//                       "support older Anki versions": schema 11.
//   collection.anki2    Anki 2.0, schema 11. A current Anki puts a stand-in
//                       here as well, a single note saying to update Anki, so
//                       it is only read when there is nothing better.
//
// Two libraries do what the browser cannot: sql.js (SQLite itself, compiled
// to WebAssembly, a form of program browsers can run) reads the database,
// and fzstd undoes the zstd compression. Both are MIT-licensed. sql.js is
// passed in by the caller, since the browser and Node load it differently.
// Audio and pictures in the file are not read.

import { decompress as unzstd } from 'fzstd';
import { t } from './text.js';

// ---- The zip archive ----

// Lists the files in a zip archive without unpacking them.
//
// bytes: the whole file, as a Uint8Array
//
// Returns a Map from each file's name to { method, data }: `data` is the
// file as stored and `method` how (0: as it is, 8: "deflate", the usual zip
// compression).
//
// A zip archive ends with a "central directory", a table of contents giving
// each file's name, size and where it starts. Sizes are read from there, not
// from the header before each file, which some programs leave blank.
export function filesInZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The directory's own last record starts with the bytes 50 4B 05 06 ("PK"
  // and two numbers), somewhere in the last 64 KB (it may end with a comment).
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end === -1) {
    throw new Error(t('ankiFile.notZip'));
  }
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const files = new Map();
  for (let index = 0; index < count; index++) {
    if (view.getUint32(at, true) !== 0x02014b50) {
      throw new Error(t('ankiFile.damaged'));
    }
    const method = view.getUint16(at + 10, true);
    let packedSize = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let localHeader = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    // A file over 4 GB, or an archive made by a program that always does it,
    // has its sizes in an "extra field" (zip64) in place of 0xFFFFFFFF.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true);
      const size = view.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        const read64 = () => {
          const value = Number(view.getBigUint64(field, true));
          field += 8;
          return value;
        };
        if (view.getUint32(at + 24, true) === 0xffffffff) {
          read64(); // the unpacked size, which isn't needed
        }
        if (packedSize === 0xffffffff) {
          packedSize = read64();
        }
        if (localHeader === 0xffffffff) {
          localHeader = read64();
        }
      }
      extra += 4 + size;
    }
    // The file's data comes after its local header, whose name and extra
    // field may differ in length from the directory's.
    const dataStart =
      localHeader + 30 + view.getUint16(localHeader + 26, true) + view.getUint16(localHeader + 28, true);
    files.set(name, { method, data: bytes.subarray(dataStart, dataStart + packedSize) });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return files;
}

// Unpacks one file listed by filesInZip. Deflate is undone by the browser's
// own DecompressionStream (Node has it too). Returns a Uint8Array.
export async function unpack({ method, data }) {
  if (method === 0) {
    return data;
  }
  if (method !== 8) {
    throw new Error(t('ankiFile.packing'));
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// zstd-compressed data starts with these four bytes.
function isZstd(bytes) {
  return bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd;
}

// ---- The database ----

// Opens the collection inside an Anki file.
//
// bytes: the whole .apkg or .colpkg file, as a Uint8Array
// SQL:   sql.js, ready to use (what its initSqlJs() gives)
//
// Returns an sql.js database, to be closed with .close() when read.
export async function openAnkiFile(bytes, SQL) {
  const files = filesInZip(bytes);
  const name = ['collection.anki21b', 'collection.anki21', 'collection.anki2'].find((file) => files.has(file));
  if (!name) {
    throw new Error(t('ankiFile.noCollection'));
  }
  let database = await unpack(files.get(name));
  if (isZstd(database)) {
    database = unzstd(database);
  }
  const db = new SQL.Database(database);
  // A current Anki sorts some names in an order of its own, "unicase", which
  // SQLite only knows inside Anki. sql.js can't be taught it, and refuses to
  // read a table kept in that order. So in this copy of the database (the
  // file itself is untouched) the tables are described as kept in SQLite's
  // own order that ignores capitals, NOCASE, and the copy is opened again so
  // that the new descriptions count. The order only matters for searching
  // by name, which the import doesn't do.
  const [{ count }] = rows(db, "select count(*) as count from sqlite_master where sql like '%unicase%'");
  if (count === 0) {
    return db;
  }
  db.exec(
    'pragma writable_schema = on;' +
      "update sqlite_master set sql = replace(sql, 'COLLATE unicase', 'COLLATE NOCASE') where sql like '%unicase%';" +
      'pragma writable_schema = off;',
  );
  const reopened = new SQL.Database(db.export());
  db.close();
  return reopened;
}

// Runs a query and returns its rows as objects, by column name.
function rows(db, sql) {
  const results = db.exec(sql);
  if (results.length === 0) {
    return [];
  }
  const [{ columns, values }] = results;
  return values.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));
}

// Reads the text fields of a "protocol buffer", the compact binary form a
// current Anki keeps some settings in (a card template's front and back,
// for one). Each field starts with a number saying which field it is and how
// it is stored; only text (stored as a length and the bytes) is kept.
//
// Returns a Map from field number to text.
function protobufStrings(bytes) {
  const strings = new Map();
  const decoder = new TextDecoder();
  let at = 0;
  // A "varint": a number in 7-bit pieces, the top bit of each byte saying
  // whether another follows.
  const varint = () => {
    let value = 0;
    let scale = 1;
    while (at < bytes.length) {
      const byte = bytes[at++];
      value += (byte & 0x7f) * scale;
      scale *= 128;
      if (byte < 0x80) {
        break;
      }
    }
    return value;
  };
  while (at < bytes.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const kind = key % 8;
    if (kind === 0) {
      varint();
    } else if (kind === 1) {
      at += 8;
    } else if (kind === 5) {
      at += 4;
    } else if (kind === 2) {
      const length = varint();
      strings.set(field, decoder.decode(bytes.subarray(at, at + length)));
      at += length;
    } else {
      break; // a kind not used by Anki: stop rather than misread
    }
  }
  return strings;
}

// Reads what the import needs from an opened collection, the same way for
// both layouts.
//
// Returns:
//   createdAt: when the collection was made, in seconds since 1970 (Anki's
//              `crt`). A review card's due date is a number of days from it.
//   noteTypes: [{ id, name, fields: [name], templates: [{ ord, name, front, back }] }]
//              `front` and `back` are the template's text, as {{Hanzi}}.
//   decks:     [{ id, name }], name with "::" between a deck and the one
//              inside it ("Chinese::HSK 1")
//   notes:     [{ id, noteTypeId, fields: [text], tags }]
//   cards:     [{ id, noteId, deckId, ord, type, queue, due, interval,
//                 factor, reps, lapses, data }]
//              `ord` is which template made the card. `deckId` is the deck
//              the card belongs to, also while it is in a filtered deck,
//              whose due date then counts. `data` is the text Anki keeps
//              with the card (FSRS's memory as {"s":…,"d":…}).
//   reviews:   [{ id, cardId, ease, interval, lastInterval, factor, took, type }]
//              Anki's review log. `id` is the time of the review in
//              milliseconds; `took` how long the answer took, in milliseconds.
export function readCollection(db) {
  const [{ crt }] = rows(db, 'select crt from col');
  const tables = new Set(rows(db, "select name from sqlite_master where type = 'table'").map((row) => row.name));
  let noteTypes;
  let decks;
  if (tables.has('notetypes')) {
    // Schema 18: note types, their fields and templates in tables of their own.
    // (Sorted here, not by the query: these tables are kept in an order of
    // Anki's own, "unicase", that sql.js doesn't know, and asking it to sort
    // them fails.)
    const byOrd = (a, b) => a.ord - b.ord;
    const fields = rows(db, 'select ntid, ord, name from fields').sort(byOrd);
    const templates = rows(db, 'select ntid, ord, name, config from templates').sort(byOrd);
    noteTypes = rows(db, 'select id, name from notetypes').map(({ id, name }) => ({
      id,
      name,
      fields: fields.filter((field) => field.ntid === id).map((field) => field.name),
      templates: templates
        .filter((template) => template.ntid === id)
        .map((template) => {
          const config = protobufStrings(template.config);
          return { ord: template.ord, name: template.name, front: config.get(1) || '', back: config.get(2) || '' };
        }),
    }));
    // A deck inside another has the names joined by the character 0x1F.
    decks = rows(db, 'select id, name from decks').map(({ id, name }) => ({ id, name: name.split('\x1f').join('::') }));
  } else {
    // Schema 11: note types and decks as JSON in the one row of `col`.
    const [col] = rows(db, 'select models, decks from col');
    noteTypes = Object.values(JSON.parse(col.models)).map((model) => ({
      id: Number(model.id),
      name: model.name,
      fields: [...model.flds].sort((a, b) => a.ord - b.ord).map((field) => field.name),
      templates: [...model.tmpls]
        .sort((a, b) => a.ord - b.ord)
        .map((template) => ({ ord: template.ord, name: template.name, front: template.qfmt, back: template.afmt })),
    }));
    decks = Object.values(JSON.parse(col.decks)).map((deck) => ({ id: Number(deck.id), name: deck.name }));
  }
  // Fields are kept in one text, separated by the character 0x1F.
  const notes = rows(db, 'select id, mid, flds, tags from notes').map((note) => ({
    id: note.id,
    noteTypeId: note.mid,
    fields: note.flds.split('\x1f'),
    tags: note.tags.trim(),
  }));
  const cards = rows(
    db,
    'select id, nid, did, odid, ord, type, queue, due, odue, ivl, factor, reps, lapses, data from cards',
  ).map((card) => ({
    id: card.id,
    noteId: card.nid,
    // In a filtered deck, `odid` is the card's own deck and `odue` its own due.
    deckId: card.odid || card.did,
    ord: card.ord,
    type: card.type,
    queue: card.queue,
    due: card.odid ? card.odue : card.due,
    interval: card.ivl,
    factor: card.factor,
    reps: card.reps,
    lapses: card.lapses,
    data: card.data || '',
  }));
  const reviews = rows(db, 'select id, cid, ease, ivl, lastIvl, factor, time, type from revlog order by id').map(
    (review) => ({
      id: review.id,
      cardId: review.cid,
      ease: review.ease,
      interval: review.ivl,
      lastInterval: review.lastIvl,
      factor: review.factor,
      took: review.time,
      type: review.type,
    }),
  );
  return { createdAt: crt, noteTypes, decks, notes, cards, reviews };
}
