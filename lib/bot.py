"""Telegram bot: a linked person manages their own WetlandEar account from chat. Only private chats are served."""
import urllib.parse
from datetime import timedelta, timezone

import tg as T
import actions as A
import report as R

B = {
    'ru': {
        'help': ('<b>WetlandEar</b>: ваш журнал в Telegram\n\n'
                 '/today утренний отчёт сейчас\n/week отчёт за неделю\n/month отчёт за прошлый месяц\n/pdf PDF за прошлую неделю, /pdf month за месяц\n/review проверять события кнопками\n/recent последние события\n/species кто пел за 30 дней\n'
                 '/pulse пульс\n/alerts тревоги\n/stations станции\n/addstation Название широта долгота\n/confirm id вид, /reject id\n/lang ru|en язык\n/stop и /resume утренний отчёт\n'
                 '/unlink отключить этот чат\n\nМожно просто написать вопрос обычными словами: «Кто пел чаще всего на этой неделе?»'),
        'recent': 'Последние события', 'none': 'Событий нет.', 'species': 'Виды за {d} дней (подтверждены человеком)', 'nospecies': 'Подтверждённых видов пока нет.',
        'pulse': 'Пульс за 7 дней: {p} из 100, событий: {n}', 'nopulse': 'За 7 дней событий нет.', 'noalerts': 'Тревог за 7 дней нет.', 'alerts': 'Тревоги за 7 дней', 'gun': 'возможный выстрел', 'engine': 'шум двигателя',
        'stations': 'Станции', 'nostations': 'Станций пока нет. Добавьте: /addstation Название 50.6 69.0', 'added': 'Станция добавлена: {n}', 'addusage': 'Формат: /addstation Название 50.6 69.0 (координаты по желанию)',
        'queue_empty': 'Все события проверены. Хорошая работа!', 'queue_left': 'Ждут проверки: {n}', 'model': 'Модель', 'no_model': 'Подсказки модели нет', 'confirm': 'Верно', 'reject': 'Не то', 'skip': 'Дальше',
        'done_ok': 'Подтверждено: {s}', 'done_no': 'Отклонено', 'fail': 'Не получилось. Попробуйте ещё раз.', 'usage_c': 'Формат: /confirm id Название вида', 'usage_r': 'Формат: /reject id',
        'lang_set': 'Язык: русский', 'resumed': 'Утренний отчёт включён.', 'unlinked': 'Чат отключён. Подключить снова можно в приложении.', 'nolink': 'Этот чат не подключён. Откройте приложение: Профиль → Telegram.',
        'private': 'Бот работает только в личном чате.', 'limit': 'Сегодня лимит вопросов исчерпан, попробуйте завтра.', 'ask_off': 'Ответы на вопросы пока не настроены.', 'ask_fail': 'Не удалось ответить. Попробуйте позже.',
        'thinking': 'Смотрю журнал...'},
    'en': {
        'help': ('<b>WetlandEar</b>: your journal in Telegram\n\n'
                 '/today morning report now\n/week report for the week\n/month report for last month\n/pdf PDF for last week, /pdf month for last month\n/review check events with buttons\n/recent latest events\n/species who sang in the last 30 days\n'
                 '/pulse pulse\n/alerts alerts\n/stations stations\n/addstation Name lat lon\n/confirm id species, /reject id\n/lang ru|en language\n/stop and /resume morning report\n'
                 '/unlink disconnect this chat\n\nOr just ask in plain words: "Which species sang most this week?"'),
        'recent': 'Latest events', 'none': 'No events.', 'species': 'Species in {d} days (confirmed by a person)', 'nospecies': 'No confirmed species yet.',
        'pulse': 'Pulse over 7 days: {p} of 100, events: {n}', 'nopulse': 'No events in 7 days.', 'noalerts': 'No alerts in 7 days.', 'alerts': 'Alerts in 7 days', 'gun': 'possible gunshot', 'engine': 'engine noise',
        'stations': 'Stations', 'nostations': 'No stations yet. Add one: /addstation Name 50.6 69.0', 'added': 'Station added: {n}', 'addusage': 'Format: /addstation Name 50.6 69.0 (coordinates optional)',
        'queue_empty': 'Everything is reviewed. Nice work!', 'queue_left': 'Waiting for review: {n}', 'model': 'Model', 'no_model': 'No model suggestion', 'confirm': 'Correct', 'reject': 'Wrong', 'skip': 'Next',
        'done_ok': 'Confirmed: {s}', 'done_no': 'Rejected', 'fail': 'That did not work. Try again.', 'usage_c': 'Format: /confirm id Species name', 'usage_r': 'Format: /reject id',
        'lang_set': 'Language: English', 'resumed': 'Morning report is on.', 'unlinked': 'Chat disconnected. You can connect again in the app.', 'nolink': 'This chat is not connected. Open the app: Profile → Telegram.',
        'private': 'The bot works only in a private chat.', 'limit': 'Daily question limit reached, try tomorrow.', 'ask_off': 'Answering questions is not configured yet.', 'ask_fail': 'Could not answer. Try later.',
        'thinking': 'Looking at the journal...'},
}


