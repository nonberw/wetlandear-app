"""Evidence log: hashing, the hash chain, weather at the time of the event, and the PDF record. The chain formula is the same as in the database trigger
(supabase/009_guard_and_network.sql): chain_hash = sha256(prev_hash | audio_sha256 | payload_text). The server computes the audio hash itself from the stored clip."""
import hashlib
import io
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import pub as P
import tg as T

HERE = os.path.dirname(os.path.abspath(__file__))
ZERO = '0' * 64
VERIFY_URL = 'https://app.wetlandear.tech/api/evidence?verify='


def sha256_hex(b):
    return hashlib.sha256(b).hexdigest()


def chain_of(prev_hash, audio_sha, payload_text):
    return hashlib.sha256((prev_hash + '|' + audio_sha + '|' + payload_text).encode('utf-8')).hexdigest()


def canonical(payload):
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',', ':'))


def weather_at(lat, lon, when):
    """Open-Meteo hourly values nearest to the event time (best effort; None if unavailable). Past week: forecast API with past_days, older: archive API."""
    if lat is None or lon is None:
        return None
    try:
        t = T.parse_ts(when).astimezone(timezone.utc)
        age = (datetime.now(timezone.utc) - t).days
        q = {'latitude': '%.4f' % lat, 'longitude': '%.4f' % lon, 'hourly': 'temperature_2m,precipitation,wind_speed_10m,cloud_cover', 'timezone': 'UTC', 'wind_speed_unit': 'kmh'}
        if age > 6:
            q.update({'start_date': t.strftime('%Y-%m-%d'), 'end_date': t.strftime('%Y-%m-%d')})
            url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(q)
        else:
            q.update({'past_days': 7, 'forecast_days': 1})
            url = 'https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(q)
        j = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'wetlandear-evidence/1.0'}), timeout=12))
        h = j['hourly']; want = t.strftime('%Y-%m-%dT%H:00')
        i = h['time'].index(want)
        return {'source': 'open-meteo', 'hour_utc': want, 'temperature_c': h['temperature_2m'][i], 'wind_kmh': h['wind_speed_10m'][i], 'precipitation_mm': h['precipitation'][i], 'cloud_cover_pct': h['cloud_cover'][i]}
    except Exception:
        return None


def build_payload(det, requester, owner_name, audio_len, lang):
    sound = (det.get('sound') or {}).get('groups') or {}
    th = T.threat_of(det.get('sound'))
    sg = det.get('suggest') or {}
    return {
        'app': 'WetlandEar', 'version': 1, 'det_id': det['id'], 'event_time': det['ts'], 'station': det.get('station'), 'lat': det.get('lat'), 'lon': det.get('lon'),
        'kind': th[0] if th else None, 'sound_scores': {k: sound.get(k) for k in ('gun', 'engine', 'animal', 'weather', 'speech', 'dog') if k in sound},
        'model_suggestion': {'species': sg.get('common') or sg.get('sci'), 'confidence': sg.get('conf')} if sg else None,
        'status': det.get('status'), 'threat_review': det.get('threat_review'), 'recorded_by': owner_name, 'registered_by': requester,
        'registered_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'audio_bytes': audio_len, 'weather': weather_at(det.get('lat'), det.get('lon'), det['ts']), 'lang': lang,
    }


def verify_row(row):
    """(chain_ok, audio_ok) for one record: the hash matches its own content, links to the previous record, and the stored audio still has the recorded hash."""
    chain_ok = chain_of(row['prev_hash'], row['audio_sha256'], row['payload_text']) == row['chain_hash']
    if chain_ok:
        if row['seq'] == 1:
            chain_ok = row['prev_hash'] == ZERO
        else:
            prev = T.sb('evidence_log?select=chain_hash&owner=eq.%s&seq=eq.%d&limit=1' % (row['owner'], row['seq'] - 1)) or []
            chain_ok = bool(prev) and prev[0]['chain_hash'] == row['prev_hash']
    audio = P.clip_bytes(row['owner'], row['det_id'])
    return chain_ok, bool(audio) and sha256_hex(audio) == row['audio_sha256']


