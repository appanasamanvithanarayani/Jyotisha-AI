(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  let state = null;
  let tab = 'Dashboard';

  async function api(path, body) {
    const options = body === undefined ? { headers: { 'X-Admin': '1' } }
      : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin': '1' }, body: JSON.stringify(body) };
    const response = await fetch(path, options);
    let data = {};
    try { data = await response.json(); } catch (_error) { /* not json */ }
    if (!response.ok) { const error = new Error(data.error || `Error ${response.status}`); error.status = response.status; throw error; }
    return data;
  }

  let toastTimer = null;
  function toast(text, bad) {
    const box = $('msg'); box.textContent = text; box.className = bad ? 'bad' : ''; box.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, 3500);
  }

  function showLogin(note) {
    $('app').hidden = true; $('login').hidden = false; $('login-note').textContent = note || '';
  }

  async function load() {
    try { state = await api('/api/admin/state'); }
    catch (error) { if (error.status === 401) { showLogin(); return; } if (error.status === 404) { document.body.textContent = 'Not found'; return; } toast(error.message, true); return; }
    $('login').hidden = true; $('app').hidden = false; render();
  }

  function groups() {
    const names = [];
    state.settings.forEach(item => { if (!names.includes(item.group)) names.push(item.group); });
    return ['Dashboard', 'Notifications', ...names, 'Change log'];
  }

  function render() {
    const tabs = $('tabs'); tabs.textContent = '';
    groups().forEach(name => {
      const button = el('button', name === tab ? 'on' : '', name); button.type = 'button';
      button.addEventListener('click', () => { tab = name; render(); });
      tabs.appendChild(button);
    });
    const view = $('view'); view.textContent = '';
    if (tab === 'Dashboard') dashboard(view);
    else if (tab === 'Change log') changeLog(view);
    else if (tab === 'Notifications') notifications(view);
    else settingsGroup(view, tab);
  }

  function tile(label, value, cls) {
    const box = el('div', 'tile'); box.append(el('b', cls || '', String(value)), el('span', 'hint', label)); return box;
  }

  function dashboard(view) {
    const today = state.stats[0] || {};
    const tiles = el('div', 'tiles');
    tiles.append(tile('Visitors today', today.visitors || 0), tile('Page opens today', today.page_views || 0),
      tile('AI questions today', today.ai_questions || 0), tile('APK downloads today', today.apk_downloads || 0));
    view.appendChild(tiles);

    const live = state.live;
    const status = el('div', 'panel'); status.appendChild(el('h2', null, 'What the app is told right now'));
    const list = el('div'); status.appendChild(list);
    const line = (label, on, detail) => {
      const row = el('div', 'row'); row.style.padding = '6px 0';
      row.append(el('span', on ? 'on-text' : 'off-text', on ? '● On' : '○ Off'), el('b', null, label), el('span', 'hint', detail || ''));
      list.appendChild(row);
    };
    const ads = live.app_ads;
    line('Android app ads', !!ads, ads ? (ads.testing ? 'Google test ads' : 'your own ad units') : '');
    line('Rewarded ad before a Kundli', !!(ads && ads.rewarded_kundli));
    line('Rewarded ad for extra AI questions', !!(ads && ads.chat_free_questions), ads && ads.chat_free_questions ? `${ads.chat_free_questions} free, +${ads.chat_bonus_questions} per ad` : '');
    line('Full-screen ad between screens', !!(ads && ads.interstitial_id));
    line('Website ads (AdSense)', !!live.adsense, live.adsense || '');
    line('AI chat', state.server.ai_ready, state.server.ai_provider || 'offline answers only');
    line('Notice shown to users', !!live.notice, live.notice ? `${live.notice.kind}: ${live.notice.text}` : '');
    const test = el('button', 'btn', 'Test the AI connection'); test.type = 'button'; test.style.marginTop = '10px';
    test.addEventListener('click', async () => {
      test.disabled = true;
      try { const result = await api('/api/admin/test-ai', {}); toast(result.ok ? `AI works (${result.provider})` : `AI problem: ${result.status}`, !result.ok); }
      catch (error) { toast(error.message, true); }
      test.disabled = false;
    });
    status.appendChild(test); view.appendChild(status);

    const usage = el('div', 'panel'); usage.appendChild(el('h2', null, 'Last 14 days'));
    usage.appendChild(el('p', 'hint', 'Only totals are kept. Visitors are counted from a one-way code that is thrown away at the end of each day.'));
    const wrap = el('div', 'scroll'), table = el('table');
    const columns = [['date', 'Day'], ['visitors', 'Visitors'], ['page_views', 'Opens'], ['day_panchang', 'Panchang'], ['month_calendar', 'Calendar'], ['birth_chart', 'Kundli'], ['ai_questions', 'AI'], ['apk_downloads', 'APK'], ['rate_limited', 'Blocked']];
    const head = el('tr'); columns.forEach(([, label]) => head.appendChild(el('th', null, label))); table.appendChild(head);
    state.stats.forEach(row => { const tr = el('tr'); columns.forEach(([key]) => tr.appendChild(el('td', null, String(row[key] === undefined ? 0 : row[key])))); table.appendChild(tr); });
    wrap.appendChild(table); usage.appendChild(wrap); view.appendChild(usage);
    const foot = el('p', 'hint', `Settings are stored in ${state.server.data_dir}. You are signed out automatically after ${state.server.session_minutes} minutes.`);
    view.appendChild(foot);
  }

  function aiDaily(view, push) {
    const field = (label, input) => { const box = el('label'); box.style.display = 'block'; box.style.margin = '10px 0'; box.append(el('b', null, label), input); return box; };
    // What the AI wrote today for the automatic daily notifications.
    const daily = el('div', 'panel'); daily.appendChild(el('h2', null, 'Today’s AI-written daily notifications'));
    daily.appendChild(el('p', 'hint', 'Every user’s phone gets fresh evening questions and muhurta alerts from this, filled in with their own dasha and sign. Switch it off in AI chat → “AI-written daily notifications”.'));
    const lang = el('select'); (push.languages || []).forEach(([code, name]) => lang.appendChild(new Option(name, code))); lang.value = 'te';
    const show = el('button', 'btn', 'Show'); show.type = 'button'; show.style.marginTop = '8px';
    const out = el('div');
    const load = async retry => {
      show.disabled = true; out.textContent = 'Loading… (writing it now can take up to a minute)';
      try {
        const result = await api('/api/admin/nudges', { language: lang.value, retry });
        out.textContent = '';
        if (!result.batch) {
          out.appendChild(el('p', 'off-text', 'Not written yet. The app uses its built-in messages meanwhile.'));
          if (result.reason) out.appendChild(el('p', 'hint', `Why: ${result.reason}`));
          if (result.enabled) {
            const again = el('button', 'btn', 'Try again now'); again.type = 'button';
            again.addEventListener('click', () => { void load(true); });
            out.appendChild(again);
          }
        }
        else {
          const names = { questions: 'Evening questions', dasha: 'About their dasha', sign: 'About their Moon sign', good: 'Auspicious muhurta', bad: 'Rahu Kalam' };
          Object.entries(names).forEach(([key, label]) => {
            out.appendChild(el('h3', null, `${label} (${(result.batch[key] || []).length})`));
            (result.batch[key] || []).forEach(item => { const row = el('p'); row.append(el('b', null, item.t), el('br'), el('span', 'hint', item.b)); out.appendChild(row); });
          });
        }
      } catch (error) { out.textContent = error.message; }
      show.disabled = false;
    };
    show.addEventListener('click', () => { void load(false); });
    daily.append(field('Language', lang), show, out); view.appendChild(daily);
  }

  // Send a notification to every installed Android app (or one language) through Firebase.
  function notifications(view) {
    const push = state.push || {};
    const panel = el('div', 'panel'); panel.appendChild(el('h2', null, 'Send a notification'));
    if (!push.ready) {
      panel.appendChild(el('p', 'off-text', 'Not set up: the Firebase server key (firebase-key.json) was not found on the server. See the deploy notes.'));
      view.appendChild(panel); aiDaily(view, push); return;
    }
    panel.appendChild(el('p', 'hint', `Firebase project: ${push.project}. Reaches every installed app (version 1.0.11 or newer) within seconds. At most 10 messages an hour.`));
    const field = (label, input, hint) => { const box = el('label'); box.style.display = 'block'; box.style.margin = '10px 0';
      box.append(el('b', null, label), input); if (hint) box.appendChild(el('span', 'hint', hint)); return box; };
    const title = el('input'); title.maxLength = 65; title.placeholder = 'e.g. 🪔 Happy Diwali!';
    const body = el('textarea'); body.maxLength = 240; body.rows = 3; body.placeholder = 'e.g. See today\'s Lakshmi Puja muhurat in the app.';
    const count = el('span', 'hint', '0 / 240'); body.addEventListener('input', () => { count.textContent = `${body.value.length} / 240`; });
    const audience = el('select');
    audience.appendChild(new Option('Everyone', 'all'));
    (push.languages || []).forEach(([code, name]) => audience.appendChild(new Option(`Only ${name} users`, code)));
    const page = el('select');
    const pageNames = { home: 'Home', calendar: 'Festivals', kundli: 'Kundli', relationship: 'Love (Kundli matching)', chat: 'Ask AI', rashi: 'Rashiphal' };
    (push.pages || []).forEach(name => page.appendChild(new Option(pageNames[name] || name, name)));
    // Ready-made ideas: pick one to fill the form, then edit if you like.
    const IDEAS = [
      ['te', 'chat', '🤞 అనుకున్నది జరుగుతుందా లేదా?', 'టెన్షన్ ఎందుకు? మీ గ్రహాలను ఒకసారి అడిగేయండి 😉', 'నేను అనుకున్న పనులు జరుగుతాయా?'],
      ['te', 'chat', '🚀 ఏదో కొత్తగా ప్లాన్ చేస్తున్నారు కదా?', 'స్టార్ట్ చేసే ముందు స్టార్స్ OK అన్నాయో లేదో చెక్ చేసుకోండి ✨', 'నేను కొత్త పని మొదలుపెట్టడానికి ఇది మంచి సమయమా?'],
      ['te', 'chat', '😕 మూడ్ ఆఫ్ ఆ?', 'మీ జాతకంలో ఉంది ఒక చిన్న మ్యాజిక్ రెమెడీ 🪄 చూసేయండి', 'నా మూడ్ బాలేదు. నాకు సరిపోయే చిన్న పరిహారం చెప్పండి.'],
      ['te', 'kundli', '👀 మీ దశ ఏదో చెప్పాలనుకుంటోంది…', 'వినాలని ఉందా? ఒక్క ట్యాప్ చాలు 🤫'],
      ['te', 'relationship', '💘 ఆ వ్యక్తితో మీ మ్యాచ్ ఎంత?', 'గుణ మేళనం 36కి ఎంత వస్తుంది? చూడాలని లేదా? 😏'],
      ['te', 'rashi', '🔮 రేపటి స్పాయిలర్ కావాలా?', 'మీ రాశి ఫలం రెడీ — ఎవరికీ చెప్పకండి 🤫'],
      ['te', 'calendar', '🪔 పండుగల సీజన్ వచ్చేసింది!', 'ఈ నెల పండుగలు, సెలవులు అన్నీ ఒకే చోట — మీ నగరానికి 📅'],
      ['en', 'chat', '🤞 Will it work out or not?', 'Why stress? Just ask your planets 😉', 'Will the things I am planning work out?'],
      ['en', 'chat', '💼 Don’t tell your boss, but…', 'Your planets are dropping career hints 🤫', 'How will my job and career be this year?'],
      ['en', 'rashi', '🔮 Want a spoiler for tomorrow?', 'Your sign’s reading is ready — keep it secret 🤫'],
      ['hi', 'chat', '🤞 काम बनेगा या नहीं?', 'टेंशन क्यों? सीधे अपने ग्रहों से पूछ लीजिए 😉', 'क्या मेरे सोचे हुए काम पूरे होंगे?'],
      ['hi', 'chat', '😕 मूड ऑफ़ है?', 'आपकी कुंडली में है एक छोटा-सा जादुई उपाय 🪄', 'मेरा मूड ठीक नहीं है। मेरी कुंडली के अनुसार कोई सरल उपाय बताइए।'],
    ];
    const ideas = el('select');
    ideas.appendChild(new Option('— Pick a message idea (optional) —', ''));
    IDEAS.forEach(([lang, , text], index) => ideas.appendChild(new Option(`${lang.toUpperCase()} · ${text}`, String(index))));
    ideas.addEventListener('change', () => {
      const idea = IDEAS[Number(ideas.value)];
      if (!idea) return;
      [audience.value, page.value, title.value, body.value, askField.value] = [idea[0], idea[1], idea[2], idea[3], idea[4] || ''];
      count.textContent = `${body.value.length} / 240`;
    });
    const askField = el('input'); askField.maxLength = 300; askField.placeholder = 'e.g. Will the things I am planning work out?';
    panel.append(field('Message ideas', ideas, 'Fills the form with a tested message and sends it only to that language; edit before sending if you like.'),
      field('Title', title), field('Message', body), count, field('Send to', audience), field('Opens this screen when tapped', page),
      field('Question Jyotirmaya AstroChat answers when tapped (optional)', askField, 'If filled, tapping opens the AI chat, asks this in the user’s chart and shows the reply. Write it in the audience’s language.'));
    const send = el('button', 'btn primary', 'Send now'); send.type = 'button'; send.style.marginTop = '12px';
    send.addEventListener('click', async () => {
      if (!title.value.trim() || !body.value.trim()) { toast('Write a title and a message', true); return; }
      const who = audience.options[audience.selectedIndex].text;
      if (!window.confirm(`Send "${title.value.trim()}" to ${who.toLowerCase()}? This cannot be undone.`)) return;
      send.disabled = true;
      try {
        state = Object.assign(state, await api('/api/admin/push', { title: title.value, body: body.value, audience: audience.value, page: page.value, ask: askField.value }));
        toast('Sent'); title.value = ''; body.value = ''; askField.value = ''; count.textContent = '0 / 240';
      } catch (error) { toast(error.message, true); }
      send.disabled = false;
    });
    panel.appendChild(send); view.appendChild(panel);
    aiDaily(view, push);
    const tips = el('div', 'panel'); tips.appendChild(el('h2', null, 'Tips'));
    ['Keep it short and useful: a festival, a muhurat, a new feature.', 'One or two messages a week is plenty; too many makes people turn notifications off.',
      'Write in the language of the audience you choose.', 'Each message is recorded in the Change log.'].forEach(text => tips.appendChild(el('p', 'hint', `• ${text}`)));
    view.appendChild(tips);
  }

  function settingsGroup(view, group) {
    const items = state.settings.filter(item => item.group === group);
    const panel = el('div', 'panel'); panel.appendChild(el('h2', null, group));
    panel.appendChild(el('p', 'hint', 'Changes apply immediately, no restart. “Server” means the value comes from the server’s .env file until you change it here.'));
    const inputs = {};
    items.forEach(item => {
      const field = el('div', 'field');
      const label = el('label', null, item.label); label.setAttribute('for', 'f-' + item.key);
      label.appendChild(document.createTextNode(' ')); label.appendChild(el('span', 'badge ' + item.source, item.source));
      field.appendChild(label);
      const row = el('div', 'row'); let input;
      if (item.kind === 'bool') {
        input = el('select'); [['1', 'On'], ['0', 'Off']].forEach(([v, t]) => { const o = el('option', null, t); o.value = v; input.appendChild(o); });
        input.value = item.value === '1' ? '1' : '0';
      } else if (item.kind === 'choice') {
        input = el('select'); item.choices.forEach(v => { const o = el('option', null, v || 'automatic'); o.value = v; input.appendChild(o); });
        input.value = item.value;
      } else if (item.kind === 'secret') {
        input = el('input'); input.type = 'password'; input.autocomplete = 'off'; input.spellcheck = false;
        input.placeholder = item.isSet ? `saved (${item.value}), type to replace` : 'not set, paste the key';
      } else if (item.kind === 'int') {
        input = el('input'); input.type = 'number'; input.min = item.minimum; input.max = item.maximum; input.value = item.value;
      } else {
        input = el('input'); input.type = 'text'; input.maxLength = item.maxlen || 200; input.value = item.value; input.placeholder = item.example || '';
      }
      input.id = 'f-' + item.key; inputs[item.key] = { input, item };
      row.appendChild(input);
      if (item.source === 'panel') {
        const revert = el('button', 'btn', 'Use server value'); revert.type = 'button';
        revert.addEventListener('click', () => save({ [item.key]: null }, 'Reverted'));
        row.appendChild(revert);
      }
      field.appendChild(row);
      if (item.help) field.appendChild(el('p', 'hint', item.help));
      panel.appendChild(field);
    });
    const button = el('button', 'btn primary', 'Save ' + group); button.type = 'button'; button.style.marginTop = '12px';
    button.addEventListener('click', () => {
      const changes = {};
      Object.entries(inputs).forEach(([key, { input, item }]) => {
        const now = input.value.trim();
        if (item.kind === 'secret') { if (now) changes[key] = now; }
        else if (now !== item.value) changes[key] = now;
      });
      if (!Object.keys(changes).length) { toast('Nothing changed'); return; }
      save(changes, 'Saved');
    });
    panel.appendChild(button); view.appendChild(panel);
  }

  async function save(changes, done) {
    try { state = Object.assign(state, await api('/api/admin/save', { changes })); toast(done); render(); }
    catch (error) { if (error.status === 401) { showLogin('Session ended, sign in again.'); return; } toast(error.message, true); }
  }

  function changeLog(view) {
    const panel = el('div', 'panel'); panel.appendChild(el('h2', null, 'Change log'));
    panel.appendChild(el('p', 'hint', 'Every change made here, newest first. API keys are never shown in full.'));
    if (!state.audit.length) panel.appendChild(el('p', 'hint', 'No changes yet.'));
    const wrap = el('div', 'scroll'), table = el('table'); table.className = 'log';
    const head = el('tr'); ['When (UTC)', 'Setting', 'Action', 'Was', 'Now'].forEach(t => head.appendChild(el('th', null, t))); table.appendChild(head);
    state.audit.forEach(row => {
      const tr = el('tr'); [row.time, row.key, row.action, row.old || '(empty)', row.new || '(empty)'].forEach(v => tr.appendChild(el('td', null, String(v))));
      table.appendChild(tr);
    });
    wrap.appendChild(table); panel.appendChild(wrap); view.appendChild(panel);
  }

  async function signIn() {
    const field = $('pw');
    try { await api('/api/admin/login', { password: field.value }); field.value = ''; await load(); }
    catch (error) { toast(error.message, true); }
  }
  $('signin').addEventListener('click', signIn);
  $('pw').addEventListener('keydown', event => { if (event.key === 'Enter') signIn(); });
  $('signout').addEventListener('click', async () => { try { await api('/api/admin/logout', {}); } catch (_error) { /* ignore */ } state = null; showLogin('Signed out.'); });
  load();
})();
