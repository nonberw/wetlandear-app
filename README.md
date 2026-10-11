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

## Reports, species card, science export, activity log
- **Weekly and monthly digests** (`lib/report.py`, `api/morning.py`): Monday morning a week digest, on the 1st a month digest with a PDF (reportlab, bundled DejaVu fonts), compared with the previous period. Bot: `/week`, `/month`, `/pdf`, `/pdf month`.
- **MCP**: `period_report` (facts for a report written by the assistant) and `export_occurrences` (Darwin Core or eBird CSV).
- **Species card** (tap a species in the life list or the season tables): photo and text from Wikipedia (REST summary API, cached), your own records, stations and hours.
- **Export for science** (Data screen): Darwin Core (GBIF) and eBird record format built on the device from confirmed events; coordinates can be rounded to 0.1 degree for rare species. `js/species-sci.js` (scientific names) is generated from `models/head.npz` by `make_species_js.py` in wetlandear-ml.
- **Activity log** (Profile > Team): who confirmed, rejected or corrected which event (`supabase/005_review_log.sql`, trigger on detections).

## Works without internet, soundscape indices, dawn chorus clock
- **On-device recognition** (`js/offline.js`, `js/offline-ui.js`, `js/vendor/litert/`): BirdNET V2.4, its location filter and YAMNet run in the browser through LiteRT.js (Apache-2.0, WebAssembly); the WetlandEar head (`models/head_web.json/.bin`, made by `make_head_web.py`) is applied on top. Same steps and same results as `api/identify.py` (checked on three real recordings: identical species, confidences and head output; the 1024-number fingerprint differs by at most 0.002 because of float16). About 46 MB are downloaded once into the browser cache (More > Works without internet). The BirdNET model file lists the fingerprint as a second output (`make_web_model.py` patches it at byte level), which the server reads exactly as before. Roughly 0.3-0.4 s per 3-second fragment on a desktop CPU.
- **Soundscape indices** (`js/soundscape.js`): ACI, NDSI, BI and H are computed from the spectrogram of each analysed recording (10 s or longer) and stored with it (`recordings.idx`, `supabase/007_soundscape_indices.sql`); trend by days and by month, CSV export.
- **Dawn chorus clock**: one ring per species, hours of the day around the circle, today's night and day from the station coordinates, animated sweep of the 24 hours.

## Operations for reserves (migration `supabase/008_operations.sql`)
Run `008_operations.sql` once in the Supabase SQL editor. Everything below also works partly without it (the screens say what is missing).
- **Quick actions** (`js/quick.js`): the round "+" button and Ctrl+K open one panel with what a person wants to do; typing narrows the list.
- **Science and records** (`js/science.js`): phenology by year with "last heard" notes and CSV, indicator species (10 to 20, one weekly curve against last year), station registry (alive or silent, who is in charge, memory card date). Indicators and station notes sync through `shared_prefs`.
- **Sensitive species** (`js/privacy.js`, mirrored in `lib/pub.py`): exports round the coordinates of rare and nest-sensitive species to 0.1 degree when protection is on, and public pages hide those species completely. The list is a default for Kazakhstan, not the official Red Book.
- **Archive labelling** (`js/batch.js`): upload a folder, get a CSV "time, species, confidence". Files longer than 5 minutes are processed only in their first 5 minutes (a browser limit).
- **Management** (`js/manage.js`): tasks for rangers (closed with a note and a photo shrunk on the device), expert review by link (`/expert?t=TOKEN`, `api/expert.py`: the expert needs no account, answers once, the owner decides whether to apply it), public pages and sponsor reports (`/live?t=TOKEN`, `api/public.py`: no coordinates, no names, no sensitive species, can be switched off) with printable QR placards (`js/vendor/qrcode.js`, MIT), branches under one umbrella (`umbrella_overview`: numbers only).
- **Weekly brief** (`lib/brief.py`, sent by `api/morning.py` on Mondays): three numbers and up to three events, to Telegram and, when the person switched it on, by e-mail. E-mail needs `RESEND_API_KEY` (and `RESEND_FROM` with a verified sender, otherwise Resend only delivers to its owner) in the Vercel environment. Without them only Telegram is used.

## Protection, evidence log, network of reserves, voice (migration `supabase/009_guard_and_network.sql`)
Run `009` once in the Supabase SQL editor (after 008). Without it the app still works; the evidence log and the network show a short message instead.
- **Model accuracy at your own reserve** (`js/quality.js`, Science): top-1 / top-3 agreement over events a person reviewed, Wilson 95% interval, calibration, per-species confusion, monthly trend, CSV. Review queue puts the most useful events first (unsure model, species with few reviews, possible threats). An optional local species-frequency correction is offered only if a leave-one-out test on your own events shows it helps and does not hurt rare species.
- **Protection** (`js/guard.js`, More > Protection): alerts by hour and weekday (heat map), best 3-hour patrol window, busiest station, map, a person's verdict per alert (`detections.threat_review`: violation / false alarm), CSV.
- **Evidence log** (`api/evidence.py`, `lib/evidence.py`, table `evidence_log`): "Add to evidence log" on an alert. The server hashes the stored clip itself, adds the event data and the weather (Open-Meteo), and appends a record to a per-owner hash chain: `chain_hash = sha256(prev_hash | audio_sha256 | payload_text)`, computed by a database trigger. Update, delete and truncate are blocked by triggers; only the server (service role) can insert. PDF record with QR, WAV only if it still matches the hash, public `?verify=ID` (no content), `?verify=chain` for the whole chain. It makes tampering visible; it does not replace the legal procedure for recording a violation.
- **Network of reserves** (`js/network.js`, Manage; `network_publish`, `network_view`, `network_stats`): opt-in. A reserve shares weekly counts of confirmed species, the place cut to a one-degree cell (about 110 km), no names, no coordinates, nest-sensitive and rare species dropped both in the app and in SQL. Only members can read the shared view ("cranes are already 300 km away").
- **Voice assistant** (`js/assistant.js`, round microphone button): hands-free commands in Russian, English and Kazakh (open a screen, ask what was heard today, latest detection, alerts, review queue; in review: listen, confirm, wrong, skip, it reads the next event). Speech input uses the browser's Web Speech API; in Chrome the sound goes to Google, so the first start asks for consent. Every command can also be typed. Answers are spoken with the best voice the browser offers (neural "Natural" voices first, picker in the panel).
- **Neural voice for the assistant** (`js/piper.js`, `js/piper-worker.js`, `js/vendor/piper/`, see `NOTICE.txt` there for licences): optional, chosen in the assistant panel. Piper VITS voices (ru Denis and Dmitri, kk ISSAI and Raya, en Hi-Fi Captain) download once from huggingface.co (28 to 128 MB plus the 29 MB engine), are stored in Cache Storage (`we-voice-1`) and then speak offline: text to phonemes (espeak-ng in WebAssembly) to the VITS model in onnxruntime-web, in a worker, one thread. About 0.7 s of compute per second of speech on a laptop. The CSP allows `huggingface.co`, `*.hf.co` for this download only. The English voice is CC BY-NC-SA (non-commercial). If the neural voice fails the assistant falls back to the system voice.
