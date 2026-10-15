// Pop-up panels (<dialog> elements) that close with a tap beside them, on
// the dimmed page, as well as with their own button and Escape (the owner,
// 2026-10-15). Only for panels where nothing is lost by closing: Settings
// saves each setting as it is changed, and the word's page and the credits
// are only read. Not for a panel with a form, where a stray tap would throw
// away what was typed.

// A tap on the dimmed page reaches the <dialog> element itself, as does a
// tap on the panel's own padding, so where it landed decides.
export function closeOnTapBeside(dialog) {
  dialog.addEventListener('click', (event) => {
    const box = dialog.getBoundingClientRect();
    const outside =
      event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    if (event.target === dialog && outside) {
      dialog.close();
    }
  });
}
