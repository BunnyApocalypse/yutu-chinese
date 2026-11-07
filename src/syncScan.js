// Scanning a sync code's QR code with this device's camera (the owner,
// 2026-11-07), for joining from the introduction or Settings: a pop-up shows
// what the camera sees, and a few times a second the picture is searched
// for a QR code (jsQR, Apache-2.0, approved that day). The code found is
// put in the box to join with; joining is still the learner's tap.
//
// The camera is reached with getUserMedia, which the browser allows only
// after asking the person, and only on a secure address (HTTPS or
// localhost). jsQR is loaded only when a scan starts: it is a separate file
// in the build (import()), not part of the app's main program.

import { readCode } from './syncCode.js';
import { t } from './text.js';

const byId = (id) => document.getElementById(id);

// How often the picture is searched, and how big it is made first: a
// smaller picture is searched faster, and a QR code held up to the camera
// fills enough of it.
const LOOK_EVERY_MS = 200;
const SEARCHED_SIZE = 640;

// The sync code in what a QR code says: the link's "#sync=…" (syncLink in
// syncCodeView.js), or a code on its own. Not yet checked.
export function codeIn(text) {
  const match = /#sync=([^\s&]+)/.exec(text);
  return decodeURIComponent(match ? match[1] : text).trim();
}

// Opens the scanner. Resolves to the code found (as codeIn gives it, and
// readable by readCode), or null if the scanner was closed first.
export function scanForCode() {
  const dialog = byId('scan-dialog');
  const video = byId('scan-video');
  const note = byId('scan-note');
  let stream = null;
  let stopped = false;
  let timer = null;

  return new Promise((resolve) => {
    // Stops the camera (its light goes off) and closes, once.
    function finish(code) {
      if (stopped) {
        return;
      }
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
      if (dialog.open) {
        dialog.close();
      }
      resolve(code);
    }

    // Closed with Cancel, the ✕ or Esc.
    dialog.addEventListener('close', () => finish(null), { once: true });
    byId('scan-cancel').addEventListener('click', () => finish(null), { once: true });

    note.textContent = t('scan.starting');
    dialog.showModal();

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        note.textContent = t('scan.noCamera');
        return;
      }
      const { default: jsQR } = await import('jsqr');
      try {
        // The camera facing away from the person, where there are two.
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch (error) {
        note.textContent = t(
          error.name === 'NotAllowedError' ? 'scan.denied' : error.name === 'NotFoundError' ? 'scan.noCamera' : 'scan.failed',
        );
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      note.textContent = t('scan.pointAt');

      // The picture is drawn into a canvas, an image the page can read the
      // pixels of, and those are handed to jsQR.
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      async function look() {
        if (stopped) {
          return;
        }
        if (video.videoWidth > 0) {
          const scale = Math.min(1, SEARCHED_SIZE / Math.max(video.videoWidth, video.videoHeight));
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          // Dark on light only: a sync code's QR code always is (syncCodeView.js).
          const found = jsQR(data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' });
          if (found) {
            const code = codeIn(found.data);
            if (!(await readCode(code)).reason) {
              finish(code);
              return;
            }
            note.textContent = t('scan.notACode');
          }
        }
        timer = setTimeout(look, LOOK_EVERY_MS);
      }
      look();
    })();
  });
}
