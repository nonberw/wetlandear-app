/* WetlandEar App: management screen for a reserve.
   Tasks for rangers, expert review by link (no registration for the expert), public pages and sponsor reports with QR placards, branches under one umbrella.
   Needs sign-in and the database update supabase/008_operations.sql. */
(function () {
  'use strict';
  var S = window.WEStore, A = window.WEApp;
  function $(s, r) { return (r || document).querySelector(s); }
  var esc = A.esc;
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  function signed() { return !!(window.WESync && WESync.me()); }
  function db() { return WESync.from.apply(null, arguments); }
  function p2(n) { return ('0' + n).slice(-2); }
  function fmt(t) { var d = new Date(t); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function needSetup(e) { return e && /relation|does not exist|schema cache|function|permission/i.test(String(e.message || e)); }
  var SETUP = function () { return '<p class="hint">' + esc(L('Раздел станет доступен после обновления базы данных (файл supabase/008_operations.sql). Это делает администратор один раз.', 'This section becomes available after the database update (file supabase/008_operations.sql). The administrator does it once.')) + '</p>'; };
  var SIGNIN = function () { return '<p class="hint">' + esc(L('Войдите через Google, чтобы пользоваться этим разделом.', 'Sign in with Google to use this section.')) + '</p>'; };
  var people = {}, orgs = [];   /* user id -> name, my organisations */

  function loadPeople() {
    return WESync.orgList().then(function (list) {
      orgs = list || [];
      return Promise.all(orgs.map(function (o) { return WESync.orgPeople(o.id).then(function (ps) { ps.forEach(function (p) { people[p.user_id] = p.display_name; }); }); }));
    }).catch(function () { orgs = []; });
  }
  function nameOf(uid) { return uid === WESync.userId() ? L('вы', 'you') : (people[uid] || L('сотрудник', 'colleague')); }
  function copy(text) {
    var done = function () { A.toast(L('Ссылка скопирована', 'Link copied')); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { window.prompt(L('Скопируйте ссылку', 'Copy the link'), text); });
    else window.prompt(L('Скопируйте ссылку', 'Copy the link'), text);
  }

  /* ---------- photo for a closed task: shrink on the device, keep it small ---------- */
  function shrink(file, max) {
    return new Promise(function (res, rej) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        var q = .72, out = c.toDataURL('image/jpeg', q); while (out.length > 200000 && q > .3) { q -= .1; out = c.toDataURL('image/jpeg', q); }
        out.length > 240000 ? rej(new Error('big')) : res(out);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('img')); }; img.src = url;
    });
  }

  /* ---------- tasks ---------- */
  var openForm = null, taskPre = null;
  function stationNames() { var o = {}; S.get().recs.forEach(function (r) { if (r.station && !/^демо|^demo/i.test(r.station)) o[r.station] = 1; }); return Object.keys(o); }
  function tasksCard() {
    var box = $('#taskCard'); if (!box) return;
    var head = '<h2>' + esc(L('Задачи рейнджерам', 'Tasks for rangers')) + '</h2><p class="hint">' + esc(L('Из события или с нуля: «проверить гнездо у станции 3». Рейнджер закрывает задачу с заметкой и фото.', 'From an event or from scratch: "check the nest near station 3". A ranger closes the task with a note and a photo.')) + '</p>';
    if (!signed()) { box.innerHTML = head + SIGNIN(); return; }
    box.innerHTML = head + '<p class="hint">' + esc(L('Загружаю…', 'Loading…')) + '</p>';
    Promise.all([db('tasks').select('*').order('created_at', { ascending: false }).limit(100), loadPeople()]).then(function (r) {
      if (r[0].error) throw r[0].error;
      var list = r[0].data, open = list.filter(function (t) { return t.status === 'open'; }), done = list.filter(function (t) { return t.status === 'done'; }).slice(0, 12);
      var stn = stationNames(), staff = Object.keys(people);
      var form = '<form class="mg-form" id="tkForm"><input id="tkTitle" maxlength="140" placeholder="' + esc(L('Что нужно сделать', 'What needs to be done')) + '" required value="' + esc(taskPre ? taskPre.title : '') + '">' +
        '<div class="mg-row"><select id="tkStn"><option value="">' + esc(L('Станция не указана', 'No station')) + '</option>' + stn.map(function (n) { return '<option' + (taskPre && taskPre.station === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>' +
        '<select id="tkWho"><option value="">' + esc(L('Кому: любому', 'To: anyone')) + '</option>' + staff.map(function (u) { return '<option value="' + esc(u) + '">' + esc(nameOf(u)) + '</option>'; }).join('') + '</select></div>' +
        '<textarea id="tkNote" rows="2" maxlength="500" placeholder="' + esc(L('Подробности (по желанию)', 'Details (optional)')) + '"></textarea><button class="btn primary" type="submit">' + esc(L('Создать задачу', 'Create task')) + '</button></form>';
      var row = function (t) {
        var meta = [t.station, t.assignee ? L('для: ', 'for: ') + nameOf(t.assignee) : '', L('от: ', 'from: ') + nameOf(t.owner), fmt(t.created_at)].filter(Boolean).join(' · ');
        if (t.status === 'open') return '<div class="tk" data-id="' + esc(t.id) + '"><b>' + esc(t.title) + '</b><small>' + esc(meta) + '</small>' + (t.note ? '<p>' + esc(t.note) + '</p>' : '') +
          '<div class="mg-row"><button class="btn" data-a="close">' + esc(L('Выполнено…', 'Done…')) + '</button><button class="link" data-a="del">' + esc(L('Удалить', 'Delete')) + '</button></div></div>';
        return '<div class="tk done" data-id="' + esc(t.id) + '"><b>✓ ' + esc(t.title) + '</b><small>' + esc(meta) + ' · ' + esc(L('сделал(а): ', 'done by: ')) + esc(nameOf(t.done_by)) + (t.done_at ? ' ' + fmt(t.done_at) : '') + '</small>' +
          (t.done_note ? '<p>' + esc(t.done_note) + '</p>' : '') + (t.done_photo ? '<img class="tk-photo" alt="" src="' + esc(t.done_photo) + '">' : '') + '<div class="mg-row"><button class="link" data-a="reopen">' + esc(L('Вернуть в работу', 'Reopen')) + '</button></div></div>';
      };
      box.innerHTML = head + form + '<h3>' + esc(L('В работе', 'Open')) + ' (' + open.length + ')</h3>' + (open.length ? open.map(row).join('') : '<p class="hint">' + esc(L('Открытых задач нет.', 'No open tasks.')) + '</p>') +
        (done.length ? '<h3>' + esc(L('Недавно выполнены', 'Recently done')) + '</h3>' + done.map(row).join('') : '');
      taskPre = null;
      var f = $('#tkForm', box); f.addEventListener('submit', function (e) {
        e.preventDefault(); var b = $('button', f); b.disabled = true;
        var row = { title: $('#tkTitle').value.trim(), note: $('#tkNote').value.trim() || null, station: $('#tkStn').value || null, assignee: $('#tkWho').value || null };
        if (openForm && openForm.det) row.det_id = openForm.det;
        db('tasks').insert(row).then(function (r) { if (r.error) throw r.error; openForm = null; A.toast(L('Задача создана', 'Task created')); tasksCard(); }).catch(function () { b.disabled = false; A.toast(L('Не удалось создать задачу', 'Could not create the task')); });
      });
      box.onclick = function (e) {
        var b = e.target.closest('[data-a]'), tk = e.target.closest('.tk'); if (!b || !tk) return; var id = tk.getAttribute('data-id');
        if (b.dataset.a === 'del') { if (confirm(L('Удалить задачу?', 'Delete the task?'))) db('tasks').delete().eq('id', id).then(function () { tasksCard(); }); }
        else if (b.dataset.a === 'reopen') db('tasks').update({ status: 'open' }).eq('id', id).then(function () { tasksCard(); });
        else if (b.dataset.a === 'close') {
          tk.querySelector('.mg-row').innerHTML = '<textarea rows="2" maxlength="500" class="tk-n" placeholder="' + esc(L('Что сделано (по желанию)', 'What was done (optional)')) + '"></textarea><label class="btn">' + esc(L('Фото', 'Photo')) + '<input type="file" accept="image/*" capture="environment" class="tk-f" hidden></label><button class="btn primary" data-a="fin">' + esc(L('Закрыть задачу', 'Close the task')) + '</button><span class="hint tk-s"></span>';
          tk.querySelector('.tk-f').addEventListener('change', function () { tk.querySelector('.tk-s').textContent = this.files[0] ? this.files[0].name : ''; });
        } else if (b.dataset.a === 'fin') {
          b.disabled = true; var file = tk.querySelector('.tk-f').files[0], note = tk.querySelector('.tk-n').value.trim() || null;
          (file ? shrink(file, 900) : Promise.resolve(null)).then(function (photo) { return db('tasks').update({ status: 'done', done_note: note, done_photo: photo }).eq('id', id); })
            .then(function (r) { if (r.error) throw r.error; tasksCard(); }).catch(function () { b.disabled = false; A.toast(L('Не удалось закрыть задачу', 'Could not close the task')); });
        }
      };
    }).catch(function (e) { box.innerHTML = head + (needSetup(e) ? SETUP() : '<p class="hint">' + esc(L('Не удалось загрузить задачи.', 'Could not load the tasks.')) + '</p>'); });
  }
  /* a task made from the review screen opens this screen with the form pre-filled */
  function taskFromEvent() {
    var d = A.reviewCurrent && A.reviewCurrent(); if (!d) return;
    var sp = d.suggest ? S.sugName(d.suggest) : '';
    taskPre = { title: L('Проверить событие', 'Check the event') + (sp ? ': ' + sp : '') + ' (' + fmt(d.ts) + ')', station: d.station || '' }; openForm = { det: d.id };
    A.show('manage');
  }

  /* ---------- expert review by link ---------- */
  function candidatesOf(d) {
    var g = d.suggest; if (!g) return [];
    return [g].concat(g.alts || []).slice(0, 5).map(function (x) { return { common: x.common || x.sci || '', sci: x.sci || '', ru: x.id ? S.nameOf(x.id) : (S.sugName ? S.sugName(x) : ''), conf: Math.round((x.conf || 0) * 100) / 100 }; }).filter(function (x) { return x.common || x.sci; });
  }
  function askExpert() {
    var d = A.reviewCurrent && A.reviewCurrent(); if (!d) return;
    if (!signed()) { A.toast(L('Войдите через Google', 'Sign in with Google')); return; }
    var q = window.prompt(L('Вопрос эксперту (по желанию)', 'Question for the expert (optional)'), ''); if (q === null) return;
    var btn = $('#revExpert'); btn.disabled = true;
    S.getClip(d.id).then(function (clip) {
      if (!clip) throw new Error('noclip');
      return WESync.uploadClip(d.id, clip);   /* the expert page plays the recording from private storage through the server */
    }).then(function () { return db('expert_requests').insert({ det_id: d.id, question: q.trim() || null, candidates: candidatesOf(d) }).select('token').single(); })
      .then(function (r) { if (r.error) throw r.error; var url = location.origin + '/expert?t=' + r.data.token; copy(url); A.toast(L('Ссылка для эксперта скопирована. Она действует 14 дней.', 'Link for the expert copied. It works for 14 days.')); })
      .catch(function (e) { A.toast(e && e.message === 'noclip' ? L('У события нет аудиоклипа', 'This event has no audio clip') : needSetup(e) ? L('Нужно обновить базу данных (008)', 'The database update (008) is needed') : L('Не удалось создать ссылку', 'Could not create the link')); })
      .then(function () { btn.disabled = false; });
  }
  function expertsCard() {
    var box = $('#expCard'); if (!box) return;
    var head = '<h2>' + esc(L('Проверка экспертом', 'Expert review')) + '</h2><p class="hint">' + esc(L('На экране «Проверка» нажмите «Спросить эксперта»: получится ссылка. Орнитолог слушает запись и отвечает без регистрации. Вы решаете, принять ли ответ.', 'On the Review screen press "Ask an expert" to get a link. An ornithologist listens and answers without registering. You decide whether to accept the answer.')) + '</p>';
    if (!signed()) { box.innerHTML = head + SIGNIN(); return; }
    db('expert_requests').select('*').order('created_at', { ascending: false }).limit(30).then(function (r) {
      if (r.error) throw r.error;
      var rows = r.data.map(function (x) {
        var a = x.answer, det = S.get().dets.filter(function (d) { return d.id === x.det_id; })[0], when = det ? fmt(det.ts) : fmt(x.created_at), link = location.origin + '/expert?t=' + x.token;
        var ans = '';
        if (x.status === 'answered' && a) {
          var txt = a.verdict === 'reject' ? L('не птица / запись непригодна', 'not a bird / unusable') : a.verdict === 'unsure' ? L('не смог определить', 'could not tell') : a.species;
          ans = '<p><b>' + esc(L('Ответ', 'Answer')) + ':</b> ' + esc(txt) + (a.name ? ' <span class="hint">(' + esc(a.name) + ')</span>' : '') + '</p>' + (a.comment ? '<p class="hint">' + esc(a.comment) + '</p>' : '') +
            (x.applied ? '<span class="chip">' + esc(L('применено', 'applied')) + '</span>' : (det && (a.verdict === 'pick' || a.verdict === 'other' || a.verdict === 'reject') ? '<button class="btn primary" data-a="apply">' + esc(L('Применить к журналу', 'Apply to the journal')) + '</button>' : ''));
        } else ans = '<p class="hint">' + esc(L('Ждём ответа. Ссылка:', 'Waiting for an answer. Link:')) + ' <button class="link" data-a="copy">' + esc(L('скопировать', 'copy')) + '</button></p>';
        return '<div class="tk" data-id="' + esc(x.id) + '" data-link="' + esc(link) + '" data-det="' + esc(x.det_id) + '"><b>' + esc(L('Запись', 'Recording')) + ' ' + esc(when) + '</b>' + (x.question ? '<small>' + esc(x.question) + '</small>' : '') + ans + '</div>';
      }).join('');
      box.innerHTML = head + (rows || '<p class="hint">' + esc(L('Запросов пока нет.', 'No requests yet.')) + '</p>');
      box.onclick = function (e) {
        var b = e.target.closest('[data-a]'), tk = e.target.closest('.tk'); if (!b || !tk) return;
        if (b.dataset.a === 'copy') return copy(tk.getAttribute('data-link'));
        if (b.dataset.a === 'apply') {
          var x = r.data.filter(function (y) { return y.id === tk.getAttribute('data-id'); })[0], a = x.answer, did = x.det_id;
          if (a.verdict === 'reject') S.setStatus(did, 'rejected', null);
          else { var sp = window.WEBatch ? WEBatch.resolveSpecies(a.species) : null; if (!sp) return; S.setStatus(did, 'confirmed', sp.id); }
          db('expert_requests').update({ applied: true }).eq('id', x.id).then(function () { A.refreshChrome(); expertsCard(); });
        }
      };
    }).catch(function (e) { box.innerHTML = head + (needSetup(e) ? SETUP() : '<p class="hint">' + esc(L('Не удалось загрузить запросы.', 'Could not load the requests.')) + '</p>'); });
  }

  /* ---------- public pages, sponsor reports, QR placards ---------- */
  function qrSvg(url) { try { var q = window.qrcode(0, 'M'); q.addData(url); q.make(); return q.createSvgTag({ cellSize: 6, margin: 2, scalable: true }); } catch (e) { return ''; } }
  function pageUrl(p) { return location.origin + '/live?t=' + p.token; }
  function placard(p) {
    var url = pageUrl(p), m = document.createElement('div'); m.id = 'plc'; m.className = 'modal';
    m.innerHTML = '<div class="modal-box plc-box"><button class="modal-x" aria-label="' + esc(L('Закрыть', 'Close')) + '">×</button><div class="plc"><p class="eyebrow">WetlandEar</p><h1>' + esc(p.title) + '</h1><p class="lead">' + esc(L('Отсканируйте код: какие птицы поют здесь сегодня и как звучит болото.', 'Scan the code: which birds sing here today and how the wetland sounds.')) + '</p><div class="plc-qr">' + qrSvg(url) + '</div><p class="hint">' + esc(url) + '</p></div><div class="no-print mg-row"><button class="btn primary" id="plcPrint">' + esc(L('Печать', 'Print')) + '</button></div></div>';
    document.body.appendChild(m); document.body.classList.add('plc-print');
    var close = function () { m.remove(); document.body.classList.remove('plc-print'); };
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('.modal-x')) close(); });
    $('#plcPrint', m).addEventListener('click', function () { window.print(); });
  }
  function pubCard() {
    var box = $('#pubCard'); if (!box) return;
    var head = '<h2>' + esc(L('Публичные страницы и отчёты для спонсоров', 'Public pages and sponsor reports')) + '</h2><p class="hint">' + esc(L('Ссылка без входа: посетители видят, какие птицы слышны сейчас, а спонсоры и гранты получают страницу с цифрами за год. Точные координаты не публикуются, редкие виды скрыты. Страницу можно отключить в любой момент. На страницу станции можно повесить QR-табличку на тропе.', 'A link without sign-in: visitors see which birds are heard now, sponsors and grant makers get a page with the numbers for the year. Exact coordinates are never published and rare species are hidden. You can switch a page off at any time. A station page can get a QR placard on the trail.')) + '</p>';
    if (!signed()) { box.innerHTML = head + SIGNIN(); return; }
    Promise.all([db('public_pages').select('*').order('created_at', { ascending: false }), loadPeople()]).then(function (res) {
      if (res[0].error) throw res[0].error;
      var list = res[0].data, stn = stationNames(), mine = orgs.filter(function (o) { return o.role !== 'viewer'; });
      var form = '<form class="mg-form" id="pgForm"><div class="mg-row"><select id="pgKind"><option value="live">' + esc(L('Слушайте болото (для посетителей)', 'Listen to the wetland (visitors)')) + '</option><option value="report">' + esc(L('Отчёт для спонсоров и грантов', 'Sponsor and grant report')) + '</option></select>' +
        '<select id="pgStn"><option value="">' + esc(L('Все станции', 'All stations')) + '</option>' + stn.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('') + '</select></div>' +
        '<input id="pgTitle" maxlength="80" required placeholder="' + esc(L('Название страницы, например «Тропа у озера Тенгиз»', 'Page title, for example "Lake Tengiz trail"')) + '">' +
        '<label class="chk"><input type="checkbox" id="pgClip" checked> ' + esc(L('Показывать «голос недели» с аудио', 'Show a "voice of the week" with audio')) + '</label>' +
        (mine.length ? '<label class="chk"><input type="checkbox" id="pgOrg"> ' + esc(L('Включить данные всей команды', 'Include the data of the whole team')) + ' (' + esc(mine[0].name) + ')</label>' : '') +
        '<button class="btn primary" type="submit">' + esc(L('Создать страницу', 'Create page')) + '</button></form>';
      var cards = list.map(function (p) {
        var url = pageUrl(p);
        return '<div class="tk pg' + (p.enabled ? '' : ' off') + '" data-id="' + esc(p.id) + '"><b>' + esc(p.title) + '</b><small>' + esc(p.kind === 'report' ? L('Отчёт для спонсоров', 'Sponsor report') : L('Для посетителей', 'For visitors')) + (p.station ? ' · ' + esc(p.station) : '') + (p.enabled ? '' : ' · ' + esc(L('отключена', 'switched off'))) + '</small>' +
          '<div class="pg-link"><input readonly value="' + esc(url) + '" aria-label="' + esc(L('Ссылка', 'Link')) + '"></div><div class="mg-row">' +
          '<button class="btn" data-a="copy">' + esc(L('Копировать', 'Copy')) + '</button><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(L('Открыть', 'Open')) + '</a><button class="btn" data-a="qr">QR</button>' +
          '<button class="link" data-a="toggle">' + esc(p.enabled ? L('Отключить', 'Switch off') : L('Включить', 'Switch on')) + '</button><button class="link" data-a="del">' + esc(L('Удалить', 'Delete')) + '</button></div></div>';
      }).join('');
      box.innerHTML = head + form + (cards || '<p class="hint">' + esc(L('Страниц пока нет.', 'No pages yet.')) + '</p>');
      $('#pgForm', box).addEventListener('submit', function (e) {
        e.preventDefault(); var b = $('button[type="submit"]', e.target); b.disabled = true;
        var org = $('#pgOrg') && $('#pgOrg').checked ? mine[0].id : null;
        db('public_pages').insert({ kind: $('#pgKind').value, title: $('#pgTitle').value.trim(), station: $('#pgStn').value || null, show_clip: $('#pgClip').checked, org_id: org }).then(function (r) { if (r.error) throw r.error; A.toast(L('Страница создана', 'Page created')); pubCard(); })
          .catch(function () { b.disabled = false; A.toast(L('Не удалось создать страницу', 'Could not create the page')); });
      });
      box.onclick = function (e) {
        var b = e.target.closest('[data-a]'), el = e.target.closest('.pg'); if (!b || !el) return;
        var p = list.filter(function (x) { return x.id === el.getAttribute('data-id'); })[0];
        if (b.dataset.a === 'copy') copy(pageUrl(p));
        else if (b.dataset.a === 'qr') placard(p);
        else if (b.dataset.a === 'toggle') db('public_pages').update({ enabled: !p.enabled }).eq('id', p.id).then(function () { pubCard(); });
        else if (b.dataset.a === 'del' && confirm(L('Удалить страницу? Ссылка и QR-коды перестанут работать.', 'Delete the page? The link and QR codes will stop working.'))) db('public_pages').delete().eq('id', p.id).then(function () { pubCard(); });
      };
    }).catch(function (e) { box.innerHTML = head + (needSetup(e) ? SETUP() : '<p class="hint">' + esc(L('Не удалось загрузить страницы.', 'Could not load the pages.')) + '</p>'); });
  }

  /* ---------- branches under one umbrella ---------- */
  function umbCard() {
    var box = $('#umbCard'); if (!box) return;
    var head = '<h2>' + esc(L('Филиалы и несколько заповедников', 'Branches and several reserves')) + '</h2><p class="hint">' + esc(L('Национальный парк или ведомство создаёт организацию, а каждый заповедник или участок подключается как её филиал. Руководство видит только сводные цифры по филиалам, а не их записи.', 'A national park or an agency creates an organisation and every reserve or section joins as its branch. Management sees only summary numbers per branch, not their recordings.')) + '</p>';
    if (!signed()) { box.innerHTML = head + SIGNIN(); return; }
    loadPeople().then(function () {
      var owned = orgs.filter(function (o) { return o.role === 'owner'; });
      if (!owned.length) { box.innerHTML = head + '<p class="hint">' + esc(L('Сначала создайте организацию на экране «Профиль → Команда».', 'First create an organisation on Profile → Team.')) + '</p>'; return; }
      return Promise.all(owned.map(function (o) { return WESync.rpc('umbrella_overview', { p_parent: o.id }).then(function (r) { return { o: o, rows: r || [] }; }, function (e) { if (needSetup(e)) throw e; return { o: o, rows: [] }; }); })).then(function (res) {
        box.innerHTML = head + res.map(function (x) {
          var t = x.rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(L('Филиал', 'Branch')) + '</th><th>' + esc(L('Людей', 'People')) + '</th><th>' + esc(L('Событий за 7 дней', 'Events, 7 days')) + '</th><th>' + esc(L('Видов за 30 дней', 'Species, 30 days')) + '</th><th>' + esc(L('Тревог', 'Alerts')) + '</th><th>' + esc(L('Последнее событие', 'Last event')) + '</th></tr></thead><tbody>' +
            x.rows.map(function (r) { return '<tr><td>' + esc(r.name) + '</td><td>' + r.members + '</td><td>' + r.events_7d + '</td><td>' + r.species_30d + '</td><td' + (r.threats_7d ? ' class="late"' : '') + '>' + r.threats_7d + '</td><td>' + (r.last_event ? fmt(r.last_event) : '–') + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="hint">' + esc(L('Филиалов пока нет.', 'No branches yet.')) + '</p>';
          return '<div class="umb" data-id="' + esc(x.o.id) + '"><h3>' + esc(x.o.name) + '</h3>' + t + '<form class="mg-row umb-add"><input maxlength="80" required placeholder="' + esc(L('Название нового филиала', 'Name of a new branch')) + '"><button class="btn" type="submit">' + esc(L('Добавить филиал', 'Add a branch')) + '</button></form></div>';
        }).join('') + '<p class="hint">' + esc(L('Сотрудники филиала подключаются к нему по коду организации, как обычная команда.', 'Staff of a branch join it with the organisation code, like an ordinary team.')) + '</p>';
        box.onsubmit = function (e) {
          e.preventDefault(); var f = e.target, id = f.closest('.umb').getAttribute('data-id'), inp = f.querySelector('input');
          WESync.rpc('create_child_org', { p_parent: id, p_name: inp.value.trim() }).then(function () { A.toast(L('Филиал создан', 'Branch created')); umbCard(); }).catch(function () { A.toast(L('Не удалось создать филиал', 'Could not create the branch')); });
        };
      });
    }).catch(function (e) { box.innerHTML = head + (needSetup(e) ? SETUP() : '<p class="hint">' + esc(L('Не удалось загрузить данные.', 'Could not load the data.')) + '</p>'); });
  }

  function render() { tasksCard(); expertsCard(); pubCard(); umbCard(); }
  function init() {
    var b1 = $('#revExpert'), b2 = $('#revTask');
    if (b1) b1.addEventListener('click', askExpert);
    if (b2) b2.addEventListener('click', taskFromEvent);
  }
  init();
  var prev = window.WEX && window.WEX.onShow;
  if (window.WEX) window.WEX.onShow = function (v) { if (prev) prev(v); if (v === 'manage') render(); };
  if (window.WESync) WESync.onChange(function () { if (A.current() === 'manage') render(); });
  window.WEManage = { render: render };
})();
