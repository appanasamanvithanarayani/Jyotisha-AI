/* Numerology (Indian style): Moolank from the birth day, Bhagyank from the whole birth date, the name number from the
   Chaldean letter values, and the personal year. Worked out on the phone; no AI and nothing is sent anywhere.
   Meanings are traditional, written for reflection, not certainty. Telugu and Hindi are written out; other
   languages show English. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JyotishaNumerology = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Ruling planet of each number (1-9) in Indian numerology.
  const PLANETS = [null, 'Sun', 'Moon', 'Jupiter', 'Rahu', 'Mercury', 'Venus', 'Ketu', 'Saturn', 'Mars'];
  // Friendly numbers (traditional table).
  const FRIENDS = [null, [1, 2, 3, 9], [1, 2, 3, 5], [1, 2, 3, 9], [1, 5, 6, 7], [1, 4, 5, 6], [4, 5, 6, 8], [1, 4, 5, 6], [4, 5, 6, 8], [1, 2, 3, 9]];
  // Lucky weekdays (0 = Sunday) of each number's planet.
  const DAYS = [null, [0], [1], [4], [6, 0], [3], [5], [1, 0], [6], [2]];
  // Chaldean letter values (no letter has 9).
  const CHALDEAN = { a: 1, i: 1, j: 1, q: 1, y: 1, b: 2, k: 2, r: 2, c: 3, g: 3, l: 3, s: 3, d: 4, m: 4, t: 4, e: 5, h: 5, n: 5, x: 5, u: 6, v: 6, w: 6, o: 7, z: 7, f: 8, p: 8 };

  const digits = value => String(value).replace(/\D/g, '').split('').reduce((sum, d) => sum + Number(d), 0);
  function reduce(value) {
    let n = Math.abs(Math.trunc(Number(value) || 0));
    while (n > 9) n = digits(n);
    return n;
  }
  function parse(dob) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dob || ''));
    if (!match) return null;
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return { year, month, day };
  }
  const moolank = dob => { const d = parse(dob); return d ? reduce(d.day) : 0; };
  const bhagyank = dob => (parse(dob) ? reduce(digits(dob)) : 0);
  function nameNumber(name) {
    const letters = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!letters) return null;
    const compound = letters.split('').reduce((sum, letter) => sum + CHALDEAN[letter], 0);
    return { compound, number: reduce(compound) };
  }
  function personalYear(dob, year) {
    const d = parse(dob);
    return d ? reduce(digits(d.day) + digits(d.month) + digits(year)) : 0;
  }
  const inHarmony = (a, b) => a === b || FRIENDS[a].includes(b);
  function luckyNumbers(m, b) {
    const out = [];
    for (const n of [m, b, ...FRIENDS[m]]) if (n && !out.includes(n)) out.push(n);
    return out.slice(0, 4);
  }

  const TEXT = {
    en: {
      numbers: [null,
        { title: 'The Leader', nature: 'You are independent, confident and like to lead. You set your own path and others look to you for direction.', strengths: 'Courage, willpower, originality', care: 'Ego and impatience; listen before you decide' },
        { title: 'The Peacemaker', nature: 'You are gentle, caring and intuitive. You understand feelings and bring people together.', strengths: 'Kindness, imagination, cooperation', care: 'Mood swings and overthinking; trust yourself more' },
        { title: 'The Guide', nature: 'You are wise, cheerful and full of ideas. You love to learn and to teach others.', strengths: 'Wisdom, optimism, expression', care: 'Scattering your energy; finish what you start' },
        { title: 'The Builder', nature: 'You are practical, hard-working and think differently from others. You build things that last.', strengths: 'Discipline, new ideas, loyalty', care: 'Stubbornness and sudden changes; plan your money carefully' },
        { title: 'The Communicator', nature: 'You are quick, clever and love change and travel. You can talk to anyone and learn anything fast.', strengths: 'Intelligence, wit, business sense', care: 'Restlessness and rushing; slow down for big choices' },
        { title: 'The Nurturer', nature: 'You are loving, artistic and devoted to family. You make places and people beautiful.', strengths: 'Charm, care, a sense of beauty', care: 'Pleasing everyone and spending on comfort; keep a balance' },
        { title: 'The Seeker', nature: 'You are thoughtful, spiritual and look beneath the surface. You need quiet time to recharge.', strengths: 'Insight, intuition, research', care: 'Feeling alone or doubtful; share your thoughts with people you trust' },
        { title: 'The Achiever', nature: 'You are serious, patient and work steadily. Success comes slowly but it stays.', strengths: 'Patience, responsibility, endurance', care: 'Worry and delays; be gentle with yourself' },
        { title: 'The Warrior', nature: 'You are energetic, brave and generous. You stand up for what is right and protect others.', strengths: 'Courage, energy, compassion', care: 'Anger and haste; count to ten before you react' }],
      years: [null,
        'A year of new beginnings: start the things you have been planning.',
        'A year of patience and partnership: build relationships and let things grow.',
        'A year of growth and expression: learn, share ideas and enjoy people.',
        'A year of hard work and foundations: organise, save and build steadily.',
        'A year of change and movement: travel, new chances; stay flexible.',
        'A year of family and responsibility: home, love and caring for others.',
        'A year of reflection: study, rest and look inward.',
        'A year of results: work and money matters move forward with effort.',
        'A year of completion: finish old things and make room for the new.'],
    },
    te: {
      numbers: [null,
        { title: 'నాయకుడు', nature: 'మీరు స్వతంత్రంగా, ఆత్మవిశ్వాసంతో ఉంటారు, నాయకత్వం వహించడం మీకు ఇష్టం. మీ దారి మీరే వేసుకుంటారు, ఇతరులు మీ వైపు చూస్తారు.', strengths: 'ధైర్యం, సంకల్ప బలం, కొత్తదనం', care: 'అహంకారం, అసహనం; నిర్ణయం ముందు ఇతరులు చెప్పేది వినండి' },
        { title: 'శాంతి దూత', nature: 'మీరు సౌమ్యంగా, ప్రేమగా ఉంటారు, అంతర్ దృష్టి ఎక్కువ. ఇతరుల భావాలు అర్థం చేసుకుని అందరినీ కలుపుతారు.', strengths: 'దయ, ఊహాశక్తి, సహకారం', care: 'మూడ్ మార్పులు, అతిగా ఆలోచించడం; మిమ్మల్ని మీరు నమ్మండి' },
        { title: 'మార్గదర్శి', nature: 'మీరు జ్ఞానవంతులు, ఉల్లాసంగా ఉంటారు, ఆలోచనలు ఎక్కువ. నేర్చుకోవడం, నేర్పించడం మీకు ఇష్టం.', strengths: 'జ్ఞానం, ఆశావాదం, మాటతీరు', care: 'శక్తిని చెల్లాచెదురు చేయడం; మొదలుపెట్టిన పని పూర్తి చేయండి' },
        { title: 'నిర్మాత', nature: 'మీరు ఆచరణాత్మకంగా, కష్టపడి పనిచేస్తారు, ఇతరులకంటే భిన్నంగా ఆలోచిస్తారు. కాలం నిలిచేవి నిర్మిస్తారు.', strengths: 'క్రమశిక్షణ, కొత్త ఆలోచనలు, నమ్మకం', care: 'మొండితనం, ఆకస్మిక మార్పులు; డబ్బు జాగ్రత్తగా ప్లాన్ చేయండి' },
        { title: 'మాటకారి', nature: 'మీరు చురుకుగా, తెలివిగా ఉంటారు, మార్పు, ప్రయాణాలు ఇష్టం. ఎవరితోనైనా మాట్లాడగలరు, ఏదైనా త్వరగా నేర్చుకుంటారు.', strengths: 'తెలివి, చమత్కారం, వ్యాపార బుద్ధి', care: 'చంచలత్వం, తొందరపాటు; పెద్ద నిర్ణయాలకు నిదానించండి' },
        { title: 'ప్రేమమూర్తి', nature: 'మీరు ప్రేమగా, కళాత్మకంగా ఉంటారు, కుటుంబం అంటే ప్రాణం. మీ చుట్టూ ఉన్నవారిని, ఉన్నవాటిని అందంగా మారుస్తారు.', strengths: 'ఆకర్షణ, శ్రద్ధ, సౌందర్య దృష్టి', care: 'అందరినీ సంతోషపెట్టాలనుకోవడం, సుఖాలకు ఖర్చు; సమతుల్యం పాటించండి' },
        { title: 'అన్వేషి', nature: 'మీరు ఆలోచనాపరులు, ఆధ్యాత్మికంగా ఉంటారు, ప్రతిదాన్ని లోతుగా చూస్తారు. శక్తి పుంజుకోవడానికి మీకు ఏకాంతం అవసరం.', strengths: 'లోతైన అవగాహన, అంతర్ దృష్టి, పరిశోధన', care: 'ఒంటరితనం, సందేహాలు; నమ్మకమైనవారితో మనసు పంచుకోండి' },
        { title: 'సాధకుడు', nature: 'మీరు గంభీరంగా, ఓపికగా, నిలకడగా పనిచేస్తారు. విజయం నిదానంగా వస్తుంది కానీ నిలుస్తుంది.', strengths: 'ఓపిక, బాధ్యత, సహనం', care: 'ఆందోళన, ఆలస్యాలు; మీ పట్ల మీరు మృదువుగా ఉండండి' },
        { title: 'యోధుడు', nature: 'మీరు ఉత్సాహంగా, ధైర్యంగా, దానగుణంతో ఉంటారు. న్యాయం కోసం నిలబడి ఇతరులను కాపాడతారు.', strengths: 'ధైర్యం, శక్తి, కరుణ', care: 'కోపం, తొందరపాటు; స్పందించే ముందు పది వరకు లెక్కపెట్టండి' }],
      years: [null,
        'కొత్త ఆరంభాల సంవత్సరం: అనుకుంటున్న పనులు మొదలుపెట్టండి.',
        'ఓపిక, భాగస్వామ్యాల సంవత్సరం: బంధాలు బలపరచుకోండి, పనులు నెమ్మదిగా పెరగనివ్వండి.',
        'ఎదుగుదల సంవత్సరం: నేర్చుకోండి, ఆలోచనలు పంచుకోండి, నలుగురితో ఆనందించండి.',
        'కష్టపడి పునాది వేసే సంవత్సరం: క్రమబద్ధంగా ఉండండి, పొదుపు చేయండి.',
        'మార్పుల సంవత్సరం: ప్రయాణాలు, కొత్త అవకాశాలు; సర్దుకుపోయే గుణం ఉంచుకోండి.',
        'కుటుంబం, బాధ్యతల సంవత్సరం: ఇల్లు, ప్రేమ, ఇతరుల సంరక్షణ.',
        'ఆత్మపరిశీలన సంవత్సరం: చదువు, విశ్రాంతి, మనసులోకి చూసుకోవడం.',
        'ఫలితాల సంవత్సరం: కష్టపడితే ఉద్యోగం, డబ్బు విషయాలు ముందుకు సాగుతాయి.',
        'ముగింపుల సంవత్సరం: పాత పనులు పూర్తి చేసి కొత్తవాటికి చోటు ఇవ్వండి.'],
    },
    hi: {
      numbers: [null,
        { title: 'नेता', nature: 'आप स्वतंत्र और आत्मविश्वासी हैं, नेतृत्व करना पसंद करते हैं। अपना रास्ता खुद बनाते हैं और लोग आपकी ओर देखते हैं।', strengths: 'साहस, इच्छाशक्ति, मौलिकता', care: 'अहंकार और अधीरता; फ़ैसले से पहले दूसरों की सुनें' },
        { title: 'शांतिदूत', nature: 'आप कोमल, स्नेही और सहज ज्ञान वाले हैं। भावनाओं को समझते हैं और लोगों को जोड़ते हैं।', strengths: 'दया, कल्पना, सहयोग', care: 'मूड बदलना और ज़्यादा सोचना; खुद पर भरोसा रखें' },
        { title: 'मार्गदर्शक', nature: 'आप ज्ञानी, हँसमुख और विचारों से भरे हैं। सीखना और सिखाना आपको पसंद है।', strengths: 'ज्ञान, आशावाद, अभिव्यक्ति', care: 'ऊर्जा बिखेरना; जो शुरू करें उसे पूरा करें' },
        { title: 'निर्माता', nature: 'आप व्यावहारिक, मेहनती हैं और दूसरों से अलग सोचते हैं। टिकाऊ चीज़ें बनाते हैं।', strengths: 'अनुशासन, नए विचार, वफ़ादारी', care: 'ज़िद और अचानक बदलाव; पैसे की योजना सोच-समझकर बनाएँ' },
        { title: 'संवादक', nature: 'आप तेज़ और चतुर हैं, बदलाव और यात्रा पसंद करते हैं। किसी से भी बात कर लेते हैं और जल्दी सीखते हैं।', strengths: 'बुद्धि, हाज़िरजवाबी, व्यापारिक समझ', care: 'बेचैनी और जल्दबाज़ी; बड़े फ़ैसलों में धीरज रखें' },
        { title: 'पालनकर्ता', nature: 'आप प्रेमपूर्ण, कलात्मक और परिवार के प्रति समर्पित हैं। जगह और लोगों को सुंदर बनाते हैं।', strengths: 'आकर्षण, देखभाल, सौंदर्यबोध', care: 'सबको खुश करने की कोशिश और आराम पर खर्च; संतुलन रखें' },
        { title: 'साधक', nature: 'आप विचारशील और आध्यात्मिक हैं, हर बात की गहराई में देखते हैं। ऊर्जा पाने के लिए एकांत चाहिए।', strengths: 'अंतर्दृष्टि, सहज ज्ञान, शोध', care: 'अकेलापन और संदेह; भरोसेमंद लोगों से मन की बात कहें' },
        { title: 'कर्मयोगी', nature: 'आप गंभीर, धैर्यवान हैं और लगातार मेहनत करते हैं। सफलता धीरे आती है पर टिकती है।', strengths: 'धैर्य, ज़िम्मेदारी, सहनशक्ति', care: 'चिंता और देरी; खुद के प्रति नरमी रखें' },
        { title: 'योद्धा', nature: 'आप ऊर्जावान, बहादुर और उदार हैं। सही के लिए खड़े होते हैं और दूसरों की रक्षा करते हैं।', strengths: 'साहस, ऊर्जा, करुणा', care: 'गुस्सा और जल्दबाज़ी; प्रतिक्रिया से पहले दस तक गिनें' }],
      years: [null,
        'नई शुरुआत का साल: जिन कामों की योजना थी, उन्हें शुरू करें।',
        'धैर्य और साझेदारी का साल: रिश्ते मज़बूत करें, चीज़ों को बढ़ने दें।',
        'विकास और अभिव्यक्ति का साल: सीखें, विचार बाँटें, लोगों के साथ खुश रहें।',
        'मेहनत और नींव का साल: व्यवस्थित रहें, बचत करें, धीरे-धीरे बनाएँ।',
        'बदलाव का साल: यात्रा, नए मौके; लचीले रहें।',
        'परिवार और ज़िम्मेदारी का साल: घर, प्रेम और दूसरों की देखभाल।',
        'आत्मचिंतन का साल: पढ़ाई, आराम और भीतर झाँकना।',
        'नतीजों का साल: मेहनत से काम और पैसे के मामले आगे बढ़ेंगे।',
        'पूर्णता का साल: पुराने काम पूरे करें और नए के लिए जगह बनाएँ।'],
    },
  };
  const text = lang => TEXT[lang] || TEXT.en;

  /** Everything the page shows, or null when the date is not a real date. */
  function report(dob, name, lang, year) {
    const m = moolank(dob), b = bhagyank(dob);
    if (!m) return null;
    const words = text(lang), named = nameNumber(name), py = personalYear(dob, year);
    const about = n => ({ number: n, planet: PLANETS[n], ...words.numbers[n] });
    return {
      moolank: about(m), bhagyank: about(b), name: named ? { ...about(named.number), compound: named.compound } : null,
      harmony: named ? inHarmony(m, named.number) : null,
      year: { number: py, text: words.years[py] },
      lucky: { numbers: luckyNumbers(m, b), days: DAYS[m], planet: PLANETS[m] },
    };
  }

  return { PLANETS, FRIENDS, DAYS, reduce, parse, moolank, bhagyank, nameNumber, personalYear, inHarmony, luckyNumbers, report, TEXT };
});
