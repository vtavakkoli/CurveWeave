const CACHE = 'curveweave-v5';
const ASSETS = ['./','./index.html','./styles.css','./src/app.js','./src/svg-utils.js','./src/enhancements.js','./src/selection-utils.js','./src/advanced-selection.js','./src/path-geometry.js','./src/boolean-utils.js','./src/pro-vector.js','./src/advanced-utils.js','./src/special-layer-support.js','./src/advanced-studio.js','./assets/icon.svg','./manifest.webmanifest'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});
