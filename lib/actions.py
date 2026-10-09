"""What a signed-in person can do with their own WetlandEar account, shared by the Telegram bot and the MCP server.
Every function takes the user id that the caller has ALREADY authenticated (linked Telegram chat or personal access key) and filters every
query by it: the secret key bypasses row security, so the user_id filter here is the access control."""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

import tg as T

SCI = {  # reference species: id -> scientific name (same list as the app)
    'pho_ros': 'Phoenicopterus roseus', 'pel_cri': 'Pelecanus crispus', 'pel_ono': 'Pelecanus onocrotalus', 'ant_vir': 'Anthropoides virgo', 'gru_gru': 'Grus grus',
    'cyg_cyg': 'Cygnus cygnus', 'ans_ans': 'Anser anser', 'ans_ery': 'Anser erythropus', 'tad_fer': 'Tadorna ferruginea', 'lar_ich': 'Larus ichthyaetus',
    'chl_hyb': 'Chlidonias hybrida', 'pod_cri': 'Podiceps cristatus', 'ful_atr': 'Fulica atra', 'van_van': 'Vanellus vanellus', 'aro_aru': 'Acrocephalus arundinaceus',
    'lus_sve': 'Luscinia svecica', 'ala_arv': 'Alauda arvensis', 'mel_yel': 'Melanocorypha yeltoniensis',
}
BY_SCI = {v: k for k, v in SCI.items()}
MODEL = os.environ.get('ANTHROPIC_MODEL', 'claude-haiku-5-5')


def q(s):
    return urllib.parse.quote(str(s), safe='')


def species_id(text):
    """Turn a typed name (Russian or English, or a reference id) into the id the app stores."""
    t = (text or '').strip()
    if not t:
        return None
    low = t.lower()
    for sid, (ru, en) in T.SPECIES.items():
        if low in (sid, ru.lower(), en.lower(), SCI[sid].lower()):
            return sid
    if t in BY_SCI:
        return BY_SCI[t]
    return 'x:' + t[:80]


def sug_id(s):
    return s.get('id') or BY_SCI.get(s.get('sci')) or ('x:' + str(s.get('common') or ''))


def sug_name(s, lang):
    if s.get('id'):
        return T.name_of(s['id'], lang)
    sid = BY_SCI.get(s.get('sci'))
    return T.name_of(sid, lang) if sid else str(s.get('common') or '?')


def det_view(r, lang='en'):
    sug = r.get('suggest') or None
    th = T.threat_of(r.get('sound'))
    return {'id': r['id'], 'time_utc': r['ts'], 'status': r['status'], 'species': T.name_of(r['species'], lang) if r.get('species') else None,
            'model_suggestion': ({'species': sug_name(sug, lang), 'confidence': round(float(sug.get('conf') or 0), 2)} if sug else None),
            'station': r.get('station'), 'possible_alert': th[0] if th else None}


# ---------- reading ----------
def stations(uid):
    return T.sb('stations?select=id,name,lat,lon&user_id=eq.%s&order=created_at.asc' % uid) or []


def detections(uid, days=7, status=None, species=None, station=None, limit=20, lang='en'):
    since = (datetime.now(timezone.utc) - timedelta(days=max(1, min(int(days), 365)))).isoformat()
    qs = 'detections?select=id,ts,status,species,suggest,station,sound&user_id=eq.%s&ts=gte.%s&order=ts.desc&limit=%d' % (uid, q(since), max(1, min(int(limit), 100)))
    if status in ('auto', 'confirmed', 'rejected'):
        qs += '&status=eq.' + status
    if station:
        qs += '&station=eq.' + q(station)
    rows = T.sb(qs) or []
    if species:
        sid = species_id(species)
        rows = [r for r in rows if r.get('species') == sid or (species.lower() in T.name_of(r.get('species'), 'en').lower() or species.lower() in T.name_of(r.get('species'), 'ru').lower())]
    return [det_view(r, lang) for r in rows]


