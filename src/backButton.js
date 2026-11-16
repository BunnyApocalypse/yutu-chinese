// The phone's Back button (and the browser's Back).
//
// The app is one page, so without this Back leaves it: in an installed app it
// went to a blank page and then closed the app (Firefox's installed app, the
// owner, 2026-11-15). The browser keeps a list of the places a window has been
// ("history"); Back steps one place down it. Here the page adds its own places
// to that list:
//
// - One "guard" place, so there is always one more place to go back to inside
//   the app. Back at the front screen lands on the place below it, and the app
//   puts the guard back, so Back does nothing there.
// - One place for each pop-up panel (<dialog>: the menu, a word's page,
//   Settings…) while it is open. Back closes the panel on top.
//
// **Browsers skip places the learner never touched.** Chrome and Firefox's Back
// button pass over a place that was added by a page without a touch or key
// press while it was the current place (meant to stop pages trapping Back).
// So: (1) the app's own first place only counts as touched if the guard is
// added after the first complete tap (the "click", sent after the finger is
// lifted, which is what counts on a phone); added at the first touch, the
// guard took the touch and Back skipped straight past the app's first place
// to the blank page. (2) A panel's place is usually skipped (nobody touches
// inside before pressing Back), and so may two at once. So each place carries
// its depth, and after any Back the page looks at the depth it landed on, not
// at how many steps were taken, then closes one panel and puts back as many
// places as the open panels and the guard need.
//
// A panel closed by its own button or by Escape gives its places back with
// history.go(), so the list never grows. Moving between screens is not
// covered; only the panels are.

// The panels that are open, the one opened last at the end.
const open = [];
// True once the guard is wanted. Before it, a panel takes no place (and so
// gives none back): history.back() from the app's first place would leave it.
let guarded = false;
// The depth of the place the page believes it is on, counting steps it has
// asked for that may not have happened yet. 0 is the app's own first place;
// each place the page adds is one deeper.
let placed = 0;
// True while a step down the history asked for by the page has not landed.
// Nothing is added or taken meanwhile: a place added before the step ran would
// be the one the step went past (a tap closing one panel and opening another
// did exactly that).
let stepping = false;

// How many places the page wants: the guard and one for each open panel.
const wanted = () => (guarded ? open.length + 1 : 0);

// The depth of the place the browser is on now.
const depthNow = () => (window.history.state?.yutu === 'place' ? window.history.state.depth : 0);

function pushPlaces() {
  while (placed < wanted()) {
    placed += 1;
    window.history.pushState({ yutu: 'place', depth: placed }, '');
  }
}

// Brings the places in the history to what is wanted.
function reconcile() {
  // Before the guard, a reloaded page may sit on a place of its own from
  // before the reload; stepping down from it would leave the app.
  if (stepping || !guarded) {
    return;
  }
  if (placed < wanted()) {
    pushPlaces();
  } else if (placed > wanted() && depthNow() > 0) {
    const steps = wanted() - placed;
    placed = wanted();
    stepping = true;
    // If the step never lands, carry on after a second.
    setTimeout(() => {
      stepping = false;
      reconcile();
    }, 1000);
    window.history.go(steps);
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

// Back (or a step the page asked for itself).
function onBack() {
  const depth = depthNow();
  if (depth === placed) {
    // The page's own step, landed.
    stepping = false;
    reconcile();
    return;
  }
  placed = depth;
  stepping = false;
  const top = open.pop();
  if (top) {
    closePanel(top);
    if (top.open) {
      // The panel refused to close (it asked to confirm first): it stays.
      open.push(top);
    }
  }
  reconcile();
}

// A panel's "open" attribute is there while it is shown (showModal sets it).
// All the changes of a moment are taken together: a tap often closes one panel
// and opens the next.
function onOpenChanged(changes) {
  for (const { target: dialog } of changes) {
    if (!(dialog instanceof HTMLDialogElement)) {
      continue;
    }
    const listed = open.indexOf(dialog);
    if (dialog.open && listed === -1 && guarded) {
      open.push(dialog);
    } else if (!dialog.open && listed !== -1) {
      open.splice(listed, 1);
    }
  }
  reconcile();
}

export function setUpBackButton() {
  // A reloaded page is still on the place it was on.
  placed = depthNow();
  const onFirstTap = () => {
    window.removeEventListener('click', onFirstTap, true);
    window.removeEventListener('keydown', onFirstTap, true);
    // A moment later, so the browser has noted the touch on the place it
    // happened on before a new one is added.
    setTimeout(() => {
      guarded = true;
      reconcile();
    }, 250);
  };
  window.addEventListener('click', onFirstTap, true);
  window.addEventListener('keydown', onFirstTap, true);
  window.addEventListener('popstate', onBack);
  new MutationObserver(onOpenChanged).observe(document.body, {
    attributes: true,
    attributeFilter: ['open'],
    subtree: true,
  });
}
