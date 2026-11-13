/* Notification texts: evening questions and muhurta alerts, in Telugu, English and Hindi (other languages use English).
   Conventional, friendly wording; no predictions or dates. Works in the browser (window.JyotishaNudges) and in Node tests. */
(function (root) {
  'use strict';
  // Playful, curiosity-led wording (in the style of food-delivery app notifications); deity and tithi messages stay respectful.
  // Each row: [title, body, question asked to Jyotisha AI on tap].
  const HOUSES = {
    "te": [
      [
        "🌙 ఈ రోజు స్టార్ మీరే!",
        "చంద్రుడు మీ రాశిలోనే ఉన్నాడు ✨ మీ రోజు ఎలా సాగుతుందో చూసేయండి",
        "ఇప్పుడు చంద్రుడు నా రాశిలోనే ఉన్నాడు. ఈ సమయం నాకు ఎలా ఉంటుంది?"
      ],
      [
        "💰 డబ్బు వాసన వస్తోంది…",
        "చంద్రుడు మీ ధన స్థానంలో ఉన్నాడు 👀 ఏం చేయాలో తెలుసుకోండి",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 2వ స్థానంలో ఉన్నాడు. డబ్బు, కుటుంబ విషయాల్లో ఏం చేయాలి?"
      ],
      [
        "💪 ధైర్యం మోడ్ ఆన్!",
        "ఇప్పుడు ట్రై చేస్తే ఫలిస్తుందా? గ్రహాలను అడిగేయండి 🚀",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 3వ స్థానంలో ఉన్నాడు. నా ప్రయత్నాలు ఫలిస్తాయా?"
      ],
      [
        "🏠 ఇంటి మీద మనసు లాగుతోందా?",
        "చంద్రుడు 4వ ఇంట్లో — అమ్మకి ఒక కాల్ చేసే టైమ్ కావచ్చు 💛",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 4వ స్థానంలో ఉన్నాడు. ఇంటి, మనశ్శాంతి విషయాలు ఎలా ఉంటాయి?"
      ],
      [
        "💡 ఐడియాలు వస్తున్నాయా?",
        "చంద్రుడు 5వ స్థానంలో — మీ ఐడియాకి లక్ కలిసొస్తుందా? 🍀",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 5వ స్థానంలో ఉన్నాడు. చదువు, పిల్లలు, కొత్త ఆలోచనలకు ఎలా ఉంటుంది?"
      ],
      [
        "🩺 కొంచెం స్లో డౌన్ ప్లీజ్",
        "చంద్రుడు 6వ స్థానంలో — ఆరోగ్యం, స్ట్రెస్ కోసం ఒక చిన్న టిప్ 🌿",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 6వ స్థానంలో ఉన్నాడు. ఆరోగ్యం, పనిలో ఒత్తిడి గురించి ఏం చేయాలి?"
      ],
      [
        "💞 ఆ స్పెషల్ పర్సన్ గుర్తొస్తున్నారా?",
        "చంద్రుడు 7వ ఇంట్లో — మీ రిలేషన్‌షిప్ ఎలా ఉంది? చూసేయండి 😉",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 7వ స్థానంలో ఉన్నాడు. భాగస్వామి, సంబంధాల విషయంలో ఎలా ఉంటుంది?"
      ],
      [
        "⚠️ ఇప్పుడు కొంచెం జాగ్రత్త",
        "అష్టమ చంద్రుడు 👀 పెద్ద నిర్ణయాలు ఆపి, ఈ చిన్న పరిహారం చూడండి 🙏",
        "నాకు ఇప్పుడు అష్టమ చంద్రుడు. ఏ జాగ్రత్తలు తీసుకోవాలి, ఏ పరిహారం చేయాలి?"
      ],
      [
        "🍀 లక్ మీ వైపు తిరిగిందా?",
        "చంద్రుడు 9వ ఇంట్లో — మీ లక్ మీటర్ చెక్ చేయండి ✨",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 9వ స్థానంలో ఉన్నాడు. అదృష్టం, పూజలకు ఎలా ఉంటుంది?"
      ],
      [
        "💼 బాస్ మిమ్మల్ని గమనిస్తున్నారా?",
        "చంద్రుడు 10వ స్థానంలో — కెరీర్‌లో ఒక స్టెప్ ముందుకా? 🚀",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 10వ స్థానంలో ఉన్నాడు. ఉద్యోగ విషయాల్లో ఏం చేయాలి?"
      ],
      [
        "🎯 కోరిక నెరవేరే టైమ్ వచ్చిందా?",
        "చంద్రుడు లాభ స్థానంలో 🤑 మీ విష్ లిస్ట్ గురించి అడగండి",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 11వ స్థానంలో ఉన్నాడు. నా కోరికలు నెరవేరుతాయా?"
      ],
      [
        "🛍️ షాపింగ్ కార్ట్ నిండిపోతోందా?",
        "చంద్రుడు 12వ ఇంట్లో — ఖర్చు పెట్టే ముందు ఒక్కసారి చెక్ చేయండి 😅",
        "ఇప్పుడు చంద్రుడు నా రాశి నుండి 12వ స్థానంలో ఉన్నాడు. ఖర్చులు, విశ్రాంతి విషయంలో ఏం చేయాలి?"
      ]
    ],
    "en": [
      [
        "🌙 Today, you’re the main character",
        "The Moon is in your sign ✨ See how your day plays out",
        "The Moon is in my own sign now. How is this time for me?"
      ],
      [
        "💰 Smells like money…",
        "The Moon is in your wealth house 👀 Find out what to do",
        "The Moon is 2nd from my sign now. What should I do about money and family?"
      ],
      [
        "💪 Bold mode: ON",
        "Will your next move pay off? Ask your stars 🚀",
        "The Moon is 3rd from my sign now. Will my efforts pay off?"
      ],
      [
        "🏠 Missing home?",
        "Moon in your 4th house — maybe call mom today 💛",
        "The Moon is 4th from my sign now. How are home and peace of mind for me?"
      ],
      [
        "💡 Big idea brewing?",
        "Moon in your 5th — will luck back your idea? 🍀",
        "The Moon is 5th from my sign now. How is it for studies, children and new ideas?"
      ],
      [
        "🩺 Slow down a little",
        "Moon in your 6th — a quick tip for health and stress 🌿",
        "The Moon is 6th from my sign now. What should I do about health and work pressure?"
      ],
      [
        "💞 Thinking of someone special?",
        "Moon in your 7th — how’s your love life looking? 😉",
        "The Moon is 7th from my sign now. How are my partner and relationships?"
      ],
      [
        "⚠️ Handle today with care",
        "Ashtama Chandra 👀 Pause big decisions — see this small remedy 🙏",
        "I have Ashtama Chandra now. What care should I take, and what remedy helps?"
      ],
      [
        "🍀 Is luck turning your way?",
        "Moon in your 9th — check your luck meter ✨",
        "The Moon is 9th from my sign now. How is it for luck and prayer?"
      ],
      [
        "💼 Is your boss noticing you?",
        "Moon in your 10th — a step up at work? 🚀",
        "The Moon is 10th from my sign now. What should I do at work?"
      ],
      [
        "🎯 Wish-come-true time?",
        "Moon in your gains house 🤑 Ask about your wishlist",
        "The Moon is 11th from my sign now. Will my wishes come true?"
      ],
      [
        "🛍️ Cart filling up?",
        "Moon in your 12th — check before you spend 😅",
        "The Moon is 12th from my sign now. What should I do about expenses and rest?"
      ]
    ],
    "hi": [
      [
        "🌙 आज के हीरो आप हैं!",
        "चंद्रमा आपकी राशि में है ✨ देखें आपका दिन कैसा जाएगा",
        "चंद्रमा अभी मेरी ही राशि में है। यह समय मेरे लिए कैसा है?"
      ],
      [
        "💰 पैसों की खुशबू आ रही है…",
        "चंद्रमा धन भाव में है 👀 जानें क्या करें",
        "चंद्रमा अभी मेरी राशि से दूसरे भाव में है। पैसे और परिवार के बारे में क्या करूँ?"
      ],
      [
        "💪 हिम्मत मोड ऑन!",
        "अभी कोशिश करें तो कामयाबी मिलेगी? ग्रहों से पूछें 🚀",
        "चंद्रमा अभी मेरी राशि से तीसरे भाव में है। क्या मेरी कोशिशें सफल होंगी?"
      ],
      [
        "🏠 घर की याद आ रही है?",
        "चंद्रमा चौथे भाव में — आज माँ को एक कॉल तो बनता है 💛",
        "चंद्रमा अभी मेरी राशि से चौथे भाव में है। घर और मन की शांति कैसी रहेगी?"
      ],
      [
        "💡 कोई बड़ा आइडिया?",
        "चंद्रमा पाँचवें भाव में — क्या किस्मत साथ देगी? 🍀",
        "चंद्रमा अभी मेरी राशि से पाँचवें भाव में है। पढ़ाई, बच्चों और नए विचारों के लिए कैसा है?"
      ],
      [
        "🩺 थोड़ा धीरे चलिए",
        "चंद्रमा छठे भाव में — सेहत और तनाव के लिए एक टिप 🌿",
        "चंद्रमा अभी मेरी राशि से छठे भाव में है। सेहत और काम के दबाव के लिए क्या करूँ?"
      ],
      [
        "💞 किसी ख़ास की याद आ रही है?",
        "चंद्रमा सातवें भाव में — आपका रिश्ता कैसा चल रहा है? 😉",
        "चंद्रमा अभी मेरी राशि से सातवें भाव में है। जीवनसाथी और रिश्तों में कैसा रहेगा?"
      ],
      [
        "⚠️ आज ज़रा संभलकर",
        "अष्टम चंद्र 👀 बड़े फ़ैसले रोकें, यह छोटा उपाय देखें 🙏",
        "मेरा अभी अष्टम चंद्र है। कौन-सी सावधानी और उपाय करूँ?"
      ],
      [
        "🍀 क्या किस्मत पलट रही है?",
        "चंद्रमा नौवें भाव में — अपना लक मीटर चेक करें ✨",
        "चंद्रमा अभी मेरी राशि से नौवें भाव में है। भाग्य और पूजा के लिए कैसा है?"
      ],
      [
        "💼 क्या बॉस की नज़र आप पर है?",
        "चंद्रमा दसवें भाव में — करियर में एक कदम आगे? 🚀",
        "चंद्रमा अभी मेरी राशि से दसवें भाव में है। नौकरी में क्या करूँ?"
      ],
      [
        "🎯 इच्छा पूरी होने का टाइम?",
        "चंद्रमा लाभ भाव में 🤑 अपनी विशलिस्ट के बारे में पूछें",
        "चंद्रमा अभी मेरी राशि से ग्यारहवें भाव में है। क्या मेरी इच्छाएँ पूरी होंगी?"
      ],
      [
        "🛍️ कार्ट भरती जा रही है?",
        "चंद्रमा बारहवें भाव में — खर्च से पहले एक बार चेक करें 😅",
        "चंद्रमा अभी मेरी राशि से बारहवें भाव में है। खर्च और आराम के लिए क्या करूँ?"
      ]
    ]
  };
  const WEEKDAYS = {
    "te": [
      [
        "☀️ సండే = సూర్య దేవుడి రోజు",
        "మీ జాతకంలో సూర్యుడు స్ట్రాంగా? ఒకసారి చెక్ చేయండి 😎",
        "నా జాతకంలో సూర్యుడు ఎలా ఉన్నాడు? ఆదివారం ఏం చేస్తే మంచిది?"
      ],
      [
        "🔱 సోమవారం శివయ్య రోజు",
        "మనసు ప్రశాంతంగా ఉండాలంటే ఈ చిన్న ట్రిక్ 🌙",
        "నా జాతకంలో చంద్రుడు ఎలా ఉన్నాడు? మనశ్శాంతి కోసం ఏం చేయాలి?"
      ],
      [
        "🙏 మంగళవారం హనుమాన్ పవర్!",
        "మీ కుజుడు ఎలా ఉన్నాడు? ధైర్యం కోసం ఒక టిప్ 💪",
        "నా జాతకంలో కుజుడు ఎలా ఉన్నాడు? మంగళవారం ఏ పూజ మంచిది?"
      ],
      [
        "📚 బుధవారం బ్రెయిన్ డే",
        "చదువు, బిజినెస్ — బుధుడు మీ వైపు ఉన్నాడా? 🧠",
        "నా జాతకంలో బుధుడు ఎలా ఉన్నాడు? చదువు, వ్యాపారానికి ఏం చేయాలి?"
      ],
      [
        "🕉️ గురువారం గురు అనుగ్రహం",
        "పెళ్లి, పిల్లలు, లక్ — గురుడు ఏం చెబుతున్నాడు? 🍀",
        "నా జాతకంలో గురుడు ఎలా ఉన్నాడు? గురువారం ఏం చేస్తే మంచిది?"
      ],
      [
        "🌸 శుక్రవారం లక్ష్మీ దేవి రోజు!",
        "డబ్బు రావాలంటే ఈ రోజు చేయాల్సింది ఇదే 💰",
        "నా జాతకంలో శుక్రుడు ఎలా ఉన్నాడు? లక్ష్మీ అనుగ్రహం కోసం ఏం చేయాలి?"
      ],
      [
        "🪔 శనివారం శని దేవుడి రోజు",
        "శని దేవుడిని సంతోషపెట్టే సింపుల్ పరిహారం 😌",
        "నా జాతకంలో శని ఎలా ఉన్నాడు? శనివారం ఏ పరిహారం చేయాలి?"
      ]
    ],
    "en": [
      [
        "☀️ Sunday = Surya’s day",
        "Is the Sun strong in your chart? Check it 😎",
        "How is the Sun in my chart? What is good to do on Sunday?"
      ],
      [
        "🔱 Monday is Shiva’s day",
        "A tiny trick for a calm mind 🌙",
        "How is the Moon in my chart? What helps my peace of mind?"
      ],
      [
        "🙏 Tuesday = Hanuman power!",
        "How’s your Mars? One tip for courage 💪",
        "How is Mars in my chart? Which puja is good on Tuesday?"
      ],
      [
        "📚 Wednesday is brain day",
        "Studies, business — is Mercury on your side? 🧠",
        "How is Mercury in my chart? What helps my studies and business?"
      ],
      [
        "🕉️ Thursday — Guru’s blessings",
        "Marriage, kids, luck — what does Jupiter say? 🍀",
        "How is Jupiter in my chart? What is good to do on Thursday?"
      ],
      [
        "🌸 Friday is Lakshmi’s day!",
        "Here’s what to do today for money to flow 💰",
        "How is Venus in my chart? What brings Lakshmi’s blessings?"
      ],
      [
        "🪔 Saturday is Shani’s day",
        "A simple remedy to keep Shani happy 😌",
        "How is Saturn in my chart? Which remedy should I do on Saturday?"
      ]
    ],
    "hi": [
      [
        "☀️ संडे = सूर्य देव का दिन",
        "क्या आपकी कुंडली में सूर्य मज़बूत है? चेक करें 😎",
        "मेरी कुंडली में सूर्य कैसा है? रविवार को क्या करना अच्छा है?"
      ],
      [
        "🔱 सोमवार भोलेनाथ का दिन",
        "मन की शांति के लिए एक छोटा-सा उपाय 🌙",
        "मेरी कुंडली में चंद्रमा कैसा है? मन की शांति के लिए क्या करूँ?"
      ],
      [
        "🙏 मंगलवार = बजरंगबली की ताक़त!",
        "आपका मंगल कैसा है? हिम्मत के लिए एक टिप 💪",
        "मेरी कुंडली में मंगल कैसा है? मंगलवार को कौन-सी पूजा अच्छी है?"
      ],
      [
        "📚 बुधवार ब्रेन डे",
        "पढ़ाई, बिज़नेस — क्या बुध आपके साथ है? 🧠",
        "मेरी कुंडली में बुध कैसा है? पढ़ाई और व्यापार के लिए क्या करूँ?"
      ],
      [
        "🕉️ गुरुवार गुरु की कृपा",
        "शादी, बच्चे, किस्मत — गुरु क्या कहते हैं? 🍀",
        "मेरी कुंडली में गुरु कैसा है? गुरुवार को क्या करना अच्छा है?"
      ],
      [
        "🌸 शुक्रवार लक्ष्मी जी का दिन!",
        "पैसा आए, इसके लिए आज यह करें 💰",
        "मेरी कुंडली में शुक्र कैसा है? लक्ष्मी कृपा के लिए क्या करूँ?"
      ],
      [
        "🪔 शनिवार शनि देव का दिन",
        "शनि देव को खुश करने का आसान उपाय 😌",
        "मेरी कुंडली में शनि कैसा है? शनिवार को कौन-सा उपाय करूँ?"
      ]
    ]
  };
  const TITHI_KEYS = {"4": "chaturthi", "6": "shashthi", "8": "ashtami", "11": "ekadashi", "13": "pradosham", "15": "purnima", "19": "chaturthi", "21": "shashthi", "23": "ashtami", "26": "ekadashi", "28": "pradosham", "30": "amavasya"};
  const TITHIS = {
    "te": {
      "chaturthi": [
        "🐘 గణపయ్య స్పెషల్ డే!",
        "అడ్డంకులన్నీ తొలగించే చిన్న పూజ మీ కోసం 🙏",
        "నా పనుల్లో అడ్డంకులు తొలగాలంటే గణపతిని ఎలా పూజించాలి?"
      ],
      "shashthi": [
        "🦚 సుబ్రహ్మణ్య స్వామి రోజు",
        "కుజ దోషం, సంతానం కోసం ఈ రోజు పూజ స్పెషల్ ✨",
        "షష్ఠి రోజు సుబ్రహ్మణ్య స్వామిని ఎలా పూజించాలి?"
      ],
      "ashtami": [
        "🔥 అమ్మవారి శక్తి రోజు",
        "ధైర్యం, రక్షణ కోసం ఈ రోజు ఏం చేయాలో చూడండి 🙏",
        "అష్టమి రోజు ఏ దేవతను పూజించాలి?"
      ],
      "ekadashi": [
        "🙏 ఈ రోజు ఏకాదశి!",
        "ఉపవాసం ఎలా పాటిస్తే పూర్తి ఫలం? 1 నిమిషంలో తెలుసుకోండి",
        "ఏకాదశి ఉపవాసం ఎలా పాటించాలి? నా జాతకానికి ఏ పూజ మంచిది?"
      ],
      "pradosham": [
        "🔱 ప్రదోష కాలం వచ్చేస్తోంది",
        "శివయ్య అనుగ్రహం కోసం ఈ సాయంత్రం చేయాల్సింది ఇదే 🪔",
        "ప్రదోష కాలంలో శివుడిని ఎలా పూజించాలి? నా జాతకానికి ఏది మంచిది?"
      ],
      "purnima": [
        "🌕 ఈ రాత్రి పౌర్ణమి!",
        "చంద్రుడు ఫుల్ పవర్‌లో ✨ మీ రాశికి ఏం చెబుతున్నాడో చూడండి",
        "ఈ పౌర్ణమి నా రాశికి ఎలా ఉంటుంది? ఏ పూజ చేయాలి?"
      ],
      "amavasya": [
        "🌑 ఈ రోజు అమావాస్య",
        "పితృదేవతల ఆశీర్వాదం కోసం చేయాల్సిన చిన్న పని ఇదే 🙏",
        "అమావాస్య రోజు ఏం చేయాలి, ఏం చేయకూడదు?"
      ]
    },
    "en": {
      "chaturthi": [
        "🐘 Ganesha’s special day!",
        "A small puja to clear every obstacle 🙏",
        "How should I worship Ganesha to clear obstacles in my work?"
      ],
      "shashthi": [
        "🦚 Lord Subrahmanya’s day",
        "Today’s puja is special for Kuja dosha and children ✨",
        "How should I worship Lord Subrahmanya on Shashthi?"
      ],
      "ashtami": [
        "🔥 Goddess Shakti’s day",
        "See what to do today for courage and protection 🙏",
        "Which deity should I worship on Ashtami?"
      ],
      "ekadashi": [
        "🙏 It’s Ekadashi today!",
        "How to fast for the full blessing? Find out in 1 minute",
        "How should I observe the Ekadashi fast? Which puja suits my chart?"
      ],
      "pradosham": [
        "🔱 Pradosham is coming",
        "What to do this evening for Shiva’s blessing 🪔",
        "How should I worship Shiva at Pradosham? What suits my chart?"
      ],
      "purnima": [
        "🌕 Full moon tonight!",
        "The Moon is at full power ✨ See what it says for your sign",
        "How is this Purnima for my sign? Which puja should I do?"
      ],
      "amavasya": [
        "🌑 It’s Amavasya today",
        "One small thing to do for your ancestors’ blessings 🙏",
        "What should I do, and avoid, on Amavasya?"
      ]
    },
    "hi": {
      "chaturthi": [
        "🐘 बप्पा का ख़ास दिन!",
        "हर रुकावट दूर करने वाली छोटी पूजा 🙏",
        "मेरे कामों की रुकावट दूर करने के लिए गणेश जी की पूजा कैसे करूँ?"
      ],
      "shashthi": [
        "🦚 कार्तिकेय भगवान का दिन",
        "मंगल दोष और संतान के लिए आज की पूजा ख़ास ✨",
        "षष्ठी के दिन भगवान कार्तिकेय की पूजा कैसे करूँ?"
      ],
      "ashtami": [
        "🔥 माँ दुर्गा का शक्ति दिवस",
        "हिम्मत और रक्षा के लिए आज क्या करें, देखें 🙏",
        "अष्टमी के दिन किस देवता की पूजा करूँ?"
      ],
      "ekadashi": [
        "🙏 आज एकादशी है!",
        "पूरा फल पाने के लिए व्रत कैसे रखें? 1 मिनट में जानें",
        "एकादशी का व्रत कैसे रखूँ? मेरी कुंडली के लिए कौन-सी पूजा अच्छी है?"
      ],
      "pradosham": [
        "🔱 प्रदोष काल आने वाला है",
        "शिव कृपा के लिए आज शाम यह करें 🪔",
        "प्रदोष काल में शिव जी की पूजा कैसे करूँ? मेरी कुंडली के लिए क्या अच्छा है?"
      ],
      "purnima": [
        "🌕 आज रात पूर्णिमा!",
        "चंद्रमा पूरी ताक़त में ✨ देखें आपकी राशि के लिए क्या कहता है",
        "यह पूर्णिमा मेरी राशि के लिए कैसी है? कौन-सी पूजा करूँ?"
      ],
      "amavasya": [
        "🌑 आज अमावस्या है",
        "पितरों के आशीर्वाद के लिए एक छोटा काम 🙏",
        "अमावस्या के दिन क्या करें और क्या न करें?"
      ]
    }
  };
  const QUESTIONS = {
    "te": [
      {
        "need": "dasha",
        "t": "👀 మీ {dasha} దశ ఏదో చెప్పాలనుకుంటోంది…",
        "b": "వినాలని ఉందా? ఒక్క ట్యాప్ చాలు 🤫",
        "ask": "ఇప్పుడు నడుస్తున్న {dasha} దశ నాకు ఎలా ఉంటుంది?"
      },
      {
        "t": "🤞 అనుకున్నది జరుగుతుందా లేదా?",
        "b": "టెన్షన్ ఎందుకు? మీ గ్రహాలను ఒకసారి అడిగేయండి 😉",
        "ask": "నేను అనుకున్న పనులు జరుగుతాయా?"
      },
      {
        "t": "🚀 ఏదో కొత్తగా ప్లాన్ చేస్తున్నారు కదా?",
        "b": "స్టార్ట్ చేసే ముందు స్టార్స్ OK అన్నాయో లేదో చెక్ చేసుకోండి ✨",
        "page": "chat"
      },
      {
        "t": "😕 మూడ్ ఆఫ్ ఆ?",
        "b": "మీ జాతకంలో ఉంది ఒక చిన్న మ్యాజిక్ రెమెడీ 🪄 చూసేయండి",
        "ask": "నా మూడ్ బాలేదు. నాకు సరిపోయే చిన్న పరిహారం చెప్పండి."
      },
      {
        "t": "💸 ఈ నెల జేబు నిండుతుందా, ఖాళీ అవుతుందా?",
        "b": "మీ గ్రహాలకు ముందే తెలుసు 👀 మీకూ చెప్పేస్తాయి",
        "ask": "ఈ నెల నా డబ్బు పరిస్థితి ఎలా ఉంటుంది?"
      },
      {
        "t": "💼 బాస్ కి చెప్పకండి… కానీ",
        "b": "మీ కెరీర్ గురించి గ్రహాలు ఏదో హింట్ ఇస్తున్నాయి 🤫",
        "ask": "ఈ సంవత్సరం నా ఉద్యోగం, కెరీర్ ఎలా ఉంటుంది?"
      },
      {
        "t": "💍 పెళ్లి గంటలు ఎప్పుడు మోగుతాయి?",
        "b": "మీ జాతకం దగ్గర జవాబు రెడీగా ఉంది 💞",
        "ask": "నా పెళ్లి, వైవాహిక జీవితం గురించి నా జాతకం ఏం చెబుతుంది?"
      },
      {
        "t": "🔮 రేపటి స్పాయిలర్ కావాలా?",
        "b": "మీ రాశి ఫలం రెడీ — ఎవరికీ చెప్పకండి 🤫",
        "page": "rashi"
      },
      {
        "need": "sade",
        "t": "🪐 శని గారు మీ ఇంట్లోనే ఉన్నారు",
        "b": "భయపడకండి 😌 ఏం చేయాలో ఒక్క నిమిషంలో తెలుసుకోండి",
        "ask": "నాకు ఏలినాటి శని నడుస్తోంది. ఈ సమయంలో ఏం చేయాలి?"
      },
      {
        "t": "🙏 మీ ఇష్ట దైవం ఎవరో మీ జాతకానికి తెలుసు",
        "b": "ఆశ్చర్యపోతారు! చూసేయండి ✨",
        "ask": "నా జాతకం ప్రకారం నేను ఏ దేవుడిని పూజిస్తే మంచిది?"
      },
      {
        "t": "🏠 ఇంట్లో అంతా ఓకేనా?",
        "b": "మీ గ్రహాలు ఇంటి గురించి ఏదో చెబుతున్నాయి 👂",
        "ask": "నా ఆరోగ్యం, కుటుంబ జీవితం ఎలా ఉంటుంది?"
      },
      {
        "t": "🏡 డ్రీమ్ హోమ్ ఎప్పుడు?",
        "b": "మీ జాతకంలో గృహ యోగం ఉందో లేదో 1 నిమిషంలో",
        "ask": "నాకు ఇల్లు లేదా స్థలం కొనే యోగం ఉందా?"
      },
      {
        "t": "✈️ ఫ్లైట్ టికెట్ బుక్ చేసే రోజు దగ్గర్లో ఉందా?",
        "b": "విదేశీ యోగం మీకు ఉందో లేదో చెక్ చేయండి 🌍",
        "ask": "నా జాతకంలో విదేశీ ప్రయాణ యోగం ఉందా?"
      },
      {
        "t": "📚 పిల్లలు టాపర్ అవుతారా?",
        "b": "వారి భవిష్యత్తు గురించి జాతకం ఏం చెబుతుందో చూడండి 🌟",
        "ask": "నా పిల్లల చదువు, భవిష్యత్తు ఎలా ఉంటుంది?"
      },
      {
        "t": "🤝 బాస్ అవ్వాలని ఉందా?",
        "b": "కొత్త బిజినెస్ కి స్టార్స్ గ్రీన్ సిగ్నల్ ఇచ్చాయా? 🟢",
        "ask": "నేను కొత్త వ్యాపారం మొదలుపెట్టవచ్చా? నా జాతకం ఏం చెబుతుంది?"
      },
      {
        "t": "😴 రాత్రి నిద్ర పట్టడం లేదా?",
        "b": "గ్రహాల దగ్గర ఉంది ఒక చిన్న రెమెడీ 🌙",
        "ask": "నాకు నిద్ర, మనశ్శాంతి కోసం ఏదైనా పరిహారం చెప్పండి."
      },
      {
        "t": "🚗 కొత్త కారు వాసన మిస్ అవుతున్నారా?",
        "b": "కొనడానికి ఇది మంచి టైమా? గ్రహాలను అడగండి 😉",
        "ask": "కొత్త వాహనం కొనడానికి ఇది నాకు మంచి సమయమా?"
      },
      {
        "t": "✨ బంగారం కొనాలా వద్దా?",
        "b": "మీ ధన యోగం ఏమంటుందో ముందే తెలుసుకోండి 💰",
        "ask": "బంగారం లేదా పెట్టుబడికి ఇది నాకు మంచి సమయమా?"
      },
      {
        "t": "😤 ఇంట్లో చిన్న చిన్న గొడవలా?",
        "b": "శాంతి కోసం మీ జాతకంలో ఒక సింపుల్ ట్రిక్ ఉంది 🕊️",
        "ask": "కుటుంబంలో శాంతి కోసం నా జాతకానికి తగిన పరిహారం చెప్పండి."
      },
      {
        "t": "🎓 ఎగ్జామ్ / ఇంటర్వ్యూ టెన్షన్?",
        "b": "పెద్ద రోజుకి ముందు గ్రహాలు ఏమంటున్నాయో చూడండి 🍀",
        "ask": "నా పరీక్ష లేదా ఇంటర్వ్యూలో విజయం కోసం ఏం చేయాలి?"
      },
      {
        "need": "nochart",
        "t": "🤔 మీ జాతకం మీకే తెలియదా?",
        "b": "పుట్టిన తేదీ, సమయం ఇవ్వండి — 30 సెకన్లలో మీ పూర్తి కథ 📜",
        "page": "kundli"
      },
      {
        "need": "nochart",
        "t": "💘 ఆ వ్యక్తితో మీ మ్యాచ్ ఎంత?",
        "b": "గుణ మేళనం 36కి ఎంత వస్తుంది? చూడాలని లేదా? 😏",
        "page": "relationship"
      }
    ],
    "en": [
      {
        "need": "dasha",
        "t": "👀 Your {dasha} period has something to tell you…",
        "b": "Want to hear it? One tap 🤫",
        "ask": "How will my current {dasha} period be for me?"
      },
      {
        "t": "🤞 Will it work out or not?",
        "b": "Why stress? Just ask your planets 😉",
        "ask": "Will the things I am planning work out?"
      },
      {
        "t": "🚀 Planning something new?",
        "b": "Check if the stars say yes before you start ✨",
        "page": "chat"
      },
      {
        "t": "😕 Mood off?",
        "b": "Your chart has a tiny magic remedy 🪄 Take a look",
        "ask": "I am not feeling good. Suggest a simple remedy for my chart."
      },
      {
        "t": "💸 Wallet full or empty this month?",
        "b": "Your planets already know 👀 They’ll tell you too",
        "ask": "How will my money situation be this month?"
      },
      {
        "t": "💼 Don’t tell your boss, but…",
        "b": "Your planets are dropping career hints 🤫",
        "ask": "How will my job and career be this year?"
      },
      {
        "t": "💍 When will the wedding bells ring?",
        "b": "Your chart has the answer ready 💞",
        "ask": "What does my chart say about marriage and married life?"
      },
      {
        "t": "🔮 Want a spoiler for tomorrow?",
        "b": "Your sign’s reading is ready — keep it secret 🤫",
        "page": "rashi"
      },
      {
        "need": "sade",
        "t": "🪐 Shani is visiting your house",
        "b": "Don’t panic 😌 See what to do in a minute",
        "ask": "Sade Sati is running for me. What should I do in this time?"
      },
      {
        "t": "🙏 Your chart knows your favourite deity",
        "b": "You’ll be surprised! Take a look ✨",
        "ask": "According to my chart, which deity should I worship?"
      },
      {
        "t": "🏠 All good at home?",
        "b": "Your planets are saying something about home 👂",
        "ask": "How will my health and family life be?"
      },
      {
        "t": "🏡 When’s your dream home?",
        "b": "Check your property yoga in a minute",
        "ask": "Do I have a yoga for buying a house or land?"
      },
      {
        "t": "✈️ Is a flight ticket in your future?",
        "b": "See if foreign travel is in your chart 🌍",
        "ask": "Is there foreign travel in my chart?"
      },
      {
        "t": "📚 Will your kids top the class?",
        "b": "See what the chart says about their future 🌟",
        "ask": "How will my children’s studies and future be?"
      },
      {
        "t": "🤝 Ready to be your own boss?",
        "b": "Did the stars give your business a green signal? 🟢",
        "ask": "Can I start a new business? What does my chart say?"
      },
      {
        "t": "😴 Can’t sleep?",
        "b": "The planets have a small remedy for that 🌙",
        "ask": "Suggest a remedy for better sleep and peace of mind."
      },
      {
        "t": "🚗 Missing that new-car smell?",
        "b": "Is it a good time to buy? Ask your planets 😉",
        "ask": "Is this a good time for me to buy a new vehicle?"
      },
      {
        "t": "✨ Buy gold or wait?",
        "b": "Check your wealth yoga first 💰",
        "ask": "Is this a good time for me to buy gold or invest?"
      },
      {
        "t": "😤 Little fights at home?",
        "b": "Your chart has a simple trick for peace 🕊️",
        "ask": "Suggest a remedy for peace in my family."
      },
      {
        "t": "🎓 Exam or interview nerves?",
        "b": "See what the planets say before the big day 🍀",
        "ask": "What should I do to succeed in my exam or interview?"
      },
      {
        "need": "nochart",
        "t": "🤔 Don’t know your own Jathakam?",
        "b": "Give your birth date and time — your full story in 30 seconds 📜",
        "page": "kundli"
      },
      {
        "need": "nochart",
        "t": "💘 How well do you match with them?",
        "b": "What’s your Guna Milan out of 36? Curious? 😏",
        "page": "relationship"
      }
    ],
    "hi": [
      {
        "need": "dasha",
        "t": "👀 आपकी {dasha} दशा कुछ कहना चाहती है…",
        "b": "सुनना चाहेंगे? बस एक टैप 🤫",
        "ask": "मेरी अभी चल रही {dasha} दशा मेरे लिए कैसी रहेगी?"
      },
      {
        "t": "🤞 काम बनेगा या नहीं?",
        "b": "टेंशन क्यों? सीधे अपने ग्रहों से पूछ लीजिए 😉",
        "ask": "क्या मेरे सोचे हुए काम पूरे होंगे?"
      },
      {
        "t": "🚀 कुछ नया प्लान कर रहे हैं?",
        "b": "शुरू करने से पहले देख लें सितारे हाँ कह रहे हैं या नहीं ✨",
        "page": "chat"
      },
      {
        "t": "😕 मूड ऑफ़ है?",
        "b": "आपकी कुंडली में है एक छोटा-सा जादुई उपाय 🪄",
        "ask": "मेरा मूड ठीक नहीं है। मेरी कुंडली के अनुसार कोई सरल उपाय बताइए।"
      },
      {
        "t": "💸 इस महीने जेब भरेगी या खाली होगी?",
        "b": "आपके ग्रहों को पहले से पता है 👀 आपको भी बता देंगे",
        "ask": "इस महीने मेरी आर्थिक स्थिति कैसी रहेगी?"
      },
      {
        "t": "💼 बॉस को मत बताना, पर…",
        "b": "आपके ग्रह करियर के हिंट दे रहे हैं 🤫",
        "ask": "इस साल मेरी नौकरी और करियर कैसा रहेगा?"
      },
      {
        "t": "💍 शहनाई कब बजेगी?",
        "b": "आपकी कुंडली के पास जवाब तैयार है 💞",
        "ask": "मेरी कुंडली विवाह और वैवाहिक जीवन के बारे में क्या कहती है?"
      },
      {
        "t": "🔮 कल का स्पॉइलर चाहिए?",
        "b": "आपकी राशि का फल तैयार है — किसी को मत बताना 🤫",
        "page": "rashi"
      },
      {
        "need": "sade",
        "t": "🪐 शनि देव आपके घर आए हैं",
        "b": "घबराइए मत 😌 एक मिनट में जानें क्या करें",
        "ask": "मेरी साढ़ेसाती चल रही है। इस समय मुझे क्या करना चाहिए?"
      },
      {
        "t": "🙏 आपकी कुंडली जानती है आपके इष्ट देव",
        "b": "जानकर हैरान रह जाएँगे! देखिए ✨",
        "ask": "मेरी कुंडली के अनुसार मुझे किस देवता की पूजा करनी चाहिए?"
      },
      {
        "t": "🏠 घर में सब ठीक है?",
        "b": "आपके ग्रह घर के बारे में कुछ कह रहे हैं 👂",
        "ask": "मेरा स्वास्थ्य और पारिवारिक जीवन कैसा रहेगा?"
      },
      {
        "t": "🏡 सपनों का घर कब?",
        "b": "एक मिनट में देखें आपका गृह योग",
        "ask": "क्या मेरी कुंडली में घर या ज़मीन ख़रीदने का योग है?"
      },
      {
        "t": "✈️ फ़्लाइट टिकट वाला दिन पास है?",
        "b": "देखें विदेश यात्रा का योग है या नहीं 🌍",
        "ask": "क्या मेरी कुंडली में विदेश यात्रा का योग है?"
      },
      {
        "t": "📚 क्या बच्चे टॉपर बनेंगे?",
        "b": "देखें कुंडली उनके भविष्य के बारे में क्या कहती है 🌟",
        "ask": "मेरे बच्चों की पढ़ाई और भविष्य कैसा रहेगा?"
      },
      {
        "t": "🤝 खुद का बॉस बनना है?",
        "b": "क्या सितारों ने बिज़नेस को हरी झंडी दी? 🟢",
        "ask": "क्या मैं नया व्यापार शुरू कर सकता हूँ? मेरी कुंडली क्या कहती है?"
      },
      {
        "t": "😴 रात को नींद नहीं आती?",
        "b": "ग्रहों के पास इसका छोटा उपाय है 🌙",
        "ask": "अच्छी नींद और मन की शांति के लिए कोई उपाय बताइए।"
      },
      {
        "t": "🚗 नई गाड़ी की खुशबू याद आ रही है?",
        "b": "ख़रीदने का सही समय? ग्रहों से पूछें 😉",
        "ask": "क्या यह मेरे लिए नई गाड़ी ख़रीदने का अच्छा समय है?"
      },
      {
        "t": "✨ सोना लें या रुकें?",
        "b": "पहले अपना धन योग चेक करें 💰",
        "ask": "क्या यह मेरे लिए सोना ख़रीदने या निवेश का अच्छा समय है?"
      },
      {
        "t": "😤 घर में छोटी-छोटी नोकझोंक?",
        "b": "शांति के लिए कुंडली में है एक आसान उपाय 🕊️",
        "ask": "मेरे परिवार में शांति के लिए कोई उपाय बताइए।"
      },
      {
        "t": "🎓 परीक्षा या इंटरव्यू की टेंशन?",
        "b": "बड़े दिन से पहले देखें ग्रह क्या कहते हैं 🍀",
        "ask": "परीक्षा या इंटरव्यू में सफलता के लिए क्या करूँ?"
      },
      {
        "need": "nochart",
        "t": "🤔 अपनी ही कुंडली नहीं पता?",
        "b": "जन्म तिथि और समय दीजिए — 30 सेकंड में आपकी पूरी कहानी 📜",
        "page": "kundli"
      },
      {
        "need": "nochart",
        "t": "💘 उनसे आपका मिलान कितना है?",
        "b": "36 में से कितने गुण मिलते हैं? जानना है? 😏",
        "page": "relationship"
      }
    ]
  };
  const MUHURTA = {
    "te": {
      "good": [
        [
          "⏰ గోల్డెన్ టైమ్ స్టార్ట్!",
          "అభిజిత్ ముహూర్తం {end} వరకు ✨ పెండింగ్ పని ఇప్పుడే కానిచ్చేయండి"
        ],
        [
          "🟢 గ్రీన్ సిగ్నల్ వచ్చేసింది",
          "శుభ ముహూర్తం ఆన్ — ముఖ్యమైన కాల్, పేమెంట్ ఇప్పుడే ({end} వరకు)"
        ],
        [
          "✨ లక్కీ విండో ఓపెన్!",
          "{end} వరకు మాత్రమే — ఆలస్యం చేయకండి 🏃"
        ]
      ],
      "bad": [
        [
          "🚦 రెడ్ సిగ్నల్! రాహు కాలం",
          "ముఖ్యమైన పనులు {end} వరకు హోల్డ్‌లో పెట్టండి ✋"
        ],
        [
          "⏸️ కొంచెం బ్రేక్ తీసుకోండి",
          "రాహు కాలం నడుస్తోంది — కొత్త పనులు {end} తర్వాత 😌"
        ],
        [
          "🛑 ఇప్పుడు వద్దు!",
          "రాహు కాలం {end} వరకు — పెద్ద నిర్ణయాలు, చెల్లింపులు కాసేపు ఆపండి"
        ]
      ]
    },
    "en": {
      "good": [
        [
          "⏰ Golden hour is ON!",
          "Abhijit muhurta till {end} ✨ Finish that pending task now"
        ],
        [
          "🟢 You’ve got the green signal",
          "Auspicious time — make that call or payment now (till {end})"
        ],
        [
          "✨ Lucky window open!",
          "Only till {end} — don’t wait 🏃"
        ]
      ],
      "bad": [
        [
          "🚦 Red signal! Rahu Kalam",
          "Put important work on hold till {end} ✋"
        ],
        [
          "⏸️ Take a short break",
          "Rahu Kalam is on — start new things after {end} 😌"
        ],
        [
          "🛑 Not now!",
          "Rahu Kalam till {end} — hold big decisions and payments"
        ]
      ]
    },
    "hi": {
      "good": [
        [
          "⏰ गोल्डन टाइम शुरू!",
          "अभिजित मुहूर्त {end} तक ✨ अटका काम अभी निपटाइए"
        ],
        [
          "🟢 हरी झंडी मिल गई",
          "शुभ समय — ज़रूरी कॉल या पेमेंट अभी करें ({end} तक)"
        ],
        [
          "✨ लकी विंडो खुली है!",
          "सिर्फ़ {end} तक — देर मत कीजिए 🏃"
        ]
      ],
      "bad": [
        [
          "🚦 रेड सिग्नल! राहु काल",
          "ज़रूरी काम {end} तक होल्ड पर रखें ✋"
        ],
        [
          "⏸️ थोड़ा ब्रेक लीजिए",
          "राहु काल चल रहा है — नए काम {end} के बाद 😌"
        ],
        [
          "🛑 अभी नहीं!",
          "राहु काल {end} तक — बड़े फ़ैसले और पेमेंट थोड़ा रोकें"
        ]
      ]
    }
  };
  const pick = (table, lang) => table[lang] || table.en;
  const api = { HOUSES, WEEKDAYS, TITHI_KEYS, TITHIS, QUESTIONS, MUHURTA, pick };
  root.JyotishaNudges = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
