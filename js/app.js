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
  function plural(n, a, b, c) { var m = n % 10, h = n % 100; return (m === 1 && h !== 11) ? a : (m >= 2 && m <= 4 && (h < 10 || h >= 20)) ? b : c; }
  function spName(id) { if (!id) return null; var s = S.species[id]; return s ? s.ru : String(id).replace(/^x:/, ''); }
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
    S.SPECIES.forEach(function (s) { h += '<option value="' + s[0] + '">' + esc(s[1]) + '</option>'; });
    h += '<option value="__other">Другой вид...</option>';
    sel.innerHTML = h;
  }
  function pickSpecies(sel) {
    if (sel.value === '__other') {
      var t = (prompt('Название вида') || '').trim().slice(0, 60);
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
  }
  $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.view); }); });
  $$('[data-go]').forEach(function (b) { b.addEventListener('click', function () { show(b.dataset.go); }); });
  window.addEventListener('hashchange', function () { show(location.hash.slice(1) || 'pulse'); });

  function refreshChrome() {
    $('#demoBanner').hidden = !S.hasDemo();
    var n = reviewQueue().length, b = $('#revCount'); b.textContent = n > 99 ? '99+' : n; b.hidden = !n;
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
      if (p.prev) { var d = c.score - p.prev.score; tr = d === 0 ? ' Как и неделю назад.' : ' На ' + Math.abs(d) + (d > 0 ? ' выше' : ' ниже') + ', чем неделей раньше.'; }
      $('#pulseText').textContent = c.events + ' ' + plural(c.events, 'событие', 'события', 'событий') + ' и ' + c.species + ' ' + plural(c.species, 'подтверждённый вид', 'подтверждённых вида', 'подтверждённых видов') + ' за неделю.' + tr;
      $('#stEvents').textContent = c.events;
      $('#stTrend').textContent = p.prev ? (c.events >= p.prev.events ? '▲ ' : '▼ ') + 'была ' + p.prev.events + ' неделей раньше' : 'за 7 дней';
      $('#stSpecies').textContent = c.species; $('#stVerified').textContent = Math.round(c.verified * 100) + '%';
      var rows = [['Разнообразие', c.parts.diversity, c.species + ' из 10'], ['Активность', c.parts.activity, c.events + ' из 60'], ['Доверие', c.parts.trust, Math.round(c.verified * 100) + '%']];
      $('#pulseBars').innerHTML = rows.map(function (r) { return '<div class="bar"><span>' + r[0] + '</span><i style="--w:0%"></i><em>' + r[2] + '</em></div>'; }).join('');
      requestAnimationFrame(function () { requestAnimationFrame(function () { $$('#pulseBars .bar i').forEach(function (el, i) { el.style.setProperty('--w', Math.round(rows[i][1] * 100) + '%'); }); }); });
    }
    var dets = S.get().dets.filter(function (d) { return d.status !== 'rejected'; }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; }).slice(0, 8);
    $('#recent').innerHTML = dets.length ? dets.map(function (d) {
      return '<li><span class="dotk ' + d.status + '"></span><span class="nm">' + esc(spName(d.species) || 'Звуковое событие') + (d.demo ? '<span class="badge">демо</span>' : '') + '</span><span class="tm">' + fmtDT(d.ts) + '</span></li>';
    }).join('') : '<li><span class="hint">Пока пусто.</span></li>';
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
    return D.decode(arrayBuffer).then(function (samples) {
      if (samples.length / D.SR > MAXSEC) { samples = samples.subarray(0, MAXSEC * D.SR); toast('Взяты первые 5 минут'); }
      if (samples.length < 4096) throw new Error('short');
      setStatus('Ищу звуковые события...');
      return new Promise(function (r) { setTimeout(r, 40); }).then(function () {
        var sp = D.spectrogram(samples);
        sess = { name: name, start: new Date(startMs || Date.now()).toISOString(), samples: samples, sp: sp, dur: sp.dur, saved: false, sel: -1, events: [] };
        var v = $('#sens').value; runDetect(+v);
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
    sess.sel = -1; $('#sensVal').textContent = snr + ' дБ';
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
    $('#resMeta').textContent = Math.round(sess.dur * 10) / 10 + ' сек · ' + fmtDT(sess.start);
    renderEvents();
  }
  function renderEvents() {
    var evs = sess.events, W = specSize(), fmin = sess.sp.fmin, fmax = sess.sp.fmax;
    $('#evTitle').textContent = evs.length ? 'События: ' + evs.length : 'События не найдены';
    $('#saveBtn').disabled = !evs.length || sess.saved; $('#saveBtn').textContent = sess.saved ? 'Сохранено' : 'Сохранить в журнал';
    $('#evLayer').innerHTML = evs.map(function (e, i) {
      var l = e.t0 / sess.dur * W, w = Math.max(6, (e.t1 - e.t0) / sess.dur * W);
      var top = (1 - (e.fHigh - fmin) / (fmax - fmin)) * SPECH, h = Math.max(8, (e.fHigh - e.fLow) / (fmax - fmin) * SPECH);
      return '<button class="ev ' + (e.status === 'confirmed' ? 'ok' : e.status === 'rejected' ? 'no' : '') + (i === sess.sel ? ' sel' : '') + '" data-i="' + i + '" style="left:' + l + 'px;width:' + w + 'px;top:' + top + 'px;height:' + h + 'px" aria-label="Событие ' + (i + 1) + '"></button>';
    }).join('');
    var ul = $('#events');
    ul.innerHTML = evs.map(function (e, i) {
      var nm = spName(e.species), st = e.status === 'confirmed' ? '<span class="badge ok">подтверждено человеком</span>' : e.status === 'rejected' ? '<span class="badge">ошибка</span>' : '';
      return '<li class="evc ' + (i === sess.sel ? 'sel ' : '') + (e.status === 'confirmed' ? 'ok' : e.status === 'rejected' ? 'no' : '') + '" data-i="' + i + '"><div><div class="t">' + (i + 1) + '. ' + esc(nm || D.describe(e)) + st + '</div>' +
        '<div class="m">' + e.t0.toFixed(1) + ' с, ' + (e.t1 - e.t0).toFixed(1) + ' с · ' + (e.fLow / 1000).toFixed(1) + ' до ' + (e.fHigh / 1000).toFixed(1) + ' кГц · +' + e.snr + ' дБ</div></div>' +
        '<button class="btn" data-a="play" aria-label="Слушать">▶</button>' +
        '<div class="acts"><select data-a="sp" aria-label="Вид"></select><button class="btn primary" data-a="yes">Верно</button><button class="btn no" data-a="no">Ошибка</button></div></li>';
    }).join('');
    $$('#events select').forEach(function (s, i) { speciesOptions(s, true); var sp = evs[i].species; if (sp) { if (!S.species[sp]) { var o = document.createElement('option'); o.value = sp; o.textContent = spName(sp); s.insertBefore(o, s.lastChild); } s.value = sp; } });
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
    if (a === 'yes') {
      var sel = $('select', li), id = pickSpecies(sel);
      if (!id) { toast('Сначала выберите вид'); sel.focus(); return; }
      ev.species = id; ev.status = 'confirmed'; sess.saved = false; renderEvents(); toast('Подтверждено: ' + spName(id)); return;
    }
    if (a === 'no') { ev.status = 'rejected'; ev.species = null; sess.saved = false; renderEvents(); return; }
  });
  $('#events').addEventListener('change', function (e) {
    if (e.target.dataset.a !== 'sp') return;
    var li = e.target.closest('.evc'), ev = sess.events[+li.dataset.i], id = pickSpecies(e.target); if (id) ev.species = id;
  });
  $('#sens').addEventListener('input', function () {
    if (!sess) { $('#sensVal').textContent = this.value + ' дБ'; return; }
    runDetect(+this.value); sess.saved = false; renderEvents();
  });
  $('#sensVal').textContent = $('#sens').value + ' дБ';

  $('#saveBtn').addEventListener('click', function () {
    if (!sess || sess.saved || !sess.events.length) return;
    var pad2 = Math.round(.25 * D.SR), clips = sess.events.map(function (e) {
      var a = Math.max(0, Math.floor(e.t0 * D.SR) - pad2), b = Math.min(sess.samples.length, Math.ceil(e.t1 * D.SR) + pad2), out = new Int16Array(b - a);
      for (var i = 0; i < out.length; i++) { var x = Math.max(-1, Math.min(1, sess.samples[a + i])); out[i] = x < 0 ? x * 32768 : x * 32767; }
      return out;
    });
    var evs = sess.events.map(function (e) { return { t0: e.t0, t1: e.t1, fLow: e.fLow, fHigh: e.fHigh, fPeak: e.fPeak, snr: e.snr, status: e.status, species: e.species, clipPad: .25 }; });
    S.addRecording({ name: sess.name, start: sess.start, dur: sess.dur }, evs, clips);
    sess.saved = true; renderEvents(); refreshChrome();
    toast('Сохранено: ' + evs.length + ' ' + plural(evs.length, 'событие', 'события', 'событий'));
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
        blob.arrayBuffer().then(function (ab) { analyze(ab, 'Запись ' + pad(new Date(start).getHours()) + ':' + pad(new Date(start).getMinutes()), start); });
      };
      mr.start(); $('#recBtn').classList.add('rec'); setStatus('');
      rec.timer = setInterval(function () { var s = Math.round((Date.now() - t0) / 1000); $('#recLab').textContent = 'Стоп ' + Math.floor(s / 60) + ':' + pad(s % 60); if (s >= MAXSEC) stopRec(); }, 250);
      $('#recLab').textContent = 'Стоп 0:00';
    }).catch(function () { setStatus('Нет доступа к микрофону. Разрешите его в настройках браузера или загрузите файл.', true); });
  });
  function stopRec() { if (rec && rec.mr.state !== 'inactive') rec.mr.stop(); }

  /* ---------- review ---------- */
  var queue = [], qi = 0, curClip = null, actx = null, srcNode = null;
  function reviewQueue() { return S.get().dets.filter(function (d) { return d.status === 'auto' && d.clip; }).sort(function (a, b) { return a.ts < b.ts ? -1 : 1; }); }
  function loadReview() {
    queue = reviewQueue(); qi = 0; refreshChrome(); showReview();
  }
  function showReview() {
    var empty = !queue.length || qi >= queue.length;
    $('#revEmpty').hidden = !empty; $('#revCard').hidden = empty;
    if (empty) { if (queue.length) $('#revEmpty b').textContent = 'Очередь закончилась'; else $('#revEmpty b').textContent = 'Очередь пуста'; return; }
    var d = queue[qi]; curClip = null;
    $('#revPos').textContent = (qi + 1) + ' из ' + queue.length;
    $('#revMeta').textContent = fmtDT(d.ts) + ' · ' + d.station + ' · ' + (d.fLow / 1000).toFixed(1) + ' до ' + (d.fHigh / 1000).toFixed(1) + ' кГц · +' + d.snr + ' дБ · ' + D.describe(d);
    var sel = $('#revSel'); speciesOptions(sel, true);
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
      html += '<button class="hc' + (lv ? ' l' + lv : '') + '" data-d="' + key + '" aria-label="' + fmtD(d) + ', событий: ' + c + '" title="' + fmtD(d) + ': ' + c + '"></button>';
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
    if (un) parts.push('не проверено ' + un);
    var p = key.split('-'); $('#dayInfo').textContent = p[2] + '.' + p[1] + '.' + p[0] + ': ' + (list.length ? list.length + ' ' + plural(list.length, 'событие', 'события', 'событий') + '. ' + parts.join(', ') : 'тишина');
  });

  /* ---------- data ---------- */
  function renderData() {
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
  $('#exCsv').addEventListener('click', function () { download('wetlandear-журнал.csv', S.exportLog()); });
  $('#exDwc').addEventListener('click', function () { download('wetlandear-darwin-core.csv', S.exportDwC()); });
  $('#exJson').addEventListener('click', function () { download('wetlandear-backup.json', S.exportJSON(), 'application/json'); });
  $('#imJson').addEventListener('change', function () {
    var f = this.files[0], inp = this; if (!f) return;
    if (!confirm('Заменить текущие данные резервной копией?')) { inp.value = ''; return; }
    f.text().then(function (t) { S.importJSON(t); toast('Данные восстановлены'); show('pulse'); }).catch(function () { toast('Это не резервная копия WetlandEar'); }).then(function () { inp.value = ''; });
  });
  $('#wipe').addEventListener('click', function () {
    if (confirm('Удалить все записи, события и настройки на этом устройстве? Это нельзя отменить.')) { S.wipe(); toast('Все данные удалены'); show('pulse'); }
  });

  /* ---------- start ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () { });
  show((location.hash || '#pulse').slice(1));
  window.WEApp = { analyze: analyze, show: show };
})();
