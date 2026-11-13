const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
require('./load-locales.cjs');

const root = path.join(__dirname, '..', 'src', 'jyotisha_ai', 'web');
const calendar = require(path.join(root, 'calendar-ui.js'));
const names = require(path.join(root, 'panchang-names.js'));
const chart = require(path.join(root, 'chart-ui.js'));
const match = require(path.join(root, 'match-ui.js'));
const nudges = require(path.join(root, 'nudges.js'));
const day = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'day_panchang_bengaluru_2026-10-30.json'), 'utf8'));
const month = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'month_calendar_bengaluru_2026-10.json'), 'utf8'));

test('all six bottom tabs stay in one grid row', () => {
  const css = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
  const navRules = [...css.matchAll(/(?:^|\n)\.bottom-nav\s*\{([^}]+)\}/g)];
  assert.equal(navRules.length, 1);
  assert.match(navRules[0][1], /grid-template-columns:repeat\(6,1fr\)/);
  const html = fs.readFileSync(path.join(root, 'birth.html'), 'utf8');
  assert.equal((html.match(/<a href="#(?:home|calendar|kundli|relationship|chat|rashi)"/g) || []).length, 6);
});

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.hidden = false; this.disabled = false; this.value = ''; this.textContent = ''; this.className = '';
    this.dataset = {}; this.children = []; this.listeners = {}; this.attributes = {}; this.style = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  append(...items) { this.children.push(...items); }
  appendChild(item) { this.children.push(item); return item; }
  replaceChildren(...items) { this.children = items; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name] || ''; }
  removeAttribute(name) { delete this.attributes[name]; }
  insertAdjacentElement() {}
  cloneNode(deep) {
    const copy = new Element(this.tag);
    Object.assign(copy, { hidden: this.hidden, value: this.value, textContent: this.textContent, className: this.className, id: this.id });
    copy.attributes = { ...this.attributes }; copy.dataset = { ...this.dataset };
    if (deep) copy.children = this.children.map(child => (child && child.cloneNode ? child.cloneNode(true) : child));
    return copy;
  }
  remove() {}
  querySelectorAll() { return []; }
  scrollIntoView() {}
  focus() {}
}

function boot(setup = {}) {
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const requests = [];
  const document = {
    body: new Element('body'), documentElement: new Element('html'), getElementById: element,
    createElement: tag => new Element(tag), createElementNS: (_ns, tag) => new Element(tag), createTextNode: text => ({ textContent: text }),
    querySelectorAll: () => [],
  };
  const fetch = async (url, options) => {
    requests.push({ url, body: options && options.body ? JSON.parse(options.body) : null });
    const reply = body => ({ ok: true, json: async () => body });
    if (url === '/api/birth-readiness') return reply({ can_calculate: true, assistant_available: setup.assistant === true, app_ads: setup.appAds || null });
    if (url === '/api/ask') return reply({ answer: 'AI answer' });
    if (url === '/api/nudges') return reply(setup.nudges || { status: 'off', batches: {} });
    if (url === '/api/rashiphal') return reply(setup.rashiphal || { status: 'off', readings: null, lucky: null });
    if (url === '/api/month-calendar') return reply(month);
    if (url === '/api/day-panchang') return reply({ day: { ...day, ...(setup.dayExtra || {}), date: JSON.parse(options.body).date } });
    if (url === '/api/birth-chart') return reply(setup.birth || {});
    if (url === '/api/nearby-place') return reply({ status: 'candidate', candidate: { value: setup.nearby || 'Mysuru, IN' } });
    return reply({ suggestions: [] });
  };
  const context = {
    document, fetch, Intl, Date, console, setTimeout, clearTimeout, navigator: setup.navigator || {}, FormData: class {},
    window: { JyotishaCalendar: calendar, JyotishaPanchangNames: names, JyotishaChart: chart, matchUI: match, JyotishaNudges: nudges, scrollTo() {}, localStorage: setup.storage, Capacitor: setup.capacitor, confirm: setup.confirm, matchMedia: () => ({ matches: false }) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  context.document.documentElement.style.setProperty = (name, value) => { (context.cssVars = context.cssVars || {})[name] = value; };
  return { element, requests, context };
}
const settle = () => new Promise(resolve => setTimeout(resolve, 30));

async function enter(app, language) {
  app.element('language-choice').value = language;
  app.element('welcome-next').listeners.click();
  app.element('language-next').listeners.click();
  app.element('welcome-city').value = 'Bengaluru, IN';
  app.element('welcome-form').listeners.submit({ preventDefault() {} });
  await settle();
}

test('after onboarding Home shows the month calendar and the full day Panchang in the chosen language', async () => {
  const app = boot();
  await enter(app, 'te');
  const page = name => app.element('top').children.find(item => item.id === `page-${name}`);
  assert.equal(page('home').hidden, false);
  assert.equal(page('kundli').hidden, true);
  assert.equal(page('chat').hidden, true);
  assert.ok(app.requests.some(r => r.url === '/api/month-calendar' && r.body.place === 'Bengaluru, IN'));
  assert.ok(app.requests.some(r => r.url === '/api/day-panchang'));
  // seven Panchang sections, four key chips, four sun/moon tiles
  assert.equal(app.element('dp-tables').children.length, 7);
  assert.equal(app.element('dp-key').children.length, 4);
  assert.equal(app.element('dp-sun-strip').children.length, 4);
  assert.match(app.element('dp-subtitle').textContent, /కృష్ణ పక్షం, కృష్ణ పంచమి/);
  assert.match(app.element('dp-date-title').textContent, /శుక్రవారం|శనివారం/);
  // the calendar: seven weekday labels, blanks, thirty-one days, each with its sunrise Tithi
  const cells = app.element('month-calendar').children;
  const days = cells.filter(cell => cell.dataset && cell.dataset.date);
  assert.equal(days.length, 31);
  assert.equal(cells.filter(cell => cell.className === 'calendar-weekday').length, 7);
  const marked = Object.fromEntries(days.filter(cell => cell.dataset.imp).map(cell => [cell.dataset.date, cell.dataset.imp]));
  // Ekadashi (E), Amavasya (A) and Purnima (P) are marked from the sunrise Tithi alone
  assert.deepEqual(marked, { '2026-10-06': 'E', '2026-10-10': 'A', '2026-10-22': 'E', '2026-10-26': 'P' });
});

test('tapping a calendar day loads that day with all its Panchang details', async () => {
  const app = boot();
  await enter(app, 'en');
  const before = app.requests.filter(r => r.url === '/api/day-panchang').length;
  const target = app.element('month-calendar').children.find(cell => cell.dataset && cell.dataset.date === '2026-10-26');
  target.listeners.click();
  await settle();
  const requests = app.requests.filter(r => r.url === '/api/day-panchang');
  assert.equal(requests.length, before + 1);
  assert.equal(requests.at(-1).body.date, '2026-10-26');
  assert.equal(app.element('dp-date').value, '2026-10-26');
  assert.equal(app.element('dp-tables').children.length, 7);
  app.element('dp-next').listeners.click();
  await settle();
  assert.equal(app.requests.filter(r => r.url === '/api/day-panchang').at(-1).body.date, '2026-10-27');
});

test('the header language selector changes language in place without leaving the page', async () => {
  const app = boot();
  await enter(app, 'en');
  assert.match(app.element('dp-subtitle').textContent, /Krishna Paksha, Krishna Panchami/);
  app.element('language-switch').listeners.change({ target: { value: 'hi' } });
  const home = app.element('top').children.find(item => item.id === 'page-home');
  assert.equal(home.hidden, false);
  assert.equal(app.element('welcome-screen').hidden, true);
  assert.match(app.element('dp-subtitle').textContent, /कृष्ण पक्ष, कृष्ण पंचमी/);
  app.element('language-switch').listeners.change({ target: { value: 'ur' } });
  assert.match(app.element('dp-subtitle').textContent, /کرشن پکش/);
  assert.equal(app.element('language-switch').value, 'ur');
});

test('every Tithi, Nakshatra, Yoga and Karana row carries its end time', async () => {
  const app = boot();
  await enter(app, 'en');
  const sections = app.element('dp-tables').children;
  const panchang = sections[1];
  const valueOf = (box, rowIndex) => box.children[rowIndex].children[1].children;
  for (const rowIndex of [1, 2, 3, 4]) {
    const lines = valueOf(panchang, rowIndex);
    assert.ok(lines.length >= 1);
    for (const line of lines) assert.match(line.children[1].textContent, /upto \S*\d/, `row ${rowIndex} is missing its end time`);
  }
  // the last Tithi runs past the next sunrise and says on which day it ends
  assert.match(valueOf(panchang, 1).at(-1).children[1].textContent, /31 Oct/);
});

test('festivals and holidays are marked on the calendar, listed under it, and shown on the selected day', async () => {
  const withEvents = JSON.parse(JSON.stringify(month));
  withEvents.events = [
    { date: '2026-10-20', key: 'vijayadashami', holiday: true },
    { date: '2026-10-20', key: 'maha_navami', holiday: false },
    { date: '2026-10-25', key: 'sharad_purnima', holiday: false },
  ];
  const original = JSON.stringify(month);
  Object.assign(month, withEvents);
  try {
    const app = boot();
    await enter(app, 'en');
    const cells = app.element('month-calendar').children.filter(cell => cell.dataset && cell.dataset.date);
    const marked = Object.fromEntries(cells.filter(cell => cell.dataset.fest).map(cell => [cell.dataset.date, cell.dataset.holiday ? 'holiday' : 'festival']));
    assert.deepEqual(marked, { '2026-10-20': 'holiday', '2026-10-25': 'festival' });
    const list = app.element('month-events').children;
    const rows = list.filter(item => item.className && item.className.startsWith('event-row'));
    assert.equal(rows.length, 3);
    assert.match(rows[0].children[1].textContent, /Vijayadashami \(Dussehra\)/);
    assert.equal(rows[0].children.length, 3);            // the holiday carries a "Public holiday" tag
    assert.equal(rows[1].children.length, 2);
    assert.ok(list.some(item => /simple rules/.test(item.textContent)), 'the accuracy note is shown');
    // opening a festival row loads that day, whose hero card names its festivals
    const before = app.requests.filter(r => r.url === '/api/day-panchang').length;
    rows[0].listeners.click();
    await settle();
    assert.equal(app.requests.filter(r => r.url === '/api/day-panchang').length, before + 1);
    assert.deepEqual(app.element('dp-events').children.map(chip => chip.textContent), ['Vijayadashami (Dussehra)', 'Maha Navami']);
    assert.match(app.element('dp-events').children[0].className, /holiday/);
    // festival names follow the chosen language
    app.element('language-switch').listeners.change({ target: { value: 'ta' } });
    assert.deepEqual(app.element('dp-events').children.map(chip => chip.textContent), ['விஜயதசமி (தசரா)', 'மகா நவமி']);
  } finally {
    for (const key of Object.keys(month)) delete month[key];
    Object.assign(month, JSON.parse(original));
  }
});


function memoryStorage(initial) {
  const data = new Map(initial ? [['jyotisha.settings.v1', JSON.stringify(initial)]] : []);
  return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key), read: () => JSON.parse(data.get('jyotisha.settings.v1') || 'null') };
}
const geolocation = () => ({ calls: 0, getCurrentPosition(ok) { this.calls += 1; ok({ coords: { latitude: 12.97, longitude: 77.59 } }); } });
const dayRequests = app => app.requests.filter(r => r.url === '/api/day-panchang');

