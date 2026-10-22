// Every piece of the interface's text in English (src/text.js says how it
// is used). Grouped by screen; a key is the group, a dot, and a short name.
//
// {name} is a gap filled in by the code. A text given as { one, other } has a
// form for each kind of number (one word, 3 words). Text under a key used
// with data-t-html may hold markup; Chinese in it keeps its own lang mark.
//
// A translation (de.js, say) has the same keys; one it lacks shows in English
// (`node scripts/missing-text.js de` lists them).

export default {
  // Between the items of a plain series (formatList in text.js)
  'list.separator': ', ',

  // Settings (index.html, settings-panel)
  'settings.title': 'Settings',
  'settings.done': 'Done',
  'settings.groups': 'Groups of settings',
  'settings.whatDoesThisDo': 'What does this setting do?',
  'settings.chinese': 'Chinese',
  'settings.dailyStudy': 'Daily study',
  'settings.writing': 'Writing',
  'settings.lookAndSound': 'Look and sound',
  'settings.data': 'Your data and backups',
  'settings.help': 'Help, feedback and licenses',
  'settings.testing': 'For testing',

  'settings.script': 'Script',
  'settings.scriptSimplified': 'Simplified only 简体',
  'settings.scriptTraditional': 'Traditional only 繁體',
  'settings.scriptBothSimplified': 'Both, cards in simplified',
  'settings.scriptBothTraditional': 'Both, cards in traditional',
  'settings.scriptHint':
    '<a href="https://en.wikipedia.org/wiki/Simplified_Chinese_characters" target="_blank" rel="noopener">Simplified</a> characters are used in mainland China, Singapore and Malaysia. <a href="https://en.wikipedia.org/wiki/Traditional_Chinese_characters" target="_blank" rel="noopener">Traditional</a> characters are used in Taiwan, Hong Kong and Macau. Many characters are the same in both; others differ, like <span lang="zh-Hans-CN">学</span> and <span lang="zh-Hant-TW">學</span>. If you are not sure, pick the one used where you plan to read or speak Chinese.<br />With one script, you are only asked for and shown that one. With both, cards are in the script named, and single words can be given the other.',
  'settings.pronunciation': 'Pronunciation',
  'settings.pronunciationMainland': 'Mainland China (普通话)',
  'settings.pronunciationTaiwan': 'Taiwan (國語)',
  'settings.pronunciationBoth': 'Accept both',
  'settings.pronunciationHint':
    'A few words are read differently in Taiwan and on the mainland: <span lang="zh-Hant-TW">星期</span> is xīngqí in Taiwan and xīngqī on the mainland (more on <a href="https://en.wikipedia.org/wiki/Taiwanese_Mandarin" target="_blank" rel="noopener">Taiwan\'s Mandarin</a>). The reading you choose is the one shown and tested. With Taiwan, the mainland reading also appears beside it in small print, because dictionaries file words under it. With Accept both, cards show both readings and accept either tone. With Mainland China, Taiwan readings are never shown or asked for.',
  'settings.cardTypes': 'Card types',
  'settings.cardTypeMeaning': 'Meaning: see the word, recall what it means',
  'settings.cardTypePinyin': 'Pinyin: see the word, recall how it is read',
  'settings.cardTypeTone': 'Tone: see the word, give each tone',
  'settings.cardTypeWriting': 'Writing: see the meaning, write the word',
  'settings.sentences': 'Sentences',
  'settings.sentenceReading': 'Reading: see the sentence, recall what it means',
  'settings.sentenceWriting': 'Writing',
  'settings.sentenceWritingWord': 'Fill in the missing word',
  'settings.sentenceWritingSentence': 'Write the whole sentence',
  'settings.sentenceWritingOff': 'No writing cards for sentences',
  'settings.sentencesHint':
    "Sentences are added from a word's page (its example sentence) or on a deck's page. A sentence added without a word to fill in is written whole.",
  'settings.meaningDetail': 'Dictionary meanings',
  'settings.meaningDetailFirst': 'First only',
  'settings.meaningDetailEveryday': 'Everyday',
  'settings.meaningDetailAll': 'All',
  'settings.meaningDetailHint':
    'How much of a dictionary entry is filled in as the meaning when you add a word. You can still edit it before saving.<br /><b>First only:</b> just the first meaning.<br /><b>Everyday:</b> every meaning except those marked for a specialist field, such as "(math.)" or "(law)".<br /><b>All:</b> everything the dictionary lists.',

  'settings.newWordsPerDay': 'New words per day (goal)',
  'settings.gradeButtons': 'Grade buttons',
  'settings.gradeButtonsFour': 'Four: Again, Hard, Good, Easy',
  'settings.gradeButtonsTwo': 'Two: Wrong, Right',
  'settings.gradeButtonsHint': 'How you say how a card went. Two is simpler: Right counts as Good.',
  'settings.lessons': 'In Review, teach before testing',
  'settings.lessonsHint':
    'When a word you already know is to be written for the first time (after changing script, say): its tones, then each stroke shown, then the outline, then from memory. Words in the Learn tab are always taught this way.',
  'settings.leechAfter': 'A card is a leech after',
  'settings.leechInput': 'Times forgotten before a card is a leech',
  'settings.leechHint':
    'times forgotten. A leech is a card you keep getting wrong. Words, in the menu, can list your leeches, so you can do something about them.',
  'settings.leechAction': 'When a card becomes a leech',
  'settings.leechActionFlag': 'Point it out',
  'settings.leechActionSuspend': 'Suspend it',
  'settings.leechActionHint': "A suspended card no longer comes up in Review, until you resume it, on the word's page.",
  'settings.streaks': 'Count a streak of days studied',
  'settings.streaksHint': 'A pop-up the first time each day that you have studied enough, and a line at the end of Review.',
  // The streak's goal is one sentence with two number boxes in it, in three pieces.
  'settings.streakGoalStart': 'A day counts after',
  'settings.streakGoalMiddle': 'cards reviewed or',
  'settings.streakGoalEnd': 'words learned.',
  'settings.streakCardsInput': 'Cards to review for a day to count',
  'settings.streakWordsInput': 'Words to learn for a day to count',

  'settings.handwriting': 'Handwriting',
  'settings.handwritingRaw': 'Keep my own strokes (raw input)',
  'settings.handwritingSnap': 'Snap to the printed strokes',
  'settings.strokeCount': 'Show the stroke count in Review',
  'settings.strokeCountHint':
    'How many strokes the character has, as in "3/7". It is always shown in Learn and Free practice; in Review it is a hint, so it is off unless you want it.',
  'settings.hintCounts': 'A character written with a hint counts as',
  'settings.hintMissed': 'Missed',
  'settings.hintHard': 'Passed, the word Hard at best',
  'settings.hintHint':
    'For a hint, hold your finger or pen still on the writing area: the next stroke flashes green. It also comes by itself after three misses on a stroke. To start a character again, swipe up quickly on the writing area.',
  'settings.tryWriting': 'Try writing with these settings',
  'settings.tryWritingHint':
    'Free practice: write any character or word, or try any kind of card. Nothing is saved, and your schedule is not touched.',

  'settings.look': 'Look',
  'settings.lookLight': 'Light',
  'settings.lookDark': 'Dark',
  'settings.lookAuto': 'Follow device theme',
  'settings.sound': 'Sound',
  'settings.soundAuto': 'By itself when the answer shows, and when I tap the loudspeaker',
  'settings.soundTap': 'Only when I tap the loudspeaker',
  'settings.soundOff': 'Off',
  'settings.soundHint':
    "Most words are spoken from a recording; others are put together from recorded syllables, or read by your device's own Chinese voice if it has one. A recording needs a connection the first time it is played.",
  'settings.volume': 'Volume',
  'settings.volumeInput': 'Volume of the spoken words',
  'settings.volumeHint': 'How loud words are spoken, beside whatever else your device is playing.',

  'settings.dataWhere':
    'Your words and progress are kept only in this browser, on this device. Nothing is sent anywhere and there is no account, so a backup file is the only other copy.',
  'settings.exportBackup': 'Export backup',
  'settings.stopBackupReminders': 'Stop backup reminders',
  'settings.importBackup': 'Import backup',
  'settings.keepingWords': 'Keeping your words',
  'settings.checking': 'Checking…',
  'settings.installApp': 'Install the app',
  'settings.allowStorage': 'Allow long-term storage',
  'settings.stopKeepReminder': 'Stop the reminder in Review and Learn',
  'settings.offlineUse': 'Offline use',
  'settings.saveAudio': 'Save all recordings for offline use (about 125 MB)',

  'settings.basics': 'Basics of Chinese',
  'settings.introductionAgain': 'Show the introduction again',
  'settings.whatsNew': "What's new",
  'settings.sendFeedback': 'Send feedback',
  'settings.credits': 'Credits and licenses',
  'settings.tips': 'Show a tip the first time each screen is opened',
  'settings.tipsAgain': 'Show all tips again',

  // Settings › For testing (testerSettings.js)
  'testing.swipeReadout': 'Show how each swipe up measured',
  'testing.swipeReadoutHint':
    'After a line drawn upward on the writing area: how far it rose, how much it leaned and how long it took, against what a swipe needs. Only on this device.',
  'testing.pseudoLanguage': 'Show the test language',
  'testing.pseudoLanguageHint':
    'Every text in look-alike letters and a third longer, as other languages often are: text still in plain English has not been made ready for translation. The app starts again when this is changed. Only on this device.',
  'testing.storageReadout': 'Keeping the words: what this browser says',
  'testing.storageReadoutHint': 'Compare it in the installed app and in a browser tab (testerSettings.js).',
  'testing.checkAgain': 'Check again',
  'testing.askNow': 'Ask to keep the words now',
  'testing.yes': 'yes',
  'testing.no': 'no',
  'testing.askedJustNow': 'Asked just now: the browser said {answer}.',
  'testing.browser': 'Browser: {name}.',
  'testing.openedAs': 'Opened as: {how}.',
  'testing.keeps': 'Keeps the words for good: {kept} (asked before on this device: {asked}).',
  'testing.words': 'Words here: {count}.',
  'testing.reminder': 'The reminder in Review and Learn: {shown}.',
  'testing.reminderShown': 'shown',
  'testing.reminderNotShown': 'not shown',
  'testing.brands': "The browser's names: {names}.",
  'testing.chromium': 'Chrome, or another browser built on Chromium',
  'testing.notRecognized': 'not recognized',
  'testing.installed': 'the installed app',
  'testing.webView': "a browser built into another app (such as Discord), with words apart from the browser's",
  'testing.tab': 'a page in the browser (a tab, or a link opened from another app such as Discord)',

  // Keeping the words: what each browser does (storageAdvice.js)
  'storage.installHow': 'open the browser\'s menu and choose "Install app" or "Add to Home screen"',
  'storage.installBelow': 'tap "Install the app" below',
  'storage.bringOver': "Words studied here in Safari don't come along by themselves: use Export backup here, then Import backup in the app.",
  // The advice to make backups; "above" in Settings itself, where Export
  // backup is just above the advice.
  'storage.backupUntilAbove': 'Until then, use Export backup above now and then.',
  'storage.backupUntilSettings': 'Until then, use Export backup in Settings now and then.',
  'storage.backupUseAbove': 'Use Export backup above now and then.',
  'storage.backupUseSettings': 'Use Export backup in Settings now and then.',
  'storage.backupStillAbove': 'Still, use Export backup above now and then.',
  'storage.backupStillSettings': 'Still, use Export backup in Settings now and then.',
  'storage.kept': 'Long-term storage is allowed: the browser will not clear this data to free up space.',
  'storage.cannotAsk': 'This browser has no way to ask for long-term storage. {backup}',
  'storage.firefoxRefused':
    'Firefox has not allowed it. If you chose "Block" or "Not now", click the icon at the left end of the address bar, clear the entry for storing data in persistent storage, and tap the button again. {backup}',
  'storage.firefoxWillAsk': 'Firefox will show a question: may this site store data in persistent storage? Choose "Allow".',
  'storage.chromiumInstalledRefused':
    'This browser has not allowed it yet, although the app is installed. It decides by itself and usually agrees once the app has been used a little; the app asks again each time it starts. {backup}',
  'storage.chromiumInstalled':
    'This browser will not ask you anything: it decides by itself, and usually agrees for an installed app like this one.',
  'storage.chromiumRefused':
    'This browser said no, as it does for an app that is not installed. Install the app ({install}), open it from there, and it will ask again by itself. {backup}',
  'storage.chromium':
    'This browser will not ask you anything: it decides by itself, and says yes for an installed app. So install the app first ({install}) and use it from there: it then asks by itself.',
  'storage.safariInstalledUnconfirmed': 'Safari has not confirmed it, but data of an app on the Home Screen is kept. {backup}',
  'storage.safariInstalled': 'Safari decides by itself. Data of an app on the Home Screen, like this one, is kept.',
  'storage.safariPhone':
    "Safari decides by itself, and it deletes a site's data after about a week without a visit. To prevent that, put the app on the Home Screen (tap Share, or ⋯ then Share, then \"Add to Home Screen\") and use it from there. {bringOver}",
  'storage.safariMac':
    "Safari decides by itself, and it deletes a site's data after about a week without a visit. To prevent that, add the app to the Dock (in Safari's File menu, \"Add to Dock\", on macOS 14 or later) and use it from there. {bringOver}",
  'storage.otherRefused': 'The browser did not allow it. It may once the app is installed: {install}. {backup}',
  'storage.other': 'Your browser may ask you to confirm, or decide by itself.',
  'storage.welcomeKept': 'This browser already keeps them.',
  'storage.welcomeCannotAsk': 'This browser cannot be asked, so use Export backup in Settings now and then.',
  'storage.welcomeChromium': 'This browser keeps the words of an installed app.',
  'storage.welcomeFirefoxPhone':
    "Firefox will ask at the bottom of the screen: choose \"Allow\". For an icon of your own, choose Install in the browser's menu (⋮).",
  'storage.welcomeFirefoxComputer': 'Firefox will ask at the top of the page: choose "Allow".',
  'storage.messageSafariPhone':
    'Safari deletes them after a week without a visit. Add 玉兔中文 to your Home Screen (Share, or ⋯ then Share, then "Add to Home Screen") and study there. To bring your words along, export a backup here and import it there.',
  'storage.messageSafariMac':
    'Safari deletes them after a week without a visit. Add 玉兔中文 to the Dock (File › Add to Dock) and study there. To bring your words along, export a backup here and import it there.',
  'storage.messageCannotAsk': "Your browser may delete them, and it can't be asked not to. Save a backup every week.",
  'storage.messageInstall': "Install 玉兔中文 as an app so your browser doesn't delete them.",
  'storage.messageSettings': "Install 玉兔中文 as an app or save a backup, so your browser doesn't delete them.",
  'storage.messageFirefox': "When Firefox asks, choose Allow so it doesn't delete them.",
  'storage.messageOther': "Tap below so your browser doesn't delete them.",

  // The reminder to keep the words safe, in Review and Learn (storageMessage.js)
  'storageMessage.title': 'Keep your words safe.',
  'storageMessage.keep': 'Keep my words safe',
  'storageMessage.notNow': 'Not now',
  'storageMessage.nextPhone': 'Next: add 玉兔中文 to your Home Screen, open it from there, and use Import backup in its Settings.',
  'storageMessage.nextMac': 'Next: add 玉兔中文 to the Dock, open it from there, and use Import backup in its Settings.',
  'storageMessage.showReminder': 'Show the reminder in Review and Learn again',
  'storageMessage.stopQuestion': 'Stop reminding you to keep your words safe?',
  'storageMessage.stopDetail':
    'This browser may delete your words and progress. If it does and you have no backup, they are gone. The reminder at the end of Review stops; Settings still says how things stand.',
  'storageMessage.stopYes': 'I understand, stop it',

  // Offline use (offline.js)
  'offline.devServer': 'Offline use is switched off while developing (npm run dev).',
  'offline.cannot': 'This browser cannot save the app for offline use.',
  'offline.failed': 'The app could not be saved for offline use.',
  'offline.saved': 'The app is saved on this device.',
  'offline.dataSaved': 'Stroke data and dictionary are saved too.',
  'offline.dataSaving': 'Saving stroke data and dictionary: {percent}%.',
  'offline.audioSaved': 'All recordings are saved too.',
  'offline.audioSaving': 'Saving recordings: {percent}%.',
  'offline.audioOnPlay': 'Recordings of words are kept once played.',

  // Backups (backup.js)
  'backup.notABackup': 'This file is not a backup from this app.',
  'backup.tooNew': 'This backup is format version {version}, but this app reads up to version {newest}. Update the app and try again.',
  'backup.storeMissing': 'The backup is damaged: "{store}" is missing.',
  'backup.recordWithoutKey': 'The backup is damaged: a record in "{store}" has no {key}.',
  'backup.lastReview': 'last review {when}',
  'backup.noReviews': 'no reviews',
  'backup.contents': '{words}, {cards}, {reviews}, {when}',
  'backup.words': { one: '{count} word', other: '{count} words' },
  'backup.cards': { one: '{count} card studied', other: '{count} cards studied' },
  'backup.reviews': { one: '{count} review', other: '{count} reviews' },

  // The menu and the top bar (index.html, main.js)
  'menu.menu': 'Menu',
  'menu.menuBackupDue': 'Menu (time to make a backup, in Settings)',
  'menu.settingsBackupDue': 'Settings (time to make a backup)',
  'menu.review': 'Review',
  'menu.learn': 'Learn',
  'menu.waiting': '{count} waiting',
  'menu.decks': 'Decks',
  'menu.words': 'Words',
  'menu.progress': 'Progress',
  'menu.basics': 'Basics of Chinese',
  'menu.feedback': 'Send feedback',
  'menu.settings': 'Settings',
  'menu.backupDue': 'Time to save a backup of your words, in Settings.',
  // The screen's name in the top bar, beside the menu's own names
  'place.lesson': 'Repeating a lesson',
  'place.practice': 'Free practice',
  'place.practicingWord': 'Practicing a word',
  'place.back': 'Back',
  'place.backTo': 'Back to {place}',
  'place.backToWordPage': "Back to the word's page",
  'place.backToItsPage': 'Back to its page',

  // Free practice (main.js)
  'practice.notInList': '"{text}" is not in the word list, so only Writing can be practiced with it.',
  'practice.noToneCard': "\"{text}\" can't have a tone card: its pinyin doesn't have one syllable per character.",
  'practice.again': 'Again',
  'main.meaning': 'Meaning',
  'main.addingWords': 'Adding words…',

  // Backups in Settings (main.js)
  'backup.saved':
    'Saved to your downloads as {name}. Keep a copy off this device too (a cloud drive, or email it to yourself). To bring it back, here or on a new device, use Import backup.',
  'backup.remindAgain': 'Remind me about backups again',
  'backup.noneYet': 'No backup has been made on this device yet.',
  'backup.lastToday': 'Last backup: today.',
  'backup.lastYesterday': 'Last backup: yesterday.',
  'backup.lastDaysAgo': { one: 'Last backup: {count} day ago.', other: 'Last backup: {count} days ago.' },
  'backup.due': 'Time to export one. The red dot on the menu button is this reminder; it goes away once you have exported one.',
  'backup.remindersOff': 'Backup reminders are off.',
  'backup.stopQuestion': 'Stop the backup reminders?',
  'backup.stopDetail':
    'Your words and progress are kept only in this browser. If it loses them (a cleared browser, a lost phone) and you have no backup, they are gone.',
  'backup.stopYes': 'I understand, stop them',
  'backup.couldNotUse': 'That file could not be used',
  'backup.nothingChanged': '{reason} Nothing was changed.',
  'backup.inBackup': 'In the backup: {contents}.',
  'backup.onDevice': 'On this device now: {contents}.',
  'backup.combineWouldBring': 'Combining would bring this device: {changes}.',
  'backup.combineNothing': 'Combining would change nothing: this device already has everything in the backup.',
  'backup.replaceQuestion': 'Replace everything on this device with the backup?',
  'backup.replaceDetail': 'What is on this device now will be gone. This cannot be undone.',
  'backup.replaceYes': 'Replace everything',

  // Importing a backup (merge.js, index.html)
  'merge.wordsAdded': { one: '{count} new word', other: '{count} new words' },
  'merge.wordsChanged': { one: '{count} word changed on the other device', other: '{count} words changed on the other device' },
  'merge.wordsRemoved': { one: '{count} word removed on the other device', other: '{count} words removed on the other device' },
  'merge.decksAdded': { one: '{count} new deck', other: '{count} new decks' },
  'merge.decksRemoved': { one: '{count} deck deleted on the other device', other: '{count} decks deleted on the other device' },
  'merge.reviewsAdded': { one: '{count} new review', other: '{count} new reviews' },
  'merge.cardsChanged': { one: '{count} card with a new schedule', other: '{count} cards with a new schedule' },
  'merge.settingsChanged': {
    one: '{count} setting changed on the other device',
    other: '{count} settings changed on the other device',
  },
  'import.title': 'Import backup',
  'import.combine': 'Combine with this device',
  'import.replace': 'Replace everything on this device',
  'import.explained':
    '<b>Combine</b> keeps what is on this device and adds what the backup has: for studying on two devices. A backup of this device is saved to your downloads first, in case you want to go back.<br /><b>Replace</b> throws away what is on this device and puts the backup in its place.',
  'common.close': 'Close',
  'common.cancel': 'Cancel',
};
