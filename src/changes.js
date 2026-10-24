// What changed in each release, in plain words for learners, newest first.
// A new entry is written at the top whenever a release goes out
// (docs/interface.md, "What's new"). `id` tells the entries apart and is the
// release's date; a second release on the same day gets "-2" after it.
// `items` are in English; from 2026-10-22-2 on, an entry also has its lines
// in Italian (`it`) and German (`de`), shown to readers in that language
// (whatsNew.js). The entries before stay in English (the owner, 2026-10-22).
// Each line is a short sentence about what a learner will notice, not how it
// was built. Characters in a line are written in their traditional forms
// (whatsNew.js marks them so).

import { formatDate } from './text.js';

export const CHANGES = [
  {
    id: '2026-10-24',
    items: [
      'You can bring over your study from Skritter: "Import from Skritter" in the Decks tab takes the .zip file Skritter sends you, with your whole review history.',
      'Taps on a card count at once, and the writing area is empty before each new character.',
      'On a tone card, tap a character\'s box to count its tone right or wrong, as on a writing card; also on a card you go back to.',
      'Where Chinese is left out of a writing card\'s meaning, a small gray box stands in its place.',
      'Writing: strokes are shrunk to fit far less often, the top of 辶 can be written in one stroke (隨, 這), and starting the wrong character no longer makes the app expect a tiny one.',
      'A shorter hold shows the next stroke, which now flashes more slowly; pulling down on a card no longer reloads the page.',
    ],
    it: [
      'Puoi portare qui il tuo studio da Skritter: «Importa da Skritter» nella scheda Mazzi prende il file .zip che Skritter ti invia, con tutta la cronologia dei ripassi.',
      'I tocchi su una carta contano subito, e l’area di scrittura è vuota prima di ogni nuovo carattere.',
      'Su una carta dei toni, tocca il riquadro di un carattere per contare il suo tono giusto o sbagliato, come su una carta di scrittura; anche su una carta a cui torni.',
      'Dove il cinese è omesso dal significato di una carta di scrittura, al suo posto c’è un piccolo riquadro grigio.',
      'Scrittura: i tratti vengono rimpiccioliti molto meno spesso, la parte alta di 辶 si può scrivere in un tratto (隨, 這), e iniziare il carattere sbagliato non fa più aspettare all’app un carattere minuscolo.',
      'Basta tenere premuto meno a lungo per vedere il tratto successivo, che ora lampeggia più lentamente; tirare giù su una carta non ricarica più la pagina.',
    ],
    de: [
      'Du kannst dein Lernen aus Skritter mitnehmen: „Aus Skritter importieren“ im Tab Stapel nimmt die .zip-Datei, die Skritter dir schickt, mit deinem ganzen Wiederholungsverlauf.',
      'Tipps auf eine Karte zählen sofort, und das Schreibfeld ist vor jedem neuen Zeichen leer.',
      'Auf einer Tonkarte tippst du auf das Kästchen eines Zeichens, um seinen Ton als richtig oder falsch zu zählen, wie auf einer Schreibkarte; auch auf einer Karte, zu der du zurückgehst.',
      'Wo in der Bedeutung einer Schreibkarte Chinesisch ausgelassen ist, steht ein kleines graues Kästchen.',
      'Schreiben: Striche werden viel seltener verkleinert, der obere Teil von 辶 kann in einem Strich geschrieben werden (隨, 這), und ein falsch begonnenes Zeichen lässt die App kein winziges mehr erwarten.',
      'Ein kürzeres Halten zeigt den nächsten Strich, der jetzt langsamer aufleuchtet; Herunterziehen auf einer Karte lädt die Seite nicht mehr neu.',
    ],
  },
  {
    id: '2026-10-23',
    items: [
      'Importing a big backup no longer freezes slower phones and tablets. The panel counts what has been saved; keep the app open until it is done.',
      'If an import is cut off halfway, the app says so when it next opens, so you can import the backup again.',
    ],
    it: [
      'Importare un backup grande non blocca più telefoni e tablet più lenti. Il pannello conta ciò che è stato salvato; tieni l’app aperta finché non ha finito.',
      'Se un’importazione si interrompe a metà, l’app lo dice alla prossima apertura, così puoi importare di nuovo il backup.',
    ],
    de: [
      'Eine große Sicherung zu importieren, legt langsamere Handys und Tablets nicht mehr lahm. Das Fenster zählt mit, was gespeichert ist; lass die App offen, bis es fertig ist.',
      'Bricht ein Import mittendrin ab, sagt die App es beim nächsten Öffnen, damit du die Sicherung noch einmal importieren kannst.',
    ],
  },
  {
    id: '2026-10-22-2',
    items: [
      'The app can now be used in Italian or German: choose in Settings › Look and sound › Language. Until you choose, it follows your browser\'s language.',
      'The translations are new. If something reads oddly, please tell us with Send feedback, in the menu.',
    ],
    it: [
      'Ora puoi usare l’app in italiano o in tedesco: scegli in Impostazioni › Aspetto e suono › Lingua. Finché non scegli, segue la lingua del tuo browser.',
      'Le traduzioni sono nuove. Se qualcosa suona strano, faccelo sapere con «Invia un commento», nel menu.',
    ],
    de: [
      'Die App gibt es jetzt auf Italienisch und Deutsch: Wähle unter Einstellungen › Aussehen und Ton › Sprache. Bis du wählst, folgt sie der Sprache deines Browsers.',
      'Die Übersetzungen sind neu. Wenn dir etwas seltsam vorkommt, sag es uns mit „Feedback senden“ im Menü.',
    ],
  },
  {
    id: '2026-10-22',
    items: [
      'Opening Review with many cards to do, you can review all of them or a set number, such as 50, and Review stops after that many. Settings › Daily study can switch this off.',
      'On a writing card the meaning is bold and sits just above the writing area, so it is plain what to write. Chinese in a meaning is left out there, so it can\'t be mistaken for the answer.',
      'Answered cards show the word, its pinyin and its meaning in that order, bigger than the learning tip under them.',
      'On a dictionary word\'s page, "Add to my words" is always at the bottom, apart from the button for adding the example sentence.',
      'A list of words can be just the characters, one per line: the pinyin and meaning are filled in from the dictionary.',
      'New settings: hide the number of mistakes while writing, and the OpenDyslexic font.',
      '"Show outline" in Review now lasts for one character only.',
      'Counts say "1 word" instead of "1 words", and a few other small fixes.',
    ],
  },
  {
    id: '2026-10-21-3',
    items: [
      'More learning notes were checked and corrected by a native speaker.',
    ],
  },
  {
    id: '2026-10-21-2',
    items: [
      'Changed your mind about a grade? Tap ‹ on a new card (or "Back to the last card" at the end of Review) to see your last 10 cards, with your own handwriting, and change the grade.',
      'Between the characters of a word, "missed" and "right" buttons let you correct the app if it judged a character wrong.',
      'Sentences show their meaning and the sentence with its gap on separate lines, so the gap is never cut off.',
      'The character you\'re on keeps its blue outline after it has turned green or red, and a tap goes on after practicing one again.',
      'Anki imports read real shared decks and textbooks much better: the deck\'s own meanings, its sentences as sentences, and a summary to check before importing.',
    ],
  },
  {
    id: '2026-10-21',
    items: [
      'New to Chinese? "Basics of Chinese" in the menu explains characters, pinyin and tones, with sounds to listen to, and how the app teaches.',
      'Tone cards have a "What are tones?" link for your first few.',
      'Settings is now at the bottom of the menu.',
      'More learning notes were checked and corrected by a native speaker.',
    ],
  },
  {
    id: '2026-10-20',
    items: [
      'Clearing a character with a swipe up now takes a quick flick, so a slow line upward counts as a stroke.',
      'Just-learned words come back in Review with their kinds of cards mixed, and Review says when a word\'s other cards are waiting.',
      'The tone card shows the five tone marks, so it\'s clear what to draw.',
      'On a tablet held sideways, the grade buttons sit at the bottom beside the card, bigger and easier to reach.',
      'New in Settings › Daily study: "Grade buttons" can be just Wrong and Right.',
    ],
  },
  {
    id: '2026-10-19',
    items: [
      'Bring your decks over from Anki, with their schedules: "+ New / import deck" in Decks.',
      'Streaks: review 10 cards or learn 2 words a day to keep yours growing. A small note while you study, the rest when you pause. You can turn streaks off in Settings.',
      'A new Progress tab in the menu: your cards, the days you studied, time spent, and the words and characters you know.',
      'With no words yet, Review offers a level to start from, one tap from your first lesson.',
      'Settings now says where your words are kept and how to keep them safe, with the steps for iPhone, iPad and Mac.',
      'The dark look\'s green is calmer: more jade, less mint.',
    ],
  },
  {
    id: '2026-10-18-2',
    items: [
      'Learning a word is calmer: once a step is written, only the button to go on stays, with "Practice again" under it.',
      'After you answer a card, "About this word" is now at the bottom of the card itself, on every kind of card.',
      'The reminder to keep your words safe is shorter.',
    ],
  },
  {
    id: '2026-10-18',
    items: [
      'From now on, this list shows what has changed each time the app is updated.',
      'Send feedback is now in the menu: tell us about anything broken, confusing or missing.',
    ],
  },
];

// The entries newer than the one with the id `seen`, newest first: what came
// out since the app was last opened on this device, however many releases
// that is. With no `seen` (never shown on this device) or one no longer in
// the list, every entry is new.
export function changesSince(changes, seen) {
  const index = changes.findIndex((entry) => entry.id === seen);
  return index === -1 ? changes : changes.slice(0, index);
}

// "October 18, 2026" from "2026-10-18" (or "2026-10-18-2"). Built from the
// numbers, not by handing the text to Date, which would read it as midnight
// in London and could show the day before.
export function changeDate(id) {
  const [year, month, day] = id.split('-').map(Number);
  return formatDate(new Date(year, month - 1, day), { year: 'numeric', month: 'long', day: 'numeric' });
}
