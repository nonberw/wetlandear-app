/* WetlandEar public page ("Listen to the wetland") and sponsor report. No sign-in, no cookies. Data comes from /api/public?t=TOKEN. */
(function () {
  'use strict';
  var q = new URLSearchParams(location.search), TOKEN = q.get('t') || '';
  var LANG = ['ru', 'en', 'kk'].indexOf(q.get('lang')) >= 0 ? q.get('lang') : ((navigator.language || 'ru').slice(0, 2) === 'en' ? 'en' : (navigator.language || '').slice(0, 2) === 'kk' ? 'kk' : 'ru');
  var T = {
    ru: { now: 'Сейчас поют', none24: 'За последние сутки подтверждённых находок нет.', voice: 'Голос недели', recent: 'Недавние находки', ev: 'событий за 7 дней', sp7: 'видов за неделю', sp30: 'видов за месяц', st: 'станций на связи',
      upd: 'Обновлено', print: 'Печать / PDF', months: 'События по месяцам за год', hours: 'Активность по часам суток (Астана)', top: 'Чаще всего слышали', year: 'за год', events: 'подтверждённых событий', species: 'видов',
      sp: 'Вид', n: 'Событий', first: 'Первая встреча', err: 'Страница не найдена или отключена.', empty: 'Пока нет подтверждённых находок.',
      foot: 'Виды определяет модель (BirdNET и модель WetlandEar) и подтверждает сотрудник. Точные места гнёзд редких видов и редкие виды не показываются.', made: 'Сделано в WetlandEar', method: 'Как проверяли точность' },
    en: { now: 'Singing right now', none24: 'No confirmed finds in the last 24 hours.', voice: 'Voice of the week', recent: 'Recent finds', ev: 'events in 7 days', sp7: 'species this week', sp30: 'species this month', st: 'stations online',
      upd: 'Updated', print: 'Print / PDF', months: 'Events per month over a year', hours: 'Activity by hour (Astana time)', top: 'Most often heard', year: 'over a year', events: 'confirmed events', species: 'species',
      sp: 'Species', n: 'Events', first: 'First record', err: 'Page not found or switched off.', empty: 'No confirmed finds yet.',
      foot: 'Species are suggested by a model (BirdNET and the WetlandEar model) and confirmed by a staff member. Exact nest places and rare species are not shown.', made: 'Made with WetlandEar', method: 'How accuracy was checked' },
    kk: { now: 'Қазір ән салып тұр', none24: 'Соңғы тәулікте расталған табылым жоқ.', voice: 'Апта дауысы', recent: 'Соңғы табылғандар', ev: '7 күндегі оқиға', sp7: 'аптадағы түр', sp30: 'айдағы түр', st: 'байланыстағы станция',
      upd: 'Жаңартылды', print: 'Басып шығару / PDF', months: 'Жыл бойы айлар бойынша оқиғалар', hours: 'Тәулік сағаттары бойынша белсенділік (Астана)', top: 'Жиі естілгендер', year: 'жыл бойы', events: 'расталған оқиға', species: 'түр',
      sp: 'Түр', n: 'Оқиға', first: 'Алғашқы кездесу', err: 'Бет табылмады немесе өшірілген.', empty: 'Әзірге расталған табылым жоқ.',
      foot: 'Түрлерді модель (BirdNET және WetlandEar моделі) ұсынады, қызметкер растайды. Сирек түрлер мен ұялардың нақты орындары көрсетілмейді.', made: 'WetlandEar жасаған', method: 'Дәлдік қалай тексерілді' }
  };
  function t(k) { return T[LANG][k]; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var data = null;
  function bars(vals, labels, h) {
    var mx = Math.max.apply(null, vals.concat([1])), w = 560, bw = w / vals.length;
    return '<svg viewBox="0 0 ' + w + ' ' + (h + 18) + '" width="100%" role="img">' + vals.map(function (v, i) {
      var bh = Math.round(v / mx * (h - 6)); return '<rect x="' + (i * bw + 1).toFixed(1) + '" y="' + (h - bh) + '" width="' + (bw - 2).toFixed(1) + '" height="' + Math.max(bh, v ? 2 : 0) + '" rx="2" fill="#1F5BFF"><title>' + esc(labels[i]) + ': ' + v + '</title></rect>'; }).join('') +
      [0, Math.floor(vals.length / 2), vals.length - 1].map(function (i) { return '<text x="' + ((i + .5) * bw).toFixed(1) + '" y="' + (h + 13) + '" text-anchor="middle" font-size="10" fill="#55657F">' + esc(labels[i]) + '</text>'; }).join('') + '</svg>';
  }
  function fmtTime(iso) { var d = new Date(iso); return d.toLocaleString(LANG === 'kk' ? 'kk-KZ' : LANG === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  function render() {
    var d = data, s = d.stats, h = '';
    document.documentElement.lang = LANG; document.title = d.title + ' · WetlandEar';
    document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.l === LANG)); });
    h += '<section class="pub-hero"><p class="eyebrow">' + (d.kind === 'report' ? 'WetlandEar · ' + esc(t('year')) : 'WetlandEar · live') + '</p><h1>' + esc(d.title) + '</h1></section>';
    h += '<section class="pub-stats"><div><b>' + s.events_7d + '</b><span>' + esc(t('ev')) + '</span></div><div><b>' + s.species_7d + '</b><span>' + esc(t('sp7')) + '</span></div><div><b>' + s.species_30d + '</b><span>' + esc(t('sp30')) + '</span></div><div><b>' + s.stations_alive + '</b><span>' + esc(t('st')) + '</span></div></section>';
    h += '<section class="card"><h2>' + esc(t('now')) + '</h2>' + (d.today.length ? '<div class="pub-chips">' + d.today.map(function (x) { return '<span>' + esc(x.name) + ' <b>' + x.n + '</b></span>'; }).join('') + '</div>' : '<p class="hint">' + esc(t('none24')) + '</p>') + '</section>';
    if (d.voice) h += '<section class="card"><h2>' + esc(t('voice')) + '</h2><p><b>' + esc(d.voice.name) + '</b> <span class="hint">' + esc(d.voice.ts) + '</span></p><audio controls preload="none" src="/api/public?t=' + encodeURIComponent(TOKEN) + '&clip=' + encodeURIComponent(d.voice.id) + '"></audio></section>';
    if (d.recent.length) h += '<section class="card"><h2>' + esc(t('recent')) + '</h2><ul class="pub-list">' + d.recent.map(function (r) { return '<li><span>' + esc(r.name) + '</span><time>' + esc(fmtTime(r.ts)) + '</time></li>'; }).join('') + '</ul></section>';
    else if (!d.today.length) h += '<p class="hint">' + esc(t('empty')) + '</p>';
    if (d.report) {
      var r = d.report;
      h += '<section class="card"><h2>' + esc(t('year')) + ': <b>' + r.events_year + '</b> ' + esc(t('events')) + ', <b>' + r.species_year + '</b> ' + esc(t('species')) + '</h2><h3>' + esc(t('months')) + '</h3>' + bars(r.months.map(function (m) { return m.n; }), r.months.map(function (m) { return m.m; }), 120) +
        '<h3>' + esc(t('hours')) + '</h3>' + bars(r.hours, r.hours.map(function (_, i) { return ('0' + i).slice(-2) + ':00'; }), 90) + '</section>';
      if (r.top.length) h += '<section class="card"><h2>' + esc(t('top')) + '</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>' + esc(t('sp')) + '</th><th>' + esc(t('n')) + '</th><th>' + esc(t('first')) + '</th></tr></thead><tbody>' + r.top.map(function (x) { return '<tr><td>' + esc(x.name) + (x.sci ? '<small>' + esc(x.sci) + '</small>' : '') + '</td><td>' + x.n + '</td><td>' + esc(x.first) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
      h += '<p class="no-print"><button class="btn" id="prn">' + esc(t('print')) + '</button> <a class="link" href="https://wetlandear.tech/metrics" rel="noopener">' + esc(t('method')) + '</a></p>';
    }
    document.getElementById('root').innerHTML = h;
    document.getElementById('foot').innerHTML = '<p>' + esc(t('foot')) + '</p><p>' + esc(t('upd')) + ': ' + esc(fmtTime(d.updated)) + ' · <a href="https://wetlandear.tech" rel="noopener">' + esc(t('made')) + '</a></p>';
    var p = document.getElementById('prn'); if (p) p.addEventListener('click', function () { window.print(); });
  }
  function load() {
    fetch('/api/public?t=' + encodeURIComponent(TOKEN) + '&lang=' + LANG).then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (j) { data = j; render(); })
      .catch(function () { document.getElementById('root').innerHTML = '<p class="hint">' + esc(t('err')) + '</p>'; });
  }
  document.querySelector('.lang').addEventListener('click', function (e) { var b = e.target.closest('button[data-l]'); if (!b) return; LANG = b.dataset.l; if (data) { load(); } });
  load();
})();
