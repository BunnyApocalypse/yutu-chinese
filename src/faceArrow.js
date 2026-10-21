// The arrows on a card's face (tone, meaning and pinyin cards, and a card
// looked back at), over its edges or beside it as on the writing area
// (style.css, data-arrows). Drawn, as are all the app's arrows (index.html).

export const BACK = 'M15 5 L8 12 L15 19';
export const FORWARD = 'M9 5 L16 12 L9 19';

// `path` is BACK (on the left) or FORWARD (on the right).
export function faceArrow(id, label, path) {
  const button = document.createElement('button');
  button.type = 'button';
  button.id = id;
  button.className = path === FORWARD ? 'side-arrow face-arrow forward' : 'side-arrow face-arrow';
  button.innerHTML =
    '<svg class="side-arrow-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" ' +
    `stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="${path}" /></svg>`;
  button.setAttribute('aria-label', label);
  button.title = label;
  // Not a stroke of a tone mark, nor a tap on the card.
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('pointerup', (event) => event.stopPropagation());
  return button;
}
