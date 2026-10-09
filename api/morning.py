"""Morning report. Vercel Cron calls GET /api/morning every day at 02:00 UTC (07:00 in Astana) with the CRON_SECRET.
A signed-in user can also POST here to send a test report to their own connected chat."""
from http.server import BaseHTTPRequestHandler
import hmac
import json

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import tg as T  # noqa: E402


def run_all():
    links = T.sb('telegram_links?select=user_id,chat_id,lang&enabled=eq.true&chat_id=not.is.null&limit=1000') or []
    sent = skipped = failed = 0
    for l in links:
        try:
            rep = T.build_report(l['user_id'], l['lang'])
            if not rep:
                skipped += 1
                continue
            res = T.send(l['chat_id'], rep)
            if res.get('ok'):
                sent += 1
            else:
                failed += 1
                if res.get('error_code') in (400, 403):   # chat gone or bot blocked: stop trying
                    T.sb('telegram_links?user_id=eq.%s' % l['user_id'], method='PATCH', body={'enabled': False})
        except Exception:
            failed += 1
    return {'links': len(links), 'sent': sent, 'skipped': skipped, 'failed': failed}


class handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        secret = T.env('CRON_SECRET')
        got = self.headers.get('Authorization', '')
        if not secret or not hmac.compare_digest(got, 'Bearer ' + secret):
            return self._json(401, {'error': 'unauthorized'})
        return self._json(200, run_all())

    def do_POST(self):
        auth = self.headers.get('Authorization', '')
        user = T.user_from_token(auth[7:].strip()) if auth.startswith('Bearer ') else None
        if not user or not user.get('id'):
            return self._json(401, {'error': 'sign in required'})
        try:
            rows = T.sb('telegram_links?select=chat_id,lang&user_id=eq.%s&limit=1' % user['id']) or []
            if not rows or not rows[0].get('chat_id'):
                return self._json(409, {'error': 'telegram not connected'})
            rep = T.build_report(user['id'], rows[0]['lang'])
            T.send(rows[0]['chat_id'], rep or T.TXT.get(rows[0]['lang'], T.TXT['ru'])['none7'])
            return self._json(200, {'sent': bool(rep)})
        except Exception:
            return self._json(500, {'error': 'failed'})
