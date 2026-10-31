const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('./load-locales.cjs');

const web = path.join(__dirname, '..', 'src', 'jyotisha_ai', 'web');
const placeholders = text => (text.match(/\{\w+\}/g) || []).sort().join(',');
const english = registry.en;
const others = Object.entries(registry).filter(([code]) => code !== 'en');

test('English plus the Indian-language locales are registered', () => {
  assert.ok(others.length >= 16, `expected 16+ non-English locales, found ${others.length}`);
  const orders = Object.values(registry).map(locale => locale.meta.order);
  assert.equal(new Set(orders).size, orders.length, 'locale order values must be unique');
});

test('every locale defines exactly the English interface keys with the same placeholders', () => {
  const keys = Object.keys(english.ui).sort();
  for (const [code, locale] of others) {
    assert.deepEqual(Object.keys(locale.ui).sort(), keys, code);
    for (const key of keys) {
      assert.ok(locale.ui[key].trim().length > 0, `${code}.${key} is empty`);
      assert.equal(placeholders(locale.ui[key]), placeholders(english.ui[key]), `${code}.${key} placeholders`);
    }
  }
});

test('every locale has complete Panchang names, signs, planets and chart answers', () => {
  const answerKeys = Object.keys(registry.te.chart.answers).sort();
  for (const [code, locale] of others) {
    const { names, chart } = locale;
    assert.equal(names.tithi.length, 14, code);
    assert.equal(names.nakshatra.length, 27, code);
    assert.equal(names.yoga.length, 27, code);
    assert.equal(names.karana.length, 7, code);
    for (const key of ['shukla', 'krishna', 'purnima', 'amavasya', 'kimstughna', 'sakuni', 'chatuspada', 'naga', 'pakshaShukla', 'pakshaKrishna']) {
      assert.ok(names[key] && names[key].length > 0, `${code}.names.${key}`);
    }
    for (const list of [names.tithi, names.nakshatra, names.yoga, names.karana, chart.signs]) {
      assert.equal(new Set(list).size, list.length, `${code} has duplicate names`);
    }
    assert.equal(chart.signs.length, 12, code);
    assert.deepEqual(Object.keys(chart.bodies).sort(), ['Jupiter', 'Ketu', 'Mars', 'Mercury', 'Moon', 'Rahu', 'Saturn', 'Sun', 'Venus'], code);
    assert.deepEqual(Object.keys(chart.answers).sort(), answerKeys, code);
    for (const key of answerKeys) {
      const base = registry.te.chart.answers[key];
      assert.equal(placeholders(chart.answers[key]), placeholders(base), `${code}.answers.${key} placeholders`);
    }
  }
});

test('locales are flagged unreviewed and never claim expert review', () => {
  for (const [code, locale] of others) assert.equal(locale.meta.review, 'unreviewed', code);
});

test('every translation key used by the page exists in English', () => {
  const page = fs.readFileSync(path.join(web, 'birth.html'), 'utf8');
  const used = new Set();
  for (const match of page.matchAll(/data-(?:result-)?i18n(?:-placeholder|-aria)?="(\w+)"/g)) used.add(match[1]);
  for (const match of page.matchAll(/\b(?:res|dpText)\('(\w+)'\)/g)) used.add(match[1]);
  for (const match of page.matchAll(/calendarUI\.tr\(selectedLanguage,\s*'(\w+)'\)/g)) used.add(match[1]);
  const missing = [...used].filter(key => !(key in english.ui));
  assert.deepEqual(missing, []);
});

test('Telugu and Hindi factual answers still use the selected language through every locale template', () => {
  const ui = require(path.join(web, 'chart-ui.js'));
  globalThis.JyotishaPanchangNames = require(path.join(web, 'panchang-names.js'));
  const chart = {
    ascendant: { rashi_index: 7, sidereal_longitude: 204.7695 },
    positions: {
      Sun: { rashi_index: 7, sidereal_longitude: 185.5, whole_sign_bhava: 1 },
      Moon: { rashi_index: 3, sidereal_longitude: 70.4, whole_sign_bhava: 9 },
    },
    panchanga_at_birth: { tithi_index: 20, nakshatra_index: 6, nakshatra_pada: 1, yoga_index: 20 },
    vimshottari: { starting_lord: 'Rahu', balance_years_at_birth: 10.2 },
  };
  for (const [code] of others) {
    const lagna = ui.answerChartQuestion(chart, 'What is my Lagna?', code);
    assert.ok(lagna.includes(ui.signName(7, code)), `${code} lagna answer names its sign`);
    assert.doesNotMatch(lagna, /\{\w+\}/, `${code} leaves a placeholder unfilled`);
    const moon = ui.answerChartQuestion(chart, 'Where is Moon?', code);
    assert.ok(moon.includes(ui.signName(3, code)), `${code} Moon answer names Gemini in its language`);
    const tithi = ui.answerChartQuestion(chart, 'tithi', code);
    assert.ok(tithi.includes(globalThis.JyotishaPanchangNames.tithiName(20, code)), `${code} tithi name`);
  }
});

test('month and weekday names ship in each locale and never depend on browser Intl data', () => {
  const calendar = require(path.join(web, 'calendar-ui.js'));
  assert.match(calendar.formatDate('en', '2026-10-31', 'full'), /Saturday.*October.*2026/);
  for (const [code, locale] of others) {
    const names = locale.calendar;
    assert.equal(names.weekdays.length, 7, code);
    assert.equal(names.weekdaysShort.length, 7, code);
    assert.equal(names.months.length, 12, code);
    assert.equal(names.monthsShort.length, 12, code);
    assert.equal(new Set(names.months).size, 12, `${code} months are distinct`);
    assert.equal(new Set(names.weekdays).size, 7, `${code} weekdays are distinct`);
    const text = calendar.formatDate(code, '2026-10-31', 'full');
    assert.ok(text.includes(names.weekdays[6]) && text.includes(names.months[9]) && text.includes('31') && text.includes('2026'), `${code}: ${text}`);
    assert.doesNotMatch(text, /[A-Za-z]/, `${code} date contains Latin letters: ${text}`);
    assert.equal(calendar.weekdayLabels(code).length, 7);
    assert.equal(calendar.weekdayLabels(code)[0], names.weekdaysShort[1], `${code} week starts Monday`);
    assert.equal(calendar.monthTitle(2026, 10, code), `${names.months[9]} 2026`);
  }
});

test('every locale names every festival and holiday, in its own script rather than in English', () => {
  const keys = Object.keys(english.festivals).sort();
  assert.equal(keys.length, 39);
  for (const [code, locale] of others) {
    assert.deepEqual(Object.keys(locale.festivals).sort(), keys, code);
    for (const key of keys) {
      assert.ok(locale.festivals[key].trim().length > 1, `${code}.${key}`);
      assert.doesNotMatch(locale.festivals[key], /[A-Za-z]{3}/, `${code}.${key} is left in English: ${locale.festivals[key]}`);
    }
    assert.equal(new Set(Object.values(locale.festivals)).size >= 30, true, `${code} reuses too many names`);
  }
  const calendar = require(path.join(web, 'calendar-ui.js'));
  assert.equal(calendar.festivalName('te', 'diwali'), registry.te.festivals.diwali);
  assert.equal(calendar.festivalName('xx', 'diwali'), 'Diwali (Lakshmi Puja)');
  assert.equal(calendar.festivalName('en', 'no_such_key'), 'no_such_key');
});
