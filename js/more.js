/* WetlandEar App: seasons and years, PDF report for a reserve, teams. Everything is computed on the device from the journal. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc;
  function lang() { return window.WEi18n ? window.WEi18n.lang : 'ru'; }
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  var MON = { ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'], kk: ['қаң', 'ақп', 'нау', 'сәу', 'мам', 'мау', 'шіл', 'там', 'қыр', 'қаз', 'қар', 'жел'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
  function refresh() { A.refreshChrome(); A.show(A.current()); }
  function p2(n) { return ('0' + n).slice(-2); }
  function dm(ms) { var d = new Date(ms); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1); }
  function sname(id) { return A.spName ? A.spName(id) : S.nameOf(id); }
  function live() { return S.get().dets.filter(function (d) { return d.status !== 'rejected'; }); }
  function doy(ms) { var d = new Date(ms), s = new Date(d.getFullYear(), 0, 0); return Math.floor((d - s) / 864e5); }
  function shade(n, max) { return 'style="--a:' + (n ? (0.12 + 0.88 * n / max).toFixed(2) : 0) + '"'; }

  /* ---------- seasons and years (calendar screen) ---------- */
  function renderSeasons() {
    var box = $('#seasonsCard'); if (!box) return;
    var dets = live(), yrs = {};
    dets.forEach(function (d) { yrs[new Date(d.ts).getFullYear()] = 1; });
    var years = Object.keys(yrs).map(Number).sort(function (a, b) { return b - a; }).slice(0, 4).reverse();
    if (!years.length) { box.hidden = true; return; }
    box.hidden = false;
    var ev = {}, sp = {}, mx = 1, mxs = 1;
    years.forEach(function (y) { ev[y] = new Array(12).fill(0); sp[y] = []; for (var i = 0; i < 12; i++) sp[y].push({}); });
    dets.forEach(function (d) {
      var t = new Date(d.ts), y = t.getFullYear(); if (!ev[y]) return;
      ev[y][t.getMonth()]++; if (d.status === 'confirmed' && d.species) sp[y][t.getMonth()][d.species] = 1;
    });
    years.forEach(function (y) { ev[y].forEach(function (n) { if (n > mx) mx = n; }); sp[y].forEach(function (o) { var n = Object.keys(o).length; if (n > mxs) mxs = n; }); });
    var head = '<tr><th></th>' + ((MON[lang()] || MON.ru) || MON.ru).map(function (m) { return '<th>' + m + '</th>'; }).join('') + '</tr>';
    var t1 = '<table class="sz">' + head + years.map(function (y) { return '<tr><th>' + y + '</th>' + ev[y].map(function (n) { return '<td ' + shade(n, mx) + '>' + (n || '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    var t2 = '<table class="sz">' + head + years.map(function (y) { return '<tr><th>' + y + '</th>' + sp[y].map(function (o) { var n = Object.keys(o).length; return '<td ' + shade(n, mxs) + '>' + (n || '') + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    /* first arrival per species per year, confirmed observations only */
    var first = {}, cnt = {};
    dets.forEach(function (d) {
      if (d.status !== 'confirmed' || !d.species) return;
      var ms = +new Date(d.ts), y = new Date(ms).getFullYear(); if (!ev[y]) return;
      cnt[d.species] = (cnt[d.species] || 0) + 1; var f = first[d.species] = first[d.species] || {}; if (!f[y] || ms < f[y]) f[y] = ms;
    });
    var ids = Object.keys(first).sort(function (a, b) { return cnt[b] - cnt[a]; }).slice(0, 30);
    var t3 = '';
    if (ids.length) {
      var ly = years[years.length - 1], py = years.length > 1 ? years[years.length - 2] : null;
      t3 = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(L('Вид', 'Species')) + '</th>' + years.map(function (y) { return '<th>' + y + '</th>'; }).join('') + (py ? '<th>' + esc(L('Сдвиг', 'Shift')) + '</th>' : '') + '</tr></thead><tbody>' +
        ids.map(function (id) {
          var f = first[id], shift = '';
          if (py && f[ly] && f[py]) { var dd = doy(f[ly]) - doy(f[py]); shift = '<td class="' + (dd < 0 ? 'early' : dd > 0 ? 'late' : '') + '">' + (dd > 0 ? '+' : dd < 0 ? '−' : '') + Math.abs(dd) + ' ' + esc(L('дн', 'd')) + '</td>'; } else if (py) shift = '<td>–</td>';
          return '<tr data-sp="' + esc(id) + '"><td>' + esc(sname(id)) + '</td>' + years.map(function (y) { return '<td>' + (f[y] ? dm(f[y]) : '–') + '</td>'; }).join('') + shift + '</tr>';
        }).join('') + '</tbody></table></div><p class="hint">' + esc(L('Дата первой подтверждённой встречи вида в году. Сдвиг: на сколько дней раньше (−) или позже (+) вид появился, чем в прошлом году.', 'Date of the first confirmed record of a species in a year. Shift: how many days earlier (−) or later (+) than the year before.')) + '</p>';
    }
    /* activity by hour, per season of the year */
    var SE = [[L('Зима', 'Winter'), [11, 0, 1]], [L('Весна', 'Spring'), [2, 3, 4]], [L('Лето', 'Summer'), [5, 6, 7]], [L('Осень', 'Autumn'), [8, 9, 10]]];
    var hs = SE.map(function (s) { var h = new Array(24).fill(0); dets.forEach(function (d) { var t = new Date(d.ts); if (s[1].indexOf(t.getMonth()) >= 0) h[t.getHours()]++; }); return h; });
    var hm = 1; hs.forEach(function (h) { h.forEach(function (n) { if (n > hm) hm = n; }); });
    var t4 = '<div class="hs">' + SE.map(function (s, i) { return '<div class="hs-row"><span>' + esc(s[0]) + '</span><div>' + hs[i].map(function (n, k) { return '<i ' + shade(n, hm) + ' title="' + p2(k) + ':00 · ' + n + '"></i>'; }).join('') + '</div></div>'; }).join('') + '<div class="hs-ax"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>';
    box.innerHTML = '<h2>' + esc(L('Сезоны и годы', 'Seasons and years')) + '</h2>' +
      '<h3>' + esc(L('События по месяцам', 'Events per month')) + '</h3>' + t1 +
      '<h3>' + esc(L('Подтверждённые виды по месяцам', 'Confirmed species per month')) + '</h3>' + t2 +
      '<h3>' + esc(L('Первые прилёты по годам', 'First arrivals by year')) + '</h3>' + (t3 || '<p class="hint">' + esc(L('Появятся, когда вы подтвердите виды.', 'They appear when you confirm species.')) + '</p>') +
      '<h3>' + esc(L('Активность по часам и сезонам', 'Activity by hour and season')) + '</h3>' + t4;
  }

  /* ---------- PDF report ---------- */
  function svgBars(vals, w, h) {
    var mx = Math.max.apply(null, vals.concat([1])), bw = w / vals.length;
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" role="img">' + vals.map(function (v, i) { var bh = Math.round(v / mx * (h - 16)); return '<rect x="' + (i * bw + 0.5).toFixed(1) + '" y="' + (h - 14 - bh) + '" width="' + Math.max(1, bw - 1).toFixed(1) + '" height="' + bh + '" fill="#2F6FED"/>'; }).join('') + '<line x1="0" y1="' + (h - 13) + '" x2="' + w + '" y2="' + (h - 13) + '" stroke="#9fb4d9"/></svg>';
  }
  function svgMap(st) {
    var pts = st.filter(function (s) { return s.lat != null && s.lon != null; });
    if (!pts.length) return '';
    var la = pts.map(function (s) { return s.lat; }), lo = pts.map(function (s) { return s.lon; });
    var a0 = Math.min.apply(null, la), a1 = Math.max.apply(null, la), o0 = Math.min.apply(null, lo), o1 = Math.max.apply(null, lo), W = 520, H = 220, pad = 36;
    var sx = function (x) { return o1 === o0 ? W / 2 : pad + (x - o0) / (o1 - o0) * (W - 2 * pad); }, sy = function (y) { return a1 === a0 ? H / 2 : H - pad - (y - a0) / (a1 - a0) * (H - 2 * pad); };
    var mx = Math.max.apply(null, pts.map(function (s) { return s.n; }).concat([1]));
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="background:#f3f7fe;border:1px solid #cfdcf3;border-radius:8px">' + pts.map(function (s) {
      var r = 5 + 14 * Math.sqrt(s.n / mx); return '<circle cx="' + sx(s.lon).toFixed(1) + '" cy="' + sy(s.lat).toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#2F6FED" fill-opacity=".55" stroke="#2F6FED"/><text x="' + (sx(s.lon) + r + 3).toFixed(1) + '" y="' + (sy(s.lat) + 4).toFixed(1) + '" font-size="11" fill="#14233F">' + esc(s.name) + '</text>'; }).join('') + '</svg>';
  }
  function buildPdf(profile) {
    var from = new Date($('#pdfFrom').value + 'T00:00:00'), to = new Date($('#pdfTo').value + 'T23:59:59');
    var dets = live().filter(function (d) { var t = +new Date(d.ts); return t >= +from && t <= +to; });
    var conf = dets.filter(function (d) { return d.status === 'confirmed' && d.species; });
    var spp = {}; conf.forEach(function (d) { var r = spp[d.species] = spp[d.species] || { n: 0, first: Infinity, last: 0, st: {} }; var t = +new Date(d.ts); r.n++; r.first = Math.min(r.first, t); r.last = Math.max(r.last, t); r.st[d.station || '–'] = 1; });
    var ids = Object.keys(spp).sort(function (a, b) { return spp[b].n - spp[a].n; });
    var days = Math.max(1, Math.round((+to - +from) / 864e5)), step = days > 120 ? 7 : 1, nb = Math.ceil(days / step), bars = new Array(nb).fill(0);
    dets.forEach(function (d) { var i = Math.min(nb - 1, Math.floor((+new Date(d.ts) - +from) / 864e5 / step)); if (i >= 0) bars[i]++; });
    var stn = {}; dets.forEach(function (d) { var k = d.station || '–', r = stn[k] = stn[k] || { name: k, n: 0, lat: null, lon: null }; r.n++; if (d.lat != null && d.lon != null) { r.lat = d.lat; r.lon = d.lon; } });
    var sts = Object.keys(stn).map(function (k) { return stn[k]; }).sort(function (a, b) { return b.n - a.n; });
    var thr = dets.filter(function (d) { return S.threatOf(d); }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    var pulse = dets.length ? Math.round(Math.min(ids.length / 10, 1) * 40 + Math.min(dets.length / 60, 1) * 30 + conf.length / dets.length * 30) : null;
    var fmt = function (d) { return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear(); };
    var latin = function (id) { var s = S.species[id]; return s ? s.lat : ''; };
    var who = [profile.display_name, profile.organization].filter(Boolean).join(', ');
    var kind = { gun: L('Возможный выстрел', 'Possible gunshot'), engine: L('Шум двигателя', 'Engine noise') };
    var h = '<div class="pdf-head"><div><h1>' + esc(L('Отчёт о наблюдениях', 'Observation report')) + '</h1><p>' + fmt(from) + ' – ' + fmt(to) + '</p>' + (who ? '<p>' + esc(who) + '</p>' : '') + '</div><div class="pdf-brand">WetlandEar</div></div>' +
      '<div class="pdf-nums"><div><b>' + dets.length + '</b><span>' + esc(L('событий', 'events')) + '</span></div><div><b>' + conf.length + '</b><span>' + esc(L('подтверждено человеком', 'confirmed by a person')) + '</span></div><div><b>' + ids.length + '</b><span>' + esc(L('видов', 'species')) + '</span></div><div><b>' + sts.length + '</b><span>' + esc(L('станций', 'stations')) + '</span></div><div><b>' + (pulse == null ? '–' : pulse) + '</b><span>' + esc(L('пульс из 100', 'pulse of 100')) + '</span></div></div>' +
      '<h2>' + esc(step > 1 ? L('События по неделям', 'Events per week') : L('События по дням', 'Events per day')) + '</h2>' + svgBars(bars, 520, 110) +
      '<h2>' + esc(L('Виды, подтверждённые человеком', 'Species confirmed by a person')) + '</h2>' +
      (ids.length ? '<table class="pdf-t"><thead><tr><th>' + esc(L('Вид', 'Species')) + '</th><th>' + esc(L('Латинское название', 'Scientific name')) + '</th><th>' + esc(L('Событий', 'Events')) + '</th><th>' + esc(L('Впервые', 'First')) + '</th><th>' + esc(L('Последний раз', 'Last')) + '</th></tr></thead><tbody>' +
        ids.slice(0, 80).map(function (id) { var r = spp[id]; return '<tr><td>' + esc(sname(id)) + '</td><td><i>' + esc(latin(id)) + '</i></td><td>' + r.n + '</td><td>' + dm(r.first) + '</td><td>' + dm(r.last) + '</td></tr>'; }).join('') + '</tbody></table>' : '<p>' + esc(L('Подтверждённых видов за период нет.', 'No confirmed species in this period.')) + '</p>') +
      '<h2>' + esc(L('Станции', 'Stations')) + '</h2>' + svgMap(sts) +
      '<table class="pdf-t"><thead><tr><th>' + esc(L('Станция', 'Station')) + '</th><th>' + esc(L('Событий', 'Events')) + '</th><th>' + esc(L('Координаты', 'Coordinates')) + '</th></tr></thead><tbody>' +
      sts.map(function (s) { return '<tr><td>' + esc(s.name) + '</td><td>' + s.n + '</td><td>' + (s.lat != null ? s.lat.toFixed(4) + ', ' + s.lon.toFixed(4) : '–') + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h2>' + esc(L('Тревоги', 'Alerts')) + ': ' + thr.length + '</h2>' +
      (thr.length ? '<table class="pdf-t"><tbody>' + thr.slice(0, 20).map(function (d) { var t = S.threatOf(d); return '<tr><td>' + fmt(new Date(d.ts)) + ' ' + p2(new Date(d.ts).getHours()) + ':' + p2(new Date(d.ts).getMinutes()) + '</td><td>' + esc(kind[t.kind]) + ' ' + Math.round(t.score * 100) + '%</td><td>' + esc(d.station || '') + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      '<p class="pdf-foot">' + esc(L('Виды подсказывает модель (BirdNET и собственная модель WetlandEar), в таблицы попадают только виды, подтверждённые человеком. Тревоги - подсказки модели, а не доказательство. Точность модели: wetlandear.tech/metrics. Сформировано ', 'Species are suggested by a model (BirdNET and the WetlandEar model); only species confirmed by a person are listed. Alerts are model hints, not proof. Model accuracy: wetlandear.tech/metrics. Generated ')) + fmt(new Date()) + '.</p>';
    $('#pdfPaper').innerHTML = h;
  }
  function initPdf() {
    var go = $('#pdfGo'); if (!go) return;
    var to = new Date(), from = new Date(Date.now() - 30 * 864e5), iso = function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
    $('#pdfFrom').value = iso(from); $('#pdfTo').value = iso(to);
    go.addEventListener('click', function () {
      if (!$('#pdfFrom').value || !$('#pdfTo').value) return;
      var pr = window.WESync && WESync.me() ? WESync.getProfile().catch(function () { return {}; }) : Promise.resolve({});
      pr.then(function (p) { buildPdf(p || {}); document.body.classList.add('pdf-mode'); setTimeout(function () { window.print(); }, 60); });
    });
    window.addEventListener('afterprint', function () { document.body.classList.remove('pdf-mode'); });
  }

  /* ---------- teams (profile screen) ---------- */
  var ROLE = function (r) { return { owner: L('владелец', 'owner'), editor: L('редактор', 'editor'), viewer: L('наблюдатель', 'viewer') }[r] || r; };
  function renderTeam() {
    var box = $('#teamBody'); if (!box || !window.WESync || !WESync.me()) return;
    var me = WESync.me().id;
    WESync.orgList().then(function (orgs) {
      var html = orgs.map(function (o) {
        return '<div class="org" data-o="' + esc(o.id) + '"><div class="row wrap"><b>' + esc(o.name) + '</b><span class="chip ok">' + esc(ROLE(o.role)) + '</span><span class="hint">' + o.members + ' ' + esc(L('участников', 'members')) + '</span></div>' +
          (o.join_code ? '<p class="hint">' + esc(L('Код для приглашения', 'Invite code')) + ': <b class="code-inline">' + esc(o.join_code) + '</b></p>' : '') +
          '<div class="people" id="pp-' + esc(o.id) + '"></div>' +
          '<div class="row wrap">' + (o.role === 'owner' ? '<button class="btn" data-a="code">' + esc(L('Новый код', 'New code')) + '</button><button class="btn no" data-a="del">' + esc(L('Удалить команду', 'Delete team')) + '</button>' : '') +
          '<button class="btn" data-a="leave">' + esc(L('Выйти из команды', 'Leave team')) + '</button></div></div>';
      }).join('');
      box.innerHTML = html + (orgs.length ? '<div class="row wrap"><button class="btn" id="auditBtn">' + esc(L('Журнал действий', 'Activity log')) + '</button></div><div id="auditBox" hidden></div>' : '') + '<div class="row wrap"><input id="orgName" maxlength="80" placeholder="' + esc(L('Название команды или заповедника', 'Team or reserve name')) + '"><button class="btn primary" id="orgNew">' + esc(L('Создать команду', 'Create team')) + '</button></div>' +
        '<div class="row wrap"><input id="orgCode" maxlength="20" placeholder="' + esc(L('Код приглашения', 'Invite code')) + '"><button class="btn" id="orgJoin">' + esc(L('Вступить по коду', 'Join with a code')) + '</button></div>';
      orgs.forEach(function (o) {
        WESync.orgPeople(o.id).then(function (ps) {
          var el = $('#pp-' + o.id); if (!el) return;
          el.innerHTML = ps.map(function (p) {
            var self = p.user_id === me;
            var sel = o.role === 'owner' ? '<select data-u="' + esc(p.user_id) + '">' + ['owner', 'editor', 'viewer'].map(function (r) { return '<option value="' + r + '"' + (r === p.role ? ' selected' : '') + '>' + esc(ROLE(r)) + '</option>'; }).join('') + '</select>' : '<span class="chip">' + esc(ROLE(p.role)) + '</span>';
            return '<div class="person"><span>' + esc(p.display_name) + (self ? ' (' + esc(L('вы', 'you')) + ')' : '') + '</span>' + sel + (o.role === 'owner' && !self ? '<button class="btn no" data-rm="' + esc(p.user_id) + '">' + esc(L('Убрать', 'Remove')) + '</button>' : '') + '</div>';
          }).join('');
          [].forEach.call(el.querySelectorAll('select[data-u]'), function (s) { s.addEventListener('change', function () { WESync.orgRole(o.id, s.dataset.u, s.value).then(renderTeam).catch(function () { A.toast(L('Не получилось. В команде должен остаться владелец.', 'Failed. A team must keep one owner.')); renderTeam(); }); }); });
          [].forEach.call(el.querySelectorAll('button[data-rm]'), function (b) { b.addEventListener('click', function () { if (confirm(L('Убрать участника из команды?', 'Remove this member from the team?'))) WESync.orgRemove(o.id, b.dataset.rm).then(renderTeam).catch(function () { A.toast(L('Не получилось', 'Failed')); }); }); });
        }).catch(function () { });
      });
      [].forEach.call(box.querySelectorAll('.org'), function (el) {
        var id = el.dataset.o;
        [].forEach.call(el.querySelectorAll('button[data-a]'), function (b) {
          b.addEventListener('click', function () {
            var a = b.dataset.a;
            if (a === 'code') WESync.orgCode(id).then(renderTeam).catch(function () { A.toast(L('Не получилось', 'Failed')); });
            if (a === 'leave' && confirm(L('Выйти из команды? Данные других участников исчезнут с этого устройства.', 'Leave the team? Other members\' data will disappear from this device.'))) WESync.orgRemove(id, me).then(function () { return WESync.syncNow(true); }).then(function () { renderTeam(); refresh(); }).catch(function () { A.toast(L('Не получилось. Передайте роль владельца другому участнику.', 'Failed. Hand the owner role to another member first.')); });
            if (a === 'del' && confirm(L('Удалить команду для всех? Личные журналы участников останутся у них.', 'Delete the team for everyone? Personal journals stay with their owners.'))) WESync.orgDelete(id).then(function () { return WESync.syncNow(true); }).then(renderTeam).catch(function () { A.toast(L('Не получилось', 'Failed')); });
          });
        });
      });
      $('#orgNew').addEventListener('click', function () { var n = $('#orgName').value.trim(); if (n.length < 2) return; WESync.orgCreate(n).then(renderTeam).catch(function () { A.toast(L('Не получилось создать команду', 'Could not create the team')); }); });
      $('#orgJoin').addEventListener('click', function () {
        var c = $('#orgCode').value.trim(); if (!c) return;
        WESync.orgJoin(c).then(function () { A.toast(L('Вы в команде. Загружаю общий журнал...', 'You joined. Loading the shared journal...')); return WESync.syncNow(false); }).then(function () { renderTeam(); refresh(); }).catch(function () { A.toast(L('Код не найден', 'Code not found')); });
      });
    }).catch(function () { box.innerHTML = '<p class="hint">' + esc(L('Команды пока недоступны: администратору нужно применить обновление базы данных.', 'Teams are not available yet: the administrator needs to apply the database update.')) + '</p>'; });
  }

  /* ---------- species card: photo and text from Wikipedia, your own records ---------- */
  function sciOf(id, dets) {
    var s = S.species[id]; if (s) return s.lat;
    var com = String(id).replace(/^x:/, ''); if (window.WE_SCI && window.WE_SCI[com]) return window.WE_SCI[com];
    for (var i = 0; i < dets.length; i++) { var g = dets[i].suggest; if (g && g.sci && S.sugId(g) === id) return g.sci; }
    return '';
  }
  function wiki(lng, title) {
    var key = 'we.wiki2.' + lng + '.' + title, hit = null;
    try { hit = JSON.parse(localStorage.getItem(key)); } catch (e) { }
    if (hit) return Promise.resolve(hit);
    return fetch('https://' + lng + '.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (!j || j.type === 'disambiguation' || !j.extract) return null;
        var o = { img: j.thumbnail && /^https:\/\/(upload|thumb)\.wikimedia\.org\//.test(j.thumbnail.source) ? j.thumbnail.source : '', text: j.extract, url: (j.content_urls && j.content_urls.desktop && j.content_urls.desktop.page) || '' };
        try { localStorage.setItem(key, JSON.stringify(o)); } catch (e) { }
        return o;
      }).catch(function () { return null; });
  }
  /* ---------- species passport: months, years, best samples to listen to, how well the model knows the species ---------- */
  var actx = null, sizes = null;
  function modelSize(sci) {
    if (sizes) return Promise.resolve(sizes[sci]);
    return fetch('models/data_size.json').then(function (r) { return r.json(); }).catch(function () { return {}; }).then(function (j) { sizes = j; return j[sci]; });
  }
  function playDet(id) {
    S.getClip(id).then(function (i16) {
      if (!i16) { A.toast(L('Для этого события нет аудиоклипа', 'This event has no audio clip')); return; }
      var f = new Float32Array(i16.length), i; for (i = 0; i < f.length; i++) f[i] = i16[i] / 32768;
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
      var b = actx.createBuffer(1, f.length, 22050); b.getChannelData(0).set(f);
      var src = actx.createBufferSource(); src.buffer = b; src.connect(actx.destination); src.start();
    });
  }
  function passportExtra(m, id, dets, sciName) {
    var box = $('#spMine', m); if (!box || !dets.length) return;
    var mon = new Array(12).fill(0), yrs = {}, mm = 1;
    dets.forEach(function (d) { var t = new Date(d.ts); mon[t.getMonth()]++; var y = yrs[t.getFullYear()] = yrs[t.getFullYear()] || { n: 0, a: +t, b: +t }; y.n++; if (+t < y.a) y.a = +t; if (+t > y.b) y.b = +t; });
    mon.forEach(function (n) { if (n > mm) mm = n; });
    var ML = (MON[lang()] || MON.ru);
    var months = '<h3>' + esc(L('По месяцам', 'By month')) + '</h3><div class="hours" style="height:54px">' + mon.map(function (n, k) { return '<i style="--h:' + Math.round(n / mm * 100) + '%" title="' + ML[k] + ' · ' + n + '"></i>'; }).join('') + '</div><div class="hours-ax mon-ax">' + [0, 3, 6, 9, 11].map(function (k) { return '<span>' + ML[k] + '</span>'; }).join('') + '</div>';
    var ys = Object.keys(yrs).sort().reverse().map(function (y) { return '<tr><td>' + y + '</td><td>' + dm(yrs[y].a) + ' – ' + dm(yrs[y].b) + '</td><td>' + yrs[y].n + '</td></tr>'; }).join('');
    var years = '<h3>' + esc(L('По годам', 'By year')) + '</h3><table class="tbl"><thead><tr><th>' + esc(L('Год', 'Year')) + '</th><th>' + esc(L('Первая – последняя встреча', 'First – last record')) + '</th><th>' + esc(L('Событий', 'Events')) + '</th></tr></thead><tbody>' + ys + '</tbody></table>';
    var best = dets.filter(function (d) { return d.clip; }).sort(function (a, b) {
      var ca = a.suggest && a.suggest.conf || 0, cb = b.suggest && b.suggest.conf || 0; return (cb - ca) || (b.snr - a.snr);
    }).slice(0, 3);
    var play = best.length ? '<h3>' + esc(L('Лучшие образцы голоса', 'Best samples of the voice')) + '</h3><div class="samples">' + best.map(function (d) {
      var t = new Date(d.ts); return '<button class="btn" data-play="' + esc(d.id) + '">▶ ' + dm(+t) + '.' + t.getFullYear() + ' · ' + esc(d.station || '–') + (d.suggest && d.suggest.conf ? ' · ' + Math.round(d.suggest.conf * 100) + '%' : '') + '</button>'; }).join('') + '</div>' : '';
    var ind = '<p class="sp-ind"><button class="btn" id="spInd"></button></p>';
    var know = '<p class="hint" id="spKnow"></p>';
    box.insertAdjacentHTML('beforeend', months + years + play + know + ind);
    box.addEventListener('click', function (e) { var b = e.target.closest('[data-play]'); if (b) playDet(b.getAttribute('data-play')); });
    var key = 'we.indicators', get = function () { try { return JSON.parse(localStorage.getItem(key)) || []; } catch (x) { return []; } };
    var upd = function () { $('#spInd', m).textContent = get().indexOf(id) >= 0 ? L('Убрать из индикаторных видов', 'Remove from indicator species') : L('Сделать индикаторным видом', 'Make an indicator species'); };
    upd(); $('#spInd', m).addEventListener('click', function () { var l = get(), i = l.indexOf(id); if (i >= 0) l.splice(i, 1); else if (l.length < 20) l.push(id); else { A.toast(L('Не больше 20 видов', 'No more than 20 species')); return; } try { localStorage.setItem(key, JSON.stringify(l)); } catch (x) { } upd(); if (window.WEScience && A.current() === 'science') WEScience.render(); });
    if (sciName) modelSize(sciName).then(function (n) {
      var el = $('#spKnow', m); if (!el) return;
      if (n == null) el.textContent = L('Модель WetlandEar этот вид специально не обучала: опирается на BirdNET.', 'The WetlandEar model was not trained on this species: it relies on BirdNET.');
      else el.textContent = L('Модель WetlandEar обучена на записях этого вида: ', 'The WetlandEar model was trained on recordings of this species: ') + n + (n < 15 ? L('. Это мало, поэтому проверяйте её ответы внимательнее.', '. That is few, so check its answers more carefully.') : '.');
    });
  }
  function closeCard() { var m = $('#spModal'); if (m) m.remove(); document.removeEventListener('keydown', escClose); }
  function escClose(e) { if (e.key === 'Escape') closeCard(); }
  function speciesCard(id) {
    closeCard();
    var dets = S.get().dets.filter(function (d) { return d.status === 'confirmed' && d.species === id; }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    var sci = sciOf(id, S.get().dets), s = S.species[id];
    var ru = s ? s.ru : (window.WE_RU && window.WE_RU[String(id).replace(/^x:/, '')]) || '', en = s ? s.en : String(id).replace(/^x:/, '');
    var stn = {}, hrs = new Array(24).fill(0);
    dets.forEach(function (d) { var k = d.station || '–'; stn[k] = (stn[k] || 0) + 1; hrs[new Date(d.ts).getHours()]++; });
    var hm = Math.max.apply(null, hrs.concat([1]));
    var m = document.createElement('div'); m.id = 'spModal'; m.className = 'modal'; m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
    m.innerHTML = '<div class="modal-box"><button class="modal-x" aria-label="' + esc(L('Закрыть', 'Close')) + '">×</button><div class="sp-photo" id="spPhoto"></div><h2>' + esc(sname(id)) + '</h2><p class="hint">' + esc([ru && lang() === 'en' ? ru : '', en && lang() === 'ru' ? en : '', sci ? sci : ''].filter(Boolean).join(' · ')) + '</p><p class="sp-text" id="spText"></p><div class="sp-mine" id="spMine"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.modal-x')) closeCard(); });
    document.addEventListener('keydown', escClose);
    var mine = dets.length ? '<h3>' + esc(L('Ваши наблюдения', 'Your records')) + '</h3><p>' + esc(L('Подтверждено событий', 'Confirmed events')) + ': <b>' + dets.length + '</b> · ' + esc(L('Впервые', 'First')) + ': ' + dm(+new Date(dets[dets.length - 1].ts)) + '.' + new Date(dets[dets.length - 1].ts).getFullYear() + ' · ' + esc(L('Последний раз', 'Last')) + ': ' + dm(+new Date(dets[0].ts)) + '.' + new Date(dets[0].ts).getFullYear() + '</p>' +
      '<p>' + esc(L('Станции', 'Stations')) + ': ' + Object.keys(stn).map(function (k) { return esc(k) + ' (' + stn[k] + ')'; }).join(', ') + '</p>' +
      '<div class="hours" style="height:54px">' + hrs.map(function (n, k) { return '<i style="--h:' + Math.round(n / hm * 100) + '%" title="' + p2(k) + ':00 · ' + n + '"></i>'; }).join('') + '</div><div class="hours-ax"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>' : '<p class="hint">' + esc(L('Подтверждённых наблюдений этого вида пока нет.', 'No confirmed records of this species yet.')) + '</p>';
    $('#spMine', m).innerHTML = mine;
    passportExtra(m, id, dets, sci);
    var lng = lang(), titles = [sci, en].filter(Boolean);
    var tryT = function (i) { if (i >= titles.length) return Promise.resolve(null); return wiki(lng, titles[i]).then(function (r) { return r || (lng === 'ru' ? wiki('en', titles[i]) : null) || null; }).then(function (r) { return r || tryT(i + 1); }); };
    tryT(0).then(function (r) {
      if (!$('#spModal')) return;
      if (!r) { $('#spText').textContent = L('Описание не нашлось.', 'No description found.'); return; }
      if (r.img) { var im = document.createElement('img'); im.alt = sname(id); im.src = r.img; im.referrerPolicy = 'no-referrer'; $('#spPhoto').appendChild(im); }
      $('#spText').textContent = r.text;
      if (r.url) { var a = document.createElement('a'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = L(' Википедия', ' Wikipedia'); $('#spText').appendChild(a); }
    });
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-sp]'); if (!el || e.target.closest('a,button,select,input')) return;
    speciesCard(el.getAttribute('data-sp'));
  });

  /* ---------- export for science: Darwin Core (GBIF) and eBird record format ---------- */
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function download(name, rows) {
    var blob = new Blob(['\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportScience(fmt) {
    var from = new Date($('#exFrom').value + 'T00:00:00'), to = new Date($('#exTo').value + 'T23:59:59'), blur = $('#exBlur').checked;
    var me = window.WESync && WESync.me(), who = (me && me.name) || '';
    var all = S.get().dets, dets = all.filter(function (d) { var t = +new Date(d.ts); return d.status === 'confirmed' && d.species && !d.demo && t >= +from && t <= +to; }).sort(function (a, b) { return a.ts < b.ts ? -1 : 1; });
    var sens = function (id) { return !!(window.WEPrivacy && WEPrivacy.on() && WEPrivacy.isSensitive(id)); };   /* sensitive species: coordinates rounded to 0.1 degree */
    var rnd = function (v, hide) { return v == null ? '' : (blur || hide ? Math.round(v * 10) / 10 : Math.round(v * 1e5) / 1e5); };
    var rows, skipped = 0, ok = 0;
    if (fmt === 'ebird') {
      rows = [['Common Name', 'Genus', 'Species', 'Number', 'Species Comments', 'Location Name', 'Latitude', 'Longitude', 'Date', 'Start Time', 'State/Province', 'Country Code', 'Protocol', 'Number of Observers', 'Duration (Min)', 'All Obs Reported (Y/N)', 'Distance Traveled (Miles)', 'Area Covered (Acres)', 'Breeding Code', 'Observation Details', 'Checklist Comments']];
      var g = {};
      dets.forEach(function (d) {
        var sci = sciOf(d.species, all); if (sci.indexOf(' ') < 0) { skipped++; return; }
        var t = new Date(d.ts), key = (d.station || 'WetlandEar station') + '|' + t.toDateString(), e = g[key] = g[key] || { st: d.station || 'WetlandEar station', d: t, lat: d.lat, lon: d.lon, sp: {}, sens: false }; if (sens(d.species)) e.sens = true;
        var s = e.sp[d.species] = e.sp[d.species] || { sci: sci, n: 0, time: p2(t.getHours()) + ':' + p2(t.getMinutes()) }; s.n++;
      });
      Object.keys(g).forEach(function (k) { var e = g[k]; Object.keys(e.sp).forEach(function (id) { var s = e.sp[id], parts = s.sci.split(' '); ok++;
        rows.push([S.species[id] ? S.species[id].en : String(id).replace(/^x:/, ''), parts[0], parts[1], 'X', 'Detected by passive acoustic monitoring, confirmed by a person (' + s.n + ' events)', e.st, rnd(e.lat, e.sens), rnd(e.lon, e.sens), p2(e.d.getMonth() + 1) + '/' + p2(e.d.getDate()) + '/' + e.d.getFullYear(), s.time, '', 'KZ', 'Incidental', 1, '', 'N', '', '', '', '', 'WetlandEar']); }); });
    } else {
      rows = [['occurrenceID', 'basisOfRecord', 'eventDate', 'scientificName', 'vernacularName', 'taxonRank', 'decimalLatitude', 'decimalLongitude', 'geodeticDatum', 'countryCode', 'recordedBy', 'identifiedBy', 'identificationVerificationStatus', 'samplingProtocol', 'occurrenceRemarks', 'locality', 'dateIdentified', 'informationWithheld']];
      dets.forEach(function (d) {
        var sci = sciOf(d.species, all); if (sci.indexOf(' ') < 0) { skipped++; return; }
        var sg = d.suggest, remark = sg ? 'Species suggested by the model (' + (sg.common || sg.sci || '') + ' ' + Math.round((sg.conf || 0) * 100) + '%) and confirmed by a person.' : 'Species identified by a person from a recorded sound.';
        ok++; rows.push(['wetlandear:' + d.id, 'HumanObservation', d.ts, sci, S.species[d.species] ? S.species[d.species].en : String(d.species).replace(/^x:/, ''), 'species', rnd(d.lat, sens(d.species)), rnd(d.lon, sens(d.species)), 'WGS84', 'KZ', who, who, 'verified by a person', 'passive acoustic monitoring, automated detection (BirdNET, WetlandEar model) with human verification', remark, d.station || '', d.reviewed || '', blur ? 'coordinates rounded to 0.1 degree' : '']);
      });
    }
    if (!ok) { A.toast(L('Нет подтверждённых видов за период', 'No confirmed species in this period')); return; }
    download('wetlandear-' + (fmt === 'ebird' ? 'ebird' : 'darwin-core') + '-' + $('#exFrom').value + '_' + $('#exTo').value + '.csv', rows);
    A.toast(L('Выгружено записей: ', 'Records exported: ') + ok + (skipped ? L('. Без латинского названия пропущено: ', '. Skipped without a scientific name: ') + skipped : ''));
  }
  function initExport() {
    if (!$('#exGbif')) return;
    var y = new Date().getFullYear(), iso = function (d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); };
    $('#exFrom').value = y + '-01-01'; $('#exTo').value = iso(new Date());
    $('#exGbif').addEventListener('click', function () { exportScience('dwc'); });
    $('#exEbird').addEventListener('click', function () { exportScience('ebird'); });
  }

  /* ---------- team audit log ---------- */
  function renderLog(box) {
    box.innerHTML = '<p class="hint">' + esc(L('Загружаю...', 'Loading...')) + '</p>';
    WESync.reviewLog().then(function (rows) {
      if (!rows.length) { box.innerHTML = '<p class="hint">' + esc(L('Журнал пока пуст. Он ведётся с момента обновления базы.', 'The log is empty so far. It records changes made after the database update.')) + '</p>'; return; }
      var act = function (r) {
        var sp = r.species ? sname(r.species) : '';
        if (r.action === 'confirmed') return r.prev_status === 'confirmed' && r.prev_species ? L('исправил(а) вид: ', 'corrected the species: ') + sname(r.prev_species) + ' → ' + sp : L('подтвердил(а): ', 'confirmed: ') + sp;
        if (r.action === 'rejected') return L('отклонил(а) событие', 'rejected an event');
        return L('вернул(а) событие на проверку', 'sent an event back to review');
      };
      var fmt = function (t) { var d = new Date(t); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };
      box.innerHTML = '<ul class="audit">' + rows.map(function (r) { return '<li><span class="t">' + esc(fmt(r.at)) + '</span> <b>' + esc(r.actor_name || '?') + '</b> ' + esc(act(r)) + (r.via === 'server' ? ' <span class="chip">' + esc(L('бот/ИИ', 'bot/AI')) + '</span>' : '') + '</li>'; }).join('') + '</ul><div class="row wrap"><button class="btn" id="auditCsv">' + esc(L('Скачать CSV', 'Download CSV')) + '</button></div>';
      $('#auditCsv', box).addEventListener('click', function () { download('wetlandear-review-log.csv', [['time', 'person', 'action', 'species', 'previous_status', 'previous_species', 'event_id', 'via']].concat(rows.map(function (r) { return [r.at, r.actor_name, r.action, r.species ? sname(r.species) : '', r.prev_status, r.prev_species ? sname(r.prev_species) : '', r.detection_id, r.via]; }))); });
    }).catch(function () { box.innerHTML = '<p class="hint">' + esc(L('Журнал пока недоступен: администратору нужно применить обновление базы данных.', 'The log is not available yet: the administrator needs to apply the database update.')) + '</p>'; });
  }
  function initAudit() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest('#auditBtn'); if (!b) return;
      var box = $('#auditBox'); box.hidden = !box.hidden; if (!box.hidden) renderLog(box);
    });
  }
  initExport(); initAudit();

  /* ---------- simpler navigation: sub-tabs of the Journal, "More" menu, back links, what to do next ---------- */
  var SUB = { log: ['log', 'calendar', 'map'] };
  function subLabel(v) { return { log: L('События', 'Events'), calendar: L('Календарь и сезоны', 'Calendar'), map: L('Карта', 'Map') }[v]; }
  function initNav() {
    ['log', 'calendar', 'map'].forEach(function (v) {
      var sec = document.getElementById('v-' + v); if (!sec || sec.querySelector('.subnav')) return;
      var bar = document.createElement('div'); bar.className = 'subnav seg'; bar.setAttribute('role', 'tablist');
      bar.innerHTML = ['log', 'calendar', 'map'].map(function (t) { return '<button role="tab" data-go2="' + t + '" data-sub="' + t + '">' + esc(subLabel(t)) + '</button>'; }).join('');
      sec.insertBefore(bar, sec.firstChild);
    });
    ['data', 'report', 'profile', 'voices', 'offline', 'science', 'manage'].forEach(function (v) {
      var sec = document.getElementById('v-' + v); if (!sec || sec.querySelector('.back-more')) return;
      var b = document.createElement('button'); b.className = 'link back-more no-print'; b.setAttribute('data-go2', 'more'); b.textContent = '← ' + L('Ещё', 'More');
      sec.insertBefore(b, sec.firstChild);
    });
    document.addEventListener('click', function (e) { var el = e.target.closest('[data-go2]'); if (el) { e.preventDefault(); A.show(el.getAttribute('data-go2')); } });
  }
  function syncNav(v) {
    [].forEach.call(document.querySelectorAll('.subnav button'), function (b) { var on = b.getAttribute('data-sub') === v; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.textContent = subLabel(b.getAttribute('data-sub')); });
    [].forEach.call(document.querySelectorAll('.back-more'), function (b) { b.textContent = '← ' + L('Ещё', 'More'); });
  }
  function todoCard() {
    var pulse = $('#v-pulse'); if (!pulse) return;
    var n = S.get().dets.filter(function (d) { return d.status === 'auto' && !d.demo; }).length;
    var has = S.get().dets.length > 0;
    var c = $('#todoCard');
    if (!c) { c = document.createElement('div'); c.id = 'todoCard'; c.className = 'card todo'; var hero = pulse.querySelector('.hero'); hero.parentNode.insertBefore(c, hero.nextSibling); }
    if (!n) { c.hidden = true; } else {
      c.hidden = false;
      c.innerHTML = '<div><b>' + esc(L('Ждут проверки', 'Waiting for review') + ': ' + n) + '</b><p>' + esc(L('Прослушайте и подтвердите вид. Так журнал становится надёжным, а модель учится.', 'Listen and confirm the species. This makes the journal reliable and teaches the model.')) + '</p></div><button class="btn primary" data-go2="review">' + esc(L('Проверить', 'Review')) + '</button>';
    }
    var demo = $('#demoOn'); if (demo) demo.hidden = has;   /* the demo button is only for an empty journal */
  }

  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) {
    if (prev) prev(v);
    syncNav(v);
    if (v === 'pulse') todoCard();
    if (v === 'calendar') renderSeasons();
    if (v === 'profile') renderTeam();
  };
  initPdf(); initNav();
  var prevAP = window.WEX && window.WEX.afterPulse;
  if (window.WEX) window.WEX.afterPulse = function () { if (prevAP) prevAP(); todoCard(); };
  window.WEMore = { renderSeasons: renderSeasons, renderTeam: renderTeam };
  (function () { var cur = A.current(); syncNav(cur); if (cur === 'pulse') todoCard(); if (cur === 'calendar') renderSeasons(); if (cur === 'profile') renderTeam(); })();
})();
