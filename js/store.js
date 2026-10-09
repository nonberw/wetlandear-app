/* WetlandEar data layer. Everything stays on this device (localStorage + IndexedDB for audio clips). */
(function () {
  'use strict';
  var KEY = 'we.app.v1';

  /* Short reference list for the Korgalzhyn wetlands. It grows with each reserve; it is not a full checklist. */
  var SPECIES = [
    ['pho_ros', 'Фламинго розовый', 'Phoenicopterus roseus'],
    ['pel_cri', 'Кудрявый пеликан', 'Pelecanus crispus'],
    ['pel_ono', 'Розовый пеликан', 'Pelecanus onocrotalus'],
    ['ant_vir', 'Журавль-красавка', 'Anthropoides virgo'],
    ['gru_gru', 'Серый журавль', 'Grus grus'],
    ['cyg_cyg', 'Лебедь-кликун', 'Cygnus cygnus'],
    ['ans_ans', 'Серый гусь', 'Anser anser'],
    ['ans_ery', 'Пискулька', 'Anser erythropus'],
    ['tad_fer', 'Огарь', 'Tadorna ferruginea'],
    ['lar_ich', 'Черноголовый хохотун', 'Larus ichthyaetus'],
    ['chl_hyb', 'Белощёкая крачка', 'Chlidonias hybrida'],
    ['pod_cri', 'Большая поганка', 'Podiceps cristatus'],
    ['ful_atr', 'Лысуха', 'Fulica atra'],
    ['van_van', 'Чибис', 'Vanellus vanellus'],
    ['aro_aru', 'Дроздовидная камышевка', 'Acrocephalus arundinaceus'],
    ['lus_sve', 'Варакушка', 'Luscinia svecica'],
    ['ala_arv', 'Полевой жаворонок', 'Alauda arvensis'],
    ['mel_yel', 'Чёрный жаворонок', 'Melanocorypha yeltoniensis']
  ];
  var byId = {}, byLat = {}; SPECIES.forEach(function (s) { byId[s[0]] = { id: s[0], ru: s[1], lat: s[2] }; byLat[s[2]] = s[0]; });
  /* Model suggestions: known species map to the reference list, others keep the English common name. */
  function nameOf(id) { return byId[id] ? byId[id].ru : String(id).replace(/^x:/, ''); }
  function sugId(s) { return s.id || byLat[s.sci] || ('x:' + s.common); }
  function sugName(s) { if (s.id) return nameOf(s.id); var id = byLat[s.sci]; return id ? byId[id].ru : s.common; }

  var state = load();
  function blank() { return { recs: [], dets: [], station: { name: 'Телефон 1', lat: null, lon: null }, seq: 1 }; }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.dets) return s; } catch (e) { } return blank(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('Не хватает места в хранилище браузера. Выгрузите журнал и очистите старые данные.'); } }
  function uid(p) { return p + Date.now().toString(36) + (state.seq++).toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ---------- audio clips in IndexedDB ---------- */
  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      var r = indexedDB.open('we-clips', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('clips'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }
  function tx(mode, fn) { return idb().then(function (db) { return new Promise(function (res, rej) { var t = db.transaction('clips', mode), q = fn(t.objectStore('clips')); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; }); }); }
  function putClip(id, int16) { return tx('readwrite', function (s) { return s.put(int16.buffer, id); }).catch(function () { }); }
  function getClip(id) {
    return tx('readonly', function (s) { return s.get(id); }).then(function (b) { return b ? new Int16Array(b) : null; }).catch(function () { return null; }).then(function (c) {
      if (c || !window.WESync) return c;
      return window.WESync.downloadClip(id).then(function (cloud) { if (cloud) putClip(id, cloud); return cloud; });
    });
  }
  function delClip(id) { return tx('readwrite', function (s) { return s.delete(id); }).catch(function () { }); }

  /* ---------- records ---------- */
  function addRecording(rec, dets, clips) {
    rec.id = uid('r'); rec.station = state.station.name; rec.lat = state.station.lat; rec.lon = state.station.lon;
    state.recs.push(rec);
    dets.forEach(function (d, i) {
      d.id = uid('d'); d.recId = rec.id; d.status = d.status || 'auto'; d.species = d.species || null;
      d.ts = new Date(new Date(rec.start).getTime() + d.t0 * 1000).toISOString();
      d.station = rec.station; d.lat = rec.lat; d.lon = rec.lon;
      state.dets.push(d);
      if (clips && clips[i]) { d.clip = true; putClip(d.id, clips[i]); }
    });
    save(); libReset();
    if (window.WESync) window.WESync.pushAll().then(function () { dets.forEach(function (d, i) { if (clips && clips[i]) window.WESync.uploadClip(d.id, clips[i]); }); }).catch(function () { });
  }
  function setStatus(id, status, species) {
    var d = state.dets.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    d.status = status; if (species !== undefined) d.species = species; d.reviewed = new Date().toISOString(); save(); libReset();
    if (window.WESync) window.WESync.pushDet(d);
  }

  /* ---------- Reserve Pulse ---------- */
  function within(from, to) { return state.dets.filter(function (d) { var t = +new Date(d.ts); return d.status !== 'rejected' && t >= from && t < to; }); }
  function pulseFor(from, to) {
    var list = within(from, to);
    if (!list.length) return null;
    var conf = list.filter(function (d) { return d.status === 'confirmed'; });
    var spp = {}; conf.forEach(function (d) { if (d.species) spp[d.species] = 1; });
    var nSpp = Object.keys(spp).length, verified = conf.length / list.length;
    var a = Math.min(nSpp / 10, 1) * 40, b = Math.min(list.length / 60, 1) * 30, c = verified * 30;
    return { score: Math.round(a + b + c), parts: { diversity: a / 40, activity: b / 30, trust: c / 30 }, events: list.length, species: nSpp, verified: verified };
  }
  function pulse() {
    var now = Date.now(), W = 7 * 864e5;
    var cur = pulseFor(now - W, now + 1), prev = pulseFor(now - 2 * W, now - W);
    return { cur: cur, prev: prev };
  }

  /* ---------- calendar ---------- */
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function perDay() { var m = {}; state.dets.forEach(function (d) { if (d.status === 'rejected') return; var k = dayKey(d.ts); m[k] = (m[k] || 0) + 1; }); return m; }
  function seasonTable() {
    var m = {}, y = new Date().getFullYear();
    state.dets.forEach(function (d) {
      if (d.status !== 'confirmed' || !d.species) return;
      var t = new Date(d.ts); if (t.getFullYear() !== y) return;
      var r = m[d.species] || (m[d.species] = { id: d.species, first: t, last: t, n: 0 });
      if (t < r.first) r.first = t; if (t > r.last) r.last = t; r.n++;
    });
    return Object.keys(m).map(function (k) { return m[k]; }).sort(function (a, b) { return a.first - b.first; });
  }

  /* ---------- demo data (clearly labelled everywhere) ---------- */
  function seedDemo() {
    clearDemo();
    var ids = ['gru_gru', 'ant_vir', 'ans_ans', 'cyg_cyg', 'pho_ros', 'pel_cri', 'lar_ich', 'ful_atr', 'aro_aru', 'lus_sve', 'ala_arv', 'van_van'];
    var firstDay = { gru_gru: 70, ant_vir: 52, ans_ans: 74, cyg_cyg: 66, pho_ros: 34, pel_cri: 40, lar_ich: 28, ful_atr: 60, aro_aru: 22, lus_sve: 30, ala_arv: 68, van_van: 58 };
    var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var rec = { id: 'demo-rec', name: 'Демо-данные', start: new Date().toISOString(), dur: 0, station: 'Демо-станция 1', lat: 50.6, lon: 69.0, demo: true };
    var DS = [['Демо-станция 1', 50.6, 69.0], ['Демо-станция 2', 50.52, 69.14], ['Демо-станция 3', 50.72, 68.86]];
    state.recs.push(rec);
    var now = Date.now();
    for (var day = 75; day >= 0; day--) {
      var n = Math.round(2 + rnd() * 6 + (75 - day) / 14);
      for (var k = 0; k < n; k++) {
        var s = ids[Math.floor(rnd() * ids.length)];
        if (75 - day < firstDay[s]) continue;
        var t = now - day * 864e5 - rnd() * 864e5 * .8;
        var conf = rnd() < .78, st = DS[Math.floor(rnd() * 3)];
        if (st === DS[2] && now - t < 30 * 36e5) continue;
        var sound = rnd() < .03 ? { top: [], groups: { animal: 0.1, weather: 0, speech: 0, gun: rnd() < .5 ? 0.62 : 0, engine: 0.55, dog: 0 } } : null;
        state.dets.push({ id: uid('d'), recId: 'demo-rec', t0: 0, t1: 1.2, fLow: 1500, fHigh: 4200, fPeak: 2600, snr: 15, status: conf ? 'confirmed' : 'auto', species: conf ? s : null, ts: new Date(t).toISOString(), station: st[0], lat: st[1], lon: st[2], demo: true, sound: sound });
      }
    }
    save();
  }
  function clearDemo() {
    state.dets = state.dets.filter(function (d) { return !d.demo; });
    state.recs = state.recs.filter(function (r) { return !r.demo; }); save();
  }
  function hasDemo() { return state.dets.some(function (d) { return d.demo; }); }

  /* ---------- export ---------- */
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(rows) { return '﻿' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }
  function exportLog() {
    var rows = [['id', 'время', 'станция', 'широта', 'долгота', 'сек_начало', 'сек_конец', 'частота_от_Гц', 'частота_до_Гц', 'пик_Гц', 'SNR_дБ', 'статус', 'вид', 'латинское_название', 'демо']];
    state.dets.forEach(function (d) {
      var sp = d.species && byId[d.species];
      rows.push([d.id, d.ts, d.station, d.lat, d.lon, d.t0.toFixed(2), d.t1.toFixed(2), d.fLow, d.fHigh, d.fPeak, d.snr, d.status, sp ? sp.ru : (d.species || ''), sp ? sp.lat : '', d.demo ? 'да' : '']);
    });
    return toCSV(rows);
  }
  /* Darwin Core occurrence core. Only human-confirmed records with a species name, never demo data. */
  function exportDwC() {
    var rows = [['occurrenceID', 'basisOfRecord', 'eventDate', 'scientificName', 'vernacularName', 'decimalLatitude', 'decimalLongitude', 'recordedBy', 'identificationVerificationStatus', 'samplingProtocol', 'locality']];
    state.dets.forEach(function (d) {
      if (d.demo || d.status !== 'confirmed' || !d.species || !byId[d.species]) return;
      var sp = byId[d.species];
      rows.push([d.id, 'HumanObservation', d.ts, sp.lat, sp.ru, d.lat, d.lon, 'WetlandEar', 'verified by human from acoustic recording', 'passive acoustic monitoring', d.station]);
    });
    return toCSV(rows);
  }
  function exportJSON() { return JSON.stringify(state); }
  function importJSON(txt) { var s = JSON.parse(txt); if (!s || !Array.isArray(s.dets) || !Array.isArray(s.recs)) throw new Error('bad'); state = s; save(); }
  function wipe() { state.dets.forEach(function (d) { if (d.clip) delClip(d.id); }); state = blank(); save(); }


  /* ---------- trust levels, sound kinds, threats ---------- */
  /* event found -> model suggests -> human confirmed -> reference (human and model agree) */
  function level(d) {
    if (d.status === 'rejected') return 'rejected';
    if (d.status === 'confirmed') return (d.suggest && d.species && sugId(d.suggest) === d.species && d.suggest.conf >= .7) ? 'reference' : 'human';
    return d.suggest ? 'model' : 'event';
  }
  function soundKind(d) {
    var g = d.sound && d.sound.groups; if (!g) return null;
    if (g.animal >= .3) return 'animal'; if (g.weather >= .5) return 'weather'; if (g.speech >= .5) return 'speech'; if (g.dog >= .5) return 'dog'; return null;
  }
  function threatOf(d) {
    var g = d.sound && d.sound.groups; if (!g) return null;
    if (g.gun >= .35) return { kind: 'gun', score: g.gun };
    if (g.engine >= .5 && g.animal < .5) return { kind: 'engine', score: g.engine };
    return null;
  }

  /* ---------- stations on the map ---------- */
  function stationStats(fromMs) {
    var m = {};
    state.dets.forEach(function (d) {
      if (d.lat == null || d.lon == null || d.status === 'rejected' || +new Date(d.ts) < fromMs) return;
      var k = d.station + '|' + d.lat + '|' + d.lon;
      var r = m[k] || (m[k] = { name: d.station, lat: d.lat, lon: d.lon, n: 0, species: {}, demo: !!d.demo, threats: 0 });
      r.n++; if (d.status === 'confirmed' && d.species) r.species[d.species] = (r.species[d.species] || 0) + 1; if (threatOf(d)) r.threats++;
    });
    return Object.keys(m).map(function (k) { return m[k]; });
  }

  /* ---------- morning report ---------- */
  function report(hours) {
    var now = Date.now(), from = now - hours * 36e5, prevFrom = from - hours * 36e5;
    var live = state.dets.filter(function (d) { return d.status !== 'rejected'; });
    var cur = live.filter(function (d) { var t = +new Date(d.ts); return t >= from && t <= now; });
    var firstSeen = {};
    state.dets.forEach(function (d) { if (d.status === 'confirmed' && d.species) { var t = +new Date(d.ts); if (!(firstSeen[d.species] <= t)) firstSeen[d.species] = t; } });
    var counts = {}; cur.forEach(function (d) { if (d.status === 'confirmed' && d.species) counts[d.species] = (counts[d.species] || 0) + 1; });
    var species = Object.keys(counts).map(function (id) { return { id: id, n: counts[id] }; }).sort(function (a, b) { return b.n - a.n; });
    var fresh = species.filter(function (s) { return firstSeen[s.id] >= from; }).map(function (s) { return s.id; });
    var threats = cur.filter(function (d) { return threatOf(d); }).sort(function (a, b) { return a.ts < b.ts ? 1 : -1; });
    var activeNow = {}, activeBefore = {};
    live.forEach(function (d) { var t = +new Date(d.ts), k = d.station || '?'; if (t >= from) activeNow[k] = 1; else activeBefore[k] = 1; });
    var silent = Object.keys(activeBefore).filter(function (k) { return !activeNow[k]; });
    return { hours: hours, from: from, to: now, events: cur.length, confirmed: cur.filter(function (d) { return d.status === 'confirmed'; }).length, species: species, fresh: fresh,
      threats: threats, silent: silent, pulse: pulseFor(from, now + 1), prev: pulseFor(prevFrom, from), demo: cur.some(function (d) { return d.demo; }) };
  }

  /* ---------- personal voice library: what you confirmed teaches the app to recognise the same voice again ---------- */
  function f16(h) {
    var s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
    if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
    if (e === 31) return m ? NaN : s * Infinity;
    return s * Math.pow(2, e - 15) * (1 + m / 1024);
  }
  /* server sends 1024 numbers as base64 float16; we keep them as small int8 text: "scale|base64" */
  function packEmb(b64) {
    var bin = atob(b64), n = bin.length >> 1, v = new Float32Array(n), mx = 1e-9, i;
    for (i = 0; i < n; i++) { v[i] = f16(bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8)); if (Math.abs(v[i]) > mx) mx = Math.abs(v[i]); }
    var sc = mx / 127, q = new Int8Array(n), str = '';
    for (i = 0; i < n; i++) q[i] = Math.round(v[i] / sc);
    var u = new Uint8Array(q.buffer); for (i = 0; i < u.length; i += 8192) str += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
    return sc.toPrecision(6) + '|' + btoa(str);
  }
  function unpackEmb(t) {
    var p = t.split('|'), sc = parseFloat(p[0]), bin = atob(p[1]), n = bin.length, v = new Float32Array(n), nn = 0, i, x;
    for (i = 0; i < n; i++) { x = bin.charCodeAt(i); if (x > 127) x -= 256; v[i] = x * sc; nn += v[i] * v[i]; }
    nn = Math.sqrt(nn) || 1; for (i = 0; i < n; i++) v[i] /= nn;
    return v;
  }
  var lib = null;
  function libReset() { lib = null; }
  function library() {
    if (lib) return lib; lib = {};
    state.dets.forEach(function (d) {
      if (d.demo || d.status !== 'confirmed' || !d.species || !d.emb) return;
      try { (lib[d.species] = lib[d.species] || []).push(unpackEmb(d.emb)); } catch (e) { }
    });
    return lib;
  }
  /* best match among your own confirmed fragments: {id, sim, n} or null */
  function matchOwn(embStr) {
    var L = library(), ids = Object.keys(L); if (!ids.length || !embStr) return null;
    var q; try { q = unpackEmb(embStr); } catch (e) { return null; }
    var best = null;
    ids.forEach(function (id) {
      var mx = -1; L[id].forEach(function (v) { var s = 0; for (var i = 0; i < q.length; i++) s += q[i] * v[i]; if (s > mx) mx = s; });
      if (!best || mx > best.sim) best = { id: id, sim: mx, n: L[id].length };
    });
    return best;
  }
  function ownStats() { var L = library(); return Object.keys(L).map(function (id) { return { id: id, n: L[id].length }; }).sort(function (a, b) { return b.n - a.n; }); }

  window.WEStore = {
    SPECIES: SPECIES, species: byId, sugId: sugId, sugName: sugName, nameOf: nameOf, packEmb: packEmb, matchOwn: matchOwn, ownStats: ownStats, libReset: libReset, level: level, soundKind: soundKind, threatOf: threatOf, stationStats: stationStats, report: report, get: function () { return state; }, save: save,
    addRecording: addRecording, setStatus: setStatus, getClip: getClip, pulse: pulse, perDay: perDay, dayKey: dayKey, seasonTable: seasonTable,
    seedDemo: seedDemo, clearDemo: clearDemo, hasDemo: hasDemo,
    exportLog: exportLog, exportDwC: exportDwC, exportJSON: exportJSON, importJSON: importJSON, wipe: wipe
  };
})();