test('a fresh install shows onboarding, defaults to English, and remembers the language and city afterwards', async () => {
  const storage = memoryStorage();
  const app = boot({ storage });
  assert.equal(app.element('language-switch').value, 'en');
  assert.equal(app.element('welcome-screen').hidden, false);
  assert.equal(storage.read(), null);
  await enter(app, 'te');
  assert.deepEqual(storage.read(), { lang: 'te', city: 'Bengaluru, IN', useLocation: false });
  app.element('language-switch').listeners.change({ target: { value: 'hi' } });
  assert.equal(storage.read().lang, 'hi');
});

test('a returning user goes straight to Home in the saved language and city, with no onboarding', async () => {
  const storage = memoryStorage({ lang: 'te', city: 'Chennai, IN', useLocation: false });
  const app = boot({ storage });
  await settle();
  assert.equal(app.element('welcome-screen').hidden, true);
  assert.equal(app.element('language-switch').value, 'te');
  assert.equal(dayRequests(app)[0].body.place, 'Chennai, IN');
  assert.match(app.element('dp-subtitle').textContent, /కృష్ణ పక్షం/);
  assert.equal(app.element('dp-tables').children.length, 7);
});

test('unreadable or incomplete saved settings behave like a first visit', async () => {
  for (const bad of [{ lang: 'te' }, { city: '' }, { city: 42 }]) {
    const app = boot({ storage: memoryStorage(bad) });
    await settle();
    assert.equal(app.element('welcome-screen').hidden, false);
    assert.equal(dayRequests(app).length, 0);
  }
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const app = boot({ storage: broken });
  await enter(app, 'en');   // saving fails silently and the app still works
  assert.equal(app.element('dp-tables').children.length, 7);
});

test('the city can be changed in place on Home without repeating onboarding', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: true });
  const app = boot({ storage });
  await settle();
  app.element('city-panel').hidden = true;   // the real page marks the panel hidden in its markup
  app.element('dp-city').listeners.click();
  assert.equal(app.element('city-panel').hidden, false);
  assert.equal(app.element('city-input').value, 'Bengaluru, IN');
  app.element('city-input').value = 'Hubballi, IN';
  app.element('city-save').listeners.click();
  await settle();
  assert.equal(app.element('city-panel').hidden, true);
  assert.equal(app.element('welcome-screen').hidden, true);
  assert.equal(dayRequests(app).at(-1).body.place, 'Hubballi, IN');
  assert.deepEqual(storage.read(), { lang: 'en', city: 'Hubballi, IN', useLocation: false });  // a typed city turns location-following off
});

