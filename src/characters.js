// How characters are built: their parts, and which part gives the meaning
// and which the sound. From Make Me a Hanzi's dictionary (data/makemeahanzi/;
// see the README there). Plain calculation, no page.

// Reads the dictionary file: one JSON object per line.
// Returns a Map from character to its entry.
export function parseCharacters(text) {
  const characters = new Map();
  for (const line of text.split('\n')) {
    if (line.trim() !== '') {
      const entry = JSON.parse(line);
      characters.set(entry.character, entry);
    }
  }
  return characters;
}

// A decomposition is written as an "ideographic description sequence": a
// sign for how the parts are arranged (⿰ side by side, ⿱ one above the
// other, and so on), followed by the parts, which can be sequences
// themselves. ？ stands for a part that has no character of its own.
const ARRANGEMENT = /[⿰-⿿]/;

// What a character is made of.
//
// Returns null for a character the dictionary does not have, otherwise
//   {
//     parts:  [{ part, role }], the parts in the order they are written;
//             role is 'meaning', 'sound' or null. A part that is not a
//             character of its own is left out.
//     kind:   'sound-meaning', 'meaning', 'picture' or null: how the
//             character came about, as far as the dictionary says
//     hint:   a few words on it ("water" for the meaning part of 河; for the
//             other kinds a short gloss, which may be a way of seeing the
//             character more than its history), or ''
//     definition, pinyin: as the dictionary gives them
//   }
export function structureOf(characters, character) {
  const entry = characters.get(character);
  if (!entry) {
    return null;
  }
  const etymology = entry.etymology || {};
  const roleOf = (part) =>
    etymology.type !== 'pictophonetic'
      ? null
      : part === etymology.semantic
        ? 'meaning'
        : part === etymology.phonetic
          ? 'sound'
          : null;
  const pieces = Array.from(entry.decomposition || '').filter(
    (piece) => !ARRANGEMENT.test(piece) && piece !== '？' && piece !== character,
  );
  // The meaning and sound parts are named even where the decomposition goes
  // into smaller pieces than they are.
  for (const named of [etymology.semantic, etymology.phonetic]) {
    if (etymology.type === 'pictophonetic' && named && !pieces.includes(named)) {
      pieces.push(named);
    }
  }
  const KINDS = { pictophonetic: 'sound-meaning', ideographic: 'meaning', pictographic: 'picture' };
  return {
    parts: [...new Set(pieces)].map((part) => ({ part, role: roleOf(part) })),
    kind: KINDS[etymology.type] || null,
    hint: etymology.hint || '',
    definition: entry.definition || '',
    pinyin: entry.pinyin || [],
  };
}
