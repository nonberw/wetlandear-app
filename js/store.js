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
  var byId = {}; SPECIES.forEach(function (s) { byId[s[0]] = { id: s[0], ru: s[1], lat: s[2] }; });

  var state = load();
  function blank() { return { recs: [], dets: [], station: { name: 'Телефон 1', lat: null, lon: null }, seq: 1 }; }
  function load() { try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.dets) return s; } catch (e) { } return blank(); }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { alert('Не хватает места в хранилище браузера. Выгрузите журнал и очистите старые данные.'); } }
  function uid(p) { return p + Date.now().toString(36) + (state.seq++).toString(36); }

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
  function getClip(id) { return tx('readonly', function (s) { return s.get(id); }).then(function (b) { return b ? new Int16Array(b) : null; }).catch(function () { return null; }); }
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
    save();
  }
  function setStatus(id, status, species) {
    var d = state.dets.filter(function (x) { return x.id === id; })[0]; if (!d) return;
    d.status = status; if (species !== undefined) d.species = species; d.reviewed = new Date().toISOString(); save();
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
    var rec = { id: 'demo-rec', name: 'Демо-данные', start: new Date().toISOString(), dur: 0, station: 'Демо-станция', lat: 50.6, lon: 69.0, demo: true };
    state.recs.push(rec);
    var now = Date.now();
    for (var day = 75; day >= 0; day--) {
      var n = Math.round(2 + rnd() * 6 + (75 - day) / 14);
      for (var k = 0; k < n; k++) {
        var s = ids[Math.floor(rnd() * ids.length)];
        if (75 - day < firstDay[s]) continue;
        var t = now - day * 864e5 - rnd() * 864e5 * .8;
        var conf = rnd() < .78;
        state.dets.push({ id: uid('d'), recId: 'demo-rec', t0: 0, t1: 1.2, fLow: 1500, fHigh: 4200, fPeak: 2600, snr: 15, status: conf ? 'confirmed' : 'auto', species: conf ? s : null, ts: new Date(t).toISOString(), station: 'Демо-станция', lat: 50.6, lon: 69.0, demo: true });
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

  window.WEStore = {
    SPECIES: SPECIES, species: byId, get: function () { return state; }, save: save,
    addRecording: addRecording, setStatus: setStatus, getClip: getClip, pulse: pulse, perDay: perDay, dayKey: dayKey, seasonTable: seasonTable,
    seedDemo: seedDemo, clearDemo: clearDemo, hasDemo: hasDemo,
    exportLog: exportLog, exportDwC: exportDwC, exportJSON: exportJSON, importJSON: importJSON, wipe: wipe
  };
})();
