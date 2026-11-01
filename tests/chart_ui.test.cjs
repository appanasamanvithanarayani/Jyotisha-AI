/* Synthetic UI contract tests. Not astronomical validation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
require('./load-locales.cjs');
const ui = require('../src/jyotisha_ai/web/chart-ui.js');
globalThis.JyotishaPanchangNames = require('../src/jyotisha_ai/web/panchang-names.js');

const chart = {
  ascendant: { rashi_index: 10, sidereal_longitude: 275.25 },
  positions: {
    Sun: { rashi_index: 7, sidereal_longitude: 185.5, whole_sign_bhava: 10 },
    Moon: { rashi_index: 8, sidereal_longitude: 217.1, whole_sign_bhava: 11 },
    Mars: { rashi_index: 5, sidereal_longitude: 135.5, whole_sign_bhava: 8 },
    Mercury: { rashi_index: 7, sidereal_longitude: 203.1, whole_sign_bhava: 10 },
    Jupiter: { rashi_index: 11, sidereal_longitude: 325.1, whole_sign_bhava: 2 },
    Venus: { rashi_index: 7, sidereal_longitude: 184.1, whole_sign_bhava: 10 },
    Saturn: { rashi_index: 1, sidereal_longitude: 6.3, whole_sign_bhava: 4 }
  },
  panchanga_at_birth: { tithi_index: 3, nakshatra_index: 17, nakshatra_pada: 2, yoga_index: 4 },
  vimshottari: { starting_lord: 'Saturn', balance_years_at_birth: 13.6 }
};

test('experimental chart overlap is symmetric, transparent, and rejects missing calculated positions', () => {
  const another = {
    ...chart,
    ascendant: { ...chart.ascendant, rashi_index: 2 },
    positions: { ...chart.positions, Moon: { ...chart.positions.Moon, rashi_index: 9 } },
  };
  const forward = ui.chartOverlap(chart, another);
  const reverse = ui.chartOverlap(another, chart);
  assert.equal(forward.method, 'exact-placement-overlap-v1');
  assert.equal(forward.shared, 2);
  assert.equal(forward.total, 4);
  assert.equal(forward.percentage, 50);
  assert.equal(reverse.shared, forward.shared);
  assert.deepEqual(forward.rows.map(row => row.key), ['moonRashi', 'birthNakshatra', 'lagnaRashi', 'venusRashi']);
  assert.equal(ui.chartOverlap(chart, chart).percentage, 100);
  const none = { ...another, panchanga_at_birth: { ...another.panchanga_at_birth, nakshatra_index: 1 }, positions: { ...another.positions, Venus: { ...another.positions.Venus, rashi_index: 3 } } };
  assert.equal(ui.chartOverlap(chart, none).percentage, 0);
  assert.throws(() => ui.chartOverlap(chart, { ...another, positions: { ...another.positions, Venus: null } }), /Missing or invalid/);
  assert.throws(() => ui.chartOverlap(null, chart), /Two calculated/);
});

test('South Indian D1 layout contains twelve fixed, unique signs', () => {
  const cells = ui.buildSouthIndianChart(chart);
  assert.equal(cells.length, 12);
  assert.deepEqual(new Set(cells.map(cell => cell.rashi)).size, 12);
  assert.deepEqual(cells.filter(cell => cell.row === 1).map(cell => cell.sign),
    ['Pisces', 'Aries', 'Taurus', 'Gemini']);
  assert.equal(cells.find(cell => cell.isLagna).sign, 'Capricorn');
  assert.equal(cells.find(cell => cell.rashi === 7).house, 10);
  assert.deepEqual(cells.find(cell => cell.rashi === 7).planets.map(p => p.name),
    ['Sun', 'Mercury', 'Venus']);
});

test('bad or inconsistent chart data never produces a diagram', () => {
  assert.throws(() => ui.buildSouthIndianChart(null));
  assert.throws(() => ui.buildSouthIndianChart({ ...chart, ascendant: { rashi_index: 0, sidereal_longitude: 0 } }));
  assert.throws(() => ui.buildSouthIndianChart({ ...chart, positions: { Sun: { ...chart.positions.Sun, whole_sign_bhava: 9 } } }));
});

test('question panel reports calculated facts and never an invented placement', () => {
  assert.match(ui.answerChartQuestion(chart, 'What is my Lagna?'), /Capricorn/);
  assert.match(ui.answerChartQuestion(chart, 'Where is Moon?'), /Scorpio/);
  assert.match(ui.answerChartQuestion(chart, 'Which planets are in house 10?'), /Sun, Mercury, Venus/);
  assert.match(ui.answerChartQuestion(chart, 'What is the Tithi?'), /Shukla Tritiya \(3\)/);
  assert.match(ui.answerChartQuestion(chart, 'Where is Rahu?'), /not calculated/);
  assert.match(ui.answerChartQuestion(chart, 'Will I get married?'), /You can ask about your Lagna, planets, houses/);
  assert.match(ui.answerChartQuestion(null, 'Where is Moon?'), /Calculate a chart first/);
});

test('Telugu and Hindi factual chart replies use the selected language', () => {
  assert.equal(ui.signName(10,'te'),'మకరం');
  assert.equal(ui.bodyName('Moon','te'),'చంద్రుడు');
  assert.match(ui.answerChartQuestion(chart,'నా లగ్నం ఏమిటి?','te'),/లగ్నం మకరం/);
  assert.match(ui.answerChartQuestion(chart,'చంద్రుడు ఎక్కడ ఉన్నాడు?','te'),/చంద్రుడు వృశ్చికం/);
  assert.match(ui.answerChartQuestion(chart,'తిథి ఏమిటి?','te'),/శుక్ల తదియ/);
  assert.match(ui.answerChartQuestion(chart,'భావం 1','te'),/1వ భావం మకరం/);
  assert.match(ui.answerChartQuestion(chart,'Where is Rahu?','te'),/రాహువు స్థానం ఈ గణనలో లేదు/);  // no details -> no invented position
  const details={navamsa:{lagna_rashi_index:4,positions:{Moon:9}},planets:{Rahu:{rashi_index:11,whole_sign_bhava:2,sidereal_longitude:301.25},Ketu:{rashi_index:5,whole_sign_bhava:8,sidereal_longitude:121.25}}};
  assert.match(ui.answerChartQuestion(chart,'Where is Rahu?','en',details),/Rahu is in Aquarius \(Rashi 11\), whole-sign Bhava 2/);
  assert.match(ui.answerChartQuestion(chart,'Where is Ketu?','en',details),/Ketu is in Leo/);
  assert.match(ui.answerChartQuestion(chart,'రాహు ఎక్కడ?','te',details),/రాహువు కుంభం రాశిలో \(11\), 2వ భావంలో/);
  assert.match(ui.answerChartQuestion(chart,'కేతు ఎక్కడ?','te',details),/కేతువు సింహం రాశిలో/);
  assert.match(ui.answerChartQuestion(chart,'What is my navamsa?','en',details),/Navamsa Lagna is Cancer; Navamsa Moon is Sagittarius/);
  assert.match(ui.answerChartQuestion(chart,'నవాంశ ఏమిటి?','te',details),/నవాంశ లగ్నం కర్కాటకం; నవాంశలో చంద్రుడు ధనుస్సు/);
  assert.match(ui.answerChartQuestion(chart,'What is my navamsa?'),/not calculated/);
  assert.match(ui.answerChartQuestion(chart,'मेरा लग्न क्या है?','hi'),/लग्न मकर/);
  assert.doesNotMatch(ui.answerChartQuestion(chart,'నా లగ్నం ఏమిటి?','te'),/Calculated fact|Capricorn/);
});

test('page controller script parses and the North Indian layout has twelve distinct houses', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/jyotisha_ai/web/app.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(source));
  const layout = ui.northIndianLayout();
  assert.equal(layout.length, 12);
  assert.deepEqual(layout.map(house => house.house), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(new Set(layout.map(house => house.center.join(','))).size, 12);
  // house 1 is the top diamond; houses proceed anticlockwise (house 4 left, 7 bottom, 10 right)
  assert.ok(layout[0].center[1] < 150 && Math.abs(layout[0].center[0] - 200) < 1);
  assert.ok(layout[3].center[0] < 150 && layout[6].center[1] > 250 && layout[9].center[0] > 250);
  // together the twelve houses tile the square exactly: shoelace areas add up to 400*400
  const area = points => Math.abs(points.reduce((sum, point, index) => { const next = points[(index + 1) % points.length]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0)) / 2;
  assert.equal(layout.reduce((sum, house) => sum + area(house.points), 0), 160000);
});

test('Jathakam and life-area questions are recognised, including native-script words', () => {
  for (const q of ['give me my jathakam', 'నా జాతకం చూపించు', 'मेरी जन्म कुंडली', 'show horoscope']) assert.equal(ui.isJathakamRequest(q), true, q);
  assert.equal(ui.isJathakamRequest('where is the moon'), false);
  assert.equal(ui.readingTopic('how is my money situation'), 'money');
  assert.equal(ui.readingTopic('will my studies go well'), 'study');
  assert.equal(ui.readingTopic('where is the moon'), null);
});

test('life-area readings use house lords, significators, the current period and the day Moon, and carry a disclaimer', () => {
  const details = { planets: { Rahu: { rashi_index: 4, whole_sign_bhava: 7 }, Ketu: { rashi_index: 10, whole_sign_bhava: 1 }, Jupiter: { rashi_index: 11, whole_sign_bhava: 2, dignity: null }, Venus: { rashi_index: 7, whole_sign_bhava: 10, dignity: null, retrograde: false } }, dasha: { current_mahadasha: 'Jupiter' } };
  const lines = ui.readLife(chart, details, 'money', 'en', { moonRashi: 8, date: '2026-10-31', isToday: true });
  const text = lines.join('\n');
  assert.match(lines[0], /Money/);
  assert.match(text, /2nd house/); assert.match(text, /11th house/);
  assert.match(text, /Natural significator Jupiter/);
  assert.match(text, /connected to this area/);
  assert.match(text, /Today: the Moon transits Scorpio, the 1st from your Moon sign/);
  assert.match(lines.at(-1), /not a prediction/);
  // without details it still answers from the plain chart and never throws
  assert.ok(ui.readLife(chart, null, 'study', 'en', null).length >= 4);
});

test('life topics are recognised from romanised Indian-language words', () => {
  const cases = { 'naa dabbu ela undi': 'money', 'meri shaadi kab hogi': 'marriage', 'chaduvu gurinchi cheppu': 'study', 'my udyogam eppudu': 'career', 'arogyam ela': 'health', 'mera bhavishya': 'life', 'en thirumanam': 'marriage' };
  for (const [question, topic] of Object.entries(cases)) assert.equal(ui.readingTopic(question), topic, question);
});

test('life-area readings come out in the selected language, with English only for languages not yet translated', () => {
  const today = { moonRashi: 8, date: '2026-10-31', isToday: true };
  const placeholder = /\{\w+\}/;
  for (const code of ['te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu']) {
    for (const key of ['money', 'study', 'career', 'marriage', 'health', 'life']) {
      const text = ui.readLife(chart, null, key, code, today).join('\n');
      assert.doesNotMatch(text, placeholder, `${code}/${key} has an unfilled placeholder`);
      assert.doesNotMatch(text, /Overall|general classical rules|Natural significator|house lord/i, `${code}/${key} still has English wording`);
    }
  }
  assert.match(ui.readLife(chart, null, 'money', 'te', today)[0], /డబ్బు/);
  assert.match(ui.readLife(chart, null, 'money', 'ur', today)[0], /Money and finances/);
});

test('an unmatched question is detected as the fallback so the app can answer with the general reading', () => {
  for (const lang of ['en', 'te', 'hi']) {
    assert.equal(ui.isFallbackAnswer(ui.answerChartQuestion(chart, 'blah blah', lang), lang), true, lang);
    assert.equal(ui.isFallbackAnswer(ui.answerChartQuestion(chart, 'where is the moon', lang), lang), false, lang);
  }
});

test('today readings use the day Moon, Tara, period and timings, in the selected language', () => {
  const day = { date: '2026-10-31', moon_rashi: [{ index: 3 }], nakshatra: [{ index: 5 }], timings: { abhijit: ['2026-10-31T11:50', '2026-10-31T12:38'], rahu_kalam: ['2026-10-31T09:00', '2026-10-31T10:30'] } };
  const details = { dasha: { current_mahadasha: 'Jupiter', antardasha: [{ lord: 'Saturn', current: false }, { lord: 'Mercury', current: true }] } };
  const fmt = iso => iso.slice(11);
  const en = ui.readToday(chart, details, day, 'en', fmt).join('\n');
  assert.match(en, /Tarabalam: today’s Nakshatra .* is your \w+ Tara/);
  assert.match(en, /Running period: Jupiter Mahadasha, Mercury Antardasha/);
  assert.match(en, /Abhijit Muhurta 11:50 – 12:38/); assert.match(en, /Rahu Kalam 09:00 – 10:30/);
  assert.match(en, /Overall the day/);
  for (const code of ['te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu']) {
    const text = ui.readToday(chart, details, day, code, fmt).join('\n');
    assert.doesNotMatch(text, /\{\w+\}|Overall|Tarabalam|Running period|Abhijit Muhurta/, code);
  }
  assert.equal(ui.wantsToday('what will happen today'), true);
  assert.equal(ui.wantsToday('ee roju ela untundi'), true);
  assert.equal(ui.wantsToday('where is jupiter'), false);
});

test('birth dates and times typed in chat are read in common spellings, Indian digits included', () => {
  const dates = { '15-08-1995': '1995-08-15', '15/8/1995': '1995-08-15', '1995-08-15': '1995-08-15', '15 Aug 1995': '1995-08-15', 'August 15 1995': null, '౧౫-౦౮-౧౯౯౫': '1995-08-15', '१५.०८.१९९५': '1995-08-15', '15-08-95': '1995-08-15', '31-02-2000': null, 'hello': null, '15-13-1990': null };
  for (const [text, expected] of Object.entries(dates)) assert.equal(ui.parseBirthDate(text), expected, text);
  const times = { '06:30 AM': '06:30', '6:30 pm': '18:30', '6.30am': '06:30', '18:45': '18:45', '12 am': '00:00', '12:15 pm': '12:15', '1830': '18:30', '6 pm': '18:00', '౬:౩౦ pm': '18:30', '25:00': null, '13 pm': null, 'noon': null };
  for (const [text, expected] of Object.entries(times)) assert.equal(ui.parseBirthTime(text), expected, text);
});

test('Rashiphal gives all twelve signs an outlook from the Moon transit, in the selected language', () => {
  const day = { date: '2026-10-31', moon_rashi: [{ index: 3 }] };
  const cards = ui.rashiOutlook(day, 'en');
  assert.equal(cards.length, 12);
  assert.deepEqual(cards.map(card => card.house), [3, 2, 1, 12, 11, 10, 9, 8, 7, 6, 5, 4]);
  assert.equal(cards[7].tone, 'caution'); assert.equal(cards[2].tone, 'good'); assert.equal(cards[1].tone, 'mixed');
  assert.match(cards[7].kind, /Ashtama Chandra/);
  for (const code of ['te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu']) {
    const text = ui.rashiOutlook(day, code).map(card => `${card.name} ${card.kind} ${card.area}`).join('\n');
    assert.doesNotMatch(text, /\{\w+\}|With the Moon|Chandrabalam|from your Moon/, code);
  }
  assert.deepEqual(ui.rashiOutlook({ date: 'x', moon_rashi: [] }, 'en'), []);
});

test('Rashiphal detail: every sign gets all planet transits counted by the classical Gochara houses', () => {
  const day = { date: '2026-10-31', moon_rashi: [{ index: 3 }], planet_rashis: { Sun: 7, Mars: 4, Mercury: 7, Jupiter: 4, Venus: 7, Saturn: 12, Rahu: 11, Ketu: 5 } };
  const cards = ui.gocharaOutlook(day, 'en');
  assert.equal(cards.length, 12);
  const aries = cards[0];
  assert.equal(aries.rows.length, 8);
  assert.equal(aries.rows.find(row => row.name === 'Saturn').text, 'Saturn — house 12 ✖ delays, pressure and fatigue'.replace('house 12', '12th house'));
  assert.deepEqual(aries.rows.filter(row => row.good).map(row => row.name), ['Rahu']);   // from Aries: Sun 7, Mars 4, Mercury 7, Jupiter 4, Venus 7, Saturn 12, Ketu 5 are all outside their good houses
  assert.equal(aries.favourable, 2);   // Rahu in 11 and the Moon in 3 (Gemini)
  assert.ok(cards.every(card => card.favourable >= 0 && card.favourable <= 9 && ['good', 'mixed', 'caution'].includes(card.tone)));
  assert.deepEqual(ui.gocharaOutlook({ date: 'x', moon_rashi: [{ index: 3 }] }, 'en'), []);
  for (const code of ['te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu']) {
    const text = ui.gocharaOutlook(day, code).map(card => card.verdict + card.count + card.rows.map(row => row.text).join()).join('\n');
    assert.doesNotMatch(text, /\{\w+\}|delays|transits favourable|confidence/, code);
  }
});

test('sign forecasts include life-area verdicts, and the week view summarises seven days per sign', () => {
  const planets = { Sun: 7, Mars: 4, Mercury: 7, Jupiter: 4, Venus: 7, Saturn: 12, Rahu: 11, Ketu: 5 };
  const days = Array.from({ length: 7 }, (_unused, n) => ({ date: `2026-11-0${n + 1}`, moon_rashi: [{ index: (n * 2) % 12 + 1 }], planet_rashis: planets }));
  const day = ui.gocharaOutlook(days[0], 'en');
  assert.deepEqual(day[0].areas.map(area => area.key), ['career', 'money', 'love', 'health', 'family']);
  assert.ok(day.every(card => card.areas.every(area => ['good', 'mixed', 'caution'].includes(area.tone) && area.text.length > 20)));
  const week = ui.weekOutlook(days, 'en', iso => iso.slice(8));
  assert.equal(week.length, 12);
  assert.equal(week[0].strip.length, 7);
  assert.match(week[0].best, /^Better days: /); assert.match(week[0].care, /^Take extra care on: /);
  assert.equal(week[0].slowRows.map(row => row.name).join(), 'Jupiter,Saturn,Rahu,Ketu');
  assert.equal(week[0].areas.length, 5);
  assert.deepEqual(ui.weekOutlook([], 'en', x => x), []);
  for (const code of ['te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu']) {
    const text = ui.weekOutlook(days, code, iso => iso.slice(8)).map(card => [card.verdict, card.best, card.care, ...card.areas.map(area => area.name + area.text)].join(' ')).join('\n')
      + ui.gocharaOutlook(days[0], code).map(card => card.areas.map(area => area.text).join(' ')).join('\n');
    assert.doesNotMatch(text, /\{\w+\}|Better days|Take extra care|Work goes|Money is steady|Career and work/, code);
  }
});

test('month view aggregates the whole month and lists the days planets change sign', () => {
  const days = Array.from({ length: 30 }, (_unused, n) => ({ date: `2026-11-${String(n + 1).padStart(2, '0')}`, moon_rashi: [{ index: n % 12 + 1 }],
    planet_rashis: { Sun: n < 16 ? 7 : 8, Mars: 4, Mercury: 7, Jupiter: 5, Venus: n < 20 ? 7 : 8, Saturn: 12, Rahu: 11, Ketu: 5 } }));
  const month = ui.monthOutlook(days, 'en', iso => String(Number(iso.slice(8))));
  assert.equal(month.length, 12); assert.equal(month[0].strip.length, 30);
  assert.match(month[0].best, /^Better days: /); assert.match(month[0].verdict, /month/);
  const moves = ui.planetMoves(days, 'en', iso => iso.slice(5));
  assert.deepEqual(moves, ['Sun → Scorpio · 11-17', 'Venus → Scorpio · 11-21']);
  assert.deepEqual(ui.planetMoves(days.slice(0, 5), 'en', x => x), ['No planet changes sign this month.']);
  for (const code of ['te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu']) {
    const text = month.map((_, i) => ui.monthOutlook(days, code, iso => iso)[i].verdict).join() + ui.planetMoves(days, code, iso => iso).join() + ui.monthMovesHead(code);
    assert.doesNotMatch(text, /month|Planet sign|Sun →/i, code);
  }
});

test('simple remedies (parihara) accompany unfavourable placements, in the selected language, and are never gems or paid rituals', () => {
  const planets = { Sun: 7, Mars: 4, Mercury: 7, Jupiter: 5, Venus: 7, Saturn: 12, Rahu: 11, Ketu: 5 };
  const day = { date: '2026-10-31', moon_rashi: [{ index: 8 }], planet_rashis: planets, nakshatra: [{ index: 5 }], timings: {} };
  const cards = ui.gocharaOutlook(day, 'en');
  const aries = cards[0];
  assert.ok(aries.remedies.length >= 1 && aries.remedies.length <= 3);
  assert.match(aries.remedies[0], /^Saturn — .*(lamp|pradakshina)/);   // Saturn is unfavourable from Aries and is listed first
  assert.ok(cards.every(card => card.remedies.every(line => !/(gems?|gemstones?|rings?|pay|fees?|guarantee[sd]?)/i.test(line))));
  const week = ui.weekOutlook(Array.from({ length: 7 }, (_u, n) => ({ ...day, date: `2026-11-0${n + 1}` })), 'en', x => x);
  assert.ok(week[0].remedies.length >= 1 && week[0].remedies.every(line => /^(Saturn|Rahu|Ketu|Jupiter) — /.test(line)));
  // personal readings: a debilitated or badly placed lord brings its remedy, and a weak Moon day brings the Moon remedy
  const chart2 = { ascendant: { rashi_index: 10, sidereal_longitude: 275 }, positions: { ...chart.positions, Mars: { rashi_index: 5, sidereal_longitude: 135, whole_sign_bhava: 8 } } };
  const details = { planets: { Mars: { rashi_index: 4, whole_sign_bhava: 7, dignity: 'debilitated' }, Rahu: { rashi_index: 4, whole_sign_bhava: 7 }, Ketu: { rashi_index: 10, whole_sign_bhava: 1 } }, dasha: null };
  const life = ui.readLife(chart2, details, 'money', 'en', null).join('\n');
  assert.match(life, /Simple remedies \(Parihara\):/);
  const todayLines = ui.readToday(chart, null, { date: '2026-10-31', moon_rashi: [{ index: 3 }], nakshatra: [{ index: 12 }], timings: {} }, 'en', x => x).join('\n');
  assert.match(todayLines, /Simple remedies \(Parihara\):[\s\S]*Moon — Offer water or milk to Lord Shiva/);
  for (const code of ['te', 'hi', 'ta', 'kn', 'ml', 'mr', 'bn', 'gu']) {
    const text = ui.remedyHead(code) + ui.remedyNote(code) + ui.gocharaOutlook(day, code).map(card => card.remedies.join(' ')).join(' ');
    assert.doesNotMatch(text, /Offer water|pradakshina|Simple remedies|lamp|Traditional practices/, code);
  }
});
