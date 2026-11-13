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
  // The 60-year cycle (Prabhava = 1987-88) and the 12 lunar months, for the calendar header.
  const SAMVATSARA = Object.freeze({
    en: ['Prabhava', 'Vibhava', 'Shukla', 'Pramoduta', 'Prajotpatti', 'Angirasa', 'Shrimukha', 'Bhava', 'Yuva', 'Dhatu', 'Ishvara', 'Bahudhanya',
      'Pramathi', 'Vikrama', 'Vrisha', 'Chitrabhanu', 'Svabhanu', 'Tarana', 'Parthiva', 'Vyaya', 'Sarvajit', 'Sarvadhari', 'Virodhi', 'Vikriti',
      'Khara', 'Nandana', 'Vijaya', 'Jaya', 'Manmatha', 'Durmukhi', 'Hevilambi', 'Vilambi', 'Vikari', 'Sharvari', 'Plava', 'Shubhakrit',
      'Shobhakrit', 'Krodhi', 'Vishvavasu', 'Parabhava', 'Plavanga', 'Kilaka', 'Saumya', 'Sadharana', 'Virodhikrit', 'Paridhavi', 'Pramadicha',
      'Ananda', 'Rakshasa', 'Nala', 'Pingala', 'Kalayukti', 'Siddharthi', 'Raudri', 'Durmati', 'Dundubhi', 'Rudhirodgari', 'Raktakshi', 'Krodhana', 'Akshaya'],
    te: ['ప్రభవ', 'విభవ', 'శుక్ల', 'ప్రమోదూత', 'ప్రజోత్పత్తి', 'ఆంగీరస', 'శ్రీముఖ', 'భావ', 'యువ', 'ధాత', 'ఈశ్వర', 'బహుధాన్య',
      'ప్రమాది', 'విక్రమ', 'వృష', 'చిత్రభాను', 'స్వభాను', 'తారణ', 'పార్థివ', 'వ్యయ', 'సర్వజిత్', 'సర్వధారి', 'విరోధి', 'వికృతి',
      'ఖర', 'నందన', 'విజయ', 'జయ', 'మన్మథ', 'దుర్ముఖి', 'హేవిళంబి', 'విళంబి', 'వికారి', 'శార్వరి', 'ప్లవ', 'శుభకృత్',
      'శోభకృత్', 'క్రోధి', 'విశ్వావసు', 'పరాభవ', 'ప్లవంగ', 'కీలక', 'సౌమ్య', 'సాధారణ', 'విరోధికృత్', 'పరీధావి', 'ప్రమాదీచ',
      'ఆనంద', 'రాక్షస', 'నల', 'పింగళ', 'కాళయుక్తి', 'సిద్ధార్థి', 'రౌద్రి', 'దుర్మతి', 'దుందుభి', 'రుధిరోద్గారి', 'రక్తాక్షి', 'క్రోధన', 'అక్షయ'],
    hi: ['प्रभव', 'विभव', 'शुक्ल', 'प्रमोद', 'प्रजापति', 'आंगिरस', 'श्रीमुख', 'भाव', 'युवा', 'धाता', 'ईश्वर', 'बहुधान्य',
      'प्रमाथी', 'विक्रम', 'वृष', 'चित्रभानु', 'स्वभानु', 'तारण', 'पार्थिव', 'व्यय', 'सर्वजित्', 'सर्वधारी', 'विरोधी', 'विकृति',
      'खर', 'नंदन', 'विजय', 'जय', 'मन्मथ', 'दुर्मुख', 'हेमलंब', 'विलंब', 'विकारी', 'शार्वरी', 'प्लव', 'शुभकृत्',
      'शोभकृत्', 'क्रोधी', 'विश्वावसु', 'पराभव', 'प्लवंग', 'कीलक', 'सौम्य', 'साधारण', 'विरोधकृत्', 'परिधावी', 'प्रमादी',
      'आनंद', 'राक्षस', 'नल', 'पिंगल', 'कालयुक्त', 'सिद्धार्थी', 'रौद्र', 'दुर्मति', 'दुंदुभि', 'रुधिरोद्गारी', 'रक्ताक्ष', 'क्रोधन', 'अक्षय'],
  });
  const MASA = Object.freeze({
    en: ['Chaitra', 'Vaishakha', 'Jyeshtha', 'Ashadha', 'Shravana', 'Bhadrapada', 'Ashvayuja', 'Kartika', 'Margashira', 'Pushya', 'Magha', 'Phalguna'],
    te: ['చైత్రం', 'వైశాఖం', 'జ్యేష్ఠం', 'ఆషాఢం', 'శ్రావణం', 'భాద్రపదం', 'ఆశ్వయుజం', 'కార్తీకం', 'మార్గశిరం', 'పుష్యం', 'మాఘం', 'ఫాల్గుణం'],
    hi: ['चैत्र', 'वैशाख', 'ज्येष्ठ', 'आषाढ़', 'श्रावण', 'भाद्रपद', 'आश्विन', 'कार्तिक', 'मार्गशीर्ष', 'पौष', 'माघ', 'फाल्गुन'],
  });
  const DEVANAGARI = new Set(['hi', 'mr', 'ne', 'sa', 'kok', 'mai']);
  const nameTable = (table, language) => table[language] || (DEVANAGARI.has(language) ? table.hi : table.en);
  const samvatsaraName = (index, language) => (index >= 1 && index <= 60 ? nameTable(SAMVATSARA, language)[index - 1] : '');
  const masaName = (month, language) => (month >= 1 && month <= 12 ? nameTable(MASA, language)[month - 1] : '');
  const api = Object.freeze({ tithiName, tithiBaseName, nakshatraName, yogaName, karanaName, pakshaName, samvatsaraName, masaName });
  root.JyotishaPanchangNames = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
