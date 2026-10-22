// The Progress tab (roadmap, "near-term"; the owner chose each part on
// 2026-10-19, from pictures of two layouts): today in four numbers, the
// cards by stage, then a range (Month, 3 months, Year, All, as in Anki) for
// the streak with its calendar, the time studied, and words and characters
// over time. The numbers come from progress.js; this file draws them.
//
// The charts are drawn with plain elements and SVG, no library. Tapping a
// day or a bar shows its numbers on the line above the chart (the owner:
// yes), where a finger doesn't cover them; with a keyboard, the chart takes
// the focus and the arrow keys move along it. Screen readers hear the line
// change (aria-live).

import { getAll, getSetting, setSetting } from './db.js';
import {
  RANGES,
  STAGES,
  cardStages,
  todayStats,
  timeByDay,
  rangeDays,
  barSize,
  groupDays,
  growthByDay,
  growthOver,
} from './progress.js';
import { studyByDay, streakAt } from './streak.js';
import { CARD_TYPES } from './session.js';
import { scriptFor } from './words.js';
import { langFor } from './lang.js';
import { t, formatDate, formatNumber, formatList } from './text.js';

// The names shown for the kinds of card and the stages.
// (Keys of their text, src/text/en.js.)
const TYPE_NAMES = {
  meaning: 'progress.typeMeaning',
  pinyin: 'progress.typePinyin',
  tone: 'progress.typeTone',
  writing: 'progress.typeWriting',
};
const STAGE_NAMES = {
  new: 'progress.stageNew',
  learning: 'progress.stageLearning',
  young: 'progress.stageYoung',
  mature: 'progress.stageMature',
};
const STAGE_COUNTS = {
  new: 'progress.stageNewCount',
  learning: 'progress.stageLearningCount',
  young: 'progress.stageYoungCount',
  mature: 'progress.stageMatureCount',
};
// "+19 words and +12 characters in the last 30 days."
const GREW = {
  month: 'progress.grewMonth',
  months3: 'progress.grew3Months',
  year: 'progress.grewYear',
  all: 'progress.grewAll',
};
// Under the total time of the range.
const TOTAL_NAMES = {
  month: 'progress.totalMonth',
  months3: 'progress.total3Months',
  year: 'progress.totalYear',
  all: 'progress.totalAll',
};

// "Oct 19", from a day's name such as "2026-10-19".
function dateOf(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
}
const shortDate = (key) => formatDate(dateOf(key), { month: 'short', day: 'numeric' });
const longDate = (key) => formatDate(dateOf(key), { weekday: 'short', month: 'short', day: 'numeric' });
const monthName = (key, long = false) =>
  formatDate(dateOf(key), long ? { month: 'long', year: 'numeric' } : { month: 'short' });

// "14 min", "2 h 5 min".
function duration(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) {
    return t('progress.minutes', { minutes });
  }
  const rest = minutes % 60;
  const hours = Math.floor(minutes / 60);
  return rest ? t('progress.hoursMinutes', { hours, minutes: rest }) : t('progress.hours', { hours });
}

// The element for one tag, with its class and text.
function make(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text) {
    element.textContent = text;
  }
  return element;
}

// Makes `chart` answer taps and arrow keys: `count` places along it (days or
// bars), `placeAt(event)` the one under a tap, and `choose(index)` shows it.
function makeExplorable(chart, count, placeAt, choose) {
  let chosen = null;
  const pick = (index) => {
    chosen = Math.max(0, Math.min(count - 1, index));
    choose(chosen);
  };
  chart.tabIndex = 0;
  chart.addEventListener('click', (event) => {
    const index = placeAt(event);
    if (index !== null) {
      pick(index);
    }
  });
  // With a mouse, resting on a place shows it too.
  chart.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') {
      const index = placeAt(event);
      if (index !== null && index !== chosen) {
        pick(index);
      }
    }
  });
  chart.addEventListener('keydown', (event) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -count, End: count }[event.key];
    if (step !== undefined) {
      event.preventDefault();
      pick(chosen === null ? count - 1 : chosen + step);
    }
  });
}

