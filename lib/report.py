"""Period reports: weekly and monthly digests for Telegram, PDF, markdown for AI assistants.
All numbers are computed from the person's own journal, nothing is invented. Times are Astana (UTC+5), like the morning report."""
import io
import os
import urllib.parse
from collections import Counter
from datetime import datetime, timedelta, timezone

import tg as T

TZ = timezone(timedelta(hours=5))
HERE = os.path.dirname(os.path.abspath(__file__))

W = {
    'ru': {
        'week': 'Неделя в заповеднике', 'month': 'Месяц в заповеднике', 'custom': 'Отчёт о наблюдениях', 'vs_w': 'к прошлой неделе', 'vs_m': 'к прошлому месяцу', 'vs': 'к прошлому периоду',
        'events': 'События', 'conf': 'подтверждено', 'species': 'Видов', 'pulse': 'Пульс', 'top': 'Кто пел', 'new': 'Новые виды', 'nonew': 'Новых видов нет', 'alerts': 'Тревоги', 'noalerts': 'Тревог нет',
        'silent': 'Молчали станции', 'stations': 'Станции', 'nodata': 'За этот период событий нет.', 'foot': 'Виды подсказывает модель, подтверждает человек.', 'gun': 'Возможный выстрел', 'engine': 'Шум двигателя',
        'sp': 'Вид', 'latin': 'Латинское название', 'n': 'Событий', 'prev': 'Было', 'first': 'Впервые', 'last': 'Последний раз', 'hours': 'Активность по часам', 'days': 'События по дням', 'who': 'Автор', 'gen': 'Сформировано',
        'period': 'Период', 'note': 'Виды подсказывает модель (BirdNET и собственная модель WetlandEar), в таблицы попадают только виды, подтверждённые человеком. Тревоги это подсказки модели, а не доказательство. Точность модели: wetlandear.tech/metrics.',
        'caption': 'Отчёт за {p} (PDF)', 'coord': 'Координаты', 'st': 'Станция'},
    'en': {
        'week': 'The week at the reserve', 'month': 'The month at the reserve', 'custom': 'Observation report', 'vs_w': 'vs last week', 'vs_m': 'vs last month', 'vs': 'vs previous period',
        'events': 'Events', 'conf': 'confirmed', 'species': 'Species', 'pulse': 'Pulse', 'top': 'Who sang', 'new': 'New species', 'nonew': 'No new species', 'alerts': 'Alerts', 'noalerts': 'No alerts',
        'silent': 'Silent stations', 'stations': 'Stations', 'nodata': 'No events in this period.', 'foot': 'Species are suggested by a model and confirmed by a person.', 'gun': 'Possible gunshot', 'engine': 'Engine noise',
        'sp': 'Species', 'latin': 'Scientific name', 'n': 'Events', 'prev': 'Before', 'first': 'First', 'last': 'Last', 'hours': 'Activity by hour', 'days': 'Events per day', 'who': 'Author', 'gen': 'Generated',
        'period': 'Period', 'note': 'Species are suggested by a model (BirdNET and the WetlandEar model); only species confirmed by a person are listed. Alerts are model hints, not proof. Model accuracy: wetlandear.tech/metrics.',
        'caption': 'Report for {p} (PDF)', 'coord': 'Coordinates', 'st': 'Station'},
}


def local_midnight(dt):
    d = dt.astimezone(TZ)
    return d.replace(hour=0, minute=0, second=0, microsecond=0)


def week_window(now=None):
    """The last seven full days, ending at today's local midnight."""
    end = local_midnight(now or datetime.now(timezone.utc))
    return end - timedelta(days=7), end


def month_window(now=None):
    """The previous calendar month."""
    first = local_midnight(now or datetime.now(timezone.utc)).replace(day=1)
    last_prev = first - timedelta(days=1)
    return last_prev.replace(day=1), first


def _fetch(uid, a, b):
    q = ('detections?select=ts,status,species,station,sound,lat,lon&user_id=eq.%s&ts=gte.%s&ts=lt.%s&order=ts.asc&limit=20000'
         % (uid, urllib.parse.quote(a.isoformat()), urllib.parse.quote(b.isoformat())))
    return [r for r in (T.sb(q) or []) if r['status'] != 'rejected']


def _stats(rows, firsts_before=None):
    conf = [r for r in rows if r['status'] == 'confirmed' and r.get('species')]
    spp = {}
    for r in conf:
        t = T.parse_ts(r['ts'])
        s = spp.setdefault(r['species'], {'n': 0, 'first': t, 'last': t, 'stations': set()})
        s['n'] += 1
        s['first'] = min(s['first'], t)
        s['last'] = max(s['last'], t)
        s['stations'].add(r.get('station') or '?')
    return conf, spp