test('location is read only on request or when the browser already granted it, and never re-prompted', async () => {
  // fresh install: the Allow button reads the location once and the choice is remembered
  const place = geolocation();
  const storage = memoryStorage();
  const app = boot({ storage, navigator: { geolocation: place } });
  app.element('welcome-next').listeners.click();
  app.element('language-next').listeners.click();
  app.element('allow-location').listeners.click();
  await settle();
  assert.equal(place.calls, 1);
  assert.equal(app.element('welcome-city').value, 'Mysuru, IN');
  app.element('welcome-form').listeners.submit({ preventDefault() {} });
  await settle();
  assert.deepEqual(storage.read(), { lang: 'en', city: 'Mysuru, IN', useLocation: true });

  // later visit with permission already granted: the city follows the current location, silently
  const granted = geolocation();
  const next = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: true }), nearby: 'Pune, IN',
    navigator: { geolocation: granted, permissions: { query: async () => ({ state: 'granted' }) } } });
  await settle();
  assert.equal(granted.calls, 1);
  assert.deepEqual([...new Set(dayRequests(next).map(r => r.body.place))], ['Bengaluru, IN', 'Pune, IN']);

  // permission not granted (prompt or denied): the app must not trigger a prompt by itself
  for (const state of ['prompt', 'denied']) {
    const quiet = geolocation();
    const again = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: true }),
      navigator: { geolocation: quiet, permissions: { query: async () => ({ state }) } } });
    await settle();
    assert.equal(quiet.calls, 0, `${state}: no location request`);
    assert.deepEqual([...new Set(dayRequests(again).map(r => r.body.place))], ['Bengaluru, IN']);
  }
  // a user who never allowed location keeps their saved city and is never asked
  const manual = geolocation();
  const typed = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }),
    navigator: { geolocation: manual, permissions: { query: async () => ({ state: 'granted' }) } } });
  await settle();
  assert.equal(manual.calls, 0);
  assert.deepEqual([...new Set(dayRequests(typed).map(r => r.body.place))], ['Bengaluru, IN']);
});


const syntheticBirth = {
  chart: {
    input: { birth_datetime: '1995-08-15T06:30:00+05:30' },
    ascendant: { rashi_index: 5, sidereal_longitude: 124.3 },
    positions: Object.fromEntries(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].map((name, n) => [name, { rashi_index: n + 1, sidereal_longitude: 10 + n * 30, tropical_longitude: 34 + n * 30, whole_sign_bhava: (n + 1 - 5 + 12) % 12 + 1 }])),
    panchanga_at_birth: { tithi_index: 3, nakshatra_index: 17, nakshatra_pada: 2, yoga_index: 4, karana_half_tithi_index: 5 },
    vimshottari: { starting_lord: 'Saturn', balance_years_at_birth: 13.6 }
  },
  details: null, resolved_birth: null
};
const birthRequests = app => app.requests.filter(r => r.url === '/api/birth-chart');

test('saved birth details restore the chart on the next visit, so the chat does not ask again', async () => {
  const profile = { dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify(profile));
  const app = boot({ storage, birth: syntheticBirth });
  await settle();
  assert.deepEqual(birthRequests(app)[0].body, profile);
  assert.equal(app.element('chart').hidden, false);
  assert.equal(app.element('chat-log').children.at(-1).textContent, calendar.tr('en', 'chartReady'));
});

test('without saved details nothing is calculated, and corrupt saved details are ignored', async () => {
  for (const raw of [null, '{"dob":"15-08-1995","pob":"x","tob":"6:30"}', 'not json']) {
    const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
    if (raw) storage.setItem('jyotisha.profile.v1', raw);
    const app = boot({ storage, birth: syntheticBirth });
    await settle();
    assert.equal(birthRequests(app).length, 0);
    assert.equal(app.element('chat-log').children.at(-1).textContent, calendar.tr('en', 'chatAskDob'));
  }
});

test('the forget button removes the saved birth details and the chart', async () => {
  const profile = { dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify(profile));
  const app = boot({ storage, birth: syntheticBirth });
  await settle();
  app.element('forget-profile').listeners.click();
  assert.equal(storage.getItem('jyotisha.profile.v1'), null);
  assert.equal(app.element('chart').hidden, true);
  assert.equal(app.element('chat-log').children.at(-1).textContent, calendar.tr('en', 'chatAskDob'));
});

test('Love page offers two choices, then shows Guna Milan out of 36 without saving partner birth details', async () => {
  const storage = memoryStorage({ lang: 'te', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth });
  await settle();
  assert.match(app.element('relationship-title').textContent, /ప్రేమ/);
  // Nothing is shown until the user picks one of the two options.
  const options = app.element('love-options').children;
  assert.equal(options.length, 2);
  assert.equal(app.element('love-match').hidden, true);
  assert.equal(app.element('love-reading').hidden, true);
  app.element('love-options').children[1].listeners.click();
  assert.equal(app.element('love-reading').hidden, false);
  assert.ok(app.element('relationship-reading-result').children.length > 0);
  app.element('love-options').children[0].listeners.click();
  assert.equal(app.element('love-match').hidden, false);
  assert.equal(app.element('love-reading').hidden, true);
  app.element('partner-dob').value = '1998-10-23';
  app.element('partner-pob').value = 'Bengaluru, IN';
  app.element('partner-tob').value = '12:35';
  await app.element('relationship-form').listeners.submit({ preventDefault() {} });
  assert.deepEqual(birthRequests(app).at(-1).body, { dob: '1998-10-23', pob: 'Bengaluru, IN', tob: '12:35' });
  // The synthetic partner chart has the same Moon: all kootas but Nadi match, 28 of 36.
  const score = app.element('relationship-result').children[0];
  assert.equal(score.children[1].textContent, '28 / 36');
  assert.equal(score.children[2].value, 28);
  assert.match(score.children[3].textContent, /మంచి పొంతన/);
  assert.ok(app.element('relationship-result').children.some(item => /నాడీ దోషం/.test(item.textContent)));
  const kootas = app.element('relationship-result').children.at(-1).children[1].children;
  assert.equal(kootas.length, 8);
  assert.equal(storage.getItem('jyotisha.partner.v1'), null);
  app.element('forget-profile').listeners.click();
  assert.equal(app.element('relationship-result').children.length, 0);
});