def verify_chain(owner):
    rows = T.sb('evidence_log?select=seq,prev_hash,chain_hash,audio_sha256,payload_text&owner=eq.%s&order=seq.asc&limit=5000' % owner) or []
    prev = ZERO
    for i, r in enumerate(rows):
        if r['seq'] != i + 1 or r['prev_hash'] != prev or chain_of(r['prev_hash'], r['audio_sha256'], r['payload_text']) != r['chain_hash']:
            return {'chain_ok': False, 'count': len(rows), 'first_bad': r['seq']}
        prev = r['chain_hash']
    return {'chain_ok': True, 'count': len(rows), 'first_bad': None}


TXT = {
    'ru': {'title': 'Протокол фиксации события', 'sub': 'WetlandEar · журнал доказательств', 'n': 'Номер записи', 'reg': 'Записано (UTC)', 'ev': 'Время события (UTC)', 'st': 'Станция', 'co': 'Координаты', 'kind': 'Тип сигнала',
           'gun': 'Возможный выстрел', 'engine': 'Шум двигателя', 'score': 'Оценки звуковой модели', 'sug': 'Подсказка модели', 'rev': 'Решение человека', 'confirmed': 'нарушение подтверждено', 'false': 'отмечено как ложная тревога',
           'none': 'не проверено', 'who': 'Записал(а) звук', 'by': 'Зафиксировал(а)', 'wx': 'Погода в час события', 'aud': 'Аудио: SHA-256', 'size': 'размер файла, байт', 'prev': 'Хеш предыдущей записи', 'chain': 'Хеш этой записи',
           'how': 'Как проверить', 'howt': 'Хеш аудио считает сервер по сохранённому файлу. Хеш записи считается как SHA-256 от строки «хеш предыдущей записи | хеш аудио | текст протокола» (текст ниже). Записи одной цепочки нельзя изменить или удалить через приложение; любое изменение старой записи сломает цепочку. Проверка по ссылке и QR-коду.',
           'text': 'Текст протокола (входит в хеш; переносы строк добавлены только для печати)', 'warn': 'Важно: тип сигнала определила звуковая модель автоматически, это подсказка, а не заключение. Протокол подтверждает, что аудиофайл и данные существовали в записанном виде к моменту записи в журнал. Он не заменяет протокол осмотра и экспертизу.'},
    'en': {'title': 'Event record', 'sub': 'WetlandEar · evidence log', 'n': 'Record number', 'reg': 'Recorded (UTC)', 'ev': 'Event time (UTC)', 'st': 'Station', 'co': 'Coordinates', 'kind': 'Signal type',
           'gun': 'Possible gunshot', 'engine': 'Engine noise', 'score': 'Sound model scores', 'sug': 'Model suggestion', 'rev': 'Person verdict', 'confirmed': 'violation confirmed', 'false': 'marked as a false alarm',
           'none': 'not reviewed', 'who': 'Sound recorded by', 'by': 'Recorded in the log by', 'wx': 'Weather at the hour of the event', 'aud': 'Audio SHA-256', 'size': 'file size, bytes', 'prev': 'Hash of the previous record', 'chain': 'Hash of this record',
           'how': 'How to verify', 'howt': 'The server computes the audio hash from the stored file. The record hash is SHA-256 of the string "hash of the previous record | audio hash | record text" (the text is below). Records of one chain cannot be changed or deleted through the app; changing an old record breaks the chain. Verify with the link or QR code.',
           'text': 'Record text (part of the hash; line breaks are added for printing only)', 'warn': 'Note: the signal type was determined automatically by the sound model; it is a hint, not a conclusion. The record shows that the audio file and the data existed in this form when the log entry was made. It does not replace an inspection report or an expert examination.'},
}


