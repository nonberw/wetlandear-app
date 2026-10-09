"""WetlandEar MCP server (Model Context Protocol, Streamable HTTP, stateless JSON responses).
Lets an AI assistant (Claude Desktop, Claude Code, any MCP client) work with ONE user's own journal.
Auth: header  Authorization: Bearer we_...  a personal key created in the app (Profile > AI assistants). Only its SHA-256 hash is stored.
Add it:  claude mcp add --transport http wetlandear https://app.wetlandear.tech/mcp --header "Authorization: Bearer we_..." """
from http.server import BaseHTTPRequestHandler
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'lib'))
import tg as T  # noqa: E402
import actions as A  # noqa: E402
import report as R  # noqa: E402

VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05']
SERVER = {'name': 'wetlandear', 'version': '1.0.0'}
INSTRUCTIONS = ('WetlandEar is an acoustic bird monitoring journal for nature reserves. Species are suggestions by BirdNET and the WetlandEar model; '
                'only events with status "confirmed" were checked by a person. Times are UTC. You see and change only the key owner\'s own data.')


def obj(props, required=()):
    return {'type': 'object', 'properties': props, 'required': list(required), 'additionalProperties': False}


DAYS = {'type': 'integer', 'minimum': 1, 'maximum': 365, 'description': 'How many days back'}
LANG = {'type': 'string', 'enum': ['ru', 'en'], 'description': 'Language of species names and text (default en)'}
RO = {'readOnlyHint': True, 'openWorldHint': False}
WR = {'readOnlyHint': False, 'destructiveHint': False, 'idempotentHint': True, 'openWorldHint': False}

TOOLS = [
    ('get_overview', 'Short overview of the journal: events, confirmed events, pulse score, top species, alerts, stations.', obj({'days': DAYS, 'lang': LANG}), RO),
    ('list_events', 'List detected sound events with status (auto = not yet reviewed, confirmed, rejected), species, the model suggestion and station.',
     obj({'days': DAYS, 'status': {'type': 'string', 'enum': ['auto', 'confirmed', 'rejected']}, 'species': {'type': 'string', 'description': 'Species name in Russian or English'},
          'station': {'type': 'string'}, 'limit': {'type': 'integer', 'minimum': 1, 'maximum': 100}, 'lang': LANG}), RO),
    ('list_species', 'Species confirmed by a person in the last days, with counts and when each was last heard.', obj({'days': DAYS, 'lang': LANG}), RO),
    ('get_alerts', 'Possible gunshots and engine noise found in the recordings (model hints, not proof).', obj({'days': DAYS}), RO),
    ('morning_report', 'The same morning report the Telegram bot sends: who sang, new species, alerts, silent stations.', obj({'lang': LANG, 'hours': {'type': 'integer', 'minimum': 6, 'maximum': 168}}), RO),
    ('journal_summary', 'Structured summary of the last 120 days (species, hours, weeks, stations, alerts) for your own analysis.', obj({}), RO),
    ('next_to_review', 'Events waiting for review, those with a model suggestion first.', obj({'count': {'type': 'integer', 'minimum': 1, 'maximum': 20}, 'lang': LANG}), RO),
    ('review_event', 'Confirm or reject one event. To confirm without "species" the model suggestion is used. Always check with the person before confirming.',
     obj({'event_id': {'type': 'string'}, 'status': {'type': 'string', 'enum': ['confirmed', 'rejected', 'auto']}, 'species': {'type': 'string'}}, ['event_id', 'status']), WR),
    ('period_report', 'Facts for a report on a period, computed from the journal and compared with the previous period of the same length: totals, species with counts and first/last dates, new species, stations, silent stations, alerts, peak hour. Write the report text from this, do not invent numbers.',
     obj({'from_date': {'type': 'string', 'description': 'YYYY-MM-DD, local date (Astana)'}, 'to_date': {'type': 'string', 'description': 'YYYY-MM-DD, inclusive'}, 'lang': LANG}, ['from_date', 'to_date']), RO),
    ('export_occurrences', 'Confirmed observations of a period as CSV: Darwin Core (for GBIF) or eBird record format. Only species with a scientific name are included.',
     obj({'from_date': {'type': 'string'}, 'to_date': {'type': 'string'}, 'format': {'type': 'string', 'enum': ['dwc', 'ebird']}}, ['from_date', 'to_date']), RO),
    ('list_stations', 'The recording stations of this account.', obj({}), RO),
    ('add_station', 'Add a recording station.', obj({'name': {'type': 'string'}, 'lat': {'type': 'number'}, 'lon': {'type': 'number'}}, ['name']), {'readOnlyHint': False, 'destructiveHint': False, 'openWorldHint': False}),
    ('update_station', 'Rename a station or change its coordinates.', obj({'station_id': {'type': 'string'}, 'name': {'type': 'string'}, 'lat': {'type': 'number'}, 'lon': {'type': 'number'}}, ['station_id']), WR),
    ('remove_station', 'Delete a station entry (its recordings and events stay). Ask the person first.', obj({'station_id': {'type': 'string'}}, ['station_id']), {'readOnlyHint': False, 'destructiveHint': True, 'openWorldHint': False}),
]


