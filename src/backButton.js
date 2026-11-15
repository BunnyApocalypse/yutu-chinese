// The phone's Back button (and the browser's Back).
//
// The app is one page, so without this Back leaves it: in an installed app it
// went to a blank page (Firefox's installed app, the owner, 2026-11-15). The
// browser keeps a list of the places a window has been ("history"); Back
// steps one place down it. Here the page adds its own places to that list:
//
// - One "guard" place, added at the first touch or key press, so there is
//   always one more place to go back to inside the app. (Chrome skips a place
//   the page added without any touch, as it meant to stop pages trapping
//   Back; so the guard waits for one.) Back at the front screen lands on it and
//   the app puts it back, so Back does nothing there.
// - One place for each pop-up panel (<dialog>: the menu, a word's page,
//   Settings…) while it is open. Back closes the panel on top.
//
// A panel closed by its own button or by Escape gives its place back with
// history.back(), so the list never grows. Moving between screens is not
// covered; only the panels are.

// The panels that are open, the one opened last at the end.
const open = [];
// history.back() calls the page made itself, whose "popstate" is not the
// learner pressing Back.
let ownSteps = 0;
// True once the guard place is in the history. Before it, a panel takes no
// place (and so gives none back): there is nothing of the app's to step back
// onto, and history.back() would leave the app.
let guarded = false;

function pushPlace() {
  window.history.pushState({ yutu: 'place' }, '');
}

function giveBackPlace() {
  // Only from one of the app's own places.
  if (window.history.state?.yutu === 'place') {
    ownSteps += 1;
    window.history.back();
  }
}

// Closes a panel as if its Escape key were pressed (so a panel that asks
// "really?" on Escape still asks), or plainly where the browser can't.
function closePanel(dialog) {
  if (typeof dialog.requestClose === 'function') {
    dialog.requestClose();
  } else {
    dialog.close();
  }
}

function onBack() {
  if (ownSteps > 0) {
    ownSteps -= 1;
    return;
  }
  const top = open.pop();
  if (!top) {
    // Back reached the place before the guard: put the guard back.
    pushPlace();
    return;
  }
  closePanel(top);
  if (top.open) {
    // The panel refused to close (it was asked to confirm first): it keeps
    // its place in the list.
    open.push(top);
    pushPlace();
  }
}

// A panel's "open" attribute is there while it is shown (showModal sets it).
function onOpenChanged(dialog) {
  const listed = open.indexOf(dialog);
  if (dialog.open && listed === -1 && guarded) {
    open.push(dialog);
    pushPlace();
  } else if (!dialog.open && listed !== -1) {
    open.splice(listed, 1);
    giveBackPlace();
  }
}

export function setUpBackButton() {
  const addGuard = () => {
    window.removeEventListener('pointerdown', addGuard, true);
    window.removeEventListener('keydown', addGuard, true);
    pushPlace();
    guarded = true;
  };
  window.addEventListener('pointerdown', addGuard, true);
  window.addEventListener('keydown', addGuard, true);
  window.addEventListener('popstate', onBack);
  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.target instanceof HTMLDialogElement) {
        onOpenChanged(change.target);
      }
    }
  }).observe(document.body, { attributes: true, attributeFilter: ['open'], subtree: true });
}
