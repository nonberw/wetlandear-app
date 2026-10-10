/* WetlandEar App: Russian, English and Kazakh.
   Source language is Russian. English comes from a dictionary keyed by the Russian text.
   Static text is translated in the DOM; text built in JS goes through t() / pl(). Anything missing stays in Russian. */
(function () {
  'use strict';
  var DICT = { en: {}, kk: {} }, lang = pick(), CYR = /[А-Яа-яЁё]/, mapAttr = ['placeholder', 'aria-label', 'title', 'alt', 'content'], listeners = [], obs = null, busy = false;

  function pick() {
    try { var s = localStorage.getItem('we.lang'); if (s === 'ru' || s === 'en' || s === 'kk') return s; } catch (e) { }
    var n = String(navigator.language || 'ru').toLowerCase();
    return n.indexOf('ru') === 0 ? 'ru' : n.indexOf('kk') === 0 ? 'kk' : 'en';
  }
  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }
  function fill(s, v) { return v ? s.replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined ? v[k] : m; }) : s; }
  function t(s, v) { var d = DICT[lang]; var r = (d && d[s] !== undefined) ? d[s] : s; return fill(r, v); }
  /* text built in code: L(russian, english). English may be given inline; Kazakh always comes from the dictionary. */
  function L(ru, en) { return lang === 'ru' ? ru : lang === 'en' ? (en !== undefined ? en : t(ru)) : t(ru); }
  /* plural: ru = [one, few, many], en = [one, other] */
  function pl(n, ru, en) {
    if (lang === 'en') return n === 1 ? en[0] : en[1];
    if (lang === 'kk') return t(ru[0]);   /* Kazakh does not change the noun after a number */
    var m = n % 10, h = n % 100; return (m === 1 && h !== 11) ? ru[0] : (m >= 2 && m <= 4 && (h < 10 || h >= 20)) ? ru[1] : ru[2];
  }
  function addDict(l, o) { for (var k in o) DICT[l][k] = o[k]; }
  function addEN(o) { addDict('en', o); }

  /* ----- DOM ----- */
  function skip(el) { var n = el && el.nodeName; return !el || n === 'SCRIPT' || n === 'STYLE' || n === 'TEXTAREA' || n === 'NOSCRIPT' || (el.closest && el.closest('[data-noi18n]')); }
  /* __ru is the Russian original of a node, __tr the text we wrote there. If the page changes the node later, __tr no longer matches and the new text is the new original.
     We never write a node when the text would not change: an identical write still fires the observer and would loop forever. */
  function textNode(n) {
    if (skip(n.parentNode)) return;
    var v = n.nodeValue, ours = n.__ru !== undefined && v === n.__tr, base = ours ? n.__ru : v;
    if (lang === 'ru') {
      if (ours) n.nodeValue = n.__ru;
      delete n.__ru; delete n.__tr; return;
    }
    if (!CYR.test(base)) return;
    var tr = DICT[lang][norm(base)];
    if (tr === undefined) {
      if (ours) { n.nodeValue = n.__ru; delete n.__ru; delete n.__tr; }
      return;
    }
    var out = base.match(/^\s*/)[0] + tr + base.match(/\s*$/)[0];
    n.__ru = base; n.__tr = out;
    if (out !== v) n.nodeValue = out;
  }
  function attrs(el) {
    if (skip(el) || !el.getAttribute) return;
    for (var i = 0; i < mapAttr.length; i++) {
      var a = mapAttr[i]; if (!el.hasAttribute(a)) continue;
      if (a === 'content' && el.nodeName !== 'META') continue;
      var sr = '__ru_' + a, st = '__tr_' + a, v = el.getAttribute(a), ours = el[sr] !== undefined && v === el[st], base = ours ? el[sr] : v;
      if (lang === 'ru') {
        if (ours) el.setAttribute(a, el[sr]);
        delete el[sr]; delete el[st]; continue;
      }
      var tr = CYR.test(base) ? DICT[lang][norm(base)] : undefined;
      if (tr === undefined) { if (ours) { el.setAttribute(a, el[sr]); delete el[sr]; delete el[st]; } continue; }
      el[sr] = base; el[st] = tr;
      if (tr !== v) el.setAttribute(a, tr);
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
    if (l !== 'ru' && l !== 'en' && l !== 'kk') return;
    lang = l; try { localStorage.setItem('we.lang', l); } catch (e) { }
    apply(); listeners.forEach(function (f) { try { f(l); } catch (e) { } });
  }
  function onChange(f) { listeners.push(f); }
  function init() { apply(); watch(); }

  window.WEi18n = { t: t, L: L, pl: pl, addEN: addEN, addDict: addDict, set: set, onChange: onChange, init: init, get lang() { return lang; }, dict: function () { return DICT[lang]; } };
})();
