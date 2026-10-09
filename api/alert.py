"""Instant Telegram alert. The app calls this right after it syncs events that look like a gunshot or engine noise.
POST {ids: [event ids]} with the user's Supabase token. The server re-reads those events through the user's own token (row security applies),
checks that they really are threats and recent, and writes to the user's Telegram chat and, if the user is in a team, to teammates who switched alerts on."""
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import urllib.parse
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import tg as T  # noqa: E402

_sent = {}   # event id -> time, best effort per instance
MSG = {
    'ru': {'head': '⚠ <b>Тревога WetlandEar</b>', 'gun': 'Возможный выстрел', 'engine': 'Шум двигателя', 'at': 'станция', 'foot': 'Это подсказка модели, прослушайте запись в приложении.', 'from': 'от'},
    'en': {'head': '⚠ <b>WetlandEar alert</b>', 'gun': 'Possible gunshot', 'engine': 'Engine noise', 'at': 'station', 'foot': 'This is a model hint, listen to the recording in the app.', 'from': 'from'},
}


def recipients(uid):
    """The person and, through teams, teammates with alerts on. Returns [(chat_id, lang)]."""
    out, seen = [], set()
    ids = [uid]
    try:
        mine = [r['org_id'] for r in (T.sb('org_members?select=org_id&user_id=eq.%s' % uid) or [])]
        if mine:
            peers = T.sb('org_members?select=user_id&org_id=in.(%s)' % ','.join(mine)) or []
            ids += [p['user_id'] for p in peers]
    except Exception:
        pass   # teams not set up yet
    for i in dict.fromkeys(ids):
        try:
            rows = T.sb('telegram_links?select=chat_id,lang,enabled,alerts&user_id=eq.%s&limit=1' % i) or []
        except Exception:
            try:
                rows = T.sb('telegram_links?select=chat_id,lang,enabled&user_id=eq.%s&limit=1' % i) or []
            except Exception:
                rows = []
        if rows and rows[0].get('chat_id') and rows[0].get('alerts', True) is not False and rows[0].get('chat_id') not in seen:
            seen.add(rows[0]['chat_id']); out.append((rows[0]['chat_id'], rows[0].get('lang') or 'ru'))
    return out


class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        auth = self.headers.get('Authorization', '')
        token = auth[7:].strip() if auth.startswith('Bearer ') else ''
        user = T.user_from_token(token) if token else None
        if not user or not user.get('id'):
            return self._json(401, {'error': 'sign in required'})
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if not 0 < n < 5000:
                return self._json(413, {'error': 'size'})
            ids = [str(i)[:60] for i in (json.loads(self.rfile.read(n)).get('ids') or [])][:20]
            ids = [i for i in ids if i not in _sent]
            if not ids:
                return self._json(200, {'sent': 0})
            since = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()
            q = 'detections?select=id,ts,status,station,sound&id=in.(%s)&ts=gte.%s' % (','.join('"%s"' % urllib.parse.quote(i, safe='') for i in ids), urllib.parse.quote(since))
            rows = T.sb(q, key=T.PUBLISHABLE_KEY, token=token) or []   # through the user's own token: row security decides what is visible
            hits = [(r, T.threat_of(r.get('sound'))) for r in rows if r['status'] != 'rejected']
            hits = [(r, th) for r, th in hits if th][:5]
            if not hits:
                return self._json(200, {'sent': 0})
            for r, _ in hits:
                _sent[r['id']] = 1
            who = ''
            try:
                p = T.sb('profiles?select=display_name&id=eq.%s' % user['id']) or []
                who = (p[0].get('display_name') or '') if p else ''
            except Exception:
                pass
            sent = 0
            for chat, lang in recipients(user['id']):
                m = MSG.get(lang, MSG['ru'])
                lines = [m['head']]
                for r, th in hits:
                    t = T.parse_ts(r['ts']).astimezone(timezone(timedelta(hours=5))).strftime('%d.%m %H:%M')
                    lines.append('• %s · %s %d%% · %s%s' % (t, m[th[0]], round(th[1] * 100), (m['at'] + ' ' + T.esc(r['station'])) if r.get('station') else '', ''))
                if who:
                    lines.append('%s %s' % (m['from'], T.esc(who)))
                lines.append(m['foot'])
                if T.send(chat, '\n'.join(lines)).get('ok'):
                    sent += 1
            return self._json(200, {'sent': sent})
        except Exception:
            return self._json(500, {'error': 'failed'})

    def do_GET(self):
        return self._json(200, {'ok': True})
