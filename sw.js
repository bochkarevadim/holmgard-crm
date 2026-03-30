const CACHE_NAME = 'holmgard-crm-v6';
const ASSETS_TO_CACHE = [
    '/holmgard-crm/',
    '/holmgard-crm/index.html',
    '/holmgard-crm/css/style.css',
    '/holmgard-crm/js/app.js',
    '/holmgard-crm/js/auth.js',
    '/holmgard-crm/js/gcal.js',
    '/holmgard-crm/js/gsheets.js',
    '/holmgard-crm/img/icon-192x192.png',
    '/holmgard-crm/img/icon-512x512.png',
    '/holmgard-crm/manifest.json'
];

// Install: cache core assets
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: network-first strategy (always try network, fallback to cache)
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET requests and external APIs (Firebase, Google, etc.)
    if (event.request.method !== 'GET') return;
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache successful responses
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                // Network failed — serve from cache
                return caches.match(event.request);
            })
    );
});
