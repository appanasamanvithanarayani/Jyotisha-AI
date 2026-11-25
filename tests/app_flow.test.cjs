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
const art = require(path.join(root, 'art.js'));
const numerologyTool = require(path.join(root, 'numerology.js'));
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

test("the Android app's hardware Back button (window.__jyotishaBack) steps back through visited screens, then exits from Home", async () => {
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }) });
  await settle();
  const page = name => app.element('top').children.find(item => item.id === `page-${name}`).hidden === false;
  const back = () => app.context.window.__jyotishaBack();
  assert.ok(page('home'));
  assert.equal(back(), false);                 // already on Home: native should exit the app, not loop
  homeCard(app, 'Palm reading').listeners.click();
  assert.ok(page('palm'));
  homeCard(app, 'Tarot').listeners.click();
  assert.ok(page('tarot'));
  assert.equal(back(), true);
  assert.ok(page('palm'), 'Back goes to the screen actually visited before, not straight to Home');
  assert.equal(back(), true);
  assert.ok(page('home'));
  assert.equal(back(), false);                 // back on Home with nothing left: exit again
});

test('Android app: a newer Play Store version pops up an update card on Home, remembered as dismissed until a further update', async () => {
  const opened = [];
  const AppUpdate = {
    getAppUpdateInfo: async () => ({ updateAvailability: 2, currentVersionCode: '10', availableVersionCode: '11' }),
    openAppStore: async () => opened.push('store'),
  };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage, capacitor: { Plugins: { AppUpdate }, isNativePlatform: () => true } });
  await settle();
  await new Promise(resolve => setTimeout(resolve, 3000)); await settle();
  let popup = app.context.document.body.children.find(item => item.className === 'update-popup');
  assert.ok(popup, 'the update card appears once Home has settled');
  const [title, body, actions] = popup.children[0].children;
  assert.equal(title.textContent, 'Update available');
  assert.ok(body.textContent.length > 0);
  const [later, now] = actions.children;
  later.listeners.click();
  assert.equal(storage.getItem('jyotisha.update-dismissed.v1'), '11');

  // Dismissed: the same version does not pop up again on the next start.
  const again = boot({ storage, capacitor: { Plugins: { AppUpdate }, isNativePlatform: () => true } });
  await settle();
  await new Promise(resolve => setTimeout(resolve, 3000)); await settle();
  assert.ok(!again.context.document.body.children.some(item => item.className === 'update-popup'));

  // A further update (a higher availableVersionCode) is asked about again, and "Update now" opens the store.
  const Newer = { ...AppUpdate, getAppUpdateInfo: async () => ({ updateAvailability: 2, currentVersionCode: '10', availableVersionCode: '12' }) };
  const fresh = boot({ storage, capacitor: { Plugins: { AppUpdate: Newer }, isNativePlatform: () => true } });
  await settle();
  await new Promise(resolve => setTimeout(resolve, 3000)); await settle();
  popup = fresh.context.document.body.children.find(item => item.className === 'update-popup');
  assert.ok(popup, 'a newer availableVersionCode pops up again even though an earlier one was dismissed');
  popup.children[0].children[2].children[1].listeners.click();
  assert.deepEqual(opened, ['store']);
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
  removeChild(item) { this.children = this.children.filter(child => child !== item); return item; }
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
    if (url === '/api/birth-readiness') return reply({ can_calculate: true, assistant_available: setup.assistant === true, app_ads: setup.appAds || null, teasers: setup.teasers || null, payments: setup.payments || null });
    if (url === '/api/ask') return reply({ answer: 'AI answer' });
    if (url === '/api/nudges') return reply(setup.nudges || { status: 'off', batches: {} });
    if (url === '/api/rashiphal') return reply(setup.rashiphal || { status: 'off', readings: null, lucky: null });
    if (url === '/api/life-guide-text') return reply(setup.lifeGuideText ? { status: 'ok', variants: setup.lifeGuideText } : { status: 'off', variants: null });
    if (url === '/api/life-guide') { setup.lifeGuideCalls = (setup.lifeGuideCalls || 0) + 1; return reply(setup.lifeGuide ? { status: 'ok', reading: setup.lifeGuide, ...(setup.lifeGuidePersonal && JSON.parse(options.body).personal ? { personal: setup.lifeGuidePersonal } : {}) } : { status: 'ok' }); }
    if (url === '/api/moon-sign') return reply(setup.moonSign || { status: 'off', readings: null });
    if (url === '/api/tarot') return reply(setup.tarot || { status: 'off', reading: null });
    if (url === '/api/palm') { if (setup.palmDelay) await new Promise(resolve => setTimeout(resolve, setup.palmDelay)); return reply(setup.palm || { status: 'off', reading: null }); }
    if (url === '/api/partner-portrait') { (setup.partnerPortraitRequests || (setup.partnerPortraitRequests = [])).push(JSON.parse(options.body)); return reply(setup.partnerPortrait || { status: 'off', image: null }); }
    if (url === '/api/payment/create-order') { (setup.paymentOrders || (setup.paymentOrders = [])).push(JSON.parse(options.body)); return reply(setup.paymentOrder || { status: 'ok', order_id: 'order_test', amount: 900, currency: 'INR', key_id: 'rzp_test_abc' }); }
    if (url === '/api/payment/verify') { (setup.paymentVerifies || (setup.paymentVerifies = [])).push(JSON.parse(options.body)); return reply(setup.paymentVerify || { status: 'ok', feature: JSON.parse(options.body).feature }); }
    if (url === '/api/month-calendar') return reply(month);
    if (url === '/api/day-panchang') return reply({ day: { ...day, ...(setup.dayExtra || {}), date: JSON.parse(options.body).date } });
    if (url === '/api/birth-chart') return reply(setup.birth || {});
    if (url === '/api/nearby-place') return reply({ status: 'candidate', candidate: { value: setup.nearby || 'Mysuru, IN' } });
    return reply({ suggestions: [] });
  };
  const context = {
    document, fetch, Intl, Date, console, setTimeout, clearTimeout, navigator: setup.navigator || {}, FormData: class {},
    window: { JyotishaCalendar: calendar, JyotishaPanchangNames: names, JyotishaChart: chart, matchUI: match, JyotishaNudges: nudges, JyotishaArt: art, JyotishaNumerology: numerologyTool, scrollTo() {}, history: setup.history, addEventListener: setup.windowEvents ? (name, fn) => { setup.windowEvents[name] = fn; } : undefined, localStorage: setup.storage, Capacitor: setup.capacitor, confirm: setup.confirm, matchMedia: () => ({ matches: false }), Razorpay: setup.razorpay },
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
  app.element('welcome-form').listeners.submit({ preventDefault() {} });   // city -> the name and birth-date step
  app.element('profile-skip').listeners.click();
  await settle(); await settle();
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
  await new Promise(resolve => setTimeout(resolve, 800));                 // the city came from the location: it goes on by itself
  assert.equal(app.element('step-profile').hidden, false);                // to the name and birth-date step
  app.element('profile-skip').listeners.click();
  await settle(); await settle();
  assert.deepEqual(storage.read(), { lang: 'en', city: 'Mysuru, IN', useLocation: true });
  assert.equal(app.element('welcome-screen').hidden, true);

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
// Home's illustrated cards, in section order: Jathakam, Rashiphal | Kundli matching, Doshas | Festivals, Dasha.
const homeCards = app => app.element('tool-grid').children.flatMap(section => section.children[1].children);
const homeCard = (app, title) => homeCards(app).find(card => card.children[1].textContent === title);
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

test('Rashiphal opens on the user\'s own Moon sign once there is a Kundli, even if another sign was picked before', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  storage.setItem('jyotisha.rashi.v1', '9');                                       // looked at Dhanu earlier
  const app = boot({ storage, birth: syntheticBirth });
  await settle(); await settle();
  assert.equal(storage.getItem('jyotisha.rashi.v1'), '2');                          // the chart's Moon is in Vrishabha
  const tiles = app.element('rashi-picker').children;
  assert.equal(tiles[1].className, 'rashi-tile on');
  assert.match(tiles[1].children[2].textContent, /Yours/);
});

test('Rashiphal before a sign is picked shows only the symbol grid and a hint, not the old list of 12 cards', async () => {
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }) });
  await settle();
  assert.equal(app.element('rashi-picker').children.length, 12);
  assert.match(app.element('rashi-picker').children[0].children[0].textContent, /🐏/);
  assert.equal(app.element('rashi-list').children.length, 0);
  assert.equal(app.element('rashi-reading').children[0].className, 'rashi-hint');
});

// A pretend camera: the file input, FileReader, Image and canvas the palm page uses to shrink the photo.
function fakeCamera(app) {
  const created = [];
  const make = app.context.document.createElement;
  app.context.document.createElement = tag => {
    const node = make(tag);
    if (tag === 'input') { node.click = () => {}; created.push(node); }
    if (tag === 'canvas') { node.getContext = () => ({ drawImage() {} }); node.toDataURL = type => `data:${type};base64,SMALLPHOTO`; }
    return node;
  };
  app.context.FileReader = class { readAsDataURL() { this.result = 'data:image/jpeg;base64,BIGPHOTO'; setTimeout(() => this.onload(), 0); } };
  app.context.Image = class { set src(_value) { this.width = 3000; this.height = 4000; setTimeout(() => this.onload(), 0); } };
  return created;
}

test('Palm reading: pick a hand, tips, Scan opens the camera, the photo is shrunk and read, the lines are shown', async () => {
  const reading = { heart: 'Heart text.', head: 'Head text.', life: 'Life text.', fate: 'Fate text.', summary: 'Summary text.' };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), palm: { status: 'ok', reading } });
  await settle();
  const inputs = fakeCamera(app);
  homeCard(app, 'Palm reading').listeners.click();
  assert.equal(app.element('top').children.find(item => item.id === 'page-palm').hidden, false);
  let page = app.element('palmread').children;
  assert.equal(page[1].textContent, 'Step 1 · Pick a hand');
  const hands = page[2].children;
  assert.deepEqual(hands.map(h => h.children[1].textContent), ['Left palm', 'Right palm']);
  hands[0].listeners.click();                                                      // left
  page = app.element('palmread').children;
  assert.match(page[3].textContent || page[3].children.map(c => c.textContent).join(' '), /Tips for a clear scan/);
  page.find(item => item.className === 'palm-scan').listeners.click();
  assert.equal(inputs.length, 1); assert.equal(inputs[0].accept, 'image/*'); assert.equal(inputs[0].getAttribute('capture'), 'environment');
  inputs[0].files = [{ name: 'palm.jpg' }];
  await inputs[0].listeners.change();
  await settle(); await settle();
  const request = app.requests.find(r => r.url === '/api/palm');
  assert.equal(request.body.hand, 'left'); assert.equal(request.body.language, 'en');
  assert.equal(request.body.image, 'data:image/jpeg;base64,SMALLPHOTO');            // shrunk on the phone before sending
  // The result has tabs: Palm (life line + overview), Love (heart line), Career (head and fate lines); the Palm tab shows first.
  const result = app.element('palmread').children;
  const tabs = result.find(item => item.className === 'tabs-line');
  assert.equal(JSON.stringify(tabs.children.map(tab => tab.textContent)), '["Palm","Love","Career"]');
  const panels = result.filter(item => item.className === 'palm-panel');
  assert.equal(JSON.stringify(panels.map(panel => panel.hidden)), '[false,true,true]');
  const secs = panels.flatMap(panel => panel.children);
  assert.deepEqual(secs.map(sec => sec.children[0].textContent), ['🌱 Life line', '✨ Your palm says', '❤️ Heart line', '🧠 Head line', '⭐ Fate line']);
  assert.equal(secs[1].children[1].textContent, 'Summary text.');
  tabs.children[1].listeners.click();                                              // Love
  assert.equal(JSON.stringify(panels.map(panel => panel.hidden)), '[true,false,true]');
  assert.equal(tabs.children[1].className, 'on');
  const photoBox = result.find(item => item.className === 'palm-photo');
  assert.ok(photoBox && photoBox.children.some(item => item.className === 'palm-preview'));   // the user's own photo, from memory
  assert.ok(!result.some(item => item.className === 'rekha-legend'), 'no overlay legend: this reading has no line points');
});

test('Palm reading: when the AI traces lines, they are drawn over the photo with a legend and an estimate note', async () => {
  const points = { heart: [[0.2, 0.3], [0.5, 0.28], [0.8, 0.32]], life: [[0.3, 0.9], [0.4, 0.5]] };   // head and fate: not traced this time
  const reading = { heart: 'Heart text.', head: 'Head text.', life: 'Life text.', fate: 'Fate text.', summary: 'Summary text.', points };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), palm: { status: 'ok', reading } });
  await settle();
  const inputs = fakeCamera(app);
  homeCard(app, 'Palm reading').listeners.click();
  const hands = app.element('palmread').children[2].children; hands[0].listeners.click();
  app.element('palmread').children.find(item => item.className === 'palm-scan').listeners.click();
  inputs[0].files = [{ name: 'palm.jpg' }];
  await inputs[0].listeners.change();
  await settle(); await settle();
  const result = app.element('palmread').children;
  const photoBox = result.find(item => item.className === 'palm-photo');
  const svg = photoBox.children.find(item => item.tag === 'svg');
  assert.equal(svg.attributes.class, 'rekha-overlay');
  const legend = result.find(item => item.className === 'rekha-legend');
  assert.deepEqual(legend.children.map(chip => chip.children[1].textContent), ['Heart line', 'Life line']);   // only the traced lines
  const note = result.find(item => item.className === 'muted-note rekha-note');
  assert.match(note.textContent, /AI.s best guess/);
});