// The index of the place under a tap, for places side by side across `element`.
function placeAcross(element, count, event) {
  const box = element.getBoundingClientRect();
  return Math.max(0, Math.min(count - 1, Math.floor(((event.clientX - box.left) / box.width) * count)));
}

// panel:        the tab's <section>
// getSettings:  () → the settings object (settings.js)
// hasCardType:  (word, type) → true if the word can have that card (review.js)
export function createProgressPanel({ panel, getSettings, hasCardType }) {
  const parts = {
    today: panel.querySelector('#progress-today'),
    stages: panel.querySelector('#progress-stages'),
    range: panel.querySelector('#progress-range'),
    daysTitle: panel.querySelector('#progress-days-title'),
    days: panel.querySelector('#progress-days'),
    time: panel.querySelector('#progress-time'),
    growth: panel.querySelector('#progress-growth'),
    apart: panel.querySelector('#progress-apart'),
    apartLabel: panel.querySelector('#progress-apart-label'),
    heading: panel.querySelector('.progress-heading h3'),
  };
  let range = 'month';
  // What was read from the database when the tab was opened.
  let data = null;

  for (const { id, name } of RANGES) {
    const button = make('button', '', t(name));
    button.type = 'button';
    button.dataset.range = id;
    button.addEventListener('click', () => {
      range = id;
      drawRanged();
    });
    parts.range.append(button);
  }

  parts.apart.addEventListener('change', async () => {
    await setSetting('charactersApart', parts.apart.checked);
    drawGrowth();
  });

  // The growth chart is as wide as its box, so it is drawn again when the
  // window changes size (a phone turned sideways).
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!panel.hidden && data) {
        drawGrowth();
      }
    }, 150);
  });

  async function show() {
    panel.hidden = false;
    const [words, cardList, reviews] = await Promise.all([getAll('words'), getAll('cards'), getAll('reviews')]);
    const settings = getSettings();
    const study = studyByDay(reviews, words);
    data = {
      words,
      cards: new Map(cardList.map((card) => [card.id, card])),
      reviews,
      settings,
      study,
      time: timeByDay(reviews, words),
      now: Date.now(),
      firstKey: [...study.keys()].sort()[0] ?? null,
    };
    parts.apart.checked = await getSetting('charactersApart', false);
    drawToday();
    drawStages();
    drawRanged();
  }

  function drawToday() {
    const today = todayStats(data.reviews, data.words, data.now);
    const tiles = [
      [formatNumber(today.cards), t('progress.cardsReviewed', { count: today.cards })],
      [formatNumber(today.words), t('progress.wordsLearned', { count: today.words })],
      [duration(today.time), t('progress.studied')],
      [
        today.reviews ? t('progress.percent', { percent: Math.round((today.right / today.reviews) * 100) }) : '–',
        t('progress.answersRight'),
      ],
    ];
    parts.today.replaceChildren(
      ...tiles.map(([number, label]) => {
        const tile = make('div', 'progress-tile');
        tile.append(make('b', '', number), make('span', '', label));
        return tile;
      }),
    );
  }

  // One bar of stages, new to mature, with what it shows in words for
  // screen readers.
  function stageBar(counts) {
    const bar = make('div', 'stage-bar');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', formatList(STAGES.map((stage) => t(STAGE_COUNTS[stage], { count: counts[stage] }))));
    for (const stage of STAGES) {
      if (counts[stage] > 0) {
        const part = make('i', `stage-${stage}`);
        part.style.flexGrow = counts[stage];
        bar.append(part);
      }
    }
    return bar;
  }

  function drawStages() {
    const { settings } = data;
    const types = CARD_TYPES.filter((type) => settings.enabledTypes.includes(type));
    const stages = cardStages(data.words, data.cards, {
      types,
      hasCardType,
      scriptOf: (word) => scriptFor(word, settings),
    });
    const row = (name, counts, total, className = '') => {
      const line = make('div', `stage-row ${className}`);
      line.append(make('span', '', name), stageBar(counts), make('span', 'stage-total', String(total)));
      return line;
    };
    const legend = make('div', 'progress-legend');
    for (const stage of STAGES) {
      legend.append(make('span', `key-stage-${stage}`, t(STAGE_NAMES[stage])));
    }
    parts.stages.replaceChildren(
      ...stages.rows.map(({ type, counts, total }) => row(t(TYPE_NAMES[type]), counts, total)),
      row(t('progress.allCards'), stages.all.counts, stages.all.total, 'stage-all'),
      legend,
      make('p', 'hint', t('progress.stagesExplained')),
    );
  }

  // The parts that follow the range.
  function drawRanged() {
    for (const button of parts.range.children) {
      button.setAttribute('aria-pressed', String(button.dataset.range === range));
    }
    drawDays();
    drawTime();
    drawGrowth();
  }

  // A line in a chart's box that says what was tapped.
  function readout(text) {
    const line = make('p', 'progress-readout', text);
    line.setAttribute('aria-live', 'polite');
    return line;
  }

  function drawDays() {
    const { settings, study } = data;
    const keys = rangeDays(range, data.now, data.firstKey);
    const activity = (key) => {
      const day = study.get(key);
      return day ? day.cards + day.words : 0;
    };
    const most = Math.max(1, ...keys.map(activity));
    const level = (key) => (activity(key) === 0 ? 0 : Math.ceil((activity(key) / most) * 4));
    const content = [];
    // The streak, with streaks on; just the days studied without (a nudge
    // that can be switched off, the owner, 2026-10-19).
    parts.daysTitle.textContent = t(settings.streaks ? 'progress.streak' : 'progress.daysStudied');
    if (settings.streaks) {
      const streak = streakAt(study, data.now, { cards: settings.streakCards, words: settings.streakWords });
      const line = make('div', 'progress-big-line');
      line.append(
        make('b', '', t('progress.days', { count: streak.current })),
        make('span', '', t('progress.inARow', { count: streak.best })),
      );
      content.push(line);
    }
    const said = readout(t('progress.tapDay'));
    // A month as a calendar, a row a week from Monday, with the dates; a
    // longer range as a strip of small squares, a column a week, as in Anki.
    const asCalendar = keys.length <= 31;
    const calendar = make('div', asCalendar ? 'progress-calendar month' : 'progress-calendar strip');
    calendar.setAttribute('aria-label', t('progress.daysStudied'));
    const blanks = (dateOf(keys[0]).getDay() + 6) % 7;
    const cells = [];
    for (let blank = 0; blank < blanks; blank++) {
      calendar.append(make('i', 'blank'));
    }
    keys.forEach((key, index) => {
      const cell = make('i', `level-${level(key)}${index === keys.length - 1 ? ' today' : ''}`);
      if (asCalendar) {
        cell.textContent = key.endsWith('-01') ? t('progress.firstOfMonth', { month: monthName(key) }) : formatNumber(dateOf(key).getDate());
      }
      cells.push(cell);
      calendar.append(cell);
    });
    if (asCalendar) {
      const weekdays = make('div', 'progress-weekdays');
      weekdays.setAttribute('aria-hidden', 'true');
      // Monday to Sunday in a letter or two, as the language writes them
      // (January 1, 2024 was a Monday).
      for (let day = 1; day <= 7; day++) {
        weekdays.append(make('span', '', formatDate(new Date(2024, 0, day, 12), { weekday: 'narrow' })));
      }
      content.push(said, weekdays, calendar);
    } else {
      calendar.style.gridTemplateColumns = `repeat(${Math.ceil((blanks + keys.length) / 7)}, 1fr)`;
      content.push(said, calendar);
    }
    makeExplorable(
      calendar,
      keys.length,
      (event) => {
        const cell = event.target.closest('i');
        const index = cells.indexOf(cell);
        return index >= 0 ? index : null;
      },
      (index) => {
        cells.forEach((cell, each) => cell.classList.toggle('chosen', each === index));
        const key = keys[index];
        const day = study.get(key) || { cards: 0, words: 0 };
        const time = data.time.get(key);
        said.textContent =
          day.cards + day.words === 0
            ? t('progress.nothingStudied', { date: longDate(key) })
            : t(time ? 'progress.dayStudiedTime' : 'progress.dayStudied', {
                date: longDate(key),
                cards: t('progress.dayCards', { count: day.cards }),
                words: t('progress.dayWordsLearned', { count: day.words }),
                time: time ? duration(time) : '',
              });
      },
    );
    const scale = make('div', 'progress-scale');
    scale.setAttribute('aria-hidden', 'true');
    scale.append(t('progress.fewer'));
    for (let each = 0; each <= 4; each++) {
      scale.append(make('i', `level-${each}`));
    }
    scale.append(t('progress.moreCards'));
    const studied = keys.filter((key) => activity(key) > 0).length;
    content.push(scale, make('p', 'hint', t('progress.studiedOn', { studied, count: keys.length })));
    parts.days.replaceChildren(...content);
  }

  function drawTime() {
    const keys = rangeDays(range, data.now, data.firstKey);
    const size = barSize(keys.length);
    const groups = groupDays(keys, size).map((group) => ({
      ...group,
      ms: group.keys.reduce((total, key) => total + (data.time.get(key) || 0), 0),
    }));
    // Minutes, or hours once a bar holds two hours or more.
    const most = Math.max(...groups.map((group) => group.ms));
    const inHours = most >= 2 * 3600000;
    const unit = inHours ? 3600000 : 60000;
    // The top of the scale: twice a round step, at least the tallest bar.
    const steps = inHours ? [1, 1.5, 2, 3, 5, 10, 15, 20, 30, 50, 100] : [1, 2, 3, 5, 10, 15, 20, 30, 45, 60];
    const step = steps.find((each) => each * 2 * unit >= most) ?? steps[steps.length - 1];
    const top = step * 2 * unit;
    const label = (value) => (inHours ? t('progress.hours', { hours: value }) : formatNumber(value));

    const chart = make('div', 'time-chart');
    const axis = make('div', 'time-axis');
    axis.setAttribute('aria-hidden', 'true');
    for (const [value, place] of [[step * 2, 0], [step, 50], [0, 100]]) {
      const tick = make('span', '', label(value));
      tick.style.top = `${place}%`;
      axis.append(tick);
    }
    const plot = make('div', 'time-plot');
    plot.setAttribute('aria-label', t('progress.timeStudied'));
    const bars = groups.map((group) => {
      const bar = make('i');
      bar.style.height = `${(group.ms / top) * 100}%`;
      plot.append(bar);
      return bar;
    });
    // Three dates under the bars: the first, the middle and the last.
    const dates = make('div', 'time-dates');
    dates.setAttribute('aria-hidden', 'true');
    const nameOf = (group) => (size === 'month' ? monthName(group.keys[0]) : shortDate(group.keys[0]));
    const marked = [...new Set([0, Math.floor((groups.length - 1) / 2), groups.length - 1])];
    for (const index of marked) {
      dates.append(make('span', '', size === 'day' && index === groups.length - 1 ? t('progress.today') : nameOf(groups[index])));
    }
    chart.append(axis, plot, dates);

    const said = readout(t('progress.tapBar'));
    makeExplorable(
      plot,
      groups.length,
      (event) => placeAcross(plot, groups.length, event),
      (index) => {
        bars.forEach((bar, each) => bar.classList.toggle('chosen', each === index));
        const group = groups[index];
        const when =
          size === 'day'
            ? longDate(group.keys[0])
            : size === 'week'
              ? t('progress.weekSpan', { from: shortDate(group.keys[0]), to: shortDate(group.keys[group.keys.length - 1]) })
              : monthName(group.keys[0], true);
        said.textContent = t('progress.barTime', { when, time: duration(group.ms) });
      },
    );

    const total = groups.reduce((sum, group) => sum + group.ms, 0);
    const daysWithTime = keys.filter((key) => data.time.get(key)).length;
    const allTime = [...data.time.values()].reduce((sum, ms) => sum + ms, 0);
    const totals = make('div', 'time-totals');
    for (const [number, name] of [
      [duration(total), t(TOTAL_NAMES[range])],
      // Over the days studied only, not every day of the range.
      [duration(daysWithTime ? total / daysWithTime : 0), t('progress.perDay')],
      [duration(allTime), t('progress.allTime')],
    ]) {
      const part = make('div');
      part.append(make('b', '', number), make('span', '', name));
      totals.append(part);
    }
    const unitLine = t(
      {
        day: 'progress.minutesADay',
        week: inHours ? 'progress.hoursAWeek' : 'progress.minutesAWeek',
        month: inHours ? 'progress.hoursAMonth' : 'progress.minutesAMonth',
      }[size],
    );
    parts.time.replaceChildren(said, chart, make('p', 'hint', unitLine), totals);
  }

  function drawGrowth() {
    const { settings } = data;
    // The switch only means something to someone learning both scripts
    // (the owner, 2026-10-19).
    parts.apartLabel.hidden = !settings.bothScripts;
    fitApartLabel();
    const apart = settings.bothScripts && parts.apart.checked;
    const keys = rangeDays(range, data.now, data.firstKey);
    const days = growthByDay(data.words, data.cards, {
      script: settings.script,
      apart,
      scriptOf: (word) => scriptFor(word, settings),
    });
    const points = growthOver(keys, days);
    const lang = langFor(settings.script);
    const wordSign = settings.script === 'simplified' ? '词' : '詞';

    // Sizes in the chart's own units, which are pixels: it is drawn as wide
    // as its box.
    const width = Math.max(240, parts.growth.clientWidth - 2 * 12);
    const height = 170;
    const left = 36;
    const right = 100;
    const above = 8;
    const below = 22;
    const last = points[points.length - 1];
    const first = points[0];
    // From zero for a year or more; a short range starts nearer its lowest
    // value, so a month's growth shows (the owner, 2026-10-19).
    const short = range === 'month' || range === 'months3';
    const highest = Math.max(1, last.characters, last.words);
    const lowest = short ? Math.min(first.words, first.characters) : 0;
    const spread = Math.max(1, highest - lowest);
    const step = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((each) => spread / each <= 4) ?? 10000;
    const bottom = Math.floor(lowest / step) * step;
    const top = Math.max(bottom + step, Math.ceil(highest / step) * step);
    const x = (index) => left + (points.length === 1 ? 1 : index / (points.length - 1)) * (width - left - right);
    const y = (value) => above + (1 - (value - bottom) / (top - bottom)) * (height - above - below);

    const svgNS = 'http://www.w3.org/2000/svg';
    const draw = (tag, attributes, text = '') => {
      const element = document.createElementNS(svgNS, tag);
      for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, value);
      }
      if (text) {
        element.textContent = text;
      }
      return element;
    };
    const svg = draw('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'growth-chart' });
    svg.setAttribute('aria-label', t('progress.growthChart'));
    const decoration = draw('g', { 'aria-hidden': 'true' });
    for (let value = bottom; value <= top; value += step) {
      decoration.append(
        draw('line', { class: value === bottom ? 'baseline' : 'gridline', x1: left, x2: width - right, y1: y(value), y2: y(value) }),
        draw('text', { class: 'axis-text', x: left - 6, y: y(value) + 4, 'text-anchor': 'end' }, formatNumber(value)),
      );
    }
    const marked = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
    for (const index of marked) {
      const anchor = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle';
      const name = keys.length <= 92 ? shortDate(points[index].key) : monthName(points[index].key);
      decoration.append(draw('text', { class: 'axis-text', x: x(index), y: height - 4, 'text-anchor': anchor }, name));
    }
    const path = (field) => points.map((point, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(point[field]).toFixed(1)}`).join('');
    decoration.append(
      draw('path', { class: 'line-characters', d: path('characters') }),
      draw('path', { class: 'line-words', d: path('words') }),
    );
    // The totals at the ends of the lines, kept apart when close.
    let wordsY = y(last.words) + 4;
    let charactersY = y(last.characters) + 4;
    if (Math.abs(wordsY - charactersY) < 16) {
      const middle = (wordsY + charactersY) / 2;
      charactersY = middle - 8;
      wordsY = middle + 8;
    }
    const endLabel = (value, name, atY) => {
      const text = draw('text', { class: 'end-label', x: width - right + 8, y: atY });
      text.append(draw('tspan', { 'font-weight': '600' }, formatNumber(value)), ` ${name}`);
      return text;
    };
    decoration.append(
      endLabel(last.characters, t('progress.characterEnd', { count: last.characters }), charactersY),
      endLabel(last.words, t('progress.wordEnd', { count: last.words }), wordsY),
    );
    // Where a tap or the keyboard is: a line down, a dot on each line.
    const marker = draw('g', { class: 'growth-marker', visibility: 'hidden' });
    const markerLine = draw('line', { y1: above, y2: height - below });
    const charactersDot = draw('circle', { class: 'dot-characters', r: 4 });
    const wordsDot = draw('circle', { class: 'dot-words', r: 4 });
    marker.append(markerLine, charactersDot, wordsDot);
    // The ends of the lines, marked.
    decoration.append(
      draw('circle', { class: 'dot-characters', r: 4, cx: x(points.length - 1), cy: y(last.characters) }),
      draw('circle', { class: 'dot-words', r: 4, cx: x(points.length - 1), cy: y(last.words) }),
      marker,
    );
    svg.append(decoration);

    const said = readout(t('progress.tapChart'));
    makeExplorable(
      svg,
      points.length,
      (event) => {
        const box = svg.getBoundingClientRect();
        const along = (event.clientX - box.left - left) / (width - left - right);
        return Math.max(0, Math.min(points.length - 1, Math.round(along * (points.length - 1))));
      },
      (index) => {
        const point = points[index];
        marker.setAttribute('visibility', 'visible');
        for (const [attribute, value] of [['x1', x(index)], ['x2', x(index)]]) {
          markerLine.setAttribute(attribute, value);
        }
        charactersDot.setAttribute('cx', x(index));
        charactersDot.setAttribute('cy', y(point.characters));
        wordsDot.setAttribute('cx', x(index));
        wordsDot.setAttribute('cy', y(point.words));
        said.textContent = t('progress.growthDay', {
          date: longDate(point.key),
          words: t('progress.words', { count: point.words }),
          characters: t('progress.characters', { count: point.characters }),
        });
      },
    );

    const legend = make('div', 'progress-legend');
    const key = (className, text, sign) => {
      // The words in a span of their own: the key's swatch is set apart
      // from them by a gap, which would come between the words too.
      const item = make('span', className);
      const words = make('span', '', `${text} (`);
      const chinese = make('span', '', sign);
      chinese.lang = lang;
      words.append(chinese, ')');
      item.append(words);
      return item;
    };
    legend.append(
      key('key-words', t('progress.wordsLearnedKey'), wordSign),
      key('key-characters', t('progress.charactersKnownKey'), '字'),
    );
    // What was new in the range, its first day included.
    const firstDay = days.get(keys[0]) || { words: 0, characters: 0 };
    const newWords = last.words - first.words + firstDay.words;
    const newCharacters = last.characters - first.characters + firstDay.characters;
    const grew = t(GREW[range], {
      words: t('progress.words', { count: newWords }),
      characters: t('progress.characters', { count: newCharacters }),
    });
    parts.growth.replaceChildren(said, svg, legend, make('p', 'hint', grew));
  }

  // The switch's label in full, "Split 简体字/繁體字", where it fits beside
  // the heading; "Split 简/繁" where it would drop below it (a small phone,
  // or large text). The owner, 2026-10-19.
  function fitApartLabel() {
    if (parts.apartLabel.hidden) {
      return;
    }
    const long = parts.apartLabel.querySelector('.apart-long');
    const short = parts.apartLabel.querySelector('.apart-short');
    const besideHeading = () =>
      Math.abs(parts.apartLabel.getBoundingClientRect().top - parts.heading.getBoundingClientRect().top) < parts.heading.offsetHeight;
    long.hidden = false;
    short.hidden = true;
    if (!besideHeading()) {
      long.hidden = true;
      short.hidden = false;
    }
  }

  return { show };
}
