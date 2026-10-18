// Asking before something that cannot be undone, and saying that something
// went wrong: in a panel of the app's own (index.html), where the browser's
// plain "OK / Cancel" box would look foreign and cannot say what its buttons
// do.

const byId = (id) => document.getElementById(id);

// Asks a question.
//
// question: what is about to happen, as a question ("Remove 愛 from your words?")
// detail:   what that means, in a sentence or two
// yes:      the wording of the button that goes ahead ("Remove")
// no:       the wording of the one that does not; left out, there is only
//           the one button (for a message that is not a question)
//
// Returns a promise for true if the first button was tapped, false for the
// other one or the Esc key.
// The question being asked: { answer, resolve }, until the panel closes.
let asking = null;

export function ask({ question, detail = '', yes, no = 'Cancel' }) {
  const dialog = byId('confirm-dialog');
  listenOnce(dialog);
  byId('confirm-question').textContent = question;
  byId('confirm-detail').textContent = detail;
  byId('confirm-yes').textContent = yes;
  const noButton = byId('confirm-no');
  noButton.textContent = no || '';
  noButton.hidden = !no;
  // A question asked again straight after the last one closed: the last
  // one's "close" has not come yet (the browser sends it a moment later),
  // so it is answered here, and that late "close" is ignored (below).
  if (asking) {
    asking.resolve(asking.answer);
  }
  return new Promise((resolve) => {
    asking = { answer: false, resolve };
    // showModal() puts it on top of whatever panel is already open.
    dialog.showModal();
  });
}

// The panel's buttons and its "close" are listened to once, for every
// question, rather than by each question in turn: a late "close" would
// otherwise reach the next question's listeners and answer it "no" (it
// did, in the browser tests, when Remove was tapped again at once).
let listening = false;
function listenOnce(dialog) {
  if (listening) {
    return;
  }
  listening = true;
  byId('confirm-yes').addEventListener('click', () => {
    if (asking) {
      asking.answer = true;
    }
    dialog.close();
  });
  byId('confirm-no').addEventListener('click', () => dialog.close());
  // "close" comes however the panel was closed, the Esc key and its ✕
  // included. Open again by then, it belongs to a question already answered.
  dialog.addEventListener('close', () => {
    if (dialog.open || !asking) {
      return;
    }
    const { answer, resolve } = asking;
    asking = null;
    resolve(answer);
  });
}

// Says something that needs no answer.
export const tell = (question, detail = '') => ask({ question, detail, yes: 'OK', no: null });
