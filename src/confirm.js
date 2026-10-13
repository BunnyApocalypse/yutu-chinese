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
export function ask({ question, detail = '', yes, no = 'Cancel' }) {
  const dialog = byId('confirm-dialog');
  const yesButton = byId('confirm-yes');
  const noButton = byId('confirm-no');
  byId('confirm-question').textContent = question;
  byId('confirm-detail').textContent = detail;
  yesButton.textContent = yes;
  noButton.textContent = no || '';
  noButton.hidden = !no;
  return new Promise((resolve) => {
    let answer = false;
    const onYes = () => {
      answer = true;
      dialog.close();
    };
    const onNo = () => dialog.close();
    // "close" comes however the panel was closed, the Esc key included.
    const onClose = () => {
      yesButton.removeEventListener('click', onYes);
      noButton.removeEventListener('click', onNo);
      resolve(answer);
    };
    yesButton.addEventListener('click', onYes);
    noButton.addEventListener('click', onNo);
    dialog.addEventListener('close', onClose, { once: true });
    // showModal() puts it on top of whatever panel is already open.
    dialog.showModal();
  });
}

// Says something that needs no answer.
export const tell = (question, detail = '') => ask({ question, detail, yes: 'OK', no: null });
