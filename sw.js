/* Offline shell: the app opens without a network. Account data stays in your own Supabase account. */
var V = 'we-app-v14';
var SHELL = ['/', 'index.html', 'css/app.css', 'js/species-ru.js', 'js/species-sci.js', 'js/dsp.js', 'js/store.js', 'js/sync.js', 'js/config.js', 'js/i18n.js', 'js/i18n-en.js', 'js/i18n-kk.js', 'js/vendor/supabase.js', 'js/vendor/leaflet.js', 'css/vendor/leaflet.css', 'js/app.js', 'js/extras.js', 'js/more.js', 'js/batch.js', 'js/watch.js', 'js/voices.js', 'js/voice-worker.js', 'js/weather.js', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET') return;
  var u = new URL(r.url); if (u.origin !== location.origin) return;
  /* network first so updates arrive, cache as fallback */
  e.respondWith(fetch(r).then(function (res) { var copy = res.clone(); caches.open(V).then(function (c) { c.put(r, copy); }); return res; }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match('index.html'); }); }));
});
