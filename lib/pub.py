"""Data for pages anyone can open with a link: public "listen to the wetland" pages, sponsor reports, expert review requests.
Everything here is read with the secret key, so the rules are enforced in code: a page shows only what its owner enabled, never exact coordinates,
never species from the sensitive list (nests of eagles, bustards, pelicans), never names of people."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

import actions as A
import tg as T

SENSITIVE = {s.lower() for s in (
    'Pelecanus crispus', 'Pelecanus onocrotalus', 'Grus leucogeranus', 'Otis tarda', 'Chlamydotis macqueenii', 'Tetrax tetrax', 'Falco cherrug', 'Falco peregrinus', 'Falco biarmicus',
    'Aquila heliaca', 'Aquila nipalensis', 'Aquila chrysaetos', 'Clanga clanga', 'Haliaeetus albicilla', 'Haliaeetus leucoryphus', 'Neophron percnopterus', 'Gyps fulvus', 'Aegypius monachus',
    'Gypaetus barbatus', 'Circaetus gallicus', 'Hieraaetus pennatus', 'Oxyura leucocephala', 'Aythya nyroca', 'Marmaronetta angustirostris', 'Vanellus gregarius', 'Glareola nordmanni',
    'Larus relictus', 'Ichthyaetus ichthyaetus', 'Larus ichthyaetus', 'Phoenicopterus roseus', 'Platalea leucorodia', 'Plegadis falcinellus', 'Ciconia nigra', 'Circus macrourus', 'Bubo bubo',
    'Tetraogallus altaicus', 'Anser erythropus', 'Branta ruficollis', 'Charadrius leschenaultii', 'Numenius tenuirostris')}   # keep in sync with js/privacy.js


def is_sensitive(sid, suggest=None):
    return A.sci_of(sid, suggest).lower() in SENSITIVE


def page_by_token(token):
    """The enabled public page for a token, or None. Tokens are long random strings; a wrong guess just returns nothing."""
    t = ''.join(c for c in str(token) if c.isalnum())[:64]
    if len(t) < 20:
        return None
    rows = T.sb('public_pages?select=*&token=eq.%s&enabled=eq.true&limit=1' % t) or []
    return rows[0] if rows else None


def scope_uids(page):
    """The owner, plus every member of the organisation when the page covers the whole team."""
    uids = {page['owner']}
    if page.get('org_id'):
        for m in (T.sb('org_members?select=user_id&org_id=eq.%s&limit=500' % page['org_id']) or []):
            uids.add(m['user_id'])
    return sorted(uids)


def _in(uids):
    return '(' + ','.join(uids) + ')'


def fetch(page, since):
    """Confirmed, non-sensitive detections of the page scope since a datetime, newest first. Coordinates are not selected at all."""
    qs = ('detections?select=id,user_id,ts,species,suggest,station&user_id=in.%s&status=eq.confirmed&species=not.is.null&ts=gte.%s&order=ts.desc&limit=20000'
          % (_in(scope_uids(page)), urllib.parse.quote(since.isoformat())))
    if page.get('station'):
        qs += '&station=eq.' + urllib.parse.quote(page['station'], safe='')
    return [r for r in (T.sb(qs) or []) if not is_sensitive(r['species'], r.get('suggest'))]


def stations_alive(page):
    """How many stations of the scope sent something in the last 48 hours."""
    since = (datetime.now(timezone.utc) - timedelta(hours=48)).isoformat()
    qs = 'recordings?select=station&user_id=in.%s&created_at=gte.%s&limit=5000' % (_in(scope_uids(page)), urllib.parse.quote(since))
    return len({r.get('station') for r in (T.sb(qs) or []) if r.get('station')})


def _name(sid, lang, suggest=None):
    n = T.name_of(sid, 'ru' if lang in ('ru', 'kk') else 'en')
    return n


def view(page, lang='ru', days=30):
    now = datetime.now(timezone.utc)
    rows = fetch(page, now - timedelta(days=370 if page['kind'] == 'report' else days))
    d7 = now - timedelta(days=7)
    d1 = now - timedelta(hours=24)
    week = [r for r in rows if T.parse_ts(r['ts']) >= d7]
    month = [r for r in rows if T.parse_ts(r['ts']) >= now - timedelta(days=30)]
    today = Counter(r['species'] for r in rows if T.parse_ts(r['ts']) >= d1)
    out = {
        'kind': page['kind'], 'title': page['title'], 'updated': now.isoformat(), 'lang': lang, 'station': page.get('station'),
        'stats': {'events_7d': len(week), 'species_7d': len({r['species'] for r in week}), 'species_30d': len({r['species'] for r in month}), 'stations_alive': stations_alive(page)},
        'today': [{'name': _name(s, lang), 'n': n} for s, n in today.most_common(10)],
        'recent': [{'name': _name(r['species'], lang, r.get('suggest')), 'ts': r['ts'][:13] + ':00:00Z'} for r in rows[:14]],
    }
    # voice of the week: the clearest confirmed recording of the last 7 days (the model and the person agreed)
    voice = None
    if page.get('show_clip'):
        best = 0
        for r in week:
            sg = r.get('suggest') or {}
            conf = float(sg.get('conf') or 0) if A.sug_id(sg) == r['species'] else 0
            if conf > best:
                best, voice = conf, r
    out['voice'] = {'id': voice['id'], 'name': _name(voice['species'], lang, voice.get('suggest')), 'ts': voice['ts'][:10]} if voice else None
    if page['kind'] == 'report':
        year = [r for r in rows if T.parse_ts(r['ts']) >= now - timedelta(days=365)]
        months = Counter(T.parse_ts(r['ts']).strftime('%Y-%m') for r in year)
        keys = []
        y, m = now.year, now.month
        for _ in range(12):
            keys.append('%04d-%02d' % (y, m))
            m -= 1
            if m == 0:
                y, m = y - 1, 12
        keys.reverse()
        cnt = Counter(r['species'] for r in year)
        hours = [0] * 24
        for r in year:
            hours[(T.parse_ts(r['ts']).hour + 5) % 24] += 1   # Astana time (UTC+5)
        first = {}
        for r in sorted(year, key=lambda r: r['ts']):
            first.setdefault(r['species'], r['ts'][:10])
        out['report'] = {
            'months': [{'m': k, 'n': months.get(k, 0)} for k in keys], 'hours': hours, 'species_year': len(cnt), 'events_year': len(year),
            'top': [{'name': _name(s, lang), 'sci': A.sci_of(s), 'n': n, 'first': first.get(s, '')} for s, n in cnt.most_common(15)],
            'note': 'Species suggested by BirdNET and the WetlandEar model, confirmed by a person. Rare and nesting-sensitive species are not shown.',
        }
    return out


def clip_bytes(uid, det_id):
    """The audio clip of a detection from private storage (wav), or None."""
    key = T.env('SUPABASE_SECRET_KEY').strip()
    url = '%s/storage/v1/object/clips/%s/%s.wav' % (T.SUPABASE_URL, uid, urllib.parse.quote(str(det_id), safe=''))
    req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = r.read()
            return data if 0 < len(data) < 2_000_000 else None
    except Exception:
        return None


def det_in_scope(page, det_id):
    """The detection if it belongs to the page scope, is confirmed and not sensitive."""
    rows = T.sb('detections?select=id,user_id,ts,species,suggest,status&id=eq.%s&limit=1' % urllib.parse.quote(str(det_id), safe='')) or []
    if not rows:
        return None
    r = rows[0]
    if r['user_id'] not in scope_uids(page) or r['status'] != 'confirmed' or not r.get('species') or is_sensitive(r['species'], r.get('suggest')):
        return None
    return r