def fmt_time(ts):
    return T.parse_ts(ts).astimezone(timezone(timedelta(hours=5))).strftime('%d.%m %H:%M')


def event_line(d, lang):
    s = d['species'] or (('? ' + d['model_suggestion']['species']) if d['model_suggestion'] else '?')
    mark = {'confirmed': '✔', 'rejected': '✖', 'auto': '•'}[d['status']]
    return '%s %s · %s%s' % (mark, T.esc(fmt_time(d['time_utc'])), T.esc(s), (' · ' + T.esc(d['station'])) if d['station'] else '')


def review_card(uid, lang, skip=0):
    rows, total = A.review_queue(uid, 1, skip)
    t = B[lang]
    if not rows:
        return t['queue_empty'], None
    r = rows[0]; v = A.det_view(r, lang); sug = r.get('suggest')
    lines = ['<b>%s</b>' % T.esc(fmt_time(r['ts'])) + (' · ' + T.esc(r['station']) if r.get('station') else '')]
    lines.append('%s: %s' % (t['model'], '<b>%s</b> %d%%' % (T.esc(A.sug_name(sug, lang)), round(float(sug.get('conf') or 0) * 100))) if sug else t['no_model'])
    if v['possible_alert']:
        lines.append('⚠ ' + t[v['possible_alert']])
    lines.append(t['queue_left'].format(n=total))
    lines.append('<code>%s</code>' % T.esc(r['id']))
    row = []
    if sug:
        row.append({'text': '✅ ' + t['confirm'], 'callback_data': 'ok:' + r['id']})
    row += [{'text': '❌ ' + t['reject'], 'callback_data': 'no:' + r['id']}, {'text': '⏭ ' + t['skip'], 'callback_data': 'nx:%d' % (skip + 1)}]
    return '\n'.join(lines), {'inline_keyboard': [row]}


