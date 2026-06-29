// Aura Unity ERP — Service Worker
// Provides offline shell + cache-first for static assets

const CACHE_NAME = 'aura-unity-v3';
const APP_SHELL = [
  '/',
  '/index.html',
  '/migration/index.html',
  '/migration/assets/index-Ck-UC7pW.css',
  '/migration/assets/index-CDM1T0lQ.js',
  '/assets/css/index.css',
  '/assets/js/index.js',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// CDN resources to cache on first use
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Always bypass Supabase API / Edge Functions (network-only)
  if (url.hostname.includes('supabase.co')) {
    return; // let browser handle normally
  }

  // CDN + static assets: cache-first, fall back to network
  if (
    CDN_HOSTS.some((h) => url.hostname.includes(h)) ||
    event.request.destination === 'style' ||
    event.request.destination === 'script' ||
    event.request.destination === 'font' ||
    event.request.destination === 'image'
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request)
            .then((response) => {
              if (response && response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
              }
              return response;
            })
            .catch(() => new Response('', { status: 503, statusText: 'Offline' }))
      )
    );
    return;
  }

  // HTML navigation: network-first, fall back to cached index.html (offline shell)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html')
      )
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