test('Home offers tool cards and the Kundli shows one view at a time, including doshas', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const doshas = { kuja: { present: true, from_lagna: true, from_moon: false, house_from_lagna: 7, house_from_moon: 3, reduced: false },
    saturn: { sade_sati: { active: true, phase: 2, current: { start: '2025-04', end: '2032-05' }, next: null },
      ashtama_shani: { active: false, current: null, next: null }, ardhashtama_shani: { active: false, current: null, next: null } } };
  const birth = { ...syntheticBirth, details: { ...(syntheticBirth.details || {}), doshas } };
  const app = boot({ storage, birth });
  await settle();
  assert.equal(app.element('tool-grid').children.length, 5);
  // Cards show something about the user: the Doshas card says Sade Sati is running; with a chart there is no Kundli nudge.
  assert.equal(app.element('tool-grid').children[1].children[2].textContent, 'Sade Sati: phase 2 of 3 running');
  assert.equal(app.element('my-jathakam').children.length, 3);          // heading, Lagna/Rashi/Nakshatra/Dasha, View full Kundli
  // Typing a question on Home opens the chat and asks it.
  app.element('home-question').value = 'Will I get a job this year?';
  app.element('home-ask').listeners.submit({ preventDefault() {} });
  await settle();
  const pageOf = name => app.element('top').children.find(item => item.id === `page-${name}`);
  assert.equal(pageOf('chat').hidden, false);
  assert.ok(app.element('chat-log').children.some(item => item.textContent === 'Will I get a job this year?'));
  assert.equal(app.element('kundli-views').children.length, 5);
  // Upcoming festivals read this month and the next two, and the list shows a row or a "none" line.
  assert.ok(app.requests.filter(r => r.url === '/api/month-calendar').length >= 3);
  assert.ok(app.element('festival-list').children.length > 0);
  assert.equal(app.element('festivals-title').textContent, 'Upcoming festivals');
  app.element('tool-grid').children[1].listeners.click();     // Doshas card opens the Kundli on the Doshas view
  const page = name => app.element('top').children.find(item => item.id === `page-${name}`);
  assert.equal(page('kundli').hidden, false);
  const cards = app.element('dosha-body').children;
  assert.match(cards[0].children[0].children[1].textContent, /Present/);
  assert.match(cards[0].children[1].textContent, /house 7 from the Lagna/);
  assert.match(cards[1].children[0].children[1].textContent, /phase 2 of 3/);
  assert.match(cards[1].children[1].textContent, /2025.*2032/);
});

test('without a Kundli, Home nudges the user to make one and the personal cards ask for it', async () => {
  const app = boot();
  await enter(app, 'en');
  const jathakam = app.element('my-jathakam').children;
  assert.equal(jathakam.length, 2);                                       // invitation and the Create my Kundli button
  assert.match(jathakam[0].children[1].children[0].textContent, /Want to know your Jathakam/);
  assert.match(jathakam[1].textContent, /Create my Kundli/);
  // Festivals and the month calendar live in the Calendar tab.
  const calendarPage = app.element('top').children.find(item => item.id === 'page-calendar');
  assert.ok(calendarPage && calendarPage.children.length === 3);   // title, festivals, month calendar
  assert.equal(app.element('tool-grid').children[1].children[2].textContent, 'Create your Kundli to see');
  assert.equal(app.element('home-today').hidden, true);
});

test('appearance: light by default; dark mode and an accent colour can be chosen and are remembered', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage });
  await settle();
  const root = app.context.document.documentElement;
  assert.equal(root.getAttribute('data-mode'), 'light');
  assert.equal(root.getAttribute('data-accent'), 'saffron');
  app.element('theme-panel').hidden = true;           // as in the page markup
  app.element('theme-btn').listeners.click();
  const panel = app.element('theme-panel');
  assert.equal(panel.hidden, false);
  const [title, , modes, , swatches] = panel.children;
  assert.match(title.textContent, /Appearance/);
  modes.children[1].listeners.click();                 // Dark
  assert.equal(root.getAttribute('data-mode'), 'dark');
  app.element('theme-panel').children[4].children[2].listeners.click();   // Rose
  assert.equal(root.getAttribute('data-accent'), 'rose');
  assert.deepEqual(JSON.parse(storage.getItem('jyotisha.appearance.v1')), { mode: 'dark', accent: 'rose' });
});

test('daily notifications: the Android app asks for permission at the start, once, then schedules a week of morning notifications', async () => {
  const calls = { schedule: [], requested: 0, cancelled: [] };
  const LocalNotifications = {
    checkPermissions: async () => ({ display: calls.requested ? 'granted' : 'prompt' }),     // like a phone: granted once allowed
    requestPermissions: async () => { calls.requested += 1; return { display: 'granted' }; },
    getPending: async () => ({ notifications: [{ id: 7101 }] }),
    cancel: async ({ notifications }) => { calls.cancelled.push(...notifications.map(item => item.id)); },
    schedule: async ({ notifications }) => { calls.schedule.push(notifications); },
    addListener: (name, fn) => { if (name === 'localNotificationActionPerformed') LocalNotifications.tap = fn; },
  };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage, capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' } });
  app.context.__tap = event => LocalNotifications.tap(event);
  await settle();
  await settle(); await settle();
  assert.equal(app.element('notify-card').hidden, true);              // no extra card: the phone's own prompt
  assert.equal(calls.requested, 1);                                   // asked straight away
  assert.ok(calls.cancelled.includes(7101));                          // old ones replaced
  const scheduled = calls.schedule.at(-1);
  const morning = scheduled.filter(item => item.id >= 7100 && item.id < 7107), evening = scheduled.filter(item => item.id >= 7120 && item.id < 7127);
  assert.ok(morning.length >= 6 && morning.length <= 7);              // the coming mornings
  assert.ok(morning.every(item => /Rahu Kalam/.test(item.body) && item.schedule.allowWhileIdle));
  assert.match(scheduled.find(item => item.id === 7107).title, /week ahead/);   // then a reminder to open the app
  assert.ok(evening.length >= 6 && new Set(evening.map(item => item.title)).size === evening.length);   // a different question each evening
  assert.ok(evening.every(item => item.schedule.at.getHours() === 19 && item.schedule.at.getMinutes() === 30));
  assert.deepEqual(JSON.parse(storage.getItem('jyotisha.notify.v1')), { on: true, asked: true, time: '07:00', evening: true, muhurta: true, eveningTime: '19:30' });
  // Tapping an evening question opens Jyotirmaya AstroChat and asks it.
  const question = evening.find(item => item.extra.ask);
  app.context.__tap({ notification: { extra: question.extra } });
  await settle();
  assert.equal(app.element('top').children.find(item => item.id === 'page-chat').hidden, false);
  assert.ok(app.element('chat-log').children.some(item => item.textContent === question.extra.ask));
  assert.equal(app.element('notify-card').hidden, true);
  boot({ storage, capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' } });   // the next start
  await settle(); await settle();
  assert.equal(calls.requested, 1);                                   // not asked again
});

test('daily notifications are not offered in a browser (no Android plugin)', async () => {
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }) });
  await settle();
  assert.equal(app.element('notify-card').hidden, true);
});

