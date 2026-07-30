const CACHE = 'turni-app-v3';
const LOCAL_ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/excel-import.js',
  './js/sequence.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(LOCAL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200) return response;
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      }).catch(() => {
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return new Response('', {status: 503, statusText: 'Offline'});
      });
    })
  );
});