test('Palm reading: a photo without a clear palm asks for another one', async () => {
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), palm: { status: 'not_palm', reading: null } });
  await settle();
  const inputs = fakeCamera(app);
  homeCard(app, 'Palm reading').listeners.click();
  app.element('palmread').children.find(item => item.className === 'palm-scan').listeners.click();
  inputs[0].files = [{ name: 'sky.jpg' }];
  await inputs[0].listeners.change();
  await settle(); await settle();
  assert.match(app.element('palmread').children[1].textContent, /could not see a palm clearly/);
});

test('Tarot: pick a topic, pick 3 of 12 face-down cards, then past / present / future with the AI reading', async () => {
  const reading = { past: 'Past text.', present: 'Present text.', future: 'Future text.', advice: 'Advice text.' };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), tarot: { status: 'ok', reading } });
  await settle();
  homeCard(app, 'Tarot').listeners.click();
  assert.equal(app.element('top').children.find(item => item.id === 'page-tarot').hidden, false);
  let page = app.element('tarot').children;
  assert.equal(page[1].textContent, 'What do you want to ask the cards?');
  const topics = page[2].children;
  assert.deepEqual(topics.map(tile => tile.children[1].textContent), ['Love', 'Career', 'Money', 'Health', 'Luck', 'Family']);
  topics[1].listeners.click();                                                    // Career
  page = app.element('tarot').children;
  const spread = page.find(item => item.className === 'tarot-spread').children;
  assert.equal(spread.length, 12);
  assert.ok(spread[0].innerHTML.startsWith('<svg'));                              // card backs
  spread[2].listeners.click(); spread[2].listeners.click();                         // tapping the same card twice counts once
  assert.match(app.element('tarot').children.find(item => item.className === 'tarot-count').textContent, /1 of 3/);
  app.element('tarot').children.find(item => item.className === 'tarot-spread').children[5].listeners.click();
  app.element('tarot').children.find(item => item.className === 'tarot-spread').children[9].listeners.click();
  await settle();
  const request = app.requests.find(r => r.url === '/api/tarot');
  assert.equal(request.body.topic, 'career'); assert.equal(request.body.language, 'en');
  assert.equal(request.body.cards.length, 3); assert.equal(new Set(request.body.cards.map(c => c.id)).size, 3);
  assert.ok(request.body.cards.every(c => Number.isInteger(c.id) && c.id >= 0 && c.id < 22 && typeof c.reversed === 'boolean'));
  page = app.element('tarot').children;
  const faces = page.find(item => item.className === 'tarot-row').children;
  assert.deepEqual(faces.map(face => face.children[0].textContent), ['Past', 'Present', 'Future']);
  const secs = page.filter(item => /^tarot-sec/.test(item.className));
  assert.deepEqual(secs.map(sec => sec.children[1].textContent), ['Past text.', 'Present text.', 'Future text.', 'Advice text.']);
  page.find(item => item.className === 'tarot-actions').children[0].listeners.click();   // ask the AI about this draw
  await settle();
  assert.equal(app.element('top').children.find(item => item.id === 'page-chat').hidden, false);
  assert.ok(app.element('chat-log').children.some(item => /career tarot reading/i.test(item.textContent) || /Career tarot reading/.test(item.textContent)));
});

test('Tarot with the AI off shows the traditional meaning of each card', async () => {
  const app = boot({ storage: memoryStorage({ lang: 'te', city: 'Bengaluru, IN', useLocation: false }) });
  await settle();
  homeCard(app, 'టారో').listeners.click();
  app.element('tarot').children[2].children[0].listeners.click();                  // ప్రేమ (Love)
  for (const n of [0, 1, 2]) app.element('tarot').children.find(item => item.className === 'tarot-spread').children[n].listeners.click();
  await settle();
  const secs = app.element('tarot').children.filter(item => /^tarot-sec/.test(item.className));
  assert.equal(secs.length, 4);
  assert.ok(secs.slice(0, 3).every(sec => /: .+\.$/.test(sec.children[1].textContent)));   // card name: meaning.
  assert.match(secs[0].children[0].textContent, /^గతం · /);
});

test('Moon Sign page: your Vedic Moon sign and nakshatra, five AI sections, share, and any sign to explore', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const sections = { emotional: 'Calm and steady feelings.', love: 'Loyal in love.', career: 'Patient at work.', wellbeing: 'A morning walk.', remedy: 'Light a lamp on Fridays.' };
  const app = boot({ storage, birth: syntheticBirth, moonSign: { status: 'ok', readings: sections } });
  await settle(); await settle();
  const card = homeCard(app, 'Moon sign');
  assert.match(card.children[2].textContent, /^Taurus · /);                  // the chart's Moon is in Vrishabha
  card.listeners.click();
  await settle(); await settle();
  assert.equal(app.element('top').children.find(item => item.id === 'page-moon').hidden, false);
  const page = app.element('moonsign').children;
  assert.equal(page[0].className, 'page-head');                                // back, title, home, share
  assert.equal(page[0].children[1].textContent, 'Moon Sign');
  assert.ok(page[1].innerHTML.startsWith('<svg'));                             // the big moon
  assert.equal(page[2].textContent, '✦ Taurus ✦');
  assert.match(page[3].textContent, /^Nakshatra: /);
  const secs = page.filter(item => item.className === 'moon-sec');
  assert.deepEqual(secs.map(sec => sec.children[1].textContent), ['Emotional nature', 'Love & family', 'Work & money', 'Wellbeing', 'Simple remedy']);
  assert.equal(secs[4].children[2].textContent, 'Light a lamp on Fridays.');
  assert.ok(app.requests.some(r => r.url === '/api/moon-sign' && r.body.sign === 2 && r.body.language === 'en'));
  const pick = page.find(item => item.className === 'moon-pick').children;
  assert.equal(pick.length, 12); assert.match(pick[1].children[2].textContent, /Yours/);
  pick[5].listeners.click();                                                  // explore Virgo
  await settle();
  assert.equal(app.element('moonsign').children[2].textContent, '✦ Virgo ✦');
  assert.ok(app.requests.some(r => r.url === '/api/moon-sign' && r.body.sign === 6));
});

test('Moon Sign without a Kundli: only a birth date gives an approximate sign; nothing gives a prompt; AI off shows the built-in line', async () => {
  const none = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }) });
  await settle();
  homeCard(none, 'Moon sign').listeners.click();
  await settle();
  assert.match(none.element('moonsign').children[2].textContent, /Add your date of birth/);
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false, dob: '1995-08-15' }), birth: syntheticBirth });
  await settle();
  homeCard(app, 'Moon sign').listeners.click();
  await settle(); await settle();
  const page = app.element('moonsign').children;
  assert.equal(page[2].textContent, '✦ Taurus ✦');
  assert.match(page.find(item => item.className === 'moon-approx').textContent, /Approximate/);
  assert.ok(app.requests.some(r => r.url === '/api/birth-chart' && r.body.tob === '12:00' && r.body.dob === '1995-08-15'));
  const secs = page.filter(item => item.className === 'moon-sec');
  assert.equal(secs.length, 1);                                               // AI off: just the built-in description
  assert.match(secs[0].children[2].textContent, /Steady and loyal/);
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

test('Kundli matching can compare two other people, without needing your own chart', async () => {
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), birth: syntheticBirth });
  await settle();
  app.element('love-options').children[0].listeners.click();
  assert.equal(app.element('first-block').hidden, true);
  const who = app.element('match-who').children;
  who[1].listeners.click();                                       // Two other people
  assert.equal(app.element('first-block').hidden, false);
  assert.equal(app.element('role-row').hidden, true);
  assert.equal(app.element('relationship-status').textContent, '');   // no "create your own Kundli first"
  app.element('partner-dob').value = '1998-10-23'; app.element('partner-pob').value = 'Bengaluru, IN'; app.element('partner-tob').value = '12:35';
  await app.element('relationship-form').listeners.submit({ preventDefault() {} });
  assert.match(app.element('relationship-status').textContent, /both/i);   // the boy's details are missing
  app.element('first-dob').value = '1996-05-02'; app.element('first-pob').value = 'Hyderabad, IN'; app.element('first-tob').value = '06:10';
  await app.element('relationship-form').listeners.submit({ preventDefault() {} });
  const sent = birthRequests(app).map(item => item.body);
  assert.deepEqual(sent.at(-2), { dob: '1996-05-02', pob: 'Hyderabad, IN', tob: '06:10' });
  assert.deepEqual(sent.at(-1), { dob: '1998-10-23', pob: 'Bengaluru, IN', tob: '12:35' });
  assert.match(app.element('relationship-result').children[0].children[1].textContent, /^\d+ \/ 36$/);
});

test('Love page offers three choices, then shows Guna Milan out of 36 without saving partner birth details', async () => {
  const storage = memoryStorage({ lang: 'te', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth });
  await settle();
  assert.match(app.element('relationship-title').textContent, /ప్రేమ/);
  // Nothing is shown until the user picks one of the three options.
  const options = app.element('love-options').children;
  assert.equal(options.length, 3);
  assert.equal(app.element('love-match').hidden, true);
  assert.equal(app.element('love-reading').hidden, true);
  assert.equal(app.element('love-traits').hidden, true);
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

test('Love page: "Your ideal partner" reads relationship style from the 7th house and Venus, from your own chart alone', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth });
  await settle();
  const options = app.element('love-options').children;
  assert.equal(options[2].children[1].textContent, 'Your ideal partner');
  options[2].listeners.click();
  assert.equal(app.element('love-traits').hidden, false);
  assert.equal(app.element('love-match').hidden, true);
  const lines = app.element('relationship-traits-result').children;
  assert.match(lines[0].textContent, /not a prediction/);
  assert.equal(lines[1].textContent, 'Your 7th house of partnerships falls in Aquarius (lord: Saturn), so you’re often drawn to someone independent, original and friendly.');
  assert.equal(lines[2].textContent, 'Venus, the planet of love in your chart, sits in Virgo — affection tends to feel thoughtful, practical and detail-minded for you.');
  // No chart yet: a prompt to make one first, same as the other two modes.
  const empty = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }) });
  await settle();
  empty.element('love-options').children[2].listeners.click();
  assert.match(empty.element('relationship-traits-result').children[0].textContent, /Create your own Kundli first/);
});

test('"Your ideal partner": the illustration button sends only the two sign numbers and a gender, never free text', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const setup = { storage, birth: syntheticBirth, partnerPortrait: { status: 'ok', image: { mime: 'image/png', data: 'ZmFrZQ==' } } };
  const app = boot(setup);
  await settle();
  app.element('love-options').children[2].listeners.click();
  const btn = app.element('relationship-traits-result').children.find(item => item.tag === 'button');
  assert.equal(btn.textContent, '✨ See an illustrated impression');
  assert.ok(!/reward-btn/.test(btn.className));                 // no AdMob configured: free, no ad
  btn.listeners.click();
  await settle();
  assert.deepEqual(setup.partnerPortraitRequests, [{ house7_rashi: 11, venus_rashi: 6, gender: 'woman' }]);   // default role is groom -> illustrate a woman
  const result = app.element('relationship-traits-result');
  const imgIndex = result.children.findIndex(item => item.className === 'traits-portrait');
  const img = result.children[imgIndex];
  assert.equal(img.src, 'data:image/png;base64,ZmFrZQ==');
  assert.ok(!result.children.slice(imgIndex + 1).some(item => item.tag === 'p'));   // no disclaimer paragraph after the image
  const againBtn = result.children.find(item => item.tag === 'button');
  assert.equal(againBtn.textContent, '🔄 Generate again');   // can regenerate without leaving the card
});

test('"Your ideal partner": with no chart yet, fields right here (or a chat button) collect birth details instead of pointing at Kundli', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage, birth: syntheticBirth });
  await settle();
  app.element('love-options').children[2].listeners.click();
  const result = app.element('relationship-traits-result');
  assert.match(result.children[0].textContent, /Create your own Kundli first/);
  const form = result.children.find(item => item.tag === 'form');
  const [dobInput, pobInput, tobInput, submitBtn] = form.children; // (a status <p> follows, left for the submit handler)
  assert.equal(submitBtn.textContent, '✨ Make my Kundli');
  dobInput.value = '1995-08-15'; pobInput.value = 'Hyderabad, IN'; tobInput.value = '06:30';
  await form.listeners.submit({ preventDefault() {} });
  await settle();
  assert.ok(birthRequests(app).some(item => item.body.dob === '1995-08-15' && item.body.pob === 'Hyderabad, IN' && item.body.tob === '06:30'));
  assert.equal(app.element('chart').hidden, false);                 // the chart was actually calculated, in place
  assert.deepEqual(JSON.parse(storage.getItem('jyotisha.profile.v1')), { dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' });
});

test('"Your ideal partner": with no chart yet, the chat button is offered alongside the fields', async () => {
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }) });
  await settle();
  app.element('love-options').children[2].listeners.click();
  const chatBtn = app.element('relationship-traits-result').children.find(item => item.tag === 'button');
  assert.equal(chatBtn.textContent, '💬 Tell me your birth details in chat');
});

