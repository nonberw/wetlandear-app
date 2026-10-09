/* WetlandEar App v0.1. UI and flow. Detection finds sound events; a human names the species. */
(function () {
  'use strict';
  var S = window.WEStore, D = window.WEDSP;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return ('0' + n).slice(-2); }
  function fmtDT(iso) { var d = new Date(iso); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtD(d) { return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }
  var T = function (s, v) { return window.WEi18n ? window.WEi18n.t(s, v) : s; };
  var PLEN = { 'событие': ['event', 'events'], 'подтверждённый вид': ['confirmed species', 'confirmed species'], 'фрагменту': ['fragment', 'fragments'], 'образец': ['sample', 'samples'] };
  function plural(n, a, b, c) {
    if (window.WEi18n && window.WEi18n.lang === 'en' && PLEN[a]) return n === 1 ? PLEN[a][0] : PLEN[a][1]; var m = n % 10, h = n % 100; return (m === 1 && h !== 11) ? a : (m >= 2 && m <= 4 && (h < 10 || h >= 20)) ? b : c; }
  function spName(id) { return id ? S.nameOf(id) : null; }
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(toast.h); toast.h = setTimeout(function () { t.hidden = true; }, 2600);
  }
  function download(name, text, type) {
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'text/csv;charset=utf-8' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }
  function speciesOptions(sel, withBlank) {
    var h = withBlank ? '<option value="">Выберите вид</option>' : '';
    S.SPECIES.forEach(function (s) { h += '<option value="' + s[0] + '">' + esc(S.nameOf(s[0])) + '</option>'; });
    h += '<option value="__other">Другой вид...</option>';
    sel.innerHTML = h;
  }
  function pickSpecies(sel) {
    if (sel.value === '__other') {
      var t = (prompt(T('Название вида')) || '').trim().slice(0, 60);
      if (!t) { sel.value = ''; return null; }
      var id = 'x:' + t;
      if (!sel.querySelector('option[value="' + id.replace(/"/g, '') + '"]')) { var o = document.createElement('option'); o.value = id; o.textContent = t; sel.insertBefore(o, sel.lastChild); }
      sel.value = id; return id;
    }
    return sel.value || null;
  }

  /* ---------- navigation ---------- */
  var current = 'pulse';
  function show(view) {
    if (!$('#v-' + view)) view = 'pulse';
    current = view;
    $$('.view').forEach(function (v) { v.classList.toggle('on', v.id === 'v-' + view); });
    $$('.tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.view === view); });
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    window.scrollTo(0, 0);
    if (view === 'pulse') renderPulse();
    if (view === 'review') loadReview();
    if (view === 'calendar') renderCalendar();
    if (view === 'data') renderData();
    if (view === 'profile') renderProfile();
    if (window.WEX) window.WEX.onShow(view);
  }
  $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.view); }); });
  $$('[data-go]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.go); }); });
  window.addEventListener('hashchange', function () { show(location.hash.slice(1) || 'pulse'); });

  function refreshChrome() {
    $('#demoBanner').hidden = !S.hasDemo();
    $('#signBanner').hidden = !!(window.WESync && WESync.me()) || !(window.WESync && WESync.ready());
    var n = reviewQueue().length, b = $('#revCount'); b.textContent = n > 99 ? '99+' : n; b.hidden = !n;
  }

  /* ---------- trust level and sound badges ---------- */
  var LVL = { reference: ['эталон', 'ok'], human: ['подтверждено человеком', 'ok'], model: ['модель предполагает', 'mod'], event: ['событие найдено', ''], rejected: ['ошибка', ''] };
  function lvlBadge(d, all) { var l = S.level(d); if (!all && (l === 'event' || l === 'model')) return ''; var t = LVL[l]; return '<span class="badge ' + t[1] + '">' + esc(T(t[0])) + '</span>'; }
  var SK = { animal: 'животное, птица', weather: 'похоже на ветер или дождь', speech: 'речь человека', dog: 'собака' };
  function sndHtml(e) {
    var h = '', k = S.soundKind(e), th = S.threatOf(e);
    if (th) h += '<span class="snd threat">⚠ ' + T(th.kind === 'gun' ? 'возможный выстрел' : 'шум двигателя') + ' ' + Math.round(th.score * 100) + '%</span>';
    if (k) h += '<span class="snd ' + (k === 'animal' ? '' : 'mute') + '">' + esc(T(SK[k])) + '</span>';
    return h ? '<div class="sndrow">' + h + '</div>' : '';
  }

  /* ---------- pulse ---------- */
  function countUp(el, to) {
    var from = parseInt(el.textContent, 10) || 0, t0 = performance.now();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to; return; }
    (function step(t) { var k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); })(t0);
  }
  function renderPulse() {
    var p = S.pulse(), c = p.cur, fg = $('#ringFg'), C = 603.2;
    refreshChrome();
    if (!c) {
      $('#pulseNum').textContent = '–'; $('#pulseLab').textContent = 'нет данных'; fg.style.strokeDashoffset = C;
      $('#pulseText').textContent = 'Загрузите запись или включите микрофон. Через минуту здесь появится первый пульс.';
      ['#stEvents', '#stSpecies'].forEach(function (s) { $(s).textContent = '0'; }); $('#stVerified').textContent = '0%'; $('#stTrend').textContent = 'за 7 дней';
      $('#pulseBars').innerHTML = '<p class="hint">Здесь появятся три составляющие пульса.</p>';
    } else {
      countUp($('#pulseNum'), c.score);
      $('#pulseLab').textContent = c.score >= 70 ? 'живо и спокойно' : c.score >= 40 ? 'обычная активность' : 'тихо';
      fg.style.strokeDashoffset = C * (1 - c.score / 100);
      var tr = '';
      if (p.prev) { var d = c.score - p.prev.score; tr = d === 0 ? ' ' + T('Как и неделю назад.') : ' ' + T(d > 0 ? 'На {n} выше, чем неделей раньше.' : 'На {n} ниже, чем неделей раньше.', { n: Math.abs(d) }); }
      $('#pulseText').textContent = T('{n} {w} и {s} {sw} за неделю.', { n: c.events, w: plural(c.events, 'событие', 'события', 'событий'), s: c.species, sw: plural(c.species, 'подтверждённый вид', 'подтверждённых вида', 'подтверждённых видов') }) + tr;
      $('#stEvents').textContent = c.events;
      $('#stTrend').textContent = p.prev ? (c.events >= p.prev.events ? '▲ ' : '▼ ') + T('была {n} неделей раньше', { n: p.prev.events }) : T('за 7 дней');
      $('#stSpecies').textContent = c.species; $('#stVerified').textContent = Math.round(c.verified * 100) + '%';
      var rows = [['Разнообразие', c.parts.diversity, T('{n} из 10', { n: c.species })], ['Активность', c.parts.activity, T('{n} из 60', { n: c.events })], ['Доверие', c.parts.trust, Math.round(c.verified * 100) + '%']];
      $('#pulseBars').innerHTML = rows.map(function (r) { return '<div class="bar"><span>' + r[0] + '</span><i style="--w:0%"></i><em>' + r[2] + '</em></div>'; }).join('');
      requestAnimationFrame(function () { requestAnimationFrame(function () { $$('#pulseBars .bar i').forEach(function (el, i) { el.style.setProperty('--w', Math.round(rows[i][1] * 100) + '%'); }); }); });
    }
    var dets = S.get().dets.filter(function (d) { return d.status !== 'rejected'; }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, 8);
    $('#recent').innerHTML = dets.length ? dets.map(function (d) {
      return '<li><span class="dotk ' + d.status + '"></span><span class="nm">' + esc(spName(d.species) || 'Звуковое событие') + (d.demo ? '<span class="badge">демо</span>' : '') + lvlBadge(d, true) + '</span><span class="tm">' + fmtDT(d.ts) + '</span></li>';
    }).join('') : '<li><span class="hint">Пока пусто.</span></li>';
    if (window.WEX) window.WEX.afterPulse();
  }
  $('#demoOn').addEventListener('click', function () { S.seedDemo(); renderPulse(); toast('Демо-данные добавлены'); });
  $('#demoOff').addEventListener('click', function () { S.clearDemo(); show(current); toast('Демо убрано'); });

  /* ---------- spectrogram painting ---------- */
  function paintSpec(canvas, sp, W, H) {
    var F = sp.frames, NB = sp.bins, off = document.createElement('canvas'); off.width = Math.max(1, F); off.height = NB;
    var ctx = off.getContext('2d'), img = ctx.createImageData(off.width, NB), px = img.data, f, i;
    for (f = 0; f < F; f++) for (i = 0; i < NB; i++) {
      var v = (sp.db[f * NB + i] - sp.floor[i]) / 30; v = v < 0 ? 0 : v > 1 ? 1 : v;
      var r, g, b;
      if (v < .35) { var k = v / .35; r = 255 + (200 - 255) * k; g = 255 + (216 - 255) * k; b = 255; }
      else if (v < .7) { var k2 = (v - .35) / .35; r = 200 + (60 - 200) * k2; g = 216 + (110 - 216) * k2; b = 255; }
      else { var k3 = (v - .7) / .3; r = 60 + (10 - 60) * k3; g = 110 + (36 - 110) * k3; b = 255 + (135 - 255) * k3; }
      var o = ((NB - 1 - i) * off.width + f) * 4; px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    canvas.width = W; canvas.height = H;
    var c = canvas.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; c.fillStyle = '#fff'; c.fillRect(0, 0, W, H); c.drawImage(off, 0, 0, W, H);
  }

  /* ---------- listen ---------- */
  var sess = null, SPECH = 200, MAXSEC = 300;
  var statusEl = $('#status');
  function setStatus(msg, err) { statusEl.textContent = msg || ''; statusEl.classList.toggle('err', !!err); }

  function analyze(arrayBuffer, name, startMs) {
    setStatus('Расшифровываю звук...');
    var copy = arrayBuffer.slice(0);
    return D.decode(arrayBuffer).then(function (samples) {
      if (samples.length / D.SR > MAXSEC) { samples = samples.subarray(0, MAXSEC * D.SR); toast('Взяты первые 5 минут'); }
      if (samples.length < 4096) throw new Error('short');
      setStatus('Ищу звуковые события...');
      return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
        var sp = D.spectrogram(samples);
        sess = { name: name, start: new Date(startMs || Date.now()).toISOString(), samples: samples, sp: sp, dur: sp.dur, saved: false, sel: -1, events: [], s48: null };
        var v = $('#sens').value; runDetect(+v);
        D.decode(copy, 48000).then(function (s48) { if (sess && sess.samples === samples) { sess.s48 = s48; scheduleIdentify(0); } }).catch(function () { });
        buildPlayer(); renderResult(); setStatus('');
        $('#result').hidden = false;
        setTimeout(function () { $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
      });
    }).catch(function (e) {
      setStatus(e && e.message === 'short' ? 'Запись слишком короткая.' : 'Не удалось прочитать этот файл. Попробуйте wav, mp3 или m4a.', true);
    });
  }
  function runDetect(snr) {
    var old = sess.events, evs = D.detect(sess.sp, snr);
    sess.events = evs.map(function (e) { e.status = 'auto'; e.species = null; return e; });
    sess.sel = -1; $('#sensVal').textContent = snr + ' ' + T('дБ'); scheduleIdentify(900);
    return old;
  }
  function buildPlayer() {
    var p = $('#player'); if (p.dataset.url) URL.revokeObjectURL(p.dataset.url);
    var u = URL.createObjectURL(D.wavBlob(sess.samples, D.SR)); p.src = u; p.dataset.url = u;
  }
  function specSize() { var w = $('#specScroll').clientWidth || 600; return Math.round(Math.min(8000, Math.max(w, sess.dur * 70))); }
  function renderResult() {
    var W = specSize(), box = $('#specBox');
    box.style.width = W + 'px'; box.style.height = SPECH + 'px';
    paintSpec($('#spec'), sess.sp, W, SPECH);
    $('#resTitle').textContent = sess.name;
    $('#resMeta').textContent = Math.round(sess.dur * 10) / 10 + ' ' + T('сек') + ' · ' + fmtDT(sess.start);
    renderEvents();
  }
  function renderEvents() {
    var evs = sess.events, W = specSize(), fmin = sess.sp.fmin, fmax = sess.sp.fmax;
    $('#evTitle').textContent = evs.length ? T('События: {n}', { n: evs.length }) : T('События не найдены');
    $('#saveBtn').disabled = !evs.length || sess.saved; $('#saveBtn').textContent = sess.saved ? 'Сохранено' : 'Сохранить в журнал';
    $('#evLayer').innerHTML = evs.map(function (e, i) {
      var l = e.t0 / sess.dur * W, w = Math.max(6, (e.t1 - e.t0) / sess.dur * W);
      var top = (1 - (e.fHigh - fmin) / (fmax - fmin)) * SPECH, h = Math.max(8, (e.fHigh - e.fLow) / (fmax - fmin) * SPECH);
      return '<button class="ev ' + (e.status === 'confirmed' ? 'ok' : e.status === 'rejected' ? 'no' : '') + (i === sess.sel ? ' sel' : '') + '" data-i="' + i + '" style="left:' + l + 'px;width:' + w + 'px;top:' + top + 'px;height:' + h + 'px" aria-label="' + esc(T('Событие {n}', { n: i + 1 })) + '"></button>';
    }).join('');
    var ul = $('#events');
    ul.innerHTML = evs.map(function (e, i) {
      var nm = spName(e.species), st = e.status === 'auto' && e.auto ? '<span class="badge mod">' + esc(T('модель')) + ' ' + Math.round(e.autoConf * 100) + '%</span>' : lvlBadge(e);
      return '<li class="evc ' + (i === sess.sel ? 'sel ' : '') + (e.status === 'confirmed' ? 'ok' : e.status === 'rejected' ? 'no' : '') + '" data-i="' + i + '"><div><div class="t">' + (i + 1) + '. ' + esc(nm || D.describe(e)) + st + '</div>' +
        (e.status === 'auto' && e.suggest && e.suggest.length ? '<div class="sugs">' + e.suggest.map(function (s, k) { return '<button class="sug' + (s.own ? ' own' : s.head ? ' head' : '') + '" data-a="sug" data-k="' + k + '" title="' + esc(s.own ? 'по вашим записям' : s.head ? 'модель WetlandEar, обучена на записях Xeno-canto' : s.sci) + '">' + (s.own ? '★ ' : s.head ? '◆ ' : '') + esc(S.sugName(s)) + ' <b>' + Math.round(s.conf * 100) + '%</b></button>'; }).join('') + '</div>' : '') + sndHtml(e) + '<div class="m">' + e.t0.toFixed(1) + ' ' + T('с') + ', ' + (e.t1 - e.t0).toFixed(1) + ' ' + T('с') + ' · ' + (e.fLow / 1000).toFixed(1) + '–' + (e.fHigh / 1000).toFixed(1) + ' ' + T('кГц') + ' · +' + e.snr + ' ' + T('дБ') + '</div></div>' +
        '<button class="btn" data-a="play" aria-label="Слушать">▶</button>' +
        '<div class="acts"><select data-a="sp" aria-label="Вид"></select><button class="btn primary" data-a="yes">Верно</button><button class="btn no" data-a="no">Ошибка</button></div></li>';
    }).join('');
    $$('#events select').forEach(function (s, i) { speciesOptions(s, true); var sp = evs[i].species; if (sp) { if (!S.species[sp]) { var o = document.createElement('option'); o.value = sp; o.textContent = spName(sp); s.insertBefore(o, s.lastChild); } s.value = sp; } });
  }
  /* species suggestions from BirdNET running on our server; always a suggestion, never an observation */
  var idTimer = 0, idSeq = 0, SUGMIN = .2, AUTOMIN = .3, OWNMIN = .72;
  /* Compare with the voices you confirmed before (works for species the model has never heard, such as pelicans). */
  function ownPick(ev) {
    if (!ev.emb || ev.status !== 'auto') return;
    var m = S.matchOwn(ev.emb); if (!m || m.sim < OWNMIN) return;
    var top = ev.suggest && ev.suggest[0], topId = top && S.sugId(top);
    if (topId === m.id) { top.own = true; return; }
    if (top && top.conf >= .7 && m.id.indexOf('x:') !== 0 && m.sim < .8) return;
    ev.suggest = [{ id: m.id, sci: null, common: S.nameOf(m.id), conf: Math.min(.99, m.sim), own: true }].concat(ev.suggest || []).slice(0, 3);
  }
  /* Fill the species in automatically unless a person already decided, or the sound looks like wind, rain or speech. */
  function autoPick(ev) {
    if (!ev.suggest || ev.status !== 'auto' || ev.species) return;
    var sg = ev.suggest.filter(function (s) { return s.conf >= (s.head ? .5 : AUTOMIN); })[0];
    if (!sg) return;
    var kind = S.soundKind(ev);
    if ((kind === 'weather' || kind === 'speech') && sg.conf < .6) return;
    ev.species = S.sugId(sg); ev.auto = true; ev.autoConf = sg.conf;
  }
  function scheduleIdentify(delay) { clearTimeout(idTimer); idTimer = setTimeout(runIdentify, delay); }
  function setIdState(t) { var el = $('#idState'); if (el) el.textContent = t || ''; }
  /* Several fragments per long event, averaged: on 52 real recordings this lifted accuracy from 75-79% to 86%. */
  var MAXWIN = 36;
  function eventCenters(e) {
    var len = e.t1 - e.t0, c = (e.t0 + e.t1) / 2;
    if (len <= 3.2) return [c];
    var n = len > 8 ? 3 : 2, out = [], step = (len - 3) / (n - 1), i;
    for (i = 0; i < n; i++) out.push(e.t0 + 1.5 + i * step);
    return out;
  }
  function windowAt(center) {
    var src = sess.s48, start = Math.max(0, Math.min(center - 1.5, sess.dur - 3)), a = Math.round(start * 48000), w = new Int16Array(144000);
    for (var i = 0; i < 144000 && a + i < src.length; i++) { var x = Math.max(-1, Math.min(1, src[a + i])); w[i] = x < 0 ? x * 32768 : x * 32767; }
    return w;
  }
  function b64(i16) { var u = new Uint8Array(i16.buffer), s = '', k; for (k = 0; k < u.length; k += 8192) s += String.fromCharCode.apply(null, u.subarray(k, k + 8192)); return btoa(s); }
  function aggregate(ev) {
    var rs = ev._res, n = rs.length, m = {}, groups = {};
    rs.forEach(function (r) {
      r.species.forEach(function (s) { var o = m[s.sci] || (m[s.sci] = { sci: s.sci, common: s.common, sum: 0 }); o.sum += s.conf; });
      var g = (r.sound && r.sound.groups) || {}; Object.keys(g).forEach(function (k) { groups[k] = Math.max(groups[k] || 0, g[k]); });
    });
    ev.suggest = Object.keys(m).map(function (k) { return { sci: m[k].sci, common: m[k].common, conf: m[k].sum / n }; })
      .filter(function (s) { return s.conf >= SUGMIN; }).sort(function (a, b) { return b.conf - a.conf; }).slice(0, 3);
    var hm = {};
    rs.forEach(function (r) { (r.head || []).forEach(function (s) { var o = hm[s.sci] || (hm[s.sci] = { sci: s.sci, common: s.common, sum: 0 }); o.sum += s.conf; }); });
    var heads = Object.keys(hm).map(function (k) { return { sci: hm[k].sci, common: hm[k].common, conf: hm[k].sum / n, head: true }; }).filter(function (s) { return s.conf >= .25; }).sort(function (a, b) { return b.conf - a.conf; }).slice(0, 1);
    if (heads.length) ev.suggest = heads.concat(ev.suggest.filter(function (s) { return s.sci !== heads[0].sci; })).slice(0, 3);
    var mid = rs[Math.floor(n / 2)];
    ev.sound = { top: (mid.sound && mid.sound.top) || [], groups: groups };
    ev.emb = mid.emb ? S.packEmb(mid.emb) : null;
    ownPick(ev); autoPick(ev);
    delete ev._res;
  }
  var lastAll = null;
  function recordingSummary(all) {
    var el = $('#recSummary'); if (!el) return;
    var m = {}, n = all.length;
    all.forEach(function (r) { r.species.forEach(function (s) { var o = m[s.sci] || (m[s.sci] = { sci: s.sci, common: s.common, sum: 0 }); o.sum += s.conf; }); });
    var hmap = {};
    all.forEach(function (r) { (r.head || []).forEach(function (s) { var o = hmap[s.sci] || (hmap[s.sci] = { sci: s.sci, common: s.common, sum: 0 }); o.sum += s.conf; }); });
    var hlist = Object.keys(hmap).map(function (k) { return { sci: hmap[k].sci, common: hmap[k].common, conf: hmap[k].sum / n }; }).filter(function (s) { return s.conf >= .25; }).sort(function (a, b) { return b.conf - a.conf; }).slice(0, 2);
    var top = Object.keys(m).map(function (k) { return { sci: m[k].sci, common: m[k].common, conf: m[k].sum / n }; }).filter(function (s) { return s.conf >= SUGMIN; }).sort(function (a, b) { return b.conf - a.conf; });
    top = hlist.concat(top.filter(function (s) { return !hlist.some(function (h) { return h.sci === s.sci; }); })).slice(0, 3);
    el.hidden = false;
    lastAll = all;
    el.innerHTML = top.length ? '<b>' + esc(T('Итог по записи.')) + '</b> ' + esc(T('Вероятнее всего здесь:')) + ' ' + top.map(function (s) { return esc(S.sugName(s)) + ' <b>' + Math.round(s.conf * 100) + '%</b>'; }).join(', ') + '. ' + esc(T('Это среднее по {n} {w} и точнее одиночных подсказок.', { n: n, w: plural(n, 'фрагменту', 'фрагментам', 'фрагментам') }))
      : '<b>' + esc(T('Итог по записи.')) + '</b> ' + esc(T('Уверенно определить вид модель не смогла. Выберите его сами в карточках: так приложение научится.'));
  }
  function runIdentify() {
    if (!sess || !sess.events.length) { setIdState(''); var rs0 = $('#recSummary'); if (rs0) rs0.hidden = true; return; }
    if (!window.WESync || !WESync.token()) { setIdState('Подсказки видов доступны после входа через Google. Нажмите «Войти» вверху.'); return; }
    if (!sess.s48) { setIdState('Готовлю звук для определения...'); return; }
    var seq = ++idSeq, evs = sess.events, st = S.get().station, chain = Promise.resolve(), failed = false, all = [];
    /* strongest events first, capped so one request batch stays quick */
    var order = evs.slice().sort(function (a, b) { return b.snr - a.snr; }), jobs = [], budget = MAXWIN;
    order.forEach(function (e) {
      var cs = eventCenters(e); if (cs.length > budget) cs = cs.slice(0, Math.max(1, budget));
      if (budget <= 0) return;
      e._res = []; e._need = cs.length; budget -= cs.length;
      cs.forEach(function (c) { jobs.push({ ev: e, c: c }); });
    });
    setIdState('Модель определяет виды...');
    for (var from = 0; from < jobs.length; from += 10) (function (from) {
      chain = chain.then(function () {
        if (seq !== idSeq || failed) return;
        var part = jobs.slice(from, from + 10);
        return fetch('/api/identify', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + WESync.token() }, body: JSON.stringify({ lat: st.lat, lon: st.lon, windows: part.map(function (j) { return b64(windowAt(j.c)); }) }) })
          .then(function (r) { if (r.status === 401) { var e = new Error('auth'); e.auth = true; throw e; } if (!r.ok) throw new Error('http'); return r.json(); })
          .then(function (j) {
            if (seq !== idSeq || !sess || sess.events !== evs) return;
            j.results.forEach(function (it, k) { var ev = part[k].ev; ev._res.push(it); all.push(it); if (ev._res.length === ev._need) aggregate(ev); });
            renderEvents();
          });
      }).catch(function (e) { failed = e && e.auth ? 'auth' : true; });
    })(from);
    chain.then(function () {
      if (seq !== idSeq) return;
      evs.forEach(function (e) { delete e._res; delete e._need; });
      if (!failed) recordingSummary(all);
      setIdState(failed === 'auth' ? 'Сессия истекла. Войдите снова, чтобы получить подсказки.' : failed ? 'Подсказки модели недоступны сейчас. Выберите вид сами.' : 'Подсказки модели BirdNET готовы. Проверяйте их на слух и по спектрограмме.');
    });
  }
  var rafPlay = 0, stopAt = null;
  function playRange(t0, t1) {
    var p = $('#player'); stopAt = t1 == null ? null : t1; p.currentTime = Math.max(0, t0); p.play().catch(function () { });
  }
  function tickPlay() {
    var p = $('#player'), ph = $('#playhead');
    if (sess) {
      var x = p.currentTime / sess.dur * specSize(); ph.style.display = (p.paused && !p.currentTime) ? 'none' : 'block'; ph.style.left = x + 'px';
      var sc = $('#specScroll'); if (!p.paused && (x < sc.scrollLeft || x > sc.scrollLeft + sc.clientWidth - 40)) sc.scrollLeft = Math.max(0, x - 40);
      if (stopAt != null && p.currentTime >= stopAt) { p.pause(); stopAt = null; }
    }
    rafPlay = requestAnimationFrame(tickPlay);
  }
  tickPlay();
  function selectEvent(i, play) {
    sess.sel = i; renderEvents();
    var li = $('#events [data-i="' + i + '"]'); if (li && !play) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (play) { var e = sess.events[i]; playRange(Math.max(0, e.t0 - .15), e.t1 + .15); }
  }
  $('#evLayer').addEventListener('click', function (e) { var b = e.target.closest('.ev'); if (b) selectEvent(+b.dataset.i, true); });
  $('#events').addEventListener('click', function (e) {
    var li = e.target.closest('.evc'); if (!li) return; var i = +li.dataset.i, ev = sess.events[i], a = e.target.dataset.a;
    if (a === 'play') { selectEvent(i, true); return; }
    var chip = e.target.closest('[data-a="sug"]');
    if (chip) {
      var sg = ev.suggest[+chip.dataset.k], sid = S.sugId(sg); ev.species = sid; ev.auto = true; ev.autoConf = sg.conf; sess.saved = false; renderEvents();
      var nl = $('#events [data-i="' + i + '"]'); toast(T('Выбрано: {name}. Нажмите «Верно», если согласны', { name: S.sugName(sg) })); if (nl) $('select', nl).focus({ preventScroll: true }); return;
    }
    if (a === 'yes') {
      var sel = $('select', li), id = pickSpecies(sel);
      if (!id) { toast('Сначала выберите вид'); sel.focus(); return; }
      ev.species = id; ev.status = 'confirmed'; sess.saved = false; renderEvents(); toast(T('Подтверждено: {name}', { name: spName(id) })); return;
    }
    if (a === 'no') { ev.status = 'rejected'; ev.species = null; ev.auto = false; sess.saved = false; renderEvents(); return; }
  });
  $('#events').addEventListener('change', function (e) {
    if (e.target.dataset.a !== 'sp') return;
    var li = e.target.closest('.evc'), ev = sess.events[+li.dataset.i], id = pickSpecies(e.target); if (id) { ev.species = id; ev.auto = false; }
  });
  $('#sens').addEventListener('input', function () {
    if (!sess) { $('#sensVal').textContent = this.value + ' ' + T('дБ'); return; }
    runDetect(+this.value); sess.saved = false; renderEvents();
  });
  $('#sensVal').textContent = $('#sens').value + ' ' + T('дБ');

  $('#saveBtn').addEventListener('click', function () {
    if (!sess || sess.saved || !sess.events.length) return;
    var pad2 = Math.round(.25 * D.SR), clips = sess.events.map(function (e) {
      var a = Math.max(0, Math.floor(e.t0 * D.SR) - pad2), b = Math.min(sess.samples.length, Math.ceil(e.t1 * D.SR) + pad2), out = new Int16Array(b - a);
      for (var i = 0; i < out.length; i++) { var x = Math.max(-1, Math.min(1, sess.samples[a + i])); out[i] = x < 0 ? x * 32768 : x * 32767; }
      return out;
    });
    var evs = sess.events.map(function (e) { return { t0: e.t0, t1: e.t1, fLow: e.fLow, fHigh: e.fHigh, fPeak: e.fPeak, snr: e.snr, status: e.status, species: e.species, clipPad: .25, sound: e.sound || null, emb: e.emb || null, suggest: e.suggest && e.suggest[0] ? { id: e.suggest[0].id || null, own: !!e.suggest[0].own, head: !!e.suggest[0].head, sci: e.suggest[0].sci, common: e.suggest[0].common, conf: e.suggest[0].conf } : null }; });
    S.addRecording({ name: sess.name, start: sess.start, dur: sess.dur }, evs, clips);
    sess.saved = true; renderEvents(); refreshChrome();
    toast(T('Сохранено: {n} {w}', { n: evs.length, w: plural(evs.length, 'событие', 'события', 'событий') }));
  });

  /* drop + file */
  function fromFile(f) {
    if (!f) return;
    if (f.size > 120 * 1024 * 1024) { setStatus('Файл слишком большой.', true); return; }
    f.arrayBuffer().then(function (ab) { return analyze(ab, f.name.replace(/\.[^.]+$/, ''), f.lastModified); });
  }
  $('#file').addEventListener('change', function () { fromFile(this.files[0]); this.value = ''; });
  var drop = $('#drop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { fromFile(e.dataTransfer.files[0]); });

  /* microphone: no echo cancellation, noise suppression or auto gain, they destroy bird calls */
  var rec = null;
  $('#recBtn').addEventListener('click', function () {
    if (rec) { stopRec(); return; }
    if (!navigator.mediaDevices || !window.MediaRecorder) { setStatus('Этот браузер не умеет записывать звук. Загрузите файл.', true); return; }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } }).then(function (stream) {
      var chunks = [], mr = new MediaRecorder(stream), t0 = Date.now();
      rec = { mr: mr, stream: stream, t0: t0, timer: null };
      mr.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
      mr.onstop = function () {
        stream.getTracks().forEach(function (t) { t.stop(); }); clearInterval(rec.timer);
        var start = rec.t0; rec = null; $('#recBtn').classList.remove('rec'); $('#recLab').textContent = 'Записать';
        var blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
        blob.arrayBuffer().then(function (ab) { analyze(ab, T('Запись') + ' ' + pad(new Date(start).getHours()) + ':' + pad(new Date(start).getMinutes()), start); });
      };
      mr.start(); $('#recBtn').classList.add('rec'); setStatus('');
      rec.timer = setInterval(function () { var s = Math.round((Date.now() - t0) / 1000); $('#recLab').textContent = T('Стоп') + ' ' + Math.floor(s / 60) + ':' + pad(s % 60); if (s >= MAXSEC) stopRec(); }, 250);
      $('#recLab').textContent = T('Стоп') + ' 0:00';
    }).catch(function () { setStatus('Нет доступа к микрофону. Разрешите его в настройках браузера или загрузите файл.', true); });
  });
  function stopRec() { if (rec && rec.mr.state !== 'inactive') rec.mr.stop(); }

  /* ---------- review ---------- */
  var queue = [], qi = 0, curClip = null, actx = null, srcNode = null;
  /* active learning: the answers that teach the model most come first (model unsure, around 50%) */
  function uncertainty(d) { var c = d.suggest ? d.suggest.conf : .15; return 1 - Math.abs(2 * c - 1); }
  function reviewQueue() { return S.get().dets.filter(function (d) { return d.status === 'auto' && d.clip; }).sort(function (a, b) { var u = uncertainty(b) - uncertainty(a); return u || (a.ts < b.ts ? -1 : 1); }); }
  function loadReview() {
    queue = reviewQueue(); qi = 0; refreshChrome(); showReview();
  }
  function showReview() {
    var empty = !queue.length || qi >= queue.length;
    $('#revEmpty').hidden = !empty; $('#revCard').hidden = empty;
    if (empty) { if (queue.length) $('#revEmpty b').textContent = 'Очередь закончилась'; else $('#revEmpty b').textContent = 'Очередь пуста'; return; }
    var d = queue[qi]; curClip = null;
    $('#revPos').textContent = T('{a} из {b}', { a: qi + 1, b: queue.length });
    $('#revMeta').textContent = fmtDT(d.ts) + ' · ' + T(d.station || '') + ' · ' + (d.fLow / 1000).toFixed(1) + '–' + (d.fHigh / 1000).toFixed(1) + ' ' + T('кГц') + ' · +' + d.snr + ' ' + T('дБ') + ' · ' + T(D.describe(d)) + (S.threatOf(d) ? ' · ⚠ ' + T(S.threatOf(d).kind === 'gun' ? 'возможный выстрел' : 'шум двигателя') : S.soundKind(d) && S.soundKind(d) !== 'animal' ? ' · ' + T(SK[S.soundKind(d)]) : '');
    var sel = $('#revSel'); speciesOptions(sel, true);
    if (d.suggest) {
      var gid = S.sugId(d.suggest);
      if (!sel.querySelector('option[value="' + gid.replace(/"/g, '') + '"]')) { var go = document.createElement('option'); go.value = gid; go.textContent = S.sugName(d.suggest); sel.insertBefore(go, sel.lastChild); }
      sel.value = gid; $('#revMeta').textContent += ' · ' + T('модель предполагает') + ': ' + S.sugName(d.suggest) + ' ' + Math.round(d.suggest.conf * 100) + '%';
    }
    S.getClip(d.id).then(function (int16) {
      if (queue[qi] !== d || !int16) return;
      var f = new Float32Array(int16.length); for (var i = 0; i < f.length; i++) f[i] = int16[i] / 32768;
      curClip = f;
      var cv = $('#revSpec'), W = Math.round(cv.getBoundingClientRect().width) || 600;
      var sp = D.spectrogram(f); paintSpec(cv, sp, W, 140);
    });
  }
  function playClip() {
    if (!curClip) return;
    var AC = window.AudioContext || window.webkitAudioContext; actx = actx || new AC(); if (actx.state === 'suspended') actx.resume();
    if (srcNode) { try { srcNode.stop(); } catch (e) { } }
    var b = actx.createBuffer(1, curClip.length, D.SR); b.getChannelData(0).set(curClip);
    srcNode = actx.createBufferSource(); srcNode.buffer = b; srcNode.connect(actx.destination); srcNode.start();
  }
  function decide(kind) {
    var d = queue[qi]; if (!d) return;
    var card = $('#revCard');
    if (kind === 'yes') {
      var id = pickSpecies($('#revSel'));
      if (!id) { toast('Сначала выберите вид'); $('#revSel').focus(); return; }
      S.setStatus(d.id, 'confirmed', id);
    } else if (kind === 'no') { S.setStatus(d.id, 'rejected', null); }
    if (kind === 'skip') { qi++; } else { queue.splice(qi, 1); }
    card.classList.remove('flash-ok', 'flash-no'); void card.offsetWidth; if (kind !== 'skip') card.classList.add(kind === 'yes' ? 'flash-ok' : 'flash-no');
    if (kind === 'yes') toast('Подтверждено'); refreshChrome(); showReview();
  }
  $('#revPlay').addEventListener('click', playClip);
  $('#revYes').addEventListener('click', function () { decide('yes'); });
  $('#revNo').addEventListener('click', function () { decide('no'); });
  $('#revSkip').addEventListener('click', function () { decide('skip'); });
  document.addEventListener('keydown', function (e) {
    if (current !== 'review' || /^(SELECT|INPUT|TEXTAREA)$/.test(e.target.tagName) || e.metaKey || e.ctrlKey) return;
    if (e.key === ' ') { e.preventDefault(); playClip(); }
    else if (e.key === 'Enter') { e.preventDefault(); decide('yes'); }
    else if (e.key === 'n' || e.key === 'N' || e.key === 'т' || e.key === 'Т') decide('no');
    else if (e.key === 's' || e.key === 'S' || e.key === 'ы' || e.key === 'Ы') decide('skip');
  });

  /* ---------- calendar ---------- */
  var MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function renderCalendar() {
    var per = S.perDay(), max = 0, k; for (k in per) if (per[k] > max) max = per[k];
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var dow = (today.getDay() + 6) % 7, start = new Date(today); start.setDate(start.getDate() - dow - 25 * 7);
    var html = '', d = new Date(start);
    while (d <= today) {
      var key = S.dayKey(d), c = per[key] || 0, lv = c ? Math.min(4, Math.ceil(4 * c / Math.max(1, max))) : 0;
      html += '<button class="hc' + (lv ? ' l' + lv : '') + '" data-d="' + key + '" aria-label="' + fmtD(d) + ', ' + T('событий') + ': ' + c + '" title="' + fmtD(d) + ': ' + c + '"></button>';
      d.setDate(d.getDate() + 1);
    }
    var heat = $('#heat'); heat.innerHTML = html;
    var sc = heat.parentNode; sc.scrollLeft = sc.scrollWidth;
    $('#dayInfo').textContent = max ? 'Нажмите на день, чтобы увидеть подробности.' : 'Пока нет данных. Сохраните события в журнал или посмотрите демо на экране «Пульс».';
    var rows = S.seasonTable();
    $('#season tbody').innerHTML = rows.length ? rows.map(function (r) {
      var s = S.species[r.id]; return '<tr><td>' + esc(spName(r.id)) + (s ? '<small>' + esc(s.lat) + '</small>' : '') + '</td><td>' + fmtD(r.first) + '</td><td>' + fmtD(r.last) + '</td><td>' + r.n + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="hint">Подтверждённых видов в этом году пока нет.</td></tr>';
  }
  $('#heat').addEventListener('click', function (e) {
    var b = e.target.closest('.hc'); if (!b) return;
    $$('#heat .hc.sel').forEach(function (x) { x.classList.remove('sel'); }); b.classList.add('sel');
    var key = b.dataset.d, list = S.get().dets.filter(function (d) { return d.status !== 'rejected' && S.dayKey(d.ts) === key; });
    var by = {}, un = 0; list.forEach(function (d) { if (d.species) by[d.species] = (by[d.species] || 0) + 1; else un++; });
    var parts = Object.keys(by).map(function (id) { return spName(id) + ' ' + by[id]; });
    if (un) parts.push(T('не проверено {n}', { n: un }));
    var p = key.split('-'); $('#dayInfo').textContent = p[2] + '.' + p[1] + '.' + p[0] + ': ' + (list.length ? list.length + ' ' + plural(list.length, 'событие', 'события', 'событий') + '. ' + parts.join(', ') : T('тишина'));
  });

  /* ---------- data ---------- */
  function renderVoices() {
    var st = S.ownStats(), ul = $('#voicesList'); if (!ul) return;
    ul.innerHTML = st.length ? st.map(function (x) { return '<li><span class="nm">' + esc(S.nameOf(x.id)) + '</span><span class="tm">' + x.n + ' ' + plural(x.n, 'образец', 'образца', 'образцов') + '</span></li>'; }).join('')
      : '<li><span class="hint">Пока пусто. Загрузите запись, выберите вид (в том числе «Другой вид...», например пеликана), нажмите «Верно» и сохраните.</span></li>';
  }
  function renderData() {
    renderVoices();
    var st = S.get().station; $('#stName').value = st.name || ''; $('#stLat').value = st.lat == null ? '' : st.lat; $('#stLon').value = st.lon == null ? '' : st.lon; $('#stMsg').textContent = '';
  }
  $('#stSave').addEventListener('click', function () {
    var lat = parseFloat($('#stLat').value.replace(',', '.')), lon = parseFloat($('#stLon').value.replace(',', '.'));
    var st = S.get().station; st.name = ($('#stName').value || 'Станция').trim().slice(0, 40);
    st.lat = isFinite(lat) && Math.abs(lat) <= 90 ? lat : null; st.lon = isFinite(lon) && Math.abs(lon) <= 180 ? lon : null;
    S.save(); $('#stMsg').textContent = 'Сохранено'; toast('Станция сохранена');
  });
  $('#geoBtn').addEventListener('click', function () {
    if (!navigator.geolocation) { $('#stMsg').textContent = 'Геолокация недоступна'; return; }
    $('#stMsg').textContent = 'Определяю...';
    navigator.geolocation.getCurrentPosition(function (p) { $('#stLat').value = p.coords.latitude.toFixed(5); $('#stLon').value = p.coords.longitude.toFixed(5); $('#stMsg').textContent = 'Готово, нажмите «Сохранить»'; },
      function () { $('#stMsg').textContent = 'Нет доступа к местоположению'; }, { enableHighAccuracy: true, timeout: 12000 });
  });
  $('#exCsv').addEventListener('click', function () { download('wetlandear-journal.csv', S.exportLog()); });
  $('#exDwc').addEventListener('click', function () { download('wetlandear-darwin-core.csv', S.exportDwC()); });
  $('#exTrain').addEventListener('click', function () { var j = JSON.parse(S.exportTraining()); download('wetlandear-training.json', JSON.stringify(j), 'application/json'); toast(T('Выгружено образцов: {n}', { n: j.items.length })); });
  $('#exJson').addEventListener('click', function () { download('wetlandear-backup.json', S.exportJSON(), 'application/json'); });
  $('#imJson').addEventListener('change', function () {
    var f = this.files[0], inp = this; if (!f) return;
    if (!confirm(T('Заменить текущие данные резервной копией?'))) { inp.value = ''; return; }
    f.text().then(function (t) { S.importJSON(t); toast('Данные восстановлены'); show('pulse'); }).catch(function () { toast('Это не резервная копия WetlandEar'); }).then(function () { inp.value = ''; });
  });
  $('#wipe').addEventListener('click', function () {
    if (confirm(T('Удалить все записи, события и настройки на этом устройстве? Это нельзя отменить.'))) { S.wipe(); toast('Все данные удалены'); show('pulse'); }
  });


  /* ---------- account ---------- */
  function initials(n) { return (n || '?').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function avatarHtml(me, cls) {
    return me.avatar ? '<img class="' + cls + '" src="' + esc(me.avatar) + '" alt="" referrerpolicy="no-referrer">' : '<span class="' + cls + ' ph">' + esc(initials(me.name)) + '</span>';
  }
  function renderAuth() {
    var box = $('#authBox'), me = window.WESync && WESync.me();
    if (!window.WESync || !WESync.ready()) { box.innerHTML = ''; return; }
    box.innerHTML = me
      ? '<button class="me" id="meBtn" aria-label="Профиль">' + avatarHtml(me, 'av') + '<span class="mn">' + esc(me.name.split(' ')[0]) + '</span></button>'
      : '<button class="btn primary sm" id="signInBtn">Войти через Google</button>';
    var b = $('#meBtn'); if (b) b.addEventListener('click', function () { show('profile'); });
    var s = $('#signInBtn'); if (s) s.addEventListener('click', doSignIn);
    refreshChrome();
  }
  function doSignIn() { WESync.signIn().catch(function () { toast('Не удалось начать вход. Попробуйте ещё раз.'); }); }
  function renderProfile() {
    var me = window.WESync && WESync.me();
    $('#profOut').hidden = !!me; $('#profIn').hidden = !me;
    if (!me) return;
    $('#profAvatar').innerHTML = avatarHtml(me, 'av big'); $('#profName').textContent = me.name; $('#profEmail').textContent = me.email || '';
    var dets = S.get().dets.filter(function (d) { return !d.demo && d.status !== 'rejected'; }), spp = {};
    dets.forEach(function (d) { if (d.status === 'confirmed' && d.species) spp[d.species] = 1; });
    $('#pfEvents').textContent = dets.length; $('#pfConf').textContent = dets.filter(function (d) { return d.status === 'confirmed'; }).length; $('#pfSpp').textContent = Object.keys(spp).length;
    var st = WESync.status(); $('#pfSync').textContent = st.busy ? 'Синхронизирую...' : st.last ? T('Последняя синхронизация: {t}', { t: fmtDT(st.last.toISOString()) }) : 'Журнал хранится у вас на устройстве и копируется в облако.';
    renderTg(); renderMcp();
    WESync.getProfile().then(function (p) { $('#pfName').value = p.display_name || me.name || ''; $('#pfOrg').value = p.organization || ''; $('#pfRole').value = p.role || ''; }).catch(function () { $('#pfName').value = me.name || ''; });
  }
  /* Personal keys for AI assistants (MCP) */
  function renderMcp() {
    var box = $('#mcpBody'); if (!box || !window.WESync || !WESync.me()) return;
    WESync.keyList().then(function (rows) {
      var list = rows.length ? '<ul class="keys">' + rows.map(function (k) {
        return '<li><span>' + esc(k.label || T('Ключ')) + ' · ' + esc(fmtDT(k.created_at)) + (k.last_used ? ' · ' + esc(T('использован') + ' ' + fmtDT(k.last_used)) : '') + '</span> <button class="btn no" data-h="' + esc(k.token_hash) + '">' + esc(T('Отозвать')) + '</button></li>'; }).join('') + '</ul>' : '';
      box.innerHTML = list + '<div class="row wrap"><input id="mcpLabel" maxlength="40" placeholder="' + esc(T('Название ключа, например Claude Desktop')) + '"><button class="btn primary" id="mcpNew">' + esc(T('Создать ключ')) + '</button></div><div id="mcpShow"></div>';
      Array.prototype.forEach.call(box.querySelectorAll('button[data-h]'), function (b) { b.addEventListener('click', function () { if (confirm(T('Отозвать этот ключ? Ассистент, который его использует, потеряет доступ.'))) WESync.keyRemove(b.dataset.h).then(renderMcp).catch(function () { toast(T('Не удалось сохранить')); }); }); });
      $('#mcpNew').addEventListener('click', function () {
        WESync.keyCreate($('#mcpLabel').value.trim()).then(function (key) {
          var cmd = 'claude mcp add --transport http wetlandear https://app.wetlandear.tech/mcp --header "Authorization: Bearer ' + key + '"';
          $('#mcpShow').innerHTML = '<p class="hint"><b>' + esc(T('Скопируйте ключ сейчас: потом он не будет показан.')) + '</b></p><pre class="code" id="mcpKey">' + esc(key) + '</pre><p class="hint">Claude Code:</p><pre class="code" id="mcpCmd">' + esc(cmd) + '</pre>' +
            '<p class="hint">' + esc(T('Claude Desktop и другие клиенты: адрес https://app.wetlandear.tech/mcp, заголовок Authorization со значением Bearer и ключом.')) + '</p><div class="row wrap"><button class="btn" id="mcpCopy">' + esc(T('Скопировать ключ')) + '</button></div>';
          $('#mcpCopy').addEventListener('click', function () { try { navigator.clipboard.writeText(key).then(function () { toast(T('Скопировано')); }); } catch (e) { toast(T('Выделите и скопируйте вручную')); } });
        }).catch(function () { toast(T('Не удалось создать ключ. Возможно, администратор ещё не применил обновление базы.')); });
      });
    }).catch(function () { box.innerHTML = '<p class="hint">' + esc(T('Ключи пока недоступны: администратору нужно применить обновление базы данных.')) + '</p>'; });
  }
  /* Telegram morning report */
  function renderTg() {
    var box = $('#tgBody'); if (!box || !window.WESync || !WESync.me()) return;
    var bot = (window.WE_CONFIG && WE_CONFIG.telegramBot) || '';
    if (!bot) { box.innerHTML = '<p class="hint">' + esc(T('Бот пока не подключён администратором. Отчёт можно отправить вручную на экране «Утренний отчёт».')) + '</p>'; return; }
    box.innerHTML = '<p class="hint">' + esc(T('Загружаю...')) + '</p>';
    WESync.tgGet().then(function (row) {
      var lang = window.WEi18n ? WEi18n.lang : 'ru';
      if (row && row.chat_id) {
        box.innerHTML = '<p><span class="chip ok">' + esc(T('Подключено')) + '</span> ' + esc(row.enabled ? T('Отчёты включены') : T('Отчёты выключены')) + '</p>' +
          '<div class="row wrap"><button class="btn" id="tgToggle">' + esc(row.enabled ? T('Выключить') : T('Включить')) + '</button><button class="btn" id="tgLang">' + esc(T('Язык отчёта') + ': ' + row.lang.toUpperCase()) + '</button>' +
          '<button class="btn" id="tgAlerts">' + esc(row.alerts === false ? T('Мгновенные тревоги: выкл') : T('Мгновенные тревоги: вкл')) + '</button>' + '<button class="btn" id="tgTest">' + esc(T('Отправить тестовый отчёт')) + '</button><button class="btn no" id="tgOff">' + esc(T('Отключить Telegram')) + '</button></div>';
        $('#tgToggle').addEventListener('click', function () { WESync.tgSet({ enabled: !row.enabled }).then(renderTg).catch(function () { toast(T('Не удалось сохранить')); }); });
        $('#tgLang').addEventListener('click', function () { WESync.tgSet({ lang: row.lang === 'ru' ? 'en' : 'ru' }).then(renderTg).catch(function () { toast(T('Не удалось сохранить')); }); });
        $('#tgAlerts').addEventListener('click', function () { WESync.tgSet({ alerts: row.alerts === false }).then(renderTg).catch(function () { toast(T('Не удалось сохранить')); }); });
        $('#tgTest').addEventListener('click', function () {
          toast(T('Отправляю...'));
          WESync.tgTest().then(function (r) { toast(r.status === 200 ? (r.body.sent ? T('Отчёт отправлен в Telegram') : T('За 7 дней событий нет, отправлять нечего')) : T('Не удалось отправить. Проверьте подключение.')); }).catch(function () { toast(T('Не удалось отправить. Проверьте подключение.')); });
        });
        $('#tgOff').addEventListener('click', function () { if (confirm(T('Отключить Telegram?'))) WESync.tgRemove().then(function () { toast(T('Telegram отключён')); renderTg(); }); });
      } else if (row && row.code) {
        box.innerHTML = '<p class="hint">' + esc(T('Откройте Telegram, нажмите Start, затем вернитесь и обновите.')) + '</p>' +
          '<div class="row wrap"><a class="btn primary" target="_blank" rel="noopener" href="https://t.me/' + esc(bot) + '?start=' + esc(row.code) + '">' + esc(T('Открыть Telegram')) + '</a><button class="btn" id="tgRefresh">' + esc(T('Обновить')) + '</button></div>';
        $('#tgRefresh').addEventListener('click', renderTg);
      } else {
        box.innerHTML = '<div class="row"><button class="btn primary" id="tgConn">' + esc(T('Подключить Telegram')) + '</button></div>';
        $('#tgConn').addEventListener('click', function () { WESync.tgConnect(lang).then(renderTg).catch(function () { toast(T('Не удалось сохранить')); }); });
      }
    }).catch(function () { box.innerHTML = '<p class="hint">' + esc(T('Не удалось загрузить настройки Telegram.')) + '</p>'; });
  }
  $('#signBannerBtn').addEventListener('click', doSignIn);
  $('#profSignIn').addEventListener('click', doSignIn);
  $('#pfOut').addEventListener('click', function () { WESync.signOut().then(function () { toast('Вы вышли'); show('pulse'); }); });
  $('#pfSave').addEventListener('click', function () {
    var me = WESync.me(); if (!me) return;
    WESync.saveProfile({ display_name: $('#pfName').value.trim().slice(0, 60), organization: $('#pfOrg').value.trim().slice(0, 80), role: $('#pfRole').value.trim().slice(0, 60), avatar_url: me.avatar })
      .then(function () { $('#pfMsg').textContent = 'Сохранено'; toast('Профиль сохранён'); }).catch(function () { $('#pfMsg').textContent = 'Не удалось сохранить'; });
  });
  $('#pfSyncBtn').addEventListener('click', function () {
    toast('Синхронизирую...');
    WESync.syncNow(false).then(function () { toast('Готово'); renderProfile(); refreshChrome(); if (current === 'pulse') renderPulse(); }).catch(function () { toast('Не удалось синхронизировать'); });
  });
  if (window.WESync) {
    WESync.onChange(function () { renderAuth(); if (current === 'profile') renderProfile(); if (current === 'pulse') renderPulse(); if (current === 'review') loadReview(); if (sess && sess.s48) scheduleIdentify(0); });
    WESync.init().then(renderAuth).catch(function () { });
  }

  /* ---------- language ---------- */
  function langButtons() { var l = window.WEi18n ? WEi18n.lang : 'ru'; $$('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.lang === l ? 'true' : 'false'); b.classList.toggle('on', b.dataset.lang === l); }); }
  if (window.WEi18n) {
    $$('.lang button').forEach(function (b) { b.addEventListener('click', function () { WEi18n.set(b.dataset.lang); }); });
    WEi18n.onChange(function () {
      $('#sensVal').textContent = $('#sens').value + ' ' + T('дБ');
      if (sess) { renderEvents(); $('#resMeta').textContent = Math.round(sess.dur * 10) / 10 + ' ' + T('сек') + ' · ' + fmtDT(sess.start); if (lastAll) recordingSummary(lastAll); }
      renderAuth(); show(current); langButtons();
    });
    WEi18n.init(); langButtons();
  }

  /* ---------- start ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { });
  show((location.hash || '#pulse').slice(1));
  window.WEApp = { analyze: analyze, show: show, toast: toast, esc: esc, fmtDT: fmtDT, fmtD: fmtD, spName: spName, plural: plural, lvlBadge: lvlBadge, refreshChrome: refreshChrome, speciesOptions: speciesOptions, sndHtml: sndHtml, current: function () { return current; } };
})();
