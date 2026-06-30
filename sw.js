// Aura Unity ERP service worker
// Keeps offline support while making deployed HTML/CSS/JS updates visible quickly.

const CACHE_NAME = 'aura-unity-v6';
const APP_SHELL = [
  '/',
  '/index.html',
  '/migration/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdn.jsdelivr.net',
];

async function cacheResponse(request, response) {
  if (!response || response.status !== 200 || request.method !== 'GET') return response;
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    return await cacheResponse(request, await fetch(request));
  } catch (error) {
    return (await caches.match(request)) || (fallbackUrl ? caches.match(fallbackUrl) : undefined) || new Response('', {
      status: 503,
      statusText: 'Offline',
    });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await cacheResponse(request, await fetch(request));
  } catch (error) {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== 'GET' || url.hostname.includes('supabase.co')) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, '/index.html'));
    return;
  }

  if (url.origin === self.location.origin && (
    event.request.destination === 'script' ||
    event.request.destination === 'style' ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname === '/sw.js'
  )) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (
    CDN_HOSTS.some((host) => url.hostname.includes(host)) ||
    event.request.destination === 'font' ||
    event.request.destination === 'image'
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(networkFirst(event.request));
});
