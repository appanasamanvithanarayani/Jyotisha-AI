(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  let state = null;
  let tab = 'Overview';
  let trendRange = '30';

  const META = {
    Overview: ['Overview', 'Live product, engagement and service signals', '⌂'],
    Users: ['Users', 'Anonymous visitors and the features they generated', '◎'],
    Usage: ['Usage & trends', 'Privacy-safe daily activity across recorded history', '↗'],
    Ratings: ['Ratings & feedback', 'User sentiment and private improvement notes', '★'],
    Notifications: ['Notifications', 'Compose messages and review AI-written daily copy', '◉'],
    Monetization: ['Monetization', 'Advertising and payment readiness', '₹'],
    'System health': ['System health', 'Provider and delivery-service readiness', '●'],
    'Change log': ['Change log', 'Audited console changes, newest first', '≡'],
  };

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
    $('login').hidden = true; $('app').hidden = false;
    $('session-note').textContent = `Auto sign-out after ${state.server.session_minutes} minutes`;
    render();
  }

  function groups() {
    const names = [];
    state.settings.forEach(item => { if (!names.includes(item.group)) names.push(item.group); });
    return [
      ['Monitor', ['Overview', 'Users', 'Usage', 'Ratings']],
      ['Engage', ['Notifications']],
      ['Revenue', ['Monetization', ...names.filter(name => ['Android app ads', 'Website ads', 'Payments'].includes(name))]],
      ['Configuration', names.filter(name => !['Android app ads', 'Website ads', 'Payments'].includes(name))],
      ['Operations', ['System health', 'Change log']],
    ];
  }

  function render() {
    const tabs = $('tabs'); tabs.textContent = '';
    groups().forEach(([section, names]) => {
      if (!names.length) return;
      tabs.appendChild(el('div', 'nav-label', section));
      names.forEach(name => {
        const info = META[name] || [name, `Manage ${name.toLowerCase()}`, '◇'];
        const button = el('button', name === tab ? 'on' : ''); button.type = 'button';
        button.append(el('span', 'nav-icon', info[2]), el('span', null, info[0]));
        button.addEventListener('click', () => { tab = name; render(); });
        tabs.appendChild(button);
      });
    });
    const info = META[tab] || [tab, `Manage ${tab.toLowerCase()}`];
    $('top-title').textContent = info[0]; $('top-subtitle').textContent = info[1];
    const view = $('view'); view.textContent = '';
    if (tab === 'Overview') dashboard(view);
    else if (tab === 'Users') users(view);
    else if (tab === 'Usage') usage(view);
    else if (tab === 'Ratings') ratings(view);
    else if (tab === 'Change log') changeLog(view);
    else if (tab === 'Notifications') notifications(view);
    else if (tab === 'Monetization') monetization(view);
    else if (tab === 'System health') systemHealth(view);
    else settingsGroup(view, tab);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function intro(view, title, text, action) {
    const box = el('div', 'page-intro'), copy = el('div'); copy.append(el('h2', null, title), el('p', null, text)); box.appendChild(copy);
    if (action) box.appendChild(action); view.appendChild(box);
  }

  function tile(label, value, cls, kicker) {
    const box = el('div', 'tile'); box.append(el('span', 'tile-kicker', kicker || 'Today'), el('b', cls || '', String(value)), el('span', 'hint', label)); return box;
  }

  function statusLine(parent, label, on, detail) {
    const row = el('div', 'status-row'); row.append(el('span', `status-dot${on ? ' ok' : ''}`), el('b', null, label), el('span', 'status-detail', detail || (on ? 'Ready' : 'Not configured'))); parent.appendChild(row);
  }

  function sum(key) { return (state.stats || []).reduce((total, row) => total + Number(row[key] || 0), 0); }

  function trendLabel() { return trendRange === 'all' ? 'All recorded days' : `Last ${trendRange} days`; }

  function selectedPeriod() {
    const analytics = state.analytics || {};
    return (analytics.periods || {})[trendRange] || {
      all_users: analytics.total_users || 0, unique_users: analytics.active_period || 0,
      active_users: analytics.active_period || 0, inactive_users: Math.max(0, (analytics.total_users || 0) - (analytics.active_period || 0)),
      new_users: analytics.new_period || 0, new_installs: analytics.new_installs_period || 0,
    };
  }

  function historyRows(rows) {
    const sorted = [...(rows || [])].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    if (trendRange === 'all') return sorted;
    const todayText = (((state.analytics || {}).comparisons || [])[0] || {}).date || new Date().toISOString().slice(0, 10);
    const cutoff = new Date(`${todayText}T12:00:00Z`); cutoff.setUTCDate(cutoff.getUTCDate() - Number(trendRange) + 1);
    const cutoffText = cutoff.toISOString().slice(0, 10);
    return sorted.filter(row => String(row.date) >= cutoffText);
  }

  function trendPicker() {
    const select = el('select', 'range-picker'); select.setAttribute('aria-label', 'Trend date range');
    [['7', '7 days'], ['14', '14 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All days']].forEach(([value, label]) => {
      const option = el('option', null, label); option.value = value; option.selected = trendRange === value; select.appendChild(option);
    });
    select.addEventListener('change', () => { trendRange = select.value; render(); });
    return select;
  }

  function barChart(values, key) {
    const frame = el('div', 'chart-frame'), axis = el('div', 'y-axis'), box = el('div', 'chart');
    const rawMax = Math.max(1, ...values.map(row => Number(row[key] || 0)));
    const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(rawMax)) - 1);
    const max = Math.max(1, Math.ceil(rawMax / magnitude) * magnitude);
    [max, Math.round(max * .75), Math.round(max * .5), Math.round(max * .25), 0].forEach(value => axis.appendChild(el('span', null, value.toLocaleString())));
    values.forEach(row => { const wrap = el('div', 'bar-wrap'); wrap.title = `${row.date}: ${row[key] || 0}`; const bar = el('span', 'bar'); bar.style.height = `${Math.max(2, Number(row[key] || 0) / max * 100)}%`; wrap.appendChild(bar); box.appendChild(wrap); });
    frame.append(axis, box); return frame;
  }

  function chart(key) {
    return barChart(historyRows(state.stats_history || [...(state.stats || [])].reverse()), key);
  }

  const GENERATION_NAMES = { kundli: 'Kundli', ai_chat: 'AI chat', rashiphal: 'Rashiphal', life_guide: 'Life Guide', moon_sign: 'Moon sign', tarot: 'Tarot', palm: 'Palm', partner_portrait: 'Partner portrait' };
  const FEATURE_NAMES = { home: 'Home', research_chart: 'Research chart', ...GENERATION_NAMES, panchang: 'Panchang', calendar: 'Calendar', festivals: 'Festivals', relationship: 'Love & relationship', place_search: 'Place search', nearby_place: 'Nearby place', nudges: 'Daily nudges', life_guide_text: 'Life Guide copy', numerology: 'Numerology', sign_match: 'Sign match', doshas: 'Doshas', dasha: 'Dasha', rating: 'Ratings', payments: 'Payments' };

  function analyticsChart(key) {
    const analytics = state.analytics || {};
    return barChart(historyRows(analytics.history || [...(analytics.days || [])].reverse()), key);
  }

  function comparisonPanel() {
    const panel = el('div', 'panel'); panel.append(el('h2', null, 'Period comparison'), el('p', 'hint', 'Compare the same daily signals with yesterday, last week and 30 days ago.'));
    const wrap = el('div', 'scroll'), table = el('table'), head = el('tr');
    ['Period', 'All users', 'Active users (unique)', 'Inactive users', 'New users', 'Installs', 'Feature opens', 'API requests', 'Generated', 'Full page loads', 'AI questions'].forEach(label => head.appendChild(el('th', null, label))); table.appendChild(head);
    const statsByDate = new Map((state.stats_history || state.stats || []).map(row => [row.date, row]));
    ((state.analytics || {}).comparisons || []).forEach(item => {
      const stats = statsByDate.get(item.date) || {}, row = el('tr');
      [item.label, item.all_users || 0, item.active_users || item.unique_users || 0, item.inactive_users || 0, item.new_users || 0, item.new_installs || 0, item.feature_views || 0,
        item.feature_requests || 0, item.generation_count || 0, stats.page_views || 0, stats.ai_questions || 0]
        .forEach(value => row.appendChild(el('td', null, String(value))));
      table.appendChild(row);
    });
    wrap.appendChild(table); panel.appendChild(wrap); return panel;
  }

  function dashboard(view) {
    const today = state.stats[0] || {};
    const analytics = state.analytics || {};
    const period = selectedPeriod();
    intro(view, 'Overview & trends', 'A decision view for engagement, AI usage, user feedback, monetization and service readiness.', trendPicker());
    const tiles = el('div', 'tiles');
    tiles.append(tile('All tracked users', period.all_users || 0, '', 'All time'),
      tile('Active users (unique)', period.active_users || period.unique_users || 0, '', trendLabel()),
      tile('Inactive users', period.inactive_users || 0, '', trendLabel()),
      tile('New users', period.new_users || 0, '', trendLabel()),
      tile('New app installs', period.new_installs || 0, '', trendLabel()));
    view.appendChild(tiles);

    const live = state.live;
    const columns = el('div', 'grid-2');
    const trend = el('div', 'panel'); trend.append(el('h2', null, 'Unique-user trend'), el('p', 'hint', trendLabel()), analyticsChart('unique_users'));
    const quick = el('div', 'panel'); quick.append(el('h2', null, 'Fourteen-day activity'));
    [['Tracked app installs', analytics.total_installs || 0], ['Full page loads', sum('page_views')], ['AI questions', sum('ai_questions')], ['Kundli generated', sum('birth_chart')], ['Rate limited', sum('rate_limited')]].forEach(([label, value]) => { const row = el('div', 'mini-stat'); row.append(el('span', null, label), el('b', null, String(value))); quick.appendChild(row); });
    columns.append(trend, quick); view.appendChild(columns);
    view.appendChild(comparisonPanel());

    const status = el('div', 'panel'); status.appendChild(el('h2', null, 'Live app configuration'));
    const list = el('div', 'status-list'); status.appendChild(list); const ads = live.app_ads;
    statusLine(list, 'AI chat', state.server.ai_ready, state.server.ai_provider || 'Offline answers only');
    statusLine(list, 'Android ads', !!ads, ads ? (ads.testing ? 'Google test inventory' : 'Production ad units') : 'All app ads are off');
    statusLine(list, 'Payments', state.payments.ready, state.payments.ready ? `${state.payments.provider} · ₹${state.payments.reading_unlock_rs} reading unlock` : 'Payments are not fully configured');
    statusLine(list, 'Push delivery', state.push.ready, state.push.ready ? `Firebase project ${state.push.project}` : 'Firebase key not found');
    statusLine(list, 'User notice', !!live.notice, live.notice ? `${live.notice.kind}: ${live.notice.text}` : 'No notice is visible');
    const test = el('button', 'btn', 'Test the AI connection'); test.type = 'button'; test.style.marginTop = '10px';
    test.addEventListener('click', async () => {
      test.disabled = true;
      try { const result = await api('/api/admin/test-ai', {}); toast(result.ok ? `AI works (${result.provider})` : `AI problem: ${result.status}`, !result.ok); }
      catch (error) { toast(error.message, true); }
      test.disabled = false;
    });
    status.appendChild(test);
    const testImage = el('button', 'btn', 'Test the ideal-partner illustration'); testImage.type = 'button'; testImage.style.marginTop = '10px'; testImage.style.marginInlineStart = '10px';
    testImage.addEventListener('click', async () => {
      testImage.disabled = true;
      try { const result = await api('/api/admin/test-image', {}); toast(result.ok ? 'Image generation works' : `Image problem: ${result.detail}`, !result.ok); }
      catch (error) { toast(error.message, true); }
      testImage.disabled = false;
    });
    status.appendChild(testImage); view.appendChild(status);
  }

  function usage(view) {
    const observed = (state.analytics || {}).observability || {};
    const observedRows = Object.entries(observed).map(([key, metric]) => ({ key, ...metric })).filter(row => row.requests).sort((a, b) => b.requests - a.requests);
    const featureViews = (state.analytics || {}).feature_views || {};
    const featureRows = [...new Set([...Object.keys(featureViews), ...Object.keys(observed)])].map(key => ({ key, views: Number(featureViews[key] || 0), ...(observed[key] || {}) })).filter(row => row.views || row.requests).sort((a, b) => (b.views + (b.requests || 0)) - (a.views + (a.requests || 0)));
    const requestTotal = observedRows.reduce((total, row) => total + row.requests, 0), failureTotal = observedRows.reduce((total, row) => total + row.failure, 0);
    intro(view, 'Usage & observability', 'Feature-level volume, outcomes and latency. Request bodies, generated content, questions and photos are never retained in these metrics.', trendPicker());
    const tiles = el('div', 'tiles'); tiles.append(tile('Feature requests', requestTotal, '', '14 days'), tile('Failed requests', failureTotal, failureTotal ? 'off-text' : 'on-text', '14 days'), tile('Unique users', (state.analytics || {}).active_period || 0, '', '14 days'), tile('Full page loads', sum('page_views'), '', '14 days')); view.appendChild(tiles);
    const graphs = el('div', 'grid-even'); const opens = el('div', 'panel'); opens.append(el('h2', null, 'Full page loads'), chart('page_views')); const featureUse = el('div', 'panel'); featureUse.append(el('h2', null, 'Server-backed feature requests'), analyticsChart('feature_requests')); graphs.append(opens, featureUse); view.appendChild(graphs);
    const health = el('div', 'panel'); health.append(el('h2', null, 'Feature usage & health'), el('p', 'hint', 'Screen opens include client-only tools; request outcomes and latency apply to server-backed features.'));
    const healthWrap = el('div', 'scroll'), healthTable = el('table'), healthHead = el('tr'); ['Feature', 'Screen opens', 'API requests', 'Successful', 'Failed', 'Success rate', 'Average', 'Peak'].forEach(label => healthHead.appendChild(el('th', null, label))); healthTable.appendChild(healthHead);
    featureRows.forEach(row => { const hasRequests = Number(row.requests || 0) > 0, tr = el('tr'); [FEATURE_NAMES[row.key] || row.key, row.views, row.requests || 0, row.success || 0, row.failure || 0, hasRequests ? `${row.success_rate}%` : '—', hasRequests ? `${row.avg_ms} ms` : '—', hasRequests ? `${row.max_ms} ms` : '—'].forEach(value => tr.appendChild(el('td', null, String(value)))); healthTable.appendChild(tr); });
    if (!featureRows.length) { const tr = el('tr'), td = el('td', 'hint', 'No feature usage recorded yet.'); td.colSpan = 8; tr.appendChild(td); healthTable.appendChild(tr); }
    healthWrap.appendChild(healthTable); health.appendChild(healthWrap); view.appendChild(health);
    const panel = el('div', 'panel'); panel.append(el('h2', null, 'Daily detail'), el('p', 'hint', trendLabel())); const wrap = el('div', 'scroll'), table = el('table');
    const columns = [['date', 'Day'], ['visitors', 'Visitors'], ['page_views', 'Opens'], ['day_panchang', 'Panchang'], ['month_calendar', 'Calendar'], ['birth_chart', 'Kundli'], ['ai_questions', 'AI'], ['apk_downloads', 'APK'], ['rate_limited', 'Blocked']];
    const head = el('tr'); columns.forEach(([, label]) => head.appendChild(el('th', null, label))); table.appendChild(head);
    historyRows(state.stats_history || [...(state.stats || [])].reverse()).reverse().forEach(row => { const tr = el('tr'); columns.forEach(([key]) => tr.appendChild(el('td', null, String(row[key] === undefined ? 0 : row[key])))); table.appendChild(tr); }); wrap.appendChild(table); panel.appendChild(wrap); view.appendChild(panel);
  }

  function users(view) {
    const data = state.analytics || { users: [], generation_totals: {}, days: [] };
    const period = selectedPeriod();
    intro(view, 'Anonymous users', 'Users are identified by a random first-party ID. Only birth year and a broad age range are retained from a successful Kundli; exact DOB, names, questions, photos and generated content are not stored.', trendPicker());
    const tiles = el('div', 'tiles'); tiles.append(tile('All tracked users', period.all_users || 0, '', 'All time'),
      tile('Active users (unique)', period.active_users || period.unique_users || 0, '', trendLabel()),
      tile('Inactive users', period.inactive_users || 0, '', trendLabel()), tile('New users', period.new_users || 0, '', trendLabel()),
      tile('New app installs', period.new_installs || 0, '', trendLabel())); view.appendChild(tiles);
    const trends = el('div', 'grid-even');
    [['all_users', 'All users'], ['active_users', 'Active users (unique)'], ['inactive_users', 'Inactive users'], ['new_users', 'New users'], ['new_installs', 'New app installs']].forEach(([key, label]) => {
      const panel = el('div', 'panel'); panel.append(el('h2', null, label), el('p', 'hint', trendLabel()), analyticsChart(key)); trends.appendChild(panel);
    });
    view.appendChild(trends);
    const dailyUsers = el('div', 'panel'); dailyUsers.append(el('h2', null, 'Daily user detail'), el('p', 'hint', trendLabel()));
    const dailyWrap = el('div', 'scroll'), dailyTable = el('table'), dailyHead = el('tr');
    ['Day', 'All users', 'Active users (unique)', 'Inactive users', 'New users', 'New app installs'].forEach(label => dailyHead.appendChild(el('th', null, label))); dailyTable.appendChild(dailyHead);
    historyRows(data.history || [...(data.days || [])].reverse()).reverse().forEach(item => {
      const row = el('tr'); [item.date, item.all_users || 0, item.active_users || item.unique_users || 0, item.inactive_users || 0, item.new_users || 0, item.new_installs || 0]
        .forEach(value => row.appendChild(el('td', null, String(value)))); dailyTable.appendChild(row);
    });
    dailyWrap.appendChild(dailyTable); dailyUsers.appendChild(dailyWrap); view.appendChild(dailyUsers);
    view.appendChild(comparisonPanel());
    const generated = el('div', 'panel'); generated.append(el('h2', null, 'What users generated'), el('p', 'hint', 'Successful results in the last 14 days, grouped only by feature.'));
    const total = Math.max(1, Object.values(data.generation_totals || {}).reduce((sum, value) => sum + Number(value || 0), 0));
    Object.entries(GENERATION_NAMES).forEach(([key, label]) => { const count = Number((data.generation_totals || {})[key] || 0), row = el('div', 'mini-stat'), name = el('span', null, label), value = el('b', null, String(count)); name.style.minWidth = '120px'; const progress = el('div', 'progress'); progress.style.flex = '1'; const fill = el('span'); fill.style.width = `${count / total * 100}%`; progress.appendChild(fill); row.append(name, progress, value); generated.appendChild(row); }); view.appendChild(generated);
    const adoption = el('div', 'grid-even');
    const newUsers = el('div', 'panel'); newUsers.append(el('h2', null, 'What new users are using'), el('p', 'hint', 'Unique new users who used each feature during their first 14-day reporting window.'));
    const newRows = Object.entries(data.new_user_features || {}).filter(([, count]) => count).sort((a, b) => b[1] - a[1]);
    if (!newRows.length) newUsers.appendChild(el('p', 'hint', 'No new-user feature activity recorded yet.'));
    else newRows.slice(0, 10).forEach(([key, count]) => { const row = el('div', 'mini-stat'); row.append(el('span', null, FEATURE_NAMES[key] || key), el('b', null, String(count))); newUsers.appendChild(row); });
    const popular = el('div', 'panel'); popular.append(el('h2', null, 'Most-used features'), el('p', 'hint', 'Ranked by unique users in the last 14 days, then total interactions.'));
    const popularRows = Object.keys(FEATURE_NAMES).map(key => ({ key, users: Number((data.feature_unique_users || {})[key] || 0), views: Number((data.feature_views || {})[key] || 0), requests: Number(((data.observability || {})[key] || {}).requests || 0) })).filter(row => row.users || row.views || row.requests).sort((a, b) => b.users - a.users || (b.views + b.requests) - (a.views + a.requests));
    if (!popularRows.length) popular.appendChild(el('p', 'hint', 'No feature activity recorded yet.'));
    else popularRows.slice(0, 10).forEach((item, index) => { const row = el('div', 'mini-stat'); row.append(el('span', null, `${index + 1}. ${FEATURE_NAMES[item.key] || item.key}`), el('b', null, `${item.users} users`)); popular.appendChild(row); });
    adoption.append(newUsers, popular); view.appendChild(adoption);
    const panel = el('div', 'panel'); panel.append(el('h2', null, 'Recent users'), el('p', 'hint', 'Anonymous IDs are shortened. Counts show successful generation results only.'));
    const wrap = el('div', 'scroll'), table = el('table'); const head = el('tr'); ['Anonymous ID', 'User', 'Platform', 'Installed', 'Birth year', 'Age range', 'First seen', 'Last seen', 'Active days', 'Generated', 'Feature usage', 'Generated breakdown'].forEach(label => head.appendChild(el('th', null, label))); table.appendChild(head);
    (data.users || []).forEach(user => { const breakdown = Object.entries(user.generations || {}).filter(([, count]) => count).map(([key, count]) => `${FEATURE_NAMES[key] || key}: ${count}`).join(' · ') || '—'; const usage = Object.entries(user.usage || {}).filter(([, count]) => count).map(([key, count]) => `${FEATURE_NAMES[key] || key}: ${count}`).join(' · ') || '—'; const row = el('tr'); [user.id, user.is_new_period ? 'New' : 'Returning', user.platform || 'Web', user.installed_at || '—', user.birth_year || '—', user.age_range || '—', user.first_seen, user.last_seen, user.active_days, user.generation_count, usage, breakdown].forEach(value => row.appendChild(el('td', null, String(value)))); table.appendChild(row); });
    if (!(data.users || []).length) { const row = el('tr'), cell = el('td', 'hint', 'No anonymous users have been recorded yet.'); cell.colSpan = 12; row.appendChild(cell); table.appendChild(row); }
    wrap.appendChild(table); panel.appendChild(wrap); view.appendChild(panel);
  }

  function ratings(view) {
    const data = state.ratings || { total: 0, average: 0, counts: {}, recent: [] };
    intro(view, 'Ratings & feedback', 'Understand user sentiment without treating a store-prompt open as a confirmed public review.');
    const tiles = el('div', 'tiles');
    const positive = Number((data.counts || {})['5'] || 0) + Number((data.counts || {})['4'] || 0);
    tiles.append(tile('Ratings received', data.total || 0, '', 'All time'), tile('Average rating', data.total ? `${data.average} / 5` : '—', '', 'All time'),
      tile('Positive ratings', data.total ? `${Math.round(positive / data.total * 100)}%` : '—', '', '4–5 stars'), tile('Written feedback', (data.recent || []).length, '', 'Most recent 100'));
    view.appendChild(tiles);

    const breakdown = el('div', 'panel'); breakdown.appendChild(el('h2', null, 'Rating breakdown'));
    const wrap = el('div', 'scroll'), table = el('table');
    const head = el('tr'); ['Stars', 'Ratings'].forEach(label => head.appendChild(el('th', null, label))); table.appendChild(head);
    [5, 4, 3, 2, 1].forEach(stars => {
      const tr = el('tr'); tr.append(el('td', null, `${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}`), el('td', null, String((data.counts || {})[String(stars)] || 0))); table.appendChild(tr);
    });
    wrap.appendChild(table); breakdown.appendChild(wrap); view.appendChild(breakdown);

    const feedback = el('div', 'panel'); feedback.appendChild(el('h2', null, 'Private feedback'));
    feedback.appendChild(el('p', 'hint', 'Reasons from 1–2 star ratings are shown here and are never posted to Google Play.'));
    if (!(data.recent || []).length) feedback.appendChild(el('p', 'hint', 'No private feedback yet.'));
    else {
      const feedbackWrap = el('div', 'scroll'), feedbackTable = el('table'); feedbackTable.className = 'log';
      const feedbackHead = el('tr'); ['When (UTC)', 'Rating', 'Language', 'Reason'].forEach(label => feedbackHead.appendChild(el('th', null, label))); feedbackTable.appendChild(feedbackHead);
      data.recent.forEach(row => {
        const tr = el('tr'); [row.time, `${row.stars} / 5`, row.language || '—', row.reason].forEach(value => tr.appendChild(el('td', null, String(value)))); feedbackTable.appendChild(tr);
      });
      feedbackWrap.appendChild(feedbackTable); feedback.appendChild(feedbackWrap);
    }
    view.appendChild(feedback);
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
    intro(view, 'Notification operations', 'Send carefully targeted messages and inspect the daily copy generated for the app.');
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
    intro(view, group, `${items.length} live setting${items.length === 1 ? '' : 's'}. Saved changes apply immediately and are recorded in the change log.`);
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
    intro(view, 'Change log', 'An audit trail of console changes. Secret values are masked and never shown in full.');
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

  function monetization(view) {
    intro(view, 'Monetization', 'A consolidated view of ad pressure, paid unlock pricing and production readiness.');
    const ads = state.live.app_ads, pay = state.payments || {};
    const tiles = el('div', 'tiles');
    tiles.append(tile('App advertising', ads ? 'On' : 'Off', ads ? 'on-text' : 'off-text', 'AdMob'),
      tile('Ad inventory', ads ? (ads.testing ? 'Test' : 'Live') : '—', '', 'AdMob'),
      tile('Chat bonus', `₹${pay.chat_bonus_rs || 9}`, '', 'Razorpay'), tile('Reading unlock', `₹${pay.reading_unlock_rs || 9}`, '', 'Razorpay'));
    view.appendChild(tiles);
    const grid = el('div', 'grid-even');
    const adPanel = el('div', 'panel'); adPanel.append(el('h2', null, 'Advertising configuration'), el('p', 'hint', 'Current behavior delivered to Android clients.'));
    const adList = el('div', 'status-list'); adPanel.appendChild(adList);
    statusLine(adList, 'Master switch', !!ads, ads ? 'Advertising is enabled' : 'No app ads are served');
    statusLine(adList, 'Rewarded Kundli', !!(ads && ads.rewarded_kundli), 'Gate a new Kundli behind a rewarded ad');
    statusLine(adList, 'Rewarded AI questions', !!(ads && ads.chat_free_questions), ads && ads.chat_free_questions ? `${ads.chat_free_questions} free, +${ads.chat_bonus_questions} per reward` : 'Disabled');
    statusLine(adList, 'Interstitial', !!(ads && ads.interstitial_id), ads && ads.interstitial_id ? 'Ad unit is configured' : 'No active interstitial');
    const payPanel = el('div', 'panel'); payPanel.append(el('h2', null, 'Payment readiness'), el('p', 'hint', 'Razorpay keys remain write-only.'));
    const payList = el('div', 'status-list'); payPanel.appendChild(payList);
    statusLine(payList, 'Provider', !!pay.provider, pay.provider || 'No provider selected');
    statusLine(payList, 'Checkout ready', !!pay.ready, pay.ready ? 'Key ID and secret are configured' : 'Complete provider and key configuration');
    statusLine(payList, 'Extra questions', !!pay.ready, `₹${pay.chat_bonus_rs || 9} per bonus pack`);
    statusLine(payList, 'Single reading', !!pay.ready, `₹${pay.reading_unlock_rs || 9} per unlock`);
    grid.append(adPanel, payPanel); view.appendChild(grid);
    const open = el('button', 'btn primary', 'Manage payment settings'); open.type = 'button'; open.addEventListener('click', () => { tab = 'Payments'; render(); }); payPanel.appendChild(open);
  }

  function systemHealth(view) {
    intro(view, 'System health', 'Configuration-level readiness for core services. External provider latency and host resource history require infrastructure monitoring.');
    const ready = [state.server.ai_ready, state.push.ready, state.payments.ready].filter(Boolean).length;
    const tiles = el('div', 'tiles'); tiles.append(tile('Core API', 'Online', 'on-text', 'Server'), tile('AI provider', state.server.ai_ready ? 'Ready' : 'Offline', state.server.ai_ready ? 'on-text' : 'off-text', 'Generation'), tile('Push', state.push.ready ? 'Ready' : 'Setup', state.push.ready ? 'on-text' : 'off-text', 'Firebase'), tile('Services ready', `${ready} / 3`, '', 'Configured')); view.appendChild(tiles);
    const panel = el('div', 'panel'); panel.appendChild(el('h2', null, 'Service checks')); const list = el('div', 'status-list'); panel.appendChild(list);
    statusLine(list, 'Web application', true, `Serving ${state.server.host || 'current host'}`);
    statusLine(list, 'AI text provider', state.server.ai_ready, state.server.ai_provider || 'No external provider selected');
    const imageProvider = state.settings.find(item => item.key === 'JYOTISHA_IMAGE_PROVIDER');
    statusLine(list, 'AI image provider', !!(imageProvider && imageProvider.value), imageProvider && imageProvider.value ? imageProvider.value : 'No image provider selected');
    statusLine(list, 'Firebase push', state.push.ready, state.push.ready ? state.push.project : 'Firebase service key not found');
    statusLine(list, 'Razorpay checkout', state.payments.ready, state.payments.ready ? 'Payment signature verification enabled' : 'Payments unavailable');
    panel.appendChild(el('p', 'hint', `Settings data: ${state.server.data_dir}`)); view.appendChild(panel);
  }

  async function signIn() {
    const field = $('pw');
    try { await api('/api/admin/login', { password: field.value }); field.value = ''; await load(); }
    catch (error) { toast(error.message, true); }
  }
  $('signin').addEventListener('click', signIn);
  $('pw').addEventListener('keydown', event => { if (event.key === 'Enter') signIn(); });
  $('refresh').addEventListener('click', async () => { $('refresh').disabled = true; await load(); $('refresh').disabled = false; toast('Console refreshed'); });
  const theme = localStorage.getItem('jyotisha-admin-theme') || 'dark'; document.documentElement.dataset.theme = theme; $('theme').value = theme;
  $('theme').addEventListener('change', () => { document.documentElement.dataset.theme = $('theme').value; localStorage.setItem('jyotisha-admin-theme', $('theme').value); });
  $('signout').addEventListener('click', async () => { try { await api('/api/admin/logout', {}); } catch (_error) { /* ignore */ } state = null; showLogin('Signed out.'); });
  load();
})();
