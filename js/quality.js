/* WetlandEar App: how well does the model work HERE. Everything is computed on the device from the events a person has reviewed in this journal.
   The published accuracy was measured on open recordings; this is the only honest number for your own sounds.
   Also: which events are most useful to review next, and an optional local correction that favours species that really occur at this station
   (switched on only when your own data show that it helps). */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc;
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  var PKEY = 'we.fieldprior', BETA = .5;
  function sid(g) { return S.sugId(g); }
  function name(id) { return A.spName ? A.spName(id) : S.nameOf(id); }
  function pc(x) { return (x * 100).toFixed(x * 100 >= 99.5 || x === 0 ? 0 : 1).replace('.', (window.WEi18n && WEi18n.lang === 'en') ? '.' : ','); }
  function pct(x) { return Math.round(x * 100); }

  /* Wilson 95% interval for a share k of n */
  function wilson(k, n) {
    if (!n) return [0, 0]; var z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)];
  }
  function reviewed() { return S.get().dets.filter(function (d) { return d.suggest && !d.demo && (d.status === 'confirmed' || d.status === 'rejected'); }); }
  function confirmedAll() { return S.get().dets.filter(function (d) { return d.status === 'confirmed' && d.species && !d.demo; }); }
  function cands(d) { return [d.suggest].concat(d.suggest.alts || []).filter(Boolean); }

  /* ---------- counts of what really occurs here, used by the local correction ---------- */
  var _cache = { key: '', counts: {}, n: 0 };
  function counts() {
    var dets = S.get().dets, key = dets.length + ':' + dets.reduce(function (a, d) { return a + (d.status === 'confirmed' ? 1 : 0); }, 0);
    if (_cache.key === key) return _cache;
    var c = {}, n = 0; confirmedAll().forEach(function (d) { c[d.species] = (c[d.species] || 0) + 1; n++; });
    _cache = { key: key, counts: c, n: n }; return _cache;
  }
  function enabled() { try { return localStorage.getItem(PKEY) === 'on'; } catch (e) { return false; } }
  function setEnabled(v) { try { localStorage.setItem(PKEY, v ? 'on' : 'off'); } catch (e) { } }
  function score(g, c) { return (g.conf || 0) * Math.pow((c[sid(g)] || 0) + 1, BETA); }
  /* the candidate list in the order the review screen shows it */
  function rerank(list) {
    if (!enabled() || list.length < 2) return list;
    var c = counts().counts; return list.slice().sort(function (a, b) { return score(b, c) - score(a, c); });
  }
  function pick(d) { var l = d.suggest ? rerank(cands(d)) : []; return l[0] || d.suggest; }
  /* the events whose answer teaches the model most: unsure ones, species with few reviews so far, possible threats */
  function priority(d) {
    var c = d.suggest ? d.suggest.conf : .15, u = 1 - Math.abs(2 * c - 1), few = 0;
    if (d.suggest) { var k = counts().counts[sid(d.suggest)] || 0; few = k < 5 ? .35 : 0; }
    return u + few + (S.threatOf(d) ? .5 : 0);
  }

  /* ---------- the numbers ---------- */
  function analyse() {
    var rows = reviewed(), conf = rows.filter(function (d) { return d.status === 'confirmed' && d.species; }), rej = rows.length - conf.length;
    var a1 = conf.filter(function (d) { return sid(d.suggest) === d.species; }).length;
    var a3 = conf.filter(function (d) { return cands(d).slice(0, 3).map(sid).indexOf(d.species) >= 0; }).length;
    var bins = [[0, .35], [.35, .5], [.5, .7], [.7, .9], [.9, 1.01]].map(function (b) {
      var m = conf.filter(function (d) { var c = d.suggest.conf || 0; return c >= b[0] && c < b[1]; }), ok = m.filter(function (d) { return sid(d.suggest) === d.species; }).length;
      return { lo: b[0], hi: Math.min(b[1], 1), n: m.length, ok: ok, meanConf: m.length ? m.reduce(function (a, d) { return a + d.suggest.conf; }, 0) / m.length : 0 };
    });
    var bySp = {}; conf.forEach(function (d) { var r = bySp[d.species] = bySp[d.species] || { id: d.species, n: 0, ok: 0, conf: {} }; r.n++; if (sid(d.suggest) === d.species) r.ok++; else { var w = sid(d.suggest); r.conf[w] = (r.conf[w] || 0) + 1; } });
    var species = Object.keys(bySp).map(function (k) { return bySp[k]; }).filter(function (r) { return r.n >= 3; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
    var months = {}; conf.forEach(function (d) { var t = new Date(d.ts), k = t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2); var r = months[k] = months[k] || { n: 0, ok: 0 }; r.n++; if (sid(d.suggest) === d.species) r.ok++; });
    var trend = Object.keys(months).sort().slice(-6).map(function (k) { return { m: k, n: months[k].n, ok: months[k].ok }; });
    /* leave-one-out test of the local correction */
    var all = counts(), base = 0, adj = 0, rareBase = 0, rareAdj = 0, rareN = 0, tested = 0;
    conf.forEach(function (d) {
      var c = Object.assign({}, all.counts); c[d.species] = Math.max(0, (c[d.species] || 0) - 1); var l = cands(d); if (l.length < 2) return; tested++;
      var o = l[0], r = l.slice().sort(function (x, y) { return score(y, c) - score(x, c); })[0], rare = (c[d.species] || 0) <= 2;
      if (sid(o) === d.species) base++; if (sid(r) === d.species) adj++;
      if (rare) { rareN++; if (sid(o) === d.species) rareBase++; if (sid(r) === d.species) rareAdj++; }
    });
    return { rows: rows, conf: conf, rejected: rej, n: conf.length, a1: a1, a3: a3, bins: bins, species: species, trend: trend, prior: { tested: tested, base: base, adj: adj, rareN: rareN, rareBase: rareBase, rareAdj: rareAdj } };
  }

  function bar(w, cls) { return '<span class="qbar' + (cls ? ' ' + cls : '') + '"><i style="--w:' + Math.round(clamp(w) * 100) + '%"></i></span>'; }
  function clamp(x) { return Math.max(0, Math.min(1, x)); }

  function render() {
    var box = $('#qualCard'); if (!box) return;
    var a = analyse(), h = '<div class="res-head"><h2>' + esc(L('Точность модели у вас', 'Model accuracy at your station')) + '</h2><button class="btn" id="qCsv"' + (a.rows.length ? '' : ' disabled') + '>' + esc(L('Скачать CSV', 'Download CSV')) + '</button></div>' +
      '<p class="hint">' + esc(L('Считается по событиям, которые вы уже проверили. Опубликованная точность измерена на открытых записях, а это ваши звуки: честнее.', 'Computed from the events you have already reviewed. The published accuracy was measured on open recordings; these are your own sounds, so this is the more honest number.')) + '</p>';
    if (a.n < 10) {
      box.innerHTML = h + '<p><b>' + esc(L('Пока слишком мало проверенных событий: ', 'Too few reviewed events so far: ')) + a.n + '.</b> ' + esc(L('Подтвердите хотя бы 10, и здесь появится оценка. Чем больше, тем точнее оценка.', 'Confirm at least 10 and an estimate appears here. The more, the better the estimate.')) + '</p>' +
        '<div class="mg-row"><button class="btn primary" data-go="review">' + esc(L('Проверить события', 'Review events')) + '</button></div>'; bind(box, a); return;
    }
    var ci1 = wilson(a.a1, a.n), ci3 = wilson(a.a3, a.n), reli = a.n < 30 ? ['bad', L('мало данных, цифры ненадёжны', 'too little data, numbers are unreliable')] : a.n < 100 ? ['warn', L('средняя надёжность', 'medium reliability')] : ['ok', L('данных достаточно', 'enough data')];
    h += '<div class="q-hero"><div><b>' + pc(a.a1 / a.n) + '%</b><span>' + esc(L('верный вид с первой подсказки', 'right species on the first suggestion')) + '</span><small>' + esc(L('95% интервал', '95% interval')) + ' ' + pct(ci1[0]) + '–' + pct(ci1[1]) + '%</small></div>' +
      '<div><b>' + pc(a.a3 / a.n) + '%</b><span>' + esc(L('верный вид среди первых трёх', 'right species among the first three')) + '</span><small>' + pct(ci3[0]) + '–' + pct(ci3[1]) + '%</small></div>' +
      '<div><b>' + a.n + '</b><span>' + esc(L('подтверждённых событий в оценке', 'confirmed events in the estimate')) + '</span><small class="q-rel ' + reli[0] + '">' + esc(reli[1]) + '</small></div></div>';
    if (a.rejected) h += '<p class="hint">' + esc(L('Ещё отклонено как ошибка или не птица: ', 'Also rejected as an error or not a bird: ')) + a.rejected + ' (' + pct(a.rejected / (a.n + a.rejected)) + '%).</p>';
    var tot = a.bins.reduce(function (s, b) { return s + b.n; }, 0), over = a.bins.reduce(function (s, b) { return s + b.meanConf * b.n; }, 0) / (tot || 1), real = a.a1 / a.n;
    h += '<h3>' + esc(L('Можно ли верить процентам', 'Can you trust the percentages')) + '</h3><div class="q-cal">' + a.bins.map(function (b) {
      return '<div class="q-row"><span>' + esc(L('уверенность', 'confidence')) + ' ' + b.lo.toFixed(2) + '–' + b.hi.toFixed(2) + '</span>' + (b.n ? bar(b.ok / b.n) + '<b>' + pct(b.ok / b.n) + '%</b><small>n=' + b.n + '</small>' : '<span class="hint">' + esc(L('нет событий', 'no events')) + '</span>') + '</div>'; }).join('') + '</div>' +
      '<p class="hint">' + esc(over > real + .05 ? L('Модель у вас самоуверенна: в среднем заявляет ' + pct(over) + '%, а права в ' + pct(real) + '%.', 'The model is overconfident at your station: it claims ' + pct(over) + '% on average but is right ' + pct(real) + '% of the time.') : over < real - .05 ? L('Модель осторожнее, чем нужно: заявляет ' + pct(over) + '%, права в ' + pct(real) + '%.', 'The model is more careful than needed: it claims ' + pct(over) + '% and is right ' + pct(real) + '%.') : L('Заявленная уверенность близка к реальной.', 'The claimed confidence is close to the real one.')) + '</p>';
    if (a.species.length) h += '<h3>' + esc(L('По видам (от 3 проверенных событий)', 'By species (3 or more reviewed events)')) + '</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(L('Вид', 'Species')) + '</th><th>' + esc(L('Событий', 'Events')) + '</th><th>' + esc(L('Верно с первой', 'Right first time')) + '</th><th>' + esc(L('Чаще путает с', 'Mostly confused with')) + '</th></tr></thead><tbody>' + a.species.map(function (r) {
      var top = Object.keys(r.conf).sort(function (x, y) { return r.conf[y] - r.conf[x]; })[0]; return '<tr data-sp="' + esc(r.id) + '"><td>' + esc(name(r.id)) + '</td><td>' + r.n + '</td><td>' + pct(r.ok / r.n) + '%</td><td>' + (top ? esc(name(top)) + ' (' + r.conf[top] + ')' : '–') + '</td></tr>'; }).join('') + '</tbody></table></div>';
    if (a.trend.length > 1) h += '<h3>' + esc(L('По месяцам', 'By month')) + '</h3><div class="q-trend">' + a.trend.map(function (m) { return '<div title="' + m.m + ': ' + m.ok + '/' + m.n + '"><i style="--h:' + Math.round(m.ok / m.n * 100) + '%"></i><span>' + m.m.slice(5) + '</span><small>n=' + m.n + '</small></div>'; }).join('') + '</div>';
    var P = a.prior, gain = P.tested ? (P.adj - P.base) / P.tested : 0, can = P.tested >= 60 && gain >= .02 && (P.rareN < 5 || P.rareAdj >= P.rareBase);   /* rare species are only checked when there are enough of them to say anything */
    h += '<h3>' + esc(L('Учёт видов вашей местности', 'Favouring species of your area')) + '</h3><p class="hint">' + esc(L('Идея: если журавль у вас слышен каждый день, а пеликан раз в год, то при сомнении журавль вероятнее. Мы проверяем это на ваших же событиях (каждое событие оценивается по остальным) и предлагаем включить, только если это реально помогает и не убивает редкие виды.', 'The idea: if cranes are heard every day and a pelican once a year, a crane is more likely when the model is unsure. We test this on your own events (each event is scored by all the others) and suggest it only if it really helps and does not bury rare species.')) + '</p>' +
      (P.tested >= 20 ? '<p>' + esc(L('Первый вариант верен без поправки: ', 'First choice right without the correction: ')) + '<b>' + pct(P.base / P.tested) + '%</b> → ' + esc(L('с поправкой: ', 'with it: ')) + '<b>' + pct(P.adj / P.tested) + '%</b>' + (P.rareN ? ' · ' + esc(L('редкие виды: ', 'rare species: ')) + P.rareBase + ' → ' + P.rareAdj + ' ' + esc(L('из', 'of')) + ' ' + P.rareN : '') + '</p>' : '<p class="hint">' + esc(L('Для проверки нужно хотя бы 20 событий с несколькими вариантами.', 'The test needs at least 20 events with several candidates.')) + '</p>') +
      '<label class="chk"><input type="checkbox" id="qPrior"' + (enabled() ? ' checked' : '') + (can || enabled() ? '' : ' disabled') + '> ' + esc(L('Учитывать частоту видов в списке вариантов', 'Take species frequency into account in the list of candidates')) + '</label>' +
      (can ? '' : '<p class="hint">' + esc(P.tested < 60 ? L('Станет доступно, когда накопится хотя бы 60 проверенных событий.', 'Becomes available after at least 60 reviewed events.') : L('Сейчас не помогает на ваших данных, поэтому выключено.', 'It does not help on your data right now, so it is off.')) + '</p>');
    h += '<div class="mg-row"><button class="btn primary" data-go="review">' + esc(L('Проверить самые полезные события', 'Review the most useful events')) + '</button></div>';
    box.innerHTML = h; bind(box, a);
  }
  function bind(box, a) {
    var cb = $('#qPrior', box); if (cb) cb.addEventListener('change', function () { setEnabled(cb.checked); A.toast(cb.checked ? L('Учёт частоты видов включён', 'Species frequency switched on') : L('Выключено', 'Switched off')); });
    var csv = $('#qCsv', box); if (csv) csv.addEventListener('click', function () {
      var rows = [['id', 'time', 'station', 'model_top', 'model_conf', 'result', 'confirmed_species', 'first_right']];
      a.rows.forEach(function (d) { rows.push([d.id, d.ts, d.station || '', d.suggest ? name(sid(d.suggest)) : '', d.suggest ? d.suggest.conf : '', d.status, d.species ? name(d.species) : '', d.status === 'confirmed' ? (sid(d.suggest) === d.species ? 'yes' : 'no') : '']); });
      var cell = function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var el = document.createElement('a'); el.href = URL.createObjectURL(new Blob(['﻿' + rows.map(function (r) { return r.map(cell).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' })); el.download = 'wetlandear-field-accuracy.csv'; document.body.appendChild(el); el.click(); setTimeout(function () { URL.revokeObjectURL(el.href); el.remove(); }, 500);
    });
  }

  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) { if (prev) prev(v); if (v === 'science') render(); };
  window.WEQuality = { analyse: analyse, rerank: rerank, pick: pick, priority: priority, enabled: enabled, render: render };
})();
