// Keeping long text short on screen: an element is cut off after a few
// lines, and a button beside it shows all of it. Some dictionary meanings
// run to a dozen lines, which would push a card's writing area off the
// screen.
//
// The cutting itself is the style sheet's (the class "clamped": see
// style.css). This file only works out whether anything was cut, since the
// button is not wanted otherwise.

// element: what holds the text; it gets the class "clamped"
// button:  shown while there is more than fits; tapping it shows everything,
//          tapping again cuts it short again
//
// Whenever the element's contents change, it is cut short afresh.
export function clampWithToggle(element, button) {
  const check = () => {
    element.classList.add('clamped');
    button.textContent = 'Show all';
    // scrollHeight is how tall the text is in full; clientHeight how much of
    // that is showing.
    button.hidden = element.scrollHeight <= element.clientHeight + 1;
  };
  button.addEventListener('click', () => {
    const cut = element.classList.toggle('clamped');
    button.textContent = cut ? 'Show all' : 'Show less';
  });
  // A MutationObserver is told whenever the element's contents change, so
  // the rest of the app can go on setting its text as it always did.
  new MutationObserver(check).observe(element, { childList: true, characterData: true, subtree: true });
  check();
}
