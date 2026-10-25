// Fitting a card's meaning into its line above the card (#prompt-meaning),
// so that it is cut off less often (the owner, 2026-10-25, and a tester:
// on a phone more than half the meanings of the HSK lists were cut after
// one line).
//
// The line has a fixed room on each screen: one line where the screen has
// no height to spare, and up to three where it has (--meaning-extra, set
// by wordFlow.js with the writing area's size, taken from the room that
// moves the card down). The room is the same for every card, and what a
// meaning doesn't use is added above it (--meaning-unused, the margin under
// the kind of card), so the writing area never moves (docs/pitfalls.md).
//
// In that room, in this order:
// - the meaning at the prompt's size, on as many lines as fit;
// - one size smaller, no smaller (the owner: "within limits");
// - whole meanings left out from the end ("good; proper; …"), rather than
//   cut in the middle of a word. A tap shows it all (clamp.js).

// The line's height, as a share of the text's size (style.css, #prompt-meaning.clamped).
const LINE_HEIGHT = 1.25;
// The text sizes tried, the prompt's first (style.css).
const SIZES = ['var(--size-big)', 'var(--size-title)'];

const fits = (element) => element.scrollHeight <= element.clientHeight + 1;

// The meaning's parts as spans of class "sense", one for each meaning
// between "; ", each keeping its "; " so the text reads as before (a cut-off
// meaning's panel shows element.textContent). Done once for each meaning put
// in: what the app puts there is plain text with, on a writing card, small
// boxes where Chinese was left out.
function sensesOf(element) {
  const nodes = [...element.childNodes];
  if (nodes.length > 0 && nodes.every((node) => node.classList?.contains('sense'))) {
    return nodes;
  }
  const groups = [[]];
  for (const node of nodes) {
    if (node.nodeType !== Node.TEXT_NODE) {
      groups.at(-1).push(node);
      continue;
    }
    // "a; b; c" → "a; ", "b; ", "c"
    node.textContent.split(/(?<=; )/).forEach((piece, index) => {
      if (index > 0) {
        groups.push([]);
      }
      groups.at(-1).push(document.createTextNode(piece));
    });
  }
  const spans = groups.map((group) => {
    const span = document.createElement('span');
    span.className = 'sense';
    span.append(...group);
    return span;
  });
  element.replaceChildren(...spans);
  return spans;
}

// Fits the meaning in `element` into its room. Returns true if meanings
// were left out, which a tap then shows.
export function fitMeaning(element) {
  const root = document.documentElement;
  // The room for it: one line at the prompt's former size (style.css,
  // #prompt-meaning's old min-height), and more while a card is up
  // (main.focused), where the rows around it have their set places.
  element.style.setProperty('--meaning-size', SIZES.at(-1));
  const smallest = parseFloat(getComputedStyle(element).fontSize);
  const focused = Boolean(element.closest('main.focused'));
  const extra = focused ? parseFloat(getComputedStyle(root).getPropertyValue('--meaning-extra')) || 0 : 0;
  const room = 1.5 * smallest + extra;

  const senses = element.classList.contains('with-sentence') || element.textContent === '' ? [] : sensesOf(element);
  for (const sense of senses) {
    sense.hidden = false;
    sense.classList.remove('cut-after');
  }

  let cut = false;
  // A sentence's writing card has its own layout (style.css, .with-sentence).
  if (!element.classList.contains('with-sentence')) {
    for (const size of SIZES) {
      element.style.setProperty('--meaning-size', size);
      const lineHeight = parseFloat(getComputedStyle(element).fontSize) * LINE_HEIGHT;
      element.style.setProperty('--meaning-lines', String(Math.max(1, Math.floor((room + 0.5) / lineHeight))));
      if (fits(element)) {
        break;
      }
    }
    // Still too long: whole meanings left out from the end, while that
    // helps. If even the first alone doesn't fit, it is cut off with "…".
    for (let last = senses.length - 1; last > 0 && !fits(element); last--) {
      senses[last].hidden = true;
      senses.forEach((sense, index) => sense.classList.toggle('cut-after', index === last - 1));
      cut = true;
    }
  }
  root.style.setProperty('--meaning-unused', `${Math.max(0, Math.floor(room - element.offsetHeight))}px`);
  return cut;
}
