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

// How many lines the meaning takes in full, at the size set now. Counted
// with no limit on the lines rather than by comparing the browser's heights,
// which it rounds to whole pixels in opposite directions where a line is a
// fraction of a pixel tall (the text grown on a tablet), and bold letters
// can reach past their line.
function linesNeeded(element) {
  const lines = element.style.getPropertyValue('--meaning-lines');
  element.style.setProperty('--meaning-lines', '99');
  const lineHeight = parseFloat(getComputedStyle(element).fontSize) * LINE_HEIGHT;
  const needed = Math.round(element.getBoundingClientRect().height / lineHeight);
  element.style.setProperty('--meaning-lines', lines);
  return needed;
}

const fits = (element) => linesNeeded(element) <= Number(element.style.getPropertyValue('--meaning-lines'));

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

// Fits the meaning in `element` into its room. Returns true if any of it
// is left out (whole meanings, or the end of the first), which a tap then
// shows.
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
  // A sentence's writing card has its own layout (style.css, .with-sentence):
  // fitSentenceMeaning, which may also use the room that moves the card down.
  let used = room;
  if (element.classList.contains('with-sentence')) {
    const offset = focused ? parseFloat(getComputedStyle(root).getPropertyValue('--card-offset')) || 0 : 0;
    cut = fitSentenceMeaning(element, room + offset);
    used = room + offset;
  } else {
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
    cut = cut || (element.textContent !== '' && !fits(element));
  }
  // Measured exactly (offsetHeight is rounded), or the card moved by a pixel
  // from one meaning to the next. A sentence's card may take some of the
  // room that moves the card down (--card-offset): then this is below zero,
  // and the margin above shrinks by as much, so the area stays where it is.
  const unused = Math.max(room - used, room - element.getBoundingClientRect().height);
  root.style.setProperty('--meaning-unused', `${unused}px`);
  return cut;
}

// The text sizes tried for a sentence's meaning: the size it always had,
// then the body text's (the owner chose this, 2026-11-12, so that a
// sentence's English is cut off less often).
const SENTENCE_SIZES = ['var(--size-title)', 'var(--size-body)'];
// Its line's height, as a share of the text's size (style.css, .with-sentence .prompt-text).
const SENTENCE_LINE_HEIGHT = 1.3;

// A sentence's writing card: the meaning (`.prompt-text`) above the sentence
// with its gap, which is never cut off, being what is asked (review.js). The
// two together get `budget`: the meaning's own room and, while a card is up,
// the room that would move the card down. The meaning takes as many lines as
// the sentence leaves in it, at least one, at the first size where it fits
// whole; at the smaller size it is no longer bold. Returns true if it is
// still cut off (a tap shows it all, clamp.js).
function fitSentenceMeaning(element, budget) {
  const text = element.querySelector('.prompt-text');
  element.classList.remove('smaller-meaning');
  if (!text) {
    return false;
  }
  let lines = 1;
  let needed = 1;
  for (const [index, size] of SENTENCE_SIZES.entries()) {
    element.style.setProperty('--meaning-size', size);
    element.classList.toggle('smaller-meaning', index > 0);
    const lineHeight = parseFloat(getComputedStyle(text).fontSize) * SENTENCE_LINE_HEIGHT;
    // How tall the card's top is with one line of meaning, and how many
    // lines the meaning needs in full.
    element.style.setProperty('--meaning-lines', '1');
    const left = budget - element.getBoundingClientRect().height;
    element.style.setProperty('--meaning-lines', '99');
    needed = Math.round(text.getBoundingClientRect().height / lineHeight);
    lines = Math.max(1, 1 + Math.floor((left + 0.5) / lineHeight));
    // Fits whole, or with no more room at the smaller size, better to keep
    // the usual size and cut it there.
    if (needed <= lines) {
      break;
    }
    if (index === SENTENCE_SIZES.length - 1 && lines === 1) {
      element.style.setProperty('--meaning-size', SENTENCE_SIZES[0]);
      element.classList.remove('smaller-meaning');
    }
  }
  element.style.setProperty('--meaning-lines', String(Math.min(lines, needed)));
  return needed > lines;
}