def plain(html):
    return re.sub(r'<[^>]+>', '', (html or '').replace('<br>', '\n')).replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')


def call(uid, name, a):
    lang = 'ru' if a.get('lang') == 'ru' else 'en'
    days = int(a.get('days') or 7)
    if name == 'get_overview':
        rows = [r for r in T.fetch_rows(uid, days) if r['status'] != 'rejected']
        conf = [r for r in rows if r['status'] == 'confirmed']
        return {'days': days, 'events': len(rows), 'confirmed': len(conf), 'unreviewed': len([r for r in rows if r['status'] == 'auto']), 'pulse': T.pulse_for(rows),
                'top_species': A.species_list(uid, days, lang)[:8], 'alerts': len([r for r in rows if T.threat_of(r.get('sound'))]), 'stations': len(A.stations(uid))}
    if name == 'list_events':
        return A.detections(uid, days, a.get('status'), a.get('species'), a.get('station'), a.get('limit') or 20, lang)
    if name == 'list_species':
        return A.species_list(uid, int(a.get('days') or 30), lang)
    if name == 'get_alerts':
        return A.alerts(uid, days)
    if name == 'morning_report':
        return plain(T.build_report(uid, lang, int(a.get('hours') or 24))) or 'No events in the last 7 days.'
    if name == 'journal_summary':
        return A.journal_summary(uid)
    if name == 'next_to_review':
        rows, total = A.review_queue(uid, int(a.get('count') or 5))
        return {'waiting_total': total, 'events': [A.det_view(r, lang) for r in rows]}
    if name == 'review_event':
        return A.review(uid, str(a.get('event_id', '')), a.get('status'), a.get('species'))
    if name in ('period_report', 'export_occurrences'):
        from datetime import timedelta
        try:
            fa = datetime.strptime(str(a.get('from_date')), '%Y-%m-%d').replace(tzinfo=R.TZ)
            tb = datetime.strptime(str(a.get('to_date')), '%Y-%m-%d').replace(tzinfo=R.TZ) + timedelta(days=1)
        except ValueError:
            return 'Dates must look like 2026-09-01.'
        if not 0 < (tb - fa).days <= 366:
            return 'The period must be between 1 and 366 days.'
        if name == 'period_report':
            return R.markdown(R.period_data(uid, fa, tb), lang)
        who = ((T.sb('profiles?select=display_name&id=eq.%s' % uid) or [{}])[0] or {}).get('display_name') or ''
        csv_text, n, skipped = A.occurrences(uid, fa, tb, a.get('format') or 'dwc', who)
        return '%d records exported, %d skipped (no scientific name).\n\n%s' % (n, skipped, csv_text)
    if name == 'list_stations':
        return A.stations(uid)
    if name == 'add_station':
        return A.add_station(uid, a.get('name'), a.get('lat'), a.get('lon'))
    if name == 'update_station':
        return A.update_station(uid, str(a.get('station_id', '')), a.get('name'), a.get('lat'), a.get('lon'))
    if name == 'remove_station':
        return A.remove_station(uid, str(a.get('station_id', '')))
    raise KeyError(name)


