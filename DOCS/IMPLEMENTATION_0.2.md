# Chipper 0.2 — реализация Living Hatchery

Рабочая ветка `feature/chipper-v0.2` от актуального main. Реализация заменяет художественную систему 0.1 и grain mini-game; документы 0.1 оставлены историческими. Опубликованный владельцем source checkpoint: `7fd2486d3233e6f560620017d00f478568cacb4d`, cloud revision 2, https://app8924974998.tgcloud.ai/. Recovery helper/schema получает отдельный проверенный SHA. [PR #2](https://github.com/tracerxbrhd/chipper-hatchery/pull/2) открыт, merge не выполнен. Точные проверки — в acceptance report.

## Модули

| Направление | Реализация |
|---|---|
| Telegram/UI | feature detection swipe API, stable viewport/safe areas, .app fixed shell, внутренний scroll вторичных экранов, five-tab BottomDock, ScreenTransition, glass themes/fallback |
| Chick System 2.0 | Явные server-issued V2 genes, оригинальная геометрия/anchors, morphology registry, три стадии, reusable renderer и sprite adapter |
| Living World | Локальная bounded 2.5D модель, grounded gait, turn/walk/idle, серверный sleep/care приоритет, tap target и остановка hidden/reduced-motion |
| Chippster Flaps | Fixed-step physics, проходимые авторские препятствия, collision/scoring, cached sprite активной птицы, pause/resume/leave/result/restart |
| Serverless | schemaVersion=2, snapshot активной птицы в run, start/finish API, 2-sec reward minimum, 10-min TTL, score plausibility, 20h cooldown, CAS и durable receipts |
| Reset/release | scripts/reset-game-v0.2.mjs + scripts/lib/reset-v02.js; temporary CLI run, direct-column/JSON/ownership guards, schema-declared receipt table, pending plan, immutable V1-only DELETE fence, completed CAS; без catalog/PRAGMA/runtime DDL |

## Данные и безопасность

Gameplay schema остаётся `chipper_players(telegram_id,revision,state_json)` с одним JSON агрегатом. Verified `ctx.initData.user.id` — единственный владелец. Чужие chick/run IDs отклоняются. Один conditional UPDATE сохраняет эффект и receipt, поэтому concurrent finish/hatch/care не дают второй ресурс. Старые schemaVersion=1 получают RESET_REQUIRED до разрешённого release reset. После очистки аккаунт становится новым; subsequent reload/deploy сохраняет V2.

Reset вынесен из deployed gameplay, не вызывается bootstrap/deploy. Administrative helper создаёт локальный endpoint только для tgcloud run и удаляет в finally. Новая `chipper_release_operations` добавляется штатным schema-only push и migrate --safe после проверки единственного ожидаемого safe-addition, без изменения chipper_players.

Исправленный recovery: read-only diagnose → schema migration → dry-run → prepare status='prepared' (pending план key/source SHA/planned_legacy_players) → atomic DELETE только JSON schemaVersion=1 под guard на status='prepared' → подтверждение нуля legacy → отдельный completion CAS. DELETE и metadata receipt не являются общей транзакцией. Replay/lost response безопасны благодаря immutable version fence: V2 никогда не подходят под очистку, а опубликованные игровые writer создают только V2. После pending нельзя возвращать runtime 0.1. Новые V2 аккаунты, которые могли появиться между публикацией и очисткой V1, сохраняются. Неизвестный JSON/schema/ownership блокирует изменяющие шаги; системные/сторонние данные остаются.

## Проверки и практические пределы

Точные команды и counts — [ACCEPTANCE_RESULT_0.2.md](ACCEPTANCE_RESULT_0.2.md). Checkpoint 7fd2486…:161/161 unit PASS в логе Termux владельца, initial UI 33/33 PASS. Прежние 20 local SQLite-trigger tests относятся только к историческому checkpoint и не подтверждают разрешение catalog/DDL на Serverless. Новый recovery final gate:184/184 tests PASS, 12 файлов (141 non-reset + 33 reset + 10 CLI-wrapper), TypeScript/lint/build/production/secret checks PASS. Точный SHA — последний recovery commit существующего PR#2 и финальный отчёт; frontend asset hashes не изменились.

Flaps score остаётся casual client statistic с sanity guard, без leaderboard/value и полноценного античита. Receipts сохраняются для replay safety; future compaction требует отдельного безопасного design. Не обещается одинаковый FPS на каждом WebView. Реальные жесты Telegram, keyboard/safe area на физическом Android/iOS и несколько signed аккаунтов проверяет владелец.

## Выпуск

Процедура и ручная приёмка: [DEPLOYMENT_0.2.md](DEPLOYMENT_0.2.md). По логу владельца beta опубликована на cloud revision 2; прежний helper dry-run/prepare/apply отказал на первом SELECT sqlite_master с `Failed to prepare query [23] not authorized`, до любых SQL-записей. GetMe guard прошёл. **Reset не выполнен**. Следующий live шаг только read-only --diagnose исправленного checkpoint; receipt migration и DML пока pending. Отсутствие токена в первоначальной среде оркестратора больше не означает отсутствие deploy владельца.
