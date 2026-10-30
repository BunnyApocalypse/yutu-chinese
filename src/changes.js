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
    id: '2026-10-30-2',
    items: [
      'A word list with traditional characters in the first column and simplified in the second is now read the right way round; checking the list says so.',
    ],
    it: [
      'Un elenco di parole con i caratteri tradizionali nella prima colonna e quelli semplificati nella seconda ora viene letto nel verso giusto; il controllo dell’elenco lo segnala.',
    ],
    de: [
      'Eine Wortliste mit traditionellen Zeichen in der ersten Spalte und vereinfachten in der zweiten wird jetzt richtig herum gelesen; die Prüfung der Liste sagt das an.',
    ],
  },
  {
    id: '2026-10-30',
    items: [
      'Rewritten, fuller learning tips for 100 words of HSK level 2, checked by a second AI model.',
    ],
    it: [
      'Consigli di studio riscritti e più completi per 100 parole del livello 2 dell’HSK, verificati da un secondo modello di IA.',
    ],
    de: [
      'Neu geschriebene, ausführlichere Lerntipps für 100 Wörter der HSK-Stufe 2, von einem zweiten KI-Modell geprüft.',
    ],
  },
  {
    id: '2026-10-29-3',
    items: [
      'Learning tips for 300 more words on the way to B2.',
      'The box beside "Learning tips" now has three kinds: ✓ when a native speaker has read the tip, AI in a solid box when a second AI model has checked it, AI in a dashed box when nothing has. Tap it to see what was done.',
    ],
    it: [
      'Consigli di studio per altre 300 parole verso il livello B2.',
      'Il riquadro accanto a «Consigli di studio» ora è di tre tipi: ✓ se l’ha letto un madrelingua, IA in un riquadro pieno se l’ha verificato un secondo modello di IA, IA in un riquadro tratteggiato se nessuno l’ha verificato. Toccalo per vedere cosa è stato fatto.',
    ],
    de: [
      'Lerntipps für 300 weitere Wörter auf dem Weg zu B2.',
      'Das Kästchen neben „Lerntipps“ gibt es jetzt in drei Arten: ✓, wenn eine Person mit Chinesisch als Muttersprache den Tipp gelesen hat, KI mit durchgezogenem Rahmen, wenn ein zweites KI-Modell ihn geprüft hat, KI mit gestricheltem Rahmen, wenn niemand ihn geprüft hat. Tippe darauf, um zu sehen, was gemacht wurde.',
    ],
  },
  {
    id: '2026-10-29-2',
    items: [
      'On a tall screen, such as a tablet held upright, the card sits a little higher, with more of the spare room below it than above.',
    ],
    it: [
      'Su uno schermo alto, come un tablet in verticale, la carta sta un po’ più in alto, con più spazio libero sotto che sopra.',
    ],
    de: [
      'Auf einem hohen Bildschirm, etwa einem hochkant gehaltenen Tablet, sitzt die Karte etwas höher, mit mehr freiem Platz darunter als darüber.',
    ],
  },
  {
    id: '2026-10-29',
    items: [
      'New in Settings › Daily study: "How much to remember", from 80% to 95%. Higher means many more reviews; a change applies from each card\'s next review.',
      'Learning tips are now in the script you study, simplified or traditional (Taiwan\'s forms), and "How to remember it" has tips for simplified forms too.',
      'Learning tips for more words and "How to remember it" for many more characters.',
    ],
    it: [
      'Novità in Impostazioni › Studio quotidiano: «Quanto ricordare», dall’80% al 95%. Più alto significa molti più ripassi; una modifica vale dal prossimo ripasso di ogni carta.',
      'I consigli di studio ora sono nella scrittura che studi, semplificata o tradizionale (le forme di Taiwan), e «Come ricordarlo» ha consigli anche per le forme semplificate.',
      'Consigli di studio per altre parole e «Come ricordarlo» per molti altri caratteri.',
    ],
    de: [
      'Neu unter Einstellungen › Tägliches Lernen: „Wie viel behalten“, von 80 % bis 95 %. Höher heißt viel mehr Wiederholungen; eine Änderung gilt ab der nächsten Wiederholung jeder Karte.',
      'Lerntipps stehen jetzt in der Schrift, die du lernst, vereinfacht oder traditionell (die Formen Taiwans), und „So merkst du es dir“ hat auch Tipps für vereinfachte Formen.',
      'Lerntipps für weitere Wörter und „So merkst du es dir“ für viele weitere Zeichen.',
    ],
  },
  {
    id: '2026-10-28',
    items: [
      'Learning tips for more words, and "How to remember it" for more characters. On the newest tips, a tap on the AI box beside "Learning tips" says how they were checked.',
    ],
    it: [
      'Consigli di studio per altre parole e «Come ricordarlo» per altri caratteri. Sui consigli più recenti, un tocco sul riquadro IA accanto a «Consigli di studio» dice come sono stati verificati.',
    ],
    de: [
      'Lerntipps für weitere Wörter und „So merkst du es dir“ für weitere Zeichen. Bei den neuesten Tipps sagt ein Tippen auf das KI-Kästchen neben „Lerntipps“, wie sie geprüft wurden.',
    ],
  },
  {
    id: '2026-10-27-2',
    items: [
      'A bigger writing area on smaller phones: the buttons under it take one row, "Practice again" sits on its bottom edge, and while you practice, "Done practicing" brings the grades back.',
      'Tone cards wait for a tap after a right tone too, so a tap to go on is never taken for the neutral tone. A tone button or a drawn mark answers the next character straight away.',
      'On a word\'s page, each character with a sound part now says how far that part still gives the sound: the same, only the tone differs, rhymes, a hint, or changed since.',
      'Some characters have a new "How to remember it": a short memory aid written by AI, under the lines on how the character is built. Learning tips for more words, too.',
    ],
    it: [
      'Un’area di scrittura più grande sui telefoni più piccoli: i pulsanti sotto stanno su una riga, «Esercitati ancora» è sul suo bordo inferiore e, mentre ti eserciti, «Fine esercizio» riporta i voti.',
      'Le carte dei toni aspettano un tocco anche dopo un tono giusto, così un tocco per andare avanti non viene mai preso per il tono neutro. Un pulsante del tono o un segno disegnato risponde subito al carattere successivo.',
      'Nella pagina di una parola, ogni carattere con una parte fonetica ora dice quanto quella parte indica ancora il suono: uguale, cambia solo il tono, fa rima, un indizio, o cambiato da allora.',
      'Alcuni caratteri hanno un nuovo «Come ricordarlo»: un breve aiuto per la memoria scritto dall’IA, sotto le righe su come è fatto il carattere. E consigli di studio per altre parole.',
    ],
    de: [
      'Eine größere Schreibfläche auf kleineren Handys: Die Knöpfe darunter passen in eine Reihe, „Noch mal üben“ sitzt an ihrem unteren Rand, und beim Üben bringt „Üben beenden“ die Bewertungen zurück.',
      'Tonkarten warten auch nach einem richtigen Ton auf ein Tippen, damit ein Tippen zum Weitergehen nie als neutraler Ton zählt. Ein Tonknopf oder ein gezeichnetes Zeichen beantwortet gleich das nächste Zeichen.',
      'Auf der Seite eines Wortes sagt jedes Zeichen mit einem Lautteil jetzt, wie gut dieser Teil noch den Klang angibt: gleich, nur der Ton ist anders, reimt sich, ein Hinweis, oder seitdem verändert.',
      'Manche Zeichen haben ein neues „So merkst du es dir“: eine kurze, von KI geschriebene Merkhilfe unter den Zeilen zum Aufbau des Zeichens. Und Lerntipps für weitere Wörter.',
    ],
  },
  {
    id: '2026-10-27',
    items: [
      'Done for the day and want more? "Practice again" at the end of Review goes through today\'s cards once more, the ones you missed first, and then all your cards if you like. Practice is never saved, so your schedule stays as it was.',
    ],
    it: [
      'Finito per oggi e ne vuoi ancora? «Esercitati ancora» alla fine del Ripasso ripropone le carte di oggi, prima quelle sbagliate, e poi tutte le tue carte, se vuoi. L’esercizio non viene mai salvato, quindi il tuo programma resta com’era.',
    ],
    de: [
      'Für heute fertig und willst mehr? „Noch mal üben“ am Ende der Wiederholung geht die Karten von heute noch einmal durch, die verpassten zuerst, und danach, wenn du magst, alle deine Karten. Üben wird nie gespeichert, dein Zeitplan bleibt also, wie er war.',
    ],
  },
  {
    id: '2026-10-26',
    items: [
      'Readings can be shown in zhuyin, or in zhuyin and pinyin together: "Readings in" in Settings › Chinese.',
      'The app says "Loading…" while it opens, and the first card comes up sooner when you have a long history.',
      'Tone cards move on faster: answer the next tone during the green pause, or tap the card to go on at once.',
      'No Next button between the characters of a word or after a wrong tone: tap the writing area or the card, or use ›. On a keyboard, Enter or Space go on, and the arrow keys move between characters.',
      'A card you keep forgetting says "Leech" beside its kind once answered; tap it for the word\'s page, where you can suspend the card. Nothing is added under the grades any more.',
      'Radicals\' meanings show their full form again, as in "water (side form of 水)", and Export backup says so while it makes the file.',
    ],
    it: [
      'Le letture possono essere mostrate in zhuyin, o in zhuyin e pinyin insieme: «Letture in» in Impostazioni › Cinese.',
      'L’app dice «Caricamento…» mentre si apre, e la prima carta arriva prima quando hai una lunga cronologia.',
      'Le carte dei toni vanno avanti più in fretta: rispondi al tono successivo durante la pausa verde, o tocca la carta per andare subito avanti.',
      'Niente più pulsante Avanti tra i caratteri di una parola o dopo un tono sbagliato: tocca l’area di scrittura o la carta, o usa ›. Con una tastiera, Invio o Spazio vanno avanti, e le frecce passano da un carattere all’altro.',
      'Una carta che continui a dimenticare dice «Sanguisuga» accanto al suo tipo una volta risposta; toccala per la pagina della parola, dove puoi sospendere la carta. Sotto i voti non si aggiunge più niente.',
      'I significati dei radicali mostrano di nuovo la loro forma piena, come in «water (side form of 水)», ed Esporta backup lo dice mentre crea il file.',
    ],
    de: [
      'Lesungen können in Zhuyin angezeigt werden, oder in Zhuyin und Pinyin zusammen: „Lesungen in“ unter Einstellungen › Chinesisch.',
      'Die App sagt „Wird geladen…“, während sie sich öffnet, und die erste Karte kommt schneller, wenn du einen langen Verlauf hast.',
      'Tonkarten gehen schneller weiter: Beantworte den nächsten Ton schon während der grünen Pause, oder tippe auf die Karte, um sofort weiterzugehen.',
      'Kein Weiter-Knopf mehr zwischen den Zeichen eines Wortes oder nach einem falschen Ton: Tippe auf die Schreibfläche oder die Karte, oder nutze ›. Mit einer Tastatur gehen Enter oder Leertaste weiter, und die Pfeiltasten wechseln zwischen den Zeichen.',
      'Eine Karte, die du immer wieder vergisst, zeigt nach der Antwort „Problemkarte“ neben ihrer Art; tippe darauf für die Seite des Wortes, wo du die Karte aussetzen kannst. Unter den Bewertungen kommt nichts mehr hinzu.',
      'Die Bedeutungen von Radikalen zeigen wieder ihre volle Form, wie in „water (side form of 水)“, und „Sicherung exportieren“ sagt Bescheid, während die Datei erstellt wird.',
    ],
  },
  {
    id: '2026-10-25-3',
    items: [
      'Tone and pinyin cards show the meaning above them, so you know which word is asked when its characters have several readings (好 hǎo or hào). A meaning card shows the reading when you have both.',
      'Meanings above a card are cut off far less often: they take up to three lines where the screen has room, and one still too long stops after a whole meaning.',
      'On a tablet held upright, the writing area is bigger, the card sits in the middle of the screen, and the meaning above it is bigger too.',
      'A meaning card\'s answer shows more of the meaning above its learning tip.',
    ],
    it: [
      'Le carte dei toni e del pinyin mostrano il significato sopra di sé, così sai quale parola viene chiesta quando i suoi caratteri hanno più letture (好 hǎo o hào). Una carta del significato mostra la lettura quando le hai entrambe.',
      'I significati sopra una carta vengono tagliati molto meno spesso: occupano fino a tre righe dove lo schermo ha spazio, e uno ancora troppo lungo si ferma dopo un significato intero.',
      'Su un tablet tenuto in verticale, l’area di scrittura è più grande, la carta sta al centro dello schermo e anche il significato sopra è più grande.',
      'La risposta di una carta del significato mostra una parte maggiore del significato sopra il suo consiglio di studio.',
    ],
    de: [
      'Ton- und Pinyin-Karten zeigen die Bedeutung über sich, damit du weißt, welches Wort gefragt ist, wenn seine Zeichen mehrere Lesungen haben (好 hǎo oder hào). Eine Bedeutungskarte zeigt die Lesung, wenn du beide hast.',
      'Bedeutungen über einer Karte werden viel seltener abgeschnitten: Sie nehmen bis zu drei Zeilen ein, wo der Bildschirm Platz hat, und eine noch zu lange endet nach einer ganzen Bedeutung.',
      'Auf einem hochkant gehaltenen Tablet ist das Schreibfeld größer, die Karte steht in der Mitte des Bildschirms, und auch die Bedeutung darüber ist größer.',
      'Die Antwort einer Bedeutungskarte zeigt mehr von der Bedeutung über ihrem Lerntipp.',
    ],
  },
  {
    id: '2026-10-25-2',
    items: [
      'On a tone card, the tone 一 and 不 take in speech is right too: yì for 一 in 一些, bú for 不 in 不是.',
      '學 written in the mainland stroke order, left side before 爻, is recognized from the first stroke.',
      'Writing a character in the mainland stroke order no longer shows a note under the buttons; it was always accepted.',
    ],
    it: [
      'Su una carta dei toni, è giusto anche il tono che 一 e 不 prendono nel parlato: yì per 一 in 一些, bú per 不 in 不是.',
      '學 scritto nell’ordine dei tratti della Cina continentale, il lato sinistro prima di 爻, viene riconosciuto dal primo tratto.',
      'Scrivere un carattere nell’ordine dei tratti della Cina continentale non mostra più una nota sotto i pulsanti; è sempre stato accettato.',
    ],
    de: [
      'Auf einer Tonkarte ist auch der Ton richtig, den 一 und 不 beim Sprechen annehmen: yì für 一 in 一些, bú für 不 in 不是.',
      '學 in der Strichfolge des Festlands geschrieben, die linke Seite vor 爻, wird ab dem ersten Strich erkannt.',
      'Ein Zeichen in der Strichfolge des Festlands zu schreiben, zeigt keinen Hinweis unter den Knöpfen mehr; es wurde immer akzeptiert.',
    ],
  },
  {
    id: '2026-10-25',
    items: [
      'Beside "Learning tips" on a word\'s page, a small box says how far to trust the tip: ✓ when it has been checked, AI when it has not. Tap it to see what was checked.',
      'The first learning tips have had their facts about the characters checked against dictionaries, and a few tips were corrected.',
    ],
    it: [
      'Accanto a «Consigli di studio», nella pagina di una parola, un piccolo riquadro dice quanto fidarsi del consiglio: ✓ se è stato verificato, IA se no. Toccalo per vedere cosa è stato verificato.',
      'I primi consigli di studio hanno avuto i loro dati sui caratteri controllati sui dizionari, e alcuni consigli sono stati corretti.',
    ],
    de: [
      'Neben „Lerntipps“ auf der Seite eines Worts zeigt ein kleines Kästchen, wie sehr du dem Tipp trauen kannst: ✓, wenn er geprüft wurde, KI, wenn nicht. Tippe darauf, um zu sehen, was geprüft wurde.',
      'Bei den ersten Lerntipps wurden die Angaben zu den Zeichen mit Wörterbüchern abgeglichen, und einige Tipps wurden korrigiert.',
    ],
  },
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
