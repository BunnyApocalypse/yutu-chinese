// Telling a new tap from the end of the touch that came before.
//
// When a touch finishes a step (the last stroke of a character, the tap
// that shows an answer), the card changes as the finger is lifted. A tap
// that moves on must not be that same touch. This used to be a pause, with
// taps ignored for 200 ms after each step; the owner, 2026-10-24, found the
// card unresponsive in it. Instead, a tap now counts only if the finger
// came down after the step was over, however soon.
//
// "pointerdown" is the browser's event for a finger, pen or mouse button
// coming down. It is counted on the way down to the element (`capture`), so
// a part inside that keeps its own taps (an arrow, a link) can't hide it.
//
// Returns { mark(), isFresh() }: mark() at the end of a step; isFresh() on
// a tap, true if its touch began after the last mark().
export function freshTaps(element) {
  let presses = 0;
  let pressesAtMark = 0;
  element.addEventListener(
    'pointerdown',
    (event) => {
      if (event.isPrimary) {
        presses += 1;
      }
    },
    { capture: true },
  );
  return {
    mark() {
      pressesAtMark = presses;
    },
    isFresh() {
      return presses > pressesAtMark;
    },
  };
}
