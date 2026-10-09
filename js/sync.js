/* WetlandEar accounts and sync. Sign in with Google through Supabase; your journal follows you across devices.
   The URL and publishable key are public by design. Row level security in the database keeps each user's rows private. */
(function () {
  'use strict';
  var URL = 'https://vflyedmortnampzdenpf.supabase.co';
  var KEY = 'sb_publishable_PnI4L7VszIqaFrWHnvbHRg_dyB3ZeVn';
  var S = window.WEStore, D = window.WEDSP;
  var sb = null, user = null, session = null, listeners = [], busy = false, lastSync = null;

  function emit() { listeners.forEach(function (f) { try { f(user); } catch (e) { } }); }
  function onChange(f) { listeners.push(f); }
  function ready() { return !!sb; }

  function init() {
    if (!window.supabase || !window.supabase.createClient) return Promise.resolve(null);
    sb = window.supabase.createClient(URL, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
    sb.auth.onAuthStateChange(function (ev, s) {
      session = s; var was = user && user.id; user = s ? s.user : null;
      if (location.search.indexOf('code=') > -1 || location.hash.indexOf('access_token') > -1) history.replaceState(null, '', location.pathname + (location.hash.indexOf('access_token') > -1 ? '#pulse' : location.hash));
      emit();
      if (user && user.id !== was) setTimeout(function () { syncNow(true); }, 0);
    });
    return sb.auth.getSession().then(function (r) { session = r.data.session; user = session ? session.user : null; emit(); return user; });
  }

  function signIn() { return sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + '/', queryParams: { prompt: 'select_account' } } }); }
  function signOut() { return sb.auth.signOut().then(function () { user = null; session = null; emit(); }); }
  function token() { return session ? session.access_token : null; }
  function me() {
    if (!user) return null;
    var m = user.user_metadata || {};
    return { id: user.id, email: user.email, name: m.full_name || m.name || (user.email || '').split('@')[0], avatar: m.avatar_url || m.picture || null };
  }

  /* ---------- profile ---------- */
  function getProfile() { return sb.from('profiles').select('display_name,avatar_url,organization,role').eq('id', user.id).maybeSingle().then(function (r) { return r.data || {}; }); }
  function saveProfile(p) { return sb.from('profiles').upsert({ id: user.id, display_name: p.display_name, organization: p.organization, role: p.role, avatar_url: p.avatar_url || null }).then(check); }
  function check(r) { if (r.error) throw r.error; return r; }

  /* ---------- row mapping ---------- */
  function recRow(r) { return { id: r.id, name: r.name || null, started_at: r.start || null, duration: r.dur || null, station: r.station || null, lat: r.lat == null ? null : r.lat, lon: r.lon == null ? null : r.lon }; }
  function detRow(d) {
    return { id: d.id, rec_id: d.recId || null, ts: d.ts, t0: d.t0, t1: d.t1, f_low: d.fLow, f_high: d.fHigh, f_peak: d.fPeak, snr: d.snr, status: d.status, species: d.species || null,
      suggest: d.suggest || null, sound: d.sound || null, station: d.station || null, lat: d.lat == null ? null : d.lat, lon: d.lon == null ? null : d.lon, reviewed_at: d.reviewed || null };
  }
  function detFromRow(r) {
    return { id: r.id, recId: r.rec_id, ts: r.ts, t0: r.t0, t1: r.t1, fLow: r.f_low, fHigh: r.f_high, fPeak: r.f_peak, snr: r.snr, status: r.status, species: r.species, suggest: r.suggest, sound: r.sound,
      station: r.station, lat: r.lat, lon: r.lon, reviewed: r.reviewed_at, clip: 'cloud' };
  }
  function recFromRow(r) { return { id: r.id, name: r.name, start: r.started_at, dur: r.duration, station: r.station, lat: r.lat, lon: r.lon }; }

  /* ---------- push ---------- */
  function chunks(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function pushAll() {
    if (!user) return Promise.resolve();
    var st = S.get(), recs = st.recs.filter(function (r) { return !r.demo; }).map(recRow), dets = st.dets.filter(function (d) { return !d.demo; }).map(detRow);
    var p = Promise.resolve();
    if (recs.length) p = p.then(function () { return sb.from('recordings').upsert(recs).then(check); });
    chunks(dets, 400).forEach(function (c) { p = p.then(function () { return sb.from('detections').upsert(c).then(check); }); });
    return p;
  }
  function pushDet(d) { if (!user || d.demo) return Promise.resolve(); return sb.from('detections').upsert(detRow(d)).then(check).catch(function () { }); }
  function uploadClip(id, int16) {
    if (!user) return Promise.resolve();
    return sb.storage.from('clips').upload(user.id + '/' + id + '.wav', D.wavBlob(int16 && Float32Array.from(int16, function (v) { return v / 32768; }), D.SR), { upsert: true, contentType: 'audio/wav' }).catch(function () { });
  }
  function downloadClip(id) {
    if (!user) return Promise.resolve(null);
    return sb.storage.from('clips').download(user.id + '/' + id + '.wav').then(function (r) {
      if (r.error || !r.data) return null;
      return r.data.arrayBuffer().then(function (ab) { return new Int16Array(ab.slice(44)); });
    }).catch(function () { return null; });
  }

  /* ---------- pull and merge ---------- */
  function pull() {
    if (!user) return Promise.resolve(0);
    return Promise.all([sb.from('recordings').select('*').limit(5000), sb.from('detections').select('*').order('ts', { ascending: false }).limit(10000)]).then(function (res) {
      check(res[0]); check(res[1]);
      var st = S.get(), recIds = {}, detMap = {}, added = 0;
      st.recs.forEach(function (r) { recIds[r.id] = 1; });
      st.dets.forEach(function (d) { detMap[d.id] = d; });
      res[0].data.forEach(function (r) { if (!recIds[r.id]) { st.recs.push(recFromRow(r)); } });
      res[1].data.forEach(function (r) {
        var local = detMap[r.id];
        if (!local) { st.dets.push(detFromRow(r)); added++; return; }
        if (r.reviewed_at && (!local.reviewed || r.reviewed_at > local.reviewed) && local.status !== r.status) { local.status = r.status; local.species = r.species; local.reviewed = r.reviewed_at; }
      });
      S.save(); return added;
    });
  }

  function syncNow(quiet) {
    if (!user || busy) return Promise.resolve();
    busy = true; emit();
    return pull().then(pushAll).then(function () { lastSync = new Date(); }).catch(function (e) { if (!quiet) throw e; }).then(function () { busy = false; emit(); }, function (e) { busy = false; emit(); throw e; });
  }
  function status() { return { busy: busy, last: lastSync }; }

  window.WESync = { init: init, ready: ready, onChange: onChange, signIn: signIn, signOut: signOut, me: me, token: token, getProfile: getProfile, saveProfile: saveProfile,
    syncNow: syncNow, pushDet: pushDet, pushAll: pushAll, uploadClip: uploadClip, downloadClip: downloadClip, status: status };
})();
