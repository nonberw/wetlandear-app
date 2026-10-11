/* WetlandEar App: voice assistant for a ranger with busy hands.
   Say a short command: open a screen, ask what was heard today, listen to / confirm / reject / skip the event under review.
   Speech to text uses the browser (Web Speech API). In Chrome the sound of the voice goes to the browser vendor's service, so the first start asks for consent.
   The parser is plain text matching, so every command can also be typed into the panel (that is also the way for browsers without speech input). */
(function () {
  'use strict';
  var A = window.WEApp, S = window.WEStore, $ = function (s, r) { return (r || document).querySelector(s); };
  function L(ru, en, kk) { if (kk !== undefined && lang() === 'kk') return kk; return window.WEi18n ? WEi18n.L(ru, en) : ru; }   /* kk is given where the sentence has numbers or names in it, so a fixed dictionary cannot translate it */
  function lang() { return window.WEi18n ? WEi18n.lang : 'ru'; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function norm(s) { return String(s).toLowerCase().replace(/ё/g, 'е').replace(/[.,!?;:"«»()]/g, ' ').replace(/\s+/g, ' ').trim(); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { } return null; }

  /* screens a person can ask for: [word stems (Russian, English, Kazakh), view, spoken name] */
  var VIEWS = [
    [/главн|пульс|домой|домашн|home|pulse|басты/, 'pulse', ['Главная', 'Home', 'Басты бет']],
    [/журнал|находк|\blog\b|events list/, 'log', ['Журнал находок', 'Detection log', 'Табылғандар журналы']],
    [/проверк|проверить|review|check events|тексер/, 'review', ['Проверка событий', 'Event review', 'Оқиғаларды тексеру']],
    [/карт[ауеы]?\b|\bmap\b|станци.*карт|карта/, 'map', ['Карта станций', 'Station map', 'Станциялар картасы']],
    [/календар|calendar|күнтізбе/, 'calendar', ['Календарь активности', 'Activity calendar', 'Белсенділік күнтізбесі']],
    [/охран|тревог|нарушен|браконьер|guard|alerts|protection|poach|күзет|дабыл/, 'guard', ['Охрана', 'Protection', 'Күзет']],
    [/наук|фенолог|science|phenolog|ғылым/, 'science', ['Наука и учёт', 'Science', 'Ғылым және есеп']],
    [/управлен|задач|manage|tasks|басқару/, 'manage', ['Управление', 'Management', 'Басқару']],
    [/данн|экспорт|\bdata\b|export|деректер/, 'data', ['Данные', 'Data', 'Деректер']],
    [/профил|настройк|profile|settings|профиль/, 'profile', ['Профиль', 'Profile', 'Профиль']],
    [/отчет|отчёт|report|pdf|есеп/, 'report', ['Отчёт', 'Report', 'Есеп']],
    [/запис(ать|ь)|микрофон|слушать эфир|record|microphone|listen live|дыбыс жаз/, 'listen', ['Запись звука', 'Record sound', 'Дыбыс жазу']]
  ];
  var OPEN = /(открой|открыть|перейди|перейти|покажи|показать|давай|включи|go to|open|show|switch to|take me to|аш\b|ашу|көрсет)/;

  /* the grammar: returns { id, view?, ... } or null. Pure function, no page access */
  function parse(text, ctx) {
    var t = norm(text); ctx = ctx || {};
    if (!t) return null;
    if (/^(стоп|хватит|отбой|выключись|выключи помощник|замолчи|отключись|stop|stop listening|cancel|quiet|that's all|тоқта|болды|жеткілікті)$/.test(t)) return { id: 'stop' };
    if (/(что ты умеешь|что можно сказать|помощь|помоги|команды|what can you do|help|commands|what can i say|көмек|не істей аласың)/.test(t)) return { id: 'help' };
    if (/^(повтори|ещё раз|еще раз|что там|repeat|say again|again|қайтала)$/.test(t)) return { id: 'repeat' };
    var rev = ctx.view === 'review' && ctx.hasEvent;
    if (rev) {
      if (/^(слушать|послушать|слушай|играй|играть|воспроизведи|запусти|включи|play|listen|play it|тыңда|тыңдау|ойнат)$/.test(t)) return { id: 'play' };
      if (/^(верно|подтверди|подтвердить|правильно|подтверждаю|да|точно|confirm|correct|right|yes|ok|okay|yep|дұрыс|иә|растаймын|растау)$/.test(t)) return { id: 'yes' };
      if (/^(ошибка|неверно|не то|не верно|отклони|отклонить|неправильно|нет|reject|wrong|incorrect|no|nope|mistake|қате|жоқ|бұрыс|қабылдама)$/.test(t)) return { id: 'no' };
      if (/^(пропусти|пропустить|дальше|следующее|следующий|не знаю|skip|next|pass|not sure|өткіз|келесі|білмеймін)$/.test(t)) return { id: 'skip' };
    }
    if (/(тревог|нарушен|выстрел|браконьер|alert|threat|gunshot|gun shot|poach|violation|дабыл|атыс)/.test(t) && t.split(' ').length >= 2 && !OPEN.test(t)) return { id: 'q_threat' };
    /* questions about the log */
    if (/(сколько|how many|what|какие|какой|кого|что|who|which|қанша|қандай|не естілді)/.test(t) || /слышали|слышно|услышали|heard|hear/.test(t)) {
      if (/(тревог|нарушен|выстрел|браконьер|alert|threat|gunshot|gun shot|poach|violation|дабыл|атыс)/.test(t)) return { id: 'q_threat' };
      if (/(жд[уе]т проверк|на проверк|непроверен|очеред|to review|waiting|pending|queue|unchecked|күтіп|кезек)/.test(t)) return { id: 'q_pending' };
      if (/(чаще всего|самы[йе] частый|самая частая|most common|most frequent|most often|top species|ең жиі|жиі)/.test(t)) return { id: 'q_top' };
      if (/(последн|latest|last|соңғы)/.test(t) && /(находк|запис|событи|вид|птиц|detection|record|event|bird|species|one|табылған|жазба|оқиға|түр)/.test(t)) return { id: 'q_last' };
      if (/(сегодня|за день|за сутки|today|this morning|сегодн|бүгін)/.test(t) && /(вид|птиц|услыш|слыш|находк|событи|species|bird|heard|hear|detect|events|count|түр|құс|естіл|оқиға)/.test(t)) return { id: 'q_today' };
    }
    if (/^(последняя находка|last detection|latest detection|соңғы табылған)$/.test(t)) return { id: 'q_last' };
    /* a screen: "открой журнал", or just "журнал" */
    var wantOpen = OPEN.test(t) || t.split(' ').length <= 2;
    if (wantOpen) for (var i = 0; i < VIEWS.length; i++) if (VIEWS[i][0].test(t)) return { id: 'go', view: VIEWS[i][1], name: VIEWS[i][2] };
    return { id: 'unknown' };
  }

  /* ---- what the assistant knows ---- */
  function today(d) { return S.dayKey(d.ts) === S.dayKey(Date.now()); }
  function dets(f) { return S.get().dets.filter(function (d) { return d.status !== 'rejected' && !d.demo && (!f || f(d)); }); }
  function spOf(d) { return d.species ? S.nameOf(d.species) : d.suggest ? S.sugName(d.suggest) : ''; }
  function listNames(arr, max) { var a = arr.slice(0, max); return a.join(', ') + (arr.length > max ? L(' и ещё ' + (arr.length - max), ' and ' + (arr.length - max) + ' more', ' және тағы ' + (arr.length - max)) : ''); }
  function nWord(n, ru, en) { return window.WEi18n ? WEi18n.pl(n, ru, en) : ru[2]; }

  function answer(cmd) {
    var v = A.current ? A.current() : '', ev = A.reviewCurrent ? A.reviewCurrent() : null;
    switch (cmd.id) {
      case 'q_today': {
        var d = dets(today), by = {}; d.forEach(function (x) { var n = spOf(x); if (n) by[n] = (by[n] || 0) + 1; });
        var names = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
        if (!d.length) return L('Сегодня пока ничего не записано.', 'Nothing recorded today yet.');
        return L('Сегодня ' + names.length + ' ' + nWord(names.length, ['вид', 'вида', 'видов'], ['species', 'species']) + ', ' + d.length + ' ' + nWord(d.length, ['событие', 'события', 'событий'], ['event', 'events']) + '. Чаще всего: ' + listNames(names, 3) + '.',
          names.length + ' species today, ' + d.length + ' events. Most often: ' + listNames(names, 3) + '.',
          'Бүгін ' + names.length + ' түр, ' + d.length + ' оқиға. Ең жиі: ' + listNames(names, 3) + '.');
      }
      case 'q_last': {
        var all = dets().sort(function (a, b) { return a.ts < b.ts ? 1 : -1; })[0];
        if (!all) return L('Находок ещё нет.', 'No detections yet.');
        return L('Последняя находка: ' + (spOf(all) || 'неопределённый звук') + ', ' + A.fmtDT(all.ts) + (all.station ? ', станция ' + all.station : '') + '.',
          'Latest: ' + (spOf(all) || 'an unidentified sound') + ', ' + A.fmtDT(all.ts) + (all.station ? ', station ' + all.station : '') + '.',
          'Соңғы табылған: ' + (spOf(all) || 'анықталмаған дыбыс') + ', ' + A.fmtDT(all.ts) + (all.station ? ', станция ' + all.station : '') + '.');
      }
      case 'q_pending': {
        var n = S.get().dets.filter(function (x) { return x.status === 'auto' && x.clip; }).length;
        return n ? L('Ждут проверки: ' + n + '. Скажите «проверка», и я зачитаю по одному.', n + ' waiting for review. Say "review" and I will read them one by one.', n + ' оқиға тексеруді күтіп тұр. «Тексеру» десеңіз, біртіндеп оқимын.') : L('Очередь проверки пуста.', 'The review queue is empty.');
      }
      case 'q_threat': {
        var from = Date.now() - 864e5, th = dets(function (x) { return +new Date(x.ts) >= from && S.threatOf && S.threatOf(x); });
        var open = th.filter(function (x) { return x.threatReview !== 'false'; });
        if (!open.length) return L('За последние сутки тревог нет.', 'No alerts in the last 24 hours.');
        var g = open.filter(function (x) { return S.threatOf(x).kind === 'gun'; }).length, last = open.sort(function (a, b) { return a.ts < b.ts ? 1 : -1; })[0];
        return L('За сутки тревог: ' + open.length + (g ? ', из них возможных выстрелов ' + g : '') + '. Последняя ' + A.fmtDT(last.ts) + (last.station ? ', ' + last.station : '') + '. Скажите «охрана», чтобы открыть.',
          open.length + ' alerts in 24 hours' + (g ? ', ' + g + ' possible gunshots' : '') + '. The latest at ' + A.fmtDT(last.ts) + (last.station ? ', ' + last.station : '') + '. Say "protection" to open.',
          'Тәулікте ' + open.length + ' дабыл' + (g ? ', оның ' + g + ' ықтимал атыс' : '') + '. Соңғысы ' + A.fmtDT(last.ts) + (last.station ? ', ' + last.station : '') + '. Ашу үшін «күзет» деңіз.');
      }
      case 'q_top': {
        var by2 = {}; dets(function (x) { return +new Date(x.ts) >= Date.now() - 7 * 864e5; }).forEach(function (x) { var s = spOf(x); if (s) by2[s] = (by2[s] || 0) + 1; });
        var top = Object.keys(by2).sort(function (a, b) { return by2[b] - by2[a]; });
        return top.length ? L('За неделю чаще всего: ' + top.slice(0, 3).map(function (s) { return s + ' ' + by2[s]; }).join(', ') + '.', 'This week, most often: ' + top.slice(0, 3).map(function (s) { return s + ' ' + by2[s]; }).join(', ') + '.', 'Апта бойы ең жиі: ' + top.slice(0, 3).map(function (s) { return s + ' ' + by2[s]; }).join(', ') + '.') : L('За неделю данных нет.', 'No data for the week.');
      }
      case 'help':
        return L('Можно сказать: «открой журнал», «охрана», «проверка». Вопросы: «сколько видов сегодня», «последняя находка», «есть тревоги», «сколько ждут проверки». В проверке: «слушать», «верно», «ошибка», «пропустить». «Стоп» выключает помощника.',
          'You can say: "open the log", "protection", "review". Questions: "how many species today", "latest detection", "any alerts", "how many to review". In review: "play", "confirm", "wrong", "skip". "Stop" turns me off.');
    }
    return '';
  }
  function describe(d) {
    var s = d.suggest, name = s ? S.sugName(s) : '', pct = s ? Math.round((s.conf || 0) * 100) : 0;
    return name ? L('Модель думает: ' + name + ', ' + pct + ' ' + nWord(pct, ['процент', 'процента', 'процентов'], ['percent', 'percent']) + '. Верно, ошибка или пропустить?', 'The model thinks: ' + name + ', ' + pct + ' percent. Confirm, wrong or skip?', 'Модель ойынша: ' + name + ', ' + pct + ' пайыз. Дұрыс, қате немесе өткіз?') : L('Вид не определён. Послушайте и скажите, или пропустите.', 'Species unknown. Listen, or skip.');
  }

  /* ---- speech out ---- */
  var talking = false, lastSaid = '';
  function say(text, quiet) {
    lastSaid = text; show(text, 'bot');
    if (quiet || store('we.voice.mute') === '1') return;
    var pid = piperChoice();
    if (pid) {   /* downloaded neural voice (js/piper.js); on any trouble fall back to the system voice */
      talking = true; var free = function () { setTimeout(function () { talking = false; }, 500); };
      WEPiper.speak(pid, text).then(free, function (e) { free(); store('we.voice.piper.' + lang(), ''); show(L('Живой голос не заработал, включён обычный. ', 'The neural voice failed, using the normal one. ', 'Жанды дауыс қосылмады, қарапайым дауыс қосылды. ') + (e && e.message || ''), 'bot'); fillPiper(); speakSystem(text); });
      return;
    }
    speakSystem(text);
  }
  function piperChoice() {
    var id = window.WEPiper && WEPiper.supported() ? store('we.voice.piper.' + lang()) : '';
    var v = id && WEPiper.byId(id); return v && v.lang === lang() ? id : '';
  }
  function speakSystem(text) {
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text), v = chosenVoice(); u.lang = v ? v.lang : locale(); if (v) u.voice = v; u.rate = .97; u.pitch = 1;
      u.onstart = function () { talking = true; }; u.onend = u.onerror = function () { setTimeout(function () { talking = false; }, 500); };
      speechSynthesis.speak(u);
    } catch (e) { talking = false; }
  }
  function locale() { var l = lang(); return l === 'en' ? 'en-US' : l === 'kk' ? 'kk-KZ' : 'ru-RU'; }
  /* The default system voices can sound harsh. We rank what the browser offers: neural "Natural" voices (Edge), Google and Apple voices first, old offline robot voices last.
     The person can still pick another one and listen to it. Kazakh falls back to a Russian voice when the device has no Kazakh one. */
  function voiceScore(v) {
    var n = v.name, s = 0;
    if (/natural|neural/i.test(n)) s += 60;
    if (!v.localService) s += 25;
    if (/google/i.test(n)) s += 20;
    if (/premium|enhanced|siri|milena|yuri|alena|katya|svetlana|dmitry|dariya|aigul|daulet|aria|jenny|sonia|samantha|ava|libby/i.test(n)) s += 25;
    if (/compact|espeak/i.test(n)) s -= 30;
    return s;
  }
  function voiceList() {
    var all = (window.speechSynthesis && speechSynthesis.getVoices()) || [], p = locale().slice(0, 2);
    var own = all.filter(function (v) { return v.lang.toLowerCase().replace('_', '-').slice(0, 2) === p; });
    if (!own.length && p === 'kk') own = all.filter(function (v) { return v.lang.toLowerCase().slice(0, 2) === 'ru'; });
    return own.sort(function (a, b) { return voiceScore(b) - voiceScore(a); });
  }
  function chosenVoice() {
    var list = voiceList(), want = store('we.voice.name.' + lang());
    for (var i = 0; i < list.length; i++) if (list[i].name === want) return list[i];
    return list[0] || null;
  }
  /* neural voices: pick one, it downloads once (28 to 128 MB) and then works offline */
  function fillPiper() {
    var sel = $('#vaPk'), box = $('#vaPkBox'); if (!sel || !box) return;
    if (!window.WEPiper || !WEPiper.supported()) { box.hidden = true; return; }
    var list = WEPiper.forLang(lang()), cur = store('we.voice.piper.' + lang()) || '';
    box.hidden = !list.length; if (!list.length) return;
    Promise.all(list.map(function (v) { return WEPiper.has(v.id); })).then(function (have) {
      var any = have.some(Boolean), del = $('#vaPkDel'); if (del) del.hidden = !any;
      var k = lang() === 'en' ? 1 : lang() === 'kk' ? 2 : 0;
      sel.innerHTML = '<option value="">' + esc(L('Системный голос', 'System voice', 'Жүйелік дауыс')) + '</option>' + list.map(function (v, i) {
        return '<option value="' + v.id + '"' + (v.id === cur ? ' selected' : '') + '>' + esc(L('Живой: ', 'Neural: ', 'Жанды: ') + v.name[k] + (have[i] ? ' ✓' : ' (' + v.mb + ' ' + L('МБ', 'MB', 'МБ') + ')')) + '</option>';
      }).join('');
    });
  }
  function pickPiper(id) {
    var sel = $('#vaPk'), bar = $('#vaPkBar'), msg = $('#vaPkMsg'), l = lang();
    if (!id) { store('we.voice.piper.' + l, ''); fillPiper(); say(L('Включён системный голос.', 'The system voice is on.', 'Жүйелік дауыс қосылды.')); return; }
    WEPiper.has(id).then(function (have) {
      var done = function () { store('we.voice.piper.' + l, id); fillPiper(); say(L('Здравствуйте! Я помощник рейнджера. Так звучит живой голос.', 'Hello! I am the ranger assistant. This is the neural voice.', 'Сәлеметсіз бе! Мен рейнджер көмекшісімін. Жанды дауыс осылай естіледі.')); };
      if (have) return done();
      var v = WEPiper.byId(id), mb = v.mb + WEPiper.engineMB;
      sel.disabled = true; bar.hidden = false; bar.value = 0;
      msg.textContent = L('Скачиваю голос, ' + mb + ' МБ, один раз. Дальше он работает без интернета.', 'Downloading the voice, ' + mb + ' MB, once. After that it works offline.', 'Дауыс жүктелуде, ' + mb + ' МБ, бір рет. Кейін интернетсіз жұмыс істейді.');
      WEPiper.download(id, function (p) { bar.value = p; }).then(function () { msg.textContent = ''; bar.hidden = true; sel.disabled = false; done(); },
        function (e) { msg.textContent = L('Не удалось скачать голос: ', 'Could not download the voice: ', 'Дауысты жүктеу мүмкін болмады: ') + (e && e.message || ''); bar.hidden = true; sel.disabled = false; fillPiper(); });
    });
  }
  function fillVoices() {
    var sel = $('#vaVoiceSel'); if (!sel) return;
    var list = voiceList(), cur = chosenVoice();
    sel.innerHTML = list.map(function (v) { return '<option value="' + esc(v.name) + '"' + (cur && cur.name === v.name ? ' selected' : '') + '>' + esc(v.name.replace(/^Microsoft /, '').replace(/ - .*$/, '')) + (/natural|neural/i.test(v.name) ? ' ★' : '') + '</option>'; }).join('');
    sel.disabled = !list.length;
  }

  /* ---- do it ---- */
  function click(sel) { var b = $(sel); if (b && !b.disabled) { b.click(); return true; } return false; }
  function announce() { var ev = A.reviewCurrent(); if (ev) say(describe(ev)); else say(L('Очередь проверки закончилась.', 'The review queue is finished.')); }
  function run(text) {
    var ctx = { view: A.current(), hasEvent: !!(A.reviewCurrent && A.reviewCurrent()) && !!$('#revCard') && !$('#revCard').hidden };
    var cmd = parse(text, ctx);
    if (!cmd) return null;
    show(text, 'me');
    switch (cmd.id) {
      case 'stop': say(L('Выключаю помощника.', 'Turning the assistant off.')); off(); break;
      case 'repeat': say(lastSaid || L('Пока нечего повторять.', 'Nothing to repeat yet.')); break;
      case 'go':
        A.show(cmd.view);
        if (cmd.view === 'review') setTimeout(function () { var ev = A.reviewCurrent(); say(ev ? L('Проверка. Всего в очереди ' + S.get().dets.filter(function (x) { return x.status === 'auto' && x.clip; }).length + '. ', 'Review. ', 'Тексеру. Кезекте ' + S.get().dets.filter(function (x) { return x.status === 'auto' && x.clip; }).length + '. ') + describe(ev) : L('Очередь проверки пуста.', 'The review queue is empty.')); }, 250);
        else say(L('Открываю: ' + cmd.name[0], 'Opening: ' + cmd.name[1], 'Ашамын: ' + cmd.name[2]));
        break;
      case 'play': click('#revPlay') ? say(L('Играю.', 'Playing.'), true) : say(L('Нет записи.', 'No clip.')); break;
      case 'yes': case 'no': case 'skip': {
        var ev = A.reviewCurrent(), nm = ev && ev.suggest ? S.sugName(ev.suggest) : '';
        if (!click(cmd.id === 'yes' ? '#revYes' : cmd.id === 'no' ? '#revNo' : '#revSkip')) { say(L('Сейчас нечего проверять.', 'Nothing to review now.')); break; }
        var done = cmd.id === 'yes' ? L('Подтверждено' + (nm ? ': ' + nm : '') + '.', 'Confirmed' + (nm ? ': ' + nm : '') + '.', 'Расталды' + (nm ? ': ' + nm : '') + '.') : cmd.id === 'no' ? L('Отклонено.', 'Rejected.') : L('Пропущено.', 'Skipped.');
        setTimeout(function () { var nx = A.reviewCurrent(); say(done + ' ' + (nx && !$('#revCard').hidden ? describe(nx) : L('Очередь закончилась.', 'The queue is finished.'))); }, 350);
        break;
      }
      case 'unknown': say(L('Не поняла команду. Скажите «помощь», чтобы услышать список.', 'I did not get that. Say "help" for the list.')); break;
      default: say(answer(cmd));
    }
    return cmd;
  }

  /* ---- panel ---- */
  var panel, logEl, rec = null, on = false, restartT = 0, errCount = 0, SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  function show(text, who) {
    if (!logEl) return;
    var p = document.createElement('div'); p.className = 'va-' + who; p.textContent = text; logEl.appendChild(p);
    while (logEl.children.length > 6) logEl.removeChild(logEl.firstChild);
    logEl.scrollTop = logEl.scrollHeight;
  }
  function setBtn() { var b = $('#vaBtn'); if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); } var st = $('#vaState'); if (st) st.textContent = on ? L('Слушаю…', 'Listening…') : L('Выключено', 'Off'); }
  function start() {
    if (!SR) { show(L('В этом браузере нет распознавания речи. Введите команду текстом.', 'This browser has no speech input. Type the command instead.'), 'bot'); return; }
    if (store('we.voice.ok') !== '1') { var ok = $('#vaConsent'); if (ok) ok.hidden = false; return; }
    on = true; errCount = 0; setBtn(); listen();
    say(L('Слушаю. Скажите «помощь», чтобы узнать команды.', 'Listening. Say "help" for the commands.'));
  }
  function listen() {
    if (!on) return;
    try { if (rec) rec.abort(); } catch (e) { }
    rec = new SR(); rec.lang = locale(); rec.continuous = true; rec.interimResults = false; rec.maxAlternatives = 1;
    rec.onresult = function (e) {
      for (var i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal && !talking) { errCount = 0; var t = e.results[i][0].transcript; var inp = $('#vaIn'); if (inp) inp.value = ''; run(t); }
    };
    rec.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { on = false; setBtn(); show(L('Нет доступа к микрофону. Разрешите его в настройках браузера.', 'No microphone access. Allow it in the browser settings.'), 'bot'); }
      else if (e.error !== 'no-speech' && e.error !== 'aborted') errCount++;
    };
    rec.onend = function () { if (on) { if (errCount > 6) { on = false; setBtn(); show(L('Распознавание речи не отвечает. Включите снова или введите команду.', 'Speech input is not responding. Turn it on again or type.'), 'bot'); return; } clearTimeout(restartT); restartT = setTimeout(listen, 300); } };
    try { rec.start(); } catch (e) { errCount++; }
  }
  function off() { on = false; clearTimeout(restartT); try { if (rec) rec.abort(); } catch (e) { } try { speechSynthesis && speechSynthesis.cancel(); } catch (e) { } if (window.WEPiper) WEPiper.stop(); setBtn(); }
  function build() {
    var btn = document.createElement('button'); btn.id = 'vaBtn'; btn.className = 'va-btn'; btn.type = 'button'; btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', L('Голосовой помощник', 'Voice assistant')); btn.title = L('Голосовой помощник', 'Voice assistant');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
    panel = document.createElement('div'); panel.className = 'va-panel'; panel.id = 'vaPanel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', L('Голосовой помощник', 'Voice assistant'));
    panel.innerHTML = '<div class="va-head"><b>' + esc(L('Голосовой помощник', 'Voice assistant')) + '</b><span id="vaState" class="hint"></span><button type="button" class="va-x" id="vaClose" aria-label="' + esc(L('Закрыть', 'Close')) + '">×</button></div>' +
      '<div id="vaConsent" class="va-consent" hidden><p>' + esc(L('Распознавание речи делает сам браузер. В Chrome звук голоса отправляется на сервис Google, в Safari и других браузерах на сервис их производителя. Мы звук не сохраняем. Включайте, если это допустимо у вас.', 'Speech recognition is done by the browser. In Chrome the sound of your voice goes to a Google service, in Safari and others to their vendor. We do not store the sound. Turn it on only if that is acceptable for you.')) + '</p><button type="button" class="btn primary" id="vaOk">' + esc(L('Разрешаю, включить', 'Allow and start')) + '</button></div>' +
      '<div id="vaLog" class="va-log" aria-live="polite"></div>' +
      '<form id="vaForm" class="va-form"><input id="vaIn" type="text" autocomplete="off" placeholder="' + esc(L('или введите команду', 'or type a command')) + '" aria-label="' + esc(L('Команда', 'Command')) + '"><button class="btn" type="submit">' + esc(L('Выполнить', 'Run')) + '</button></form>' +
      '<label class="va-mute"><input type="checkbox" id="vaVoice"> ' + esc(L('Озвучивать ответы', 'Speak the answers')) + '</label>' +
      '<div id="vaPkBox" class="va-pk"><b class="va-pkh">' + esc(L('Живой голос (нейросеть, работает без интернета)', 'Neural voice (works offline)', 'Жанды дауыс (нейрожелі, интернетсіз)')) + '</b><div class="va-pick"><select id="vaPk" aria-label="' + esc(L('Живой голос', 'Neural voice', 'Жанды дауыс')) + '"></select><button type="button" class="btn" id="vaPkDel" hidden>' + esc(L('Удалить', 'Remove', 'Жою')) + '</button></div><progress id="vaPkBar" max="1" value="0" hidden></progress><p class="hint va-tip" id="vaPkMsg" role="status"></p></div>' +
      '<div class="va-pick"><select id="vaVoiceSel" aria-label="' + esc(L('Голос', 'Voice', 'Дауыс')) + '"></select><button type="button" class="btn" id="vaTest">' + esc(L('Проверить голос', 'Test voice', 'Дауысты тексеру')) + '</button></div>' +
      '<p class="hint va-tip">' + esc(L('Голоса со звёздочкой ★ звучат живее. В Microsoft Edge их больше всего: откройте приложение в Edge.', 'Voices with a star ★ sound more natural. Microsoft Edge has the most: open the app in Edge.', '★ белгісі бар дауыстар табиғирақ естіледі. Microsoft Edge-те олар көбірек: қосымшаны Edge-те ашыңыз.')) + '</p>';
    document.body.appendChild(btn); document.body.appendChild(panel);
    logEl = $('#vaLog');
    fillVoices(); fillPiper();
    if (window.speechSynthesis) speechSynthesis.addEventListener('voiceschanged', fillVoices);
    if (window.WEi18n && WEi18n.onChange) WEi18n.onChange(function () { fillVoices(); fillPiper(); });
    $('#vaPk').addEventListener('change', function () { pickPiper(this.value); });
    $('#vaPkDel').addEventListener('click', function () {
      WEPiper.remove().then(function () { for (var l in { ru: 1, en: 1, kk: 1 }) store('we.voice.piper.' + l, ''); fillPiper(); show(L('Загруженные голоса удалены.', 'Downloaded voices removed.', 'Жүктелген дауыстар жойылды.'), 'bot'); });
    });
    $('#vaVoiceSel').addEventListener('change', function () { store('we.voice.name.' + lang(), this.value); say(L('Так звучит этот голос.', 'This is how this voice sounds.', 'Бұл дауыс осылай естіледі.')); });
    $('#vaTest').addEventListener('click', function () { say(L('Здравствуйте! Я помощник рейнджера. Сегодня на озере тихо, слышен серый журавль.', 'Hello! I am the ranger assistant. It is quiet on the lake today, a common crane is calling.', 'Сәлеметсіз бе! Мен рейнджер көмекшісімін. Бүгін көл тыныш, сұр тырна дауыстап тұр.')); });
    $('#vaVoice').checked = store('we.voice.mute') !== '1';
    $('#vaVoice').addEventListener('change', function () { store('we.voice.mute', this.checked ? '0' : '1'); if (!this.checked) { try { speechSynthesis.cancel(); } catch (e) { } if (window.WEPiper) WEPiper.stop(); } });
    btn.addEventListener('click', function () {
      if (panel.hidden) { panel.hidden = false; setBtn(); if (!on) { if (SR) start(); else show(L('Голосовой ввод в этом браузере не работает. Команды можно печатать.', 'Voice input does not work in this browser. You can type commands.'), 'bot'); } }
      else { panel.hidden = true; off(); }
    });
    $('#vaClose').addEventListener('click', function () { panel.hidden = true; off(); });
    $('#vaOk').addEventListener('click', function () { store('we.voice.ok', '1'); $('#vaConsent').hidden = true; start(); });
    $('#vaForm').addEventListener('submit', function (e) { e.preventDefault(); var i = $('#vaIn'), t = i.value; i.value = ''; if (t.trim()) run(t); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && !panel.hidden) { panel.hidden = true; off(); } });
    setBtn();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
  window.WEAssistant = { parse: parse, run: run, answer: answer, supported: !!SR };
})();