test('"Your ideal partner" in chat: typing a new birth date with a chart already on hand recalculates instead of asking the AI about that date', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth, assistant: true });
  await settle(); await settle();
  await typeInChat(app, '22-07-2004');
  assert.match(app.element('chat-log').children.at(-1).textContent, new RegExp(calendar.tr('en', 'chatAskPob').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));   // recalculating, not answered by the AI
  assert.ok(!app.requests.some(r => r.url === '/api/ask'));
  await typeInChat(app, 'Bengaluru, IN'); await typeInChat(app, '10:00 am');
  await settle();
  assert.equal(birthRequests(app).at(-1).body.dob, '2004-07-22');
  assert.ok(!app.requests.some(r => r.url === '/api/ask'));   // recalculated locally throughout, never asked the AI about the typed date
});

test('"Your ideal partner": a failed generation says so plainly, not that the Kundli itself is incomplete', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth, partnerPortrait: { status: 'unavailable', image: null } });
  await settle();
  app.element('love-options').children[2].listeners.click();
  app.element('relationship-traits-result').children.find(item => item.tag === 'button').listeners.click();
  await settle();
  const note = app.element('relationship-traits-result').children.find(item => item.className === 'muted-note' && /Could not create/.test(item.textContent));
  assert.ok(note, 'a distinct message, not the "chart data is incomplete" one');
});

test('"Your ideal partner" asked straight in chat: birth details are collected there if missing, then the illustration shows up in the chat log', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const setup = { storage, birth: syntheticBirth, partnerPortrait: { status: 'ok', image: { mime: 'image/png', data: 'ZmFrZQ==' } } };
  const app = boot(setup);
  await settle();
  await typeInChat(app, 'What will my ideal partner look like?');
  assert.equal(app.element('chat-log').children.at(-1).textContent, calendar.tr('en', 'chatAskDob'));
  await typeInChat(app, '15-08-1995'); await typeInChat(app, 'Hyderabad, IN'); await typeInChat(app, '6:30 am');
  await settle();
  assert.deepEqual(setup.partnerPortraitRequests, [{ house7_rashi: 11, venus_rashi: 6, gender: 'woman' }]);
  const img = app.element('chat-log').children.at(-1).children.find(item => item.className === 'traits-portrait');
  assert.equal(img.src, 'data:image/png;base64,ZmFrZQ==');
});

test('"Your ideal partner" asked in chat with a chart already on hand: generates right away, with no AI assistant round trip', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const setup = { storage, birth: syntheticBirth, assistant: true, partnerPortrait: { status: 'ok', image: { mime: 'image/png', data: 'ZmFrZQ==' } } };
  const app = boot(setup);
  await settle();
  await typeInChat(app, 'show me my future husband');
  await settle();
  assert.deepEqual(setup.partnerPortraitRequests, [{ house7_rashi: 11, venus_rashi: 6, gender: 'woman' }]);
  assert.ok(!app.requests.some(r => r.url === '/api/ask'));   // not sent to the general AI assistant
  const img = app.element('chat-log').children.at(-1).children.find(item => item.className === 'traits-portrait');
  assert.equal(img.src, 'data:image/png;base64,ZmFrZQ==');
});

test('Numerology asked straight in chat: Moolank and Bhagyank show up there, not only on the Numerology page', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth, assistant: true });
  await settle();
  await typeInChat(app, 'what is my numerology moolank and bhagyank');
  await settle();
  assert.ok(!app.requests.some(r => r.url === '/api/ask'));   // not sent to the general AI assistant
  const expected = numerologyTool.report('1995-08-15', '', 'en', new Date().getFullYear());
  const last = app.element('chat-log').children.at(-1);
  assert.match(last.children[0].textContent, /🔢/);
  assert.match(last.children.map(item => item.textContent).join(' '), new RegExp(String(expected.moolank.number)));
});

test('Life Guide asked straight in chat: today\'s balance for your own Moon sign, as a compact message', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const lifeGuide = { today: Object.fromEntries(['love', 'family', 'marriage', 'career', 'wealth', 'health'].map(area => [area, { score: 7, support: [] }])) };
  const app = boot({ storage, birth: syntheticBirth, lifeGuide, assistant: true });
  await settle();
  await typeInChat(app, 'show me my life guide balance for today');
  await settle();
  assert.ok(!app.requests.some(r => r.url === '/api/ask'));
  const last = app.element('chat-log').children.at(-1);
  assert.match(last.children[0].textContent, /⚖️/);
  assert.equal(last.children.length, 7);   // the heading plus all six areas
});

test('Tarot asked straight in chat: with a named area, draws three cards and shows the reading right there', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const reading = { past: 'Past text.', present: 'Present text.', future: 'Future text.', advice: 'Advice text.' };
  const app = boot({ storage, birth: syntheticBirth, tarot: { status: 'ok', reading }, assistant: true });
  await settle();
  await typeInChat(app, 'give me a tarot reading about my career');
  await settle();
  assert.ok(!app.requests.some(r => r.url === '/api/ask'));
  const last = app.element('chat-log').children.at(-1);
  assert.match(last.children[0].textContent, /🃏/);
  assert.match(last.children.map(item => item.textContent).join(' '), /Past text\./);
});

test('Tarot asked straight in chat: with no area named, asks which one first', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const reading = { past: 'Past text.', present: 'Present text.', future: 'Future text.', advice: 'Advice text.' };
  const app = boot({ storage, birth: syntheticBirth, tarot: { status: 'ok', reading } });
  await settle();
  await typeInChat(app, 'please give me a tarot reading');
  assert.match(app.element('chat-log').children.at(-1).textContent, /love|career|money|health|luck|family/i);
  await typeInChat(app, 'money please');
  await settle();
  const last = app.element('chat-log').children.at(-1);
  assert.match(last.children.map(item => item.textContent).join(' '), /Past text\./);
});

test('"Read my palm" asked straight in chat: jumps to the Palm page and opens the camera right away', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const stream = { getTracks: () => [{ stop() {} }] };
  const navigator = { mediaDevices: { getUserMedia: async () => stream } };
  const app = boot({ storage, birth: syntheticBirth, navigator });
  await settle();
  await typeInChat(app, 'read my palm please');
  await settle();
  assert.equal(app.element('top').children.find(item => item.id === 'page-palm').hidden, false);
  assert.ok(app.context.document.body.children.some(item => item.className === 'cam'), 'the camera opened directly');
});

test('"Your ideal partner": a Woman/Man toggle on the page itself picks the gender, with no need to visit Kundli matching first', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const setup = { storage, birth: syntheticBirth, partnerPortrait: { status: 'ok', image: { mime: 'image/png', data: 'ZmFrZQ==' } } };
  const app = boot(setup);
  await settle();
  app.element('love-options').children[2].listeners.click();
  const result = () => app.element('relationship-traits-result');
  const genderRow = () => result().children.find(item => item.className === 'seg');
  assert.deepEqual(genderRow().children.map(button => button.textContent), ['Woman', 'Man']);
  assert.equal(genderRow().children[0].className, 'on');   // Woman is pre-selected (default role is groom)
  genderRow().children[1].listeners.click();                // switch to Man
  assert.equal(genderRow().children[1].className, 'on');   // re-render makes new nodes; re-query instead of reusing the old one
  result().children.find(item => item.tag === 'button').listeners.click();
  await settle();
  assert.deepEqual(setup.partnerPortraitRequests, [{ house7_rashi: 11, venus_rashi: 6, gender: 'man' }]);
});

test('"Your ideal partner" illustration: off by default shows a plain note; a rewarded ad is asked for when switched on', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const off = boot({ storage, birth: syntheticBirth });
  await settle();
  off.element('love-options').children[2].listeners.click();
  off.element('relationship-traits-result').children.find(item => item.tag === 'button').listeners.click();
  await settle();
  assert.ok(off.element('relationship-traits-result').children.some(item => item.className === 'muted-note' && /not been turned on/.test(item.textContent)));

  const ad = fakeRewardedAdMob();
  const onStorage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  onStorage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const on = boot({ storage: onStorage, capacitor: { Plugins: { AdMob: ad.plugin } },
    birth: syntheticBirth, appAds: { ...resultsConfig, rewarded: { ...resultsConfig.rewarded, partner: true } },
    partnerPortrait: { status: 'ok', image: { mime: 'image/png', data: 'ZmFrZQ==' } } });
  await settle(); await settle();
  on.element('love-options').children[2].listeners.click();
  const btn = on.element('relationship-traits-result').children.find(item => item.tag === 'button');
  assert.match(btn.className, /reward-btn/);
  btn.listeners.click();
  await earnReward(ad);
  assert.ok(on.element('relationship-traits-result').children.some(item => item.className === 'traits-portrait'));
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
  assert.equal(app.element('tool-grid').children.length, 4);                  // four sections
  assert.deepEqual(app.element('tool-grid').children.map(section => section.children[0].textContent), ['Your chart', 'Palm, tarot & numbers', 'Love & match', 'Time & festivals']);
  assert.deepEqual(homeCards(app).map(card => card.children[1].textContent), ['Life Guide', 'Rashiphal', 'Moon sign', 'Dasha periods', 'Palm reading', 'Tarot', 'Numerology', 'Kundli matching', 'Sign match', 'Doshas', 'Today’s Panchang', 'Festivals']);
  assert.ok(homeCards(app)[0].children[0].innerHTML.startsWith('<svg'));       // an illustration on each card
  assert.equal(homeCard(app, 'Rashiphal').children[3].textContent, 'Daily');
  // Cards show something about the user: the Doshas card says Sade Sati is running; with a chart there is no Kundli nudge.
  assert.equal(homeCard(app, 'Doshas').children[2].textContent, 'Sade Sati: phase 2 of 3 running');
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
  homeCard(app, 'Doshas').listeners.click();                  // Doshas card opens the Kundli on the Doshas view
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
  assert.equal(homeCard(app, 'Doshas').children[2].textContent, 'Create your Kundli to see');
  assert.equal(app.element('greet-name').textContent, 'Namaste 🙏');            // no name given: a greeting instead
  assert.equal(app.element('home-today').hidden, true);
});

test('appearance: the mystic plum look by default; light/dark and an accent colour can be chosen and are remembered', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage });
  await settle();
  const root = app.context.document.documentElement;
  assert.equal(root.getAttribute('data-skin'), 'mystic');               // the default for everyone
  assert.equal(root.getAttribute('data-mode'), 'dark');
  app.element('theme-panel').hidden = true;           // as in the page markup
  app.element('theme-btn').listeners.click();
  const panel = app.element('theme-panel');
  assert.equal(panel.hidden, false);
  const [title, , modes] = panel.children;
  assert.match(title.textContent, /Appearance/);
  assert.deepEqual(modes.children.map(b => b.textContent), ['🔮 Mystic', '☀️ Light', '🌙 Dark', '📱 Auto']);
  modes.children[2].listeners.click();                 // Dark
  assert.equal(root.getAttribute('data-mode'), 'dark'); assert.equal(root.getAttribute('data-skin'), 'plain');
  app.element('theme-panel').children[4].children[2].listeners.click();   // Rose (colours show outside the mystic look)
  assert.equal(root.getAttribute('data-accent'), 'rose');
  assert.deepEqual(JSON.parse(storage.getItem('jyotisha.appearance.v2')), { mode: 'dark', accent: 'rose' });
  app.element('theme-panel').children[2].children[1].listeners.click();   // Light
  assert.equal(root.getAttribute('data-mode'), 'light');
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
  assert.deepEqual(JSON.parse(storage.getItem('jyotisha.notify.v1')), { on: true, asked: true, time: '07:00', evening: true, muhurta: true, shortcuts: true, teasers: true, eveningTime: '19:30' });
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
  assert.ok(!app.element('theme-panel').children.some(item => item.className === 'notify-settings'));   // nothing about what is scheduled
});

