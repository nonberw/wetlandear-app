/* WetlandEar App: network of reserves. A reserve that joins publishes coarse weekly counts of the species it has CONFIRMED: the place is cut to a one-degree cell (about 110 km),
   there are no coordinates, names of stations or people, and rare or nest-sensitive species are dropped. Members see where a species is being heard right now in the network
   ("cranes are already 300 km away") and when it was first heard. Needs sign-in and supabase/009_guard_and_network.sql. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc;
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  function signed() { return !!(window.WESync && WESync.me()); }
  function p2(n) { return ('0' + n).slice(-2); }
  function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function weekOf(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); }
  function sciOf(id) { return window.WEPrivacy ? WEPrivacy.sciOf(id) : ''; }
  function sname(id) { return A.spName ? A.spName(id) : S.nameOf(id); }
  function km(lat1, lon1, lat2, lon2) { var r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(a)); }
  var map = null, demo = false, sel = '';

  /* the picture of this reserve: confirmed events grouped by species, week and station place */
  function mine() {
    var g = {}; S.get().dets.forEach(function (d) {
      if (d.status !== 'confirmed' || !d.species || d.demo || d.lat == null) return;
      var sci = sciOf(d.species); if (!sci || sci.indexOf(' ') < 0) return; if (window.WEPrivacy && WEPrivacy.isSensitive(d.species)) return;
      var wk = weekOf(d.ts), k = sci + '|' + wk + '|' + d.lat.toFixed(3) + '|' + d.lon.toFixed(3), day = iso(new Date(d.ts));
      var r = g[k] = g[k] || { species: sci, week: wk, lat: d.lat, lon: d.lon, n: 0, first: day, last: day }; r.n++; if (day < r.first) r.first = day; if (day > r.last) r.last = day;
    });
    return Object.keys(g).map(function (k) { return g[k]; });
  }
  function myPlace() { var s = S.get().station; if (s && s.lat != null) return [s.lat, s.lon]; var d = S.get().dets.filter(function (x) { return x.lat != null && !x.demo; })[0]; return d ? [d.lat, d.lon] : null; }
  var DEMO = function () {
    var out = [], sp = ['Grus grus', 'Anser anser', 'Cygnus cygnus', 'Fulica atra', 'Alauda arvensis', 'Vanellus vanellus'], cells = [[51.5, 68.5], [50.5, 70.5], [52.5, 66.5], [49.5, 72.5], [51.5, 72.5]], now = Date.now();
    sp.forEach(function (s, i) { cells.forEach(function (c, j) { for (var w = 0; w < 6; w++) { if ((i + j + w) % 3 === 0) continue; var d = new Date(now - (w * 7 + j * 3 + i) * 864e5); out.push({ species: s, cell_lat: c[0], cell_lon: c[1], week: weekOf(d), n: 2 + ((i * 7 + j * 5 + w * 3) % 20), owners: 1 + (j % 3), first_day: iso(new Date(+d - 3 * 864e5)), last_day: iso(d) }); } }); });
    return out;
  };

  function render() {
    var box = $('#netCard'); if (!box) return;
    var head = '<h2>' + esc(L('Сеть заповедников', 'Network of reserves')) + '</h2><p class="hint">' + esc(L('Участники делятся недельными счётами подтверждённых видов и видят, где сейчас слышны птицы у соседей: «журавли уже в 300 км, ждите». Место округляется до клетки в один градус (около 110 км), координат, названий станций и людей нет, редкие виды не передаются.', 'Members share weekly counts of confirmed species and see where birds are being heard at their neighbours: "cranes are already 300 km away, expect them". The place is rounded to a one-degree cell (about 110 km); there are no coordinates, station names or people, and rare species are not shared.')) + '</p>';
    if (!signed()) { box.innerHTML = head + '<p class="hint">' + esc(L('Войдите через Google, чтобы пользоваться сетью.', 'Sign in with Google to use the network.')) + '</p>'; return; }
    box.innerHTML = head + '<p class="hint">' + esc(L('Загружаю…', 'Loading…')) + '</p>';
    WESync.from('network_members').select('enabled,updated_at').eq('owner', WESync.userId()).maybeSingle().then(function (r) {
      if (r.error) throw r.error; var on = !!(r.data && r.data.enabled), upd = r.data && r.data.updated_at;
      box.innerHTML = head + '<label class="chk"><input type="checkbox" id="netOn"' + (on ? ' checked' : '') + '> ' + esc(L('Участвовать в сети заповедников', 'Take part in the network of reserves')) + '</label>' +
        (on ? '<div class="mg-row"><button class="btn primary" id="netPub">' + esc(L('Обновить мои данные в сети', 'Update my data in the network')) + '</button><span class="hint">' + (upd ? esc(L('Последнее обновление: ', 'Last update: ')) + esc(new Date(upd).toLocaleString()) : '') + '</span></div><p class="hint" id="netMsg" role="status"></p><div id="netView"></div>' : '<p class="hint">' + esc(L('Включите участие, и вы увидите данные других участников. Отключить и удалить свои данные можно в любой момент.', 'Switch participation on to see the data of the other members. You can switch it off and remove your data at any time.')) + '</p>');
      $('#netOn', box).addEventListener('change', function () {
        var v = this.checked, cb = this;
        var q = WESync.from('network_members').upsert({ owner: WESync.userId(), enabled: v, updated_at: new Date().toISOString() }, { onConflict: 'owner' });
        q.then(function (x) { if (x.error) throw x.error; if (!v) return WESync.from('network_obs').delete().eq('owner', WESync.userId()); }).then(function () { render(); }).catch(function () { cb.checked = !v; A.toast(L('Не удалось сохранить', 'Could not save')); });
      });
      if (on) { $('#netPub', box).addEventListener('click', publish); view(); }
    }).catch(function (e) { if (window.console) console.warn('network card:', e); box.innerHTML = head + '<p class="hint">' + esc(/relation|does not exist|schema cache|permission|function/i.test(String(e.message || e)) ? L('Раздел станет доступен после обновления базы данных (файл supabase/009_guard_and_network.sql).', 'This section becomes available after the database update (file supabase/009_guard_and_network.sql).') : L('Не удалось загрузить.', 'Could not load.')) + '</p>'; });
  }
  function publish() {
    var b = this, rows = mine(), m = $('#netMsg'); b.disabled = true; m.textContent = '';
    if (!rows.length) { m.textContent = L('Пока нет подтверждённых событий с координатами: подтвердите несколько видов в журнале.', 'There are no confirmed events with coordinates yet: confirm a few species in the journal.'); b.disabled = false; return; }
    WESync.rpc('network_publish', { p: rows.map(function (r) { return { species: r.species, week: r.week, lat: r.lat, lon: r.lon, n: r.n, first: r.first, last: r.last }; }) })
      .then(function (n) { m.textContent = L('Передано записей: ', 'Records shared: ') + n + L('. Редкие виды отфильтрованы.', '. Rare species were filtered out.'); view(); })
      .catch(function () { m.textContent = L('Не удалось передать данные.', 'Could not share the data.'); }).then(function () { b.disabled = false; });
  }
  function view() {
    var box = $('#netView'); if (!box) return;
    Promise.all([WESync.rpc('network_view', { p_days: 120 }), WESync.rpc('network_stats')]).then(function (res) {
      var data = res[0] || [], st = (res[1] || [])[0] || { members: 0 };
      if (st.members < 2 && !demo) {
        box.innerHTML = '<p><b>' + esc(L('Пока в сети только ', 'So far the network has only ')) + st.members + esc(L(' участник.', ' member.')) + '</b> ' + esc(L('Данные других заповедников появятся, когда они присоединятся.', 'The data of other reserves will appear when they join.')) + '</p><div class="mg-row"><button class="btn" id="netDemo">' + esc(L('Показать пример на демонстрационных данных', 'Show an example with demonstration data')) + '</button></div>'; $('#netDemo', box).addEventListener('click', function () { demo = true; view(); }); return;
      }
      if (demo) data = DEMO();
      var me = myPlace(), now = Date.now(), seen = {}; S.get().dets.forEach(function (d) { if (d.status === 'confirmed' && d.species && !d.demo && +new Date(d.ts) > now - 60 * 864e5) seen[sciOf(d.species)] = 1; });
      var by = {}; data.forEach(function (r) { var x = by[r.species] = by[r.species] || { sp: r.species, n: 0, cells: {}, first: r.first_day, last: r.last_day }; x.n += +r.n; if (r.first_day < x.first) x.first = r.first_day; if (r.last_day > x.last) x.last = r.last_day; var k = r.cell_lat + '|' + r.cell_lon, c = x.cells[k] = x.cells[k] || { lat: r.cell_lat, lon: r.cell_lon, n: 0, last: r.last_day, first: r.first_day }; c.n += +r.n; if (r.last_day > c.last) c.last = r.last_day; if (r.first_day < c.first) c.first = r.first_day; });
      var list = Object.keys(by).map(function (k) { var x = by[k]; x.dist = me ? Math.min.apply(null, Object.keys(x.cells).map(function (c) { return km(me[0], me[1], x.cells[c].lat, x.cells[c].lon); })) : null; return x; });
      var fresh = list.filter(function (x) { return +new Date(x.last) > now - 14 * 864e5; }).sort(function (a, b) { return (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist); });
      var h = (demo ? '<p class="hint">' + esc(L('Демонстрационные данные, это не настоящая сеть.', 'Demonstration data, this is not the real network.')) + '</p>' : '<p class="hint">' + esc(L('Участников в сети: ', 'Members in the network: ')) + st.members + '</p>') +
        '<h3>' + esc(L('Что слышно в сети за последние 2 недели', 'What the network heard in the last 2 weeks')) + '</h3>' +
        (fresh.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(L('Вид', 'Species')) + '</th><th>' + esc(L('Событий', 'Events')) + '</th><th>' + esc(L('Ближайшая клетка', 'Nearest cell')) + '</th><th>' + esc(L('У вас', 'At your station')) + '</th></tr></thead><tbody>' + fresh.slice(0, 12).map(function (x) {
          var nm = (window.WE_RU && WEi18n && WEi18n.lang !== 'en' && (Object.keys(window.WE_SCI || {}).filter(function (e) { return window.WE_SCI[e] === x.sp; })[0] || '') && window.WE_RU[Object.keys(window.WE_SCI).filter(function (e) { return window.WE_SCI[e] === x.sp; })[0]]) || x.sp;
          return '<tr data-net="' + esc(x.sp) + '"><td>' + esc(nm) + '<small>' + esc(x.sp) + '</small></td><td>' + x.n + '</td><td>' + (x.dist != null ? Math.round(x.dist) + ' ' + esc(L('км', 'km')) : '–') + '</td><td>' + (seen[x.sp] ? esc(L('уже отмечен', 'already recorded')) : '<b>' + esc(L('ещё нет: ждите', 'not yet: expect it')) + '</b>') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="hint">' + esc(L('За две недели в сети нет новых подтверждений.', 'No new confirmations in the network in two weeks.')) + '</p>') +
        '<h3>' + esc(L('Карта клеток', 'Map of cells')) + '</h3><div class="mg-row"><select id="netSp" aria-label="' + esc(L('Вид', 'Species')) + '">' + list.sort(function (a, b) { return b.n - a.n; }).map(function (x) { return '<option value="' + esc(x.sp) + '"' + (x.sp === sel ? ' selected' : '') + '>' + esc(x.sp) + ' (' + x.n + ')</option>'; }).join('') + '</select></div><div id="netMap" class="gmap"></div>';
      box.innerHTML = h; var sp = $('#netSp', box); if (sp) { if (!sel) sel = sp.value; sp.value = sel; sp.addEventListener('change', function () { sel = sp.value; drawMap(by[sel], me); }); drawMap(by[sel] || by[sp.value], me); }
      box.onclick = function (e) { var tr = e.target.closest('tr[data-net]'); if (tr && sp) { sel = tr.getAttribute('data-net'); sp.value = sel; drawMap(by[sel], me); } };
    }).catch(function () { box.innerHTML = '<p class="hint">' + esc(L('Не удалось загрузить данные сети. Возможно, вы ещё не участник.', 'Could not load the network data. You may not be a member yet.')) + '</p>'; });
  }
  function drawMap(x, me) {
    var el = $('#netMap'); if (!el || !x) return; var LF = window.L; if (!LF || !LF.map) { el.innerHTML = '<p class="hint" style="padding:12px">' + esc(L('Карта не загрузилась.', 'The map did not load.')) + '</p>'; return; }
    if (map) { map.remove(); map = null; }
    map = LF.map(el).setView(me || [50.6, 69], 5); LF.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12, attribution: '&copy; OpenStreetMap' }).addTo(map);
    var pts = []; Object.keys(x.cells).forEach(function (k) { var c = x.cells[k], recent = +new Date(c.last) > Date.now() - 14 * 864e5; pts.push([c.lat, c.lon]); LF.rectangle([[c.lat - .5, c.lon - .5], [c.lat + .5, c.lon + .5]], { color: recent ? '#1F5BFF' : '#8AA4D6', weight: 1, fillOpacity: recent ? .35 : .18 }).addTo(map).bindTooltip(c.n + ' · ' + c.first + ' → ' + c.last); });
    if (me) { LF.circleMarker(me, { radius: 7, color: '#14804A', fillColor: '#14804A', fillOpacity: .9 }).addTo(map).bindTooltip(L('Вы', 'You')); pts.push(me); }
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 7 }); setTimeout(function () { if (map) map.invalidateSize(); }, 250);
  }

  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) { if (prev) prev(v); if (v === 'manage') render(); };
  if (window.WESync) WESync.onChange(function () { if (A.current() === 'manage') render(); });
  window.WENetwork = { render: render, mine: mine };
})();
