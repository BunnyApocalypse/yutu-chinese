// "How to remember it": a short memory aid for a character, shown on its
// card on the word page (docs/word-page.md). From data/character-tips/ (see
// the README there). Plain calculation, no page.
//
// Each line of a file, with tabs between the columns:
//   character, tip, origin (a true account of where the character came
//   from, or empty)
// A character form has its own line: 學 and 学 are built of different
// parts, so each has a tip of its own.

// Returns a Map from character to { tip, origin }; origin may be ''.
export function parseTips(text) {
  const tips = new Map();
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) {
      continue;
    }
    const [character, tip, origin = ''] = line.split('\t');
    if (character && tip) {
      tips.set(character, { tip, origin });
    }
  }
  return tips;
}
