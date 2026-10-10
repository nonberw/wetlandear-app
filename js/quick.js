/* WetlandEar App: quick actions. One panel, two ways in: the round "+" button (bottom bar on a phone, corner on a computer) and Ctrl+K.
   It lists what a person at a reserve wants to DO (record, upload files, check events, print a report), not where the screen lives.
   Typing narrows the list; arrows and Enter work; Esc closes. */
(function () {
  'use strict';
  var A = window.WEApp, $ = function (s, r) { return (r || document).querySelector(s); };
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var I = {
    mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
    up: 'M12 16V4M7 9l5-5 5 5M5 20h14',
    ok: 'M5 12.5l4.5 4.5L19 7.5',
    log: 'M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 8h6M9 12h6',
    pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11zM12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
    cal: 'M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM4 10h16M9 3v4M15 3v4',
    wave: 'M4 10v4M8 6v12M12 3v18M16 8v8M20 11v2',
    doc: 'M7 3h8l4 4v14H7zM14 3v5h5M10 13h6M10 17h6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
    team: 'M9 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5a3 3 0 0 1 0 6M21 20c0-2.5-1.5-4.5-3.5-5.5',
    plug: 'M9 3v5M15 3v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3',
    dl: 'M12 4v12M7 11l5 5 5-5M5 20h14',
    off: 'M3 3l18 18M2 8.8a15 15 0 0 1 5-3M22 8.8a15 15 0 0 0-9.5-3.7M5.5 12.4a10 10 0 0 1 3-1.8M18.5 12.4a10 10 0 0 0-3-1.8M9 16a5 5 0 0 1 6 0M12 19.5h.01',
    cloud: 'M7 18a4 4 0 0 1-.5-8 5.5 5.5 0 0 1 10.6 1.4A3.3 3.3 0 0 1 17 18z',
    clock: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zM12 7v5l3 2',
    db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6',
    chat: 'M4 5h16v11H9l-5 4z',
    home: 'M4 11.5L12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    user: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 20c0-4 3.6-6 8-6s8 2 8 6'
  };
  /* top: shown as big tiles when the box is empty. sel: element to scroll to; focus: element to focus */
  var ACTS = [
    { id: 'rec', top: 1, ico: 'mic', ru: 'Записать звук', en: 'Record sound', dru: 'Включить микрофон и найти птиц', den: 'Turn on the microphone and find birds', view: 'listen', kw: 'микрофон запись слушать record microphone listen' },
    { id: 'batch', top: 1, ico: 'up', ru: 'Загрузить файлы', en: 'Upload files', dru: 'Сразу много записей с рекордеров', den: 'Many recordings from field recorders at once', view: 'listen', sel: '#batchCard', kw: 'пакет файлы папка карта памяти upload batch files sd card' },
    { id: 'review', top: 1, ico: 'ok', ru: 'Проверить события', en: 'Check events', dru: 'Подтвердить или отклонить находки', den: 'Confirm or reject detections', view: 'review', badge: '#revCount', kw: 'проверка подтвердить отклонить review confirm' },
    { id: 'pdf', top: 1, ico: 'doc', ru: 'Отчёт PDF', en: 'PDF report', dru: 'Для директора, проверки или грантов', den: 'For the director, an inspection or a grant', view: 'report', sel: '#pdfCard', kw: 'отчёт отчет pdf печать report print grant' },
    { id: 'dataset', top: 1, ico: 'wave', ru: 'Датасет заповедника', en: 'Reserve dataset', dru: 'Собрать размеченные звуки своих птиц', den: 'Collect labelled sounds of your own birds', view: 'voices', kw: 'датасет голос обучение dataset train voice' },
    { id: 'watch', top: 1, ico: 'eye', ru: 'Список наблюдения', en: 'Watchlist', dru: 'Сообщать в Telegram о редких видах', den: 'Tell me on Telegram about rare species', view: 'profile', sel: '#watchCard', kw: 'редкие виды красная книга уведомления watch rare alert' },
    { id: 'home', ico: 'home', ru: 'Главная', en: 'Home', dru: 'Пульс заповедника за сегодня', den: 'The pulse of the reserve today', view: 'pulse', kw: 'пульс главная home pulse' },
    { id: 'log', ico: 'log', ru: 'Журнал находок', en: 'Detection log', dru: 'Все события, поиск и фильтры', den: 'All events, search and filters', view: 'log', kw: 'журнал находки события log events' },
    { id: 'ask', ico: 'chat', ru: 'Спросить ИИ про журнал', en: 'Ask AI about the log', dru: 'Вопрос обычными словами', den: 'A question in plain words', view: 'log', sel: '#askCard', focus: '#askQ', kw: 'вопрос ассистент ии ask ai question' },
    { id: 'map', ico: 'pin', ru: 'Карта станций', en: 'Station map', dru: 'Где что слышали', den: 'Where things were heard', view: 'map', kw: 'карта станции map stations' },
    { id: 'cal', ico: 'cal', ru: 'Календарь активности', en: 'Activity calendar', dru: 'По дням и сезонам', den: 'By day and season', view: 'calendar', kw: 'календарь сезон calendar season' },
    { id: 'choir', ico: 'clock', ru: 'Часы утреннего хора', en: 'Dawn chorus clock', dru: 'Когда птицы начинают петь', den: 'When the birds start singing', view: 'calendar', sel: '#choirCard', kw: 'утро рассвет хор dawn chorus' },
    { id: 'sound', ico: 'wave', ru: 'Звуковой ландшафт', en: 'Soundscape health', dru: 'Индексы здоровья звуковой среды', den: 'Acoustic indices of the soundscape', view: 'calendar', sel: '#soundCard', kw: 'индексы ландшафт здоровье acoustic index soundscape' },
    { id: 'weather', ico: 'cloud', ru: 'Погода и активность', en: 'Weather and activity', dru: 'Как погода влияет на пение', den: 'How the weather affects singing', view: 'calendar', sel: '#weatherCard', kw: 'погода ветер дождь weather wind rain' },
    { id: 'export', ico: 'dl', ru: 'Экспорт для GBIF и eBird', en: 'Export for GBIF and eBird', dru: 'Данные для науки', den: 'Data for science', view: 'data', sel: '#exCard', kw: 'экспорт gbif ebird csv export' },
    { id: 'share', ico: 'db', ru: 'Поделиться записями с обучением', en: 'Share samples for training', dru: 'Добровольно, по каждому виду', den: 'Voluntary, per species', view: 'data', sel: '#shareCard', kw: 'поделиться обучение share training' },
    { id: 'station', ico: 'pin', ru: 'Станция и координаты', en: 'Station and coordinates', dru: 'Название и место рекордера', den: 'Name and location of the recorder', view: 'data', kw: 'станция координаты station coordinates' },
    { id: 'team', ico: 'team', ru: 'Команда заповедника', en: 'Reserve team', dru: 'Сотрудники, роли, общий журнал', den: 'Staff, roles, shared log', view: 'profile', sel: '#teamCard', kw: 'команда сотрудники роли team staff roles' },
    { id: 'mcp', ico: 'plug', ru: 'Подключить ИИ-ассистента', en: 'Connect an AI assistant', dru: 'Claude и другие читают журнал', den: 'Claude and others can read the log', view: 'profile', sel: '#mcpCard', kw: 'mcp claude ключ ассистент api key' },
    { id: 'profile', ico: 'user', ru: 'Профиль и Telegram', en: 'Profile and Telegram', dru: 'Аккаунт, бот, тревоги', den: 'Account, bot, alerts', view: 'profile', kw: 'профиль телеграм аккаунт вход profile telegram account login' },
    { id: 'science', ico: 'chart', ru: 'Наука и учёт', en: 'Science and records', dru: 'Фенология, индикаторные виды, станции', den: 'Phenology, indicator species, stations', view: 'science', kw: 'фенология прилет индикаторные виды станции рекордеры phenology indicator stations recorders' },
    { id: 'pheno', ico: 'cal', ru: 'Фенология: первые прилёты', en: 'Phenology: first arrivals', dru: 'Даты по годам и CSV', den: 'Dates by year and CSV', view: 'science', sel: '#phenoCard', kw: 'прилет отлет фенология сдвиг phenology arrival' },
    { id: 'indic', ico: 'eye', ru: 'Индикаторные виды', en: 'Indicator species', dru: 'Один график здоровья болота', den: 'One chart of wetland health', view: 'science', sel: '#indCard', kw: 'индикатор здоровье индикаторные indicator health' },
    { id: 'stations', ico: 'pin', ru: 'Станции и рекордеры', en: 'Stations and recorders', dru: 'Кто жив, кто молчит, кто отвечает', den: 'Who is alive, who is silent, who is in charge', view: 'science', sel: '#stnCard', kw: 'рекордер батарея карта памяти ответственный recorder battery memory card' },
    { id: 'manage', ico: 'team', ru: 'Управление', en: 'Management', dru: 'Задачи, эксперт по ссылке, публичные страницы', den: 'Tasks, expert by link, public pages', view: 'manage', kw: 'управление задачи рейнджер эксперт публичная страница qr филиал management tasks ranger expert public page branch' },
    { id: 'tasks', ico: 'ok', ru: 'Задачи рейнджерам', en: 'Tasks for rangers', dru: 'Создать и закрыть с фото', den: 'Create and close with a photo', view: 'manage', sel: '#taskCard', kw: 'задача рейнджер поручение task ranger' },
    { id: 'expert', ico: 'chat', ru: 'Проверка экспертом', en: 'Expert review', dru: 'Ссылка для орнитолога без регистрации', den: 'A link for an ornithologist, no registration', view: 'manage', sel: '#expCard', kw: 'эксперт орнитолог ссылка expert ornithologist link' },
    { id: 'public', ico: 'pin', ru: 'Публичная страница и QR', en: 'Public page and QR', dru: 'Слушайте болото, отчёт для спонсоров', den: 'Listen to the wetland, sponsor report', view: 'manage', sel: '#pubCard', kw: 'публичная страница qr табличка спонсор грант public page placard sponsor grant' },
    { id: 'branches', ico: 'team', ru: 'Филиалы', en: 'Branches', dru: 'Сводка по нескольким заповедникам', den: 'Summary of several reserves', view: 'manage', sel: '#umbCard', kw: 'филиал ведомство парк branch umbrella parks' },
    { id: 'offline', ico: 'off', ru: 'Работа без интернета', en: 'Work offline', dru: 'Модель прямо в телефоне', den: 'The model right on the phone', view: 'offline', kw: 'офлайн без интернета offline' }
  ];
  var root, input, listEl, gridEl, open = false, items = [], act = 0, opener = null;
  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е'); }
  function svg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + I[k] + '"/></svg>'; }
  function badge(a) { var b = a.badge && $(a.badge); return b && !b.hidden && b.textContent ? '<b class="qb">' + esc(b.textContent) + '</b>' : ''; }
  function build() {
    root = document.createElement('div'); root.className = 'qs'; root.hidden = true;
    root.innerHTML = '<div class="qs-bg" data-q="close"></div><div class="qs-panel" role="dialog" aria-modal="true" aria-label="' + esc(L('Быстрые действия', 'Quick actions')) + '">' +
      '<div class="qs-grab" aria-hidden="true"></div>' +
      '<div class="qs-head"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14zM20 20l-4-4"/></svg>' +
      '<input type="search" id="qIn" autocomplete="off" spellcheck="false" enterkeyhint="go" placeholder="' + esc(L('Что хотите сделать?', 'What do you want to do?')) + '" aria-label="' + esc(L('Что хотите сделать?', 'What do you want to do?')) + '">' +
      '<kbd>Esc</kbd></div>' +
      '<div class="qs-body"><div class="qs-grid" id="qGrid"></div><div class="qs-list" id="qList" role="listbox"></div><p class="qs-none" id="qNone" hidden>' + esc(L('Ничего не найдено. Попробуйте другое слово: «отчёт», «карта», «файлы».', 'Nothing found. Try another word: "report", "map", "files".')) + '</p></div>' +
      '<div class="qs-foot"><span><kbd>↑</kbd><kbd>↓</kbd> ' + esc(L('выбрать', 'select')) + '</span><span><kbd>Enter</kbd> ' + esc(L('открыть', 'open')) + '</span><span><kbd>Ctrl</kbd><kbd>K</kbd></span></div></div>';
    document.body.appendChild(root);
    input = $('#qIn', root); listEl = $('#qList', root); gridEl = $('#qGrid', root);
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-q="close"]')) return close();
      var b = e.target.closest('[data-a]'); if (b) run(b.dataset.a);
    });
    input.addEventListener('input', render);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && items[act] && (e.target === input || e.target.closest('.qs-body'))) { e.preventDefault(); run(items[act].id); }
      else if (e.key === 'Tab') {   /* keep focus inside the dialog */
        var f = Array.prototype.slice.call(root.querySelectorAll('input,button')).filter(function (x) { return x.offsetParent !== null; });
        if (!f.length) return; var i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
      }
    });
  }
  function score(a, q) {
    var hay = norm(a.ru + ' ' + a.en + ' ' + a.dru + ' ' + a.den + ' ' + a.kw), s = 0, ok = true;
    q.split(/\s+/).forEach(function (w) { if (!w) return; var i = hay.indexOf(w); if (i < 0) ok = false; else s += (norm(a.ru + ' ' + a.en).indexOf(w) >= 0 ? 3 : 1); });
    return ok ? s : 0;
  }
  function render() {
    var q = norm(input.value).trim(), tiles = '', rows = '';
    if (!q) {
      tiles = ACTS.filter(function (a) { return a.top; }).map(function (a) { return '<button class="qt" data-a="' + a.id + '">' + svg(a.ico) + '<span>' + esc(L(a.ru, a.en)) + '</span><small>' + esc(L(a.dru, a.den)) + '</small>' + badge(a) + '</button>'; }).join('');
      items = ACTS.filter(function (a) { return a.top; }).concat(ACTS.filter(function (a) { return !a.top; }));
      rows = ACTS.filter(function (a) { return !a.top; }).map(function (a) { return row(a); }).join('');
      rows = '<h3>' + esc(L('Все разделы', 'All sections')) + '</h3>' + rows;
    } else {
      items = ACTS.map(function (a) { return { a: a, s: score(a, q) }; }).filter(function (x) { return x.s; }).sort(function (x, y) { return y.s - x.s; }).map(function (x) { return x.a; });
      rows = items.map(function (a) { return row(a); }).join('');
    }
    gridEl.innerHTML = tiles; listEl.innerHTML = rows; $('#qNone', root).hidden = !(q && !items.length);
    act = 0; mark();
  }
  function row(a, i) { return '<button class="qi" role="option" data-a="' + a.id + '">' + svg(a.ico) + '<span><b>' + esc(L(a.ru, a.en)) + '</b><small>' + esc(L(a.dru, a.den)) + '</small></span>' + badge(a) + '</button>'; }
  function mark() {
    var els = Array.prototype.slice.call(root.querySelectorAll('[data-a]'));
    /* DOM order is tiles then rows, same as items */
    els.forEach(function (el, i) { el.classList.toggle('act', i === act); el.setAttribute('aria-selected', i === act ? 'true' : 'false'); });
    if (els[act]) els[act].scrollIntoView({ block: 'nearest' });
  }
  function move(d) { if (!items.length) return; act = (act + d + items.length) % items.length; mark(); }
  function run(id) {
    var a = ACTS.filter(function (x) { return x.id === id; })[0]; if (!a) return;
    close(true); A.show(a.view);
    if (a.sel || a.focus) setTimeout(function () {
      var el = a.sel && $(a.sel); if (el) {
        for (var p = el.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
        if (el.tagName === 'DETAILS') el.open = true;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' }); el.classList.add('qflash'); setTimeout(function () { el.classList.remove('qflash'); }, 1600);
      }
      var f = a.focus && $(a.focus); if (f && f.focus) try { f.focus({ preventScroll: true }); } catch (e) { f.focus(); }
    }, 60);
  }
  function openIt() {
    if (open) return; if (!root) build();
    open = true; opener = document.activeElement; root.hidden = false; document.body.classList.add('qs-lock');
    input.value = ''; render();
    void root.offsetWidth;   /* commit the hidden state so the slide-in animates; no rAF, it is paused in background tabs */
    root.classList.add('on');
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) input.focus(); else $('.qs-panel', root).setAttribute('tabindex', '-1');
    document.querySelectorAll('.fab').forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
  }
  function close(keepFocus) {
    if (!open) return; open = false; root.classList.remove('on'); document.body.classList.remove('qs-lock');
    document.querySelectorAll('.fab').forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    setTimeout(function () { if (!open) root.hidden = true; }, 220);
    if (keepFocus !== true && opener && opener.focus) try { opener.focus(); } catch (e) {}
  }
  document.querySelectorAll('.fab').forEach(function (b) { b.addEventListener('click', function () { open ? close() : openIt(); }); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && String(e.key).toLowerCase() === 'k') { e.preventDefault(); open ? close() : openIt(); }
  });
  window.WEQuick = { open: openIt, close: close };
})();
