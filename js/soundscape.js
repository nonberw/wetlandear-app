/* WetlandEar App: soundscape (acoustic indices per recording and their trend) and the dawn chorus clock.
   Indices are computed on the device from the spectrogram of every recording that is analysed:
   ACI  acoustic complexity (Pieretti et al. 2011), NDSI  normalised difference soundscape index (Kasten et al. 2012),
   BI   bioacoustic index (Boelman et al. 2007), H  acoustic entropy (Sueur et al. 2008).
   They are relative numbers: compare recordings made with the same microphone and settings. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp, esc = A.esc;
  function $(s, r) { return (r || document).querySelector(s); }
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  function pad(n) { return ('0' + n).slice(-2); }

  /* ---------- indices from a spectrogram (sp.raw: dB per frame and bin, band 0.8 to 10 kHz) ---------- */
  function compute(sp) {
    if (!sp || !sp.raw || sp.frames < 430) return null;   /* at least about 10 seconds */
    var F = sp.frames, NB = sp.bins, db = sp.raw, binHz = sp.binHz, f0 = sp.fmin, fps = sp.sr / sp.hop, f, k;
    var Jw = Math.max(40, Math.round(5 * fps)), nWin = Math.floor(F / Jw);
    if (nWin < 1) return null;
    /* ACI: for every frequency bin, summed absolute change of amplitude between neighbouring frames, divided by the summed amplitude, per 5 s window; summed over bins; averaged over windows */
    var aci = 0, w, d, s, prev, cur;
    for (w = 0; w < nWin; w++) {
      var total = 0;
      for (k = 0; k < NB; k++) {
        d = 0; s = 0; prev = Math.pow(10, db[w * Jw * NB + k] / 20); s = prev;
        for (f = w * Jw + 1; f < (w + 1) * Jw; f++) { cur = Math.pow(10, db[f * NB + k] / 20); d += Math.abs(cur - prev); s += cur; prev = cur; }
        total += s > 0 ? d / s : 0;
      }
      aci += total;
    }
    aci /= nWin;
    /* mean power and mean dB per bin */
    var pw = new Float64Array(NB), md = new Float64Array(NB), env = new Float64Array(F);
    for (f = 0; f < F; f++) { var e = 0; for (k = 0; k < NB; k++) { var v = db[f * NB + k]; pw[k] += Math.pow(10, v / 10); md[k] += v; e += Math.pow(10, v / 20); } env[f] = e; }
    for (k = 0; k < NB; k++) { pw[k] /= F; md[k] /= F; }
    var hzOf = function (kk) { return f0 + kk * binHz; };
    /* NDSI: anthrophony 1-2 kHz against the strongest 1 kHz band of biophony 2-8 kHz */
    var band = function (lo, hi) { var sum = 0, n = 0; for (k = 0; k < NB; k++) { var hz = hzOf(k); if (hz >= lo && hz < hi) { sum += pw[k]; n++; } } return n ? sum / n : 0; };
    var anth = band(1000, 2000), bio = 0, b; for (b = 2000; b < 8000; b += 1000) bio = Math.max(bio, band(b, b + 1000));
    var ndsi = (bio + anth) > 0 ? (bio - anth) / (bio + anth) : 0;
    /* BI: area of the mean spectrum (dB) above its minimum between 2 and 8 kHz */
    var mn = Infinity; for (k = 0; k < NB; k++) { var hz2 = hzOf(k); if (hz2 >= 2000 && hz2 < 8000 && md[k] < mn) mn = md[k]; }
    var bi = 0; for (k = 0; k < NB; k++) { var hz3 = hzOf(k); if (hz3 >= 2000 && hz3 < 8000) bi += (md[k] - mn) * (binHz / 1000); }
    /* H: spectral entropy of the mean spectrum times temporal entropy of the envelope, both normalised to 0..1 */
    var sp1 = 0; for (k = 0; k < NB; k++) sp1 += pw[k]; var hf = 0; for (k = 0; k < NB; k++) { var p = pw[k] / sp1; if (p > 0) hf -= p * Math.log2(p); } hf /= Math.log2(NB);
    var se = 0; for (f = 0; f < F; f++) se += env[f]; var ht = 0; for (f = 0; f < F; f++) { var q = env[f] / se; if (q > 0) ht -= q * Math.log2(q); } ht /= Math.log2(F);
    var r = function (x, n) { return Math.round(x * n) / n; };
    return { aci: r(aci, 100), ndsi: r(ndsi, 1000), bi: r(bi, 100), h: r(hf * ht, 1000) };
  }
  window.WEIndices = { compute: compute };

  /* ---------- soundscape card (calendar screen) ---------- */
  var IDX = {
    aci: { name: 'ACI', ru: 'Сложность звука', en: 'Sound complexity', nd: 1, hint: [
      'Выше, когда звук быстро и неравномерно меняется (птичье пение, стрекот), ниже при ровном шуме (ветер, мотор, вода).', 'Higher when the sound changes quickly and unevenly (bird song, insects), lower for steady noise (wind, engines, water).'] },
    ndsi: { name: 'NDSI', ru: 'Природа и человек', en: 'Nature vs people', nd: 2, hint: [
      'От −1 (почти только шум человека, 1–2 кГц) до +1 (почти только природа, 2–8 кГц).', 'From −1 (mostly human noise, 1-2 kHz) to +1 (mostly nature, 2-8 kHz).'] },
    bi: { name: 'BI', ru: 'Биоакустический индекс', en: 'Bioacoustic index', nd: 1, hint: [
      'Сколько звука в диапазоне 2–8 кГц, где поют большинство птиц. Выше значит громче и богаче «птичий» диапазон.', 'How much sound sits in 2-8 kHz, where most birds sing. Higher means a louder and richer bird band.'] },
    h: { name: 'H', ru: 'Звуковое разнообразие', en: 'Acoustic entropy', nd: 3, hint: [
      'От 0 до 1: выше, когда звук богат разными частотами и разнообразен во времени.', 'From 0 to 1: higher when the sound is rich in frequencies and varied over time.'] }
  };
  var cur = 'ndsi', soundDays = 90;
  function recsWithIdx() { return S.get().recs.filter(function (r) { return r.idx && r.start && !r.demo; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; }); }
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }
  function fmt(v, nd) { return v == null ? '–' : v.toFixed(nd); }
  function renderSound() {
    var box = $('#soundBody'); if (!box) return;
    var all = recsWithIdx();
    if (!all.length) { box.innerHTML = '<p class="hint">' + esc(L('Индексы считаются для каждой новой записи, которую вы анализируете (от 10 секунд). Загрузите запись или целую папку с карты памяти станции, и здесь появится тренд по сезонам.', 'Indices are computed for every new recording you analyse (10 seconds or longer). Upload a recording or a whole memory-card folder and the seasonal trend appears here.')) + '</p>'; return; }
    var from = Date.now() - soundDays * 864e5, recs = all.filter(function (r) { return +new Date(r.start) >= from; }), I = IDX[cur];
    var vals = recs.map(function (r) { return r.idx[cur]; }).filter(function (v) { return v != null; });
    var half = Date.now() - soundDays / 2 * 864e5, a = mean(recs.filter(function (r) { return +new Date(r.start) < half; }).map(function (r) { return r.idx[cur]; })), b = mean(recs.filter(function (r) { return +new Date(r.start) >= half; }).map(function (r) { return r.idx[cur]; }));
    var tabs = Object.keys(IDX).map(function (k) { return '<button data-i="' + k + '" class="' + (k === cur ? 'on' : '') + '">' + IDX[k].name + '</button>'; }).join('');
    /* chart: every recording as a dot, plus a 7-day moving average */
    var W = 600, H = 170, pl = 34, pr = 10, pt = 10, pb = 24, t0 = from, t1 = Date.now(), lo = Math.min.apply(null, vals.concat([cur === 'ndsi' ? -1 : 0])), hi = Math.max.apply(null, vals.concat([cur === 'ndsi' ? 1 : (cur === 'h' ? 1 : 0.01)]));
    if (hi === lo) hi = lo + 1;
    var sx = function (t) { return pl + (t - t0) / (t1 - t0) * (W - pl - pr); }, sy = function (v) { return pt + (H - pt - pb) * (1 - (v - lo) / (hi - lo)); };
    var dots = recs.map(function (r) { return '<circle cx="' + sx(+new Date(r.start)).toFixed(1) + '" cy="' + sy(r.idx[cur]).toFixed(1) + '" r="3" fill="#6F97FF" fill-opacity=".7"/>'; }).join('');
    var line = []; for (var d = 0; d <= soundDays; d += 2) { var tc = t0 + d * 864e5, near = recs.filter(function (r) { return Math.abs(+new Date(r.start) - tc) <= 3.5 * 864e5; }).map(function (r) { return r.idx[cur]; }); if (near.length >= 2) line.push(sx(tc).toFixed(1) + ',' + sy(mean(near)).toFixed(1)); }
    var ticks = [lo, (lo + hi) / 2, hi].map(function (v) { return '<text x="2" y="' + (sy(v) + 3).toFixed(1) + '" font-size="10" fill="#6B7A99">' + v.toFixed(I.nd > 1 ? 1 : 0) + '</text><line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + sy(v).toFixed(1) + '" y2="' + sy(v).toFixed(1) + '" stroke="#E3ECFA"/>'; }).join('');
    var xl = [0, .25, .5, .75, 1].map(function (f) { var t = t0 + f * (t1 - t0), dt = new Date(t); return '<text x="' + sx(t).toFixed(1) + '" y="' + (H - 6) + '" font-size="10" fill="#6B7A99" text-anchor="middle">' + pad(dt.getDate()) + '.' + pad(dt.getMonth() + 1) + '</text>'; }).join('');
    var chart = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(L(I.ru, I.en)) + '">' + ticks + dots + (line.length > 1 ? '<polyline points="' + line.join(' ') + '" fill="none" stroke="#1F5BFF" stroke-width="2.4" stroke-linejoin="round"/>' : '') + xl + '</svg>';
    var delta = a != null && b != null ? b - a : null;
    var cmp = delta == null ? '' : ' · ' + esc(L('вторая половина периода против первой: ', 'second half of the period against the first: ')) + (delta >= 0 ? '+' : '−') + Math.abs(delta).toFixed(I.nd);
    /* by month: mean per month for every year seen */
    var by = {}; all.forEach(function (r) { var dt = new Date(r.start), y = dt.getFullYear(), m = dt.getMonth(); (by[y] = by[y] || {})[m] = (by[y][m] || []).concat([r.idx[cur]]); });
    var years = Object.keys(by).sort(), MON = lang3() === 'en' ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] : ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    var table = '<table class="sz"><tr><th></th>' + MON.map(function (m) { return '<th>' + m + '</th>'; }).join('') + '</tr>' + years.map(function (y) { return '<tr><th>' + y + '</th>' + MON.map(function (_, m) { var v = by[y][m] ? mean(by[y][m]) : null; return '<td' + (v == null ? '' : ' style="--a:' + (0.15 + 0.85 * (v - lo) / (hi - lo)).toFixed(2) + '"') + '>' + (v == null ? '' : v.toFixed(I.nd > 1 ? 1 : 0)) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>';
    box.innerHTML = '<div class="seg wide" id="soundTabs">' + tabs + '</div><h3>' + esc(L(I.ru, I.en)) + ' <small>' + I.name + '</small></h3><p class="hint">' + esc(L(I.hint[0], I.hint[1])) + '</p>' +
      '<div class="seg" id="soundDays"><button data-d="30" class="' + (soundDays === 30 ? 'on' : '') + '">' + esc(L('30 дней', '30 days')) + '</button><button data-d="90" class="' + (soundDays === 90 ? 'on' : '') + '">' + esc(L('90 дней', '90 days')) + '</button><button data-d="365" class="' + (soundDays === 365 ? 'on' : '') + '">' + esc(L('Год', 'Year')) + '</button></div>' +
      (vals.length ? '<p class="recsum"><b>' + esc(L('Среднее: ', 'Mean: ')) + fmt(mean(vals), I.nd) + '</b> · ' + esc(L('записей: ', 'recordings: ')) + vals.length + cmp + '</p>' + chart + '<p class="hint">' + esc(L('Точки: отдельные записи, линия: скользящее среднее за 7 дней.', 'Dots: single recordings, line: 7-day moving average.')) + '</p>' : '<p class="hint">' + esc(L('За этот период записей с индексами нет.', 'No recordings with indices in this period.')) + '</p>') +
      '<h4>' + esc(L('Среднее по месяцам', 'Monthly mean')) + '</h4>' + table +
      '<p class="hint">' + esc(L('Индексы относительные: сравнивайте записи, сделанные одним микрофоном с одинаковыми настройками. Ветер, дождь и техника сдвигают значения, поэтому смотрите на тренд за недели, а не на одну запись. Считаются в диапазоне 0,8–10 кГц на устройстве.', 'The indices are relative: compare recordings made with the same microphone and settings. Wind, rain and machinery shift the values, so look at the trend over weeks, not at one recording. Computed in the 0.8-10 kHz band on the device.')) + '</p>' +
      '<div class="row wrap"><button class="btn" id="soundCsv">' + esc(L('Скачать CSV', 'Download CSV')) + '</button></div>';
    [].forEach.call(box.querySelectorAll('#soundTabs button'), function (x) { x.addEventListener('click', function () { cur = x.dataset.i; renderSound(); }); });
    [].forEach.call(box.querySelectorAll('#soundDays button'), function (x) { x.addEventListener('click', function () { soundDays = +x.dataset.d; renderSound(); }); });
    $('#soundCsv').addEventListener('click', function () {
      var rows = [['recording', 'start', 'duration_s', 'station', 'ACI', 'NDSI', 'BI', 'H']].concat(all.map(function (r) { return [r.name || '', r.start, Math.round(r.dur || 0), r.station || '', r.idx.aci, r.idx.ndsi, r.idx.bi, r.idx.h]; }));
      var blob = new Blob(['﻿' + rows.map(function (r) { return r.join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' }), el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = 'wetlandear-soundscape-indices.csv'; document.body.appendChild(el); el.click(); setTimeout(function () { URL.revokeObjectURL(el.href); el.remove(); }, 500);
    });
  }
  function lang3() { return window.WEi18n ? window.WEi18n.lang : 'ru'; }

  /* ---------- dawn chorus clock ---------- */
  var PAL = ['#1F5BFF', '#0EA5C9', '#7A5CFA', '#14804A', '#D97706', '#C2362F', '#0B7285', '#9333EA'];
  var anim = { raf: 0, t: 0, playing: false, last: 0 };
  function station() {
    var st = S.get().station || {};
    if (st.lat != null && st.lon != null) return { lat: +st.lat, lon: +st.lon };
    var pts = S.get().dets.filter(function (d) { return d.lat != null && d.lon != null && !d.demo; });
    return pts.length ? { lat: pts[0].lat, lon: pts[0].lon } : { lat: 50.6, lon: 69.0 };
  }
  function sunTimes(lat, lon, date) {
    var rad = Math.PI / 180, N = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(date.getFullYear(), 0, 0)) / 864e5), g = 2 * Math.PI / 365 * (N - 1);
    var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var c = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
    if (c < -1 || c > 1) return null;
    var ha = Math.acos(c) / rad, off = -date.getTimezoneOffset();   /* minutes from UTC of this device */
    var rise = (720 - 4 * (lon + ha) - eq + off) / 60, set = (720 - 4 * (lon - ha) - eq + off) / 60;
    return { rise: ((rise % 24) + 24) % 24, set: ((set % 24) + 24) % 24 };
  }
  function polar(cx, cy, r, hour) { var a = (hour - 12) / 24 * 2 * Math.PI; return [cx + r * Math.sin(a), cy + r * Math.cos(a)]; }   /* noon at the top, midnight at the bottom */
  function arc(cx, cy, r0, r1, h0, h1) {
    var p = [polar(cx, cy, r1, h0), polar(cx, cy, r1, h1), polar(cx, cy, r0, h1), polar(cx, cy, r0, h0)];
    return 'M' + p[0].map(function (x) { return x.toFixed(1); }).join(',') + ' A' + r1 + ',' + r1 + ' 0 0 0 ' + p[1].map(function (x) { return x.toFixed(1); }).join(',') + ' L' + p[2].map(function (x) { return x.toFixed(1); }).join(',') + ' A' + r0 + ',' + r0 + ' 0 0 1 ' + p[3].map(function (x) { return x.toFixed(1); }).join(',') + ' Z';
  }
  var choirDays = 60;
  function choirData() {
    var from = Date.now() - choirDays * 864e5, by = {};
    S.get().dets.forEach(function (d) {
      if (d.status === 'rejected' || !d.species || d.demo) return; var t = +new Date(d.ts); if (t < from) return;
      if (d.status !== 'confirmed' && !(d.auto)) return;   /* confirmed by a person, or filled in by the model with enough confidence */
      var h = new Date(t).getHours(), s = by[d.species] = by[d.species] || { id: d.species, n: 0, h: new Array(24).fill(0) }; s.n++; s.h[h]++;
    });
    return Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 8);
  }
  function renderChoir() {
    var box = $('#choirBody'); if (!box) return;
    stopAnim();
    var sp = choirData();
    if (sp.length < 1) { box.innerHTML = '<p class="hint">' + esc(L('Нужны подтверждённые виды с часами событий. Подтвердите несколько событий, и здесь появятся часы хора.', 'Confirmed species with event times are needed. Confirm a few events and the chorus clock appears here.')) + '</p>'; return; }
    var cx = 180, cy = 180, r0 = 62, rw = (170 - r0) / sp.length, st = station(), sun = sunTimes(st.lat, st.lon, new Date());
    var sky = '';   /* the outer ring shows night and day for today at this place */
    for (var h = 0; h < 24; h += 0.5) { var day = sun ? (sun.rise < sun.set ? (h >= sun.rise && h < sun.set) : (h >= sun.rise || h < sun.set)) : (h >= 6 && h < 20); var twi = sun && !day && (Math.abs(h - sun.rise) < 1 || Math.abs(h - sun.set) < 1); sky += '<path d="' + arc(cx, cy, 172, 178, h, h + 0.5) + '" fill="' + (day ? '#FFD66B' : twi ? '#F5A97A' : '#17306B') + '"/>'; }
    var rings = '', labels = '';
    sp.forEach(function (s, i) {
      var mx = Math.max.apply(null, s.h.concat([1])), ra = r0 + i * rw, rb = ra + rw - 2;
      for (var hh = 0; hh < 24; hh++) { var v = s.h[hh] / mx; rings += '<path class="seg" data-i="' + i + '" data-h="' + hh + '" d="' + arc(cx, cy, ra, rb, hh, hh + 1) + '" fill="' + PAL[i % PAL.length] + '" fill-opacity="' + (v === 0 ? 0.07 : (0.2 + 0.8 * v).toFixed(2)) + '"><title>' + esc(A.spName(s.id)) + ' · ' + pad(hh) + ':00 · ' + s.h[hh] + '</title></path>'; }
    });
    var hours = [0, 6, 12, 18].map(function (hh) { var p = polar(cx, cy, 190, hh); return '<text x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4).toFixed(1) + '" text-anchor="middle" font-size="12" fill="#55657F">' + pad(hh) + '</text>'; }).join('');
    var legend = sp.map(function (s, i) { return '<li><i style="background:' + PAL[i % PAL.length] + '"></i>' + esc(A.spName(s.id)) + ' <b>' + s.n + '</b></li>'; }).join('');
    box.innerHTML = '<div class="choir"><svg id="choirSvg" viewBox="0 0 360 380" role="img" aria-label="' + esc(L('Когда поёт каждый вид', 'When each species sings')) + '"><defs><radialGradient id="skyG"><stop offset="0" stop-color="#EAF1FF"/><stop offset="1" stop-color="#C9DBFF"/></radialGradient></defs>' + sky +
      '<circle id="choirDisc" cx="' + cx + '" cy="' + cy + '" r="' + (r0 - 6) + '" fill="url(#skyG)"/>' + rings + hours + '<line id="choirHand" x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy + 165) + '" stroke="#0B1B3A" stroke-width="2" stroke-linecap="round" opacity=".0"/><circle cx="' + cx + '" cy="' + cy + '" r="4" fill="#0B1B3A"/>' +
      '<text id="choirTime" x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle" font-size="22" font-weight="700" fill="#0B1B3A" opacity="0"></text></svg>' +
      '<div class="choir-side"><div class="row wrap"><button class="btn primary" id="choirPlay">▶ ' + esc(L('Показать сутки', 'Play the day')) + '</button><div class="seg" id="choirDays"><button data-d="30" class="' + (choirDays === 30 ? 'on' : '') + '">30</button><button data-d="60" class="' + (choirDays === 60 ? 'on' : '') + '">60</button><button data-d="365" class="' + (choirDays === 365 ? 'on' : '') + '">' + esc(L('год', 'year')) + '</button></div></div>' +
      '<p class="recsum" id="choirNow">' + esc(L('Нажмите «Показать сутки»: стрелка пройдёт по часам, а ниже будет видно, кто поёт.', 'Press "Play the day": the hand sweeps the hours and below you see who is singing.')) + '</p><ul class="legend">' + legend + '</ul></div></div>' +
      '<p class="hint">' + esc(L('Каждое кольцо один вид, секторы часы суток (полдень сверху, полночь снизу), насыщенность показывает, насколько вид активен в этот час. Внешняя дуга: ночь, сумерки и день сегодня на вашей станции. Берутся события, подтверждённые вами или выбранные моделью с высокой уверенностью.', 'Each ring is one species, the sectors are the hours of the day (noon at the top, midnight at the bottom), the colour strength shows how active the species is in that hour. The outer arc: night, twilight and day today at your station. Events confirmed by you or filled in by the model with high confidence are used.')) + '</p>';
    [].forEach.call(box.querySelectorAll('#choirDays button'), function (x) { x.addEventListener('click', function () { choirDays = +x.dataset.d; renderChoir(); }); });
    $('#choirPlay').addEventListener('click', function () { if (anim.playing) stopAnim(); else playAnim(sp, sun, cx, cy); });
    box.addEventListener('mouseover', function (e) { var p = e.target.closest('.seg'); if (p && !anim.playing) hourInfo(sp, +p.dataset.h); });
  }
  function hourInfo(sp, hour) {
    var now = $('#choirNow'); if (!now) return;
    var act = sp.map(function (s) { return { id: s.id, n: s.h[hour] }; }).filter(function (x) { return x.n > 0; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 4);
    now.textContent = pad(hour) + ':00 · ' + (act.length ? L('поют: ', 'singing: ') + act.map(function (x) { return A.spName(x.id) + ' ' + x.n; }).join(', ') : L('тишина', 'silence'));
  }
  function stopAnim() { anim.playing = false; cancelAnimationFrame(anim.raf); var b = $('#choirPlay'); if (b) b.textContent = '▶ ' + L('Показать сутки', 'Play the day'); var hnd = $('#choirHand'), tm = $('#choirTime'); if (hnd) hnd.setAttribute('opacity', '0'); if (tm) tm.setAttribute('opacity', '0'); }
  function playAnim(sp, sun, cx, cy) {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches, DUR = reduce ? 4000 : 16000, t0 = performance.now(), start = 0;
    anim.playing = true; var b = $('#choirPlay'); if (b) b.textContent = '■ ' + L('Стоп', 'Stop');
    var hand = $('#choirHand'), tm = $('#choirTime'), disc = $('#choirDisc'); hand.setAttribute('opacity', '1'); tm.setAttribute('opacity', '1');
    var lastHour = -1;
    var tick = function (now) {
      if (!anim.playing) return;
      var f = Math.min(1, (now - t0) / DUR), hour = (start + f * 24) % 24, hi = Math.floor(hour);
      var ang = (hour - 12) / 24 * 360; hand.setAttribute('transform', 'rotate(' + (-ang) + ' ' + cx + ' ' + cy + ')');
      tm.textContent = pad(hi) + ':' + pad(Math.floor((hour - hi) * 60));
      /* the sky in the middle follows the sun: dark before sunrise, bright by day */
      var day = sun ? (sun.rise < sun.set ? (hour >= sun.rise && hour < sun.set) : (hour >= sun.rise || hour < sun.set)) : (hour >= 6 && hour < 20), near = sun && (Math.abs(hour - sun.rise) < 1 || Math.abs(hour - sun.set) < 1);
      disc.setAttribute('fill', day ? '#EAF1FF' : near ? '#F6D6C2' : '#26407F'); tm.setAttribute('fill', day || near ? '#0B1B3A' : '#FFFFFF');
      if (hi !== lastHour) { lastHour = hi; hourInfo(sp, hi); [].forEach.call(document.querySelectorAll('#choirSvg .seg'), function (el) { el.setAttribute('stroke', +el.dataset.h === hi ? '#0B1B3A' : 'none'); el.setAttribute('stroke-width', '0.8'); }); }
      if (f < 1) anim.raf = requestAnimationFrame(tick); else stopAnim();
    };
    anim.raf = requestAnimationFrame(tick);
  }

  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) { if (prev) prev(v); if (v === 'calendar') { renderChoir(); renderSound(); } else stopAnim(); };
  window.WESoundscape = { renderSound: renderSound, renderChoir: renderChoir };
  if (A.current() === 'calendar') { renderChoir(); renderSound(); }
})();
