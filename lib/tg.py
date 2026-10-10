"""Shared helpers for the Telegram morning report (not a function itself: files starting with _ are not deployed as routes).
Secrets come from environment variables set in Vercel: TELEGRAM_BOT_TOKEN, SUPABASE_SECRET_KEY, TELEGRAM_WEBHOOK_SECRET, CRON_SECRET."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

SUPABASE_URL = 'https://vflyedmortnampzdenpf.supabase.co'
PUBLISHABLE_KEY = 'sb_publishable_PnI4L7VszIqaFrWHnvbHRg_dyB3ZeVn'

SPECIES = {  # id: (ru, en), same ids as the app
    'pho_ros': ('Фламинго розовый', 'Greater Flamingo'), 'pel_cri': ('Кудрявый пеликан', 'Dalmatian Pelican'), 'pel_ono': ('Розовый пеликан', 'Great White Pelican'),
    'ant_vir': ('Журавль-красавка', 'Demoiselle Crane'), 'gru_gru': ('Серый журавль', 'Common Crane'), 'cyg_cyg': ('Лебедь-кликун', 'Whooper Swan'),
    'ans_ans': ('Серый гусь', 'Greylag Goose'), 'ans_ery': ('Пискулька', 'Lesser White-fronted Goose'), 'tad_fer': ('Огарь', 'Ruddy Shelduck'),
    'lar_ich': ('Черноголовый хохотун', "Pallas's Gull"), 'chl_hyb': ('Белощёкая крачка', 'Whiskered Tern'), 'pod_cri': ('Большая поганка', 'Great Crested Grebe'),
    'ful_atr': ('Лысуха', 'Eurasian Coot'), 'van_van': ('Чибис', 'Northern Lapwing'), 'aro_aru': ('Дроздовидная камышевка', 'Great Reed Warbler'),
    'lus_sve': ('Варакушка', 'Bluethroat'), 'ala_arv': ('Полевой жаворонок', 'Eurasian Skylark'), 'mel_yel': ('Чёрный жаворонок', 'Black Lark'),
}
TXT = {
    'ru': {
        'title': 'Утро в заповеднике', 'day': 'за сутки', 'week': 'за 7 дней', 'pulse': 'Пульс', 'pulse_none': 'Пульс: нет данных', 'events': 'События', 'conf': 'подтверждено человеком',
        'who': 'Кто пел', 'nobody': 'Подтверждённых видов нет', 'new': 'Первые обнаружения', 'nonew': 'Новых видов нет', 'alerts': 'Тревоги', 'noalerts': 'Тревог нет', 'silent': 'Молчат станции',
        'silent_hint': 'Стоит проверить питание и связь.', 'gun': 'Возможный выстрел', 'engine': 'Шум двигателя', 'hint': 'Подсказка модели, прослушайте запись.', 'foot': 'Виды подсказывает BirdNET, подтверждает человек.',
        'higher': 'на {n} выше', 'lower': 'на {n} ниже', 'same': 'без изменений', 'none7': 'За последние 7 дней событий нет, отчёт не отправлен.',
        'connected': 'Готово! Каждое утро в 07:00 (Астана) я буду присылать сюда отчёт. Команды: /report сейчас, /stop отключить.', 'stopped': 'Отчёты отключены. Включить снова можно в приложении.',
        'badcode': 'Код не найден или устарел. Откройте приложение: Профиль → Утренний отчёт в Telegram.', 'help': 'Это бот WetlandEar. Подключите его в приложении: Профиль → Утренний отчёт в Telegram.',
        'notlinked': 'Этот чат не подключён. Подключите его в приложении.', 'test': 'Тестовый отчёт'},
    'en': {
        'title': 'Morning at the reserve', 'day': 'last 24 hours', 'week': 'last 7 days', 'pulse': 'Pulse', 'pulse_none': 'Pulse: no data', 'events': 'Events', 'conf': 'confirmed by a person',
        'who': 'Who sang', 'nobody': 'No confirmed species', 'new': 'First detections', 'nonew': 'No new species', 'alerts': 'Alerts', 'noalerts': 'No alerts', 'silent': 'Silent stations',
        'silent_hint': 'Check the power and connection.', 'gun': 'Possible gunshot', 'engine': 'Engine noise', 'hint': 'Model hint, listen to the recording.', 'foot': 'Species are suggested by BirdNET and confirmed by a person.',
        'higher': '{n} higher', 'lower': '{n} lower', 'same': 'no change', 'none7': 'No events in the last 7 days, report not sent.',
        'connected': 'Done! Every morning at 07:00 (Astana) I will send the report here. Commands: /report now, /stop turn off.', 'stopped': 'Reports turned off. You can turn them on again in the app.',
        'badcode': 'Code not found or expired. Open the app: Profile → Morning report in Telegram.', 'help': 'This is the WetlandEar bot. Connect it in the app: Profile → Morning report in Telegram.',
        'notlinked': 'This chat is not connected. Connect it in the app.', 'test': 'Test report'},
}


def env(name):
    return os.environ.get(name, '')


def webhook_secret():
    """Derived from the bot token, so nobody has to invent or store a separate webhook secret. Empty if the token is not set."""
    import hashlib
    tok = env('TELEGRAM_BOT_TOKEN').strip()
    return hashlib.sha256((tok + ':wetlandear-webhook').encode()).hexdigest()[:48] if tok else ''


def sb(path, method='GET', body=None, key=None, token=None, prefer=None):
    """Supabase REST call. With the secret key it bypasses row security, so only use it for the owner of the data."""
    k = key or env('SUPABASE_SECRET_KEY').strip()
    headers = {'apikey': k, 'Authorization': 'Bearer ' + (token or k), 'Content-Type': 'application/json'}
    if prefer:
        headers['Prefer'] = prefer
    req = urllib.request.Request(SUPABASE_URL + '/rest/v1/' + path, method=method, headers=headers, data=(json.dumps(body).encode() if body is not None else None))
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def user_from_token(token):
    req = urllib.request.Request(SUPABASE_URL + '/auth/v1/user', headers={'apikey': PUBLISHABLE_KEY, 'Authorization': 'Bearer ' + token})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except Exception:
        return None


def tg(method, payload):
    token = env('TELEGRAM_BOT_TOKEN').strip()
    req = urllib.request.Request('https://api.telegram.org/bot%s/%s' % (token, method), method='POST', headers={'Content-Type': 'application/json'}, data=json.dumps(payload).encode())
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {'ok': False, 'error_code': e.code}
    except Exception:
        return {'ok': False}


def send(chat_id, text):
    return tg('sendMessage', {'chat_id': chat_id, 'text': text, 'parse_mode': 'HTML', 'disable_web_page_preview': True})


def send_document(chat_id, data, filename, caption=''):
    """Telegram sendDocument as multipart/form-data."""
    import uuid
    b = uuid.uuid4().hex
    parts = []
    for k, v in (('chat_id', str(chat_id)), ('caption', caption), ('parse_mode', 'HTML')):
        parts.append(('--%s\r\nContent-Disposition: form-data; name="%s"\r\n\r\n%s\r\n' % (b, k, v)).encode('utf-8'))
    parts.append(('--%s\r\nContent-Disposition: form-data; name="document"; filename="%s"\r\nContent-Type: application/pdf\r\n\r\n' % (b, filename)).encode('utf-8'))
    parts.append(data)
    parts.append(('\r\n--%s--\r\n' % b).encode())
    token = env('TELEGRAM_BOT_TOKEN').strip()
    req = urllib.request.Request('https://api.telegram.org/bot%s/sendDocument' % token, method='POST', data=b''.join(parts), headers={'Content-Type': 'multipart/form-data; boundary=' + b})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {'ok': False, 'error_code': e.code}
    except Exception:
        return {'ok': False}


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


_RU = None


def ru_names():
    """English common name -> Russian, from the same file the app uses (js/species-ru.js)."""
    global _RU
    if _RU is None:
        try:
            p = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'js', 'species-ru.js')
            js = open(p, encoding='utf-8').read()
            _RU = json.loads(js[js.index('{'):js.rindex('}') + 1])
        except Exception:
            _RU = {}
    return _RU


def name_of(sid, lang):
    if sid in SPECIES:
        return SPECIES[sid][0 if lang == 'ru' else 1]
    en = str(sid)[2:] if str(sid).startswith('x:') else str(sid)
    return ru_names().get(en, en) if lang == 'ru' else en


def threat_of(sound):
    g = (sound or {}).get('groups') or {}
    if g.get('gun', 0) >= .35:
        return 'gun', g['gun']
    if g.get('engine', 0) >= .3 and g.get('animal', 0) < .5:
        return 'engine', g['engine']
    return None


def pulse_for(rows):
    """Same formula as the app: diversity 40, activity 30, trust 30."""
    if not rows:
        return None
    conf = [r for r in rows if r['status'] == 'confirmed']
    spp = {r['species'] for r in conf if r.get('species')}
    a = min(len(spp) / 10, 1) * 40
    b = min(len(rows) / 60, 1) * 30
    c = len(conf) / len(rows) * 30
    return round(a + b + c)


def parse_ts(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def fetch_rows(user_id, days, token=None):
    """With a user token the database applies row security (the user sees only their own rows); without it the secret key is used."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    q = 'detections?select=ts,status,species,station,sound&user_id=eq.%s&ts=gte.%s&order=ts.desc&limit=20000' % (user_id, urllib.parse.quote(since))
    return (sb(q, key=PUBLISHABLE_KEY, token=token) if token else sb(q)) or []


