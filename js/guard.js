/* WetlandEar App: "Protection" screen. When and where gunshots and engines were heard (heat map by weekday and hour, map, stations), a plain suggestion for patrols,
   a list of recent alerts that a person can mark as a real violation or a false alarm, and the evidence log (server side hash chain, migration 009).
   Alerts come from the sound model (YAMNet) and are only hints: a person decides. Counts weigh confirmed alerts 1, not yet reviewed 0.5, false alarms 0. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc;
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  function p2(n) { return ('0' + n).slice(-2); }
  function fmt(t) { var d = new Date(t); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function signed() { return !!(window.WESync && WESync.me()); }
  var days = 30, map = null, layer = null;
  function kindName(k) { return k === 'gun' ? L('возможный выстрел', 'possible gunshot') : L('шум двигателя', 'engine noise'); }
  function weight(d) { return d.threatReview === 'confirmed' ? 1 : d.threatReview === 'false' ? 0 : .5; }
  function threats() {
    var from = Date.now() - days * 864e5;
    return S.get().dets.filter(function (d) { return d.status !== 'rejected' && S.threatOf(d) && +new Date(d.ts) >= from; }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  }
  var WD = function () { return window.WEi18n && WEi18n.lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']; };
  var WDL = function () { return window.WEi18n && WEi18n.lang === 'en' ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] : ['в понедельник', 'во вторник', 'в среду', 'в четверг', 'в пятницу', 'в субботу', 'в воскресенье']; };

  function analyse(list) {
    var grid = []; for (var i = 0; i < 7; i++) grid.push(new Array(24).fill(0));
    var byHour = new Array(24).fill(0), byDay = new Array(7).fill(0), st = {}, conf = 0, fal = 0, open = 0;
    list.forEach(function (d) {
      var w = weight(d), t = new Date(d.ts), wd = (t.getDay() + 6) % 7, h = t.getHours();
      if (d.threatReview === 'confirmed') conf++; else if (d.threatReview === 'false') fal++; else open++;
      if (!w) return; grid[wd][h] += w; byHour[h] += w; byDay[wd] += w;
      var k = d.station || '?', r = st[k] = st[k] || { name: k, lat: d.lat, lon: d.lon, n: 0, gun: 0 }; r.n += w; if (S.threatOf(d).kind === 'gun') r.gun += w;
    });
    var bestH = 0, bestS = -1; for (var s = 0; s < 24; s++) { var v = byHour[s] + byHour[(s + 1) % 24] + byHour[(s + 2) % 24]; if (v > bestS) { bestS = v; bestH = s; } }
    var total = byHour.reduce(function (a, b) { return a + b; }, 0);
    var topDays = byDay.map(function (v, i) { return { i: i, v: v }; }).sort(function (a, b) { return b.v - a.v; }).filter(function (x) { return x.v > 0; }).slice(0, 2);
    var stations = Object.keys(st).map(function (k) { return st[k]; }).sort(function (a, b) { return b.n - a.n; });
    return { grid: grid, byHour: byHour, total: total, bestH: bestH, bestShare: total ? bestS / total : 0, topDays: topDays, stations: stations, conf: conf, fal: fal, open: open };
  }

  function play(id) {
    S.getClip(id).then(function (i16) {
      if (!i16) { A.toast(L('Для этого события нет аудиоклипа', 'This event has no audio clip')); return; }
      var f = new Float32Array(i16.length), i; for (i = 0; i < f.length; i++) f[i] = i16[i] / 32768;
      var ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume();
      var b = ctx.createBuffer(1, f.length, 22050); b.getChannelData(0).set(f); var src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start();
    });
  }
  function review(id, val) {
    var d = S.get().dets.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    d.threatReview = d.threatReview === val ? undefined : val; d.reviewed = new Date().toISOString(); S.save();
    if (window.WESync && WESync.pushDet) WESync.pushDet(d);
    render();
  }
  function dl(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500); }

  function render() {
    var box = $('#guardBody'); if (!box) return;
    var list = threats(), a = analyse(list), demo = list.length && list.every(function (d) { return d.demo; });
    var h = '<div class="seg" id="gdays" role="group">' + [7, 30, 90].map(function (n) { return '<button data-d="' + n + '"' + (n === days ? ' class="on"' : '') + '>' + n + ' ' + esc(L('дней', 'days')) + '</button>'; }).join('') + '</div>';
    if (demo) h += '<p class="hint">' + esc(L('Показаны демонстрационные события.', 'Demonstration events are shown.')) + '</p>';
    h += '<div class="q-hero"><div><b>' + list.length + '</b><span>' + esc(L('тревог за период', 'alerts in the period')) + '</span></div><div><b>' + a.conf + '</b><span>' + esc(L('подтверждено человеком', 'confirmed by a person')) + '</span><small>' + a.fal + ' ' + esc(L('ложных', 'false alarms')) + '</small></div><div><b>' + a.open + '</b><span>' + esc(L('ещё не проверено', 'not reviewed yet')) + '</span></div></div>';
    if (!list.length) { box.innerHTML = h + '<p class="hint">' + esc(L('За этот период тревог нет. Они появляются, когда звук похож на выстрел или двигатель.', 'No alerts in this period. They appear when a sound looks like a gunshot or an engine.')) + '</p>'; bind(box); return; }
    /* heat map weekday x hour */
    var mx = 0; a.grid.forEach(function (r) { r.forEach(function (v) { if (v > mx) mx = v; }); });
    h += '<h3>' + esc(L('Когда слышны тревоги', 'When alerts are heard')) + '</h3><div class="gh">' + a.grid.map(function (r, i) {
      return '<div class="gh-r"><span>' + WD()[i] + '</span><div>' + r.map(function (v, k) { return '<i style="--a:' + (v ? (.14 + .86 * v / mx).toFixed(2) : 0) + '" title="' + WD()[i] + ' ' + p2(k) + ':00 · ' + (Math.round(v * 10) / 10) + '"></i>'; }).join('') + '</div></div>'; }).join('') +
      '<div class="gh-r gh-ax"><span></span><div><b>00</b><b>06</b><b>12</b><b>18</b><b>24</b></div></div></div>';
    /* suggestion */
    var w0 = a.bestH, w1 = (a.bestH + 3) % 24, tip = esc(L('Чаще всего тревоги слышны с ', 'Alerts are heard most often from ')) + '<b>' + p2(w0) + ':00 ' + esc(L('до', 'to')) + ' ' + p2(w1) + ':00</b> (' + Math.round(a.bestShare * 100) + '% ' + esc(L('всех тревог', 'of all alerts')) + ')';
    if (a.topDays.length) tip += esc(L(', особенно ' + a.topDays.map(function (x) { return WDL()[x.i]; }).join(' и '), ', especially on ' + a.topDays.map(function (x) { return WDL()[x.i]; }).join(' and ')));
    if (a.stations.length) tip += esc(L('. Больше всего на станции ', '. Most on station ')) + '<b>' + esc(a.stations[0].name) + '</b>';
    h += '<div class="g-tip">' + tip + '.<small>' + esc(L('Для планирования патрулей. Часть тревог ложные: проверяйте записи и отмечайте «ложная», тогда оценка уточняется.', 'For planning patrols. Some alerts are false: check the recordings and mark "false alarm" and the estimate improves.')) + '</small></div>';
    /* stations and map */
    h += '<h3>' + esc(L('Где', 'Where')) + '</h3><div id="gmap" class="gmap"></div><div class="g-st">' + a.stations.slice(0, 8).map(function (s) { return '<div><span>' + esc(s.name) + '</span><span class="qbar"><i style="--w:' + Math.round(s.n / a.stations[0].n * 100) + '%"></i></span><b>' + (Math.round(s.n * 10) / 10) + '</b></div>'; }).join('') + '</div>';
    /* recent alerts */
    h += '<div class="res-head"><h3>' + esc(L('Последние тревоги', 'Latest alerts')) + '</h3><button class="btn" id="gCsv">' + esc(L('Скачать CSV', 'Download CSV')) + '</button></div>' + list.slice(0, 20).map(function (d) {
      var t = S.threatOf(d); return '<div class="tk g-ev' + (d.threatReview === 'false' ? ' done' : '') + '" data-id="' + esc(d.id) + '"><b>' + esc(kindName(t.kind)) + ' ' + Math.round(t.score * 100) + '%</b><small>' + esc(fmt(d.ts)) + ' · ' + esc(d.station || '–') + (d.threatReview === 'confirmed' ? ' · ' + esc(L('нарушение подтверждено', 'violation confirmed')) : d.threatReview === 'false' ? ' · ' + esc(L('ложная тревога', 'false alarm')) : '') + '</small>' +
        '<div class="mg-row">' + (d.clip ? '<button class="btn" data-a="play">▶</button>' : '') + '<button class="btn' + (d.threatReview === 'confirmed' ? ' primary' : '') + '" data-a="yes">' + esc(L('Нарушение', 'Violation')) + '</button><button class="btn" data-a="no">' + esc(L('Ложная', 'False alarm')) + '</button>' +
        (d.clip ? '<button class="btn" data-a="ev">' + esc(L('В журнал доказательств', 'To the evidence log')) + '</button>' : '') + '</div></div>'; }).join('');
    h += '<div id="evBox"></div>';
    box.innerHTML = h; bind(box, list); drawMap(a); evidenceList();
  }
  function drawMap(a) {
    var el = $('#gmap'); if (!el) return; var LF = window.L;   /* the global Leaflet; L() above is the translation helper */
    if (!LF || !LF.map) { el.innerHTML = '<p class="hint" style="padding:12px">' + esc(L('Карта не загрузилась.', 'The map did not load.')) + '</p>'; return; }
    if (map) { map.remove(); map = null; }
    map = LF.map(el, { zoomControl: true }).setView([50.6, 69.0], 9); LF.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
    var pts = []; a.stations.forEach(function (s) { if (s.lat == null) return; pts.push([s.lat, s.lon]); LF.circleMarker([s.lat, s.lon], { radius: 8 + Math.min(26, s.n * 3), color: '#C2362F', weight: 2, fillColor: '#C2362F', fillOpacity: .3 }).addTo(map).bindTooltip(s.name + ': ' + (Math.round(s.n * 10) / 10)); });
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 13 }); setTimeout(function () { if (map) map.invalidateSize(); }, 250);
  }
  function bind(box, list) {
    box.querySelectorAll('#gdays button').forEach(function (b) { b.addEventListener('click', function () { days = +b.dataset.d; render(); }); });
    box.onclick = function (e) {
      var b = e.target.closest('[data-a]'), ev = e.target.closest('.g-ev'); if (!b || !ev) return; var id = ev.getAttribute('data-id');
      if (b.dataset.a === 'play') play(id); else if (b.dataset.a === 'yes') review(id, 'confirmed'); else if (b.dataset.a === 'no') review(id, 'false'); else if (b.dataset.a === 'ev') addEvidence(id, b);
    };
    var csv = $('#gCsv', box); if (csv) csv.addEventListener('click', function () {
      var rows = [['id', 'time', 'station', 'lat', 'lon', 'kind', 'score', 'review']]; (list || []).forEach(function (d) { var t = S.threatOf(d); rows.push([d.id, d.ts, d.station || '', d.lat, d.lon, t.kind, t.score, d.threatReview || '']); });
      var cell = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }; dl('wetlandear-alerts.csv', '﻿' + rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n'));
    });
  }

  /* ---------- evidence log (server): the audio hash, the event data and the weather are fixed in a hash chain ---------- */
  function api(path, opt) { opt = opt || {}; opt.headers = Object.assign({ Authorization: 'Bearer ' + WESync.token() }, opt.headers || {}); return fetch(path, opt); }
  function addEvidence(id, btn) {
    if (!signed()) { A.toast(L('Войдите через Google', 'Sign in with Google')); return; }
    var d = S.get().dets.filter(function (x) { return x.id === id; })[0]; if (!d) return; btn.disabled = true;
    S.getClip(id).then(function (clip) { if (!clip) throw new Error('noclip'); return WESync.uploadClip(id, clip); })
      .then(function () { return api('/api/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ det_id: id, lang: window.WEi18n ? WEi18n.lang : 'ru' }) }); })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 200) { A.toast(L('Записано в журнал доказательств, номер ', 'Recorded in the evidence log, number ') + x.j.seq); evidenceList(); }
        else if (x.s === 404 || x.s === 503) A.toast(L('Журнал доказательств ещё не настроен: нужно обновить базу данных (009)', 'The evidence log is not set up yet: the database update (009) is needed'));
        else A.toast(L('Не удалось записать', 'Could not record'));
      }).catch(function (e) { A.toast(e && e.message === 'noclip' ? L('У события нет аудиоклипа', 'This event has no audio clip') : L('Не удалось записать', 'Could not record')); }).then(function () { btn.disabled = false; });
  }
  function evidenceList() {
    var box = $('#evBox'); if (!box) return;
    var head = '<div class="res-head"><h3>' + esc(L('Журнал доказательств', 'Evidence log')) + '</h3><button class="btn" id="evVer"' + (signed() ? '' : ' disabled') + '>' + esc(L('Проверить цепочку', 'Check the chain')) + '</button></div><p class="hint">' + esc(L('Каждая запись фиксирует хеш аудио, данные события и погоду, а записи связаны цепочкой хешей: изменить старую запись незаметно нельзя. Это не заменяет юридическую процедуру фиксации нарушения.', 'Each record fixes the audio hash, the event data and the weather, and the records are linked in a hash chain, so an old record cannot be changed unnoticed. It does not replace the legal procedure for recording a violation.')) + '</p>';
    if (!signed()) { box.innerHTML = head; return; }
    WESync.from('evidence_log').select('id,seq,created_at,payload_text,audio_sha256,chain_hash').order('seq', { ascending: false }).limit(30).then(function (r) {
      if (r.error) throw r.error;
      var rows = r.data.map(function (x) {
        var p = {}; try { p = JSON.parse(x.payload_text); } catch (e) { }
        return '<div class="tk g-evid" data-id="' + esc(x.id) + '"><b>№ ' + x.seq + ' · ' + esc(p.kind ? kindName(p.kind) : L('событие', 'event')) + '</b><small>' + esc(fmt(p.event_time || x.created_at)) + ' · ' + esc(p.station || '–') + ' · SHA-256 ' + esc(x.audio_sha256.slice(0, 12)) + '…</small>' +
          '<div class="mg-row"><button class="btn" data-e="pdf">PDF</button><button class="btn" data-e="wav">' + esc(L('Аудио', 'Audio')) + '</button><button class="btn" data-e="ver">' + esc(L('Проверить', 'Verify')) + '</button></div></div>'; }).join('');
      box.innerHTML = head + (rows || '<p class="hint">' + esc(L('Записей пока нет.', 'No records yet.')) + '</p>') + '<p class="hint" id="evMsg" role="status"></p>';
      box.onclick = function (e) {
        var b = e.target.closest('[data-e]'), t = e.target.closest('.g-evid'); if (!b || !t) return; var id = t.getAttribute('data-id'), msg = $('#evMsg', box);
        if (b.dataset.e === 'ver') api('/api/evidence?verify=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (j) { msg.textContent = (j.chain_ok && j.audio_ok ? L('Запись цела: цепочка сходится и аудио совпадает с хешем.', 'The record is intact: the chain matches and the audio matches the hash.') : L('ВНИМАНИЕ: проверка не пройдена. ', 'WARNING: verification failed. ') + (j.chain_ok ? '' : L('Цепочка нарушена. ', 'The chain is broken. ')) + (j.audio_ok ? '' : L('Аудио не совпадает с хешем или недоступно.', 'The audio does not match the hash or is unavailable.'))); }).catch(function () { msg.textContent = L('Не удалось проверить.', 'Could not verify.'); });
        else api('/api/evidence?id=' + encodeURIComponent(id) + '&' + b.dataset.e + '=1&lang=' + (window.WEi18n ? WEi18n.lang : 'ru')).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (bl) { var a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'wetlandear-evidence-' + id.slice(0, 8) + (b.dataset.e === 'pdf' ? '.pdf' : '.wav'); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800); }).catch(function () { msg.textContent = L('Не удалось скачать.', 'Could not download.'); });
      };
      var vb = $('#evVer', box); if (vb) vb.addEventListener('click', function () { var msg = $('#evMsg', box); msg.textContent = '…'; api('/api/evidence?verify=chain').then(function (r) { return r.json(); }).then(function (j) { msg.textContent = j.chain_ok ? L('Вся цепочка цела. Записей: ', 'The whole chain is intact. Records: ') + j.count : L('ЦЕПОЧКА НАРУШЕНА начиная с записи № ', 'THE CHAIN IS BROKEN from record no. ') + j.first_bad; }).catch(function () { msg.textContent = L('Не удалось проверить.', 'Could not verify.'); }); });
    }).catch(function (e) { box.innerHTML = head + '<p class="hint">' + esc(/relation|does not exist|schema cache|permission/i.test(String(e.message || e)) ? L('Журнал станет доступен после обновления базы данных (файл supabase/009_guard_and_network.sql).', 'The log becomes available after the database update (file supabase/009_guard_and_network.sql).') : L('Не удалось загрузить журнал.', 'Could not load the log.')) + '</p>'; });
  }

  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) { if (prev) prev(v); if (v === 'guard') render(); };
  if (window.WESync) WESync.onChange(function () { if (A.current() === 'guard') evidenceList(); });
  window.WEGuard = { render: render, analyse: analyse, threats: threats };
})();
