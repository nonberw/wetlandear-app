"""Ask the journal in plain language. POST {question, lang} with the user's Supabase token.
The server builds a small summary of that user's own journal (never audio) and asks Claude to answer from it.
Needs the ANTHROPIC_API_KEY environment variable in Vercel (set by the owner)."""
from http.server import BaseHTTPRequestHandler
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import tg as T  # noqa: E402
import actions as A  # noqa: E402


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
            if not A.allow_ask(user['id']):
                return self._json(429, {'error': 'daily limit'})
            text, err = A.ask_claude(q, A.journal_summary(user['id'], auth[7:].strip()), lang)
            if err == 'not configured':
                return self._json(503, {'error': 'not configured'})
            if err:
                return self._json(502, {'error': err})
            return self._json(200, {'answer': text})
        except Exception:
            return self._json(500, {'error': 'failed'})
