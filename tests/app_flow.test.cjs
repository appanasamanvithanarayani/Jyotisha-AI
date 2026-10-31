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
const day = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'day_panchang_bengaluru_2026-10-30.json'), 'utf8'));
const month = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'month_calendar_bengaluru_2026-10.json'), 'utf8'));

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
    if (url === '/api/birth-readiness') return reply({ can_calculate: true });
    if (url === '/api/month-calendar') return reply(month);
    if (url === '/api/day-panchang') return reply({ day: { ...day, date: JSON.parse(options.body).date } });
    if (url === '/api/nearby-place') return reply({ status: 'candidate', candidate: { value: setup.nearby || 'Mysuru, IN' } });
    return reply({ suggestions: [] });
  };
  const context = {
    document, fetch, Intl, Date, console, setTimeout, clearTimeout, navigator: setup.navigator || {}, FormData: class {},
    window: { JyotishaCalendar: calendar, JyotishaPanchangNames: names, JyotishaChart: chart, scrollTo() {}, localStorage: setup.storage },
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context);
  return { element, requests };
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
  return { getItem: key => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), read: () => JSON.parse(data.get('jyotisha.settings.v1') || 'null') };
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
