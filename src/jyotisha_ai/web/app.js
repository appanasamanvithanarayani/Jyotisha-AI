/* Page controller: onboarding, Home (calendar + day Panchang), Kundli and Ask. No network except the local API. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const calendarUI = window.JyotishaCalendar;
  const names = window.JyotishaPanchangNames;
  const chartUI = window.JyotishaChart;
  const matchUI = window.matchUI;

  const state = {
    lang: 'en', city: '', onboarded: false, assistant: false, rashiMode: 'day', contactEmail: '', week: null, weekLoading: null, weekCache: {}, useLocation: false, pendingLocation: false, todayIso: null, selectedDate: null,
    view: { year: 0, month: 0 }, month: null, day: null, dayRequest: 0, monthRequest: 0,
    chart: null, details: null, resolved: null, partnerChart: null, partnerDetails: null, showLoveReading: false, loveMode: null, myRole: 'groom', kundliView: 'chart', kundli: { style: 'south', division: 'd1' },
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

  // Native-app ad state (stays empty in a browser); declared early because switching screens can ask it for an interstitial.
  const appAds = { config: null, admob: null, freeUntil: 0, switches: 0, lastInterstitial: 0, started: Date.now() };
  /* ---------------------------------------------------------------- pages */
  const pages = {};
  const pageHost = $('top');
  for (const name of ['home', 'kundli', 'relationship', 'chat', 'rashi']) {
    const page = document.createElement('section');
    page.className = 'app-page'; page.id = `page-${name}`; page.hidden = true;
    pageHost.appendChild(page); pages[name] = page;
  }
  pages.home.append($('day-panchang'), $('services'), $('legal'));
  pages.kundli.append($('kundli'), $('chart'));
  pages.relationship.appendChild($('relationship'));
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
    maybeInterstitial();
  }
  document.querySelectorAll('a[href^="#"]').forEach(link => link.addEventListener('click', event => {
    const target = link.getAttribute('href').slice(1);
    if (Object.hasOwn(pages, target)) { event.preventDefault(); showPage(target); }
  }));
  showPage('home');

  // Labels are author-written UI text; the rules behind them are conventional and not expert-reviewed.
  const RELATIONSHIP_COPY = {
    en: {
      nav: 'Love', eyebrow: 'Relationships', title: 'Love & Kundli matching', intro: 'Choose what you want to see.',
      optMatch: 'Kundli matching', optMatchSub: 'Guna Milan score out of 36', optReading: 'My love reading', optReadingSub: 'What your chart says about love and marriage',
      compare: 'Partner’s birth details', iAm: 'You are', groom: 'Groom', bride: 'Bride', submit: 'Check matching',
      needChart: 'Create your own Kundli first, using DOB, POB and TOB.',
      calculating: 'Calculating the partner’s chart…', failed: 'The partner’s chart could not be calculated. Check the birth details and select a city from the list.',
      score: 'Guna Milan', excellent: 'Excellent match', good: 'Good match', average: 'Average match — acceptable in most traditions', low: 'Low match — usually not recommended',
      nadiDosha: 'Nadi dosha: both have the same Nadi.', bhakootDosha: 'Bhakoot dosha: the two Moon signs sit in a difficult position from each other.',
      details: 'See all 8 kootas',
      kootas: { varna: 'Varna (nature)', vashya: 'Vashya (attraction)', tara: 'Tara (destiny)', yoni: 'Yoni (intimacy)', maitri: 'Graha Maitri (friendship)', gana: 'Gana (temperament)', bhakoot: 'Bhakoot (family & wealth)', nadi: 'Nadi (health & children)' },
      manglik: 'Manglik (Kuja dosha)', you: 'You', partner: 'Partner', yes: 'Yes', no: 'No',
      manglikBoth: 'Both are Manglik — traditionally this cancels out.', manglikOne: 'Only one is Manglik — many families consult an astrologer about this.',
      note: 'Conventional Ashtakoota rules, not expert-reviewed. Use it as a guide, not as a decision about marriage. Enter another person’s details only with their consent; they are not saved on this device.',
      error: 'Calculated chart data is incomplete; no matching was made.',
    },
    te: {
      nav: 'ప్రేమ', eyebrow: 'సంబంధాలు', title: 'ప్రేమ & జాతక పొంతన', intro: 'మీరు ఏది చూడాలనుకుంటున్నారో ఎంచుకోండి.',
      optMatch: 'జాతక పొంతన', optMatchSub: 'గుణ మేళనం — 36కి స్కోరు', optReading: 'నా ప్రేమ ఫలితం', optReadingSub: 'ప్రేమ, వివాహం గురించి మీ జాతకం ఏమంటుంది',
      compare: 'భాగస్వామి జనన వివరాలు', iAm: 'మీరు', groom: 'వరుడు', bride: 'వధువు', submit: 'పొంతన చూడండి',
      needChart: 'ముందుగా మీ పుట్టిన తేదీ, స్థలం, సమయంతో మీ జాతకాన్ని రూపొందించండి.',
      calculating: 'భాగస్వామి జాతకాన్ని గణిస్తున్నాం…', failed: 'భాగస్వామి జాతకం గణించలేకపోయాం. వివరాలను సరిచూసి జాబితాలోని నగరాన్ని ఎంచుకోండి.',
      score: 'గుణ మేళనం', excellent: 'అత్యుత్తమ పొంతన', good: 'మంచి పొంతన', average: 'సాధారణ పొంతన — చాలా సంప్రదాయాలలో ఆమోదయోగ్యం', low: 'తక్కువ పొంతన — సాధారణంగా సిఫార్సు చేయరు',
      nadiDosha: 'నాడీ దోషం: ఇద్దరిదీ ఒకే నాడి.', bhakootDosha: 'భకూట దోషం: ఇద్దరి చంద్ర రాశులు ఒకదానికొకటి ఇబ్బందికర స్థానంలో ఉన్నాయి.',
      details: 'అన్ని 8 కూటాలు చూడండి',
      kootas: { varna: 'వర్ణ (స్వభావం)', vashya: 'వశ్య (ఆకర్షణ)', tara: 'తార (అదృష్టం)', yoni: 'యోని (అనుబంధం)', maitri: 'గ్రహ మైత్రి (స్నేహం)', gana: 'గణ (ప్రవృత్తి)', bhakoot: 'భకూట (కుటుంబం, సంపద)', nadi: 'నాడి (ఆరోగ్యం, సంతానం)' },
      manglik: 'కుజ దోషం', you: 'మీరు', partner: 'భాగస్వామి', yes: 'ఉంది', no: 'లేదు',
      manglikBoth: 'ఇద్దరికీ కుజ దోషం ఉంది — సంప్రదాయంగా ఇది పరిహారమవుతుంది.', manglikOne: 'ఒకరికి మాత్రమే కుజ దోషం ఉంది — చాలా కుటుంబాలు దీని గురించి జ్యోతిష్కుడిని సంప్రదిస్తాయి.',
      note: 'ఇవి సంప్రదాయ అష్టకూట నియమాలు, నిపుణుల సమీక్ష పొందలేదు. వివాహ నిర్ణయంగా కాకుండా మార్గదర్శిగా మాత్రమే వాడండి. మరొకరి వివరాలను వారి సమ్మతితోనే నమోదు చేయండి; అవి ఈ పరికరంలో సేవ్ కావు.',
      error: 'గణించిన జాతక సమాచారం అసంపూర్ణంగా ఉంది; పొంతన చూడలేదు.',
    },
    hi: {
      nav: 'प्रेम', eyebrow: 'संबंध', title: 'प्रेम और कुंडली मिलान', intro: 'आप क्या देखना चाहते हैं, चुनें।',
      optMatch: 'कुंडली मिलान', optMatchSub: 'गुण मिलान — 36 में से अंक', optReading: 'मेरा प्रेम फल', optReadingSub: 'प्रेम और विवाह पर आपकी कुंडली क्या कहती है',
      compare: 'साथी का जन्म विवरण', iAm: 'आप हैं', groom: 'वर', bride: 'वधू', submit: 'मिलान देखें',
      needChart: 'पहले जन्म तिथि, स्थान और समय से अपनी कुंडली बनाएँ।',
      calculating: 'साथी की कुंडली की गणना हो रही है…', failed: 'साथी की कुंडली की गणना नहीं हो सकी। विवरण जाँचें और सूची से शहर चुनें।',
      score: 'गुण मिलान', excellent: 'उत्तम मिलान', good: 'अच्छा मिलान', average: 'सामान्य मिलान — अधिकांश परंपराओं में स्वीकार्य', low: 'कम मिलान — आमतौर पर अनुशंसित नहीं',
      nadiDosha: 'नाड़ी दोष: दोनों की नाड़ी एक ही है।', bhakootDosha: 'भकूट दोष: दोनों की चंद्र राशियाँ एक-दूसरे से कठिन स्थिति में हैं।',
      details: 'सभी 8 कूट देखें',
      kootas: { varna: 'वर्ण (स्वभाव)', vashya: 'वश्य (आकर्षण)', tara: 'तारा (भाग्य)', yoni: 'योनि (घनिष्ठता)', maitri: 'ग्रह मैत्री (मित्रता)', gana: 'गण (प्रकृति)', bhakoot: 'भकूट (परिवार और धन)', nadi: 'नाड़ी (स्वास्थ्य और संतान)' },
      manglik: 'मांगलिक (कुज दोष)', you: 'आप', partner: 'साथी', yes: 'हाँ', no: 'नहीं',
      manglikBoth: 'दोनों मांगलिक हैं — परंपरा में यह दोष कट जाता है।', manglikOne: 'केवल एक मांगलिक है — कई परिवार इसके लिए ज्योतिषी से परामर्श करते हैं।',
      note: 'ये पारंपरिक अष्टकूट नियम हैं, विशेषज्ञ समीक्षा नहीं हुई। इसे विवाह का निर्णय नहीं, केवल मार्गदर्शन मानें। किसी और का विवरण उनकी सहमति से ही दर्ज करें; यह इस डिवाइस पर सहेजा नहीं जाता।',
      error: 'गणना की गई कुंडली अधूरी है; मिलान नहीं किया गया।',
    },
  };
  // Kundli views, doshas and the Home tool cards.
  const TOOLS_COPY = {
    en: {
      views: { chart: 'Chart', planets: 'Planets', dasha: 'Dasha', doshas: 'Doshas', panchang: 'Panchang' },
      kujaTitle: 'Kuja dosha (Manglik)', kujaYes: 'Present', kujaNo: 'Not present', kujaWhy: 'Mars is in house {lagna} from the Lagna and house {moon} from the Moon.',
      kujaReduced: 'Mars is in its own or exalted sign, which traditionally reduces the effect.',
      sadeTitle: 'Sade Sati', phase1: 'Running now — phase 1 of 3 (beginning)', phase2: 'Running now — phase 2 of 3 (peak)', phase3: 'Running now — phase 3 of 3 (ending)',
      sadeNo: 'Not running now.', period: '{start} to {end}', sadeNext: 'Next Sade Sati: {start} to {end}', now: 'now',
      ashtama: 'Ashtama Shani (Saturn 8th from your Moon) is running until {end}.', ardhashtama: 'Ardhashtama Shani (Saturn 4th from your Moon) is running until {end}.',
      doshaNote: 'Conventional rules, not expert-reviewed. Dates are approximate.', doshaUnavailable: 'Dosha details are not available for this chart.',
      tools: { match: ['Kundli matching', 'Guna Milan out of 36'], doshas: ['Doshas', 'Kuja dosha & Sade Sati'], dasha: ['Dasha periods', 'Which planet’s period you are in'], rashi: ['Rashiphal', 'Day, week, month'], chat: ['Ask AI', 'Questions about your life'] },
    },
    te: {
      views: { chart: 'చక్రం', planets: 'గ్రహాలు', dasha: 'దశ', doshas: 'దోషాలు', panchang: 'పంచాంగం' },
      kujaTitle: 'కుజ దోషం', kujaYes: 'ఉంది', kujaNo: 'లేదు', kujaWhy: 'కుజుడు లగ్నం నుండి {lagna}వ ఇంట్లో, చంద్రుని నుండి {moon}వ ఇంట్లో ఉన్నాడు.',
      kujaReduced: 'కుజుడు స్వక్షేత్రం లేదా ఉచ్చలో ఉన్నందున దోష ప్రభావం తగ్గుతుందని సంప్రదాయం.',
      sadeTitle: 'ఏలినాటి శని', phase1: 'ఇప్పుడు నడుస్తోంది — మొదటి దశ (ప్రారంభం)', phase2: 'ఇప్పుడు నడుస్తోంది — రెండవ దశ (తీవ్ర దశ)', phase3: 'ఇప్పుడు నడుస్తోంది — మూడవ దశ (ముగింపు)',
      sadeNo: 'ఇప్పుడు నడవడం లేదు.', period: '{start} నుండి {end} వరకు', sadeNext: 'తదుపరి ఏలినాటి శని: {start} నుండి {end} వరకు', now: 'ఇప్పుడు',
      ashtama: 'అష్టమ శని (చంద్రుని నుండి 8వ ఇంట్లో శని) {end} వరకు నడుస్తోంది.', ardhashtama: 'అర్ధాష్టమ శని (చంద్రుని నుండి 4వ ఇంట్లో శని) {end} వరకు నడుస్తోంది.',
      doshaNote: 'సంప్రదాయ నియమాలు, నిపుణుల సమీక్ష పొందలేదు. తేదీలు సుమారుగా.', doshaUnavailable: 'ఈ జాతకానికి దోష వివరాలు అందుబాటులో లేవు.',
      tools: { match: ['జాతక పొంతన', 'గుణ మేళనం 36కి'], doshas: ['దోషాలు', 'కుజ దోషం, ఏలినాటి శని'], dasha: ['దశలు', 'ఇప్పుడు ఏ గ్రహ దశ నడుస్తోంది'], rashi: ['రాశి ఫలాలు', 'రోజు, వారం, నెల'], chat: ['AIని అడగండి', 'మీ జీవితం గురించి ప్రశ్నలు'] },
    },
    hi: {
      views: { chart: 'चक्र', planets: 'ग्रह', dasha: 'दशा', doshas: 'दोष', panchang: 'पंचांग' },
      kujaTitle: 'मांगलिक (कुज दोष)', kujaYes: 'है', kujaNo: 'नहीं है', kujaWhy: 'मंगल लग्न से {lagna}वें भाव में और चंद्र से {moon}वें भाव में है।',
      kujaReduced: 'मंगल स्वराशि या उच्च का है; परंपरा के अनुसार इससे दोष का प्रभाव घटता है।',
      sadeTitle: 'साढ़ेसाती', phase1: 'अभी चल रही है — पहला चरण (आरंभ)', phase2: 'अभी चल रही है — दूसरा चरण (चरम)', phase3: 'अभी चल रही है — तीसरा चरण (अंत)',
      sadeNo: 'अभी नहीं चल रही।', period: '{start} से {end} तक', sadeNext: 'अगली साढ़ेसाती: {start} से {end} तक', now: 'अभी',
      ashtama: 'अष्टम शनि (चंद्र से 8वें भाव में शनि) {end} तक चल रहा है।', ardhashtama: 'ढैया (चंद्र से चौथे भाव में शनि) {end} तक चल रही है।',
      doshaNote: 'पारंपरिक नियम, विशेषज्ञ समीक्षा नहीं। तिथियाँ अनुमानित हैं।', doshaUnavailable: 'इस कुंडली के लिए दोष विवरण उपलब्ध नहीं है।',
      tools: { match: ['कुंडली मिलान', '36 में से गुण'], doshas: ['दोष', 'मांगलिक और साढ़ेसाती'], dasha: ['दशा', 'अभी किस ग्रह की दशा है'], rashi: ['राशिफल', 'दिन, सप्ताह, महीना'], chat: ['AI से पूछें', 'जीवन के बारे में प्रश्न'] },
    },
  };
  const loveText = () => RELATIONSHIP_COPY[state.lang] || RELATIONSHIP_COPY.en;
  const toolText = () => TOOLS_COPY[state.lang] || TOOLS_COPY.en;
  const fill = (text, values) => Object.entries(values).reduce((out, [key, value]) => out.replace(`{${key}}`, value), text);
  // "2028-02" -> "February 2028" in the chosen language; null (beyond the scanned years) -> "—".
  const monthText = value => (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
    ? calendarUI.monthTitle(Number(value.slice(0, 4)), Number(value.slice(5, 7)), state.lang) : '—');

  function optionCard(icon, title, sub, onClick, active) {
    const card = el('button', `option-card${active ? ' on' : ''}`);
    card.type = 'button';
    card.append(el('span', 'option-icon', icon), el('b', null, title), el('small', null, sub));
    card.setAttribute('aria-pressed', active ? 'true' : 'false');
    card.addEventListener('click', onClick);
    return card;
  }
  function renderRelationship() {
    const copy = loveText();
    for (const [id, key] of [['relationship-nav', 'nav'], ['relationship-eyebrow', 'eyebrow'], ['relationship-title', 'title'],
      ['relationship-intro', 'intro'], ['relationship-reading', 'optReading'], ['relationship-compare-title', 'compare'],
      ['relationship-submit', 'submit'], ['relationship-note', 'note'], ['partner-role-label', 'iAm']]) $(id).textContent = copy[key];
    const mode = state.loveMode;
    $('love-options').replaceChildren(
      optionCard('💞', copy.optMatch, copy.optMatchSub, () => { state.loveMode = 'match'; renderRelationship(); }, mode === 'match'),
      optionCard('💗', copy.optReading, copy.optReadingSub, () => { state.loveMode = 'reading'; state.showLoveReading = true; renderRelationship(); }, mode === 'reading'));
    $('love-match').hidden = mode !== 'match';
    $('love-reading').hidden = mode !== 'reading';
    if ($('partner-role').querySelectorAll) $('partner-role').querySelectorAll('button').forEach(button => {
      button.textContent = copy[button.dataset.role]; button.classList.toggle('on', button.dataset.role === state.myRole);
    });
    $('relationship-reading').disabled = !state.chart;
    if (!state.chart && mode) $('relationship-status').textContent = copy.needChart;
    const reading = $('relationship-reading-result'); reading.replaceChildren();
    if (mode === 'reading' && !state.chart) reading.appendChild(el('p', 'muted-note', copy.needChart));
    if (state.chart && state.showLoveReading) {
      try {
        const lines = chartUI.readLife(state.chart, state.details, 'marriage', state.lang, null);
        for (const line of lines) reading.appendChild(el('p', null, line));
      } catch (_error) { reading.appendChild(el('p', null, copy.error)); }
    }
    const result = $('relationship-result'); result.replaceChildren();
    if (!state.chart || !state.partnerChart) return;
    try {
      const mine = state.chart.positions.Moon.sidereal_longitude, theirs = state.partnerChart.positions.Moon.sidereal_longitude;
      const match = state.myRole === 'bride' ? matchUI.gunaMilan(theirs, mine) : matchUI.gunaMilan(mine, theirs);
      const score = el('div', `relationship-score match-${match.verdict}`);
      score.append(el('span', null, copy.score), el('strong', null, `${match.total} / ${match.max}`));
      const bar = el('progress'); bar.max = match.max; bar.value = match.total;
      bar.setAttribute('aria-label', copy.score); score.appendChild(bar);
      score.appendChild(el('small', null, copy[match.verdict]));
      result.appendChild(score);
      for (const [flag, key] of [[match.nadiDosha, 'nadiDosha'], [match.bhakootDosha, 'bhakootDosha']]) if (flag) result.appendChild(el('p', 'dosha-flag', copy[key]));
      const kuja = details => details && details.doshas && details.doshas.kuja ? details.doshas.kuja.present : null;
      const me = kuja(state.details), them = kuja(state.partnerDetails);
      if (me !== null && them !== null) {
        const box = el('div', 'manglik-row');
        box.append(el('b', null, copy.manglik), el('span', null, `${copy.you}: ${me ? copy.yes : copy.no} · ${copy.partner}: ${them ? copy.yes : copy.no}`));
        if (me && them) box.appendChild(el('small', null, copy.manglikBoth)); else if (me || them) box.appendChild(el('small', null, copy.manglikOne));
        result.appendChild(box);
      }
      const fold = el('details', 'fold');
      fold.appendChild(el('summary', null, copy.details));
      const list = el('ul', 'koota-list');
      for (const koota of match.kootas) {
        const item = el('li', koota.points === 0 ? 'zero' : '');
        item.append(el('span', null, copy.kootas[koota.key]), el('b', null, `${koota.points} / ${koota.max}`));
        list.appendChild(item);
      }
      fold.appendChild(list); result.appendChild(fold);
    } catch (_error) { result.appendChild(el('p', null, copy.error)); }
  }
  $('relationship-reading').addEventListener('click', () => { state.showLoveReading = true; renderRelationship(); });
  if ($('partner-role').querySelectorAll) $('partner-role').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    state.myRole = button.dataset.role; renderRelationship();
  }));
  $('relationship-form').addEventListener('submit', async event => {
    event.preventDefault();
    const copy = loveText();
    if (!state.chart) { $('relationship-status').textContent = copy.needChart; return; }
    const input = { dob: $('partner-dob').value, pob: $('partner-pob').value.trim(), tob: $('partner-tob').value };
    const ownChart = state.chart;
    state.partnerChart = null; state.partnerDetails = null; $('relationship-result').replaceChildren();
    $('relationship-status').textContent = copy.calculating;
    $('relationship-submit').disabled = true;
    try {
      const { ok, body } = await post('/api/birth-chart', input);
      if (state.chart !== ownChart) return;
      if (!ok || !body || !body.chart || !body.chart.positions || !body.chart.positions.Moon) throw new Error('Second chart unavailable');
      state.partnerChart = body.chart; state.partnerDetails = body.details || null;
      $('relationship-status').textContent = '';
      renderRelationship();
    } catch (_error) { if (state.chart === ownChart) $('relationship-status').textContent = copy.failed; }
    finally { $('relationship-submit').disabled = false; }
  });

  /* ---- Kundli: one view at a time (chart, planets, dasha, doshas, birth Panchang) ---- */
  const KUNDLI_VIEWS = ['chart', 'planets', 'dasha', 'doshas', 'panchang'];
  function showKundliView(name) {
    state.kundliView = KUNDLI_VIEWS.includes(name) ? name : 'chart';
    const copy = toolText();
    $('kundli-views').replaceChildren(...KUNDLI_VIEWS.map(view => {
      const button = el('button', view === state.kundliView ? 'on' : '', copy.views[view]);
      button.type = 'button'; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', view === state.kundliView ? 'true' : 'false');
      button.addEventListener('click', () => showKundliView(view));
      return button;
    }));
    const chartCard = $('chart');
    const panes = chartCard.querySelectorAll ? chartCard.querySelectorAll('.kview') : [];
    panes.forEach(pane => { pane.hidden = pane.dataset.kview !== state.kundliView; });
  }
  function renderDoshas() {
    const copy = toolText(), host = $('dosha-body'); host.replaceChildren();
    const doshas = state.details && state.details.doshas;
    if (!doshas) { host.appendChild(el('p', 'muted-note', copy.doshaUnavailable)); return; }
    const card = (title, status, good, lines) => {
      const box = el('div', `dosha-card ${good ? 'ok' : 'warn'}`);
      const head = el('div', 'dosha-head'); head.append(el('b', null, title), el('span', 'dosha-status', status));
      box.appendChild(head);
      for (const line of lines) if (line) box.appendChild(el('p', null, line));
      return box;
    };
    const kuja = doshas.kuja;
    if (kuja) host.appendChild(card(copy.kujaTitle, kuja.present ? copy.kujaYes : copy.kujaNo, !kuja.present,
      [fill(copy.kujaWhy, { lagna: kuja.house_from_lagna, moon: kuja.house_from_moon }), kuja.reduced ? copy.kujaReduced : '']));
    const saturn = doshas.saturn;
    if (saturn && saturn.sade_sati) {
      const sade = saturn.sade_sati;
      const span = item => item ? fill(copy.period, { start: monthText(item.start), end: monthText(item.end) }) : '';
      const lines = sade.active ? [span(sade.current)] : [sade.next ? fill(copy.sadeNext, { start: monthText(sade.next.start), end: monthText(sade.next.end) }) : ''];
      for (const [key, item] of [['ashtama', saturn.ashtama_shani], ['ardhashtama', saturn.ardhashtama_shani]]) {
        if (item && item.active) lines.push(fill(copy[key], { end: monthText(item.current && item.current.end) }));
      }
      host.appendChild(card(copy.sadeTitle, sade.active ? copy[`phase${sade.phase}`] || copy.phase2 : copy.sadeNo, !sade.active, lines));
    }
    host.appendChild(el('p', 'muted-note', copy.doshaNote));
  }
  // Home: a few clear choices instead of a long page.
  function renderTools() {
    const copy = toolText().tools;
    const open = (page, view) => () => {
      if (page === 'relationship') { state.loveMode = 'match'; renderRelationship(); }
      showPage(page);
      if (view) {
        showKundliView(view);
        // With a chart already made, jump straight to the chosen view instead of the birth form.
        if (state.chart) { try { $('kundli-views').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } catch (_error) { /* scrolling is optional */ } }
      }
    };
    $('tool-grid').replaceChildren(
      optionCard('💞', copy.match[0], copy.match[1], open('relationship')),
      optionCard('🪐', copy.doshas[0], copy.doshas[1], open('kundli', 'doshas')),
      optionCard('⏳', copy.dasha[0], copy.dasha[1], open('kundli', 'dasha')),
      optionCard('🔮', copy.rashi[0], copy.rashi[1], open('rashi')),
      optionCard('💬', copy.chat[0], copy.chat[1], open('chat')));
  }

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
    renderTools();
    showKundliView(state.kundliView);
    renderRelationship();
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
    if (degrees) {
      // Full degree on roomy charts, whole degree on small ones (CSS picks one), so a sign box stays one line per planet.
      const small = el('small');
      small.append(el('span', 'deg-full', degreeText), el('span', 'deg-short', `${Math.floor(parseFloat(degreeText))}°`));
      chip.appendChild(small);
    }
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
      if (cell.planets.length >= 3) box.classList.add('crowded');
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
    renderDoshas();
    showKundliView(state.kundliView);
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
    if (!(await rewardedGate())) return;
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
    const doshas = d && d.doshas;
    if (doshas && doshas.kuja) facts.push(`Kuja dosha (Manglik): ${doshas.kuja.present ? 'yes' : 'no'} (Mars house ${doshas.kuja.house_from_lagna} from Lagna, ${doshas.kuja.house_from_moon} from Moon${doshas.kuja.reduced ? '; reduced, Mars in own/exalted sign' : ''})`);
    if (doshas && doshas.saturn && doshas.saturn.sade_sati) {
      const sade = doshas.saturn.sade_sati, span = item => item ? `${item.start || 'earlier'} to ${item.end || 'later'}` : 'unknown';
      facts.push(sade.active ? `Sade Sati: running now, phase ${sade.phase} of 3, ${span(sade.current)}` : `Sade Sati: not running now; next ${span(sade.next)}`);
      if (doshas.saturn.ashtama_shani.active) facts.push(`Ashtama Shani: running now until ${doshas.saturn.ashtama_shani.current.end || 'later'}`);
      if (doshas.saturn.ardhashtama_shani.active) facts.push(`Ardhashtama Shani: running now until ${doshas.saturn.ardhashtama_shani.current.end || 'later'}`);
    }
    if (d && d.dasha && d.dasha.current_mahadasha) {
      const sub = (d.dasha.antardasha || []).find(a => a.current);
      facts.push(`Current Vimshottari period: ${d.dasha.current_mahadasha} Mahadasha${sub ? `, ${sub.lord} Antardasha until ${sub.end}` : ''}`);
    }
    facts.push(`Today's date: ${new Date().toISOString().slice(0, 10)}`);
    // Only calculated labels leave the browser; unreviewed life-area readings do not.
    return facts;
  }
  // Native Android app only: a Google AdMob banner is drawn by the app below the page. The server switches it on and off.
  function setAdHeight(pixels) {
    const height = Number.isFinite(pixels) && pixels > 0 ? Math.min(Math.round(pixels), 200) : 0;
    document.documentElement.style.setProperty('--ad-height', `${height}px`);
  }
  const adUnitOk = id => /^ca-app-pub-\d{16}\/\d{10}$/.test(id || '');
  // Rewarded ad before a Kundli is generated. Resolves true when the user may go ahead: they watched the ad, are inside
  // the free window after a recent ad, or the ad could not be shown (an ad problem never blocks the user).
  function rewardedGate() {
    const { config } = appAds;
    if (!config || config.rewarded_kundli !== true || Date.now() < appAds.freeUntil) return Promise.resolve(true);
    return watchRewardedAd(t('watchAdPrompt'), true);
  }
  // Asks, plays the ad, and resolves true once the user may go ahead (reward earned, or the ad itself was unavailable).
  function watchRewardedAd(promptText, startsFreeWindow) {
    const { config, admob } = appAds;
    if (!config || !admob || !adUnitOk(config.rewarded_id)) return Promise.resolve(true);
    if (!window.confirm || !window.confirm(promptText)) return Promise.resolve(false);
    return new Promise(resolve => {
      let earned = false, settled = false;
      const handles = [];
      const finish = result => { if (settled) return; settled = true; handles.forEach(h => { try { h.remove(); } catch (_error) { /* gone */ } }); resolve(result); };
      const listen = (name, handler) => { try { const h = admob.addListener(name, handler); if (h && h.then) h.then(x => handles.push(x)); else if (h) handles.push(h); } catch (_error) { /* optional */ } };
      listen('onRewardedVideoAdReward', () => { earned = true; if (startsFreeWindow) appAds.freeUntil = Date.now() + (config.rewarded_free_minutes || 10) * 60000; });
      listen('onRewardedVideoAdDismissed', () => finish(earned));
      listen('onRewardedVideoAdFailedToLoad', () => finish(true));
      listen('onRewardedVideoAdFailedToShow', () => finish(true));
      Promise.resolve(admob.prepareRewardVideoAd({ adId: config.rewarded_id, isTesting: config.testing === true }))
        .then(() => admob.showRewardVideoAd())
        .then(() => { if (earned) finish(true); })
        .catch(() => finish(true));
    });
  }
  // AI chat allowance: a few free AI questions a day, then a rewarded ad buys more. Rule-based answers are always free.
  const QUOTA_KEY = 'jyotisha.chatquota.v1';
  function readQuota() {
    const today = localIso(new Date());
    try {
      const saved = JSON.parse(window.localStorage.getItem(QUOTA_KEY));
      if (saved && saved.date === today && Number.isInteger(saved.used) && Number.isInteger(saved.bonus)) return saved;
    } catch (_error) { /* start a fresh day */ }
    return { date: today, used: 0, bonus: 0 };
  }
  function writeQuota(quota) { try { window.localStorage.setItem(QUOTA_KEY, JSON.stringify(quota)); } catch (_error) { /* not persisted */ } }
  async function aiQuestionAllowed() {
    const { config, admob } = appAds;
    if (!config || !admob || !config.chat_free_questions || !adUnitOk(config.rewarded_id)) return true;   // browsers and unlimited setups
    const quota = readQuota();
    if (quota.used < config.chat_free_questions + quota.bonus) { quota.used += 1; writeQuota(quota); return true; }
    const prompt = t('chatLimitPrompt').replace('{free}', config.chat_free_questions).replace('{bonus}', config.chat_bonus_questions);
    if (!(await watchRewardedAd(prompt, false))) return false;
    quota.bonus += config.chat_bonus_questions; quota.used += 1; writeQuota(quota);
    return true;
  }
  // An occasional ad between screens: never in the first minute, at most one per few switches and per few minutes.
  function maybeInterstitial() {
    const { config, admob } = appAds;
    if (!config || !admob || !adUnitOk(config.interstitial_id)) return;
    appAds.switches += 1;
    const now = Date.now();
    if (now - appAds.started < 60000 || appAds.switches % (config.interstitial_every || 4) !== 0 || now - appAds.lastInterstitial < (config.interstitial_gap_seconds || 180) * 1000) return;
    appAds.lastInterstitial = now;
    Promise.resolve(admob.prepareInterstitial({ adId: config.interstitial_id, isTesting: config.testing === true }))
      .then(() => admob.showInterstitial()).catch(() => { /* no ad available: carry on */ });
  }
  async function startAppAds(config) {
    const admob = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
    if (!admob || !adUnitOk(config.banner_id)) return;
    appAds.config = config; appAds.admob = admob;
    try {
      await admob.initialize({ initializeForTesting: config.testing === true });
      try {
        const consent = await admob.requestConsentInfo();
        if (consent && consent.isConsentFormAvailable && consent.status === 'REQUIRED') await admob.showConsentForm();
      } catch (_error) { /* consent is only required in some regions */ }
      admob.addListener('bannerAdSizeChanged', size => setAdHeight(size && size.height));
      await admob.showBanner({ adId: config.banner_id, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: config.testing === true });
    } catch (_error) { setAdHeight(0); }
  }
  // Replies written by the AI can be reported by email (nothing is sent without the user).
  function addAiBar(entry, question, answer) {
    if (!state.contactEmail) return;
    const bar = el('div', 'ai-bar');
    const link = el('a', 'ai-report', t('reportAnswer'));
    const body = `Question:\n${question.slice(0, 300)}\n\nAnswer:\n${answer.slice(0, 1500)}\n\nWhat is wrong with it:\n`;
    link.href = `mailto:${state.contactEmail}?subject=${encodeURIComponent('Report an AI answer')}&body=${encodeURIComponent(body)}`;
    bar.appendChild(link);
    entry.appendChild(bar);
  }
  const history = [];   // recent turns sent to the assistant so the chat continues instead of restarting
  async function askAssistant(query) {
    const pending = el('div', 'chat-message assistant', '…'); chatLog.appendChild(pending); chatLog.scrollTop = chatLog.scrollHeight;
    try {
      const { ok, body } = await post('/api/ask', { question: query, language: state.lang, facts: chartFacts(), history: history.slice(-10) });
      if (ok && body && body.answer) { pending.textContent = body.answer; addAiBar(pending, query, body.answer); history.push({ role: 'user', text: query.slice(0, 300) }, { role: 'assistant', text: body.answer.slice(0, 1400) }); return true; }
    } catch (_error) { /* fall back to the offline answer */ }
    chatLog.removeChild(pending); return false;
  }
  /* ---- No chart yet: the chat asks for date, place and time of birth, then calculates the chart ---- */
  const intake = { step: 'dob', dob: '', pob: '', tob: '', pending: null };
  const stepPrompt = () => t(intake.step === 'dob' ? 'chatAskDob' : intake.step === 'pob' ? 'chatAskPob' : 'chatAskTob');
  function startIntake() { intake.step = 'dob'; intake.dob = ''; intake.pob = ''; intake.tob = ''; intake.pending = null; resetChat(t('chatAskDob')); }
  function applyChart(body, inputs) {
    state.chart = body.chart; state.details = body.details || null; state.resolved = body.resolved_birth || null;
    state.partnerChart = null; state.partnerDetails = null; state.showLoveReading = false; $('relationship-status').textContent = ''; renderRelationship();
    try {
      for (const [name, value] of Object.entries(inputs)) { const field = document.querySelector(`[name="${name}"]`); if (field) field.value = value; }
    } catch (_error) { /* the form is a convenience only */ }
    renderChart(); $('chart').hidden = false;
  }
  async function finishIntake() {
    if (!(await rewardedGate())) { intake.step = 'tob'; intake.tob = ''; addMessage('assistant', t('chatAskTob')); return; }
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
      void (async () => {
        if (!(await aiQuestionAllowed())) { askOffline(query); return; }   // out of free AI questions: the rule-based answer is still free
        if (!(await askAssistant(query))) askOffline(query);
      })();
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

  /* ------------------------------------------------------------ export / share */
  // Plain text that can be sent through the phone's share sheet (WhatsApp, e-mail, notes) or saved as a .txt file.
  const INLINE_TAGS = new Set(['span', 'b', 'strong', 'i', 'em', 'small', 'a', 'sup', 'sub']);
  const tagOf = node => String((node && (node.tagName || node.tag)) || '').toLowerCase();
  const squash = text => String(text || '').replace(/\s+/g, ' ').trim();
  function plainText(node) {
    if (!node) return '';
    const kids = Array.from(node.children || []);
    // Only elements inside (a tile, a table cell): keep a space between them. With loose text inside, textContent is right.
    const loneElements = kids.length > 0 && !(node.childNodes && node.childNodes.length !== kids.length);
    if (loneElements) return squash(kids.map(plainText).join(' '));
    const own = node.textContent;
    if (own) return squash(own);
    return squash(kids.map(plainText).join(' '));
  }
  function domToText(root) {
    const out = [];
    const walk = node => {
      const tag = tagOf(node);
      if (!tag || node.hidden || ['button', 'script', 'style', 'svg', 'select', 'input'].includes(tag)) return;
      const kids = Array.from(node.children || []);
      if (tag === 'tr') { const line = kids.map(plainText).filter(Boolean).join(' | '); if (line) out.push(line); return; }
      if (tag === 'li') { const line = plainText(node); if (line) out.push('• ' + line); return; }
      if (/^h[1-6]$/.test(tag) || tag === 'summary') { const line = kids.length ? squash(kids.map(plainText).join(' ')) : plainText(node); if (line) out.push('', line); return; }
      if (!kids.length || tag === 'p' || kids.every(kid => INLINE_TAGS.has(tagOf(kid)))) { const line = plainText(node); if (line) out.push(line); return; }
      kids.forEach(walk);
    };
    walk(root);
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // A message from the admin panel (announcement or maintenance), shown under the header.
  function showNotice(notice) {
    try {
      const old = document.getElementById('site-notice');
      if (old && old.remove) old.remove();
      const header = document.querySelector('.masthead');
      if (!notice || typeof notice.text !== 'string' || !notice.text || !header) return;
      const bar = el('div', `site-notice ${notice.kind === 'maintenance' ? 'maintenance' : ''}`, notice.text);
      bar.id = 'site-notice'; bar.setAttribute('role', 'status');
      if (typeof notice.link === 'string' && /^https:\/\//.test(notice.link)) {
        const link = el('a', null, ' →'); link.href = notice.link; link.target = '_blank'; link.rel = 'noopener noreferrer'; bar.appendChild(link);
      }
      header.insertAdjacentElement('afterend', bar);
    } catch (_error) { /* a notice is optional */ }
  }
  function showToast(message) {
    try {
      const toast = el('div', 'toast', message);
      toast.setAttribute('role', 'status');
      document.body.appendChild(toast);
      setTimeout(() => { try { toast.remove(); } catch (_error) { /* already gone */ } }, 3800);
    } catch (_error) { /* the message is a courtesy only */ }
  }
  async function copyToClipboard(text) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; } } catch (_error) { /* try the older way */ }
    try {
      const area = document.createElement('textarea');
      area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
      document.body.appendChild(area); area.select();
      const done = document.execCommand && document.execCommand('copy');
      area.remove();
      return done === true;
    } catch (_error) { return false; }
  }
  async function shareText(title, text) {
    const body = `${title}\n${'='.repeat(Math.min(title.length, 40))}\n\n${text}\n\n— Jyotisha AI · ${window.location && window.location.origin ? window.location.origin : ''}`;
    const native = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
    try {
      if (native && native.share) { await native.share({ title, text: body, dialogTitle: title }); return; }
      if (navigator.share) { await navigator.share({ title, text: body }); return; }
    } catch (error) { if (error && error.name === 'AbortError') return; /* otherwise copy it instead */ }
    // No share sheet (an older app version, or a desktop browser): copy the text so it can still be pasted anywhere.
    if (await copyToClipboard(body)) { showToast(t('exportCopied')); return; }
    try {
      const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = `${title.replace(/[^\w]+/g, '-').slice(0, 40) || 'jyotisha'}.txt`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (_error) { /* nothing more to try */ }
  }
  function chatText() {
    return Array.from(chatLog.children || []).map(message => {
      const who = String(message.className || '').includes('user') ? 'Q' : 'A';
      const body = domToText(message) || plainText(message);
      return body ? `${who}: ${body}` : '';
    }).filter(Boolean).join('\n\n');
  }
  function kundliText() {
    const parts = [$('chart-summary').textContent, domToText($('chart-stats')), $('chart-janma').textContent];
    const tables = [['detailsTitle', 'details-body'], ['birthPanchangTitle', 'birth-panchang'], ['mahadashaTitle', 'mahadasha-body'], ['antardasha', 'antardasha-body']];
    for (const [key, id] of tables) {
      const body = $(id), table = body && body.parentNode;
      const text = table ? domToText(table) : '';
      if (text) parts.push('', key === 'antardasha' ? $('antardasha-title').textContent : t(key), text);
    }
    return parts.filter(part => part !== undefined && part !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // PDF: shows only the text to print and opens the print dialog, whose "Save as PDF" makes the file.
  // Android app: a small native plugin (PdfPrint) opens that dialog; browsers use window.print().
  // A copy of what is on screen, ready to print: no buttons or ids, every card open.
  function cloneForPrint(node) {
    const copy = node.cloneNode(true);
    if (!copy.querySelectorAll) return copy;
    copy.querySelectorAll('button, .export-row, .export-chat').forEach(item => { try { item.remove(); } catch (_error) { /* gone */ } });
    copy.querySelectorAll('details').forEach(item => item.setAttribute('open', ''));
    copy.querySelectorAll('[id]').forEach(item => item.removeAttribute('id'));
    copy.removeAttribute('id'); copy.removeAttribute('hidden');
    return copy;
  }
  function printPdf(title, makeNode, fallbackText) {
    const root = document.createElement('div'); root.id = 'print-root';
    const sheet = el('div', 'pdf-sheet');
    sheet.append(el('h1', null, title), makeNode(), el('p', 'pdf-foot', `— Jyotisha AI · ${window.location && window.location.origin ? window.location.origin : ''}`));
    root.appendChild(sheet);
    document.body.appendChild(root); document.body.classList.add('printing');
    let finished = false;
    const finish = () => {
      if (finished) return; finished = true; clearTimeout(expiry);
      document.body.classList.remove('printing');
      try { root.remove(); } catch (_error) { /* already gone */ }
      try { document.removeEventListener('visibilitychange', onVisible); } catch (_error) { /* not attached */ }
    };
    // The print dialog hides the page while it is open; clean up when the user comes back (or after a few minutes).
    let wasHidden = false;
    function onVisible() { if (document.visibilityState === 'hidden') wasHidden = true; else if (wasHidden) finish(); }
    try { document.addEventListener('visibilitychange', onVisible); } catch (_error) { /* optional */ }
    const expiry = setTimeout(finish, 180000);
    if (expiry && expiry.unref) expiry.unref();   // never keeps a test or server process alive
    const nativePrint = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PdfPrint;
    const inApp = window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform();
    if (nativePrint && nativePrint.print) {
      setTimeout(() => { Promise.resolve(nativePrint.print({ title })).catch(() => { finish(); void shareText(title, fallbackText()); }); }, 400);
    } else if (inApp) {
      finish(); void shareText(title, fallbackText());     // an older app without the PDF plugin: share the text instead
    } else if (window.print) {
      try { window.addEventListener('afterprint', finish, { once: true }); } catch (_error) { /* optional */ }
      setTimeout(() => { try { window.print(); } catch (_error) { finish(); } }, 250);
    } else finish();
  }
  $('pdf-chat').addEventListener('click', () => printPdf(t('chartQuestion'), () => { const log = cloneForPrint(chatLog); log.className = 'chat-log print-chat'; return log; }, chatText));
  $('pdf-kundli').addEventListener('click', () => { if (state.chart) printPdf(t('eyebrowBirth'), () => cloneForPrint(buildJathakam()), kundliText); });
  $('pdf-rashi').addEventListener('click', () => {
    const heading = `${t('rashiphal')} · ${$('rashi-moon').textContent}`;
    printPdf(heading, () => cloneForPrint($('rashi-list')), () => domToText($('rashi-list')));
  });
  $('export-chat').addEventListener('click', () => { void shareText(`${t('chartQuestion')}`, chatText()); });
  $('export-kundli').addEventListener('click', () => { if (state.chart) void shareText(`${t('eyebrowBirth')}`, kundliText()); });
  $('export-rashi').addEventListener('click', () => { void shareText(`${t('rashiphal')} · ${$('rashi-moon').textContent}`, domToText($('rashi-list'))); });

  /* ----------------------------------------------------------------- start */
  // Installable app: the service worker keeps the shell available and shows a friendly page offline.
  try { if (navigator.serviceWorker) navigator.serviceWorker.register('/sw.js').catch(() => {}); } catch (_error) { /* not supported */ }
  fetch('/api/birth-readiness', { cache: 'no-store' }).then(response => response.json()).then(readiness => {
    $('availability').textContent = readiness.can_calculate ? '' : t('unavailable');
    $('birth-fields').disabled = !readiness.can_calculate;
    state.assistant = readiness.assistant_available === true;
    state.contactEmail = typeof readiness.contact_email === 'string' ? readiness.contact_email : '';
    showNotice(readiness.notice);
    if (readiness.app_ads && readiness.app_ads.enabled === true) void startAppAds(readiness.app_ads);
    // Ads are off unless the server was configured with an AdSense publisher id.
    // AdSense is a website program: it is not loaded inside the installed app / Play Store wrapper (use AdMob for native apps).
    const installedApp = (() => {
      try { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || /^android-app:/.test(document.referrer || ''); } catch (_error) { return false; }
    })();
    if (!installedApp && /^ca-pub-\d{10,20}$/.test(readiness.adsense_client || '')) {
      try {
        const ad = document.createElement('script');
        ad.async = true; ad.crossOrigin = 'anonymous';
        ad.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${readiness.adsense_client}`;
        document.head.appendChild(ad);
      } catch (_error) { /* ads are optional */ }
    }
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
    state.partnerChart = null; state.partnerDetails = null; state.showLoveReading = false;
    for (const id of ['partner-dob', 'partner-pob', 'partner-tob']) $(id).value = '';
    $('relationship-status').textContent = ''; renderRelationship();
    $('chart').hidden = true;
    setChatEnabled(true); startIntake();
  });
  $('availability').textContent = t('availabilityChecking');
})();
