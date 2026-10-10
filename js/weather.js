/* WetlandEar App: weather next to bird activity. Weather comes from Open-Meteo (free, no key); activity from your own journal and recording hours. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc, days = 30, busy = false;
  function lang() { return window.WEi18n ? window.WEi18n.lang : 'ru'; }
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  function pad(n) { return ('0' + n).slice(-2); }

  function where() {
    var st = S.get().station || {};
    if (st.lat != null && st.lon != null) return { lat: +st.lat, lon: +st.lon, name: st.name };
    var pts = S.get().dets.filter(function (d) { return d.lat != null && d.lon != null && !d.demo; });
    if (!pts.length) return null;
    return { lat: pts.reduce(function (a, d) { return a + d.lat; }, 0) / pts.length, lon: pts.reduce(function (a, d) { return a + d.lon; }, 0) / pts.length };
  }
  function fetchWeather(w, n) {
    var key = 'we.wx.' + w.lat.toFixed(2) + ',' + w.lon.toFixed(2) + ',' + n, hit = null;
    try { hit = JSON.parse(sessionStorage.getItem(key)); } catch (e) { }
    if (hit && Date.now() - hit.t < 36e5) return Promise.resolve(hit.d);
    var u = 'https://api.open-meteo.com/v1/forecast?latitude=' + w.lat.toFixed(3) + '&longitude=' + w.lon.toFixed(3) + '&hourly=temperature_2m,wind_speed_10m,surface_pressure,precipitation&past_days=' + n + '&forecast_days=1&timezone=auto&wind_speed_unit=ms';
    return fetch(u).then(function (r) { if (!r.ok) throw new Error('wx'); return r.json(); }).then(function (d) { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: d })); } catch (e) { } return d; });
  }
  /* local hour key "YYYY-MM-DDTHH" in the place's time zone */
  function slotOf(ms, off) { return new Date(ms + off * 1000).toISOString().slice(0, 13); }

  function analyse(wx, n) {
    var off = wx.utc_offset_seconds || 0, h = wx.hourly, slots = {}, dayAgg = {};
    h.time.forEach(function (t, i) { var k = t.slice(0, 13); slots[k] = { t: h.temperature_2m[i], w: h.wind_speed_10m[i], p: h.surface_pressure[i], rain: h.precipitation[i], ev: 0, rec: 0 }; });
    var from = Date.now() - n * 864e5;
    S.get().dets.forEach(function (d) { if (d.status === 'rejected') return; var ms = +new Date(d.ts); if (ms < from) return; var s = slots[slotOf(ms, off)]; if (s) s.ev++; });
    S.get().recs.forEach(function (r) {   /* recorded time per hour */
      var a = +new Date(r.start), b = a + (r.dur || 0) * 1000; if (!a || b < from) return;
      for (var t = a; t < b;) { var next = Math.min(b, (Math.floor((t + off * 1000) / 36e5) + 1) * 36e5 - off * 1000), s = slots[slotOf(t, off)]; if (s) s.rec += (next - t) / 36e5; t = next; }
    });
    Object.keys(slots).forEach(function (k) { var s = slots[k], dk = k.slice(0, 10), d = dayAgg[dk] || (dayAgg[dk] = { ev: 0, rec: 0, t: [], w: [], p: [] }); d.ev += s.ev; d.rec += s.rec; if (s.t != null) d.t.push(s.t); if (s.w != null) d.w.push(s.w); if (s.p != null) d.p.push(s.p); });
    return { slots: slots, days: dayAgg };
  }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function pearson(x, y) {
    var n = x.length; if (n < 6) return null; var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); syy += (y[i] - my) * (y[i] - my); }
    return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
  }
  function buckets(slots, key, edges, names) {
    var out = names.map(function (n) { return { name: n, ev: 0, rec: 0 }; });
    Object.keys(slots).forEach(function (k) { var s = slots[k]; if (s[key] == null || s.rec <= 0) return; var i = 0; while (i < edges.length && s[key] >= edges[i]) i++; out[i].ev += s.ev; out[i].rec += s.rec; });
    return out;
  }
  function barsHtml(rows) {
    var rates = rows.map(function (r) { return r.rec >= .5 ? r.ev / r.rec : null; }), mx = Math.max.apply(null, rates.filter(function (x) { return x != null; }).concat([0.001]));
    return '<div class="wxb">' + rows.map(function (r, i) {
      return '<div class="wxr"><span>' + esc(r.name) + '</span><div class="b"><i style="--w:' + (rates[i] == null ? 0 : Math.round(rates[i] / mx * 100)) + '%"></i></div><em>' + (rates[i] == null ? esc(L('мало записей', 'little data')) : rates[i].toFixed(1) + ' ' + esc(L('соб./ч', 'ev/h')) + ' · ' + r.rec.toFixed(1) + ' ' + esc(L('ч', 'h'))) + '</em></div>';
    }).join('') + '</div>';
  }
  function chart(dayKeys, dayAgg) {
    var W = 600, H = 170, pl = 28, pr = 30, pt = 12, pb = 24, n = dayKeys.length, bw = (W - pl - pr) / n;
    var evs = dayKeys.map(function (k) { return dayAgg[k].ev; }), mx = Math.max.apply(null, evs.concat([1]));
    var temps = dayKeys.map(function (k) { return mean(dayAgg[k].t); }), tv = temps.filter(function (x) { return x != null; }), t0 = Math.min.apply(null, tv.concat([0])), t1 = Math.max.apply(null, tv.concat([1]));
    var sx = function (i) { return pl + i * bw + bw / 2; }, ty = function (t) { return pt + (H - pt - pb) * (1 - (t - t0) / (t1 - t0 || 1)); };
    var bars = evs.map(function (v, i) { var h = (H - pt - pb) * v / mx; return '<rect x="' + (pl + i * bw + 1).toFixed(1) + '" y="' + (H - pb - h).toFixed(1) + '" width="' + Math.max(1, bw - 2).toFixed(1) + '" height="' + h.toFixed(1) + '" fill="#9DB9FF"/>'; }).join('');
    var pts = temps.map(function (t, i) { return t == null ? null : sx(i).toFixed(1) + ',' + ty(t).toFixed(1); }).filter(Boolean).join(' ');
    var lbl = dayKeys.map(function (k, i) { return (i % Math.max(1, Math.floor(n / 6)) === 0) ? '<text x="' + sx(i).toFixed(1) + '" y="' + (H - 6) + '" font-size="10" fill="#6B7A99" text-anchor="middle">' + k.slice(8) + '.' + k.slice(5, 7) + '</text>' : ''; }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(L('События по дням и температура', 'Events per day and temperature')) + '">' + bars + '<polyline points="' + pts + '" fill="none" stroke="#1F5BFF" stroke-width="2" stroke-linejoin="round"/>' +
      '<text x="2" y="' + (pt + 8) + '" font-size="10" fill="#6B7A99">' + mx + '</text><text x="' + (W - 2) + '" y="' + (pt + 8) + '" font-size="10" fill="#1F5BFF" text-anchor="end">' + Math.round(t1) + '°</text><text x="' + (W - 2) + '" y="' + (H - pb) + '" font-size="10" fill="#1F5BFF" text-anchor="end">' + Math.round(t0) + '°</text>' + lbl + '</svg>';
  }
  function render() {
    var box = $('#weatherBody'); if (!box || busy) return;
    var w = where();
    if (!w) { box.innerHTML = '<p class="hint">' + esc(L('Укажите координаты станции в разделе «Станция и данные», и здесь появится погода.', 'Set the station coordinates under "Station and data" and the weather will appear here.')) + '</p>'; return; }
    if (!S.get().dets.some(function (d) { return d.status !== 'rejected'; })) { box.innerHTML = '<p class="hint">' + esc(L('Нужны события в журнале.', 'The journal needs events.')) + '</p>'; return; }
    busy = true; box.innerHTML = '<p class="hint">' + esc(L('Загружаю погоду...', 'Loading weather...')) + '</p>';
    fetchWeather(w, days).then(function (wx) {
      var a = analyse(wx, days), keys = Object.keys(a.days).sort().slice(-days);
      var pairs = keys.filter(function (k) { return a.days[k].rec >= .25 && a.days[k].t.length; });
      var r = pearson(pairs.map(function (k) { return mean(a.days[k].t); }), pairs.map(function (k) { return a.days[k].ev / a.days[k].rec; }));
      var interp = r == null ? L('Для вывода нужно хотя бы 6 дней с записями.', 'At least 6 days with recordings are needed for a conclusion.') :
        L('Связь с температурой: ' + (Math.abs(r) < .2 ? 'почти нет' : Math.abs(r) < .5 ? 'умеренная' : 'заметная') + ' (r = ' + r.toFixed(2) + ', дней: ' + pairs.length + '). Это не доказательство причины.', 'Link with temperature: ' + (Math.abs(r) < .2 ? 'almost none' : Math.abs(r) < .5 ? 'moderate' : 'noticeable') + ' (r = ' + r.toFixed(2) + ', days: ' + pairs.length + '). This is not proof of cause.');
      var wind = buckets(a.slots, 'w', [2, 4, 7], ['0–2 ' + L('м/с', 'm/s'), '2–4', '4–7', '7+']);
      var temp = buckets(a.slots, 't', [0, 10, 20], ['< 0°', '0–10°', '10–20°', '20°+']);
      var rain = buckets(a.slots, 'rain', [0.1], [L('без осадков', 'dry'), L('осадки', 'rain')]);
      box.innerHTML = '<div class="seg" role="group" id="wxDays"><button data-d="30" class="' + (days === 30 ? 'on' : '') + '">' + esc(L('30 дней', '30 days')) + '</button><button data-d="90" class="' + (days === 90 ? 'on' : '') + '">' + esc(L('90 дней', '90 days')) + '</button></div>' +
        '<h3>' + esc(L('События по дням и температура', 'Events per day and temperature')) + '</h3>' + chart(keys, a.days) +
        '<p class="hint">' + esc(L('Столбцы: события в день, линия: средняя температура.', 'Bars: events per day, line: mean temperature.')) + '</p>' +
        '<h3>' + esc(L('Активность в записанный час', 'Activity per recorded hour')) + '</h3>' +
        '<h4>' + esc(L('Ветер', 'Wind')) + '</h4>' + barsHtml(wind) + '<h4>' + esc(L('Температура', 'Temperature')) + '</h4>' + barsHtml(temp) + '<h4>' + esc(L('Осадки', 'Precipitation')) + '</h4>' + barsHtml(rain) +
        '<p class="recsum">' + esc(interp) + '</p><p class="hint">' + esc(L('Погода: Open-Meteo (open-meteo.com), по координатам вашей станции. Считаются только часы, когда шла запись.', 'Weather: Open-Meteo (open-meteo.com) at your station coordinates. Only hours with a recording are counted.')) + '</p>';
      [].forEach.call(box.querySelectorAll('#wxDays button'), function (b) { b.addEventListener('click', function () { days = +b.dataset.d; busy = false; render(); }); });
    }).catch(function () { box.innerHTML = '<p class="hint">' + esc(L('Не удалось получить погоду. Проверьте подключение.', 'Could not get the weather. Check your connection.')) + '</p>'; }).then(function () { busy = false; });
  }
  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) { if (prev) prev(v); if (v === 'calendar') render(); };
  window.WEWeather = { render: render };
  if (A.current() === 'calendar') render();
})();
