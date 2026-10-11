/* WetlandEar App: species recognition on the device, no internet and no account needed.
   BirdNET V2.4 (with its location filter) and YAMNet run in the browser through LiteRT.js (Google's WebAssembly runtime for TensorFlow Lite models);
   the WetlandEar head is applied on top. The same steps as the server (api/identify.py), and the results have the same shape,
   so the app does not care where they come from. Files are downloaded once into the browser's cache (about 47 MB). */
(function () {
  'use strict';
  var VERSION = 'v6-lr1', CACHE = 'we-offline-' + VERSION;
  var RT = 'js/vendor/litert/';
  var SAMPLES = 144000, ready = false, state = null, initP = null, LR = null, queue = Promise.resolve();

  /* LiteRT.js ships two WebAssembly builds: one for browsers with relaxed SIMD, a compatible one for the rest. Only the one this browser needs is downloaded. */
  var RELAXED = (function () { try { return WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 15, 1, 13, 0, 65, 1, 253, 15, 65, 2, 253, 15, 253, 128, 2, 11])); } catch (e) { return false; } })();
  var VARIANT = RELAXED ? 'litert_wasm_internal' : 'litert_wasm_compat_internal';
  var FILES = [
    { url: 'models/birdnet_v2.4_fp16.tflite', size: 25932540 }, { url: 'models/birdnet_v2.4_meta_fp16.tflite', size: 7071440 }, { url: 'models/yamnet.tflite', size: 4126810 },
    { url: 'models/birdnet_v2.4_labels.txt', size: 259740 }, { url: 'models/yamnet_class_map.csv', size: 14096 }, { url: 'models/head_web.json', size: 20568 }, { url: 'models/head_web.bin', size: 555008 },
    { url: RT + 'core.js', size: 53482 }, { url: RT + 'wasm-utils.js', size: 1494 },
    { url: RT + 'wasm/' + VARIANT + '.js', size: RELAXED ? 273035 : 273246 }, { url: RT + 'wasm/' + VARIANT + '.wasm', size: RELAXED ? 9367934 : 9334181 }
  ];
  var TOTAL = FILES.reduce(function (a, f) { return a + f.size; }, 0);

  function pref() { try { return localStorage.getItem('we.offline.mode') || 'auto'; } catch (e) { return 'auto'; } }
  function setPref(v) { try { localStorage.setItem('we.offline.mode', v); } catch (e) { } }

  /* ---------- download and cache ---------- */
  function haveAll() {
    if (!window.caches) return Promise.resolve(false);
    return caches.open(CACHE).then(function (c) { return Promise.all(FILES.map(function (f) { return c.match(f.url); })); }).then(function (r) { return r.every(Boolean); }).catch(function () { return false; });
  }
  function cleanOld() { return caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('we-offline-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }); }
  function download(onProgress) {
    if (!window.caches) return Promise.reject(new Error('no cache api'));
    var loaded = 0;
    return cleanOld().then(function () { return caches.open(CACHE); }).then(function (c) {
      var chain = Promise.resolve();
      FILES.forEach(function (f) {
        chain = chain.then(function () {
          return c.match(f.url).then(function (hit) {
            if (hit) { loaded += f.size; if (onProgress) onProgress(Math.min(1, loaded / TOTAL), f.url); return; }
            return fetch(f.url, { cache: 'reload' }).then(function (r) {
              if (!r.ok) throw new Error('http ' + r.status);
              var type = r.headers.get('Content-Type') || 'application/octet-stream';
              if (!r.body || !r.body.getReader) return r.blob().then(function (b) { loaded += f.size; if (onProgress) onProgress(Math.min(1, loaded / TOTAL), f.url); return c.put(f.url, new Response(b, { headers: { 'Content-Type': type } })); });
              var reader = r.body.getReader(), parts = [], got = 0;
              var pump = function () {
                return reader.read().then(function (x) {
                  if (x.done) return;
                  parts.push(x.value); got += x.value.length; if (onProgress) onProgress(Math.min(1, (loaded + got) / TOTAL), f.url);
                  return pump();
                });
              };
              return pump().then(function () { loaded += f.size; return c.put(f.url, new Response(new Blob(parts), { headers: { 'Content-Type': type } })); });
            });
          });
        });
      });
      return chain;
    }).then(refreshReady);
  }
  /* A new model version changes only the two small head_web files. Files of an older offline cache that did not change (BirdNET, YAMNet, runtime: about 46 MB)
     are copied into the new cache, and the small new files are fetched by themselves, so people who already downloaded the offline mode do not have to download it again. */
  function changes(f) { return /head_web\./.test(f.url); }
  function migrate() {
    if (!window.caches) return Promise.resolve(false);
    return caches.keys().then(function (ks) {
      var old = ks.filter(function (k) { return k.indexOf('we-offline-') === 0 && k !== CACHE; }); if (!old.length) return false;
      return caches.open(CACHE).then(function (c) {
        var same = FILES.filter(function (f) { return !changes(f); }), chain = Promise.resolve();
        same.forEach(function (f) {
          chain = chain.then(function () {
            return c.match(f.url).then(function (hit) {
              if (hit) return;
              return old.reduce(function (p, k) { return p.then(function (found) { return found || caches.open(k).then(function (oc) { return oc.match(f.url); }); }); }, Promise.resolve(null)).then(function (resp) { if (resp) return c.put(f.url, resp); });
            });
          });
        });
        return chain.then(function () { return Promise.all(same.map(function (f) { return c.match(f.url); })); }).then(function (r) {
          if (!r.every(Boolean)) return false;   // the old download was incomplete: leave it to the normal download button
          return Promise.all(FILES.filter(changes).map(function (f) {
            return fetch(f.url, { cache: 'reload' }).then(function (x) { if (!x.ok) throw new Error('http ' + x.status); return x.blob().then(function (b) { return c.put(f.url, new Response(b, { headers: { 'Content-Type': x.headers.get('Content-Type') || 'application/octet-stream' } })); }); });
          })).then(cleanOld).then(function () { return true; });
        });
      });
    }).catch(function () { return false; });
  }
  function remove() { ready = false; state = null; initP = null; return caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('we-offline-') === 0; }).map(function (k) { return caches.delete(k); })); }).then(refreshReady); }
  function refreshReady() { return haveAll().then(function (ok) { ready = ok; emit(); return ok; }); }
  var listeners = [];
  function emit() { listeners.forEach(function (f) { try { f(ready); } catch (e) { } }); }

  /* ---------- helpers ---------- */
  function buf(url) { return caches.open(CACHE).then(function (c) { return c.match(url); }).then(function (r) { if (!r) throw new Error('missing ' + url); return r.arrayBuffer(); }); }
  function f16dec(u16) { var out = new Float32Array(u16.length), i, h, s, e, m; for (i = 0; i < u16.length; i++) { h = u16[i]; s = (h & 0x8000) ? -1 : 1; e = (h >> 10) & 31; m = h & 1023; out[i] = e === 0 ? s * Math.pow(2, -14) * (m / 1024) : e === 31 ? (m ? NaN : s * Infinity) : s * Math.pow(2, e - 15) * (1 + m / 1024); } return out; }
  var F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);
  function f16enc(x) { F32[0] = x; var b = U32[0], s = (b >>> 16) & 0x8000, e = ((b >>> 23) & 0xff) - 127 + 15, m = (b >>> 13) & 0x3ff; if (e <= 0) return s; if (e >= 31) return s | 0x7c00; return s | (e << 10) | m; }
  function b64f16(v) { var bytes = new Uint8Array(v.length * 2), i, h, s = ''; for (i = 0; i < v.length; i++) { h = f16enc(v[i]); bytes[2 * i] = h & 255; bytes[2 * i + 1] = h >> 8; } for (i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
  function b64i16(b) { var bin = atob(b), n = bin.length >> 1, out = new Float32Array(n), i, v; for (i = 0; i < n; i++) { v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8); if (v > 32767) v -= 65536; out[i] = v / 32768; } return out; }
  var GROUPS = {
    animal: ['Animal', 'Wild animals', 'Bird', 'Bird vocalization, bird call, bird song', 'Bird flight, flapping wings', 'Frog', 'Insect', 'Cricket', 'Chirp, tweet', 'Squawk', 'Owl', 'Crow', 'Caw', 'Duck', 'Goose', 'Quack', 'Honk', 'Pigeon, dove', 'Coo', 'Hoot', 'Turkey', 'Gobble'],
    weather: ['Wind', 'Wind noise (microphone)', 'Rain', 'Raindrop', 'Rain on surface', 'Thunderstorm', 'Thunder', 'Rustling leaves', 'Stream', 'Waves, surf'],
    speech: ['Speech', 'Child speech, kid speaking', 'Conversation', 'Hubbub, speech noise, speech babble', 'Shout', 'Yell', 'Laughter'],
    gun: ['Gunshot, gunfire', 'Machine gun', 'Fusillade', 'Artillery fire', 'Explosion', 'Cap gun'],
    engine: ['Engine', 'Light engine (high frequency)', 'Medium engine (mid frequency)', 'Heavy engine (low frequency)', 'Motor vehicle (road)', 'Motorboat, speedboat', 'Motorcycle', 'Chainsaw', 'Lawn mower', 'Engine knocking', 'Idling', 'Accelerating, revving, vroom'],
    dog: ['Dog', 'Bark', 'Howl', 'Canidae, dogs, wolves']
  };
  function csvNames(text) {   /* display_name column of the YAMNet class map (quoted fields possible) */
    var rows = [], cur = '', q = false, row = [], i, c;
    for (i = 0; i < text.length; i++) { c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += c; }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.slice(1).map(function (r) { return r[2]; });
  }

  /* ---------- runtime and models ---------- */
  function init() {
    if (state) return Promise.resolve(state);
    if (initP) return initP;
    initP = haveAll().then(function (ok) { if (!ok) throw new Error('not downloaded'); })
      .then(function () { return import('./vendor/litert/core.js'); })
      .then(function (mod) { LR = mod; return mod.loadLiteRt(RT + 'wasm/'); })
      .then(function () { return Promise.all([buf('models/birdnet_v2.4_fp16.tflite'), buf('models/birdnet_v2.4_meta_fp16.tflite'), buf('models/yamnet.tflite')]); })
      .then(function (m) { return Promise.all(m.map(function (b) { return LR.loadAndCompile(new Uint8Array(b), { accelerator: 'wasm' }); })); })
      .then(function (models) {
        return Promise.all([buf('models/birdnet_v2.4_labels.txt'), buf('models/yamnet_class_map.csv'), buf('models/head_web.json'), buf('models/head_web.bin')]).then(function (r) {
          var td = new TextDecoder(), labels = td.decode(r[0]).split('\n').map(function (l) { return l.trim(); }).filter(Boolean), ynames = csvNames(td.decode(r[1])), head = JSON.parse(td.decode(r[2]));
          head.coef = f16dec(new Uint16Array(r[3]));
          var sciIdx = {}; labels.forEach(function (l, i) { sciIdx[l.split('_')[0]] = i; });
          head.bnIdx = head.bn_labels.map(function (l) { return l && sciIdx[l] !== undefined ? sciIdx[l] : -1; });
          var groups = {}; Object.keys(GROUPS).forEach(function (g) { groups[g] = []; ynames.forEach(function (n, i) { if (GROUPS[g].indexOf(n) >= 0) groups[g].push(i); }); });
          state = { bird: models[0], meta: models[1], yam: models[2], labels: labels, ynames: ynames, head: head, groups: groups, plaus: {} };
          return state;
        });
      });
    initP.catch(function () { initP = null; });
    return initP;
  }

  /* ---------- inference ---------- */
  function runModel(model, arr, shape) {
    var t = new LR.Tensor(arr, shape);
    return Promise.resolve(model.run(t)).then(function (res) {
      t.delete();
      var outs = Array.isArray(res) ? res : Object.keys(res).map(function (k) { return res[k]; });
      var data = outs.map(function (o) { return new Float32Array(o.toTypedArray()); });
      outs.forEach(function (o) { o.delete(); });
      return data;
    });
  }
  function runBird(s, w) {
    return runModel(s.bird, w, [1, SAMPLES]).then(function (d) {
      var logits = null, emb = null; d.forEach(function (x) { if (x.length === 6522) logits = x; else if (x.length === 1024) emb = x; });
      if (!logits || !emb) throw new Error('unexpected model outputs');
      return { logits: logits, emb: emb };
    });
  }
  function plausible(s, lat, lon) {
    var key = lat.toFixed(2) + ',' + lon.toFixed(2); if (s.plaus[key]) return Promise.resolve(s.plaus[key]);
    return runModel(s.meta, new Float32Array([lat, lon, 1.0]), [1, 3]).then(function (d) { var p = d[0], m = new Uint8Array(p.length); for (var i = 0; i < p.length; i++) m[i] = p[i] > 0.03 ? 1 : 0; return (s.plaus[key] = m); });
  }
  function headTop(s, emb, logits) {
    var h = s.head, d = h.d, n = h.n, nn = 0, i, j, v = new Float32Array(d);
    for (i = 0; i < d; i++) nn += emb[i] * emb[i]; nn = Math.sqrt(nn) + 1e-9; for (i = 0; i < d; i++) v[i] = emb[i] / nn;
    var z = new Float32Array(n), mx = -Infinity, acc;
    for (j = 0; j < n; j++) { acc = h.b[j]; var off = j * d; for (i = 0; i < d; i++) acc += h.coef[off + i] * v[i]; z[j] = acc; if (acc > mx) mx = acc; }
    var se = 0; for (j = 0; j < n; j++) se += Math.exp(z[j] - mx); var lse = mx + Math.log(se);
    var f = new Float32Array(n), fm = -Infinity;
    for (j = 0; j < n; j++) { var bn = h.bnIdx[j] >= 0 ? Math.max(-15, Math.min(15, logits[h.bnIdx[j]])) : 0; f[j] = ((z[j] - lse) + h.w[j] * bn) / h.T; if (f[j] > fm) fm = f[j]; }
    var sp = 0; for (j = 0; j < n; j++) { f[j] = Math.exp(f[j] - fm); sp += f[j]; } for (j = 0; j < n; j++) f[j] /= sp;
    var order = Array.from(f.keys()).sort(function (a, b) { return f[b] - f[a]; }).slice(0, 4), out = [];
    order.forEach(function (k) { if (h.classes[k] === 'background' || f[k] < .15) return; out.push({ sci: h.classes[k], common: h.common[k], conf: Math.round(f[k] * 1000) / 1000 }); });
    return out;
  }
  function soundType(s, w) {
    var x16 = new Float32Array(w.length / 3), i; for (i = 0; i < x16.length; i++) x16[i] = (w[3 * i] + w[3 * i + 1] + w[3 * i + 2]) / 3;
    var c = x16.length >> 1, seg = new Float32Array(x16.subarray(c - 7800, c + 7800));
    return runModel(s.yam, seg, [15600]).then(function (d) {
      var sc = d[0], order = Array.from(sc.keys()).sort(function (a, b) { return sc[b] - sc[a]; }).slice(0, 3), g = {};
      Object.keys(s.groups).forEach(function (k) { var m = 0; s.groups[k].forEach(function (ix) { if (sc[ix] > m) m = sc[ix]; }); g[k] = Math.round(m * 1000) / 1000; });
      return { top: order.filter(function (k) { return sc[k] >= 0.1; }).map(function (k) { return { name: s.ynames[k], score: Math.round(sc[k] * 1000) / 1000 }; }), groups: g };
    });
  }
  function one(s, b, plaus) {
    var w = b64i16(b); if (w.length !== SAMPLES) throw new Error('window length');
    return runBird(s, w).then(function (r) {
      var head = headTop(s, r.emb, r.logits), conf = new Float32Array(6522), i, items = [];
      for (i = 0; i < 6522; i++) conf[i] = plaus[i] ? 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, r.logits[i])))) : 0;
      var order = Array.from(conf.keys()).sort(function (a, b2) { return conf[b2] - conf[a]; }).slice(0, 5);
      order.forEach(function (k) { if (conf[k] < 0.05) return; var p = s.labels[k].split('_'), sci = p.shift(); items.push({ sci: sci, common: p.join('_'), conf: Math.round(conf[k] * 1000) / 1000 }); });
      return soundType(s, w).then(function (snd) { return { species: items, sound: snd, emb: b64f16(r.emb), head: head }; });
    });
  }
  function identifyLocal(body) {
    var job = queue.then(function () {
      return init().then(function (s) {
        var lat = body.lat != null ? +body.lat : 50.6, lon = body.lon != null ? +body.lon : 69.0;
        return plausible(s, lat, lon).then(function (plaus) {
          var results = [], chain = Promise.resolve();
          (body.windows || []).forEach(function (b) { chain = chain.then(function () { return one(s, b, plaus); }).then(function (r) { results.push(r); }); });
          return chain.then(function () { return { model: 'BirdNET V2.4 (on this device)', results: results, local: true }; });
        });
      });
    });
    queue = job.catch(function () { });   /* one at a time: the WebAssembly runtime is single-threaded */
    return job;
  }

  /* ---------- one entry point for the app: server or device ---------- */
  function authError() { var e = new Error('auth'); e.auth = true; return e; }
  function serverIdentify(body) {
    var tok = window.WESync && WESync.token();
    if (!tok) return Promise.reject(authError());
    return fetch('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) }).then(function (r) {
      if (r.status === 401) throw authError();
      if (!r.ok) throw new Error('http');
      return r.json();
    });
  }
  function run(body) {
    var mode = pref(), tok = window.WESync && WESync.token(), online = navigator.onLine !== false;
    if (ready && (mode === 'always' || !online || !tok)) return identifyLocal(body);
    return serverIdentify(body).catch(function (e) { if (ready) return identifyLocal(body); throw e; });
  }
  window.WEIdentify = { run: run, canRun: function () { return ready || !!(window.WESync && WESync.token()); }, localReady: function () { return ready; } };
  window.WEOffline = {
    VERSION: VERSION, totalMB: Math.round(TOTAL / 1048576), files: FILES, relaxedSimd: RELAXED, pref: pref, setPref: setPref, download: download, remove: remove, isReady: function () { return ready; }, refresh: refreshReady, init: init, identifyLocal: identifyLocal,
    onChange: function (f) { listeners.push(f); }, supported: function () { return !!(window.caches && window.WebAssembly); }
  };
  migrate().then(refreshReady);
})();
