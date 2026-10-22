// Settings in a real browser. Mostly Script and Pronunciation: someone
// learning one script, or mainland pronunciation only, is not asked for or
// shown the rest, on the Decks tab and on cards. Then the Look, raw input,
// saving a backup, and closing the panel. (The hint setting and Card types
// are in review.browser.js, the rest beside what they change.)
//
// Run with: npm run test:browser

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  startApp,
  startBrowsers,
  startWriting,
  writingArea,
  drawStroke,
  loadStrokeData,
  openSettings,
  tap,
  type,
  choose,
  textOf,
  isShown,
  waitUntil,
  addTestWords,
  openDeckPage,
  useAddForm,
  reloadApp,
} from './harness.js';

// Text for "the Decks tab's list has this many rows".
const rows = (count) => `document.querySelectorAll('#word-list li').length === ${count}`;

// One browser, and the steps in order: each builds on the one before.
describe('settings', { concurrency: false }, () => {
  let app;
  let browsers;
  let page;

  // Runs JavaScript in the page with `stores`: the database's stores, by name, open for writing.
  // Returns what `body` leaves in `result`, once the changes are saved.
  const inDatabase = (body) =>
    page.evaluate(`new Promise((resolve, reject) => {
      const opening = indexedDB.open('hanzi-trainer');
      opening.onsuccess = () => {
        const tx = opening.result.transaction(['words', 'cards', 'reviews'], 'readwrite');
        const stores = { words: tx.objectStore('words'), cards: tx.objectStore('cards'), reviews: tx.objectStore('reviews') };
        const result = {};
        ${body}
        tx.oncomplete = () => resolve(JSON.stringify(result));
        tx.onerror = () => reject(tx.error);
      };
    })`).then(JSON.parse);

  // Starts a Free practice card of this kind for a word of the test word list.
  async function practice(word, kind) {
    await tap(page, 'practice-button');
    // Emptied first, so that the new card can be told from the one before,
    // which is still showing until the new one comes.
    await page.evaluate(`document.getElementById('card-face').textContent = ''`);
    await type(page, 'word-input', word);
    await choose(page, 'practice-type', kind);
    await waitUntil(
      page,
      `!document.getElementById('card-face').hidden && document.getElementById('card-face').textContent !== ''`,
      'the card',
    );
  }

  // Taps the card, as a finger would.
  const tapCard = () =>
    page.evaluate(`document.getElementById('card-face').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))`);

  // Gives these tones on a tone card, one per character, and returns the status line at the end.
  async function giveTones(tones) {
    for (const [index, tone] of tones.entries()) {
      await waitUntil(page, `document.getElementById('status').textContent.includes('${index + 1} of ${tones.length}')`);
      await page.evaluate(`document.querySelector('#tone-buttons [data-tone="${tone}"]').click()`);
    }
    await waitUntil(page, `/right|wrong|Not/.test(document.getElementById('status').textContent)`, 'the result');
    return textOf(page, 'status');
  }

  before(async () => {
    app = await startApp();
    browsers = await startBrowsers(app.url, 1);
    await browsers.use(async (thePage) => {
      page = thePage;
    });
    await addTestWords(page);
  });

  after(async () => {
    const errors = browsers?.errors() ?? [];
    browsers?.close();
    await app?.close();
    assert.deepEqual(errors, [], 'the page threw errors');
  });

  it('shows the Taiwan reading and accepts its tone to begin with', async () => {
    await practice('星期', 'pinyin');
    await tapCard();
    assert.match(await textOf(page, 'card-face'), /xīngqī.*Taiwan: xīngqí/);
    await practice('星期', 'tone');
    assert.equal(await giveTones([1, 2]), 'All tones right');
  });

  it('leaves the Taiwan reading out with mainland pronunciation only', async () => {
    await choose(page, 'pronunciation-select', 'mainlandOnly');
    await practice('星期', 'pinyin');
    await tapCard();
    const face = await textOf(page, 'card-face');
    assert.match(face, /xīngqī/);
    assert.doesNotMatch(face, /Taiwan/);
    await practice('星期', 'tone');
    assert.match(await giveTones([1, 2]), /^Not á/);
  });

  it('accepts a neutral tone the dictionary has, and one added to the word', async () => {
    await choose(page, 'pronunciation-select', 'mainland');
    // 知道 is zhīdào in the list; the dictionary also has zhīdao.
    await practice('知道', 'tone');
    assert.equal(await giveTones([1, 5]), 'All tones right');
    assert.match(await textOf(page, 'card-face'), /accepted as a regional or neutral-tone variant of zhīdào/);
    // It has no xīngqi for 星期 ...
    await practice('星期', 'tone');
    assert.match(await giveTones([1, 5]), /^Not a\b/);
    // ... so that is added to the word.
    await openDeckPage(page);
    await type(page, 'word-search', '星期');
    await waitUntil(page, `document.querySelectorAll('#word-list li').length >= 1`);
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await type(page, 'edit-pinyin-also', 'xing1 qi5');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `!document.getElementById('word-dialog').open`, 'the word saved');
    await type(page, 'word-search', '');
    await practice('星期', 'tone');
    assert.equal(await giveTones([1, 5]), 'All tones right');
    await choose(page, 'pronunciation-select', 'mainlandOnly');
  });

  it('asks only for simplified characters when only those are learned', async () => {
    await choose(page, 'script-select', 'simplified');
    await openDeckPage(page);
    await waitUntil(page, `document.getElementById('word-count').textContent !== '0'`, 'the word list');
    // A setting is saved before it takes effect, which takes a moment.
    await waitUntil(page, `document.getElementById('add-traditional').hidden`, 'the traditional box to go');
    assert.equal(await isShown(page, 'add-simplified'), true);
    assert.equal(await isShown(page, 'add-pinyin-taiwan'), false);
    // The one box left is not labeled with a script.
    assert.equal(await page.evaluate(`document.getElementById('add-simplified').placeholder`), 'Word: 汉字, pinyin or English');
    await useAddForm(page, 'add-list-fold');
    assert.doesNotMatch(await textOf(page, 'list-hint'), /traditional, pinyin|Taiwan/);
    await useAddForm(page, 'add-word-fold');

    await type(page, 'add-simplified', '图书馆');
    await waitUntil(page, `document.querySelector('#add-suggestions button') !== null`, 'a dictionary entry');
    const entry = await textOf(page, '#add-suggestions button');
    assert.match(entry, /图书馆/);
    assert.doesNotMatch(entry, /圖書館/);
    await page.evaluate(`document.querySelector('#add-suggestions button').click()`);
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.startsWith('Added 图书馆.')`);
  });

  it('shows the word list and a word in simplified only', async () => {
    await type(page, 'word-search', 'library');
    await waitUntil(page, rows(1));
    const row = await textOf(page, '#word-list li');
    assert.match(row, /^图书馆/);
    assert.doesNotMatch(row, /圖書館/);
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    assert.match(await textOf(page, 'word-dialog-title'), /^图书馆/);
    assert.equal(await page.evaluate(`document.getElementById('edit-pinyin-taiwan').closest('label').hidden`), true);
    await tap(page, 'word-dialog-close');
  });

  it('works out the traditional form of a word typed by hand, and of a list', async () => {
    // 头发 is not tapped in the dictionary; its reading picks 頭髮 over 頭發.
    await type(page, 'add-simplified', '头发');
    await type(page, 'add-pinyin', 'tou2fa5');
    await type(page, 'add-definition', 'hair');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.startsWith('Added 头发.')`);

    await useAddForm(page, 'add-list-fold');
    await type(page, 'list-text', '企鹅\tqi4e2\tpenguin\n孔雀,kong3que4,peacock\n');
    await tap(page, 'check-list-button');
    await waitUntil(page, `document.getElementById('list-report').textContent !== ''`, 'the list report');
    assert.equal(await textOf(page, 'list-report'), "2 new words, 0 you already have, 0 lines that can't be read.");
    await tap(page, 'add-list-button');
    await waitUntil(page, `document.getElementById('list-report').textContent === 'Added 2 words. They wait in Learn.'`);

    // With both scripts learned, both are shown: the traditional forms were stored.
    await choose(page, 'script-select', 'both-traditional');
    for (const [search, characters] of [['library', '圖書館 · 图书馆'], ['hair', '頭髮 · 头发'], ['penguin', '企鵝 · 企鹅']]) {
      await type(page, 'word-search', search);
      await waitUntil(page, `${rows(1)} && document.querySelector('#word-list li').textContent.startsWith('${characters}')`, characters);
    }
    await useAddForm(page, 'add-word-fold');
    assert.equal(await isShown(page, 'add-traditional'), true);
    assert.equal(await page.evaluate(`document.getElementById('add-traditional').placeholder`), 'Traditional 繁體, pinyin or English');
    await useAddForm(page, 'add-list-fold');
    assert.match(await textOf(page, 'list-hint'), /simplified, traditional, pinyin/);
  });

  it('fills in what a list leaves out from the dictionary', async () => {
    // Characters alone; characters and a meaning; characters and pinyin with tone marks.
    await useAddForm(page, 'add-list-fold');
    await type(page, 'list-text', '  熊貓  \n大象, a big elephant\n老虎\tlǎohǔ\n');
    await tap(page, 'check-list-button');
    await waitUntil(page, `document.getElementById('list-report').textContent !== ''`, 'the list report');
    assert.equal(await textOf(page, 'list-report'), "3 new words, 0 you already have, 0 lines that can't be read.");
    await tap(page, 'add-list-button');
    await waitUntil(page, `document.getElementById('list-report').textContent === 'Added 3 words. They wait in Learn.'`);
    const stored = await page.evaluate(`new Promise((resolve) => {
      indexedDB.open('hanzi-trainer').onsuccess = (event) => {
        event.target.result.transaction('words').objectStore('words').getAll().onsuccess = (got) =>
          resolve(got.target.result.filter((word) => ['熊貓', '大象', '老虎'].includes(word.traditional)).map((word) => [word.traditional, word.pinyin, word.definition]).sort());
      };
    })`);
    assert.deepEqual(stored.map(([characters, pinyin]) => [characters, pinyin]), [['大象', 'da4xiang4'], ['熊貓', 'xiong2mao1'], ['老虎', 'lao3hu3']]);
    // The list's own meaning is kept; the others are the dictionary's.
    assert.equal(stored[0][2], 'a big elephant');
    assert.match(stored[1][2], /panda/);
    assert.match(stored[2][2], /tiger/);
  });

  it('hides simplified when only traditional is learned', async () => {
    await choose(page, 'script-select', 'traditional');
    // A setting is saved before it takes effect, which takes a moment.
    await waitUntil(page, `document.getElementById('add-simplified').hidden`, 'the simplified box to go');
    assert.equal(await page.evaluate(`document.getElementById('add-traditional').placeholder`), 'Word: 漢字, pinyin or English');
    await type(page, 'word-search', 'library');
    await waitUntil(page, `${rows(1)} && document.querySelector('#word-list li').textContent.startsWith('圖書館')`);
    assert.doesNotMatch(await textOf(page, '#word-list li'), /图书馆/);
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    assert.equal(await page.evaluate(`document.getElementById('edit-simplified').closest('label').hidden`), true);
    // Saving keeps the simplified form that is out of sight.
    await type(page, 'edit-definition', 'library (building)');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await choose(page, 'script-select', 'both-simplified');
    await type(page, 'word-search', 'building');
    await waitUntil(page, `${rows(1)} && document.querySelector('#word-list li').textContent.startsWith('图书馆 · 圖書館')`);
  });

  it('lets a word have a script of its own while both are learned', async () => {
    await choose(page, 'script-select', 'both-traditional');
    await type(page, 'word-search', 'building');
    await waitUntil(page, `${rows(1)} && document.querySelector('#word-list li').textContent.startsWith('圖書館 · 图书馆')`);
    assert.equal(await isShown(page, 'add-card-script-row'), true);

    // Choosing a script when adding a word leaves only that script's box.
    await type(page, 'add-traditional', '鍵盤');
    await waitUntil(page, `document.querySelector('#add-suggestions button') !== null`, 'a dictionary entry');
    await page.evaluate(`document.querySelector('#add-suggestions button').click()`);
    await choose(page, 'add-card-script', 'simplified');
    assert.equal(await isShown(page, 'add-traditional'), false);
    assert.equal(await page.evaluate(`document.getElementById('add-simplified').value`), '键盘');
    await choose(page, 'add-card-script', 'traditional');
    assert.equal(await isShown(page, 'add-simplified'), false);
    assert.equal(await page.evaluate(`document.getElementById('add-traditional').value`), '鍵盤');
    await choose(page, 'add-card-script', '');
    assert.equal(await isShown(page, 'add-simplified'), true);
    // Typed by hand in simplified: the traditional form is looked up.
    await choose(page, 'add-card-script', 'simplified');
    await type(page, 'add-simplified', '键盘');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.startsWith('Added 键盘 · 鍵盤.')`, 'the word added');
    assert.equal(await isShown(page, 'add-traditional'), true);
    assert.equal(await page.evaluate(`document.getElementById('add-card-script').value`), '');

    // This one word in simplified, in a deck that is otherwise traditional.
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    await choose(page, 'edit-card-script', 'simplified');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.querySelector('#word-list li').textContent.startsWith('图书馆 · 圖書館')`, 'simplified first');
    // Free practice reads the app's own copy of the words, which is read
    // again from the database a moment after the change, after the list
    // above shows it: so it is asked until it has caught up.
    for (let attempt = 0; attempt < 20; attempt++) {
      await practice('圖書館', 'meaning');
      if ((await textOf(page, 'card-face')).startsWith('图书馆')) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.match(await textOf(page, 'card-face'), /^图书馆/);
    // The card says it is the odd one out, on every kind of card.
    assert.equal(await textOf(page, 'script-flag'), 'simp. 简体');
    // Free practice writes what was typed, so there only the simplified form is flagged.
    await choose(page, 'practice-type', 'writing');
    await waitUntil(page, `document.getElementById('stroke-count').textContent.startsWith('1/')`, 'the writing card');
    assert.equal(await textOf(page, 'script-flag'), '');
    await type(page, 'word-input', '图书馆');
    await page.evaluate(`document.getElementById('word-form').requestSubmit()`);
    await waitUntil(page, `!document.getElementById('script-flag').hidden`, 'the flag');
    assert.equal(await textOf(page, 'script-flag'), 'simp. 简体');
    await practice('星期', 'meaning');
    assert.match(await textOf(page, 'card-face'), /^星期/);
    assert.equal(await textOf(page, 'script-flag'), '');

    // With one script learned there is no such choice, and the word follows the setting.
    await choose(page, 'script-select', 'traditional');
    await practice('圖書館', 'meaning');
    await waitUntil(page, `document.getElementById('card-face').textContent.startsWith('圖書館')`, 'the card in traditional');
    assert.equal(await textOf(page, 'script-flag'), '');
    await openDeckPage(page);
    await waitUntil(page, `document.getElementById('add-card-script-row').hidden`, 'the choice to go');
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    assert.equal(await page.evaluate(`document.getElementById('edit-card-script').closest('label').hidden`), true);
    await tap(page, 'word-dialog-close');
  });

  it('files cards and reviews under a corrected traditional form', async () => {
    // A simplified-only learner adds a word the dictionary does not have,
    // so its traditional form is stored as the simplified one.
    await choose(page, 'script-select', 'simplified');
    await openDeckPage(page);
    await waitUntil(page, `document.getElementById('add-traditional').hidden`, 'the traditional box to go');
    await type(page, 'add-simplified', '书虫们');
    await type(page, 'add-pinyin', 'shu1chong2men5');
    await type(page, 'add-definition', 'bookworms');
    await page.evaluate(`document.getElementById('add-word-form').requestSubmit()`);
    await waitUntil(page, `document.getElementById('add-word-note').textContent.startsWith('Added 书虫们.')`);
    // ... and has studied it: a writing and a meaning card, reviewed in simplified.
    await inDatabase(`
      const id = '书虫们|shu1chong2men5';
      for (const type of ['writing', 'meaning']) {
        stores.cards.put({ id: id + '#' + type, wordId: id, type, due: Date.now() + 1e9, firstReviewedAt: 1, lastReviewedAt: 1, fsrsState: {} });
        stores.reviews.put({ id: 'test-' + type, cardId: id + '#' + type, wordId: id, type, time: 1, grade: 3, script: 'simplified' });
      }
    `);

    // Switching to traditional, they correct the traditional form.
    await choose(page, 'script-select', 'both-traditional');
    await type(page, 'word-search', 'bookworms');
    await waitUntil(page, `${rows(1)} && !document.getElementById('edit-traditional').closest('label').hidden`);
    await page.evaluate(`document.querySelector('#word-list li button').click(); document.getElementById('word-page-edit').click()`);
    assert.equal(await page.evaluate(`document.getElementById('edit-traditional').value`), '书虫们');
    await type(page, 'edit-traditional', '書蟲們');
    await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
    await waitUntil(page, `document.querySelector('#word-list li').textContent.startsWith('書蟲們 · 书虫们')`, 'the corrected word');
    // Still a word that has been learned, not one that is waiting.
    assert.doesNotMatch(await textOf(page, '#word-list li'), /waiting$/);

    const stored = await inDatabase(`
      stores.words.getAll().onsuccess = (event) => { result.words = event.target.result.filter((word) => word.definition === 'bookworms').map((word) => word.id); };
      stores.cards.getAll().onsuccess = (event) => { result.cards = event.target.result.filter((card) => card.wordId.includes('shu1chong2men5')).map((card) => card.id).sort(); };
      stores.reviews.getAll().onsuccess = (event) => { result.reviews = event.target.result.filter((review) => review.id.startsWith('test-')).map((review) => review.wordId + ' ' + review.cardId).sort(); };
    `);
    assert.deepEqual(stored.words, ['書蟲們|shu1chong2men5']);
    // The writing card was learned in simplified, so that is where it is filed;
    // the traditional one is still to be learned.
    assert.deepEqual(stored.cards, ['書蟲們|shu1chong2men5#meaning', '書蟲們|shu1chong2men5#writing#simplified']);
    assert.deepEqual(stored.reviews, [
      '書蟲們|shu1chong2men5 書蟲們|shu1chong2men5#meaning',
      '書蟲們|shu1chong2men5 書蟲們|shu1chong2men5#writing',
    ]);
  });

  it('corrects a word from the answer page in Review', async () => {
    const dialogOpen = `document.getElementById('word-dialog').open`;
    const gradesShown = `!document.getElementById('grade-row').hidden`;
    const save = async () => {
      await page.evaluate(`document.getElementById('word-dialog-form').requestSubmit()`);
      await waitUntil(page, `!${dialogOpen}`, 'the panel to close');
    };

    // The next card is a pinyin card: tap to see the answer. (Each word's new
    // cards start at a different kind, startingTypeFirst; this word's start
    // at its tone card, so that one is answered long ago.)
    await inDatabase(`
      const id = '書蟲們|shu1chong2men5';
      stores.cards.put({ id: id + '#tone', wordId: id, type: 'tone', due: Date.now() + 1e9, firstReviewedAt: 1, lastReviewedAt: 1, fsrsState: {} });
    `);
    await reloadApp(page);
    // Free practice starts a card of its own the first time it is opened
    // after a reload, a moment later; let it, or it would take the place of
    // the one a later step starts there (as addTestWords does).
    await tap(page, 'practice-button');
    await waitUntil(page, `document.getElementById('stroke-count').textContent.startsWith('1/') && !document.getElementById('writing-area').hasAttribute('data-busy')`, 'Free practice');
    await tap(page, 'review-tab');
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('Tap to show')`, 'a card to reveal');
    assert.equal(await isShown(page, 'edit-word-button'), false);
    await tapCard();
    await waitUntil(page, gradesShown, 'the grades');

    // The meaning is corrected: the answer stays up, still to be graded.
    await tap(page, 'edit-word-button');
    await waitUntil(page, dialogOpen, 'the panel');
    await type(page, 'edit-definition', 'a corrected meaning');
    await save();
    // (The card hears of the panel closing a moment after it has closed.)
    await waitUntil(page, `document.getElementById('card-face').textContent.includes('a corrected meaning')`, 'the corrected meaning on the card');
    assert.equal(await page.evaluate(gradesShown), true);

    // The pinyin is corrected: the card is asked again, with the new reading.
    await tap(page, 'edit-word-button');
    await waitUntil(page, dialogOpen, 'the panel');
    const pinyin = await page.evaluate(`document.getElementById('edit-pinyin').value`);
    await type(page, 'edit-pinyin', pinyin.slice(0, -1) + (pinyin.endsWith('2') ? '3' : '2'));
    await save();
    await waitUntil(page, `!${gradesShown} && document.getElementById('card-face').textContent.includes('Tap to show')`, 'the card again');
    assert.equal(await isShown(page, 'edit-word-button'), false);
    await tapCard();
    await waitUntil(page, gradesShown, 'the grades');
    assert.match(await textOf(page, 'card-face'), /a corrected meaning/);

    // Graded, the card is filed under the corrected word, which counts as learned.
    await page.evaluate(`document.querySelector('#grade-row button.primary').click()`);
    // The grades go once the review is saved and the next card is up.
    await waitUntil(page, `!${gradesShown}`, 'the review to be saved');
    await openDeckPage(page);
    await type(page, 'word-search', 'a corrected meaning');
    await waitUntil(page, rows(1));
    const row = await textOf(page, '#word-list li');
    assert.doesNotMatch(row, /waiting$/);
    assert.doesNotMatch(row, new RegExp(pinyin));
  });

  it('follows the device\'s light or dark look, unless the Look setting says otherwise', async () => {
    const background = () => page.evaluate(`getComputedStyle(document.body).backgroundColor`);
    const LIGHT = 'rgb(241, 233, 212)';
    const DARK = 'rgb(29, 33, 32)';
    // (The DevTools protocol can make the page believe the device is set to dark.)
    const device = (value) =>
      page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
    const look = (value) =>
      page.evaluate(`document.querySelector('input[name="settings-theme"][value="${value}"]').click()`);
    assert.equal(await page.evaluate(`document.querySelector('input[name="settings-theme"]:checked').value`), 'auto');
    await device('dark');
    await waitUntil(page, `getComputedStyle(document.body).backgroundColor === '${DARK}'`, 'the dark look');
    await look('light');
    assert.equal(await background(), LIGHT);
    await device('light');
    await look('dark');
    assert.equal(await background(), DARK);
    // The browser's bar on a phone takes the page's color too.
    assert.equal(await page.evaluate(`document.querySelector('meta[name="theme-color"]').content`), '#1d2120');
    await look('auto');
    assert.equal(await background(), LIGHT);
    await device('');
  });

  it('uses OpenDyslexic for the interface when chosen, and the device font again after', async () => {
    await choose(page, 'font-select', 'dyslexic');
    await waitUntil(
      page,
      `document.documentElement.dataset.font === 'dyslexic' && [...document.fonts].some((face) => face.family === 'OpenDyslexic' && face.status === 'loaded')`,
      'the font',
    );
    assert.match(await page.evaluate(`getComputedStyle(document.body).fontFamily`), /^OpenDyslexic/);
    await choose(page, 'font-select', 'system');
    await waitUntil(page, `document.documentElement.dataset.font === undefined`, 'the device font');
  });

  it('closes Settings with a tap beside the panel, not with a tap on it', async () => {
    const isOpen = `document.getElementById('settings-panel').open`;
    const tapAt = async (x, y) => {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
      }
    };
    await tap(page, 'settings-button');
    await waitUntil(page, isOpen, 'Settings');
    // On the panel's own edge, inside it: it stays.
    const box = await page.evaluate(`(() => { const box = document.getElementById('settings-panel').getBoundingClientRect(); return { x: box.x, y: box.y }; })()`);
    await tapAt(box.x + 4, box.y + 4);
    assert.equal(await page.evaluate(isOpen), true);
    // On the dimmed page above it: it closes.
    await tapAt(box.x + 4, box.y / 2);
    await waitUntil(page, `!${isOpen}`, 'Settings to close');
  });

  it('keeps drawn strokes on screen with raw input, and shows the printed ones when snapping', async () => {
    const drawn = `document.querySelectorAll('#writing-area .drawn-strokes path').length`;
    // Writes the first stroke of 十 (the same in both scripts) in Free practice.
    const writeFirstStroke = async () => {
      await tap(page, 'practice-button');
      await startWriting(page, '十');
      const area = await writingArea(page);
      assert.equal(await drawStroke(page, area, loadStrokeData('十').medians[0]), '2/2 · No mistakes');
    };
    // Raw input is the default.
    assert.equal(await page.evaluate(`document.getElementById('handwriting-select').value`), 'raw');
    await writeFirstStroke();
    assert.equal(await page.evaluate(drawn), 1);

    await openSettings(page, 'settings-writing');
    await choose(page, 'handwriting-select', 'snap');
    await tap(page, 'settings-close');
    // The setting is saved before it takes effect, so a stroke is written
    // again until it is kept off the screen.
    let kept = 1;
    for (let attempt = 0; attempt < 5 && kept !== 0; attempt++) {
      await writeFirstStroke();
      kept = await page.evaluate(drawn);
    }
    assert.equal(kept, 0, 'the drawn stroke stayed on screen');

    await openSettings(page, 'settings-writing');
    await choose(page, 'handwriting-select', 'raw');
    await tap(page, 'settings-close');
  });

  it('saves a backup of everything as a file, and says when', async () => {
    // The file is caught on its way to the browser's downloads.
    await page.evaluate(`(() => {
      URL.createObjectURL = (blob) => {
        window.savedBackup = blob;
        return 'blob:caught';
      };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function () {
        window.savedName = this.download;
      };
    })()`);
    await openSettings(page, 'settings-data');
    assert.match(await textOf(page, 'backup-status'), /^No backup has been made on this device yet\./);
    await tap(page, 'export-button');
    await waitUntil(page, `window.savedBackup !== undefined && window.savedName !== undefined`, 'the backup file');
    assert.match(await page.evaluate('window.savedName'), /^yutu-chinese-backup-\d{4}-\d\d-\d\d-\d{4}\.json$/);
    const backup = JSON.parse(await page.evaluate('window.savedBackup.text()'));
    assert.equal(backup.format, 'hanzi-trainer-backup');
    const words = await page.evaluate(`document.getElementById('word-count').textContent`);
    assert.equal(backup.words.length, Number(words));
    assert.ok(backup.reviews.length > 0, 'the reviews are in the backup');
    await waitUntil(page, `document.getElementById('backup-status').textContent.startsWith('Last backup: today.')`, 'the time of the backup');
    // It says where the file went and what it is for.
    assert.equal(await isShown(page, 'export-done'), true);
    const said = await textOf(page, 'export-done');
    assert.ok(said.includes(await page.evaluate('window.savedName')), said);
    assert.match(said, /off this device.*Import backup/);
    // And, in its own line, whether the browser keeps the data.
    assert.match(await textOf(page, 'keep-data-status'), /\S/);
    assert.doesNotMatch(await textOf(page, 'offline-status'), /long-term storage/i);
    await tap(page, 'settings-close');
  });

  it('says under "For testing" what the browser says about keeping the words', async () => {
    await openSettings(page, 'settings-testing');
    const words = await page.evaluate(`document.getElementById('word-count').textContent`);
    await waitUntil(page, `document.getElementById('storage-readout').textContent.includes('Words here: ${words}.')`, 'the readout');
    const said = await textOf(page, 'storage-readout');
    assert.match(said, /Browser: Chrome, or another browser built on Chromium\./);
    assert.match(said, /Opened as: a page in the browser/);
    assert.match(said, /Keeps the words for good: (yes|no)/);
    assert.match(said, /The reminder in Review and Learn: (shown|not shown)\./);
    // Asking says what the browser answered.
    await tap(page, 'storage-readout-ask');
    await waitUntil(page, `document.getElementById('storage-readout').textContent.startsWith('Asked just now: the browser said')`, 'the answer');
    await tap(page, 'settings-close');
  });

  it('opens a tab that was tapped before the app had started', async () => {
    // Makes every page loaded from now on tap Free practice as soon as it has
    // been read, which is before the app has opened its database.
    // Page.enable switches on the part of the DevTools protocol the next command belongs to.
    await page.send('Page.enable');
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `document.addEventListener('DOMContentLoaded', () => document.getElementById('practice-button').click())`,
    });
    await page.evaluate('window.loadedBefore = true');
    await page.send('Page.reload');
    // The page is briefly gone while it loads, so asking it can fail; keep trying.
    let started = false;
    for (let attempt = 0; attempt < 100 && !started; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      started = await page
        .evaluate(`!window.loadedBefore &&
          document.getElementById('practice-button').classList.contains('selected') &&
          document.getElementById('stroke-count').textContent.startsWith('1/')`)
        .catch(() => false);
    }
    assert.ok(started, 'Free practice did not open');
  });
});