def rpc(uid, m):
    method, mid, p = m.get('method'), m.get('id'), m.get('params') or {}
    def ok(res): return {'jsonrpc': '2.0', 'id': mid, 'result': res}
    def err(code, msg): return {'jsonrpc': '2.0', 'id': mid, 'error': {'code': code, 'message': msg}}
    if mid is None:
        return None   # notification
    if method == 'initialize':
        v = p.get('protocolVersion')
        return ok({'protocolVersion': v if v in VERSIONS else VERSIONS[0], 'capabilities': {'tools': {'listChanged': False}}, 'serverInfo': SERVER, 'instructions': INSTRUCTIONS})
    if method == 'ping':
        return ok({})
    if method == 'tools/list':
        return ok({'tools': [{'name': n, 'description': d, 'inputSchema': s, 'annotations': an} for n, d, s, an in TOOLS]})
    if method == 'tools/call':
        name, args = p.get('name'), p.get('arguments') or {}
        if name not in [t[0] for t in TOOLS]:
            return err(-32602, 'unknown tool')
        try:
            res = call(uid, name, args if isinstance(args, dict) else {})
            return ok({'content': [{'type': 'text', 'text': res if isinstance(res, str) else json.dumps(res, ensure_ascii=False, indent=1)}], 'isError': False})
        except Exception as e:
            return ok({'content': [{'type': 'text', 'text': 'Tool failed: %s' % type(e).__name__}], 'isError': True})
    return err(-32601, 'method not found')


def user_of_key(key):
    if not re.fullmatch(r'we_[A-Za-z0-9_\-]{30,80}', key or ''):
        return None
    h = hashlib.sha256(key.encode()).hexdigest()
    try:
        rows = T.sb('api_tokens?select=user_id&token_hash=eq.%s&limit=1' % h) or []
    except Exception:
        return None
    if not rows:
        return None
    try:
        T.sb('api_tokens?token_hash=eq.%s' % h, method='PATCH', body={'last_used': datetime.now(timezone.utc).isoformat()})
    except Exception:
        pass
    return rows[0]['user_id']


class handler(BaseHTTPRequestHandler):
    def _send(self, code, body=b'', ctype='application/json', extra=None):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):   # no server-initiated stream
        return self._send(405, b'{"error":"use POST"}', extra={'Allow': 'POST'})

    def do_DELETE(self):
        return self._send(405, b'', extra={'Allow': 'POST'})

    def do_POST(self):
        auth = self.headers.get('Authorization', '')
        uid = user_of_key(auth[7:].strip()) if auth.startswith('Bearer ') else None
        if not uid:
            return self._send(401, b'{"error":"missing or invalid key: create one in the app, Profile > AI assistants"}', extra={'WWW-Authenticate': 'Bearer realm="wetlandear"'})
        try:
            n = int(self.headers.get('Content-Length', '0'))
            if not 0 < n < 100_000:
                return self._send(413, b'{"error":"size"}')
            msg = json.loads(self.rfile.read(n))
        except Exception:
            return self._send(400, json.dumps({'jsonrpc': '2.0', 'id': None, 'error': {'code': -32700, 'message': 'parse error'}}).encode())
        batch = isinstance(msg, list)
        out = [r for r in (rpc(uid, m) for m in (msg if batch else [msg]) if isinstance(m, dict)) if r is not None]
        if not out:
            return self._send(202)
        return self._send(200, json.dumps(out if batch else out[0], ensure_ascii=False).encode('utf-8'))
