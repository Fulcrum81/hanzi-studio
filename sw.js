/* ============================================================
   Practice Hanzi — Service Worker
   Simple cache-first PWA with offline support.
   ============================================================ */

// Increment this version on every deploy to force a fresh SW install
const CACHE_NAME = 'practice-hanzi-v6';
const CORE_ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './dictionary.js',
  './i18n.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Pre-cache the Hanzi Writer library itself (avoids CDN dependency at runtime)
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/hanzi-writer@3.5/dist/hanzi-writer.min.js',
  'https://cdn.jsdelivr.net/npm/hanzi-writer-data/index.json',
];

// Character data CDN prefix to cache (Hanzi Writer fetches /data/<char>.json)
const CHAR_DATA_ORIGIN = 'https://cdn.jsdelivr.net';

// Install: pre-cache core assets + CDN library
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // CDN assets can fail (offline first install); don't block install
      return Promise.allSettled([
        cache.addAll(CORE_ASSETS),
        ...CDN_ASSETS.map((url) => cache.add(url).catch(() => {})),
      ]);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell; network-first for Hanzi Writer character data
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Cross-origin: Hanzi Writer char data from jsdelivr CDN
  if (url.origin === CHAR_DATA_ORIGIN) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Same-origin: cache-first (app shell + dictionary)
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          // Offline fallback: try cached index
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
    );
  }
});