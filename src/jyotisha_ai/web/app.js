/* Page controller: onboarding, Home (calendar + day Panchang), Kundli and Ask. No network except the local API. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const calendarUI = window.JyotishaCalendar;
  const names = window.JyotishaPanchangNames;
  const chartUI = window.JyotishaChart;
  const matchUI = window.matchUI;

  const state = {
    lang: 'en', city: '', onboarded: false, assistant: false, payments: null, rashiMode: 'day', contactEmail: '', week: null, weekLoading: null, weekCache: {}, useLocation: false, pendingLocation: false, todayIso: null, selectedDate: null,
    view: { year: 0, month: 0 }, month: null, day: null, dayRequest: 0, monthRequest: 0,
    chart: null, details: null, resolved: null, partnerChart: null, partnerDetails: null, firstChart: null, firstDetails: null, matchWho: 'me', showLoveReading: false, loveMode: null, myRole: 'groom', kundliView: 'chart', festivals: null, festivalsAll: false, kundli: { style: 'south', division: 'd1' },
    partnerPortrait: { status: 'idle', image: null },
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
    return { ok: response.ok, body, status: response.status };
  }
  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    let body = null;
    try { body = await response.json(); } catch (_error) { body = null; }
    return { ok: response.ok, body, status: response.status };
  }
  const localIso = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const shiftIso = (iso, days) => { const date = new Date(`${iso}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

  // Native-app ad state (stays empty in a browser); declared early because switching screens can ask it for an interstitial.
  const appAds = { config: null, admob: null, freeUntil: 0, switches: 0, lastInterstitial: 0, started: Date.now() };
  const bannerHold = new Set();   // reasons the bottom banner is hidden for right now ('chat', 'camera')
  /* ---------------------------------------------------------------- pages */
  const pages = {};
  // Feature pages show their own header (back, title, home, share) instead of the app bar.
  const FEATURE_PAGES = ['moon', 'tarot', 'palm', 'numbers', 'lifeguide', 'signmatch'];
  const pageHost = $('top');
  for (const name of ['home', 'calendar', 'kundli', 'relationship', 'chat', 'rashi', 'moon', 'tarot', 'palm', 'numbers', 'lifeguide', 'signmatch']) {
    const page = document.createElement('section');
    page.className = 'app-page'; page.id = `page-${name}`; page.hidden = true;
    pageHost.appendChild(page); pages[name] = page;
  }
  pages.home.append($('day-panchang'), $('legal'));
  pages.calendar.append($('festcal-title'), $('festivals'), $('month-card'));
  pages.kundli.append($('kundli'), $('chart'));
  pages.relationship.appendChild($('relationship'));
  pages.chat.appendChild($('chat'));
  pages.rashi.appendChild($('rashi'));
  pages.moon.appendChild($('moonsign'));
  pages.tarot.appendChild($('tarot'));
  pages.palm.appendChild($('palmread'));
  pages.numbers.appendChild($('numerology'));
  pages.lifeguide.appendChild($('lifeguide'));
  pages.signmatch.appendChild($('signmatch'));
  // Each page change is a step in the WebView's history, so the phone's Back button returns to the previous screen
  // (Capacitor goes back while there is history and only closes the app from the first screen).
  let currentPage = null;
  let replaceNext = false;   // a page opened from the side menu takes the menu's history step
  // The Android app's hardware Back button does not trust the WebView's own back/forward list (it can be unreliable
  // with a pushState-only single-page app on some devices); instead MainActivity calls window.__jyotishaBack(), which
  // pops this stack itself and is the only thing native Back relies on. The browser History API below is separate
  // and still drives the phone's gesture-nav / a desktop browser's own Back button.
  const navStack = [];
  function remember(page, replace) {
    try {
      if (!window.history || typeof window.history.pushState !== 'function') return;
      if (replace) window.history.replaceState({ page }, '', `#${page}`); else window.history.pushState({ page }, '', `#${page}`);
    } catch (_error) { /* history is optional */ }
  }
  window.__jyotishaBack = function () {
    if (!navStack.length) return false;
    showPage(navStack[navStack.length - 1], { back: true });
    return true;
  };
  if (typeof window.addEventListener === 'function') window.addEventListener('popstate', event => {
    const page = event && event.state && event.state.page;
    hideMenu(); menuHistory = false;                 // Back closes the side menu first
    if (page && page === currentPage) return;
    showPage(Object.hasOwn(pages, page) ? page : 'home', { back: true });
  });
  function showPage(name, how = {}) {
    const chosen = Object.hasOwn(pages, name) ? name : 'home';
    if (how.back) { if (navStack.length) navStack.pop(); }
    else if (chosen !== currentPage) { if (currentPage !== null) navStack.push(currentPage); remember(chosen, currentPage === null || replaceNext); }
    currentPage = chosen;
    for (const [key, page] of Object.entries(pages)) page.hidden = key !== chosen;
    if (typeof hideMenu === 'function' && $('side-menu')) hideMenu();
    document.querySelectorAll('.bottom-nav a').forEach(link => {
      const active = link.getAttribute('href') === `#${chosen}`;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
    if (document.body && document.body.classList) document.body.classList.toggle('page-chat', chosen === 'chat');
    if (document.body && document.body.classList) document.body.classList.toggle('page-feature', FEATURE_PAGES.includes(chosen));
    syncBanner(chosen);
    window.scrollTo(0, 0);
    if (!how.back) maybeInterstitial();   // no full-screen ad when going back
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
      optTraits: 'Your ideal partner', optTraitsSub: 'Relationship style from your 7th house and Venus',
      traitsIntro: 'A classical reading of relationship style from your chart — not a prediction of any specific person.',
      traitsHouse: 'Your 7th house of partnerships falls in {sign} (lord: {lord}), so you’re often drawn to someone {trait}.',
      traitsVenus: 'Venus, the planet of love in your chart, sits in {sign} — affection tends to feel {trait} for you.',
      traitsPortraitBtn: '✨ See an illustrated impression', traitsPortraitLoading: 'Painting an impression…',
      traitsPortraitOff: 'This has not been turned on yet.',
      traitsGenderLabel: 'Show me a partner who is a:', traitsGenderWoman: 'Woman', traitsGenderMan: 'Man',
      traitsPortraitAgainBtn: '🔄 Generate again',
      traitsPortraitUnavailable: 'Could not create the illustration right now. Please try again in a moment.',
      traitsAskInChat: '💬 Tell me your birth details in chat',
      traitsMakeKundliBtn: '✨ Make my Kundli',
      who: 'Check for', whoMe: 'Me & partner', whoOthers: 'Check others', boyTitle: 'Boy’s birth details', girlTitle: 'Girl’s birth details', needBoth: 'Fill in both the boy’s and the girl’s details.', failedFirst: 'The boy’s chart could not be calculated. Check the birth details and select a city from the list.', boy: 'Boy', girl: 'Girl', compare: 'Partner’s birth details', iAm: 'You are', groom: 'Groom', bride: 'Bride', submit: 'Check matching',
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
      optTraits: 'మీ ఆదర్శ భాగస్వామి', optTraitsSub: 'మీ 7వ ఇల్లు, శుక్రుడి ఆధారంగా సంబంధ శైలి',
      traitsIntro: 'ఇది మీ జాతకం ఆధారంగా సంప్రదాయ సంబంధ-శైలి విశ్లేషణ — ఏ ఒక్క వ్యక్తి గురించో అంచనా కాదు.',
      traitsHouse: 'మీ 7వ ఇల్లు (భాగస్వామ్యం) {sign}లో ఉంది (అధిపతి: {lord}), కాబట్టి మీరు తరచుగా {trait} వ్యక్తి వైపు ఆకర్షితులవుతారు.',
      traitsVenus: 'మీ జాతకంలో ప్రేమకు కారకుడైన శుక్రుడు {sign}లో ఉన్నాడు — మీకు ఆప్యాయత {trait}గా అనిపిస్తుంది.',
      traitsPortraitBtn: '✨ ఒక చిత్రీకరణను చూడండి', traitsPortraitLoading: 'చిత్రీకరణ గీస్తున్నాం…',
      traitsPortraitOff: 'ఇది ఇంకా ఆన్ చేయలేదు.',
      traitsGenderLabel: 'భాగస్వామి ఎలా ఉండాలో ఎంచుకోండి:', traitsGenderWoman: 'స్త్రీ', traitsGenderMan: 'పురుషుడు',
      traitsPortraitAgainBtn: '🔄 మళ్ళీ చిత్రీకరించండి',
      traitsPortraitUnavailable: 'ప్రస్తుతం చిత్రీకరణను రూపొందించలేకపోయాం. కాసేపాగి మళ్ళీ ప్రయత్నించండి.',
      traitsAskInChat: '💬 మీ జనన వివరాలను చాట్‌లో చెప్పండి',
      traitsMakeKundliBtn: '✨ నా జాతకం తయారు చేయండి',
      who: 'ఎవరి కోసం', whoMe: 'నేను & భాగస్వామి', whoOthers: 'ఇతరులను చూడండి', boyTitle: 'అబ్బాయి జనన వివరాలు', girlTitle: 'అమ్మాయి జనన వివరాలు', needBoth: 'అబ్బాయి, అమ్మాయి ఇద్దరి వివరాలు ఇవ్వండి.', failedFirst: 'అబ్బాయి జాతకం లెక్కించలేకపోయాం. జనన వివరాలు చూసి జాబితా నుండి నగరాన్ని ఎంచుకోండి.', boy: 'అబ్బాయి', girl: 'అమ్మాయి', compare: 'భాగస్వామి జనన వివరాలు', iAm: 'మీరు', groom: 'వరుడు', bride: 'వధువు', submit: 'పొంతన చూడండి',
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
      optTraits: 'आपका आदर्श साथी', optTraitsSub: 'आपके 7वें भाव और शुक्र से रिश्ते की शैली',
      traitsIntro: 'यह आपकी कुंडली पर आधारित पारंपरिक संबंध-शैली है — किसी खास व्यक्ति की भविष्यवाणी नहीं।',
      traitsHouse: 'आपका 7वां भाव (साझेदारी) {sign} में है (स्वामी: {lord}), इसलिए आप अक्सर ऐसे साथी की ओर आकर्षित होते हैं जो {trait} हो।',
      traitsVenus: 'आपकी कुंडली में प्रेम के कारक शुक्र {sign} में हैं — आपके लिए स्नेह {trait} जैसा महसूस होता है।',
      traitsPortraitBtn: '✨ एक चित्रांकन देखें', traitsPortraitLoading: 'चित्रांकन बनाया जा रहा है…',
      traitsPortraitOff: 'यह अभी चालू नहीं किया गया है।',
      traitsGenderLabel: 'साथी कैसा हो, चुनें:', traitsGenderWoman: 'महिला', traitsGenderMan: 'पुरुष',
      traitsPortraitAgainBtn: '🔄 फिर से बनाएँ',
      traitsPortraitUnavailable: 'अभी चित्रांकन नहीं बन सका। कृपया थोड़ी देर में फिर से कोशिश करें।',
      traitsAskInChat: '💬 चैट में अपना जन्म विवरण बताएँ',
      traitsMakeKundliBtn: '✨ मेरी कुंडली बनाएँ',
      who: 'किसके लिए', whoMe: 'मैं और साथी', whoOthers: 'दूसरों को देखें', boyTitle: 'लड़के का जन्म विवरण', girlTitle: 'लड़की का जन्म विवरण', needBoth: 'लड़के और लड़की दोनों का विवरण भरें।', failedFirst: 'लड़के की कुंडली नहीं बन सकी। जन्म विवरण जाँचें और सूची से शहर चुनें।', boy: 'लड़का', girl: 'लड़की', compare: 'साथी का जन्म विवरण', iAm: 'आप हैं', groom: 'वर', bride: 'वधू', submit: 'मिलान देखें',
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
      todayLabel: 'Today for you', todayGood: 'Chandrabalam and Tarabalam are both favourable for you today — a good day for important work.',
      todayCare: 'The Moon is 8th from your Moon sign today (Ashtama Chandra) — go slow and avoid big decisions.',
      todayMixed: 'A mixed day for you — fine for routine work; take important steps with care.', todayQuiet: 'A quiet day for you — better for routine work than new beginnings.',
      askPlaceholder: 'Ask anything: career, marriage, money…', askButton: 'Ask', kundliCta: 'Get your free Kundli in 30 seconds →', needKundli: 'Create your Kundli to see',
      liveDasha: '{maha} – {antar} period now', liveDashaMaha: '{maha} period now', liveRashi: '{sign}: today’s reading', liveSade: 'Sade Sati: phase {p} of 3 running',
      liveDosha: 'Kuja dosha: {k} · Sade Sati: {s}', yes: 'Yes', no: 'No',
      jkAsk: 'Want to know your Jathakam?', jkSub: 'Your free Kundli — Lagna, Rashi, Nakshatra, planets, dasha and doshas — in 30 seconds.',
      jkCreate: 'Create my Kundli →', jkMine: 'My Jathakam', jkView: 'View full Kundli →', jkDasha: 'Dasha now',
      look: { title: 'Appearance', mode: 'Mode', mystic: 'Mystic', light: 'Light', dark: 'Dark', auto: 'Auto', colour: 'Colour', done: 'Done',
        saffron: 'Saffron', teal: 'Teal', rose: 'Rose', blue: 'Blue', button: 'Change appearance' },
      notify: { title: 'Daily notifications', invite: 'Get today’s Panchang and how your day looks, every morning.', on: 'Turn on', later: 'Not now',
        time: 'Time', off: 'Turn off', enabled: 'On — every day at {time}', disabled: 'Off', denied: 'Notifications are blocked. Allow them for Jyotirmaya in your phone’s Settings, then try again.',
        muhurta: 'Good and bad muhurta alerts',
        evening: 'Evening question for you', eveningTime: 'Evening time',
        rahu: 'Rahu Kalam', fest: '🪔 {name} today', reopenTitle: '🌙 Your week ahead', reopenBody: 'Open Jyotirmaya to see this week’s Panchang.', },
      lunar: { year: '{s} samvatsara', month: '{m} masa', adhika: 'Adhika {m}' },
      cards: { good: 'Good times', panchang: 'Panchang', events: 'Auspicious muhurtas', bad: 'Inauspicious times', none: 'No auspicious muhurtas today',
        again: 'and', amrita: 'Amrita kalam', durmuhurtam: 'Durmuhurtam', marriage: 'Marriage', gruhapravesam: 'Housewarming', vehicle: 'Vehicle purchase',
        eventNote: 'A simple traditional check (tithi, nakshatra, weekday and month; avoids Rahu Kalam, Durmuhurtam and Varjyam). For a wedding or housewarming, confirm the exact muhurtam with your purohit.',
        share: 'Share today on WhatsApp', full: 'Full Panchang tables', swipe: 'Swipe for more →' },
      rashi: { pick: 'Choose your rashi', find: 'Find your rashi', mineButton: 'Show my rashi', mine: 'Yours', title: '{sign} rashiphal ({date})', more: '…more', less: 'Show less',
        ask: 'Ask AI about my day', askQ: 'How is today for my rashi {sign}? Please tell me from my chart.', full: 'See my full Jathakam', share: 'Share on WhatsApp',
        details: 'Planet-by-planet details', transitGood: 'Favourable', transitCare: 'Take care', jump: { transits: 'Planet transits', remedies: 'Remedies', full: 'Full Jathakam', ask: 'Ask AI' }, hint: 'Pick your rashi above to see today’s reading.',
        unlock: '▶ See today’s reading', unlockNote: 'Watch one short ad to open today’s Rashiphal for all signs.',
        luckyTitle: 'Lucky factors', luckyDay: 'Colour and direction: today, same for all rashis · Numbers: for your rashi', luckySign: 'Special for your rashi', colour: 'Colour', numbers: 'Numbers', direction: 'Direction',
        colours: { Sun: 'Orange, red', Moon: 'White, silver', Mars: 'Red, coral', Mercury: 'Green', Jupiter: 'Yellow, gold', Venus: 'White, pink', Saturn: 'Blue, black', Rahu: 'Grey', Ketu: 'Brown' },
        directions: { Sun: 'East', Moon: 'North-west', Mars: 'South', Mercury: 'North', Jupiter: 'North-east', Venus: 'South-east', Saturn: 'West', Rahu: 'South-west', Ketu: 'North-west' } },
      detailTitle: 'Panchang in detail', festTitle: 'Upcoming festivals', festToday: 'Today', festTomorrow: 'Tomorrow', festIn: 'in {n} days',
      festMore: 'Show more festivals', festLess: 'Show fewer', festNone: 'No festivals in the next few months.', festLoading: 'Loading festivals…',
      shortcuts: { title: 'Your stars, one tap from here', text: 'Choose a reading to start.', labels: ['Palm', 'Rashiphal', 'Tarot', 'Match'], channel: 'Shortcuts', toggle: 'Shortcuts in the notification bar' },
      lifeguide: { card: ['Life Guide', 'Your daily balance: love, work, money'], title: 'Life Guide', tabs: ['Yesterday', 'Today', 'Tomorrow', 'This month', 'This year'],
        balance: ['Yesterday’s balance', 'Today’s balance', 'Tomorrow’s balance', 'This month’s balance', 'This year’s balance'],
        areas: { love: 'Love', family: 'Family', marriage: 'Marriage', career: 'Career', wealth: 'Wealth', health: 'Health' }, byArea: 'By area', supported: 'Supported by {planets}',
        yourSign: 'Your sign', change: 'Change', pick: 'Check another sign', pickFirst: 'Pick your sign to see your balance.', loading: 'Working out your balance…', failed: 'Could not load right now. Please try again.',
        personal: 'Personal to your chart: birth star {star}', dashaLine: 'dasha {lords}', general: 'General for this sign. Create your Kundli for a Life Guide that is personal to you.', tara: 'Your star today: {tara}',
        taraNames: ['Janma', 'Sampat', 'Vipat', 'Kshema', 'Pratyak', 'Sadhana', 'Naidhana', 'Mitra', 'Parama Mitra'], taraEffect: ['needs care', 'neutral', 'supportive'],
        unlock: 'Tabs with the video icon open after one short ad, for this sign for the rest of the day.',
        note: 'Worked out from planet transits counted from the Moon sign. Guidance for reflection, not a prediction.',
        text: { love: ['Go gently. Listen more and avoid hasty words.', 'A steady stretch. Small, thoughtful gestures matter most.', 'Warmth comes easily. A good time to share your feelings.'],
          family: ['Misunderstandings can arise. Stay calm and give people space.', 'Ordinary and calm. Keep your routines and be patient.', 'Home feels supportive. Time with family refreshes you.'],
          marriage: ['Patience helps. Postpone big decisions and avoid arguments.', 'Steady. Shared routines keep things comfortable.', 'Understanding grows. A good time for honest, caring talk.'],
          career: ['Slow and demanding. Plan carefully and avoid risky moves.', 'Progress is steady. Focus on one task at a time.', 'Work moves well. A good time to take initiative.'],
          wealth: ['Be careful with spending. Avoid impulsive purchases or lending.', 'Balanced. Track your spending and stay practical.', 'Money matters look supportive. Good for planning and saving.'],
          health: ['Take it easy. Rest well, drink water and avoid overdoing things.', 'Fine overall. Keep to regular meals and rest.', 'Energy is good. Keep up exercise and sleep.'] } },
      signmatch: { card: ['Sign match', 'Match any two Moon signs'], title: 'Sign match', you: 'You', partner: 'Partner', choose: 'Choose a sign', tabs: ['My sign', 'Partner’s sign'], see: 'See our match',
        verdict: { excellent: 'Excellent match', good: 'Good match', average: 'Average match', low: 'Needs patience' },
        text: { excellent: 'Your signs get along naturally: easy understanding and a shared outlook.', good: 'A comfortable pairing, with a few differences to adjust to.', average: 'Some differences to work on. Patience and talking things through help.', low: 'Quite different natures. It can work with understanding and effort.' },
        friendship: 'Mind & friendship', family: 'Family & prosperity', dosha: 'The two signs sit in a difficult position from each other (Bhakoot dosha). Many families check this before a marriage.',
        full: 'Full 36-point Kundli matching', note: 'Based on the two Moon signs only. Guidance for reflection, not a prediction.', shareLine: '{a} + {b}: {percent}% sign match, {verdict}.' },
      numerology: { card: ['Numerology', 'Your numbers from name & birth date'], title: 'Numerology', intro: 'Your Moolank, Bhagyank and name number, worked out from your date of birth and name.',
        dob: 'Date of birth', name: 'Name (in English letters)', show: 'Show my numbers', bad: 'Please enter a valid date of birth.', change: 'Change',
        moolank: ['Moolank', 'Birth number · how you are'], bhagyank: ['Bhagyank', 'Destiny number · where life leads'], nameNum: ['Name number', 'How others see you'],
        noName: 'Type your name in English letters to see your name number.', planet: 'Planet', strengths: 'Strengths', care: 'Watch out for',
        harmonyGood: 'Your name number and Moolank are friendly: a good match.', harmonyNeutral: 'Your name number and Moolank are neutral to each other.',
        year: 'Your year {year}: number {n}', lucky: 'Lucky for you', luckyNumbers: 'Numbers', luckyDays: 'Days', luckyColours: 'Colours',
        askAi: 'Ask AI about my numbers', askQ: 'My numerology Moolank is {m} and Bhagyank is {b}. What do these numbers say about my career and relationships?', share: 'Share',
        note: 'Numerology is a traditional system for reflection, not a certainty.' },
      menu: { title: 'Menu', open: 'Open menu', close: 'Close menu', home: 'Home', panchang: 'Today’s Panchang', appearance: 'Appearance', privacy: 'Privacy and terms', back: 'Back', shareReading: 'Share', shareApp: 'Share app', rateApp: 'Rate app', funFact: 'FUN FACT', listen: 'Listen', chips: { palm: 'Read my palm', tarot: 'Pick tarot cards', lifeguide: 'My Life Guide', numbers: 'My numbers', signmatch: 'Match two signs' }, shareLine: 'Your Vedic astrologer in your pocket: Panchang, Kundli, Rashiphal, Palm and Tarot in your language.' },
      palm: { card: ['Palm reading', 'Scan your palm with the camera'], title: 'Palm Analysis', step: 'Step 1 · Pick a hand', left: 'Left palm', right: 'Right palm',
        tipsTitle: 'Tips for a clear scan', tips: ['Use soft, bright light', 'Hold your palm flat, fingers spread', 'Keep your full hand inside the frame'],
        scan: 'Scan', reading: 'Reading your palm…', notPalm: 'We could not see a palm clearly. Try again in bright light with your whole palm in the photo.',
        off: 'Palm reading is switched off right now.', failed: 'Could not read the palm right now. Please try again in a little while.',
        cam: { hint: 'Place your open palm inside the outline', dark: 'Too dark. Move to brighter light and press again.', gallery: 'Choose a photo', close: 'Close', snap: 'Take photo' }, tabs: ['Palm', 'Love', 'Career'], lines: { heart: 'Heart line', head: 'Head line', life: 'Life line', fate: 'Fate line', summary: 'Your palm says' },
        ready: 'Your palm photo is ready.', see: '▶ See my reading', again: 'Scan again', askAi: 'Ask AI about my palm', share: 'Share', privacy: 'Your photo is used only for this reading and is not saved.',
        askQ: 'My palm reading says: “{summary}” What should I focus on now?',
        rekhaNote: 'These lines are the AI’s best guess from your photo, shown as a guide — not an exact trace.' },
      tarot: { card: ['Tarot', 'Ask the cards about love, career, money…'], title: 'Tarot', ask: 'What do you want to ask the cards?',
        topics: { love: 'Love', career: 'Career', money: 'Money', health: 'Health', luck: 'Luck', family: 'Family' },
        pick: 'Pick 3 cards', picked: '{n} of 3 chosen', shuffle: 'Focus on your question, then pick three cards.',
        positions: ['Past', 'Present', 'Future'], reversed: 'Reversed', advice: 'Message for you', loading: 'Reading your cards…',
        see: '▶ See my reading', again: 'New reading', askAi: 'Ask AI about this', share: 'Share', fallbackAdvice: 'Take the message of the middle card to heart today, and move one small step at a time.',
        askQ: 'I drew {cards} in a {topic} tarot reading. What does it mean for me?' },
      moon: { card: ['Moon sign', 'Your Chandra rashi & nature'], title: 'Moon Sign', nakshatra: 'Nakshatra', pada: 'pada',
        approx: 'Approximate: add your birth time for an exact Moon sign.', need: 'Add your date of birth to see your Moon sign.', add: 'Add my birth details',
        pick: 'Explore any sign', loading: 'Reading the moon…', share: 'Share', report: 'Report', yours: 'Yours',
        sections: { emotional: 'Emotional nature', love: 'Love & family', career: 'Work & money', wellbeing: 'Wellbeing', remedy: 'Simple remedy' },
        nature: ['Bold and quick to act, you feel things honestly and need room to be yourself.', 'Steady and loyal, you love comfort and beauty and stay calm under pressure.',
          'Curious and quick-minded, you love conversation and need variety to feel alive.', 'Caring and sensitive, family means everything to you and your intuition is strong.',
          'Warm-hearted and generous, you shine when you lead and when your effort is seen.', 'Thoughtful and careful, you love to help and find calm in order and small routines.',
          'Gentle and fair-minded, you seek harmony and feel happiest in good company.', 'Intense and private, you love deeply, stay loyal and have strong willpower.',
          'Optimistic and honest, you love learning, travel and the big picture.', 'Practical and patient, you are responsible and quietly ambitious.',
          'Independent and thoughtful, you are a friendly mind who cares about people.', 'Dreamy and kind, you are compassionate, creative and naturally spiritual.'] },
      sections: { chart: 'Your chart', palm: 'Palm, tarot & numbers', love: 'Love & match', time: 'Time & festivals' }, daily: 'Daily',
      greet: { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good night', hello: 'Namaste 🙏' },
      aiEyebrow: 'AI astrologer', tryAsking: 'Try asking', persona: { hello: 'Namaste{name}! 🙏 I am Jyotirmaya, your astrologer. I can guide you on love, career, money, health and your days ahead.' }, panchangCard: ['Today’s Panchang', 'Tithi, Rahu Kalam & muhurtas'],
      tools: { jathakam: ['Jathakam', 'Your birth chart & predictions'], festivals: ['Festivals', 'Upcoming festivals & holidays'], match: ['Kundli matching', 'Guna Milan out of 36'], doshas: ['Doshas', 'Kuja dosha & Sade Sati'], dasha: ['Dasha periods', 'Which planet’s period you are in'], rashi: ['Rashiphal', 'Day, week, month'], chat: ['Ask AI', 'Questions about your life'] },
    },
    te: {
      views: { chart: 'చక్రం', planets: 'గ్రహాలు', dasha: 'దశ', doshas: 'దోషాలు', panchang: 'పంచాంగం' },
      kujaTitle: 'కుజ దోషం', kujaYes: 'ఉంది', kujaNo: 'లేదు', kujaWhy: 'కుజుడు లగ్నం నుండి {lagna}వ ఇంట్లో, చంద్రుని నుండి {moon}వ ఇంట్లో ఉన్నాడు.',
      kujaReduced: 'కుజుడు స్వక్షేత్రం లేదా ఉచ్చలో ఉన్నందున దోష ప్రభావం తగ్గుతుందని సంప్రదాయం.',
      sadeTitle: 'ఏలినాటి శని', phase1: 'ఇప్పుడు నడుస్తోంది — మొదటి దశ (ప్రారంభం)', phase2: 'ఇప్పుడు నడుస్తోంది — రెండవ దశ (తీవ్ర దశ)', phase3: 'ఇప్పుడు నడుస్తోంది — మూడవ దశ (ముగింపు)',
      sadeNo: 'ఇప్పుడు నడవడం లేదు.', period: '{start} నుండి {end} వరకు', sadeNext: 'తదుపరి ఏలినాటి శని: {start} నుండి {end} వరకు', now: 'ఇప్పుడు',
      ashtama: 'అష్టమ శని (చంద్రుని నుండి 8వ ఇంట్లో శని) {end} వరకు నడుస్తోంది.', ardhashtama: 'అర్ధాష్టమ శని (చంద్రుని నుండి 4వ ఇంట్లో శని) {end} వరకు నడుస్తోంది.',
      doshaNote: 'సంప్రదాయ నియమాలు, నిపుణుల సమీక్ష పొందలేదు. తేదీలు సుమారుగా.', doshaUnavailable: 'ఈ జాతకానికి దోష వివరాలు అందుబాటులో లేవు.',
      todayLabel: 'ఈ రోజు మీకు', todayGood: 'ఈ రోజు మీకు చంద్రబలం, తారాబలం రెండూ అనుకూలం — ముఖ్యమైన పనులకు మంచి రోజు.',
      todayCare: 'ఈ రోజు చంద్రుడు మీ రాశి నుండి 8వ స్థానంలో ఉన్నాడు (అష్టమ చంద్రుడు) — నెమ్మదిగా వెళ్ళండి, పెద్ద నిర్ణయాలు వాయిదా వేయండి.',
      todayMixed: 'ఈ రోజు మీకు మిశ్రమ ఫలితం — రోజువారీ పనులకు సరే; ముఖ్యమైన అడుగులు జాగ్రత్తగా వేయండి.', todayQuiet: 'ఈ రోజు మీకు నెమ్మదైన రోజు — కొత్త ప్రారంభాల కంటే రోజువారీ పనులకు మంచిది.',
      askPlaceholder: 'ఏదైనా అడగండి: ఉద్యోగం, పెళ్లి, డబ్బు…', askButton: 'అడగండి', kundliCta: 'మీ ఉచిత జాతకం 30 సెకన్లలో →', needKundli: 'చూడటానికి మీ జాతకం రూపొందించండి',
      liveDasha: 'ఇప్పుడు {maha} – {antar} దశ', liveDashaMaha: 'ఇప్పుడు {maha} దశ', liveRashi: '{sign}: ఈ రోజు ఫలం', liveSade: 'ఏలినాటి శని: {p}వ దశ నడుస్తోంది',
      liveDosha: 'కుజ దోషం: {k} · ఏలినాటి శని: {s}', yes: 'ఉంది', no: 'లేదు',
      jkAsk: 'మీ జాతకం తెలుసుకోవాలని ఉందా?', jkSub: 'మీ ఉచిత జాతకం — లగ్నం, రాశి, నక్షత్రం, గ్రహాలు, దశ, దోషాలు — 30 సెకన్లలో.',
      jkCreate: 'నా జాతకం చూపించు →', jkMine: 'నా జాతకం', jkView: 'పూర్తి జాతకం చూడండి →', jkDasha: 'ప్రస్తుత దశ',
      look: { title: 'రూపం', mode: 'మోడ్', mystic: 'మిస్టిక్', light: 'లైట్', dark: 'డార్క్', auto: 'ఆటో', colour: 'రంగు', done: 'సరే',
        saffron: 'కాషాయం', teal: 'పచ్చ', rose: 'గులాబీ', blue: 'నీలం', button: 'రూపం మార్చండి' },
      notify: { title: 'రోజువారీ నోటిఫికేషన్లు', invite: 'ప్రతి ఉదయం ఈ రోజు పంచాంగం, మీ రోజు ఎలా ఉంటుందో పొందండి.', on: 'ఆన్ చేయండి', later: 'తర్వాత',
        time: 'సమయం', off: 'ఆఫ్ చేయండి', enabled: 'ఆన్ — ప్రతి రోజు {time}కి', disabled: 'ఆఫ్', denied: 'నోటిఫికేషన్లు బ్లాక్ అయ్యాయి. ఫోన్ సెట్టింగ్స్‌లో Jyotirmayaకి అనుమతి ఇచ్చి మళ్ళీ ప్రయత్నించండి.',
        muhurta: 'శుభ / అశుభ ముహూర్తం హెచ్చరికలు',
        evening: 'సాయంత్రం మీ కోసం ఒక ప్రశ్న', eveningTime: 'సాయంత్రం సమయం',
        rahu: 'రాహు కాలం', fest: '🪔 ఈ రోజు {name}', reopenTitle: '🌙 ఈ వారం మీ కోసం', reopenBody: 'ఈ వారం పంచాంగం చూడటానికి Jyotirmaya తెరవండి.', },
      lunar: { year: 'శ్రీ {s} నామ సంవత్సరం', month: '{m} మాసం', adhika: 'అధిక {m}' },
      cards: { good: 'శుభ సమయాలు', panchang: 'పంచాంగం', events: 'శుభ ముహూర్తాలు', bad: 'అశుభ సమయాలు', none: 'ఈ రోజు శుభ ముహూర్తాలు లేవు',
        again: 'మరలా', amrita: 'అమృత కాలం', durmuhurtam: 'దుర్ముహూర్తం', marriage: 'వివాహం', gruhapravesam: 'గృహప్రవేశం', vehicle: 'వాహనం కొనుగోలు',
        eventNote: 'సాధారణ సంప్రదాయ పరిశీలన (తిథి, నక్షత్రం, వారం, మాసం; రాహు కాలం, దుర్ముహూర్తం, వర్జ్యం మినహా). పెళ్లి, గృహప్రవేశం వంటి వాటికి ఖచ్చితమైన ముహూర్తాన్ని మీ పురోహితుని ద్వారా నిర్ధారించుకోండి.',
        share: 'ఈ రోజు పంచాంగం WhatsAppలో షేర్ చేయండి', full: 'పూర్తి పంచాంగ పట్టికలు', swipe: 'మరిన్ని చూడటానికి స్వైప్ చేయండి →' },
      rashi: { pick: 'మీ రాశిని ఎంచుకోండి', find: 'మీ రాశి తెలుసుకోండి', mineButton: 'నా రాశి చూపించు', mine: 'మీది', title: '{sign} రాశి ఫలితాలు ({date})', more: '…మరింత', less: 'తక్కువ చూపు',
        ask: 'నా రోజు గురించి AIని అడగండి', askQ: 'ఈ రోజు నా రాశి {sign}కి ఎలా ఉంటుంది? నా జాతకం ప్రకారం చెప్పండి.', full: 'పూర్తి జాతకం తెలుసుకోండి', share: 'WhatsAppలో షేర్ చేయండి',
        details: 'గ్రహాల వారీగా వివరాలు', transitGood: 'అనుకూలం', transitCare: 'జాగ్రత్త', jump: { transits: 'గ్రహ సంచారం', remedies: 'పరిహారాలు', full: 'పూర్తి జాతకం', ask: 'AIని అడగండి' }, hint: 'ఈ రోజు ఫలితాలు చూడటానికి పైన మీ రాశిని ఎంచుకోండి.',
        unlock: '▶ నేటి రాశిఫలం చూడండి', unlockNote: 'ఒక చిన్న యాడ్ చూస్తే ఈరోజు అన్ని రాశుల ఫలాలు తెరుచుకుంటాయి.',
        luckyTitle: 'అదృష్ట సూచక అంశాలు', luckyDay: 'రంగు, దిక్కు: ఈరోజు అన్ని రాశులకు ఒకటే · సంఖ్యలు: మీ రాశికి', luckySign: 'మీ రాశికి ప్రత్యేకం', colour: 'రంగు', numbers: 'సంఖ్యలు', direction: 'దిక్కు',
        colours: { Sun: 'కాషాయం, ఎరుపు', Moon: 'తెలుపు, వెండి', Mars: 'ఎరుపు, పగడపు రంగు', Mercury: 'ఆకుపచ్చ', Jupiter: 'పసుపు, బంగారు', Venus: 'తెలుపు, గులాబీ', Saturn: 'నీలం, నలుపు', Rahu: 'బూడిద రంగు', Ketu: 'గోధుమ రంగు' },
        directions: { Sun: 'తూర్పు', Moon: 'వాయువ్యం', Mars: 'దక్షిణం', Mercury: 'ఉత్తరం', Jupiter: 'ఈశాన్యం', Venus: 'ఆగ్నేయం', Saturn: 'పశ్చిమం', Rahu: 'నైరుతి', Ketu: 'వాయువ్యం' } },
      detailTitle: 'వివరమైన పంచాంగం', festTitle: 'రాబోయే పండుగలు', festToday: 'ఈ రోజు', festTomorrow: 'రేపు', festIn: '{n} రోజుల్లో',
      festMore: 'మరిన్ని పండుగలు చూపు', festLess: 'తక్కువ చూపు', festNone: 'రాబోయే కొన్ని నెలల్లో పండుగలు లేవు.', festLoading: 'పండుగలు లోడ్ అవుతున్నాయి…',
      shortcuts: { title: 'మీ నక్షత్రాలు, ఒక్క టచ్‌లో', text: 'ఒక రీడింగ్ ఎంచుకోండి.', labels: ['అరచేయి', 'రాశిఫలం', 'టారో', 'పొంతన'], channel: 'షార్ట్‌కట్‌లు', toggle: 'నోటిఫికేషన్ బార్‌లో షార్ట్‌కట్‌లు' },
      lifeguide: { card: ['లైఫ్ గైడ్', 'మీ రోజువారీ సమతుల్యం: ప్రేమ, పని, డబ్బు'], title: 'లైఫ్ గైడ్', tabs: ['నిన్న', 'ఈ రోజు', 'రేపు', 'ఈ నెల', 'ఈ సంవత్సరం'],
        balance: ['నిన్నటి సమతుల్యం', 'నేటి సమతుల్యం', 'రేపటి సమతుల్యం', 'ఈ నెల సమతుల్యం', 'ఈ సంవత్సర సమతుల్యం'],
        areas: { love: 'ప్రేమ', family: 'కుటుంబం', marriage: 'వివాహం', career: 'ఉద్యోగం', wealth: 'ధనం', health: 'ఆరోగ్యం' }, byArea: 'అంశాల వారీగా', supported: '{planets} అనుకూలం',
        yourSign: 'మీ రాశి', change: 'మార్చండి', pick: 'మరో రాశి చూడండి', pickFirst: 'మీ సమతుల్యం చూడటానికి మీ రాశిని ఎంచుకోండి.', loading: 'మీ సమతుల్యం లెక్కిస్తున్నాం…', failed: 'ఇప్పుడు లోడ్ కాలేదు. దయచేసి మళ్లీ ప్రయత్నించండి.',
        personal: 'మీ జాతకానికి ప్రత్యేకం: జన్మ నక్షత్రం {star}', dashaLine: 'దశ {lords}', general: 'ఈ రాశికి సాధారణ ఫలితం. మీకు ప్రత్యేకమైన లైఫ్ గైడ్ కోసం మీ జాతకం సృష్టించండి.', tara: 'ఈ రోజు మీ తార: {tara}',
        taraNames: ['జన్మ', 'సంపత్', 'విపత్', 'క్షేమ', 'ప్రత్యక్', 'సాధన', 'నైధన', 'మిత్ర', 'పరమ మిత్ర'], taraEffect: ['జాగ్రత్త', 'సాధారణం', 'అనుకూలం'],
        unlock: 'వీడియో గుర్తు ఉన్న ట్యాబ్‌లు ఒక చిన్న ప్రకటన తర్వాత, ఈ రాశికి ఈ రోజంతా తెరుచుకుంటాయి.',
        note: 'చంద్ర రాశి నుంచి గ్రహ సంచారాల ఆధారంగా లెక్కించినది. ఆలోచనకు మార్గదర్శనం మాత్రమే, జోస్యం కాదు.',
        text: { love: ['నిదానంగా ఉండండి. ఎక్కువ వినండి, తొందరపడి మాట్లాడకండి.', 'నిలకడగా ఉంటుంది. చిన్న చిన్న శ్రద్ధలే ముఖ్యం.', 'ప్రేమ భావాలు సులభంగా పంచుకోగలరు. మనసులో మాట చెప్పడానికి మంచి సమయం.'],
          family: ['అపార్థాలు రావచ్చు. ప్రశాంతంగా ఉండి ఇతరులకు చోటివ్వండి.', 'సాధారణంగా, ప్రశాంతంగా ఉంటుంది. ఓపికగా దినచర్య పాటించండి.', 'ఇంట్లో సహకారం బాగుంటుంది. కుటుంబంతో గడపడం ఉత్సాహాన్నిస్తుంది.'],
          marriage: ['ఓపిక అవసరం. పెద్ద నిర్ణయాలు వాయిదా వేయండి, వాదనలు వద్దు.', 'నిలకడగా ఉంటుంది. కలిసి చేసే దినచర్యలు హాయినిస్తాయి.', 'అవగాహన పెరుగుతుంది. మనసు విప్పి మాట్లాడటానికి మంచి సమయం.'],
          career: ['నిదానంగా, కష్టంగా ఉండవచ్చు. జాగ్రత్తగా ప్రణాళిక వేసుకోండి, రిస్క్ వద్దు.', 'పురోగతి నిలకడగా ఉంటుంది. ఒక పనిపై దృష్టి పెట్టండి.', 'పనులు బాగా సాగుతాయి. చొరవ తీసుకోవడానికి మంచి సమయం.'],
          wealth: ['ఖర్చుల్లో జాగ్రత్త. తొందరపాటు కొనుగోళ్లు, అప్పులు ఇవ్వడం వద్దు.', 'సమతుల్యం. ఖర్చులు గమనించండి, ఆచరణాత్మకంగా ఉండండి.', 'ఆర్థిక విషయాలు అనుకూలం. ప్రణాళిక, పొదుపుకు మంచి సమయం.'],
          health: ['తేలికగా తీసుకోండి. బాగా విశ్రాంతి, నీళ్లు తాగండి, అతిగా శ్రమించకండి.', 'మొత్తంగా బాగుంది. సమయానికి భోజనం, విశ్రాంతి పాటించండి.', 'శక్తి బాగుంది. వ్యాయామం, నిద్ర కొనసాగించండి.'] } },
      signmatch: { card: ['రాశి పొంతన', 'ఏ రెండు చంద్ర రాశుల పొంతన అయినా'], title: 'రాశి పొంతన', you: 'మీరు', partner: 'భాగస్వామి', choose: 'రాశి ఎంచుకోండి', tabs: ['నా రాశి', 'భాగస్వామి రాశి'], see: 'మా పొంతన చూడండి',
        verdict: { excellent: 'అద్భుతమైన పొంతన', good: 'మంచి పొంతన', average: 'సగటు పొంతన', low: 'ఓపిక అవసరం' },
        text: { excellent: 'మీ రాశులు సహజంగా కలుస్తాయి: సులభమైన అవగాహన, ఒకేలాంటి దృక్పథం.', good: 'సౌకర్యవంతమైన జంట, కొన్ని తేడాలకు సర్దుకుపోవాలి.', average: 'కొన్ని తేడాలపై కృషి చేయాలి. ఓపిక, మాట్లాడుకోవడం సహాయపడతాయి.', low: 'స్వభావాలు చాలా భిన్నం. అవగాహన, కృషితో సాగవచ్చు.' },
        friendship: 'మనసు, స్నేహం', family: 'కుటుంబం, సంపద', dosha: 'రెండు రాశులు ఒకదానికొకటి కష్టమైన స్థానంలో ఉన్నాయి (భకూట దోషం). చాలా కుటుంబాలు పెళ్లికి ముందు దీన్ని చూస్తాయి.',
        full: 'పూర్తి 36 గుణాల జాతక పొంతన', note: 'రెండు చంద్ర రాశుల ఆధారంగా మాత్రమే. ఆలోచనకు మార్గదర్శనం, జోస్యం కాదు.', shareLine: '{a} + {b}: {percent}% రాశి పొంతన, {verdict}.' },
      numerology: { card: ['సంఖ్యా శాస్త్రం', 'పేరు, పుట్టిన తేదీ నుంచి మీ సంఖ్యలు'], title: 'సంఖ్యా శాస్త్రం', intro: 'మీ పుట్టిన తేదీ, పేరు ఆధారంగా మీ మూలాంకం, భాగ్యాంకం, నామ సంఖ్య.',
        dob: 'పుట్టిన తేదీ', name: 'పేరు (ఇంగ్లీష్ అక్షరాల్లో)', show: 'నా సంఖ్యలు చూపించు', bad: 'దయచేసి సరైన పుట్టిన తేదీ ఇవ్వండి.', change: 'మార్చండి',
        moolank: ['మూలాంకం', 'జన్మ సంఖ్య · మీ స్వభావం'], bhagyank: ['భాగ్యాంకం', 'అదృష్ట సంఖ్య · జీవిత మార్గం'], nameNum: ['నామ సంఖ్య', 'ఇతరులు మిమ్మల్ని ఎలా చూస్తారు'],
        noName: 'నామ సంఖ్య కోసం మీ పేరును ఇంగ్లీష్ అక్షరాల్లో టైప్ చేయండి.', planet: 'గ్రహం', strengths: 'బలాలు', care: 'జాగ్రత్త',
        harmonyGood: 'మీ నామ సంఖ్య, మూలాంకం మిత్ర సంఖ్యలు: మంచి పొంతన.', harmonyNeutral: 'మీ నామ సంఖ్య, మూలాంకం ఒకదానికొకటి సమం (తటస్థం).',
        year: 'మీ {year} సంవత్సరం: సంఖ్య {n}', lucky: 'మీకు అదృష్టం', luckyNumbers: 'సంఖ్యలు', luckyDays: 'రోజులు', luckyColours: 'రంగులు',
        askAi: 'నా సంఖ్యల గురించి AIని అడగండి', askQ: 'నా మూలాంకం {m}, భాగ్యాంకం {b}. ఈ సంఖ్యలు నా ఉద్యోగం, బంధాల గురించి ఏం చెబుతున్నాయి?', share: 'షేర్ చేయండి',
        note: 'సంఖ్యా శాస్త్రం ఆలోచనకు ఒక సంప్రదాయ మార్గం మాత్రమే, ఖచ్చితమైనది కాదు.' },
      menu: { title: 'మెనూ', open: 'మెనూ తెరవండి', close: 'మెనూ మూసివేయండి', home: 'హోమ్', panchang: 'నేటి పంచాంగం', appearance: 'రూపం', privacy: 'గోప్యత, నిబంధనలు', back: 'వెనుకకు', shareReading: 'షేర్', shareApp: 'యాప్ షేర్ చేయండి', rateApp: 'యాప్‌కు రేటింగ్ ఇవ్వండి', funFact: 'తెలుసా?', listen: 'వినండి', chips: { palm: 'నా అరచేతి రేఖలు', tarot: 'టారో కార్డులు', lifeguide: 'నా లైఫ్ గైడ్', numbers: 'నా సంఖ్యలు', signmatch: 'రాశి పొంతన' }, shareLine: 'మీ జేబులో మీ వైదిక జ్యోతిష్కుడు: పంచాంగం, జాతకం, రాశి ఫలాలు, హస్త రేఖలు, టారో మీ భాషలో.' },
      palm: { card: ['హస్త రేఖలు', 'కెమెరాతో మీ అరచేతిని స్కాన్ చేయండి'], title: 'హస్త రేఖా విశ్లేషణ', step: 'దశ 1 · చేయి ఎంచుకోండి', left: 'ఎడమ అరచేయి', right: 'కుడి అరచేయి',
        tipsTitle: 'స్పష్టమైన స్కాన్ కోసం', tips: ['మంచి వెలుతురులో తీయండి', 'అరచేయి చదునుగా, వేళ్లు విడదీసి ఉంచండి', 'పూర్తి చేయి ఫ్రేమ్‌లో ఉండాలి'],
        scan: 'స్కాన్', reading: 'మీ అరచేతిని చదువుతున్నాం…', notPalm: 'అరచేయి స్పష్టంగా కనిపించలేదు. మంచి వెలుతురులో పూర్తి అరచేయి కనిపించేలా మళ్ళీ ప్రయత్నించండి.',
        off: 'హస్త రేఖా పఠనం ప్రస్తుతం ఆపివేయబడింది.', failed: 'ఇప్పుడు చదవలేకపోయాం. కాసేపటి తర్వాత మళ్ళీ ప్రయత్నించండి.',
        cam: { hint: 'మీ తెరిచిన అరచేతిని అవుట్‌లైన్ లోపల ఉంచండి', dark: 'చాలా చీకటిగా ఉంది. ఎక్కువ వెలుతురులోకి వెళ్లి మళ్లీ నొక్కండి.', gallery: 'ఫోటో ఎంచుకోండి', close: 'మూసివేయండి', snap: 'ఫోటో తీయండి' }, tabs: ['హస్తం', 'ప్రేమ', 'ఉద్యోగం'], lines: { heart: 'హృదయ రేఖ', head: 'మస్తిష్క రేఖ', life: 'జీవన రేఖ', fate: 'భాగ్య రేఖ', summary: 'మీ అరచేయి చెప్పేది' },
        ready: 'మీ అరచేయి ఫోటో సిద్ధం.', see: '▶ నా రీడింగ్ చూడండి', again: 'మళ్ళీ స్కాన్', askAi: 'నా అరచేయి గురించి AIని అడగండి', share: 'షేర్', privacy: 'మీ ఫోటో ఈ ఒక్క పఠనానికే వాడబడుతుంది, సేవ్ చేయబడదు.',
        askQ: 'నా హస్త రేఖా పఠనం ఇలా చెప్పింది: “{summary}” ఇప్పుడు నేను దేనిపై దృష్టి పెట్టాలి?',
        rekhaNote: 'ఈ గీతలు మీ ఫోటో నుండి AI అంచనా వేసినవి, మార్గదర్శనం కోసం మాత్రమే — ఖచ్చితమైన రేఖలు కావు.' },
      tarot: { card: ['టారో', 'ప్రేమ, ఉద్యోగం, డబ్బు గురించి కార్డులను అడగండి'], title: 'టారో', ask: 'కార్డులను ఏమి అడగాలనుకుంటున్నారు?',
        topics: { love: 'ప్రేమ', career: 'ఉద్యోగం', money: 'డబ్బు', health: 'ఆరోగ్యం', luck: 'అదృష్టం', family: 'కుటుంబం' },
        pick: '3 కార్డులు ఎంచుకోండి', picked: '3లో {n} ఎంచుకున్నారు', shuffle: 'మీ ప్రశ్నపై మనసు నిలిపి, మూడు కార్డులు ఎంచుకోండి.',
        positions: ['గతం', 'వర్తమానం', 'భవిష్యత్తు'], reversed: 'తలకిందులు', advice: 'మీకో సందేశం', loading: 'మీ కార్డులు చదువుతున్నాం…',
        see: '▶ నా రీడింగ్ చూడండి', again: 'కొత్త రీడింగ్', askAi: 'దీని గురించి AIని అడగండి', share: 'షేర్', fallbackAdvice: 'మధ్య కార్డు సందేశాన్ని ఈరోజు గుర్తుంచుకోండి; ఒక్కో చిన్న అడుగు వేయండి.',
        askQ: '{topic} టారో రీడింగ్‌లో నాకు {cards} వచ్చాయి. దీని అర్థం ఏమిటి?' },
      moon: { card: ['చంద్ర రాశి', 'మీ చంద్ర రాశి & స్వభావం'], title: 'చంద్ర రాశి', nakshatra: 'నక్షత్రం', pada: 'పాదం',
        approx: 'సుమారుగా: ఖచ్చితమైన చంద్ర రాశి కోసం పుట్టిన సమయం ఇవ్వండి.', need: 'మీ చంద్ర రాశి చూడటానికి పుట్టిన తేదీ ఇవ్వండి.', add: 'పుట్టిన వివరాలు ఇవ్వండి',
        pick: 'ఏ రాశినైనా చూడండి', loading: 'చంద్రుడిని చదువుతున్నాం…', share: 'షేర్', report: 'రిపోర్ట్', yours: 'మీది',
        sections: { emotional: 'భావోద్వేగ స్వభావం', love: 'ప్రేమ & కుటుంబం', career: 'ఉద్యోగం & డబ్బు', wellbeing: 'ఆరోగ్యం & ప్రశాంతత', remedy: 'సులభ పరిహారం' },
        nature: ['ధైర్యంగా, వేగంగా ముందడుగు వేస్తారు; మనసులో ఉన్నది నిజాయితీగా చెప్తారు, స్వేచ్ఛ కావాలి.', 'స్థిరంగా, నమ్మకంగా ఉంటారు; సౌకర్యం, అందం ఇష్టం, ఒత్తిడిలోనూ ప్రశాంతంగా ఉంటారు.',
          'ఆసక్తి, చురుకైన బుద్ధి; మాట్లాడటం ఇష్టం, కొత్తదనం కావాలి.', 'ప్రేమగా, సున్నితంగా ఉంటారు; కుటుంబమే సర్వస్వం, అంతర్ దృష్టి బలంగా ఉంటుంది.',
          'మంచి మనసు, దాతృత్వం; నాయకత్వంలో, మీ కృషి గుర్తింపు పొందినప్పుడు వెలుగుతారు.', 'ఆలోచనాపరులు, జాగ్రత్తపరులు; సహాయం చేయడం ఇష్టం, క్రమశిక్షణలో ప్రశాంతత పొందుతారు.',
          'సౌమ్యంగా, న్యాయంగా ఉంటారు; సామరస్యం కోరుకుంటారు, మంచి సాంగత్యంలో ఆనందంగా ఉంటారు.', 'లోతైన భావాలు, గోప్యత; గాఢంగా ప్రేమిస్తారు, విధేయులు, సంకల్ప బలం ఎక్కువ.',
          'ఆశావాదులు, నిజాయితీపరులు; నేర్చుకోవడం, ప్రయాణాలు ఇష్టం.', 'ఆచరణాత్మకంగా, ఓపికగా ఉంటారు; బాధ్యతగా, నిశ్శబ్దంగా ఎదుగుతారు.',
          'స్వతంత్రులు, ఆలోచనాపరులు; స్నేహపూర్వకంగా, సమాజం గురించి ఆలోచిస్తారు.', 'కలలు కనే మనసు, దయ; కరుణ, సృజనాత్మకత, ఆధ్యాత్మికత సహజం.'] },
      sections: { chart: 'మీ జాతకం', palm: 'హస్త రేఖలు, టారో & సంఖ్యలు', love: 'ప్రేమ & పొంతన', time: 'కాలం & పండుగలు' }, daily: 'రోజువారీ',
      greet: { morning: 'శుభోదయం', afternoon: 'శుభ మధ్యాహ్నం', evening: 'శుభ సాయంత్రం', night: 'శుభ రాత్రి', hello: 'నమస్తే 🙏' },
      aiEyebrow: 'AI జ్యోతిష్కుడు', tryAsking: 'ఇలా అడగండి', persona: { hello: 'నమస్తే{name}! 🙏 నేను జ్యోతిర్మయ, మీ జ్యోతిష్కుడిని. ప్రేమ, ఉద్యోగం, డబ్బు, ఆరోగ్యం, రాబోయే రోజుల గురించి చెప్పగలను.' }, panchangCard: ['నేటి పంచాంగం', 'తిథి, రాహు కాలం, ముహూర్తాలు'],
      tools: { jathakam: ['జాతకం', 'మీ జన్మ కుండలి & ఫలితాలు'], festivals: ['పండుగలు', 'రాబోయే పండుగలు, సెలవులు'], match: ['జాతక పొంతన', 'గుణ మేళనం 36కి'], doshas: ['దోషాలు', 'కుజ దోషం, ఏలినాటి శని'], dasha: ['దశలు', 'ఇప్పుడు ఏ గ్రహ దశ నడుస్తోంది'], rashi: ['రాశి ఫలాలు', 'రోజు, వారం, నెల'], chat: ['AIని అడగండి', 'మీ జీవితం గురించి ప్రశ్నలు'] },
    },
    hi: {
      views: { chart: 'चक्र', planets: 'ग्रह', dasha: 'दशा', doshas: 'दोष', panchang: 'पंचांग' },
      kujaTitle: 'मांगलिक (कुज दोष)', kujaYes: 'है', kujaNo: 'नहीं है', kujaWhy: 'मंगल लग्न से {lagna}वें भाव में और चंद्र से {moon}वें भाव में है।',
      kujaReduced: 'मंगल स्वराशि या उच्च का है; परंपरा के अनुसार इससे दोष का प्रभाव घटता है।',
      sadeTitle: 'साढ़ेसाती', phase1: 'अभी चल रही है — पहला चरण (आरंभ)', phase2: 'अभी चल रही है — दूसरा चरण (चरम)', phase3: 'अभी चल रही है — तीसरा चरण (अंत)',
      sadeNo: 'अभी नहीं चल रही।', period: '{start} से {end} तक', sadeNext: 'अगली साढ़ेसाती: {start} से {end} तक', now: 'अभी',
      ashtama: 'अष्टम शनि (चंद्र से 8वें भाव में शनि) {end} तक चल रहा है।', ardhashtama: 'ढैया (चंद्र से चौथे भाव में शनि) {end} तक चल रही है।',
      doshaNote: 'पारंपरिक नियम, विशेषज्ञ समीक्षा नहीं। तिथियाँ अनुमानित हैं।', doshaUnavailable: 'इस कुंडली के लिए दोष विवरण उपलब्ध नहीं है।',
      todayLabel: 'आज आपके लिए', todayGood: 'आज आपके लिए चंद्रबल और ताराबल दोनों अनुकूल हैं — महत्वपूर्ण कामों के लिए अच्छा दिन।',
      todayCare: 'आज चंद्रमा आपकी राशि से 8वें भाव में है (अष्टम चंद्र) — धीरे चलें, बड़े निर्णय टालें।',
      todayMixed: 'आज आपके लिए मिला-जुला दिन — रोज़ के कामों के लिए ठीक; महत्वपूर्ण कदम सोच-समझकर उठाएँ।', todayQuiet: 'आज आपके लिए शांत दिन — नई शुरुआत से ज़्यादा रोज़ के कामों के लिए अच्छा।',
      askPlaceholder: 'कुछ भी पूछें: नौकरी, शादी, पैसा…', askButton: 'पूछें', kundliCta: '30 सेकंड में अपनी मुफ़्त कुंडली →', needKundli: 'देखने के लिए अपनी कुंडली बनाएँ',
      liveDasha: 'अभी {maha} – {antar} दशा', liveDashaMaha: 'अभी {maha} दशा', liveRashi: '{sign}: आज का फल', liveSade: 'साढ़ेसाती: {p} चरण चल रहा है',
      liveDosha: 'मांगलिक: {k} · साढ़ेसाती: {s}', yes: 'हाँ', no: 'नहीं',
      jkAsk: 'अपनी कुंडली जानना चाहते हैं?', jkSub: 'आपकी मुफ़्त कुंडली — लग्न, राशि, नक्षत्र, ग्रह, दशा और दोष — 30 सेकंड में।',
      jkCreate: 'मेरी कुंडली बनाएँ →', jkMine: 'मेरी कुंडली', jkView: 'पूरी कुंडली देखें →', jkDasha: 'वर्तमान दशा',
      look: { title: 'रूप', mode: 'मोड', mystic: 'मिस्टिक', light: 'लाइट', dark: 'डार्क', auto: 'ऑटो', colour: 'रंग', done: 'ठीक है',
        saffron: 'केसरिया', teal: 'हरा-नीला', rose: 'गुलाबी', blue: 'नीला', button: 'रूप बदलें' },
      notify: { title: 'रोज़ाना सूचनाएँ', invite: 'हर सुबह आज का पंचांग और आपका दिन कैसा रहेगा, पाएँ।', on: 'चालू करें', later: 'अभी नहीं',
        time: 'समय', off: 'बंद करें', enabled: 'चालू — हर दिन {time} बजे', disabled: 'बंद', denied: 'सूचनाएँ बंद हैं। फ़ोन की सेटिंग्स में Jyotirmaya को अनुमति दें, फिर दोबारा कोशिश करें।',
        muhurta: 'शुभ / अशुभ मुहूर्त की सूचना',
        evening: 'शाम को आपके लिए एक सवाल', eveningTime: 'शाम का समय',
        rahu: 'राहु काल', fest: '🪔 आज {name}', reopenTitle: '🌙 आपका आने वाला सप्ताह', reopenBody: 'इस सप्ताह का पंचांग देखने के लिए Jyotirmaya खोलें।', },
      lunar: { year: '{s} संवत्सर', month: '{m} मास', adhika: 'अधिक {m}' },
      cards: { good: 'शुभ समय', panchang: 'पंचांग', events: 'शुभ मुहूर्त', bad: 'अशुभ समय', none: 'आज कोई शुभ मुहूर्त नहीं',
        again: 'फिर', amrita: 'अमृत काल', durmuhurtam: 'दुर्मुहूर्त', marriage: 'विवाह', gruhapravesam: 'गृह प्रवेश', vehicle: 'वाहन ख़रीद',
        eventNote: 'सरल पारंपरिक जाँच (तिथि, नक्षत्र, वार और मास; राहु काल, दुर्मुहूर्त और वर्ज्य को छोड़कर)। विवाह या गृह प्रवेश के लिए सटीक मुहूर्त अपने पुरोहित से पक्का करें।',
        share: 'आज का पंचांग WhatsApp पर शेयर करें', full: 'पूरी पंचांग तालिकाएँ', swipe: 'और देखने के लिए स्वाइप करें →' },
      rashi: { pick: 'अपनी राशि चुनें', find: 'अपनी राशि जानें', mineButton: 'मेरी राशि दिखाएँ', mine: 'आपकी', title: '{sign} राशिफल ({date})', more: '…और पढ़ें', less: 'कम दिखाएँ',
        ask: 'मेरे दिन के बारे में AI से पूछें', askQ: 'आज मेरी राशि {sign} के लिए कैसा रहेगा? मेरी कुंडली के अनुसार बताइए।', full: 'मेरी पूरी कुंडली देखें', share: 'WhatsApp पर शेयर करें',
        details: 'ग्रह-वार विवरण', transitGood: 'अनुकूल', transitCare: 'सावधानी', jump: { transits: 'ग्रह गोचर', remedies: 'उपाय', full: 'पूरी कुंडली', ask: 'AI से पूछें' }, hint: 'आज का राशिफल देखने के लिए ऊपर अपनी राशि चुनें।',
        unlock: '▶ आज का राशिफल देखें', unlockNote: 'एक छोटा विज्ञापन देखें, आज सभी राशियों का राशिफल खुल जाएगा।',
        luckyTitle: 'शुभ संकेत', luckyDay: 'रंग और दिशा: आज सभी राशियों के लिए एक · अंक: आपकी राशि के लिए', luckySign: 'आपकी राशि के लिए खास', colour: 'रंग', numbers: 'अंक', direction: 'दिशा',
        colours: { Sun: 'केसरिया, लाल', Moon: 'सफ़ेद, चाँदी', Mars: 'लाल, मूँगिया', Mercury: 'हरा', Jupiter: 'पीला, सुनहरा', Venus: 'सफ़ेद, गुलाबी', Saturn: 'नीला, काला', Rahu: 'स्लेटी', Ketu: 'भूरा' },
        directions: { Sun: 'पूर्व', Moon: 'वायव्य', Mars: 'दक्षिण', Mercury: 'उत्तर', Jupiter: 'ईशान', Venus: 'आग्नेय', Saturn: 'पश्चिम', Rahu: 'नैऋत्य', Ketu: 'वायव्य' } },
      detailTitle: 'विस्तृत पंचांग', festTitle: 'आने वाले त्योहार', festToday: 'आज', festTomorrow: 'कल', festIn: '{n} दिन में',
      festMore: 'और त्योहार दिखाएँ', festLess: 'कम दिखाएँ', festNone: 'अगले कुछ महीनों में कोई त्योहार नहीं।', festLoading: 'त्योहार लोड हो रहे हैं…',
      shortcuts: { title: 'आपके सितारे, बस एक टैप पर', text: 'कोई रीडिंग चुनें।', labels: ['हथेली', 'राशिफल', 'टैरो', 'मिलान'], channel: 'शॉर्टकट', toggle: 'नोटिफ़िकेशन बार में शॉर्टकट' },
      lifeguide: { card: ['लाइफ़ गाइड', 'आपका रोज़ का संतुलन: प्रेम, काम, धन'], title: 'लाइफ़ गाइड', tabs: ['बीता कल', 'आज', 'आने वाला कल', 'इस माह', 'इस वर्ष'],
        balance: ['बीते कल का संतुलन', 'आज का संतुलन', 'आने वाले कल का संतुलन', 'इस माह का संतुलन', 'इस वर्ष का संतुलन'],
        areas: { love: 'प्रेम', family: 'परिवार', marriage: 'विवाह', career: 'करियर', wealth: 'धन', health: 'स्वास्थ्य' }, byArea: 'क्षेत्र के अनुसार', supported: '{planets} का साथ',
        yourSign: 'आपकी राशि', change: 'बदलें', pick: 'दूसरी राशि देखें', pickFirst: 'अपना संतुलन देखने के लिए अपनी राशि चुनें।', loading: 'आपका संतुलन निकाल रहे हैं…', failed: 'अभी लोड नहीं हो सका। कृपया फिर कोशिश करें।',
        personal: 'आपकी कुंडली के अनुसार: जन्म नक्षत्र {star}', dashaLine: 'दशा {lords}', general: 'इस राशि के लिए सामान्य। अपने लिए ख़ास लाइफ़ गाइड के लिए अपनी कुंडली बनाएँ।', tara: 'आज आपकी तारा: {tara}',
        taraNames: ['जन्म', 'संपत्', 'विपत्', 'क्षेम', 'प्रत्यक्', 'साधना', 'नैधन', 'मित्र', 'परम मित्र'], taraEffect: ['सावधानी', 'सामान्य', 'अनुकूल'],
        unlock: 'वीडियो आइकन वाले टैब एक छोटे विज्ञापन के बाद, इस राशि के लिए आज पूरे दिन खुल जाते हैं।',
        note: 'चंद्र राशि से ग्रहों के गोचर के आधार पर निकाला गया। चिंतन के लिए मार्गदर्शन है, भविष्यवाणी नहीं।',
        text: { love: ['धीरे चलें। ज़्यादा सुनें, जल्दबाज़ी में न बोलें।', 'स्थिर दौर। छोटी-छोटी परवाह सबसे ज़रूरी।', 'भावनाएँ सहज बाँट पाएँगे। मन की बात कहने का अच्छा समय।'],
          family: ['गलतफ़हमी हो सकती है। शांत रहें और दूसरों को जगह दें।', 'सामान्य और शांत। धैर्य से दिनचर्या निभाएँ।', 'घर में सहयोग रहेगा। परिवार के साथ समय तरोताज़ा करेगा।'],
          marriage: ['धैर्य रखें। बड़े फ़ैसले टालें और बहस से बचें।', 'स्थिर। साथ की दिनचर्या सुकून देगी।', 'समझ बढ़ेगी। खुलकर, प्यार से बात करने का अच्छा समय।'],
          career: ['धीमा और कठिन हो सकता है। सोच-समझकर योजना बनाएँ, जोखिम से बचें।', 'प्रगति स्थिर है। एक समय में एक काम पर ध्यान दें।', 'काम अच्छा चलेगा। पहल करने का अच्छा समय।'],
          wealth: ['ख़र्च में सावधानी। जल्दबाज़ी की ख़रीद या उधार से बचें।', 'संतुलित। ख़र्च पर नज़र रखें और व्यावहारिक रहें।', 'पैसे के मामले अनुकूल। योजना और बचत का अच्छा समय।'],
          health: ['आराम से चलें। अच्छा आराम करें, पानी पिएँ, अति न करें।', 'कुल मिलाकर ठीक। समय पर भोजन और आराम रखें।', 'ऊर्जा अच्छी है। व्यायाम और नींद बनाए रखें।'] } },
      signmatch: { card: ['राशि मिलान', 'किन्हीं दो चंद्र राशियों का मिलान'], title: 'राशि मिलान', you: 'आप', partner: 'साथी', choose: 'राशि चुनें', tabs: ['मेरी राशि', 'साथी की राशि'], see: 'हमारा मिलान देखें',
        verdict: { excellent: 'उत्तम मिलान', good: 'अच्छा मिलान', average: 'औसत मिलान', low: 'धैर्य चाहिए' },
        text: { excellent: 'आपकी राशियाँ सहज मेल खाती हैं: आसान समझ और एक-सा नज़रिया।', good: 'आरामदायक जोड़ी, कुछ अंतर के साथ तालमेल बिठाना होगा।', average: 'कुछ अंतर पर काम करना होगा। धैर्य और बातचीत मदद करेंगे।', low: 'स्वभाव काफ़ी अलग हैं। समझ और कोशिश से बात बन सकती है।' },
        friendship: 'मन और मित्रता', family: 'परिवार और समृद्धि', dosha: 'दोनों राशियाँ एक-दूसरे से कठिन स्थिति में हैं (भकूट दोष)। कई परिवार विवाह से पहले इसे देखते हैं।',
        full: 'पूरा 36 गुण कुंडली मिलान', note: 'केवल दो चंद्र राशियों पर आधारित। चिंतन के लिए मार्गदर्शन, भविष्यवाणी नहीं।', shareLine: '{a} + {b}: {percent}% राशि मिलान, {verdict}।' },
      numerology: { card: ['अंक ज्योतिष', 'नाम और जन्म तिथि से आपके अंक'], title: 'अंक ज्योतिष', intro: 'आपकी जन्म तिथि और नाम से आपका मूलांक, भाग्यांक और नामांक।',
        dob: 'जन्म तिथि', name: 'नाम (अंग्रेज़ी अक्षरों में)', show: 'मेरे अंक दिखाएँ', bad: 'कृपया सही जन्म तिथि डालें।', change: 'बदलें',
        moolank: ['मूलांक', 'जन्म अंक · आपका स्वभाव'], bhagyank: ['भाग्यांक', 'भाग्य अंक · जीवन की दिशा'], nameNum: ['नामांक', 'दूसरे आपको कैसे देखते हैं'],
        noName: 'नामांक के लिए अपना नाम अंग्रेज़ी अक्षरों में लिखें।', planet: 'ग्रह', strengths: 'खूबियाँ', care: 'सावधानी',
        harmonyGood: 'आपका नामांक और मूलांक मित्र हैं: अच्छा मेल।', harmonyNeutral: 'आपका नामांक और मूलांक एक-दूसरे के लिए सम (तटस्थ) हैं।',
        year: 'आपका {year} साल: अंक {n}', lucky: 'आपके लिए शुभ', luckyNumbers: 'अंक', luckyDays: 'दिन', luckyColours: 'रंग',
        askAi: 'मेरे अंकों के बारे में AI से पूछें', askQ: 'मेरा मूलांक {m} और भाग्यांक {b} है। ये अंक मेरे करियर और रिश्तों के बारे में क्या कहते हैं?', share: 'शेयर करें',
        note: 'अंक ज्योतिष सोचने का एक पारंपरिक तरीका है, निश्चितता नहीं।' },
      menu: { title: 'मेनू', open: 'मेनू खोलें', close: 'मेनू बंद करें', home: 'होम', panchang: 'आज का पंचांग', appearance: 'रूप', privacy: 'गोपनीयता और शर्तें', back: 'वापस', shareReading: 'शेयर', shareApp: 'ऐप शेयर करें', rateApp: 'ऐप को रेट करें', funFact: 'क्या आप जानते हैं?', listen: 'सुनें', chips: { palm: 'मेरी हथेली पढ़ें', tarot: 'टैरो कार्ड चुनें', lifeguide: 'मेरी लाइफ़ गाइड', numbers: 'मेरे अंक', signmatch: 'राशि मिलान' }, shareLine: 'आपकी जेब में आपका वैदिक ज्योतिषी: पंचांग, कुंडली, राशिफल, हस्त रेखा और टैरो आपकी भाषा में।' },
      palm: { card: ['हस्त रेखा', 'कैमरे से अपनी हथेली स्कैन करें'], title: 'हस्त रेखा विश्लेषण', step: 'चरण 1 · हाथ चुनें', left: 'बाईं हथेली', right: 'दाईं हथेली',
        tipsTitle: 'साफ़ स्कैन के लिए', tips: ['अच्छी रोशनी में लें', 'हथेली सीधी, उँगलियाँ फैलाकर रखें', 'पूरा हाथ फ्रेम में रखें'],
        scan: 'स्कैन', reading: 'आपकी हथेली पढ़ रहे हैं…', notPalm: 'हथेली साफ़ नहीं दिखी। अच्छी रोशनी में पूरी हथेली दिखाते हुए फिर कोशिश करें।',
        off: 'हस्त रेखा पठन अभी बंद है।', failed: 'अभी पढ़ नहीं पाए। थोड़ी देर बाद फिर कोशिश करें।',
        cam: { hint: 'अपनी खुली हथेली को आउटलाइन के अंदर रखें', dark: 'बहुत अंधेरा है। तेज़ रोशनी में जाकर फिर दबाएँ।', gallery: 'फ़ोटो चुनें', close: 'बंद करें', snap: 'फ़ोटो लें' }, tabs: ['हथेली', 'प्रेम', 'करियर'], lines: { heart: 'हृदय रेखा', head: 'मस्तिष्क रेखा', life: 'जीवन रेखा', fate: 'भाग्य रेखा', summary: 'आपकी हथेली कहती है' },
        ready: 'आपकी हथेली की फ़ोटो तैयार है।', see: '▶ मेरी रीडिंग देखें', again: 'फिर स्कैन करें', askAi: 'मेरी हथेली के बारे में AI से पूछें', share: 'शेयर', privacy: 'आपकी फ़ोटो सिर्फ़ इसी पठन के लिए है और सेव नहीं होती।',
        askQ: 'मेरी हस्त रेखा पठन कहती है: “{summary}” अब मुझे किस पर ध्यान देना चाहिए?',
        rekhaNote: 'ये रेखाएँ आपकी फोटो से AI के अनुमान पर आधारित हैं, केवल मार्गदर्शन के लिए — सटीक रेखाएँ नहीं।' },
      tarot: { card: ['टैरो', 'प्रेम, करियर, पैसे के बारे में कार्ड से पूछें'], title: 'टैरो', ask: 'आप कार्ड से क्या पूछना चाहते हैं?',
        topics: { love: 'प्रेम', career: 'करियर', money: 'पैसा', health: 'सेहत', luck: 'भाग्य', family: 'परिवार' },
        pick: '3 कार्ड चुनें', picked: '3 में से {n} चुने', shuffle: 'अपने प्रश्न पर ध्यान दें, फिर तीन कार्ड चुनें।',
        positions: ['अतीत', 'वर्तमान', 'भविष्य'], reversed: 'उल्टा', advice: 'आपके लिए संदेश', loading: 'आपके कार्ड पढ़ रहे हैं…',
        see: '▶ मेरी रीडिंग देखें', again: 'नई रीडिंग', askAi: 'इस बारे में AI से पूछें', share: 'शेयर', fallbackAdvice: 'बीच वाले कार्ड का संदेश आज याद रखें; एक-एक छोटा कदम बढ़ाएँ।',
        askQ: '{topic} टैरो रीडिंग में मुझे {cards} मिले। इसका मेरे लिए क्या अर्थ है?' },
      moon: { card: ['चंद्र राशि', 'आपकी चंद्र राशि और स्वभाव'], title: 'चंद्र राशि', nakshatra: 'नक्षत्र', pada: 'चरण',
        approx: 'अनुमानित: सटीक चंद्र राशि के लिए जन्म समय जोड़ें।', need: 'अपनी चंद्र राशि देखने के लिए जन्म तिथि जोड़ें।', add: 'जन्म विवरण जोड़ें',
        pick: 'कोई भी राशि देखें', loading: 'चंद्रमा पढ़ रहे हैं…', share: 'शेयर', report: 'रिपोर्ट', yours: 'आपकी',
        sections: { emotional: 'भावनात्मक स्वभाव', love: 'प्रेम और परिवार', career: 'काम और पैसा', wellbeing: 'सेहत और सुकून', remedy: 'सरल उपाय' },
        nature: ['साहसी और तुरंत कदम उठाने वाले; मन की बात ईमानदारी से कहते हैं, आज़ादी चाहिए।', 'स्थिर और वफ़ादार; आराम और सुंदरता पसंद, दबाव में भी शांत।',
          'जिज्ञासु और तेज़ दिमाग; बातचीत पसंद, नयापन चाहिए।', 'देखभाल करने वाले और संवेदनशील; परिवार सब कुछ है, अंतर्ज्ञान मज़बूत।',
          'उदार और गर्मजोशी भरे; नेतृत्व में और मेहनत की पहचान मिलने पर चमकते हैं।', 'विचारशील और सावधान; मदद करना पसंद, व्यवस्था में सुकून पाते हैं।',
          'सौम्य और न्यायप्रिय; सामंजस्य चाहते हैं, अच्छे साथ में सबसे खुश।', 'गहरे और निजी; गहराई से प्रेम करते हैं, वफ़ादार, इच्छाशक्ति प्रबल।',
          'आशावादी और ईमानदार; सीखना, यात्रा और बड़ी सोच पसंद।', 'व्यावहारिक और धैर्यवान; ज़िम्मेदार और चुपचाप महत्वाकांक्षी।',
          'स्वतंत्र और विचारशील; मिलनसार, लोगों की परवाह करते हैं।', 'स्वप्निल और दयालु; करुणामय, रचनात्मक और स्वभाव से आध्यात्मिक।'] },
      sections: { chart: 'आपकी कुंडली', palm: 'हस्त रेखा, टैरो और अंक', love: 'प्रेम और मिलान', time: 'समय और त्योहार' }, daily: 'रोज़ाना',
      greet: { morning: 'सुप्रभात', afternoon: 'शुभ दोपहर', evening: 'शुभ संध्या', night: 'शुभ रात्रि', hello: 'नमस्ते 🙏' },
      aiEyebrow: 'AI ज्योतिषी', tryAsking: 'ऐसे पूछें', persona: { hello: 'नमस्ते{name}! 🙏 मैं ज्योतिर्मय हूँ, आपका ज्योतिषी। प्रेम, करियर, पैसा, सेहत और आने वाले दिनों के बारे में बता सकता हूँ।' }, panchangCard: ['आज का पंचांग', 'तिथि, राहु काल और मुहूर्त'],
      tools: { jathakam: ['जन्म कुंडली', 'आपका जन्म चार्ट और फल'], festivals: ['त्योहार', 'आने वाले त्योहार और छुट्टियाँ'], match: ['कुंडली मिलान', '36 में से गुण'], doshas: ['दोष', 'मांगलिक और साढ़ेसाती'], dasha: ['दशा', 'अभी किस ग्रह की दशा है'], rashi: ['राशिफल', 'दिन, सप्ताह, महीना'], chat: ['AI से पूछें', 'जीवन के बारे में प्रश्न'] },
    },
  };
  // Newer screens keep their words in texts/<code>.js ({love, tools, teaser, more, facts}). A language without its own words
  // borrows its closest relative's (Hindi for the Devanagari languages), then English.
  const TEXT_FALLBACK = { mr: 'hi', ne: 'hi', sa: 'hi', kok: 'hi', mai: 'hi', as: 'bn' };
  function copyFor(table, section) {
    const extra = (typeof window !== 'undefined' && window.JyotishaTexts) || {};
    let code = state.lang;
    for (let hop = 0; hop < 3 && code; hop += 1) {
      if (table[code]) return table[code];
      if (extra[code] && extra[code][section]) return extra[code][section];
      code = TEXT_FALLBACK[code] || 'en';
    }
    return table.en;
  }
  const loveText = () => copyFor(RELATIONSHIP_COPY, 'love');
  const toolText = () => copyFor(TOOLS_COPY, 'tools');
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
      optionCard('💗', copy.optReading, copy.optReadingSub, () => { state.loveMode = 'reading'; state.showLoveReading = true; renderRelationship(); }, mode === 'reading'),
      optionCard('✨', copy.optTraits, copy.optTraitsSub, () => { state.loveMode = 'traits'; renderRelationship(); }, mode === 'traits'));
    $('love-match').hidden = mode !== 'match';
    $('love-reading').hidden = mode !== 'reading';
    $('love-traits').hidden = mode !== 'traits';
    const traits = $('relationship-traits-result'); traits.replaceChildren();
    if (mode === 'traits') {
      if (!state.chart) {
        traits.appendChild(el('p', 'muted-note', copy.needChart));
        const form = el('form', 'traits-birth-form');
        const dobInput = el('input'); dobInput.type = 'date'; dobInput.min = '1800-01-01'; dobInput.max = '2100-12-31'; dobInput.required = true; dobInput.setAttribute('aria-label', t('dob'));
        const pobInput = el('input'); pobInput.type = 'text'; pobInput.setAttribute('list', 'place-suggestions'); pobInput.maxLength = 200; pobInput.autocomplete = 'off'; pobInput.required = true; pobInput.placeholder = t('placePlaceholder'); pobInput.setAttribute('aria-label', t('pob'));
        const tobInput = el('input'); tobInput.type = 'time'; tobInput.step = 60; tobInput.required = true; tobInput.setAttribute('aria-label', t('tob'));
        const statusP = el('p', 'muted-note');
        const submitBtn = el('button', 'palm-scan', copy.traitsMakeKundliBtn); submitBtn.type = 'submit';
        form.append(dobInput, pobInput, tobInput, submitBtn, statusP);
        wirePlaceSuggestions(pobInput);
        form.addEventListener('submit', async event => {
          event.preventDefault();
          if (!(await rewardedGate())) return;
          statusP.textContent = t('checking');
          try {
            const { ok, body } = await post('/api/birth-chart', { dob: dobInput.value, pob: pobInput.value, tob: tobInput.value });
            if (ok && body && body.chart) { applyChart(body, { dob: dobInput.value, pob: pobInput.value, tob: tobInput.value }); saveProfile({ dob: dobInput.value, pob: pobInput.value, tob: tobInput.value }); }
            else statusP.textContent = t('chartFailed');
          } catch (_error) { statusP.textContent = t('serviceUnavailable'); }
        });
        traits.appendChild(form);
        const chatBtn = el('button', 'palm-scan', copy.traitsAskInChat);
        chatBtn.type = 'button';
        chatBtn.addEventListener('click', () => { showPage('chat'); ask(copy.optTraits, copy.optTraits, true); });
        traits.appendChild(chatBtn);
      } else {
        try {
          const read = chartUI.partnerTraits(state.chart, state.lang);
          traits.append(el('p', 'muted-note', copy.traitsIntro),
            el('p', null, fill(copy.traitsHouse, { sign: read.house7Sign, lord: read.house7Lord, trait: read.house7Trait })),
            el('p', null, fill(copy.traitsVenus, { sign: read.venusSign, trait: read.venusTrait })));
          const pp = state.partnerPortrait;
          if (pp.status === 'loading') {
            if (pp.image) {
              const img = el('img', 'traits-portrait'); img.src = `data:${pp.image.mime};base64,${pp.image.data}`; img.alt = copy.traitsPortraitBtn;
              traits.appendChild(img);
            }
            traits.appendChild(loader(copy.traitsPortraitLoading));
          }
          else {
            if (pp.status === 'ok' && pp.image) {
              const img = el('img', 'traits-portrait'); img.src = `data:${pp.image.mime};base64,${pp.image.data}`; img.alt = copy.traitsPortraitBtn;
              traits.appendChild(img);
            } else if (pp.status === 'off') traits.appendChild(el('p', 'muted-note', copy.traitsPortraitOff));
            else if (pp.status === 'unavailable') traits.appendChild(el('p', 'muted-note', copy.traitsPortraitUnavailable));
            if (pp.notice === 'limit') traits.appendChild(el('p', 'muted-note portrait-limit', partnerLimitText()));
            else if (pp.notice === 'failed' && pp.image) traits.appendChild(el('p', 'muted-note', copy.traitsPortraitUnavailable));
            // The gender choice and the generate button stay available after a result too, so trying again (a
            // different gender, or the same one) never needs leaving this card.
            if (!state.partnerGender) state.partnerGender = state.myRole === 'bride' ? 'man' : 'woman';
            const genderRow = el('div', 'seg');
            [['woman', copy.traitsGenderWoman], ['man', copy.traitsGenderMan]].forEach(([value, label]) => {
              const option = el('button', value === state.partnerGender ? 'on' : '', label);
              option.type = 'button';
              option.addEventListener('click', () => { state.partnerGender = value; renderRelationship(); });
              genderRow.appendChild(option);
            });
            traits.append(el('small', 'muted-note', copy.traitsGenderLabel), genderRow);
            const btn = el('button', `palm-scan${rewardedFor('partner') ? ' reward-btn' : ''}`, pp.status === 'ok' ? copy.traitsPortraitAgainBtn : copy.traitsPortraitBtn);
            btn.type = 'button';
            btn.addEventListener('click', () => { void generatePartnerPortrait(read.house7Rashi, read.venusRashi, state.partnerGender); });
            traits.appendChild(btn);
          }
        } catch (_error) { traits.appendChild(el('p', null, copy.error)); }
      }
    }
    if ($('partner-role').querySelectorAll) $('partner-role').querySelectorAll('button').forEach(button => {
      button.textContent = copy[button.dataset.role]; button.classList.toggle('on', button.dataset.role === state.myRole);
    });
    const others = state.matchWho === 'others';
    $('match-who-label').textContent = copy.who;
    $('match-who').replaceChildren(...['me', 'others'].map(who => {
      const button = el('button', who === state.matchWho ? 'on' : '', who === 'me' ? copy.whoMe : copy.whoOthers);
      button.type = 'button';
      button.addEventListener('click', () => {
        state.matchWho = who;
        state.partnerChart = null; state.partnerDetails = null; state.firstChart = null; state.firstDetails = null;
        $('relationship-status').textContent = ''; renderRelationship();
      });
      return button;
    }));
    $('first-block').hidden = !others; $('role-row').hidden = others;
    $('first-title').textContent = copy.boyTitle; $('second-title').textContent = copy.girlTitle;
    $('relationship-compare-title').hidden = others;
    $('relationship-reading').disabled = !state.chart;
    if (!state.chart && mode && !(mode === 'match' && others)) $('relationship-status').textContent = copy.needChart;
    const reading = $('relationship-reading-result'); reading.replaceChildren();
    if (mode === 'reading' && !state.chart) reading.appendChild(el('p', 'muted-note', copy.needChart));
    if (state.chart && state.showLoveReading) {
      try {
        const lines = chartUI.readLife(state.chart, state.details, 'marriage', state.lang, null);
        for (const line of lines) reading.appendChild(el('p', null, line));
      } catch (_error) { reading.appendChild(el('p', null, copy.error)); }
    }
    const result = $('relationship-result'); result.replaceChildren();
    const first = others ? state.firstChart : state.chart, firstInfo = others ? state.firstDetails : state.details;
    if (mode !== 'match' || !first || !state.partnerChart) return;
    try {
      const mine = first.positions.Moon.sidereal_longitude, theirs = state.partnerChart.positions.Moon.sidereal_longitude;
      const match = others || state.myRole !== 'bride' ? matchUI.gunaMilan(mine, theirs) : matchUI.gunaMilan(theirs, mine);
      const score = el('div', `relationship-score match-${match.verdict}`);
      score.append(el('span', null, copy.score), el('strong', null, `${match.total} / ${match.max}`));
      const bar = el('progress'); bar.max = match.max; bar.value = match.total;
      bar.setAttribute('aria-label', copy.score); score.appendChild(bar);
      score.appendChild(el('small', null, copy[match.verdict]));
      result.appendChild(score);
      for (const [flag, key] of [[match.nadiDosha, 'nadiDosha'], [match.bhakootDosha, 'bhakootDosha']]) if (flag) result.appendChild(el('p', 'dosha-flag', copy[key]));
      const matchContext = `${Math.round(mine * 1000)}-${Math.round(theirs * 1000)}`;
      const matchUnlocked = contentUnlocked('kundli_match_full', matchContext);
      const kuja = details => details && details.doshas && details.doshas.kuja ? details.doshas.kuja.present : null;
      const me = kuja(firstInfo), them = kuja(state.partnerDetails);
      if (matchUnlocked && me !== null && them !== null) {
        const box = el('div', 'manglik-row');
        box.append(el('b', null, copy.manglik), el('span', null, `${others ? copy.boy : copy.you}: ${me ? copy.yes : copy.no} · ${others ? copy.girl : copy.partner}: ${them ? copy.yes : copy.no}`));
        if (me && them) box.appendChild(el('small', null, copy.manglikBoth)); else if (me || them) box.appendChild(el('small', null, copy.manglikOne));
        result.appendChild(box);
      }
      if (matchUnlocked) {
        const fold = el('details', 'fold'); fold.open = true;
        fold.appendChild(el('summary', null, copy.details));
        const list = el('ul', 'koota-list');
        for (const koota of match.kootas) {
          const item = el('li', koota.points === 0 ? 'zero' : '');
          item.append(el('span', null, copy.kootas[koota.key]), el('b', null, `${koota.points} / ${koota.max}`)); list.appendChild(item);
        }
        fold.appendChild(list); result.appendChild(fold);
      } else {
        const offer = premiumOffer('kundli_match_full', matchContext, renderRelationship); if (offer) result.appendChild(offer);
      }
    } catch (_error) { result.appendChild(el('p', null, copy.error)); }
  }
  // "Your ideal partner": a stylized AI illustration from the 7th house and Venus traits alone (never a photo, never
  // a specific real person); behind "watch an ad" like Palm and Tarot results, when switched on in the admin panel.
  const partnerLimitText = () => ({
    te: 'ఈరోజు మీ illustration limit పూర్తైంది. రేపు మళ్లీ ప్రయత్నించండి.',
    hi: 'आज की illustration limit पूरी हो गई है। कल फिर कोशिश करें।',
  }[state.lang] || 'You have reached today’s illustration limit. Please try again tomorrow.');
  let partnerRequestBusy = false;
  async function generatePartnerPortrait(house7Rashi, venusRashi, gender) {
    if (partnerRequestBusy) return;
    partnerRequestBusy = true;
    const previous = state.partnerPortrait && state.partnerPortrait.image;
    try {
      try {
        const quota = await getJson('/api/partner-portrait-quota');
        if (quota.ok && quota.body && quota.body.remaining <= 0) {
          state.partnerPortrait = { status: previous ? 'ok' : 'unavailable', image: previous || null, notice: 'limit' };
          renderRelationship(); return;
        }
      } catch (_error) { /* the real request still enforces the limit */ }
      const paidWithPlay = playBillingActive();
      if (paidWithPlay && !(await purchaseProduct('partner_portrait', `${localIso(new Date())}-${Date.now()}`))) return;
      if (!paidWithPlay && rewardedFor('partner') && !(await watchForResult())) return;
      state.partnerPortrait = { status: 'loading', image: previous || null };
      renderRelationship();
      const { ok, body, status } = await post('/api/partner-portrait', { house7_rashi: house7Rashi, venus_rashi: venusRashi, gender });
      if (ok && body && body.status === 'ok' && body.image) {
        state.partnerPortrait = { status: 'ok', image: body.image };
        ratingCompleted('partner');
      } else if (status === 429 && body && body.code === 'partner_daily_limit') {
        state.partnerPortrait = { status: previous ? 'ok' : 'unavailable', image: previous || null, notice: 'limit' };
      } else if (body && body.status === 'off') state.partnerPortrait = { status: 'off', image: previous || null };
      else state.partnerPortrait = { status: previous ? 'ok' : 'unavailable', image: previous || null, notice: 'failed' };
    } catch (_error) {
      state.partnerPortrait = { status: previous ? 'ok' : 'unavailable', image: previous || null, notice: 'failed' };
    } finally {
      partnerRequestBusy = false;
      renderRelationship();
    }
  }
  $('relationship-reading').addEventListener('click', () => { state.showLoveReading = true; renderRelationship(); });
  if ($('partner-role').querySelectorAll) $('partner-role').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
    state.myRole = button.dataset.role; renderRelationship();
  }));
  const usableChart = body => body && body.chart && body.chart.positions && body.chart.positions.Moon;
  $('relationship-form').addEventListener('submit', async event => {
    event.preventDefault();
    const copy = loveText(), others = state.matchWho === 'others';
    if (!others && !state.chart) { $('relationship-status').textContent = copy.needChart; return; }
    const input = { dob: $('partner-dob').value, pob: $('partner-pob').value.trim(), tob: $('partner-tob').value };
    const firstInput = { dob: $('first-dob').value, pob: $('first-pob').value.trim(), tob: $('first-tob').value };
    if (others && !(firstInput.dob && firstInput.pob && firstInput.tob)) { $('relationship-status').textContent = copy.needBoth; return; }
    const ownChart = state.chart;
    state.partnerChart = null; state.partnerDetails = null; state.firstChart = null; state.firstDetails = null; $('relationship-result').replaceChildren();
    $('relationship-status').textContent = copy.calculating;
    $('relationship-submit').disabled = true;
    let step = 'second';
    try {
      if (others) {
        step = 'first';
        const boy = await post('/api/birth-chart', firstInput);
        if (!boy.ok || !usableChart(boy.body)) throw new Error('First chart unavailable');
        state.firstChart = boy.body.chart; state.firstDetails = boy.body.details || null;
        step = 'second';
      }
      const { ok, body } = await post('/api/birth-chart', input);
      if (state.chart !== ownChart) return;
      if (!ok || !usableChart(body)) throw new Error('Second chart unavailable');
      state.partnerChart = body.chart; state.partnerDetails = body.details || null;
      $('relationship-status').textContent = '';
      renderRelationship();
    } catch (_error) {
      state.firstChart = null; state.firstDetails = null;
      if (state.chart === ownChart) $('relationship-status').textContent = step === 'first' ? copy.failedFirst : copy.failed;
    }
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
    const context = state.userDob || (state.resolved && state.resolved.date) || 'current-kundli';
    const remediesUnlocked = contentUnlocked('dosha_remedies', context);
    if (remediesUnlocked) {
      const remedies = el('section', 'premium-result');
      remedies.append(el('h4', null, '🪔 Detailed remedies'), el('p', null, kuja && kuja.present
        ? 'Keep Tuesdays calm and disciplined, avoid impulsive commitments, and discuss major relationship decisions patiently.'
        : 'Your chart does not show a strong Kuja warning. Maintain steady routines, thoughtful communication, and regular prayer or meditation.'),
      el('p', null, saturn && saturn.sade_sati && saturn.sade_sati.active
        ? 'For the current Saturn period, choose consistency over shortcuts, serve elders or people in need, and review finances every Saturday.'
        : 'For Saturn balance, keep promises, help someone in need on Saturdays, and build progress through small consistent actions.'));
      host.appendChild(remedies);
    } else { const offer = premiumOffer('dosha_remedies', context, renderDoshas); if (offer) host.appendChild(offer); }
    if (contentUnlocked('kundli_complete', context) && playBillingActive()) {
      const complete = el('section', 'premium-result'); complete.appendChild(el('h4', null, '📜 Complete personal Kundli report'));
      for (const topic of ['life', 'career', 'money', 'study', 'marriage', 'health']) {
        try {
          const lines = chartUI.readLife(state.chart, state.details, topic, state.lang, null);
          const section = el('details', 'fold'); section.appendChild(el('summary', null, lines[0]));
          lines.slice(1).forEach(line => section.appendChild(el('p', null, line))); complete.appendChild(section);
        } catch (_error) { /* keep the remaining report sections */ }
      }
      host.appendChild(complete);
    } else { const complete = premiumOffer('kundli_complete', context, renderDoshas); if (complete) host.appendChild(complete); }
  }
  // Home: a few clear choices; each card shows something about the user (their dasha, doshas, sign, the next festival).
  function nextFestivalText() {
    const copy = toolText(), events = state.festivals && state.festivals.events;
    if (!events || !events.length || !state.todayIso) return null;
    const event = events[0];
    const day = iso => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
    const days = Math.round((day(event.date) - day(state.todayIso)) / 86400000);
    return `${eventName(event)} · ${days === 0 ? copy.festToday : days === 1 ? copy.festTomorrow : fill(copy.festIn, { n: days })}`;
  }
  function liveSubtitles() {
    const copy = toolText(), details = state.details, live = {};
    if (state.chart) live.rashi = fill(copy.liveRashi, { sign: signName(state.chart.positions.Moon.rashi_index) });
    const dasha = details && details.dasha;
    if (dasha && dasha.current_mahadasha) {
      const sub = (dasha.antardasha || []).find(item => item.current);
      live.dasha = sub ? fill(copy.liveDasha, { maha: bodyName(dasha.current_mahadasha), antar: bodyName(sub.lord) }) : fill(copy.liveDashaMaha, { maha: bodyName(dasha.current_mahadasha) });
    }
    const doshas = details && details.doshas;
    if (doshas && doshas.saturn && doshas.saturn.sade_sati && doshas.saturn.sade_sati.active) live.doshas = fill(copy.liveSade, { p: doshas.saturn.sade_sati.phase });
    else if (doshas && doshas.kuja) live.doshas = fill(copy.liveDosha, { k: doshas.kuja.present ? copy.yes : copy.no, s: copy.no });
    live.festivals = nextFestivalText();
    return live;
  }
  // Where the Home cards and the side menu take people (one place, so both behave the same).
  function openTool(page, view) {
    if (page === 'relationship') { state.loveMode = 'match'; renderRelationship(); }
    showPage(page);
    if (view) {
      showKundliView(view);
      // With a chart already made, jump straight to the chosen view instead of the birth form.
      if (state.chart) { try { $('kundli-views').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } catch (_error) { /* scrolling is optional */ } }
    }
  }
  function toPanchang() { showPage('home'); try { $('day-panchang').querySelector('.hero-card').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_error) { /* optional */ } }
  function openJathakam() {
    showPage('kundli');
    if (state.chart) { showKundliView('chart'); try { $('chart').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } catch (_error) { /* optional */ } }
    else { try { document.querySelector('[name="dob"]').focus(); } catch (_error) { /* optional */ } }
  }
  function renderTools() {
    const text = toolText(), copy = text.tools, live = liveSubtitles();
    $('detail-title').textContent = text.detailTitle;
    $('festivals-title').textContent = text.festTitle;
    const open = (page, view) => () => openTool(page, view);
    const toFestivals = () => showPage('calendar');
    const needs = key => live[key] || (state.chart ? copy[key][1] : text.needKundli);
    // Big illustrated cards in sections, like a magazine: picture on top, name and a live line at the bottom.
    const art = window.JyotishaArt || null;
    const card = (key, title, sub, onClick, extra = {}) => {
      const button = el('button', `art-card${extra.wide ? ' wide' : ''}`); button.type = 'button';
      const picture = el('span', 'art-pic');
      if (art && art[extra.art || key]) picture.innerHTML = art[extra.art || key](); else picture.textContent = extra.emoji || '✨';
      button.append(picture, el('b', null, title), el('small', null, sub));
      if (extra.badge) button.appendChild(el('span', 'art-badge', extra.badge));
      button.addEventListener('click', onClick);
      return button;
    };
    const section = (title, cards) => { const box = el('section', 'art-section'); const grid = el('div', 'art-grid'); grid.append(...cards); box.append(el('h3', 'home-h art-h', title), grid); return box; };
    const sections = text.sections || TOOLS_COPY.en.sections;
    const panchangCard = text.panchangCard || TOOLS_COPY.en.panchangCard;
    const todayTithi = state.day && state.day.tithi && state.day.tithi[0] ? names.tithiName(state.day.tithi[0].index, state.lang) : '';
    $('tool-grid').replaceChildren(
      section(sections.chart, [
        card('lifeguide', lgCopy().card[0], lgCopy().card[1], openLifeGuide, { badge: text.daily || TOOLS_COPY.en.daily }),
        card('rashi', copy.rashi[0], live.rashi || copy.rashi[1], open('rashi'), { badge: text.daily || TOOLS_COPY.en.daily }),
        card('moon', moonCopy().card[0], ownMoon() ? `${signName(ownMoon().sign)} · ${moonCopy().card[1]}` : moonCopy().card[1], openMoonSign),
        card('dasha', copy.dasha[0], needs('dasha'), open('kundli', 'dasha'))]),
      section(sections.palm || TOOLS_COPY.en.sections.palm, [
        card('palm', palmCopy().card[0], palmCopy().card[1], openPalm),
        card('tarot', tarotCopy().card[0], tarotCopy().card[1], openTarot),
        card('numerology', numCopy().card[0], numberLine() || numCopy().card[1], openNumerology)]),
      section(sections.love, [
        card('match', copy.match[0], copy.match[1], open('relationship')),
        card('signmatch', smCopy().card[0], smCopy().card[1], openSignMatch),
        card('doshas', copy.doshas[0], needs('doshas'), open('kundli', 'doshas'))]),
      section(sections.time, [
        // Today's Panchang first, so it is seen without swiping.
        card('panchang', panchangCard[0], todayTithi || panchangCard[1], toPanchang),
        card('festivals', copy.festivals[0], live.festivals || copy.festivals[1], toFestivals, { wide: true })]));
    renderGreeting();
    renderJathakamCard();
    renderHomeAi();
    renderNotify();
    renderMenu();
  }
  // Home greeting: "Good afternoon" and the user's name (or Namaste when we do not know it).
  function renderGreeting() {
    const text = toolText(), greet = text.greet || TOOLS_COPY.en.greet, hour = new Date().getHours();
    const part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
    $('greet-time').textContent = greet[part];
    $('greet-name').textContent = state.userName || greet.hello;
    const art = window.JyotishaArt, box = $('ai-art');
    if (art && box && !box.dataset.done) { box.innerHTML = art.orb(); box.dataset.done = '1'; }
    $('ai-eyebrow').textContent = text.aiEyebrow || TOOLS_COPY.en.aiEyebrow;
    $('try-asking').textContent = `✦ ${text.tryAsking || TOOLS_COPY.en.tryAsking}`;
  }
  // Home: "Want to know your Jathakam?" before a chart exists, a short summary of it afterwards.
  function renderJathakamCard() {
    const copy = toolText(), box = $('my-jathakam'), chart = state.chart;
    box.replaceChildren();
    const button = el('button', 'jk-cta', chart ? copy.jkView : copy.jkCreate); button.type = 'button';
    button.addEventListener('click', openJathakam);
    const head = el('div', 'jk-head');
    head.append(el('span', 'jk-icon', '🪐'), el('div'));
    head.children[1].append(el('h2', null, chart ? copy.jkMine : copy.jkAsk));
    if (!chart) head.children[1].append(el('p', null, copy.jkSub));
    box.appendChild(head);
    if (chart) {
      const stats = el('div', 'jk-stats');
      const stat = (label, value) => { const item = el('div', 'jk-stat'); item.append(el('small', null, label), el('b', null, value)); return item; };
      stats.append(stat(t('lagna'), signName(chart.ascendant.rashi_index)), stat(t('janmaRashi'), signName(chart.positions.Moon.rashi_index)),
        stat(t('nakshatra'), names.nakshatraName(chart.panchanga_at_birth.nakshatra_index, state.lang)));
      const dasha = state.details && state.details.dasha;
      if (dasha && dasha.current_mahadasha) {
        const sub = (dasha.antardasha || []).find(item => item.current);
        stats.append(stat(copy.jkDasha, `${bodyName(dasha.current_mahadasha)}${sub ? ' – ' + bodyName(sub.lord) : ''}`));
      }
      box.appendChild(stats);
    }
    box.appendChild(button);
  }
  // Home AI card: a personal line for today, a type box, and a nudge to make a Kundli first.
  function todayForYou() {
    const day = state.day;
    if (!day || day.date !== state.todayIso) return null;
    return dayForYou(day, localIso(new Date()) + 'T' + new Date().toTimeString().slice(0, 5));
  }
  // The personal line for a day at a given local time ('YYYY-MM-DDTHH:MM'), from Chandrabalam and Tarabalam.
  function dayForYou(day, now) {
    const chart = state.chart;
    if (!day || !chart || !Array.isArray(day.nakshatra) || !Array.isArray(day.moon_rashi)) return null;
    const current = list => list.find(item => item.starts_at <= now && now < item.ends_at) || list[0];
    const tara = current(day.nakshatra), moon = current(day.moon_rashi);
    if (!tara || !moon) return null;
    const mySign = chart.positions.Moon.rashi_index, myStar = chart.panchanga_at_birth.nakshatra_index;
    const copy = toolText();
    if (moon.ashtama_chandra_rashi === mySign) return copy.todayCare;
    const chandra = (moon.good_chandrabalam_rashis || []).includes(mySign), taraGood = (tara.good_tara_nakshatras || []).includes(myStar);
    return chandra && taraGood ? copy.todayGood : chandra || taraGood ? copy.todayMixed : copy.todayQuiet;
  }
  function renderHomeAi() {
    const copy = toolText();
    $('home-question').placeholder = copy.askPlaceholder;
    $('home-ask-send').textContent = copy.askButton;
    const line = todayForYou(), box = $('home-today');
    box.replaceChildren();
    if (line) { box.append(el('b', null, `✨ ${copy.todayLabel}: `), document.createTextNode(line)); box.hidden = false; } else box.hidden = true;
  }
  $('home-ask').addEventListener('submit', event => {
    event.preventDefault();
    const question = $('home-question').value.trim();
    if (!question) return;
    $('home-question').value = '';
    showPage('chat');
    ask(question, question, true);
  });

  // Home: the next festivals from today, read from this month's and the next two months' calendars.
  const FEST_MONTHS = 3, FEST_SHOWN = 6;
  async function loadFestivals() {
    const city = state.city, today = state.todayIso;
    if (!city || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return;
    const key = `${city}|${today}`;
    if (state.festivals && state.festivals.key === key) { renderFestivals(); return; }
    state.festivals = { key, events: null };
    renderFestivals();
    const months = [];
    for (let step = 0; step < FEST_MONTHS; step += 1) {
      const target = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + step, 1));
      months.push({ year: target.getUTCFullYear(), month: target.getUTCMonth() + 1 });
    }
    const events = [];
    try {
      const replies = await Promise.all(months.map(item => post('/api/month-calendar', { ...item, place: city }).catch(() => null)));
      for (const reply of replies) if (reply && reply.ok && reply.body && Array.isArray(reply.body.events)) events.push(...reply.body.events);
    } catch (_error) { /* shown as none */ }
    if (!state.festivals || state.festivals.key !== key) return;
    state.festivals.events = events.filter(event => typeof event.date === 'string' && event.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    renderFestivals();
    void scheduleNotifications();
  }
  function renderFestivals() {
    const copy = toolText(), list = $('festival-list'), more = $('festival-more');
    list.replaceChildren(); more.hidden = true;
    const data = state.festivals;
    renderTools();
    if (!data || !data.events) { list.appendChild(el('p', 'muted-note', copy.festLoading)); return; }
    if (!data.events.length) { list.appendChild(el('p', 'muted-note', copy.festNone)); return; }
    const today = Date.UTC(Number(state.todayIso.slice(0, 4)), Number(state.todayIso.slice(5, 7)) - 1, Number(state.todayIso.slice(8, 10)));
    const shown = state.festivalsAll ? data.events : data.events.slice(0, FEST_SHOWN);
    for (const event of shown) {
      const days = Math.round((Date.UTC(Number(event.date.slice(0, 4)), Number(event.date.slice(5, 7)) - 1, Number(event.date.slice(8, 10))) - today) / 86400000);
      const when = days === 0 ? copy.festToday : days === 1 ? copy.festTomorrow : fill(copy.festIn, { n: days });
      const row = el('button', `fest-row${event.holiday ? ' holiday' : ''}${days === 0 ? ' today' : ''}`); row.type = 'button';
      const date = el('span', 'fest-date');
      date.append(el('b', null, event.date.slice(8, 10).replace(/^0/, '')), el('small', null, calendarUI.monthName(state.lang, Number(event.date.slice(5, 7)) - 1, 'short')));
      const text = el('span', 'fest-text');
      text.append(el('b', null, eventName(event)), el('small', null, `${calendarUI.weekdayName(state.lang, new Date(`${event.date}T12:00:00Z`).getUTCDay())} · ${when}`));
      row.append(date, text);
      if (event.holiday) row.appendChild(el('em', 'tag debilitated', t('holidayTag')));
      row.addEventListener('click', () => openDay(event.date));
      list.appendChild(row);
    }
    if (data.events.length > FEST_SHOWN) {
      more.hidden = false; more.textContent = state.festivalsAll ? copy.festLess : copy.festMore;
    }
  }
  $('festival-more').addEventListener('click', () => { state.festivalsAll = !state.festivalsAll; renderFestivals(); });

  /* ---- Appearance: mystic (plum, the default) / light / dark / auto, and an accent colour, remembered on this device ---- */
  const LOOK_KEY = 'jyotisha.appearance.v2';   // v2: everyone starts on the mystic plum look once
  const ACCENTS = { saffron: ['#f6b04a', '#f08a3a'], teal: ['#4cc7ae', '#1f9d8a'], rose: ['#ef93aa', '#d95478'], blue: ['#86aef2', '#4a7fd8'] };
  const MODES = ['mystic', 'light', 'dark', 'auto'];
  function loadLook() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(LOOK_KEY)) || {};
      return { mode: MODES.includes(saved.mode) ? saved.mode : 'mystic', accent: Object.hasOwn(ACCENTS, saved.accent) ? saved.accent : 'saffron' };
    } catch (_error) { return { mode: 'mystic', accent: 'saffron' }; }
  }
  const look = loadLook();
  const systemDark = () => { try { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); } catch (_error) { return false; } };
  function applyLook() {
    const mystic = look.mode === 'mystic';
    const dark = mystic || look.mode === 'dark' || (look.mode === 'auto' && systemDark());
    const root = document.documentElement;
    if (root.setAttribute) {
      root.setAttribute('data-mode', dark ? 'dark' : 'light');
      root.setAttribute('data-accent', mystic ? 'mystic' : look.accent);
      root.setAttribute('data-skin', mystic ? 'mystic' : 'plain');
    }
    const barColor = mystic ? '#1a0b24' : dark ? '#1c1f25' : '#fff7e8';
    try { const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', barColor); } catch (_error) { /* optional */ }
    // In the Android app the phone's status and navigation bars take the same colour (light icons on dark bars).
    try {
      const bars = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SystemBars;
      if (bars && bars.set) void Promise.resolve(bars.set({ color: barColor, light: !dark })).catch(() => {});
    } catch (_error) { /* older app: bars keep the built-in colour */ }
    try { window.localStorage.setItem(LOOK_KEY, JSON.stringify(look)); } catch (_error) { /* not remembered */ }
  }
  function renderLookPanel() {
    const copy = toolText().look, panel = $('theme-panel');
    $('theme-btn').setAttribute('aria-label', copy.button);
    panel.replaceChildren();
    const title = el('h3', null, `🎨 ${copy.title}`); title.id = 'theme-title';
    const modes = el('div', 'seg'); modes.setAttribute('role', 'group');
    for (const mode of MODES) {
      const button = el('button', mode === look.mode ? 'on' : '', `${{ mystic: '🔮', light: '☀️', dark: '🌙', auto: '📱' }[mode]} ${copy[mode]}`); button.type = 'button';
      button.setAttribute('aria-pressed', mode === look.mode ? 'true' : 'false');
      button.addEventListener('click', () => { look.mode = mode; applyLook(); renderLookPanel(); });
      modes.appendChild(button);
    }
    const swatches = el('div', 'swatches');
    for (const [name, [a, b]] of Object.entries(ACCENTS)) {
      const button = el('button', `swatch${name === look.accent ? ' on' : ''}`); button.type = 'button';
      button.setAttribute('aria-pressed', name === look.accent ? 'true' : 'false');
      const dot = el('i'); dot.setAttribute('style', `--sa:${a};--sb:${b}`);
      button.append(dot, el('span', null, copy[name]));
      button.addEventListener('click', () => { look.accent = name; applyLook(); renderLookPanel(); });
      swatches.appendChild(button);
    }
    const done = el('button', 'theme-done', copy.done); done.type = 'button';
    done.addEventListener('click', () => { panel.hidden = true; });
    panel.append(title, el('span', 'label', copy.mode), modes);
    if (look.mode !== 'mystic') panel.append(el('span', 'label', copy.colour), swatches);   // the mystic look has its own colours
    // Notifications work on their own; their schedule is not shown to users.
    panel.appendChild(done);
  }
  $('theme-btn').addEventListener('click', () => { const panel = $('theme-panel'); renderLookPanel(); panel.hidden = !panel.hidden; });
  try { if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (look.mode === 'auto') applyLook(); }); } catch (_error) { /* older browsers */ }
  applyLook();

  /* ---- Daily notifications (Android app only): scheduled on the phone, no server or account needed ---- */
  const NOTIFY_KEY = 'jyotisha.notify.v1', NOTIFY_FIRST_ID = 7100, NOTIFY_DAYS = 7, NOTIFY_ACTION = 'JYOTI_OPEN';
  const notifier = () => { const cap = window.Capacitor; return cap && cap.Plugins && cap.Plugins.LocalNotifications ? cap.Plugins.LocalNotifications : null; };
  function loadNotify() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(NOTIFY_KEY)) || {};
      return { on: saved.on === true, asked: saved.asked === true, time: /^\d{2}:\d{2}$/.test(saved.time || '') ? saved.time : '07:00',
        evening: saved.evening !== false, muhurta: saved.muhurta !== false, shortcuts: saved.shortcuts !== false, teasers: saved.teasers !== false, eveningTime: /^\d{2}:\d{2}$/.test(saved.eveningTime || '') ? saved.eveningTime : '19:30' };
    } catch (_error) { return { on: false, asked: false, time: '07:00', evening: true, muhurta: true, shortcuts: true, teasers: true, eveningTime: '19:30' }; }
  }
  const notify = loadNotify();
  const saveNotify = () => { try { window.localStorage.setItem(NOTIFY_KEY, JSON.stringify(notify)); } catch (_error) { /* not remembered */ } };
  let notifyBusy = false, notifyAgain = false, notifyNote = '', notifyInfo = null;   // notifyInfo.blocked: allowed once, since turned off in phone settings
  async function scheduleNotifications() {
    const plugin = notifier();
    if (!plugin || !state.city) return;
    if (notifyBusy) { notifyAgain = true; return; }   // run once more when the current run ends
    notifyBusy = true;
    try {
      const pending = await plugin.getPending().catch(() => ({ notifications: [] }));
      const ours = (pending.notifications || []).filter(item => (item.id >= NOTIFY_FIRST_ID && item.id < NOTIFY_FIRST_ID + 50) || (item.id >= TEASE_FIRST_ID && item.id < TEASE_FIRST_ID + TEASE_MAX) || (item.id >= MORE_FIRST_ID && item.id < MORE_FIRST_ID + MORE_MAX)).map(item => ({ id: item.id }));
      if (ours.length) await plugin.cancel({ notifications: ours });
      if (!notify.on) { notifyInfo = null; return; }
      const permission = await plugin.checkPermissions().catch(() => ({ display: 'granted' }));
      if (permission.display !== 'granted') { notifyInfo = { blocked: true }; return; }
      const copy = toolText().notify, [hour, minute] = notify.time.split(':').map(Number), now = new Date();
      const festivals = (state.festivals && state.festivals.events) || [];
      const list = [], days = {}, moreSeen = { keys: new Set(), ids: 0 };
      aiBatches = {};
      try {   // fresh AI-written copy for this language; the built-in messages are used for any day without it
        const { ok, body } = await post('/api/nudges', { language: state.lang, from: localIso(now), days: NOTIFY_DAYS });
        if (ok && body && body.batches && typeof body.batches === 'object') aiBatches = body.batches;
      } catch (_error) { /* offline: built-in messages */ }
      for (let offset = 0; offset < NOTIFY_DAYS; offset += 1) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute, 0);
        const iso = localIso(at);
        const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 21, 30, 0);
        if (endOfDay <= now) continue;
        let day = null;
        try { const { ok, body } = await post('/api/day-panchang', { date: iso, place: state.city }); if (ok && body && body.day) day = body.day; } catch (_error) { /* skip the day */ }
        if (!day) continue;
        days[iso] = day;
        // Each part on its own: one bad day or message must never stop the rest from being scheduled.
        try { list.push(...muhurtaAlerts(day, iso, offset, now)); } catch (error) { console.warn('muhurta alerts', iso, error); }
        try { list.push(...moreAlerts(day, iso, now, moreSeen)); } catch (error) { console.warn('more alerts', iso, error); }
        if (at <= now) continue;
        try {
        const atText = `${iso}T${notify.time}`;
        const pick = items => items.find(item => item.starts_at <= atText && atText < item.ends_at) || items[0];
        const festival = festivals.find(event => event.date === iso);
        const weekday = calendarUI.weekdayName(state.lang, new Date(`${iso}T12:00:00Z`).getUTCDay());
        const title = festival ? fill(copy.fest, { name: eventName(festival) }) : `🌅 ${weekday} · ${names.tithiName(pick(day.tithi).index, state.lang)}`;
        const rahu = day.timings && day.timings.rahu_kalam;
        const lines = [`${names.nakshatraName(pick(day.nakshatra).index, state.lang)}${rahu ? ` · ${copy.rahu} ${clock(rahu[0], iso)}–${clock(rahu[1], iso)}` : ''}`];
        const personal = dayForYou(day, atText);
        if (personal) lines.push(`✨ ${personal}`);
        const text = lines.join('\n').replace(/[\u2066-\u2069]/g, '');   // no direction marks: some phones draw them as boxes
        list.push({ id: NOTIFY_FIRST_ID + offset, title, body: text, largeBody: text, schedule: { at, allowWhileIdle: true }, extra: { page: 'home' } });
        } catch (error) { console.warn('morning notification', iso, error); }
      }
      // After the scheduled week, one reminder to open the app (which schedules the next week).
      const last = new Date(now.getFullYear(), now.getMonth(), now.getDate() + NOTIFY_DAYS, hour, minute, 0);
      list.push({ id: NOTIFY_FIRST_ID + NOTIFY_DAYS, title: copy.reopenTitle, body: copy.reopenBody, schedule: { at: last, allowWhileIdle: true } });
      try { list.push(...eveningNotifications(now, days)); } catch (error) { console.warn('evening notifications', error); }
      try { list.push(...teaserNotifications(now)); } catch (error) { console.warn('reading reminders', error); }
      // A button under each reading reminder and timing alert (like "Reveal it"), opening the same screen as a tap.
      const button = { en: 'See now', te: 'ఇప్పుడే చూడండి', hi: 'अभी देखें' }[state.lang] || 'See now';
      try { if (plugin.registerActionTypes) await plugin.registerActionTypes({ types: [{ id: NOTIFY_ACTION, actions: [{ id: 'open', title: button, foreground: true }] }] }); } catch (_error) { /* older plugin: no button */ }
      for (const item of list) if (item.extra && item.extra.page && item.extra.page !== 'home') item.actionTypeId = NOTIFY_ACTION;
      await plugin.schedule({ notifications: list });
      notifyInfo = null;
    } catch (error) {
      console.warn('notifications', error);
    } finally {
      notifyBusy = false; refreshNotifySettings(); void syncShortcuts();
      if (notifyAgain) { notifyAgain = false; void scheduleNotifications(); }
    }
  }
  /* ---- Reading reminders: short, tempting (but true) notifications every hour or so in the day, each opening a feature.
     How often and between which hours comes from the admin panel; the user can switch them off under 🎨. ---- */
  const TEASE_FIRST_ID = 7300, TEASE_MAX = 190, TEASE_DAYS = 7, TEASE_KEY = 'jyotisha.teasers.v1';
  const TEASER_COPY = {
    en: { toggle: 'Reading reminders (every few hours)', items: {
      palm: ['✋ Your palm is waiting to be read', 'Your heart, head and life lines have a story. Scan your palm and see it in seconds.'],
      tarot: ['🃏 Your cards are shuffled', 'Three cards are waiting for your question about love, career or money. Pick yours now.'],
      rashi: ['🔮 {sign}: today’s reading is ready', 'Your luck, colour and best time for today. Tap to see what the day holds.'],
      rashiAny: ['🔮 Today’s Rashiphal is ready', 'Find your rashi and see what today holds for you.'],
      kundli: ['📜 Your Jathakam is ready', 'Your chart, dasha and doshas are waiting. See what this period means for you.'],
      kundliNew: ['📜 Your Jathakam is 30 seconds away', 'Add your birth time and see your Lagna, Rashi, Nakshatra and dasha.'],
      moon: ['🌙 What does your Moon say about you?', 'Your Moon sign shows your feelings, love and nature. Tap to read it.'],
      numbers: ['🔢 Your lucky numbers are ready', 'Your Moolank, Bhagyank, lucky days and colours, from your birth date.'],
      chat: ['💬 Ask Jyotirmaya anything', 'Career, marriage or money: get an answer from your own chart.'],
      match: ['💞 Is your match written in the stars?', 'Check Guna Milan out of 36 in under a minute.'] } },
    te: { toggle: 'రీడింగ్ రిమైండర్లు (ప్రతి కొన్ని గంటలకు)', items: {
      palm: ['✋ మీ హస్త రేఖలు మీ కోసం ఎదురుచూస్తున్నాయి', 'మీ హృదయ, మస్తిష్క, జీవన రేఖలు ఏం చెబుతున్నాయో చూడండి. అరచేతిని స్కాన్ చేయండి.'],
      tarot: ['🃏 మీ కార్డులు సిద్ధంగా ఉన్నాయి', 'ప్రేమ, ఉద్యోగం, డబ్బు: మీ ప్రశ్నకు మూడు కార్డులు ఎదురుచూస్తున్నాయి. ఇప్పుడే ఎంచుకోండి.'],
      rashi: ['🔮 {sign}: ఈ రోజు ఫలితం సిద్ధం', 'ఈ రోజు మీ అదృష్టం, రంగు, మంచి సమయం. రోజు ఎలా ఉందో చూడండి.'],
      rashiAny: ['🔮 ఈ రోజు రాశి ఫలాలు సిద్ధం', 'మీ రాశి ఎంచుకుని ఈ రోజు మీకు ఎలా ఉందో చూడండి.'],
      kundli: ['📜 మీ జాతకం సిద్ధంగా ఉంది', 'మీ చక్రం, దశ, దోషాలు మీ కోసం ఎదురుచూస్తున్నాయి. ఈ కాలం మీకు ఏం చెబుతుందో చూడండి.'],
      kundliNew: ['📜 మీ జాతకం 30 సెకన్ల దూరంలో', 'పుట్టిన సమయం ఇచ్చి మీ లగ్నం, రాశి, నక్షత్రం, దశ చూడండి.'],
      moon: ['🌙 మీ చంద్ర రాశి మీ గురించి ఏం చెబుతోంది?', 'మీ భావాలు, ప్రేమ, స్వభావం మీ చంద్ర రాశిలో ఉన్నాయి. చదవండి.'],
      numbers: ['🔢 మీ అదృష్ట సంఖ్యలు సిద్ధం', 'మీ మూలాంకం, భాగ్యాంకం, అదృష్ట రోజులు, రంగులు: మీ పుట్టిన తేదీ నుంచి.'],
      chat: ['💬 జ్యోతిర్మయను ఏదైనా అడగండి', 'ఉద్యోగం, పెళ్లి, డబ్బు: మీ జాతకం ఆధారంగా సమాధానం పొందండి.'],
      match: ['💞 మీ జంట నక్షత్రాల్లో రాసి ఉందా?', 'ఒక్క నిమిషంలో 36కి గుణ మేళనం చూడండి.'] } },
    hi: { toggle: 'रीडिंग रिमाइंडर (हर कुछ घंटों में)', items: {
      palm: ['✋ आपकी हथेली की रेखाएँ इंतज़ार कर रही हैं', 'आपकी हृदय, मस्तिष्क और जीवन रेखा क्या कहती है? हथेली स्कैन करें और देखें।'],
      tarot: ['🃏 आपके कार्ड तैयार हैं', 'प्रेम, करियर या पैसा: आपके सवाल के लिए तीन कार्ड इंतज़ार कर रहे हैं। अभी चुनें।'],
      rashi: ['🔮 {sign}: आज का राशिफल तैयार है', 'आज आपका भाग्य, रंग और शुभ समय। देखें आज का दिन कैसा है।'],
      rashiAny: ['🔮 आज का राशिफल तैयार है', 'अपनी राशि चुनें और देखें आज आपके लिए क्या है।'],
      kundli: ['📜 आपकी कुंडली तैयार है', 'आपका चार्ट, दशा और दोष इंतज़ार कर रहे हैं। देखें यह समय आपके लिए क्या कहता है।'],
      kundliNew: ['📜 आपकी कुंडली बस 30 सेकंड दूर', 'जन्म समय डालें और अपना लग्न, राशि, नक्षत्र और दशा देखें।'],
      moon: ['🌙 आपकी चंद्र राशि आपके बारे में क्या कहती है?', 'आपकी भावनाएँ, प्रेम और स्वभाव चंद्र राशि में छिपे हैं। पढ़ें।'],
      numbers: ['🔢 आपके शुभ अंक तैयार हैं', 'आपका मूलांक, भाग्यांक, शुभ दिन और रंग: आपकी जन्म तिथि से।'],
      chat: ['💬 ज्योतिर्मय से कुछ भी पूछें', 'करियर, शादी या पैसा: अपनी कुंडली से जवाब पाएँ।'],
      match: ['💞 क्या आपकी जोड़ी सितारों में लिखी है?', 'एक मिनट में 36 में से गुण मिलान देखें।'] } },
  };
  const teaserCopy = () => copyFor(TEASER_COPY, 'teaser');
  // The server's setting, remembered so the first scheduling after a start already has it.
  function loadTeaserConfig() { try { const value = JSON.parse(window.localStorage.getItem(TEASE_KEY)); return value && value.every_hours ? value : null; } catch (_error) { return null; } }
  let teaserConfig = loadTeaserConfig();
  function setTeaserConfig(value) {
    const next = value && Number.isInteger(value.every_hours) && value.every_hours > 0 ? { every_hours: value.every_hours, from: value.from, to: value.to } : null;
    if (JSON.stringify(next) === JSON.stringify(teaserConfig)) return;
    teaserConfig = next;
    try { window.localStorage.setItem(TEASE_KEY, JSON.stringify(next)); } catch (_error) { /* optional */ }
    void scheduleNotifications();
  }
  // Which reminders fit this user: true ones only ("ready" only when it really is).
  function teaserChoices() {
    const items = teaserCopy().items, moon = ownMoon(), choices = [];
    const sign = moon ? signName(moon.sign) : '';
    choices.push(moon ? { key: 'rashi', page: 'rashi', sign, text: items.rashi.map(line => fill(line, { sign })) } : { key: 'rashiAny', page: 'rashi', text: items.rashiAny });
    choices.push({ key: 'palm', page: 'palm', text: items.palm });
    choices.push(state.chart ? { key: 'kundli', page: 'kundli', text: items.kundli } : { key: 'kundliNew', page: 'kundli', text: items.kundliNew });
    choices.push({ key: 'tarot', page: 'tarot', text: items.tarot });
    if (numberDob()) choices.push({ key: 'numbers', page: 'numbers', text: items.numbers });
    choices.push({ key: 'moon', page: 'moon', text: items.moon });
    choices.push({ key: 'chat', page: 'chat', text: items.chat });
    choices.push({ key: 'match', page: 'relationship', text: items.match });
    return choices;
  }
  // The day's AI-written lines for a feature (fresh wording every day), plus the built-in line. "kundliNew" and
  // "rashiAny" have no AI lines: the AI's Jathakam/Rashiphal lines assume a chart / a known sign.
  function teaserOptions(choice, iso) {
    const ai = aiBatches[iso] && aiBatches[iso].teasers && aiBatches[iso].teasers[choice.key];
    const fresh = Array.isArray(ai) ? ai.filter(item => item && typeof item.t === 'string' && typeof item.b === 'string')
      .map(item => [fill(item.t, { sign: choice.sign || '' }), fill(item.b, { sign: choice.sign || '' })]) : [];
    return [...fresh, choice.text];
  }
  function teaserNotifications(now) {
    const config = teaserConfig;
    if (!notify.teasers || !config) return [];
    const choices = teaserChoices(), list = [], used = {};
    let turn = now.getDate() % choices.length;   // a different first reminder each day
    for (let offset = 0; offset < TEASE_DAYS && list.length < TEASE_MAX; offset += 1) {
      for (let hour = config.from; hour <= config.to && list.length < TEASE_MAX; hour += config.every_hours) {
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, 0, 0);
        if (at <= now) continue;   // every hour, even when another alert is due around then
        const choice = choices[turn % choices.length]; turn += 1;
        const options = teaserOptions(choice, localIso(at));
        const [title, body] = options[(used[choice.key] = (used[choice.key] || 0) + 1) % options.length];
        const text = body.replace(/[⁦-⁩]/g, '');
        list.push({ id: TEASE_FIRST_ID + list.length, title: title.replace(/[⁦-⁩]/g, ''), body: text, largeBody: text,
          schedule: { at, allowWhileIdle: true }, extra: { page: choice.page } });
      }
    }
    return list;
  }
  /* ---- The pinned "Shortcuts" notification (Android app): four buttons that open Palm, Rashiphal, Tarot and Match ---- */
  const shortcutsPlugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Shortcuts) || null;
  async function syncShortcuts() {
    const plugin = shortcutsPlugin();
    if (!plugin) return;
    try {
      if (!notify.on || notify.shortcuts === false || !state.onboarded) { await plugin.hide(); return; }
      const copy = toolText().shortcuts || TOOLS_COPY.en.shortcuts;
      await plugin.show({ title: copy.title, text: copy.text, labels: copy.labels, pages: ['palm', 'rashi', 'tarot', 'match'], channelName: copy.channel });
    } catch (_error) { /* optional */ }
  }
  function openShortcut(page) {
    if (!state.onboarded) return;
    if (page === 'palm') openPalm();
    else if (page === 'tarot') openTarot();
    else if (page === 'match') { state.loveMode = 'match'; renderRelationship(); showPage('relationship'); }
    else if (page === 'rashi') showPage('rashi');
    else showPage('home');
  }
  try {
    const plugin = shortcutsPlugin();
    // A tap that opened the app arrives right after start-up: wait a moment so Home has settled first.
    if (plugin && plugin.addListener) plugin.addListener('shortcut', event => { setTimeout(() => openShortcut(event && event.page), 300); });
  } catch (_error) { /* optional */ }
  function refreshNotifySettings() {
    try { const panel = $('theme-panel'); if (panel && !panel.hidden) renderLookPanel(); } catch (_error) { /* not open */ }
  }

  async function turnNotifications(on) {
    const plugin = notifier(), copy = toolText().notify;
    notify.asked = true; notifyNote = '';
    if (on && plugin) {
      let status = await plugin.checkPermissions().catch(() => ({ display: 'denied' }));
      if (status.display !== 'granted') status = await plugin.requestPermissions().catch(() => ({ display: 'denied' }));
      if (status.display !== 'granted') { notify.on = false; notifyNote = copy.denied; saveNotify(); renderNotify(); renderLookPanel(); return; }
    }
    notify.on = !!on; saveNotify(); renderNotify(); renderLookPanel();
    await scheduleNotifications();
  }
  let notifyAsking = Promise.resolve();   // the first-start permission prompt, so the loading screen can wait for it
  // On the first start in the Android app, ask the phone's own "Allow notifications?" straight away (once, no extra card).
  function renderNotify() {
    const box = $('notify-card');
    box.replaceChildren(); box.hidden = true;
    if (notifier() && !notify.asked) notifyAsking = turnNotifications(true);
  }
  function notifySettings() {
    if (!notifier()) return null;
    const copy = toolText().notify, wrap = el('div', 'notify-settings');
    const row = el('div', 'notify-row');
    const status = el('span', 'notify-status', notify.on ? fill(copy.enabled, { time: notify.time }) : copy.disabled);
    const toggle = el('button', notify.on ? 'notify-later' : 'notify-on', notify.on ? copy.off : copy.on); toggle.type = 'button';
    toggle.addEventListener('click', () => { void turnNotifications(!notify.on); });
    row.append(status, toggle);
    const time = el('input'); time.type = 'time'; time.value = notify.time; time.setAttribute('aria-label', copy.time);
    time.addEventListener('change', () => { if (/^\d{2}:\d{2}$/.test(time.value)) { notify.time = time.value; saveNotify(); renderLookPanel(); void scheduleNotifications(); } });
    const timeRow = el('label', 'notify-time'); timeRow.append(el('span', null, copy.time), time);
    const evening = el('label', 'notify-time');
    const eveningBox = el('input'); eveningBox.type = 'checkbox'; eveningBox.checked = notify.evening; eveningBox.style.width = 'auto';
    eveningBox.addEventListener('change', () => { notify.evening = eveningBox.checked; saveNotify(); void scheduleNotifications(); });
    const eveningTime = el('input'); eveningTime.type = 'time'; eveningTime.value = notify.eveningTime; eveningTime.setAttribute('aria-label', copy.eveningTime);
    eveningTime.addEventListener('change', () => { if (/^\d{2}:\d{2}$/.test(eveningTime.value)) { notify.eveningTime = eveningTime.value; saveNotify(); void scheduleNotifications(); } });
    const eveningLabel = el('span'); eveningLabel.append(eveningBox, document.createTextNode(` ${copy.evening}`));
    evening.append(eveningLabel, eveningTime);
    wrap.append(el('span', 'label', `🔔 ${copy.title}`), row, timeRow);
    const muhurta = el('label', 'notify-time');
    const muhurtaBox = el('input'); muhurtaBox.type = 'checkbox'; muhurtaBox.checked = notify.muhurta; muhurtaBox.style.width = 'auto';
    muhurtaBox.addEventListener('change', () => { notify.muhurta = muhurtaBox.checked; saveNotify(); void scheduleNotifications(); });
    const muhurtaLabel = el('span'); muhurtaLabel.append(muhurtaBox, document.createTextNode(` ${copy.muhurta}`));
    muhurta.appendChild(muhurtaLabel);
    const shortcuts = el('label', 'notify-time');
    if (shortcutsPlugin()) {
      const shortcutsBox = el('input'); shortcutsBox.type = 'checkbox'; shortcutsBox.checked = notify.shortcuts !== false; shortcutsBox.style.width = 'auto';
      shortcutsBox.addEventListener('change', () => { notify.shortcuts = shortcutsBox.checked; saveNotify(); void syncShortcuts(); });
      const shortcutsLabel = el('span'); shortcutsLabel.append(shortcutsBox, document.createTextNode(` ${(toolText().shortcuts || TOOLS_COPY.en.shortcuts).toggle}`));
      shortcuts.appendChild(shortcutsLabel);
    }
    const teasers = el('label', 'notify-time');
    const teasersBox = el('input'); teasersBox.type = 'checkbox'; teasersBox.checked = notify.teasers !== false; teasersBox.style.width = 'auto';
    teasersBox.addEventListener('change', () => { notify.teasers = teasersBox.checked; saveNotify(); void scheduleNotifications(); });
    const teasersLabel = el('span'); teasersLabel.append(teasersBox, document.createTextNode(` ${teaserCopy().toggle}`));
    teasers.appendChild(teasersLabel);
    if (notify.on) wrap.append(evening, muhurta);
    if (notify.on && teaserConfig) wrap.append(teasers);
    if (notify.on && shortcutsPlugin()) wrap.append(shortcuts);
    if (notify.on && notifyInfo && notifyInfo.blocked) wrap.appendChild(el('p', 'notify-next', copy.denied));   // only a problem is shown
    if (notifyNote) wrap.appendChild(el('p', 'muted-note', notifyNote));
    return wrap;
  }
  /* ---- Unique daily notifications: built from each day's sky for this user, with a no-repeat memory ---- */
  const nudgeTexts = window.JyotishaNudges;
  const NUDGE_FIRST_ID = 7120, MUHURTA_GOOD_ID = 7130, MUHURTA_BAD_ID = 7140;
  const NUDGE_HISTORY_KEY = 'jyotisha.nudges.v1', NO_REPEAT_DAYS = 21;
  let aiBatches = {};   // date -> AI-written copy for the current language
  const dayNumberOf = date => Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  const isoMinusDays = (iso, days) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };
  // Muhurta alerts: when Abhijit (auspicious, not on Wednesdays) and Rahu Kalam (inauspicious) start, 5 AM to 9 PM.
  // Three wordings each, rotated by date, so the text changes from day to day.
  function muhurtaAlerts(day, iso, offset, now) {
    if (!notify.muhurta || !day.timings || !nudgeTexts) return [];
    const texts = nudgeTexts.pick(nudgeTexts.MUHURTA, state.lang), variant = dayNumberOf(new Date(`${iso}T12:00:00`)), result = [];
    const add = (id, span, options) => {
      if (!Array.isArray(span) || typeof span[0] !== 'string') return;
      const at = new Date(`${span[0]}:00`);
      const hour = at.getHours() + at.getMinutes() / 60;
      if (Number.isNaN(at.getTime()) || at <= now || hour < ALERT_FROM || hour > ALERT_TO) return;
      const end = clock(span[1], iso).replace(/[⁦-⁩]/g, '');
      const ai = aiBatches[iso] && aiBatches[iso][id === MUHURTA_GOOD_ID ? 'good' : 'bad'];
      const choices = Array.isArray(ai) && ai.length ? ai.map(item => [item.t, item.b]) : options;
      const [title, body] = choices[variant % choices.length];
      result.push({ id: id + offset, title: fill(title, { end }), body: fill(body, { end }), largeBody: fill(body, { end }), schedule: { at, allowWhileIdle: true }, extra: { page: 'home' } });
    };
    if (new Date(`${iso}T12:00:00Z`).getUTCDay() !== 3) add(MUHURTA_GOOD_ID, day.timings.abhijit, texts.good);
    add(MUHURTA_BAD_ID, day.timings.rahu_kalam, texts.bad);
    return result;
  }
  // More timing alerts: Vijaya muhurta starts, Rahu Kalam is over, Yamagandam and Varjyam start, and the user's own rashi:
  // when Chandrabalam turns good for them, and when Ashtama Chandra starts. Each invites them to open the app.
  const MORE_FIRST_ID = 7200, MORE_MAX = 100, ALERT_FROM = 5, ALERT_TO = 21;   // alerts only from 5 AM to 9 PM
  const MORE_COPY = {
    en: {
      vijaya: ['🏆 Vijaya muhurta has started', 'The “victory” time is on till {end}. Good for starting something you want to win. See today’s full timings in the app.'],
      rahuEnd: ['✅ Rahu Kalam is over', 'You can go ahead with important work now. See today’s next good time in the app.'],
      yama: ['⚠️ Yamagandam has started', 'Avoid starting new work till {end}. Open the app to see when the next good time is.'],
      varjyam: ['⛔ Varjyam has started', 'Not a good time for new beginnings till {end}. Check the best hours in the app.'],
      rashiGood: ['✨ {sign}: your good time starts now', 'Chandrabalam is strong for you till {end}. A good stretch for important work. See your best hours in the app.'],
      rashiCare: ['🌘 {sign}: go slow till {end}', 'Ashtama Chandra is running for your rashi. Keep big decisions for later. See your day in the app.'] },
    te: {
      vijaya: ['🏆 విజయ ముహూర్తం మొదలైంది', '{end} వరకు విజయ సమయం. గెలవాలనుకునే పని మొదలుపెట్టడానికి మంచిది. ఈ రోజు పూర్తి సమయాలు యాప్‌లో చూడండి.'],
      rahuEnd: ['✅ రాహుకాలం ముగిసింది', 'ఇప్పుడు ముఖ్యమైన పనులు మొదలుపెట్టవచ్చు. తదుపరి మంచి సమయం యాప్‌లో చూడండి.'],
      yama: ['⚠️ యమగండం మొదలైంది', '{end} వరకు కొత్త పనులు మొదలుపెట్టకండి. తదుపరి మంచి సమయం యాప్‌లో చూడండి.'],
      varjyam: ['⛔ వర్జ్యం మొదలైంది', '{end} వరకు శుభకార్యాలకు మంచి సమయం కాదు. మంచి గంటలు యాప్‌లో చూడండి.'],
      rashiGood: ['✨ {sign}: మీ మంచి సమయం మొదలైంది', '{end} వరకు మీకు చంద్రబలం బాగుంది. ముఖ్యమైన పనులకు అనుకూలం. మంచి గంటలు యాప్‌లో చూడండి.'],
      rashiCare: ['🌘 {sign}: {end} వరకు నిదానంగా', 'మీ రాశికి అష్టమ చంద్రుడు నడుస్తున్నాడు. పెద్ద నిర్ణయాలు తర్వాతకు ఉంచండి. మీ రోజు యాప్‌లో చూడండి.'] },
    hi: {
      vijaya: ['🏆 विजय मुहूर्त शुरू हो गया', '{end} तक विजय का समय है। जीतने वाले काम शुरू करने के लिए अच्छा। आज का पूरा समय ऐप में देखें।'],
      rahuEnd: ['✅ राहुकाल खत्म हुआ', 'अब ज़रूरी काम आगे बढ़ा सकते हैं। अगला शुभ समय ऐप में देखें।'],
      yama: ['⚠️ यमगंड शुरू हो गया', '{end} तक नया काम शुरू न करें। अगला शुभ समय ऐप में देखें।'],
      varjyam: ['⛔ वर्ज्य शुरू हो गया', '{end} तक शुभ शुरुआत के लिए अच्छा समय नहीं। शुभ घड़ियाँ ऐप में देखें।'],
      rashiGood: ['✨ {sign}: आपका अच्छा समय शुरू', '{end} तक आपका चंद्रबल मज़बूत है। ज़रूरी कामों के लिए अनुकूल। शुभ घड़ियाँ ऐप में देखें।'],
      rashiCare: ['🌘 {sign}: {end} तक धीरे चलें', 'आपकी राशि के लिए अष्टम चंद्र चल रहा है। बड़े फ़ैसले बाद में लें। अपना दिन ऐप में देखें।'] },
  };
  // seen: start times already used (a Moon-sign period shows up in two days' data), and the running count of ids.
  function moreAlerts(day, iso, now, seen) {
    if (!notify.muhurta || !day) return [];
    const copy = copyFor(MORE_COPY, 'more'), result = [];
    const clean = text => text.replace(/[⁦-⁩]/g, '');
    // Only between ALERT_FROM and ALERT_TO o'clock. A rashi period that began in the night is told at ALERT_FROM.
    const add = (key, startText, endText, page, values = {}, moveFromNight = false) => {
      if (typeof startText !== 'string' || typeof endText !== 'string' || seen.ids >= MORE_MAX) return;
      let at = new Date(`${startText}:00`);
      const end = new Date(`${endText}:00`);
      if (Number.isNaN(at.getTime()) || Number.isNaN(end.getTime())) return;
      if (at.getHours() < ALERT_FROM) {
        if (!moveFromNight) return;
        at = new Date(at.getFullYear(), at.getMonth(), at.getDate(), ALERT_FROM, 0, 0);
        if (at >= end) return;
      }
      if (at <= now || at.getHours() * 60 + at.getMinutes() > ALERT_TO * 60) return;
      const mark = `${key}@${at.getTime()}`;
      if (seen.keys.has(mark)) return;
      seen.keys.add(mark);
      const filled = { ...values, end: clean(clock(endText, iso)) };
      const [title, body] = copy[key].map(line => clean(fill(fill(line, filled), filled)));
      result.push({ id: MORE_FIRST_ID + seen.ids, title, body, largeBody: body, schedule: { at, allowWhileIdle: true }, extra: { page } });
      seen.ids += 1;
    };
    const timings = day.timings || {};
    if (Array.isArray(timings.vijaya_muhurta)) add('vijaya', timings.vijaya_muhurta[0], timings.vijaya_muhurta[1], 'panchang');
    if (Array.isArray(timings.rahu_kalam)) add('rahuEnd', timings.rahu_kalam[1], timings.rahu_kalam[1], 'panchang');
    if (Array.isArray(timings.yamaganda)) add('yama', timings.yamaganda[0], timings.yamaganda[1], 'panchang');
    for (const item of Array.isArray(day.varjyam) ? day.varjyam : []) {
      if (item && String(item.starts_at).startsWith(iso)) add('varjyam', item.starts_at, item.ends_at, 'panchang');
    }
    // The user's own rashi (from the chart, or the approximate Moon sign from the date of birth).
    const mine = ownMoon();
    if (mine && Array.isArray(day.moon_rashi)) {
      const sign = signName(mine.sign);
      day.moon_rashi.forEach((item, index) => {
        const good = list => Array.isArray(list && list.good_chandrabalam_rashis) && list.good_chandrabalam_rashis.includes(mine.sign);
        if (good(item) && !good(day.moon_rashi[index - 1])) add('rashiGood', item.starts_at, item.ends_at, 'rashi', { sign }, true);
        if (item.ashtama_chandra_rashi === mine.sign) add('rashiCare', item.starts_at, item.ends_at, 'rashi', { sign }, true);
      });
    }
    return result;
  }
  // Every message this user could get on a given evening, each with a key used by the no-repeat memory.
  function nudgeCandidates(day, iso, atText) {
    const lang = state.lang, details = state.details, chart = state.chart;
    const dashaInfo = details && details.dasha;
    const sub = dashaInfo && (dashaInfo.antardasha || []).find(item => item.current);
    const dasha = dashaInfo && dashaInfo.current_mahadasha ? `${bodyName(dashaInfo.current_mahadasha)}${sub ? ' – ' + bodyName(sub.lord) : ''}` : '';
    const sade = !!(details && details.doshas && details.doshas.saturn && details.doshas.saturn.sade_sati && details.doshas.saturn.sade_sati.active);
    const make = (key, [t, b, ask], page) => ({ key, t, b, ask: ask || '', page: ask ? 'chat' : (page || 'home') });
    const current = list => (Array.isArray(list) && list.find(item => item.starts_at <= atText && atText < item.ends_at)) || (Array.isArray(list) ? list[0] : null);
    const special = [], sky = [];
    const tithi = day && current(day.tithi), tithiKey = tithi && nudgeTexts.TITHI_KEYS[tithi.index];
    if (tithiKey) special.push(make(`tithi-${tithiKey}`, nudgeTexts.pick(nudgeTexts.TITHIS, lang)[tithiKey]));
    const moon = day && current(day.moon_rashi);
    if (chart && moon) {
      const house = (moon.index - chart.positions.Moon.rashi_index + 12) % 12 + 1;
      sky.push(make(`house-${house}`, nudgeTexts.pick(nudgeTexts.HOUSES, lang)[house - 1]));
    }
    const weekday = new Date(`${iso}T12:00:00Z`).getUTCDay();
    sky.push(make(`weekday-${weekday}`, nudgeTexts.pick(nudgeTexts.WEEKDAYS, lang)[weekday]));
    const fits = item => !item.need || (item.need === 'nochart' && !chart) || (item.need === 'dasha' && dasha) || (item.need === 'sade' && sade);
    const questions = nudgeTexts.pick(nudgeTexts.QUESTIONS, lang)
      .map((item, index) => ({ item, index })).filter(({ item }) => fits(item))
      .map(({ item, index }) => make(`q-${index}`, [fill(item.t, { dasha }), fill(item.b, { dasha }), item.ask ? fill(item.ask, { dasha }) : ''], item.page));
    // Fresh AI-written lines for this date (keys are unique per date, so they never repeat).
    const ai = aiBatches[iso], fresh = [];
    if (ai) {
      const filled = (item, values) => ({ t: fill(item.t, values), b: fill(item.b, values), ask: fill(item.ask, values) });
      const usable = item => !/[{}]/.test(item.t + item.b + item.ask);
      const signName = chart ? chartUI.signName(chart.positions.Moon.rashi_index, lang) : '';
      if (dasha) (ai.dasha || []).forEach((item, i) => fresh.push({ key: `ai-${iso}-d${i}`, ...filled(item, { dasha }) }));
      if (signName) (ai.sign || []).forEach((item, i) => fresh.push({ key: `ai-${iso}-s${i}`, ...filled(item, { sign: signName }) }));
      (ai.questions || []).forEach((item, i) => fresh.push({ key: `ai-${iso}-q${i}`, ...filled(item, {}) }));
      for (let i = fresh.length - 1; i >= 0; i -= 1) if (!usable(fresh[i]) || !fresh[i].ask) fresh.splice(i, 1);
      fresh.forEach(item => { item.page = 'chat'; });
    }
    // Festive tithis first; then the order rotates by date between sky-based and life questions.
    const shift = dayNumberOf(new Date(`${iso}T12:00:00`));
    const rotated = questions.length ? questions.map((_, i) => questions[(i + shift * 7) % questions.length]) : [];
    // Fresh AI lines come first (a different one each day: personal ones on alternate days), then the built-in library.
    const freshOrdered = fresh.length ? fresh.map((_, i) => fresh[(i + shift) % fresh.length]) : [];
    const library = shift % 2 ? [...sky, ...rotated] : [...rotated, ...sky];
    return [...special, ...freshOrdered, ...library];
  }
  function loadNudgeHistory() {
    try { const saved = JSON.parse(window.localStorage.getItem(NUDGE_HISTORY_KEY)); return saved && typeof saved === 'object' ? saved : {}; } catch (_error) { return {}; }
  }
  // One message per evening; the same message never comes back within NO_REPEAT_DAYS (falls back to the least recent).
  function eveningNotifications(now, days) {
    if (!notify.evening || !nudgeTexts) return [];
    const history = loadNudgeHistory(), today = localIso(now), result = [];
    for (const date of Object.keys(history)) if (date >= today || date < isoMinusDays(today, 45)) delete history[date];   // future days are planned again
    const [hour, minute] = notify.eveningTime.split(':').map(Number);
    for (let offset = 0; offset < NOTIFY_DAYS; offset += 1) {
      const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, hour, minute, 0);
      if (at <= now) continue;
      const iso = localIso(at), from = isoMinusDays(iso, NO_REPEAT_DAYS);
      const lastUsed = {};
      for (const [date, key] of Object.entries(history)) if (date < iso && (!lastUsed[key] || date > lastUsed[key])) lastUsed[key] = date;
      const candidates = nudgeCandidates(days[iso], iso, `${iso}T${notify.eveningTime}`);
      if (!candidates.length) continue;
      const choice = candidates.find(item => !lastUsed[item.key] || lastUsed[item.key] < from)
        || candidates.slice().sort((a, b) => (lastUsed[a.key] || '').localeCompare(lastUsed[b.key] || ''))[0];
      history[iso] = choice.key;
      result.push({ id: NUDGE_FIRST_ID + offset, title: choice.t, body: choice.b, largeBody: choice.b, schedule: { at, allowWhileIdle: true },
        extra: { page: choice.page, ask: choice.ask } });
    }
    try { window.localStorage.setItem(NUDGE_HISTORY_KEY, JSON.stringify(history)); } catch (_error) { /* not remembered */ }
    return result;
  }
  // Tapping a notification: open its screen, and for a question, ask Jyotirmaya AstroChat straight away.
  // When a notification opens the app, its question waits until the saved Kundli is restored and the AI is known to be on,
  // so the chat is not reset under it and the reply comes from Jyotirmaya AstroChat, not the offline answers.
  const startup = { profile: false, readiness: false, pending: null };
  let markReadiness = () => {};
  const readinessSeen = new Promise(resolve => { markReadiness = resolve; });   // the server's settings (ads etc.) have arrived
  function startupDone(part) {
    if (part === 'readiness') markReadiness();
    startup[part] = true;
    if (startup.profile && startup.readiness && startup.pending) {
      const question = startup.pending; startup.pending = null;
      showPage('chat'); ask(question, question, true);
    }
  }
  function openFromNotification(extra) {
    const page = extra && typeof extra.page === 'string' && (Object.hasOwn(pages, extra.page) || extra.page === 'panchang') ? extra.page : 'home';
    // Features with their own start screen are opened the way their Home card opens them.
    const openers = { panchang: openToday, palm: openPalm, tarot: openTarot, moon: openMoonSign, numbers: openNumerology, kundli: openJathakam, relationship: () => openTool('relationship') };
    if (openers[page]) openers[page](); else showPage(page);
    const question = extra && typeof extra.ask === 'string' ? extra.ask.trim().slice(0, 300) : '';
    if (!question) return;
    showPage('chat');
    if (startup.profile && startup.readiness) ask(question, question, true);
    else startup.pending = question;
  }
  try { const plugin = notifier(); if (plugin) plugin.addListener('localNotificationActionPerformed', event => openFromNotification(event && event.notification && event.notification.extra)); } catch (_error) { /* optional */ }

  /* ---- Messages sent from the admin panel (Firebase): subscribe to "all" and to this phone's language ---- */
  const PUSH_KEY = 'jyotisha.push.v1';
  const messenger = () => { const cap = window.Capacitor; return cap && cap.Plugins && cap.Plugins.FirebaseMessaging ? cap.Plugins.FirebaseMessaging : null; };
  async function syncPushTopics() {
    const plugin = messenger();
    if (!plugin) return;
    let saved = null;
    try { saved = window.localStorage.getItem(PUSH_KEY); } catch (_error) { /* storage unavailable */ }
    const wanted = `lang-${state.lang}`;
    if (saved === wanted) return;
    try {
      await plugin.subscribeToTopic({ topic: 'all' });
      if (saved && saved !== wanted) await plugin.unsubscribeFromTopic({ topic: saved }).catch(() => {});
      await plugin.subscribeToTopic({ topic: wanted });
      try { window.localStorage.setItem(PUSH_KEY, wanted); } catch (_error) { /* subscribe again next time */ }
    } catch (_error) { /* no network or no Firebase config: try again next start */ }
  }
  try {
    const plugin = messenger();
    if (plugin) {
      // Tapping a message opens the screen chosen in the admin panel.
      plugin.addListener('notificationActionPerformed', event => openFromNotification(event && event.notification && event.notification.data));
      // While the app is open Android does not show the message itself, so show it as a local notification.
      plugin.addListener('notificationReceived', event => {
        const message = event && event.notification, local = notifier();
        if (message && local) void local.schedule({ notifications: [{ id: 7900 + Math.floor(Math.random() * 90), title: message.title || '', body: message.body || '' }] }).catch(() => {});
      });
    }
  } catch (_error) { /* optional */ }

  /* ------------------------------------------------------------- language */
  const choice = $('language-choice');
  const switcher = $('language-switch');
  for (const item of calendarUI.LANGUAGES) {
    const full = el('option'); full.value = item.code; full.textContent = item.code === 'en' ? item.native : `${item.native} · ${item.english}`; choice.appendChild(full);
    const short = el('option'); short.value = item.code; short.textContent = item.native; switcher.appendChild(short);
  }
  // First start: the languages as a list of cards (native name, English name, a ✓) instead of a dropdown.
  const firstLetter = text => {
    try { if (typeof Intl.Segmenter === 'function') { const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)[Symbol.iterator]().next(); if (!first.done) return first.value.segment; } } catch (_error) { /* fall back */ }
    return Array.from(text)[0] || '';
  };
  function renderLanguageList() {
    const box = $('language-list');
    if (!box) return;
    box.replaceChildren(...calendarUI.LANGUAGES.map(item => {
      const on = item.code === state.lang;
      const row = el('button', `lang-item${on ? ' on' : ''}`); row.type = 'button';
      row.setAttribute('role', 'radio'); row.setAttribute('aria-checked', on ? 'true' : 'false');
      const text = el('span', 'lang-text');
      text.append(el('b', null, item.native), el('small', null, item.english.toLowerCase() === item.native.toLowerCase() ? '' : item.english));
      row.append(el('span', 'lang-badge', firstLetter(item.native)), text, el('span', 'lang-check', on ? '✓' : ''));
      row.addEventListener('click', () => { applyLanguage(item.code); });
      return row;
    }));
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
    try { document.documentElement.style.setProperty('--free-label', JSON.stringify(t('freeBadge'))); } catch (_error) { /* optional */ }
    renderHome();
    renderTools();
    renderTodayStrip();
    renderLanguageList();
    renderWheels();
    renderLookPanel();
    showKundliView(state.kundliView);
    renderRelationship();
    if (pages.moon && !pages.moon.hidden) renderMoonSign();
    if (pages.tarot && !pages.tarot.hidden) renderTarot();
    if (pages.palm && !pages.palm.hidden) renderPalm();
    if (pages.numbers && !pages.numbers.hidden) renderNumerology();
    if (pages.lifeguide && !pages.lifeguide.hidden) { renderLifeGuide(); void loadLifeGuideText(); }
    if (pages.signmatch && !pages.signmatch.hidden) renderSignMatch();
    if (state.chart) { renderChart(); resetChat(t('chartReady')); } else startIntake();
    saveSettings();
    void scheduleNotifications();   // notification text follows the language
    void syncPushTopics();
  }
  switcher.addEventListener('change', event => applyLanguage(event.target.value));
  choice.addEventListener('change', event => applyLanguage(event.target.value));

  /* ----------------------------------------------------------- onboarding */
  let onboardingStep = 'welcome';
  function showOnboardingStep(step) {
    onboardingStep = step;
    void onboardingBanner(step === 'language' || step === 'profile');
    document.body.classList.add('onboarding-active');
    $('welcome-screen').hidden = false;
    for (const name of ['welcome', 'language', 'location', 'profile']) $(`step-${name}`).hidden = name !== step;
    if (step === 'profile') renderWheels();   // drawn while visible, so each wheel can scroll to its value
  }
  $('welcome-next').addEventListener('click', () => showOnboardingStep('language'));
  // First start: a short loading screen ("Aligning your stars…"); the phone's notification prompt appears meanwhile
  // (renderNotify asks once at start), then a full-screen ad if the server switched it on, then the language step.
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  // Waits for a promise, but at most `ms`; the timer is cleared as soon as the promise settles. Resolves to the
  // promise's value, or to `fallback` on timeout.
  const within = (promise, ms, fallback) => new Promise(resolve => {
    const timer = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(value => { clearTimeout(timer); resolve(value); }, () => { clearTimeout(timer); resolve(fallback); });
  });
  async function runSplash() {
    const fill = $('splash-fill'), pct = $('splash-pct');
    for (let n = 0; n <= 100; n += 2) {          // about 3.5 seconds
      if (onboardingStep !== 'welcome' || state.onboarded) return;
      if (fill.style) fill.style.width = `${n}%`;
      pct.textContent = `${n}%`;
      await wait(70);
    }
    await notifyAsking;          // let the notification prompt finish first
    await onboardingAd();
    if (onboardingStep === 'welcome' && !state.onboarded) showOnboardingStep('language');
  }
  // Each later opening of the Android app: the loading screen, then one full-screen ad, then Home. Only when switched
  // on in the admin panel; the setting is remembered from the last start so the screen never flashes when it is off.
  const LAUNCH_AD_KEY = 'jyotisha.launch-ad.v1';
  const launchAdWanted = () => { try { return window.localStorage.getItem(LAUNCH_AD_KEY) === '1'; } catch (_error) { return false; } };
  function rememberLaunchAd(config) {
    try { window.localStorage.setItem(LAUNCH_AD_KEY, config && adUnitOk(config.launch_interstitial_id) ? '1' : '0'); } catch (_error) { /* optional */ }
  }
  const nativeApp = () => !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  // Each later opening of the Android app: the loading screen stays until today's Panchang is ready (at most ~6 s), so
  // Home never opens with empty details; then one full-screen ad if switched on in the admin panel; then Home.
  // With today's Panchang already saved on the phone (and no ad) Home opens straight away.
  async function launchSplash() {
    const ad = !!admobPlugin() && launchAdWanted();
    if (!nativeApp() || (!ad && state.day)) return;
    appAds.launching = true;
    showOnboardingStep('welcome');
    $('welcome-next').hidden = true;
    const fill = $('splash-fill'), pct = $('splash-pct'), started = Date.now();
    let ready = false;
    void within(dayReady, 6000).then(() => { ready = true; });
    for (let n = 0; ;) {
      if (fill.style) fill.style.width = `${n}%`;
      pct.textContent = `${n}%`;
      if (n >= 100) break;
      await wait(50);
      if (!ready && Date.now() - started > 6500) ready = true;
      n = ready ? Math.min(100, n + 10) : Math.min(90, n + 2);   // up to 90% while loading, then finishes quickly
    }
    try { if (ad) await onboardingAd('launch_interstitial_id'); } finally {
      appAds.launching = false; onboardingStep = '';
      $('welcome-screen').hidden = true; document.body.classList.remove('onboarding-active');
      if (appAds.waiting) { const config = appAds.waiting; appAds.waiting = null; void startAppAds(config); }
    }
  }
  // Android app: if the Play Store has a newer versionCode than what is installed, show a small "update available"
  // popup once the app is settled on Home. "Later" is remembered for this version so it does not nag on every open;
  // a later update (a higher availableVersionCode) is asked about again.
  const UPDATE_DISMISS_KEY = 'jyotisha.update-dismissed.v1';
  function appUpdatePlugin() { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppUpdate) || null; }
  async function maybeOfferUpdate() {
    const plugin = appUpdatePlugin();
    if (!nativeApp() || !plugin) return;
    let info;
    try { info = await plugin.getAppUpdateInfo(); } catch (_error) { return; }
    if (!info || info.updateAvailability !== 2 || !info.availableVersionCode) return;
    let dismissed = '';
    try { dismissed = window.localStorage.getItem(UPDATE_DISMISS_KEY) || ''; } catch (_error) { /* optional */ }
    if (dismissed === String(info.availableVersionCode)) return;
    const copy = { title: t('updateAvailableTitle'), body: t('updateAvailableBody'), now: t('updateNow'), later: t('updateLater') };
    const overlay = el('div', 'update-popup');
    const card = el('div', 'update-popup-card');
    const later = el('button', 'link-btn'); later.type = 'button'; later.textContent = copy.later;
    const now = el('button', 'btn'); now.type = 'button'; now.textContent = copy.now;
    const actions = el('div', 'update-popup-actions'); actions.append(later, now);
    card.append(el('strong', 'update-popup-title', copy.title), el('p', 'update-popup-body', copy.body), actions);
    overlay.appendChild(card);
    const dismiss = () => { try { overlay.remove(); } catch (_error) { /* gone */ } };
    later.addEventListener('click', () => {
      try { window.localStorage.setItem(UPDATE_DISMISS_KEY, String(info.availableVersionCode)); } catch (_error) { /* optional */ }
      dismiss();
    });
    now.addEventListener('click', () => { void plugin.openAppStore().catch(() => {}); dismiss(); });
    document.body.appendChild(overlay);
  }
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
        return { lang: calendarUI.language(value.lang), city: value.city.trim().slice(0, 200), useLocation: value.useLocation === true,
          name: typeof value.name === 'string' ? value.name.slice(0, 40) : '', dob: /^\d{4}-\d{2}-\d{2}$/.test(value.dob || '') ? value.dob : '' };
      }
    } catch (_error) { /* storage unavailable or corrupt: behave like a first visit */ }
    return null;
  }
  function saveSettings() {
    if (!state.onboarded) return;
    const data = { lang: state.lang, city: state.city, useLocation: state.useLocation };
    if (state.userName) data.name = state.userName;
    if (state.userDob) data.dob = state.userDob;
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (_error) { /* not persisted */ }
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
    try {
      if (!profile) return;
      const { ok, body } = await post('/api/birth-chart', profile);
      if (ok && body && body.chart) { applyChart(body, profile); intake.step = null; resetChat(t('chartReady')); }
    } catch (_error) { /* offline or unavailable: the chat simply asks for the details again */ }
    finally { startupDone('profile'); }
  }
  // Today's Panchang is kept on the phone: a later opening on the same day shows it at once (then quietly refreshes).
  const TODAY_KEY = 'jyotisha.today.v1';
  function cachedToday() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(TODAY_KEY));
      return saved && saved.city === state.city && saved.day && saved.day.date === localIso(new Date()) ? saved.day : null;
    } catch (_error) { return null; }
  }
  function keepToday(day) { try { window.localStorage.setItem(TODAY_KEY, JSON.stringify({ city: state.city, day })); } catch (_error) { /* optional */ } }
  let markDayReady = () => {};
  const dayReady = new Promise(resolve => { markDayReady = resolve; });   // today's Panchang is on screen (or failed)
  function startHome() {
    const today = localIso(new Date());
    state.todayIso = today; state.selectedDate = today;
    state.view = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) };
    state.month = null; state.day = null;
    showPage('home');
    renderHome();
    const saved = cachedToday();
    if (saved) {
      state.day = saved;
      try { $('dp-date').value = saved.date; renderDay(); } catch (error) { console.warn('saved panchang', error); }
      markDayReady();
    }
    void loadMonth();
    void loadDay(today, true, !!saved);
    void loadFestivals();
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
      status.textContent = `📍 ${city}`;
      // The city comes from the location, so there is nothing more to ask: go straight on.
      setTimeout(() => { if (!state.onboarded && onboardingStep === 'location') toProfileStep(); }, 700);
    }, key => { state.pendingLocation = false; status.textContent = t(key); });
  });
  $('welcome-form').addEventListener('submit', event => {
    event.preventDefault();
    if (onboardingStep === 'profile') void finishProfile(); else toProfileStep();
  });
  function toProfileStep() {
    if (!$('welcome-city').value.trim()) return;
    showOnboardingStep('profile');
  }
  // Name and birth date (time optional): the name personalises greetings; with a time the Kundli is made straight away.
  let profileBusy = false;
  /* ---- Scroll wheels for the date and time of birth (like a phone's own pickers). They fill the hidden inputs only
     once the user has turned them, so an untouched wheel never saves a made-up birth date. ---- */
  const WHEEL_ROW = 44;
  function wheel(values, index, onPick) {
    const box = el('div', 'wheel');
    const list = el('div', 'wheel-list');
    values.forEach((value, i) => {
      const item = el('div', `wheel-item${i === index ? ' on' : ''}`, value);
      item.addEventListener('click', () => { list.scrollTop = i * WHEEL_ROW; settle(i); });
      list.appendChild(item);
    });
    let timer = null, current = index;
    const settle = i => {
      if (i === current) return;
      current = i;
      Array.from(list.children).forEach((item, n) => { item.className = `wheel-item${n === i ? ' on' : ''}`; });
      onPick(i);
    };
    list.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => settle(Math.max(0, Math.min(values.length - 1, Math.round((list.scrollTop || 0) / WHEEL_ROW)))), 90);
    });
    box.appendChild(list);
    setTimeout(() => { list.scrollTop = index * WHEEL_ROW; }, 0);
    return box;
  }
  const pad2 = n => String(n).padStart(2, '0');
  const wheelState = { y: 2000, m: 1, d: 1, hh: 12, mm: 0, dobTouched: false, tobTouched: false };
  function renderWheels() {
    const dobBox = $('dob-wheels'), tobBox = $('tob-wheels');
    if (!dobBox || !tobBox) return;
    const thisYear = new Date().getFullYear(), years = [];
    for (let y = 1930; y <= thisYear; y += 1) years.push(y);
    const days = new Date(Date.UTC(wheelState.y, wheelState.m, 0)).getUTCDate();
    if (wheelState.d > days) wheelState.d = days;
    const writeDob = () => { wheelState.dobTouched = true; $('welcome-dob').value = `${wheelState.y}-${pad2(wheelState.m)}-${pad2(wheelState.d)}`; };
    const writeTob = () => { wheelState.tobTouched = true; $('welcome-tob').value = `${pad2(wheelState.hh)}:${pad2(wheelState.mm)}`; };
    dobBox.replaceChildren(
      wheel(Array.from({ length: days }, (_, i) => pad2(i + 1)), wheelState.d - 1, i => { wheelState.d = i + 1; writeDob(); }),
      wheel(Array.from({ length: 12 }, (_, i) => calendarUI.monthName(state.lang, i)), wheelState.m - 1, i => { wheelState.m = i + 1; writeDob(); renderWheels(); }),
      wheel(years.map(String), years.indexOf(wheelState.y), i => { wheelState.y = years[i]; writeDob(); renderWheels(); }));
    const colon = el('span', 'wheel-colon', ':');
    tobBox.replaceChildren(
      wheel(Array.from({ length: 24 }, (_, i) => pad2(i)), wheelState.hh, i => { wheelState.hh = i; writeTob(); }),
      colon,
      wheel(Array.from({ length: 60 }, (_, i) => pad2(i)), wheelState.mm, i => { wheelState.mm = i; writeTob(); }));
  }

  /* ---- An ad box (300 x 250) under the language and birth-date steps, in the Android app (admin switch). ---- */
  let onbBannerOn = false;
  async function onboardingBanner(show) {
    const admob = admobPlugin(), config = appAds.waiting || appAds.config;
    const root = document.documentElement;
    if (!show) {
      if (!onbBannerOn) return;
      onbBannerOn = false;
      try { root.style.setProperty('--onb-ad', '0px'); } catch (_error) { /* optional */ }
      try { await admob.removeBanner(); } catch (_error) { /* gone */ }
      return;
    }
    if (onbBannerOn || state.onboarded || !admob || !config || config.onboarding_banner !== true || !adUnitOk(config.banner_id)) return;
    onbBannerOn = true;
    try {
      await within(ensureAdmob(admob, config), 6000);
      if (!onbBannerOn) return;
      await admob.showBanner({ adId: config.banner_id, adSize: 'MEDIUM_RECTANGLE', position: 'BOTTOM_CENTER', margin: 8, isTesting: config.testing === true });
      if (!onbBannerOn) { try { await admob.removeBanner(); } catch (_error) { /* gone */ } return; }   // the step was left meanwhile
      try { root.style.setProperty('--onb-ad', '270px'); } catch (_error) { /* optional */ }
    } catch (_error) { onbBannerOn = false; }
  }
  // Onboarding: once date, time and place of birth are in, a short animated screen draws the chart being built
  // (a wheel of the 12 signs, each planet settling into its real sign) while the real calculation runs on the server,
  // ending on the Sun sign. Resolves to the same shape as post('/api/birth-chart', ...); never throws.
  async function chartBuildOverlay(profile) {
    const overlay = el('div', 'chart-build');
    const card = el('div', 'chart-build-card');
    const title = el('h3', 'chart-build-title', t('placingLights'));
    const recap = el('p', 'chart-build-recap', [profile.dob, profile.tob, profile.pob].filter(Boolean).join(' · '));
    const hint = el('p', 'chart-build-hint', t('chartBuildHint'));
    const svg = svgEl('svg', { class: 'chart-build-wheel', viewBox: '0 0 200 200', 'aria-hidden': 'true' });
    svg.append(svgEl('circle', { cx: 100, cy: 100, r: 90, class: 'chart-build-ring' }), svgEl('circle', { cx: 100, cy: 100, r: 62, class: 'chart-build-ring' }));
    const angleOf = signIndex => (Math.PI / 180) * (-90 + signIndex * 30 + 15);
    RASHI_GLYPHS.forEach((glyph, index) => {
      const angle = angleOf(index);
      svg.appendChild(svgEl('text', { x: 100 + 82 * Math.cos(angle), y: 100 + 82 * Math.sin(angle), class: 'chart-build-sign' })).textContent = glyph;
    });
    card.append(title, svg, recap, hint);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    const start = Date.now();
    let result;
    try { result = await post('/api/birth-chart', profile); } catch (_error) { result = { ok: false, body: null }; }
    const elapsed = Date.now() - start;
    if (elapsed < 900) await wait(900 - elapsed);   // the wheel is visible for a moment even when the server answers at once
    if (result.ok && result.body && result.body.chart) {
      const chart = result.body.chart;
      for (const name of PLANET_ORDER) {
        const position = chart.positions[name];
        if (!position) continue;
        const angle = angleOf(position.rashi_index - 1);   // rashi_index is 1-12 (Aries..Pisces); the wheel is drawn 0-11
        const dot = svgEl('circle', { cx: 100 + 62 * Math.cos(angle), cy: 100 + 62 * Math.sin(angle), r: 6, class: 'chart-build-dot' });
        dot.style.fill = PLANET_COLORS[name] || '#fff';
        svg.appendChild(dot);
        await wait(140);
      }
      title.textContent = `${signName(chart.positions.Sun.rashi_index)} ${bodyName('Sun')}`;
      card.removeChild(hint);
      await wait(900);
    }
    try { document.body.removeChild(overlay); } catch (_error) { /* gone */ }
    return result;
  }
  async function finishProfile(skip = false) {
    if (profileBusy) return;
    profileBusy = true;
    const name = skip ? '' : $('welcome-name').value.trim().slice(0, 40);
    const dob = skip ? '' : $('welcome-dob').value, tob = skip ? '' : $('welcome-tob').value;
    state.userName = name;
    state.userDob = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : '';
    const pob = $('welcome-city').value.trim();
    if (state.userDob && /^\d{2}:\d{2}$/.test(tob)) saveProfile({ dob: state.userDob, pob, tob });
    await onboardingBanner(false);
    await onboardingAd();
    if (state.userDob && tob) {
      const { ok, body } = await chartBuildOverlay({ dob: state.userDob, pob, tob });
      if (ok && body && body.chart) { applyChart(body, { dob: state.userDob, pob, tob }); intake.step = null; resetChat(t('chartReady')); }
    }
    finishWelcome();
    profileBusy = false;
    if (state.userDob && !tob) { try { document.querySelector('[name="dob"]').value = state.userDob; } catch (_error) { /* optional */ } }
  }
  $('profile-next').addEventListener('click', () => { void finishProfile(); });
  $('profile-skip').addEventListener('click', () => { void finishProfile(true); });
  function finishWelcome() {
    if (onbBannerOn) void onboardingBanner(false);
    if (!$('welcome-city').value.trim()) return;
    applyLanguage(choice.value);
    state.city = $('welcome-city').value.trim();
    state.useLocation = state.pendingLocation; state.pendingLocation = false;
    state.onboarded = true;
    $('welcome-screen').hidden = true;
    document.body.classList.remove('onboarding-active');
    saveSettings();
    startHome();
    if (appAds.waiting) { const config = appAds.waiting; appAds.waiting = null; void startAppAds(config); }   // the banner only after the welcome steps
    void scheduleNotifications();   // now that the city is known
    void wait(1500).then(maybeOfferUpdate);
  }

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
  function wirePlaceSuggestions(input) {
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
  }
  document.querySelectorAll('input[list="place-suggestions"]').forEach(wirePlaceSuggestions);

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
    $('day-cards').replaceChildren(); $('share-day').hidden = true; $('day-cards-hint').textContent = '';
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
    if (!lines || !lines.length) return null;
    const head = el('h4', null, chartUI.remedyHead(state.lang));
    card.appendChild(head);
    const list = el('ul', 'rashi-planets remedies');
    for (const line of lines) list.appendChild(el('li', null, line));
    card.appendChild(list);
    card.appendChild(el('p', 'muted-note', chartUI.remedyNote(state.lang)));
    return head;
  }
  /* ---- Palm reading: pick a hand, take a photo (the phone's camera), the AI reads the lines ---- */
  const palmCopy = () => toolText().palm || TOOLS_COPY.en.palm;
  const REKHA_COLORS = { heart: '#ff5fc4', head: '#5fb4ff', life: '#5fe0a0', fate: '#ffd24a' };
  // Draws the AI's line points (0..1 fractions of the photo) over the photo once its real size is known, so the
  // traced lines land on the actual palm and not on the letterboxed edges of a differently shaped crop.
  function drawRekhaOverlay(svg, points, width, height) {
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    for (const line of ['life', 'fate', 'head', 'heart']) {   // draw order only; stable regardless of key order from the AI
      const path = points[line];
      if (!path || path.length < 2) continue;
      const d = path.map((p, i) => `${i ? 'L' : 'M'}${(p[0] * width).toFixed(1)} ${(p[1] * height).toFixed(1)}`).join(' ');
      svg.appendChild(svgEl('path', { d, class: `rekha-line rekha-${line}`, stroke: REKHA_COLORS[line], 'stroke-width': 3, 'pathLength': 1 }));
    }
  }
  // The photo plus, when the AI traced any lines, a same-size SVG over it; 'contain' (not the plain preview's 'cover')
  // so the overlay's 0..1 fractions always match the whole photo, with nothing cropped off before the lines are drawn.
  function palmPhotoBox(src, points) {
    const wrap = el('div', 'palm-photo');
    const photo = el('img', 'palm-preview'); photo.src = src; photo.alt = '';
    wrap.appendChild(photo);
    const usable = points && Object.keys(points).some(line => points[line] && points[line].length >= 2);
    if (usable) {
      wrap.classList.add('has-rekha');
      const svg = svgEl('svg', { class: 'rekha-overlay', viewBox: '0 0 1 1', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
      const draw = () => drawRekhaOverlay(svg, points, photo.naturalWidth || 1, photo.naturalHeight || 1);
      if (photo.complete && photo.naturalWidth) draw(); else photo.addEventListener('load', draw, { once: true });
      wrap.appendChild(svg);
    }
    return { box: wrap, usable };
  }
  const palmState = { hand: 'right', step: 'pick', reading: null, status: '', tab: 0, preview: null };
  function openPalm() { palmState.step = 'pick'; palmState.reading = null; palmState.status = ''; palmState.tab = 0; palmState.preview = null; showPage('palm'); renderPalm(); }
  // The photo is made smaller on the phone (longest side 1024 px, JPEG) before it is sent; it is never stored.
  function shrinkPhoto(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('image'));
        img.onload = () => {
          const scale = Math.min(1, 1024 / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  async function readPalm(image) {
    palmState.step = 'reading'; renderPalm();
    try {
      const { ok, body } = await post('/api/palm', { hand: palmState.hand, language: state.lang, image });
      palmState.status = ok && body ? body.status : 'unavailable';
      palmState.reading = ok && body && body.reading ? body.reading : null;
    } catch (_error) { palmState.status = 'unavailable'; palmState.reading = null; }
    palmState.step = 'result'; renderPalm();
    if (palmState.reading) ratingCompleted('palm');
  }
  // A photo is ready (from the camera or the gallery): shrink it if needed, then read it (behind a ▶ button when the ad is on).
  async function handlePalmPhoto(photo) {
    try {
      palmState.preview = photo;   // shown on the result; kept in memory only
      // With "watch an ad to see the reading" on, the photo waits behind a ▶ button (the camera must open first:
      // Android only opens it straight from a tap, not after an ad).
      if (rewardedFor('palm')) { palmState.photo = photo; palmState.step = 'ready'; renderPalm(); } else await readPalm(photo);
    } catch (_error) { palmState.step = 'result'; palmState.status = 'unavailable'; renderPalm(); }
  }
  // The phone's own camera app (or the gallery): works everywhere.
  function choosePalmPhoto() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.setAttribute('capture', 'environment');
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      try { await handlePalmPhoto(await shrinkPhoto(file)); } catch (_error) { palmState.step = 'result'; palmState.status = 'unavailable'; renderPalm(); }
    });
    input.click();
  }
  // The in-app camera: a hand outline to line the palm up with, a shutter, and the gallery. If the camera cannot be
  // opened here (older app, no permission, a browser without it), the phone's camera app is used instead.
  const camCopy = () => palmCopy().cam || TOOLS_COPY.en.palm.cam;
  const SVG_PHOTOS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="2" fill="currentColor"/><path d="M4 18l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  function handOutline() {
    const svg = svgEl('svg', { viewBox: '0 0 200 260', preserveAspectRatio: 'xMidYMid meet', class: 'cam-outline', 'aria-hidden': 'true' });
    const shapes = [['rect', { x: 55, y: 120, width: 90, height: 108, rx: 30 }], ['rect', { x: 58, y: 46, width: 21, height: 92, rx: 10.5 }], ['rect', { x: 83, y: 30, width: 21, height: 108, rx: 10.5 }],
      ['rect', { x: 108, y: 42, width: 21, height: 96, rx: 10.5 }], ['rect', { x: 133, y: 70, width: 19, height: 76, rx: 9.5 }], ['rect', { x: 22, y: 128, width: 23, height: 78, rx: 11.5, transform: 'rotate(-32 33 167)' }]];
    // Only the ring around the hand's silhouette is drawn: the shapes grown by a stroke, minus the shapes themselves.
    const mask = svgEl('mask', { id: 'cam-ring' });
    const grown = svgEl('g', { fill: '#fff', stroke: '#fff', 'stroke-width': 7 }), inner = svgEl('g', { fill: '#000' });
    for (const [tag, attrs] of shapes) { grown.appendChild(svgEl(tag, attrs)); inner.appendChild(svgEl(tag, attrs)); }
    mask.append(grown, inner);
    svg.append(mask, svgEl('rect', { width: 200, height: 260, fill: '#fff', mask: 'url(#cam-ring)' }));
    return svg;
  }
  function frameIsDark(canvas) {
    try {
      const small = document.createElement('canvas'); small.width = 32; small.height = 32;
      const ctx = small.getContext('2d'); ctx.drawImage(canvas, 0, 0, 32, 32);
      const data = ctx.getImageData(0, 0, 32, 32).data; let sum = 0;
      for (let i = 0; i < data.length; i += 4) sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      return sum / (data.length / 4) < 45;
    } catch (_error) { return false; }
  }
  async function startPalmScan() {
    const media = navigator.mediaDevices;
    if (!media || typeof media.getUserMedia !== 'function') { choosePalmPhoto(); return; }
    let stream;
    try { stream = await media.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false }); } catch (_error) { choosePalmPhoto(); return; }
    const copy = camCopy(), overlay = el('div', 'cam');
    const video = el('video', 'cam-video'); video.setAttribute('playsinline', ''); video.muted = true; video.autoplay = true; video.srcObject = stream;
    const hint = el('div', 'cam-hint', copy.hint);
    const close = el('button', 'cam-btn cam-close', '✕'); close.type = 'button'; close.setAttribute('aria-label', copy.close);
    const gallery = el('button', 'cam-btn cam-gallery'); gallery.type = 'button'; gallery.innerHTML = SVG_PHOTOS; gallery.setAttribute('aria-label', copy.gallery);
    const shutter = el('button', 'cam-shutter'); shutter.type = 'button'; shutter.setAttribute('aria-label', copy.snap); shutter.appendChild(el('i'));
    const bar = el('div', 'cam-bar'); bar.append(gallery, shutter, el('span'));
    overlay.append(video, handOutline(), hint, close, bar);
    let warned = false;
    const stop = () => { try { stream.getTracks().forEach(track => track.stop()); } catch (_error) { /* gone */ } try { overlay.remove(); } catch (_error) { /* gone */ } setBannerHidden('camera', false); };
    close.addEventListener('click', stop);
    gallery.addEventListener('click', () => { stop(); const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', async () => { const file = input.files && input.files[0]; if (file) { try { await handlePalmPhoto(await shrinkPhoto(file)); } catch (_error) { palmState.step = 'result'; palmState.status = 'unavailable'; renderPalm(); } } });
      input.click(); });
    shutter.addEventListener('click', async () => {
      const width = video.videoWidth || 720, height = video.videoHeight || 960, scale = Math.min(1, 1024 / Math.max(width, height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
      let photo;
      try { canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height); photo = canvas.toDataURL('image/jpeg', 0.82); } catch (_error) { stop(); choosePalmPhoto(); return; }
      if (!warned && frameIsDark(canvas)) { warned = true; hint.textContent = copy.dark; hint.className = 'cam-hint warn'; return; }   // once; the second try goes ahead
      stop();
      await handlePalmPhoto(photo);
    });
    setBannerHidden('camera', true);
    document.body.appendChild(overlay);
    try { await video.play(); } catch (_error) { /* shown anyway */ }
  }
  function renderPalm() { renderPalmBody(); decorate($('palmread'), palmCopy().title); }
  function renderPalmBody() {
    const copy = palmCopy(), box = $('palmread'), art = window.JyotishaArt;
    box.replaceChildren();
    if (palmState.step === 'pick') {
      box.appendChild(el('p', 'tarot-ask', copy.step));
      const hands = el('div', 'palm-hands');
      for (const hand of ['left', 'right']) {
        const tile = el('button', `palm-hand ${hand}${palmState.hand === hand ? ' on' : ''}`); tile.type = 'button';
        const pic = el('span', 'palm-pic'); if (art) pic.innerHTML = art.palm();
        tile.append(pic, el('b', null, copy[hand]));
        tile.addEventListener('click', () => { palmState.hand = hand; renderPalm(); });
        hands.appendChild(tile);
      }
      box.appendChild(hands);
      const tips = el('div', 'palm-tips');
      tips.appendChild(el('h4', null, copy.tipsTitle));
      for (const tip of copy.tips) tips.appendChild(el('p', null, `✓ ${tip}`));
      tips.appendChild(el('small', null, `🔒 ${copy.privacy}`));
      box.appendChild(tips);
      const scan = el('button', 'palm-scan', `📷 ${copy.scan}`); scan.type = 'button';
      scan.addEventListener('click', () => { void startPalmScan(); });
      box.appendChild(scan);
      return;
    }
    if (palmState.step === 'ready') {
      const pic = el('div', 'palm-scanning'); if (art) pic.innerHTML = art.palm();
      const see = el('button', 'palm-scan reward-btn', copy.see); see.type = 'button';
      see.addEventListener('click', async () => {
        if (!(await watchForResult())) return;
        const photo = palmState.photo; palmState.photo = null;
        void readPalm(photo);
      });
      box.append(pic, el('p', 'palm-wait', copy.ready), see);
      return;
    }
    if (palmState.step === 'reading') {
      box.appendChild(loader(copy.reading));
      return;
    }
    const reading = palmState.reading, lines = [];
    if (!reading) {
      box.appendChild(el('p', 'palm-wait', palmState.status === 'not_palm' ? copy.notPalm : palmState.status === 'off' ? copy.off : copy.failed));
    } else {
      // The user's own photo (kept in memory only, never stored), then tabs: Palm (life line + overview), Love (heart line),
      // Career (head and fate lines). All three panels are in the page; only the chosen one is shown.
      if (palmState.preview) {
        const { box: photoBox, usable } = palmPhotoBox(palmState.preview, reading.points);
        box.appendChild(photoBox);
        if (usable) {
          const legend = el('div', 'rekha-legend');
          for (const key of ['heart', 'head', 'life', 'fate']) {
            if (!reading.points[key] || reading.points[key].length < 2) continue;
            const chip = el('span', 'rekha-chip'), dot = el('i'); dot.style.background = REKHA_COLORS[key];
            chip.append(dot, document.createTextNode(copy.lines[key]));
            legend.appendChild(chip);
          }
          box.append(legend, el('small', 'muted-note rekha-note', copy.rekhaNote || TOOLS_COPY.en.palm.rekhaNote));
        }
      }
      const tabNames = copy.tabs || TOOLS_COPY.en.palm.tabs;
      const palmContext = `${localIso(new Date())}-${palmState.hand}`;
      const palmUnlocked = contentUnlocked('palm_detailed', palmContext);
      const groups = palmUnlocked ? [['life', 'summary'], ['heart'], ['head', 'fate']] : [['life', 'summary']];
      const icons = { heart: '❤️', head: '🧠', life: '🌱', fate: '⭐', summary: '✨' };
      const tabs = el('div', 'tabs-line'); tabs.setAttribute('role', 'tablist');
      const panels = groups.map((keys, index) => {
        const panel = el('div', 'palm-panel'); panel.hidden = index !== palmState.tab;
        for (const key of keys) {
          const sec = el('section', `palm-sec${key === 'summary' ? ' summary' : ''}`);
          sec.append(el('h4', null, `${icons[key]} ${copy.lines[key]}`), el('p', null, reading[key]));
          panel.appendChild(sec);
          lines.push(`${icons[key]} ${copy.lines[key]}\n${reading[key]}`);
        }
        return panel;
      });
      tabNames.slice(0, groups.length).forEach((name, index) => {
        const button = el('button', index === palmState.tab ? 'on' : '', name); button.type = 'button';
        button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', index === palmState.tab ? 'true' : 'false');
        button.addEventListener('click', () => {
          palmState.tab = index;
          Array.from(tabs.children).forEach((tab, n) => { tab.className = n === index ? 'on' : ''; tab.setAttribute('aria-selected', n === index ? 'true' : 'false'); });
          panels.forEach((panel, n) => { panel.hidden = n !== index; });
        });
        tabs.appendChild(button);
      });
      box.appendChild(tabs);
      panels.forEach(panel => box.appendChild(panel));
      if (!palmUnlocked) { const offer = premiumOffer('palm_detailed', palmContext, renderPalm); if (offer) box.appendChild(offer); }
    }
    const actions = el('div', 'tarot-actions');
    if (reading) {
      const askAi = el('button', 'rashi-ask', `✨ ${copy.askAi}`); askAi.type = 'button';
      askAi.addEventListener('click', () => {
        const question = fill(copy.askQ, { summary: reading.summary.slice(0, 180) }).slice(0, 290);
        showPage('chat'); ask(question, question, true);
      });
      const share = el('button', 'chip-btn', `↗ ${copy.share}`); share.type = 'button';
      share.addEventListener('click', () => { void shareText(`✋ ${copy.title}`, lines.join('\n\n')); });
      actions.append(askAi, share);
    }
    const again = el('button', 'chip-btn', `↻ ${copy.again}`); again.type = 'button';
    again.addEventListener('click', () => { palmState.step = 'pick'; palmState.tab = 0; palmState.preview = null; renderPalm(); });
    actions.appendChild(again);
    box.appendChild(actions);
  }
  /* ---- Shared screen pieces (Palm-AI style): a page header, and a loading screen with a % bar and a fun fact ---- */
  const SVG_BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SVG_HOME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  const SVG_SHARE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4l4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function goBack() {
    try { if (window.history && typeof window.history.back === 'function' && window.history.length > 1) { window.history.back(); return; } } catch (_error) { /* fall through */ }
    showPage('home');
  }
  const textOf = node => (node.textContent || '').trim() || (node.children ? Array.from(node.children).map(textOf).filter(Boolean).join('\n') : '');
  // Text of every reading section on a page, for the share icon.
  function pageShareText(box) {
    const parts = [];
    const walk = node => {
      if (!node || !node.children) return;
      for (const child of node.children) {
        if (/(^| )(palm-sec|num-sec|tarot-sec|moon-sec|lg-aspect|sm-result)( |$)/.test(child.className || '')) parts.push(textOf(child));
        else walk(child);
      }
    };
    walk(box);
    return parts.filter(Boolean).join('\n\n');
  }
  // [← back] [title] [🏠] [share]; the share icon only shows when there is a reading to share.
  function pageHeader(title, box) {
    const menu = toolText().menu || TOOLS_COPY.en.menu;
    const head = el('div', 'page-head');
    const back = el('button', 'ph-btn ph-back'); back.type = 'button'; back.innerHTML = SVG_BACK; back.setAttribute('aria-label', menu.back || 'Back');
    back.addEventListener('click', goBack);
    const right = el('span', 'ph-right');
    const home = el('button', 'ph-btn'); home.type = 'button'; home.innerHTML = SVG_HOME; home.setAttribute('aria-label', menu.home);
    home.addEventListener('click', () => showPage('home'));
    right.appendChild(home);
    const text = box ? pageShareText(box) : '';
    if (text) {
      const share = el('button', 'ph-btn'); share.type = 'button'; share.innerHTML = SVG_SHARE; share.setAttribute('aria-label', menu.shareReading || 'Share');
      share.addEventListener('click', () => { void shareText(title, text); });
      right.appendChild(share);
    }
    head.append(back, el('h2', 'ph-title', title), right);
    return head;
  }
  // Put the header on top of a page that has just been drawn.
  function decorate(box, title) { box.replaceChildren(pageHeader(title, box), ...Array.from(box.children)); }
  // Fun facts shown while a reading is prepared (true, general Vedic facts).
  const FUN_FACTS = {
    en: ['Vedic astrology uses 27 nakshatras, the “lunar mansions” the Moon passes through.', 'A tithi is a lunar day: there are 30 in every lunar month.', 'The Moon stays about 2¼ days in each rashi.', '“Panchang” means five limbs: tithi, vara, nakshatra, yoga and karana.', 'Abhijit muhurta is the lucky window around midday.', 'Palmistry traditionally reads the heart, head, life and fate lines.', 'Your Moon sign (Janma Rashi) is the base of most Indian horoscopes.', 'Rahu Kalam lasts about 90 minutes each day and changes with the weekday.'],
    te: ['వైదిక జ్యోతిష్యంలో చంద్రుడు సంచరించే 27 నక్షత్రాలు ఉన్నాయి.', 'తిథి అంటే చాంద్రమాన దినం: ఒక చాంద్రమాసంలో 30 తిథులు ఉంటాయి.', 'చంద్రుడు ఒక్కో రాశిలో సుమారు 2¼ రోజులు ఉంటాడు.', '“పంచాంగం” అంటే ఐదు అంగాలు: తిథి, వారం, నక్షత్రం, యోగం, కరణం.', 'అభిజిత్ ముహూర్తం మధ్యాహ్నం వేళ ఉండే శుభ సమయం.', 'హస్త సాముద్రికం హృదయ, మస్తిష్క, జీవన, భాగ్య రేఖలను చదువుతుంది.', 'మీ జన్మ రాశి (చంద్ర రాశి) చాలా భారతీయ జాతకాలకు ఆధారం.', 'రాహుకాలం రోజూ సుమారు 90 నిమిషాలు, వారాన్ని బట్టి మారుతుంది.'],
    hi: ['वैदिक ज्योतिष में चंद्रमा 27 नक्षत्रों से होकर गुज़रता है।', 'तिथि चंद्र दिवस है: एक चंद्र मास में 30 तिथियाँ होती हैं।', 'चंद्रमा हर राशि में लगभग 2¼ दिन रहता है।', '“पंचांग” का अर्थ है पाँच अंग: तिथि, वार, नक्षत्र, योग और करण।', 'अभिजित मुहूर्त दोपहर के आसपास का शुभ समय है।', 'हस्त रेखा शास्त्र हृदय, मस्तिष्क, जीवन और भाग्य रेखा पढ़ता है।', 'आपकी जन्म राशि (चंद्र राशि) अधिकतर भारतीय कुंडलियों का आधार है।', 'राहुकाल रोज़ लगभग 90 मिनट का होता है और वार के अनुसार बदलता है।'],
  };
  const funFacts = () => copyFor(FUN_FACTS, 'facts');
  // The loading screen: a glowing orb, the label, a bar that creeps towards 90% (it ends by itself), and a fun fact.
  function loader(label) {
    const wrap = el('div', 'loader');
    const orb = el('div', 'loader-orb'); if (window.JyotishaArt) orb.innerHTML = window.JyotishaArt.orb();
    const bar = el('div', 'loader-bar'), fill = el('i'), pct = el('span', 'loader-pct', '0%');
    bar.appendChild(fill);
    const facts = funFacts(), start = Math.floor(Math.random() * facts.length);
    const fact = el('div', 'loader-fact'); fact.append(el('small', null, (toolText().menu || TOOLS_COPY.en.menu).funFact || 'FUN FACT'), el('p', null, facts[start]));
    wrap.append(orb, el('h3', 'loader-label', label), el('div', 'loader-row'), fact);
    wrap.children[2].append(bar, pct);
    let n = 0;
    const tick = () => {
      n += 1;
      const value = Math.min(90, Math.round(90 * (1 - Math.exp(-n / 14))));
      if (fill.style) fill.style.width = `${value}%`;
      pct.textContent = `${value}%`;
      if (n % 12 === 0) fact.children[1].textContent = facts[(start + n / 12) % facts.length];
      if (n < 80) setTimeout(tick, 250);   // bounded: stops after about 20 seconds
    };
    setTimeout(tick, 250);
    return wrap;
  }

  /* ---- Side menu (☰): every feature in one list, opened from the header ---- */
  let menuHistory = false;   // the open menu added a history step (so the phone's Back closes it)
  function menuItems() {
    const text = toolText(), copy = text.tools, menu = text.menu || TOOLS_COPY.en.menu;
    return [
      ['home', '🏠', menu.home, () => showPage('home')],
      ['chat', '💬', copy.chat[0], () => showPage('chat')],
      ['kundli', '📜', copy.jathakam[0], openJathakam],
      ['lifeguide', '⚖️', lgCopy().card[0], openLifeGuide],
      ['rashi', '🔮', copy.rashi[0], () => showPage('rashi')],
      ['moon', '🌙', moonCopy().card[0], openMoonSign],
      ['palm', '✋', palmCopy().card[0], openPalm],
      ['tarot', '🃏', tarotCopy().card[0], openTarot],
      ['numbers', '🔢', numCopy().card[0], openNumerology],
      ['relationship', '💞', copy.match[0], () => openTool('relationship')],
      ['signmatch', '💑', smCopy().card[0], openSignMatch],
      ['doshas', '🧿', copy.doshas[0], () => openTool('kundli', 'doshas')],
      ['dasha', '⏳', copy.dasha[0], () => openTool('kundli', 'dasha')],
      ['calendar', '🪔', copy.festivals[0], () => showPage('calendar')],
      ['panchang', '🌅', menu.panchang, toPanchang],
      ['look', '🎨', menu.appearance, () => { renderLookPanel(); $('theme-panel').hidden = false; }],
      ['share', '📤', menu.shareApp || TOOLS_COPY.en.menu.shareApp, shareApp],
      ['rate', '⭐', menu.rateApp || TOOLS_COPY.en.menu.rateApp, rateApp],
      ['privacy', '🔒', menu.privacy, () => { try { window.location.href = '/privacy'; } catch (_error) { /* optional */ } }],
    ];
  }
  const PLAY_URL = 'https://play.google.com/store/apps/details?id=store.karthiktraders.jyotisha';
  function shareApp() { void shareText('Jyotirmaya AstroChat', `${(toolText().menu || TOOLS_COPY.en.menu).shareLine || TOOLS_COPY.en.menu.shareLine}\n${PLAY_URL}`); }
  const RATING_KEY = 'jyotisha.rating.v1';
  const ratingCopy = () => ({
    te: { title: 'Jyotirmaya నచ్చిందా?', body: 'మీ అనుభవానికి ఎన్ని stars ఇస్తారు?', reason: 'ఏం improve చేయాలో చెప్పండి', placeholder: 'మీకు నచ్చనిది లేదా ఎదురైన సమస్య…', send: 'Feedback పంపండి', thanks: 'ధన్యవాదాలు! మీ feedback మాకు చాలా ఉపయోగపడుతుంది.', close: 'తర్వాత' },
    hi: { title: 'Jyotirmaya कैसा लगा?', body: 'आप अपने अनुभव को कितने stars देंगे?', reason: 'हमें बताएं कि क्या सुधारना चाहिए', placeholder: 'आपको क्या पसंद नहीं आया या क्या समस्या हुई…', send: 'Feedback भेजें', thanks: 'धन्यवाद! आपका feedback हमें बेहतर बनाने में मदद करेगा।', close: 'बाद में' },
  }[state.lang] || { title: 'Enjoying Jyotirmaya?', body: 'How many stars would you give your experience?', reason: 'Please tell us what we should improve', placeholder: 'What did you dislike or what went wrong?', send: 'Send feedback', thanks: 'Thank you! Your feedback helps us improve.', close: 'Maybe later' });
  function ratingState() {
    try { return JSON.parse(window.localStorage.getItem(RATING_KEY)) || {}; } catch (_error) { return {}; }
  }
  function rememberRating(value) { try { window.localStorage.setItem(RATING_KEY, JSON.stringify(value)); } catch (_error) { /* optional */ } }
  // Count only completed user results. Merely opening or restoring a page never calls this function.
  function ratingCompleted(feature) {
    const saved = ratingState();
    if (saved.submitted) return;
    rememberRating({ ...saved, completed: (Number(saved.completed) || 0) + 1, lastFeature: feature });
    setTimeout(maybeAskForRating, 1200);
  }
  function maybeAskForRating() {
    if (!document || typeof document.querySelector !== 'function') return;
    const saved = ratingState();
    if (saved.submitted || (saved.snoozeUntil && Date.now() < saved.snoozeUntil)
      || (saved.nextCompletion && (Number(saved.completed) || 0) < saved.nextCompletion)) return;
    rateApp(true);
  }
  function rateApp(automatic = false) {
    if (!document || typeof document.querySelector !== 'function' || document.querySelector('.rating-popup')) return;
    const copy = ratingCopy(), overlay = el('div', 'update-popup rating-popup'), card = el('div', 'update-popup-card');
    const stars = el('div', 'rating-stars'); stars.setAttribute('role', 'group'); stars.setAttribute('aria-label', copy.body);
    const reason = el('div', 'rating-reason'); reason.hidden = true;
    const textarea = el('textarea'); textarea.rows = 4; textarea.maxLength = 500; textarea.placeholder = copy.placeholder;
    const error = el('p', 'rating-error');
    const send = el('button', 'btn', copy.send); send.type = 'button';
    reason.append(el('label', null, copy.reason), textarea, error, send);
    const later = el('button', 'link-btn', copy.close); later.type = 'button';
    const close = submitted => {
      try { document.body.removeChild(overlay); } catch (_error) { /* gone */ }
      if (!submitted && automatic) {
        const saved = ratingState(), completed = Number(saved.completed) || 0;
        rememberRating({ ...saved, submitted: false, snoozeUntil: Date.now() + 7 * 86400000, nextCompletion: completed + 3 });
      }
    };
    const thank = () => {
      card.replaceChildren(el('strong', 'update-popup-title', copy.title), el('p', 'update-popup-body', copy.thanks));
      const done = el('button', 'btn', 'OK'); done.type = 'button'; done.addEventListener('click', () => close(true)); card.appendChild(done);
    };
    for (let value = 1; value <= 5; value += 1) {
      const star = el('button', null, '★'); star.type = 'button'; star.setAttribute('aria-label', `${value} / 5`);
      star.addEventListener('click', () => {
        stars.querySelectorAll('button').forEach((button, index) => button.classList.toggle('on', index < value));
        reason.hidden = value >= 3;
        error.textContent = '';
        if (value < 3) { textarea.focus(); send.onclick = async () => {
          const note = textarea.value.trim(); if (!note) { error.textContent = copy.reason; return; }
          send.disabled = true;
          try {
            const result = await post('/api/rating', { stars: value, reason: note, language: state.lang });
            if (!result.ok) throw new Error((result.body && result.body.error) || 'Could not send feedback');
            rememberRating({ submitted: true, stars: value }); thank();
          } catch (caught) { error.textContent = caught.message; send.disabled = false; }
        }; }
        else {
          rememberRating({ submitted: true, stars: value });
          void post('/api/rating', { stars: value, reason: '', language: state.lang });
          if (value === 5) { close(true); try { window.open(PLAY_URL, '_blank'); } catch (_error) { window.location.href = PLAY_URL; } }
          else thank();
        }
      });
      stars.appendChild(star);
    }
    later.addEventListener('click', () => close(false));
    card.append(el('strong', 'update-popup-title', copy.title), el('p', 'update-popup-body', copy.body), stars, reason, later);
    overlay.appendChild(card); document.body.appendChild(overlay);
  }
  function renderMenu() {
    const menu = toolText().menu || TOOLS_COPY.en.menu;
    $('side-title').textContent = menu.title;
    $('menu-btn').setAttribute('aria-label', menu.open);
    $('side-close').setAttribute('aria-label', menu.close);
    $('side-list').replaceChildren(...menuItems().map(([key, icon, label, go]) => {
      const item = el('button', `side-item${key === currentPage ? ' on' : ''}`); item.type = 'button';
      item.append(el('span', 'side-icon', icon), el('span', null, label));
      item.addEventListener('click', () => chooseFromMenu(go));
      return item;
    }));
  }
  function hideMenu() {
    $('side-menu').hidden = true;
    $('menu-btn').setAttribute('aria-expanded', 'false');
    if (document.body && document.body.classList) document.body.classList.remove('menu-open');
  }
  function openMenu() {
    renderMenu();
    $('side-menu').hidden = false;
    $('menu-btn').setAttribute('aria-expanded', 'true');
    if (document.body && document.body.classList) document.body.classList.add('menu-open');
    menuHistory = false;
    try {
      if (window.history && typeof window.history.pushState === 'function') { window.history.pushState({ page: currentPage, menu: true }, '', `#${currentPage}`); menuHistory = true; }
    } catch (_error) { /* history is optional */ }
  }
  // Closing with ✕ or a tap outside also removes the menu's history step, so Back is not needed twice.
  function closeMenu() {
    if ($('side-menu').hidden) return;
    hideMenu();
    if (menuHistory) { menuHistory = false; try { window.history.back(); } catch (_error) { /* optional */ } }
  }
  function chooseFromMenu(go) {
    hideMenu();
    const before = currentPage, stepped = menuHistory;
    replaceNext = stepped;
    try { go(); } finally { replaceNext = false; menuHistory = false; }
    if (stepped && currentPage === before) { try { window.history.back(); } catch (_error) { /* optional */ } }   // nothing new opened
  }
  $('menu-btn').addEventListener('click', openMenu);
  $('today-strip').addEventListener('click', openToday);
  $('side-close').addEventListener('click', closeMenu);
  $('side-scrim').addEventListener('click', closeMenu);

  /* ---- Numerology: Moolank, Bhagyank, name number and personal year, worked out on the phone (no AI) ---- */
  const numCopy = () => toolText().numerology || TOOLS_COPY.en.numerology;
  const numState = { dob: '', name: '', editing: false, error: '' };
  const numberDob = () => numState.dob || state.userDob || (loadProfile() || {}).dob || '';
  function numberLine() {
    const tool = window.JyotishaNumerology, dob = numberDob(), copy = numCopy();
    if (!tool || !tool.parse(dob)) return '';
    return `${copy.moolank[0]} ${tool.moolank(dob)} · ${copy.bhagyank[0]} ${tool.bhagyank(dob)}`;
  }
  function openNumerology() { numState.editing = false; numState.error = ''; showPage('numbers'); renderNumerology(); }
  function numberForm(copy, dob, name) {
    const form = el('form', 'num-form');
    const dobInput = el('input'); dobInput.type = 'date'; dobInput.id = 'num-dob'; dobInput.max = '2100-12-31'; dobInput.value = dob;
    const nameInput = el('input'); nameInput.type = 'text'; nameInput.id = 'num-name'; nameInput.maxLength = 60; nameInput.autocomplete = 'name'; nameInput.value = name;
    const field = (label, input) => { const box = el('label', 'num-field'); box.append(el('span', null, label), input); return box; };
    const go = el('button', `palm-scan${rewardedFor('numbers') ? ' reward-btn' : ''}`, `🔢 ${copy.show}`); go.type = 'submit';
    form.append(field(copy.dob, dobInput), field(copy.name, nameInput), go);
    if (numState.error) form.appendChild(el('p', 'num-error', numState.error));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const tool = window.JyotishaNumerology;
      if (!tool || !tool.parse(dobInput.value)) { numState.error = copy.bad; renderNumerology(); return; }
      if (rewardedFor('numbers') && !(await watchForResult())) return;
      Object.assign(numState, { dob: dobInput.value, name: nameInput.value.trim().slice(0, 60), editing: false, error: '' });
      renderNumerology();
      renderTools();
    });
    return form;
  }
  function renderNumerology() { renderNumerologyBody(); decorate($('numerology'), numCopy().title); }
  function renderNumerologyBody() {
    const copy = numCopy(), box = $('numerology'), art = window.JyotishaArt, tool = window.JyotishaNumerology;
    const hero = el('div', 'num-hero'); if (art && art.numerology) hero.innerHTML = art.numerology();
    box.replaceChildren(hero);
    const dob = numberDob(), name = numState.dob ? numState.name : (state.userName || ''), year = new Date().getFullYear();
    const result = tool && !numState.editing && dob ? tool.report(dob, name, state.lang, year) : null;
    if (!result) { box.append(el('p', 'tarot-ask', copy.intro), numberForm(copy, dob, name)); return; }
    let dateText = dob;
    try { dateText = new Intl.DateTimeFormat(state.lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${dob}T12:00:00Z`)); } catch (_error) { /* keep ISO */ }
    const who = el('div', 'num-who');
    const change = el('button', 'chip-btn', `✎ ${copy.change}`); change.type = 'button';
    change.addEventListener('click', () => { numState.editing = true; renderNumerology(); });
    who.append(el('span', null, [name, dateText].filter(Boolean).join(' · ')), change);
    const tiles = el('div', 'num-tiles');
    const tile = (n, label) => { const item = el('div', 'num-tile'); item.append(el('b', 'num-digit', String(n)), el('strong', null, label[0]), el('small', null, label[1])); return item; };
    tiles.append(tile(result.moolank.number, copy.moolank), tile(result.bhagyank.number, copy.bhagyank));
    if (result.name) tiles.appendChild(tile(result.name.number, copy.nameNum));
    box.append(who, tiles);
    const lines = [`🔢 ${copy.title}${name ? ` · ${name}` : ''}`];
    const section = (label, info, extra) => {
      const sec = el('section', 'num-sec');
      const heading = `${label} ${info.number} · ${info.title}`;
      sec.append(el('h4', null, heading), el('p', 'num-planet', `🪐 ${copy.planet}: ${bodyName(info.planet)}`), el('p', null, info.nature),
        el('p', null, `💪 ${copy.strengths}: ${info.strengths}`), el('p', null, `⚠️ ${copy.care}: ${info.care}`));
      if (extra) sec.appendChild(el('p', 'num-harmony', extra));
      lines.push(`${heading}\n${info.nature}`);
      return sec;
    };
    box.appendChild(section(copy.moolank[0], result.moolank));
    box.appendChild(section(copy.bhagyank[0], result.bhagyank));
    if (result.name) box.appendChild(section(copy.nameNum[0], result.name, result.harmony ? `✓ ${copy.harmonyGood}` : `• ${copy.harmonyNeutral}`));
    else box.appendChild(el('p', 'num-note', copy.noName));
    const yearBox = el('section', 'num-sec num-year');
    const yearTitle = `📅 ${fill(copy.year, { year, n: result.year.number })}`;
    yearBox.append(el('h4', null, yearTitle), el('p', null, result.year.text));
    lines.push(`${yearTitle}\n${result.year.text}`);
    const colours = ((toolText().rashi || TOOLS_COPY.en.rashi).colours || TOOLS_COPY.en.rashi.colours)[result.lucky.planet];
    const days = result.lucky.days.map(day => calendarUI.weekdayName(state.lang, day, 'long')).join(', ');
    const lucky = el('section', 'num-lucky');
    lucky.appendChild(el('h4', null, `🍀 ${copy.lucky}`));
    for (const [label, value] of [[copy.luckyNumbers, result.lucky.numbers.join(', ')], [copy.luckyDays, days], [copy.luckyColours, colours]]) {
      const row = el('p'); row.append(el('span', null, label), el('b', null, value)); lucky.appendChild(row);
    }
    box.append(yearBox, lucky);
    const actions = el('div', 'tarot-actions');
    const askAi = el('button', 'rashi-ask', `✨ ${copy.askAi}`); askAi.type = 'button';
    askAi.addEventListener('click', () => {
      const question = fill(copy.askQ, { m: result.moolank.number, b: result.bhagyank.number });
      showPage('chat'); ask(question, question, true);
    });
    const share = el('button', 'chip-btn', `↗ ${copy.share}`); share.type = 'button';
    share.addEventListener('click', () => { void shareText(`🔢 ${copy.title}`, lines.join('\n\n')); });
    actions.append(askAi, share);
    box.append(actions, el('p', 'num-note', copy.note));
  }
  // Numerology, asked straight in chat: the same Moolank/Bhagyank/name-number report, as a compact chat message.
  async function chatNumerology() {
    const tool = window.JyotishaNumerology, dob = numberDob(), copy = numCopy();
    if (!tool || !tool.parse(dob)) { addMessage('assistant', copy.bad); return; }
    if (rewardedFor('numbers') && !(await watchForResult())) return;
    const name = numState.dob ? numState.name : (state.userName || ''), year = new Date().getFullYear();
    const result = tool.report(dob, name, state.lang, year);
    const entry = el('div', 'chat-message assistant');
    entry.appendChild(el('p', null, `🔢 ${copy.title}${name ? ` · ${name}` : ''}`));
    const section = (label, info) => entry.append(el('p', null, `${label} ${info.number} · ${info.title}`), el('p', null, info.nature));
    section(copy.moolank[0], result.moolank);
    section(copy.bhagyank[0], result.bhagyank);
    if (result.name) section(copy.nameNum[0], result.name);
    entry.appendChild(el('p', null, `📅 ${fill(copy.year, { year, n: result.year.number })} ${result.year.text}`));
    chatLog.appendChild(entry); chatLog.scrollTop = chatLog.scrollHeight;
  }
  /* ---- Life Guide: six balance bars (Love, Family, Marriage, Career, Wealth, Health out of 10) for yesterday, today,
     tomorrow, this month and this year, worked out on the server from planet transits and the lunar day (no AI). ---- */
  const lgCopy = () => toolText().lifeguide || TOOLS_COPY.en.lifeguide;
  const LG_AREAS = ['love', 'family', 'marriage', 'career', 'wealth', 'health'];
  const LG_ICONS = { love: '💗', family: '🏡', marriage: '💍', career: '💼', wealth: '🪙', health: '🌿' };
  const LG_TABS = ['yesterday', 'today', 'tomorrow', 'month', 'year'];
  const lg = { sign: 0, tab: 'today', picking: false, cache: {}, info: {}, text: {}, busy: '', failed: false };
  // One rewarded ad opens all tabs of a sign for the rest of the day (Today stays free); remembered on the phone.
  const LG_UNLOCK_KEY = 'jyotisha.lg-unlock.v1';
  function lgUnlocked(sign) {
    try { const saved = JSON.parse(window.localStorage.getItem(LG_UNLOCK_KEY)); return !!(saved && saved.day === localIso(new Date()) && Array.isArray(saved.signs) && saved.signs.includes(sign)); } catch (_error) { return false; }
  }
  function lgUnlock(sign) {
    try {
      const today = localIso(new Date()), saved = JSON.parse(window.localStorage.getItem(LG_UNLOCK_KEY));
      const signs = saved && saved.day === today && Array.isArray(saved.signs) ? saved.signs : [];
      window.localStorage.setItem(LG_UNLOCK_KEY, JSON.stringify({ day: today, signs: [...signs, sign] }));
    } catch (_error) { /* optional */ }
  }
  const lgLocked = tab => tab !== 'today' && rewardedFor('lifeguide') && !lgUnlocked(lg.sign);
  function openLifeGuide() {
    lg.tab = 'today'; lg.failed = false; lg.picking = false;
    if (!lg.sign) { const own = ownMoon(); if (own) lg.sign = own.sign; }
    showPage('lifeguide'); renderLifeGuide();
    void loadLifeGuide();
    void loadLifeGuideText();
  }
  // With the user's own chart and their own Moon sign, the Life Guide is personal: the birth star and the running dasha
  // lords (and the natal house of each) are sent, never the birth date, time or place.
  function lgPersonal() {
    const chart = state.chart;
    if (!chart || !chart.positions || !chart.positions.Moon || lg.sign !== chart.positions.Moon.rashi_index) return null;
    const star = chart.panchanga_at_birth && chart.panchanga_at_birth.nakshatra_index;
    if (!Number.isInteger(star) || star < 1 || star > 27) return null;
    const dasha = state.details && state.details.dasha, planets = (state.details && state.details.planets) || {}, lords = [];
    if (dasha && dasha.current_mahadasha) lords.push(dasha.current_mahadasha);
    const sub = dasha && (dasha.antardasha || []).find(item => item.current);
    if (sub) lords.push(sub.lord);
    return { nakshatra: star, dasha: lords.filter(lord => planets[lord] && Number.isInteger(planets[lord].whole_sign_bhava)).map(lord => ({ lord, house: planets[lord].whole_sign_bhava })) };
  }
  const lgKey = () => { const personal = lgPersonal(); return `${lg.sign}:${state.todayIso || localIso(new Date())}:${personal ? personal.nakshatra : 0}`; };
  async function loadLifeGuide() {
    const sign = lg.sign, day = state.todayIso || localIso(new Date()), key = lgKey(), personal = lgPersonal();
    if (!sign || lg.cache[key] || lg.busy === key) return;
    lg.busy = key; lg.failed = false; renderLifeGuide();
    try {
      const { ok, body } = await post('/api/life-guide', personal ? { sign, date: day, personal } : { sign, date: day });
      if (ok && body && body.reading) { lg.cache[key] = body.reading; lg.info[key] = body.personal || null; } else lg.failed = true;
    } catch (_error) { lg.failed = true; }
    lg.busy = '';
    if (pages.lifeguide && !pages.lifeguide.hidden) renderLifeGuide();
  }
  // The AI-written wording of the day (four sentences per area and band, once a day per language, shared by everyone).
  // Until it arrives, or if the AI is off, the built-in sentences are shown.
  async function loadLifeGuideText() {
    const day = state.todayIso || localIso(new Date()), key = `${state.lang}:${day}`;
    if (lg.text[key] !== undefined) return;
    lg.text[key] = null;
    try {
      const { ok, body } = await post('/api/life-guide-text', { language: state.lang, date: day });
      lg.text[key] = ok && body && body.variants ? body.variants : null;
    } catch (_error) { lg.text[key] = null; }
    if (lg.text[key] && pages.lifeguide && !pages.lifeguide.hidden) renderLifeGuide();
  }
  const lgWords = () => lg.text[`${state.lang}:${state.todayIso || localIso(new Date())}`] || null;
  const lgBand = score => (score >= 7 ? 2 : score >= 5 ? 1 : 0);
  function renderLifeGuide() { renderLifeGuideBody(); decorate($('lifeguide'), lgCopy().title); }
  function renderLifeGuideBody() {
    const copy = lgCopy(), box = $('lifeguide'), art = window.JyotishaArt;
    box.replaceChildren();
    const hero = el('div', 'lg-hero'); if (art && art.lifeguide) hero.innerHTML = art.lifeguide();
    box.appendChild(hero);
    const key = lgKey(), data = lg.sign ? lg.cache[key] : null, personal = lgPersonal(), info = lg.info[key], words = lgWords();
    // Which sign: the user's own Moon sign, or any sign chosen below.
    if (lg.sign) {
      const row = el('div', 'lg-sign');
      row.append(el('span', 'lg-sign-name', `${RASHI_ICONS[lg.sign - 1]} ${copy.yourSign}: ${signName(lg.sign)}`));
      const change = el('button', 'chip-btn', copy.change); change.type = 'button';
      change.addEventListener('click', () => { lg.picking = !lg.picking; renderLifeGuide(); });
      row.appendChild(change);
      box.appendChild(row);
      if (personal) {
        const lords = personal.dasha.map(item => bodyName(item.lord)).join(' – ');
        box.appendChild(el('p', 'lg-personal', `✨ ${fill(copy.personal, { star: names.nakshatraName(personal.nakshatra, state.lang) })}${lords ? ` · ${fill(copy.dashaLine, { lords })}` : ''}`));
        if (info && info.tara && lg.tab === 'today') {
          box.appendChild(el('p', 'lg-personal lg-tara', `${fill(copy.tara, { tara: copy.taraNames[info.tara - 1] })}: ${copy.taraEffect[info.shift + 1]}`));
        }
      } else {
        box.appendChild(el('p', 'lg-personal lg-general', copy.general));
      }
    } else {
      box.appendChild(el('p', 'tarot-ask', copy.pickFirst));
    }
    if (lg.sign) {
      const tabs = el('div', 'tabs-line'); tabs.setAttribute('role', 'tablist');
      LG_TABS.forEach((tab, i) => {
        const locked = lgLocked(tab);
        const button = el('button', `${tab === lg.tab ? 'on' : ''}${locked ? ' locked' : ''}`.trim(), copy.tabs[i]); button.type = 'button';
        button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', tab === lg.tab ? 'true' : 'false');
        button.addEventListener('click', async () => {
          if (lgLocked(tab)) { if (!(await watchForResult())) return; lgUnlock(lg.sign); }   // the video icon on the tab says an ad comes first
          lg.tab = tab; renderLifeGuide();
        });
        tabs.appendChild(button);
      });
      box.appendChild(tabs);
      if (LG_TABS.some(lgLocked)) box.appendChild(el('p', 'lg-unlock-note', copy.unlock));
      if (!data) {
        if (lg.failed) {
          box.appendChild(el('p', 'palm-wait', copy.failed));
          const retry = el('button', 'chip-btn', '↻'); retry.type = 'button'; retry.addEventListener('click', () => { void loadLifeGuide(); });
          box.appendChild(retry);
        } else box.appendChild(loader(copy.loading));
      } else {
        const period = data[lg.tab];
        box.appendChild(el('h4', 'home-h lg-balance-h', copy.balance[LG_TABS.indexOf(lg.tab)]));
        const bars = el('div', 'lg-bars');
        for (const area of LG_AREAS) {
          const score = period[area].score;
          const col = el('div', `lg-col lg-${area}`);
          const track = el('div', 'lg-track'), fill = el('i'); if (fill.style) fill.style.height = `${score * 10}%`;
          track.appendChild(fill);
          col.append(el('b', null, `${score}/10`), track, el('small', null, copy.areas[area]));
          bars.appendChild(col);
        }
        box.appendChild(bars);
        box.appendChild(el('h4', 'home-h lg-balance-h', copy.byArea));
        for (const area of LG_AREAS) {
          const { score, support } = period[area];
          const item = el('section', `lg-aspect lg-${area}`);
          const head = el('div', 'lg-aspect-head');
          head.append(el('span', 'lg-ico', LG_ICONS[area]), el('h4', null, copy.areas[area]), el('span', 'lg-score', String(score)));
          // The day, the tab, the area and the user's own star pick which of the day's wordings to show.
          const pool = words && words[area] && words[area][['low', 'mid', 'high'][lgBand(score)]];
          const line = pool && pool.length ? pool[(dayNumberOf(new Date()) + LG_AREAS.indexOf(area) + LG_TABS.indexOf(lg.tab) * 2 + (personal ? personal.nakshatra : 0)) % pool.length] : copy.text[area][lgBand(score)];
          item.append(head, el('p', null, line));
          if (support && support.length) item.appendChild(el('small', null, fill(copy.supported, { planets: support.map(bodyName).join(', ') })));
          box.appendChild(item);
        }
        box.appendChild(el('p', 'num-note', copy.note));
      }
    }
    // Any sign: twelve small tiles (also how a visitor without a Kundli starts).
    if (lg.picking || !lg.sign) {
      box.appendChild(el('h4', 'home-h moon-pick-h', copy.pick));
      const grid = el('div', 'moon-pick');
      for (let n = 1; n <= 12; n += 1) {
        const tile = el('button', `moon-tile${n === lg.sign ? ' on' : ''}`); tile.type = 'button';
        tile.append(el('span', null, RASHI_ICONS[n - 1]), el('small', null, signName(n)));
        tile.addEventListener('click', () => { lg.sign = n; lg.picking = false; renderLifeGuide(); void loadLifeGuide(); try { window.scrollTo(0, 0); } catch (_error) { /* optional */ } });
        grid.appendChild(tile);
      }
      box.appendChild(grid);
    }
  }
  // Life Guide, asked straight in chat: today's balance (the free tab) for your own Moon sign, as a compact message.
  async function chatLifeGuide() {
    if (!lg.sign) { const own = ownMoon(); if (own) lg.sign = own.sign; }
    const copy = lgCopy();
    if (!lg.sign) { addMessage('assistant', copy.pickFirst); return; }
    lg.tab = 'today';
    if (!lg.cache[lgKey()]) await loadLifeGuide();
    const data = lg.cache[lgKey()];
    if (!data) { addMessage('assistant', copy.failed); return; }
    const period = data.today;
    const entry = el('div', 'chat-message assistant');
    entry.appendChild(el('p', null, `⚖️ ${copy.balance[1]} · ${signName(lg.sign)}`));
    for (const area of LG_AREAS) entry.appendChild(el('p', null, `${LG_ICONS[area]} ${copy.areas[area]}: ${period[area].score}/10`));
    chatLog.appendChild(entry); chatLog.scrollTop = chatLog.scrollHeight;
  }

  /* ---- Sign match: any two Moon signs; Graha Maitri + Bhakoot (12 points) from matchUI.signMatch ---- */
  const smCopy = () => toolText().signmatch || TOOLS_COPY.en.signmatch;
  const sm = { first: 0, second: 0, slot: 'first', shown: false };
  function openSignMatch() {
    sm.slot = 'first'; sm.shown = false;
    if (!sm.first) { const own = ownMoon(); if (own) { sm.first = own.sign; sm.slot = 'second'; } }
    showPage('signmatch'); renderSignMatch();
  }
  function renderSignMatch() { renderSignMatchBody(); decorate($('signmatch'), smCopy().title); }
  function renderSignMatchBody() {
    const copy = smCopy(), box = $('signmatch'), art = window.JyotishaArt, tool = window.matchUI;
    box.replaceChildren();
    const hero = el('div', 'lg-hero'); if (art && art.signmatch) hero.innerHTML = art.signmatch();
    box.appendChild(hero);
    // The two circles: You and Partner, with a heart between.
    const slots = el('div', 'sm-slots');
    const slot = (key, label) => {
      const value = sm[key], on = sm.slot === key;
      const button = el('button', `sm-slot${on ? ' on' : ''}`); button.type = 'button';
      button.append(el('span', 'sm-circle', value ? RASHI_ICONS[value - 1] : '＋'), el('b', null, value ? signName(value) : copy.choose), el('small', null, label));
      button.addEventListener('click', () => { sm.slot = key; sm.shown = false; renderSignMatch(); });
      return button;
    };
    slots.append(slot('first', copy.you), el('span', 'sm-heart', '💗'), slot('second', copy.partner));
    box.appendChild(slots);
    const tabs = el('div', 'tabs-line'); tabs.setAttribute('role', 'tablist');
    ['first', 'second'].forEach((key, i) => {
      const button = el('button', sm.slot === key ? 'on' : '', copy.tabs[i]); button.type = 'button';
      button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', sm.slot === key ? 'true' : 'false');
      button.addEventListener('click', () => { sm.slot = key; renderSignMatch(); });
      tabs.appendChild(button);
    });
    box.appendChild(tabs);
    const grid = el('div', 'moon-pick');
    for (let n = 1; n <= 12; n += 1) {
      const tile = el('button', `moon-tile${n === sm[sm.slot] ? ' on' : ''}`); tile.type = 'button';
      tile.append(el('span', null, RASHI_ICONS[n - 1]), el('small', null, signName(n)));
      tile.addEventListener('click', () => {
        sm[sm.slot] = n; sm.shown = false;
        if (!sm[sm.slot === 'first' ? 'second' : 'first']) sm.slot = sm.slot === 'first' ? 'second' : 'first';   // on to the other circle
        renderSignMatch();
      });
      grid.appendChild(tile);
    }
    box.appendChild(grid);
    const ready = !!(sm.first && sm.second && tool);
    if (sm.shown && ready) {
      const result = tool.signMatch(sm.first, sm.second);
      const matchContext = `${sm.first}-${sm.second}`;
      const fullUnlocked = contentUnlocked('sign_match_full', matchContext);
      const out = el('section', 'sm-result');
      const verdict = copy.verdict[result.verdict];
      out.append(el('div', 'sm-percent', `${result.percent}%`), el('h4', null, verdict), el('p', null, copy.text[result.verdict]));
      const row = (label, points, max) => { const line = el('p', 'sm-row'); line.append(el('span', null, label), el('b', null, `${points} / ${max}`)); return line; };
      if (fullUnlocked) {
        out.append(row(copy.friendship, result.maitri, 5), row(copy.family, result.bhakoot, 7));
        if (result.bhakootDosha) out.appendChild(el('p', 'num-note', copy.dosha));
      }
      box.appendChild(out);
      if (fullUnlocked) {
        const full = el('button', 'chip-btn', `${copy.full} ›`); full.type = 'button'; full.addEventListener('click', () => openTool('relationship'));
        box.append(full, el('p', 'num-note', copy.note));
      } else { const offer = premiumOffer('sign_match_full', matchContext, renderSignMatch); if (offer) box.appendChild(offer); }
    }
    // The main button, grey until both signs are chosen; a video icon marks the ad before the result.
    const see = el('button', `palm-scan${rewardedFor('signmatch') ? ' reward-btn' : ''}${ready ? '' : ' is-off'}`, copy.see); see.type = 'button'; see.disabled = !ready;
    see.addEventListener('click', async () => {
      if (!ready) return;
      if (!sm.shown && rewardedFor('signmatch') && !(await watchForResult())) return;
      sm.shown = true; renderSignMatch();
      try { const result = Array.from(box.children).find(item => item.className === 'sm-result'); if (result && result.scrollIntoView) result.scrollIntoView({ block: 'center' }); } catch (_error) { /* optional */ }
    });
    box.appendChild(see);
  }

  /* ---- Tarot: pick a topic, pick 3 of 12 face-down cards, see past / present / future and the AI's reading ---- */
  // The 22 Major Arcana: English name, upright and reversed meaning (traditional), and the names in Telugu and Hindi.
  const TAROT = [
    ['The Fool', 'new beginnings, trust and a fresh start', 'hesitation and careless choices', 'మూర్ఖుడు', 'मूर्ख'],
    ['The Magician', 'skill, focus and making things happen', 'scattered energy and unused talent', 'మాంత్రికుడు', 'जादूगर'],
    ['The High Priestess', 'intuition, inner wisdom and patience', 'ignoring your inner voice', 'ప్రధాన పూజారిణి', 'महापुजारिन'],
    ['The Empress', 'care, abundance and creativity', 'neglecting yourself or others', 'సామ్రాజ్ఞి', 'सम्राज्ञी'],
    ['The Emperor', 'structure, stability and leadership', 'rigidity and control', 'చక్రవర్తి', 'सम्राट'],
    ['The Hierophant', 'tradition, guidance and learning', 'breaking from convention', 'గురువు', 'गुरु'],
    ['The Lovers', 'love, harmony and true choices', 'imbalance and doubt in a choice', 'ప్రేమికులు', 'प्रेमी'],
    ['The Chariot', 'determination and moving forward', 'lost direction and delays', 'రథం', 'रथ'],
    ['Strength', 'courage, kindness and inner strength', 'self-doubt and impatience', 'బలం', 'शक्ति'],
    ['The Hermit', 'reflection, solitude and wisdom', 'isolation and withdrawal', 'సన్యాసి', 'साधु'],
    ['Wheel of Fortune', 'change, cycles and good timing', 'resistance to change', 'అదృష్ట చక్రం', 'भाग्य चक्र'],
    ['Justice', 'fairness, truth and balance', 'imbalance and avoiding responsibility', 'న్యాయం', 'न्याय'],
    ['The Hanged Man', 'pause, new perspective and surrender', 'stalling and indecision', 'వేలాడే మనిషి', 'लटका हुआ व्यक्ति'],
    ['Death', 'endings that open new beginnings', 'fear of change and holding on', 'పరివర్తన', 'परिवर्तन'],
    ['Temperance', 'balance, patience and moderation', 'excess and impatience', 'సంయమనం', 'संयम'],
    ['The Devil', 'attachments and temptations to notice', 'breaking free from what binds you', 'బంధనాలు', 'बंधन'],
    ['The Tower', 'sudden change that clears the way', 'avoiding a needed change', 'గోపురం', 'मीनार'],
    ['The Star', 'hope, healing and renewal', 'losing faith for a while', 'నక్షత్రం', 'तारा'],
    ['The Moon', 'dreams, intuition and uncertainty', 'confusion clearing up', 'చంద్రుడు', 'चंद्रमा'],
    ['The Sun', 'joy, success and warmth', 'temporary clouds over happiness', 'సూర్యుడు', 'सूर्य'],
    ['Judgement', 'awakening and a fresh calling', 'self-doubt and old regrets', 'జాగృతి', 'जागृति'],
    ['The World', 'completion, fulfilment and wholeness', 'unfinished business', 'ప్రపంచం', 'संसार'],
  ];
  const TAROT_TOPICS = [['love', '💞'], ['career', '💼'], ['money', '🪙'], ['health', '🌿'], ['luck', '🍀'], ['family', '🏡']];
  const tarotCopy = () => toolText().tarot || TOOLS_COPY.en.tarot;
  const tarotName = index => (state.lang === 'te' ? TAROT[index][3] : state.lang === 'hi' ? TAROT[index][4] : TAROT[index][0]);
  const randomInt = n => { try { const a = new Uint32Array(1); window.crypto.getRandomValues(a); return a[0] % n; } catch (_error) { return Math.floor(Math.random() * n); } };
  const tarot = { step: 'topic', topic: '', spread: [], chosen: [], reading: undefined };
  function openTarot() { tarot.step = 'topic'; tarot.topic = ''; tarot.chosen = []; tarot.reading = undefined; showPage('tarot'); renderTarot(); }
  function startTarotDraw(topic) {
    const deck = TAROT.map((_, i) => i);
    for (let i = deck.length - 1; i > 0; i -= 1) { const j = randomInt(i + 1); [deck[i], deck[j]] = [deck[j], deck[i]]; }   // shuffle
    tarot.topic = topic; tarot.step = 'draw'; tarot.chosen = []; tarot.reading = undefined;
    tarot.spread = deck.slice(0, 12).map(id => ({ id, reversed: randomInt(4) === 0 }));                                   // about 1 in 4 reversed
    renderTarot();
  }
  async function loadTarotReading() {
    const cards = tarot.chosen.map(n => tarot.spread[n]);
    tarot.reading = null;   // loading
    try {
      const { ok, body } = await post('/api/tarot', { topic: tarot.topic, language: state.lang, cards });
      tarot.reading = ok && body && body.reading ? body.reading : false;
    } catch (_error) { tarot.reading = false; }
    if (tarot.step === 'result') renderTarot();
    ratingCompleted('tarot');
  }
  function renderTarot() { renderTarotBody(); decorate($('tarot'), tarotCopy().title); }
  function renderTarotBody() {
    const copy = tarotCopy(), box = $('tarot'), art = window.JyotishaArt;
    box.replaceChildren();
    if (tarot.step === 'topic') {
      box.appendChild(el('p', 'tarot-ask', copy.ask));
      const grid = el('div', 'tarot-topics');
      for (const [key, icon] of TAROT_TOPICS) {
        const tile = el('button', 'tarot-topic'); tile.type = 'button';
        tile.append(el('span', 'tarot-topic-icon', icon), el('b', null, copy.topics[key]));
        tile.addEventListener('click', () => startTarotDraw(key));
        grid.appendChild(tile);
      }
      box.appendChild(grid);
      return;
    }
    if (tarot.step === 'draw') {
      box.append(el('p', 'tarot-ask', `${copy.topics[tarot.topic]} · ${copy.pick}`), el('p', 'tarot-hint', copy.shuffle),
        el('p', 'tarot-count', fill(copy.picked, { n: tarot.chosen.length })));
      const grid = el('div', 'tarot-spread');
      tarot.spread.forEach((_card, n) => {
        const back = el('button', `tarot-back${tarot.chosen.includes(n) ? ' on' : ''}`); back.type = 'button';
        if (art) back.innerHTML = art.tarotBack();
        back.addEventListener('click', () => {
          if (tarot.chosen.includes(n) || tarot.chosen.length >= 3) return;
          tarot.chosen.push(n);
          if (tarot.chosen.length === 3) {
            if (rewardedFor('tarot')) tarot.step = 'locked';   // the three cards wait face down behind "▶ See my reading"
            else { tarot.step = 'result'; void loadTarotReading(); }
          }
          renderTarot();
        });
        grid.appendChild(back);
      });
      box.appendChild(grid);
      return;
    }
    if (tarot.step === 'locked') {
      box.appendChild(el('p', 'tarot-ask', copy.topics[tarot.topic]));
      const row = el('div', 'tarot-row');
      copy.positions.forEach(position => {
        const face = el('div', 'tarot-face');
        const pic = el('div', 'tarot-pic'); if (art) pic.innerHTML = art.tarotBack();
        face.append(el('small', 'tarot-pos', position), pic);
        row.appendChild(face);
      });
      const see = el('button', 'palm-scan reward-btn', copy.see); see.type = 'button';
      see.addEventListener('click', async () => {
        if (!(await watchForResult())) return;   // closed the ad early: the cards stay face down
        tarot.step = 'result'; void loadTarotReading(); renderTarot();
      });
      box.append(row, see);
      return;
    }
    // Result: the three cards face up, then the reading (AI, or the built-in meanings).
    const cards = tarot.chosen.map(n => tarot.spread[n]);
    box.appendChild(el('p', 'tarot-ask', copy.topics[tarot.topic]));
    const row = el('div', 'tarot-row');
    cards.forEach((card, i) => {
      const face = el('div', `tarot-face${card.reversed ? ' reversed' : ''}`);
      const pic = el('div', 'tarot-pic'); if (art) pic.innerHTML = art.tarotCard(card.id);
      face.append(el('small', 'tarot-pos', copy.positions[i]), pic, el('b', null, tarotName(card.id)));
      if (card.reversed) face.appendChild(el('span', 'tarot-rev', copy.reversed));
      row.appendChild(face);
    });
    box.appendChild(row);
    const reading = tarot.reading, lines = [];
    const tarotContext = `${localIso(new Date())}-${tarot.topic}-${cards.map(card => `${card.id}${card.reversed ? 'r' : 'u'}`).join('-')}`;
    const tarotUnlocked = contentUnlocked('tarot_detailed', tarotContext);
    ['past', 'present', 'future'].forEach((key, i) => {
      const card = cards[i], meaning = TAROT[card.id][card.reversed ? 2 : 1];
      const text = tarotUnlocked && reading ? reading[key] : tarotUnlocked && reading === null ? copy.loading : `${tarotName(card.id)}: ${meaning}.`;
      const sec = el('section', `tarot-sec${reading === null ? ' loading' : ''}`);
      sec.append(el('h4', null, `${copy.positions[i]} · ${tarotName(card.id)}${card.reversed ? ` (${copy.reversed})` : ''}`), el('p', null, text));
      box.appendChild(sec);
      lines.push(`${copy.positions[i]} · ${tarotName(card.id)}: ${text}`);
    });
    if (tarotUnlocked && reading !== null) {
      const advice = reading ? reading.advice : copy.fallbackAdvice;
      const sec = el('section', 'tarot-sec advice');
      sec.append(el('h4', null, `✨ ${copy.advice}`), el('p', null, advice));
      box.appendChild(sec);
      lines.push(`✨ ${advice}`);
    }
    if (!tarotUnlocked) { const offer = premiumOffer('tarot_detailed', tarotContext, renderTarot); if (offer) box.appendChild(offer); }
    const actions = el('div', 'tarot-actions');
    const askAi = el('button', 'rashi-ask', `✨ ${copy.askAi}`); askAi.type = 'button';
    askAi.addEventListener('click', () => {
      const question = fill(copy.askQ, { cards: cards.map(card => tarotName(card.id)).join(', '), topic: copy.topics[tarot.topic] });
      showPage('chat'); ask(question, question, true);
    });
    const share = el('button', 'chip-btn', `↗ ${copy.share}`); share.type = 'button';
    share.addEventListener('click', () => { void shareText(`🃏 ${copy.title}: ${copy.topics[tarot.topic]}`, lines.join('\n\n')); });
    const again = el('button', 'chip-btn', `↻ ${copy.again}`); again.type = 'button';
    again.addEventListener('click', () => { tarot.step = 'topic'; renderTarot(); try { window.scrollTo(0, 0); } catch (_error) { /* optional */ } });
    if (tarotUnlocked) actions.appendChild(askAi);
    actions.append(share, again);
    box.appendChild(actions);
  }
  // Tarot, asked straight in chat: a fresh three-card draw and reading for the matched topic, shown as a message.
  function matchTarotTopic(query) {
    const text = String(query || '').toLowerCase(), copy = tarotCopy();
    for (const [key] of TAROT_TOPICS) if (text.includes(key) || (copy.topics[key] && text.includes(copy.topics[key].toLowerCase()))) return key;
    return null;
  }
  let chatTarotAwaitingTopic = false;
  async function chatTarot(topicKey) {
    const copy = tarotCopy();
    startTarotDraw(topicKey);
    tarot.chosen = [0, 1, 2];
    if (rewardedFor('tarot') && !(await watchForResult())) { tarot.step = 'topic'; return; }
    const pending = el('div', 'chat-message assistant', copy.loading);
    chatLog.appendChild(pending); chatLog.scrollTop = chatLog.scrollHeight;
    await loadTarotReading();
    chatLog.removeChild(pending);
    const cards = tarot.chosen.map(n => tarot.spread[n]), reading = tarot.reading;
    const entry = el('div', 'chat-message assistant');
    entry.appendChild(el('p', null, `🃏 ${copy.topics[tarot.topic]}`));
    ['past', 'present', 'future'].forEach((key, i) => {
      const card = cards[i], meaning = TAROT[card.id][card.reversed ? 2 : 1];
      const text = reading ? reading[key] : `${tarotName(card.id)}: ${meaning}.`;
      entry.appendChild(el('p', null, `${copy.positions[i]} · ${tarotName(card.id)}${card.reversed ? ` (${copy.reversed})` : ''}: ${text}`));
    });
    entry.appendChild(el('p', null, `✨ ${reading ? reading.advice : copy.fallbackAdvice}`));
    chatLog.appendChild(entry); chatLog.scrollTop = chatLog.scrollHeight;
  }
  /* ---- Moon Sign page: a big moon, your Vedic Moon sign (with nakshatra) and five warm sections ---- */
  state.moonText = {}; state.moonPick = 0; state.moonApprox = null;
  const MOON_SECTIONS = [['emotional', '🌸'], ['love', '💞'], ['career', '💼'], ['wellbeing', '🌿'], ['remedy', '🪔']];
  const moonCopy = () => toolText().moon || TOOLS_COPY.en.moon;
  function ownMoon() {
    if (state.chart) {
      const birth = state.chart.panchanga_at_birth || {};
      return { sign: state.chart.positions.Moon.rashi_index, star: birth.nakshatra_index, pada: birth.nakshatra_pada, approx: false };
    }
    return state.moonApprox;
  }
  // Only a birth date (no time): the Moon at noon that day, marked as approximate (it can change sign within the day).
  async function loadApproxMoon() {
    if (state.chart || state.moonApprox || state.moonApproxBusy || !state.userDob || !state.city) return;
    state.moonApproxBusy = true;
    try {
      const { ok, body } = await post('/api/birth-chart', { dob: state.userDob, pob: state.city, tob: '12:00' });
      if (ok && body && body.chart) state.moonApprox = { sign: body.chart.positions.Moon.rashi_index, approx: true };
    } catch (_error) { /* offline: ask for details instead */ }
    state.moonApproxBusy = false;
    if (!pages.moon.hidden) renderMoonSign();
  }
  async function loadMoonText(sign) {
    const key = `${sign}|${state.lang}`;
    if (key in state.moonText) return;
    state.moonText[key] = null;   // loading
    try {
      const { ok, body } = await post('/api/moon-sign', { sign, language: state.lang });
      state.moonText[key] = ok && body && body.readings ? body.readings : false;
    } catch (_error) { state.moonText[key] = false; }
    if (!pages.moon.hidden) renderMoonSign();
  }
  function openMoonSign() { state.moonPick = 0; showPage('moon'); renderMoonSign(); }
  function renderMoonSign() { renderMoonSignBody(); decorate($('moonsign'), moonCopy().title); }
  function renderMoonSignBody() {
    const copy = moonCopy(), box = $('moonsign'), own = ownMoon();
    if (!own) void loadApproxMoon();
    const sign = state.moonPick || (own ? own.sign : 0);
    box.replaceChildren();
    const art = el('div', 'moon-art');
    if (window.JyotishaArt) art.innerHTML = window.JyotishaArt.moon();
    box.appendChild(art);
    if (!sign) {
      box.appendChild(el('p', 'moon-need', copy.need));
      const add = el('button', 'moon-add', `${copy.add} ›`); add.type = 'button';
      add.addEventListener('click', () => { showPage('kundli'); try { document.querySelector('[name="dob"]').focus(); } catch (_error) { /* optional */ } });
      box.appendChild(add);
    } else {
      box.appendChild(el('h3', 'moon-sign', `✦ ${signName(sign)} ✦`));
      if (own && sign === own.sign) {
        if (own.star) box.appendChild(el('p', 'moon-star', `${copy.nakshatra}: ${names.nakshatraName(own.star, state.lang)}${own.pada ? ` · ${copy.pada} ${own.pada}` : ''}`));
        if (own.approx) box.appendChild(el('p', 'moon-approx', copy.approx));
      }
      const key = `${sign}|${state.lang}`;
      if (!(key in state.moonText)) void loadMoonText(sign);
      const text = state.moonText[key];
      const lines = [];
      for (const [name, icon] of MOON_SECTIONS) {
        const body = text ? text[name] : (name === 'emotional' ? copy.nature[sign - 1] : '');
        if (!body && text !== null) continue;
        const card = el('section', `moon-sec${text === null && name !== 'emotional' ? ' loading' : ''}`);
        card.append(el('span', 'moon-icon', icon), el('h4', null, copy.sections[name]), el('p', null, body || copy.loading));
        box.appendChild(card);
        if (body) lines.push(`${icon} ${copy.sections[name]}\n${body}`);
      }
      // Sharing is the share icon in the page header; only the report link stays here.
      if (state.contactEmail) {
        const tools = el('div', 'moon-tools');
        const report = el('a', 'chip-btn', `⚑ ${copy.report}`);
        report.href = `mailto:${state.contactEmail}?subject=${encodeURIComponent(`Report: Moon sign ${sign} (${state.lang})`)}`;
        tools.appendChild(report);
        box.appendChild(tools);
      }
    }
    // Explore any sign: twelve small tiles.
    box.appendChild(el('h4', 'home-h moon-pick-h', copy.pick));
    const grid = el('div', 'moon-pick');
    for (let n = 1; n <= 12; n += 1) {
      const tile = el('button', `moon-tile${n === sign ? ' on' : ''}`); tile.type = 'button';
      tile.append(el('span', null, RASHI_ICONS[n - 1]), el('small', null, signName(n)));
      if (own && n === own.sign) tile.appendChild(el('i', null, `★ ${copy.yours}`));
      tile.addEventListener('click', async () => {
        if (rewardedFor('moon') && !(own && n === own.sign) && !(await watchForResult())) return;   // your own sign stays free
        state.moonPick = n; renderMoonSign(); try { window.scrollTo(0, 0); } catch (_error) { /* optional */ }
      });
      grid.appendChild(tile);
    }
    box.appendChild(grid);
  }
  /* ---- Rashiphal: pick your sign, read today's paragraph, share or ask the AI ---- */
  const RASHI_KEY = 'jyotisha.rashi.v1';
  const RASHI_ICONS = ['🐏', '🐂', '👫', '🦀', '🦁', '👧', '⚖️', '🦂', '🏹', '🐐', '🏺', '🐟'];
  const RASHI_GLYPHS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'];
  state.rashiPick = (() => { try { const value = Number(window.localStorage.getItem(RASHI_KEY)); return value >= 1 && value <= 12 ? value : 0; } catch (_error) { return 0; } })();
  state.rashiAI = {};
  state.rashiLucky = {};
  // With a Kundli, Rashiphal opens on the user's own Moon sign (set whenever the chart is made or restored).
  function useOwnRashi() {
    if (!state.chart) return;
    state.rashiPick = state.chart.positions.Moon.rashi_index;
    try { window.localStorage.setItem(RASHI_KEY, String(state.rashiPick)); } catch (_error) { /* not remembered */ }
    try { renderRashi(); } catch (_error) { /* the page is not ready yet */ }
  }
  function pickRashi(rashi) {
    state.rashiPick = rashi;
    try { window.localStorage.setItem(RASHI_KEY, String(rashi)); } catch (_error) { /* not remembered */ }
    renderRashi();
    if (state.day && (!rewardedFor('rashiphal') || rashiUnlocked())) ratingCompleted('rashiphal');
  }
  function renderRashiPicker() {
    const copy = toolText().rashi, mine = state.chart ? state.chart.positions.Moon.rashi_index : 0;
    if (!state.rashiPick && mine) state.rashiPick = mine;   // your own sign once there is a Kundli
    $('rashi-picker').replaceChildren(...RASHI_ICONS.map((icon, index) => {
      const rashi = index + 1, tile = el('button', `rashi-tile${rashi === state.rashiPick ? ' on' : ''}`);
      tile.type = 'button'; tile.setAttribute('aria-pressed', rashi === state.rashiPick ? 'true' : 'false');
      tile.append(el('span', 'rashi-icon', icon), el('b', null, signName(rashi)), el('small', null, rashi === mine ? `★ ${copy.mine}` : RASHI_GLYPHS[index]));
      tile.addEventListener('click', () => pickRashi(rashi));
      return tile;
    }));
    const find = $('rashi-find');
    find.textContent = `${state.chart ? copy.mineButton : copy.find} ›`;
    find.onclick = () => {
      if (state.chart) { pickRashi(state.chart.positions.Moon.rashi_index); return; }
      showPage('kundli'); try { document.querySelector('[name="dob"]').focus(); } catch (_error) { /* optional */ }
    };
    if (!state.rashiPick) $('rashi-reading').replaceChildren(el('p', 'rashi-hint', copy.hint));
  }
  async function loadRashiAI(date) {
    const key = `${date}|${state.lang}`;
    if (key in state.rashiAI) return;
    state.rashiAI[key] = null;   // loading
    try {
      const { ok, body } = await post('/api/rashiphal', { date, language: state.lang });
      state.rashiAI[key] = ok && body && body.readings ? body.readings : false;
      state.rashiLucky[key] = ok && body && body.lucky ? body.lucky : null;
    } catch (_error) { state.rashiAI[key] = false; }
    if (state.rashiMode === 'day') renderRashi();
  }
  // Today's paragraph for the chosen sign: the AI-written one when available, otherwise the rule-based reading.
  function renderRashiReading(item, detail, day) {
    const copy = toolText().rashi, key = `${day.date}|${state.lang}`;
    if (!(key in state.rashiAI)) void loadRashiAI(day.date);
    const ai = state.rashiAI[key] && state.rashiAI[key][String(item.rashi)];
    const sentence = part => (/[.!?।]$/.test(part.trim()) ? part.trim() : `${part.trim()}.`);
    const text = ai || [detail && detail.verdict, item.kind, item.area].filter(Boolean).map(sentence).join(' ');
    const box = $('rashi-reading'); box.replaceChildren();
    const title = fill(copy.title, { sign: item.name, date: calendarUI.formatDate(state.lang, day.date, 'long') });
    box.appendChild(el('h3', 'rashi-reading-title', `${RASHI_ICONS[item.rashi - 1]} ${title}`));
    const askAboutDay = () => { const question = fill(copy.askQ, { sign: item.name }); showPage('chat'); ask(question, question, true); };
    const openJathakam = () => { showPage('kundli'); if (!state.chart) { try { document.querySelector('[name="dob"]').focus(); } catch (_error) { /* optional */ } } };
    // Quick links at the top, so people know the transits and remedies further down exist.
    const jumps = el('div', 'rashi-jumps');
    const jump = (label, action) => { const b = el('button', 'rashi-jump', label); b.type = 'button'; b.addEventListener('click', action); jumps.appendChild(b); };
    if (detail && detail.rows && detail.rows.length) jump(`🪐 ${copy.jump.transits}`, () => jumpToRashiSection('transits'));
    if (detail && detail.remedies && detail.remedies.length) jump(`🙏 ${copy.jump.remedies}`, () => jumpToRashiSection('remedies'));
    jump(`📜 ${copy.jump.full}`, openJathakam);
    jump(`✨ ${copy.jump.ask}`, askAboutDay);
    box.appendChild(jumps);
    const body = el('p', 'rashi-text clamp', text);
    box.appendChild(body);
    if (text.length > 260) {
      const more = el('button', 'link-btn', copy.more); more.type = 'button';
      more.addEventListener('click', () => { const open = body.classList.contains('clamp'); body.classList.toggle('clamp', !open); more.textContent = open ? copy.less : copy.more; });
      box.appendChild(more);
    } else body.classList.remove('clamp');
    // Lucky colour, numbers and direction (calculated: the weekday's lord and the sign's lord; plus the sign's best transit).
    const lucky = state.rashiLucky[key] && state.rashiLucky[key][String(item.rashi)];
    let luckyText = '';
    if (lucky && copy.colours[lucky.planet]) {
      const box2 = el('div', 'rashi-lucky');
      box2.appendChild(el('h4', null, `🍀 ${copy.luckyTitle}`));
      // Colour and direction follow the weekday lord (the same for every sign); numbers add the sign lord's. The sign's own
      // colour and direction (its best transit) are added when they differ.
      const own = lucky.sign_planet && lucky.sign_planet !== lucky.planet && copy.colours[lucky.sign_planet] ? lucky.sign_planet : null;
      if (own) box2.appendChild(el('small', 'lucky-sub', copy.luckyDay));
      const chips = el('div', 'lucky-chips');
      const chip = (icon, label, value) => { const c = el('span', 'lucky-chip'); c.append(el('small', null, `${icon} ${label}`), el('b', null, value)); return c; };
      chips.append(chip('🎨', copy.colour, copy.colours[lucky.planet]), chip('🔢', copy.numbers, lucky.numbers.join(', ')), chip('🧭', copy.direction, copy.directions[lucky.planet]));
      box2.appendChild(chips);
      luckyText = `\n\n🍀 ${copy.luckyTitle}\n🎨 ${copy.colour}: ${copy.colours[lucky.planet]} · 🔢 ${copy.numbers}: ${lucky.numbers.join(', ')} · 🧭 ${copy.direction}: ${copy.directions[lucky.planet]}`;
      if (own) {
        const special = el('div', 'lucky-sign');
        special.append(el('small', 'lucky-sub', `✨ ${copy.luckySign}`), el('b', null, `🎨 ${copy.colours[own]} · 🧭 ${copy.directions[own]}`));
        box2.appendChild(special);
        luckyText += `\n✨ ${copy.luckySign}: 🎨 ${copy.colours[own]} · 🧭 ${copy.directions[own]}`;
      }
      box.appendChild(box2);
    }
    const actions = el('div', 'rashi-actions');
    const askButton = el('button', 'rashi-ask', `✨ ${copy.ask}`); askButton.type = 'button';
    askButton.addEventListener('click', askAboutDay);
    const share = waLabel(el('button', 'wa-btn'), copy.share); share.type = 'button';
    share.addEventListener('click', () => {
      const message = `${RASHI_ICONS[item.rashi - 1]} ${title}\n\n${text}${luckyText}\n\n— Jyotirmaya AstroChat: ${window.location && window.location.origin ? window.location.origin : ''}`;
      try { window.open(`https://wa.me/?text=${encodeURIComponent(message.replace(/[\u2066-\u2069]/g, ''))}`, '_blank'); } catch (_error) { /* no browser */ }
    });
    const full = el('button', 'link-btn', `${copy.full} ›`); full.type = 'button';
    full.addEventListener('click', openJathakam);
    actions.append(askButton, share, full);
    box.appendChild(actions);
    box.appendChild(el('h4', 'rashi-details-head', copy.details));
  }
  // Planet transits as cards (symbol, name, house, favourable or not, what it brings), favourable ones first.
  const PLANET_GLYPHS = Object.freeze({ Sun: '☉', Moon: '☽', Mars: '♂', Mercury: '☿', Jupiter: '♃', Venus: '♀', Saturn: '♄', Rahu: '☊', Ketu: '☋' });
  function transitCards(rows) {
    const copy = toolText().rashi;
    const grid = el('div', 'transit-grid');
    const sorted = [...rows.filter(row => row.good), ...rows.filter(row => !row.good)];
    for (const row of sorted) {
      const card = el('div', `transit-card ${row.good ? 'ok' : 'no'}`);
      const glyph = el('span', 'transit-glyph', PLANET_GLYPHS[row.name] || '•');
      glyph.style.background = PLANET_COLORS[row.name] || '#888';
      const head = el('div', 'transit-head');
      const names = el('div', 'transit-names');
      names.append(el('b', null, row.body || row.name), el('small', null, row.houseText || ''));
      head.append(glyph, names, el('span', `transit-tag ${row.good ? 'ok' : 'no'}`, row.good ? `✔ ${copy.transitGood}` : `⚠ ${copy.transitCare}`));
      card.append(head, el('p', 'transit-phrase', row.phrase || row.text));
      grid.appendChild(card);
    }
    return grid;
  }
  function jumpToRashiSection(name) {
    const spot = state.rashiJump || {};
    if (!spot.card || !spot[name]) return;
    spot.card.open = true;                       // the details card is folded; open it, then scroll to the section
    try { spot[name].scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (_error) { /* older browsers */ }
  }
  function renderRashiDay() {
    const day = state.day;
    if (!day) { $('rashi-moon').textContent = t('dpUnavailable'); return; }
    $('rashi-moon').textContent = `${calendarUI.formatDate(state.lang, day.date, 'full')} · ${t('moonsign')}: ${signName(day.moon_rashi[0].index)}`;
    const mine = state.chart ? state.chart.positions.Moon.rashi_index : 0;
    const detail = chartUI.gocharaOutlook(day, state.lang), moonCards = chartUI.rashiOutlook(day, state.lang);
    for (const item of moonCards) {
      const more = detail[item.rashi - 1];
      if (state.rashiPick && item.rashi !== state.rashiPick) continue;
      const tone = more ? more.tone : item.tone;
      const card = el('details', `rashi-card ${tone}${item.rashi === mine ? ' mine' : ''}`);
      if (item.rashi === mine && !state.rashiPick) card.open = true;
      if (state.rashiPick) renderRashiReading(item, more, day);
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
        const transitsHead = el('h4', null, chartUI.gocharaHead(state.lang));
        card.appendChild(transitsHead);
        card.appendChild(transitCards(more.rows));
        const remediesHead = remedyBlock(card, more.remedies);
        if (state.rashiPick) state.rashiJump = { card, transits: transitsHead, remedies: remediesHead };
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
    const forecastContext = `${state.selectedDate}-${state.rashiPick || (state.chart && state.chart.positions.Moon.rashi_index) || 'all'}`;
    if (!contentUnlocked('rashiphal_forecast_7d', forecastContext)) {
      $('rashi-moon').textContent = t('viewWeek');
      const offer = premiumOffer('rashiphal_forecast_7d', forecastContext, renderRashi); if (offer) $('rashi-list').appendChild(offer);
      return;
    }
    if (!state.week || state.week.key !== key) { $('rashi-moon').textContent = t('dpLoading'); void loadWeek(); return; }
    const days = state.week.days;
    if (!days.length) { $('rashi-moon').textContent = t('dpUnavailable'); return; }
    const range = `${calendarUI.formatDate(state.lang, days[0].date, 'dayMonth')} – ${calendarUI.formatDate(state.lang, days[days.length - 1].date, 'dayMonth')}`;
    $('rashi-moon').textContent = `${t('viewWeek')}: ${range}`;
    const mine = state.chart ? state.chart.positions.Moon.rashi_index : 0;
    for (const item of chartUI.weekOutlook(days, state.lang, dayLabel)) {
      if (state.rashiPick && item.rashi !== state.rashiPick) continue;
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
      if (state.rashiPick && item.rashi !== state.rashiPick) continue;
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
    state.rashiJump = null;
    $('rashi-reading').replaceChildren();
    renderRashiPicker();
    $('rashi-title').textContent = t('rashiphal');
    document.querySelectorAll('#rashi-mode button').forEach(button => button.classList.toggle('on', button.dataset.rmode === state.rashiMode));
    const unit = state.rashiMode === 'week' ? t('viewWeek') : state.rashiMode === 'month' ? t('viewMonth') : '';
    $('rashi-prev').textContent = unit ? `‹ ${unit}` : t('previousDay');
    $('rashi-next').textContent = unit ? `${unit} ›` : t('nextDay');
    if (state.rashiPick && rewardedFor('rashiphal') && !rashiUnlocked()) {   // once a day: one ad opens the readings
      const copy = toolText().rashi, box = $('rashi-reading');
      $('rashi-moon').textContent = state.day ? calendarUI.formatDate(state.lang, state.day.date, 'full') : '';
      const see = el('button', 'palm-scan reward-btn', copy.unlock || TOOLS_COPY.en.rashi.unlock); see.type = 'button';
      see.addEventListener('click', async () => {
        if (!(await watchForResult())) return;
        try { window.localStorage.setItem(RASHI_UNLOCK_KEY, localIso(new Date())); } catch (_error) { /* not remembered: asks again next time */ }
        renderRashi();
        if (state.day) ratingCompleted('rashiphal');
      });
      box.replaceChildren(el('h3', 'rashi-reading-title', `${RASHI_ICONS[state.rashiPick - 1]} ${signName(state.rashiPick)}`), el('p', 'rashi-hint', copy.unlockNote || TOOLS_COPY.en.rashi.unlockNote), see);
      return;
    }
    if (!state.rashiPick) {   // nothing picked yet: just the sign grid and a hint
      $('rashi-moon').textContent = state.day ? calendarUI.formatDate(state.lang, state.day.date, 'full') : '';
      return;
    }
    if (state.rashiMode === 'week') renderRashiWeek(); else if (state.rashiMode === 'month') renderRashiMonth(); else renderRashiDay();
  }
  document.querySelectorAll('#rashi-mode button').forEach(button => button.addEventListener('click', () => { state.rashiMode = button.dataset.rmode; renderRashi(); }));
  const rashiStep = days => { if (state.rashiMode === 'month') moveMonth(days); else selectDate(shiftIso(state.selectedDate || localIso(new Date()), state.rashiMode === 'week' ? days * 7 : days)); };
  $('rashi-prev').addEventListener('click', () => rashiStep(-1));
  $('rashi-next').addEventListener('click', () => rashiStep(1));
  $('rashi-today').addEventListener('click', () => selectDate(state.todayIso || localIso(new Date())));
  function renderDay() {
    renderRashi();
    renderHomeAi();
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

    if (day.date === state.todayIso) { state.today = day; renderTodayStrip(); }
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
        [t('vijaya'), span(timings.vijaya_muhurta)], [t('sayahnaSandhya'), span(timings.sayahna_sandhya)], [t('nishita'), span(timings.nishita_muhurta)],
        ...((day.amrita_kalam || []).length ? [[toolText().cards.amrita, day.amrita_kalam.map(item => ({ text: `${clock(item.starts_at, date)} – ${clock(item.ends_at, date)}`, note: nakshatraName(item.nakshatra_index) }))]] : [])], 'good'),
      section(t('dpInauspicious'), [
        [t('rahu'), span(timings.rahu_kalam)], [t('yamaganda'), span(timings.yamaganda)], [t('gulika'), span(timings.gulika_kalam)],
        ...((day.durmuhurtam || []).length ? [[toolText().cards.durmuhurtam, day.durmuhurtam.map(([start, end]) => ({ text: `${clock(start, date)} – ${clock(end, date)}` }))]] : []),
        [t('varjyam'), day.varjyam.map(item => ({ text: `${clock(item.starts_at, date)} – ${clock(item.ends_at, date)}`, note: nakshatraName(item.nakshatra_index) }))]], 'bad'),
      section(t('dpDay'), [[t('dinamana'), one(duration(day.dinamana_minutes))], [t('ratrimana'), one(duration(day.ratrimana_minutes))], [t('madhyahna'), one(clock(day.madhyahna, date))]]));
    renderDayCards(day);
  }
  // The day at a glance: swipeable cards like a printed calendar's boxes, plus a WhatsApp share of the day.
  function renderDayCards(day) {
    const copy = toolText().cards, date = day.date, host = $('day-cards');
    const range = (start, end) => `${clock(start, date)} – ${clock(end, date)}`;
    const dateLabel = calendarUI.formatDate(state.lang, date, 'short');
    const card = (kind, title, rows) => {
      const box = el('article', `day-card ${kind}`);
      const head = el('header'); head.append(el('h3', null, title), el('small', null, dateLabel));
      const list = el('ul');
      for (const [label, values] of rows) {
        if (!values || !values.length) continue;
        const item = el('li'); item.appendChild(el('b', null, `${label}: `));
        values.forEach((value, i) => { if (i) item.appendChild(el('span', 'again', ` ${copy.again} `)); item.appendChild(el('span', null, value)); });
        list.appendChild(item);
      }
      box.append(head, list);
      return box;
    };
    const timings = day.timings || {};
    const segments = (items, nameOf) => (items || []).map(item => `${nameOf(item.index)} (${range(item.starts_at, item.ends_at)})`);
    const good = card('good', copy.good, [
      [t('abhijit'), timings.abhijit ? [range(...timings.abhijit)] : []],
      [copy.amrita, (day.amrita_kalam || []).map(item => range(item.starts_at, item.ends_at))],
      [t('brahma'), timings.brahma_muhurta ? [range(...timings.brahma_muhurta)] : []],
      [t('vijaya'), timings.vijaya_muhurta ? [range(...timings.vijaya_muhurta)] : []],
    ]);
    const lunar = day.samvatsara_index && day.lunar_month ? lunarLine([{ samvatsara_index: day.samvatsara_index, lunar_month: day.lunar_month, adhika_month: day.adhika_month }]) : '';
    const panchang = card('panchang', copy.panchang, [
      [t('tithi'), segments(day.tithi, index => names.tithiName(index, state.lang))],
      [t('nakshatra'), segments(day.nakshatra, index => names.nakshatraName(index, state.lang))],
      [t('yoga'), segments(day.yoga, index => names.yogaName(index, state.lang))],
    ]);
    if (lunar) { const [head, list] = [...panchang.children]; panchang.replaceChildren(head, el('p', 'lunar', lunar), list); }
    const events = day.event_muhurtas || {};
    const eventRows = ['marriage', 'gruhapravesam', 'vehicle'].map(name => [copy[name], (events[name] || []).map(([start, end]) => range(start, end))]);
    const muhurtas = card('events', copy.events, eventRows);
    if (!eventRows.some(([, values]) => values.length)) muhurtas.appendChild(el('p', 'empty', copy.none));
    muhurtas.appendChild(el('p', 'muted-note', copy.eventNote));
    const bad = card('bad', copy.bad, [
      [t('rahu'), timings.rahu_kalam ? [range(...timings.rahu_kalam)] : []],
      [t('yamaganda'), timings.yamaganda ? [range(...timings.yamaganda)] : []],
      [t('gulika'), timings.gulika_kalam ? [range(...timings.gulika_kalam)] : []],
      [copy.durmuhurtam, (day.durmuhurtam || []).map(([start, end]) => range(start, end))],
      [t('varjyam'), (day.varjyam || []).map(item => range(item.starts_at, item.ends_at))],
    ]);
    host.replaceChildren(good, panchang, muhurtas, bad);
    $('day-cards-hint').textContent = copy.swipe;
    $('dp-full-title').textContent = copy.full;
    const share = $('share-day'); share.hidden = false; waLabel(share, copy.share);
    share.onclick = () => shareDayOnWhatsApp(day);
  }
  function shareDayOnWhatsApp(day) {
    const copy = toolText().cards, date = day.date, timings = day.timings || {};
    const range = span => (Array.isArray(span) ? `${clock(span[0], date)} – ${clock(span[1], date)}` : '');
    const first = (items, nameOf) => (items && items[0] ? `${nameOf(items[0].index)} (→ ${clock(items[0].ends_at, date)})` : '');
    const lunar = day.samvatsara_index && day.lunar_month ? lunarLine([{ samvatsara_index: day.samvatsara_index, lunar_month: day.lunar_month, adhika_month: day.adhika_month }]) : '';
    const festivals = eventsOn(date).map(eventName).join(', ');
    const lines = [
      `🗓️ ${calendarUI.formatDate(state.lang, date, 'full')} · ${day.place}`,
      lunar,
      festivals ? `🪔 ${festivals}` : '',
      `🌅 ${t('sunrise')} ${clock(day.sunrise, date)} · 🌇 ${t('sunset')} ${clock(day.sunset, date)}`,
      `📿 ${t('tithi')}: ${first(day.tithi, index => names.tithiName(index, state.lang))}`,
      `⭐ ${t('nakshatra')}: ${first(day.nakshatra, index => names.nakshatraName(index, state.lang))}`,
      `✅ ${t('abhijit')}: ${range(timings.abhijit)}`,
      (day.amrita_kalam || []).length ? `✨ ${copy.amrita}: ${day.amrita_kalam.map(item => range([item.starts_at, item.ends_at])).join(', ')}` : '',
      `⚠️ ${t('rahu')}: ${range(timings.rahu_kalam)}`,
      `⚠️ ${t('yamaganda')}: ${range(timings.yamaganda)}`,
      (day.durmuhurtam || []).length ? `⛔ ${copy.durmuhurtam}: ${day.durmuhurtam.map(range).join(', ')}` : '',
    ].filter(Boolean);
    lines.push('', `— Jyotirmaya AstroChat: ${window.location && window.location.origin ? window.location.origin : ''}`);
    const text = lines.join('\n').replace(/[\u2066-\u2069]/g, '');
    try { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); } catch (_error) { /* no browser */ }
  }
  // A slim "today" card at the top of Home: date, weekday and year, and the tithi and nakshatra running now.
  // A tap opens today's full Panchang below (like the Jathakam card opens the chart).
  function renderTodayStrip() {
    const box = $('today-strip'), day = state.today;
    if (!box) return;
    if (!day || !Array.isArray(day.tithi) || !day.tithi.length) { box.hidden = true; return; }
    const iso = day.date, now = `${localIso(new Date())}T${new Date().toTimeString().slice(0, 5)}`;
    const pick = items => (Array.isArray(items) && items.length ? items.find(item => item.starts_at <= now && now < item.ends_at) || items[0] : null);
    const tithi = pick(day.tithi), star = pick(day.nakshatra), date = new Date(`${iso}T12:00:00Z`);
    const when = `${date.getUTCDate()} ${calendarUI.monthName(state.lang, date.getUTCMonth(), 'short')} | ${t('dpTitle')} · ${calendarUI.weekdayName(state.lang, date.getUTCDay())}, ${date.getUTCFullYear()}`;
    const what = [names.tithiName(tithi.index, state.lang), star ? names.nakshatraName(star.index, state.lang) : ''].filter(Boolean).join(' · ');
    box.replaceChildren(el('b', 'ts-when', when), el('span', 'ts-what', `${moonEmoji(tithi.index)} ${what} ›`));
    box.hidden = false;
  }
  function openToday() {
    if (state.todayIso && state.day && state.day.date !== state.todayIso) selectDate(state.todayIso);
    toPanchang();
  }
  async function loadDay(iso, followToday = false, quiet = false) {
    const request = ++state.dayRequest, status = $('dp-status');
    if (!state.city) { status.textContent = t('selectCity'); markDayReady(); return; }
    if (!quiet) status.textContent = t('dpLoading');   // quiet: the saved Panchang is already showing
    try {
      const { ok, body } = await post('/api/day-panchang', { date: iso, place: state.city });
      if (request !== state.dayRequest) return;
      if (!ok || !body || !body.day) {
        markDayReady();
        if (quiet && state.day) return;   // keep the saved one
        state.day = null; clearDay(); status.textContent = t('dpUnavailable'); return;
      }
      state.todayIso = body.day.today_local_date;
      if (followToday && body.day.today_local_date !== body.day.date) { selectDate(body.day.today_local_date); return; }
      state.day = body.day; status.textContent = '';
      $('dp-date').value = state.day.date;
      renderDay(); renderCalendar(); renderDayEvents();
      if (state.day.date === state.todayIso) keepToday(state.day);
      markDayReady();
    } catch (_error) {
      markDayReady();
      if (request === state.dayRequest && !(quiet && state.day)) { state.day = null; clearDay(); status.textContent = t('dpUnavailable'); }
    }
  }

  /* --------------------------------------------------------- Home: calendar */
  const eventsOn = iso => (state.month && state.month.events ? state.month.events.filter(event => event.date === iso) : []);
  const eventName = event => calendarUI.festivalName(state.lang, event.key);
  const IMPORTANT = { 11: 'E', 26: 'E', 15: 'P', 30: 'A' };
  const MARKS = { E: '🙏', P: '🌕', A: '🌑' };
  // Short time for small spaces: 'సా.6:09' in Telugu, '6:09p' otherwise; '+1' when it falls on the next day.
  function shortClock(iso, baseDate) {
    const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(iso || '');
    if (!match) return '';
    const hour = Number(match[2]), text = `${(hour % 12) || 12}:${match[3]}`, later = match[1] !== baseDate ? '⁺¹' : '';
    if (state.lang === 'te') return `${hour < 12 ? 'ఉ' : hour < 16 ? 'మ' : hour < 19 ? 'సా' : 'రా'}.${text}${later}`;
    return `${text}${hour < 12 ? 'a' : 'p'}${later}`;
  }
  // 'శ్రీ పరాభవ నామ సంవత్సరం, ఆశ్వయుజం – కార్తీకం మాసం' for the days shown.
  function lunarLine(days) {
    const copy = toolText().lunar, years = [], months = [];
    for (const day of days) {
      if (day.samvatsara_index && !years.includes(day.samvatsara_index)) years.push(day.samvatsara_index);
      const key = day.lunar_month ? `${day.adhika_month ? 'A' : ''}${day.lunar_month}` : '';
      if (key && !months.includes(key)) months.push(key);
    }
    if (!years.length || !months.length) return '';
    const masa = key => { const name = names.masaName(Number(key.replace('A', '')), state.lang); return key.startsWith('A') ? fill(copy.adhika, { m: name }) : name; };
    const year = years.map(index => names.samvatsaraName(index, state.lang)).join(' → ');
    return `${fill(copy.year, { s: year })}, ${fill(copy.month, { m: months.map(masa).join(' – ') })}`;
  }
  function renderCalendar() {
    const { year, month } = state.view;
    const grid = $('month-calendar');
    grid.replaceChildren();
    if (!year) { $('month-title').textContent = ''; $('month-sub').textContent = ''; $('cal-legend').replaceChildren(); $('month-events').replaceChildren(); return; }
    $('month-title').textContent = calendarUI.monthTitle(year, month, state.lang);
    $('month-sub').textContent = '';
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
        if (entry.tithi_ends_at) button.appendChild(el('em', 'tithi-end', shortClock(entry.tithi_ends_at, iso)));
        button.dataset.pk = entry.tithi_index <= 15 ? 'S' : 'K';
        if (mark) { button.dataset.imp = mark; button.appendChild(el('i', 'mark', MARKS[mark])); }
        const festivalText = dayEvents.map(eventName).join(', ');
        button.setAttribute('aria-label', `${iso}: ${tithi}, ${nakshatra}${festivalText ? ', ' + festivalText : ''}`);
        button.title = `${tithi} · ${nakshatra}${festivalText ? ' · ' + festivalText : ''}`;
      } else button.setAttribute('aria-label', iso);
      if (dayEvents.length) button.appendChild(el('i', 'fest', '✦'));
      button.addEventListener('click', () => openDay(iso));
      grid.appendChild(button);
    }
    if (loaded) $('month-sub').textContent = lunarLine(loaded);
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
      row.addEventListener('click', () => openDay(event.date));
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
  // From the Calendar tab: show that day's full Panchang on Home.
  function openDay(iso) {
    selectDate(iso);
    showPage('home');
    try { $('detail-title').scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); } catch (_error) { /* scrolling is optional */ }
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
  function renderHome() { renderDay(); renderCalendar(); renderDayEvents(); renderFestivals(); }
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
    renderTools();
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
        state.partnerPortrait = { status: 'idle', image: null };   // the old illustration no longer matches this chart
        renderRelationship();
        saveProfile({ dob: data.get('dob'), pob: data.get('pob'), tob: data.get('tob') });
        renderChart(); $('chart').hidden = false;
        useOwnRashi();
        setChatEnabled(true); intake.step = null; resetChat(t('chartReady'));
        showPage('kundli');
        const target = $('chart'); if (target.scrollIntoView) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        ratingCompleted('kundli');
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
  // The astrologer introduces itself by name and greets the user by theirs, then says what comes next.
  function resetChat(message) {
    chatLog.replaceChildren();
    const persona = toolText().persona || TOOLS_COPY.en.persona;
    if (message === t('chartReady') || message === t('chatAskDob')) addMessage('assistant', fill(persona.hello, { name: state.userName ? ` ${state.userName}` : '' }));
    addMessage('assistant', message);
    history.length = 0;
  }
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
    const todayIso = new Date().toISOString().slice(0, 10);
    if (d && d.planets) {
      // All twelve houses with their lords, occupants and aspects, so the AI can read a question's own houses from the chart.
      const lords = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
      const aspectsOf = { Mars: [4, 7, 8], Jupiter: [5, 7, 9], Saturn: [3, 7, 10], Sun: [7], Moon: [7], Mercury: [7], Venus: [7] };
      const placed = Object.entries(d.planets), lagnaIndex = chart.ascendant.rashi_index;
      for (let house = 1; house <= 12; house += 1) {
        const rashi = (lagnaIndex + house - 2) % 12 + 1, lord = lords[rashi - 1], lordAt = d.planets[lord];
        const inside = placed.filter(([, p]) => p.whole_sign_bhava === house).map(([name]) => name);
        const seen = placed.filter(([name, p]) => (aspectsOf[name] || []).some(a => (p.whole_sign_bhava + a - 2) % 12 + 1 === house)).map(([name]) => name);
        facts.push(`House ${house} (${sign(rashi)}): lord ${lord} sits in house ${lordAt ? lordAt.whole_sign_bhava + ' (' + sign(lordAt.rashi_index) + ')' : 'unknown'}${inside.length ? '; occupied by ' + inside.join(', ') : '; empty'}${seen.length ? '; aspected by ' + seen.join(', ') : ''}`);
      }
      const nav = d.navamsa;
      if (nav && nav.positions) facts.push(`Navamsa (D9): Lagna ${sign(nav.lagna_rashi_index)}${['Venus', 'Jupiter', 'Moon', 'Saturn', 'Mars'].filter(n => nav.positions[n]).map(n => `, ${n} ${sign(nav.positions[n])}`).join('')}`);
    }
    if (d && d.dasha && d.dasha.mahadasha) {
      const all = d.dasha.mahadasha, from = Math.max(all.findIndex(m => m.current), 0);
      facts.push(`Mahadasha timeline (approximate dates): ${all.slice(from, from + 4).map(m => `${m.lord} ${m.start} to ${m.end}`).join('; ')}`);
      const later = (d.dasha.antardasha || []).filter(a => a.end >= todayIso);
      if (later.length) facts.push(`Antardashas in the current Mahadasha: ${later.map(a => `${a.lord} ${a.start} to ${a.end}`).join('; ')}`);
    }
    facts.push(`Today's date: ${todayIso}`);
    // Only calculated labels leave the browser; unreviewed life-area readings do not.
    return facts;
  }
  // Native Android app only: a Google AdMob banner is drawn by the app below the page. The server switches it on and off.
  // The bottom banner is hidden on the Ask page (like Palm AI keeps its chat clean) and while the camera is open (the
  // banner is a native view that would cover the shutter); it is shown on the other screens.
  function setBannerHidden(reason, on) {
    const had = bannerHold.size > 0;
    if (on) bannerHold.add(reason); else bannerHold.delete(reason);
    const hide = bannerHold.size > 0, admob = appAds.admob;
    if (hide === had || !admob || !appAds.config) return;
    try {
      if (hide) { void Promise.resolve(admob.hideBanner && admob.hideBanner()).catch(() => {}); document.documentElement.style.setProperty('--ad-height', '0px'); }
      else { void Promise.resolve(admob.resumeBanner && admob.resumeBanner()).catch(() => {}); setAdHeight(appAds.height || 0); }
    } catch (_error) { /* optional */ }
  }
  function syncBanner(page) { setBannerHidden('chat', page === 'chat'); }
  function setAdHeight(pixels) {
    const height = Number.isFinite(pixels) && pixels > 0 ? Math.min(Math.round(pixels), 200) : 0;
    if (!bannerHold.size) appAds.height = height;
    document.documentElement.style.setProperty('--ad-height', `${height}px`);
  }
  const adUnitOk = id => /^ca-app-pub-\d{16}\/\d{10}$/.test(id || '');
  // "▶ See my reading": a rewarded ad before a Tarot or palm reading, and once a day before the Rashiphal (like Palm AI).
  // Only in the Android app with ads on and the feature switched on in the admin panel; elsewhere results are free.
  const rewardedFor = feature => { const { config, admob } = appAds; return !!(config && admob && config.rewarded && config.rewarded[feature] === true && adUnitOk(config.rewarded_id)); };
  const watchForResult = () => unlockGate('unlock', '', false, false);   // the ▶ button itself is the user's choice: no extra prompt, unless paying is also offered
  const RASHI_UNLOCK_KEY = 'jyotisha.rashi-unlock.v1';
  const rashiUnlocked = () => { try { return window.localStorage.getItem(RASHI_UNLOCK_KEY) === localIso(new Date()); } catch (_error) { return false; } };
  // Rewarded ad before a Kundli is generated. Resolves true when the user may go ahead: they watched the ad, are inside
  // the free window after a recent ad, or the ad could not be shown (an ad problem never blocks the user).
  function rewardedGate() {
    const { config } = appAds;
    if (!config || config.rewarded_kundli !== true || Date.now() < appAds.freeUntil) return Promise.resolve(true);
    return unlockGate('unlock', t('watchAdPrompt'), true);
  }
  // When enabled, native Google Play Billing takes priority in Android; Razorpay remains available when Play is off
  // and for web checkout. The server verifies every Play token before the native plugin consumes it.
  const entitlementKey = (productId, contextId) => `jyotisha.play.v1:${productId}:${contextId}`;
  const hasEntitlement = (productId, contextId) => { try { return window.localStorage.getItem(entitlementKey(productId, contextId)) === '1'; } catch (_error) { return false; } };
  const contentUnlocked = (productId, contextId) => !playBillingActive() || hasEntitlement(productId, contextId);
  const saveEntitlement = (productId, contextId) => { try { window.localStorage.setItem(entitlementKey(productId, contextId), '1'); } catch (_error) { /* current session still proceeds */ } };
  const playPlugin = () => window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PlayBilling;
  const playBillingActive = () => !!(state.payments && state.payments.provider === 'google_play' && state.payments.products && playPlugin());
  function productPrice(productId) {
    const product = state.payments && state.payments.products && state.payments.products[productId];
    return product && (product.formattedPrice || `₹${product.price_rs}`);
  }
  async function loadPlayProducts() {
    const plugin = playPlugin(), products = state.payments && state.payments.products;
    if (!plugin || !plugin.getProducts || !products) return;
    try {
      const reply = await plugin.getProducts({ productIds: Object.keys(products) });
      for (const item of (reply && reply.products) || []) if (products[item.productId]) Object.assign(products[item.productId], item);
    } catch (_error) { /* purchase buttons retain their clearly labelled fallback INR prices */ }
  }
  const pendingContextKey = productId => `jyotisha.play.pending.v1:${productId}`;
  const purchaseResumeKey = productId => `jyotisha.play.resume.v1:${productId}`;
  function rememberPurchaseScreen(productId, contextId) {
    const resume = { contextId, createdAt: Date.now(), page: currentPage };
    // Google Play may briefly leave the app (and the phone can reclaim the WebView). Keep only the generated
    // palm text, never the user's photo, so a paid reading can still be delivered after Android recreates us.
    if (productId === 'palm_detailed' && palmState.reading) {
      resume.palm = { hand: palmState.hand, reading: palmState.reading, status: palmState.status };
    } else if (productId === 'rashiphal_forecast_7d') {
      resume.rashi = { selectedDate: state.selectedDate, rashiPick: state.rashiPick || null };
    }
    try { window.localStorage.setItem(purchaseResumeKey(productId), JSON.stringify(resume)); } catch (_error) { /* optional recovery */ }
  }
  function clearPurchaseResume(productId) {
    try { window.localStorage.removeItem(purchaseResumeKey(productId)); } catch (_error) { /* optional */ }
  }
  function resumePurchasedScreen(productId, contextId) {
    let resume = null;
    try { resume = JSON.parse(window.localStorage.getItem(purchaseResumeKey(productId)) || 'null'); } catch (_error) { resume = null; }
    if (!resume || resume.contextId !== contextId || !Number.isFinite(resume.createdAt) || Date.now() - resume.createdAt > 86400000) {
      clearPurchaseResume(productId); return;
    }
    if (productId === 'palm_detailed' && resume.palm && resume.palm.reading) {
      palmState.hand = resume.palm.hand === 'left' ? 'left' : 'right';
      palmState.reading = resume.palm.reading; palmState.status = resume.palm.status || 'ok';
      palmState.step = 'result'; palmState.tab = 0; palmState.preview = null;
      showPage('palm'); renderPalm();
    } else if (productId === 'rashiphal_forecast_7d' && resume.rashi) {
      state.rashiMode = 'week';
      if (/^\d{4}-\d{2}-\d{2}$/.test(resume.rashi.selectedDate || '')) state.selectedDate = resume.rashi.selectedDate;
      if (Number.isInteger(resume.rashi.rashiPick) && resume.rashi.rashiPick >= 1 && resume.rashi.rashiPick <= 12) state.rashiPick = resume.rashi.rashiPick;
      showPage('rashi'); renderRashi();
    } else {
      const pageByProduct = { dosha_remedies: 'kundli', kundli_complete: 'kundli', ai_questions_5: 'chat',
        ai_action_plan_7d: 'chat', tarot_detailed: 'tarot', sign_match_full: 'signmatch',
        partner_portrait: 'relationship', kundli_match_full: 'relationship' };
      if (pageByProduct[productId]) showPage(pageByProduct[productId]);
    }
    clearPurchaseResume(productId);
    showToast({ te: 'చెల్లింపు విజయవంతమైంది — మీ ఫలితం అన్‌లాక్ అయింది.', hi: 'भुगतान सफल रहा — आपका परिणाम अनलॉक हो गया है।', en: 'Payment successful — your result is unlocked.' }[state.lang] || 'Payment successful — your result is unlocked.');
  }
  async function verifyPlayPurchase(productId, purchaseToken, contextId) {
    let checked = null, verificationReason = '';
    // A new order can take a moment to appear in the Android Publisher API. Retrying here prevents a completed
    // charge from being stranded just because the first verification request raced Google Play propagation.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try { checked = await post('/api/play-purchase/verify', { product_id: productId, purchase_token: purchaseToken, context_id: contextId }); }
      catch (_error) { checked = null; }
      if (checked && checked.ok && checked.body && checked.body.status === 'ok') return checked;
      const latestReason = checked && checked.body && checked.body.error ? String(checked.body.error) : '';
      // A final 429 must not hide the useful verification error returned by an earlier attempt.
      if (latestReason && (!verificationReason || !latestReason.toLowerCase().includes('too many requests'))) verificationReason = latestReason;
      if (checked && checked.status === 429) break;
      if (attempt < 2) await wait(1000 * (attempt + 1));
    }
    const reason = verificationReason || (checked && checked.body && checked.body.error ? String(checked.body.error) : '');
    const message = {
      te: 'మీ చెల్లింపు Google Playలో ఉంది, కానీ సర్వర్ verification పూర్తికాలేదు. మళ్లీ payment చేయకండి.',
      hi: 'आपका भुगतान Google Play में है, लेकिन server verification पूरा नहीं हुआ। दोबारा payment न करें।',
      en: 'Your payment is in Google Play, but server verification did not finish. Do not pay again.',
    }[state.lang] || 'Your payment is in Google Play, but server verification did not finish. Do not pay again.';
    showToast(`${message}${reason ? ` (${reason})` : ''}`);
    return checked;
  }
  let restoringPlayPurchases = false;
  async function restorePlayPurchases() {
    const plugin = playPlugin();
    if (restoringPlayPurchases || !plugin || !plugin.restorePurchases || !state.payments || state.payments.provider !== 'google_play') return;
    restoringPlayPurchases = true;
    try {
      const reply = await plugin.restorePurchases();
      for (const purchase of (reply && reply.purchases) || []) {
        const productId = purchase.products && purchase.products[0];
        if (!productId || !state.payments.products[productId]) continue;
        let contextId = '';
        try { contextId = window.localStorage.getItem(pendingContextKey(productId)) || ''; } catch (_error) { /* cannot safely restore without its context */ }
        if (!contextId) continue;
        const checked = await verifyPlayPurchase(productId, purchase.purchaseToken, contextId);
        if (checked && checked.ok && checked.body && checked.body.status === 'ok') {
          saveEntitlement(productId, contextId); await plugin.completePurchase({ purchaseToken: purchase.purchaseToken });
          try { window.localStorage.removeItem(pendingContextKey(productId)); } catch (_error) { /* optional */ }
          resumePurchasedScreen(productId, contextId);
        }
      }
    } catch (_error) { /* retried on the next launch or resume */ }
    finally { restoringPlayPurchases = false; }
  }
  // MainActivity calls this after returning from Google Play or a UPI app. The delay lets BillingClient deliver its
  // normal callback first; restore is the safety net when Android recreated the activity and that callback was lost.
  window.__jyotishaRestorePlayPurchases = () => { setTimeout(() => { void restorePlayPurchases(); }, 1200); };
  async function purchaseProduct(productId, contextId) {
    const plugin = playPlugin();
    if (!playBillingActive() || !plugin.purchase || !state.payments.products[productId]) return false;
    try {
      try { window.localStorage.setItem(pendingContextKey(productId), contextId); } catch (_error) { /* restoration may be unavailable */ }
      rememberPurchaseScreen(productId, contextId);
      const account = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`jyotisha|${state.userName || ''}|${state.userDob || ''}`));
      const obfuscatedAccountId = Array.from(new Uint8Array(account)).map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 64);
      const bought = await plugin.purchase({ productId, obfuscatedAccountId });
      if (!bought || !bought.purchaseToken) return false;
      const checked = await verifyPlayPurchase(productId, bought.purchaseToken, contextId);
      if (!checked || !checked.ok || !checked.body || checked.body.status !== 'ok') return false;
      saveEntitlement(productId, contextId);
      await plugin.completePurchase({ purchaseToken: bought.purchaseToken });
      try { window.localStorage.removeItem(pendingContextKey(productId)); } catch (_error) { /* optional */ }
      return true;
    } catch (_error) { return false; }
  }
  function paidCopy(productId) {
    const name = state.payments && state.payments.products && state.payments.products[productId] && state.payments.products[productId].title;
    const localized = {
      te: ['మీ ఫలితంలో ఇంకా లోతుగా తెలుసుకోవాలా?', 'Google Play ద్వారా సురక్షితంగా అన్‌లాక్ చేయండి', 'అన్‌లాక్ చేయండి'],
      hi: ['अपने परिणाम को और गहराई से जानना चाहते हैं?', 'Google Play से सुरक्षित रूप से अनलॉक करें', 'अनलॉक करें'],
      en: ['Want to understand this result more deeply?', 'Secure one-time purchase through Google Play', 'Unlock'],
    }[state.lang] || ['Want to understand this result more deeply?', 'Secure one-time purchase through Google Play', 'Unlock'];
    return { title: name || localized[0], note: localized[1], button: localized[2] };
  }
  function premiumOffer(productId, contextId, onUnlock) {
    if (!playBillingActive()) return null;
    const copy = paidCopy(productId), card = el('section', 'premium-offer');
    card.append(el('h4', null, `✨ ${copy.title}`), el('p', null, copy.note));
    const button = el('button', 'palm-scan', `${copy.button} · ${productPrice(productId)}`); button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const ok = await purchaseProduct(productId, contextId);
      button.disabled = false;
      if (ok) { if (onUnlock) onUnlock(); clearPurchaseResume(productId); }
    });
    card.appendChild(button); return card;
  }
  let razorpayScript = null;
  function ensureRazorpayScript() {
    if (window.Razorpay) return Promise.resolve();
    if (!razorpayScript) razorpayScript = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
    return razorpayScript;
  }
  async function payViaRazorpay(feature) {
    try {
      const made = await post('/api/payment/create-order', { feature });
      if (!made.ok || !made.body || made.body.status !== 'ok') return false;
      await ensureRazorpayScript();
      return await new Promise(resolve => {
        const order = made.body;
        const checkout = new window.Razorpay({ key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id, name: 'Jyotirmaya AstroChat',
          handler: async response => { try { const verified = await post('/api/payment/verify', { order_id: response.razorpay_order_id, payment_id: response.razorpay_payment_id, signature: response.razorpay_signature, feature }); resolve(verified.ok && verified.body && verified.body.status === 'ok'); } catch (_error) { resolve(false); } },
          modal: { ondismiss: () => resolve(false) } });
        checkout.open();
      });
    } catch (_error) { return false; }
  }
  function legacyUnlockChooser(promptText, priceRs) {
    return new Promise(resolve => {
      const overlay = el('div', 'update-popup'), card = el('div', 'update-popup-card');
      const adBtn = el('button', 'btn', t('watchFreeAdBtn')); adBtn.type = 'button';
      const payBtn = el('button', 'link-btn', fill(t('payInsteadBtn'), { price: priceRs })); payBtn.type = 'button';
      const actions = el('div', 'update-popup-actions'); actions.append(payBtn, adBtn); card.append(el('p', 'update-popup-body', promptText), actions); overlay.appendChild(card);
      const close = result => { try { overlay.remove(); } catch (_error) { /* gone */ } resolve(result); };
      adBtn.addEventListener('click', () => close('ad')); payBtn.addEventListener('click', () => close('pay')); document.body.appendChild(overlay);
    });
  }
  async function unlockGate(feature, promptText, startsFreeWindow, ask = true) {
    if (feature === 'chat_bonus' && state.payments && state.payments.provider === 'google_play' && playPlugin()) {
      const bought = await purchaseProduct('ai_questions_5', localIso(new Date()));
      if (bought) clearPurchaseResume('ai_questions_5');
      return bought;
    }
    if (state.payments && state.payments.key_id) {
      const price = feature === 'chat_bonus' ? state.payments.chat_bonus_rs : state.payments.unlock_rs;
      const choice = await legacyUnlockChooser(promptText || t('unlockPrompt'), price);
      if (choice === 'pay') return payViaRazorpay(feature);
      if (choice === 'ad') return watchRewardedAd('', startsFreeWindow, false);
      return false;
    }
    return watchRewardedAd(promptText, startsFreeWindow, ask);
  }
  // Asks, plays the ad, and resolves true once the user may go ahead (reward earned, or the ad itself was unavailable).
  function watchRewardedAd(promptText, startsFreeWindow, ask = true) {
    const { config, admob } = appAds;
    if (!config || !admob || !adUnitOk(config.rewarded_id)) return Promise.resolve(true);
    if (ask && (!window.confirm || !window.confirm(promptText))) return Promise.resolve(false);
    return new Promise(resolve => {
      let earned = false, settled = false;
      const handles = [];
      const finish = result => { if (settled) return; settled = true; if (earned) appAds.lastInterstitial = Date.now();   // no interstitial right after a rewarded ad
        handles.forEach(h => { try { h.remove(); } catch (_error) { /* gone */ } }); resolve(result); };
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
    const paidChat = playBillingActive();
    if (!paidChat && (!config || !admob || !config.chat_free_questions || !adUnitOk(config.rewarded_id))) return true;
    const freeQuestions = paidChat ? 3 : config.chat_free_questions;
    const bonusQuestions = paidChat ? 5 : config.chat_bonus_questions;
    const quota = readQuota();
    if (quota.used < freeQuestions + quota.bonus) { quota.used += 1; writeQuota(quota); return true; }
    const prompt = t('chatLimitPrompt').replace('{free}', freeQuestions).replace('{bonus}', bonusQuestions);
    if (!(await unlockGate('chat_bonus', prompt, false))) return false;
    quota.bonus += bonusQuestions; quota.used += 1; writeQuota(quota);
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
  const admobPlugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob) || null;
  // AdMob is started once (with the consent form where the law requires it), for the banner and the welcome-step ads.
  function ensureAdmob(admob, config) {
    if (!appAds.ready) {
      appAds.ready = (async () => {
        await admob.initialize({ initializeForTesting: config.testing === true });
        try {
          const consent = await admob.requestConsentInfo();
          if (consent && consent.isConsentFormAvailable && consent.status === 'REQUIRED') await admob.showConsentForm();
        } catch (_error) { /* consent is only required in some regions */ }
      })();
    }
    return appAds.ready;
  }
  // A full-screen ad between the first-run steps (switched on in the admin panel). Never blocks the flow: if no ad
  // loads in a few seconds, or the plugin is missing, the steps simply go on.
  async function onboardingAd(unitKey = 'onboarding_interstitial_id') {
    if (!appAds.waiting && !appAds.config) await within(readinessSeen, 2500);
    const config = appAds.waiting || appAds.config, admob = admobPlugin();
    if (!admob || !config || !adUnitOk(config[unitKey])) return;
    try {
      await within(ensureAdmob(admob, config), 6000);
      let done;
      const closed = new Promise(resolve => { done = resolve; });
      const handles = [];
      for (const name of ['interstitialAdDismissed', 'interstitialAdFailedToShow', 'interstitialAdFailedToLoad']) {
        try { handles.push(await admob.addListener(name, () => done())); } catch (_error) { /* older plugin */ }
      }
      const loaded = await within(Promise.resolve(admob.prepareInterstitial({ adId: config[unitKey], isTesting: config.testing === true })).then(() => true), 6000, false);
      if (loaded) { await admob.showInterstitial(); appAds.lastInterstitial = Date.now(); await within(closed, 60000); }
      for (const handle of handles) { try { if (handle && handle.remove) await handle.remove(); } catch (_error) { /* gone */ } }
    } catch (_error) { /* no ad: carry on */ }
  }
  async function startAppAds(config) {
    const admob = admobPlugin();
    if (!admob || !adUnitOk(config.banner_id)) return;
    if (!state.onboarded || appAds.launching) { appAds.waiting = config; return; }   // the banner only after the welcome / loading screens
    appAds.config = config; appAds.admob = admob;
    try {
      await ensureAdmob(admob, config);
      admob.addListener('bannerAdSizeChanged', size => setAdHeight(size && size.height));
      await admob.showBanner({ adId: config.banner_id, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER', margin: 0, isTesting: config.testing === true });
    } catch (_error) { setAdHeight(0); }
  }
  // Replies written by the AI can be reported by email (nothing is sent without the user).
  // Read an answer aloud with the phone's own voice (when it has one for the language).
  const canSpeak = () => !!(window.speechSynthesis && window.SpeechSynthesisUtterance);
  function speak(text) {
    try {
      const synth = window.speechSynthesis;
      if (synth.speaking) { synth.cancel(); return; }
      const talk = new window.SpeechSynthesisUtterance(text);
      talk.lang = calendarUI.LOCALES[state.lang] || 'en-IN';
      synth.speak(talk);
    } catch (_error) { /* no voice */ }
  }
  const SVG_SPEAKER = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  function addAiBar(entry, question, answer) {
    const bar = el('div', 'ai-bar');
    if (canSpeak()) {
      const listen = el('button', 'ai-listen'); listen.type = 'button'; listen.innerHTML = SVG_SPEAKER;
      listen.setAttribute('aria-label', (toolText().menu || TOOLS_COPY.en.menu).listen || 'Listen');
      listen.addEventListener('click', () => speak(answer));
      bar.appendChild(listen);
    }
    if (state.contactEmail) {
      const link = el('a', 'ai-report', t('reportAnswer'));
      const body = `Question:\n${question.slice(0, 300)}\n\nAnswer:\n${answer.slice(0, 1500)}\n\nWhat is wrong with it:\n`;
      link.href = `mailto:${state.contactEmail}?subject=${encodeURIComponent('Report an AI answer')}&body=${encodeURIComponent(body)}`;
      bar.appendChild(link);
    }
    if (bar.children.length) entry.appendChild(bar);
  }
  // Under each answer: a row of chips that lead into the other features (Palm AI does the same to keep people exploring).
  let chipTurn = 0;
  function addChatChips() {
    removeChatChips();
    const names = (toolText().menu || TOOLS_COPY.en.menu).chips || TOOLS_COPY.en.menu.chips;
    const all = [['palm', '✋', openPalm], ['tarot', '🃏', openTarot], ['lifeguide', '⚖️', openLifeGuide], ['numbers', '🔢', openNumerology], ['signmatch', '💑', openSignMatch]];
    const row = el('div', 'chat-chips');
    for (let i = 0; i < 4; i += 1) {
      const [key, icon, go] = all[(chipTurn + i) % all.length];
      const chip = el('button', 'chat-chip', `${icon} ${names[key]}`); chip.type = 'button';
      chip.addEventListener('click', go);
      row.appendChild(chip);
    }
    chipTurn += 1;
    chatLog.appendChild(row); chatLog.scrollTop = chatLog.scrollHeight;
  }
  function addActionPlanOffer(answer) {
    const context = `${localIso(new Date())}-${history.length}`;
    if (hasEntitlement('ai_action_plan_7d', context)) return;
    const offer = premiumOffer('ai_action_plan_7d', context, async () => {
      try {
        const prompt = `Based only on this guidance, create a practical personalized 7-day action plan with one safe, achievable action per day: ${String(answer).slice(0, 900)}`;
        const reply = await post('/api/ask', { question: prompt, language: state.lang, facts: chartFacts(), history: history.slice(-6) });
        if (reply.ok && reply.body && reply.body.answer) {
          const entry = el('div', 'chat-message assistant'); entry.append(el('b', null, '✨ 7-day action plan'), el('p', null, reply.body.answer));
          chatLog.appendChild(entry); chatLog.scrollTop = chatLog.scrollHeight;
        }
      } catch (_error) { /* entitlement remains available for this result */ }
    });
    if (offer) { offer.classList.add('chat-premium'); chatLog.appendChild(offer); chatLog.scrollTop = chatLog.scrollHeight; }
  }
  function removeChatChips() { try { Array.from(chatLog.children).filter(item => item.className === 'chat-chips').forEach(item => chatLog.removeChild(item)); } catch (_error) { /* optional */ } }
  const history = [];   // recent turns sent to the assistant so the chat continues instead of restarting
  async function askAssistant(query) {
    removeChatChips();
    const pending = el('div', 'chat-message assistant', '…'); chatLog.appendChild(pending); chatLog.scrollTop = chatLog.scrollHeight;
    try {
      const { ok, body } = await post('/api/ask', { question: query, language: state.lang, facts: chartFacts(), history: history.slice(-10) });
      if (ok && body && body.answer) { pending.textContent = body.answer; addAiBar(pending, query, body.answer); history.push({ role: 'user', text: query.slice(0, 300) }, { role: 'assistant', text: body.answer.slice(0, 1400) }); addActionPlanOffer(body.answer); addChatChips(); return true; }
    } catch (_error) { /* fall back to the offline answer */ }
    chatLog.removeChild(pending); return false;
  }
  /* ---- No chart yet: the chat asks for date, place and time of birth, then calculates the chart ---- */
  const intake = { step: 'dob', dob: '', pob: '', tob: '', pending: null, recalculating: false };
  const stepPrompt = () => t(intake.step === 'dob' ? 'chatAskDob' : intake.step === 'pob' ? 'chatAskPob' : 'chatAskTob');
  function startIntake() { intake.step = 'dob'; intake.dob = ''; intake.pob = ''; intake.tob = ''; intake.pending = null; resetChat(t('chatAskDob')); }
  function applyChart(body, inputs) {
    state.chart = body.chart; state.details = body.details || null; state.resolved = body.resolved_birth || null;
    if (state.matchWho !== 'others') { state.partnerChart = null; state.partnerDetails = null; }
    state.showLoveReading = false; $('relationship-status').textContent = '';
    state.partnerPortrait = { status: 'idle', image: null };   // the old illustration no longer matches this chart
    renderRelationship();
    try {
      for (const [name, value] of Object.entries(inputs)) { const field = document.querySelector(`[name="${name}"]`); if (field) field.value = value; }
    } catch (_error) { /* the form is a convenience only */ }
    renderChart(); $('chart').hidden = false;
    useOwnRashi();
    void scheduleNotifications();
  }
  async function finishIntake() {
    if (!(await rewardedGate())) { intake.step = 'tob'; intake.tob = ''; addMessage('assistant', t('chatAskTob')); return; }
    addMessage('assistant', t('processing'));
    try {
      const { ok, body } = await post('/api/birth-chart', { dob: intake.dob, pob: intake.pob, tob: intake.tob });
      if (ok && body && body.chart) {
        applyChart(body, { dob: intake.dob, pob: intake.pob, tob: intake.tob });
        saveProfile({ dob: intake.dob, pob: intake.pob, tob: intake.tob });
        const pending = intake.pending; intake.step = null; intake.pending = null; intake.recalculating = false;
        addMessage('assistant', t('chartReady'));
        if (pending) { if (!routeSpecialIntent(pending)) route(pending); } else addJathakam();
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
  // Any of the other tools, asked straight in chat instead of only from their own page. Returns true when handled,
  // so the caller skips the general AI assistant / offline Q&A for it.
  function routeSpecialIntent(query) {
    if (chartUI.isPartnerPortraitRequest(query)) { void chatPartnerPortrait(); return true; }
    if (chartUI.isNumerologyRequest(query)) { void chatNumerology(); return true; }
    if (chartUI.isLifeGuideRequest(query)) { void chatLifeGuide(); return true; }
    if (chartUI.isPalmRequest(query)) { openPalm(); void startPalmScan(); return true; }
    if (chartUI.isTarotRequest(query)) {
      const topic = matchTarotTopic(query);
      if (topic) { void chatTarot(topic); return true; }
      chatTarotAwaitingTopic = true;
      addMessage('assistant', `${tarotCopy().ask} (${TAROT_TOPICS.map(([key]) => tarotCopy().topics[key]).join(', ')})`);
      return true;
    }
    if (chatTarotAwaitingTopic) {
      const topic = matchTarotTopic(query);
      chatTarotAwaitingTopic = false;
      if (topic) { void chatTarot(topic); return true; }
    }
    return false;
  }
  function ask(shown, query, fromPrompt) {
    // Normally gated on having no chart yet; "recalculating" additionally covers typing a new birth date below,
    // even though a (now stale) chart still exists while that recalculation is in progress.
    if (!state.chart || intake.recalculating) {
      if (intake.step === 'busy') return;
      addMessage('user', shown); void intakeInput(query, fromPrompt === true); return;
    }
    addMessage('user', shown);
    if (routeSpecialIntent(query)) return;
    // A bare birth date typed with a chart already on hand means a different Kundli, not a question about this
    // one — recalculate instead of asking the AI assistant, which would otherwise answer from the old chart's
    // facts about an unrelated date and give a nonsensical reading.
    const newDob = !chartUI.isJathakamRequest(query) ? chartUI.parseBirthDate(query) : null;
    if (newDob) {
      intake.recalculating = true; intake.step = 'pob'; intake.dob = newDob; intake.pob = ''; intake.tob = ''; intake.pending = null;
      addMessage('assistant', `${t('chatNewDate')} ${stepPrompt()}`);
      return;
    }
    route(query);
  }
  // "Your ideal partner", asked straight in chat: generate it here (asking for birth details first via the usual
  // intake, above, if there is no chart yet) instead of only offering it on the Love page.
  async function chatPartnerPortrait() {
    let read;
    try { read = chartUI.partnerTraits(state.chart, state.lang); } catch (_error) { addMessage('assistant', t('answerFailed')); return; }
    if (!state.partnerGender) state.partnerGender = state.myRole === 'bride' ? 'man' : 'woman';
    const copy = loveText();
    const previous = state.partnerPortrait && state.partnerPortrait.image;
    try {
      const quota = await getJson('/api/partner-portrait-quota');
      if (quota.ok && quota.body && quota.body.remaining <= 0) { addMessage('assistant', partnerLimitText()); return; }
    } catch (_error) { /* the generation endpoint still enforces the limit */ }
    if (rewardedFor('partner') && !(await watchForResult())) return;
    const pending = el('div', 'chat-message assistant', copy.traitsPortraitLoading);
    chatLog.appendChild(pending); chatLog.scrollTop = chatLog.scrollHeight;
    try {
      const { ok, body } = await post('/api/partner-portrait', { house7_rashi: read.house7Rashi, venus_rashi: read.venusRashi, gender: state.partnerGender });
      chatLog.removeChild(pending);
      if (ok && body && body.status === 'ok' && body.image) {
        state.partnerPortrait = { status: 'ok', image: body.image };
        const entry = el('div', 'chat-message assistant');
        const img = el('img', 'traits-portrait'); img.src = `data:${body.image.mime};base64,${body.image.data}`; img.alt = copy.traitsPortraitBtn;
        entry.appendChild(img);
        chatLog.appendChild(entry); chatLog.scrollTop = chatLog.scrollHeight;
        ratingCompleted('partner');
      } else {
        const limited = body && body.code === 'partner_daily_limit';
        state.partnerPortrait = limited ? { status: previous ? 'ok' : 'unavailable', image: previous || null, notice: 'limit' }
          : { status: body && body.status === 'off' ? 'off' : (previous ? 'ok' : 'unavailable'), image: previous || null, notice: previous ? 'failed' : null };
        addMessage('assistant', limited ? partnerLimitText() : body && body.status === 'off' ? copy.traitsPortraitOff : copy.traitsPortraitUnavailable);
      }
    } catch (_error) { chatLog.removeChild(pending); state.partnerPortrait = { status: previous ? 'ok' : 'unavailable', image: previous || null, notice: previous ? 'failed' : null }; addMessage('assistant', copy.traitsPortraitUnavailable); }
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
  // A WhatsApp share button: a small round green icon.
  const WA_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2a9.8 9.8 0 0 0-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1 0 12 2.2z" fill="#fff"/><path d="M8.7 7.1c.2-.5.5-.5.8-.5h.6c.2 0 .4 0 .6.5l.8 1.9c.1.2.1.4 0 .6l-.5.7c-.2.2-.2.4-.1.6.5.8 1.1 1.6 1.9 2.1.5.4.9.6 1.2.7.2.1.4 0 .5-.2l.7-.8c.2-.2.4-.2.6-.1l1.9.9c.2.1.4.2.4.4 0 .3 0 1.1-.5 1.6-.6.6-1.5.9-2.3.7-1.7-.3-3.3-1.2-4.6-2.5-1.1-1.1-2.1-2.6-2.4-4.1-.2-.9.1-1.8.6-2.4z" fill="#1fb855"/></svg>';
  function waLabel(button, text) {   // just the round icon; the text is for screen readers and the long-press tooltip
    const icon = el('span', 'wa-icon'); icon.innerHTML = WA_ICON;
    button.replaceChildren(icon);
    button.setAttribute('aria-label', text); button.title = text;
    return button;
  }
  async function shareText(title, text) {
    const body = `${title}\n${'='.repeat(Math.min(title.length, 40))}\n\n${text}\n\n— Jyotirmaya AstroChat · ${window.location && window.location.origin ? window.location.origin : ''}`;
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
    sheet.append(el('h1', null, title), makeNode(), el('p', 'pdf-foot', `— Jyotirmaya AstroChat · ${window.location && window.location.origin ? window.location.origin : ''}`));
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
    state.payments = readiness.payments || null;
    if (state.payments && state.payments.provider === 'google_play') void loadPlayProducts().then(restorePlayPurchases);
    startupDone('readiness');
    state.contactEmail = typeof readiness.contact_email === 'string' ? readiness.contact_email : '';
    showNotice(readiness.notice);
    setTeaserConfig(readiness.teasers);
    rememberLaunchAd(readiness.app_ads && readiness.app_ads.enabled === true ? readiness.app_ads : null);
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
  }).catch(() => { $('availability').textContent = t('inputDisabled'); startupDone('readiness'); });
  const saved = loadSettings();
  if (saved) {
    state.city = saved.city; state.useLocation = saved.useLocation; state.onboarded = true; state.userName = saved.name; state.userDob = saved.dob;
    $('welcome-screen').hidden = true; document.body.classList.remove('onboarding-active');
    applyLanguage(saved.lang);
    startHome();
    void launchSplash().then(() => wait(1500)).then(maybeOfferUpdate);
    if (saved.useLocation) void refreshCityFromLocation();
  } else { applyLanguage('en'); showOnboardingStep('welcome'); void runSplash(); }
  void restoreProfile();
  $('forget-profile').addEventListener('click', () => {
    forgetProfile();
    state.chart = null; state.details = null; state.resolved = null;
    state.partnerChart = null; state.partnerDetails = null; state.showLoveReading = false;
    for (const id of ['partner-dob', 'partner-pob', 'partner-tob', 'first-dob', 'first-pob', 'first-tob']) $(id).value = '';
    state.firstChart = null; state.firstDetails = null;
    $('relationship-status').textContent = ''; renderRelationship();
    $('chart').hidden = true;
    renderTools();
    setChatEnabled(true); startIntake();
  });
  $('availability').textContent = t('availabilityChecking');
})();
