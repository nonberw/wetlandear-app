"""Telegram webhook. Telegram calls this when someone writes to the bot.
Commands live in lib/bot.py: /start <code> links the chat to an account, then the person manages their own journal from the chat."""
from http.server import BaseHTTPRequestHandler
import hmac
import json
import urllib.parse

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import tg as T  # noqa: E402
import bot  # noqa: E402


class handler(BaseHTTPRequestHandler):
    def _ok(self, code=200, body=b'ok'):
        self.send_response(code)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        got = self.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
        ok = False
        for secret in (T.webhook_secret(), T.env('TELEGRAM_WEBHOOK_SECRET')):
            if secret and hmac.compare_digest(got, secret):
                ok = True
        if not ok:
            return self._ok(403, b'forbidden')
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if 0 < n < 100_000:
                bot.handle_update(json.loads(self.rfile.read(n)))
        except Exception:
            pass   # always answer 200 so Telegram does not retry forever
        return self._ok()

    def do_GET(self):
        return self._ok(200, b'wetlandear telegram webhook')
