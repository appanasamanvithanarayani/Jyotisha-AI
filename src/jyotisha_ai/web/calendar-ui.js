/* Interface copy comes from the locale registry (locales/*.js); no language is
 * offered unless its locale file defines the full key set. */
(function (root) {
  'use strict';
  const registry = root.JyotishaLocales || {};
  const codes = Object.keys(registry).sort((a, b) => registry[a].meta.order - registry[b].meta.order);
  function intlTag(meta) {
    for (const tag of [meta.intl, meta.intl.split('-')[0]]) {
      try { if (Intl.DateTimeFormat.supportedLocalesOf([tag]).length) return tag; } catch (_error) { /* try next */ }
    }
    return 'en-IN';
  }
  const LOCALES = Object.freeze(Object.fromEntries(codes.map(code => [code, intlTag(registry[code].meta)])));
  const COPY = Object.freeze(Object.fromEntries(codes.map(code => [code, registry[code].ui])));
  const LANGUAGES = Object.freeze(codes.map(code => Object.freeze({
    code, native: registry[code].meta.native, english: registry[code].meta.english, dir: registry[code].meta.dir,
  })));
  function language(value) { return Object.hasOwn(LOCALES, value) ? value : 'en'; }
  function direction(value) { return registry[language(value)].meta.dir; }
  function tr(value, key) { return COPY[language(value)][key] || COPY.en[key] || key; }
  function monthCells(year, month) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || year < 1970 || year > 2100 || month < 1 || month > 12) {
      throw new Error('Unsupported calendar month');
    }
    const first = new Date(Date.UTC(year, month - 1, 1));
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const offset = (first.getUTCDay() + 6) % 7;
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }
  function isoDate(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  // Month and weekday names come from the locale file when it has them, so the
  // result never depends on which languages a browser's Intl data happens to include.
  function calendarNames(selectedLanguage) {
    return registry[language(selectedLanguage)].calendar || null;
  }
  function weekdayName(selectedLanguage, sundayFirstIndex, style = 'long') {
    const names = calendarNames(selectedLanguage);
    if (names) return (style === 'short' ? names.weekdaysShort : names.weekdays)[sundayFirstIndex];
    return new Intl.DateTimeFormat(LOCALES[language(selectedLanguage)], { weekday: style, timeZone: 'UTC' })
      .format(new Date(Date.UTC(2024, 0, 7 + sundayFirstIndex)));
  }
  function monthName(selectedLanguage, monthIndex, style = 'long') {
    const names = calendarNames(selectedLanguage);
    if (names) return (style === 'short' ? names.monthsShort : names.months)[monthIndex];
    return new Intl.DateTimeFormat(LOCALES[language(selectedLanguage)], { month: style, timeZone: 'UTC' })
      .format(new Date(Date.UTC(2024, monthIndex, 1)));
  }
  function formatDate(selectedLanguage, iso, style = 'full') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!match) return '';
    const [year, month, day] = match.slice(1).map(Number);
    const names = calendarNames(selectedLanguage);
    if (names) {
      const weekday = names.weekdays[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
      if (style === 'dayMonth') return `${day} ${names.monthsShort[month - 1]}`;
      if (style === 'short') return `${day} ${names.monthsShort[month - 1]} ${year}`;
      if (style === 'monthYear') return `${names.months[month - 1]} ${year}`;
      return `${weekday}${names.comma}${day} ${names.months[month - 1]} ${year}`;
    }
    const options = style === 'short' ? { day: 'numeric', month: 'short', year: 'numeric' } : style === 'dayMonth' ? { day: 'numeric', month: 'short' }
      : style === 'monthYear' ? { month: 'long', year: 'numeric' } : { dateStyle: 'full' };
    return new Intl.DateTimeFormat(LOCALES[language(selectedLanguage)], { ...options, timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, day, 12)));
  }
  // Festival names come from the locale file, falling back to English if a locale lacks one.
  function festivalName(selectedLanguage, key) {
    const own = registry[language(selectedLanguage)].festivals;
    return (own && own[key]) || (registry.en.festivals && registry.en.festivals[key]) || key;
  }
  function monthTitle(year, month, selectedLanguage) {
    return formatDate(selectedLanguage, isoDate(year, month, 1), 'monthYear');
  }
  function weekdayLabels(selectedLanguage) {
    // Monday first, to match the month grid.
    return Array.from({ length: 7 }, (_, index) => weekdayName(selectedLanguage, (index + 1) % 7, 'short'));
  }
  const api = Object.freeze({ LOCALES, COPY, LANGUAGES, language, direction, tr, monthCells, isoDate, monthTitle, weekdayLabels, weekdayName, monthName, formatDate, festivalName });
  root.JyotishaCalendar = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