def first_seen(user_id):
    q = 'detections?select=species,ts&user_id=eq.%s&status=eq.confirmed&species=not.is.null&order=ts.asc&limit=20000' % user_id
    out = {}
    for r in sb(q) or []:
        out.setdefault(r['species'], r['ts'])
    return out


def build_report(user_id, lang='ru', hours=24, rows=None, firsts=None, now=None):
    """Plain data in, Telegram HTML out. rows/firsts/now can be passed in for testing."""
    t = TXT.get(lang, TXT['ru'])
    now = now or datetime.now(timezone.utc)
    rows = rows if rows is not None else fetch_rows(user_id, 60)
    firsts = firsts if firsts is not None else first_seen(user_id)
    live = [r for r in rows if r['status'] != 'rejected']
    w0 = now - timedelta(hours=hours)
    cur = [r for r in live if w0 <= parse_ts(r['ts']) <= now]
    prev = [r for r in live if w0 - timedelta(hours=hours) <= parse_ts(r['ts']) < w0]
    if not [r for r in live if parse_ts(r['ts']) >= now - timedelta(days=7)]:
        return None
    counts = {}
    for r in cur:
        if r['status'] == 'confirmed' and r.get('species'):
            counts[r['species']] = counts.get(r['species'], 0) + 1
    top = sorted(counts.items(), key=lambda kv: -kv[1])[:8]
    fresh = [s for s in counts if s in firsts and parse_ts(firsts[s]) >= w0]
    threats = sorted([r for r in cur if threat_of(r.get('sound'))], key=lambda r: r['ts'], reverse=True)
    before = {r.get('station') or '?' for r in live if parse_ts(r['ts']) < w0}
    active = {r.get('station') or '?' for r in cur}
    silent = sorted(before - active)
    p, pp = pulse_for(cur), pulse_for(prev)
    when = now.astimezone(timezone(timedelta(hours=5)))
    lines = ['<b>%s</b>, %s (%s)' % (esc(t['title']), when.strftime('%d.%m.%Y'), t['day'] if hours == 24 else t['week'])]
    if p is None:
        lines.append(t['pulse_none'])
    else:
        d = (p - pp) if pp is not None else None
        tr = '' if d is None else ', ' + (t['same'] if d == 0 else (t['higher'] if d > 0 else t['lower']).format(n=abs(d)))
        lines.append('%s: <b>%d</b>/100%s' % (t['pulse'], p, tr))
    lines.append('%s: <b>%d</b>, %s: <b>%d</b>' % (t['events'], len(cur), t['conf'], len([r for r in cur if r['status'] == 'confirmed'])))
    lines.append('')
    lines.append('<b>%s</b>: %s' % (t['who'], esc(', '.join('%s %d' % (name_of(s, lang), n) for s, n in top)) if top else t['nobody']))
    lines.append('<b>%s</b>: %s' % (t['new'] if fresh else t['new'], esc(', '.join(name_of(s, lang) for s in fresh)) if fresh else t['nonew']))
    if threats:
        lines.append('')
        lines.append('<b>⚠ %s: %d</b>' % (t['alerts'], len(threats)))
        for r in threats[:5]:
            kind, score = threat_of(r.get('sound'))
            ts = parse_ts(r['ts']).astimezone(timezone(timedelta(hours=5))).strftime('%d.%m %H:%M')
            lines.append('• %s %d%%, %s, %s' % (t[kind], round(score * 100), esc(r.get('station') or ''), ts))
        lines.append('<i>%s</i>' % t['hint'])
    else:
        lines.append('%s: %s' % (t['alerts'], t['noalerts']))
    if silent:
        lines.append('')
        lines.append('<b>%s</b>: %s. %s' % (t['silent'], esc(', '.join(silent)), t['silent_hint']))
    lines.append('')
    lines.append('<i>%s</i> app.wetlandear.tech' % t['foot'])
    return '\n'.join(lines)
