# Translating the interface

How the Italian (`src/text/it.js`) and German (`src/text/de.js`) texts are written, for whoever adds or checks a text: the rules, then the words the app uses for its own ideas. How text works in the code: `docs/interface.md`, "Interface text and translations".

Started on 2026-10-22 (the owner): Italian and German, interface only (no dictionary in either language), first drafts by Claude, to be checked by a native speaker of each (Italian: a tester, who has reported no issues as of 2026-10-30; German: still to find). Released to `stable` as drafts on 2026-10-22 (the owner: no learners outside the testers yet).

## Rules

- **Informal "you"** (the owner, 2026-10-22): *tu* in Italian, *du* in German, as in most learning apps. Imperatives in the same form (*tocca*, *tippe*). German capitalizes *du* only at the start of a sentence.
- **Keys and `{gaps}` exactly as in English.** A gap may move inside the sentence; it is never translated, removed or added. `node scripts/missing-text.js it` lists gaps that differ.
- **Markup kept whole:** links (`<a href=…>`, the address unchanged; pointing a Wikipedia link to its Italian or German article is for the native checker, who can see the article exists), `<b>`, `<br />`, and every `<span lang=…>`, `<span data-zh>`, `<span data-simplified=… data-traditional=…>`: their Chinese and attributes are left as they are, only the text around them changes.
- **Chinese, pinyin and the app's name (玉兔中文, Yutu) are never translated.** Neither are Anki, Skritter, Hanzi Writer, CC-CEDICT, Wikipedia, MOE, TOCFL, HSK, browser and system names.
- **Number forms:** a text given as `{ one, other }` stays an object with `one` and `other` (the forms each language's grammar takes). Italian may add `many`, but needn't: it is only used for millions and falls back to `other`. A text that is a plain string in English stays a string. `write.ordinal` (counting in order): Italian `{ other: '{count}°' }` (Italian's ordinal forms are `many` and `other`; both write "°"), German `{ other: '{count}.' }`.
- **Short where English is short:** buttons, tabs, menu items and grade buttons sit in tight rows on a phone 360 pixels wide. Prefer the shorter of two good words; German compound nouns may be split with a hyphen only if they are very long. The abbreviated times under the grade buttons (`interval.*`) stay as short as the English.
- **Words put into a gap:** some texts take a word made elsewhere, such as `{kind}` (one of the `leech.kind…` texts: meaning, pinyin, tones, writing) or `{deck}`. Write the surrounding sentence so it reads with what goes in, avoiding a clash of gender or case (Italian *la carta di {kind}*, German *die {kind}-Karte* or *Karte „{kind}“*).
- **Pronunciation hints by comparison** (Basics of Chinese, `basics.letter…`): English compares pinyin sounds to English words ("x as 'sh' in 'sheep'"). Compare to Italian or German words instead, keeping the pinyin example after the colon. Where the language has no close sound, describe it (German has no "j" as in "jam": *wie „dsch“ in „Dschungel“*).
- **Quotation marks:** Italian « » or " " (as English uses " "); German „ “. Inside JavaScript strings, keep the quote character that delimits the string escaped.
- **Dates, numbers and lists** are written by the code (`formatDate`, `formatNumber`, `list.separator`, `list.and`); a translation only gives `list.and` its word (*e*, *und*).
- A comment above a key in `en.js` says where the text appears; the code named in the group's heading shows how it is used.

## The app's words

| English | Italiano | Deutsch | Notes |
| --- | --- | --- | --- |
| card | carta | Karte | as in Anki's Italian and German, which many learners know |
| deck | mazzo | Stapel | as in Anki |
| Review (the tab, and reviewing) | Ripasso / ripassare | Wiederholen / wiederholen | the tab is a verb in German |
| Learn (the tab) | Impara | Lernen | |
| Free practice / practice | Esercizio libero / esercitarsi | Freies Üben / üben | |
| lesson (in Learn) | lezione | Lektion | |
| Words (the tab) | Parole | Wörter | |
| Decks (the tab) | Mazzi | Stapel | |
| Progress (the tab) | Progressi | Fortschritt | |
| Settings | Impostazioni | Einstellungen | |
| Basics of Chinese | Basi del cinese | Grundlagen des Chinesischen | |
| What's new | Novità | Neuigkeiten | |
| Send feedback | Invia un commento | Feedback senden | |
| grades: Again, Hard, Good, Easy | Ripeti, Difficile, Bene, Facile | Nochmal, Schwer, Gut, Einfach | as in Anki |
| Wrong, Right | Sbagliato, Giusto | Falsch, Richtig | |
| leech | sanguisuga | Problemkarte | a card you keep getting wrong; Anki's Italian says *sanguisuga* |
| suspend / resume (a card) | sospendere / riattivare | aussetzen / fortsetzen | |
| card types: writing, tones, meaning, pinyin | scrittura, toni, significato, pinyin | Schreiben, Töne, Bedeutung, Pinyin | |
| raw input (your own strokes kept as drawn) | input grezzo | Roheingabe | the owner's term in English; never Skritter's |
| writing area | area di scrittura | Schreibfeld | |
| stroke / stroke order | tratto / ordine dei tratti | Strich / Strichfolge | |
| outline (Show outline) | contorno | Umriss | |
| Animate | Anima | Animieren | |
| character | carattere | Schriftzeichen (Zeichen where short) | |
| word / sentence | parola / frase | Wort / Satz | |
| radical | radicale | Radikal | |
| simplified / traditional | semplificato / tradizionale | vereinfacht / traditionell | |
| mainland (China) | Cina continentale | Festlandchina | |
| tone; first … fourth, neutral tone | tono; primo … quarto tono, tono neutro | Ton; erster … vierter Ton, neutraler Ton | |
| meaning / reading | significato / lettura | Bedeutung / Lesung | |
| streak | serie | Serie | days in a row |
| backup | backup | Sicherung | |
| learning notes | note di studio | Lernnotizen | |
| look (light, dark) | aspetto (chiaro, scuro) | Aussehen (hell, dunkel) | |
| ready-made decks | mazzi pronti | fertige Stapel | |
| the test copy | la copia di prova | die Testversion | |

## Choices made for room

At 360 pixels wide (a small phone), these were shortened so the rows around the writing area stay on one line (`docs/pitfalls.md`); a checker suggesting a longer word should know why: the writing buttons (*Rifai*, *Contorno* / *Togli contorno*, *Anima*; *Neu*, *Umriss* / *Ohne Umriss*, *Animieren*), the German first-stroke prompt (*Erster Strich*), the German practice note, the grade-button choices in Settings (no "Four:" before them), "All cards" in Progress (*Totale*, *Gesamt*), the tone card's "Draw one of these here", and "Follow device theme" (*Come il dispositivo*). Pictures of the main screens in a language: `node local/text-pictures/shoot-screens.js it` (into `local/text-pictures/it/`).

## For the native checkers

The drafts were made by Claude (2026-10-22). Most worth a native eye:

- **Names of other apps' menus**, guessed: iOS and macOS (*Aggiungi a Home*, *Zum Home-Bildschirm*, *Ablage › Zum Dock hinzufügen*), Chrome (*Trasmetti, salva e condividi*, *Streamen, speichern und teilen*), Anki's export (*Includi le informazioni di pianificazione*, *Planungsinformationen einbeziehen*, *Anki-Stapelpaket*). Best checked on a device in that language.
- **The Skritter import** (`skritter.…`, drafted 2026-10-23 after the rest): *escluso* for Skritter's "banned", *gesperrt* in German; "{words} in {sections}" built with a dative plural in German (*in 28 Abschnitten*). The decks it makes ("Skritter", "Section 1") are saved names and stay English.
- **Zhuyin** (`settings.reading…`, `review.zhuyinButton`, `review.readingButton`, drafted 2026-10-26): "Readings in" as *Letture in* and *Lesungen in*; "Show reading" as *Mostra lettura* and *Lesung zeigen*.
- **Basics of Chinese**: the pinyin sounds compared to Italian and German words (`basics.letter…`).
- **Sentences built around a box or a word put in**: "A card is a leech after [n] times forgotten" (`settings.leechAfter`, `settings.leechHint`), the streak's goal (`settings.streakGoal…`), "the {kind} card of {word}" (`review.suspended…`: *la carta di toni*, *die Karte „Ton“*).
- **Terms**: *sanguisuga* and *Problemkarte* for a leech, *input grezzo* and *Roheingabe* for raw input, *Rifai* and *Neu* for Clear.
- **Names that stay English**: ready-made decks and their levels ("Radicals 部首", "Common", "Novice 1") and the first deck ("Chinese 中文") are saved with the learner's decks, so they are not translated; texts quote them as they appear.
