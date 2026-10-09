"""Telegram webhook. Telegram calls this when someone writes to the bot.
/start <code>  connects this chat to the account that created the code in the app
/report        sends the report right now
/stop          turns the daily report off"""
from http.server import BaseHTTPRequestHandler
import hmac
import json
import urllib.parse

import _tg as T


def handle_update(upd):
    msg = upd.get('message') or {}
    chat = (msg.get('chat') or {}).get('id')
    text = (msg.get('text') or '').strip()
    if not chat or not text:
        return
    if text.startswith('/start'):
        parts = text.split(maxsplit=1)
        code = parts[1].strip() if len(parts) > 1 else ''
        if not code or not code.isalnum() or len(code) > 64:
            T.send(chat, T.TXT['ru']['help'] + '\n\n' + T.TXT['en']['help'])
            return
        rows = T.sb('telegram_links?select=user_id,lang&code=eq.%s&limit=1' % urllib.parse.quote(code)) or []
        if not rows:
            T.send(chat, T.TXT['ru']['badcode'] + '\n\n' + T.TXT['en']['badcode'])
            return
        r = rows[0]
        T.sb('telegram_links?user_id=eq.%s' % r['user_id'], method='PATCH', body={'chat_id': chat, 'code': None, 'enabled': True})
        T.send(chat, T.TXT.get(r['lang'], T.TXT['ru'])['connected'])
        return
    link = (T.sb('telegram_links?select=user_id,lang&chat_id=eq.%s&limit=1' % chat) or [None])[0]
    if text.startswith('/stop'):
        if link:
            T.sb('telegram_links?user_id=eq.%s' % link['user_id'], method='PATCH', body={'enabled': False})
            T.send(chat, T.TXT.get(link['lang'], T.TXT['ru'])['stopped'])
        else:
            T.send(chat, T.TXT['ru']['notlinked'] + '\n\n' + T.TXT['en']['notlinked'])
    elif text.startswith('/report'):
        if not link:
            T.send(chat, T.TXT['ru']['notlinked'] + '\n\n' + T.TXT['en']['notlinked'])
            return
        rep = T.build_report(link['user_id'], link['lang'])
        T.send(chat, rep or T.TXT.get(link['lang'], T.TXT['ru'])['none7'])


class handler(BaseHTTPRequestHandler):
    def _ok(self, code=200, body=b'ok'):
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        secret = T.env('TELEGRAM_WEBHOOK_SECRET')
        got = self.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
        if not secret or not hmac.compare_digest(got, secret):
            return self._ok(403, b'forbidden')
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if 0 < n < 100_000:
                handle_update(json.loads(self.rfile.read(n)))
        except Exception:
            pass   # always answer 200 so Telegram does not retry forever
        return self._ok()

    def do_GET(self):
        return self._ok(200, b'wetlandear telegram webhook')
