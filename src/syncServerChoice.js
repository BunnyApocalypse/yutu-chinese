// Choosing another sync server, for anyone running their own
// (deploy/README.md): an address box folded away, since few need it. In
// Settings under "Sync server: <name>" (syncPanel.js), and in the
// introduction under "Self-hosting?" on the first screen's code box and
// under the last screen's new code (welcome.js; the owner, 2026-11-08).
//
// Each place has the same elements in index.html, their IDs starting with
// its own prefix: <prefix>-server-fold (the <details> fold), -summary,
// -form, -input, -use, -usual and -note. A new address is taken only once
// it answers (serverAnswers). All of them show the one server chosen, kept
// in the sync store (syncControl.js); choosing it is only for while sync is
// off, as a learner's files are on the server their sync began with.

import { readServerAddress, serverAnswers } from './syncServer.js';
import { t } from './text.js';

const byId = (id) => document.getElementById(id);

// The server's name alone, as shown.
export const hostOf = (address) => new URL(address).host;

// Every chooser made, to show a choice made in one in the others too.
const choosers = [];

// prefix:   the start of its elements' IDs
// control:  from createSyncControl (syncControl.js)
// summary:  true where the fold's line names the server (Settings); else
//           it keeps its own text ("Self-hosting?")
// onChosen(address): called after a server was chosen (null: the usual one)
//
// Returns { refresh(), useFromLink(address) }: useFromLink opens the fold
// and tries the server from a sync link, as if typed and tapped.
export function createServerChoice(prefix, control, { summary = false, onChosen = () => {} } = {}) {
  const fold = byId(`${prefix}-server-fold`);
  const form = byId(`${prefix}-server-form`);
  const input = byId(`${prefix}-server-input`);
  const usual = byId(`${prefix}-server-usual`);
  const note = byId(`${prefix}-server-note`);

  async function refresh() {
    const address = await control.server();
    if (summary) {
      byId(`${prefix}-server-summary`).textContent = t('sync.serverSummary', { host: address ? hostOf(address) : '–' });
    }
    usual.hidden = !control.usualServer || address === control.usualServer;
  }

  async function chosen(address) {
    await control.chooseServer(address);
    note.hidden = false;
    note.textContent = t('sync.serverChosen', { host: hostOf(address || control.usualServer) });
    await Promise.all(choosers.map((chooser) => chooser.refresh()));
    await onChosen(address);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    note.hidden = false;
    const { address, reason } = readServerAddress(input.value);
    if (reason) {
      note.textContent = t(reason === 'notSecure' ? 'sync.serverProblem.notSecure' : 'sync.serverProblem.notAddress');
      return;
    }
    note.textContent = t('sync.serverChecking');
    if (!(await serverAnswers(address))) {
      note.textContent = t('sync.serverProblem.noAnswer');
      return;
    }
    input.value = '';
    await chosen(address);
  });
  usual.addEventListener('click', () => chosen(null));

  const chooser = {
    refresh,
    useFromLink(address) {
      fold.open = true;
      input.value = address;
      form.requestSubmit();
    },
  };
  choosers.push(chooser);
  refresh();
  return chooser;
}
