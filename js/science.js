/* WetlandEar App: "Science and records" screen. Everything is computed on the device from the confirmed journal.
   1. Phenology: first and last date of every species by year, notes about this season, CSV for the report.
   2. Indicator species: a director picks 10-20 species that tell how the wetland is doing and watches one weekly curve.
   3. Stations: which recorders are alive, who looks after them, when the memory card was changed. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc;
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  function lang() { return window.WEi18n ? window.WEi18n.lang : 'ru'; }
  function p2(n) { return ('0' + n).slice(-2); }
  function dm(ms) { var d = new Date(ms); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1); }
  function sname(id) { return A.spName ? A.spName(id) : S.nameOf(id); }
  function sci(id) { return window.WEPrivacy ? WEPrivacy.sciOf(id) : ''; }
  function store(key, def) { try { var v = JSON.parse(localStorage.getItem(key)); return v == null ? def : v; } catch (e) { return def; } }
  function put(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { } }
  function confirmed() { return S.get().dets.filter(function (d) { return d.status === 'confirmed' && d.species; }); }
  function download(name, rows) {
    var cell = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + rows.map(function (r) { return r.map(cell).join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function ago(ms) {
    var h = (Date.now() - ms) / 36e5;
    if (h < 1) return L('меньше часа назад', 'less than an hour ago');
    if (h < 48) return Math.round(h) + L(' ч назад', ' h ago');
    return Math.round(h / 24) + L(' дн назад', ' d ago');
  }

  /* ---------- 1. phenology ---------- */
  function byYear() {
    var m = {};
    confirmed().forEach(function (d) {
      var t = +new Date(d.ts), y = new Date(t).getFullYear(), r = m[d.species] = m[d.species] || { id: d.species, n: 0, y: {} };
      var o = r.y[y] = r.y[y] || { first: t, last: t, n: 0 }; if (t < o.first) o.first = t; if (t > o.last) o.last = t; o.n++; r.n++;
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  }
  function phenology() {
    var box = $('#phenoCard'); if (!box) return;
    var all = byYear(), now = new Date(), ly = now.getFullYear(), py = ly - 1, DAY = 864e5;
    if (!all.length) { box.innerHTML = '<h2>' + esc(L('Фенология', 'Phenology')) + '</h2><p class="hint">' + esc(L('Появится, когда вы подтвердите виды в журнале: приложение запомнит первую и последнюю дату встречи каждого вида за каждый год.', 'It appears when you confirm species in the journal: the app remembers the first and the last date of each species for every year.')) + '</p>'; return; }
    all.sort(function (a, b) { return b.n - a.n; });
    var fresh = all.filter(function (r) { return r.y[ly] && now - r.y[ly].first < 14 * DAY && r.y[ly].n >= 1; }).sort(function (a, b) { return b.y[ly].first - a.y[ly].first; });
    var gone = all.filter(function (r) { return r.y[ly] && r.y[ly].n >= 5 && now - r.y[ly].last > 21 * DAY; }).sort(function (a, b) { return b.y[ly].last - a.y[ly].last; });
    var note = '';
    if (fresh.length) note += '<div class="ph-note"><b>' + esc(L('Первая встреча в этом году', 'First record this year')) + '</b><span>' + fresh.slice(0, 8).map(function (r) {
      var was = r.y[py] ? ' (' + esc(L('в прошлом году', 'last year')) + ' ' + dm(r.y[py].first) + ')' : ''; return '<span class="ph-i" data-sp="' + esc(r.id) + '">' + esc(sname(r.id)) + ' ' + dm(r.y[ly].first) + was + '</span>'; }).join('') + '</span></div>';
    if (gone.length) note += '<div class="ph-note"><b>' + esc(L('Давно не слышали', 'Not heard for a while')) + '</b><span>' + gone.slice(0, 8).map(function (r) {
      return '<span class="ph-i" data-sp="' + esc(r.id) + '">' + esc(sname(r.id)) + ': ' + esc(L('последний раз', 'last on')) + ' ' + dm(r.y[ly].last) + '</span>'; }).join('') + '</span><small>' + esc(L('Три недели без новых подтверждений при пяти и более в этом году. Это может быть отлёт, но может быть и молчание или отсутствие записей.', 'Three weeks with no new confirmations after five or more this year. It may be a departure, or silence, or a gap in recording.')) + '</small></div>';
    var rows = all.slice(0, 40).map(function (r) {
      var c = r.y[ly], p = r.y[py], shift = '–', cls = '';
      if (c && p) { var a = new Date(c.first), b = new Date(p.first), dd = Math.round((Date.UTC(2001, a.getMonth(), a.getDate()) - Date.UTC(2001, b.getMonth(), b.getDate())) / DAY); cls = dd < 0 ? 'early' : dd > 0 ? 'late' : ''; shift = (dd > 0 ? '+' : dd < 0 ? '−' : '') + Math.abs(dd) + ' ' + L('дн', 'd'); }
      return '<tr data-sp="' + esc(r.id) + '"><td>' + esc(sname(r.id)) + '</td><td>' + (c ? dm(c.first) : '–') + '</td><td>' + (c ? dm(c.last) : '–') + '</td><td>' + (p ? dm(p.first) + ' – ' + dm(p.last) : '–') + '</td><td class="' + cls + '">' + esc(shift) + '</td><td>' + (c ? c.n : 0) + '</td></tr>';
    }).join('');
    box.innerHTML = '<div class="res-head"><h2>' + esc(L('Фенология', 'Phenology')) + '</h2><button class="btn" id="phCsv">' + esc(L('Скачать CSV', 'Download CSV')) + '</button></div>' +
      '<p class="hint">' + esc(L('Когда каждый вид впервые и в последний раз был подтверждён человеком. Сдвиг сравнивает первую встречу с прошлым годом: минус значит раньше.', 'When each species was first and last confirmed by a person. The shift compares the first record with last year: minus means earlier.')) + '</p>' + note +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(L('Вид', 'Species')) + '</th><th>' + esc(L('Первая', 'First')) + ' ' + ly + '</th><th>' + esc(L('Последняя', 'Last')) + ' ' + ly + '</th><th>' + py + '</th><th>' + esc(L('Сдвиг', 'Shift')) + '</th><th>' + esc(L('Событий', 'Events')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
    $('#phCsv').addEventListener('click', function () {
      var out = [['species', 'scientific_name', 'year', 'first_confirmed', 'last_confirmed', 'confirmed_events']];
      all.forEach(function (r) { Object.keys(r.y).sort().forEach(function (y) { var o = r.y[y]; out.push([sname(r.id), sci(r.id), y, new Date(o.first).toISOString().slice(0, 10), new Date(o.last).toISOString().slice(0, 10), o.n]); }); });
      download('wetlandear-phenology-' + ly + '.csv', out);
    });
  }

  /* ---------- 2. indicator species ---------- */
  var IKEY = 'we.indicators', IMAX = 20;
  function indicators() { return store(IKEY, []).slice(0, IMAX); }
  function weekStart(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return +d; }
  function suggestInd() {
    var cnt = {}; confirmed().forEach(function (d) { cnt[d.species] = (cnt[d.species] || 0) + 1; });
    return Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 12);
  }
  function indicatorsCard() {
    var box = $('#indCard'); if (!box) return;
    var ids = indicators(), WK = 604800000, W = 26, now = Date.now(), cur = weekStart(now), out;
    var chips = ids.map(function (id) { return '<span class="ind-chip" data-sp="' + esc(id) + '">' + esc(sname(id)) + '<button data-rm="' + esc(id) + '" aria-label="' + esc(L('Убрать', 'Remove')) + '">×</button></span>'; }).join('');
    out = '<h2>' + esc(L('Индикаторные виды', 'Indicator species')) + '</h2><p class="hint">' + esc(L('Выберите 10–20 видов, по которым вы судите о состоянии болота. Один график покажет, какая доля из них слышна каждую неделю, и сравнит с прошлым годом.', 'Pick 10–20 species that tell you how the wetland is doing. One chart shows the share of them heard each week and compares it with last year.')) + '</p>' +
      '<div class="ind-chips">' + (chips || '<span class="hint">' + esc(L('Пока не выбрано ни одного вида.', 'No species chosen yet.')) + '</span>') + '</div>' +
      '<div class="ind-add"><input id="indIn" list="speciesList" placeholder="' + esc(L('Добавить вид', 'Add a species')) + '" autocomplete="off"><button class="btn" id="indAdd">' + esc(L('Добавить', 'Add')) + '</button><button class="btn" id="indSug">' + esc(L('Выбрать 12 самых частых', 'Pick the 12 most frequent')) + '</button></div>';
    if (ids.length < 3) { box.innerHTML = out + '<p class="hint">' + esc(L('Добавьте хотя бы три вида, чтобы увидеть график.', 'Add at least three species to see the chart.')) + '</p>'; bindInd(box); return; }
    var set = {}; ids.forEach(function (id) { set[id] = 1; });
    var weeks = {}; confirmed().forEach(function (d) { if (!set[d.species]) return; var w = weekStart(+new Date(d.ts)); (weeks[w] = weeks[w] || {})[d.species] = 1; });
    var val = function (w) { return weeks[w] ? Object.keys(weeks[w]).length / ids.length : 0; };
    var cols = [], i; for (i = W - 1; i >= 0; i--) { var w = weekStart(cur - i * WK + 3600000 * 12); cols.push({ w: w, v: val(w), prev: val(weekStart(w - 52 * WK + 3600000 * 12)) }); }
    var hasPrev = cols.some(function (c) { return c.prev > 0; }), VW = 560, VH = 170, bw = VW / W;
    var bars = cols.map(function (c, k) { var h = Math.round(c.v * (VH - 26)); return '<rect x="' + (k * bw + 1).toFixed(1) + '" y="' + (VH - 18 - h) + '" width="' + (bw - 2).toFixed(1) + '" height="' + Math.max(h, c.v ? 2 : 0) + '" rx="2" fill="#1F5BFF"><title>' + dm(c.w) + ': ' + Math.round(c.v * 100) + '%</title></rect>'; }).join('');
    var line = hasPrev ? '<polyline fill="none" stroke="#8AA4D6" stroke-width="2" stroke-dasharray="4 3" points="' + cols.map(function (c, k) { return ((k + .5) * bw).toFixed(1) + ',' + (VH - 18 - Math.round(c.prev * (VH - 26))); }).join(' ') + '"/>' : '';
    var grid = [0, .5, 1].map(function (g) { var y = VH - 18 - Math.round(g * (VH - 26)); return '<line x1="0" x2="' + VW + '" y1="' + y + '" y2="' + y + '" stroke="#DCE4F2"/><text x="2" y="' + (y - 3) + '" font-size="10" fill="#55657F">' + Math.round(g * 100) + '%</text>'; }).join('');
    var heard = Object.keys(weeks[cur] || {}).length, last4 = (val(cols[W - 1].w) + val(cols[W - 2].w) + val(cols[W - 3].w) + val(cols[W - 4].w)) / 4, prev4 = (val(cols[W - 5].w) + val(cols[W - 6].w) + val(cols[W - 7].w) + val(cols[W - 8].w)) / 4;
    var trend = last4 > prev4 + .05 ? L('растёт', 'rising') : last4 < prev4 - .05 ? L('падает', 'falling') : L('стабильно', 'steady');
    var lastSeen = {}; confirmed().forEach(function (d) { if (set[d.species]) { var t = +new Date(d.ts); if (!lastSeen[d.species] || t > lastSeen[d.species]) lastSeen[d.species] = t; } });
    var silent = ids.filter(function (id) { return !lastSeen[id] || now - lastSeen[id] > 21 * 864e5; });
    box.innerHTML = out + '<div class="ind-sum"><b>' + heard + ' ' + esc(L('из', 'of')) + ' ' + ids.length + '</b> ' + esc(L('индикаторов слышно на этой неделе', 'indicators heard this week')) + ' · ' + esc(L('за 4 недели', 'over 4 weeks')) + ': <b>' + esc(trend) + '</b></div>' +
      '<svg viewBox="0 0 ' + VW + ' ' + VH + '" width="100%" role="img" aria-label="' + esc(L('Доля индикаторных видов по неделям', 'Share of indicator species by week')) + '">' + grid + bars + line + '<text x="2" y="' + (VH - 4) + '" font-size="10" fill="#55657F">' + dm(cols[0].w) + '</text><text x="' + (VW - 2) + '" y="' + (VH - 4) + '" text-anchor="end" font-size="10" fill="#55657F">' + dm(cols[W - 1].w) + '</text></svg>' +
      '<p class="hint">' + esc(L('Синие столбцы: эта неделя в этом году.', 'Blue bars: each week this year.')) + (hasPrev ? ' ' + esc(L('Пунктир: те же недели год назад.', 'Dashed line: the same weeks a year ago.')) : '') + '</p>' +
      (silent.length ? '<p><b>' + esc(L('Молчат больше трёх недель', 'Silent for over three weeks')) + ':</b> ' + silent.map(function (id) { return esc(sname(id)) + (lastSeen[id] ? ' (' + dm(lastSeen[id]) + ')' : ' (' + esc(L('ни разу', 'never')) + ')'); }).join(', ') + '</p><p class="hint">' + esc(L('Для перелётных видов зимой это нормально. Сравнивайте с прошлым годом.', 'For migratory species this is normal in winter. Compare with last year.')) + '</p>' : '');
    bindInd(box);
  }
  function bindInd(box) {
    var add = function (id) { var ids = indicators(); if (!id || ids.indexOf(id) >= 0) return; if (ids.length >= IMAX) { A.toast(L('Не больше 20 видов', 'No more than 20 species')); return; } ids.push(id); put(IKEY, ids); indicatorsCard(); };
    $('#indAdd', box).addEventListener('click', function () { var r = window.WEBatch && WEBatch.resolveSpecies($('#indIn').value); if (r) add(r.id); else A.toast(L('Введите название вида', 'Type a species name')); });
    $('#indIn', box).addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('#indAdd').click(); } });
    $('#indSug', box).addEventListener('click', function () { var s = suggestInd(); if (!s.length) { A.toast(L('Сначала подтвердите несколько видов', 'Confirm a few species first')); return; } put(IKEY, s); indicatorsCard(); });
    if (!box.__b) { box.__b = 1; box.addEventListener('click', function (e) { var b = e.target.closest('[data-rm]'); if (!b) return; put(IKEY, indicators().filter(function (x) { return x !== b.getAttribute('data-rm'); })); indicatorsCard(); }); }
    if (window.WEBatch) WEBatch.fillDatalist('speciesList');
  }

  /* ---------- 3. stations ---------- */
  var MKEY = 'we.stationmeta';
  function stationsCard() {
    var box = $('#stnCard'); if (!box) return;
    var st = {}, meta = store(MKEY, {}), now = Date.now(), W7 = now - 7 * 864e5;
    S.get().recs.forEach(function (r) {
      var k = r.station || '–', o = st[k] = st[k] || { name: k, lat: r.lat, lon: r.lon, recs: 0, last: 0, ev: 0 };
      var t = +new Date(r.start) + (r.dur || 0) * 1000; if (t > o.last) { o.last = t; if (r.lat != null) { o.lat = r.lat; o.lon = r.lon; } } o.recs++;
    });
    S.get().dets.forEach(function (d) { if (d.status === 'rejected') return; var o = st[d.station || '–']; if (o && +new Date(d.ts) >= W7) o.ev++; });
    var list = Object.keys(st).map(function (k) { return st[k]; }).filter(function (o) { return !/^демо|^demo/i.test(o.name); }).sort(function (a, b) { return b.last - a.last; });
    if (!list.length) { box.innerHTML = '<h2>' + esc(L('Станции и рекордеры', 'Stations and recorders')) + '</h2><p class="hint">' + esc(L('Станции появятся после первой записи или загрузки файлов.', 'Stations appear after the first recording or file upload.')) + '</p>'; return; }
    box.innerHTML = '<h2>' + esc(L('Станции и рекордеры', 'Stations and recorders')) + '</h2><p class="hint">' + esc(L('Кто ответственный, когда меняли карту памяти и жива ли станция. Станция считается «молчащей», если от неё больше суток нет записей.', 'Who looks after each station, when the memory card was changed and whether it is alive. A station is "silent" if it has sent nothing for over a day.')) + '</p>' +
      '<div class="stn-list">' + list.map(function (o) {
        var m = meta[o.name] || {}, h = (now - o.last) / 36e5, cls = h < 24 ? 'ok' : h < 72 ? 'warn' : 'bad', lab = h < 24 ? L('работает', 'alive') : h < 72 ? L('тишина больше суток', 'silent for over a day') : L('молчит', 'silent');
        var sd = m.sd ? Math.round((now - +new Date(m.sd)) / 864e5) : null;
        return '<div class="stn ' + cls + '" data-st="' + esc(o.name) + '"><div class="stn-h"><b>' + esc(o.name) + '</b><span class="stn-s">' + esc(lab) + '</span></div>' +
          '<div class="stn-m">' + esc(L('Последняя запись', 'Last recording')) + ': ' + esc(ago(o.last)) + ' · ' + esc(L('записей', 'recordings')) + ': ' + o.recs + ' · ' + esc(L('событий за 7 дней', 'events in 7 days')) + ': ' + o.ev + (o.lat != null ? ' · ' + o.lat.toFixed(3) + ', ' + o.lon.toFixed(3) : '') + '</div>' +
          '<div class="stn-f"><label>' + esc(L('Ответственный', 'In charge')) + '<input data-f="who" value="' + esc(m.who || '') + '" maxlength="60"></label>' +
          '<label>' + esc(L('Карта памяти заменена', 'Memory card changed')) + '<input type="date" data-f="sd" value="' + esc(m.sd || '') + '"></label>' +
          '<label class="wide">' + esc(L('Заметка', 'Note')) + '<input data-f="note" value="' + esc(m.note || '') + '" maxlength="140" placeholder="' + esc(L('Например: батарея 2×AA, высота 3 м', 'For example: battery 2×AA, height 3 m')) + '"></label></div>' +
          (sd != null ? '<small class="hint">' + esc(L('С момента замены карты прошло дней', 'Days since the card was changed')) + ': ' + sd + '</small>' : '') + '</div>';
      }).join('') + '</div><p class="hint">' + esc(L('Заметки хранятся на этом устройстве.', 'Notes are stored on this device.')) + '</p>';
    box.querySelectorAll('input[data-f]').forEach(function (inp) {
      inp.addEventListener('change', function () { var name = inp.closest('.stn').getAttribute('data-st'), m = store(MKEY, {}); (m[name] = m[name] || {})[inp.getAttribute('data-f')] = inp.value; put(MKEY, m); if (inp.getAttribute('data-f') === 'sd') stationsCard(); });
    });
  }

  /* ---------- privacy switch (in the export card) ---------- */
  function privacySwitch() {
    var ex = $('#exCard'); if (!ex || $('#privOn') || !window.WEPrivacy) return;
    var l = document.createElement('label'); l.className = 'chk';
    l.innerHTML = '<input type="checkbox" id="privOn"> ' + esc(L('Защищать редкие виды: их координаты в выгрузках округляются до 0,1°, на публичных страницах они скрыты', 'Protect rare species: their coordinates are rounded to 0.1° in exports and hidden on public pages'));
    var ref = $('#exBlur'); (ref ? ref.parentNode : ex).insertAdjacentElement(ref ? 'afterend' : 'beforeend', l);
    var cb = $('#privOn', l); cb.checked = WEPrivacy.on(); cb.addEventListener('change', function () { WEPrivacy.setOn(cb.checked); });
  }

  function render() { phenology(); indicatorsCard(); stationsCard(); }
  privacySwitch();
  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) { if (prev) prev(v); if (v === 'science') render(); if (v === 'data') privacySwitch(); };
  window.WEScience = { render: render, indicators: indicators };
})();
