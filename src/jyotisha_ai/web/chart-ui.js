/* Local-only D1 layout and calculated-fact answers. No model or network calls. */
(function (root) {
  'use strict';

  const RASHI_NAMES = Object.freeze([
    'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
  ]);
  // South Indian D1: signs are fixed and proceed clockwise from Pisces.
  const SOUTH_SLOTS = Object.freeze([
    [12, 1, 1], [1, 1, 2], [2, 1, 3], [3, 1, 4],
    [11, 2, 1], [4, 2, 4], [10, 3, 1], [5, 3, 4],
    [9, 4, 1], [8, 4, 2], [7, 4, 3], [6, 4, 4]
  ]);
  const BODY_BY_NAME = Object.freeze({ Sun: 1, Moon: 1, Mars: 1, Mercury: 1, Jupiter: 1, Venus: 1, Saturn: 1 });
  const BODY_ALIASES = Object.freeze([
    ['Sun', ['sun', 'surya']], ['Moon', ['moon', 'chandra']],
    ['Mars', ['mars', 'mangala']], ['Mercury', ['mercury', 'budha']],
    ['Jupiter', ['jupiter', 'guru']], ['Venus', ['venus', 'shukra']],
    ['Saturn', ['saturn', 'shani']]
  ]);
  function localeChart(language) {
    const locale = (root.JyotishaLocales || {})[language];
    return locale && locale.chart ? locale.chart : null;
  }
  function signName(index, language = 'en') {
    if (!isRashi(index)) return null;
    return ((localeChart(language) || {}).signs || RASHI_NAMES)[index - 1];
  }
  function bodyName(name, language = 'en') {
    return (((localeChart(language) || {}).bodies) || {})[name] || name;
  }

  function isRashi(index) { return Number.isInteger(index) && index >= 1 && index <= 12; }
  function houseForRashi(rashi, lagnaRashi) { return (rashi - lagnaRashi + 12) % 12 + 1; }
  function withinRashi(longitude) { return ((longitude % 30) + 30) % 30; }

  function buildSouthIndianChart(chart) {
    if (!chart || !chart.ascendant || !isRashi(chart.ascendant.rashi_index) ||
        !Number.isFinite(chart.ascendant.sidereal_longitude) ||
        !chart.positions || typeof chart.positions !== 'object') {
      throw new Error('Chart positions are incomplete; no diagram was drawn.');
    }
    const lagna = chart.ascendant.rashi_index;
    const cells = SOUTH_SLOTS.map(([rashi, row, column]) => ({
      rashi, row, column, sign: RASHI_NAMES[rashi - 1],
      house: houseForRashi(rashi, lagna), isLagna: rashi === lagna,
      planets: []
    }));
    const byRashi = new Map(cells.map(cell => [cell.rashi, cell]));
    for (const [name, position] of Object.entries(chart.positions)) {
      if (!position || !isRashi(position.rashi_index) ||
          !Number.isFinite(position.sidereal_longitude) ||
          position.whole_sign_bhava !== houseForRashi(position.rashi_index, lagna)) {
        throw new Error('Chart position and house disagree; no diagram was drawn.');
      }
      byRashi.get(position.rashi_index).planets.push({
        name, degreesInSign: withinRashi(position.sidereal_longitude)
      });
    }
    return cells;
  }

  function hasWord(text, word) {
    return new RegExp('\\b' + word + '\\b', 'i').test(text);
  }

  // English keywords are always understood; a locale adds its own in chart.kw.
  const BASE_KEYWORDS = Object.freeze({
    predict: ['prediction', 'future', 'marriage', 'career', 'love', 'health', 'predict', 'meaning', 'interpret'],
    rahuKetu: ['rahu', 'ketu'], divisional: ['navamsa', 'varga', 'd9'],
    lagna: ['lagna', 'ascendant'], rashi: ['rashi', 'sign'], nakshatra: ['nakshatra', 'pada'], tithi: ['tithi'],
    yoga: ['yoga', 'panchanga'], dasha: ['dasha', 'vimshottari'], house: ['house', 'bhava'],
    Sun: ['sun', 'surya'], Moon: ['moon', 'chandra'], Mars: ['mars', 'mangala'], Mercury: ['mercury', 'budha'],
    Jupiter: ['jupiter', 'guru'], Venus: ['venus', 'shukra'], Saturn: ['saturn', 'shani']
  });
  // Asking for the whole Jathakam (any language/spelling) gets the full calculated report, not a single fact.
  const JATHAKAM_WORDS = ['jathakam', 'jatakam', 'jataka', 'janmapatri', 'janam patri', 'janma patrika', 'janam kundli', 'janma kundli',
    'kundli', 'kundali', 'kundali', 'horoscope', 'birth chart', 'full chart', 'whole chart',
    'జాతకం', 'జాతకము', 'जन्म कुंडली', 'जन्मकुंडली', 'कुंडली', 'कुण्डली', 'जन्मपत्रिका', 'जन्मपत्री', 'जातक', 'ஜாதகம்', 'ಜಾತಕ', 'ജാതകം',
    'জাতক', 'কুণ্ডলী', 'কোষ্ঠী', 'કુંડળી', 'જન્મકુંડળી', 'ਕੁੰਡਲੀ', 'ਜਨਮ ਕੁੰਡਲੀ', 'କୁଣ୍ଡଳୀ', 'جنم کنڈلی', 'زائچہ', 'कुण्डलीम्'];
  function isJathakamRequest(question) {
    if (typeof question !== 'string') return false;
    const text = question.trim().toLowerCase();
    return text.length > 0 && text.length <= 300 && JATHAKAM_WORDS.some(word => text.includes(word));
  }
  function fill(template, values) {
    return template.replace(/\{(\w+)\}/g, (_match, key) => String(values[key]));
  }

  function answerLocalized(chart, question, language, details) {
    const data = localeChart(language);
    const say = data.answers;
    const text = question.trim().toLowerCase();
    const words = key => [...BASE_KEYWORDS[key], ...((data.kw && data.kw[key]) || [])];
    const contains = key => words(key).some(word => text.includes(word));
    const prefix = say.prefix;
    if (contains('predict')) return say.predict;
    if (contains('divisional')) {
      if (!details) return fill(say.bodyMissing, { body: 'D9' });
      const navamsa = details.navamsa;
      return fill(say.divisional, { prefix, lagna: signName(navamsa.lagna_rashi_index, language), moon: signName(navamsa.positions.Moon, language) });
    }
    if (contains('rahuKetu')) {
      const ketuName = bodyName('Ketu', language).toLowerCase(), rahuName = bodyName('Rahu', language).toLowerCase();
      const asksKetu = words('rahuKetu').some(word => text.includes(word) && (word === 'ketu' || ketuName.startsWith(word)) && !rahuName.startsWith(word));
      const node = asksKetu ? 'Ketu' : 'Rahu';
      const p = details && details.planets && details.planets[node];
      if (!p) return fill(say.bodyMissing, { body: bodyName(node, language) });
      return fill(say.body, { prefix, body: bodyName(node, language), sign: signName(p.rashi_index, language), n: p.rashi_index, house: p.whole_sign_bhava, deg: p.sidereal_longitude.toFixed(4) });
    }
    const lagna = chart.ascendant.rashi_index;
    if (contains('lagna')) {
      return fill(say.lagna, { prefix, sign: signName(lagna, language), n: lagna, deg: chart.ascendant.sidereal_longitude.toFixed(4) });
    }
    const body = Object.keys(BODY_BY_NAME).find(name => contains(name));
    if (body) {
      const p = chart.positions[body];
      if (!p) return fill(say.bodyMissing, { body: bodyName(body, language) });
      return fill(say.body, { prefix, body: bodyName(body, language), sign: signName(p.rashi_index, language), n: p.rashi_index, house: p.whole_sign_bhava, deg: p.sidereal_longitude.toFixed(4) });
    }
    const houseMatch = text.match(new RegExp('(?:' + words('house').join('|') + ')\\s*(1[0-2]|[1-9])'));
    if (houseMatch) {
      const house = Number(houseMatch[1]);
      const cell = buildSouthIndianChart(chart).find(item => item.house === house);
      const planets = cell.planets.map(item => bodyName(item.name, language));
      return fill(say.house, {
        prefix, house, sign: signName(cell.rashi, language),
        planets: planets.length ? fill(say.housePlanets, { list: planets.join(', ') }) : say.housePlanetsNone
      });
    }
    if (contains('rashi')) {
      const moon = chart.positions.Moon;
      return fill(say.rashi, { prefix, moon: signName(moon.rashi_index, language), mi: moon.rashi_index, lagna: signName(lagna, language), li: lagna });
    }
    const names = root.JyotishaPanchangNames;
    const birth = chart.panchanga_at_birth;
    if (contains('nakshatra')) {
      return fill(say.nakshatra, { prefix, name: names.nakshatraName(birth.nakshatra_index, language), n: birth.nakshatra_index, pada: birth.nakshatra_pada });
    }
    if (contains('tithi')) {
      return fill(say.tithi, { prefix, name: names.tithiName(birth.tithi_index, language), n: birth.tithi_index });
    }
    if (contains('yoga')) {
      return fill(say.yoga, { prefix, tithi: names.tithiName(birth.tithi_index, language), nakshatra: names.nakshatraName(birth.nakshatra_index, language), yoga: names.yogaName(birth.yoga_index, language) });
    }
    if (contains('dasha')) {
      const d = chart.vimshottari;
      return fill(say.dasha, { prefix, lord: bodyName(d.starting_lord, language), years: d.balance_years_at_birth });
    }
    return say.fallback;
  }

  const ENGLISH_FALLBACK = 'I can report Lagna, Moon Rashi, a calculated planet’s Rashi/Bhava, a house’s calculated planets, or birth-instant indices. I cannot interpret a Jathakam or predict events yet.';
  function isFallbackAnswer(answer, language = 'en') {
    const data = language === 'en' ? null : localeChart(language);
    return answer === (data && data.answers ? data.answers.fallback : ENGLISH_FALLBACK);
  }
  function answerChartQuestion(chart, question, language = 'en', details = null) {
    const data = language === 'en' ? null : localeChart(language);
    if (data && data.answers) {
      const say = data.answers;
      if (!chart) return say.needChart;
      if (typeof question !== 'string' || !question.trim()) return say.needQuestion;
      if (question.length > 300) return say.tooLong;
      buildSouthIndianChart(chart);
      return answerLocalized(chart, question, language, details);
    }
    if (!chart) return 'Calculate a chart first. Questions stay in this browser.';
    if (typeof question !== 'string' || !question.trim()) return 'Type a question about a calculated chart fact.';
    const text = question.trim().toLowerCase();
    if (text.length > 300) return 'Please keep the question under 300 characters.';
    const names = root.JyotishaPanchangNames;
    const cells = buildSouthIndianChart(chart);
    const lagna = chart.ascendant.rashi_index;
    if (/\b(meaning|mean|interpret|prediction|predict|future|career|marriage|health|love|wealth|will|good|bad|job|relationship|remedy|when)\b/i.test(text)) {
      return 'Interpretations and predictions are unavailable. This local tool can only report calculated chart facts; no reviewed Jyotisha explanation model is connected.';
    }
    if (/\b(navamsa|varga|d9|d-9)\b/i.test(text)) {
      if (!details) return 'Divisional charts are not calculated for this chart. I will not invent their positions.';
      const navamsa = details.navamsa;
      return `Calculated fact: Navamsa Lagna is ${RASHI_NAMES[navamsa.lagna_rashi_index - 1]}; Navamsa Moon is ${RASHI_NAMES[navamsa.positions.Moon - 1]}. Other divisional charts are not calculated.`;
    }
    if (/\b(rahu|ketu)\b/i.test(text)) {
      const node = /\bketu\b/i.test(text) ? 'Ketu' : 'Rahu';
      const p = details && details.planets && details.planets[node];
      if (!p) return 'Rahu/Ketu are not calculated for this chart. I will not invent their positions.';
      return `Calculated fact (mean node): ${node} is in ${RASHI_NAMES[p.rashi_index - 1]} (Rashi ${p.rashi_index}), whole-sign Bhava ${p.whole_sign_bhava}, at ${p.sidereal_longitude.toFixed(4)}° sidereal.`;
    }
    if (hasWord(text, 'lagna') || hasWord(text, 'ascendant')) {
      return `Calculated fact: Lagna is in ${RASHI_NAMES[lagna - 1]} (Rashi ${lagna}) at ${chart.ascendant.sidereal_longitude.toFixed(4)}° sidereal.`;
    }
    const body = BODY_ALIASES.find(([, aliases]) => aliases.some(alias => hasWord(text, alias)));
    if (body) {
      const [name] = body;
      const position = chart.positions[name];
      if (!position) return `${name} is not present in this calculation; no position will be inferred.`;
      return `Calculated fact: ${name} is in ${RASHI_NAMES[position.rashi_index - 1]} (Rashi ${position.rashi_index}), whole-sign Bhava ${position.whole_sign_bhava}, at ${position.sidereal_longitude.toFixed(4)}° sidereal.`;
    }
    const houseMatch = text.match(/\b(?:house|bhava)\s*(?:number\s*)?(1[0-2]|[1-9])\b/i);
    if (houseMatch) {
      const house = Number(houseMatch[1]);
      const cell = cells.find(item => item.house === house);
      const names = cell.planets.map(item => item.name);
      return `Calculated fact: whole-sign Bhava ${house} is ${cell.sign}. ${names.length ? 'Calculated planets here: ' + names.join(', ') + '.' : 'None of the seven calculated planets is here.'} Rahu/Ketu are not included.`;
    }
    if (hasWord(text, 'rashi') || hasWord(text, 'sign')) {
      const moon = chart.positions.Moon;
      return `Calculated fact: Moon Rashi is ${RASHI_NAMES[moon.rashi_index - 1]} (${moon.rashi_index}); Lagna Rashi is ${RASHI_NAMES[lagna - 1]} (${lagna}).`;
    }
    if (hasWord(text, 'nakshatra') || hasWord(text, 'pada')) {
      const p = chart.panchanga_at_birth;
      const label = names && names.nakshatraName(p.nakshatra_index);
      return `Calculated birth-instant Nakshatra: ${label ? label + ' (' + p.nakshatra_index + ')' : 'index ' + p.nakshatra_index}, Pada ${p.nakshatra_pada}. Interpretation is not supplied.`;
    }
    if (hasWord(text, 'tithi')) {
      const index = chart.panchanga_at_birth.tithi_index;
      const label = names && names.tithiName(index);
      return `Calculated birth-instant Tithi: ${label ? label + ' (' + index + ')' : 'index ' + index}. This is not a sunrise Panchanga.`;
    }
    if (hasWord(text, 'yoga') || hasWord(text, 'panchanga')) {
      const p = chart.panchanga_at_birth;
      const tithi = names && names.tithiName(p.tithi_index);
      const nakshatra = names && names.nakshatraName(p.nakshatra_index);
      const yoga = names && names.yogaName(p.yoga_index);
      return `Calculated birth-instant labels: Tithi ${tithi || p.tithi_index} (${p.tithi_index}), Nakshatra ${nakshatra || p.nakshatra_index} (${p.nakshatra_index}), Yoga ${yoga || p.yoga_index} (${p.yoga_index}). These are not sunrise-based Panchanga results.`;
    }
    if (hasWord(text, 'dasha') || hasWord(text, 'vimshottari')) {
      const d = chart.vimshottari;
      return `Calculated Vimshottari arithmetic: starting lord ${d.starting_lord}, ${d.balance_years_at_birth} abstract years remaining at birth. Calendar dates and predictions are unavailable.`;
    }
    return ENGLISH_FALLBACK;
  }

  // ---- Life-area readings: traditional house/lord/karaka rules applied to the calculated chart. ----
  // General guidance from classical significations, never a dated prediction; wording is English-only for now.
  const SIGN_LORD = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
  const BENEFICS = ['Jupiter', 'Venus', 'Mercury', 'Moon'];
  const MALEFICS = ['Saturn', 'Mars', 'Rahu', 'Ketu'];
  const HARD_HOUSES = [6, 8, 12];
  const TOPICS = Object.freeze({
    money: { label: 'Money and finances', houses: [2, 11], karakas: ['Jupiter', 'Venus'], words: ['money', 'wealth', 'finance', 'financial', 'income', 'salary', 'rich', 'business', 'earn', 'savings', 'dabbu', 'dabbulu', 'paisa', 'paise', 'paisalu', 'dhan', 'dhana', 'aadaayam', 'aadayam', 'jeetham', 'sampadana', 'sampada', 'panam', 'hana', 'duddu', 'sambalam', 'kaasu', 'kasu', 'kaashu', 'డబ్బు', 'धन', 'पैसा', 'பணம்', 'ಹಣ', 'പണം'] },
    study: { label: 'Studies and learning', houses: [4, 5], karakas: ['Mercury', 'Jupiter'], words: ['study', 'studies', 'education', 'exam', 'school', 'college', 'learn', 'degree', 'chaduvu', 'chadhuvu', 'chaduvulu', 'padhai', 'padai', 'padipu', 'padippu', 'shiksha', 'vidya', 'vidhya', 'vidyabhyasam', 'odu', 'ooduvudu', 'padanam', 'pariksha', 'exams', 'చదువు', 'पढ़ाई', 'शिक्षा', 'படிப்பு', 'ಓದು', 'പഠനം'] },
    career: { label: 'Career and work', houses: [10, 6], karakas: ['Sun', 'Saturn'], words: ['career', 'job', 'work', 'profession', 'promotion', 'udyogam', 'udyoga', 'naukri', 'naukari', 'vyapaaram', 'vyaparam', 'velai', 'kelasa', 'jolly', 'joli', 'vyapar', 'kaam', 'ఉద్యోగం', 'नौकरी', 'करियर', 'வேலை', 'ಉದ್ಯೋಗ', 'ജോലി'] },
    marriage: { label: 'Marriage and relationships', houses: [7], karakas: ['Venus', 'Jupiter'], words: ['marriage', 'spouse', 'wife', 'husband', 'relationship', 'love', 'partner', 'pelli', 'pelli', 'peli', 'vivaham', 'vivah', 'shaadi', 'shadi', 'byaah', 'thirumanam', 'kalyanam', 'kalyana', 'maduve', 'madve', 'jodi', 'patni', 'pati', 'పెళ్లి', 'పెళ్ళి', 'विवाह', 'शादी', 'திருமணம்', 'ಮದುವೆ', 'വിവാഹം'] },
    health: { label: 'Health and vitality', houses: [1, 6], karakas: ['Sun', 'Moon'], words: ['health', 'illness', 'disease', 'arogyam', 'aarogyam', 'aarogya', 'sehat', 'swasthya', 'tabiyat', 'aaroghyam', 'rogam', 'bimari', 'ఆరోగ్యం', 'स्वास्थ्य', 'सेहत', 'ஆரோக்கியம்', 'ಆರೋಗ್ಯ', 'ആരോഗ്യം'] },
    life: { label: 'Life in general', houses: [1, 9], karakas: ['Sun', 'Moon', 'Jupiter'], words: ['life', 'future', 'luck', 'fortune', 'destiny', 'jeevitham', 'jeevitam', 'jeevan', 'zindagi', 'bhavishyath', 'bhavishyat', 'bhavishya', 'baagyam', 'adrushtam', 'adrustam', 'kismat', 'bhagya', 'vaazhkai', 'jeevana', 'jeevithan', 'today', 'జీవితం', 'భవిష్యత్', 'जीवन', 'भविष्य', 'வாழ்க்கை', 'ಜೀವನ', 'ജീവിതം'] }
  });
  function readingTopic(question) {
    if (typeof question !== 'string') return null;
    const text = question.toLowerCase();
    if (text.length > 300) return null;
    for (const [key, topic] of Object.entries(TOPICS)) if (topic.words.some(word => text.includes(word))) return key;
    return null;
  }
  const ordinal = n => `${n}${n % 100 > 10 && n % 100 < 14 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
  // Wording for the life-area readings. Languages not listed fall back to English. Unreviewed by native speakers.
  // {n} is the house number, {o} an English ordinal; h = "house N", inh = "in house N".
  const READING_TEXT = Object.freeze({
    en: {
      h: '{o} house', inh: 'the {o} house',
      title: '{label} — from your calculated chart',
      labels: { money: 'Money and finances', study: 'Studies and learning', career: 'Career and work', marriage: 'Marriage and relationships', health: 'Health and vitality', life: 'Life in general' },
      house: '{hn} ({sign}): its lord {lord} {tone}.',
      hn: '{o} house',
      exalted: 'is exalted, a strong sign for this area', own: 'is in its own sign, which steadies this area', debil: 'is debilitated, so this area may need extra effort',
      hard: 'sits in {inh}, a difficult placement traditionally linked to delays or effort', good: 'sits in {inh}, a supportive placement', plain: 'sits in {inh}', na: 'is not available',
      occ: ' Planets here: {list} ({kind}).', kinds: ['benefic influence', 'mixed influence', 'demanding influence'],
      karaka: 'Natural significator {body}: {sign}, {h}{bit}{retro}.', bits: { exalted: ', exalted', own: ', in its own sign', debil: ', debilitated' }, retro: ', retrograde',
      dashaRel: 'Current Vimshottari period: {body} - connected to this area ({why}), so these themes tend to be more prominent now.', whyRuled: 'it rules one of these houses', whyKaraka: 'it is a natural significator',
      dashaNo: 'Current Vimshottari period: {body} - not directly tied to this area, so other themes may lead for now.',
      today: '{when}: the Moon transits {sign}, {kind}.', whenToday: 'Today', whenDate: 'On {date}',
      moon8: 'the 8th from your Moon sign (Ashtama Chandra), traditionally a day for caution', moonGood: 'the {o} from your Moon sign, a favourable Chandrabalam', moonWeak: 'the {o} from your Moon sign, a neutral-to-weak Chandrabalam',
      verdict: ['Overall the traditional indicators for this area lean supportive.', 'Overall the indicators are mixed, with both supportive and demanding factors.', 'Overall the traditional indicators suggest this area asks for patience and steady effort.'],
      disclaimer: 'This follows general classical rules (house lords, significators, your current period and the Moon transit). It is guidance for reflection, not a prediction or professional advice.'
    },
    te: {
      h: '{n}వ భావం', inh: '{n}వ భావంలో',
      title: '{label} — మీ లెక్కించిన జాతకం ఆధారంగా',
      labels: { money: 'డబ్బు, ఆర్థిక విషయాలు', study: 'చదువు, విద్య', career: 'ఉద్యోగం, వృత్తి', marriage: 'వివాహం, బంధాలు', health: 'ఆరోగ్యం', life: 'సాధారణ జీవితం' },
      house: '{hn} ({sign}): దీని అధిపతి {lord} {tone}.', hn: '{n}వ భావం',
      exalted: 'ఉచ్ఛ స్థితిలో ఉన్నాడు; ఈ విషయానికి ఇది బలమైన సూచన', own: 'స్వక్షేత్రంలో ఉన్నాడు; ఇది ఈ విషయాన్ని స్థిరంగా ఉంచుతుంది', debil: 'నీచ స్థితిలో ఉన్నాడు; కాబట్టి ఈ విషయంలో అదనపు కృషి అవసరం కావచ్చు',
      hard: '{inh} ఉన్నాడు; ఇది సాంప్రదాయకంగా ఆలస్యం లేదా శ్రమను సూచించే స్థానం', good: '{inh} ఉన్నాడు; ఇది అనుకూలమైన స్థానం', plain: '{inh} ఉన్నాడు', na: 'అందుబాటులో లేడు',
      occ: ' ఇక్కడ ఉన్న గ్రహాలు: {list} ({kind}).', kinds: ['శుభ ప్రభావం', 'మిశ్రమ ప్రభావం', 'కఠిన ప్రభావం'],
      karaka: 'సహజ కారకుడు {body}: {sign}, {h}{bit}{retro}.', bits: { exalted: ', ఉచ్ఛంలో', own: ', స్వక్షేత్రంలో', debil: ', నీచంలో' }, retro: ', వక్రగతి',
      dashaRel: 'ప్రస్తుత వింశోత్తరి దశ: {body} – ఇది ఈ విషయంతో ముడిపడి ఉంది ({why}), కాబట్టి ఈ అంశాలు ఇప్పుడు ఎక్కువగా కనిపించవచ్చు.', whyRuled: 'ఈ భావాలలో ఒకదానికి అధిపతి', whyKaraka: 'సహజ కారకుడు',
      dashaNo: 'ప్రస్తుత వింశోత్తరి దశ: {body} – ఇది ఈ విషయంతో నేరుగా ముడిపడలేదు, కాబట్టి ప్రస్తుతం ఇతర అంశాలు ముందుండవచ్చు.',
      today: '{when}: చంద్రుడు {sign}లో సంచరిస్తున్నాడు, {kind}.', whenToday: 'ఈ రోజు', whenDate: '{date} నాడు',
      moon8: 'మీ చంద్ర రాశి నుండి 8వది (అష్టమ చంద్రుడు), సాంప్రదాయకంగా జాగ్రత్త అవసరమైన రోజు', moonGood: 'మీ చంద్ర రాశి నుండి {n}వది, అనుకూలమైన చంద్రబలం', moonWeak: 'మీ చంద్ర రాశి నుండి {n}వది, తటస్థం నుండి బలహీనమైన చంద్రబలం',
      verdict: ['మొత్తం మీద ఈ విషయానికి సంప్రదాయ సూచనలు అనుకూలంగా ఉన్నాయి.', 'మొత్తం మీద సూచనలు మిశ్రమంగా ఉన్నాయి: అనుకూల, సవాలు కలిగించే అంశాలు రెండూ ఉన్నాయి.', 'మొత్తం మీద ఈ విషయంలో ఓపిక, స్థిరమైన కృషి అవసరమని సంప్రదాయ సూచనలు తెలుపుతున్నాయి.'],
      disclaimer: 'ఇది సాంప్రదాయ నియమాల (భావాధిపతులు, కారకులు, ప్రస్తుత దశ, చంద్ర సంచారం) ఆధారిత సాధారణ మార్గదర్శనం మాత్రమే; ఇది భవిష్యత్ సూచన లేదా నిపుణుల సలహా కాదు.'
    },
    hi: {
      h: 'भाव {n}', inh: 'भाव {n} में',
      title: '{label} — आपकी गणना की गई कुंडली के अनुसार',
      labels: { money: 'धन और आर्थिक स्थिति', study: 'पढ़ाई और शिक्षा', career: 'करियर और काम', marriage: 'विवाह और संबंध', health: 'स्वास्थ्य', life: 'सामान्य जीवन' },
      house: '{hn} ({sign}): इसके स्वामी {lord} {tone}।', hn: 'भाव {n}',
      exalted: 'उच्च के हैं, जो इस विषय के लिए मजबूत संकेत है', own: 'अपनी राशि में हैं, जो इस विषय को स्थिरता देता है', debil: 'नीच के हैं, इसलिए इस विषय में अतिरिक्त मेहनत लग सकती है',
      hard: '{inh} हैं, जो परंपरागत रूप से देरी या मेहनत से जुड़ी स्थिति है', good: '{inh} हैं, जो सहायक स्थिति है', plain: '{inh} हैं', na: 'उपलब्ध नहीं हैं',
      occ: ' यहाँ स्थित ग्रह: {list} ({kind})।', kinds: ['शुभ प्रभाव', 'मिश्रित प्रभाव', 'कठोर प्रभाव'],
      karaka: 'नैसर्गिक कारक {body}: {sign}, {h}{bit}{retro}।', bits: { exalted: ', उच्च', own: ', स्वराशि', debil: ', नीच' }, retro: ', वक्री',
      dashaRel: 'वर्तमान विंशोत्तरी दशा: {body} – यह इस विषय से जुड़ी है ({why}), इसलिए ये बातें अभी अधिक प्रमुख रह सकती हैं।', whyRuled: 'यह इन भावों में से एक का स्वामी है', whyKaraka: 'यह नैसर्गिक कारक है',
      dashaNo: 'वर्तमान विंशोत्तरी दशा: {body} – यह सीधे इस विषय से नहीं जुड़ी, इसलिए अभी अन्य विषय आगे रह सकते हैं।',
      today: '{when}: चंद्रमा {sign} में गोचर कर रहा है, {kind}।', whenToday: 'आज', whenDate: '{date} को',
      moon8: 'आपकी चंद्र राशि से 8वां (अष्टम चंद्र), परंपरागत रूप से सावधानी का दिन', moonGood: 'आपकी चंद्र राशि से {n}वां, अनुकूल चंद्रबल', moonWeak: 'आपकी चंद्र राशि से {n}वां, सामान्य से कमजोर चंद्रबल',
      verdict: ['कुल मिलाकर इस विषय के पारंपरिक संकेत सहायक हैं।', 'कुल मिलाकर संकेत मिले-जुले हैं, सहायक और चुनौतीपूर्ण दोनों बातें हैं।', 'कुल मिलाकर पारंपरिक संकेत बताते हैं कि इस विषय में धैर्य और लगातार मेहनत चाहिए।'],
      disclaimer: 'यह पारंपरिक नियमों (भावेश, कारक, वर्तमान दशा और चंद्र गोचर) पर आधारित सामान्य मार्गदर्शन है। यह भविष्यवाणी या विशेषज्ञ सलाह नहीं है।'
    },
    ta: {
      h: '{n}ஆம் வீடு', inh: '{n}ஆம் வீட்டில்',
      title: '{label} — உங்கள் கணிக்கப்பட்ட ஜாதகத்தின் அடிப்படையில்',
      labels: { money: 'பணம், நிதி நிலை', study: 'படிப்பு, கல்வி', career: 'தொழில், வேலை', marriage: 'திருமணம், உறவுகள்', health: 'ஆரோக்கியம்', life: 'பொது வாழ்க்கை' },
      house: '{hn} ({sign}): இதன் அதிபதி {lord} {tone}.', hn: '{n}ஆம் வீடு',
      exalted: 'உச்சம் பெற்றுள்ளார்; இது இந்த விஷயத்திற்கு வலுவான அறிகுறி', own: 'ஆட்சி வீட்டில் உள்ளார்; இது இந்த விஷயத்தை நிலைப்படுத்தும்', debil: 'நீசம் பெற்றுள்ளார்; எனவே இந்த விஷயத்தில் கூடுதல் முயற்சி தேவைப்படலாம்',
      hard: '{inh} உள்ளார்; இது பாரம்பரியமாக தாமதம் அல்லது உழைப்பைக் குறிக்கும் நிலை', good: '{inh} உள்ளார்; இது சாதகமான நிலை', plain: '{inh} உள்ளார்', na: 'கிடைக்கவில்லை',
      occ: ' இங்குள்ள கிரகங்கள்: {list} ({kind}).', kinds: ['சுப தாக்கம்', 'கலவையான தாக்கம்', 'கடினமான தாக்கம்'],
      karaka: 'இயற்கை காரகர் {body}: {sign}, {h}{bit}{retro}.', bits: { exalted: ', உச்சம்', own: ', ஆட்சி', debil: ', நீசம்' }, retro: ', வக்ரம்',
      dashaRel: 'தற்போதைய விம்சோத்தரி தசை: {body} – இது இந்த விஷயத்துடன் தொடர்புடையது ({why}), எனவே இவை இப்போது அதிகம் தெரியலாம்.', whyRuled: 'இந்த வீடுகளில் ஒன்றின் அதிபதி', whyKaraka: 'இயற்கை காரகர்',
      dashaNo: 'தற்போதைய விம்சோத்தரி தசை: {body} – இது இந்த விஷயத்துடன் நேரடியாகத் தொடர்புடையது அல்ல, எனவே இப்போது மற்ற விஷயங்கள் முன்னிலையில் இருக்கலாம்.',
      today: '{when}: சந்திரன் {sign} ராசியில் சஞ்சரிக்கிறார், {kind}.', whenToday: 'இன்று', whenDate: '{date} அன்று',
      moon8: 'உங்கள் சந்திர ராசியிலிருந்து 8-வது (அஷ்டம சந்திரன்), பாரம்பரியமாக எச்சரிக்கை தேவைப்படும் நாள்', moonGood: 'உங்கள் சந்திர ராசியிலிருந்து {n}-வது, சாதகமான சந்திரபலம்', moonWeak: 'உங்கள் சந்திர ராசியிலிருந்து {n}-வது, சாதாரணம் முதல் பலவீனமான சந்திரபலம்',
      verdict: ['மொத்தத்தில் இந்த விஷயத்திற்கான பாரம்பரிய அறிகுறிகள் சாதகமாக உள்ளன.', 'மொத்தத்தில் அறிகுறிகள் கலவையாக உள்ளன; சாதகமும் சவாலும் இரண்டும் உள்ளன.', 'மொத்தத்தில் இந்த விஷயத்தில் பொறுமையும் தொடர்ந்த முயற்சியும் தேவை என பாரம்பரிய அறிகுறிகள் கூறுகின்றன.'],
      disclaimer: 'இது பாரம்பரிய விதிகளின் (வீட்டு அதிபதிகள், காரகர்கள், தற்போதைய தசை, சந்திர கோசாரம்) அடிப்படையிலான பொதுவான வழிகாட்டுதல் மட்டுமே; இது கணிப்போ நிபுணர் ஆலோசனையோ அல்ல.'
    },
    kn: {
      h: '{n}ನೇ ಭಾವ', inh: '{n}ನೇ ಭಾವದಲ್ಲಿ',
      title: '{label} — ನಿಮ್ಮ ಲೆಕ್ಕಹಾಕಿದ ಜಾತಕದ ಆಧಾರದ ಮೇಲೆ',
      labels: { money: 'ಹಣ, ಆರ್ಥಿಕ ವಿಷಯ', study: 'ಓದು, ಶಿಕ್ಷಣ', career: 'ಉದ್ಯೋಗ, ವೃತ್ತಿ', marriage: 'ವಿವಾಹ, ಸಂಬಂಧಗಳು', health: 'ಆರೋಗ್ಯ', life: 'ಸಾಮಾನ್ಯ ಜೀವನ' },
      house: '{hn} ({sign}): ಇದರ ಅಧಿಪತಿ {lord} {tone}.', hn: '{n}ನೇ ಭಾವ',
      exalted: 'ಉಚ್ಚ ಸ್ಥಿತಿಯಲ್ಲಿದ್ದಾರೆ; ಇದು ಈ ವಿಷಯಕ್ಕೆ ಬಲವಾದ ಸೂಚನೆ', own: 'ಸ್ವಕ್ಷೇತ್ರದಲ್ಲಿದ್ದಾರೆ; ಇದು ಈ ವಿಷಯವನ್ನು ಸ್ಥಿರವಾಗಿಡುತ್ತದೆ', debil: 'ನೀಚ ಸ್ಥಿತಿಯಲ್ಲಿದ್ದಾರೆ; ಆದ್ದರಿಂದ ಈ ವಿಷಯದಲ್ಲಿ ಹೆಚ್ಚುವರಿ ಪ್ರಯತ್ನ ಬೇಕಾಗಬಹುದು',
      hard: '{inh} ಇದ್ದಾರೆ; ಇದು ಸಾಂಪ್ರದಾಯಿಕವಾಗಿ ವಿಳಂಬ ಅಥವಾ ಶ್ರಮವನ್ನು ಸೂಚಿಸುವ ಸ್ಥಾನ', good: '{inh} ಇದ್ದಾರೆ; ಇದು ಅನುಕೂಲಕರ ಸ್ಥಾನ', plain: '{inh} ಇದ್ದಾರೆ', na: 'ಲಭ್ಯವಿಲ್ಲ',
      occ: ' ಇಲ್ಲಿರುವ ಗ್ರಹಗಳು: {list} ({kind}).', kinds: ['ಶುಭ ಪ್ರಭಾವ', 'ಮಿಶ್ರ ಪ್ರಭಾವ', 'ಕಠಿಣ ಪ್ರಭಾವ'],
      karaka: 'ಸಹಜ ಕಾರಕ {body}: {sign}, {h}{bit}{retro}.', bits: { exalted: ', ಉಚ್ಚ', own: ', ಸ್ವಕ್ಷೇತ್ರ', debil: ', ನೀಚ' }, retro: ', ವಕ್ರ',
      dashaRel: 'ಪ್ರಸ್ತುತ ವಿಂಶೋತ್ತರಿ ದಶೆ: {body} – ಇದು ಈ ವಿಷಯಕ್ಕೆ ಸಂಬಂಧಿಸಿದೆ ({why}), ಆದ್ದರಿಂದ ಈ ಅಂಶಗಳು ಈಗ ಹೆಚ್ಚು ಕಾಣಿಸಬಹುದು.', whyRuled: 'ಈ ಭಾವಗಳಲ್ಲಿ ಒಂದರ ಅಧಿಪತಿ', whyKaraka: 'ಸಹಜ ಕಾರಕ',
      dashaNo: 'ಪ್ರಸ್ತುತ ವಿಂಶೋತ್ತರಿ ದಶೆ: {body} – ಇದು ಈ ವಿಷಯಕ್ಕೆ ನೇರವಾಗಿ ಸಂಬಂಧಿಸಿಲ್ಲ, ಆದ್ದರಿಂದ ಈಗ ಇತರ ವಿಷಯಗಳು ಮುಂದಿರಬಹುದು.',
      today: '{when}: ಚಂದ್ರನು {sign} ರಾಶಿಯಲ್ಲಿ ಸಂಚರಿಸುತ್ತಿದ್ದಾನೆ, {kind}.', whenToday: 'ಇಂದು', whenDate: '{date} ರಂದು',
      moon8: 'ನಿಮ್ಮ ಚಂದ್ರ ರಾಶಿಯಿಂದ 8ನೇದು (ಅಷ್ಟಮ ಚಂದ್ರ), ಸಾಂಪ್ರದಾಯಿಕವಾಗಿ ಎಚ್ಚರಿಕೆ ಬೇಕಾದ ದಿನ', moonGood: 'ನಿಮ್ಮ ಚಂದ್ರ ರಾಶಿಯಿಂದ {n}ನೇದು, ಅನುಕೂಲಕರ ಚಂದ್ರಬಲ', moonWeak: 'ನಿಮ್ಮ ಚಂದ್ರ ರಾಶಿಯಿಂದ {n}ನೇದು, ಸಾಮಾನ್ಯದಿಂದ ದುರ್ಬಲ ಚಂದ್ರಬಲ',
      verdict: ['ಒಟ್ಟಾರೆಯಾಗಿ ಈ ವಿಷಯಕ್ಕೆ ಸಾಂಪ್ರದಾಯಿಕ ಸೂಚನೆಗಳು ಅನುಕೂಲಕರವಾಗಿವೆ.', 'ಒಟ್ಟಾರೆಯಾಗಿ ಸೂಚನೆಗಳು ಮಿಶ್ರವಾಗಿವೆ; ಅನುಕೂಲ ಮತ್ತು ಸವಾಲು ಎರಡೂ ಇವೆ.', 'ಒಟ್ಟಾರೆಯಾಗಿ ಈ ವಿಷಯದಲ್ಲಿ ತಾಳ್ಮೆ ಮತ್ತು ನಿರಂತರ ಪ್ರಯತ್ನ ಬೇಕು ಎಂದು ಸಾಂಪ್ರದಾಯಿಕ ಸೂಚನೆಗಳು ಹೇಳುತ್ತವೆ.'],
      disclaimer: 'ಇದು ಸಾಂಪ್ರದಾಯಿಕ ನಿಯಮಗಳ (ಭಾವಾಧಿಪತಿಗಳು, ಕಾರಕರು, ಪ್ರಸ್ತುತ ದಶೆ, ಚಂದ್ರ ಸಂಚಾರ) ಆಧಾರದ ಸಾಮಾನ್ಯ ಮಾರ್ಗದರ್ಶನ ಮಾತ್ರ; ಇದು ಭವಿಷ್ಯ ಅಥವಾ ತಜ್ಞರ ಸಲಹೆ ಅಲ್ಲ.'
    },
    ml: {
      h: '{n}-ാം ഭാവം', inh: '{n}-ാം ഭാവത്തിൽ',
      title: '{label} — നിങ്ങളുടെ കണക്കാക്കിയ ജാതകത്തെ അടിസ്ഥാനമാക്കി',
      labels: { money: 'പണം, സാമ്പത്തികം', study: 'പഠനം, വിദ്യാഭ്യാസം', career: 'ജോലി, തൊഴിൽ', marriage: 'വിവാഹം, ബന്ധങ്ങൾ', health: 'ആരോഗ്യം', life: 'പൊതുവായ ജീവിതം' },
      house: '{hn} ({sign}): ഇതിന്റെ അധിപൻ {lord} {tone}.', hn: '{n}-ാം ഭാവം',
      exalted: 'ഉച്ചത്തിലാണ്; ഇത് ഈ കാര്യത്തിന് ശക്തമായ സൂചനയാണ്', own: 'സ്വക്ഷേത്രത്തിലാണ്; ഇത് ഈ കാര്യത്തെ സ്ഥിരമാക്കുന്നു', debil: 'നീചത്തിലാണ്; അതിനാൽ ഈ കാര്യത്തിൽ കൂടുതൽ പരിശ്രമം വേണ്ടിവരാം',
      hard: '{inh} ആണ്; ഇത് പാരമ്പര്യമായി താമസത്തെയോ അധ്വാനത്തെയോ സൂചിപ്പിക്കുന്ന സ്ഥാനമാണ്', good: '{inh} ആണ്; ഇത് അനുകൂലമായ സ്ഥാനമാണ്', plain: '{inh} ആണ്', na: 'ലഭ്യമല്ല',
      occ: ' ഇവിടെയുള്ള ഗ്രഹങ്ങൾ: {list} ({kind}).', kinds: ['ശുഭ സ്വാധീനം', 'സമ്മിശ്ര സ്വാധീനം', 'കഠിന സ്വാധീനം'],
      karaka: 'സ്വാഭാവിക കാരകൻ {body}: {sign}, {h}{bit}{retro}.', bits: { exalted: ', ഉച്ചം', own: ', സ്വക്ഷേത്രം', debil: ', നീചം' }, retro: ', വക്രം',
      dashaRel: 'ഇപ്പോഴത്തെ വിംശോത്തരി ദശ: {body} – ഇത് ഈ കാര്യവുമായി ബന്ധപ്പെട്ടിരിക്കുന്നു ({why}), അതിനാൽ ഈ കാര്യങ്ങൾ ഇപ്പോൾ കൂടുതൽ പ്രകടമാകാം.', whyRuled: 'ഈ ഭാവങ്ങളിൽ ഒന്നിന്റെ അധിപൻ', whyKaraka: 'സ്വാഭാവിക കാരകൻ',
      dashaNo: 'ഇപ്പോഴത്തെ വിംശോത്തരി ദശ: {body} – ഇത് ഈ കാര്യവുമായി നേരിട്ട് ബന്ധപ്പെട്ടതല്ല, അതിനാൽ ഇപ്പോൾ മറ്റ് കാര്യങ്ങൾ മുന്നിൽ വരാം.',
      today: '{when}: ചന്ദ്രൻ {sign} രാശിയിലൂടെ സഞ്ചരിക്കുന്നു, {kind}.', whenToday: 'ഇന്ന്', whenDate: '{date} ന്',
      moon8: 'നിങ്ങളുടെ ചന്ദ്ര രാശിയിൽ നിന്ന് 8-ാമത് (അഷ്ടമ ചന്ദ്രൻ), പാരമ്പര്യമായി ജാഗ്രത വേണ്ട ദിവസം', moonGood: 'നിങ്ങളുടെ ചന്ദ്ര രാശിയിൽ നിന്ന് {n}-ാമത്, അനുകൂലമായ ചന്ദ്രബലം', moonWeak: 'നിങ്ങളുടെ ചന്ദ്ര രാശിയിൽ നിന്ന് {n}-ാമത്, സാധാരണം മുതൽ ദുർബലമായ ചന്ദ്രബലം',
      verdict: ['മൊത്തത്തിൽ ഈ കാര്യത്തിനുള്ള പാരമ്പര്യ സൂചനകൾ അനുകൂലമാണ്.', 'മൊത്തത്തിൽ സൂചനകൾ സമ്മിശ്രമാണ്; അനുകൂലവും വെല്ലുവിളിയും ഉണ്ട്.', 'മൊത്തത്തിൽ ഈ കാര്യത്തിൽ ക്ഷമയും സ്ഥിരമായ പരിശ്രമവും വേണമെന്ന് പാരമ്പര്യ സൂചനകൾ പറയുന്നു.'],
      disclaimer: 'ഇത് പാരമ്പര്യ നിയമങ്ങളെ (ഭാവാധിപന്മാർ, കാരകന്മാർ, നിലവിലെ ദശ, ചന്ദ്ര സഞ്ചാരം) ആധാരമാക്കിയുള്ള പൊതുവായ മാർഗ്ഗനിർദ്ദേശം മാത്രമാണ്; ഇത് പ്രവചനമോ വിദഗ്ധ ഉപദേശമോ അല്ല.'
    },
    mr: {
      h: 'भाव {n}', inh: 'भाव {n} मध्ये',
      title: '{label} — तुमच्या गणना केलेल्या कुंडलीनुसार',
      labels: { money: 'धन आणि आर्थिक स्थिती', study: 'अभ्यास आणि शिक्षण', career: 'करिअर आणि काम', marriage: 'विवाह आणि नातेसंबंध', health: 'आरोग्य', life: 'सामान्य जीवन' },
      house: '{hn} ({sign}): याचा स्वामी {lord} {tone}.', hn: 'भाव {n}',
      exalted: 'उच्च स्थितीत आहे, हे या विषयासाठी मजबूत संकेत आहे', own: 'स्वराशीत आहे, ज्यामुळे हा विषय स्थिर राहतो', debil: 'नीच स्थितीत आहे, त्यामुळे या विषयात जास्त प्रयत्न करावे लागू शकतात',
      hard: '{inh} आहे, ही परंपरेने विलंब किंवा कष्ट दर्शवणारी स्थिती आहे', good: '{inh} आहे, ही अनुकूल स्थिती आहे', plain: '{inh} आहे', na: 'उपलब्ध नाही',
      occ: ' येथील ग्रह: {list} ({kind}).', kinds: ['शुभ प्रभाव', 'मिश्र प्रभाव', 'कठोर प्रभाव'],
      karaka: 'नैसर्गिक कारक {body}: {sign}, {h}{bit}{retro}.', bits: { exalted: ', उच्च', own: ', स्वराशी', debil: ', नीच' }, retro: ', वक्री',
      dashaRel: 'सध्याची विंशोत्तरी दशा: {body} – ही या विषयाशी संबंधित आहे ({why}), त्यामुळे या गोष्टी आता अधिक ठळक दिसू शकतात.', whyRuled: 'हा या भावांपैकी एकाचा स्वामी आहे', whyKaraka: 'हा नैसर्गिक कारक आहे',
      dashaNo: 'सध्याची विंशोत्तरी दशा: {body} – ही थेट या विषयाशी संबंधित नाही, त्यामुळे सध्या इतर विषय पुढे असू शकतात.',
      today: '{when}: चंद्र {sign} मध्ये भ्रमण करत आहे, {kind}.', whenToday: 'आज', whenDate: '{date} रोजी',
      moon8: 'तुमच्या चंद्र राशीपासून 8वा (अष्टम चंद्र), परंपरेने सावधगिरीचा दिवस', moonGood: 'तुमच्या चंद्र राशीपासून {n}वा, अनुकूल चंद्रबल', moonWeak: 'तुमच्या चंद्र राशीपासून {n}वा, सामान्य ते कमकुवत चंद्रबल',
      verdict: ['एकंदरीत या विषयाचे पारंपरिक संकेत अनुकूल आहेत.', 'एकंदरीत संकेत संमिश्र आहेत; अनुकूल आणि आव्हानात्मक दोन्ही गोष्टी आहेत.', 'एकंदरीत पारंपरिक संकेतांनुसार या विषयात संयम आणि सातत्यपूर्ण प्रयत्न हवेत.'],
      disclaimer: 'हे पारंपरिक नियमांवर (भावेश, कारक, सध्याची दशा आणि चंद्र गोचर) आधारित सामान्य मार्गदर्शन आहे. ही भविष्यवाणी किंवा तज्ज्ञांचा सल्ला नाही.'
    },
    bn: {
      h: '{n} নম্বর ভাব', inh: '{n} নম্বর ভাবে',
      title: '{label} — আপনার গণনা করা কুণ্ডলী অনুযায়ী',
      labels: { money: 'অর্থ ও আর্থিক বিষয়', study: 'পড়াশোনা ও শিক্ষা', career: 'কর্মজীবন', marriage: 'বিবাহ ও সম্পর্ক', health: 'স্বাস্থ্য', life: 'সাধারণ জীবন' },
      house: '{hn} ({sign}): এর অধিপতি {lord} {tone}।', hn: '{n} নম্বর ভাব',
      exalted: 'উচ্চস্থ, যা এই বিষয়ের জন্য শক্তিশালী ইঙ্গিত', own: 'স্বক্ষেত্রে আছেন, যা এই বিষয়কে স্থির রাখে', debil: 'নীচস্থ, তাই এই বিষয়ে বাড়তি চেষ্টা লাগতে পারে',
      hard: '{inh} আছেন, যা ঐতিহ্যগতভাবে বিলম্ব বা পরিশ্রমের সঙ্গে যুক্ত অবস্থান', good: '{inh} আছেন, যা সহায়ক অবস্থান', plain: '{inh} আছেন', na: 'পাওয়া যায়নি',
      occ: ' এখানে থাকা গ্রহ: {list} ({kind})।', kinds: ['শুভ প্রভাব', 'মিশ্র প্রভাব', 'কঠিন প্রভাব'],
      karaka: 'স্বাভাবিক কারক {body}: {sign}, {h}{bit}{retro}।', bits: { exalted: ', উচ্চ', own: ', স্বক্ষেত্র', debil: ', নীচ' }, retro: ', বক্রী',
      dashaRel: 'বর্তমান বিংশোত্তরী দশা: {body} – এটি এই বিষয়ের সঙ্গে যুক্ত ({why}), তাই এই বিষয়গুলো এখন বেশি প্রকট হতে পারে।', whyRuled: 'এটি এই ভাবগুলোর একটির অধিপতি', whyKaraka: 'এটি স্বাভাবিক কারক',
      dashaNo: 'বর্তমান বিংশোত্তরী দশা: {body} – এটি সরাসরি এই বিষয়ের সঙ্গে যুক্ত নয়, তাই এখন অন্য বিষয় এগিয়ে থাকতে পারে।',
      today: '{when}: চন্দ্র {sign} রাশিতে গোচর করছে, {kind}।', whenToday: 'আজ', whenDate: '{date} তারিখে',
      moon8: 'আপনার চন্দ্র রাশি থেকে ৮ম (অষ্টম চন্দ্র), ঐতিহ্যগতভাবে সতর্কতার দিন', moonGood: 'আপনার চন্দ্র রাশি থেকে {n}ম, অনুকূল চন্দ্রবল', moonWeak: 'আপনার চন্দ্র রাশি থেকে {n}ম, সাধারণ থেকে দুর্বল চন্দ্রবল',
      verdict: ['মোটের উপর এই বিষয়ের ঐতিহ্যগত ইঙ্গিত সহায়ক।', 'মোটের উপর ইঙ্গিত মিশ্র; সহায়ক ও চ্যালেঞ্জিং দুই ধরনের বিষয়ই আছে।', 'মোটের উপর ঐতিহ্যগত ইঙ্গিত বলছে এই বিষয়ে ধৈর্য ও নিয়মিত চেষ্টা দরকার।'],
      disclaimer: 'এটি ঐতিহ্যগত নিয়মের (ভাবাধিপতি, কারক, বর্তমান দশা ও চন্দ্র গোচর) ভিত্তিতে সাধারণ দিকনির্দেশনা মাত্র; এটি ভবিষ্যদ্বাণী বা বিশেষজ্ঞের পরামর্শ নয়।'
    },
    gu: {
      h: 'ભાવ {n}', inh: 'ભાવ {n} માં',
      title: '{label} — તમારી ગણતરી કરેલી કુંડળી મુજબ',
      labels: { money: 'ધન અને આર્થિક બાબતો', study: 'અભ્યાસ અને શિક્ષણ', career: 'કારકિર્દી અને કામ', marriage: 'લગ્ન અને સંબંધો', health: 'સ્વાસ્થ્ય', life: 'સામાન્ય જીવન' },
      house: '{hn} ({sign}): તેના સ્વામી {lord} {tone}.', hn: 'ભાવ {n}',
      exalted: 'ઉચ્ચના છે, જે આ બાબત માટે મજબૂત સંકેત છે', own: 'સ્વરાશિમાં છે, જે આ બાબતને સ્થિર રાખે છે', debil: 'નીચના છે, તેથી આ બાબતમાં વધારાના પ્રયત્નની જરૂર પડી શકે',
      hard: '{inh} છે, જે પરંપરાગત રીતે વિલંબ અથવા મહેનત દર્શાવતી સ્થિતિ છે', good: '{inh} છે, જે અનુકૂળ સ્થિતિ છે', plain: '{inh} છે', na: 'ઉપલબ્ધ નથી',
      occ: ' અહીં રહેલા ગ્રહો: {list} ({kind}).', kinds: ['શુભ પ્રભાવ', 'મિશ્ર પ્રભાવ', 'કઠિન પ્રભાવ'],
      karaka: 'નૈસર્ગિક કારક {body}: {sign}, {h}{bit}{retro}.', bits: { exalted: ', ઉચ્ચ', own: ', સ્વરાશિ', debil: ', નીચ' }, retro: ', વક્રી',
      dashaRel: 'વર્તમાન વિંશોત્તરી દશા: {body} – તે આ બાબત સાથે જોડાયેલી છે ({why}), તેથી આ બાબતો હમણાં વધુ પ્રબળ રહી શકે.', whyRuled: 'તે આ ભાવોમાંથી એકનો સ્વામી છે', whyKaraka: 'તે નૈસર્ગિક કારક છે',
      dashaNo: 'વર્તમાન વિંશોત્તરી દશા: {body} – તે સીધી આ બાબત સાથે જોડાયેલી નથી, તેથી હમણાં બીજી બાબતો આગળ રહી શકે.',
      today: '{when}: ચંદ્ર {sign} માં ગોચર કરે છે, {kind}.', whenToday: 'આજે', whenDate: '{date} ના રોજ',
      moon8: 'તમારી ચંદ્ર રાશિથી 8મો (અષ્ટમ ચંદ્ર), પરંપરાગત રીતે સાવચેતીનો દિવસ', moonGood: 'તમારી ચંદ્ર રાશિથી {n}મો, અનુકૂળ ચંદ્રબળ', moonWeak: 'તમારી ચંદ્ર રાશિથી {n}મો, સામાન્યથી નબળું ચંદ્રબળ',
      verdict: ['કુલ મળીને આ બાબતના પરંપરાગત સંકેતો અનુકૂળ છે.', 'કુલ મળીને સંકેતો મિશ્ર છે; અનુકૂળ અને પડકારરૂપ બંને બાબતો છે.', 'કુલ મળીને પરંપરાગત સંકેતો કહે છે કે આ બાબતમાં ધીરજ અને સતત પ્રયત્ન જરૂરી છે.'],
      disclaimer: 'આ પરંપરાગત નિયમો (ભાવેશ, કારક, વર્તમાન દશા અને ચંદ્ર ગોચર) પર આધારિત સામાન્ય માર્ગદર્શન છે. તે આગાહી અથવા નિષ્ણાતની સલાહ નથી.'
    }
  });
  const fillText = (template, vars) => template.replace(/\{(\w+)\}/g, (_m, key) => (key in vars ? String(vars[key]) : ''));
  function readLife(chart, details, key, language, today) {
    const topic = TOPICS[key];
    const text = READING_TEXT[language] || READING_TEXT.en;
    const lagna = chart.ascendant.rashi_index;
    const place = name => (details && details.planets && details.planets[name]) || chart.positions[name];
    const sign = index => signName(index, language), body = name => bodyName(name, language);
    const nth = n => ({ n, o: ordinal(n) });
    const lines = [fillText(text.title, { label: text.labels[key] })];
    let good = 0, hard = 0;
    for (const house of topic.houses) {
      const rashi = (lagna + house - 2) % 12 + 1, lord = SIGN_LORD[rashi - 1], lp = place(lord), lordHouse = lp ? lp.whole_sign_bhava : null;
      const occupants = Object.keys(chart.positions).filter(name => chart.positions[name].whole_sign_bhava === house);
      if (details && details.planets) for (const node of ['Rahu', 'Ketu']) if (details.planets[node] && details.planets[node].whole_sign_bhava === house) occupants.push(node);
      const inh = lordHouse ? fillText(text.inh, nth(lordHouse)) : '';
      let tone;
      if (!lp) tone = text.na;
      else if (lp.dignity === 'exalted') { tone = text.exalted; good += 1; }
      else if (lp.dignity === 'own') { tone = text.own; good += 1; }
      else if (lp.dignity === 'debilitated') { tone = text.debil; hard += 1; }
      else if (HARD_HOUSES.includes(lordHouse)) { tone = fillText(text.hard, { inh }); hard += 1; }
      else if ([1, 4, 5, 7, 9, 10, 11].includes(lordHouse)) { tone = fillText(text.good, { inh }); good += 1; }
      else tone = fillText(text.plain, { inh });
      let line = fillText(text.house, { hn: fillText(text.hn, nth(house)), sign: sign(rashi), lord: body(lord), tone });
      if (occupants.length) {
        const kind = occupants.every(n => BENEFICS.includes(n)) ? text.kinds[0] : occupants.some(n => BENEFICS.includes(n)) ? text.kinds[1] : text.kinds[2];
        line += fillText(text.occ, { list: occupants.map(body).join(', '), kind });
        good += occupants.filter(n => BENEFICS.includes(n)).length; hard += occupants.filter(n => MALEFICS.includes(n)).length;
      }
      lines.push(line);
    }
    for (const karaka of topic.karakas) {
      const p = place(karaka);
      if (!p) continue;
      const bit = p.dignity === 'exalted' ? text.bits.exalted : p.dignity === 'own' ? text.bits.own : p.dignity === 'debilitated' ? text.bits.debil : '';
      lines.push(fillText(text.karaka, { body: body(karaka), sign: sign(p.rashi_index), h: fillText(text.h, nth(p.whole_sign_bhava)), bit, retro: p.retrograde ? text.retro : '' }));
      if (p.dignity === 'exalted' || p.dignity === 'own') good += 1;
      if (p.dignity === 'debilitated') hard += 1;
    }
    const dasha = details && details.dasha;
    if (dasha && dasha.current_mahadasha) {
      const dl = dasha.current_mahadasha;
      const ruled = topic.houses.some(h => SIGN_LORD[(lagna + h - 2) % 12] === dl);
      lines.push(ruled || topic.karakas.includes(dl)
        ? fillText(text.dashaRel, { body: body(dl), why: ruled ? text.whyRuled : text.whyKaraka })
        : fillText(text.dashaNo, { body: body(dl) }));
    }
    if (today && today.moonRashi) {
      const house = (today.moonRashi - chart.positions.Moon.rashi_index + 12) % 12 + 1;
      const kind = house === 8 ? text.moon8 : [1, 3, 6, 7, 10, 11].includes(house) ? fillText(text.moonGood, nth(house)) : fillText(text.moonWeak, nth(house));
      lines.push(fillText(text.today, { when: today.isToday ? text.whenToday : fillText(text.whenDate, { date: today.date }), sign: sign(today.moonRashi), kind }));
    }
    lines.push(good - hard >= 2 ? text.verdict[0] : hard - good >= 2 ? text.verdict[2] : text.verdict[1]);
    lines.push(text.disclaimer);
    return lines;
  }

  // ---- "What is expected today": the day's Moon, Tara, current period and timings applied to the birth chart. ----
  const TODAY_TEXT = Object.freeze({
    en: {
      title: 'Today ({date}) — what your chart indicates',
      areaLine: 'With the Moon in the {o} from your Moon sign, the day’s emphasis falls on: {area}.',
      areas: ['yourself, health and vitality', 'money, speech and family', 'effort, courage and short travel', 'home, comfort and peace of mind', 'study, creativity and children', 'competition, work routine and health care',
        'partnerships and dealings with others', 'caution, hidden matters and unexpected changes', 'luck, guidance and long-term plans', 'work, status and responsibilities', 'gains, friends and fulfilment of wishes', 'expenses, rest and letting go'],
      tara: 'Tarabalam: today’s Nakshatra {nak} is your {taraName} Tara ({o} from your birth star {birth}), {kind}.',
      taraNames: ['Janma', 'Sampat', 'Vipat', 'Kshema', 'Pratyari', 'Sadhaka', 'Vadha', 'Mitra', 'Ati-mitra'],
      taraGood: 'a favourable star for starting things', taraBad: 'a day to be careful with new commitments',
      period: 'Running period: {maha} Mahadasha, {antar} Antardasha.', periodOnly: 'Running period: {maha} Mahadasha.',
      best: 'Best window: Abhijit Muhurta {from} – {to}.', avoid: 'Avoid starting important things in Rahu Kalam {from} – {to}.',
      verdict: ['Overall the day looks supportive for you: a good time to move ahead with what matters.', 'Overall the day looks mixed: steady, routine work goes better than big new steps.', 'Overall the day asks for caution: avoid hurried decisions and keep plans flexible.']
    },
    te: {
      title: 'ఈ రోజు ({date}) — మీ జాతకం సూచించేది',
      areaLine: 'మీ చంద్ర రాశి నుండి {n}వ స్థానంలో చంద్రుడు ఉన్నందున ఈ రోజు ప్రధానంగా: {area}.',
      areas: ['మీ గురించి, ఆరోగ్యం, శక్తి', 'డబ్బు, మాట, కుటుంబం', 'ప్రయత్నం, ధైర్యం, చిన్న ప్రయాణాలు', 'ఇల్లు, సౌకర్యం, మనశ్శాంతి', 'చదువు, సృజనాత్మకత, పిల్లలు', 'పోటీ, రోజువారీ పని, ఆరోగ్య సంరక్షణ',
        'భాగస్వామ్యాలు, ఇతరులతో వ్యవహారాలు', 'జాగ్రత్త, దాగి ఉన్న విషయాలు, ఊహించని మార్పులు', 'అదృష్టం, పెద్దల మార్గదర్శనం, దీర్ఘకాల ప్రణాళికలు', 'పని, హోదా, బాధ్యతలు', 'లాభాలు, స్నేహితులు, కోరికల నెరవేర్పు', 'ఖర్చులు, విశ్రాంతి, వదులుకోవడం'],
      tara: 'తారాబలం: ఈ రోజు నక్షత్రం {nak} మీ జన్మ నక్షత్రం {birth} నుండి {n}వది, అంటే {taraName} తార; {kind}.',
      taraNames: ['జన్మ', 'సంపత్', 'విపత్', 'క్షేమ', 'ప్రత్యరి', 'సాధక', 'వధ', 'మిత్ర', 'అతిమిత్ర'],
      taraGood: 'కొత్త పనులు మొదలుపెట్టడానికి అనుకూలమైన నక్షత్రం', taraBad: 'కొత్త నిబద్ధతల విషయంలో జాగ్రత్త అవసరమైన రోజు',
      period: 'నడుస్తున్న దశ: {maha} మహాదశ, {antar} అంతర్దశ.', periodOnly: 'నడుస్తున్న దశ: {maha} మహాదశ.',
      best: 'ఉత్తమ సమయం: అభిజిత్ ముహూర్తం {from} – {to}.', avoid: 'రాహుకాలం {from} – {to} లో ముఖ్యమైన పనులు మొదలుపెట్టకండి.',
      verdict: ['మొత్తం మీద ఈ రోజు మీకు అనుకూలంగా ఉంది: ముఖ్యమైన పనులు ముందుకు తీసుకెళ్లడానికి మంచి సమయం.', 'మొత్తం మీద ఈ రోజు మిశ్రమంగా ఉంది: పెద్ద కొత్త అడుగుల కన్నా స్థిరమైన రోజువారీ పని మేలు.', 'మొత్తం మీద ఈ రోజు జాగ్రత్త అవసరం: తొందరపాటు నిర్ణయాలు మానండి, ప్రణాళికలను అనువుగా ఉంచుకోండి.']
    },
    hi: {
      title: 'आज ({date}) — आपकी कुंडली क्या संकेत देती है',
      areaLine: 'आपकी चंद्र राशि से {n}वें स्थान में चंद्रमा होने से आज का ध्यान इन पर रहेगा: {area}।',
      areas: ['स्वयं, स्वास्थ्य और ऊर्जा', 'धन, वाणी और परिवार', 'प्रयास, साहस और छोटी यात्राएँ', 'घर, सुख-सुविधा और मन की शांति', 'पढ़ाई, रचनात्मकता और संतान', 'प्रतिस्पर्धा, दिनचर्या का काम और स्वास्थ्य की देखभाल',
        'साझेदारी और दूसरों से व्यवहार', 'सावधानी, छिपी बातें और अप्रत्याशित बदलाव', 'भाग्य, बड़ों का मार्गदर्शन और लंबी योजनाएँ', 'काम, पद और जिम्मेदारियाँ', 'लाभ, मित्र और इच्छाओं की पूर्ति', 'खर्च, विश्राम और छोड़ देना'],
      tara: 'ताराबल: आज का नक्षत्र {nak} आपके जन्म नक्षत्र {birth} से {n}वां है, यानी {taraName} तारा; {kind}।',
      taraNames: ['जन्म', 'संपत', 'विपत', 'क्षेम', 'प्रत्यरि', 'साधक', 'वध', 'मित्र', 'अतिमित्र'],
      taraGood: 'नए काम शुरू करने के लिए अनुकूल नक्षत्र', taraBad: 'नई प्रतिबद्धताओं में सावधानी रखने का दिन',
      period: 'चल रही दशा: {maha} महादशा, {antar} अंतर्दशा।', periodOnly: 'चल रही दशा: {maha} महादशा।',
      best: 'श्रेष्ठ समय: अभिजित मुहूर्त {from} – {to}।', avoid: 'राहुकाल {from} – {to} में महत्वपूर्ण काम शुरू न करें।',
      verdict: ['कुल मिलाकर आज का दिन आपके लिए अनुकूल है: जरूरी कामों को आगे बढ़ाने का अच्छा समय।', 'कुल मिलाकर दिन मिला-जुला है: बड़े नए कदमों से ज्यादा नियमित काम बेहतर रहेगा।', 'कुल मिलाकर आज सावधानी चाहिए: जल्दबाजी में फैसले न लें और योजनाएँ लचीली रखें।']
    },
    ta: {
      title: 'இன்று ({date}) — உங்கள் ஜாதகம் காட்டுவது',
      areaLine: 'உங்கள் சந்திர ராசியிலிருந்து {n}-வது இடத்தில் சந்திரன் இருப்பதால் இன்றைய கவனம்: {area}.',
      areas: ['உங்களைப் பற்றியது, ஆரோக்கியம், சக்தி', 'பணம், பேச்சு, குடும்பம்', 'முயற்சி, தைரியம், குறுகிய பயணங்கள்', 'வீடு, வசதி, மன அமைதி', 'படிப்பு, படைப்பாற்றல், குழந்தைகள்', 'போட்டி, அன்றாட வேலை, உடல்நலப் பராமரிப்பு',
        'கூட்டாண்மை, பிறருடன் தொடர்புகள்', 'எச்சரிக்கை, மறைந்த விஷயங்கள், எதிர்பாராத மாற்றங்கள்', 'அதிர்ஷ்டம், பெரியோர் வழிகாட்டல், நீண்டகாலத் திட்டங்கள்', 'வேலை, அந்தஸ்து, பொறுப்புகள்', 'லாபம், நண்பர்கள், ஆசை நிறைவேறுதல்', 'செலவுகள், ஓய்வு, விட்டுவிடுதல்'],
      tara: 'தாராபலம்: இன்றைய நட்சத்திரம் {nak} உங்கள் ஜென்ம நட்சத்திரம் {birth}-இலிருந்து {n}-வது, அதாவது {taraName} தாரை; {kind}.',
      taraNames: ['ஜன்ம', 'சம்பத்', 'விபத்', 'க்ஷேம', 'பிரத்யரி', 'சாதக', 'வத', 'மைத்ர', 'அதிமைத்ர'],
      taraGood: 'புதிய செயல்களைத் தொடங்க சாதகமான நட்சத்திரம்', taraBad: 'புதிய கடமைகளில் கவனம் தேவைப்படும் நாள்',
      period: 'நடப்பு தசை: {maha} மகாதசை, {antar} புக்தி.', periodOnly: 'நடப்பு தசை: {maha} மகாதசை.',
      best: 'சிறந்த நேரம்: அபிஜித் முகூர்த்தம் {from} – {to}.', avoid: 'ராகு காலம் {from} – {to} இல் முக்கிய செயல்களைத் தொடங்க வேண்டாம்.',
      verdict: ['மொத்தத்தில் இன்றைய நாள் உங்களுக்குச் சாதகமாக உள்ளது: முக்கியமானவற்றை முன்னெடுக்க நல்ல நேரம்.', 'மொத்தத்தில் நாள் கலவையாக உள்ளது: பெரிய புதிய முயற்சிகளை விட வழக்கமான வேலை நன்றாக அமையும்.', 'மொத்தத்தில் இன்று எச்சரிக்கை தேவை: அவசர முடிவுகளைத் தவிர்த்து திட்டங்களை நெகிழ்வாக வைத்திருங்கள்.']
    },
    kn: {
      title: 'ಇಂದು ({date}) — ನಿಮ್ಮ ಜಾತಕ ಸೂಚಿಸುವುದು',
      areaLine: 'ನಿಮ್ಮ ಚಂದ್ರ ರಾಶಿಯಿಂದ {n}ನೇ ಸ್ಥಾನದಲ್ಲಿ ಚಂದ್ರನಿರುವುದರಿಂದ ಇಂದಿನ ಗಮನ: {area}.',
      areas: ['ನಿಮ್ಮ ಬಗ್ಗೆ, ಆರೋಗ್ಯ, ಶಕ್ತಿ', 'ಹಣ, ಮಾತು, ಕುಟುಂಬ', 'ಪ್ರಯತ್ನ, ಧೈರ್ಯ, ಸಣ್ಣ ಪ್ರಯಾಣ', 'ಮನೆ, ಸೌಕರ್ಯ, ಮನಃಶಾಂತಿ', 'ಓದು, ಸೃಜನಶೀಲತೆ, ಮಕ್ಕಳು', 'ಸ್ಪರ್ಧೆ, ದಿನನಿತ್ಯದ ಕೆಲಸ, ಆರೋಗ್ಯ ಆರೈಕೆ',
        'ಪಾಲುದಾರಿಕೆ, ಇತರರೊಂದಿಗಿನ ವ್ಯವಹಾರ', 'ಎಚ್ಚರಿಕೆ, ಗುಪ್ತ ವಿಷಯಗಳು, ಅನಿರೀಕ್ಷಿತ ಬದಲಾವಣೆ', 'ಅದೃಷ್ಟ, ಹಿರಿಯರ ಮಾರ್ಗದರ್ಶನ, ದೀರ್ಘಕಾಲದ ಯೋಜನೆ', 'ಕೆಲಸ, ಸ್ಥಾನಮಾನ, ಜವಾಬ್ದಾರಿ', 'ಲಾಭ, ಸ್ನೇಹಿತರು, ಆಸೆ ಈಡೇರುವುದು', 'ಖರ್ಚು, ವಿಶ್ರಾಂತಿ, ಬಿಟ್ಟುಬಿಡುವುದು'],
      tara: 'ತಾರಾಬಲ: ಇಂದಿನ ನಕ್ಷತ್ರ {nak} ನಿಮ್ಮ ಜನ್ಮ ನಕ್ಷತ್ರ {birth} ರಿಂದ {n}ನೇದು, ಅಂದರೆ {taraName} ತಾರೆ; {kind}.',
      taraNames: ['ಜನ್ಮ', 'ಸಂಪತ್', 'ವಿಪತ್', 'ಕ್ಷೇಮ', 'ಪ್ರತ್ಯರಿ', 'ಸಾಧಕ', 'ವಧ', 'ಮಿತ್ರ', 'ಅತಿಮಿತ್ರ'],
      taraGood: 'ಹೊಸ ಕೆಲಸ ಆರಂಭಿಸಲು ಅನುಕೂಲಕರ ನಕ್ಷತ್ರ', taraBad: 'ಹೊಸ ಬದ್ಧತೆಗಳಲ್ಲಿ ಎಚ್ಚರಿಕೆ ಬೇಕಾದ ದಿನ',
      period: 'ನಡೆಯುತ್ತಿರುವ ದಶೆ: {maha} ಮಹಾದಶೆ, {antar} ಅಂತರ್ದಶೆ.', periodOnly: 'ನಡೆಯುತ್ತಿರುವ ದಶೆ: {maha} ಮಹಾದಶೆ.',
      best: 'ಉತ್ತಮ ಸಮಯ: ಅಭಿಜಿತ್ ಮುಹೂರ್ತ {from} – {to}.', avoid: 'ರಾಹುಕಾಲ {from} – {to} ರಲ್ಲಿ ಮುಖ್ಯ ಕೆಲಸ ಆರಂಭಿಸಬೇಡಿ.',
      verdict: ['ಒಟ್ಟಾರೆ ಇಂದಿನ ದಿನ ನಿಮಗೆ ಅನುಕೂಲಕರ: ಮುಖ್ಯ ಕೆಲಸಗಳನ್ನು ಮುಂದುವರಿಸಲು ಒಳ್ಳೆಯ ಸಮಯ.', 'ಒಟ್ಟಾರೆ ದಿನ ಮಿಶ್ರವಾಗಿದೆ: ದೊಡ್ಡ ಹೊಸ ಹೆಜ್ಜೆಗಳಿಗಿಂತ ನಿತ್ಯದ ಕೆಲಸ ಚೆನ್ನಾಗಿರುತ್ತದೆ.', 'ಒಟ್ಟಾರೆ ಇಂದು ಎಚ್ಚರಿಕೆ ಬೇಕು: ಆತುರದ ನಿರ್ಧಾರ ಬೇಡ, ಯೋಜನೆಗಳನ್ನು ಹೊಂದಿಕೊಳ್ಳುವಂತೆ ಇಟ್ಟುಕೊಳ್ಳಿ.']
    },
    ml: {
      title: 'ഇന്ന് ({date}) — നിങ്ങളുടെ ജാതകം സൂചിപ്പിക്കുന്നത്',
      areaLine: 'നിങ്ങളുടെ ചന്ദ്ര രാശിയിൽ നിന്ന് {n}-ാം സ്ഥാനത്ത് ചന്ദ്രൻ ആയതിനാൽ ഇന്നത്തെ ശ്രദ്ധ: {area}.',
      areas: ['നിങ്ങളെക്കുറിച്ച്, ആരോഗ്യം, ഊർജ്ജം', 'പണം, സംസാരം, കുടുംബം', 'പരിശ്രമം, ധൈര്യം, ചെറിയ യാത്രകൾ', 'വീട്, സുഖം, മനസ്സമാധാനം', 'പഠനം, സർഗ്ഗാത്മകത, കുട്ടികൾ', 'മത്സരം, ദൈനംദിന ജോലി, ആരോഗ്യ പരിപാലനം',
        'പങ്കാളിത്തം, മറ്റുള്ളവരുമായുള്ള ഇടപാടുകൾ', 'ജാഗ്രത, മറഞ്ഞിരിക്കുന്ന കാര്യങ്ങൾ, അപ്രതീക്ഷിത മാറ്റങ്ങൾ', 'ഭാഗ്യം, മുതിർന്നവരുടെ മാർഗ്ഗനിർദ്ദേശം, ദീർഘകാല പദ്ധതികൾ', 'ജോലി, പദവി, ഉത്തരവാദിത്തങ്ങൾ', 'ലാഭം, സുഹൃത്തുക്കൾ, ആഗ്രഹസാഫല്യം', 'ചെലവുകൾ, വിശ്രമം, ഉപേക്ഷിക്കൽ'],
      tara: 'താരാബലം: ഇന്നത്തെ നക്ഷത്രം {nak} നിങ്ങളുടെ ജന്മനക്ഷത്രം {birth} ൽ നിന്ന് {n}-ാമത്, അതായത് {taraName} താര; {kind}.',
      taraNames: ['ജന്മ', 'സമ്പത്ത്', 'വിപത്ത്', 'ക്ഷേമ', 'പ്രത്യരി', 'സാധക', 'വധ', 'മിത്ര', 'അതിമിത്ര'],
      taraGood: 'പുതിയ കാര്യങ്ങൾ തുടങ്ങാൻ അനുകൂലമായ നക്ഷത്രം', taraBad: 'പുതിയ പ്രതിബദ്ധതകളിൽ ശ്രദ്ധ വേണ്ട ദിവസം',
      period: 'നടക്കുന്ന ദശ: {maha} മഹാദശ, {antar} അപഹാരം.', periodOnly: 'നടക്കുന്ന ദശ: {maha} മഹാദശ.',
      best: 'മികച്ച സമയം: അഭിജിത് മുഹൂർത്തം {from} – {to}.', avoid: 'രാഹുകാലം {from} – {to} ൽ പ്രധാന കാര്യങ്ങൾ തുടങ്ങരുത്.',
      verdict: ['മൊത്തത്തിൽ ഇന്നത്തെ ദിവസം നിങ്ങൾക്ക് അനുകൂലമാണ്: പ്രധാന കാര്യങ്ങൾ മുന്നോട്ട് കൊണ്ടുപോകാൻ നല്ല സമയം.', 'മൊത്തത്തിൽ ദിവസം സമ്മിശ്രമാണ്: വലിയ പുതിയ ചുവടുകളേക്കാൾ പതിവ് ജോലികളാണ് നല്ലത്.', 'മൊത്തത്തിൽ ഇന്ന് ജാഗ്രത വേണം: തിടുക്കത്തിലുള്ള തീരുമാനങ്ങൾ ഒഴിവാക്കി പദ്ധതികൾ അയവോടെ വയ്ക്കുക.']
    },
    mr: {
      title: 'आज ({date}) — तुमची कुंडली काय सांगते',
      areaLine: 'तुमच्या चंद्र राशीपासून {n}व्या स्थानी चंद्र असल्याने आजचे लक्ष: {area}.',
      areas: ['स्वतः, आरोग्य आणि ऊर्जा', 'धन, वाणी आणि कुटुंब', 'प्रयत्न, धैर्य आणि लहान प्रवास', 'घर, सुखसोयी आणि मनःशांती', 'अभ्यास, सर्जनशीलता आणि मुले', 'स्पर्धा, दैनंदिन काम आणि आरोग्य काळजी',
        'भागीदारी आणि इतरांशी व्यवहार', 'सावधगिरी, लपलेल्या गोष्टी आणि अनपेक्षित बदल', 'भाग्य, वडिलधाऱ्यांचे मार्गदर्शन आणि दीर्घकालीन योजना', 'काम, पद आणि जबाबदाऱ्या', 'लाभ, मित्र आणि इच्छापूर्ती', 'खर्च, विश्रांती आणि सोडून देणे'],
      tara: 'ताराबल: आजचे नक्षत्र {nak} तुमच्या जन्म नक्षत्र {birth} पासून {n}वे आहे, म्हणजे {taraName} तारा; {kind}.',
      taraNames: ['जन्म', 'संपत', 'विपत', 'क्षेम', 'प्रत्यरि', 'साधक', 'वध', 'मित्र', 'अतिमित्र'],
      taraGood: 'नवीन कामे सुरू करण्यासाठी अनुकूल नक्षत्र', taraBad: 'नवीन वचनबद्धतांमध्ये सावध राहण्याचा दिवस',
      period: 'सुरू असलेली दशा: {maha} महादशा, {antar} अंतर्दशा.', periodOnly: 'सुरू असलेली दशा: {maha} महादशा.',
      best: 'उत्तम वेळ: अभिजित मुहूर्त {from} – {to}.', avoid: 'राहुकाळ {from} – {to} मध्ये महत्त्वाची कामे सुरू करू नका.',
      verdict: ['एकंदरीत आजचा दिवस तुमच्यासाठी अनुकूल आहे: महत्त्वाची कामे पुढे नेण्यासाठी चांगला काळ.', 'एकंदरीत दिवस संमिश्र आहे: मोठ्या नवीन पावलांपेक्षा नेहमीचे काम चांगले जाईल.', 'एकंदरीत आज सावधगिरी हवी: घाईत निर्णय घेऊ नका आणि योजना लवचिक ठेवा.']
    },
    bn: {
      title: 'আজ ({date}) — আপনার কুণ্ডলী কী ইঙ্গিত দেয়',
      areaLine: 'আপনার চন্দ্র রাশি থেকে {n}ম স্থানে চন্দ্র থাকায় আজকের মনোযোগ: {area}।',
      areas: ['নিজের বিষয়, স্বাস্থ্য ও শক্তি', 'অর্থ, কথা ও পরিবার', 'চেষ্টা, সাহস ও ছোট ভ্রমণ', 'বাড়ি, আরাম ও মনের শান্তি', 'পড়াশোনা, সৃজনশীলতা ও সন্তান', 'প্রতিযোগিতা, দৈনন্দিন কাজ ও স্বাস্থ্যের যত্ন',
        'অংশীদারি ও অন্যদের সঙ্গে লেনদেন', 'সতর্কতা, গোপন বিষয় ও অপ্রত্যাশিত পরিবর্তন', 'ভাগ্য, বড়দের পথনির্দেশ ও দীর্ঘমেয়াদি পরিকল্পনা', 'কাজ, মর্যাদা ও দায়িত্ব', 'লাভ, বন্ধু ও ইচ্ছাপূরণ', 'খরচ, বিশ্রাম ও ছেড়ে দেওয়া'],
      tara: 'তারাবল: আজকের নক্ষত্র {nak} আপনার জন্ম নক্ষত্র {birth} থেকে {n}ম, অর্থাৎ {taraName} তারা; {kind}।',
      taraNames: ['জন্ম', 'সম্পৎ', 'বিপৎ', 'ক্ষেম', 'প্রত্যরি', 'সাধক', 'বধ', 'মিত্র', 'অতিমিত্র'],
      taraGood: 'নতুন কাজ শুরুর জন্য অনুকূল নক্ষত্র', taraBad: 'নতুন প্রতিশ্রুতিতে সতর্ক থাকার দিন',
      period: 'চলমান দশা: {maha} মহাদশা, {antar} অন্তর্দশা।', periodOnly: 'চলমান দশা: {maha} মহাদশা।',
      best: 'সেরা সময়: অভিজিৎ মুহূর্ত {from} – {to}।', avoid: 'রাহুকাল {from} – {to} এ গুরুত্বপূর্ণ কাজ শুরু করবেন না।',
      verdict: ['মোটের উপর আজকের দিন আপনার জন্য অনুকূল: জরুরি কাজ এগিয়ে নেওয়ার ভালো সময়।', 'মোটের উপর দিনটি মিশ্র: বড় নতুন পদক্ষেপের চেয়ে নিয়মিত কাজ ভালো হবে।', 'মোটের উপর আজ সতর্কতা দরকার: তাড়াহুড়োর সিদ্ধান্ত এড়িয়ে পরিকল্পনা নমনীয় রাখুন।']
    },
    gu: {
      title: 'આજે ({date}) — તમારી કુંડળી શું સૂચવે છે',
      areaLine: 'તમારી ચંદ્ર રાશિથી {n}મા સ્થાને ચંદ્ર હોવાથી આજનું ધ્યાન: {area}.',
      areas: ['પોતાની બાબત, સ્વાસ્થ્ય અને ઊર્જા', 'ધન, વાણી અને પરિવાર', 'પ્રયત્ન, હિંમત અને નાની મુસાફરી', 'ઘર, સુખસગવડ અને મનની શાંતિ', 'અભ્યાસ, સર્જનાત્મકતા અને સંતાન', 'સ્પર્ધા, રોજિંદું કામ અને સ્વાસ્થ્યની કાળજી',
        'ભાગીદારી અને બીજા સાથેના વ્યવહાર', 'સાવચેતી, છુપી બાબતો અને અણધાર્યા ફેરફાર', 'ભાગ્ય, વડીલોનું માર્ગદર્શન અને લાંબા ગાળાની યોજના', 'કામ, પદ અને જવાબદારી', 'લાભ, મિત્રો અને ઇચ્છાપૂર્તિ', 'ખર્ચ, આરામ અને છોડી દેવું'],
      tara: 'તારાબળ: આજનું નક્ષત્ર {nak} તમારા જન્મ નક્ષત્ર {birth} થી {n}મું છે, એટલે કે {taraName} તારા; {kind}.',
      taraNames: ['જન્મ', 'સંપત', 'વિપત', 'ક્ષેમ', 'પ્રત્યરિ', 'સાધક', 'વધ', 'મિત્ર', 'અતિમિત્ર'],
      taraGood: 'નવા કામ શરૂ કરવા માટે અનુકૂળ નક્ષત્ર', taraBad: 'નવી જવાબદારીઓમાં સાવચેત રહેવાનો દિવસ',
      period: 'ચાલુ દશા: {maha} મહાદશા, {antar} અંતર્દશા.', periodOnly: 'ચાલુ દશા: {maha} મહાદશા.',
      best: 'શ્રેષ્ઠ સમય: અભિજિત મુહૂર્ત {from} – {to}.', avoid: 'રાહુકાળ {from} – {to} માં મહત્વના કામ શરૂ ન કરો.',
      verdict: ['કુલ મળીને આજનો દિવસ તમારા માટે અનુકૂળ છે: મહત્વના કામ આગળ વધારવાનો સારો સમય.', 'કુલ મળીને દિવસ મિશ્ર છે: મોટા નવા પગલાં કરતાં રોજિંદું કામ સારું રહેશે.', 'કુલ મળીને આજે સાવચેતી જરૂરી છે: ઉતાવળા નિર્ણય ટાળો અને યોજના લવચીક રાખો.']
    }
  });
  const TODAY_WORDS = ['today', 'todays', 'tomorrow', 'expect', 'expected', 'what will happen', 'how is my day', 'how will my day', 'my day', 'daily', 'this week', 'predict', 'prediction', 'forecast', 'happen',
    'ఈ రోజు', 'ఈరోజు', 'రోజు', 'ee roju', 'eroju', 'roju', 'आज', 'aaj', 'आज का', 'இன்று', 'indru', 'ಇಂದು', 'indu', 'ഇന്ന്', 'innu', 'आजचा', 'আজ', 'આજે', 'aaje'];
  function wantsToday(question) {
    if (typeof question !== 'string') return false;
    const text = question.toLowerCase();
    return text.length <= 300 && TODAY_WORDS.some(word => text.includes(word));
  }
  // day: one /api/day-panchang day object; fmt(isoLocal) -> "hh:mm am/pm".
  function readToday(chart, details, day, language, fmt) {
    const text = TODAY_TEXT[language] || TODAY_TEXT.en;
    const names = root.JyotishaPanchangNames;
    const sign = index => signName(index, language), body = name => bodyName(name, language);
    const nth = n => ({ n, o: ordinal(n) });
    const moon = day.moon_rashi && day.moon_rashi[0], nak = day.nakshatra && day.nakshatra[0];
    const lines = [fillText(text.title, { date: day.date })];
    let score = 0;
    if (moon) {
      const house = (moon.index - chart.positions.Moon.rashi_index + 12) % 12 + 1;
      const rd = READING_TEXT[language] || READING_TEXT.en;
      const kind = house === 8 ? rd.moon8 : [1, 3, 6, 7, 10, 11].includes(house) ? fillText(rd.moonGood, nth(house)) : fillText(rd.moonWeak, nth(house));
      lines.push(fillText(rd.today, { when: rd.whenToday, sign: sign(moon.index), kind }));
      lines.push(fillText(text.areaLine, { ...nth(house), area: text.areas[house - 1] }));
      score += house === 8 ? -2 : [1, 3, 6, 7, 10, 11].includes(house) ? 1 : 0;
    }
    if (nak) {
      const birth = chart.panchanga_at_birth.nakshatra_index, count = (nak.index - birth + 27) % 27 + 1, tara = ((nak.index - birth) % 27 + 27) % 27 % 9 + 1, good = [2, 4, 6, 8, 9].includes(tara);
      lines.push(fillText(text.tara, { nak: names.nakshatraName(nak.index, language), birth: names.nakshatraName(birth, language), n: count, o: ordinal(count), taraName: text.taraNames[tara - 1], kind: good ? text.taraGood : text.taraBad }));
      score += good ? 1 : -1;
    }
    const dasha = details && details.dasha;
    if (dasha && dasha.current_mahadasha) {
      const antar = (dasha.antardasha || []).find(item => item.current);
      lines.push(antar ? fillText(text.period, { maha: body(dasha.current_mahadasha), antar: body(antar.lord) }) : fillText(text.periodOnly, { maha: body(dasha.current_mahadasha) }));
    }
    const t = day.timings;
    if (t && t.abhijit) lines.push(fillText(text.best, { from: fmt(t.abhijit[0]), to: fmt(t.abhijit[1]) }));
    if (t && t.rahu_kalam) lines.push(fillText(text.avoid, { from: fmt(t.rahu_kalam[0]), to: fmt(t.rahu_kalam[1]) }));
    lines.push(score >= 2 ? text.verdict[0] : score <= -1 ? text.verdict[2] : text.verdict[1]);
    lines.push((READING_TEXT[language] || READING_TEXT.en).disclaimer);
    return lines;
  }

  // ---- Reading a birth date and time typed in chat (any Indian digits, "15-08-1995", "15 Aug 1995", "6:30 pm", "18.45"). ----
  const DIGIT_BASES = [0x0660, 0x06F0, 0x0966, 0x09E6, 0x0A66, 0x0AE6, 0x0B66, 0x0BE6, 0x0C66, 0x0CE6, 0x0D66];
  function asciiDigits(text) {
    return Array.from(String(text)).map(ch => {
      const cp = ch.codePointAt(0), base = DIGIT_BASES.find(b => cp >= b && cp < b + 10);
      return base === undefined ? ch : String(cp - base);
    }).join('');
  }
  const MONTHS_EN = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  function parseBirthDate(raw) {
    if (typeof raw !== 'string' || raw.length > 60) return null;
    const m = /(\d{1,4})[\s\-\/.,]+(\d{1,2}|[a-z]{3,9})[\s\-\/.,]+(\d{2,4})/i.exec(asciiDigits(raw).toLowerCase());
    if (!m) return null;
    let year, month, day;
    const middle = /^\d+$/.test(m[2]) ? Number(m[2]) : MONTHS_EN.indexOf(m[2].slice(0, 3)) + 1;
    if (m[1].length === 4) { year = Number(m[1]); month = middle; day = Number(m[3]); }
    else { day = Number(m[1]); month = middle; year = Number(m[3]); if (m[3].length === 2) year += year <= 26 ? 2000 : 1900; }
    if (!(year >= 1800 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  function parseBirthTime(raw) {
    if (typeof raw !== 'string' || raw.length > 30) return null;
    let text = asciiDigits(raw).toLowerCase().trim();
    const meridian = /([ap])\s*\.?\s*m\b\.?/.exec(text);
    if (meridian) text = text.replace(meridian[0], '').trim();
    const m = /^(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?$/.exec(text) || /^(\d{2})(\d{2})$/.exec(text);
    if (!m) return null;
    let hour = Number(m[1]); const minute = Number(m[2] || 0);
    if (meridian) { if (hour < 1 || hour > 12) return null; hour = hour % 12 + (meridian[1] === 'p' ? 12 : 0); }
    if (hour > 23 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  // Wording for the general sign-by-sign Rashiphal ("from this sign", not "from your Moon sign").
  const SIGN_MOON_TEXT = Object.freeze({
    en: { moon8: 'the Moon is the 8th from this sign (Ashtama Chandra), traditionally a day for caution', moonGood: 'the Moon is the {o} from this sign, a favourable Chandrabalam', moonWeak: 'the Moon is the {o} from this sign, a neutral-to-weak Chandrabalam', areaLine: 'With the Moon in the {o} from this sign, the day’s emphasis falls on: {area}.' },
    te: { moon8: 'చంద్రుడు ఈ రాశి నుండి 8వ స్థానంలో ఉన్నాడు (అష్టమ చంద్రుడు), సాంప్రదాయకంగా జాగ్రత్త అవసరమైన రోజు', moonGood: 'చంద్రుడు ఈ రాశి నుండి {n}వ స్థానంలో ఉన్నాడు, అనుకూలమైన చంద్రబలం', moonWeak: 'చంద్రుడు ఈ రాశి నుండి {n}వ స్థానంలో ఉన్నాడు, తటస్థం నుండి బలహీనమైన చంద్రబలం', areaLine: 'ఈ రాశి నుండి {n}వ స్థానంలో చంద్రుడు ఉన్నందున ఈ రోజు ప్రధానంగా: {area}.' },
    hi: { moon8: 'चंद्रमा इस राशि से 8वें स्थान पर है (अष्टम चंद्र), परंपरागत रूप से सावधानी का दिन', moonGood: 'चंद्रमा इस राशि से {n}वें स्थान पर है, अनुकूल चंद्रबल', moonWeak: 'चंद्रमा इस राशि से {n}वें स्थान पर है, सामान्य से कमजोर चंद्रबल', areaLine: 'इस राशि से {n}वें स्थान में चंद्रमा होने से आज का ध्यान इन पर रहेगा: {area}।' },
    ta: { moon8: 'சந்திரன் இந்த ராசியிலிருந்து 8-வது இடத்தில் உள்ளார் (அஷ்டம சந்திரன்), பாரம்பரியமாக எச்சரிக்கை தேவைப்படும் நாள்', moonGood: 'சந்திரன் இந்த ராசியிலிருந்து {n}-வது இடத்தில் உள்ளார், சாதகமான சந்திரபலம்', moonWeak: 'சந்திரன் இந்த ராசியிலிருந்து {n}-வது இடத்தில் உள்ளார், சாதாரணம் முதல் பலவீனமான சந்திரபலம்', areaLine: 'இந்த ராசியிலிருந்து {n}-வது இடத்தில் சந்திரன் இருப்பதால் இன்றைய கவனம்: {area}.' },
    kn: { moon8: 'ಚಂದ್ರನು ಈ ರಾಶಿಯಿಂದ 8ನೇ ಸ್ಥಾನದಲ್ಲಿದ್ದಾನೆ (ಅಷ್ಟಮ ಚಂದ್ರ), ಸಾಂಪ್ರದಾಯಿಕವಾಗಿ ಎಚ್ಚರಿಕೆ ಬೇಕಾದ ದಿನ', moonGood: 'ಚಂದ್ರನು ಈ ರಾಶಿಯಿಂದ {n}ನೇ ಸ್ಥಾನದಲ್ಲಿದ್ದಾನೆ, ಅನುಕೂಲಕರ ಚಂದ್ರಬಲ', moonWeak: 'ಚಂದ್ರನು ಈ ರಾಶಿಯಿಂದ {n}ನೇ ಸ್ಥಾನದಲ್ಲಿದ್ದಾನೆ, ಸಾಮಾನ್ಯದಿಂದ ದುರ್ಬಲ ಚಂದ್ರಬಲ', areaLine: 'ಈ ರಾಶಿಯಿಂದ {n}ನೇ ಸ್ಥಾನದಲ್ಲಿ ಚಂದ್ರನಿರುವುದರಿಂದ ಇಂದಿನ ಗಮನ: {area}.' },
    ml: { moon8: 'ചന്ദ്രൻ ഈ രാശിയിൽ നിന്ന് 8-ാം സ്ഥാനത്താണ് (അഷ്ടമ ചന്ദ്രൻ), പാരമ്പര്യമായി ജാഗ്രത വേണ്ട ദിവസം', moonGood: 'ചന്ദ്രൻ ഈ രാശിയിൽ നിന്ന് {n}-ാം സ്ഥാനത്താണ്, അനുകൂലമായ ചന്ദ്രബലം', moonWeak: 'ചന്ദ്രൻ ഈ രാശിയിൽ നിന്ന് {n}-ാം സ്ഥാനത്താണ്, സാധാരണം മുതൽ ദുർബലമായ ചന്ദ്രബലം', areaLine: 'ഈ രാശിയിൽ നിന്ന് {n}-ാം സ്ഥാനത്ത് ചന്ദ്രൻ ആയതിനാൽ ഇന്നത്തെ ശ്രദ്ധ: {area}.' },
    mr: { moon8: 'चंद्र या राशीपासून 8व्या स्थानी आहे (अष्टम चंद्र), परंपरेने सावधगिरीचा दिवस', moonGood: 'चंद्र या राशीपासून {n}व्या स्थानी आहे, अनुकूल चंद्रबल', moonWeak: 'चंद्र या राशीपासून {n}व्या स्थानी आहे, सामान्य ते कमकुवत चंद्रबल', areaLine: 'या राशीपासून {n}व्या स्थानी चंद्र असल्याने आजचे लक्ष: {area}.' },
    bn: { moon8: 'চন্দ্র এই রাশি থেকে ৮ম স্থানে (অষ্টম চন্দ্র), ঐতিহ্যগতভাবে সতর্কতার দিন', moonGood: 'চন্দ্র এই রাশি থেকে {n}ম স্থানে, অনুকূল চন্দ্রবল', moonWeak: 'চন্দ্র এই রাশি থেকে {n}ম স্থানে, সাধারণ থেকে দুর্বল চন্দ্রবল', areaLine: 'এই রাশি থেকে {n}ম স্থানে চন্দ্র থাকায় আজকের মনোযোগ: {area}।' },
    gu: { moon8: 'ચંદ્ર આ રાશિથી 8મા સ્થાને છે (અષ્ટમ ચંદ્ર), પરંપરાગત રીતે સાવચેતીનો દિવસ', moonGood: 'ચંદ્ર આ રાશિથી {n}મા સ્થાને છે, અનુકૂળ ચંદ્રબળ', moonWeak: 'ચંદ્ર આ રાશિથી {n}મા સ્થાને છે, સામાન્યથી નબળું ચંદ્રબળ', areaLine: 'આ રાશિથી {n}મા સ્થાને ચંદ્ર હોવાથી આજનું ધ્યાન: {area}.' }
  });
  // ---- Rashiphal: today's outlook for each of the 12 Moon signs from the Moon's transit house (Chandrabalam) ----
  function rashiOutlook(day, language) {
    const text = TODAY_TEXT[language] || TODAY_TEXT.en, rd = SIGN_MOON_TEXT[language] || SIGN_MOON_TEXT.en;
    const moon = day && day.moon_rashi && day.moon_rashi[0];
    if (!moon) return [];
    const nth = n => ({ n, o: ordinal(n) });
    return Array.from({ length: 12 }, (_unused, index) => {
      const rashi = index + 1, house = (moon.index - rashi + 12) % 12 + 1;
      const tone = house === 8 ? 'caution' : [1, 3, 6, 7, 10, 11].includes(house) ? 'good' : 'mixed';
      const kind = house === 8 ? rd.moon8 : tone === 'good' ? fillText(rd.moonGood, nth(house)) : fillText(rd.moonWeak, nth(house));
      return { rashi, house, tone, name: signName(rashi, language), area: fillText(rd.areaLine, { ...nth(house), area: text.areas[house - 1] }), kind: kind.charAt(0).toUpperCase() + kind.slice(1) };
    });
  }

  // ---- Gochara: classical favourable houses of each transiting planet, counted from a sign (Moon sign) ----
  const GOCHARA_GOOD = Object.freeze({
    Sun: [3, 6, 10, 11], Moon: [1, 3, 6, 7, 10, 11], Mars: [3, 6, 11], Mercury: [2, 4, 6, 8, 10, 11], Jupiter: [2, 5, 7, 9, 11],
    Venus: [1, 2, 3, 4, 5, 8, 9, 11, 12], Saturn: [3, 6, 11], Rahu: [3, 6, 10, 11], Ketu: [3, 6, 11]
  });
  const GOCHARA_ORDER = ['Sun', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  // [favourable theme, unfavourable theme] per planet; wording unreviewed, languages not listed fall back to English.
  const GOCHARA_TEXT = Object.freeze({
    en: {
      line: '{body} — {h} {mark} {phrase}', head: 'Planet transits from this sign', count: '{n} of 9 transits favourable',
      verdict: ['A supportive day and period overall: good for taking steps that matter.', 'A mixed picture overall: balance bold moves with patience.', 'A demanding picture overall: go slowly and avoid risks.'],
      Sun: ['confidence, recognition and good health', 'ego clashes and tiredness'], Mars: ['energy and courage', 'anger, haste and conflicts'],
      Mercury: ['clear thinking and good deals', 'miscommunication and confusion'], Jupiter: ['luck, guidance and growth', 'missed chances and overconfidence'],
      Venus: ['comfort, harmony and pleasures', 'overspending and friction in relationships'], Saturn: ['steady progress through hard work', 'delays, pressure and fatigue'],
      Rahu: ['unexpected gains', 'confusion and risky choices'], Ketu: ['detachment and clarity', 'restlessness and small losses']
    },
    te: {
      line: '{body} — {h} {mark} {phrase}', head: 'ఈ రాశి నుండి గ్రహ సంచారం', count: '9 లో {n} సంచారాలు అనుకూలం',
      verdict: ['మొత్తం మీద అనుకూల కాలం: ముఖ్యమైన అడుగులు వేయడానికి మంచిది.', 'మొత్తం మీద మిశ్రమ కాలం: ధైర్యం, ఓపిక రెండూ కలపండి.', 'మొత్తం మీద కఠినమైన కాలం: నెమ్మదిగా వెళ్లండి, రిస్క్‌లు మానండి.'],
      Sun: ['ఆత్మవిశ్వాసం, గుర్తింపు, మంచి ఆరోగ్యం', 'అహంకార ఘర్షణలు, అలసట'], Mars: ['శక్తి, ధైర్యం', 'కోపం, తొందరపాటు, గొడవలు'],
      Mercury: ['స్పష్టమైన ఆలోచన, మంచి ఒప్పందాలు', 'అపార్థాలు, గందరగోళం'], Jupiter: ['అదృష్టం, మార్గదర్శనం, అభివృద్ధి', 'అవకాశాలు చేజారడం, అతివిశ్వాసం'],
      Venus: ['సౌకర్యం, సామరస్యం, సుఖాలు', 'అధిక ఖర్చు, బంధాలలో ఘర్షణ'], Saturn: ['కష్టపడితే స్థిరమైన పురోగతి', 'ఆలస్యం, ఒత్తిడి, అలసట'],
      Rahu: ['ఊహించని లాభాలు', 'గందరగోళం, ప్రమాదకర నిర్ణయాలు'], Ketu: ['నిర్లిప్తత, స్పష్టత', 'అశాంతి, చిన్న నష్టాలు']
    },
    hi: {
      line: '{body} — {h} {mark} {phrase}', head: 'इस राशि से ग्रह गोचर', count: '9 में से {n} गोचर अनुकूल',
      verdict: ['कुल मिलाकर अनुकूल समय: जरूरी कदम उठाने के लिए अच्छा।', 'कुल मिलाकर मिला-जुला समय: साहस और धैर्य दोनों रखें।', 'कुल मिलाकर कठिन समय: धीरे चलें और जोखिम से बचें।'],
      Sun: ['आत्मविश्वास, मान-सम्मान, अच्छा स्वास्थ्य', 'अहं का टकराव, थकान'], Mars: ['ऊर्जा और साहस', 'गुस्सा, जल्दबाजी और झगड़े'],
      Mercury: ['साफ सोच और अच्छे सौदे', 'गलतफहमी और उलझन'], Jupiter: ['भाग्य, मार्गदर्शन और उन्नति', 'मौके चूकना, अति आत्मविश्वास'],
      Venus: ['सुख, सामंजस्य और आनंद', 'फिजूलखर्ची और रिश्तों में खटपट'], Saturn: ['मेहनत से स्थिर प्रगति', 'देरी, दबाव और थकान'],
      Rahu: ['अप्रत्याशित लाभ', 'उलझन और जोखिम भरे फैसले'], Ketu: ['वैराग्य और स्पष्टता', 'बेचैनी और छोटे नुकसान']
    },
    ta: {
      line: '{body} — {h} {mark} {phrase}', head: 'இந்த ராசியிலிருந்து கிரக சஞ்சாரம்', count: '9 இல் {n} சஞ்சாரங்கள் சாதகம்',
      verdict: ['மொத்தத்தில் சாதகமான காலம்: முக்கிய முடிவுகளை எடுக்க நல்லது.', 'மொத்தத்தில் கலவையான காலம்: துணிவும் பொறுமையும் சேர்த்துக் கொள்ளுங்கள்.', 'மொத்தத்தில் சவாலான காலம்: மெதுவாகச் செல்லுங்கள், ஆபத்தைத் தவிர்க்கவும்.'],
      Sun: ['தன்னம்பிக்கை, அங்கீகாரம், நல்ல ஆரோக்கியம்', 'அகங்கார மோதல்கள், சோர்வு'], Mars: ['சக்தி, தைரியம்', 'கோபம், அவசரம், சண்டைகள்'],
      Mercury: ['தெளிவான சிந்தனை, நல்ல ஒப்பந்தங்கள்', 'தவறான புரிதல், குழப்பம்'], Jupiter: ['அதிர்ஷ்டம், வழிகாட்டல், வளர்ச்சி', 'வாய்ப்புகளை இழத்தல், அதிக நம்பிக்கை'],
      Venus: ['வசதி, இணக்கம், இன்பம்', 'அதிகச் செலவு, உறவுகளில் உரசல்'], Saturn: ['உழைப்பால் நிலையான முன்னேற்றம்', 'தாமதம், அழுத்தம், சோர்வு'],
      Rahu: ['எதிர்பாராத லாபம்', 'குழப்பம், ஆபத்தான முடிவுகள்'], Ketu: ['பற்றின்மை, தெளிவு', 'அமைதியின்மை, சிறு இழப்புகள்']
    },
    kn: {
      line: '{body} — {h} {mark} {phrase}', head: 'ಈ ರಾಶಿಯಿಂದ ಗ್ರಹ ಸಂಚಾರ', count: '9 ರಲ್ಲಿ {n} ಸಂಚಾರಗಳು ಅನುಕೂಲ',
      verdict: ['ಒಟ್ಟಾರೆ ಅನುಕೂಲಕರ ಕಾಲ: ಮುಖ್ಯ ಹೆಜ್ಜೆ ಇಡಲು ಒಳ್ಳೆಯದು.', 'ಒಟ್ಟಾರೆ ಮಿಶ್ರ ಕಾಲ: ಧೈರ್ಯ ಮತ್ತು ತಾಳ್ಮೆ ಎರಡನ್ನೂ ಬೆರೆಸಿ.', 'ಒಟ್ಟಾರೆ ಕಠಿಣ ಕಾಲ: ನಿಧಾನವಾಗಿ ಸಾಗಿ, ಅಪಾಯ ತಪ್ಪಿಸಿ.'],
      Sun: ['ಆತ್ಮವಿಶ್ವಾಸ, ಮನ್ನಣೆ, ಉತ್ತಮ ಆರೋಗ್ಯ', 'ಅಹಂ ಘರ್ಷಣೆ, ಆಯಾಸ'], Mars: ['ಶಕ್ತಿ, ಧೈರ್ಯ', 'ಕೋಪ, ಆತುರ, ಜಗಳ'],
      Mercury: ['ಸ್ಪಷ್ಟ ಚಿಂತನೆ, ಒಳ್ಳೆಯ ವ್ಯವಹಾರ', 'ತಪ್ಪು ಅರ್ಥ, ಗೊಂದಲ'], Jupiter: ['ಅದೃಷ್ಟ, ಮಾರ್ಗದರ್ಶನ, ಬೆಳವಣಿಗೆ', 'ಅವಕಾಶ ಕಳೆದುಕೊಳ್ಳುವುದು, ಅತಿ ಆತ್ಮವಿಶ್ವಾಸ'],
      Venus: ['ಸೌಕರ್ಯ, ಸಾಮರಸ್ಯ, ಸುಖ', 'ಅತಿ ಖರ್ಚು, ಸಂಬಂಧಗಳಲ್ಲಿ ಘರ್ಷಣೆ'], Saturn: ['ಶ್ರಮದಿಂದ ಸ್ಥಿರ ಪ್ರಗತಿ', 'ವಿಳಂಬ, ಒತ್ತಡ, ಆಯಾಸ'],
      Rahu: ['ಅನಿರೀಕ್ಷಿತ ಲಾಭ', 'ಗೊಂದಲ, ಅಪಾಯದ ನಿರ್ಧಾರ'], Ketu: ['ವೈರಾಗ್ಯ, ಸ್ಪಷ್ಟತೆ', 'ಚಡಪಡಿಕೆ, ಸಣ್ಣ ನಷ್ಟ']
    },
    ml: {
      line: '{body} — {h} {mark} {phrase}', head: 'ഈ രാശിയിൽ നിന്നുള്ള ഗ്രഹസഞ്ചാരം', count: '9 ൽ {n} സഞ്ചാരങ്ങൾ അനുകൂലം',
      verdict: ['മൊത്തത്തിൽ അനുകൂല സമയം: പ്രധാന ചുവടുകൾ വയ്ക്കാൻ നല്ലത്.', 'മൊത്തത്തിൽ സമ്മിശ്ര സമയം: ധൈര്യവും ക്ഷമയും ചേർക്കുക.', 'മൊത്തത്തിൽ വെല്ലുവിളി നിറഞ്ഞ സമയം: പതുക്കെ പോകുക, അപകടം ഒഴിവാക്കുക.'],
      Sun: ['ആത്മവിശ്വാസം, അംഗീകാരം, നല്ല ആരോഗ്യം', 'അഹങ്കാര സംഘർഷം, ക്ഷീണം'], Mars: ['ഊർജ്ജം, ധൈര്യം', 'ദേഷ്യം, തിടുക്കം, തർക്കങ്ങൾ'],
      Mercury: ['വ്യക്തമായ ചിന്ത, നല്ല ഇടപാടുകൾ', 'തെറ്റിദ്ധാരണ, ആശയക്കുഴപ്പം'], Jupiter: ['ഭാഗ്യം, മാർഗ്ഗനിർദ്ദേശം, വളർച്ച', 'അവസരം നഷ്ടപ്പെടൽ, അമിത ആത്മവിശ്വാസം'],
      Venus: ['സുഖം, ഐക്യം, സന്തോഷം', 'അമിത ചെലവ്, ബന്ധങ്ങളിൽ ഉരസൽ'], Saturn: ['അധ്വാനത്തിലൂടെ സ്ഥിരമായ പുരോഗതി', 'താമസം, സമ്മർദ്ദം, ക്ഷീണം'],
      Rahu: ['അപ്രതീക്ഷിത നേട്ടം', 'ആശയക്കുഴപ്പം, അപകട തീരുമാനങ്ങൾ'], Ketu: ['വിരക്തി, വ്യക്തത', 'അസ്വസ്ഥത, ചെറിയ നഷ്ടങ്ങൾ']
    },
    mr: {
      line: '{body} — {h} {mark} {phrase}', head: 'या राशीपासून ग्रह गोचर', count: '9 पैकी {n} गोचर अनुकूल',
      verdict: ['एकंदरीत अनुकूल काळ: महत्त्वाची पावले उचलण्यासाठी चांगला.', 'एकंदरीत संमिश्र काळ: धैर्य आणि संयम दोन्ही ठेवा.', 'एकंदरीत कठीण काळ: हळू चला आणि जोखीम टाळा.'],
      Sun: ['आत्मविश्वास, मान, चांगले आरोग्य', 'अहंकाराचे वाद, थकवा'], Mars: ['ऊर्जा आणि धैर्य', 'राग, घाई आणि भांडणे'],
      Mercury: ['स्पष्ट विचार आणि चांगले व्यवहार', 'गैरसमज आणि गोंधळ'], Jupiter: ['भाग्य, मार्गदर्शन आणि प्रगती', 'संधी हुकणे, अति आत्मविश्वास'],
      Venus: ['सुख, सुसंवाद आणि आनंद', 'उधळपट्टी आणि नात्यांत ताण'], Saturn: ['कष्टाने स्थिर प्रगती', 'विलंब, दबाव आणि थकवा'],
      Rahu: ['अनपेक्षित लाभ', 'गोंधळ आणि जोखमीचे निर्णय'], Ketu: ['अलिप्तता आणि स्पष्टता', 'अस्वस्थता आणि लहान नुकसान']
    },
    bn: {
      line: '{body} — {h} {mark} {phrase}', head: 'এই রাশি থেকে গ্রহ গোচর', count: '৯টির মধ্যে {n}টি গোচর অনুকূল',
      verdict: ['মোটের উপর অনুকূল সময়: গুরুত্বপূর্ণ পদক্ষেপ নেওয়ার জন্য ভালো।', 'মোটের উপর মিশ্র সময়: সাহস ও ধৈর্য দুটোই রাখুন।', 'মোটের উপর কঠিন সময়: ধীরে চলুন, ঝুঁকি এড়ান।'],
      Sun: ['আত্মবিশ্বাস, স্বীকৃতি, ভালো স্বাস্থ্য', 'অহংকারের সংঘাত, ক্লান্তি'], Mars: ['শক্তি ও সাহস', 'রাগ, তাড়াহুড়ো ও ঝগড়া'],
      Mercury: ['স্পষ্ট চিন্তা ও ভালো লেনদেন', 'ভুল বোঝাবুঝি ও বিভ্রান্তি'], Jupiter: ['ভাগ্য, পথনির্দেশ ও উন্নতি', 'সুযোগ হারানো, অতি আত্মবিশ্বাস'],
      Venus: ['আরাম, সম্প্রীতি ও আনন্দ', 'অতিরিক্ত খরচ ও সম্পর্কে টানাপোড়েন'], Saturn: ['পরিশ্রমে স্থির অগ্রগতি', 'দেরি, চাপ ও ক্লান্তি'],
      Rahu: ['অপ্রত্যাশিত লাভ', 'বিভ্রান্তি ও ঝুঁকিপূর্ণ সিদ্ধান্ত'], Ketu: ['নির্লিপ্ততা ও স্পষ্টতা', 'অস্থিরতা ও ছোট ক্ষতি']
    },
    gu: {
      line: '{body} — {h} {mark} {phrase}', head: 'આ રાશિથી ગ્રહ ગોચર', count: '9 માંથી {n} ગોચર અનુકૂળ',
      verdict: ['કુલ મળીને અનુકૂળ સમય: મહત્વના પગલાં લેવા માટે સારો.', 'કુલ મળીને મિશ્ર સમય: હિંમત અને ધીરજ બંને રાખો.', 'કુલ મળીને કઠિન સમય: ધીમે ચાલો અને જોખમ ટાળો.'],
      Sun: ['આત્મવિશ્વાસ, માન, સારું સ્વાસ્થ્ય', 'અહંનો ટકરાવ, થાક'], Mars: ['ઊર્જા અને હિંમત', 'ગુસ્સો, ઉતાવળ અને ઝઘડા'],
      Mercury: ['સ્પષ્ટ વિચાર અને સારા સોદા', 'ગેરસમજ અને મૂંઝવણ'], Jupiter: ['ભાગ્ય, માર્ગદર્શન અને પ્રગતિ', 'તક ચૂકવી, અતિ આત્મવિશ્વાસ'],
      Venus: ['સુખ, સુમેળ અને આનંદ', 'વધુ ખર્ચ અને સંબંધોમાં તણાવ'], Saturn: ['મહેનતથી સ્થિર પ્રગતિ', 'વિલંબ, દબાણ અને થાક'],
      Rahu: ['અણધાર્યો લાભ', 'મૂંઝવણ અને જોખમી નિર્ણય'], Ketu: ['અલિપ્તતા અને સ્પષ્ટતા', 'બેચેની અને નાનું નુકસાન']
    }
  });
  const gocharaHead = language => (GOCHARA_TEXT[language] || GOCHARA_TEXT.en).head;
  // day: a /api/day-panchang day (needs planet_rashis and moon_rashi). Returns 12 cards for the signs, each with every planet's verdict.
  function gocharaOutlook(day, language) {
    const text = GOCHARA_TEXT[language] || GOCHARA_TEXT.en, rd = READING_TEXT[language] || READING_TEXT.en;
    const moon = day && day.moon_rashi && day.moon_rashi[0], planets = day && day.planet_rashis;
    if (!moon || !planets) return [];
    const where = { ...planets, Moon: moon.index };
    return Array.from({ length: 12 }, (_unused, index) => {
      const rashi = index + 1;
      const row = name => { const house = (where[name] - rashi + 12) % 12 + 1; return { name, house, good: GOCHARA_GOOD[name].includes(house) }; };
      const moonRow = row('Moon');
      const rows = GOCHARA_ORDER.map(row);
      const favourable = rows.filter(item => item.good).length + (moonRow.good ? 1 : 0);
      const tone = favourable >= 6 ? 'good' : favourable <= 2 ? 'caution' : 'mixed';
      return {
        areas: areaVerdicts(rows, moonRow, language),
        rashi, tone, favourable, count: fillText(text.count, { n: favourable }), verdict: text.verdict[tone === 'good' ? 0 : tone === 'caution' ? 2 : 1], name: signName(rashi, language),
        moonLine: `${bodyName('Moon', language)} — ${fillText(rd.h, { n: moonRow.house, o: ordinal(moonRow.house) })} ${moonRow.good ? '✔' : '✖'}`,
        rows: rows.map(item => ({ ...item, text: fillText(text.line, { body: bodyName(item.name, language), h: fillText(rd.h, { n: item.house, o: ordinal(item.house) }), mark: item.good ? '✔' : '✖', phrase: text[item.name][item.good ? 0 : 1] }) }))
      };
    });
  }

  // ---- Detailed sign forecast: life areas from the transiting planets, plus a 7-day view ----
  const AREAS = Object.freeze({
    career: { planets: ['Sun', 'Saturn', 'Mars'], moonHouses: [10, 6] },
    money: { planets: ['Jupiter', 'Mercury', 'Venus'], moonHouses: [2, 11] },
    love: { planets: ['Venus', 'Jupiter', 'Mars'], moonHouses: [7, 5] },
    health: { planets: ['Sun', 'Mars', 'Saturn'], moonHouses: [1, 6] },
    family: { planets: ['Jupiter', 'Venus', 'Saturn'], moonHouses: [4, 2] }
  });
  const AREA_TEXT = Object.freeze({
    en: {
      names: { career: 'Career and work', money: 'Money', love: 'Love and relationships', health: 'Health', family: 'Family and peace of mind' },
      text: {
        career: ['Work goes smoothly; effort is noticed and seniors are supportive.', 'Steady routine work; avoid big career moves for now.', 'Pressure and delays at work; stay patient and avoid arguments with seniors.'],
        money: ['Income and savings look supported; a good time for sensible money decisions.', 'Money is steady; keep spending in check.', 'Watch your spending and avoid risky investments or lending.'],
        love: ['Warmth and understanding in relationships; good for time with a partner.', 'Relationships are fine if you listen more than you argue.', 'Misunderstandings are possible; speak gently and do not react in anger.'],
        health: ['Energy is good; a fine time to restart exercise or routines.', 'Energy is average; keep regular sleep and meals.', 'Tiredness or stress may show; rest well and avoid overexertion.'],
        family: ['Peace at home and support from family and friends.', 'Home life is calm if responsibilities are shared.', 'Small tensions at home; give people space and avoid sharp words.']
      },
      weekHead: 'This week at a glance', weekBest: 'Better days: {days}', weekCare: 'Take extra care on: {days}', none: '—', slowHead: 'Slow-moving planets (the background of the period)',
      weekVerdict: ['A mostly supportive week: use it to move ahead with your plans.', 'A balanced week with ups and downs: stay flexible.', 'A demanding week: slow down, save your energy and avoid big risks.']
    },
    te: {
      names: { career: 'ఉద్యోగం, వృత్తి', money: 'డబ్బు', love: 'ప్రేమ, బంధాలు', health: 'ఆరోగ్యం', family: 'కుటుంబం, మనశ్శాంతి' },
      text: {
        career: ['పని సాఫీగా సాగుతుంది; మీ కృషికి గుర్తింపు, పై అధికారుల సహకారం ఉంటాయి.', 'రోజువారీ పని స్థిరంగా సాగుతుంది; ఇప్పుడు పెద్ద వృత్తి మార్పులు వద్దు.', 'పనిలో ఒత్తిడి, ఆలస్యం ఉండవచ్చు; ఓపికగా ఉండండి, పై అధికారులతో వాదనలు మానండి.'],
        money: ['ఆదాయం, పొదుపుకు అనుకూలం; తెలివైన ఆర్థిక నిర్ణయాలకు మంచి సమయం.', 'ఆర్థిక స్థితి స్థిరంగా ఉంటుంది; ఖర్చులను అదుపులో ఉంచండి.', 'ఖర్చులపై జాగ్రత్త; ప్రమాదకర పెట్టుబడులు, అప్పులు ఇవ్వడం మానండి.'],
        love: ['బంధాలలో ఆప్యాయత, అవగాహన; భాగస్వామితో సమయం గడపడానికి మంచిది.', 'వాదించడం కన్నా వినడం ఎక్కువ చేస్తే బంధాలు బాగుంటాయి.', 'అపార్థాలకు అవకాశం; మృదువుగా మాట్లాడండి, కోపంతో స్పందించకండి.'],
        health: ['శక్తి బాగుంటుంది; వ్యాయామం, దినచర్యను తిరిగి మొదలుపెట్టడానికి మంచి సమయం.', 'శక్తి సాధారణంగా ఉంటుంది; నిద్ర, భోజనం క్రమం తప్పకండి.', 'అలసట లేదా ఒత్తిడి కనిపించవచ్చు; బాగా విశ్రాంతి తీసుకోండి, అతిగా శ్రమించకండి.'],
        family: ['ఇంట్లో శాంతి, కుటుంబం, స్నేహితుల సహకారం.', 'బాధ్యతలు పంచుకుంటే ఇంట్లో ప్రశాంతంగా ఉంటుంది.', 'ఇంట్లో చిన్న ఉద్రిక్తతలు; ఇతరులకు స్థలం ఇవ్వండి, కఠినంగా మాట్లాడకండి.']
      },
      weekHead: 'ఈ వారం ఒక్క చూపులో', weekBest: 'మంచి రోజులు: {days}', weekCare: 'అదనపు జాగ్రత్త అవసరమైన రోజులు: {days}', none: '—', slowHead: 'నెమ్మదిగా కదిలే గ్రహాలు (ఈ కాలపు నేపథ్యం)',
      weekVerdict: ['ఎక్కువగా అనుకూలమైన వారం: మీ ప్రణాళికలను ముందుకు తీసుకెళ్లండి.', 'ఎత్తుపల్లాలతో సమతుల్యమైన వారం: అనువుగా ఉండండి.', 'కఠినమైన వారం: నెమ్మదిగా వెళ్లండి, శక్తిని ఆదా చేయండి, పెద్ద రిస్క్‌లు మానండి.']
    },
    hi: {
      names: { career: 'करियर और काम', money: 'धन', love: 'प्रेम और रिश्ते', health: 'स्वास्थ्य', family: 'परिवार और मन की शांति' },
      text: {
        career: ['काम सहजता से चलता है; मेहनत पर ध्यान जाता है और वरिष्ठ सहयोगी रहते हैं।', 'नियमित काम स्थिर रहता है; अभी करियर में बड़े बदलाव से बचें।', 'काम में दबाव और देरी हो सकती है; धैर्य रखें और वरिष्ठों से बहस न करें।'],
        money: ['आय और बचत को सहारा मिलता है; समझदारी से पैसे के फैसले लेने का अच्छा समय।', 'पैसा स्थिर रहता है; खर्च पर नियंत्रण रखें।', 'खर्च पर नज़र रखें; जोखिम भरे निवेश या उधार देने से बचें।'],
        love: ['रिश्तों में अपनापन और समझ; साथी के साथ समय बिताने के लिए अच्छा।', 'बहस से ज्यादा सुनेंगे तो रिश्ते ठीक रहेंगे।', 'गलतफहमी हो सकती है; नरमी से बोलें और गुस्से में प्रतिक्रिया न दें।'],
        health: ['ऊर्जा अच्छी है; व्यायाम या दिनचर्या दोबारा शुरू करने का अच्छा समय।', 'ऊर्जा सामान्य है; नींद और भोजन नियमित रखें।', 'थकान या तनाव दिख सकता है; अच्छी तरह आराम करें और ज्यादा मेहनत न करें।'],
        family: ['घर में शांति और परिवार व मित्रों का सहयोग।', 'जिम्मेदारियाँ बाँटने पर घर का माहौल शांत रहेगा।', 'घर में छोटे तनाव हो सकते हैं; दूसरों को जगह दें और कड़वे शब्दों से बचें।']
      },
      weekHead: 'इस सप्ताह एक नज़र में', weekBest: 'बेहतर दिन: {days}', weekCare: 'अतिरिक्त सावधानी वाले दिन: {days}', none: '—', slowHead: 'धीमे चलने वाले ग्रह (इस अवधि की पृष्ठभूमि)',
      weekVerdict: ['ज्यादातर अनुकूल सप्ताह: अपनी योजनाओं को आगे बढ़ाएँ।', 'उतार-चढ़ाव वाला संतुलित सप्ताह: लचीले रहें।', 'कठिन सप्ताह: धीरे चलें, ऊर्जा बचाएँ और बड़े जोखिम से बचें।']
    },
    ta: {
      names: { career: 'தொழில், வேலை', money: 'பணம்', love: 'காதல், உறவுகள்', health: 'ஆரோக்கியம்', family: 'குடும்பம், மன அமைதி' },
      text: {
        career: ['வேலை சீராகச் செல்லும்; உங்கள் முயற்சி கவனிக்கப்படும், மேலதிகாரிகள் ஆதரவு தருவர்.', 'வழக்கமான வேலை நிலையாக இருக்கும்; இப்போது பெரிய தொழில் மாற்றங்களைத் தவிர்க்கவும்.', 'வேலையில் அழுத்தம், தாமதம் இருக்கலாம்; பொறுமையாக இருங்கள், மேலதிகாரிகளுடன் வாதம் வேண்டாம்.'],
        money: ['வருமானம், சேமிப்புக்கு ஆதரவு; புத்திசாலித்தனமான பண முடிவுகளுக்கு நல்ல நேரம்.', 'பண நிலை நிலையாக இருக்கும்; செலவைக் கட்டுப்படுத்துங்கள்.', 'செலவில் கவனம்; ஆபத்தான முதலீடு, கடன் கொடுப்பதைத் தவிர்க்கவும்.'],
        love: ['உறவுகளில் அன்பும் புரிதலும்; துணையுடன் நேரம் செலவிட நல்லது.', 'வாதிடுவதை விட கேட்பது அதிகமானால் உறவுகள் நன்றாக இருக்கும்.', 'தவறான புரிதல் வரலாம்; மென்மையாகப் பேசுங்கள், கோபத்தில் பதிலளிக்காதீர்கள்.'],
        health: ['சக்தி நன்றாக இருக்கும்; உடற்பயிற்சி, வழக்கங்களை மீண்டும் தொடங்க நல்ல நேரம்.', 'சக்தி சராசரியாக இருக்கும்; தூக்கம், உணவை ஒழுங்காக வைத்திருங்கள்.', 'சோர்வு அல்லது மன அழுத்தம் தெரியலாம்; நன்றாக ஓய்வெடுங்கள், அதிகமாக உழைக்க வேண்டாம்.'],
        family: ['வீட்டில் அமைதி, குடும்பம், நண்பர்களின் ஆதரவு.', 'பொறுப்புகளைப் பகிர்ந்தால் வீடு அமைதியாக இருக்கும்.', 'வீட்டில் சிறு பதற்றம்; மற்றவர்களுக்கு இடம் கொடுங்கள், கடுமையாகப் பேச வேண்டாம்.']
      },
      weekHead: 'இந்த வாரம் ஒரு பார்வையில்', weekBest: 'நல்ல நாட்கள்: {days}', weekCare: 'கூடுதல் கவனம் தேவைப்படும் நாட்கள்: {days}', none: '—', slowHead: 'மெதுவாக நகரும் கிரகங்கள் (இந்தக் காலத்தின் பின்னணி)',
      weekVerdict: ['பெரும்பாலும் சாதகமான வாரம்: உங்கள் திட்டங்களை முன்னெடுங்கள்.', 'ஏற்ற இறக்கங்களுடன் சமநிலையான வாரம்: நெகிழ்வாக இருங்கள்.', 'சவாலான வாரம்: மெதுவாகச் செல்லுங்கள், சக்தியைச் சேமியுங்கள், பெரிய ஆபத்தைத் தவிருங்கள்.']
    },
    kn: {
      names: { career: 'ಉದ್ಯೋಗ, ವೃತ್ತಿ', money: 'ಹಣ', love: 'ಪ್ರೀತಿ, ಸಂಬಂಧಗಳು', health: 'ಆರೋಗ್ಯ', family: 'ಕುಟುಂಬ, ಮನಃಶಾಂತಿ' },
      text: {
        career: ['ಕೆಲಸ ಸುಗಮವಾಗಿ ಸಾಗುತ್ತದೆ; ನಿಮ್ಮ ಶ್ರಮಕ್ಕೆ ಮನ್ನಣೆ, ಮೇಲಧಿಕಾರಿಗಳ ಬೆಂಬಲ ಸಿಗುತ್ತದೆ.', 'ದಿನನಿತ್ಯದ ಕೆಲಸ ಸ್ಥಿರವಾಗಿರುತ್ತದೆ; ಈಗ ದೊಡ್ಡ ವೃತ್ತಿ ಬದಲಾವಣೆ ಬೇಡ.', 'ಕೆಲಸದಲ್ಲಿ ಒತ್ತಡ, ವಿಳಂಬ ಇರಬಹುದು; ತಾಳ್ಮೆಯಿಂದಿರಿ, ಮೇಲಧಿಕಾರಿಗಳೊಂದಿಗೆ ವಾದ ಬೇಡ.'],
        money: ['ಆದಾಯ, ಉಳಿತಾಯಕ್ಕೆ ಬೆಂಬಲ; ಬುದ್ಧಿವಂತ ಹಣಕಾಸಿನ ನಿರ್ಧಾರಕ್ಕೆ ಒಳ್ಳೆಯ ಸಮಯ.', 'ಹಣಕಾಸು ಸ್ಥಿರವಾಗಿರುತ್ತದೆ; ಖರ್ಚನ್ನು ನಿಯಂತ್ರಣದಲ್ಲಿಡಿ.', 'ಖರ್ಚಿನ ಬಗ್ಗೆ ಜಾಗ್ರತೆ; ಅಪಾಯದ ಹೂಡಿಕೆ, ಸಾಲ ಕೊಡುವುದು ಬೇಡ.'],
        love: ['ಸಂಬಂಧಗಳಲ್ಲಿ ಪ್ರೀತಿ, ಅರ್ಥಮಾಡಿಕೊಳ್ಳುವಿಕೆ; ಸಂಗಾತಿಯೊಂದಿಗೆ ಸಮಯ ಕಳೆಯಲು ಒಳ್ಳೆಯದು.', 'ವಾದಕ್ಕಿಂತ ಕೇಳುವುದು ಹೆಚ್ಚಾದರೆ ಸಂಬಂಧಗಳು ಚೆನ್ನಾಗಿರುತ್ತವೆ.', 'ತಪ್ಪು ತಿಳುವಳಿಕೆ ಸಾಧ್ಯ; ಮೃದುವಾಗಿ ಮಾತನಾಡಿ, ಕೋಪದಲ್ಲಿ ಪ್ರತಿಕ್ರಿಯಿಸಬೇಡಿ.'],
        health: ['ಶಕ್ತಿ ಚೆನ್ನಾಗಿರುತ್ತದೆ; ವ್ಯಾಯಾಮ, ದಿನಚರಿ ಮತ್ತೆ ಆರಂಭಿಸಲು ಒಳ್ಳೆಯ ಸಮಯ.', 'ಶಕ್ತಿ ಸಾಮಾನ್ಯ; ನಿದ್ರೆ, ಊಟ ಕ್ರಮವಾಗಿರಲಿ.', 'ಆಯಾಸ ಅಥವಾ ಒತ್ತಡ ಕಾಣಿಸಬಹುದು; ಚೆನ್ನಾಗಿ ವಿಶ್ರಾಂತಿ ಪಡೆಯಿರಿ, ಅತಿಯಾಗಿ ದುಡಿಯಬೇಡಿ.'],
        family: ['ಮನೆಯಲ್ಲಿ ಶಾಂತಿ, ಕುಟುಂಬ, ಸ್ನೇಹಿತರ ಬೆಂಬಲ.', 'ಜವಾಬ್ದಾರಿ ಹಂಚಿಕೊಂಡರೆ ಮನೆ ಶಾಂತವಾಗಿರುತ್ತದೆ.', 'ಮನೆಯಲ್ಲಿ ಸಣ್ಣ ಒತ್ತಡ; ಇತರರಿಗೆ ಜಾಗ ಕೊಡಿ, ಕಠೋರ ಮಾತು ಬೇಡ.']
      },
      weekHead: 'ಈ ವಾರ ಒಂದು ನೋಟದಲ್ಲಿ', weekBest: 'ಉತ್ತಮ ದಿನಗಳು: {days}', weekCare: 'ಹೆಚ್ಚುವರಿ ಎಚ್ಚರಿಕೆ ಬೇಕಾದ ದಿನಗಳು: {days}', none: '—', slowHead: 'ನಿಧಾನವಾಗಿ ಚಲಿಸುವ ಗ್ರಹಗಳು (ಈ ಅವಧಿಯ ಹಿನ್ನೆಲೆ)',
      weekVerdict: ['ಹೆಚ್ಚಾಗಿ ಅನುಕೂಲಕರ ವಾರ: ನಿಮ್ಮ ಯೋಜನೆಗಳನ್ನು ಮುಂದುವರಿಸಿ.', 'ಏರಿಳಿತಗಳೊಂದಿಗೆ ಸಮತೋಲಿತ ವಾರ: ಹೊಂದಿಕೊಳ್ಳುವಂತಿರಿ.', 'ಕಠಿಣ ವಾರ: ನಿಧಾನವಾಗಿ ಸಾಗಿ, ಶಕ್ತಿ ಉಳಿಸಿ, ದೊಡ್ಡ ಅಪಾಯ ತಪ್ಪಿಸಿ.']
    },
    ml: {
      names: { career: 'ജോലി, തൊഴിൽ', money: 'പണം', love: 'പ്രണയം, ബന്ധങ്ങൾ', health: 'ആരോഗ്യം', family: 'കുടുംബം, മനസ്സമാധാനം' },
      text: {
        career: ['ജോലി സുഗമമായി നടക്കും; നിങ്ങളുടെ പരിശ്രമം ശ്രദ്ധിക്കപ്പെടും, മേലധികാരികൾ പിന്തുണയ്ക്കും.', 'പതിവ് ജോലി സ്ഥിരമായിരിക്കും; ഇപ്പോൾ വലിയ തൊഴിൽ മാറ്റങ്ങൾ ഒഴിവാക്കുക.', 'ജോലിയിൽ സമ്മർദ്ദവും താമസവും ഉണ്ടാകാം; ക്ഷമയോടെയിരിക്കുക, മേലധികാരികളോട് തർക്കിക്കരുത്.'],
        money: ['വരുമാനത്തിനും സമ്പാദ്യത്തിനും പിന്തുണ; വിവേകമുള്ള പണ തീരുമാനങ്ങൾക്ക് നല്ല സമയം.', 'പണസ്ഥിതി സ്ഥിരമായിരിക്കും; ചെലവ് നിയന്ത്രിക്കുക.', 'ചെലവിൽ ശ്രദ്ധിക്കുക; അപകടസാധ്യതയുള്ള നിക്ഷേപവും വായ്പ കൊടുക്കലും ഒഴിവാക്കുക.'],
        love: ['ബന്ധങ്ങളിൽ സ്നേഹവും ധാരണയും; പങ്കാളിയോടൊപ്പം സമയം ചെലവഴിക്കാൻ നല്ലത്.', 'തർക്കിക്കുന്നതിലും കൂടുതൽ കേൾക്കുകയാണെങ്കിൽ ബന്ധങ്ങൾ നന്നായിരിക്കും.', 'തെറ്റിദ്ധാരണ ഉണ്ടാകാം; സൗമ്യമായി സംസാരിക്കുക, ദേഷ്യത്തിൽ പ്രതികരിക്കരുത്.'],
        health: ['ഊർജ്ജം നല്ലതായിരിക്കും; വ്യായാമവും ദിനചര്യയും വീണ്ടും തുടങ്ങാൻ നല്ല സമയം.', 'ഊർജ്ജം സാധാരണ; ഉറക്കവും ഭക്ഷണവും ക്രമമായി വയ്ക്കുക.', 'ക്ഷീണമോ സമ്മർദ്ദമോ കാണാം; നന്നായി വിശ്രമിക്കുക, അമിതമായി അധ്വാനിക്കരുത്.'],
        family: ['വീട്ടിൽ സമാധാനം, കുടുംബത്തിന്റെയും സുഹൃത്തുക്കളുടെയും പിന്തുണ.', 'ഉത്തരവാദിത്തങ്ങൾ പങ്കിട്ടാൽ വീട് ശാന്തമായിരിക്കും.', 'വീട്ടിൽ ചെറിയ സംഘർഷങ്ങൾ; മറ്റുള്ളവർക്ക് ഇടം നൽകുക, പരുഷമായി സംസാരിക്കരുത്.']
      },
      weekHead: 'ഈ ആഴ്ച ഒറ്റനോട്ടത്തിൽ', weekBest: 'മികച്ച ദിവസങ്ങൾ: {days}', weekCare: 'കൂടുതൽ ശ്രദ്ധ വേണ്ട ദിവസങ്ങൾ: {days}', none: '—', slowHead: 'സാവധാനം നീങ്ങുന്ന ഗ്രഹങ്ങൾ (ഈ കാലയളവിന്റെ പശ്ചാത്തലം)',
      weekVerdict: ['മിക്കവാറും അനുകൂലമായ ആഴ്ച: നിങ്ങളുടെ പദ്ധതികൾ മുന്നോട്ട് കൊണ്ടുപോകുക.', 'ഏറ്റക്കുറച്ചിലുകളുള്ള സമതുലിത ആഴ്ച: അയവോടെ ഇരിക്കുക.', 'വെല്ലുവിളി നിറഞ്ഞ ആഴ്ച: പതുക്കെ പോകുക, ഊർജ്ജം സംരക്ഷിക്കുക, വലിയ അപകടം ഒഴിവാക്കുക.']
    },
    mr: {
      names: { career: 'करिअर आणि काम', money: 'धन', love: 'प्रेम आणि नातेसंबंध', health: 'आरोग्य', family: 'कुटुंब आणि मनःशांती' },
      text: {
        career: ['काम सुरळीत चालते; मेहनतीची दखल घेतली जाते आणि वरिष्ठ मदत करतात.', 'नेहमीचे काम स्थिर राहते; सध्या करिअरमध्ये मोठे बदल टाळा.', 'कामात दबाव आणि विलंब होऊ शकतो; संयम ठेवा आणि वरिष्ठांशी वाद टाळा.'],
        money: ['उत्पन्न आणि बचतीला साथ मिळते; समजूतदार आर्थिक निर्णयांसाठी चांगला काळ.', 'आर्थिक स्थिती स्थिर राहते; खर्च आटोक्यात ठेवा.', 'खर्चावर लक्ष ठेवा; जोखमीची गुंतवणूक किंवा उधार देणे टाळा.'],
        love: ['नात्यांत जिव्हाळा आणि समजूत; जोडीदारासोबत वेळ घालवण्यासाठी चांगले.', 'वाद घालण्यापेक्षा ऐकण्यावर भर दिल्यास नाती चांगली राहतात.', 'गैरसमज होऊ शकतात; हळुवार बोला आणि रागात प्रतिक्रिया देऊ नका.'],
        health: ['ऊर्जा चांगली असते; व्यायाम किंवा दिनचर्या पुन्हा सुरू करण्यासाठी चांगला काळ.', 'ऊर्जा सामान्य असते; झोप आणि जेवण नियमित ठेवा.', 'थकवा किंवा ताण जाणवू शकतो; नीट विश्रांती घ्या आणि अति श्रम टाळा.'],
        family: ['घरात शांतता आणि कुटुंब व मित्रांची साथ.', 'जबाबदाऱ्या वाटून घेतल्यास घरचे वातावरण शांत राहते.', 'घरात लहान ताणतणाव होऊ शकतात; इतरांना जागा द्या आणि कठोर शब्द टाळा.']
      },
      weekHead: 'या आठवड्याचा आढावा', weekBest: 'चांगले दिवस: {days}', weekCare: 'अधिक काळजी घ्यावी असे दिवस: {days}', none: '—', slowHead: 'हळू चालणारे ग्रह (या कालावधीची पार्श्वभूमी)',
      weekVerdict: ['बहुतांश अनुकूल आठवडा: तुमच्या योजना पुढे न्या.', 'चढ-उतारांसह संतुलित आठवडा: लवचिक राहा.', 'कठीण आठवडा: हळू चला, ऊर्जा वाचवा आणि मोठी जोखीम टाळा.']
    },
    bn: {
      names: { career: 'কর্মজীবন', money: 'অর্থ', love: 'প্রেম ও সম্পর্ক', health: 'স্বাস্থ্য', family: 'পরিবার ও মনের শান্তি' },
      text: {
        career: ['কাজ সুষ্ঠুভাবে চলে; আপনার চেষ্টা নজরে আসে ও উপরওয়ালারা সহায়ক থাকেন।', 'নিয়মিত কাজ স্থির থাকে; এখন কর্মজীবনে বড় পরিবর্তন এড়ান।', 'কাজে চাপ ও দেরি হতে পারে; ধৈর্য রাখুন এবং উপরওয়ালাদের সঙ্গে তর্ক এড়ান।'],
        money: ['আয় ও সঞ্চয়ে সহায়তা আছে; বুদ্ধিমানের মতো অর্থসংক্রান্ত সিদ্ধান্তের ভালো সময়।', 'অর্থের অবস্থা স্থির; খরচ নিয়ন্ত্রণে রাখুন।', 'খরচে সতর্ক থাকুন; ঝুঁকিপূর্ণ বিনিয়োগ বা ধার দেওয়া এড়ান।'],
        love: ['সম্পর্কে উষ্ণতা ও বোঝাপড়া; সঙ্গীর সঙ্গে সময় কাটানোর জন্য ভালো।', 'তর্কের চেয়ে বেশি শুনলে সম্পর্ক ভালো থাকবে।', 'ভুল বোঝাবুঝি হতে পারে; নরমভাবে বলুন, রাগে প্রতিক্রিয়া দেখাবেন না।'],
        health: ['শক্তি ভালো; ব্যায়াম বা রুটিন আবার শুরু করার ভালো সময়।', 'শক্তি মাঝারি; ঘুম ও খাওয়া নিয়মিত রাখুন।', 'ক্লান্তি বা চাপ দেখা দিতে পারে; ভালো বিশ্রাম নিন, অতিরিক্ত পরিশ্রম এড়ান।'],
        family: ['বাড়িতে শান্তি এবং পরিবার ও বন্ধুদের সহায়তা।', 'দায়িত্ব ভাগ করে নিলে বাড়ির পরিবেশ শান্ত থাকবে।', 'বাড়িতে ছোটখাটো টানাপোড়েন; অন্যদের জায়গা দিন, কড়া কথা এড়ান।']
      },
      weekHead: 'এই সপ্তাহ এক নজরে', weekBest: 'ভালো দিন: {days}', weekCare: 'বাড়তি সতর্কতার দিন: {days}', none: '—', slowHead: 'ধীরগতির গ্রহ (এই সময়ের পটভূমি)',
      weekVerdict: ['বেশিরভাগই অনুকূল সপ্তাহ: আপনার পরিকল্পনা এগিয়ে নিন।', 'উত্থান-পতনসহ ভারসাম্যপূর্ণ সপ্তাহ: নমনীয় থাকুন।', 'কঠিন সপ্তাহ: ধীরে চলুন, শক্তি বাঁচান এবং বড় ঝুঁকি এড়ান।']
    },
    gu: {
      names: { career: 'કારકિર્દી અને કામ', money: 'ધન', love: 'પ્રેમ અને સંબંધો', health: 'સ્વાસ્થ્ય', family: 'પરિવાર અને મનની શાંતિ' },
      text: {
        career: ['કામ સરળતાથી ચાલે છે; તમારી મહેનતની નોંધ લેવાય છે અને ઉપરીઓ સહાયક રહે છે.', 'રોજિંદું કામ સ્થિર રહે છે; હમણાં કારકિર્દીમાં મોટા ફેરફાર ટાળો.', 'કામમાં દબાણ અને વિલંબ થઈ શકે; ધીરજ રાખો અને ઉપરીઓ સાથે દલીલ ટાળો.'],
        money: ['આવક અને બચતને સાથ મળે છે; સમજદારીભર્યા નાણાકીય નિર્ણયો માટે સારો સમય.', 'નાણાકીય સ્થિતિ સ્થિર રહે છે; ખર્ચ કાબૂમાં રાખો.', 'ખર્ચ પર ધ્યાન રાખો; જોખમી રોકાણ કે ઉધાર આપવાનું ટાળો.'],
        love: ['સંબંધોમાં હૂંફ અને સમજ; જીવનસાથી સાથે સમય વિતાવવા માટે સારું.', 'દલીલ કરતાં વધુ સાંભળશો તો સંબંધો સારા રહેશે.', 'ગેરસમજ થઈ શકે; નરમાશથી બોલો અને ગુસ્સામાં પ્રતિક્રિયા ન આપો.'],
        health: ['ઊર્જા સારી છે; કસરત અથવા દિનચર્યા ફરી શરૂ કરવા માટે સારો સમય.', 'ઊર્જા સામાન્ય છે; ઊંઘ અને ભોજન નિયમિત રાખો.', 'થાક કે તણાવ દેખાઈ શકે; સારો આરામ કરો અને વધુ પડતી મહેનત ટાળો.'],
        family: ['ઘરમાં શાંતિ અને પરિવાર તથા મિત્રોનો સાથ.', 'જવાબદારીઓ વહેંચશો તો ઘરનું વાતાવરણ શાંત રહેશે.', 'ઘરમાં નાના તણાવ થઈ શકે; બીજાને જગ્યા આપો અને કડવા શબ્દો ટાળો.']
      },
      weekHead: 'આ અઠવાડિયું એક નજરે', weekBest: 'સારા દિવસો: {days}', weekCare: 'વધુ કાળજી રાખવાના દિવસો: {days}', none: '—', slowHead: 'ધીમી ગતિના ગ્રહો (આ સમયગાળાની પૃષ્ઠભૂમિ)',
      weekVerdict: ['મોટે ભાગે અનુકૂળ અઠવાડિયું: તમારી યોજનાઓ આગળ વધારો.', 'ચડાવ-ઉતાર સાથે સંતુલિત અઠવાડિયું: લવચીક રહો.', 'કઠિન અઠવાડિયું: ધીમે ચાલો, ઊર્જા બચાવો અને મોટા જોખમ ટાળો.']
    }
  });
  function areaVerdicts(rows, moonRow, language) {
    const text = AREA_TEXT[language] || AREA_TEXT.en;
    return Object.entries(AREAS).map(([key, area]) => {
      const mine = rows.filter(row => area.planets.includes(row.name));
      let score = mine.filter(row => row.good).length - mine.filter(row => !row.good).length;
      if (moonRow && area.moonHouses.includes(moonRow.house)) score += moonRow.good ? 1 : -1;
      const tone = score >= 1 ? 'good' : score <= -1 ? 'caution' : 'mixed';
      return { key, tone, name: text.names[key], text: text.text[key][tone === 'good' ? 0 : tone === 'caution' ? 2 : 1] };
    });
  }
  // days: array of /api/day-panchang day objects (one per date). weekday(iso) -> short weekday label. Returns 12 cards.
  function periodOutlook(days, language, weekday, kind) {
    const text = AREA_TEXT[language] || AREA_TEXT.en, g = GOCHARA_TEXT[language] || GOCHARA_TEXT.en;
    const usable = days.filter(day => day && day.moon_rashi && day.moon_rashi[0] && day.planet_rashis);
    if (!usable.length) return [];
    const perDay = usable.map(day => gocharaOutlook(day, language));
    return Array.from({ length: 12 }, (_unused, index) => {
      const strip = usable.map((day, n) => ({ date: day.date, day: Number(day.date.slice(8)), label: weekday(day.date), tone: perDay[n][index].tone, favourable: perDay[n][index].favourable }));
      const better = strip.filter(item => item.tone === 'good').map(item => item.label), care = strip.filter(item => item.tone === 'caution').map(item => item.label);
      const goodCount = better.length, careCount = care.length;
      const mid = perDay[Math.floor(perDay.length / 2)][index];
      const slow = mid.rows.filter(row => ['Jupiter', 'Saturn', 'Rahu', 'Ketu'].includes(row.name));
      const slowRows = mid.rows.filter(row => ['Jupiter', 'Saturn', 'Rahu', 'Ketu'].includes(row.name));
      const slowGood = slow.filter(row => row.good).length;
      const overall = (goodCount - careCount) / strip.length + (slowGood >= 3 ? 0.2 : slowGood <= 1 ? -0.2 : 0);
      const tone = overall >= 0.25 ? 'good' : overall <= -0.25 ? 'caution' : 'mixed';
      const first = perDay[0][index];
      return {
        rashi: index + 1, name: first.name, tone, strip,
        verdict: (kind === 'month' ? (MONTH_TEXT[language] || MONTH_TEXT.en).verdict : text.weekVerdict)[tone === 'good' ? 0 : tone === 'caution' ? 2 : 1],
        best: fillText(text.weekBest, { days: better.length ? better.join(', ') : text.none }), care: fillText(text.weekCare, { days: care.length ? care.join(', ') : text.none }),
        areas: areaVerdicts(mid.rows.filter(row => !['Moon'].includes(row.name)), null, language), slowRows
      };
    });
  }

  // ---- Month view: same method over a whole month, plus when each planet changes sign ----
  const MONTH_TEXT = Object.freeze({
    en: { verdict: ['A mostly supportive month: a good time to push your plans forward.', 'A balanced month with ups and downs: stay flexible and steady.', 'A demanding month: go slowly, protect your energy and avoid big risks.'], moves: 'Planet sign changes this month', none: 'No planet changes sign this month.' },
    te: { verdict: ['ఎక్కువగా అనుకూలమైన నెల: మీ ప్రణాళికలను ముందుకు తీసుకెళ్లడానికి మంచి సమయం.', 'ఎత్తుపల్లాలతో సమతుల్యమైన నెల: అనువుగా, స్థిరంగా ఉండండి.', 'కఠినమైన నెల: నెమ్మదిగా వెళ్లండి, శక్తిని కాపాడుకోండి, పెద్ద రిస్క్‌లు మానండి.'], moves: 'ఈ నెలలో గ్రహాల రాశి మార్పులు', none: 'ఈ నెలలో ఏ గ్రహమూ రాశి మారదు.' },
    hi: { verdict: ['ज्यादातर अनुकूल महीना: अपनी योजनाओं को आगे बढ़ाने का अच्छा समय।', 'उतार-चढ़ाव वाला संतुलित महीना: लचीले और स्थिर रहें।', 'कठिन महीना: धीरे चलें, ऊर्जा बचाएँ और बड़े जोखिम से बचें।'], moves: 'इस महीने ग्रहों के राशि परिवर्तन', none: 'इस महीने कोई ग्रह राशि नहीं बदलता।' },
    ta: { verdict: ['பெரும்பாலும் சாதகமான மாதம்: உங்கள் திட்டங்களை முன்னெடுக்க நல்ல நேரம்.', 'ஏற்ற இறக்கங்களுடன் சமநிலையான மாதம்: நெகிழ்வாகவும் நிலையாகவும் இருங்கள்.', 'சவாலான மாதம்: மெதுவாகச் செல்லுங்கள், சக்தியைப் பாதுகாத்து பெரிய ஆபத்தைத் தவிருங்கள்.'], moves: 'இந்த மாதம் கிரகங்களின் ராசி மாற்றங்கள்', none: 'இந்த மாதம் எந்த கிரகமும் ராசி மாறாது.' },
    kn: { verdict: ['ಹೆಚ್ಚಾಗಿ ಅನುಕೂಲಕರ ತಿಂಗಳು: ನಿಮ್ಮ ಯೋಜನೆಗಳನ್ನು ಮುಂದುವರಿಸಲು ಒಳ್ಳೆಯ ಸಮಯ.', 'ಏರಿಳಿತಗಳೊಂದಿಗೆ ಸಮತೋಲಿತ ತಿಂಗಳು: ಹೊಂದಿಕೊಳ್ಳುವ, ಸ್ಥಿರ ಮನೋಭಾವ ಇರಲಿ.', 'ಕಠಿಣ ತಿಂಗಳು: ನಿಧಾನವಾಗಿ ಸಾಗಿ, ಶಕ್ತಿ ಕಾಪಾಡಿ, ದೊಡ್ಡ ಅಪಾಯ ತಪ್ಪಿಸಿ.'], moves: 'ಈ ತಿಂಗಳು ಗ್ರಹಗಳ ರಾಶಿ ಬದಲಾವಣೆ', none: 'ಈ ತಿಂಗಳು ಯಾವ ಗ್ರಹವೂ ರಾಶಿ ಬದಲಾಯಿಸುವುದಿಲ್ಲ.' },
    ml: { verdict: ['മിക്കവാറും അനുകൂലമായ മാസം: നിങ്ങളുടെ പദ്ധതികൾ മുന്നോട്ട് കൊണ്ടുപോകാൻ നല്ല സമയം.', 'ഏറ്റക്കുറച്ചിലുകളുള്ള സമതുലിത മാസം: അയവോടെയും സ്ഥിരതയോടെയും ഇരിക്കുക.', 'വെല്ലുവിളി നിറഞ്ഞ മാസം: പതുക്കെ പോകുക, ഊർജ്ജം സംരക്ഷിക്കുക, വലിയ അപകടം ഒഴിവാക്കുക.'], moves: 'ഈ മാസത്തെ ഗ്രഹങ്ങളുടെ രാശിമാറ്റം', none: 'ഈ മാസം ഒരു ഗ്രഹവും രാശി മാറുന്നില്ല.' },
    mr: { verdict: ['बहुतांश अनुकूल महिना: तुमच्या योजना पुढे नेण्यासाठी चांगला काळ.', 'चढ-उतारांसह संतुलित महिना: लवचिक आणि स्थिर राहा.', 'कठीण महिना: हळू चला, ऊर्जा जपा आणि मोठी जोखीम टाळा.'], moves: 'या महिन्यातील ग्रहांचे राशी परिवर्तन', none: 'या महिन्यात कोणताही ग्रह राशी बदलत नाही.' },
    bn: { verdict: ['বেশিরভাগই অনুকূল মাস: আপনার পরিকল্পনা এগিয়ে নেওয়ার ভালো সময়।', 'উত্থান-পতনসহ ভারসাম্যপূর্ণ মাস: নমনীয় ও স্থির থাকুন।', 'কঠিন মাস: ধীরে চলুন, শক্তি রক্ষা করুন এবং বড় ঝুঁকি এড়ান।'], moves: 'এই মাসে গ্রহের রাশি পরিবর্তন', none: 'এই মাসে কোনো গ্রহ রাশি বদলায় না।' },
    gu: { verdict: ['મોટે ભાગે અનુકૂળ મહિનો: તમારી યોજનાઓ આગળ વધારવાનો સારો સમય.', 'ચડાવ-ઉતાર સાથે સંતુલિત મહિનો: લવચીક અને સ્થિર રહો.', 'કઠિન મહિનો: ધીમે ચાલો, ઊર્જા સાચવો અને મોટા જોખમ ટાળો.'], moves: 'આ મહિને ગ્રહોના રાશિ પરિવર્તન', none: 'આ મહિને કોઈ ગ્રહ રાશિ બદલતો નથી.' }
  });
  const monthMovesHead = language => (MONTH_TEXT[language] || MONTH_TEXT.en).moves;
  // Returns lines such as "Sun → Scorpio · 17 Nov" for every day on which a transiting planet is in a new sign.
  function planetMoves(days, language, label) {
    const lines = [];
    const usable = days.filter(day => day && day.planet_rashis);
    for (let n = 1; n < usable.length; n += 1) {
      for (const name of ['Sun', 'Mars', 'Mercury', 'Venus', 'Jupiter', 'Saturn', 'Rahu', 'Ketu']) {
        if (usable[n].planet_rashis[name] !== usable[n - 1].planet_rashis[name]) lines.push(`${bodyName(name, language)} → ${signName(usable[n].planet_rashis[name], language)} · ${label(usable[n].date)}`);
      }
    }
    return lines.length ? lines : [(MONTH_TEXT[language] || MONTH_TEXT.en).none];
  }
  const weekOutlook = (days, language, weekday) => periodOutlook(days, language, weekday, 'week');
  const monthOutlook = (days, language, weekday) => periodOutlook(days, language, weekday, 'month');

  // North Indian chart on a 400x400 square: houses are fixed (house 1 is the top diamond,
  // then anticlockwise); the sign in each house follows from the Lagna.
  function northIndianLayout() {
    const A = [0, 0], B = [400, 0], C = [400, 400], D = [0, 400], E = [200, 0], F = [400, 200], G = [200, 400], H = [0, 200], O = [200, 200];
    const P = [100, 100], Q = [300, 100], R = [300, 300], S = [100, 300];
    const shapes = [[E, Q, O, P], [A, E, P], [A, H, P], [H, P, O, S], [D, H, S], [D, G, S], [G, S, O, R], [C, G, R], [C, F, R], [F, R, O, Q], [B, F, Q], [B, E, Q]];
    return shapes.map((points, index) => ({
      house: index + 1, points,
      center: [points.reduce((sum, point) => sum + point[0], 0) / points.length, points.reduce((sum, point) => sum + point[1], 0) / points.length]
    }));
  }

  const api = Object.freeze({ RASHI_NAMES, SOUTH_SLOTS, buildSouthIndianChart, northIndianLayout, answerChartQuestion, isJathakamRequest, isFallbackAnswer, rashiOutlook, gocharaOutlook, gocharaHead, weekOutlook, monthOutlook, planetMoves, monthMovesHead, slowHead: language => (AREA_TEXT[language] || AREA_TEXT.en).slowHead, weekHead: language => (AREA_TEXT[language] || AREA_TEXT.en).weekHead, parseBirthDate, parseBirthTime, wantsToday, readToday, readingTopic, readLife, signName, bodyName });
  root.JyotishaChart = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
