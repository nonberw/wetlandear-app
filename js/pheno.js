/* WetlandEar App: season hint. models/phenology.json counts, for each species, Xeno-canto recordings by month inside a box over Kazakhstan.
   A species that is almost never recorded in the current month and its neighbours gets a note "unusual for this season". It is a hint for the person
   who checks the event, never a rule: recordists are not spread evenly over the year and rare species have few recordings. */
(function () {
  'use strict';
  var S = window.WEStore, data = null, loading = false;
  function L(ru, en) { return window.WEi18n ? WEi18n.L(ru, en) : ru; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function load() {
    if (data || loading) return; loading = true;
    fetch('models/phenology.json').then(function (r) { return r.json(); }).then(function (j) { data = j; }).catch(function () { data = {}; }).then(function () { loading = false; });
  }
  function sciOf(s) {
    if (s.sci) return s.sci;
    var id = s.id || (S.sugId ? S.sugId(s) : ''), sp = S.species && S.species[id]; if (sp) return sp.lat;
    var en = String(id).replace(/^x:/, ''); return (window.WE_SCI && window.WE_SCI[en]) || '';
  }
  /* returns {unusual, months:[...] typical months} or null when there is not enough data to say anything */
  function check(sug, when) {
    if (!data) { load(); return null; }
    var rec = data[sciOf(sug)], eff = data._effort; if (!rec || rec.n < 20 || !eff) return null;
    var m = (when ? new Date(when) : new Date()).getMonth(), c = rec.m, tot = eff.reduce(function (x, y) { return x + y; }, 0) || 1;
    var near = c[m] + c[(m + 11) % 12] + c[(m + 1) % 12], expected = rec.n * (eff[m] + eff[(m + 11) % 12] + eff[(m + 1) % 12]) / tot;
    /* recordists are busy in spring and nearly absent in winter, so only count what would be expected given the effort in these months */
    if (expected < 4 || near > 0.1 * expected) return { unusual: false };
    var typical = []; c.forEach(function (v, i) { if (v / rec.n >= 0.06) typical.push(i); });
    return { unusual: true, months: typical };
  }
  var MON = { ru: ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'], en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] };
  function range(ms) { if (!ms.length) return ''; var l = (window.WEi18n && WEi18n.lang === 'en') ? MON.en : MON.ru; return l[ms[0]] + (ms.length > 1 ? '–' + l[ms[ms.length - 1]] : ''); }
  /* species this station has never had confirmed (only meaningful once the journal has some history) */
  function newHere(sug) {
    var id = sug.id || (S.sugId ? S.sugId(sug) : null); if (!id) return false;
    var seen = {}, n = 0; S.get().dets.forEach(function (d) { if (d.status === 'confirmed' && d.species && !d.demo) { seen[d.species] = 1; n++; } });
    return n >= 30 && !seen[id];
  }
  /* small chips for a candidate row */
  function chip(sug, when) {
    var out = '', r = check(sug, when);
    if (r && r.unusual) { var tip = r.months.length ? L('Обычно записывают: ', 'Usually recorded: ') + range(r.months) : ''; out += '<em title="' + esc(tip) + '">' + esc(L('необычно для сезона', 'unusual for the season')) + '</em>'; }
    if (newHere(sug)) out += '<em class="nw" title="' + esc(L('Этот вид ещё ни разу не подтверждали на вашей станции', 'This species has never been confirmed at your station')) + '">' + esc(L('новый для станции', 'new for the station')) + '</em>';
    return out;
  }
  load();
  window.WEPheno = { check: check, chip: chip };
})();
