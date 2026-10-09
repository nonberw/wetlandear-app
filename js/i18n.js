/* WetlandEar App: Russian and English.
   Source language is Russian. English comes from a dictionary keyed by the Russian text.
   Static text is translated in the DOM; text built in JS goes through t() / pl(). Anything missing stays in Russian. */
(function () {
  'use strict';
  var EN = {}, lang = pick(), CYR = /[А-Яа-яЁё]/, mapAttr = ['placeholder', 'aria-label', 'title', 'alt', 'content'], listeners = [], obs = null, busy = false;

  function pick() {
    try { var s = localStorage.getItem('we.lang'); if (s === 'ru' || s === 'en') return s; } catch (e) { }
    return String(navigator.language || 'ru').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
  }
  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function fill(s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; }) : s; }
  function t(s, v) { var r = (lang === 'en' && EN[s] !== undefined) ? EN[s] : s; return fill(r, v); }
  /* plural: ru = [one, few, many], en = [one, other] */
  function pl(n, ru, en) {
    if (lang === 'en') return n === 1 ? en[0] : en[1];
    var m = n % 10, h = n % 100; return (m === 1 && h !== 11) ? ru[0] : (m >= 2 && m <= 4 && (h < 10 || h >= 20)) ? ru[1] : ru[2];
  }
  function addEN(o) { for (var k in o) EN[k] = o[k]; }

  /* ----- DOM ----- */
  function skip(el) { var n = el && el.nodeName; return !el || n === 'SCRIPT' || n === 'STYLE' || n === 'TEXTAREA' || n === 'NOSCRIPT' || (el.closest && el.closest('[data-noi18n]')); }
  function textNode(n) {
    if (skip(n.parentNode)) return;
    var v = n.nodeValue;
    if (lang === 'en') {
      if (!CYR.test(v)) return;
      var key = norm(v), tr = EN[key];
      if (tr === undefined) return;
      var lead = v.match(/^\s*/)[0], trail = v.match(/\s*$/)[0];
      n.__ru = v; n.nodeValue = lead + tr + trail;
    } else if (n.__ru !== undefined) { n.nodeValue = n.__ru; delete n.__ru; }
  }
  function attrs(el) {
    if (skip(el) || !el.getAttribute) return;
    for (var i = 0; i < mapAttr.length; i++) {
      var a = mapAttr[i]; if (!el.hasAttribute(a)) continue;
      if (a === 'content' && el.nodeName !== 'META') continue;
      var store = '__ru_' + a, v = el.getAttribute(a);
      if (lang === 'en') {
        if (CYR.test(v) && EN[norm(v)] !== undefined) { el[store] = v; el.setAttribute(a, EN[norm(v)]); }
      } else if (el[store] !== undefined) { el.setAttribute(a, el[store]); delete el[store]; }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1) return;
    attrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) { if (n.nodeType === 3) textNode(n); else attrs(n); }
  }
  function titleAndMeta() {
    walk(document.head);
    var ti = document.querySelector('title'); if (ti && ti.firstChild) textNode(ti.firstChild);
  }
  function watch() {
    if (obs) return;
    obs = new MutationObserver(function (list) {
      if (busy) return; busy = true;
      try { list.forEach(function (m) { if (m.type === 'characterData') textNode(m.target); else m.addedNodes.forEach(function (a) { walk(a); }); }); } finally { busy = false; }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function apply() { busy = true; try { walk(document.body); titleAndMeta(); } finally { busy = false; } document.documentElement.lang = lang; }

  function set(l) {
    if (l !== 'ru' && l !== 'en') return;
    lang = l; try { localStorage.setItem('we.lang', l); } catch (e) { }
    apply(); listeners.forEach(function (f) { try { f(l); } catch (e) { } });
  }
  function onChange(f) { listeners.push(f); }
  function init() { apply(); watch(); }

  window.WEi18n = { t: t, pl: pl, addEN: addEN, set: set, onChange: onChange, init: init, get lang() { return lang; }, dict: function () { return EN; } };
})();
