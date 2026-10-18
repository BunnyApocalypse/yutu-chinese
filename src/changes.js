// What changed in each release, in plain words for learners, newest first.
// A new entry is written at the top whenever a release goes out
// (docs/interface.md, "What's new"). `id` tells the entries apart and is the
// release's date; a second release on the same day gets "-2" after it.
// Each line is a short sentence about what a learner will notice, not how it
// was built.
export const CHANGES = [
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
