// A word's learning tip on the face of a card: at a new word's first look in
// a lesson, and under the answer of a meaning or pinyin card (review.js and
// recallCard.js). Asked for by the owner on 2026-10-14, who feared learners
// would take a long time to find the tips on the word's page. It shows the
// start of the tip and the example sentence, with "About this word",
// which opens the word's page.

function paragraph(className, text) {
  const element = document.createElement('p');
  element.className = className;
  element.textContent = text;
  return element;
}

// note:   the word's note (see noteFor in notes.js)
// script: 'traditional' or 'simplified', the script the card is shown in
// onMore(): opens the word's page
// tappableText(element, text): fills the element with the note, its
//         Chinese words to be tapped for their reading and meaning (wordPage.js)
//
// Returns the element to put on the card's face.
export function cardTip(note, script, onMore, tappableText) {
  const tip = document.createElement('div');
  tip.className = 'face-tip';
  const text = paragraph('face-tip-text', '');
  tappableText(text, note.note);
  tip.append(text);
  if (note.example) {
    const sentence = paragraph('face-tip-sentence', note.example[script]);
    // Tells the browser which regional font to use for the characters.
    sentence.lang = script === 'traditional' ? 'zh-Hant-TW' : 'zh-Hans-CN';
    tip.append(sentence, paragraph('face-tip-english', note.example.english));
  }
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'link-button face-tip-more';
  more.textContent = 'About this word';
  // A tap on the card's face reveals or moves on; a tap on this must not.
  more.addEventListener('pointerup', (event) => event.stopPropagation());
  more.addEventListener('click', (event) => {
    event.stopPropagation();
    onMore();
  });
  tip.append(more);
  return tip;
}
