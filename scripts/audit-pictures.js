// Stroke-order audit: a picture of a character in two orders, side by side, as SVG.
//
//   node scripts/audit-pictures.js 冉 苒 尨
//   rsvg-convert -o local/audit/pictures/冉.png local/audit/pictures/冉.svg
//
// Left: our order (the stroke data's). Right: the mainland standard's order, from
// local/audit/orders-to-replay.json (scripts/audit-order-triage.js). Each stroke carries its
// number in that order, at the stroke's first point; strokes that change place between the
// two are red. Only Node's own modules are used. For looking at, never shipped.

import fs from 'node:fs';

const items = JSON.parse(fs.readFileSync('local/audit/orders-to-replay.json', 'utf8'));
fs.mkdirSync('local/audit/pictures', { recursive: true });

// One panel: the character's outlines in grey, the numbers on top. The data's y axis points
// up, so the picture is flipped (the same transform as Make Me a Hanzi's own pictures).
function panel(data, numberOf, changed, title, x) {
  const outlines = data.strokes.map((d) => `<path d="${d}" fill="#bbb"/>`).join('');
  const numbers = data.medians
    .map(([[px, py]], index) => {
      const colour = changed.has(index) ? '#d00' : '#111';
      return `<text x="${px}" y="${-py}" font-size="90" font-family="sans-serif" font-weight="bold" fill="${colour}" text-anchor="middle">${numberOf(index)}</text>`;
    })
    .join('');
  return (
    `<g transform="translate(${x},0)">` +
    `<text x="512" y="-50" font-size="80" font-family="sans-serif" text-anchor="middle" fill="#111">${title}</text>` +
    `<g transform="translate(0,900) scale(1,-1)">${outlines}</g>` +
    `<g transform="translate(0,900)">${numbers}</g></g>`
  );
}

for (const char of process.argv.slice(2)) {
  const item = items.find((entry) => entry.char === char);
  if (!item) {
    console.log(`${char}: not among the orders to replay`);
    continue;
  }
  const hex = char.codePointAt(0).toString(16);
  const data = JSON.parse(fs.readFileSync(`public/char-data/${hex}.json`, 'utf8'));
  // item.order lists our stroke numbers in the standard's sequence; invert it to get each
  // stroke's place in the standard.
  const placeInStandard = [];
  item.order.forEach((strokeNum, place) => (placeInStandard[strokeNum] = place));
  const changed = new Set(data.medians.map((m, index) => index).filter((index) => placeInStandard[index] !== index));

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -140 2200 1200" width="1100" height="600">` +
    `<rect x="-40" y="-140" width="2200" height="1200" fill="white"/>` +
    panel(data, (index) => index + 1, changed, `${char}: our order`, 0) +
    panel(data, (index) => placeInStandard[index] + 1, changed, `${char}: the standard's order`, 1100) +
    `</svg>`;
  fs.writeFileSync(`local/audit/pictures/${char}.svg`, svg);
  console.log(`${char}: local/audit/pictures/${char}.svg`);
}
