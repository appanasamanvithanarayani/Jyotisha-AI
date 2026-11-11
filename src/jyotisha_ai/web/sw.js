/* Service worker: keeps the app shell available and shows a friendly page offline. API calls always go to the network. */
const VERSION = 'jyotisha-v3';
const SHELL = ['/', '/app.js', '/app.css', '/locales.js', '/chart-ui.js', '/match-ui.js', '/calendar-ui.js', '/panchang-names.js', '/manifest.webmanifest', '/icons/icon-192.png'];
const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>'
  + '<body style="font:16px system-ui;background:#150d2e;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">'
  + '<div><h1 style="font-size:1.4rem">You are offline</h1><p>Jyotisha AI needs an internet connection to calculate. Please reconnect and try again.</p></div>';

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(VERSION).then(cache => cache.put(request, copy)); }
      return response;
    }).catch(() => caches.match(request).then(hit => hit || (request.mode === 'navigate'
      ? caches.match('/').then(page => page || new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
      : Response.error())))
  );
});
