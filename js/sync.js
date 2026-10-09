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
      suggest: d.suggest || null, sound: d.sound || null, emb: d.emb || null, station: d.station || null, lat: d.lat == null ? null : d.lat, lon: d.lon == null ? null : d.lon, reviewed_at: d.reviewed || null };
  }
  function detFromRow(r) {
    return { id: r.id, recId: r.rec_id, ts: r.ts, t0: r.t0, t1: r.t1, fLow: r.f_low, fHigh: r.f_high, fPeak: r.f_peak, snr: r.snr, status: r.status, species: r.species, suggest: r.suggest, sound: r.sound, emb: r.emb,
      station: r.station, lat: r.lat, lon: r.lon, reviewed: r.reviewed_at, clip: 'cloud', uid: r.user_id };
  }
  function recFromRow(r) { return { id: r.id, name: r.name, start: r.started_at, dur: r.duration, station: r.station, lat: r.lat, lon: r.lon, uid: r.user_id }; }

  /* ---------- push ---------- */
  function chunks(a, n) { var o = []; for (var i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }
  function pushAll() {
    if (!user) return Promise.resolve();
    var st = S.get(), mine = function (x) { return !x.demo && (!x.uid || x.uid === user.id); }, recs = st.recs.filter(mine).map(recRow), dets = st.dets.filter(mine).map(detRow);
    var p = Promise.resolve();
    if (recs.length) p = p.then(function () { return sb.from('recordings').upsert(recs).then(check); });
    chunks(dets, 400).forEach(function (c) { p = p.then(function () { return sb.from('detections').upsert(c).then(check); }); });
    return p.then(function () { maybeAlert(st.dets); });
  }
  function pushDet(d) {
    if (!user || d.demo) return Promise.resolve();
    if (d.uid && d.uid !== user.id) /* a teammate's event: editors may only change the review */
      return sb.from('detections').update({ status: d.status, species: d.species || null, reviewed_at: d.reviewed || null }).eq('id', d.id).then(check).catch(function () { });
    return sb.from('detections').upsert(detRow(d)).then(check).then(function () { maybeAlert([d]); }).catch(function () { });
  }
  /* instant Telegram alert for a fresh possible gunshot or engine noise; the server re-checks everything */
  function alertedIds() { try { return JSON.parse(localStorage.getItem('we.alerted') || '[]'); } catch (e) { return []; } }
  function maybeAlert(dets) {
    if (!user || !session) return;
    var done = alertedIds(), now = Date.now();
    var ids = dets.filter(function (d) { return !d.demo && d.status !== 'rejected' && (!d.uid || d.uid === user.id) && S.threatOf(d) && now - new Date(d.ts) < 3 * 36e5 && done.indexOf(d.id) < 0; }).map(function (d) { return d.id; }).slice(0, 20);
    if (!ids.length) return;
    fetch('/api/alert', { method: 'POST', headers: { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids }) }).then(function (r) {
      if (r.ok) try { localStorage.setItem('we.alerted', JSON.stringify(done.concat(ids).slice(-300))); } catch (e) { }
    }).catch(function () { });
  }
  function uploadClip(id, int16) {
    if (!user) return Promise.resolve();
    return sb.storage.from('clips').upload(user.id + '/' + id + '.wav', D.wavBlob(int16 && Float32Array.from(int16, function (v) { return v / 32768; }), D.SR), { upsert: true, contentType: 'audio/wav' }).catch(function () { });
  }
  function downloadClip(id, owner) {
    if (!user) return Promise.resolve(null);
    return sb.storage.from('clips').download((owner || user.id) + '/' + id + '.wav').then(function (r) {
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
      var seenDet = {}, seenRec = {}; res[1].data.forEach(function (r) { seenDet[r.id] = 1; }); res[0].data.forEach(function (r) { seenRec[r.id] = 1; });
      st.dets = st.dets.filter(function (d) { return !d.uid || d.uid === user.id || seenDet[d.id]; });   /* left a team: its data leaves this device */
      st.recs = st.recs.filter(function (r) { return !r.uid || r.uid === user.id || seenRec[r.id]; });
      S.save(); S.libReset(); return added;
    });
  }

  function syncNow(quiet) {
    if (!user || busy) return Promise.resolve();
    busy = true; emit();
    return pull().then(pushAll).then(function () { lastSync = new Date(); }).catch(function (e) { if (!quiet) throw e; }).then(function () { busy = false; emit(); }, function (e) { busy = false; emit(); throw e; });
  }
  function status() { return { busy: busy, last: lastSync }; }

  /* ---------- Telegram morning report ---------- */
  function tgGet() {
    return sb.from('telegram_links').select('chat_id,enabled,lang,code,alerts').eq('user_id', user.id).maybeSingle().then(function (r) {
      if (!r.error) return r.data;
      return sb.from('telegram_links').select('chat_id,enabled,lang,code').eq('user_id', user.id).maybeSingle().then(function (r2) { if (r2.error) throw r2.error; return r2.data; });   /* database update not applied yet */
    });
  }
  function tgCode() { var a = new Uint8Array(12); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function tgConnect(lang) {
    var code = tgCode();
    /* insert or update: plain columns only, the user may never touch chat_id */
    return sb.from('telegram_links').select('user_id').eq('user_id', user.id).maybeSingle().then(function (r) {
      if (r.error) throw r.error;
      var q = r.data ? sb.from('telegram_links').update({ code: code, enabled: true, lang: lang || 'ru' }).eq('user_id', user.id) : sb.from('telegram_links').insert({ code: code, enabled: true, lang: lang || 'ru' });
      return q.then(function (w) { if (w.error) throw w.error; return code; });
    });
  }
  function tgSet(patch) { return sb.from('telegram_links').update(patch).eq('user_id', user.id).then(function (r) { if (r.error) throw r.error; }); }
  function tgRemove() { return sb.from('telegram_links').delete().eq('user_id', user.id).then(function (r) { if (r.error) throw r.error; }); }
  function tgTest() {
    return fetch('/api/morning', { method: 'POST', headers: { Authorization: 'Bearer ' + token() } }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
  }

  /* ---------- personal keys for AI assistants (MCP): only the hash is stored ---------- */
  function b64url(bytes) { return btoa(String.fromCharCode.apply(null, bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function sha256hex(str) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }); }
  function keyList() { return sb.from('api_tokens').select('token_hash,label,created_at,last_used').order('created_at', { ascending: false }).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function keyCreate(label) {
    var a = new Uint8Array(32); crypto.getRandomValues(a); var key = 'we_' + b64url(a);
    return sha256hex(key).then(function (h) { return sb.from('api_tokens').insert({ token_hash: h, label: (label || '').slice(0, 40) }); }).then(function (r) { if (r.error) throw r.error; return key; });
  }
  function keyRemove(hash) { return sb.from('api_tokens').delete().eq('token_hash', hash).then(function (r) { if (r.error) throw r.error; }); }

  /* ---------- teams ---------- */
  function rpc(name, args) { return sb.rpc(name, args || {}).then(function (r) { if (r.error) throw r.error; return r.data; }); }
  function orgList() { return rpc('my_orgs'); }
  function orgPeople(id) { return rpc('org_people', { p_org: id }); }
  function orgCreate(name) { return rpc('create_org', { p_name: name }); }
  function orgJoin(code) { return rpc('join_org', { p_code: code }); }
  function orgRole(org, uid, role) { return rpc('set_member_role', { p_org: org, p_user: uid, p_role: role }); }
  function orgRemove(org, uid) { return rpc('remove_member', { p_org: org, p_user: uid }); }
  function orgCode(org) { return rpc('new_join_code', { p_org: org }); }
  function orgDelete(org) { return rpc('delete_org', { p_org: org }); }

  window.WESync = {
    orgList: orgList, orgPeople: orgPeople, orgCreate: orgCreate, orgJoin: orgJoin, orgRole: orgRole, orgRemove: orgRemove, orgCode: orgCode, orgDelete: orgDelete,
    keyList: keyList, keyCreate: keyCreate, keyRemove: keyRemove,
    tgGet: tgGet, tgConnect: tgConnect, tgSet: tgSet, tgRemove: tgRemove, tgTest: tgTest, init: init, ready: ready, onChange: onChange, signIn: signIn, signOut: signOut, me: me, token: token, getProfile: getProfile, saveProfile: saveProfile,
    syncNow: syncNow, pushDet: pushDet, pushAll: pushAll, uploadClip: uploadClip, downloadClip: downloadClip, status: status };
})();