test('the pinned Shortcuts notification: shown in the user\'s language when notifications are on, buttons open the screens, and it can be switched off', async () => {
  const calls = [];
  let tap = null;
  const Shortcuts = {
    show: async options => { calls.push(['show', options]); return { shown: true }; },
    hide: async () => { calls.push(['hide']); },
    addListener: (name, fn) => { if (name === 'shortcut') tap = fn; },
  };
  const LocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [] }), cancel: async () => {}, addListener: () => {}, schedule: async () => {},
  };
  const storage = memoryStorage({ lang: 'te', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.notify.v1', JSON.stringify({ on: true, asked: true, time: '07:00' }));
  const app = boot({ storage, capacitor: { Plugins: { LocalNotifications, Shortcuts }, getPlatform: () => 'android' } });
  await settle(); await settle(); await settle();
  const shown = calls.filter(c => c[0] === 'show').at(-1)[1];
  assert.equal(shown.title, 'మీ నక్షత్రాలు, ఒక్క టచ్‌లో');
  assert.equal(JSON.stringify(shown.labels), JSON.stringify(['అరచేయి', 'రాశిఫలం', 'టారో', 'పొంతన']));   // (arrays from the app's sandbox)
  assert.equal(JSON.stringify(shown.pages), JSON.stringify(['palm', 'rashi', 'tarot', 'match']));
  const page = name => app.element('top').children.find(item => item.id === `page-${name}`);
  tap({ page: 'tarot' });
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(page('tarot').hidden, false);
  tap({ page: 'match' });
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.equal(page('relationship').hidden, false);
  // The Appearance panel does not show notification settings.
  app.element('theme-panel').hidden = true;
  app.element('theme-btn').listeners.click();
  assert.ok(!app.element('theme-panel').children.some(item => item.className === 'notify-settings'));
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
  assert.equal(texts.filter(text => text === 'AI answer').length, 1);              // the AI's reply, not the offline answer
  assert.equal(app.element('chat-log').children.at(-1).className, 'chat-chips');   // with the chips under it
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

test('first run like Palm AI: loading screen, a full-screen ad, language, city, name + birth date, another ad, then Home', async () => {
  const calls = [];
  const listeners = {};
  const AdMob = {
    initialize: async () => calls.push('initialize'), requestConsentInfo: async () => ({}), showConsentForm: async () => {},
    addListener: async (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); return { remove: async () => { listeners[name] = (listeners[name] || []).filter(f => f !== fn); } }; },
    prepareInterstitial: async options => calls.push(['prepare', options.adId]),
    showInterstitial: async () => { calls.push('showInterstitial'); setTimeout(() => (listeners.interstitialAdDismissed || []).forEach(fn => fn()), 5); },
    showBanner: async () => calls.push('showBanner'),
  };
  const storage = memoryStorage();
  const app = boot({ storage, capacitor: { Plugins: { AdMob } },
    appAds: { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', onboarding_interstitial_id: 'ca-app-pub-3940256099942544/1033173712', testing: true } });
  assert.equal(app.element('step-welcome').hidden, false);                 // the loading screen
  await new Promise(resolve => setTimeout(resolve, 3800));                 // it fills up (about 3.5 s) and goes on by itself
  await settle();
  assert.equal(calls.filter(c => c === 'showInterstitial').length, 1);     // ad no. 1
  assert.equal(app.element('step-language').hidden, false);
  app.element('language-next').listeners.click();
  app.element('welcome-city').value = 'Hyderabad, IN';
  app.element('welcome-form').listeners.submit({ preventDefault() {} });
  assert.equal(app.element('step-profile').hidden, false);
  app.element('welcome-name').value = 'Samanvitha';
  app.element('welcome-dob').value = '1994-03-18';
  app.element('welcome-tob').value = '07:45';
  app.element('profile-next').listeners.click();
  await settle();
  const building = app.context.document.body.children.find(item => item.className === 'chart-build');
  assert.ok(building, 'the chart-building animation shows once date, time and place are in');
  assert.equal(building.children[0].children[0].textContent, 'Placing your lights…');
  await new Promise(resolve => setTimeout(resolve, 3500)); await settle();
  assert.equal(calls.filter(c => c === 'showInterstitial').length, 2);     // ad no. 2
  assert.equal(app.element('welcome-screen').hidden, true);                // Home
  assert.ok(calls.includes('showBanner'));
  assert.equal(storage.read().name, 'Samanvitha'); assert.equal(storage.read().dob, '1994-03-18');
  assert.equal(app.element('greet-name').textContent, 'Samanvitha');        // Home greets by name
  assert.match(app.element('chat-log').children[0].textContent, /^Namaste Samanvitha! 🙏 I am Jyotirmaya, your astrologer/);   // and so does the astrologer
  assert.match(app.element('greet-time').textContent, /^Good (morning|afternoon|evening|night)$/);
  assert.deepEqual(JSON.parse(storage.getItem('jyotisha.profile.v1')), { dob: '1994-03-18', pob: 'Hyderabad, IN', tob: '07:45' });
  assert.ok(app.requests.some(r => r.url === '/api/birth-chart'));          // with a time, the Kundli is made right away
});

test('onboarding: once birth date, time and place are in, the chart-building animation places each planet and ends on the real Sun sign', async () => {
  const birth = {
    chart: {
      input: { birth_datetime: '2004-09-14T11:25:00+05:30' },
      ascendant: { rashi_index: 3, sidereal_longitude: 70.1 },
      positions: Object.fromEntries(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu']
        .map((name, n) => { const rashi = ((n + 7) % 12) + 1; return [name, { rashi_index: rashi, sidereal_longitude: 10 + n * 20, tropical_longitude: 34 + n * 20, whole_sign_bhava: (rashi - 3 + 12) % 12 + 1 }]; })),
      panchanga_at_birth: { tithi_index: 3, nakshatra_index: 17, nakshatra_pada: 2, yoga_index: 4, karana_half_tithi_index: 5 },
      vimshottari: { starting_lord: 'Saturn', balance_years_at_birth: 13.6 },
    },
    details: null, resolved_birth: null,
  };
  const app = boot({ storage: memoryStorage(), birth });
  await settle();
  app.element('welcome-next').listeners.click();
  app.element('language-next').listeners.click();
  app.element('welcome-city').value = 'Hyderabad, IN';
  app.element('welcome-form').listeners.submit({ preventDefault() {} });
  app.element('welcome-name').value = 'Krish';
  app.element('welcome-dob').value = '2004-09-14';
  app.element('welcome-tob').value = '11:25';
  app.element('profile-next').listeners.click();
  await settle();
  const body = () => app.context.document.body.children.find(item => item.className === 'chart-build');
  let overlay = body();
  assert.ok(overlay, 'the wheel shows while the real chart is being calculated');
  const [title, svg, recap, hint] = overlay.children[0].children;
  assert.equal(title.textContent, 'Placing your lights…');
  assert.equal(recap.textContent, '2004-09-14 · 11:25 · Hyderabad, IN');
  assert.ok(hint.textContent.length > 0);
  assert.equal(svg.children.filter(node => node.attributes.class === 'chart-build-sign').length, 12);   // all 12 signs on the wheel from the start
  await new Promise(resolve => setTimeout(resolve, 1500)); await settle();
  overlay = body();
  assert.ok(overlay, 'still on screen while the planets settle one by one');
  assert.ok(svg.children.some(node => node.attributes.class === 'chart-build-dot'), 'at least one planet has been placed by now');
  await new Promise(resolve => setTimeout(resolve, 2500)); await settle();
  assert.equal(svg.children.filter(node => node.attributes.class === 'chart-build-dot').length, 9);   // all nine planets placed
  assert.match(title.textContent, / Sun$/);   // the reveal: "<Sign> Sun"
  assert.equal(overlay.children[0].children.includes(hint), false, 'the loading hint is gone once the sign is revealed');
  await new Promise(resolve => setTimeout(resolve, 1000)); await settle();
  assert.equal(app.element('welcome-screen').hidden, true);   // onward to Home once the reveal has held for a moment
});

test('no ad on the welcome screens: the banner starts only after the first-run steps are done', async () => {
  const ads = fakeAdMob();
  const app = boot({ storage: memoryStorage(), capacitor: { Plugins: { AdMob: ads.plugin } },
    appAds: { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', testing: true } });
  await settle();
  assert.ok(!ads.calls.some(call => call[0] === 'showBanner'));                   // still on the welcome screens
  app.element('welcome-next').listeners.click();
  app.element('language-next').listeners.click();
  app.element('welcome-city').value = 'Hyderabad, IN';
  app.element('welcome-form').listeners.submit({ preventDefault() {} });
  app.element('profile-skip').listeners.click();
  await settle(); await settle();
  assert.ok(ads.calls.some(call => call[0] === 'showBanner'));                    // then the app shows it
});

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

const resultsConfig = { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', testing: true, rewarded_id: 'ca-app-pub-3940256099942544/5224354917',
  rewarded: { tarot: true, palm: true, rashiphal: true } };
const earnReward = async ad => { await settle(); ad.handlers.onRewardedVideoAdReward({}); ad.handlers.onRewardedVideoAdDismissed(); await settle(); await settle(); };

test('"▶ See my reading": Tarot asks for a rewarded ad after the third card, with no extra prompt, and an early close keeps the cards hidden', async () => {
  const ad = fakeRewardedAdMob();
  const reading = { past: 'Past text.', present: 'Present text.', future: 'Future text.', advice: 'Advice text.' };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob: ad.plugin } },
    appAds: resultsConfig, tarot: { status: 'ok', reading }, confirm: () => { throw new Error('no confirm dialog expected'); } });
  await settle(); await settle();
  homeCard(app, 'Tarot').listeners.click();
  app.element('tarot').children[2].children[0].listeners.click();
  for (const n of [0, 1, 2]) app.element('tarot').children.find(item => item.className === 'tarot-spread').children[n].listeners.click();
  let see = app.element('tarot').children.find(item => /reward-btn/.test(item.className));
  assert.equal(see.textContent, '▶ See my reading');
  assert.ok(!app.requests.some(r => r.url === '/api/tarot'));                // nothing is read (or paid for) before the ad
  see.listeners.click();
  await settle();
  ad.handlers.onRewardedVideoAdDismissed();                                    // closed early, no reward
  await settle();
  assert.ok(app.element('tarot').children.some(item => /reward-btn/.test(item.className)));
  see = app.element('tarot').children.find(item => /reward-btn/.test(item.className));
  see.listeners.click();
  await earnReward(ad);
  assert.ok(app.requests.some(r => r.url === '/api/tarot'));
  assert.ok(app.element('tarot').children.some(item => item.className === 'tarot-sec advice'));
  assert.deepEqual(ad.calls.filter(c => c[0] === 'showRewardVideoAd').length, 2);
});

function fakeRazorpay(outcome) {
  const calls = [];
  function Razorpay(options) { calls.push(options); this.options = options; }
  Razorpay.prototype.open = function () {
    if (outcome === 'success') Promise.resolve().then(() => this.options.handler({ razorpay_order_id: 'order_test', razorpay_payment_id: 'pay_test', razorpay_signature: 'sig_test' }));
    else Promise.resolve().then(() => this.options.modal.ondismiss());
  };
  return { Razorpay, calls };
}

test('"▶ See my reading": once payments are configured, a chooser offers "pay instead" alongside the free ad, and a real order is verified before unlocking', async () => {
  const ad = fakeRewardedAdMob();
  const rz = fakeRazorpay('success');
  const reading = { past: 'Past text.', present: 'Present text.', future: 'Future text.', advice: 'Advice text.' };
  const payments = { key_id: 'rzp_test_abc', chat_bonus_rs: 9, unlock_rs: 9 };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob: ad.plugin } },
    appAds: resultsConfig, payments, razorpay: rz.Razorpay, tarot: { status: 'ok', reading } });
  await settle(); await settle();
  homeCard(app, 'Tarot').listeners.click();
  app.element('tarot').children[2].children[0].listeners.click();
  for (const n of [0, 1, 2]) app.element('tarot').children.find(item => item.className === 'tarot-spread').children[n].listeners.click();
  const see = app.element('tarot').children.find(item => /reward-btn/.test(item.className));
  see.listeners.click();
  await settle();
  const chooser = app.context.document.body.children.find(item => item.className === 'update-popup');
  assert.ok(chooser, 'a chooser appears instead of jumping straight to the ad');
  const [payBtn, adBtn] = chooser.children[0].children[1].children;
  assert.equal(adBtn.textContent, '▶ Watch a free ad');
  assert.equal(payBtn.textContent, '💳 Pay ₹9 instead');
  assert.ok(!app.requests.some(r => r.url === '/api/payment/create-order'));
  payBtn.listeners.click();
  await settle(); await settle();
  assert.deepEqual(app.requests.find(r => r.url === '/api/payment/create-order').body, { feature: 'unlock' });
  assert.deepEqual(app.requests.find(r => r.url === '/api/payment/verify').body, { order_id: 'order_test', payment_id: 'pay_test', signature: 'sig_test', feature: 'unlock' });
  assert.ok(app.requests.some(r => r.url === '/api/tarot'));                 // unlocked by paying, no ad was shown
  assert.equal(ad.calls.filter(c => c[0] === 'showRewardVideoAd').length, 0);
  assert.ok(app.element('tarot').children.some(item => item.className === 'tarot-sec advice'));
});

test('"▶ See my reading": choosing the free ad from the chooser still plays a real rewarded ad', async () => {
  const ad = fakeRewardedAdMob();
  const reading = { past: 'Past text.', present: 'Present text.', future: 'Future text.', advice: 'Advice text.' };
  const payments = { key_id: 'rzp_test_abc', chat_bonus_rs: 9, unlock_rs: 9 };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob: ad.plugin } },
    appAds: resultsConfig, payments, tarot: { status: 'ok', reading } });
  await settle(); await settle();
  homeCard(app, 'Tarot').listeners.click();
  app.element('tarot').children[2].children[0].listeners.click();
  for (const n of [0, 1, 2]) app.element('tarot').children.find(item => item.className === 'tarot-spread').children[n].listeners.click();
  app.element('tarot').children.find(item => /reward-btn/.test(item.className)).listeners.click();
  await settle();
  const chooser = app.context.document.body.children.find(item => item.className === 'update-popup');
  const adBtn = chooser.children[0].children[1].children[1];
  adBtn.listeners.click();
  await earnReward(ad);
  assert.ok(app.requests.some(r => r.url === '/api/tarot'));
  assert.ok(!app.requests.some(r => r.url === '/api/payment/create-order'));
  assert.equal(ad.calls.filter(c => c[0] === 'showRewardVideoAd').length, 1);
});

