// ScamWatch Myanmar - Service Worker (PWA offline support)
const CACHE = 'scamwatch-v5';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/i18n.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];




self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});




self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});




self.addEventListener('fetch', (e) => {
  // Network-first for API/data, cache-first for static assets
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/') || url.hostname.includes('googleapis') || url.hostname.includes('docs.google.com')) {
    return; // Let network handle API calls
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).then((resp) => {
        if (resp.ok && e.request.method === 'GET') {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
