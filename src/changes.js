// What changed in each release, in plain words for learners, newest first.
// A new entry is written at the top whenever a release goes out
// (docs/interface.md, "What's new"). `id` tells the entries apart and is the
// release's date; a second release on the same day gets "-2" after it.
// Each line is a short sentence about what a learner will notice, not how it
// was built.
export const CHANGES = [
  {
    id: '2026-10-21-3',
    items: [
      'More learning notes were checked and corrected by a native speaker.',
    ],
  },
  {
    id: '2026-10-21-2',
    items: [
      'Changed your mind about a grade? Tap ‹ on a new card (or "Back to the last card" at the end of Review) to see your last 10 cards, with your own handwriting, and change the grade.',
      'Between the characters of a word, "missed" and "right" buttons let you correct the app if it judged a character wrong.',
      'Sentences show their meaning and the sentence with its gap on separate lines, so the gap is never cut off.',
      'The character you\'re on keeps its blue outline after it has turned green or red, and a tap goes on after practicing one again.',
      'Anki imports read real shared decks and textbooks much better: the deck\'s own meanings, its sentences as sentences, and a summary to check before importing.',
    ],
  },
  {
    id: '2026-10-21',
    items: [
      'New to Chinese? "Basics of Chinese" in the menu explains characters, pinyin and tones, with sounds to listen to, and how the app teaches.',
      'Tone cards have a "What are tones?" link for your first few.',
      'Settings is now at the bottom of the menu.',
      'More learning notes were checked and corrected by a native speaker.',
    ],
  },
  {
    id: '2026-10-20',
    items: [
      'Clearing a character with a swipe up now takes a quick flick, so a slow line upward counts as a stroke.',
      'Just-learned words come back in Review with their kinds of cards mixed, and Review says when a word\'s other cards are waiting.',
      'The tone card shows the five tone marks, so it\'s clear what to draw.',
      'On a tablet held sideways, the grade buttons sit at the bottom beside the card, bigger and easier to reach.',
      'New in Settings › Daily study: "Grade buttons" can be just Wrong and Right.',
    ],
  },
  {
    id: '2026-10-19',
    items: [
      'Bring your decks over from Anki, with their schedules: "+ New / import deck" in Decks.',
      'Streaks: review 10 cards or learn 2 words a day to keep yours growing. A small note while you study, the rest when you pause. You can turn streaks off in Settings.',
      'A new Progress tab in the menu: your cards, the days you studied, time spent, and the words and characters you know.',
      'With no words yet, Review offers a level to start from, one tap from your first lesson.',
      'Settings now says where your words are kept and how to keep them safe, with the steps for iPhone, iPad and Mac.',
      'The dark look\'s green is calmer: more jade, less mint.',
    ],
  },
  {
    id: '2026-10-18-2',
    items: [
      'Learning a word is calmer: once a step is written, only the button to go on stays, with "Practice again" under it.',
      'After you answer a card, "About this word" is now at the bottom of the card itself, on every kind of card.',
      'The reminder to keep your words safe is shorter.',
    ],
  },
  {
    id: '2026-10-18',
    items: [
      'From now on, this list shows what has changed each time the app is updated.',
      'Send feedback is now in the menu: tell us about anything broken, confusing or missing.',
    ],
  },
];

// The entries newer than the one with the id `seen`, newest first: what came
// out since the app was last opened on this device, however many releases
// that is. With no `seen` (never shown on this device) or one no longer in
// the list, every entry is new.
export function changesSince(changes, seen) {
  const index = changes.findIndex((entry) => entry.id === seen);
  return index === -1 ? changes : changes.slice(0, index);
}

// "October 18, 2026" from "2026-10-18" (or "2026-10-18-2"). Built from the
// numbers, not by handing the text to Date, which would read it as midnight
// in London and could show the day before.
export function changeDate(id) {
  const [year, month, day] = id.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