test('"▶ See my reading": Palm waits for the ad after the photo; Rashiphal needs one ad a day', async () => {
  const ad = fakeRewardedAdMob();
  const reading = { heart: 'H.', head: 'He.', life: 'L.', fate: 'F.', summary: 'S.' };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const app = boot({ storage, capacitor: { Plugins: { AdMob: ad.plugin } }, appAds: resultsConfig, palm: { status: 'ok', reading } });
  await settle(); await settle();
  const inputs = fakeCamera(app);
  homeCard(app, 'Palm reading').listeners.click();
  app.element('palmread').children.find(item => item.className === 'palm-scan').listeners.click();   // the camera opens first
  inputs[0].files = [{ name: 'palm.jpg' }];
  await inputs[0].listeners.change(); await settle();
  assert.ok(!app.requests.some(r => r.url === '/api/palm'));
  app.element('palmread').children.find(item => /reward-btn/.test(item.className)).listeners.click();
  await earnReward(ad);
  assert.ok(app.requests.some(r => r.url === '/api/palm' && r.body.image === 'data:image/jpeg;base64,SMALLPHOTO'));
  // Rashiphal: locked until one ad today, then open for the rest of the day
  homeCard(app, 'Rashiphal').listeners.click();
  app.element('rashi-picker').children[4].listeners.click();                  // Simha
  const lock = app.element('rashi-reading').children;
  assert.match(lock[1].textContent, /one short ad/);
  lock[2].listeners.click();
  await earnReward(ad);
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  assert.equal(storage.getItem('jyotisha.rashi-unlock.v1'), iso);
  assert.ok(!app.element('rashi-reading').children.some(item => /reward-btn/.test(item.className || '')));
  app.element('rashi-picker').children[5].listeners.click();                  // another sign: no second ad today
  assert.ok(!app.element('rashi-reading').children.some(item => /reward-btn/.test(item.className || '')));
});

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

test('after the free AI questions, paying instead of watching an ad also buys more, once payments are configured', async () => {
  const ad = fakeRewardedAdMob();
  const rz = fakeRazorpay('success');
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const config = { enabled: true, banner_id: rewardedConfig.banner_id, testing: true, rewarded_id: rewardedConfig.rewarded_id, chat_free_questions: 1, chat_bonus_questions: 3 };
  const payments = { key_id: 'rzp_test_abc', chat_bonus_rs: 9, unlock_rs: 9 };
  const app = boot({ storage, capacitor: { Plugins: { AdMob: ad.plugin } }, appAds: config, payments, razorpay: rz.Razorpay, assistant: true, birth: syntheticBirth });
  await settle();
  const aiRequests = () => app.requests.filter(r => r.url === '/api/ask').length;
  await typeInChat(app, 'will my business grow');
  assert.equal(aiRequests(), 1);                                  // the one free question
  await typeInChat(app, 'what about money');
  await settle();
  const chooser = app.context.document.body.children.find(item => item.className === 'update-popup');
  assert.ok(chooser, 'the chooser appears instead of a plain window.confirm');
  assert.match(chooser.children[0].children[0].textContent, /1 free AI questions .* 3 more/);
  chooser.children[0].children[1].children[0].listeners.click();   // pay instead
  await settle(); await settle();
  assert.deepEqual(app.requests.find(r => r.url === '/api/payment/create-order').body, { feature: 'chat_bonus' });
  assert.equal(aiRequests(), 2);
  assert.equal(ad.calls.filter(c => c[0] === 'showRewardVideoAd').length, 0);
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
  storage.setItem('jyotisha.rashi.v1', '1');                                      // Aries picked
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
  storage.setItem('jyotisha.rashi.v1', '1');                                      // Aries picked
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
  storage.setItem('jyotisha.rashi.v1', '1');                                      // Aries picked
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

test('the phone Back button returns to the previous screen instead of closing the app', async () => {
  const stack = [];
  const history = { pushState(state) { stack.push(state); }, replaceState(state) { stack[Math.max(stack.length - 1, 0)] = state; } };
  const windowEvents = {};
  const app = boot({ history, windowEvents });
  await enter(app, 'en');
  const page = name => app.element('top').children.find(item => item.id === `page-${name}`);
  assert.equal(stack.length, 1);
  assert.equal(stack[0].page, 'home');
  homeCard(app, 'Tarot').listeners.click();
  assert.equal(page('tarot').hidden, false);
  assert.equal(stack.at(-1).page, 'tarot');
  const pushed = stack.length;
  windowEvents.popstate({ state: { page: 'home' } });       // the phone's Back button
  assert.equal(page('home').hidden, false);
  assert.equal(page('tarot').hidden, true);
  assert.equal(stack.length, pushed);                         // going back does not add a new step
});

test('numerology works out Moolank, Bhagyank, name number and personal year on the phone', () => {
  const N = require(path.join(root, 'numerology.js'));
  assert.equal(N.moolank('1995-08-15'), 6);                       // 15 -> 1+5
  assert.equal(N.bhagyank('1995-08-15'), 2);                      // 1+9+9+5+0+8+1+5 = 38 -> 11 -> 2
  assert.equal(N.moolank('2000-01-29'), 2);                       // 29 -> 11 -> 2
  assert.deepEqual(N.nameNumber('Samanvitha'), { compound: 31, number: 4 });   // Chaldean values
  assert.equal(N.nameNumber('సమన్విత'), null);                     // the name number needs English letters
  assert.equal(N.personalYear('1995-08-15', 2026), 6);            // 1+5 + 8 + 2+0+2+6 = 24 -> 6
  assert.equal(N.parse('2023-02-30'), null);
  const report = N.report('1995-08-15', 'Samanvitha', 'te', 2026);
  assert.equal(report.moolank.planet, 'Venus');
  assert.equal(report.moolank.title, 'ప్రేమమూర్తి');
  assert.equal(report.harmony, true);                              // 4 is friendly to 6
  assert.equal(JSON.stringify(report.lucky.numbers), JSON.stringify([6, 2, 4, 5]));
  assert.equal(N.report('1995-08-15', '', 'ta', 2026).moolank.title, 'The Nurturer');   // other languages: English
  for (const lang of Object.keys(N.TEXT)) for (let n = 1; n <= 9; n += 1) {
    const item = N.TEXT[lang].numbers[n];
    assert.ok(item.title && item.nature && item.strengths && item.care && N.TEXT[lang].years[n], `${lang} ${n}`);
  }
});

test('the numerology page uses the saved birth date, shows the numbers, and can be changed', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false, name: 'Samanvitha', dob: '1995-08-15' });
  const app = boot({ storage });
  await settle();
  assert.equal(homeCard(app, 'Numerology').children[2].textContent, 'Moolank 6 · Bhagyank 2');
  homeCard(app, 'Numerology').listeners.click();
  const page = name => app.element('top').children.find(item => item.id === `page-${name}`);
  assert.equal(page('numbers').hidden, false);
  const box = app.element('numerology');
  const tiles = box.children.find(item => item.className === 'num-tiles');
  assert.equal(JSON.stringify(tiles.children.map(tile => tile.children[0].textContent)), '["6","2","4"]');
  assert.ok(box.children.some(item => item.className === 'num-sec' && item.children[0].textContent === 'Moolank 6 · The Nurturer'));
  assert.ok(box.children.some(item => item.className === 'num-lucky'));
  // "Change" shows the form; a wrong date is refused, a new one gives new numbers.
  box.children.find(item => item.className === 'num-who').children[1].listeners.click();
  const form = () => box.children.find(item => item.className === 'num-form');
  const input = id => form().children.map(field => field.children[1]).find(item => item && item.id === id);
  input('num-dob').value = 'nope';
  form().listeners.submit({ preventDefault() {} });
  assert.equal(form().children.at(-1).textContent, 'Please enter a valid date of birth.');
  input('num-dob').value = '2000-01-29'; input('num-name').value = '';
  form().listeners.submit({ preventDefault() {} });
  assert.equal(JSON.stringify(box.children.find(item => item.className === 'num-tiles').children.map(tile => tile.children[0].textContent)), '["2","5"]');
  assert.ok(box.children.some(item => item.className === 'num-note' && /English letters/.test(item.textContent)));
});

test('the side menu lists every feature, opens one, and Back closes the menu first', async () => {
  const stack = [];
  const history = { pushState(state) { stack.push(state); }, replaceState(state) { stack[Math.max(stack.length - 1, 0)] = state; }, back() { stack.pop(); } };
  const windowEvents = {};
  const app = boot({ history, windowEvents });
  await enter(app, 'en');
  const page = name => app.element('top').children.find(item => item.id === `page-${name}`);
  const items = () => app.element('side-list').children;
  app.element('menu-btn').listeners.click();
  assert.equal(app.element('side-menu').hidden, false);
  assert.equal(stack.length, 2);                                        // home + the open menu
  const labels = items().map(item => item.children[1].textContent);
  for (const label of ['Home', 'Ask AI', 'Jathakam', 'Rashiphal', 'Moon sign', 'Palm reading', 'Tarot', 'Numerology', 'Kundli matching', 'Sign match', 'Doshas', 'Festivals', 'Today’s Panchang', 'Appearance']) {
    assert.ok(labels.includes(label), label);
  }
  assert.equal(items()[0].className, 'side-item on');                  // Home is the current page
  items().find(item => item.children[1].textContent === 'Tarot').listeners.click();
  assert.equal(app.element('side-menu').hidden, true);
  assert.equal(page('tarot').hidden, false);
  assert.equal(JSON.stringify(stack.map(item => item.page)), JSON.stringify(['home', 'tarot']));   // the menu step became Tarot
  // Open the menu again and press the phone's Back: only the menu closes.
  app.element('menu-btn').listeners.click();
  stack.pop(); windowEvents.popstate({ state: { page: 'tarot' } });   // what the browser does on Back
  assert.equal(app.element('side-menu').hidden, true);
  assert.equal(page('tarot').hidden, false);
  // Tapping outside closes it too and removes its history step.
  app.element('menu-btn').listeners.click();
  app.element('side-scrim').listeners.click();
  assert.equal(app.element('side-menu').hidden, true);
  assert.equal(stack.length, 2);
});

test('Home starts with today: date, weekday, year, tithi and nakshatra, and a tap opens the full Panchang', async () => {
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }) });
  await settle(); await settle();
  const strip = app.element('today-strip');
  assert.equal(strip.hidden, false);
  assert.equal(strip.children[0].textContent, '30 Oct | Daily Panchang · Friday, 2026');   // date | name · weekday, year
  assert.match(strip.children[1].textContent, / · .* ›$/);                        // tithi · nakshatra ›
  strip.listeners.click();
  assert.equal(app.element('top').children.find(item => item.id === 'page-home').hidden, false);
});

test('when switched on, each later opening of the app shows the loading screen, one full-screen ad, then Home', async () => {
  const calls = [], listeners = {};
  const AdMob = {
    initialize: async () => calls.push('initialize'), requestConsentInfo: async () => ({}), showConsentForm: async () => {},
    addListener: async (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); return { remove: async () => { listeners[name] = (listeners[name] || []).filter(f => f !== fn); } }; },
    prepareInterstitial: async options => calls.push(['prepare', options.adId]),
    showInterstitial: async () => { calls.push('showInterstitial'); setTimeout(() => (listeners.interstitialAdDismissed || []).forEach(fn => fn()), 5); },
    showBanner: async () => calls.push('showBanner'),
  };
  const appAds = { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', launch_interstitial_id: 'ca-app-pub-3940256099942544/1033173712', testing: true };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.launch-ad.v1', '1');                                 // remembered from the last start
  const app = boot({ storage, capacitor: { Plugins: { AdMob }, isNativePlatform: () => true }, appAds });
  await settle();
  assert.equal(app.element('welcome-screen').hidden, false);                     // the loading screen
  assert.ok(!calls.includes('showBanner'));
  await new Promise(resolve => setTimeout(resolve, 2900)); await settle();
  assert.equal(calls.filter(c => c === 'showInterstitial').length, 1);
  assert.ok(calls.some(c => Array.isArray(c) && c[1] === 'ca-app-pub-3940256099942544/1033173712'));
  assert.equal(app.element('welcome-screen').hidden, true);                      // then Home, with the banner
  assert.ok(calls.includes('showBanner'));

  // Switched off on the server: the next start goes straight to Home.
  const later = boot({ storage, capacitor: { Plugins: { AdMob }, isNativePlatform: () => true }, appAds: { ...appAds, launch_interstitial_id: undefined } });
  await new Promise(resolve => setTimeout(resolve, 900)); await settle();
  assert.equal(storage.getItem('jyotisha.launch-ad.v1'), '0');
  const shown = calls.filter(c => c === 'showInterstitial').length;
  const fresh = boot({ storage, capacitor: { Plugins: { AdMob }, isNativePlatform: () => true }, appAds });
  await new Promise(resolve => setTimeout(resolve, 900)); await settle();
  assert.equal(fresh.element('welcome-screen').hidden, true);                    // Home, and no ad when the last start had it off
  assert.equal(calls.filter(c => c === 'showInterstitial').length, shown);
  assert.ok(later);
});

