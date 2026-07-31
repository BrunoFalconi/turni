// Service Worker Migliorato - TurniApp
// Cambiamenti:
// 1. Versioning automatico della cache
// 2. Cache-first per assets, network-first per API
// 3. Migliore gestione degli errori
// 4. Pulizia cache obsolete

const VERSION = '3.6'; // Incrementare quando deploy
const CACHE_NAME = `turni-app-v${VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './css/style.css?v=3.6',
  './js/core.js?v=3.6',
  './js/excel.js?v=3.6',
  './js/backup.js?v=3.6',
  './js/stats.js?v=3.6',
  './js/payslip.js?v=3.6',
  './js/dashboard.js',
  './js/app.js?v=3.6',
  './js/logger.js?v=3.6',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

// Install: cache tutti gli asset core
self.addEventListener('install', event => {
  console.log(`[SW] Installing cache version ${VERSION}`);
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log(`[SW] Caching core assets (${CORE_ASSETS.length} file)`);
        return cache.addAll(CORE_ASSETS).catch(err => {
          console.error('[SW] Cache add error:', err);
          // Continua anche se alcuni file non si cachano
        });
      })
  );
});

// Activate: cancella cache vecchie
self.addEventListener('activate', event => {
  console.log(`[SW] Activating - cleaning old caches`);
  
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        const oldCaches = keys.filter(k => !k.includes(`v${VERSION}`));
        
        if (oldCaches.length > 0) {
          console.log(`[SW] Removing ${oldCaches.length} old cache(s)`);
          await Promise.all(oldCaches.map(k => caches.delete(k)));
        }
        
        await self.clients.claim();
        console.log('[SW] Ready to serve');
      } catch (err) {
        console.error('[SW] Activate error:', err);
      }
    })()
  );
});

// Fetch: strategia ibrida
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }
  
  const url = new URL(event.request.url);
  const isAsset = /\.(js|css|png|jpg|jpeg|webp|woff2?|svg|ico)$/i.test(url.pathname);
  const isApi = url.origin !== self.location.origin;
  
  event.respondWith(handleFetch(event.request, isAsset, isApi));
});

async function handleFetch(request, isAsset, isApi) {
  try {
    // Asset locali: cache-first
    if (isAsset && !isApi) {
      const cached = await caches.match(request);
      if (cached) {
        console.log(`[SW] Cache hit: ${request.url}`);
        return cached;
      }
      
      // Tenta fetch e cachalo
      try {
        const response = await fetch(request);
        if (response && response.status === 200) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (err) {
        console.warn(`[SW] Fetch failed, returning cache: ${request.url}`);
        return await caches.match(request) || 
          new Response('Offline - risorsa non disponibile', { status: 503 });
      }
    }
    
    // API/Dati: network-first
    try {
      const response = await fetch(request);
      if (response && response.status === 200) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch (err) {
      const cached = await caches.match(request);
      if (cached) {
        console.log(`[SW] Network failed, returning cache: ${request.url}`);
        return cached;
      }
      throw err;
    }
    
  } catch (err) {
    console.error(`[SW] Fetch error for ${request.url}:`, err);
    
    // Navigate request (HTML)
    if (request.mode === 'navigate') {
      const cached = await caches.match('./index.html');
      if (cached) return cached;
    }
    
    return new Response(
      'Errore di rete - Offline',
      { status: 503, statusText: 'Service Unavailable' }
    );
  }
}

// Message handler per manual cache clear
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'CLEAR_CACHE') {
    caches.keys().then(keys => {
      Promise.all(keys.map(k => caches.delete(k)));
      console.log('[SW] Cache cleared via message');
    });
  }
});