def handle_command(link, chat, text):
    uid, lang = link['user_id'], (link['lang'] if link['lang'] in B else 'ru')
    t = B[lang]
    cmd, _, arg = text.partition(' ')
    cmd = cmd.split('@')[0].lower(); arg = arg.strip()
    if cmd in ('/help', '/start', '/menu'):
        return T.send(chat, t['help'])
    if cmd in ('/today', '/report', '/week'):
        rep = T.build_report(uid, lang, 168 if cmd == '/week' else 24)
        return T.send(chat, rep or T.TXT[lang]['none7'])
    if cmd in ('/month', '/pdf'):
        kind = 'month' if (cmd == '/month' or arg.lower().startswith('m') or arg.lower().startswith('мес')) else 'week'
        a, b = R.month_window() if kind == 'month' else R.week_window()
        d = R.period_data(uid, a, b)
        if not d['events']:
            return T.send(chat, T.TXT[lang]['none7'])
        T.send(chat, R.digest_text(d, lang, kind))
        if cmd == '/pdf':
            who = ''
            try:
                p = (T.sb('profiles?select=display_name,organization&id=eq.%s' % uid) or [{}])[0] or {}
                who = ', '.join(x for x in (p.get('display_name'), p.get('organization')) if x)
            except Exception:
                pass
            return T.send_document(chat, R.make_pdf(d, lang, who, kind), 'wetlandear-%s-%s.pdf' % (kind, a.strftime('%Y-%m-%d')), R.W[lang]['caption'].format(p='%s – %s' % (a.strftime('%d.%m'), (b - R.timedelta(days=1)).strftime('%d.%m.%Y'))))
        return None
    if cmd == '/recent':
        rows = A.detections(uid, 14, limit=10, lang=lang)
        return T.send(chat, '<b>%s</b>\n' % t['recent'] + '\n'.join(event_line(d, lang) for d in rows) if rows else t['none'])
    if cmd == '/species':
        d = int(arg) if arg.isdigit() else 30
        rows = A.species_list(uid, d, lang)
        return T.send(chat, ('<b>%s</b>\n' % t['species'].format(d=d)) + '\n'.join('%s: %d' % (T.esc(r['species']), r['confirmed_events']) for r in rows[:25]) if rows else t['nospecies'])
    if cmd == '/pulse':
        p = A.pulse(uid, 7)
        return T.send(chat, t['pulse'].format(p=p['pulse'], n=p['events']) if p['pulse'] is not None else t['nopulse'])
    if cmd == '/alerts':
        rows = A.alerts(uid, 7)
        return T.send(chat, ('<b>%s</b>\n' % t['alerts']) + '\n'.join('%s · %s%s' % (T.esc(fmt_time(r['time_utc'])), t[r['kind']], (' · ' + T.esc(r['station'])) if r['station'] else '') for r in rows[:15]) if rows else t['noalerts'])
    if cmd == '/stations':
        rows = A.stations(uid)
        return T.send(chat, ('<b>%s</b>\n' % t['stations']) + '\n'.join('%s%s' % (T.esc(r['name']), (' (%.3f, %.3f)' % (r['lat'], r['lon'])) if r.get('lat') is not None and r.get('lon') is not None else '') for r in rows) if rows else t['nostations'])
    if cmd == '/addstation':
        parts = arg.split()
        nums = []
        while parts and len(nums) < 2:
            try:
                nums.insert(0, float(parts[-1].replace(',', '.'))); parts.pop()
            except ValueError:
                break
        name = ' '.join(parts)
        if not name or len(nums) == 1:
            return T.send(chat, t['addusage'])
        r = A.add_station(uid, name, nums[0] if nums else None, nums[1] if nums else None)
        return T.send(chat, t['added'].format(n=T.esc(name)) if r.get('ok') else t['fail'])
    if cmd == '/review':
        txt, kb = review_card(uid, lang)
        return T.tg('sendMessage', {'chat_id': chat, 'text': txt, 'parse_mode': 'HTML', 'reply_markup': kb} if kb else {'chat_id': chat, 'text': txt})
    if cmd == '/confirm':
        p = arg.split(maxsplit=1)
        if not p:
            return T.send(chat, t['usage_c'])
        r = A.review(uid, p[0], 'confirmed', p[1] if len(p) > 1 else None, lang)
        return T.send(chat, t['done_ok'].format(s=T.esc(r.get('species') or '')) if r.get('ok') else T.esc(r.get('error') or t['fail']))
    if cmd == '/reject':
        if not arg:
            return T.send(chat, t['usage_r'])
        r = A.review(uid, arg.split()[0], 'rejected')
        return T.send(chat, t['done_no'] if r.get('ok') else T.esc(r.get('error') or t['fail']))
    if cmd == '/lang':
        new = 'en' if arg.lower().startswith('en') else 'ru'
        T.sb('telegram_links?user_id=eq.%s' % uid, method='PATCH', body={'lang': new})
        return T.send(chat, B[new]['lang_set'])
    if cmd == '/stop':
        T.sb('telegram_links?user_id=eq.%s' % uid, method='PATCH', body={'enabled': False})
        return T.send(chat, T.TXT[lang]['stopped'])
    if cmd == '/resume':
        T.sb('telegram_links?user_id=eq.%s' % uid, method='PATCH', body={'enabled': True})
        return T.send(chat, t['resumed'])
    if cmd == '/unlink':
        T.sb('telegram_links?user_id=eq.%s' % uid, method='PATCH', body={'chat_id': None, 'enabled': False})
        return T.send(chat, t['unlinked'])
    if cmd.startswith('/'):
        return T.send(chat, t['help'])
    return ask(uid, lang, chat, text)   # plain text = a question to the journal


