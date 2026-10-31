/*
 * Display nomenclature, not new astronomical calculations or reviewed rules.
 * Name order: India Meteorological Department, Rashtriya Panchang 2026–27,
 * https://packolkata.imd.gov.in/panchang/en/tithi-nakshatra
 * Karana cycle and angular definitions:
 * https://packolkata.imd.gov.in/panchang/en/explanation
 * Romanized spelling follows the official English list. No source prose or
 * daily Panchang entries are reproduced here.
 */
(function (root) {
  'use strict';
  const TITHI_BASE = Object.freeze([
    'Pratipad', 'Dvitiya', 'Tritiya', 'Chaturthi', 'Panchami',
    'Shashthi', 'Saptami', 'Ashtami', 'Navami', 'Dasami',
    'Ekadasi', 'Dvadasi', 'Trayodasi', 'Chaturdasi'
  ]);
  const NAKSHATRA = Object.freeze([
    'Asvini', 'Bharani', 'Krittika', 'Rohini', 'Mrigasiras', 'Ardra',
    'Punarvasu', 'Pushya', 'Aslesha', 'Magha', 'Purva Phalguni',
    'Uttara Phalguni', 'Hasta', 'Chitra', 'Svati', 'Visakha',
    'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha',
    'Sravana', 'Dhanishta', 'Satabhisaj', 'Purva Bhadrapada',
    'Uttara Bhadrapada', 'Revati'
  ]);
  const YOGA = Object.freeze([
    'Viskumbha', 'Priti', 'Ayusman', 'Saubhagya', 'Sobhana',
    'Atiganda', 'Sukarma', 'Dhriti', 'Sula', 'Ganda', 'Vriddhi',
    'Dhruva', 'Vyaghata', 'Harshana', 'Vajra', 'Siddhi', 'Vyatipata',
    'Variyan', 'Parigha', 'Siva', 'Siddha', 'Sadhya', 'Subha',
    'Sukla', 'Brahma', 'Indra', 'Vaidhriti'
  ]);
  const MOVABLE_KARANA = Object.freeze([
    'Bava', 'Balava', 'Kaulava', 'Taitila', 'Gara', 'Vanij', 'Vishti'
  ]);
  // Display names of the same ordered indices come from locales/*.js (names); they are not new rules.
  function localNames(language) {
    const locale = (root.JyotishaLocales || {})[language];
    return locale && locale.names ? locale.names : null;
  }

  function inRange(value, first, last) {
    return Number.isInteger(value) && value >= first && value <= last;
  }
  function tithiName(index, language = 'en') {
    if (!inRange(index, 1, 30)) return null;
    const local = localNames(language);
    if (local) {
      if (index === 15) return local.purnima;
      if (index === 30) return local.amavasya;
      return `${index < 15 ? local.shukla : local.krishna} ${local.tithi[(index - 1) % 15]}`;
    }
    if (index === 15) return 'Purnima';
    if (index === 30) return 'Amavasya';
    return `${index < 15 ? 'Shukla' : 'Krishna'} ${TITHI_BASE[(index - 1) % 15]}`;
  }
  // The Tithi name without its Paksha prefix, for tight spaces such as calendar tiles.
  function tithiBaseName(index, language = 'en') {
    if (!inRange(index, 1, 30)) return null;
    const local = localNames(language);
    if (local) return index === 15 ? local.purnima : index === 30 ? local.amavasya : local.tithi[(index - 1) % 15];
    return index === 15 ? 'Purnima' : index === 30 ? 'Amavasya' : TITHI_BASE[(index - 1) % 15];
  }
  function nakshatraName(index, language = 'en') { return inRange(index, 1, 27) ? ((localNames(language) || {}).nakshatra || NAKSHATRA)[index - 1] : null; }
  function yogaName(index, language = 'en') { return inRange(index, 1, 27) ? ((localNames(language) || {}).yoga || YOGA)[index - 1] : null; }
  function karanaName(halfTithiIndex, language = 'en') {
    if (!inRange(halfTithiIndex, 1, 60)) return null;
    const local = localNames(language);
    if (local) {
      if (halfTithiIndex === 1) return local.kimstughna;
      if (halfTithiIndex === 58) return local.sakuni;
      if (halfTithiIndex === 59) return local.chatuspada;
      if (halfTithiIndex === 60) return local.naga;
      return local.karana[(halfTithiIndex - 2) % 7];
    }
    if (halfTithiIndex === 1) return 'Kimstughna';
    if (halfTithiIndex === 58) return 'Sakuni';
    if (halfTithiIndex === 59) return 'Chatuspada';
    if (halfTithiIndex === 60) return 'Naga';
    return MOVABLE_KARANA[(halfTithiIndex - 2) % 7];
  }
  function pakshaName(kind, language = 'en') {
    if (kind !== 'shukla' && kind !== 'krishna') return null;
    const local = localNames(language);
    if (!local) return kind === 'shukla' ? 'Shukla Paksha' : 'Krishna Paksha';
    return kind === 'shukla' ? local.pakshaShukla : local.pakshaKrishna;
  }
  const api = Object.freeze({ tithiName, tithiBaseName, nakshatraName, yogaName, karanaName, pakshaName });
  root.JyotishaPanchangNames = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