def make_pdf(row, lang='ru'):
    from reportlab.graphics.barcode import qr
    from reportlab.graphics.shapes import Drawing
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle, Preformatted
    for name, fn in (('DV', 'DejaVuSans.ttf'), ('DVB', 'DejaVuSans-Bold.ttf')):
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, os.path.join(HERE, 'fonts', fn)))
    pdfmetrics.registerFontFamily('DV', normal='DV', bold='DVB', italic='DV', boldItalic='DVB')
    t = TXT.get(lang, TXT['ru']); p = json.loads(row['payload_text'])
    esc = T.esc
    st = lambda n, **k: ParagraphStyle(n, fontName=k.pop('f', 'DV'), fontSize=k.pop('s', 9.5), leading=k.pop('l', 13), **k)
    h1, small, body, mono = st('h1', f='DVB', s=18, l=22, textColor=colors.HexColor('#1F5BFF')), st('sm', s=8.5, l=11, textColor=colors.HexColor('#55657F')), st('b'), st('m', s=7.4, l=9.5)
    cell = lambda s: Paragraph(esc(str(s)), body)
    th = p.get('kind'); kind = t.get(th, '–') if th else '–'
    rev = t.get(p.get('threat_review') or 'none', t['none']); sg = p.get('model_suggestion') or {}; wx = p.get('weather')
    rows = [[t['n'], cell(row['seq'])], [t['reg'], cell(row['created_at'][:19].replace('T', ' '))], [t['ev'], cell((p.get('event_time') or '')[:19].replace('T', ' '))], [t['st'], cell(p.get('station') or '–')],
            [t['co'], cell('%s, %s' % (p.get('lat'), p.get('lon')) if p.get('lat') is not None else '–')], [t['kind'], cell(kind)], [t['score'], cell(', '.join('%s %s' % (k, v) for k, v in (p.get('sound_scores') or {}).items()) or '–')],
            [t['sug'], cell(('%s (%s)' % (sg.get('species'), sg.get('confidence'))) if sg else '–')], [t['rev'], cell(rev)], [t['who'], cell(p.get('recorded_by') or '–')], [t['by'], cell(p.get('registered_by') or '–')],
            [t['wx'], cell(('%s °C, %s km/h, %s mm, %s%%' % (wx['temperature_c'], wx['wind_kmh'], wx['precipitation_mm'], wx['cloud_cover_pct'])) if wx else '–')],
            [t['aud'], Preformatted(row['audio_sha256'], mono)], [t['size'], cell(p.get('audio_bytes'))], [t['prev'], Preformatted(row['prev_hash'], mono)], [t['chain'], Preformatted(row['chain_hash'], mono)]]
    tbl = Table([[Paragraph('<b>%s</b>' % esc(k), small), v] for k, v in rows], colWidths=[52 * mm, 118 * mm])
    tbl.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, -1), .4, colors.HexColor('#DCE4F2')), ('TOPPADDING', (0, 0), (-1, -1), 3.5), ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5)]))
    d = Drawing(90, 90); d.add(qr.QrCodeWidget(VERIFY_URL + row['id'], barLevel='M', barWidth=90, barHeight=90))
    buf = io.BytesIO(); doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=16 * mm, title=t['title'], author='WetlandEar')
    top = Table([[[Paragraph(esc(t['title']), h1), Paragraph(esc(t['sub']), small), Paragraph('ID ' + esc(row['id']), small)], d]], colWidths=[120 * mm, 50 * mm])
    story = [top, Spacer(1, 6 * mm), tbl, Spacer(1, 5 * mm), Paragraph('<b>%s</b>' % esc(t['how']), body), Paragraph(esc(t['howt']), small), Paragraph(esc(VERIFY_URL + row['id']), small), Spacer(1, 4 * mm),
             Paragraph('<b>%s</b>' % esc(t['text']), small), Preformatted('\n'.join(__import__('textwrap').wrap(row['payload_text'], 110)), mono), Spacer(1, 4 * mm), Paragraph(esc(t['warn']), small)]
    doc.build(story)
    return buf.getvalue()
