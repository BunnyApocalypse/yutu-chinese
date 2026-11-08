// Showing a sync code and keeping it safe, wherever it is shown: Settings
// (syncPanel.js) and the introduction (welcome.js). Also the link that
// carries a code, read from a QR code by another device's camera, and what
// to say when syncing goes wrong (docs/sync.md).
//
// The link is the app's address with the code after "#sync=". What comes
// after "#" is never sent to a server: the browser keeps it to itself. The
// app takes it out of the address at once (takeCodeFromLink), and never
// joins by itself: a link from someone else would sync the learner's words
// into an account that person can read. The learner confirms.

import qrcode from 'qrcode-generator';
import { formatCode } from './syncCode.js';
import { t, formatDateTime, formatNumber } from './text.js';

// The app's own address, without anything after "?" or "#".
const appAddress = () => window.location.href.split('#')[0].split('?')[0];

// The link that opens the app with this code filled in.
export const syncLink = (code) => `${appAddress()}#sync=${formatCode(code)}`;

// A code from the address the app was opened with ("#sync=…"), taken out of
// the address so it isn't kept in the history or a bookmark. Returns the
// text after "#sync=" as it was, unchecked, or null.
export function takeCodeFromLink() {
  const match = /^#sync=(.+)$/.exec(window.location.hash);
  if (!match) {
    return null;
  }
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return decodeURIComponent(match[1]);
}

// A QR code of `text`, drawn as an SVG picture: a square per dark dot, on a
// light background with a margin of four dots (what readers expect). Always
// dark on light, in both looks: the colors are read from style.css
// (--qr-dark, --qr-light) and written into the picture, so that it prints
// the same.
function qrPicture(text) {
  // Error correction "M": still readable with about 15% of it smudged.
  // Type 0: as small as the text allows.
  const code = qrcode(0, 'M');
  code.addData(text);
  code.make();
  const size = code.getModuleCount();
  const margin = 4;
  const colors = getComputedStyle(document.documentElement);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size + 2 * margin} ${size + 2 * margin}`);
  svg.setAttribute('class', 'sync-qr');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', t('sync.qrLabel'));
  const background = document.createElementNS(ns, 'rect');
  background.setAttribute('width', '100%');
  background.setAttribute('height', '100%');
  background.setAttribute('fill', colors.getPropertyValue('--qr-light').trim());
  const dots = document.createElementNS(ns, 'path');
  let path = '';
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (code.isDark(row, column)) {
        path += `M${column + margin} ${row + margin}h1v1h-1z`;
      }
    }
  }
  dots.setAttribute('d', path);
  dots.setAttribute('fill', colors.getPropertyValue('--qr-dark').trim());
  // Squares drawn edge to edge, without the browser smoothing their edges.
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.append(background, dots);
  return svg;
}

// Shows a code: in groups of four in `codeElement`, and as a QR code of its
// link in `qrElement` (replacing what was there).
export function showCode({ codeElement, qrElement }, code) {
  codeElement.textContent = formatCode(code);
  qrElement.replaceChildren(qrPicture(syncLink(code)));
}

// The text kept with the code, in a file or on paper.
function keepingText(code) {
  return t('sync.keepingText', {
    code: formatCode(code),
    date: formatDateTime(new Date()),
    address: appAddress(),
    link: syncLink(code),
  });
}

// Copy, Save as file and Print. Each returns the line to show after it.

export async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(formatCode(code));
    return t('sync.copied');
  } catch {
    // Some browsers allow copying only on a secure address, or not at all.
    return t('sync.copyFailed');
  }
}

// Saved as a small text file, as Export backup saves its file.
export function saveCodeFile(code) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([keepingText(code)], { type: 'text/plain' }));
  link.download = 'yutu-chinese-sync-code.txt';
  link.click();
  URL.revokeObjectURL(link.href);
  return t('sync.fileSaved', { file: link.download });
}

// Printed from a page of its own, made in a hidden frame, so that only the
// code, its QR code and how to use them go on paper, not the screen behind.
export function printCode(code) {
  const frame = document.createElement('iframe');
  frame.hidden = true;
  document.body.append(frame);
  const page = frame.contentDocument;
  page.documentElement.lang = document.documentElement.lang;
  const text = page.createElement('pre');
  text.style.cssText = 'font: 14pt/1.5 sans-serif; white-space: pre-wrap;';
  text.textContent = keepingText(code);
  const picture = qrPicture(syncLink(code));
  picture.style.cssText = 'width: 6cm; height: 6cm;';
  page.body.append(text, picture);
  frame.contentWindow.print();
  // Printing waits for the print dialog in most browsers; the frame goes
  // after it.
  setTimeout(() => frame.remove(), 1000);
  return '';
}

// A long step of syncing as a line (sync.js, onProgress): what is being
// done, with how far, as Import backup says it.
const megabytes = (bytes) => formatNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10);
export function progressText({ phase, done = 0, total = 0 }) {
  switch (phase) {
    case 'pack':
      return t('sync.progress.pack');
    case 'upload':
      return t('sync.progress.upload', { total: megabytes(total) });
    case 'download':
      return t('sync.progress.download', { done: megabytes(done), total: megabytes(total) });
    case 'open':
      return t('sync.progress.open');
    case 'merge':
      return t('sync.progress.merge');
    case 'save':
      return t('sync.progress.save', { done: formatNumber(done), total: formatNumber(total) });
    default:
      return t('sync.syncing');
  }
}

// What to say for each `reason` syncing gives (sync.js, syncServer.js).
const PROBLEMS = {
  offline: 'sync.problem.offline',
  refused: 'sync.problem.refused',
  'cannot-open': 'sync.problem.cannotOpen',
  'bad-batch': 'sync.problem.cannotOpen',
  'missing-batch': 'sync.problem.missing',
  'too-large': 'sync.problem.full',
  'account-full': 'sync.problem.full',
  'server-full': 'sync.problem.full',
  'too-many': 'sync.problem.busy',
  paused: 'sync.problem.paused',
};

export const problemText = (reason) => (PROBLEMS[reason] ? t(PROBLEMS[reason]) : t('sync.problem.other', { reason }));

// What to say when a typed code can't be read (readCode in syncCode.js).
const CODE_PROBLEMS = {
  length: 'sync.codeProblem.length',
  letters: 'sync.codeProblem.letters',
  mistyped: 'sync.codeProblem.mistyped',
};

export const codeProblemText = (reason) => t(CODE_PROBLEMS[reason]);