test('reading reminders: every hour in the day, a different true teaser each time, and a tap opens that feature', async () => {
  const calls = { schedule: [] };
  const LocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [] }), cancel: async () => {},
    schedule: async ({ notifications }) => { calls.schedule.push(notifications); },
    addListener: (name, fn) => { if (name === 'localNotificationActionPerformed') LocalNotifications.tap = fn; },
  };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.notify.v1', JSON.stringify({ on: true, asked: true }));
  const app = boot({ storage, capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' }, teasers: { every_hours: 1, from: 9, to: 21 } });
  for (let i = 0; i < 6; i += 1) await settle();
  const teasers = calls.schedule.at(-1).filter(item => item.id >= 7300 && item.id < 7490);
  assert.ok(teasers.length >= 78 && teasers.length <= 91, String(teasers.length));      // 13 a day (9 to 21) for a week
  assert.ok(teasers.every(item => item.schedule.at.getMinutes() === 0 && item.schedule.at.getHours() >= 9 && item.schedule.at.getHours() <= 21));
  assert.ok(teasers.every((item, i) => i === 0 || item.title !== teasers[i - 1].title));  // never the same one twice in a row
  assert.ok(teasers.some(item => item.title === '📜 Your Jathakam is 30 seconds away'));  // no chart yet: it does not say "ready"
  assert.ok(!teasers.some(item => item.title === '📜 Your Jathakam is ready'));
  const palm = teasers.find(item => item.extra.page === 'palm');
  LocalNotifications.tap({ notification: { extra: palm.extra } });
  assert.equal(app.element('top').children.find(item => item.id === 'page-palm').hidden, false);
  // Switched off in the app: none are scheduled.
  storage.setItem('jyotisha.notify.v1', JSON.stringify({ on: true, asked: true, teasers: false }));
  calls.schedule.length = 0;
  boot({ storage, capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' }, teasers: { every_hours: 1, from: 9, to: 21 } });
  for (let i = 0; i < 6; i += 1) await settle();
  assert.ok(calls.schedule.length && !calls.schedule.at(-1).some(item => item.id >= 7300 && item.id < 7490));
});

test('reading reminders use the AI-written lines of each day when there are some, mixed with the built-in ones', async () => {
  const calls = { schedule: [] };
  const LocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [] }), cancel: async () => {},
    schedule: async ({ notifications }) => { calls.schedule.push(notifications); }, addListener: () => {},
  };
  const iso = offset => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const batches = {};
  for (let offset = 0; offset < 7; offset += 1) {
    batches[iso(offset)] = { questions: [], dasha: [], sign: [], good: [], bad: [], teasers: {
      palm: [{ t: '✋ Your palm has a secret', b: 'One tap to find out 🤫' }],
      tarot: [{ t: '🃏 Dare to pick three?', b: 'The cards know something about love.' }],
      kundli: [{ t: '📜 Your chart has news', b: 'This one is about your dasha.' }] } };
  }
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.notify.v1', JSON.stringify({ on: true, asked: true }));
  boot({ storage, capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' },
    teasers: { every_hours: 1, from: 9, to: 21 }, nudges: { status: 'ok', batches } });
  for (let i = 0; i < 6; i += 1) await settle();
  const teasers = calls.schedule.at(-1).filter(item => item.id >= 7300 && item.id < 7490);
  const titles = teasers.map(item => item.title);
  assert.ok(titles.includes('✋ Your palm has a secret') && titles.includes('✋ Your palm is waiting to be read'));   // AI and built-in mixed
  assert.ok(titles.includes('🃏 Dare to pick three?'));
  assert.ok(!titles.includes('📜 Your chart has news'));        // no chart yet: the AI's Jathakam line is not used
});

test('timing alerts: Vijaya starts, Rahu Kalam is over, Yamagandam and Varjyam start, and the user’s own rashi good time / Ashtama Chandra, 5 AM to 9 PM', async () => {
  const calls = { schedule: [] };
  const LocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [] }), cancel: async () => {},
    schedule: async ({ notifications }) => { calls.schedule.push(notifications); },
    addListener: (name, fn) => { if (name === 'localNotificationActionPerformed') LocalNotifications.tap = fn; },
  };
  const d = new Date(); d.setDate(d.getDate() + 1);
  const T = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const mine = syntheticBirth.chart.positions.Moon.rashi_index, other = (mine % 12) + 1;
  const dayExtra = {
    timings: { abhijit: [`${T}T11:40`, `${T}T12:27`], rahu_kalam: [`${T}T10:30`, `${T}T12:00`], yamaganda: [`${T}T15:00`, `${T}T16:30`],
      vijaya_muhurta: [`${T}T14:00`, `${T}T14:48`], brahma_muhurta: [`${T}T04:30`, `${T}T05:18`] },
    varjyam: [{ nakshatra_index: 1, starts_at: `${T}T18:00`, ends_at: `${T}T19:30` }, { nakshatra_index: 2, starts_at: `${T}T22:00`, ends_at: `${T}T23:30` }],
    moon_rashi: [
      { index: 1, starts_at: `${T}T00:00`, ends_at: `${T}T03:00`, good_chandrabalam_rashis: [other], ashtama_chandra_rashi: other },
      { index: 2, starts_at: `${T}T03:00`, ends_at: `${T}T13:00`, good_chandrabalam_rashis: [mine], ashtama_chandra_rashi: other },   // starts at night
      { index: 3, starts_at: `${T}T13:00`, ends_at: `${T}T23:59`, good_chandrabalam_rashis: [other], ashtama_chandra_rashi: mine } ],
  };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.notify.v1', JSON.stringify({ on: true, asked: true }));
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  boot({ storage, birth: syntheticBirth, dayExtra, capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' }, teasers: { every_hours: 1, from: 5, to: 21 } });
  for (let i = 0; i < 8; i += 1) await settle();
  const all = calls.schedule.at(-1);
  const alerts = all.filter(item => item.id >= 7200 && item.id < 7300);
  const at = title => alerts.filter(item => item.title === title).map(item => `${item.schedule.at.getHours()}:${String(item.schedule.at.getMinutes()).padStart(2, '0')}`);
  assert.deepEqual([...at('🏆 Vijaya muhurta has started')], ['14:00']);
  assert.deepEqual([...at('✅ Rahu Kalam is over')], ['12:00']);
  assert.deepEqual([...at('⚠️ Yamagandam has started')], ['15:00']);
  assert.deepEqual([...at('⛔ Varjyam has started')], ['18:00']);                       // the 22:00 one is after 9 PM
  const good = alerts.filter(item => /your good time starts now/.test(item.title));
  assert.equal(good.length, 1);
  assert.equal(good[0].schedule.at.getHours(), 5);                                       // began at 3 AM: told at 5 AM
  assert.match(good[0].body, /Chandrabalam is strong for you till/);
  const care = alerts.filter(item => /go slow till/.test(item.title));
  assert.equal(care.length, 1); assert.equal(care[0].schedule.at.getHours(), 13); assert.equal(care[0].extra.page, 'rashi');
  assert.ok(alerts.every(item => item.schedule.at.getHours() >= 5 && item.schedule.at.getHours() * 60 + item.schedule.at.getMinutes() <= 21 * 60));
  // The hourly reminders do not pause for them: every hour from 5 AM to 9 PM tomorrow has one.
  const teasers = all.filter(item => item.id >= 7300 && item.id < 7490 && item.schedule.at.getDate() === d.getDate());
  assert.equal(JSON.stringify(teasers.map(item => item.schedule.at.getHours())), JSON.stringify([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]));
  // A tap on a timing alert opens today's Panchang.
  LocalNotifications.tap({ notification: { extra: { page: 'panchang' } } });
});

test('opening the app: the loading screen stays until today’s Panchang is ready, and a saved one shows at once', async () => {
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  const native = { Plugins: {}, isNativePlatform: () => true };
  const app = boot({ storage, capacitor: native });
  await settle();
  // the fake server answers at once, so the screen fills up and goes away quickly
  await new Promise(resolve => setTimeout(resolve, 800)); await settle();
  assert.equal(app.element('welcome-screen').hidden, true);
  assert.equal(app.element('dp-tables').children.length, 7);                       // the Panchang is there when Home shows
  // Today's Panchang saved on the phone: the next opening shows it straight away, without the loading screen.
  const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  storage.setItem('jyotisha.today.v1', JSON.stringify({ city: 'Bengaluru, IN', day: { ...day, date: today, today_local_date: today } }));
  const again = boot({ storage, capacitor: native });
  assert.equal(again.element('dp-date').value, today);                            // before any network reply
  assert.equal(again.element('dp-tables').children.length, 7);
  await settle();
  assert.equal(again.element('welcome-screen').hidden, true);
  // A saved Panchang for another city is not used.
  storage.setItem('jyotisha.today.v1', JSON.stringify({ city: 'Mysuru, IN', day: { ...day, date: today, today_local_date: today } }));
  const other = boot({ storage, capacitor: native });
  assert.notEqual(other.element('dp-date').value, today);
});

test('first start: language cards with a tick, birth-date wheels that only count once turned, and an ad box on those steps', async () => {
  const calls = [];
  const AdMob = {
    initialize: async () => calls.push('initialize'), requestConsentInfo: async () => ({}), showConsentForm: async () => {},
    addListener: async () => ({ remove: async () => {} }),
    showBanner: async options => calls.push(['showBanner', options.adSize]), removeBanner: async () => calls.push('removeBanner'),
    prepareInterstitial: async () => {}, showInterstitial: async () => {},
  };
  const storage = memoryStorage();
  const app = boot({ storage, capacitor: { Plugins: { AdMob } },
    appAds: { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', onboarding_banner: true, testing: true } });
  await settle();
  app.element('welcome-next').listeners.click();
  await settle(); await settle();
  // Language: a card per language; tapping one selects it and switches the screen's language.
  const cards = app.element('language-list').children;
  assert.ok(cards.length >= 3);
  assert.equal(cards[0].children[1].children[0].textContent, 'English');
  const telugu = cards.find(card => card.children[1].children[1].textContent === 'Telugu');
  telugu.listeners.click();
  assert.equal(app.element('language-choice').value, 'te');
  const again = app.element('language-list').children.find(card => card.children[1].children[1].textContent === 'Telugu');
  assert.equal(again.getAttribute('aria-checked'), 'true'); assert.equal(again.children[2].textContent, '✓');
  assert.ok(calls.some(c => Array.isArray(c) && c[1] === 'MEDIUM_RECTANGLE'));      // the ad box under the list
  app.element('language-next').listeners.click();
  app.element('welcome-city').value = 'Hyderabad, IN';
  app.element('welcome-form').listeners.submit({ preventDefault() {} });
  await settle();
  // Birth date: untouched wheels give no date; turning them fills it in.
  const dob = app.element('dob-wheels').children, tob = app.element('tob-wheels').children;
  assert.equal(dob.length, 3); assert.equal(tob.length, 3);                       // day, month, year · hour : minute
  assert.ok(!app.element('welcome-dob').value);
  const pick = (wheelBox, text) => wheelBox.children[0].children.find(item => item.textContent === text).listeners.click();
  pick(dob[0], '15'); pick(dob[2], '1995');
  assert.equal(app.element('welcome-dob').value, '1995-01-15');
  assert.ok(!app.element('welcome-tob').value);                                    // birth time stays optional
  pick(tob[0], '06'); pick(tob[2], '30');
  assert.equal(app.element('welcome-tob').value, '06:30');
  app.element('profile-next').listeners.click();
  await new Promise(resolve => setTimeout(resolve, 3500)); await settle(); await settle();
  const removed = calls.indexOf('removeBanner'), adaptive = calls.findIndex(c => Array.isArray(c) && c[1] === 'ADAPTIVE_BANNER');
  assert.ok(removed >= 0 && adaptive > removed);                                    // the ad box goes before the usual banner
  assert.equal(storage.read().dob, '1995-01-15');
});

test('notifications that open a screen get a button that opens it too', async () => {
  const calls = { schedule: [], types: null };
  const LocalNotifications = {
    checkPermissions: async () => ({ display: 'granted' }), requestPermissions: async () => ({ display: 'granted' }),
    getPending: async () => ({ notifications: [] }), cancel: async () => {},
    registerActionTypes: async ({ types }) => { calls.types = types; },
    schedule: async ({ notifications }) => { calls.schedule.push(notifications); }, addListener: () => {},
  };
  const storage = memoryStorage({ lang: 'te', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.notify.v1', JSON.stringify({ on: true, asked: true }));
  boot({ storage, capacitor: { Plugins: { LocalNotifications }, getPlatform: () => 'android' }, teasers: { every_hours: 1, from: 5, to: 21 } });
  for (let i = 0; i < 6; i += 1) await settle();
  assert.equal(calls.types[0].id, 'JYOTI_OPEN');
  assert.equal(calls.types[0].actions[0].title, 'ఇప్పుడే చూడండి');
  const teasers = calls.schedule.at(-1).filter(item => item.id >= 7300 && item.id < 7490);
  assert.ok(teasers.length && teasers.every(item => item.actionTypeId === 'JYOTI_OPEN'));
});

test('the phone’s status and navigation bars follow the app’s look in the Android app', async () => {
  const calls = [];
  const SystemBars = { set: async options => { calls.push(options); } };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { SystemBars } } });
  await settle();
  assert.deepEqual({ ...calls.at(-1) }, { color: '#1a0b24', light: false });          // the mystic plum, light icons
  app.element('theme-btn').listeners.click();
  app.element('theme-panel').children[2].children[1].listeners.click();               // Light
  assert.deepEqual({ ...calls.at(-1) }, { color: '#fff7e8', light: true });           // cream, dark icons
  app.element('theme-panel').children[2].children[2].listeners.click();               // Dark
  assert.deepEqual({ ...calls.at(-1) }, { color: '#1c1f25', light: false });
});

test('feature pages get a header (back, title, home, share once there is a reading); the loader shows % and a fun fact; the menu can share and rate the app', async () => {
  const reading = { heart: 'Heart text.', head: 'Head text.', life: 'Life text.', fate: 'Fate text.', summary: 'Summary text.' };
  const history = { stack: ['home'], length: 2, pushState() {}, replaceState() {}, back() { this.went = true; } };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), palm: { status: 'ok', reading }, palmDelay: 60, history });
  await settle();
  const inputs = fakeCamera(app);
  homeCard(app, 'Palm reading').listeners.click();
  let head = app.element('palmread').children[0];
  assert.equal(head.className, 'page-head');
  assert.equal(head.children[1].textContent, 'Palm Analysis');
  assert.equal(head.children[2].children.length, 1);                                // only the home icon: nothing to share yet
  head.children[0].listeners.click();                                              // back = the phone's back
  assert.equal(history.went, true);
  app.element('palmread').children.find(item => item.className === 'palm-hands').children[0].listeners.click();
  app.element('palmread').children.find(item => item.className === 'palm-scan').listeners.click();
  inputs[0].files = [{ name: 'palm.jpg' }];
  const reading1 = inputs[0].listeners.change();
  await new Promise(resolve => setTimeout(resolve, 25));
  const loading = app.element('palmread').children.find(item => item.className === 'loader');   // while the AI reads
  assert.ok(loading);
  assert.equal(loading.children[2].children[1].textContent.slice(-1), '%');          // the % next to the bar
  assert.ok(loading.children[3].children[1].textContent.length > 20);                 // a fun fact
  await reading1; await settle(); await settle();
  head = app.element('palmread').children[0];
  assert.equal(head.children[2].children.length, 2);                                // home + share, now there is a reading
  // the menu has Share app and Rate app
  app.element('menu-btn').listeners.click();
  const labels = app.element('side-list').children.map(item => item.children[1].textContent);
  assert.ok(labels.includes('Share app') && labels.includes('Rate app'));
});