def species_list(uid, days=30, lang='en'):
    rows = [r for r in T.fetch_rows(uid, max(1, min(int(days), 365))) if r['status'] == 'confirmed' and r.get('species')]
    c = Counter(r['species'] for r in rows)
    last = {}
    for r in rows:
        t = T.parse_ts(r['ts']); last[r['species']] = max(last.get(r['species'], t), t)
    return [{'species': T.name_of(s, lang), 'confirmed_events': n, 'last_heard_utc': last[s].strftime('%Y-%m-%d %H:%M')} for s, n in c.most_common(60)]


def pulse(uid, days=7):
    rows = [r for r in T.fetch_rows(uid, days) if r['status'] != 'rejected']
    return {'days': days, 'events': len(rows), 'pulse': T.pulse_for(rows)}


def alerts(uid, days=7, lang='en'):
    rows = [r for r in T.fetch_rows(uid, max(1, min(int(days), 90))) if r['status'] != 'rejected' and T.threat_of(r.get('sound'))]
    return [{'time_utc': r['ts'], 'station': r.get('station'), 'kind': T.threat_of(r['sound'])[0], 'score': round(T.threat_of(r['sound'])[1], 2)} for r in rows[:30]]


def review_queue(uid, limit=1, skip=0, lang='ru'):
    """Unreviewed events, the ones with a model suggestion first."""
    rows = T.sb('detections?select=id,ts,status,species,suggest,station,sound&user_id=eq.%s&status=eq.auto&order=ts.desc&limit=200' % uid) or []
    rows.sort(key=lambda r: (not r.get('suggest'), 0))
    return rows[skip:skip + limit], len(rows)


# ---------- writing (only what a reviewer needs; no deletion of recordings) ----------
def review(uid, det_id, status, species=None, lang='en'):
    """Confirm or reject one event. With status=confirmed and no species the model suggestion is used."""
    if status not in ('confirmed', 'rejected', 'auto'):
        return {'ok': False, 'error': 'status must be confirmed, rejected or auto'}
    rows = T.sb('detections?select=id,species,suggest&id=eq.%s&user_id=eq.%s' % (q(det_id), uid)) or []
    if not rows:
        return {'ok': False, 'error': 'event not found'}
    row = rows[0]
    body = {'status': status, 'reviewed_at': datetime.now(timezone.utc).isoformat()}
    if status == 'confirmed':
        sid = species_id(species) if species else (row.get('species') or (sug_id(row['suggest']) if row.get('suggest') else None))
        if not sid:
            return {'ok': False, 'error': 'give a species: this event has no model suggestion'}
        body['species'] = sid
    out = T.sb('detections?id=eq.%s&user_id=eq.%s' % (q(det_id), uid), method='PATCH', body=body, prefer='return=representation') or []
    return {'ok': bool(out), 'species': T.name_of(body.get('species'), lang) if body.get('species') else None, 'status': status}


def add_station(uid, name, lat=None, lon=None):
    name = str(name or '').strip()[:80]
    if not name:
        return {'ok': False, 'error': 'name required'}
    body = {'user_id': uid, 'name': name, 'lat': _num(lat), 'lon': _num(lon)}
    out = T.sb('stations', method='POST', body=body, prefer='return=representation') or []
    return {'ok': bool(out), 'station': out[0] if out else None}


def update_station(uid, station_id, name=None, lat=None, lon=None):
    body = {}
    if name is not None and str(name).strip():
        body['name'] = str(name).strip()[:80]
    if lat is not None:
        body['lat'] = _num(lat)
    if lon is not None:
        body['lon'] = _num(lon)
    if not body:
        return {'ok': False, 'error': 'nothing to change'}
    out = T.sb('stations?id=eq.%s&user_id=eq.%s' % (q(station_id), uid), method='PATCH', body=body, prefer='return=representation') or []
    return {'ok': bool(out), 'station': out[0] if out else None}


def remove_station(uid, station_id):
    out = T.sb('stations?id=eq.%s&user_id=eq.%s' % (q(station_id), uid), method='DELETE', prefer='return=representation') or []
    return {'ok': bool(out)}


def _num(v):
    try:
        f = float(v)
        return f if abs(f) <= 1000 else None
    except (TypeError, ValueError):
        return None


