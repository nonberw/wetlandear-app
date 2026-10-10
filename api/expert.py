"""Expert review by link, no registration.
GET  /api/expert?t=TOKEN            the question, the model's candidates and the date of the recording
GET  /api/expert?t=TOKEN&clip=1     the audio (wav)
POST /api/expert {t, verdict, pick, species, comment, name}   the expert's answer, accepted once
verdict: "pick" (one of the candidates, index in pick), "other" (own species name), "reject" (not a bird or unusable), "unsure".
The owner sees the answer in the app and decides whether to apply it to the journal."""
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import urllib.parse
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import pub as P  # noqa: E402
import tg as T  # noqa: E402


def _token(s):
    t = ''.join(c for c in str(s) if c.isalnum())[:64]
    return t if len(t) >= 20 else ''


def _request(token):
    rows = T.sb('expert_requests?select=*&token=eq.%s&limit=1' % token) or [] if token else []
    return rows[0] if rows else None


def _expired(r):
    return T.parse_ts(r['expires_at']) < datetime.now(timezone.utc)


def _clean(s, n):
    return ' '.join(str(s or '').split())[:n]


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype, cache='no-store'):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', cache)
        self.send_header('X-Robots-Tag', 'noindex')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')

    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        try:
            r = _request(_token((q.get('t') or [''])[0]))
            if not r:
                return self._json(404, {'error': 'not found'})
            if (q.get('clip') or [''])[0]:
                data = None if _expired(r) else P.clip_bytes(r['owner'], r['det_id'])
                return self._send(200, data, 'audio/wav') if data else self._json(404, {'error': 'no audio'})
            det = (T.sb('detections?select=ts&id=eq.%s&limit=1' % urllib.parse.quote(r['det_id'], safe='')) or [{}])[0]
            who = (T.sb('profiles?select=organization&id=eq.%s&limit=1' % r['owner']) or [{}])[0].get('organization') or ''
            return self._json(200, {'question': r.get('question') or '', 'candidates': r.get('candidates') or [], 'ts': (det.get('ts') or '')[:16], 'from': who,
                                    'status': r['status'], 'expired': _expired(r), 'answered': r['status'] == 'answered'})
        except Exception:
            return self._json(500, {'error': 'failed'})

    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length', '0') or 0)
            if not 0 < n < 4000:
                return self._json(413, {'error': 'size'})
            b = json.loads(self.rfile.read(n))
            r = _request(_token(b.get('t', '')))
            if not r:
                return self._json(404, {'error': 'not found'})
            if _expired(r):
                return self._json(410, {'error': 'expired'})
            if r['status'] == 'answered':
                return self._json(409, {'error': 'already answered'})
            verdict = b.get('verdict')
            if verdict not in ('pick', 'other', 'reject', 'unsure'):
                return self._json(400, {'error': 'verdict'})
            ans = {'verdict': verdict, 'comment': _clean(b.get('comment'), 400), 'name': _clean(b.get('name'), 80)}
            if verdict == 'pick':
                i = int(b.get('pick', -1))
                cands = r.get('candidates') or []
                if not 0 <= i < len(cands):
                    return self._json(400, {'error': 'pick'})
                ans['pick'] = i
                ans['species'] = cands[i].get('common') or cands[i].get('sci') or ''
                ans['sci'] = cands[i].get('sci') or ''
            elif verdict == 'other':
                ans['species'] = _clean(b.get('species'), 80)
                if len(ans['species']) < 2:
                    return self._json(400, {'error': 'species'})
            T.sb('expert_requests?id=eq.%s&status=eq.open' % r['id'], method='PATCH', body={'status': 'answered', 'answer': ans, 'answered_at': datetime.now(timezone.utc).isoformat()})
            return self._json(200, {'ok': True})
        except Exception:
            return self._json(500, {'error': 'failed'})
