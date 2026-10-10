/* Offline shell: the app opens without a network. Account data stays in your own Supabase account. */
var V = 'we-app-v24';
var SHELL = ['/', 'index.html', 'css/app.css', 'js/species-ru.js', 'js/species-sci.js', 'js/dsp.js', 'js/store.js', 'js/sync.js', 'js/config.js', 'js/i18n.js', 'js/i18n-en.js', 'js/i18n-kk.js', 'js/vendor/supabase.js', 'js/vendor/leaflet.js', 'css/vendor/leaflet.css', 'js/app.js', 'js/extras.js', 'js/more.js', 'js/batch.js', 'js/watch.js', 'js/voices.js', 'js/offline.js', 'js/offline-ui.js', 'js/voice-worker.js', 'js/weather.js', 'js/pheno.js', 'js/soundscape.js', 'js/quick.js', 'js/science.js', 'js/manage.js', 'js/vendor/qrcode.js', 'js/privacy.js', 'favicon.svg', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== V && k.indexOf('we-offline-') !== 0; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  var r = e.request; if (r.method !== 'GET') return;
  var u = new URL(r.url); if (u.origin !== location.origin) return;
  if (u.pathname.indexOf('/api/') === 0 || r.headers.has('range')) return;   /* live data and audio streams are never cached */
  /* big model files are cached by the offline module itself (cache 'we-offline-*'); only look there when the network fails */
  if (u.pathname.indexOf('/models/') === 0 || u.pathname.indexOf('/js/vendor/litert/') === 0) { e.respondWith(fetch(r).catch(function () { return caches.match(r); })); return; }
  /* network first so updates arrive, cache as fallback */
  e.respondWith(fetch(r).then(function (res) { var copy = res.clone(); caches.open(V).then(function (c) { c.put(r, copy); }); return res; }).catch(function () { return caches.match(r).then(function (m) { return m || caches.match('index.html'); }); }));
});
