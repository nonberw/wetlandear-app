/* WetlandEar App: the "Works without internet" screen: download, mode, speed check, delete. */
(function () {
  'use strict';
  var A = window.WEApp, O = window.WEOffline;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc;
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  var busy = false, progress = 0, note = '';

  function render() {
    var box = $('#offBody'); if (!box) return;
    if (!O.supported()) { box.innerHTML = '<p class="hint">' + esc(L('Этот браузер не умеет хранить большие файлы или запускать WebAssembly. Обновите браузер.', 'This browser cannot store large files or run WebAssembly. Update the browser.')) + '</p>'; return; }
    var ready = O.isReady(), mode = O.pref();
    var head = '<div class="off-row"><span class="off-status"><i class="off-dot' + (ready ? ' on' : '') + '"></i>' + esc(ready ? L('Готово: модели на этом устройстве', 'Ready: the models are on this device') : L('Модели не скачаны', 'Models are not downloaded')) + '</span></div>';
    if (!ready) {
      box.innerHTML = head + '<p class="hint">' + esc(L('Нужно скачать около ' + O.totalMB + ' МБ один раз. Лучше по Wi-Fi.', 'About ' + O.totalMB + ' MB to download once. Wi-Fi is better.')) + '</p>' +
        '<div class="row wrap"><button class="btn primary" id="offGo"' + (busy ? ' disabled' : '') + '>' + esc(busy ? L('Скачиваю...', 'Downloading...') : L('Скачать модели', 'Download the models')) + '</button></div>' +
        '<div class="bprog"' + (busy ? '' : ' hidden') + '><i id="offBar" style="--w:' + Math.round(progress * 100) + '%"></i></div><p class="hint" id="offNote">' + esc(note) + '</p>';
      $('#offGo').addEventListener('click', start);
      return;
    }
    box.innerHTML = head + '<p class="hint">' + esc(L('Когда определять виды на устройстве:', 'When to recognise species on the device:')) + '</p>' +
      '<div class="seg wide" id="offMode"><button data-m="auto" class="' + (mode === 'auto' ? 'on' : '') + '">' + esc(L('Если нет сети', 'When offline')) + '</button><button data-m="always" class="' + (mode === 'always' ? 'on' : '') + '">' + esc(L('Всегда', 'Always')) + '</button></div>' +
      '<p class="hint">' + esc(mode === 'always' ? L('Все определения идут на устройстве: быстро и приватно, без входа.', 'All recognition runs on the device: private, no sign-in needed.') : L('Если есть сеть и вход, определение идёт на сервере, иначе на устройстве.', 'With a network and sign-in the server is used, otherwise the device.')) + '</p>' +
      '<div class="row wrap"><button class="btn" id="offTest">' + esc(L('Проверить скорость', 'Check the speed')) + '</button><button class="btn no" id="offDel">' + esc(L('Удалить модели', 'Delete the models')) + '</button></div><p class="hint" id="offNote">' + esc(note) + '</p>';
    [].forEach.call(box.querySelectorAll('#offMode button'), function (b) { b.addEventListener('click', function () { O.setPref(b.dataset.m); render(); }); });
    $('#offTest').addEventListener('click', speed);
    $('#offDel').addEventListener('click', function () { if (confirm(L('Удалить скачанные модели с этого устройства?', 'Delete the downloaded models from this device?'))) O.remove().then(function () { note = ''; render(); }); });
  }
  function start() {
    busy = true; progress = 0; note = ''; render();
    O.download(function (p, url) { progress = p; var bar = $('#offBar'); if (bar) bar.style.setProperty('--w', Math.round(p * 100) + '%'); var n = $('#offNote'); if (n) n.textContent = Math.round(p * 100) + '% · ' + url.split('/').pop(); })
      .then(function () { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { } note = L('Готово. Проверьте скорость кнопкой ниже.', 'Done. Check the speed with the button below.'); A.toast(L('Модели скачаны', 'Models downloaded')); })
      .catch(function () { note = L('Не удалось скачать. Проверьте сеть и свободное место, затем повторите: скачанное сохранилось.', 'The download failed. Check the network and free space, then try again: what was downloaded is kept.'); })
      .then(function () { busy = false; render(); });
  }
  function zerosB64() { var s = '', chunk = new Array(8193).join('\u0000'), i; for (i = 0; i < 288000; i += 8192) s += chunk.slice(0, Math.min(8192, 288000 - i)); return btoa(s); }
  function speed() {
    var n = $('#offNote'); if (n) n.textContent = L('Запускаю модель...', 'Starting the model...');
    var t0 = Date.now(), w = zerosB64();
    O.identifyLocal({ windows: [w] }).then(function () {
      var first = Date.now() - t0, t1 = Date.now();
      return O.identifyLocal({ windows: [w, w] }).then(function () {
        var per = Math.round((Date.now() - t1) / 2); note = L('Первый запуск (загрузка в память): ' + (first / 1000).toFixed(1) + ' с. Дальше около ' + per + ' мс на фрагмент в 3 секунды.', 'First start (loading into memory): ' + (first / 1000).toFixed(1) + ' s. After that about ' + per + ' ms per 3-second fragment.'); render();
      });
    }).catch(function (e) { note = L('Не получилось запустить модель: ', 'Could not start the model: ') + (e && e.message || e); render(); });
  }
  O.onChange(function () { if (!busy) render(); });
  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) { if (prev) prev(v); if (v === 'offline') render(); };
  if (A.current() === 'offline') render();
})();
