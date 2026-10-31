/* Page controller: onboarding, Home (calendar + day Panchang), Kundli and Ask. No network except the local API. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const calendarUI = window.JyotishaCalendar;
  const names = window.JyotishaPanchangNames;
  const chartUI = window.JyotishaChart;

  const state = {
    lang: 'en', city: '', onboarded: false, assistant: false, rashiMode: 'day', week: null, weekLoading: null, weekCache: {}, useLocation: false, pendingLocation: false, todayIso: null, selectedDate: null,
    view: { year: 0, month: 0 }, month: null, day: null, dayRequest: 0, monthRequest: 0,
    chart: null, details: null, resolved: null, kundli: { style: 'south', division: 'd1' },
  };
  const t = key => calendarUI.tr(state.lang, key);
  const bodyName = name => chartUI.bodyName(name, state.lang);
  const signName = index => chartUI.signName(index, state.lang);

  const PLANET_COLORS = Object.freeze({
    Sun: '#f08a24', Moon: '#5b8bd9', Mars: '#d6453d', Mercury: '#2f9e6b', Jupiter: '#d9a21b',
    Venus: '#d1558f', Saturn: '#5a4fcf', Rahu: '#6b5b73', Ketu: '#8a6d4b',
  });
  const PLANET_ORDER = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function svgEl(tag, attributes = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
    return node;
  }
  async function post(url, payload) {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), cache: 'no-store' });
    let body = null;
    try { body = await response.json(); } catch (_error) { body = null; }
    return { ok: response.ok, body };
  }
  const localIso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const shiftIso = (iso, days) => { const date = new Date(`${iso}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

  /* ---------------------------------------------------------------- pages */
  const pages = {};
  const pageHost = $('top');
  for (const name of ['home', 'kundli', 'chat', 'rashi']) {
    const page = document.createElement('section');
    page.className = 'app-page'; page.id = `page-${name}`; page.hidden = true;
    pageHost.appendChild(page); pages[name] = page;
  }
  pages.home.append($('day-panchang'), $('services'));
  pages.kundli.append($('kundli'), $('chart'));
  pages.chat.appendChild($('chat'));
  pages.rashi.appendChild($('rashi'));
  function showPage(name) {
    const chosen = Object.hasOwn(pages, name) ? name : 'home';
    for (const [key, page] of Object.entries(pages)) page.hidden = key !== chosen;
    document.querySelectorAll('.bottom-nav a').forEach(link => {
      const active = link.getAttribute('href') === `#${chosen}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (document.body && document.body.classList) document.body.classList.toggle('page-chat', chosen === 'chat');
    window.scrollTo(0, 0);
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    const target = link.getAttribute('href').slice(1);
    if (Object.hasOwn(pages, target)) { event.preventDefault(); showPage(target); }
  }));
  showPage('home');

  /* ------------------------------------------------------------- language */
  const choice = $('language-choice');
  const switcher = $('language-switch');
  for (const item of calendarUI.LANGUAGES) {
    const full = el('option'); full.value = item.code; full.textContent = item.code === 'en' ? item.native : `${item.native} · ${item.english}`; choice.appendChild(full);
    const short = el('option'); short.value = item.code; short.textContent = item.native; switcher.appendChild(short);
  }
  function applyLanguage(value) {
    state.lang = calendarUI.language(value);
    document.documentElement.lang = state.lang;
    document.documentElement.dir = calendarUI.direction(state.lang);
    choice.value = state.lang; switcher.value = state.lang;
    document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder); });
    document.querySelectorAll('[data-i18n-aria]').forEach(node => node.setAttribute('aria-label', t(node.dataset.i18nAria)));
    document.querySelectorAll('.place-options').forEach(node => node.setAttribute('aria-label', t('matchingCitiesAria')));
    $('chat-question').placeholder = t('questionPlaceholder');
    $('dp-note').textContent = t('dpNote');
    renderHome();
    if (state.chart) { renderChart(); resetChat(t('chartReady')); } else startIntake();
    saveSettings();
  }
  switcher.addEventListener('change', event => applyLanguage(event.target.value));
  choice.addEventListener('change', event => applyLanguage(event.target.value));

  /* ----------------------------------------------------------- onboarding */
  function showOnboardingStep(step) {
    document.body.classList.add('onboarding-active');
    $('welcome-screen').hidden = false;
    for (const name of ['welcome', 'language', 'location']) $(`step-${name}`).hidden = name !== step;
  }
  $('welcome-next').addEventListener('click', () => showOnboardingStep('language'));
  $('language-next').addEventListener('click', () => {
    applyLanguage(choice.value);
    if (state.onboarded) { $('welcome-screen').hidden = true; document.body.classList.remove('onboarding-active'); }
    else showOnboardingStep('location');
  });
  /* ------------------------------------------------------------- settings */
  // Language and city are remembered on this device, so onboarding only runs on a fresh install.
  const STORE_KEY = 'jyotisha.settings.v1';
  function loadSettings() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(STORE_KEY);
      const value = raw ? JSON.parse(raw) : null;
      if (value && typeof value === 'object' && typeof value.city === 'string' && value.city.trim()) {
        return { lang: calendarUI.language(value.lang), city: value.city.trim().slice(0, 200), useLocation: value.useLocation === true };
      }
    } catch (_error) { /* storage unavailable or corrupt: behave like a first visit */ }
    return null;
  }
  function saveSettings() {
    if (!state.onboarded) return;
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ lang: state.lang, city: state.city, useLocation: state.useLocation })); } catch (_error) { /* not persisted */ }
  }
  // The birth details of the last chart are kept on this device only (never on the server) so they need not be typed again.
  const PROFILE_KEY = 'jyotisha.profile.v1';
  function loadProfile() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(PROFILE_KEY);
      const value = raw ? JSON.parse(raw) : null;
      if (value && /^\d{4}-\d{2}-\d{2}$/.test(value.dob) && /^\d{2}:\d{2}$/.test(value.tob) && typeof value.pob === 'string' && value.pob.trim().length >= 2) {
        return { dob: value.dob, pob: value.pob.trim().slice(0, 200), tob: value.tob };
      }
    } catch (_error) { /* unreadable: treat as none */ }
    return null;
  }
  function saveProfile(profile) {
    try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify({ dob: profile.dob, pob: profile.pob, tob: profile.tob })); } catch (_error) { /* not persisted */ }
  }
  function forgetProfile() {
    try { window.localStorage.removeItem(PROFILE_KEY); } catch (_error) { /* nothing to remove */ }
  }
  async function restoreProfile() {
    const profile = loadProfile();
    if (!profile) return;
    try {
      const { ok, body } = await post('/api/birth-chart', profile);
      if (ok && body && body.chart) { applyChart(body, profile); intake.step = null; resetChat(t('chartReady')); }
    } catch (_error) { /* offline or unavailable: the chat simply asks for the details again */ }
  }
  function startHome() {
    const today = localIso(new Date());
    state.todayIso = today; state.selectedDate = today;
    state.view = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
    state.month = null; state.day = null;
    showPage('home');
    renderHome();
    void loadMonth();
    void loadDay(today, true);
  }

  /* -------------------------------------------------------------- location */
  // The browser shows its own allow-while-using / allow-once / do-not-allow prompt and remembers the answer,
  // so the app never asks again by itself: it only reads the position when the user taps a location
  // button, or on later visits when permission was already granted.
  function locate(onCity, onFail) {
    if (!navigator.geolocation) { onFail('locationUnavailable'); return; }
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const { ok, body } = await post('/api/nearby-place', { latitude: position.coords.latitude, longitude: position.coords.longitude });
        if (!ok || !body || !body.candidate) { onFail('locationNoMatch'); return; }
        onCity(body.candidate.value);
      } catch (_error) { onFail('locationUnavailable'); }
    }, () => onFail('locationDenied'), { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
  }
  async function refreshCityFromLocation() {
    if (!navigator.geolocation || !navigator.permissions || !navigator.permissions.query) return;
    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });
      if (permission.state !== 'granted') return;
    } catch (_error) { return; }
    locate(city => { if (city !== state.city) { state.city = city; saveSettings(); startHome(); } }, () => {});
  }
  $('allow-location').addEventListener('click', () => {
    const status = $('location-status');
    status.textContent = t('locationChecking');
    locate(city => {
      $('welcome-city').value = city; state.pendingLocation = true;
      status.textContent = t('confirmCity').replace('{city}', city);
    }, key => { state.pendingLocation = false; status.textContent = t(key); });
  });
  $('welcome-form').addEventListener('submit', event => {
    event.preventDefault();
    applyLanguage(choice.value);
    state.city = $('welcome-city').value.trim();
    state.useLocation = state.pendingLocation; state.pendingLocation = false;
    state.onboarded = true;
    $('welcome-screen').hidden = true;
    document.body.classList.remove('onboarding-active');
    saveSettings();
    startHome();
  });

  /* ----------------------------------------------------- change city (Home) */
  const cityPanel = $('city-panel');
  $('dp-city').addEventListener('click', () => {
    cityPanel.hidden = !cityPanel.hidden;
    if (!cityPanel.hidden) { $('city-input').value = state.city; $('city-status').textContent = ''; state.pendingLocation = false; $('city-input').focus(); }
  });
  $('city-location').addEventListener('click', () => {
    $('city-status').textContent = t('locationChecking');
    locate(city => {
      $('city-input').value = city; state.pendingLocation = true;
      $('city-status').textContent = t('confirmCity').replace('{city}', city);
    }, key => { $('city-status').textContent = t(key); });
  });
  $('city-save').addEventListener('click', () => {
    const city = $('city-input').value.trim();
    if (city.length < 2) return;
    state.city = city; state.useLocation = state.pendingLocation; state.pendingLocation = false;
    cityPanel.hidden = true;
    saveSettings();
    startHome();
  });

  /* ------------------------------------------------------ place suggestions */
  const datalist = $('place-suggestions');
  document.querySelectorAll('input[list="place-suggestions"]').forEach(input => {
    const options = el('div', 'place-options'); options.hidden = true;
    options.setAttribute('role', 'group'); options.setAttribute('aria-label', t('matchingCitiesAria'));
    input.insertAdjacentElement('afterend', options);
    let timer = null, request = 0;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const query = input.value.trim(), current = ++request;
      options.replaceChildren(); options.hidden = true; datalist.replaceChildren();
      if (query.length < 2) return;
      timer = setTimeout(async () => {
        try {
          const { ok, body } = await post('/api/places', { query });
          if (current !== request || input.value.trim() !== query) return;
          if (!ok || !body || !Array.isArray(body.suggestions)) return;
          for (const item of body.suggestions) {
            const option = el('option'); option.value = item.value; option.label = item.label; datalist.appendChild(option);
            const button = el('button', null, item.label); button.type = 'button';
            button.addEventListener('click', () => { input.value = item.value; options.hidden = true; options.replaceChildren(); input.focus(); });
            options.appendChild(button);
          }
          if (!body.suggestions.length) options.appendChild(el('p', null, t('noMatch')));
          options.hidden = false;
        } catch (_error) { if (current === request) options.hidden = true; }
      }, 250);
    });
  });

  /* ------------------------------------------------------------ time text */
  function clock(iso, baseDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
    if (!match) return '';
    const [year, month, day, hour, minute] = match.slice(1).map(Number);
    const stamp = new Date(Date.UTC(year, month - 1, day, hour, minute));
    let text = new Intl.DateTimeFormat(calendarUI.LOCALES[state.lang], { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC', numberingSystem: 'latn' }).format(stamp);
    if (iso.slice(0, 10) !== baseDate) text += ', ' + calendarUI.formatDate(state.lang, iso.slice(0, 10), 'dayMonth');
    return `⁦${text}⁩`; // keep digits and AM/PM together inside right-to-left text
  }
  const duration = minutes => `${Math.floor(minutes / 60)} ${t('hours')} ${minutes % 60} ${t('mins')}`;
  const moonEmoji = tithi => tithi === 15 ? '🌕' : tithi === 30 ? '🌑' : tithi <= 4 ? '🌒' : tithi <= 11 ? '🌓' : tithi <= 14 ? '🌔' : tithi <= 19 ? '🌖' : tithi <= 26 ? '🌗' : '🌘';

  /* ---------------------------------------------------------- Home: sections */
  function section(title, rows, kind) {
    const box = el('section', `dp-sec${kind ? ' ' + kind : ''}`);
    box.appendChild(el('h3', null, title));
    for (const [label, lines] of rows) {
      if (!lines || !lines.length) continue;
      const row = el('div', 'dp-row'), value = el('div', 'dp-value');
      row.appendChild(el('div', 'dp-label', label));
      for (const line of lines) {
        const entry = el('div');
        entry.appendChild(el('span', 't', line.text));
        if (line.note) entry.appendChild(el('span', 'dp-upto', line.note));
        value.appendChild(entry);
      }
      row.appendChild(value); box.appendChild(row);
    }
    return box;
  }
  function clearDay() {
    $('dp-tables').replaceChildren(); $('dp-sun-strip').replaceChildren(); $('dp-key').replaceChildren();
    for (const id of ['dp-date-title', 'dp-subtitle', 'dp-place']) $(id).textContent = '';
    $('dp-moon').textContent = '🌙';
  }
  const tinted = tone => (tone === 'good' ? '🟢' : tone === 'caution' ? '🔴' : '🟡');
  const dayLabel = iso => { const label = calendarUI.weekdayName(state.lang, new Date(`${iso}T12:00:00Z`).getUTCDay(), 'short'); return label; };
  function areaBlock(areas) {
    const box = el('div', 'rashi-areas');
    for (const item of areas) { const row = el('p', null); row.append(el('strong', null, `${tinted(item.tone)} ${item.name}: `), item.text); box.appendChild(row); }
    return box;
  }
  function remedyBlock(card, lines) {
    if (!lines || !lines.length) return;
    card.appendChild(el('h4', null, chartUI.remedyHead(state.lang)));
    const list = el('ul', 'rashi-planets remedies');
    for (const line of lines) list.appendChild(el('li', null, line));
    card.appendChild(list);
    card.appendChild(el('p', 'muted-note', chartUI.remedyNote(state.lang)));
  }
  function renderRashiDay() {
    const day = state.day;
    if (!day) { $('rashi-moon').textContent = t('dpUnavailable'); return; }
    $('rashi-moon').textContent = `${calendarUI.formatDate(state.lang, day.date, 'full')} · ${t('moonsign')}: ${signName(day.moon_rashi[0].index)}`;
    const mine = state.chart ? state.chart.positions.Moon.rashi_index : 0;
    const detail = chartUI.gocharaOutlook(day, state.lang), moonCards = chartUI.rashiOutlook(day, state.lang);
    for (const item of moonCards) {
      const more = detail[item.rashi - 1];
      const tone = more ? more.tone : item.tone;
      const card = el('details', `rashi-card ${tone}${item.rashi === mine ? ' mine' : ''}`);
      if (item.rashi === mine) card.open = true;
      const head = el('summary', null);
      head.appendChild(el('strong', null, `${tinted(tone)} ${item.name}`));
      if (item.rashi === mine) head.appendChild(el('span', 'tag now', t('janmaRashi')));
      if (more) head.appendChild(el('span', 'rashi-count', more.count));
      card.appendChild(head);
      if (more) card.appendChild(el('p', 'rashi-verdict', more.verdict));
      if (more) card.appendChild(areaBlock(more.areas));
      card.appendChild(el('p', null, item.kind));
      card.appendChild(el('p', 'muted-note', item.area));
      if (more) {
        card.appendChild(el('h4', null, chartUI.gocharaHead(state.lang)));
        const planets = el('ul', 'rashi-planets');
        for (const row of more.rows) planets.appendChild(el('li', row.good ? 'ok' : 'no', row.text));
        card.appendChild(planets);
        remedyBlock(card, more.remedies);
      }
      $('rashi-list').appendChild(card);
    }
  }
  async function loadWeek() {
    const start = state.selectedDate, key = `${state.city}|${start}`;
    if (!start || !state.city || state.weekLoading === key) return;
    state.weekLoading = key;
    const dates = Array.from({ length: 7 }, (_unused, n) => shiftIso(start, n));
    const days = await Promise.all(dates.map(async iso => {
      const cached = state.weekCache[`${state.city}|${iso}`];
      if (cached) return cached;
      try {
        const { ok, body } = await post('/api/day-panchang', { date: iso, place: state.city });
        if (ok && body && body.day) { state.weekCache[`${state.city}|${iso}`] = body.day; return body.day; }
      } catch (_error) { /* a missing day is skipped */ }
      return null;
    }));
    if (state.weekLoading !== key) return;
    state.week = { key, days: days.filter(Boolean) };
    state.weekLoading = null;
    renderRashi();
  }
  function renderRashiWeek() {
    const key = `${state.city}|${state.selectedDate}`;
    if (!state.week || state.week.key !== key) { $('rashi-moon').textContent = t('dpLoading'); void loadWeek(); return; }
    const days = state.week.days;
    if (!days.length) { $('rashi-moon').textContent = t('dpUnavailable'); return; }
    const range = `${calendarUI.formatDate(state.lang, days[0].date, 'dayMonth')} – ${calendarUI.formatDate(state.lang, days[days.length - 1].date, 'dayMonth')}`;
    $('rashi-moon').textContent = `${t('viewWeek')}: ${range}`;
    const mine = state.chart ? state.chart.positions.Moon.rashi_index : 0;
    for (const item of chartUI.weekOutlook(days, state.lang, dayLabel)) {
      const card = el('details', `rashi-card ${item.tone}${item.rashi === mine ? ' mine' : ''}`);
      if (item.rashi === mine) card.open = true;
      const head = el('summary', null);
      head.appendChild(el('strong', null, `${tinted(item.tone)} ${item.name}`));
      if (item.rashi === mine) head.appendChild(el('span', 'tag now', t('janmaRashi')));
      head.appendChild(el('span', 'rashi-count', range));
      card.appendChild(head);
      card.appendChild(el('p', 'rashi-verdict', item.verdict));
      const strip = el('div', 'week-strip');
      for (const day of item.strip) { const cell = el('span', `week-day ${day.tone}`); cell.append(el('b', null, day.label), el('small', null, String(day.day)), el('i', null, tinted(day.tone))); strip.appendChild(cell); }
      card.appendChild(strip);
      card.appendChild(el('p', null, item.best)); card.appendChild(el('p', null, item.care));
      card.appendChild(el('h4', null, chartUI.weekHead(state.lang))); card.appendChild(areaBlock(item.areas));
      card.appendChild(el('h4', null, chartUI.slowHead(state.lang)));
      const planets = el('ul', 'rashi-planets');
      for (const row of item.slowRows) planets.appendChild(el('li', row.good ? 'ok' : 'no', row.text));
      card.appendChild(planets);
      remedyBlock(card, item.remedies);
      $('rashi-list').appendChild(card);
    }
  }
  function renderRashiMonth() {
    const month = state.month;
    if (!month || month.year !== state.view.year || month.month !== state.view.month) { $('rashi-moon').textContent = t('dpLoading'); return; }
    const days = month.days.filter(row => row.moon_rashi_index && row.planet_rashis).map(row => ({ date: row.date, moon_rashi: [{ index: row.moon_rashi_index }], planet_rashis: row.planet_rashis }));
    if (!days.length) { $('rashi-moon').textContent = t('dpUnavailable'); return; }
    $('rashi-moon').textContent = `${t('viewMonth')}: ${calendarUI.monthTitle(month.year, month.month, state.lang)}`;
    const dayNumber = iso => String(Number(iso.slice(8)));
    const moves = el('div', 'rashi-moves');
    moves.appendChild(el('h4', null, chartUI.monthMovesHead(state.lang)));
    const list = el('ul', 'rashi-planets');
    for (const line of chartUI.planetMoves(days, state.lang, iso => calendarUI.formatDate(state.lang, iso, 'dayMonth'))) list.appendChild(el('li', null, line));
    moves.appendChild(list);
    $('rashi-list').appendChild(moves);
    const mine = state.chart ? state.chart.positions.Moon.rashi_index : 0;
    for (const item of chartUI.monthOutlook(days, state.lang, dayNumber)) {
      const card = el('details', `rashi-card ${item.tone}${item.rashi === mine ? ' mine' : ''}`);
      if (item.rashi === mine) card.open = true;
      const head = el('summary', null);
      head.appendChild(el('strong', null, `${tinted(item.tone)} ${item.name}`));
      if (item.rashi === mine) head.appendChild(el('span', 'tag now', t('janmaRashi')));
      card.appendChild(head);
      card.appendChild(el('p', 'rashi-verdict', item.verdict));
      const grid = el('div', 'month-strip');
      for (const day of item.strip) { const cell = el('span', `month-day ${day.tone}`); cell.append(el('b', null, day.label), el('i', null, tinted(day.tone))); grid.appendChild(cell); }
      card.appendChild(grid);
      card.appendChild(el('p', null, item.best)); card.appendChild(el('p', null, item.care));
      card.appendChild(areaBlock(item.areas));
      card.appendChild(el('h4', null, chartUI.slowHead(state.lang)));
      const planets = el('ul', 'rashi-planets');
      for (const row of item.slowRows) planets.appendChild(el('li', row.good ? 'ok' : 'no', row.text));
      card.appendChild(planets);
      remedyBlock(card, item.remedies);
      $('rashi-list').appendChild(card);
    }
  }
  function renderRashi() {
    $('rashi-list').replaceChildren();
    $('rashi-title').textContent = t('rashiphal');
    document.querySelectorAll('#rashi-mode button').forEach(button => button.classList.toggle('on', button.dataset.rmode === state.rashiMode));
    const unit = state.rashiMode === 'week' ? t('viewWeek') : state.rashiMode === 'month' ? t('viewMonth') : '';
    $('rashi-prev').textContent = unit ? `‹ ${unit}` : t('previousDay');
    $('rashi-next').textContent = unit ? `${unit} ›` : t('nextDay');
    if (state.rashiMode === 'week') renderRashiWeek(); else if (state.rashiMode === 'month') renderRashiMonth(); else renderRashiDay();
  }
  document.querySelectorAll('#rashi-mode button').forEach(button => button.addEventListener('click', () => { state.rashiMode = button.dataset.rmode; renderRashi(); }));
  const rashiStep = days => { if (state.rashiMode === 'month') moveMonth(days); else selectDate(shiftIso(state.selectedDate || localIso(new Date()), state.rashiMode === 'week' ? days * 7 : days)); };
  $('rashi-prev').addEventListener('click', () => rashiStep(-1));
  $('rashi-next').addEventListener('click', () => rashiStep(1));
  $('rashi-today').addEventListener('click', () => selectDate(state.todayIso || localIso(new Date())));
  function renderDay() {
    renderRashi();
    const day = state.day;
    if (!day) { clearDay(); return; }
    const date = day.date;
    const one = text => [{ text }];
    const upto = iso => t('upto').replace('{time}', clock(iso, date));
    const segments = (list, nameOf) => list.map(item => ({ text: nameOf(item.index) || String(item.index), note: item.ends_at ? upto(item.ends_at) : '' }));
    const span = pair => one(`${clock(pair[0], date)} – ${clock(pair[1], date)}`);
    const moonEvent = iso => one(iso ? clock(iso, date) : t('noMoonEvent'));
    const sign = index => signName(index) || String(index);
    const nameList = (indices, nameOf) => indices.map(nameOf).join(', ');
    const tithiName = index => names.tithiName(index, state.lang);
    const nakshatraName = index => names.nakshatraName(index, state.lang);

    $('dp-moon').textContent = moonEmoji(day.tithi[0].index);
    $('dp-date-title').textContent = calendarUI.formatDate(state.lang, date, 'full');
    $('dp-subtitle').textContent = `${names.pakshaName(day.paksha, state.lang)}, ${tithiName(day.tithi[0].index)}`;
    $('dp-place').textContent = `${day.place}, ${day.country_code}`;

    const strip = $('dp-sun-strip'); strip.replaceChildren();
    for (const [icon, label, iso] of [['🌅', t('sunrise'), day.sunrise], ['🌇', t('sunset'), day.sunset], ['🌙', t('moonrise'), day.moonrise], ['🌘', t('moonset'), day.moonset]]) {
      const tile = el('div', 'sun-tile');
      tile.append(el('span', 'ic', icon), el('small', null, label), el('b', null, iso ? clock(iso, date) : t('noMoonEvent')));
      strip.appendChild(tile);
    }
    const keys = $('dp-key'); keys.replaceChildren();
    for (const [color, label, list, nameOf] of [
      ['#f2c14e', t('tithi'), day.tithi, tithiName], ['#2fc4a8', t('nakshatra'), day.nakshatra, nakshatraName],
      ['#9b7bff', t('yoga'), day.yoga, index => names.yogaName(index, state.lang)], ['#ff6b8a', t('dpKarana'), day.karana_half_tithi, index => names.karanaName(index, state.lang)]]) {
      const chip = el('div', 'key-chip');
      chip.setAttribute('style', `--c:${color}`);
      chip.append(el('small', null, label), el('b', null, nameOf(list[0].index) || ''), el('span', null, upto(list[0].ends_at)));
      keys.appendChild(chip);
    }
    const weekday = calendarUI.weekdayName(state.lang, new Date(`${date}T12:00:00Z`).getUTCDay());
    const balamRows = [
      [t('goodChandrabalam'), day.moon_rashi.map(item => ({ text: nameList(item.good_chandrabalam_rashis, sign), note: upto(item.ends_at) }))],
      [t('ashtamaChandra'), day.moon_rashi.map(item => ({ text: sign(item.ashtama_chandra_rashi), note: upto(item.ends_at) }))],
      [t('goodTarabalam'), day.nakshatra.map(item => ({ text: nameList(item.good_tara_nakshatras, nakshatraName), note: upto(item.ends_at) }))],
    ];
    const timings = day.timings;
    $('dp-tables').replaceChildren(
      section(t('dpSunMoon'), [[t('sunrise'), one(clock(day.sunrise, date))], [t('sunset'), one(clock(day.sunset, date))], [t('moonrise'), moonEvent(day.moonrise)], [t('moonset'), moonEvent(day.moonset)]]),
      section(t('dpPanchang'), [
        [t('tithi'), segments(day.tithi, tithiName)], [t('nakshatra'), segments(day.nakshatra, nakshatraName)],
        [t('yoga'), segments(day.yoga, index => names.yogaName(index, state.lang))], [t('dpKarana'), segments(day.karana_half_tithi, index => names.karanaName(index, state.lang))],
        [t('vara'), one(weekday)], [t('paksha'), one(names.pakshaName(day.paksha, state.lang))]]),
      section(t('dpRashi'), [[t('moonsign'), segments(day.moon_rashi, sign)], [t('sunsign'), one(sign(day.sun_rashi_index))]], 'calm'),
      section(t('dpBalam'), balamRows, 'calm'),
      section(t('dpAuspicious'), [
        [t('pratahSandhya'), span(timings.pratah_sandhya)], [t('brahma'), span(timings.brahma_muhurta)], [t('abhijit'), span(timings.abhijit)],
        [t('vijaya'), span(timings.vijaya_muhurta)], [t('sayahnaSandhya'), span(timings.sayahna_sandhya)], [t('nishita'), span(timings.nishita_muhurta)]], 'good'),
      section(t('dpInauspicious'), [
        [t('rahu'), span(timings.rahu_kalam)], [t('yamaganda'), span(timings.yamaganda)], [t('gulika'), span(timings.gulika_kalam)],
        [t('varjyam'), day.varjyam.map(item => ({ text: `${clock(item.starts_at, date)} – ${clock(item.ends_at, date)}`, note: nakshatraName(item.nakshatra_index) }))]], 'bad'),
      section(t('dpDay'), [[t('dinamana'), one(duration(day.dinamana_minutes))], [t('ratrimana'), one(duration(day.ratrimana_minutes))], [t('madhyahna'), one(clock(day.madhyahna, date))]]));
  }
  async function loadDay(iso, followToday = false) {
    const request = ++state.dayRequest, status = $('dp-status');
    if (!state.city) { status.textContent = t('selectCity'); return; }
    status.textContent = t('dpLoading');
    try {
      const { ok, body } = await post('/api/day-panchang', { date: iso, place: state.city });
      if (request !== state.dayRequest) return;
      if (!ok || !body || !body.day) { state.day = null; clearDay(); status.textContent = t('dpUnavailable'); return; }
      state.todayIso = body.day.today_local_date;
      if (followToday && body.day.today_local_date !== body.day.date) { selectDate(body.day.today_local_date); return; }
      state.day = body.day; status.textContent = '';
      $('dp-date').value = state.day.date;
      renderDay(); renderCalendar(); renderDayEvents();
    } catch (_error) { if (request === state.dayRequest) { state.day = null; clearDay(); status.textContent = t('dpUnavailable'); } }
  }

  /* --------------------------------------------------------- Home: calendar */
  const eventsOn = iso => (state.month && state.month.events ? state.month.events.filter(event => event.date === iso) : []);
  const eventName = event => calendarUI.festivalName(state.lang, event.key);
  const IMPORTANT = { 11: 'E', 26: 'E', 15: 'P', 30: 'A' };
  const MARKS = { E: '🙏', P: '🌕', A: '🌑' };
  function renderCalendar() {
    const { year, month } = state.view;
    const grid = $('month-calendar');
    grid.replaceChildren();
    if (!year) { $('month-title').textContent = ''; $('cal-legend').replaceChildren(); $('month-events').replaceChildren(); return; }
    $('month-title').textContent = calendarUI.monthTitle(year, month, state.lang);
    for (const label of calendarUI.weekdayLabels(state.lang)) grid.appendChild(el('span', 'calendar-weekday', label));
    const loaded = state.month && state.month.year === year && state.month.month === month ? state.month.days : null;
    for (const number of calendarUI.monthCells(year, month)) {
      if (number === null) { grid.appendChild(el('span', 'calendar-blank')); continue; }
      const iso = calendarUI.isoDate(year, month, number);
      const entry = loaded ? loaded[number - 1] : null;
      const button = el('button', 'calendar-day'); button.type = 'button'; button.dataset.date = iso;
      if (iso === state.todayIso) button.classList.add('today');
      if (iso === state.selectedDate) button.classList.add('selected');
      button.appendChild(el('strong', null, String(number)));
      const dayEvents = loaded ? eventsOn(iso) : [];
      if (dayEvents.length) {
        button.dataset.fest = '1';
        if (dayEvents.some(event => event.holiday)) button.dataset.holiday = '1';
      }
      if (entry && entry.tithi_index) {
        const tithi = names.tithiName(entry.tithi_index, state.lang), nakshatra = names.nakshatraName(entry.nakshatra_index, state.lang);
        const mark = IMPORTANT[entry.tithi_index];
        button.appendChild(el('span', null, names.tithiBaseName(entry.tithi_index, state.lang)));
        button.dataset.pk = entry.tithi_index <= 15 ? 'S' : 'K';
        if (mark) { button.dataset.imp = mark; button.appendChild(el('i', 'mark', MARKS[mark])); }
        const festivalText = dayEvents.map(eventName).join(', ');
        button.setAttribute('aria-label', `${iso}: ${tithi}, ${nakshatra}${festivalText ? ', ' + festivalText : ''}`);
        button.title = `${tithi} · ${nakshatra}${festivalText ? ' · ' + festivalText : ''}`;
      } else button.setAttribute('aria-label', iso);
      if (dayEvents.length) button.appendChild(el('i', 'fest', '✦'));
      button.addEventListener('click', () => { selectDate(iso); const target = $('dp-tables'); if (target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
      grid.appendChild(button);
    }
    const legend = $('cal-legend'); legend.replaceChildren();
    for (const [color, text] of [['var(--good)', names.tithiName(11, state.lang)], ['var(--gold2)', names.tithiName(15, state.lang)], ['#59477f', names.tithiName(30, state.lang)], ['var(--saffron)', t('festivalTag')], ['var(--bad)', t('holidayTag')]]) {
      const item = el('b', null, text); item.setAttribute('style', `--c:${color}`); legend.appendChild(item);
    }
    renderEvents();
  }
  function renderEvents() {
    const box = $('month-events'); box.replaceChildren();
    const month = state.month;
    if (!month || month.year !== state.view.year || month.month !== state.view.month || !month.events) return;
    box.appendChild(el('h3', 'sub-h', t('festivalsTitle')));
    if (!month.events.length) box.appendChild(el('p', 'muted-note', t('festivalsNone')));
    for (const event of month.events) {
      const row = el('button', `event-row${event.holiday ? ' holiday' : ''}`); row.type = 'button';
      row.append(el('b', 't', calendarUI.formatDate(state.lang, event.date, 'dayMonth')), el('span', null, eventName(event)));
      if (event.holiday) row.appendChild(el('em', 'tag debilitated', t('holidayTag')));
      row.addEventListener('click', () => selectDate(event.date));
      box.appendChild(row);
    }
    box.appendChild(el('p', 'muted-note', t('festivalsNote')));
  }
  function renderDayEvents() {
    const chips = $('dp-events'); chips.replaceChildren();
    if (!state.day) return;
    for (const event of eventsOn(state.day.date)) chips.appendChild(el('span', `event-chip${event.holiday ? ' holiday' : ''}`, eventName(event)));
  }
  async function loadMonth() {
    const request = ++state.monthRequest;
    if (!state.city || !state.view.year) return;
    const { year, month } = state.view;
    try {
      const { ok, body } = await post('/api/month-calendar', { year, month, place: state.city });
      if (request !== state.monthRequest) return;
      state.month = ok && body && body.days ? body : null;
      if (state.month && state.month.today_local_date) state.todayIso = state.month.today_local_date;
    } catch (_error) { if (request === state.monthRequest) state.month = null; }
    renderCalendar(); renderDayEvents(); if (state.rashiMode === 'month') renderRashi();
  }
  function selectDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const year = Number(iso.slice(0, 4)), month = Number(iso.slice(5, 7));
    if (year < 1970 || year > 2100) return;
    state.selectedDate = iso;
    if (year !== state.view.year || month !== state.view.month) { state.view = { year, month }; state.month = null; renderCalendar(); void loadMonth(); }
    else renderCalendar();
    void loadDay(iso);
  }
  function moveMonth(step) {
    const target = new Date(Date.UTC(state.view.year, state.view.month - 1 + step, 1));
    const year = target.getUTCFullYear();
    if (year < 1970 || year > 2100) return;
    state.view = { year, month: target.getUTCMonth() + 1 }; state.month = null;
    renderCalendar(); void loadMonth(); if (state.rashiMode === 'month') renderRashi();
  }
  function renderHome() { renderDay(); renderCalendar(); renderDayEvents(); }
  $('month-prev').addEventListener('click', () => moveMonth(-1));
  $('month-next').addEventListener('click', () => moveMonth(1));
  $('dp-prev').addEventListener('click', () => selectDate(shiftIso(state.selectedDate || localIso(new Date()), -1)));
  $('dp-next').addEventListener('click', () => selectDate(shiftIso(state.selectedDate || localIso(new Date()), 1)));
  $('dp-today').addEventListener('click', () => selectDate(state.todayIso || localIso(new Date())));
  $('dp-date').addEventListener('change', event => selectDate(event.target.value));

  /* ------------------------------------------------------------------ Kundli */
  const dms = value => { const whole = Math.floor(value); const minutes = Math.floor((value - whole) * 60); return `${whole}°${String(minutes).padStart(2, '0')}′`; };
  function pseudoChart() {
    const chart = state.chart, details = state.details;
    if (state.kundli.division === 'd9' && details) {
      const lagna = details.navamsa.lagna_rashi_index, positions = {};
      for (const [name, sign] of Object.entries(details.navamsa.positions)) positions[name] = { rashi_index: sign, sidereal_longitude: (sign - 1) * 30, whole_sign_bhava: (sign - lagna + 12) % 12 + 1 };
      return { chart: { ascendant: { rashi_index: lagna, sidereal_longitude: (lagna - 1) * 30 }, positions }, degrees: false, moonSign: details.navamsa.positions.Moon };
    }
    const positions = { ...chart.positions };
    if (details) for (const node of ['Rahu', 'Ketu']) { const p = details.planets[node]; positions[node] = { rashi_index: p.rashi_index, sidereal_longitude: p.sidereal_longitude, whole_sign_bhava: p.whole_sign_bhava }; }
    return { chart: { ascendant: chart.ascendant, positions }, degrees: true, moonSign: chart.positions.Moon.rashi_index };
  }
  const retroMark = name => state.details && state.details.planets[name] && state.details.planets[name].retrograde ? ' ℞' : '';
  function planetChip(name, degrees, degreeText) {
    const chip = el('div', 'd1-planet');
    chip.setAttribute('style', `--pc:${PLANET_COLORS[name] || '#2a1d3f'}`);
    chip.appendChild(document.createTextNode(`${bodyName(name)}${state.kundli.division === 'd1' ? retroMark(name) : ''} `));
    if (degrees) chip.appendChild(el('small', null, degreeText));
    return chip;
  }
  function renderSouth(view) {
    const grid = $('d1-grid'); grid.replaceChildren();
    for (const cell of chartUI.buildSouthIndianChart(view.chart)) {
      const box = el('div', 'd1-cell'); box.style.gridRow = String(cell.row); box.style.gridColumn = String(cell.column);
      if (cell.isLagna) box.classList.add('lagna');
      if (cell.rashi === view.moonSign) box.classList.add('moon');
      box.appendChild(el('div', 'd1-sign', signName(cell.rashi)));
      box.appendChild(el('div', 'd1-house', `${t('colBhava')} ${cell.house}`));
      if (cell.isLagna) box.appendChild(el('span', 'badge-lg', t('lagna')));
      if (cell.rashi === view.moonSign) box.appendChild(el('span', 'badge-mn', '☾'));
      for (const planet of cell.planets) box.appendChild(planetChip(planet.name, view.degrees, `${planet.degreesInSign.toFixed(2)}°`));
      grid.appendChild(box);
    }
    const center = el('div', 'd1-center');
    center.append(el('strong', null, t(state.kundli.division === 'd9' ? 'divD9' : 'divD1')), el('span', null, t('southIndian')));
    grid.appendChild(center);
  }
  function renderNorth(view) {
    const host = $('north-chart'); host.replaceChildren();
    const svg = svgEl('svg', { viewBox: '0 0 400 400', role: 'presentation' });
    const lagna = view.chart.ascendant.rashi_index;
    const bySign = new Map();
    for (const [name, p] of Object.entries(view.chart.positions)) { if (!bySign.has(p.rashi_index)) bySign.set(p.rashi_index, []); bySign.get(p.rashi_index).push({ name, degree: p.sidereal_longitude % 30 }); }
    for (const house of chartUI.northIndianLayout()) {
      const sign = (lagna - 1 + house.house - 1) % 12 + 1;
      const polygon = svgEl('polygon', { points: house.points.map(point => point.join(',')).join(' ') });
      polygon.setAttribute('class', `nc-house${house.house === 1 ? ' lagna' : ''}${sign === view.moonSign ? ' moon' : ''}`);
      svg.appendChild(polygon);
      const planets = bySign.get(sign) || [];
      const lines = 1 + planets.length;
      const [cx, cy] = house.center;
      const top = cy - (lines - 1) * 7;
      const label = svgEl('text', { x: cx, y: top, 'text-anchor': 'middle' });
      label.setAttribute('class', 'nc-sign');
      label.textContent = `${house.house === 1 ? '◆ ' : ''}${sign}${sign === view.moonSign ? ' ☾' : ''}`;
      svg.appendChild(label);
      planets.forEach((planet, index) => {
        const text = svgEl('text', { x: cx, y: top + 14 * (index + 1), 'text-anchor': 'middle', fill: PLANET_COLORS[planet.name] || '#2a1d3f' });
        text.setAttribute('class', 'nc-planet');
        text.textContent = `${bodyName(planet.name)}${view.degrees ? ' ' + Math.floor(planet.degree) + '°' : ''}${view.degrees ? retroMark(planet.name) : ''}`;
        svg.appendChild(text);
      });
    }
    host.appendChild(svg);
  }
  function statTile(label, value, sub) {
    const tile = el('div', 'k-stat');
    tile.append(el('small', null, label), el('b', null, value), el('i', null, sub || ''));
    return tile;
  }
  function row(cells, className) {
    const tr = el('tr', className);
    for (const cell of cells) {
      const td = el('td');
      if (cell && typeof cell === 'object') td.appendChild(cell); else td.textContent = String(cell);
      tr.appendChild(td);
    }
    return tr;
  }
  function tag(kind, text) { return el('span', `tag ${kind}`, text); }
  function renderChart() {
    const chart = state.chart, details = state.details;
    if (!chart) return;
    const birth = chart.panchanga_at_birth, moon = chart.positions.Moon;
    const localDate = state.resolved ? state.resolved.local_datetime.slice(0, 10) : chart.input.birth_datetime.slice(0, 10);
    const placeName = state.resolved ? `${state.resolved.place.name}, ${state.resolved.place.country_code} · ` : '';
    $('chart-summary').textContent = `${placeName}${calendarUI.formatDate(state.lang, localDate, 'short')} · ${(state.resolved ? state.resolved.local_datetime.slice(11, 16) : '')}`;
    const stats = $('chart-stats'); stats.replaceChildren(
      statTile(t('lagna'), signName(chart.ascendant.rashi_index), `${dms(chart.ascendant.sidereal_longitude % 30)}`),
      statTile(t('janmaRashi'), signName(moon.rashi_index), `${bodyName('Moon')} ${dms(moon.sidereal_longitude % 30)}`),
      statTile(t('nakshatra'), names.nakshatraName(birth.nakshatra_index, state.lang), `${t('pada')} ${birth.nakshatra_pada}`));
    $('chart-janma').textContent = `${t('janmaRashi')}: ${signName(moon.rashi_index)} (${t('rashi')} ${moon.rashi_index}) · ${bodyName('Moon')} ${moon.sidereal_longitude.toFixed(4)}° ${t('sidereal')}`;
    for (const button of $('style-toggle').querySelectorAll ? $('style-toggle').querySelectorAll('button') : []) button.classList.toggle('on', button.dataset.style === state.kundli.style);
    for (const button of $('division-toggle').querySelectorAll ? $('division-toggle').querySelectorAll('button') : []) button.classList.toggle('on', button.dataset.division === state.kundli.division);
    const division = state.kundli.division === 'd9' && !details ? 'd1' : state.kundli.division;
    state.kundli.division = division;
    const view = pseudoChart();
    $('d1-grid').hidden = state.kundli.style !== 'south'; $('north-chart').hidden = state.kundli.style !== 'north';
    if (state.kundli.style === 'south') renderSouth(view); else renderNorth(view);
    $('chart-legend').textContent = `◆ ${t('lagna')}   ☾ ${t('janmaRashi')}${details ? '   ℞ ' + t('retro') : ''}`;

    const body = $('details-body'); body.replaceChildren();
    const positions = $('chart-positions'); positions.replaceChildren();
    if (details) {
      const entries = [['Lagna', details.lagna, t('lagna')], ...PLANET_ORDER.map(name => [name, details.planets[name], bodyName(name)])];
      for (const [name, info, label] of entries) {
        const status = el('span');
        const kind = info.dignity;
        if (kind) status.appendChild(tag(kind === 'exalted' ? 'exalted' : kind === 'debilitated' ? 'debilitated' : 'own', t(kind === 'exalted' ? 'dignityExalted' : kind === 'debilitated' ? 'dignityDebilitated' : 'dignityOwn')));
        if (info.retrograde) status.appendChild(tag('retro', `℞ ${t('retro')}`));
        const nameCell = el('span', null, label);
        if (PLANET_COLORS[name]) nameCell.setAttribute('style', `color:${PLANET_COLORS[name]}`);
        body.appendChild(row([nameCell, signName(info.rashi_index), dms(info.degree_in_sign),
          `${names.nakshatraName(info.nakshatra_index, state.lang)} · ${info.nakshatra_pada} (${bodyName(info.nakshatra_lord)})`, info.whole_sign_bhava, status]));
      }
    }
    for (const [name, p] of Object.entries(chart.positions)) positions.appendChild(row([bodyName(name), p.tropical_longitude.toFixed(4), p.sidereal_longitude.toFixed(4), signName(p.rashi_index), p.whole_sign_bhava]));

    const panchang = $('birth-panchang'); panchang.replaceChildren();
    const spans = details ? details.birth_panchang : null;
    const spanText = item => item ? `${clock(item.starts_at, localDate)} – ${clock(item.ends_at, localDate)}` : '';
    const cell = (text, item) => { const box = el('div'); box.appendChild(el('b', null, text)); if (item) box.appendChild(el('div', 'muted-note', spanText(item))); return box; };
    panchang.append(
      row([t('tithi'), cell(`${names.tithiName(birth.tithi_index, state.lang)} (${birth.tithi_index})`, spans && spans.tithi)]),
      row([t('nakshatra'), cell(`${names.nakshatraName(birth.nakshatra_index, state.lang)} · ${t('pada')} ${birth.nakshatra_pada}`, spans && spans.nakshatra)]),
      row([t('yoga'), cell(`${names.yogaName(birth.yoga_index, state.lang)} (${birth.yoga_index})`, spans && spans.yoga)]),
      row([t('dpKarana'), cell(`${names.karanaName(birth.karana_half_tithi_index, state.lang)} (${birth.karana_half_tithi_index})`, spans && spans.karana)]),
      row([t('vara'), cell(calendarUI.weekdayName(state.lang, new Date(`${localDate}T12:00:00Z`).getUTCDay()))]));

    const dashaBox = $('dasha-details');
    dashaBox.hidden = !details;
    if (details) {
      const dasha = details.dasha;
      const dateText = iso => calendarUI.formatDate(state.lang, iso, 'short');
      const mahadasha = $('mahadasha-body'); mahadasha.replaceChildren();
      for (const item of dasha.mahadasha) {
        const lord = el('span', null, bodyName(item.lord)); if (item.current) lord.appendChild(tag('now', t('dashaCurrent')));
        mahadasha.appendChild(row([lord, dateText(item.start), dateText(item.end)], item.current ? 'current' : ''));
      }
      $('antardasha-title').textContent = dasha.current_mahadasha ? t('antardashaTitle').replace('{lord}', bodyName(dasha.current_mahadasha)) : '';
      const antardasha = $('antardasha-body'); antardasha.replaceChildren();
      for (const item of dasha.antardasha) {
        const lord = el('span', null, bodyName(item.lord)); if (item.current) lord.appendChild(tag('now', t('dashaCurrent')));
        antardasha.appendChild(row([lord, dateText(item.start), dateText(item.end)], item.current ? 'current' : ''));
      }
    }
  }
  function bindToggle(id, attribute, key) {
    const group = $(id);
    if (!group.querySelectorAll) return;
    group.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      state.kundli[key] = button.dataset[attribute];
      renderChart();
    }));
  }
  bindToggle('style-toggle', 'style', 'style');
  bindToggle('division-toggle', 'division', 'division');

  $('birth-form').addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData($('birth-form'));
    $('chart').hidden = true; state.chart = null; state.details = null;
    setChatEnabled(false);
    resetChat(t('processing'));
    $('result').textContent = t('checking');
    try {
      const { ok, body } = await post('/api/birth-chart', { dob: data.get('dob'), pob: data.get('pob'), tob: data.get('tob') });
      $('result').textContent = ok && body && body.chart ? t('chartReady') : t('chartFailed');
      if (ok && body && body.chart) {
        state.chart = body.chart; state.details = body.details || null; state.resolved = body.resolved_birth || null;
        saveProfile({ dob: data.get('dob'), pob: data.get('pob'), tob: data.get('tob') });
        renderChart(); $('chart').hidden = false;
        setChatEnabled(true); intake.step = null; resetChat(t('chartReady'));
        showPage('kundli');
        const target = $('chart'); if (target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch (_error) { $('result').textContent = t('serviceUnavailable'); }
    if (!state.chart) { setChatEnabled(true); startIntake(); }
  });

  /* -------------------------------------------------------------------- Ask */
  const chatLog = $('chat-log'), chatQuestion = $('chat-question');
  function setChatEnabled(enabled) {
    chatQuestion.disabled = !enabled; $('chat-send').disabled = !enabled;
    document.querySelectorAll('.prompt').forEach(button => { button.disabled = !enabled; });
  }
  function addMessage(kind, message) {
    const entry = el('div', `chat-message ${kind}`, message);
    chatLog.appendChild(entry); chatLog.scrollTop = chatLog.scrollHeight;
  }
  function resetChat(message) { chatLog.replaceChildren(); addMessage('assistant', message); history.length = 0; }
  // The full Jathakam is assembled from the tables already rendered for the chart, so it always matches them and the language.
  function buildJathakam() {
    const section = (title, ...nodes) => { const box = el('section', 'jk-sec'); box.appendChild(el('h4', null, title)); nodes.forEach(node => box.appendChild(node)); return box; };
    const copy = node => { const clone = node.cloneNode(true); clone.removeAttribute('id'); clone.removeAttribute('hidden'); clone.querySelectorAll('[id]').forEach(item => item.removeAttribute('id')); return clone; };
    const doc = el('div', 'jathakam');
    doc.appendChild(el('h3', null, `${t('kundli')} · ${$('chart-summary').textContent}`));
    doc.appendChild(copy($('chart-stats')));
    doc.appendChild(el('p', 'jk-line', $('chart-janma').textContent));
    doc.appendChild(copy($(state.kundli.style === 'north' ? 'north-chart' : 'd1-grid')));
    doc.appendChild(el('p', 'chart-legend', $('chart-legend').textContent));
    doc.appendChild(section(t('detailsTitle'), copy($('details-body').parentNode.parentNode)));
    doc.appendChild(section(t('birthPanchangTitle'), copy($('birth-panchang').parentNode.parentNode)));
    if (state.details) doc.appendChild(section(t('dashaTitle'), copy($('mahadasha-body').parentNode.parentNode), el('h5', null, $('antardasha-title').textContent), copy($('antardasha-body').parentNode.parentNode)));
    doc.appendChild(el('p', 'muted-note', t('nodeNote')));
    doc.appendChild(el('p', 'muted-note', t('chartLanguage')));
    return doc;
  }
  function addJathakam() {
    const entry = el('div', 'chat-message assistant jk-message');
    const doc = buildJathakam();
    const print = el('button', 'chip-btn solid jk-print', `🖨 ${t('jathakamPrint')}`);
    print.type = 'button';
    print.addEventListener('click', () => {
      const root = el('div'); root.id = 'print-root'; root.appendChild(doc.cloneNode(true));
      document.body.appendChild(root); document.body.classList.add('printing');
      const done = () => { document.body.classList.remove('printing'); if (root.parentNode) root.parentNode.removeChild(root); };
      window.addEventListener('afterprint', done, { once: true });
      window.print();
    });
    entry.append(doc, print);
    chatLog.appendChild(entry); chatLog.scrollTop = chatLog.scrollHeight;
  }
  // With the optional assistant enabled on the server, free-form questions in any language/spelling are answered by it
  // from the calculated facts below; everything else (and any failure) uses the offline answers.
  function chartFacts() {
    const chart = state.chart, d = state.details, birth = chart.panchanga_at_birth;
    const sign = i => chartUI.signName(i, 'en'), facts = [
      `Lagna: ${sign(chart.ascendant.rashi_index)}`, `Moon sign (Janma Rashi): ${sign(chart.positions.Moon.rashi_index)}`,
      `Birth Nakshatra: ${names.nakshatraName(birth.nakshatra_index, 'en')} pada ${birth.nakshatra_pada}`, `Birth Tithi: ${names.tithiName(birth.tithi_index, 'en')}`];
    const planets = d ? d.planets : chart.positions;
    for (const [name, p] of Object.entries(planets)) facts.push(`${name}: ${sign(p.rashi_index)}, house ${p.whole_sign_bhava}${p.dignity ? ', ' + p.dignity : ''}${p.retrograde ? ', retrograde' : ''}`);
    if (d && d.dasha && d.dasha.current_mahadasha) facts.push(`Current Vimshottari period: ${d.dasha.current_mahadasha}`);
    // Only calculated labels leave the browser; unreviewed life-area readings do not.
    return facts;
  }
  const history = [];   // recent turns sent to the assistant so the chat continues instead of restarting
  async function askAssistant(query) {
    const pending = el('div', 'chat-message assistant', '…'); chatLog.appendChild(pending); chatLog.scrollTop = chatLog.scrollHeight;
    try {
      const { ok, body } = await post('/api/ask', { question: query, language: state.lang, facts: chartFacts(), history: history.slice(-10) });
      if (ok && body && body.answer) { pending.textContent = body.answer; history.push({ role: 'user', text: query.slice(0, 300) }, { role: 'assistant', text: body.answer.slice(0, 1400) }); return true; }
    } catch (_error) { /* fall back to the offline answer */ }
    chatLog.removeChild(pending); return false;
  }
  /* ---- No chart yet: the chat asks for date, place and time of birth, then calculates the chart ---- */
  const intake = { step: 'dob', dob: '', pob: '', tob: '', pending: null };
  const stepPrompt = () => t(intake.step === 'dob' ? 'chatAskDob' : intake.step === 'pob' ? 'chatAskPob' : 'chatAskTob');
  function startIntake() { intake.step = 'dob'; intake.dob = ''; intake.pob = ''; intake.tob = ''; intake.pending = null; resetChat(t('chatAskDob')); }
  function applyChart(body, inputs) {
    state.chart = body.chart; state.details = body.details || null; state.resolved = body.resolved_birth || null;
    try {
      for (const [name, value] of Object.entries(inputs)) { const field = document.querySelector(`[name="${name}"]`); if (field) field.value = value; }
    } catch (_error) { /* the form is a convenience only */ }
    renderChart(); $('chart').hidden = false;
  }
  async function finishIntake() {
    addMessage('assistant', t('processing'));
    try {
      const { ok, body } = await post('/api/birth-chart', { dob: intake.dob, pob: intake.pob, tob: intake.tob });
      if (ok && body && body.chart) {
        applyChart(body, { dob: intake.dob, pob: intake.pob, tob: intake.tob });
        saveProfile({ dob: intake.dob, pob: intake.pob, tob: intake.tob });
        const pending = intake.pending; intake.step = null; intake.pending = null;
        addMessage('assistant', t('chartReady'));
        if (pending) route(pending); else addJathakam();
        return;
      }
      let hint = '';
      try {
        const found = await post('/api/places', { query: intake.pob });
        if (found.ok && found.body && Array.isArray(found.body.suggestions) && found.body.suggestions.length) hint = ` (${found.body.suggestions.slice(0, 4).map(item => item.label).join(' · ')})`;
      } catch (_error) { /* suggestions are optional */ }
      intake.step = 'pob';
      addMessage('assistant', `${t('chartFailed')} ${t('chatAskPob')}${hint}`);
    } catch (_error) { intake.step = 'pob'; addMessage('assistant', t('serviceUnavailable')); }
  }
  async function intakeInput(text, fromPrompt) {
    if (fromPrompt) { if (intake.pending === null) intake.pending = text; addMessage('assistant', stepPrompt()); return; }
    if (intake.step === 'dob') {
      const dob = chartUI.parseBirthDate(text);
      if (!dob) { if (intake.pending === null && !/\d/.test(text)) { intake.pending = text; addMessage('assistant', stepPrompt()); } else addMessage('assistant', t('chatBadInput')); return; }
      intake.dob = dob; intake.step = 'pob'; addMessage('assistant', stepPrompt()); return;
    }
    if (intake.step === 'pob') {
      if (text.trim().length < 2) { addMessage('assistant', stepPrompt()); return; }
      intake.pob = text.trim().slice(0, 200);
      if (intake.tob) { intake.step = 'busy'; await finishIntake(); return; }   // only the place was wrong: reuse the time already given
      intake.step = 'tob'; addMessage('assistant', stepPrompt()); return;
    }
    const tob = chartUI.parseBirthTime(text);
    if (!tob) { addMessage('assistant', t('chatBadInput')); return; }
    intake.tob = tob; intake.step = 'busy';
    await finishIntake();
  }
  function ask(shown, query, fromPrompt) {
    if (!state.chart) {
      if (intake.step === 'busy') return;
      addMessage('user', shown); void intakeInput(query, fromPrompt === true); return;
    }
    addMessage('user', shown);
    route(query);
  }
  function route(query) {
    if (state.assistant && !chartUI.isJathakamRequest(query) && !/^(What is my Lagna\?|Where is the Moon\?|Which planets are in house 1\?)$/.test(query)) {
      void askAssistant(query).then(done => { if (!done) askOffline(query); });
      return;
    }
    askOffline(query);
  }
  function showLines(lines) {
    const entry = el('div', 'chat-message assistant reading');
    entry.appendChild(el('strong', null, lines[0]));
    lines.slice(1, -1).forEach(line => entry.appendChild(el('p', null, line)));
    entry.appendChild(el('p', 'muted-note', lines[lines.length - 1]));
    if (!state.assistant) entry.appendChild(el('p', 'muted-note', 'To ask in your own words and get a natural reply, set up the chat assistant (see README).'));
    chatLog.appendChild(entry); chatLog.scrollTop = chatLog.scrollHeight;
  }
  function dayFor() {
    const segment = state.day && state.day.moon_rashi && state.day.moon_rashi[0];
    return segment ? { moonRashi: segment.index, date: state.day.date, isToday: state.day.date === state.todayIso } : null;
  }
  function showReading(topic) {
    try { showLines(chartUI.readLife(state.chart, state.details, topic, state.lang, dayFor())); }
    catch (_error) { addMessage('assistant', t('answerFailed')); }
  }
  function showToday() {
    if (!state.day) { showReading('life'); return; }
    try { showLines(chartUI.readToday(state.chart, state.details, state.day, state.lang, iso => clock(iso, state.day.date))); }
    catch (_error) { addMessage('assistant', t('answerFailed')); }
  }
  // Offline: Jathakam, a topic reading, a specific fact, or (for anything else) today's reading from the chart, never a refusal.
  function askOffline(query) {
    if (chartUI.isJathakamRequest(query)) {
      try { addJathakam(); } catch (_error) { addMessage('assistant', t('answerFailed')); }
      return;
    }
    const topic = chartUI.readingTopic(query);
    if (topic && !chartUI.wantsToday(query)) { showReading(topic); return; }
    if (chartUI.wantsToday(query)) { showToday(); return; }
    try {
      const answer = chartUI.answerChartQuestion(state.chart, query, state.lang, state.details);
      if (chartUI.isFallbackAnswer(answer, state.lang)) showToday(); else addMessage('assistant', answer);
    } catch (_error) { addMessage('assistant', t('answerFailed')); }
  }
  $('chat-form').addEventListener('submit', event => {
    event.preventDefault();
    const question = chatQuestion.value.trim();
    if (!question) return;
    ask(question, question); chatQuestion.value = ''; chatQuestion.focus();
  });
  // Home: relatable questions that open the chat and ask them straight away (asking for birth details first when there is no chart).
  document.querySelectorAll('.ai-chip').forEach(button => button.addEventListener('click', () => {
    const question = button.textContent;
    showPage('chat');
    ask(question, question, true);
  }));
  document.querySelectorAll('.prompt').forEach(button => button.addEventListener('click', () => ask(button.textContent, button.dataset.question, true)));

  /* ----------------------------------------------------------------- start */
  // Installable app: the service worker keeps the shell available and shows a friendly page offline.
  try { if (navigator.serviceWorker) navigator.serviceWorker.register('/sw.js').catch(() => {}); } catch (_error) { /* not supported */ }
  fetch('/api/birth-readiness', { cache: 'no-store' }).then(response => response.json()).then(readiness => {
    $('availability').textContent = readiness.can_calculate ? '' : t('unavailable');
    $('birth-fields').disabled = !readiness.can_calculate;
    state.assistant = readiness.assistant_available === true;
  }).catch(() => { $('availability').textContent = t('inputDisabled'); });
  const saved = loadSettings();
  if (saved) {
    state.city = saved.city; state.useLocation = saved.useLocation; state.onboarded = true;
    $('welcome-screen').hidden = true; document.body.classList.remove('onboarding-active');
    applyLanguage(saved.lang);
    startHome();
    if (saved.useLocation) void refreshCityFromLocation();
  } else applyLanguage('en');
  void restoreProfile();
  $('forget-profile').addEventListener('click', () => {
    forgetProfile();
    state.chart = null; state.details = null; state.resolved = null;
    $('chart').hidden = true;
    setChatEnabled(true); startIntake();
  });
  $('availability').textContent = t('availabilityChecking');
})();
