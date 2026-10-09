/* WetlandEar App: map, morning report, threat list, first-run guide, install button. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc, plural = A.plural, spName = A.spName;
  var THREAT = { gun: 'Возможный выстрел', engine: 'Шум двигателя' };

  /* ---------- first-run guide and threat card on the Pulse screen ---------- */
  function seen() { try { return localStorage.getItem('we.onboard') === '1'; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem('we.onboard', '1'); } catch (e) { } }

  function afterPulse() {
    var pulse = $('#v-pulse'), grid = $('.grid3', pulse);
    var ob = $('#onboard');
    var show = !seen() && !S.get().dets.length;
    if (show && !ob) {
      ob = document.createElement('div'); ob.id = 'onboard'; ob.className = 'card onboard';
      ob.innerHTML = '<h2>Как это работает</h2><ol class="ob-steps">' +
        '<li><b>1. Слушайте.</b> Запишите звук рядом с водой или загрузите файл на экране «Слушать».</li>' +
        '<li><b>2. Проверьте.</b> Модель предложит вид, вы подтвердите его кнопкой «Верно». Так появляются проверенные наблюдения.</li>' +
        '<li><b>3. Смотрите.</b> Пульс, календарь, карта и утренний отчёт собираются из вашего журнала сами.</li></ol>' +
        '<div class="row"><button class="btn primary" id="obOk">Понятно</button></div>';
      grid.parentNode.insertBefore(ob, grid);
      $('#obOk').addEventListener('click', function () { markSeen(); ob.remove(); });
    } else if (!show && ob) ob.remove();

    hoursCard();
    var from = Date.now() - 7 * 864e5, list = S.get().dets.filter(function (d) { return d.status !== 'rejected' && +new Date(d.ts) >= from && S.threatOf(d); })
      .sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    var tc = $('#threatCard');
    if (!list.length) { if (tc) tc.remove(); return; }
    if (!tc) {
      tc = document.createElement('div'); tc.id = 'threatCard'; tc.className = 'card threats';
      var recent = $('#recent'); var host = recent.closest('.card'); host.parentNode.insertBefore(tc, host);
    }
    tc.innerHTML = '<h2>Тревоги за 7 дней: ' + list.length + '</h2><ul class="list">' + list.slice(0, 5).map(function (d) {
      var t = S.threatOf(d);
      return '<li><span class="dotk alert"></span><span class="nm">' + THREAT[t.kind] + ' ' + Math.round(t.score * 100) + '%' + (d.demo ? '<span class="badge">демо</span>' : '') + '<small>' + esc(d.station || '') + '</small></span><span class="tm">' + A.fmtDT(d.ts) + '</span></li>';
    }).join('') + '</ul><p class="hint">Это подсказка модели YAMNet по звуку, а не доказательство. Прослушайте запись, прежде чем принимать меры.</p>';
  }

  /* ---------- activity by hour (dawn chorus) ---------- */
  function hoursCard() {
    var host = $('#pulseBars').closest('.card'), from = Date.now() - 7 * 864e5, h = [], i, tot = 0, mx = 0, peak = 0;
    for (i = 0; i < 24; i++) h.push(0);
    S.get().dets.forEach(function (d) { if (d.status === 'rejected') return; var t = new Date(d.ts); if (+t < from) return; h[t.getHours()]++; tot++; });
    var card = $('#hoursCard');
    if (!tot) { if (card) card.remove(); return; }
    h.forEach(function (n, k) { if (n > mx) { mx = n; peak = k; } });
    if (!card) { card = document.createElement('div'); card.id = 'hoursCard'; card.className = 'card'; host.parentNode.insertBefore(card, host.nextSibling); }
    var pad = function (n) { return ('0' + n).slice(-2); };
    card.innerHTML = '<h2>Активность по часам</h2><div class="hours" role="img" aria-label="Число событий по часам суток">' +
      h.map(function (n, k) { return '<i class="' + (k === peak ? 'pk' : '') + '" style="--h:' + Math.round(n / mx * 100) + '%" title="' + pad(k) + ':00, событий: ' + n + '"></i>'; }).join('') +
      '</div><div class="hours-ax"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>' +
      '<p class="hint">За 7 дней. Пик активности: ' + pad(peak) + ':00 до ' + pad((peak + 1) % 24) + ':00. Утренний хор птиц обычно виден как высокий пик на рассвете.</p>';
  }

  /* ---------- life list: every species you have confirmed ---------- */
  function lifeCard() {
    var view = $('#v-calendar'), m = {};
    S.get().dets.forEach(function (d) {
      if (d.status !== 'confirmed' || !d.species) return;
      var t = +new Date(d.ts), r = m[d.species] || (m[d.species] = { id: d.species, first: t, last: t, n: 0, ref: 0 });
      if (t < r.first) r.first = t; if (t > r.last) r.last = t; r.n++; if (S.level(d) === 'reference') r.ref++;
    });
    var list = Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return b.n - a.n; });
    var card = $('#lifeCard');
    if (!card) { card = document.createElement('div'); card.id = 'lifeCard'; card.className = 'card'; view.appendChild(card); }
    var known = S.SPECIES.length, seen = list.filter(function (r) { return S.species[r.id]; }).length;
    card.innerHTML = '<h2>Список видов</h2><p class="hint">Все виды, которые вы подтвердили. В справочнике Коргальжына: ' + seen + ' из ' + known + '.</p>' +
      '<div class="bar" style="grid-template-columns:1fr 60px"><i style="--w:' + Math.round(seen / known * 100) + '%"></i><em>' + seen + '/' + known + '</em></div>' +
      (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Вид</th><th>Впервые</th><th>Событий</th></tr></thead><tbody>' + list.map(function (r) {
        var s = S.species[r.id];
        return '<tr><td>' + esc(spName(r.id)) + (r.ref ? ' <span class="badge ok">эталон ' + r.ref + '</span>' : '') + (s ? '<small>' + esc(s.lat) + '</small>' : '<small>вид из ваших образцов</small>') + '</td><td>' + A.fmtD(new Date(r.first)) + '</td><td>' + r.n + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="hint">Пока пусто.</p>');
  }

  /* ---------- map ---------- */
  var map = null, layer = null;
  function renderMap() {
    var box = $('#map');
    if (!window.L) { box.innerHTML = '<p class="hint" style="padding:16px">Карта не загрузилась.</p>'; return; }
    if (!map) {
      map = L.map(box, { zoomControl: true, worldCopyJump: true }).setView([50.6, 69.0], 9);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
      layer = L.layerGroup().addTo(map);
      $('#mapPeriod').addEventListener('change', drawMap);
    }
    setTimeout(function () { map.invalidateSize(); drawMap(); }, 60);
  }
  function drawMap() {
    layer.clearLayers();
    var days = +$('#mapPeriod').value, from = days ? Date.now() - days * 864e5 : 0;
    var st = S.stationStats(from), pts = [];
    st.forEach(function (s) {
      var r = 9 + Math.min(22, Math.sqrt(s.n) * 2.6), top = Object.keys(s.species).sort(function (a, b) { return s.species[b] - s.species[a]; }).slice(0, 3);
      var m = L.circleMarker([s.lat, s.lon], { radius: r, color: s.threats ? '#C2362F' : '#1F5BFF', weight: 2, fillColor: s.threats ? '#C2362F' : '#1F5BFF', fillOpacity: .3 });
      var pop = document.createElement('div');
      var b = document.createElement('b'); b.textContent = s.name + (s.demo ? ' (демо)' : ''); pop.appendChild(b);
      var l1 = document.createElement('div'); l1.textContent = s.n + ' ' + plural(s.n, 'событие', 'события', 'событий'); pop.appendChild(l1);
      if (top.length) { var l2 = document.createElement('div'); l2.textContent = top.map(function (id) { return spName(id) + ' ' + s.species[id]; }).join(', '); pop.appendChild(l2); }
      if (s.threats) { var l3 = document.createElement('div'); l3.textContent = 'Возможных тревог: ' + s.threats; l3.style.color = '#C2362F'; pop.appendChild(l3); }
      m.bindPopup(pop); m.addTo(layer); pts.push([s.lat, s.lon]);
    });
    var total = st.reduce(function (a, s) { return a + s.n; }, 0);
    $('#mapInfo').textContent = st.length ? 'Станций: ' + st.length + ', событий: ' + total : 'Нет станций с координатами за этот период. Укажите координаты в разделе «Данные».';
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 }); else if (pts.length === 1) map.setView(pts[0], 11); else map.setView([50.6, 69.0], 9);
  }

  /* ---------- morning report ---------- */
  var hrs = 24, lastText = '';
  function dayStr(ms) { var d = new Date(ms), M = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']; return d.getDate() + ' ' + M[d.getMonth()] + ' ' + d.getFullYear(); }
  function buildReport() {
    var r = S.report(hrs), L = [], H = [], period = hrs === 24 ? 'за сутки' : 'за 7 дней';
    L.push('WetlandEar. Утро в заповеднике, ' + dayStr(r.to) + ' (' + period + ')');
    H.push('<h2>Утро в заповеднике</h2><p class="meta">' + dayStr(r.to) + ', ' + period + '</p>');
    if (r.demo) { L.push('ВНИМАНИЕ: в отчёт попали ДЕМО-данные.'); H.push('<p class="warn">В отчёт попали демо-данные. Это не реальные наблюдения.</p>'); }
    if (r.pulse) {
      var d = r.prev ? r.pulse.score - r.prev.score : null, tr = d == null ? '' : d === 0 ? ', без изменений' : (d > 0 ? ', на ' + d + ' выше' : ', на ' + (-d) + ' ниже') + ' предыдущего периода';
      L.push('Пульс: ' + r.pulse.score + ' из 100' + tr); H.push('<div class="rep-pulse"><b>' + r.pulse.score + '</b><span>пульс заповедника' + esc(tr) + '</span></div>');
    } else { L.push('Пульс: нет данных за период.'); H.push('<p>Пульс: нет данных за период.</p>'); }
    L.push('События: ' + r.events + ', из них подтверждено человеком: ' + r.confirmed);
    H.push('<p><b>' + r.events + '</b> ' + plural(r.events, 'событие', 'события', 'событий') + ', подтверждено человеком: <b>' + r.confirmed + '</b>.</p>');
    if (r.species.length) {
      var sp = r.species.slice(0, 8).map(function (s) { return spName(s.id) + ' ' + s.n; });
      L.push('Кто пел: ' + sp.join(', ')); H.push('<h3>Кто пел</h3><p>' + esc(sp.join(', ')) + '.</p>');
    } else { L.push('Кто пел: подтверждённых видов нет.'); H.push('<h3>Кто пел</h3><p>Подтверждённых видов за период нет.</p>'); }
    if (r.fresh.length) {
      var fr = r.fresh.map(spName); L.push('Первые обнаружения: ' + fr.join(', ')); H.push('<h3>Новое</h3><p>Первое обнаружение: <b>' + esc(fr.join(', ')) + '</b>.</p>');
    } else { L.push('Новых видов нет.'); H.push('<h3>Новое</h3><p>Новых видов нет.</p>'); }
    if (r.threats.length) {
      var th = r.threats.slice(0, 5).map(function (d) { var t = S.threatOf(d); return THREAT[t.kind] + ' ' + Math.round(t.score * 100) + '%, ' + (d.station || 'станция') + ', ' + A.fmtDT(d.ts); });
      L.push('Тревоги (подсказка модели, проверьте запись): ' + th.join('; ')); H.push('<h3 class="bad">Тревоги: ' + r.threats.length + '</h3><ul>' + th.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p class="hint">Это подсказка модели YAMNet, прослушайте запись.</p>');
    } else { L.push('Тревог нет.'); H.push('<h3>Тревоги</h3><p>Тревог нет.</p>'); }
    if (r.silent.length) { L.push('Молчат станции: ' + r.silent.join(', ')); H.push('<h3>Молчат станции</h3><p>' + esc(r.silent.join(', ')) + '. Стоит проверить питание и связь.</p>'); }
    L.push('Виды подсказывает BirdNET, подтверждает человек. app.wetlandear.tech');
    H.push('<p class="hint foot">Виды подсказывает модель BirdNET, подтверждает человек. app.wetlandear.tech</p>');
    lastText = L.join('\n');
    $('#reportPaper').innerHTML = H.join('');
    $('#repTg').href = 'https://t.me/share/url?url=' + encodeURIComponent('https://app.wetlandear.tech') + '&text=' + encodeURIComponent(lastText);
    $('#repShare').hidden = !navigator.share;
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('.seg button'); if (!b || !b.dataset.h) return;
    hrs = +b.dataset.h; [].forEach.call(b.parentNode.children, function (x) { x.classList.toggle('on', x === b); }); buildReport();
  });
  $('#repCopy').addEventListener('click', function () {
    var done = function () { A.toast('Текст отчёта скопирован'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(lastText).then(done, function () { A.toast('Не удалось скопировать'); }); else A.toast('Копирование недоступно в этом браузере');
  });
  $('#repShare').addEventListener('click', function () { navigator.share({ title: 'WetlandEar', text: lastText }).catch(function () { }); });
  $('#repPrint').addEventListener('click', function () { window.print(); });

  /* ---------- install button ---------- */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; $('#installCard').hidden = false; });
  $('#installBtn').addEventListener('click', function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.then(function () { deferred = null; $('#installCard').hidden = true; }); });
  window.addEventListener('appinstalled', function () { $('#installCard').hidden = true; });

  function onShow(view) {
    if (view === 'calendar') lifeCard();
    if (view === 'map') renderMap();
    if (view === 'report') buildReport();
  }
  window.WEX = { onShow: onShow, afterPulse: afterPulse };
  A.show((location.hash || '#pulse').slice(1));
})();
