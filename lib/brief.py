"""Weekly brief for a director: three numbers and up to three events worth knowing, short enough to read in a minute.
Sent every Monday to Telegram and, if the person switched it on and an e-mail service is configured, by e-mail. No sign-in needed to read it.
E-mail needs RESEND_API_KEY (and RESEND_FROM for a verified sender) in the Vercel environment; without them only Telegram is used."""
import json
import urllib.error
import urllib.request
from datetime import timedelta

import report as R
import tg as T

TXT = {
    'ru': {'title': 'Неделя в заповеднике', 'events': 'Событий', 'species': 'Видов подтверждено', 'ind': 'Индикаторных видов слышно', 'verified': 'Подтверждено человеком', 'vs': 'к прошлой неделе',
           'ev': 'Что важно', 'alert': 'Тревоги: {n}. Последняя: {what}, {st}, {when}', 'new': 'Новые для вас виды: {names}', 'silent': 'Станции молчат: {names}', 'drop': 'Активность упала на {n}% к прошлой неделе',
           'calm': 'Ничего тревожного: тревог нет, все станции на связи.', 'nodata': 'За неделю событий не было.', 'gun': 'возможный выстрел', 'engine': 'шум двигателя', 'foot': 'Виды подсказывает модель, подтверждает человек.'},
    'en': {'title': 'The week at the reserve', 'events': 'Events', 'species': 'Species confirmed', 'ind': 'Indicator species heard', 'verified': 'Confirmed by a person', 'vs': 'vs last week',
           'ev': 'What matters', 'alert': 'Alerts: {n}. Latest: {what}, {st}, {when}', 'new': 'New species for you: {names}', 'silent': 'Silent stations: {names}', 'drop': 'Activity fell by {n}% against last week',
           'calm': 'Nothing worrying: no alerts and every station is online.', 'nodata': 'No events this week.', 'gun': 'possible gunshot', 'engine': 'engine noise', 'foot': 'Species are suggested by a model and confirmed by a person.'},
}


def _delta(a, b):
    if not b:
        return ''
    d = a - b
    return ' (%+d)' % d if d else ''


def indicator_share(uid, d):
    """Share of the director's indicator species heard (confirmed) this week, or None if none are chosen."""
    try:
        rows = T.sb('shared_prefs?select=value&owner=eq.%s&key=eq.indicators&limit=1' % uid) or []
        ids = (rows[0]['value'] if rows else []) or []
    except Exception:
        return None
    if not isinstance(ids, list) or len(ids) < 3:
        return None
    heard = sum(1 for s in ids if s in d['species'])
    return heard, len(ids)


def build(uid, lang='ru'):
    """(subject, telegram_html, email_html) or None when there is nothing to say."""
    t = TXT.get(lang, TXT['ru'])
    a, b = R.week_window()
    d = R.period_data(uid, a, b)
    f = lambda x: x.astimezone(R.TZ).strftime('%d.%m')
    head = '%s, %s – %s' % (t['title'], f(a), f(b - timedelta(days=1)))
    if not d['events']:
        return None
    nums = [(t['events'], '%d%s' % (d['events'], _delta(d['events'], d['prev_events'])), t['vs'])]
    nums.append((t['species'], '%d%s' % (len(d['species']), _delta(len(d['species']), len(d['prev_species']))), t['vs']))
    ind = indicator_share(uid, d)
    if ind:
        nums.append((t['ind'], '%d / %d' % ind, ''))
    else:
        nums.append((t['verified'], '%d%%' % round(100 * d['confirmed'] / d['events']), ''))
    items = []
    if d['alerts']:
        last = sorted(d['alerts'], key=lambda x: x['ts'])[-1]
        items.append(t['alert'].format(n=len(d['alerts']), what=t[last['kind']], st=last.get('station') or '?', when=T.parse_ts(last['ts']).astimezone(R.TZ).strftime('%d.%m %H:%M')))
    if d['new']:
        items.append(t['new'].format(names=', '.join(T.name_of(s, lang) for s in d['new'][:6])))
    if d['silent']:
        items.append(t['silent'].format(names=', '.join(d['silent'][:6])))
    if d['prev_events'] >= 20 and d['events'] < d['prev_events'] * 0.6:
        items.append(t['drop'].format(n=round(100 * (1 - d['events'] / d['prev_events']))))
    items = items[:3] or [t['calm']]
    tg = '<b>%s</b>\n\n' % T.esc(head) + '\n'.join('<b>%s</b>  %s%s' % (T.esc(v), T.esc(k), (' <i>(' + T.esc(c) + ')</i>') if c else '') for k, v, c in nums)
    tg += '\n\n<b>%s</b>\n' % T.esc(t['ev']) + '\n'.join('• ' + T.esc(x) for x in items) + '\n\n<i>%s</i>' % T.esc(t['foot'])
    em = ('<div style="font-family:Arial,sans-serif;max-width:520px;color:#0B1B3A"><h2 style="margin:0 0 12px">%s</h2><table style="width:100%%;border-collapse:collapse"><tr>%s</tr></table>'
          '<h3 style="margin:18px 0 6px">%s</h3><ul style="padding-left:18px">%s</ul><p style="color:#55657F;font-size:12px">%s</p></div>') % (
        T.esc(head), ''.join('<td style="padding:10px;border:1px solid #DCE4F2;text-align:center"><div style="font-size:26px;color:#1F5BFF;font-weight:700">%s</div><div style="font-size:12px;color:#55657F">%s</div></td>' % (T.esc(v), T.esc(k)) for k, v, c in nums),
        T.esc(t['ev']), ''.join('<li>%s</li>' % T.esc(x) for x in items), T.esc(t['foot']))
    return head, tg, em


# ---------- e-mail (optional) ----------
def mail_configured():
    return bool(T.env('RESEND_API_KEY').strip())


def user_email(uid):
    key = T.env('SUPABASE_SECRET_KEY').strip()
    req = urllib.request.Request('%s/auth/v1/admin/users/%s' % (T.SUPABASE_URL, uid), headers={'apikey': key, 'Authorization': 'Bearer ' + key})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return (json.loads(r.read()) or {}).get('email')
    except Exception:
        return None


def send_mail(to, subject, html):
    body = json.dumps({'from': T.env('RESEND_FROM').strip() or 'WetlandEar <onboarding@resend.dev>', 'to': [to], 'subject': subject, 'html': html}).encode()
    req = urllib.request.Request('https://api.resend.com/emails', method='POST', data=body,
                                 headers={'Authorization': 'Bearer ' + T.env('RESEND_API_KEY').strip(), 'Content-Type': 'application/json', 'User-Agent': 'wetlandear/1.0'})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return 200 <= r.status < 300
    except urllib.error.URLError:
        return False
