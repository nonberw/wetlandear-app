"""Morning report. Vercel Cron calls GET /api/morning every day at 02:00 UTC (07:00 in Astana) with the CRON_SECRET.
A signed-in user can also POST here to send a test report to their own connected chat."""
from http.server import BaseHTTPRequestHandler
import hmac
import json

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import tg as T  # noqa: E402
import report as R  # noqa: E402
import brief as B  # noqa: E402
from datetime import datetime, timezone


def send_digest(link, kind, with_pdf):
    """Weekly (Monday) or monthly (1st) digest. The previous period of the same kind is used for comparison."""
    uid, lang, chat = link['user_id'], link['lang'], link['chat_id']
    a, b = R.week_window() if kind == 'week' else R.month_window()
    d = R.period_data(uid, a, b)
    if not d['events']:
        return False
    ok = T.send(chat, R.digest_text(d, lang, kind)).get('ok')
    if with_pdf and ok:
        who = ''
        try:
            who = ((T.sb('profiles?select=display_name,organization&id=eq.%s' % uid) or [{}])[0] or {})
            who = ', '.join(x for x in (who.get('display_name'), who.get('organization')) if x)
        except Exception:
            pass
        pdf = R.make_pdf(d, lang, who, kind)
        name = 'wetlandear-%s-%s.pdf' % (kind, a.strftime('%Y-%m-%d'))
        cap = R.W.get(lang, R.W['ru'])['caption'].format(p='%s – %s' % (a.strftime('%d.%m'), (b - R.timedelta(days=1)).strftime('%d.%m.%Y')))
        T.send_document(chat, pdf, name, cap)
    return bool(ok)


def send_brief(uid, lang, chat, email_on):
    """The weekly brief to Telegram (if connected) and by e-mail (if the person switched it on and the service is configured). Returns (telegram_sent, mail_sent)."""
    b = B.build(uid, lang)
    if not b:
        return False, False
    head, tg, em = b
    tsent = bool(chat and T.send(chat, tg).get('ok'))
    msent = False
    if email_on and B.mail_configured():
        to = B.user_email(uid)
        msent = bool(to and B.send_mail(to, head, em))
    return tsent, msent


def run_briefs(links):
    """Every Monday: Telegram users and everyone with the e-mail switch on."""
    want = {l['user_id']: {'lang': l['lang'], 'chat': l['chat_id'], 'mail': False} for l in links}
    try:
        for p in T.sb('profiles?select=id&digest_email=eq.true&limit=1000') or []:
            want.setdefault(p['id'], {'lang': 'ru', 'chat': None, 'mail': False})['mail'] = True
    except Exception:
        pass   # the database update 008 is not applied yet
    tg = ml = 0
    for uid, w in want.items():
        try:
            a, b = send_brief(uid, w['lang'], w['chat'], w['mail'])
            tg += a
            ml += b
        except Exception:
            pass
    return {'briefs_telegram': tg, 'briefs_email': ml}


def run_all():
    links = T.sb('telegram_links?select=user_id,chat_id,lang&enabled=eq.true&chat_id=not.is.null&limit=1000') or []
    sent = skipped = failed = digests = 0
    today = R.local_midnight(datetime.now(timezone.utc))
    for l in links:
        try:
            rep = T.build_report(l['user_id'], l['lang'])
            if not rep:
                skipped += 1
                continue
            res = T.send(l['chat_id'], rep)
            if res.get('ok'):
                sent += 1
                try:
                    if today.day == 1:
                        digests += send_digest(l, 'month', True)
                except Exception:
                    pass
            else:
                failed += 1
                if res.get('error_code') in (400, 403):   # chat gone or bot blocked: stop trying
                    T.sb('telegram_links?user_id=eq.%s' % l['user_id'], method='PATCH', body={'enabled': False})
        except Exception:
            failed += 1
    res = {'links': len(links), 'sent': sent, 'skipped': skipped, 'failed': failed, 'digests': digests}
    if today.weekday() == 0:
        res.update(run_briefs(links))
    return res


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
        secret = T.env('CRON_SECRET').strip()
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
            n = int(self.headers.get('Content-Length', '0') or 0)
            req = json.loads(self.rfile.read(n)) if 0 < n < 1000 else {}
            if req.get('kind') == 'brief':
                on = False
                try:
                    on = bool((T.sb('profiles?select=digest_email&id=eq.%s&limit=1' % user['id']) or [{}])[0].get('digest_email'))
                except Exception:
                    pass
                tsent, msent = send_brief(user['id'], rows[0]['lang'], rows[0]['chat_id'], on)
                return self._json(200, {'sent': tsent, 'email': msent, 'email_configured': B.mail_configured()})
            if req.get('kind') in ('week', 'month'):
                link = {'user_id': user['id'], 'lang': rows[0]['lang'], 'chat_id': rows[0]['chat_id']}
                return self._json(200, {'sent': send_digest(link, req['kind'], bool(req.get('pdf')))})
            rep = T.build_report(user['id'], rows[0]['lang'])
            T.send(rows[0]['chat_id'], rep or T.TXT.get(rows[0]['lang'], T.TXT['ru'])['none7'])
            return self._json(200, {'sent': bool(rep)})
        except Exception:
            return self._json(500, {'error': 'failed'})
