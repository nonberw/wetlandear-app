/* WetlandEar App: voices and datasets.
   - type-ahead species field (no long lists)
   - reference voice: listen to a Xeno-canto recording of the suggested species, or to your own sample
   - "my voices": a small classifier per taught species ("this voice against everything else"), trained in the browser off the main thread
   - teach wizard, labelled dataset import (folder with one sub-folder per species), dataset export (ZIP with audio and a table) */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp, D = window.WEDSP, B = window.WEBatch;
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  var esc = A.esc;
  function lang() { return window.WEi18n ? window.WEi18n.lang : 'ru'; }
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  function norm(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-яәіңғүұқөһ0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function pad(n) { return ('0' + n).slice(-2); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- species choices and the type-ahead field ---------- */
  function sciOf(id) {
    var s = S.species[id]; if (s) return s.lat;
    var en = String(id).replace(/^x:/, ''); return (window.WE_SCI && window.WE_SCI[en]) || '';
  }
  function choices() {
    var list = B.speciesChoices(), seen = {}, ru = window.WE_RU || {};
    list.forEach(function (c) { seen[c.id] = 1; });
    S.get().dets.forEach(function (d) {   /* species you named yourself earlier */
      if (d.species && !seen[d.species] && !d.demo) { seen[d.species] = 1; var en = String(d.species).replace(/^x:/, ''); list.push({ id: d.species, label: ru[en] || en, en: en, own: true }); }
    });
    return list.map(function (c) {
      var shown = lang() === 'en' ? (c.en || c.label) : c.label;
      return { id: c.id, label: shown, hay: norm([c.label, c.en, sciOf(c.id)].join(' ')), sci: sciOf(c.id), own: c.own };
    });
  }
  /* wraps an <input> into a type-ahead; the chosen species lands in input.dataset.id / dataset.name */
  function combo(input, onPick) {
    if (input.__combo) return input.__combo;
    var wrap = document.createElement('div'); wrap.className = 'combo'; input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    var list = document.createElement('ul'); list.className = 'combo-list'; list.hidden = true; list.setAttribute('role', 'listbox'); wrap.appendChild(list);
    input.setAttribute('autocomplete', 'off'); input.setAttribute('role', 'combobox');
    var items = [], cur = -1;
    function rank(q) {
      var all = choices(), toks = q.split(' ').filter(Boolean);
      var out = all.filter(function (c) { return toks.every(function (t) { return c.hay.indexOf(t) >= 0; }); });
      out.sort(function (a, b) { var as = norm(a.label).indexOf(q) === 0 ? 0 : 1, bs = norm(b.label).indexOf(q) === 0 ? 0 : 1; return as - bs || (b.own ? 1 : 0) - (a.own ? 1 : 0) || a.label.localeCompare(b.label); });
      return out.slice(0, 7);
    }
    function render() {
      var q = norm(input.value); items = q ? rank(q) : choices().filter(function (c) { return c.own; }).slice(0, 5);
      var typed = input.value.trim();
      var exact = items.some(function (c) { return norm(c.label) === q; });
      var html = items.map(function (c, i) { return '<li role="option" data-i="' + i + '" class="' + (i === cur ? 'on' : '') + '"><span>' + esc(c.label) + '</span>' + (c.sci ? '<em>' + esc(c.sci) + '</em>' : '') + '</li>'; }).join('');
      var close = items.some(function (c) { return norm(c.label).indexOf(q) === 0 || norm(c.sci).indexOf(q) === 0; });
      if (typed.length >= 2 && !exact && !close) html += '<li role="option" data-new="1" class="new"><span>＋ ' + esc(L('Новый вид', 'New species')) + ': «' + esc(typed) + '»</span><em>' + esc(L('если его нет в списке', 'if it is not in the list')) + '</em></li>';
      list.innerHTML = html; list.hidden = !html;
    }
    function pick(c) {
      input.value = c.label; input.dataset.id = c.id; input.dataset.name = c.label; list.hidden = true; cur = -1;
      input.dispatchEvent(new Event('pick')); if (onPick) onPick({ id: c.id, name: c.label });
    }
    input.addEventListener('input', function () { delete input.dataset.id; cur = -1; render(); });
    input.addEventListener('focus', render);
    input.addEventListener('keydown', function (e) {
      var n = list.children.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); cur = (cur + 1) % Math.max(n, 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cur = (cur - 1 + n) % Math.max(n, 1); render(); }
      else if (e.key === 'Enter' && !list.hidden) { var li = list.children[cur >= 0 ? cur : 0]; if (li) { e.preventDefault(); li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); } }
      else if (e.key === 'Escape') list.hidden = true;
    });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li'); if (!li) return; e.preventDefault();
      if (li.dataset.new) { var name = input.value.trim().slice(0, 80); pick({ id: 'x:' + name, label: name }); } else pick(items[+li.dataset.i]);
    });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) list.hidden = true; });
    input.__combo = { value: function () { return input.dataset.id ? { id: input.dataset.id, name: input.dataset.name } : null; }, reset: function () { input.value = ''; delete input.dataset.id; } };
    return input.__combo;
  }

  /* ---------- reference voice ---------- */
  var sources = null, refCount = {}, audio = null, refTimer = 0;
  function loadSources() {
    if (sources) return Promise.resolve(sources);
    return fetch('models/head_training_sources.csv').then(function (r) { return r.text(); }).then(function (t) {
      var m = {}; t.split('\n').slice(1).forEach(function (l) { var p = l.split(','); if (p.length >= 2 && p[1]) (m[p[0]] = m[p[0]] || []).push(p[1].trim()); });
      sources = m; return m;
    }).catch(function () { sources = {}; return sources; });
  }
  function refBar() {
    var b = $('#refBar'); if (b) return b;
    b = document.createElement('div'); b.id = 'refBar'; b.hidden = true; document.body.appendChild(b);
    b.addEventListener('click', function (e) {
      if (e.target.closest('[data-x="stop"]')) stopRef();
      if (e.target.closest('[data-x="next"]') && b.__spec) playRef(b.__spec);
    });
    return b;
  }
  function stopRef() { clearTimeout(refTimer); if (audio) { try { audio.pause(); } catch (e) { } audio = null; } var b = $('#refBar'); if (b) b.hidden = true; }
  function specName(spec) { if (spec.id) return A.spName(spec.id); return A.spName ? (spec.common ? S.sugName(spec) : spec.sci) : spec.sci; }
  function specSci(spec) { return spec.sci || sciOf(spec.id || '') || sciOf('x:' + (spec.common || '')); }
  function playOwn(spec, bar) {
    var id = spec.id || (spec.sci || spec.common ? S.sugId(spec) : null);
    var d = S.get().dets.filter(function (x) { return x.species === id && x.status === 'confirmed' && !x.demo; })[0];
    if (!d) { A.toast(L('Эталона для этого вида пока нет', 'There is no reference for this species yet')); return; }
    S.getClip(d.id).then(function (i16) {
      if (!i16) { A.toast(L('Эталона для этого вида пока нет', 'There is no reference for this species yet')); return; }
      var AC = window.AudioContext || window.webkitAudioContext; window.__actx = window.__actx || new AC(); var ctx = window.__actx; if (ctx.state === 'suspended') ctx.resume();
      var buf = ctx.createBuffer(1, i16.length, D.SR), ch = buf.getChannelData(0); for (var i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768;
      var src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
      bar.hidden = false; bar.__spec = null; bar.innerHTML = '♪ <b>' + esc(specName(spec)) + '</b> · ' + esc(L('ваш образец', 'your own sample')) + ' <button class="btn sm" data-x="stop">' + esc(L('Закрыть', 'Close')) + '</button>'; refTimer = setTimeout(stopRef, 6000);
    });
  }
  function playRef(spec) {
    var bar = refBar(), sci = specSci(spec), name = specName(spec);
    stopRef();
    loadSources().then(function (map) {
      var ids = sci && map[sci];
      if (!ids || !ids.length) { playOwn(spec, bar); return; }
      var k = refCount[sci] = ((refCount[sci] === undefined ? -1 : refCount[sci]) + 1) % ids.length, xc = ids[k];
      audio = new Audio('https://xeno-canto.org/' + xc + '/download'); audio.preload = 'auto';
      audio.play().catch(function () { A.toast(L('Не удалось включить эталон. Проверьте подключение.', 'Could not play the reference. Check your connection.')); stopRef(); });
      clearTimeout(refTimer); refTimer = setTimeout(stopRef, 25000);
      bar.hidden = false; bar.__spec = spec;
      bar.innerHTML = '♪ <b>' + esc(name) + '</b> · <a href="https://xeno-canto.org/' + esc(xc) + '" target="_blank" rel="noopener">XC' + esc(xc) + '</a> (' + (k + 1) + '/' + ids.length + ')' +
        ' <button class="btn sm" data-x="next">' + esc(L('Другая запись', 'Another')) + '</button><button class="btn sm" data-x="stop">' + esc(L('Стоп', 'Stop')) + '</button>';
    });
  }

  /* ---------- the classifier for your own voices ---------- */
  var BOUND = .35;   /* probability from which a voice counts as found: about 80% found, about 1% false alarms in tests with 5 recordings */
  var NEG = null, negLoading = null, worker = null, jobs = {}, jobSeq = 0, models = {}, evals = {}, training = false;
  function unpack(t) {
    var p = String(t).split('|'), sc = parseFloat(p[0]), bin = atob(p[1]), n = bin.length, v = new Float32Array(n), nn = 0, i, x;
    for (i = 0; i < n; i++) { x = bin.charCodeAt(i); if (x > 127) x -= 256; v[i] = x * sc; nn += v[i] * v[i]; }
    nn = Math.sqrt(nn) || 1; for (i = 0; i < n; i++) v[i] /= nn; return v;
  }
  function loadNeg() {
    if (NEG) return Promise.resolve(NEG);
    if (negLoading) return negLoading;
    negLoading = Promise.all([fetch('models/negatives.json').then(function (r) { return r.json(); }), fetch('models/negatives.bin').then(function (r) { return r.arrayBuffer(); })]).then(function (r) {
      var meta = r[0], q = new Int8Array(r[1]), f = new Float32Array(q.length); for (var i = 0; i < q.length; i++) f[i] = q[i] / 127;
      NEG = { d: meta.d, n: meta.n, sci: meta.sci, data: f }; return NEG;
    }).catch(function () { NEG = null; negLoading = null; return null; });
    return negLoading;
  }
  function getWorker() {
    if (worker) return worker;
    try { worker = new Worker('js/voice-worker.js'); } catch (e) { worker = null; return null; }
    worker.onmessage = function (e) { var j = jobs[e.data.id]; if (j) { delete jobs[e.data.id]; j(e.data); } };
    worker.onerror = function () { worker = null; };
    return worker;
  }
  function run(msg, transfer) { return new Promise(function (res, rej) { var w = getWorker(); if (!w) { rej(new Error('worker')); return; } msg.id = ++jobSeq; jobs[msg.id] = res; w.postMessage(msg, transfer || []); }); }
  function samplesOf(id) {
    var out = [], groups = [];
    S.get().dets.forEach(function (d) { if (d.species === id && d.status === 'confirmed' && d.emb && !d.demo) { try { out.push(unpack(d.emb)); groups.push(d.recId || d.id); } catch (e) { } } });
    return { vecs: out, groups: groups };
  }
  function negFor(sci) {
    var n = NEG, idx = []; for (var i = 0; i < n.n; i++) if (!sci || n.sci[i] !== sci) idx.push(i);
    var out = new Float32Array(idx.length * n.d); idx.forEach(function (r, k) { out.set(n.data.subarray(r * n.d, (r + 1) * n.d), k * n.d); }); return { data: out, n: idx.length };
  }
  function flat(vecs, d) { var f = new Float32Array(vecs.length * d); vecs.forEach(function (v, k) { f.set(v, k * d); }); return f; }
  /* train (or retrain) the voices whose samples changed; sequential, in the background */
  function refresh() {
    if (training) return Promise.resolve();
    var ids = Object.keys(S.ownStats().reduce(function (a, o) { if (o.n >= 3) a[o.id] = o.n; return a; }, {}));
    var todo = ids.filter(function (id) { var s = samplesOf(id); return !models[id] || models[id].n !== s.vecs.length; });
    if (!todo.length) return Promise.resolve();
    training = true;
    return loadNeg().then(function (neg) {
      if (!neg) return;
      var chain = Promise.resolve();
      todo.forEach(function (id) {
        chain = chain.then(function () {
          var s = samplesOf(id), nf = negFor(sciOf(id)), P = flat(s.vecs, neg.d);
          return run({ type: 'train', P: P, nP: s.vecs.length, N: nf.data, nN: nf.n, d: neg.d, iters: 300, lr: 2.0, l2: 1e-3 }).then(function (r) { models[id] = { w: r.w, b: r.b, n: s.vecs.length, d: neg.d, ok: r.negClaim <= .12 && r.selfFound >= .6, negClaim: r.negClaim, selfFound: r.selfFound }; });
        });
      });
      return chain;
    }).catch(function () { }).then(function () { training = false; });
  }
  function evaluate(id) {
    var s = samplesOf(id);
    if (new Set(s.groups).size < 3) return Promise.resolve(null);
    return loadNeg().then(function (neg) {
      if (!neg) return null; var nf = negFor(sciOf(id));
      return run({ type: 'eval', P: flat(s.vecs, neg.d), nP: s.vecs.length, groups: s.groups, N: nf.data, nN: nf.n, d: neg.d, iters: 300, lr: 2.0, l2: 1e-3 }).then(function (r) { evals[id] = { recall: r.recall, fa: r.falseAlarm, folds: r.folds, n: s.vecs.length }; return evals[id]; });
    }).catch(function () { return null; });
  }
  var origMatch = S.matchOwn;
  S.matchOwn = function (embStr) {
    var best = null;
    if (embStr) {
      var q; try { q = unpack(embStr); } catch (e) { q = null; }
      if (q) Object.keys(models).forEach(function (id) {
        var m = models[id]; if (!m.ok) return; var z = m.b; for (var j = 0; j < m.d; j++) z += m.w[j] * q[j];
        var p = 1 / (1 + Math.exp(-z));
        if (!best || p > best.p) best = { id: id, p: p, n: m.n };
      });
    }
    var fallback = origMatch(embStr); if (fallback && models[fallback.id] && models[fallback.id].ok) fallback = null;   /* the classifier decides for voices it has learned */
    var viaModel = best && best.p >= BOUND ? { id: best.id, sim: .72 + (best.p - BOUND) * (.28 / (1 - BOUND)), n: best.n } : null;
    if (viaModel && fallback) return viaModel.sim >= fallback.sim ? viaModel : fallback;
    return viaModel || fallback;
  };

  /* ---------- the Voices screen ---------- */
  function qual(n) { return n < 3 ? [L('мало', 'few'), 'low'] : n < 10 ? [L('хорошо', 'good'), 'mid'] : [L('отлично', 'great'), 'hi']; }
  function renderLib() {
    var box = $('#voiceLib'); if (!box) return;
    var stats = S.ownStats().filter(function (o) { return o.n > 0; });
    if (!stats.length) { box.innerHTML = '<p class="hint">' + esc(L('Пока нет ни одного голоса. Научите первый ниже: например, кудрявого пеликана.', 'No voices yet. Teach the first one below, for example the Dalmatian pelican.')) + '</p>'; return; }
    var recs = {}; S.get().dets.forEach(function (d) { if (d.status === 'confirmed' && d.emb && d.species && !d.demo) { (recs[d.species] = recs[d.species] || {})[d.recId || d.id] = 1; } });
    box.innerHTML = stats.map(function (o) {
      var q = qual(o.n), ev = evals[o.id], k = Object.keys(recs[o.id] || {}).length;
      var est = ev && ev.recall != null ? esc(L('находит ~', 'finds ~')) + Math.round(ev.recall * 100) + '%, ' + esc(L('ложных ~', 'false ~')) + Math.round((ev.fa || 0) * 100) + '%' : (k < 3 ? esc(L('оценка с 3 записей', 'estimate from 3 recordings')) : '<button class="link" data-est="' + esc(o.id) + '">' + esc(L('оценить', 'estimate')) + '</button>');
      var active = models[o.id] ? (models[o.id].ok ? '' : ' · <b class="warn">' + esc(L('голос пока не отличается от других звуков: добавьте больше разных записей и уберите лишние звуки', 'this voice is not yet distinct from other sounds: add more varied recordings and remove stray sounds')) + '</b>') : (o.n >= 3 ? ' · ' + esc(L('обучается...', 'training...')) : ' · ' + esc(L('нужно 3+ образца', '3+ samples needed')));
      return '<div class="voice" data-id="' + esc(o.id) + '"><div class="v-main"><b>' + esc(A.spName(o.id)) + '</b><small>' + esc(sciOf(o.id)) + '</small></div>' +
        '<div class="v-meta"><span class="chip q-' + q[1] + '">' + esc(q[0]) + '</span> ' + o.n + ' ' + esc(L('образцов', 'samples')) + ', ' + k + ' ' + esc(L('записей', 'recordings')) + active + '<br><small>' + est + '</small></div>' +
        '<div class="v-act"><button class="btn sm" data-v="ref">♪ ' + esc(L('Эталон', 'Reference')) + '</button><button class="btn sm" data-v="add">+ ' + esc(L('Записи', 'Add')) + '</button></div></div>';
    }).join('');
    $$('[data-est]', box).forEach(function (b) { b.addEventListener('click', function () { b.textContent = '...'; evaluate(b.dataset.est).then(renderLib); }); });
  }

  /* wizard */
  var W = { step: 1, species: null, items: [], files: 0, busy: false, result: null };
  function wiz() { return $('#wizBody'); }
  function playBuf(i16) {
    var AC = window.AudioContext || window.webkitAudioContext; window.__actx = window.__actx || new AC(); var ctx = window.__actx; if (ctx.state === 'suspended') ctx.resume();
    var buf = ctx.createBuffer(1, i16.length, D.SR), ch = buf.getChannelData(0); for (var i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768;
    var src = ctx.createBufferSource(); src.buffer = buf; src.connect(ctx.destination); src.start();
  }
  function renderWiz() {
    var el = wiz(); if (!el) return;
    var signed = window.WEIdentify && WEIdentify.canRun();
    var steps = ['1 ' + L('Вид', 'Species'), '2 ' + L('Записи', 'Recordings'), '3 ' + L('Проверка', 'Check'), '4 ' + L('Готово', 'Done')];
    var head = '<div class="steps">' + steps.map(function (s, i) { return '<span class="' + (i + 1 === W.step ? 'on' : i + 1 < W.step ? 'done' : '') + '">' + esc(s) + '</span>'; }).join('') + '</div>';
    if (!signed) { el.innerHTML = head + '<p class="hint">' + esc(L('Чтобы учить голоса, войдите через Google: звуки превращаются в «отпечатки» на нашем сервере. Сами записи остаются у вас.', 'To teach voices, sign in with Google: sounds are turned into fingerprints on our server. The recordings stay with you.')) + '</p>'; return; }
    if (W.step === 1) {
      el.innerHTML = head + '<p class="hint">' + esc(L('Какой вид вы хотите научить приложение узнавать? Начните печатать название: «пеликан», «журавль», «Pelecanus». Если вида нет в списке, выберите «Новый вид».', 'Which species do you want the app to recognise? Start typing: "pelican", "crane", "Pelecanus". If it is not listed, choose "New species".')) + '</p>' +
        '<input id="wizSp" type="text" placeholder="' + esc(L('Например: Кудрявый пеликан', 'For example: Dalmatian Pelican')) + '"><div class="row wrap"><button class="btn primary" id="wizNext1" disabled>' + esc(L('Дальше', 'Next')) + '</button></div>';
      var inp = $('#wizSp'), next = $('#wizNext1');
      combo(inp, function (p) { W.species = p; next.disabled = false; });
      if (W.species) { inp.value = W.species.name; inp.dataset.id = W.species.id; inp.dataset.name = W.species.name; next.disabled = false; }
      next.addEventListener('click', function () { var v = inp.__combo.value(); if (!v) { A.toast(L('Выберите вид из подсказок', 'Pick a species from the suggestions')); return; } W.species = v; W.step = 2; renderWiz(); });
    } else if (W.step === 2) {
      var n = S.ownStats().filter(function (o) { return o.id === W.species.id; })[0];
      el.innerHTML = head + '<p><b>' + esc(W.species.name) + '</b>' + (n ? ' · ' + esc(L('уже есть образцов: ', 'samples already: ')) + n.n : '') + '</p>' +
        '<p class="hint">' + esc(L('Добавьте 5–10 записей, где слышен именно этот вид. Лучше разные дни, места и фоновый шум: так приложение будет узнавать голос и в поле. Мы найдём в них звуки, а вы проверите.', 'Add 5-10 recordings where this very species is heard. Different days, places and background noise are best: that is how the app will recognise the voice in the field. We find the sounds, you check them.')) + '</p>' +
        '<div class="row wrap"><label class="btn primary">' + esc(L('Выбрать записи', 'Choose recordings')) + '<input type="file" id="wizFiles" multiple accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.webm" hidden></label><label class="btn">' + esc(L('Выбрать папку', 'Choose a folder')) + '<input type="file" id="wizDir" webkitdirectory multiple hidden></label><button class="btn" id="wizBack">' + esc(L('Назад', 'Back')) + '</button></div>' +
        '<p class="hint" id="wizProg"></p>';
      var take = function (list) { var fs = [].slice.call(list || []).filter(function (f) { return /\.(wav|mp3|m4a|ogg|flac|webm|aac)$/i.test(f.name) && f.size > 4000; }).slice(0, 30); if (fs.length) analyseFiles(fs); };
      $('#wizFiles').addEventListener('change', function () { take(this.files); this.value = ''; });
      $('#wizDir').addEventListener('change', function () { take(this.files); this.value = ''; });
      $('#wizBack').addEventListener('click', function () { W.step = 1; renderWiz(); });
    } else if (W.step === 3) {
      var sel = W.items.filter(function (it) { return it.keep; }).length;
      el.innerHTML = head + '<p class="hint">' + esc(L('Прослушайте найденные звуки. Оставьте только те, где поёт ', 'Listen to the sounds found. Keep only those where it is ')) + '<b>' + esc(W.species.name) + '</b>' + esc(L('. Лишние (ветер, другие птицы, шум) снимите: от этого зависит качество.', '. Untick the others (wind, other birds, noise): the quality depends on it.')) + '</p>' +
        '<p class="hint">' + esc(L('Выбрано: ', 'Selected: ')) + sel + ' ' + esc(L('из', 'of')) + ' ' + W.items.length + '</p><ul class="found">' +
        W.items.map(function (it, i) { return '<li><button class="btn sm" data-p="' + i + '" aria-label="' + esc(L('Слушать', 'Play')) + '">▶</button><label><input type="checkbox" data-k="' + i + '"' + (it.keep ? ' checked' : '') + '> <span>' + esc(it.file.name) + ' · ' + Math.floor(it.ev.t0 / 60) + ':' + pad(Math.floor(it.ev.t0 % 60)) + ' · ' + (it.ev.fLow / 1000).toFixed(1) + '–' + (it.ev.fHigh / 1000).toFixed(1) + ' ' + esc(L('кГц', 'kHz')) + ' · +' + it.ev.snr + ' ' + esc(L('дБ', 'dB')) + (it.noEmb ? ' · ' + esc(L('без отпечатка', 'no fingerprint')) : '') + '</span></label></li>'; }).join('') + '</ul>' +
        '<div class="row wrap"><button class="btn primary" id="wizSave"' + (sel ? '' : ' disabled') + '>' + esc(L('Сохранить как «', 'Save as "')) + esc(W.species.name) + esc(L('»', '"')) + '</button><button class="btn" id="wizMore">' + esc(L('Добавить ещё записи', 'Add more recordings')) + '</button></div>';
      $$('[data-p]', el).forEach(function (b) { b.addEventListener('click', function () { var it = W.items[+b.dataset.p]; playBuf(B.clipOf(it.samples, it.ev)); }); });
      $$('[data-k]', el).forEach(function (c) { c.addEventListener('change', function () { W.items[+c.dataset.k].keep = c.checked; renderWiz(); }); });
      $('#wizMore').addEventListener('click', function () { W.step = 2; renderWiz(); });
      $('#wizSave').addEventListener('click', saveWizard);
    } else {
      var r = W.result || {};
      el.innerHTML = head + '<p><b>' + esc(L('Голос выучен: ', 'Voice learned: ')) + esc(W.species.name) + '</b></p>' +
        '<p>' + esc(L('В библиотеке теперь образцов: ', 'Samples in the library now: ')) + '<b>' + (r.total || 0) + '</b>' + (r.recs ? ' ' + esc(L('из', 'from')) + ' ' + r.recs + ' ' + esc(L('записей', 'recordings')) : '') + '</p>' +
        '<div class="recsum" id="wizEst">' + esc(r.recs >= 3 ? L('Считаю оценку на ваших записях...', 'Estimating on your recordings...') : L('Оценка качества появится, когда будет 3 записи и больше. Добавьте ещё.', 'A quality estimate appears with 3 or more recordings. Add more.')) + '</div>' +
        '<p class="hint">' + esc(L('Теперь загрузите новую запись на экране «Записать»: если приложение услышит этот голос, подсказка будет с ★.', 'Now upload a new recording on the Record screen: if the app hears this voice, the suggestion carries a ★.')) + '</p>' +
        '<div class="row wrap"><button class="btn primary" id="wizAgain">' + esc(L('Добавить ещё записи', 'Add more recordings')) + '</button><button class="btn" id="wizNew">' + esc(L('Научить другой голос', 'Teach another voice')) + '</button><button class="btn" data-go2="record">' + esc(L('Проверить на записи', 'Test on a recording')) + '</button></div>';
      $('#wizAgain').addEventListener('click', function () { W.step = 2; W.items = []; renderWiz(); });
      $('#wizNew').addEventListener('click', function () { W = { step: 1, species: null, items: [] }; renderWiz(); });
      var rec = $('[data-go2="record"]', el); if (rec) rec.setAttribute('data-go2', 'listen');
      refresh().then(function () { return r.recs >= 3 ? evaluate(W.species.id) : null; }).then(function (ev) {
        var e = $('#wizEst'); if (!e) return;
        if (ev && ev.recall != null) e.textContent = L('Оценка по вашим записям (каждая по очереди откладывалась в сторону): приложение находит около ', 'Estimate on your recordings (each one held out in turn): the app finds about ') + Math.round(ev.recall * 100) + L('% звуков этого вида, ложных срабатываний около ', '% of this species\' sounds, false alarms about ') + Math.round((ev.fa || 0) * 100) + '%. ' + (ev.recall < .6 ? L('Это мало: добавьте больше разных записей.', 'That is low: add more varied recordings.') : L('Хороший результат.', 'A good result.'));
        renderLib();
      });
    }
  }
  function analyseFiles(files) {
    if (W.busy) return; W.busy = true;
    var prog = $('#wizProg'), done = 0, total = files.length, chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        if (prog) prog.textContent = L('Обработано ' + done + ' из ' + total + ': ' + f.name, 'Processed ' + done + ' of ' + total + ': ' + f.name);
        return B.analyse(f).then(function (a) {
          var best = B.bestSounds(a.events, 6), rest = a.events.filter(function (e) { return best.indexOf(e) < 0; }).sort(function (x, y) { return y.snr - x.snr; }).slice(0, 6);
          best.forEach(function (e) { W.items.push({ file: f, samples: a.samples, dur: a.dur, ev: e, keep: !!e.emb, noEmb: !e.emb }); });
          rest.forEach(function (e) { W.items.push({ file: f, samples: a.samples, dur: a.dur, ev: e, keep: false, noEmb: !e.emb }); });
        }).catch(function (e) { if (e && e.auth) throw e; if (prog) prog.textContent = L('Не прочитан: ', 'Unreadable: ') + f.name; return sleep(600); }).then(function () { done++; });
      });
    });
    chain.then(function () { W.busy = false; if (!W.items.length) { if (prog) prog.textContent = L('Звуки не найдены. Попробуйте другие записи.', 'No sounds found. Try other recordings.'); return; } W.step = 3; renderWiz(); })
      .catch(function (e) { W.busy = false; A.toast(e && e.auth ? L('Сессия истекла. Войдите снова.', 'Your session expired. Sign in again.') : L('Не получилось обработать записи', 'Could not process the recordings')); });
  }
  function saveWizard() {
    var byFile = {}, id = W.species.id, n = 0;
    W.items.forEach(function (it) { if (it.keep && it.ev.emb) { var k = it.file.name + '|' + it.file.size; (byFile[k] = byFile[k] || { f: it.file, samples: it.samples, dur: it.dur, evs: [] }).evs.push(it.ev); } });
    var recs = 0;
    Object.keys(byFile).forEach(function (k) { var g = byFile[k]; g.evs.forEach(function (e) { e.status = 'confirmed'; e.species = id; }); n += B.saveEvents(g.f, g.evs, g.samples, g.dur); recs++; });
    if (!n) { A.toast(L('Нет звуков с отпечатками: проверьте вход в аккаунт', 'No sounds with fingerprints: check that you are signed in')); return; }
    var st = S.ownStats().filter(function (o) { return o.id === id; })[0], k = {};
    S.get().dets.forEach(function (d) { if (d.species === id && d.status === 'confirmed' && d.emb && !d.demo) k[d.recId || d.id] = 1; });
    W.result = { added: n, total: st ? st.n : n, recs: Object.keys(k).length }; W.items = []; W.step = 4; renderWiz(); renderLib(); A.refreshChrome();
  }

  /* labelled dataset: folder with one sub-folder per species */
  var DS = { groups: null };
  function parseFolder(files) {
    var g = {}, skipped = 0;
    files.forEach(function (f) {
      var p = (f.webkitRelativePath || '').split('/');
      if (!/\.(wav|mp3|m4a|ogg|flac|webm|aac)$/i.test(f.name) || f.size < 4000) return;
      if (p.length < 3) { skipped++; return; }   /* root/species/file */
      var label = p[1].replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
      (g[label] = g[label] || []).push(f);
    });
    return { groups: g, skipped: skipped };
  }
  function renderImport() {
    var box = $('#dsImport'); if (!box) return;
    var signed = window.WEIdentify && WEIdentify.canRun();
    if (!DS.groups) {
      box.innerHTML = '<p class="hint">' + esc(L('Выберите папку, внутри которой подпапки названы по видам, например Pelecanus_crispus/ или Кудрявый пеликан/ с записями внутри. Приложение само найдёт звуки, сохранит лучшие как подтверждённые образцы этого вида и начнёт их узнавать.', 'Choose a folder with one sub-folder per species, for example Pelecanus_crispus/ or Dalmatian Pelican/ with recordings inside. The app finds the sounds, saves the best ones as confirmed samples of that species and starts recognising them.')) + '</p>' +
        '<div class="row wrap"><label class="btn' + (signed ? ' primary' : '') + '">' + esc(L('Выбрать папку с видами', 'Choose the species folder')) + '<input type="file" id="dsDir" webkitdirectory multiple hidden' + (signed ? '' : ' disabled') + '></label></div>' + (signed ? '' : '<p class="hint">' + esc(L('Нужен вход через Google.', 'Sign-in is needed.')) + '</p>') + '<ul class="batch-list" id="dsLog"></ul>';
      var inp = $('#dsDir'); if (inp) inp.addEventListener('change', function () { var p = parseFolder([].slice.call(this.files)); this.value = ''; DS.groups = p.groups; DS.skipped = p.skipped; renderImport(); });
      return;
    }
    var labels = Object.keys(DS.groups);
    if (!labels.length) { box.innerHTML = '<p class="hint">' + esc(L('Подпапок с аудио не найдено. Нужна структура: папка / вид / запись.', 'No sub-folders with audio found. The structure must be: folder / species / recording.')) + '</p><div class="row"><button class="btn" id="dsReset">' + esc(L('Выбрать другую', 'Choose another')) + '</button></div>'; $('#dsReset').addEventListener('click', function () { DS.groups = null; renderImport(); }); return; }
    var all = choices();
    var rows = labels.map(function (lb) {
      var q = norm(lb), hit = all.filter(function (c) { return norm(c.label) === q || c.hay.split(' ').join(' ') === q || norm(c.sci) === q; })[0];
      DS.map = DS.map || {}; DS.map[lb] = hit ? { id: hit.id, name: hit.label } : { id: 'x:' + lb, name: lb };
      return '<tr><td>' + esc(lb) + '</td><td>' + esc(DS.map[lb].name) + (hit ? '' : ' <span class="chip">' + esc(L('новый вид', 'new species')) + '</span>') + '</td><td>' + DS.groups[lb].length + '</td></tr>';
    }).join('');
    var total = labels.reduce(function (a, l) { return a + DS.groups[l].length; }, 0);
    box.innerHTML = '<p>' + esc(L('Найдено видов: ', 'Species found: ')) + '<b>' + labels.length + '</b>, ' + esc(L('файлов: ', 'files: ')) + '<b>' + total + '</b>' + (DS.skipped ? ' · ' + esc(L('вне подпапок пропущено: ', 'outside sub-folders skipped: ')) + DS.skipped : '') + '</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(L('Папка', 'Folder')) + '</th><th>' + esc(L('Вид', 'Species')) + '</th><th>' + esc(L('Файлов', 'Files')) + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="row wrap"><button class="btn primary" id="dsGo">' + esc(L('Загрузить датасет', 'Import the dataset')) + '</button><button class="btn" id="dsReset">' + esc(L('Отмена', 'Cancel')) + '</button></div><div class="bprog"><i id="dsBar"></i></div><p class="hint" id="dsSum"></p><ul class="batch-list" id="dsLog"></ul>';
    $('#dsReset').addEventListener('click', function () { DS.groups = null; DS.map = null; renderImport(); });
    $('#dsGo').addEventListener('click', function () { importDataset(labels, total); });
  }
  function importDataset(labels, total) {
    var go = $('#dsGo'); go.disabled = true; var done = 0, saved = 0, chain = Promise.resolve(), log = $('#dsLog');
    var upd = function () { $('#dsBar').style.setProperty('--w', Math.round(done / total * 100) + '%'); $('#dsSum').textContent = L('Файлов: ' + done + ' из ' + total + ' · образцов сохранено: ' + saved, 'Files: ' + done + ' of ' + total + ' · samples saved: ' + saved); };
    labels.forEach(function (lb) {
      var sp = DS.map[lb];
      DS.groups[lb].forEach(function (f) {
        chain = chain.then(function () {
          return B.analyse(f).then(function (a) {
            var keep = B.bestSounds(a.events, 6).filter(function (e) { return e.emb; });
            keep.forEach(function (e) { e.status = 'confirmed'; e.species = sp.id; });
            var n = B.saveEvents(f, keep, a.samples, a.dur); saved += n; if (log) log.insertAdjacentHTML('afterbegin', '<li class="' + (n ? 'ok' : '') + '"><span>' + (n ? '✓' : '–') + '</span> ' + esc(lb + ' / ' + f.name) + ' <em>' + (n ? '+' + n : esc(L('звуков нет', 'no sounds'))) + '</em></li>');
          }).catch(function (e) { if (e && e.auth) throw e; if (log) log.insertAdjacentHTML('afterbegin', '<li class="fail"><span>✕</span> ' + esc(lb + ' / ' + f.name) + '</li>'); }).then(function () { done++; upd(); return sleep(20); });
        });
      });
    });
    chain.then(function () { A.toast(L('Датасет загружен. Образцов: ', 'Dataset imported. Samples: ') + saved); renderLib(); refresh(); A.refreshChrome(); if (window.WESync && WESync.syncNow) WESync.syncNow(true); })
      .catch(function (e) { A.toast(e && e.auth ? L('Сессия истекла. Войдите снова.', 'Your session expired. Sign in again.') : L('Загрузка остановилась', 'The import stopped')); });
  }

  /* dataset export: ZIP (store only) with WAV clips per species and a table */
  var CRC = (function () { var t = new Uint32Array(256), c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { var c = 0xFFFFFFFF; for (var i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipBlob(files) {   /* files: [{name, data: Uint8Array}] */
    var parts = [], central = [], offset = 0, enc = new TextEncoder(), now = new Date();
    var dt = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate(), tm = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    files.forEach(function (f) {
      var name = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length, h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true); h.setUint32(14, crc, true); h.setUint32(18, sz, true); h.setUint32(22, sz, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(h.buffer, name, f.data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, tm, true); c.setUint16(14, dt, true); c.setUint32(16, crc, true); c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(c.buffer, name); offset += 30 + name.length + sz;
    });
    var csize = central.reduce(function (a, p) { return a + (p.byteLength !== undefined ? p.byteLength : p.length); }, 0), e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [e.buffer]), { type: 'application/zip' });
  }
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function safe(s) { return String(s).replace(/[^A-Za-z0-9А-Яа-яЁёәіңғүұқөһӘІҢҒҮҰҚӨҺ._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'species'; }
  function renderExport() {
    var box = $('#dsExport'); if (!box) return;
    var confirmed = S.get().dets.filter(function (d) { return d.status === 'confirmed' && d.species && !d.demo && d.clip; });
    var by = {}; confirmed.forEach(function (d) { by[d.species] = (by[d.species] || 0) + 1; });
    var ids = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    box.innerHTML = '<p>' + esc(L('Готово к выгрузке: ', 'Ready to export: ')) + '<b>' + confirmed.length + '</b> ' + esc(L('подтверждённых звуков', 'confirmed sounds')) + ', ' + ids.length + ' ' + esc(L('видов', 'species')) + '</p>' +
      '<label class="dt">' + esc(L('Вид', 'Species')) + ' <select id="dsSp"><option value="">' + esc(L('Все виды', 'All species')) + '</option>' + ids.map(function (id) { return '<option value="' + esc(id) + '">' + esc(A.spName(id)) + ' (' + by[id] + ')</option>'; }).join('') + '</select></label>' +
      '<label class="chk"><input type="checkbox" id="dsRej"> <span>' + esc(L('Добавить отклонённые события как папку «не птица» (полезно для обучения моделей)', 'Add rejected events as a "not a bird" folder (useful for training models)')) + '</span></label>' +
      '<div class="row wrap"><button class="btn primary" id="dsZip"' + (confirmed.length ? '' : ' disabled') + '>' + esc(L('Скачать датасет (ZIP)', 'Download the dataset (ZIP)')) + '</button></div><p class="hint" id="dsZipMsg"></p>';
    $('#dsZip').addEventListener('click', buildZip);
  }
  function buildZip() {
    var only = $('#dsSp').value, rej = $('#dsRej').checked, msg = $('#dsZipMsg'), btn = $('#dsZip');
    var list = S.get().dets.filter(function (d) { return !d.demo && d.clip && ((d.status === 'confirmed' && d.species && (!only || d.species === only)) || (rej && !only && d.status === 'rejected')); });
    if (!list.length) { msg.textContent = L('Нет звуков для выгрузки', 'No sounds to export'); return; }
    btn.disabled = true; var files = [], rows = [['file', 'species_ru', 'species_en', 'scientific_name', 'status', 'time_utc', 'station', 'latitude', 'longitude', 'snr_db', 'f_low_hz', 'f_high_hz', 'model_suggestion', 'model_confidence', 'reviewed_at', 'recorded_by']], i = 0, who = (window.WESync && WESync.me() && WESync.me().name) || '';
    var next = function () {
      if (i >= list.length) {
        var meta = new TextEncoder().encode('\ufeff' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\n'));
        var readme = new TextEncoder().encode('WetlandEar dataset\n\nOne folder per species (scientific name when known), 16-bit mono WAV clips of confirmed events, and metadata.csv with one row per clip.\nStatus "confirmed" means a person checked the species; "rejected" clips are in the folder not_a_bird.\nAudio is mono at ' + D.SR + ' Hz. Clips are the event plus 0.25 s each side.\nSpecies suggestions come from BirdNET and the WetlandEar model and are hints only.\nUse for non-commercial research and education unless you have the recordists\' permission for more. Generated ' + new Date().toISOString() + '.\n');
        files.push({ name: 'metadata.csv', data: meta }, { name: 'README.txt', data: readme });
        var a = document.createElement('a'), blob = zipBlob(files); a.href = URL.createObjectURL(blob); a.download = 'wetlandear-dataset-' + new Date().toISOString().slice(0, 10) + '.zip'; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
        msg.textContent = L('Готово: клипов ', 'Done: clips ') + (files.length - 2) + ', ' + Math.round(blob.size / 1048576 * 10) / 10 + ' MB'; btn.disabled = false; return;
      }
      var d = list[i++]; msg.textContent = L('Собираю: ' + i + ' из ' + list.length, 'Packing: ' + i + ' of ' + list.length);
      S.getClip(d.id).then(function (i16) {
        if (!i16) return;
        var sci = d.status === 'rejected' ? '' : sciOf(d.species), folder = d.status === 'rejected' ? 'not_a_bird' : safe(sci || String(d.species).replace(/^x:/, '')), name = folder + '/' + safe(d.id) + '.wav';
        var w = D.wavBlob(Float32Array.from(i16, function (v) { return v / 32768; }), D.SR);
        return w.arrayBuffer().then(function (ab) {
          files.push({ name: name, data: new Uint8Array(ab) });
          var sg = d.suggest, sp = d.species ? S.species[d.species] : null;
          rows.push([name, d.species ? A.spName(d.species) : '', sp ? sp.en : String(d.species || '').replace(/^x:/, ''), sci, d.status, d.ts, d.station || '', d.lat == null ? '' : d.lat, d.lon == null ? '' : d.lon, d.snr, d.fLow, d.fHigh, sg ? (sg.common || sg.sci || '') : '', sg ? Math.round((sg.conf || 0) * 100) / 100 : '', d.reviewed || '', who]);
        });
      }).catch(function () { }).then(function () { return sleep(0); }).then(next);
    };
    next();
  }

  /* ---------- wiring ---------- */
  function renderAll() { renderLib(); renderWiz(); renderImport(); renderExport(); }
  function onLib(e) {
    var b = e.target.closest('[data-v]'); if (!b) return; var id = b.closest('.voice').dataset.id;
    if (b.dataset.v === 'ref') playRef({ id: id });
    if (b.dataset.v === 'add') { W = { step: 2, species: { id: id, name: A.spName(id) }, items: [] }; renderWiz(); var w = $('#voiceWizard'); if (w) w.scrollIntoView({ behavior: 'smooth' }); }
  }
  function init() {
    var lib = $('#voiceLib'); if (lib) lib.addEventListener('click', onLib);
    /* a ♪ button next to model suggestions in the event list, and in the review screen */
    var ev = $('#events');
    if (ev) ev.addEventListener('click', function (e) {
      var r = e.target.closest('[data-a="ref"]'); if (!r) return; e.stopPropagation();
      var li = r.closest('.evc'), evs = A.core.sessEvents(), ev = li && evs[+li.dataset.i], s = ev && ev.suggest && ev.suggest[+r.dataset.k]; if (s) playRef(s);
    }, true);
    var rb = $('#revRef'); if (rb) rb.addEventListener('click', function () { var sel = $('#revSel'); if (sel && sel.value && sel.value !== '__other') playRef({ id: sel.value }); else A.toast(L('Сначала выберите вид', 'Pick a species first')); });
    /* type-ahead fields are wired when they get focus (the event list is redrawn often) */
    document.addEventListener('focusin', function (e) { var t = e.target; if (t.matches && t.matches('input[data-combo]') && !t.__combo) { combo(t); t.dispatchEvent(new Event('focus')); } });
    document.addEventListener('change', function (e) { var t = e.target; if (t.matches && t.matches('#revSel, select[data-a="sp"]')) { var ti = t.parentNode.querySelector('input[data-combo]'); if (ti) { ti.value = ''; delete ti.dataset.id; } } });
    document.addEventListener('click', function (e) { var sp = e.target.closest('[data-ref]'); if (sp) playRef({ id: sp.getAttribute('data-ref') }); });
  }
  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) {
    if (prev) prev(v);
    if (v === 'voices') { renderAll(); refresh(); }
    if (v === 'listen' || v === 'review') refresh();
    if (v !== 'listen' && v !== 'review') stopRef();
  };
  window.WEVoices = { busy: function () { return { training: training, neg: !!NEG, worker: !!worker, jobs: Object.keys(jobs).length }; }, status: function () { return Object.keys(models).map(function (id) { var m = models[id]; return { id: id, n: m.n, ok: m.ok, negClaim: m.negClaim, selfFound: m.selfFound }; }); }, combo: combo, playRef: playRef, refresh: refresh, evaluate: evaluate, choices: choices, comboValue: function (input) { return input.__combo ? input.__combo.value() : null; } };
  init();
  var cur = A.current(); if (cur === 'voices') { renderAll(); } setTimeout(refresh, 1500);
})();
