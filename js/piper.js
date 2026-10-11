/* WetlandEar App: neural voices (Piper VITS), optional download. The engine (about 29 MB) and one voice (28 to 128 MB) are stored once in the browser
   (Cache Storage 'we-offline-voice-1'), after that the voice speaks without a network. Voice files come from huggingface.co (diffusionstudio/piper-voices).
   Licences: ru Denis and Dmitri CC0; kk ISSAI and Raya CC BY 4.0 (IS2AI Kazakh TTS); en Hi-Fi Captain CC BY-NC-SA 4.0 (NICT). */
(function () {
  'use strict';
  var HF = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/', CACHE = 'we-offline-voice-1';
  var ENGINE = ['ort.wasm.min.js', 'ort-wasm-simd.wasm', 'piper_phonemize.js', 'piper_phonemize.wasm', 'piper_phonemize.data'].map(function (f) { return new URL('js/vendor/piper/' + f, document.baseURI).href; });
  var ENGINE_MB = 29;
  var VOICES = [
    { id: 'ru_RU-denis-medium', lang: 'ru', path: 'ru/ru_RU/denis/medium/ru_RU-denis-medium', mb: 63, name: ['Денис, мужской', 'Denis, male', 'Денис, ер адам'] },
    { id: 'ru_RU-dmitri-medium', lang: 'ru', path: 'ru/ru_RU/dmitri/medium/ru_RU-dmitri-medium', mb: 63, name: ['Дмитрий, мужской', 'Dmitri, male', 'Дмитрий, ер адам'] },
    { id: 'en_US-hfc_female-medium', lang: 'en', path: 'en/en_US/hfc_female/medium/en_US-hfc_female-medium', mb: 63, name: ['Женский', 'Female', 'Әйел'] },
    { id: 'en_US-hfc_male-medium', lang: 'en', path: 'en/en_US/hfc_male/medium/en_US-hfc_male-medium', mb: 63, name: ['Мужской', 'Male', 'Ер адам'] },
    { id: 'kk_KZ-issai-high', lang: 'kk', path: 'kk/kk_KZ/issai/high/kk_KZ-issai-high', mb: 128, name: ['ISSAI, лучшее качество', 'ISSAI, best quality', 'ISSAI, ең жақсы сапа'] },
    { id: 'kk_KZ-raya-x_low', lang: 'kk', path: 'kk/kk_KZ/raya/x_low/kk_KZ-raya-x_low', mb: 28, name: ['Райя, проще и легче', 'Raya, simpler and lighter', 'Рая, жеңіл'] }
  ];
  var worker = null, loadedId = null, seq = 0, pending = {}, ctx = null, playing = { stop: function () { } }, busy = null;

  function byId(id) { for (var i = 0; i < VOICES.length; i++) if (VOICES[i].id === id) return VOICES[i]; return null; }
  function forLang(l) { return VOICES.filter(function (v) { return v.lang === l; }); }
  function supported() { return !!(window.Worker && window.caches && window.WebAssembly && window.AudioContext); }
  function cacheOpen() { return caches.open(CACHE); }
  function modelUrl(v) { return HF + v.path + '.onnx'; }
  function hasVoice(id) {
    var v = byId(id); if (!v || !supported()) return Promise.resolve(false);
    return cacheOpen().then(function (c) { return Promise.all([c.match(modelUrl(v)), c.match(modelUrl(v) + '.json'), c.match(ENGINE[4])]); }).then(function (r) { return !!(r[0] && r[1] && r[2]); }, function () { return false; });
  }

  /* fetch one file into the cache and report bytes as they arrive */
  function pull(url, cache, onBytes) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var reader = res.body && res.body.getReader(), chunks = [];
      if (!reader) return res.blob().then(function (b) { onBytes(b.size); return b; });
      return (function next() { return reader.read().then(function (r) { if (r.done) return new Blob(chunks); chunks.push(r.value); onBytes(r.value.length); return next(); }); })();
    }).then(function (blob) { return cache.put(url, new Response(blob, { headers: { 'Content-Type': /\.json$/.test(url) ? 'application/json' : /\.wasm$/.test(url) ? 'application/wasm' : /\.js$/.test(url) ? 'text/javascript' : 'application/octet-stream' } })); });
  }
  function download(id, onProgress) {
    var v = byId(id); if (!v) return Promise.reject(new Error('unknown voice'));
    var total = (ENGINE_MB + v.mb) * 1048576, got = 0, tick = function (n) { got += n; if (onProgress) onProgress(Math.min(1, got / total)); };
    return cacheOpen().then(function (c) {
      return Promise.all(ENGINE.map(function (u) { return c.match(u).then(function (m) { if (m) { return m.blob().then(function (b) { tick(b.size); }); } return pull(u, c, tick); }); }))
        .then(function () { return pull(modelUrl(v) + '.json', c, tick); })
        .then(function () { return pull(modelUrl(v), c, tick); });
    });
  }
  function remove() { stop(); if (worker) { worker.terminate(); worker = null; loadedId = null; } return caches.delete(CACHE); }

  function call(msg, transfer) {
    return new Promise(function (resolve, reject) { var id = ++seq; pending[id] = { resolve: resolve, reject: reject }; msg.id = id; worker.postMessage(msg, transfer || []); });
  }
  function ensureWorker() {
    if (worker) return worker;
    worker = new Worker('js/piper-worker.js');
    worker.onmessage = function (e) { var p = pending[e.data.id]; if (!p) return; delete pending[e.data.id]; e.data.ok ? p.resolve(e.data) : p.reject(new Error(e.data.error || 'voice error')); };
    worker.onerror = function (e) { Object.keys(pending).forEach(function (k) { pending[k].reject(new Error(e.message || 'worker error')); delete pending[k]; }); worker.terminate(); worker = null; loadedId = null; };
    return worker;
  }
  function load(id) {
    if (loadedId === id && worker) return Promise.resolve();
    if (busy && busy.id === id) return busy.p;
    var v = byId(id); if (!v) return Promise.reject(new Error('unknown voice'));
    var p = cacheOpen().then(function (c) { return Promise.all([c.match(modelUrl(v) + '.json'), c.match(modelUrl(v))]); }).then(function (r) {
      if (!r[0] || !r[1]) throw new Error('voice not downloaded');
      return Promise.all([r[0].text(), r[1].arrayBuffer()]);
    }).then(function (r) { ensureWorker(); loadedId = null; return call({ cmd: 'load', config: r[0], model: r[1] }, [r[1]]); }).then(function () { loadedId = id; busy = null; }, function (e) { busy = null; throw e; });
    busy = { id: id, p: p }; return p;
  }

  function audio() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  function stop() { playing.stop(); }
  function chunks(text) {
    var parts = String(text).replace(/\s+/g, ' ').match(/[^.!?…]+[.!?…]*/g) || [text], out = [], cur = '';
    parts.forEach(function (s) { if (cur && (cur.length >= 20 || (cur + s).length > 160)) { out.push(cur); cur = s; } else cur += s; });
    if (cur.trim()) out.push(cur);
    return out.map(function (s) { return s.trim(); }).filter(Boolean);
  }
  /* speak: synthesise sentence by sentence and start playing the first one as soon as it is ready */
  function speak(id, text, cb) {
    cb = cb || {}; stop();
    var cancelled = false, sources = [], nextAt = 0, started = false, list = chunks(text), ac;
    playing = { stop: function () { cancelled = true; sources.forEach(function (s) { try { s.onended = null; s.stop(); } catch (e) { } }); sources = []; if (started && cb.onend) { var f = cb.onend; cb.onend = null; f(); } } };
    var self = playing;
    return load(id).then(function () {
      ac = audio(); nextAt = ac.currentTime + .05;
      return list.reduce(function (chain, t) {
        return chain.then(function () {
          if (cancelled) return;
          return call({ cmd: 'say', text: t }).then(function (r) {
            if (cancelled) return;
            window.__pkms = (window.__pkms || []).concat([r.ms]); var buf = ac.createBuffer(1, r.pcm.length, r.rate); buf.copyToChannel(r.pcm, 0);
            var src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination);
            var at = Math.max(nextAt, ac.currentTime + .02); src.start(at); nextAt = at + buf.duration + .12; sources.push(src);
            if (!started) { started = true; if (cb.onstart) cb.onstart(); }
          });
        });
      }, Promise.resolve());
    }).then(function () {
      return new Promise(function (resolve) {
        if (cancelled || !started) return resolve();
        var last = sources[sources.length - 1]; if (!last) return resolve();
        last.onended = function () { if (playing === self && cb.onend) { var f = cb.onend; cb.onend = null; f(); } resolve(); };
      });
    });
  }

  window.WEPiper = { voices: VOICES, forLang: forLang, byId: byId, supported: supported, has: hasVoice, download: download, remove: remove, load: load, speak: speak, stop: stop, engineMB: ENGINE_MB };
})();
