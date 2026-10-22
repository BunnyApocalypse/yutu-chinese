// The font of the interface: the device's own (the default) or OpenDyslexic,
// a font whose letters are weighted at the bottom so they are harder to
// mix up, which some readers with dyslexia find easier (tester 4,
// 2026-10-21; the owner, 2026-10-22). Chinese is never in it: OpenDyslexic
// has no Chinese characters, so the browser takes those from the device's
// fonts as before.
//
// The font files are the app's own (public/fonts/opendyslexic/, with their
// license), saved for offline use like the rest of the app. They are only
// fetched once the font is chosen: a FontFace is the browser's way of
// loading a font from code, where a rule in the style sheet would load it
// for everyone.
//
// The style sheet uses the font while <html> has data-font="dyslexic".

let loading = null;

function loadOpenDyslexic() {
  loading =
    loading ||
    Promise.all(
      [
        ['Regular', '400'],
        ['Bold', '700'],
      ].map(([style, weight]) => {
        const url = `${import.meta.env.BASE_URL}fonts/opendyslexic/OpenDyslexic-${style}.woff2`;
        const face = new FontFace('OpenDyslexic', `url("${url}") format("woff2")`, {
          weight,
          // Only plain Latin letters and punctuation: OpenDyslexic draws
          // pinyin's tone marks (ǒ, ǚ) badly, so those come from the
          // device's font, as Chinese does.
          unicodeRange: 'U+0000-00FF, U+2000-206F',
          // Its letters are wide and its lines tall, which wrapped the rows
          // above the writing area and moved it down by up to 160px on a
          // small phone (docs/pitfalls.md). Drawn a little smaller and
          // with lines as tall as the device font's, it moves 15 to 40px.
          sizeAdjust: '88%',
          ascentOverride: '95%',
          descentOverride: '30%',
          lineGapOverride: '0%',
        });
        document.fonts.add(face);
        return face.load();
      }),
    ).catch(() => {
      // Without the files the device's font stays in use.
      loading = null;
    });
  return loading;
}

// Uses the font chosen in Settings: 'system' or 'dyslexic'.
export function setFont(value) {
  const root = document.documentElement;
  if (value === 'dyslexic') {
    loadOpenDyslexic();
    root.dataset.font = 'dyslexic';
  } else {
    delete root.dataset.font;
  }
}
