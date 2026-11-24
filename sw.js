// Offline-Cache: App-Dateien beim Installieren, KI-Modelle beim ersten Gebrauch
const VERSION = 'passfoto-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'js/app.js', 'js/formats.js', 'js/i18n.js', 'js/vision.js', 'js/render.js', 'js/export.js', 'js/db.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/mediapipe/vision_bundle.mjs',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  const isVendor = url.pathname.includes('/vendor/');
  if (isVendor) {
    // große Dateien: Cache zuerst
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok) { const cl = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cl)); }
      return res;
    })));
  } else {
    // App-Dateien: Netzwerk zuerst (Updates), sonst Cache
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) { const cl = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cl)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
  }
});
