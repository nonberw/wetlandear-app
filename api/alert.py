"""Instant Telegram messages. The app calls this right after it syncs events that look like a gunshot or engine noise, or that match a species on
the person's watchlist. POST {ids: [event ids]} with the user's Supabase token. The server re-reads those events through the user's own token
(row security applies), decides what really is an alert, and writes to the user's Telegram chat and, in a team, to teammates with alerts on."""
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import tg as T  # noqa: E402
import actions as A  # noqa: E402

_sent = {}      # event id -> time, best effort per instance
_watch_sent = {}   # (chat, species) -> time
MSG = {
    'ru': {'head': '⚠ <b>Тревога WetlandEar</b>', 'gun': 'Возможный выстрел', 'engine': 'Шум двигателя', 'at': 'станция', 'foot': 'Это подсказка модели, прослушайте запись в приложении.', 'from': 'от',
           'whead': '🔔 <b>Список наблюдения</b>', 'wfoot': 'Прослушайте запись в приложении и подтвердите вид.', 'model': 'модель', 'yours': 'подтверждено'},
    'en': {'head': '⚠ <b>WetlandEar alert</b>', 'gun': 'Possible gunshot', 'engine': 'Engine noise', 'at': 'station', 'foot': 'This is a model hint, listen to the recording in the app.', 'from': 'from',
           'whead': '🔔 <b>Watchlist</b>', 'wfoot': 'Listen to the recording in the app and confirm the species.', 'model': 'model', 'yours': 'confirmed'},
}


def recipients(uid):
    """The person and, through teams, teammates with alerts on. Returns [(chat_id, lang, watch ids)]."""
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
        rows = []
        for cols in ('chat_id,lang,enabled,alerts,watch', 'chat_id,lang,enabled,alerts', 'chat_id,lang,enabled'):
            try:
                rows = T.sb('telegram_links?select=%s&user_id=eq.%s&limit=1' % (cols, i)) or []
                break
            except Exception:
                continue
        if rows and rows[0].get('chat_id') and rows[0].get('chat_id') not in seen:
            seen.add(rows[0]['chat_id'])
            watch = [w.get('id') for w in (rows[0].get('watch') or []) if isinstance(w, dict) and w.get('id')]
            out.append((rows[0]['chat_id'], rows[0].get('lang') or 'ru', watch, rows[0].get('alerts', True) is not False))
    return out


def watch_hits(rows, watch):
    """Events of a person's watched species: confirmed, or suggested by a model with enough confidence."""
    if not watch:
        return []
    out = []
    for r in rows:
        sid, conf, how = r.get('species'), 1.0, 'yours'
        sug = r.get('suggest') or {}
        if not sid or sid not in watch:
            sid = A.sug_id(sug) if sug else None
            conf, how = float(sug.get('conf') or 0) if sug else 0, 'model'
            if not sid or sid not in watch or conf < .35:
                continue
        if r['status'] == 'rejected':
            continue
        out.append((r, sid, conf, how))
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
            q = 'detections?select=id,ts,status,species,suggest,station,sound&id=in.(%s)&ts=gte.%s' % (','.join('"%s"' % urllib.parse.quote(i, safe='') for i in ids), urllib.parse.quote(since))
            rows = T.sb(q, key=T.PUBLISHABLE_KEY, token=token) or []   # through the user's own token: row security decides what is visible
            threats = [(r, T.threat_of(r.get('sound'))) for r in rows if r['status'] != 'rejected']
            threats = [(r, th) for r, th in threats if th][:5]
            recips = recipients(user['id'])
            plans = []   # (chat, lang, threat hits, watch hits)
            now = time.time()
            for chat, lang, watch, alerts_on in recips:
                wh = []
                for r, sid, conf, how in watch_hits(rows, watch):
                    key = (chat, sid)
                    if now - _watch_sent.get(key, 0) < 6 * 3600:
                        continue
                    wh.append((r, sid, conf, how)); _watch_sent[key] = now
                plans.append((chat, lang, threats if alerts_on else [], wh[:5]))
            if not any(t or w for _, _, t, w in plans):
                return self._json(200, {'sent': 0})
            for r in rows:
                _sent[r['id']] = 1
            who = ''
            try:
                p = T.sb('profiles?select=display_name&id=eq.%s' % user['id']) or []
                who = (p[0].get('display_name') or '') if p else ''
            except Exception:
                pass
            sent = 0
            for chat, lang, th_hits, w_hits in plans:
                m = MSG.get(lang, MSG['ru'])
                tz = timezone(timedelta(hours=5))
                if th_hits:
                    lines = [m['head']]
                    for r, th in th_hits:
                        t = T.parse_ts(r['ts']).astimezone(tz).strftime('%d.%m %H:%M')
                        lines.append('• %s · %s %d%% · %s' % (t, m[th[0]], round(th[1] * 100), (m['at'] + ' ' + T.esc(r['station'])) if r.get('station') else ''))
                    if who:
                        lines.append('%s %s' % (m['from'], T.esc(who)))
                    lines.append(m['foot'])
                    if T.send(chat, '\n'.join(lines)).get('ok'):
                        sent += 1
                if w_hits:
                    lines = [m['whead']]
                    for r, sid, conf, how in w_hits:
                        t = T.parse_ts(r['ts']).astimezone(tz).strftime('%d.%m %H:%M')
                        tail = m['yours'] if how == 'yours' else '%s %d%%' % (m['model'], round(conf * 100))
                        lines.append('• <b>%s</b> · %s · %s%s' % (T.esc(T.name_of(sid, lang)), t, tail, (' · ' + m['at'] + ' ' + T.esc(r['station'])) if r.get('station') else ''))
                    if who:
                        lines.append('%s %s' % (m['from'], T.esc(who)))
                    lines.append(m['wfoot'])
                    if T.send(chat, '\n'.join(lines)).get('ok'):
                        sent += 1
            return self._json(200, {'sent': sent})
        except Exception:
            return self._json(500, {'error': 'failed'})

    def do_GET(self):
        return self._json(200, {'ok': True})
