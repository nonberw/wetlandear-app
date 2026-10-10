"""Public pages: GET /api/public?t=TOKEN[&lang=ru|en|kk] returns the sanitised summary; &clip=DETECTION_ID returns the audio of one recording.
No sign-in. The token is the key to one page its owner created and can switch off at any time (public_pages.enabled)."""
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import pub as P  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype, cache='no-store'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', cache)
        self.send_header('X-Robots-Tag', 'noindex')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj, cache='no-store'):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8', cache)

    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        try:
            page = P.page_by_token((q.get('t') or [''])[0])
            if not page:
                return self._json(404, {'error': 'not found'})
            clip = (q.get('clip') or [''])[0]
            if clip:
                if not page.get('show_clip'):
                    return self._json(404, {'error': 'not found'})
                d = P.det_in_scope(page, clip)
                data = P.clip_bytes(d['user_id'], d['id']) if d else None
                if not data:
                    return self._json(404, {'error': 'not found'})
                return self._send(200, data, 'audio/wav', 'public, max-age=3600')
            lang = (q.get('lang') or ['ru'])[0]
            return self._json(200, P.view(page, lang if lang in ('ru', 'en', 'kk') else 'ru'), 'public, s-maxage=300')
        except Exception:
            return self._json(500, {'error': 'failed'})