test('admin-panel messages: the app subscribes to "all" and its language, and a tap opens the chosen screen', async () => {
  const topics = [], listeners = {};
  const FirebaseMessaging = {
    subscribeToTopic: async ({ topic }) => { topics.push(['+', topic]); },
    unsubscribeFromTopic: async ({ topic }) => { topics.push(['-', topic]); },
    addListener: (name, fn) => { listeners[name] = fn; },
  };
  const storage = memoryStorage({ lang: 'te', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage, capacitor: { Plugins: { FirebaseMessaging }, getPlatform: () => 'android' } });
  await settle();
  assert.deepEqual(topics, [['+', 'all'], ['+', 'lang-te']]);
  assert.equal(storage.getItem('jyotisha.push.v1'), 'lang-te');
  listeners.notificationActionPerformed({ notification: { data: { page: 'calendar' } } });
  const page = name => app.element('top').children.find(item => item.id === `page-${name}`);
  assert.equal(page('calendar').hidden, false);
  // Changing the language moves the phone to the new language's topic.
  app.element('language-switch').value = 'hi';
  app.element('language-switch').listeners.change({ target: app.element('language-switch') });
  await settle();
  assert.deepEqual(topics.slice(2), [['+', 'all'], ['-', 'lang-te'], ['+', 'lang-hi']]);
});

