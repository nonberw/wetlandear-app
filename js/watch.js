/* WetlandEar App: watchlist (instant Telegram message when a chosen species shows up) and sharing confirmed samples with the project. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp, B = window.WEBatch;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc;
  function lang() { return window.WEi18n ? window.WEi18n.lang : 'ru'; }
  function L(ru, en) { return lang() === 'ru' ? ru : (window.WEi18n ? WEi18n.t(ru) : en); }

  /* ---------- watchlist ---------- */
  function renderWatch() {
    var box = $('#watchBody'); if (!box || !window.WESync || !WESync.me()) return;
    WESync.tgGet().then(function (row) {
      if (!row || !row.chat_id) { box.innerHTML = '<p class="hint">' + esc(L('Сначала подключите Telegram выше: сообщения приходят туда.', 'Connect Telegram above first: the messages go there.')) + '</p>'; window.WE_WATCH = []; return; }
      var list = Array.isArray(row.watch) ? row.watch : [];
      window.WE_WATCH = list.map(function (w) { return w.id; });
      box.innerHTML = '<div class="chips">' + (list.length ? list.map(function (w) { return '<span class="chip wl">' + esc(w.name) + ' <button data-rm="' + esc(w.id) + '" aria-label="' + esc(L('Убрать', 'Remove')) + '">×</button></span>'; }).join('') : '<span class="hint">' + esc(L('Список пуст.', 'The list is empty.')) + '</span>') + '</div>' +
        '<div class="row wrap"><input id="watchIn" list="speciesList" autocomplete="off" placeholder="' + esc(L('Вид, например Кудрявый пеликан', 'Species, for example Dalmatian Pelican')) + '"><button class="btn primary" id="watchAdd">' + esc(L('Добавить', 'Add')) + '</button></div>';
      B.fillDatalist('speciesList');
      var save = function (next) { WESync.tgSet({ watch: next }).then(renderWatch).catch(function () { A.toast(L('Не удалось сохранить. Возможно, администратор ещё не применил обновление базы.', 'Could not save. The administrator may not have applied the database update yet.')); }); };
      $('#watchAdd').addEventListener('click', function () {
        var r = B.resolveSpecies($('#watchIn').value); if (!r) return;
        if (list.some(function (w) { return w.id === r.id; })) { A.toast(L('Уже в списке', 'Already in the list')); return; }
        if (list.length >= 30) { A.toast(L('Не больше 30 видов', 'At most 30 species')); return; }
        save(list.concat([{ id: r.id, name: r.name }]));
      });
      [].forEach.call(box.querySelectorAll('button[data-rm]'), function (b) { b.addEventListener('click', function () { save(list.filter(function (w) { return w.id !== b.dataset.rm; })); }); });
    }).catch(function () { box.innerHTML = '<p class="hint">' + esc(L('Список пока недоступен: администратору нужно применить обновление базы данных.', 'The list is not available yet: the administrator needs to apply the database update.')) + '</p>'; });
  }

  /* ---------- share confirmed samples (fingerprints, no audio) ---------- */
  function sciOf(id, d) {
    var s = S.species[id]; if (s) return s.lat;
    var com = String(id).replace(/^x:/, ''); if (window.WE_SCI && window.WE_SCI[com]) return window.WE_SCI[com];
    return d.suggest && d.suggest.sci && S.sugId(d.suggest) === id ? d.suggest.sci : '';
  }
  function sharedSet() { try { return JSON.parse(localStorage.getItem('we.shared') || '{}'); } catch (e) { return {}; } }
  function candidates() {
    var done = sharedSet();
    return S.get().dets.filter(function (d) { return d.status === 'confirmed' && d.species && d.emb && !d.demo && !done[d.id] && (!d.uid || (WESync.me() && d.uid === WESync.me().id)); });
  }
  function renderShare() {
    var box = $('#shareBody'); if (!box) return;
    var signed = window.WESync && WESync.me(), n = signed ? candidates().length : 0, total = Object.keys(sharedSet()).length;
    box.innerHTML = '<p>' + esc(L('Готово к передаче: ', 'Ready to share: ')) + '<b>' + n + '</b>' + (total ? ' · ' + esc(L('уже передано: ', 'already shared: ')) + total : '') + '</p>' +
      '<label class="chk"><input type="checkbox" id="shareOk"> <span>' + esc(L('Я подтверждаю, что виды в этих событиях определены верно, и разрешаю использовать их отпечатки звука для обучения модели WetlandEar в некоммерческих исследовательских целях.', 'I confirm that the species in these events are identified correctly and I allow their sound fingerprints to be used to train the WetlandEar model for non-commercial research.')) + '</span></label>' +
      '<div class="row wrap"><button class="btn primary" id="shareGo"' + (n ? '' : ' disabled') + '>' + esc(L('Передать проекту', 'Share with the project')) + '</button></div>';
    var go = $('#shareGo'); if (!signed) { go.disabled = true; box.insertAdjacentHTML('afterbegin', '<p class="hint">' + esc(L('Нужен вход через Google.', 'Sign-in is needed.')) + '</p>'); return; }
    go.addEventListener('click', function () {
      if (!$('#shareOk').checked) { A.toast(L('Отметьте согласие', 'Tick the consent box')); return; }
      var list = candidates();
      WESync.shareSamples(list.map(function (d) {
        var com = S.species[d.species] ? S.species[d.species].en : String(d.species).replace(/^x:/, '');
        return { det_id: d.id, species: d.species, common: com, sci: sciOf(d.species, d), emb: d.emb, station: d.station || null, lat: d.lat == null ? null : Math.round(d.lat * 10) / 10, lon: d.lon == null ? null : Math.round(d.lon * 10) / 10 };
      })).then(function () {
        var done = sharedSet(); list.forEach(function (d) { done[d.id] = 1; }); try { localStorage.setItem('we.shared', JSON.stringify(done)); } catch (e) { }
        A.toast(L('Спасибо! Передано образцов: ', 'Thank you! Samples shared: ') + list.length); renderShare();
      }).catch(function () { A.toast(L('Не удалось передать. Возможно, администратор ещё не применил обновление базы.', 'Could not share. The administrator may not have applied the database update yet.')); });
    });
  }

  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) {
    if (prev) prev(v);
    if (v === 'profile') renderWatch();
    if (v === 'data') renderShare();
    if (v === 'listen' && B) B.fillDatalist('speciesList');
  };
  /* the watchlist is needed by the sync layer right after sign-in */
  function preload() { if (window.WESync && WESync.me()) WESync.tgGet().then(function (r) { window.WE_WATCH = (r && Array.isArray(r.watch) ? r.watch : []).map(function (w) { return w.id; }); }).catch(function () { }); }
  if (window.WESync) { WESync.onChange(preload); preload(); }
  window.WEWatch = { renderWatch: renderWatch, renderShare: renderShare };
  var cur = A.current(); if (cur === 'profile') renderWatch(); if (cur === 'data') renderShare();
})();