def ask(uid, lang, chat, text):
    t = B[lang]
    if len(text) < 3:
        return T.send(chat, t['help'])
    if not A.allow_ask(uid):
        return T.send(chat, t['limit'])
    ans, err = A.ask_claude(text[:400], A.journal_summary(uid), lang)
    if err == 'not configured':
        return T.send(chat, t['ask_off'])
    return T.send(chat, T.esc(ans) if ans else t['ask_fail'])


def handle_callback(cb):
    chat = ((cb.get('message') or {}).get('chat') or {})
    cid = chat.get('id'); data = cb.get('data') or ''
    link = (T.sb('telegram_links?select=user_id,lang&chat_id=eq.%s&limit=1' % cid) or [None])[0] if cid and chat.get('type') == 'private' else None
    T.tg('answerCallbackQuery', {'callback_query_id': cb.get('id')})
    if not link:
        return
    uid, lang = link['user_id'], (link['lang'] if link['lang'] in B else 'ru')
    t = B[lang]
    kind, _, val = data.partition(':')
    skip = 0
    if kind in ('ok', 'no'):
        r = A.review(uid, val, 'confirmed' if kind == 'ok' else 'rejected', None, lang)
        T.send(cid, (t['done_ok'].format(s=T.esc(r.get('species') or '')) if kind == 'ok' else t['done_no']) if r.get('ok') else T.esc(r.get('error') or t['fail']))
    elif kind == 'nx' and val.isdigit():
        skip = min(int(val), 200)
    else:
        return
    txt, kb = review_card(uid, lang, skip)
    T.tg('sendMessage', {'chat_id': cid, 'text': txt, 'parse_mode': 'HTML', 'reply_markup': kb} if kb else {'chat_id': cid, 'text': txt})


def handle_update(upd):
    if upd.get('callback_query'):
        return handle_callback(upd['callback_query'])
    msg = upd.get('message') or {}
    chat = (msg.get('chat') or {})
    cid = chat.get('id'); text = (msg.get('text') or '').strip()
    if not cid or not text:
        return
    if chat.get('type') != 'private':
        return T.send(cid, B['ru']['private'] + '\n' + B['en']['private'])
    if text.startswith('/start') and len(text.split()) > 1:   # /start <code> links this chat to an account
        code = text.split(maxsplit=1)[1].strip()
        if not code.isalnum() or len(code) > 64:
            return T.send(cid, T.TXT['ru']['help'] + '\n\n' + T.TXT['en']['help'])
        rows = T.sb('telegram_links?select=user_id,lang&code=eq.%s&limit=1' % urllib.parse.quote(code)) or []
        if not rows:
            return T.send(cid, T.TXT['ru']['badcode'] + '\n\n' + T.TXT['en']['badcode'])
        r = rows[0]
        T.sb('telegram_links?user_id=eq.%s' % r['user_id'], method='PATCH', body={'chat_id': cid, 'code': None, 'enabled': True})
        T.send(cid, T.TXT.get(r['lang'], T.TXT['ru'])['connected'])
        return T.send(cid, B.get(r['lang'], B['ru'])['help'])
    link = (T.sb('telegram_links?select=user_id,lang&chat_id=eq.%s&limit=1' % cid) or [None])[0]
    if not link:
        return T.send(cid, B['ru']['nolink'] + '\n\n' + B['en']['nolink'])
    try:
        handle_command(link, cid, text)
    except Exception:
        T.send(cid, B.get(link['lang'], B['ru'])['fail'])
