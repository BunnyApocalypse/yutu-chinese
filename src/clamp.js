// Keeping long text short on screen: an element is cut off after one line
// (the style sheet's class "clamped" does that, see style.css), and tapping
// it shows all of it in a panel on top of the page. Some dictionary meanings
// run to a dozen lines, which would push a card's writing area down or make
// it smaller; this way a long meaning takes no more room than a short one.

// element:  what holds the text; it gets the class "clamped", and the class
//           "has-more" while there is more than fits
// showAll(text): called when the element is tapped while it has more
//
// Whenever the element's contents change, this is worked out afresh.
export function clampWithPopup(element, showAll) {
  const check = () => {
    element.classList.add('clamped');
    // scrollHeight is how tall the text is in full; clientHeight how much of
    // that is showing.
    const hasMore = element.scrollHeight > element.clientHeight + 1;
    element.classList.toggle('has-more', hasMore);
    // While it has more, it acts as a button for the keyboard and screen
    // readers too: tabindex="0" lets Tab reach it, and role="button" makes a
    // screen reader say it can be pressed. (Not a <button> element, which
    // would not cut its text off the same way.)
    if (hasMore) {
      element.tabIndex = 0;
      element.setAttribute('role', 'button');
      element.setAttribute('aria-description', 'Shows all of it');
    } else {
      element.removeAttribute('tabindex');
      element.removeAttribute('role');
      element.removeAttribute('aria-description');
    }
  };
  element.addEventListener('click', () => {
    if (element.classList.contains('has-more')) {
      showAll(element.textContent);
    }
  });
  // A button is pressed with Enter or Space from the keyboard; a <p> needs
  // to be told so.
  element.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && element.classList.contains('has-more')) {
      event.preventDefault(); // or Space would scroll the page
      showAll(element.textContent);
    }
  });
  // A MutationObserver is told whenever the element's contents change, so
  // the rest of the app can go on setting its text as it always did.
  new MutationObserver(check).observe(element, { childList: true, characterData: true, subtree: true });
  check();
}
