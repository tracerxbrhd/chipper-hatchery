# Chipper 0.2 — реализация Living Hatchery

Рабочая ветка `feature/chipper-v0.2` от актуального main. Реализация заменяет художественную систему 0.1 и grain mini-game; документы 0.1 оставлены историческими. Проверенный source checkpoint: `5ffea76c3d939c33779aab4d5522240c7480b7b5`. [PR #2](https://github.com/tracerxbrhd/chipper-hatchery/pull/2) открыт, merge не выполнен. Точные проверки — в acceptance report.

## Модули

| Направление | Реализация |
|---|---|
| Telegram/UI | feature detection swipe API, stable viewport/safe areas, .app fixed shell, внутренний scroll вторичных экранов, five-tab BottomDock, ScreenTransition, glass themes/fallback |
| Chick System 2.0 | Явные server-issued V2 genes, оригинальная геометрия/anchors, morphology registry, три стадии, reusable renderer и sprite adapter |
| Living World | Локальная bounded 2.5D модель, grounded gait, turn/walk/idle, серверный sleep/care приоритет, tap target и остановка hidden/reduced-motion |
| Chippster Flaps | Fixed-step physics, проходимые авторские препятствия, collision/scoring, cached sprite активной птицы, pause/resume/leave/result/restart |
| Serverless | schemaVersion=2, snapshot активной птицы в run, start/finish API, 2-sec reward minimum, 10-min TTL, score plausibility, 20h cooldown, CAS и durable receipts |
| Reset/release | scripts/reset-game-v0.2.mjs + scripts/lib/reset-v02.js; supported temporary CLI run, exact getMe/schema guards, non-destructive prepare до push, atomic marker+DELETE, cleanup, non-recurring execution |

## Данные и безопасность

Gameplay schema остаётся `chipper_players(telegram_id,revision,state_json)` с одним JSON агрегатом. Verified `ctx.initData.user.id` — единственный владелец. Чужие chick/run IDs отклоняются. Один conditional UPDATE сохраняет эффект и receipt, поэтому concurrent finish/hatch/care не дают второй ресурс. Старые schemaVersion=1 получают RESET_REQUIRED до разрешённого release reset. После очистки аккаунт становится новым; subsequent reload/deploy сохраняет V2.

Reset полностью вынесен из deployed gameplay. Он не вызывается bootstrap/deploy. Только administrative CLI helper создаёт локальный endpoint и удаляет его после run. Persistent `chipper_release_operations` защищает новую игру от повторной очистки, включая concurrent calls и lost response. Системные/сторонние данные остаются.

## Проверки и практические пределы

Точные последние команды и числа — [ACCEPTANCE_RESULT_0.2.md](ACCEPTANCE_RESULT_0.2.md). Reset проверен 20 настоящими local SQLite тестами (включая неразрушающий prepare/отказ capability до publish, A/B fresh onboarding, V2 hatch, rollback statement при отказе trigger и сохранение unrelated table). Это не live SQL proof.

Flaps score остаётся casual client statistic с sanity guard, без leaderboard/value и полноценного античита. Receipts сохраняются для replay safety; future compaction требует отдельного безопасного design. Не обещается одинаковый FPS на каждом WebView. Реальные жесты Telegram, keyboard/safe area на физическом Android/iOS и несколько signed аккаунтов проверяет владелец.

## Выпуск

Процедура и ручная приёмка: [DEPLOYMENT_0.2.md](DEPLOYMENT_0.2.md). На initial cloud audit CLI 0.2.0 сообщил `Not linked to a bot yet` / `No CLI access token found`. Поэтому cloud identity/revision, schema и reset не подтверждены; этот технический блокер должен оставаться в final report, пока реальная проверка не завершится успешно.
