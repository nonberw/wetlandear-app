"""Ask the journal in plain language. POST {question, lang} with the user's Supabase token.
The server builds a small summary of that user's own journal (never audio) and asks Claude to answer from it.
Needs the ANTHROPIC_API_KEY environment variable in Vercel (set by the owner)."""
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import tg as T  # noqa: E402

MODEL = os.environ.get('ANTHROPIC_MODEL', 'claude-haiku-5-5')
DAILY_LIMIT = 40
_used = {}   # user -> (day, count); best effort per instance


def summary(user_id, token=None):
    rows = T.fetch_rows(user_id, 120, token)
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
    stations = Counter(r.get('station') or '?' for r in live)
    threats = [r for r in live if T.threat_of(r.get('sound'))]
    return {
        'today_utc': now.strftime('%Y-%m-%d'), 'timezone_of_hours': 'Astana (UTC+5)', 'journal_window_days': 120,
        'events_total': len(live), 'events_confirmed_by_person': len([r for r in live if r['status'] == 'confirmed']),
        'species_confirmed_all_time_in_window': [{'species': s, 'count': n, 'first_seen': first[s].strftime('%Y-%m-%d'), 'last_seen': last[s].strftime('%Y-%m-%d')} for s, n in by_all.most_common(40)],
        'species_confirmed_last_30_days': [{'species': s, 'count': n} for s, n in by_30.most_common(25)],
        'events_by_hour_last_30_days': {str(h): n for h, n in sorted(hours.items())},
        'events_by_iso_week': dict(sorted(weeks.items())[-16:]),
        'events_by_station': dict(stations.most_common(15)),
        'possible_alerts': {'count': len(threats), 'latest': [{'ts': r['ts'][:16], 'station': r.get('station'), 'kind': T.threat_of(r['sound'])[0]} for r in sorted(threats, key=lambda x: x['ts'], reverse=True)[:5]]},
    }


SYSTEM = ("You are the assistant inside WetlandEar, an acoustic bird monitoring app for nature reserves. "
          "You get a JSON summary of ONE user's own observation journal. Answer the user's question using only that data. "
          "If the data cannot answer it, say so plainly and suggest what to record or confirm. Never invent species, counts or dates. "
          "Species are suggestions confirmed by a person; alerts are model hints, not proof. Be concise: at most 6 sentences or a short list. "
          "Reply in the language requested by the user (ru or en).")


def ask_claude(question, data, lang):
    key = os.environ.get('ANTHROPIC_API_KEY', '')
    if not key:
        return None, 'not configured'
    body = {'model': MODEL, 'max_tokens': 600, 'system': SYSTEM,
            'messages': [{'role': 'user', 'content': 'Language: %s\n\nJournal summary:\n%s\n\nQuestion: %s' % (lang, json.dumps(data, ensure_ascii=False), question)}]}
    req = urllib.request.Request('https://api.anthropic.com/v1/messages', method='POST', data=json.dumps(body).encode(),
                                 headers={'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'})
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
    except Exception:
        return None, 'upstream error'


class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        return self._json(200, {'ok': True, 'configured': bool(os.environ.get('ANTHROPIC_API_KEY'))})

    def do_POST(self):
        auth = self.headers.get('Authorization', '')
        user = T.user_from_token(auth[7:].strip()) if auth.startswith('Bearer ') else None
        if not user or not user.get('id'):
            return self._json(401, {'error': 'sign in required'})
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if not 0 < n < 5000:
                return self._json(413, {'error': 'size'})
            req = json.loads(self.rfile.read(n))
            q = str(req.get('question', '')).strip()[:400]
            lang = 'ru' if req.get('lang') == 'ru' else 'en'
            if len(q) < 3:
                return self._json(400, {'error': 'question'})
            day = time.strftime('%Y-%m-%d')
            d, c = _used.get(user['id'], (day, 0))
            c = c + 1 if d == day else 1
            if c > DAILY_LIMIT:
                return self._json(429, {'error': 'daily limit'})
            _used[user['id']] = (day, c)
            text, err = ask_claude(q, summary(user['id'], auth[7:].strip()), lang)
            if err == 'not configured':
                return self._json(503, {'error': 'not configured'})
            if err:
                return self._json(502, {'error': err})
            return self._json(200, {'answer': text})
        except Exception:
            return self._json(500, {'error': 'failed'})
