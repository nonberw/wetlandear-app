/* WetlandEar App: map, morning report, threat list, first-run guide, install button. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc, plural = A.plural, spName = A.spName;
  var T = function (s, v) { return window.WEi18n ? window.WEi18n.t(s, v) : s; };
  var T = function (s, v) { return window.WEi18n ? window.WEi18n.t(s, v) : s; };
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
    tc.innerHTML = '<h2>' + esc(T('Тревоги за 7 дней: {n}', { n: list.length })) + '</h2><ul class="list">' + list.slice(0, 5).map(function (d) {
      var t = S.threatOf(d);
      return '<li><span class="dotk alert"></span><span class="nm">' + esc(T(THREAT[t.kind])) + ' ' + Math.round(t.score * 100) + '%' + (d.demo ? '<span class="badge">демо</span>' : '') + '<small>' + esc(T(d.station || '')) + '</small></span><span class="tm">' + A.fmtDT(d.ts) + '</span></li>';
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
      h.map(function (n, k) { return '<i class="' + (k === peak ? 'pk' : '') + '" style="--h:' + Math.round(n / mx * 100) + '%" title="' + pad(k) + ':00, ' + esc(T('событий')) + ': ' + n + '"></i>'; }).join('') +
      '</div><div class="hours-ax"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>' +
      '<p class="hint">' + esc(T('За 7 дней. Пик активности: {a}:00 до {b}:00. Утренний хор птиц обычно виден как высокий пик на рассвете.', { a: pad(peak), b: pad((peak + 1) % 24) })) + '</p>';
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
    card.innerHTML = '<h2>Список видов</h2><p class="hint">' + esc(T('Все виды, которые вы подтвердили. В справочнике Коргальжына: {a} из {b}.', { a: seen, b: known })) + '</p>' +
      '<div class="bar" style="grid-template-columns:1fr 60px"><i style="--w:' + Math.round(seen / known * 100) + '%"></i><em>' + seen + '/' + known + '</em></div>' +
      (list.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Вид</th><th>Впервые</th><th>Событий</th></tr></thead><tbody>' + list.map(function (r) {
        var s = S.species[r.id];
        return '<tr><td>' + esc(spName(r.id)) + (r.ref ? ' <span class="badge ok">' + esc(T('эталон')) + ' ' + r.ref + '</span>' : '') + (s ? '<small>' + esc(s.lat) + '</small>' : '<small>вид из ваших образцов</small>') + '</td><td>' + A.fmtD(new Date(r.first)) + '</td><td>' + r.n + '</td></tr>';
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
      var b = document.createElement('b'); b.textContent = T(s.name) + (s.demo ? ' (' + T('демо') + ')' : ''); pop.appendChild(b);
      var l1 = document.createElement('div'); l1.textContent = s.n + ' ' + plural(s.n, 'событие', 'события', 'событий'); pop.appendChild(l1);
      if (top.length) { var l2 = document.createElement('div'); l2.textContent = top.map(function (id) { return spName(id) + ' ' + s.species[id]; }).join(', '); pop.appendChild(l2); }
      if (s.threats) { var l3 = document.createElement('div'); l3.textContent = T('Возможных тревог: {n}', { n: s.threats }); l3.style.color = '#C2362F'; pop.appendChild(l3); }
      m.bindPopup(pop); m.addTo(layer); pts.push([s.lat, s.lon]);
    });
    var total = st.reduce(function (a, s) { return a + s.n; }, 0);
    $('#mapInfo').textContent = st.length ? T('Станций: {a}, событий: {b}', { a: st.length, b: total }) : T('Нет станций с координатами за этот период. Укажите координаты в разделе «Данные».');
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 12 }); else if (pts.length === 1) map.setView(pts[0], 11); else map.setView([50.6, 69.0], 9);
  }

  /* ---------- morning report ---------- */
  var hrs = 24, lastText = '';
  var MONTHS = { ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
  function dayStr(ms) { var d = new Date(ms), l = window.WEi18n ? window.WEi18n.lang : 'ru'; return l === 'en' ? MONTHS.en[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() : d.getDate() + ' ' + MONTHS.ru[d.getMonth()] + ' ' + d.getFullYear(); }
  function buildReport() {
    var r = S.report(hrs), L = [], H = [], period = T(hrs === 24 ? 'за сутки' : 'за 7 дней'), nm = function (id) { return spName(id); };
    L.push('WetlandEar. ' + T('Утро в заповеднике') + ', ' + dayStr(r.to) + ' (' + period + ')');
    H.push('<h2>' + esc(T('Утро в заповеднике')) + '</h2><p class="meta">' + esc(dayStr(r.to) + ', ' + period) + '</p>');
    if (r.demo) { L.push(T('ВНИМАНИЕ: в отчёт попали ДЕМО-данные.')); H.push('<p class="warn">' + esc(T('В отчёт попали демо-данные. Это не реальные наблюдения.')) + '</p>'); }
    if (r.pulse) {
      var d = r.prev ? r.pulse.score - r.prev.score : null, tr = d == null ? '' : d === 0 ? ', ' + T('без изменений') : ', ' + T(d > 0 ? 'на {n} выше предыдущего периода' : 'на {n} ниже предыдущего периода', { n: Math.abs(d) });
      L.push(T('Пульс: {n} из 100', { n: r.pulse.score }) + tr);
      H.push('<div class="rep-pulse"><b>' + r.pulse.score + '</b><span>' + esc(T('пульс заповедника') + tr) + '</span></div>');
    } else { L.push(T('Пульс: нет данных за период.')); H.push('<p>' + esc(T('Пульс: нет данных за период.')) + '</p>'); }
    L.push(T('События: {a}, из них подтверждено человеком: {b}', { a: r.events, b: r.confirmed }));
    H.push('<p>' + esc(T('События: {a}, из них подтверждено человеком: {b}', { a: r.events, b: r.confirmed })) + '</p>');
    if (r.species.length) {
      var sp = r.species.slice(0, 8).map(function (s) { return nm(s.id) + ' ' + s.n; });
      L.push(T('Кто пел') + ': ' + sp.join(', ')); H.push('<h3>' + esc(T('Кто пел')) + '</h3><p>' + esc(sp.join(', ')) + '.</p>');
    } else { L.push(T('Кто пел: подтверждённых видов нет.')); H.push('<h3>' + esc(T('Кто пел')) + '</h3><p>' + esc(T('Подтверждённых видов за период нет.')) + '</p>'); }
    if (r.fresh.length) {
      var fr = r.fresh.map(nm); L.push(T('Первые обнаружения') + ': ' + fr.join(', ')); H.push('<h3>' + esc(T('Новое')) + '</h3><p>' + esc(T('Первое обнаружение')) + ': <b>' + esc(fr.join(', ')) + '</b>.</p>');
    } else { L.push(T('Новых видов нет.')); H.push('<h3>' + esc(T('Новое')) + '</h3><p>' + esc(T('Новых видов нет.')) + '</p>'); }
    if (r.threats.length) {
      var th = r.threats.slice(0, 5).map(function (d) { var t = S.threatOf(d); return T(THREAT[t.kind]) + ' ' + Math.round(t.score * 100) + '%, ' + T(d.station || 'станция') + ', ' + A.fmtDT(d.ts); });
      L.push(T('Тревоги (подсказка модели, проверьте запись)') + ': ' + th.join('; '));
      H.push('<h3 class="bad">' + esc(T('Тревоги: {n}', { n: r.threats.length })) + '</h3><ul>' + th.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><p class="hint">' + esc(T('Это подсказка модели YAMNet, прослушайте запись.')) + '</p>');
    } else { L.push(T('Тревог нет.')); H.push('<h3>' + esc(T('Тревоги')) + '</h3><p>' + esc(T('Тревог нет.')) + '</p>'); }
    if (r.silent.length) { L.push(T('Молчат станции') + ': ' + r.silent.map(function (x) { return T(x); }).join(', ')); H.push('<h3>' + esc(T('Молчат станции')) + '</h3><p>' + esc(r.silent.map(function (x) { return T(x); }).join(', ')) + '. ' + esc(T('Стоит проверить питание и связь.')) + '</p>'); }
    L.push(T('Виды подсказывает BirdNET, подтверждает человек.') + ' app.wetlandear.tech');
    H.push('<p class="hint foot">' + esc(T('Виды подсказывает модель BirdNET, подтверждает человек.')) + ' app.wetlandear.tech</p>');
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

  /* ---------- journal: search, filter, listen, fix ---------- */
  var T = function (s, v) { return window.WEi18n ? window.WEi18n.t(s, v) : s; };
  var PL = function (n, ru, en) { return window.WEi18n ? window.WEi18n.pl(n, ru, en) : ru[2]; };
  var logF = 'all', logPage = 40, logOpen = {}, logInit = false, logTimer = 0, actx = null;
  function pad2(n) { return ('0' + n).slice(-2); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function byId(id) { return S.get().dets.filter(function (d) { return d.id === id; })[0]; }
  function hay(d) {
    var sp = S.species[d.species], dt = new Date(d.ts), st = ({ confirmed: 'подтверждено confirmed', auto: 'ждёт проверки pending', rejected: 'отклонено ошибка rejected' })[d.status] || '';
    var parts = [d.species ? S.nameOf(d.species) : '', sp ? sp.ru + ' ' + sp.en + ' ' + sp.lat : '', d.suggest ? (d.suggest.common || '') + ' ' + (d.suggest.sci || '') : '', d.station || '', st,
      pad2(dt.getDate()) + '.' + pad2(dt.getMonth() + 1) + '.' + dt.getFullYear(), pad2(dt.getDate()) + '.' + pad2(dt.getMonth() + 1), dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate()),
      S.threatOf(d) ? 'тревога alert выстрел gunshot двигатель engine' : '', d.demo ? 'демо demo' : ''];
    return parts.join(' ').toLowerCase();
  }
  function logFiltered() {
    var q = $('#logQ').value.trim().toLowerCase(), sp = $('#logSp').value, days = +$('#logPeriod').value, from = days ? Date.now() - days * 864e5 : 0;
    return S.get().dets.filter(function (d) {
      if (+new Date(d.ts) < from) return false;
      if (sp && d.species !== sp) return false;
      if (logF === 'confirmed' && d.status !== 'confirmed') return false;
      if (logF === 'model' && d.status !== 'auto') return false;
      if (logF === 'rejected' && d.status !== 'rejected') return false;
      if (logF === 'threat' && !(S.threatOf(d) && d.status !== 'rejected')) return false;
      return !q || hay(d).indexOf(q) >= 0;
    }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
  }
  function logSpecies() {
    var sel = $('#logSp'), cur = sel.value, seen = {}, ids = [];
    S.get().dets.forEach(function (d) { if (d.species && !seen[d.species]) { seen[d.species] = 1; ids.push(d.species); } });
    ids.sort(function (a, b) { return S.nameOf(a).localeCompare(S.nameOf(b)); });
    sel.innerHTML = '<option value="">' + esc(T('Все виды')) + '</option>' + ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(S.nameOf(id)) + '</option>'; }).join('');
    sel.value = seen[cur] ? cur : '';
  }
  function logRow(d) {
    var name = d.species ? S.nameOf(d.species) : T('Звуковое событие'), open = logOpen[d.id];
    var meta = A.fmtDT(d.ts) + ' · ' + T(d.station || '') + ' · ' + (d.fLow / 1000).toFixed(1) + '–' + (d.fHigh / 1000).toFixed(1) + ' ' + T('кГц') + ' · +' + d.snr + ' ' + T('дБ');
    var more = '';
    if (open) {
      var sugg = d.suggest ? '<div class="hint">' + esc(T('Модель')) + ': ' + esc(S.sugName(d.suggest)) + ' ' + Math.round(d.suggest.conf * 100) + '%' + (d.suggest.own ? ' ★' : '') + '</div>' : '';
      more = '<div class="lg-more">' + sugg + A.sndHtml(d) + '<select data-a="sp" aria-label="' + esc(T('Вид')) + '"></select>' +
        '<div class="row"><button class="btn primary sm" data-a="yes">' + esc(T('Верно')) + '</button><button class="btn no sm" data-a="no">' + esc(T('Ошибка')) + '</button>' +
        (d.status !== 'auto' ? '<button class="btn sm" data-a="back">' + esc(T('Вернуть в очередь')) + '</button>' : '') + '</div></div>';
    }
    return '<li class="lg" data-id="' + esc(d.id) + '"><div class="lg-head"><span class="dotk ' + d.status + '"></span><div class="lg-t"><b>' + esc(name) + '</b> ' + (d.demo ? '<span class="badge">' + esc(T('демо')) + '</span>' : '') + A.lvlBadge(d, true) +
      '<div class="lg-m">' + esc(meta) + '</div></div><div class="lg-act"><button class="btn sm" data-a="play" aria-label="' + esc(T('Слушать')) + '">▶</button><button class="btn sm" data-a="more">' + esc(open ? T('Свернуть') : T('Подробнее')) + '</button></div></div>' + more + '</li>';
  }
  function renderLog() {
    var list = logFiltered(), shown = list.slice(0, logPage), ul = $('#logList');
    $('#logCount').textContent = T('Найдено: {n}', { n: list.length });
    ul.innerHTML = shown.length ? shown.map(logRow).join('') : '<li class="card empty"><b>' + esc(T('Ничего не найдено')) + '</b><p>' + esc(T('Измените поиск или фильтры.')) + '</p></li>';
    $('#logMore').hidden = list.length <= logPage;
    $$('#logList .lg-more select').forEach(function (sel) {
      var d = byId(sel.closest('.lg').dataset.id); A.speciesOptions(sel, true);
      var cur = d.species || (d.suggest && S.sugId(d.suggest)) || '';
      if (cur && !sel.querySelector('option[value="' + cur.replace(/"/g, '') + '"]')) { var o = document.createElement('option'); o.value = cur; o.textContent = S.nameOf(cur); sel.insertBefore(o, sel.lastChild); }
      sel.value = cur;
    });
  }
  function playClip(d) {
    S.getClip(d.id).then(function (i16) {
      if (!i16) { A.toast(T('Для этого события нет аудиоклипа')); return; }
      var f = new Float32Array(i16.length), i; for (i = 0; i < f.length; i++) f[i] = i16[i] / 32768;
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
      var b = actx.createBuffer(1, f.length, 22050); b.getChannelData(0).set(f);
      var src = actx.createBufferSource(); src.buffer = b; src.connect(actx.destination); src.start();
    });
  }
  /* ask the journal (Claude, answers only from a summary of your own journal) */
  function askRun(q) {
    var out = $('#askOut'), btn = $('#askBtn'); q = (q || '').trim();
    if (q.length < 3) { A.toast(T('Напишите вопрос')); return; }
    if (!window.WESync || !WESync.token()) { out.hidden = false; out.textContent = T('Войдите через Google, чтобы задавать вопросы журналу.'); return; }
    out.hidden = false; out.textContent = T('Думаю...'); btn.disabled = true;
    fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + WESync.token() }, body: JSON.stringify({ question: q, lang: window.WEi18n ? window.WEi18n.lang : 'ru' }) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (r) {
        if (r.s === 200) { out.innerHTML = ''; var p = document.createElement('div'); p.className = 'ask-a'; p.textContent = r.j.answer; var h = document.createElement('div'); h.className = 'hint'; h.textContent = T('Ответ даёт ИИ по сводке вашего журнала. Важные цифры проверьте в списке ниже.'); out.appendChild(p); out.appendChild(h); }
        else if (r.s === 503) out.textContent = T('Эта функция ещё не включена администратором.');
        else if (r.s === 429) out.textContent = T('На сегодня лимит вопросов исчерпан. Попробуйте завтра.');
        else out.textContent = T('Не удалось получить ответ. Попробуйте ещё раз.');
      }).catch(function () { out.textContent = T('Не удалось получить ответ. Попробуйте ещё раз.'); }).then(function () { btn.disabled = false; });
  }
  function initLog() {
    if (logInit) return; logInit = true;
    $('#askBtn').addEventListener('click', function () { askRun($('#askQ').value); });
    $('#askQ').addEventListener('keydown', function (e) { if (e.key === 'Enter') askRun(this.value); });
    $('#askChips').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; $('#askQ').value = b.textContent; askRun(b.textContent); });
    $('#logQ').addEventListener('input', function () { clearTimeout(logTimer); logTimer = setTimeout(function () { logPage = 40; renderLog(); }, 150); });
    $('#logChips').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return; logF = b.dataset.f; logPage = 40;
      [].forEach.call(b.parentNode.children, function (x) { x.classList.toggle('on', x === b); }); renderLog();
    });
    ['#logSp', '#logPeriod'].forEach(function (id) { $(id).addEventListener('change', function () { logPage = 40; renderLog(); }); });
    $('#logMore').addEventListener('click', function () { logPage += 40; renderLog(); });
    $('#logCsv').addEventListener('click', function () {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([S.exportRows(logFiltered())], { type: 'text/csv;charset=utf-8' }));
      a.download = 'wetlandear-journal.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });
    $('#logList').addEventListener('click', function (e) {
      var li = e.target.closest('.lg'), b = e.target.closest('button'); if (!li || !b) return;
      var d = byId(li.dataset.id), a = b.dataset.a; if (!d) return;
      if (a === 'play') return playClip(d);
      if (a === 'more') { logOpen[d.id] = !logOpen[d.id]; return renderLog(); }
      if (a === 'yes') {
        var sel = $('select', li), v = sel.value;
        if (v === '__other') { var nm = (prompt(T('Название вида')) || '').trim().slice(0, 60); if (!nm) return; v = 'x:' + nm; }
        if (!v) { A.toast(T('Сначала выберите вид')); sel.focus(); return; }
        S.setStatus(d.id, 'confirmed', v); A.toast(T('Подтверждено'));
      }
      if (a === 'no') S.setStatus(d.id, 'rejected', null);
      if (a === 'back') S.setStatus(d.id, 'auto', null);
      A.refreshChrome(); renderLog();
    });
  }

  function onShow(view) {
    if (view === 'calendar') lifeCard();
    if (view === 'log') { initLog(); logSpecies(); renderLog(); }
    if (view === 'map') renderMap();
    if (view === 'report') buildReport();
  }
  window.WEX = { onShow: onShow, afterPulse: afterPulse };
  A.show((location.hash || '#pulse').slice(1));
})();