test('the bottom banner is hidden on the Ask page and comes back on the other screens', async () => {
  const calls = [];
  const AdMob = {
    initialize: async () => {}, requestConsentInfo: async () => ({}), showConsentForm: async () => {},
    addListener: () => {}, showBanner: async () => calls.push('show'), hideBanner: async () => calls.push('hide'), resumeBanner: async () => calls.push('resume'),
  };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), capacitor: { Plugins: { AdMob } },
    appAds: { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', testing: true } });
  await settle();
  assert.deepEqual(calls, ['show']);
  const link = href => app.context.document.querySelectorAll('.bottom-nav a').find(a => a.getAttribute('href') === href);
  void link;                                                                       // the fake DOM has no nav links: use the menu
  app.element('menu-btn').listeners.click();
  app.element('side-list').children.find(item => item.children[1].textContent === 'Ask AI').listeners.click();
  assert.deepEqual(calls, ['show', 'hide']);
  app.element('menu-btn').listeners.click();
  app.element('side-list').children.find(item => item.children[1].textContent === 'Home').listeners.click();
  assert.deepEqual(calls, ['show', 'hide', 'resume']);
});

test('Life Guide: tabs, six balance bars and the by-area list from the server’s scores, for your Moon sign or any sign', async () => {
  const period = scores => Object.fromEntries(['love', 'family', 'marriage', 'career', 'wealth', 'health'].map((area, i) => [area, { score: scores[i], support: i === 0 ? ['Venus', 'Moon'] : [] }]));
  const lifeGuide = { yesterday: period([5, 5, 5, 5, 5, 5]), today: period([8, 6, 4, 7, 5, 3]), tomorrow: period([6, 6, 6, 6, 6, 6]), month: period([4, 4, 4, 4, 4, 4]), year: period([9, 9, 9, 9, 9, 9]) };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), birth: syntheticBirth, lifeGuide });
  await settle();
  assert.equal(homeCards(app)[0].children[1].textContent, 'Life Guide');
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const own = boot({ storage, birth: syntheticBirth, lifeGuide });
  await settle(); await settle();
  homeCard(own, 'Life Guide').listeners.click();
  await settle(); await settle();
  const page = () => own.element('lifeguide').children;
  assert.equal(page()[0].className, 'page-head');
  assert.match(page().find(item => item.className === 'lg-sign').children[0].textContent, /Your sign: Taurus/);   // the chart's Moon is in Vrishabha
  const tabs = page().find(item => item.className === 'tabs-line');
  assert.equal(JSON.stringify(tabs.children.map(tab => tab.textContent)), '["Yesterday","Today","Tomorrow","This month","This year"]');
  assert.equal(tabs.children[1].className, 'on');                                  // Today
  const bars = () => page().find(item => item.className === 'lg-bars').children;
  assert.equal(JSON.stringify(bars().map(col => col.children[0].textContent)), '["8/10","6/10","4/10","7/10","5/10","3/10"]');
  assert.equal(JSON.stringify(bars().map(col => col.children[2].textContent)), '["Love","Family","Marriage","Career","Wealth","Health"]');
  assert.equal(bars()[0].children[1].children[0].style.height, '80%');             // the bar is 8 tenths full
  const aspects = page().filter(item => /^lg-aspect/.test(item.className));
  assert.equal(aspects.length, 6);
  assert.equal(aspects[0].children[1].textContent, 'Warmth comes easily. A good time to share your feelings.');   // 8: high band
  assert.equal(aspects[2].children[1].textContent, 'Patience helps. Postpone big decisions and avoid arguments.');   // 4: low band
  assert.equal(aspects[0].children[2].textContent, 'Supported by Venus, Moon');
  assert.equal(own.requests.filter(r => r.url === '/api/life-guide').length, 1);
  assert.equal(own.requests.find(r => r.url === '/api/life-guide').body.sign, 2);
  tabs.children[4].listeners.click();                                              // This year
  assert.equal(page().find(item => item.className === 'lg-bars').children[0].children[0].textContent, '9/10');
  assert.equal(own.requests.filter(r => r.url === '/api/life-guide').length, 1);   // all tabs came with one request
  // Another sign: the tiles under the page
  page().find(item => item.className === 'lg-sign').children[1].listeners.click();   // Change
  const tiles = page().find(item => item.className === 'moon-pick').children;
  assert.equal(tiles.length, 12);
  tiles[5].listeners.click();                                                      // Virgo
  await settle();
  assert.equal(own.requests.filter(r => r.url === '/api/life-guide').at(-1).body.sign, 6);
  // Without a chart or a birth date: pick a sign first, nothing is requested
  const none = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), lifeGuide });
  await settle();
  homeCard(none, 'Life Guide').listeners.click();
  await settle();
  assert.match(none.element('lifeguide').children.find(item => item.className === 'tarot-ask').textContent, /Pick your sign/);
  assert.equal(none.requests.filter(r => r.url === '/api/life-guide').length, 0);
});

test('Sign match: two circles, a sign grid, the button stays grey until both signs are chosen, then the 12-point result', async () => {
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }) });
  await settle();
  homeCard(app, 'Sign match').listeners.click();
  const page = () => app.element('signmatch').children;
  assert.equal(page()[0].className, 'page-head');
  const circles = () => page().find(item => item.className === 'sm-slots').children;
  assert.equal(circles()[0].children[1].textContent, 'Choose a sign');
  const see = () => page().find(item => /palm-scan/.test(item.className));
  assert.equal(see().disabled, true); assert.match(see().className, /is-off/);               // grey: nothing chosen
  const tiles = () => page().find(item => item.className === 'moon-pick').children;
  tiles()[0].listeners.click();                                                                // Aries as "You"
  assert.equal(circles()[0].children[1].textContent, 'Aries');
  assert.match(circles()[2].className, /on/);                                                  // on to the partner circle
  assert.equal(see().disabled, true);
  tiles()[7].listeners.click();                                                                // Scorpio as the partner
  assert.equal(see().disabled, false);
  see().listeners.click();
  await settle();
  const result = page().find(item => item.className === 'sm-result');
  assert.equal(result.children[0].textContent, '42%');                                         // Mars lords both (5/5), but 6/8 apart (0/7)
  assert.equal(result.children[1].textContent, 'Average match');
  assert.equal(result.children[3].children[1].textContent, '5 / 5');
  assert.equal(result.children[4].children[1].textContent, '0 / 7');
  assert.match(result.children[5].textContent, /Bhakoot dosha/);
  page().find(item => /chip-btn/.test(item.className) && /36-point/.test(item.textContent)).listeners.click();
  assert.equal(app.element('top').children.find(item => item.id === 'page-relationship').hidden, false);
});

test('Palm camera inside the app: a hand outline, a shutter, one warning when too dark, then the photo is read; gallery and close work', async () => {
  const reading = { heart: 'Heart text.', head: 'Head text.', life: 'Life text.', fate: 'Fate text.', summary: 'Summary text.' };
  let stopped = 0, brightness = 200;
  const stream = { getTracks: () => [{ stop() { stopped += 1; } }] };
  const navigator = { mediaDevices: { getUserMedia: async constraints => { navigator.asked = constraints; return stream; } } };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), palm: { status: 'ok', reading }, navigator });
  await settle();
  const realCreate = app.context.document.createElement;
  app.context.document.createElement = tag => {
    const node = realCreate(tag);
    if (tag === 'canvas') {
      node.getContext = () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(32 * 32 * 4).fill(brightness) }) });
      node.toDataURL = () => 'data:image/jpeg;base64,CAMPHOTO';
    }
    return node;
  };
  homeCard(app, 'Palm reading').listeners.click();
  const scan = () => app.element('palmread').children.find(item => /palm-scan/.test(item.className));
  await scan().listeners.click();
  await settle();
  assert.equal(navigator.asked.video.facingMode.ideal, 'environment'); assert.equal(navigator.asked.audio, false);
  const overlay = app.context.document.body.children.find(item => item.className === 'cam');
  assert.ok(overlay);
  const [video, outline, hint, close, bar] = overlay.children;
  assert.equal(hint.textContent, 'Place your open palm inside the outline');
  assert.equal(outline.tag, 'svg');
  assert.equal(video.muted, true);
  // too dark: one warning, the overlay stays; the second press goes ahead
  brightness = 10;
  await bar.children[1].listeners.click();
  assert.match(hint.textContent, /Too dark/); assert.equal(stopped, 0);
  await bar.children[1].listeners.click();
  await settle(); await settle();
  assert.equal(stopped, 1);                                                          // the camera is released
  const request = app.requests.find(r => r.url === '/api/palm');
  assert.equal(request.body.image, 'data:image/jpeg;base64,CAMPHOTO'); assert.equal(request.body.hand, 'right');
  const photoBox2 = app.element('palmread').children.find(item => item.className === 'palm-photo');
  assert.ok(photoBox2 && photoBox2.children.some(item => item.className === 'palm-preview'));
  // closing releases the camera without reading anything
  app.requests.length = 0;
  homeCard(app, 'Palm reading').listeners.click();
  await scan().listeners.click(); await settle();
  const second = app.context.document.body.children.filter(item => item.className === 'cam').at(-1);
  second.children[3].listeners.click();
  assert.equal(stopped, 2); assert.ok(!app.requests.some(r => r.url === '/api/palm'));
  // no camera permission: the phone's camera app is used instead
  navigator.mediaDevices.getUserMedia = async () => { throw new Error('denied'); };
  const inputs = fakeCamera(app);
  homeCard(app, 'Palm reading').listeners.click();
  await scan().listeners.click(); await settle();
  assert.equal(inputs.length, 1); assert.equal(inputs[0].getAttribute('capture'), 'environment');
});

test('chat answers get a read-aloud button and a row of chips into the other features, replaced by each new answer', async () => {
  const spoken = [];
  class Utterance { constructor(text) { this.text = text; } }
  const storage = memoryStorage({ lang: 'te', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth, assistant: true });
  app.context.window.speechSynthesis = { speaking: false, speak(item) { spoken.push(item); }, cancel() { spoken.push('cancel'); } };
  app.context.window.SpeechSynthesisUtterance = Utterance;
  await settle();
  app.element('home-question').value = 'Will my plans work out?';
  app.element('home-ask').listeners.submit({ preventDefault() {} });
  await settle(); await settle();
  const log = () => app.element('chat-log').children;
  const answer = log().find(item => item.className === 'chat-message assistant' && /AI answer/.test(item.textContent));
  assert.ok(answer);
  const listen = answer.children.find(item => item.className === 'ai-bar').children.find(item => item.className === 'ai-listen');
  listen.listeners.click();
  assert.equal(spoken[0].text, 'AI answer'); assert.equal(spoken[0].lang, 'te-IN');   // in the language of the app
  const chips = log().at(-1);
  assert.equal(chips.className, 'chat-chips');
  assert.equal(chips.children.length, 4);
  assert.equal(chips.children[0].textContent, '✋ నా అరచేతి రేఖలు');
  chips.children[0].listeners.click();                                                // opens the palm page
  assert.equal(app.element('top').children.find(item => item.id === 'page-palm').hidden, false);
  // A new question removes the old chips; the next answer gets a different set.
  app.element('chat-question').value = 'And my health?';
  app.element('chat-form').listeners.submit({ preventDefault() {} });
  await settle(); await settle();
  assert.equal(log().filter(item => item.className === 'chat-chips').length, 1);
  assert.notEqual(log().at(-1).children[0].textContent, chips.children[0].textContent);
});

