/* WetlandEar App: batch upload (hundreds of files from a station memory card) and "teach the app a voice" mode.
   Files are processed one by one in the browser: decode, find events, ask the server for species suggestions, save to the journal.
   In teach mode every kept event of the selected files is saved as confirmed for the species you name, so it becomes a sample of that voice. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp, D = window.WEDSP, C = A && A.core;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc;
  function lang() { return window.WEi18n ? window.WEi18n.lang : 'ru'; }
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  var AUDIO = /\.(wav|mp3|m4a|ogg|flac|webm|aac)$/i, MAXSEC = 300, MAXWIN = 18, SNR = 14, TEACH_KEEP = 6;
  var queue = [], running = false, stopFlag = false, stats = { ok: 0, ev: 0, fail: 0, skip: 0 };

  /* ---------- species input shared with the watchlist ---------- */
  function ruToEn() { var m = {}, ru = window.WE_RU || {}; Object.keys(ru).forEach(function (en) { m[ru[en].toLowerCase()] = en; }); return m; }
  function speciesChoices() {
    var out = [], seen = {};
    S.SPECIES.forEach(function (s) { out.push({ id: s[0], label: s[1], en: (S.species[s[0]] || {}).en }); seen[(s[1] || '').toLowerCase()] = 1; });
    var ru = window.WE_RU || {};
    Object.keys(ru).forEach(function (en) { if (!seen[ru[en].toLowerCase()]) out.push({ id: 'x:' + en, label: ru[en], en: en }); });
    return out;
  }
  function resolveSpecies(text) {
    var t = String(text || '').trim().toLowerCase(); if (!t) return null;
    var ch = speciesChoices(), i;
    for (i = 0; i < ch.length; i++) if (ch[i].label.toLowerCase() === t || (ch[i].en || '').toLowerCase() === t || (S.species[ch[i].id] && S.species[ch[i].id].lat.toLowerCase() === t)) return { id: ch[i].id, name: ch[i].label };
    var sci = window.WE_SCI || {}, en = Object.keys(sci).filter(function (k) { return k.toLowerCase() === t || sci[k].toLowerCase() === t; })[0];
    if (en) { var ref = S.SPECIES.filter(function (s) { return s[2] === sci[en]; })[0]; return ref ? { id: ref[0], name: ref[1] } : { id: 'x:' + en, name: (window.WE_RU || {})[en] || en }; }
    return { id: 'x:' + String(text).trim().slice(0, 80), name: String(text).trim().slice(0, 80) };   /* a species nobody has listed yet: your own name for it */
  }
  function fillDatalist(id) {
    var dl = document.getElementById(id); if (!dl || dl.children.length) return;
    dl.innerHTML = speciesChoices().map(function (c) { return '<option value="' + esc(c.label) + '">' + esc(c.en || '') + '</option>'; }).join('');
  }

  /* ---------- the pipeline for one file ---------- */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function windowAt(s48, dur, center) {
    var start = Math.max(0, Math.min(center - 1.5, dur - 3)), a = Math.round(start * 48000), w = new Int16Array(144000);
    for (var i = 0; i < 144000 && a + i < s48.length; i++) { var x = Math.max(-1, Math.min(1, s48[a + i])); w[i] = x < 0 ? x * 32768 : x * 32767; }
    return w;
  }
  function identify(events, s48, dur) {
    var st = S.get().station, jobs = [], budget = MAXWIN;
    events.slice().sort(function (a, b) { return b.snr - a.snr; }).forEach(function (e) {
      if (budget <= 0) return;
      var cs = C.eventCenters(e).slice(0, budget); e._res = []; e._need = cs.length; budget -= cs.length;
      cs.forEach(function (c) { jobs.push({ ev: e, c: c }); });
    });
    var chain = Promise.resolve();
    for (var from = 0; from < jobs.length; from += 10) (function (from) {
      chain = chain.then(function () {
        var part = jobs.slice(from, from + 10);
        return WEIdentify.run({ lat: st.lat, lon: st.lon, windows: part.map(function (j) { return C.b64(windowAt(s48, dur, j.c)); }) })
          .then(function (j) { j.results.forEach(function (it, k) { var ev = part[k].ev; ev._res.push(it); if (ev._res.length === ev._need) C.aggregate(ev); }); });
      });
    })(from);
    return chain.then(function () { events.forEach(function (e) { delete e._res; delete e._need; }); });
  }
  function clipOf(samples, e) {
    var pad = Math.round(.25 * D.SR), a = Math.max(0, Math.floor(e.t0 * D.SR) - pad), b = Math.min(samples.length, Math.ceil(e.t1 * D.SR) + pad), out = new Int16Array(b - a);
    for (var i = 0; i < out.length; i++) { var x = Math.max(-1, Math.min(1, samples[a + i])); out[i] = x < 0 ? x * 32768 : x * 32767; }
    return out;
  }
  /* decode, find events and (when signed in) ask the server for species suggestions and fingerprints; nothing is saved here */
  function analyse(f) {
    return f.arrayBuffer().then(function (ab) {
      var copy = ab.slice(0);
      return D.decode(ab).then(function (samples) {
        if (samples.length / D.SR > MAXSEC) samples = samples.subarray(0, MAXSEC * D.SR);
        if (samples.length < 4096) throw new Error('short');
        return sleep(20).then(function () {
          var sp = D.spectrogram(samples), events = D.detect(sp, SNR).map(function (e) { e.status = 'auto'; e.species = null; return e; });
          var idx = window.WEIndices ? WEIndices.compute(sp) : null;
          if (!events.length) return { events: [], samples: samples, dur: sp.dur, idx: idx };
          var signed = window.WEIdentify && WEIdentify.canRun();
          var go = signed ? D.decode(copy, 48000).then(function (s48) { return identify(events, s48, sp.dur); }).catch(function (e) { if (e && e.auth) throw e; /* suggestions failed: keep the events without them */ }) : Promise.resolve();
          return go.then(function () { return { events: events, samples: samples, dur: sp.dur, idx: idx }; });
        });
      });
    });
  }
  function saveEvents(f, events, samples, dur, idx) {
    if (!events.length) {
      if (idx) S.addRecording({ name: f.name.replace(/\.[^.]+$/, ''), start: new Date(f.lastModified || Date.now()).toISOString(), dur: dur, idx: idx }, [], []);   /* a silent recording still tells about the soundscape */
      return 0;
    }
    var evs = events.map(function (e) { return { t0: e.t0, t1: e.t1, fLow: e.fLow, fHigh: e.fHigh, fPeak: e.fPeak, snr: e.snr, status: e.status, species: e.species, clipPad: .25, sound: e.sound || null, emb: e.emb || null,
      suggest: e.suggest && e.suggest[0] ? { id: e.suggest[0].id || null, own: !!e.suggest[0].own, head: !!e.suggest[0].head, sci: e.suggest[0].sci, common: e.suggest[0].common, conf: e.suggest[0].conf } : null }; });
    S.addRecording({ name: f.name.replace(/\.[^.]+$/, ''), start: new Date(f.lastModified || Date.now()).toISOString(), dur: dur, idx: idx }, evs, events.map(function (e) { return clipOf(samples, e); }));
    return evs.length;
  }
  /* the sounds worth keeping from one file when teaching a voice: the clearest ones that look like an animal */
  function bestSounds(events, n) {
    return events.filter(function (e) { var g = e.sound && e.sound.groups; return !g || g.animal === undefined || g.animal >= .25; }).sort(function (a, b) { return b.snr - a.snr; }).slice(0, n || TEACH_KEEP);
  }
  function processFile(f) {
    return analyse(f).then(function (a) { return { n: saveEvents(f, a.events, a.samples, a.dur, a.idx) }; });
  }

  /* ---------- queue and screen ---------- */
  function mode() { var r = $('input[name="bmode"]:checked'); return r ? r.value : 'auto'; }
  function render() {
    var box = $('#batchList'); if (!box) return;
    var done = queue.filter(function (q) { return q.state !== 'wait' && q.state !== 'run'; }).length;
    $('#batchBar').style.setProperty('--w', (queue.length ? Math.round(done / queue.length * 100) : 0) + '%');
    $('#batchSum').textContent = queue.length ? L('Файлов: ' + queue.length + ' · готово: ' + done + ' · событий сохранено: ' + stats.ev + (stats.fail ? ' · ошибок: ' + stats.fail : ''), 'Files: ' + queue.length + ' · done: ' + done + ' · events saved: ' + stats.ev) : '';
    var ico = { wait: '·', run: '…', ok: '✓', fail: '✕', skip: '–' };
    box.innerHTML = queue.slice(-60).map(function (q) { return '<li class="' + q.state + '"><span>' + ico[q.state] + '</span> ' + esc(q.f.name) + (q.msg ? ' <em>' + esc(q.msg) + '</em>' : '') + '</li>'; }).join('');
    $('#batchGo').disabled = running; $('#batchStop').hidden = !running;
  }
  function addFiles(list) {
    var arr = [].slice.call(list || []).filter(function (f) { return AUDIO.test(f.name) && f.size > 4000; });
    var skipped = (list ? list.length : 0) - arr.length;
    arr.sort(function (a, b) { return (a.webkitRelativePath || a.name) < (b.webkitRelativePath || b.name) ? -1 : 1; });
    arr.forEach(function (f) { queue.push({ f: f, state: 'wait' }); });
    if (skipped > 0) A.toast(L('Пропущено не-аудио файлов: ', 'Skipped non-audio files: ') + skipped);
    render();
  }
  function start() {
    if (running || !queue.length) return;
    var m = mode(), label = null;
    if (m === 'teach') {
      label = resolveSpecies($('#teachSpecies').value);
      if (!label) { A.toast(L('Сначала укажите вид', 'Name the species first')); return; }
      if (!window.WESync || !WESync.token()) { A.toast(L('Для обучения голосу нужен вход через Google', 'Teaching a voice needs sign-in')); return; }
      if (!confirm(L('Все найденные звуки в этих файлах будут сохранены как «' + label.name + '». Продолжить?', 'All sounds found in these files will be saved as "' + label.name + '". Continue?'))) return;
    }
    running = true; stopFlag = false;
    var next = function () {
      var q = queue.filter(function (x) { return x.state === 'wait'; })[0];
      if (!q || stopFlag) { running = false; render(); if (!q) A.toast(L('Пакет обработан. Событий сохранено: ', 'Batch finished. Events saved: ') + stats.ev); if (window.WESync && WESync.syncNow) WESync.syncNow(true); A.refreshChrome(); return; }
      q.state = 'run'; render();
      processFile(q.f).then(function (r) { q.state = r.n ? 'ok' : 'skip'; q.msg = r.n ? '+' + r.n : L('событий нет', 'no events'); stats.ev += r.n; stats.ok++; })
        .catch(function (e) { q.state = 'fail'; q.msg = e && e.auth ? L('нужен вход', 'sign in') : e && e.message === 'short' ? L('слишком короткий', 'too short') : L('не прочитан', 'unreadable'); stats.fail++; if (e && e.auth) stopFlag = true; })
        .then(function () { render(); return sleep(30); }).then(next);
    };
    next();
  }
  function init() {
    if (!$('#batchCard')) return;
    fillDatalist('speciesList');
    $('#batchFiles').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
    $('#batchDir').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
    $('#batchGo').addEventListener('click', start);
    $('#batchStop').addEventListener('click', function () { stopFlag = true; });
    $('#batchClear').addEventListener('click', function () { if (running) return; queue = []; stats = { ok: 0, ev: 0, fail: 0, skip: 0 }; render(); });
    [].forEach.call(document.querySelectorAll('input[name="bmode"]'), function (r) { r.addEventListener('change', function () { $('#teachBox').hidden = mode() !== 'teach'; }); });
    render();
  }
  window.WEBatch = { resolveSpecies: resolveSpecies, fillDatalist: fillDatalist, speciesChoices: speciesChoices, analyse: analyse, saveEvents: saveEvents, bestSounds: bestSounds, clipOf: clipOf };
  init();
})();
