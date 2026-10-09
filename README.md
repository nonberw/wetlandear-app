# WetlandEar App

Веб-приложение (PWA) проекта WetlandEar: «пульс заповедника». https://app.wetlandear.tech. Русский и английский язык (переключатель вверху).

## Что умеет
- Запись с микрофона или загрузка аудио (телефон работает как виртуальная станция).
- Спектрограмма, поиск звуковых событий, усреднение нескольких фрагментов для длинных событий.
- Подсказки вида: BirdNET V2.4 с фильтром по месту (после входа через Google). Вид подставляется сам, человек подтверждает или правит.
- «Мои голоса»: подтверждённые фрагменты становятся образцами, по ним узнаются виды, которых нет в BirdNET (например пеликаны).
- Тип звука и тревоги: YAMNet (ветер, дождь, речь, техника, возможный выстрел).
- Уровни доверия: событие, модель предполагает, подтверждено человеком, эталон.
- Журнал с поиском и фильтрами, пульс, активность по часам, звуковой календарь, список видов, карта станций.
- Утренний отчёт: копирование, Telegram, PDF; автоматическая рассылка в Telegram (см. ниже).
- Аккаунт Google, профиль, синхронизация журнала (Supabase), выгрузки CSV и Darwin Core.

## Устройство
Без сборки: `index.html`, `css/`, `js/` (`i18n.js` + `i18n-en.js` языки, `dsp.js` звук, `store.js` данные, `sync.js` аккаунт и облако, `app.js` интерфейс, `extras.js` карта, журнал, отчёт), `sw.js` офлайн.
Сервер (Vercel Python): `api/identify.py` (BirdNET, YAMNet), `api/telegram.py` (вебхук бота), `api/morning.py` (ежедневная рассылка, cron 02:00 UTC = 07:00 Астана), общий код в `lib/tg.py`.
Модели в `models/` (см. `models/NOTICE.md`, лицензии моделей). База: `supabase/schema.sql`, защита строк (RLS) по пользователю.

## Telegram: разовая настройка
1. В Telegram создайте бота у @BotFather (`/newbot`), сохраните токен и имя бота.
2. В Supabase: Project Settings → API Keys → Secret keys → скопируйте ключ.
3. Запустите `powershell -ExecutionPolicy Bypass -File scripts\setup-telegram.ps1` (спросит токен и ключ скрытым вводом, сохранит их в Vercel, зарегистрирует вебхук, задеплоит).
4. Закоммитьте `js/config.js` (там только публичное имя бота).

## Дальше
Обучение собственного классификатора (нужен ключ Xeno-canto и 10-20 записей на вид, скрипты в папке models проекта), вопросы к журналу на естественном языке (нужен ключ LLM), определение без интернета, станции ESP32-S3 (BirdNET-Tiny Forge).

## Control from Telegram and from AI assistants (MCP)
Both act for one signed-in person on their own data. Shared logic: `lib/actions.py` (every query is filtered by the user id).

- **Telegram bot** (`api/telegram.py`, `lib/bot.py`): connect in the app (Profile > Telegram), then `/today`, `/week`, `/review` (confirm or reject events with buttons), `/recent`, `/species`, `/pulse`, `/alerts`, `/stations`, `/addstation`, `/confirm`, `/reject`, `/lang`, `/stop`, `/resume`, `/unlink`. Plain text is a question to the journal. Private chats only.
- **MCP server** (`api/mcp.py`, served at `https://app.wetlandear.tech/mcp`, Streamable HTTP): create a personal key in the app (Profile > AI assistants), then
  `claude mcp add --transport http wetlandear https://app.wetlandear.tech/mcp --header "Authorization: Bearer we_..."`.
  Tools: get_overview, list_events, list_species, get_alerts, morning_report, journal_summary, next_to_review, review_event, list_stations, add_station, update_station, remove_station. Only the SHA-256 of a key is stored.
- One-time database update: run `supabase/003_bot_and_mcp.sql` in the Supabase SQL editor (key table, narrow grants for the server role).

## Alerts, seasons, PDF, teams
- **Instant alerts** (`api/alert.py`): when the app syncs an event that looks like a gunshot or engine noise, the server re-checks it and writes to the person's Telegram and to teammates with alerts on. Switch in Profile > Telegram.
- **Seasons and years** (`js/more.js`, Calendar screen): events and confirmed species per month by year, first arrival of each species per year with the shift in days, activity by hour per season.
- **PDF report** (Report screen): choose a period, the app builds species, stations (with a plot), chart and alerts and opens the print dialog (Save as PDF). Nothing leaves the device.
- **Teams** (Profile > Team, `supabase/004_teams_and_alerts.sql`): organisations with owner, editor and viewer roles and a join code. Members share events, recordings and audio; editors may review events; every change of people goes through database functions. Run the SQL once (after 003).