test('Life Guide: Today is free; the other tabs carry a video icon and open after one rewarded ad for that sign for the day', async () => {
  const ad = fakeRewardedAdMob();
  const period = scores => Object.fromEntries(['love', 'family', 'marriage', 'career', 'wealth', 'health'].map((area, i) => [area, { score: scores[i], support: [] }]));
  const lifeGuide = { yesterday: period([5, 5, 5, 5, 5, 5]), today: period([8, 6, 4, 7, 5, 3]), tomorrow: period([6, 6, 6, 6, 6, 6]), month: period([4, 4, 4, 4, 4, 4]), year: period([9, 9, 9, 9, 9, 9]) };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth, lifeGuide, capacitor: { Plugins: { AdMob: ad.plugin } }, appAds: { ...resultsConfig, rewarded: { lifeguide: true } } });
  await settle(); await settle();
  homeCard(app, 'Life Guide').listeners.click();
  await settle(); await settle();
  const page = () => app.element('lifeguide').children;
  let tabs = page().find(item => item.className === 'tabs-line');
  assert.equal(JSON.stringify(tabs.children.map(tab => tab.className)), '["locked","on","locked","locked","locked"]');   // Today free, the others carry the video icon
  assert.ok(page().some(item => item.className === 'lg-unlock-note'));
  tabs.children[4].listeners.click();                                              // This year: an ad first
  await settle();
  assert.equal(ad.calls.filter(c => c[0] === 'showRewardVideoAd').length, 1);
  assert.equal(page().find(item => item.className === 'tabs-line').children[1].className, 'on');   // still Today until the ad is earned
  await earnReward(ad);
  tabs = page().find(item => item.className === 'tabs-line');
  assert.equal(tabs.children[4].className, 'on');                                  // the year tab is open now
  assert.ok(tabs.children.every(tab => !/locked/.test(tab.className)));           // and so are the others (one ad per sign per day)
  assert.ok(!page().some(item => item.className === 'lg-unlock-note'));
  tabs.children[0].listeners.click();                                              // Yesterday: no second ad
  await settle();
  assert.equal(ad.calls.filter(c => c[0] === 'showRewardVideoAd').length, 1);
  assert.ok(JSON.parse(storage.getItem('jyotisha.lg-unlock.v1')).signs.includes(2));   // remembered for the day
  // Another sign is locked again.
  page().find(item => item.className === 'lg-sign').children[1].listeners.click();
  page().find(item => item.className === 'moon-pick').children[5].listeners.click();
  await settle();
  assert.match(page().find(item => item.className === 'tabs-line').children[3].className, /locked/);
});

test('Sign match, Moon sign and Numerology: rewarded ads when switched on; your own Moon sign stays free', async () => {
  const ad = fakeRewardedAdMob();
  const config = { ...resultsConfig, rewarded: { signmatch: true, moon: true, numbers: true } };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false, name: 'Sam', dob: '1995-08-15' });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth, capacitor: { Plugins: { AdMob: ad.plugin } }, appAds: config, moonSign: { status: 'ok', readings: {} } });
  await settle(); await settle();
  const shown = () => ad.calls.filter(c => c[0] === 'showRewardVideoAd').length;
  // Sign match: the button plays an ad first (and carries the video icon)
  homeCard(app, 'Sign match').listeners.click();
  const tiles = () => app.element('signmatch').children.find(item => item.className === 'moon-pick').children;
  tiles()[0].listeners.click(); tiles()[7].listeners.click();
  const see = () => app.element('signmatch').children.find(item => /palm-scan/.test(item.className));
  assert.match(see().className, /reward-btn/);
  see().listeners.click(); await settle();
  assert.equal(shown(), 1);
  assert.ok(!app.element('signmatch').children.some(item => item.className === 'sm-result'));   // not yet
  await earnReward(ad);
  assert.ok(app.element('signmatch').children.some(item => item.className === 'sm-result'));
  // Moon sign: another sign asks for an ad, your own does not
  homeCard(app, 'Moon sign').listeners.click();
  await settle(); await settle();
  const moonTiles = () => app.element('moonsign').children.find(item => item.className === 'moon-pick').children;
  moonTiles()[1].listeners.click(); await settle();                                // Taurus is the chart's own Moon sign: free
  assert.equal(shown(), 1);
  moonTiles()[5].listeners.click(); await settle();                                // Virgo: an ad
  assert.equal(shown(), 2);
  await earnReward(ad);
  // Numerology: the form asks for an ad, the saved date of birth does not
  homeCard(app, 'Numerology').listeners.click();
  assert.ok(app.element('numerology').children.some(item => item.className === 'num-tiles'));   // shown from the saved date, no ad
  assert.equal(shown(), 2);
  app.element('numerology').children.find(item => item.className === 'num-who').children[1].listeners.click();   // Change
  const form = app.element('numerology').children.find(item => item.className === 'num-form');
  form.children[0].children[1].value = '2000-01-29';
  assert.match(form.children[2].className, /reward-btn/);
  form.listeners.submit({ preventDefault() {} }); await settle();
  assert.equal(shown(), 3);
});

test('the banner is also hidden while the palm camera is open (it would cover the shutter) and comes back when it closes', async () => {
  const hidden = [];
  const AdMob = { initialize: async () => {}, requestConsentInfo: async () => ({}), showConsentForm: async () => {}, addListener: () => {},
    showBanner: async () => {}, hideBanner: async () => hidden.push('hide'), resumeBanner: async () => hidden.push('resume') };
  const stream = { getTracks: () => [{ stop() {} }] };
  const navigator = { mediaDevices: { getUserMedia: async () => stream } };
  const app = boot({ storage: memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false }), navigator, capacitor: { Plugins: { AdMob } }, appAds: { enabled: true, banner_id: 'ca-app-pub-3940256099942544/6300978111', testing: true } });
  await settle();
  homeCard(app, 'Palm reading').listeners.click();
  await app.element('palmread').children.find(item => /palm-scan/.test(item.className)).listeners.click();
  await settle();
  assert.deepEqual(hidden, ['hide']);                                                // the shutter is not covered by the banner
  app.context.document.body.children.find(item => item.className === 'cam').children[3].listeners.click();   // close
  assert.deepEqual(hidden, ['hide', 'resume']);
});

test('the AI gets the whole chart to reason from: every house with its lord, the Navamsa and the dated dasha timeline', async () => {
  const planets = Object.fromEntries(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'].map((name, n) => [name, { rashi_index: n + 1, whole_sign_bhava: (n + 1 - 5 + 12) % 12 + 1 }]));
  const dasha = { current_mahadasha: 'Venus', mahadasha: [{ lord: 'Venus', start: '2020-01-01', end: '2040-01-01', current: true }, { lord: 'Sun', start: '2040-01-01', end: '2046-01-01' }],
    antardasha: [{ lord: 'Moon', start: '2025-01-01', end: '2026-01-01', current: false }, { lord: 'Mars', start: '2026-01-01', end: '2027-06-01', current: true }] };
  const birth = { ...syntheticBirth, details: { planets, dasha, navamsa: { lagna_rashi_index: 3, positions: { Venus: 7, Jupiter: 9, Moon: 1, Saturn: 4, Mars: 2 } } } };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth, assistant: true });
  await settle(); await settle();
  await typeInChat(app, 'when will I get married');
  const sent = app.requests.filter(r => r.url === '/api/ask').at(-1).body.facts;
  assert.equal(sent.filter(fact => /^House \d+ \(/.test(fact)).length, 12, sent.join('\n'));
  assert.ok(sent.some(fact => /^House 7 \(\w+\): lord \w+ sits in house \d+ \(\w+\)/.test(fact)));
  assert.ok(sent.some(fact => /^Navamsa \(D9\): Lagna Gemini, Venus Libra/.test(fact)));
  assert.ok(sent.some(fact => /^Mahadasha timeline.*Venus 2020-01-01 to 2040-01-01; Sun 2040/.test(fact)));
  assert.ok(sent.some(fact => /^Antardashas in the current Mahadasha: .*Mars 2026-01-01 to 2027-06-01/.test(fact)));
  assert.ok(sent.every(fact => fact.length <= 700) && sent.length <= 100);
});

test('Life Guide is personal to your own chart (birth star and running dasha), and general for any other sign', async () => {
  const period = scores => Object.fromEntries(['love', 'family', 'marriage', 'career', 'wealth', 'health'].map((area, i) => [area, { score: scores[i], support: [] }]));
  const lifeGuide = { yesterday: period([5, 5, 5, 5, 5, 5]), today: period([8, 6, 4, 7, 5, 3]), tomorrow: period([6, 6, 6, 6, 6, 6]), month: period([4, 4, 4, 4, 4, 4]), year: period([9, 9, 9, 9, 9, 9]) };
  const planets = Object.fromEntries(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'].map((name, n) => [name, { whole_sign_bhava: n + 1 }]));
  const birth = { ...syntheticBirth, details: { dasha: { current_mahadasha: 'Venus', antardasha: [{ lord: 'Moon', current: false }, { lord: 'Saturn', current: true }] }, planets } };
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth, lifeGuide, lifeGuidePersonal: { tara: 2, shift: 1 } });
  await settle(); await settle();
  homeCard(app, 'Life Guide').listeners.click();
  await settle(); await settle();
  const sent = app.requests.filter(r => r.url === '/api/life-guide').at(-1).body;
  assert.equal(sent.sign, 2);
  assert.equal(JSON.stringify(sent.personal), JSON.stringify({ nakshatra: 17, dasha: [{ lord: 'Venus', house: 6 }, { lord: 'Saturn', house: 7 }] }));   // only chart numbers
  assert.ok(!JSON.stringify(sent).includes('1995') && !JSON.stringify(sent).includes('Hyderabad'));                                                    // never the birth details
  const lines = () => app.element('lifeguide').children.filter(item => /^lg-personal/.test(item.className)).map(item => item.textContent);
  assert.equal(lines()[0], '✨ Personal to your chart: birth star Anuradha · dasha Venus – Saturn');
  assert.equal(lines()[1], 'Your star today: Sampat: supportive');
  // Another sign is general: nothing personal is sent, and the page says so
  const page = () => app.element('lifeguide').children;
  page().find(item => item.className === 'lg-sign').children[1].listeners.click();
  page().find(item => item.className === 'moon-pick').children[5].listeners.click();
  await settle();
  assert.equal(app.requests.filter(r => r.url === '/api/life-guide').at(-1).body.personal, undefined);
  assert.match(lines()[0], /^General for this sign/);
  // Back to your own sign: the personal answer was kept, no new request
  const before = app.requests.filter(r => r.url === '/api/life-guide').length;
  page().find(item => item.className === 'lg-sign').children[1].listeners.click();
  page().find(item => item.className === 'moon-pick').children[1].listeners.click();
  await settle();
  assert.equal(app.requests.filter(r => r.url === '/api/life-guide').length, before);
  assert.match(lines()[0], /^✨ Personal to your chart/);
});

test('Life Guide wording: the AI’s sentences of the day are used (varying by area, tab and your star), the built-in ones until then or when the AI is off', async () => {
  const period = scores => Object.fromEntries(['love', 'family', 'marriage', 'career', 'wealth', 'health'].map((area, i) => [area, { score: scores[i], support: [] }]));
  const lifeGuide = { yesterday: period([8, 8, 8, 8, 8, 8]), today: period([8, 8, 8, 8, 8, 8]), tomorrow: period([8, 8, 8, 8, 8, 8]), month: period([8, 8, 8, 8, 8, 8]), year: period([8, 8, 8, 8, 8, 8]) };
  const lifeGuideText = Object.fromEntries(['love', 'family', 'marriage', 'career', 'wealth', 'health'].map(area => [area, { low: ['L1', 'L2'], mid: ['M1', 'M2'], high: [`${area} high one`, `${area} high two`, `${area} high three`] }]));
  const storage = memoryStorage({ lang: 'en', city: 'Bengaluru, IN', useLocation: false });
  storage.setItem('jyotisha.profile.v1', JSON.stringify({ dob: '1995-08-15', pob: 'Hyderabad, IN', tob: '06:30' }));
  const app = boot({ storage, birth: syntheticBirth, lifeGuide, lifeGuideText });
  await settle(); await settle();
  homeCard(app, 'Life Guide').listeners.click();
  await settle(); await settle(); await settle();
  const lines = () => app.element('lifeguide').children.filter(item => /^lg-aspect/.test(item.className)).map(item => item.children[1].textContent);
  assert.ok(lines().every(line => /high (one|two|three)$/.test(line)), lines().join(' | '));          // the AI's sentences, all from the "high" band
  assert.equal(new Set(lines()).size > 1, true);                                                          // the areas do not all read alike
  const today = lines();
  app.element('lifeguide').children.find(item => item.className === 'tabs-line').children[3].listeners.click();   // This month
  assert.notEqual(lines().join('|'), today.join('|'));                                                    // another tab reads differently
  assert.equal(app.requests.filter(r => r.url === '/api/life-guide-text').length, 1);                     // fetched once for the day
  // The AI is off: the built-in sentences
  const plain = boot({ storage, birth: syntheticBirth, lifeGuide });
  await settle(); await settle();
  homeCard(plain, 'Life Guide').listeners.click();
  await settle(); await settle();
  const builtIn = plain.element('lifeguide').children.filter(item => /^lg-aspect/.test(item.className)).map(item => item.children[1].textContent);
  assert.equal(builtIn[0], 'Warmth comes easily. A good time to share your feelings.');
});
