/* WetlandEar expert page: a person without an account listens to one recording and answers. /api/expert?t=TOKEN */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search), TOKEN = q.get('t') || '';
  var LANG = ['ru', 'en', 'kk'].indexOf(q.get('lang')) >= 0 ? q.get('lang') : ((navigator.language || '').slice(0, 2) === 'en' ? 'en' : (navigator.language || '').slice(0, 2) === 'kk' ? 'kk' : 'ru');
  var T = {
    ru: { title: 'Помогите определить звук', lead: 'Вас просят послушать короткую запись и сказать, какая птица поёт. Регистрация не нужна.', from: 'Запрос от', rec: 'Запись', model: 'Что думает модель', pick: 'Это', other: 'Другой вид',
      otherPh: 'Название вида (по-русски или по-латыни)', reject: 'Это не птица или запись непригодна', unsure: 'Не могу определить', comment: 'Комментарий (по желанию)', name: 'Ваше имя (по желанию)', send: 'Отправить ответ',
      thanks: 'Спасибо! Ответ передан.', done: 'На этот запрос уже ответили. Спасибо!', expired: 'Срок запроса истёк.', err: 'Запрос не найден.', noaudio: 'Аудио недоступно.', fail: 'Не удалось отправить. Попробуйте ещё раз.', pick1: 'Выберите вариант',
      foot: 'Ваш ответ увидит только тот, кто отправил запрос. Мы не сохраняем ничего, кроме ответа.' },
    en: { title: 'Help identify a sound', lead: 'You are asked to listen to a short recording and say which bird is singing. No registration needed.', from: 'Request from', rec: 'Recording', model: 'What the model thinks', pick: 'It is', other: 'Another species',
      otherPh: 'Species name (common or Latin)', reject: 'Not a bird or the recording is unusable', unsure: 'I cannot tell', comment: 'Comment (optional)', name: 'Your name (optional)', send: 'Send answer',
      thanks: 'Thank you! Your answer was sent.', done: 'This request has already been answered. Thank you!', expired: 'This request has expired.', err: 'Request not found.', noaudio: 'Audio is not available.', fail: 'Could not send. Please try again.', pick1: 'Choose an option',
      foot: 'Only the person who sent the request will see your answer. We store nothing but the answer.' },
    kk: { title: 'Дыбысты анықтауға көмектесіңіз', lead: 'Қысқа жазбаны тыңдап, қай құс ән салып тұрғанын айтуыңызды сұрайды. Тіркелу керек емес.', from: 'Сұраныс жіберген', rec: 'Жазба', model: 'Модель не ойлайды', pick: 'Бұл', other: 'Басқа түр',
      otherPh: 'Түрдің атауы (қазақша, орысша немесе латынша)', reject: 'Бұл құс емес немесе жазба жарамсыз', unsure: 'Анықтай алмаймын', comment: 'Пікір (қалауыңызша)', name: 'Атыңыз (қалауыңызша)', send: 'Жауап жіберу',
      thanks: 'Рахмет! Жауап жіберілді.', done: 'Бұл сұранысқа бұрын жауап берілген. Рахмет!', expired: 'Сұраныс мерзімі өтті.', err: 'Сұраныс табылмады.', noaudio: 'Аудио қолжетімсіз.', fail: 'Жіберілмеді. Қайталап көріңіз.', pick1: 'Нұсқаны таңдаңыз',
      foot: 'Жауабыңызды тек сұраныс жіберген адам көреді. Жауаптан басқа ештеңе сақталмайды.' }
  };
  function t(k) { return T[LANG][k]; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var data = null, sent = false;
  function render() {
    document.documentElement.lang = LANG; document.title = t('title') + ' · WetlandEar';
    document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); });
    document.getElementById('foot').textContent = t('foot');
    var root = document.getElementById('root'), d = data;
    if (sent) { root.innerHTML = '<section class="card"><h1>' + esc(t('thanks')) + '</h1></section>'; return; }
    if (!d) { root.innerHTML = '<p class="hint">' + esc(t('err')) + '</p>'; return; }
    if (d.expired) { root.innerHTML = '<section class="card"><h1>' + esc(t('expired')) + '</h1></section>'; return; }
    if (d.answered) { root.innerHTML = '<section class="card"><h1>' + esc(t('done')) + '</h1></section>'; return; }
    var c = d.candidates || [];
    root.innerHTML = '<section class="pub-hero"><h1>' + esc(t('title')) + '</h1><p class="lead">' + esc(t('lead')) + '</p>' + (d.from ? '<p class="hint">' + esc(t('from')) + ': ' + esc(d.from) + '</p>' : '') + '</section>' +
      '<section class="card"><h2>' + esc(t('rec')) + (d.ts ? ' <span class="hint">' + esc(d.ts.replace('T', ' ')) + '</span>' : '') + '</h2><audio controls preload="auto" src="/api/expert?t=' + encodeURIComponent(TOKEN) + '&clip=1"></audio><p class="hint" id="noaud" hidden>' + esc(t('noaudio')) + '</p>' +
      (d.question ? '<p class="exp-q">' + esc(d.question) + '</p>' : '') + '</section>' +
      '<section class="card"><form id="f"><h2>' + esc(t('model')) + '</h2><div class="exp-opts">' +
      c.map(function (x, i) { return '<label class="exp-o"><input type="radio" name="v" value="pick:' + i + '"><span><b>' + esc((LANG !== 'en' && x.ru) || x.common || x.sci || '?') + '</b>' + (x.sci ? '<small>' + esc(x.sci) + '</small>' : '') + '</span><em>' + (x.conf != null ? Math.round(x.conf * 100) + '%' : '') + '</em></label>'; }).join('') +
      '<label class="exp-o"><input type="radio" name="v" value="other"><span><b>' + esc(t('other')) + '</b></span></label><input type="text" id="oth" maxlength="80" placeholder="' + esc(t('otherPh')) + '" hidden>' +
      '<label class="exp-o"><input type="radio" name="v" value="reject"><span><b>' + esc(t('reject')) + '</b></span></label>' +
      '<label class="exp-o"><input type="radio" name="v" value="unsure"><span><b>' + esc(t('unsure')) + '</b></span></label></div>' +
      '<label class="exp-f">' + esc(t('comment')) + '<textarea id="cm" maxlength="400" rows="2"></textarea></label><label class="exp-f">' + esc(t('name')) + '<input id="nm" maxlength="80" autocomplete="name"></label>' +
      '<p class="hint" id="msg" role="alert"></p><button class="btn primary" type="submit">' + esc(t('send')) + '</button></form></section>';
    var a = root.querySelector('audio'); a.addEventListener('error', function () { document.getElementById('noaud').hidden = false; });
    root.querySelectorAll('input[name="v"]').forEach(function (r) { r.addEventListener('change', function () { document.getElementById('oth').hidden = r.value !== 'other' || !r.checked; if (r.value === 'other') document.getElementById('oth').focus(); }); });
    document.getElementById('f').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (root.querySelector('input[name="v"]:checked') || {}).value, msg = document.getElementById('msg');
      if (!v) { msg.textContent = t('pick1'); return; }
      var body = { t: TOKEN, comment: document.getElementById('cm').value, name: document.getElementById('nm').value };
      if (v.indexOf('pick:') === 0) { body.verdict = 'pick'; body.pick = +v.slice(5); } else if (v === 'other') { body.verdict = 'other'; body.species = document.getElementById('oth').value; } else body.verdict = v;
      var btn = e.target.querySelector('button[type="submit"]'); btn.disabled = true;
      fetch('/api/expert', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { if (!r.ok) throw r.status; sent = true; render(); })
        .catch(function (s) { btn.disabled = false; msg.textContent = s === 409 ? t('done') : t('fail'); });
    });
  }
  function load() {
    fetch('/api/expert?t=' + encodeURIComponent(TOKEN)).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { data = j; render(); }).catch(function () { data = null; render(); });
  }
  document.querySelector('.lang').addEventListener('click', function (e) { var b = e.target.closest('button[data-l]'); if (!b) return; LANG = b.dataset.l; render(); });
  load();
})();
