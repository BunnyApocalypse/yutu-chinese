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
};
