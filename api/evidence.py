"""Evidence log API.
POST {det_id, lang}                  (signed in)  fix an event: the server hashes the stored audio, collects the data and the weather and appends a record to the hash chain
GET  ?id=ID&pdf=1&lang=ru            (signed in)  the PDF record
GET  ?id=ID&wav=1                    (signed in)  the audio, only if it still has the recorded hash
GET  ?verify=ID                      (public)     does this record verify: chain_ok and audio_ok (no content is returned)
GET  ?verify=chain                   (signed in)  verify the whole chain of the caller
Records are read with the caller's own token, so row level security decides who sees what (the owner and their team)."""
from http.server import BaseHTTPRequestHandler
import json
import os
import sys
import urllib.parse

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import evidence as E  # noqa: E402
import pub as P  # noqa: E402
import tg as T  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Robots-Tag', 'noindex')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')

    def _user(self):
        auth = self.headers.get('Authorization', '')
        tok = auth[7:].strip() if auth.startswith('Bearer ') else ''
        u = T.user_from_token(tok) if tok else None
        return (u, tok) if u and u.get('id') else (None, None)

    def _row(self, rid, tok):
        """One evidence record through the caller's own token (row level security)."""
        rid = ''.join(c for c in str(rid) if c.isalnum() or c == '-')[:40]
        rows = T.sb('evidence_log?select=*&id=eq.%s&limit=1' % rid, key=T.PUBLISHABLE_KEY, token=tok) or []
        return rows[0] if rows else None

    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        g = lambda k: (q.get(k) or [''])[0]
        try:
            v = g('verify')
            if v and v != 'chain':
                rid = ''.join(c for c in v if c.isalnum() or c == '-')[:40]
                rows = T.sb('evidence_log?select=*&id=eq.%s&limit=1' % rid) or []
                if not rows:
                    return self._json(404, {'error': 'not found'})
                c_ok, a_ok = E.verify_row(rows[0])
                return self._json(200, {'chain_ok': c_ok, 'audio_ok': a_ok, 'seq': rows[0]['seq'], 'registered_at': rows[0]['created_at']})
            user, tok = self._user()
            if not user:
                return self._json(401, {'error': 'sign in required'})
            if v == 'chain':
                return self._json(200, E.verify_chain(user['id']))
            row = self._row(g('id'), tok)
            if not row:
                return self._json(404, {'error': 'not found'})
            if g('pdf'):
                return self._send(200, E.make_pdf(row, g('lang') if g('lang') in ('ru', 'en') else 'ru'), 'application/pdf', {'Content-Disposition': 'attachment; filename="wetlandear-evidence-%d.pdf"' % row['seq']})
            if g('wav'):
                audio = P.clip_bytes(row['owner'], row['det_id'])
                if not audio or E.sha256_hex(audio) != row['audio_sha256']:
                    return self._json(409, {'error': 'audio missing or changed'})
                return self._send(200, audio, 'audio/wav', {'Content-Disposition': 'attachment; filename="wetlandear-evidence-%d.wav"' % row['seq']})
            return self._json(400, {'error': 'nothing requested'})
        except Exception:
            return self._json(500, {'error': 'failed'})

    def do_POST(self):
        try:
            user, tok = self._user()
            if not user:
                return self._json(401, {'error': 'sign in required'})
            n = int(self.headers.get('Content-Length', '0') or 0)
            if not 0 < n < 2000:
                return self._json(413, {'error': 'size'})
            b = json.loads(self.rfile.read(n))
            det_id = ''.join(c for c in str(b.get('det_id', '')) if c.isalnum() or c in '-_')[:80]
            lang = b.get('lang') if b.get('lang') in ('ru', 'en') else 'ru'
            dets = T.sb('detections?select=*&id=eq.%s&limit=1' % det_id, key=T.PUBLISHABLE_KEY, token=tok) or []   # row level security: only what this person may see
            if not dets:
                return self._json(404, {'error': 'event not found'})
            det = dets[0]
            exist = T.sb('evidence_log?select=id,seq,chain_hash,audio_sha256&owner=eq.%s&det_id=eq.%s&limit=1' % (det['user_id'], det_id)) or []
            if exist:
                return self._json(200, dict(exist[0], existing=True))
            audio = P.clip_bytes(det['user_id'], det_id)
            if not audio:
                return self._json(409, {'error': 'audio not uploaded yet'})
            prof = lambda uid: ((T.sb('profiles?select=display_name&id=eq.%s&limit=1' % uid) or [{}])[0] or {}).get('display_name') or ''
            payload = E.build_payload(det, prof(user['id']), prof(det['user_id']), len(audio), lang)
            rec = T.sb('evidence_log', method='POST', body={'owner': det['user_id'], 'det_id': det_id, 'payload_text': E.canonical(payload), 'audio_sha256': E.sha256_hex(audio)}, prefer='return=representation')
            r = (rec or [{}])[0]
            return self._json(200, {'id': r.get('id'), 'seq': r.get('seq'), 'chain_hash': r.get('chain_hash'), 'audio_sha256': r.get('audio_sha256')})
        except Exception as e:
            code = 503 if 'evidence_log' in str(e) or '404' in str(e) else 500
            return self._json(code, {'error': 'failed'})