test('notifications: a broken message never stops the rest, and settings do not list what is scheduled', async () => {
  const runs = [], pending = [];
  const LocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: pending.slice() }), cancel: async () => { pending.length = 0; }, addListener: () => {},
    schedule: async ({ notifications }) => { runs.push(notifications); pending.push(...notifications); },
  };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.notify.v1', JSON.stringify({ on: true, asked: true, time: '07:00' }));
  const days = [0, 1, 2, 3, 4, 5, 6].map(n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  // A malformed AI batch: its muhurta lines are broken, which used to throw and drop the whole schedule.
  const batches = Object.fromEntries(days.map(iso => [iso, { questions: [], dasha: [], sign: [], good: [null], bad: [null] }]));
  const app = boot({ storage, capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' }, nudges: { status: 'ok', batches } });
  await settle(); await settle(); await settle();
  const scheduled = runs.at(-1);
  assert.ok(scheduled.filter(item => item.id >= 7101 && item.id < 7107).length >= 5);      // the mornings are still there
  assert.ok(scheduled.some(item => item.id >= 7120 && item.id < 7127));                     // and the evenings
  app.element('theme-panel').hidden = true;
  app.element('theme-btn').listeners.click();
  const settings = app.element('theme-panel').children.find(item => item.className === 'notify-settings');
  assert.ok(!settings.children.some(item => item.className === 'notify-next'));   // nothing about what is scheduled
});

test('evening notifications are unique: a week has no repeats, reopening keeps the plan, recent ones are skipped', async () => {
  const runs = [];
  const LocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [] }), cancel: async () => {}, addListener: () => {},
    schedule: async ({ notifications }) => { runs.push(notifications.filter(item => item.id >= 7120 && item.id < 7127)); },
  };
  const storage = memoryStorage({ lang: 'te', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.notify.v1', JSON.stringify({ on: true, asked: true, time: '07:00' }));
  // Pretend every life question was shown in the last few days: they must not come back yet.
  const recent = {};
  for (let back = 1; back <= 22; back += 1) {
    const d = new Date(); d.setDate(d.getDate() - back);
    recent[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`] = `q-${back - 1}`;
  }
  storage.setItem('jyotisha.nudges.v1', JSON.stringify(recent));
  const capacitor = { Plugins: { LocalNotifications }, getPlatform: () => 'android' };
  boot({ storage, capacitor });
  await settle(); await settle(); await settle();
  const first = runs.at(-1);
  assert.ok(first.length >= 6);
  assert.equal(new Set(first.map(item => item.title)).size, first.length);              // no repeats within the week
  const history = JSON.parse(storage.getItem('jyotisha.nudges.v1'));
  const planned = Object.entries(history).filter(([date]) => !recent[date]);
  assert.equal(planned.length, first.length);
  const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
  for (const [date, key] of planned) {   // nothing comes back within 21 days of when it was last shown
    for (const [usedOn, usedKey] of Object.entries(history)) {
      if (usedKey === key && usedOn < date) assert.ok(daysBetween(usedOn, date) > 21, `${key} on ${date} was used on ${usedOn}`);
    }
  }
  // Opening the app again the same day plans the same messages (no churn).
  boot({ storage, capacitor });
  await settle(); await settle(); await settle();
  assert.equal(JSON.stringify(runs.at(-1).map(item => item.title)), JSON.stringify(first.map(item => item.title)));
});

test('AI-written copy: evenings use the day\'s fresh lines (with the user\'s dasha filled in) and muhurta alerts use the AI wording', async () => {
  const runs = [];
  const LocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [] }), cancel: async () => {}, addListener: () => {},
    schedule: async ({ notifications }) => { runs.push(notifications); },
  };
  const iso = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const batches = {};
  for (let offset = 0; offset < 8; offset += 1) {
    batches[iso(offset)] = {
      questions: [{ t: `🆕 Fresh question ${offset}`, b: 'Tap to find out 👀', ask: `Fresh ask ${offset}?` }],
      dasha: [{ t: '👀 {dasha} has news', b: 'Tap 🤫', ask: 'What does my {dasha} period bring?' }],
      sign: [], good: [{ t: '⏰ AI golden hour', b: 'Until {end}' }], bad: [{ t: '🚦 AI red signal', b: 'Wait till {end}' }],
    };
  }
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.notify.v1', JSON.stringify({ on: true, asked: true, time: '07:00' }));
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const details = { dasha: { current_mahadasha: 'Rahu', antardasha: [{ lord: 'Sun', current: true }] } };
  const app = boot({ storage, birth: { ...syntheticBirth, details }, nudges: { status: 'ok', batches },
    capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' } });
  await settle(); await settle(); await settle();
  assert.ok(app.requests.some(r => r.url === '/api/nudges' && r.body.language === 'en' && r.body.days === 7));
  const evening = runs.at(-1).filter(item => item.id >= 7120 && item.id < 7127);
  assert.ok(evening.length >= 6);
  assert.ok(evening.every(item => /^(🆕 Fresh question|👀 Rahu – Sun has news)/.test(item.title)), evening.map(item => item.title).join(' | '));
  assert.ok(evening.some(item => item.extra.ask === 'What does my Rahu – Sun period bring?'));
  assert.ok(evening.every(item => !/[{}]/.test(item.title + item.body + item.extra.ask)));
  const muhurta = runs.at(-1).filter(item => item.id >= 7130);
  assert.ok(muhurta.every(item => /^(⏰ AI golden hour|🚦 AI red signal)/.test(item.title)));
});

test('tapping a notification that opens the app asks its question once the Kundli is loaded, and shows the AI reply', async () => {
  let tap = null;
  const LocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [] }), cancel: async () => {}, schedule: async () => {},
    addListener: (name, fn) => { if (name === 'localNotificationActionPerformed') tap = fn; },
  };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth, assistant: true, capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' } });
  // Android delivers the tap right away, before the saved Kundli has been restored.
  tap({ notification: { extra: { page: 'chat', ask: 'Will my plans work out?' } } });
  await settle(); await settle(); await settle();
  const page = name => app.element('top').children.find(item => item.id === `page-${name}`);
  assert.equal(page('chat').hidden, false);
  const texts = app.element('chat-log').children.map(item => item.textContent);
  assert.ok(texts.includes('Will my plans work out?'), texts.join(' | '));
  assert.equal(texts.at(-1), 'AI answer');                                        // the AI's reply, not the offline answer
  const asked = app.requests.filter(r => r.url === '/api/ask');
  assert.equal(asked.length, 1);
  assert.equal(asked[0].body.question, 'Will my plans work out?');
  assert.ok(!texts.some(text => /date of birth/i.test(text)));                    // it did not start asking for birth details
});

test('day cards: good times, Panchang, muhurtas and bad times, with a WhatsApp share of the day', async () => {
  const dayExtra = {
    amrita_kalam: [{ nakshatra_index: 19, starts_at: '2026-10-30T10:06', ends_at: '2026-10-30T11:54' }],
    durmuhurtam: [['2026-10-30T08:36', '2026-10-30T09:21'], ['2026-10-30T12:23', '2026-10-30T13:08']],
    lunar_month: 8, adhika_month: false, samvatsara_index: 40,
    event_muhurtas: { marriage: [], gruhapravesam: [], vehicle: [] },
  };
  const app = boot({ dayExtra });
  let opened = '';
  app.context.window.open = url => { opened = url; };
  await enter(app, 'te');
  const cards = app.element('day-cards').children;
  assert.equal(cards.length, 4);
  const titles = cards.map(card => card.children[0].children[0].textContent);
  assert.deepEqual(titles, ['శుభ సమయాలు', 'పంచాంగం', 'శుభ ముహూర్తాలు', 'అశుభ సమయాలు']);
  assert.ok(cards[1].children.some(item => item.className === 'lunar' && /పరాభవ/.test(item.textContent) && /కార్తీకం/.test(item.textContent)));
  assert.ok(cards[2].children.some(item => item.className === 'empty' && /శుభ ముహూర్తాలు లేవు/.test(item.textContent)));
  const badRows = cards[3].children[1].children.map(row => row.children[0].textContent);
  assert.ok(badRows.includes('దుర్ముహూర్తం: '));
  assert.equal(app.element('share-day').hidden, false);
  app.element('share-day').onclick();
  assert.match(opened, /^https:\/\/wa\.me\/\?text=/);
  const text = decodeURIComponent(opened.split('text=')[1]);
  assert.match(text, /పరాభవ/); assert.match(text, /అమృత కాలం/); assert.match(text, /దుర్ముహూర్తం/); assert.match(text, /Jyotirmaya AstroChat/);
  assert.ok(!/[\u2066-\u2069]/.test(text));
});

test('Rashiphal: pick a sign to see its AI paragraph, lucky colour, numbers and direction, and share or ask about it', async () => {
  const readings = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), `Paragraph for sign ${i + 1}. `.repeat(20)]));
  const lucky = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String(i + 1), { planet: 'Venus', lord: 'Mercury', numbers: [6, 5], sign_planet: i === 5 ? 'Mercury' : 'Venus' }]));
  const storage = memoryStorage({ lang: 'te', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage, rashiphal: { status: 'ok', readings, lucky },
    dayExtra: { planet_rashis: { Sun: 7, Mars: 5, Mercury: 7, Jupiter: 5, Venus: 6, Saturn: 12, Rahu: 11, Ketu: 5 } } });
  let opened = '';
  app.context.window.open = url => { opened = url; };
  await settle();
  assert.equal(app.element('rashi-picker').children.length, 12);
  assert.match(app.element('rashi-reading').children[0].textContent, /రాశిని ఎంచుకోండి/);   // nothing chosen yet: a hint
  app.element('rashi-picker').children[5].listeners.click();                    // Kanya
  await settle(); await settle();
  assert.equal(storage.getItem('jyotisha.rashi.v1'), '6');
  const reading = app.element('rashi-reading').children;
  assert.match(reading[0].textContent, /రాశి ఫలితాలు/);
  const jumps = reading[1].children;                                             // quick links at the top
  assert.deepEqual(jumps.map(b => b.textContent), ['🪐 గ్రహ సంచారం', '🙏 పరిహారాలు', '📜 పూర్తి జాతకం', '✨ AIని అడగండి']);
  assert.match(reading[2].textContent, /Paragraph for sign 6/);
  const card = app.element('rashi-list').children[0];
  assert.ok(!card.open);                                                         // folded at first
  jumps[1].listeners.click();                                                     // remedies: opens the details card
  assert.equal(card.open, true);
  const transits = card.children.find(item => item.className === 'transit-grid').children;   // planet cards, favourable first
  assert.equal(transits.length, 8);
  assert.equal(transits[0].className, 'transit-card ok');
  const first = transits[0].children[0].children;                                 // symbol, name and house, tag
  assert.match(first[0].textContent, /[☉♂☿♃♀♄☊☋]/); assert.match(first[2].textContent, /అనుకూలం/);
  assert.match(transits[transits.length - 1].children[0].children[2].textContent, /జాగ్రత్త/);
  const luckyBox = reading.find(item => item.className === 'rashi-lucky');
  assert.match(luckyBox.children[1].textContent, /రంగు, దిక్కు: ఈరోజు అన్ని రాశులకు ఒకటే · సంఖ్యలు: మీ రాశికి/);
  const chips = luckyBox.children[2].children.map(chip => chip.children[1].textContent);
  assert.deepEqual(chips, ['తెలుపు, గులాబీ', '6, 5', 'ఆగ్నేయం']);
  const special = luckyBox.children[3].children.map(item => item.textContent);  // and Kanya's own (Mercury: green, north)
  assert.match(special[0], /మీ రాశికి ప్రత్యేకం/); assert.match(special[1], /ఆకుపచ్చ.*ఉత్తరం/);
  assert.ok(app.requests.some(r => r.url === '/api/rashiphal' && r.body.language === 'te'));
  assert.equal(app.element('rashi-list').children.length, 1);                    // only Kanya's detailed card
  const actions = reading.find(item => item.className === 'rashi-actions').children;
  actions[1].listeners.click();                                                  // WhatsApp
  const text = decodeURIComponent(opened.split('text=')[1]);
  assert.match(text, /Paragraph for sign 6/); assert.match(text, /అదృష్ట సూచక అంశాలు/); assert.match(text, /ఆగ్నేయం/); assert.match(text, /మీ రాశికి ప్రత్యేకం/);
  actions[0].listeners.click();                                                  // ask the AI about my day
  await settle();
  assert.equal(app.element('top').children.find(item => item.id === 'page-chat').hidden, false);
  app.element('rashi-reading').children[1].children[2].listeners.click();         // full Jathakam chip
  assert.equal(app.element('top').children.find(item => item.id === 'page-kundli').hidden, false);
});

function fakeAdMob() {
  const calls = [];
  return { calls, plugin: {
    initialize: async options => calls.push(['initialize', options]),
    requestConsentInfo: async () => ({ isConsentFormAvailable: true, status: 'REQUIRED' }),
    showConsentForm: async () => calls.push(['showConsentForm']),
    addListener: (name, handler) => { calls.push(['listener', name]); calls.handler = handler; },
    showBanner: async options => calls.push(['showBanner', options]),
  } };
}

test('the native app shows an AdMob banner only when the server switches ads on, and the page makes room for it', async () => {
  const on = fakeAdMob();
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob: on.plugin } },
    appAds: { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', testing: true } });
  await settle();
  const names = on.calls.map(call => call[0]);
  assert.deepEqual(names.filter(name => name !== 'listener'), ['initialize', 'showConsentForm', 'showBanner']);
  const banner = on.calls.find(call => call[0] === 'showBanner')[1];
  assert.equal(banner.position, 'BOTTOM_CENTER'); assert.equal(banner.isTesting, true); assert.equal(banner.adId, 'ca-app-pub-3940256099942544/6300978111');
  on.calls.handler({ width: 360, height: 50 });
  assert.equal(app.context.cssVars['--ad-height'], '50px');

  const off = fakeAdMob();
  boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob: off.plugin } }, appAds: null });
  await settle();
  assert.deepEqual(off.calls, []);                                       // switched off on the server: nothing is shown or even initialised

  const web = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), appAds: { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', testing: true } });
  await settle();                                                        // an ordinary browser has no AdMob plugin and simply shows no banner
  assert.equal(web.context.cssVars, undefined);
});


function fakeRewardedAdMob() {
  const calls = [], handlers = {};
  return { calls, handlers, plugin: {
    initialize: async () => {}, requestConsentInfo: async () => ({ status: 'NOT_REQUIRED' }), showBanner: async () => {},
    addListener: (name, handler) => { handlers[name] = handler; return { remove() { delete handlers[name]; } }; },
    prepareRewardVideoAd: async options => { calls.push(['prepareRewardVideoAd', options]); },
    showRewardVideoAd: async () => { calls.push(['showRewardVideoAd']); },
    prepareInterstitial: async options => { calls.push(['prepareInterstitial', options]); },
    showInterstitial: async () => { calls.push(['showInterstitial']); },
  } };
}
const rewardedConfig = { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', testing: true, rewarded_id: 'ca-app-pub-3940256099942544/5224354917', rewarded_kundli: true, rewarded_free_minutes: 10 };
async function typeInChat(app, text) {
  app.element('chat-question').value = text;
  app.element('chat-form').listeners.submit({ preventDefault() {} });
  await settle();
}

test('generating a Kundli asks the user to watch a rewarded ad first, and only calculates after the reward', async () => {
  const ad = fakeRewardedAdMob();
  const prompts = [];
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob: ad.plugin } },
    appAds: rewardedConfig, birth: syntheticBirth, confirm: message => { prompts.push(message); return true; } });
  await settle();
  await typeInChat(app, '15-08-1995'); await typeInChat(app, 'Hyderabad, IN'); await typeInChat(app, '6:30 am');
  assert.deepEqual(prompts, [calendar.tr('en', 'watchAdPrompt')]);
  assert.deepEqual(ad.calls.map(call => call[0]), ['prepareRewardVideoAd', 'showRewardVideoAd']);
  assert.equal(ad.calls[0][1].adId, rewardedConfig.rewarded_id); assert.equal(ad.calls[0][1].isTesting, true);
  assert.equal(birthRequests(app).length, 0);                         // nothing is calculated until the ad has been watched
  ad.handlers.onRewardedVideoAdReward({ type: 'coin', amount: 1 });
  ad.handlers.onRewardedVideoAdDismissed();
  await settle();
  assert.equal(birthRequests(app).length, 1);
  // a second Kundli within the free window needs no second ad
  await typeInChat(app, 'forget');   // (any chat text) keeps the app alive; the gate itself is what we assert next
  assert.equal(prompts.length, 1);
});

test('declining the ad does not calculate, and an ad that cannot load never blocks the user', async () => {
  const declined = fakeRewardedAdMob();
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob: declined.plugin } },
    appAds: rewardedConfig, birth: syntheticBirth, confirm: () => false });
  await settle();
  await typeInChat(app, '15-08-1995'); await typeInChat(app, 'Hyderabad, IN'); await typeInChat(app, '6:30 am');
  assert.deepEqual(declined.calls, []);
  assert.equal(birthRequests(app).length, 0);
  assert.equal(app.element('chat-log').children.at(-1).textContent, calendar.tr('en', 'chatAskTob'));

  const broken = fakeRewardedAdMob();
  const second = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob: broken.plugin } },
    appAds: rewardedConfig, birth: syntheticBirth, confirm: () => true });
  await settle();
  await typeInChat(second, '15-08-1995'); await typeInChat(second, 'Hyderabad, IN'); await typeInChat(second, '6:30 am');
  broken.handlers.onRewardedVideoAdFailedToLoad();
  await settle();
  assert.equal(birthRequests(second).length, 1);
});

test('without the rewarded switch (or outside the app) nothing is asked and the Kundli is calculated straight away', async () => {
  const ad = fakeRewardedAdMob();
  const plain = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob: ad.plugin } },
    appAds: { enabled: true, banner_id: rewardedConfig.banner_id, testing: true }, birth: syntheticBirth, confirm: () => { throw new Error('must not ask'); } });
  await settle();
  await typeInChat(plain, '15-08-1995'); await typeInChat(plain, 'Hyderabad, IN'); await typeInChat(plain, '6:30 am');
  assert.equal(birthRequests(plain).length, 1);
  const web = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), appAds: rewardedConfig, birth: syntheticBirth, confirm: () => { throw new Error('must not ask'); } });
  await settle();
  await typeInChat(web, '15-08-1995'); await typeInChat(web, 'Hyderabad, IN'); await typeInChat(web, '6:30 am');
  assert.equal(birthRequests(web).length, 1);
});


test('after the free AI questions of the day, a rewarded ad buys more; declining falls back to the free rule-based answer', async () => {
  const ad = fakeRewardedAdMob();
  const prompts = [];
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  let accept = true;
  const config = { enabled: true, banner_id: rewardedConfig.banner_id, testing: true, rewarded_id: rewardedConfig.rewarded_id, chat_free_questions: 2, chat_bonus_questions: 3 };
  const app = boot({ storage, capacitor: { Plugins: { AdMob: ad.plugin } }, appAds: config, assistant: true, birth: syntheticBirth, confirm: message => { prompts.push(message); return accept; } });
  await settle();
  const aiRequests = () => app.requests.filter(r => r.url === '/api/ask').length;
  await typeInChat(app, 'will my business grow'); await typeInChat(app, 'and my health');
  assert.equal(aiRequests(), 2); assert.equal(prompts.length, 0);                       // two free AI questions: no ad
  accept = false;
  await typeInChat(app, 'what about money');
  assert.equal(prompts.length, 1); assert.match(prompts[0], /2 free AI questions .* 3 more/);
  assert.equal(aiRequests(), 2);                                                         // declined: no AI call (the rule-based reading answers instead)
  assert.ok(app.element('chat-log').children.length >= 4);
  accept = true;
  await typeInChat(app, 'what about money');
  ad.handlers.onRewardedVideoAdReward({}); ad.handlers.onRewardedVideoAdDismissed();
  await settle();
  assert.equal(aiRequests(), 3);                                                         // the ad was watched: this question reaches the AI
  await typeInChat(app, 'one more'); await typeInChat(app, 'and another');
  assert.equal(aiRequests(), 5); assert.equal(prompts.length, 2);                       // 3 bonus questions: 1 used by the one above, 2 more with no new ad
  const saved = JSON.parse(storage.getItem('jyotisha.chatquota.v1'));
  assert.deepEqual([saved.used, saved.bonus], [5, 3]);
});

test('the AI chat has no daily limit in a browser or when the chat switch is off', async () => {
  const ad = fakeRewardedAdMob();
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const off = boot({ storage, capacitor: { Plugins: { AdMob: ad.plugin } }, appAds: { enabled: true, banner_id: rewardedConfig.banner_id, testing: true }, assistant: true, birth: syntheticBirth, confirm: () => { throw new Error('must not ask'); } });
  await settle();
  for (let n = 0; n < 12; n += 1) await typeInChat(off, `question ${n}`);
  assert.equal(off.requests.filter(r => r.url === '/api/ask').length, 12);
});

function fakeShare() {
  const calls = [];
  return { calls, plugin: { share: async options => { calls.push(options); } } };
}

test('Export / Share sends the Rashiphalalu, the Kundli and the AI chat as plain text through the native share sheet', async () => {
  const share = fakeShare();
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, capacitor: { Plugins: { Share: share.plugin } }, birth: syntheticBirth });
  await settle();

  app.element('export-rashi').listeners.click(); await settle();
  assert.equal(share.calls.length, 1);
  assert.match(share.calls[0].title, /Rashiphal/);
  // With a Kundli, the Rashiphal tab shows (and shares) your own sign only: Taurus for this synthetic chart.
  assert.match(share.calls[0].text, /Taurus/); assert.ok(!/Aries/.test(share.calls[0].text)); assert.match(share.calls[0].text, /Moon is the .* from this sign/);
  assert.match(share.calls[0].text, /— Jyotirmaya AstroChat/);                         // a short sign-off, so a forwarded message says where it came from

  app.element('export-kundli').listeners.click(); await settle();
  assert.equal(share.calls.length, 2);
  assert.match(share.calls[1].text, /Ascendant Leo/);                              // label and value stay apart (not "LagnaLeo")

  await typeInChat(app, 'how is my money');
  app.element('export-chat').listeners.click(); await settle();
  assert.equal(share.calls.length, 3);
  assert.match(share.calls[2].text, /Q: how is my money/); assert.match(share.calls[2].text, /A: /);
});

test('outside the app Export / Share uses the browser share sheet, and never breaks when sharing is cancelled or missing', async () => {
  const shared = [];
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage, navigator: { share: async options => { shared.push(options); } } });
  await settle();
  app.element('export-rashi').listeners.click(); await settle();
  assert.equal(shared.length, 1); assert.match(shared[0].text, /Aries/);

  const cancelled = boot({ storage, navigator: { share: async () => { const error = new Error('cancel'); error.name = 'AbortError'; throw error; } } });
  await settle();
  cancelled.element('export-rashi').listeners.click(); await settle();      // a cancelled share is not an error

  const none = boot({ storage });
  await settle();
  none.element('export-rashi').listeners.click(); await settle();           // no share support: falls back to a file download without throwing
});


test('with no share sheet available, Export / Share copies the text and says so, instead of silently doing nothing', async () => {
  const copied = [];
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage, navigator: { clipboard: { writeText: async text => { copied.push(text); } } } });
  await settle();
  app.element('export-rashi').listeners.click(); await settle();
  assert.equal(copied.length, 1); assert.match(copied[0], /Aries/); assert.match(copied[0], /— Jyotirmaya AstroChat/);
  const toast = app.context.document.body.children.at(-1);
  assert.equal(toast.textContent, calendar.tr('en', 'exportCopied'));

  // a native share that fails (for example an older app without the plugin) also falls back to copying
  const failing = [];
  const second = boot({ storage, capacitor: { Plugins: { Share: { share: async () => { throw new Error('not implemented'); } } } },
    navigator: { clipboard: { writeText: async text => { failing.push(text); } } } });
  await settle();
  second.element('export-rashi').listeners.click(); await settle();
  assert.equal(failing.length, 1);
});


test('the PDF button shows only the text to print and opens the print dialog (native plugin in the app, window.print in a browser)', async () => {
  const printed = [];
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage, capacitor: { isNativePlatform: () => true, Plugins: { PdfPrint: { print: async options => { printed.push(options); } } } } });
  await settle();
  app.element('pdf-rashi').listeners.click();
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(printed.length, 1); assert.match(printed[0].title, /Rashiphal/);
  const root = app.context.document.body.children.at(-1);
  assert.equal(root.id, 'print-root');
  const sheet = root.children[0];
  assert.match(sheet.children[0].textContent, /Rashiphal/);                   // heading
  const printedPage = JSON.stringify(sheet.children[1], (key, value) => (key === 'listeners' ? undefined : value));
  assert.match(printedPage, /Aries/);                                              // the page to print is a copy of the real Rashiphalalu cards
  assert.match(sheet.children[2].textContent, /Jyotirmaya AstroChat/);

  const shared = [];
  const older = boot({ storage, capacitor: { isNativePlatform: () => true, Plugins: { Share: { share: async o => { shared.push(o); } } } } });
  await settle();
  older.element('pdf-rashi').listeners.click(); await settle();             // an app without the PDF plugin shares the text instead
  assert.equal(shared.length, 1);

  let browserPrints = 0;
  const web = boot({ storage });
  web.context.window.print = () => { browserPrints += 1; };
  await settle();
  web.element('pdf-rashi').listeners.click();
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(browserPrints, 1);
});
