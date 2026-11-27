// Flarmalodebop service worker: app-shell cache + push notifications. Messages/media are never cached here.
const CACHE = 'flarm-v2-4';
const SHELL = ['/', '/index.html', '/privacy.html', '/style.css', '/app.js', '/logic.js', '/calendar.js', '/calendar-ui.js', '/config.js', '/vendor/supabase.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/icon-180.png', '/fonts/fredoka.woff2', '/fonts/pacifico.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return; // Supabase API/media never cached
  // network-first so updates land immediately; fall back to cache offline
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('/'))));
});
self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'Flarmalodebop', body: e.data ? e.data.text() : 'New message' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Flarmalodebop', { body: d.body || '♪', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: d.tag, renotify: true }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => { for (const c of cs) if ('focus' in c) return c.focus(); return clients.openWindow('/'); }));
});
