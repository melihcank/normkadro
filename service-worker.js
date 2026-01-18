const CACHE_NAME = 'norm-kadro-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './pages/personel.html',
    './pages/organizasyon.html',
    './pages/is-analizi.html',
    './pages/gorevler.html',
    './pages/is-yuku.html',
    './pages/standart-zaman.html',
    './pages/zaman-etudu.html',
    './pages/hesaplama.html',
    './css/style.css',
    './js/config.js',
    './js/db.js',
    './js/utils.js',
    './js/dashboard.js',
    './js/personel.js',
    './js/organizasyon.js',
    './js/is-analizi.js',
    './js/gorevler.js',
    './js/is-yuku.js',
    './js/standart-zaman.js',
    './js/zaman-etudu.js',
    './js/hesaplama.js',
    './libs/sql-wasm.js',
    './libs/sql-wasm.wasm',
    './libs/xlsx.full.min.js',
    './libs/lucide.min.js',
    './fonts/Inter-Regular.woff2',
    './fonts/Inter-Medium.woff2',
    './fonts/Inter-SemiBold.woff2',
    './fonts/Inter-Bold.woff2',
    './manifest.json'
];

// Install event - cache all assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching app assets...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Cache new requests dynamically
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // Return offline fallback for HTML pages
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});