# ---------- the journal summary and the assistant (used by the app, the bot and MCP) ----------
def journal_summary(uid, token=None):
    rows = T.fetch_rows(uid, 120, token)
    now = datetime.now(timezone.utc)
    live = [r for r in rows if r['status'] != 'rejected']
    conf = [r for r in live if r['status'] == 'confirmed' and r.get('species')]
    names = lambda sid: T.name_of(sid, 'en')   # the model reads English names
    by_all, by_30 = Counter(), Counter()
    first, last = {}, {}
    for r in conf:
        t = T.parse_ts(r['ts']); s = names(r['species'])
        by_all[s] += 1
        if t >= now - timedelta(days=30):
            by_30[s] += 1
        first[s] = min(first.get(s, t), t); last[s] = max(last.get(s, t), t)
    hours = Counter(T.parse_ts(r['ts']).astimezone(timezone(timedelta(hours=5))).hour for r in live if T.parse_ts(r['ts']) >= now - timedelta(days=30))
    weeks = Counter(T.parse_ts(r['ts']).strftime('%G-W%V') for r in live)
    stn = Counter(r.get('station') or '?' for r in live)
    threats = [r for r in live if T.threat_of(r.get('sound'))]
    return {
        'today_utc': now.strftime('%Y-%m-%d'), 'timezone_of_hours': 'Astana (UTC+5)', 'journal_window_days': 120,
        'events_total': len(live), 'events_confirmed_by_person': len([r for r in live if r['status'] == 'confirmed']),
        'species_confirmed_all_time_in_window': [{'species': s, 'count': n, 'first_seen': first[s].strftime('%Y-%m-%d'), 'last_seen': last[s].strftime('%Y-%m-%d')} for s, n in by_all.most_common(40)],
        'species_confirmed_last_30_days': [{'species': s, 'count': n} for s, n in by_30.most_common(25)],
        'events_by_hour_last_30_days': {str(h): n for h, n in sorted(hours.items())},
        'events_by_iso_week': dict(sorted(weeks.items())[-16:]),
        'events_by_station': dict(stn.most_common(15)),
        'possible_alerts': {'count': len(threats), 'latest': [{'ts': r['ts'][:16], 'station': r.get('station'), 'kind': T.threat_of(r['sound'])[0]} for r in sorted(threats, key=lambda x: x['ts'], reverse=True)[:5]]},
    }


SYSTEM = ("You are the assistant inside WetlandEar, an acoustic bird monitoring app for nature reserves. "
          "You get a JSON summary of ONE user's own observation journal. Answer the user's question using only that data. "
          "If the data cannot answer it, say so plainly and suggest what to record or confirm. Never invent species, counts or dates. "
          "Species are suggestions confirmed by a person; alerts are model hints, not proof. Be concise: at most 6 sentences or a short list. "
          "Reply in the language requested by the user (ru or en).")


def ask_claude(question, data, lang):
    key = re.sub(r'[^A-Za-z0-9_\-]', '', os.environ.get('ANTHROPIC_API_KEY', ''))   # a pasted key can carry hidden characters
    if not key:
        return None, 'not configured'
    body = {'model': MODEL, 'max_tokens': 600, 'system': SYSTEM,
            'messages': [{'role': 'user', 'content': 'Language: %s\n\nJournal summary:\n%s\n\nQuestion: %s' % (lang, json.dumps(data, ensure_ascii=False), question)}]}
    headers = {'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'}
    ws = re.sub(r'[^A-Za-z0-9_\-]', '', os.environ.get('ANTHROPIC_WORKSPACE_ID', ''))
    if ws:   # keys that are not scoped to one workspace need its id (an identifier, not a secret)
        headers['anthropic-workspace-id'] = ws
    req = urllib.request.Request('https://api.anthropic.com/v1/messages', method='POST', data=json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            j = json.loads(r.read())
        return ''.join(b.get('text', '') for b in j.get('content', []) if b.get('type') == 'text').strip(), None
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get('error', {}).get('message', '')[:160]
        except Exception:
            msg = ''
        return None, 'upstream %d %s' % (e.code, msg)
    except Exception as e:
        return None, 'upstream error: %s' % type(e).__name__


_used = {}   # user -> (day, count); best effort per instance


def allow_ask(uid, limit=40):
    day = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    d, c = _used.get(uid, (day, 0))
    c = c + 1 if d == day else 1
    _used[uid] = (day, c)
    return c <= limit
