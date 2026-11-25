(function () {
  'use strict';
  const FEATURES = new Set(['home', 'kundli', 'panchang', 'calendar', 'festivals', 'relationship', 'chat', 'rashi', 'lifeguide',
    'moon', 'tarot', 'palm', 'partner', 'numerology', 'signmatch', 'doshas', 'dasha']);
  const NAMES = { chat: 'ai_chat', rashi: 'rashiphal', lifeguide: 'life_guide', moon: 'moon_sign', partner: 'partner_portrait', signmatch: 'sign_match' };
  let last = '';

  function clean(value) {
    const name = String(value || '').replace(/^#/, '').split(/[?&/]/, 1)[0].toLowerCase();
    return FEATURES.has(name) ? (NAMES[name] || name) : '';
  }

  function report(value) {
    const feature = clean(value);
    if (!feature || feature === last) return;
    last = feature;
    fetch('/api/usage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature }), keepalive: true }).catch(function () {});
  }

  function current() { report((history.state && history.state.page) || location.hash || 'home'); }

  function reportInstall() {
    const capacitor = window.Capacitor;
    if (!capacitor || (typeof capacitor.isNativePlatform === 'function' && !capacitor.isNativePlatform())) return;
    const platform = typeof capacitor.getPlatform === 'function' ? capacitor.getPlatform() : '';
    if (platform !== 'android' && platform !== 'ios') return;
    const key = 'jyotisha-install-reported-v1';
    try { if (localStorage.getItem(key)) return; } catch (_error) { return; }
    fetch('/api/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform }), keepalive: true })
      .then(function (response) { if (response.ok) localStorage.setItem(key, '1'); }).catch(function () {});
  }
  window.addEventListener('hashchange', current);
  window.addEventListener('popstate', current);
  document.addEventListener('click', function (event) {
    const target = event.target.closest && event.target.closest('[data-page],a[href^="#"],[data-kview]');
    if (target) report(target.dataset.page || target.dataset.kview || target.getAttribute('href'));
  }, true);
  ['pushState', 'replaceState'].forEach(function (name) {
    const original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function () { const result = original.apply(this, arguments); setTimeout(current, 0); return result; };
  });
  setTimeout(current, 0);
  setTimeout(reportInstall, 0);
})();