def period_data(uid, start, end, prev_start=None, prev_end=None):
    """Everything a report needs. start/end are aware datetimes; the previous period defaults to the same length right before."""
    prev_end = prev_end or start
    prev_start = prev_start or (start - (end - start))
    rows = _fetch(uid, start, end)
    prev = _fetch(uid, prev_start, prev_end)
    conf, spp = _stats(rows)
    pconf, pspp = _stats(prev)
    try:
        firsts = T.first_seen(uid)
    except Exception:
        firsts = {}
    new = sorted([s for s in spp if s in firsts and start <= T.parse_ts(firsts[s]) < end], key=lambda s: -spp[s]['n'])
    stn = Counter(r.get('station') or '?' for r in rows)
    coords = {}
    for r in rows:
        if r.get('lat') is not None and r.get('lon') is not None:
            coords[r.get('station') or '?'] = (r['lat'], r['lon'])
    before = {r.get('station') or '?' for r in prev}
    silent = sorted(before - set(stn))
    alerts = []
    for r in rows:
        th = T.threat_of(r.get('sound'))
        if th:
            alerts.append({'ts': r['ts'], 'kind': th[0], 'score': th[1], 'station': r.get('station')})
    days = max(1, int(round((end - start).total_seconds() / 86400)))
    daily = [0] * days
    hours = [0] * 24
    for r in rows:
        t = T.parse_ts(r['ts']).astimezone(TZ)
        i = int((T.parse_ts(r['ts']) - start).total_seconds() // 86400)
        if 0 <= i < days:
            daily[i] += 1
        hours[t.hour] += 1
    return {
        'start': start, 'end': end, 'prev_start': prev_start, 'prev_end': prev_end, 'events': len(rows), 'prev_events': len(prev), 'confirmed': len(conf), 'prev_confirmed': len(pconf),
        'species': spp, 'prev_species': pspp, 'new': new, 'stations': dict(stn.most_common()), 'coords': coords, 'silent': silent, 'alerts': alerts, 'daily': daily, 'hours': hours,
        'pulse': T.pulse_for(rows) if rows else None, 'prev_pulse': T.pulse_for(prev) if prev else None,
    }


def _delta(a, b):
    if b is None or b == 0 and a == 0:
        return ''
    d = a - b
    return ' (%s%d)' % ('+' if d > 0 else '−' if d < 0 else '±', abs(d))


def digest_text(d, lang='ru', kind='week'):
    t = W.get(lang, W['ru'])
    f = lambda x: x.astimezone(TZ).strftime('%d.%m')
    last_day = d['end'] - timedelta(days=1)
    title = t['week'] if kind == 'week' else t['month'] if kind == 'month' else t['custom']
    vs = {'week': t['vs_w'], 'month': t['vs_m']}.get(kind, t['vs'])
    if not d['events']:
        return '<b>%s</b>, %s – %s\n%s' % (T.esc(title), f(d['start']), f(last_day), t['nodata'])
    L = ['<b>%s</b>, %s – %s' % (T.esc(title), f(d['start']), f(last_day))]
    L.append('%s: <b>%d</b>%s, %s: <b>%d</b>%s' % (t['events'], d['events'], _delta(d['events'], d['prev_events']), t['conf'], d['confirmed'], _delta(d['confirmed'], d['prev_confirmed'])))
    L.append('%s: <b>%d</b>%s' % (t['species'], len(d['species']), _delta(len(d['species']), len(d['prev_species']))))
    if d['pulse'] is not None:
        L.append('%s: <b>%d</b>/100%s <i>(%s)</i>' % (t['pulse'], d['pulse'], _delta(d['pulse'], d['prev_pulse']), vs))
    L.append('')
    top = sorted(d['species'].items(), key=lambda kv: -kv[1]['n'])[:8]
    L.append('<b>%s</b>: %s' % (t['top'], T.esc(', '.join('%s %d%s' % (T.name_of(s, lang), v['n'], _delta(v['n'], d['prev_species'].get(s, {}).get('n', 0)) if s in d['prev_species'] else '') for s, v in top)) if top else '–'))
    L.append('<b>%s</b>: %s' % (t['new'], T.esc(', '.join(T.name_of(s, lang) for s in d['new'][:12])) if d['new'] else t['nonew']))
    if d['alerts']:
        L.append('')
        L.append('<b>⚠ %s: %d</b>' % (t['alerts'], len(d['alerts'])))
        for a in sorted(d['alerts'], key=lambda x: x['ts'], reverse=True)[:5]:
            L.append('• %s %d%%, %s, %s' % (t[a['kind']], round(a['score'] * 100), T.esc(a.get('station') or ''), T.parse_ts(a['ts']).astimezone(TZ).strftime('%d.%m %H:%M')))
    else:
        L.append('%s: %s' % (t['alerts'], t['noalerts']))
    if d['silent']:
        L.append('<b>%s</b>: %s' % (t['silent'], T.esc(', '.join(d['silent']))))
    L.append('')
    L.append('<i>%s</i>' % t['foot'])
    return '\n'.join(L)


def markdown(d, lang='en'):
    t = W.get(lang, W['ru'])
    f = lambda x: x.astimezone(TZ).strftime('%Y-%m-%d')
    L = ['# %s: %s to %s' % (t['custom'], f(d['start']), f(d['end'] - timedelta(days=1))), '',
         '- %s: %d (previous period %d)' % (t['events'], d['events'], d['prev_events']),
         '- %s by a person: %d (previous %d)' % (t['conf'], d['confirmed'], d['prev_confirmed']),
         '- %s: %d (previous %d)' % (t['species'], len(d['species']), len(d['prev_species'])),
         '- %s: %s (previous %s)' % (t['pulse'], d['pulse'], d['prev_pulse']), '', '## %s' % t['sp']]
    for s, v in sorted(d['species'].items(), key=lambda kv: -kv[1]['n']):
        L.append('- %s: %d events (before: %d), first %s, last %s, stations: %s%s' % (T.name_of(s, lang), v['n'], d['prev_species'].get(s, {}).get('n', 0), f(v['first']), f(v['last']), ', '.join(sorted(v['stations'])), ', NEW this period' if s in d['new'] else ''))
    L += ['', '## %s' % t['stations']] + ['- %s: %d events%s' % (k, n, (' (%.4f, %.4f)' % d['coords'][k]) if k in d['coords'] else '') for k, n in d['stations'].items()]
    if d['silent']:
        L += ['', '- ' + t['silent'] + ': ' + ', '.join(d['silent'])]
    L += ['', '## %s: %d' % (t['alerts'], len(d['alerts']))] + ['- %s, %s, %d%%, %s' % (T.parse_ts(a['ts']).astimezone(TZ).strftime('%Y-%m-%d %H:%M'), t[a['kind']], round(a['score'] * 100), a.get('station') or '') for a in d['alerts'][:30]]
    peak = max(range(24), key=lambda h: d['hours'][h]) if d['events'] else None
    L += ['', 'Activity peak hour (Astana): %s' % ('%02d:00' % peak if peak is not None else 'n/a'), 'Note: ' + t['note']]
    return '\n'.join(L)


def make_pdf(d, lang='ru', who='', kind='custom'):
    """A4 PDF with numbers, a daily chart, species, stations, alerts. Uses the bundled DejaVu fonts (Cyrillic)."""
    from reportlab.graphics import renderPDF
    from reportlab.graphics.charts.barcharts import VerticalBarChart
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    for name, fn in (('DV', 'DejaVuSans.ttf'), ('DVB', 'DejaVuSans-Bold.ttf')):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, os.path.join(HERE, 'fonts', fn)))
    pdfmetrics.registerFontFamily('DV', normal='DV', bold='DVB', italic='DV', boldItalic='DVB')
    t = W.get(lang, W['ru'])
    BLUE, INK, SOFT = colors.HexColor('#2F6FED'), colors.HexColor('#14233F'), colors.HexColor('#4A5D80')
    st = lambda n, **k: ParagraphStyle(n, fontName=k.pop('fontName', 'DV'), textColor=k.pop('textColor', INK), **k)
    H1, H2, P, SM = st('h1', fontName='DVB', fontSize=20, leading=24), st('h2', fontName='DVB', fontSize=12, leading=15, textColor=colors.HexColor('#1D3F8F'), spaceBefore=12, spaceAfter=4), st('p', fontSize=9, leading=12), st('sm', fontSize=7.5, leading=10, textColor=SOFT)
    f = lambda x: x.astimezone(TZ).strftime('%d.%m.%Y')
    last_day = d['end'] - timedelta(days=1)
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm, title='WetlandEar', author='WetlandEar')
    title = t['week'] if kind == 'week' else t['month'] if kind == 'month' else t['custom']
    S = [Paragraph('%s <font color="#2F6FED">· WetlandEar</font>' % T.esc(title), H1), Paragraph('%s: %s – %s%s' % (t['period'], f(d['start']), f(last_day), ('<br/>%s: %s' % (t['who'], T.esc(who))) if who else ''), P), Spacer(1, 6)]
    nums = [[str(d['events']), str(d['confirmed']), str(len(d['species'])), str(len(d['stations'])), '–' if d['pulse'] is None else str(d['pulse'])], [t['events'], t['conf'], t['species'], t['stations'], t['pulse']]]
    tb = Table(nums, colWidths=[35 * mm] * 5)
    tb.setStyle(TableStyle([('FONT', (0, 0), (-1, 0), 'DVB', 16), ('FONT', (0, 1), (-1, 1), 'DV', 7.5), ('TEXTCOLOR', (0, 0), (-1, 0), BLUE), ('TEXTCOLOR', (0, 1), (-1, 1), SOFT), ('ALIGN', (0, 0), (-1, -1), 'CENTER'), ('BOX', (0, 0), (-1, -1), .5, colors.HexColor('#CFDCF3')), ('INNERGRID', (0, 0), (-1, -1), .5, colors.HexColor('#CFDCF3'))]))
    S.append(tb)

    def bars(vals, labels, h=70):
        dr = Drawing(178 * mm, h)
        bc = VerticalBarChart()
        bc.x, bc.y, bc.width, bc.height = 10, 14, 178 * mm - 20, h - 22
        bc.data = [vals or [0]]
        bc.bars[0].fillColor = BLUE
        bc.bars[0].strokeColor = None
        bc.valueAxis.valueMin = 0
        bc.valueAxis.labels.fontName = 'DV'
        bc.valueAxis.labels.fontSize = 6
        bc.categoryAxis.labels.fontName = 'DV'
        bc.categoryAxis.labels.fontSize = 6
        bc.categoryAxis.categoryNames = labels
        bc.barSpacing = 1
        dr.add(bc)
        return dr
    n = len(d['daily'])
    lab = [(f(d['start'] + timedelta(days=i))[:5] if (n <= 10 or i % max(1, n // 8) == 0) else '') for i in range(n)]
    S += [Paragraph(t['days'], H2), bars(d['daily'], lab), Paragraph(t['hours'], H2), bars(d['hours'], ['%02d' % h if h % 3 == 0 else '' for h in range(24)])]
    sp = sorted(d['species'].items(), key=lambda kv: -kv[1]['n'])[:60]
    S.append(Paragraph(t['species'], H2))
    if sp:
        rows = [[t['sp'], t['latin'], t['n'], t['prev'], t['first'], t['last']]]
        for s, v in sp:
            rows.append([Paragraph(T.esc(T.name_of(s, lang)) + (' ★' if s in d['new'] else ''), P), Paragraph('<i>%s</i>' % T.esc(_latin(s)), P), v['n'], d['prev_species'].get(s, {}).get('n', 0), v['first'].astimezone(TZ).strftime('%d.%m'), v['last'].astimezone(TZ).strftime('%d.%m')])
        tb = Table(rows, colWidths=[46 * mm, 48 * mm, 18 * mm, 16 * mm, 22 * mm, 28 * mm], repeatRows=1)
        tb.setStyle(TableStyle([('FONT', (0, 0), (-1, 0), 'DVB', 8), ('FONT', (0, 1), (-1, -1), 'DV', 8.5), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EEF4FD')), ('LINEBELOW', (0, 0), (-1, -1), .3, colors.HexColor('#DBE6F5')), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]))
        S.append(tb)
    else:
        S.append(Paragraph(t['nodata'], P))
    S.append(Paragraph(t['stations'], H2))
    rows = [[t['st'], t['n'], t['coord']]] + [[Paragraph(T.esc(k), P), n, ('%.4f, %.4f' % d['coords'][k]) if k in d['coords'] else '–'] for k, n in d['stations'].items()]
    tb = Table(rows, colWidths=[80 * mm, 25 * mm, 70 * mm], repeatRows=1)
    tb.setStyle(TableStyle([('FONT', (0, 0), (-1, 0), 'DVB', 8), ('FONT', (0, 1), (-1, -1), 'DV', 8.5), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#EEF4FD')), ('LINEBELOW', (0, 0), (-1, -1), .3, colors.HexColor('#DBE6F5'))]))
    S.append(tb)
    S.append(Paragraph('%s: %d' % (t['alerts'], len(d['alerts'])), H2))
    for a in sorted(d['alerts'], key=lambda x: x['ts'], reverse=True)[:15]:
        S.append(Paragraph('%s · %s %d%% · %s' % (T.parse_ts(a['ts']).astimezone(TZ).strftime('%d.%m.%Y %H:%M'), t[a['kind']], round(a['score'] * 100), T.esc(a.get('station') or '')), P))
    S += [Spacer(1, 10), Paragraph('%s %s. %s' % (t['gen'], datetime.now(TZ).strftime('%d.%m.%Y'), t['note']), SM)]
    doc.build(S)
    return buf.getvalue()


_LAT = None


def _latin(sid):
    import actions as A
    global _LAT
    if sid in A.SCI:
        return A.SCI[sid]
    if _LAT is None:
        try:
            import json
            js = open(os.path.join(HERE, '..', 'js', 'species-sci.js'), encoding='utf-8').read()
            _LAT = json.loads(js[js.index('{'):js.rindex('}') + 1])
        except Exception:
            _LAT = {}
    return _LAT.get(str(sid)[2:] if str(sid).startswith('x:') else str(sid), '')
