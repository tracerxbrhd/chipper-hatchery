# Chipper 0.2 — фактическая приёмка и восстановление reset

**Статус: beta 0.2 опубликована, однократный сброс выполнен и подтверждён live логом владельца. Готово к приёмке владельцем.** Все три старых игровых профиля удалены; completed receipt сохранён. Cloud revision 3, URL https://app8924974998.tgcloud.ai/, webhook in-sync. Реальное onboarding/изоляция A/B/C и мобильная приёмка остаются PENDING owner.

| Поле | Фактическое значение |
|---|---|
| Ветка / PR | feature/chipper-v0.2 → main; [PR #2](https://github.com/tracerxbrhd/chipper-hatchery/pull/2) открыт, merge не выполнялся |
| Начальный main | 95fd2d13abbdbc394932ec249472147e496afca9 |
| Опубликованный владельцем source | **7fd2486d3233e6f560620017d00f478568cacb4d** |
| Источник live evidence | Логи владельца Termux: beta/schema deploy, prepare/apply/post-reset dry-run, fetch23 modules revision 3 и clean static/webhook status |
| Cloud revision | **3**, schema-only recovery source c2f87e5922b36ea616d3a90450532316edcacbad; исходная игровая beta опубликована в revision 2 |
| URL beta 0.2 | **https://app8924974998.tgcloud.ai/** |
| Serverless CLI | @tgcloud/cli 0.2.0; версия CLI не является cloud revision |
| Bot/App | @chipperhatcherybot / 8924974998 — live getMe/direct helper result PASS owner |
| Reset | **PASS live — owner:** planned legacy3 → players 0/legacy 0/V2=0, receipt status=completed, alreadyApplied=true |
| Source фактического reset | **cb4e83ac619435f09dc7969364c90defe18b5407**; новый финальный docs-only HEAD — в PR/финальном отчёте, execution receipt остаётся cb4e83a |
| Live recovery | Prepare/apply/final dry-run PASS; JSON и receipt ready, completed receipt. Fetch23 modules/revision 3; clean worktree,3 static files up-to-date, webhook in-sync |

## Подтверждённые проверки checkpoint 7fd2486…

Эти числа относятся к опубликованному checkpoint и не заменяют новый прогон recovery:

| Команда / область | Evidence checkpoint |
|---|---|
| npm ci / npm run check | PASS предыдущего quality gate; Termux владельца: 161/161 unit tests PASS |
| Unit tests | Исторический checkpoint: 161/161, 11 файлов; включая 20 тестов прежнего SQLite-trigger helper |
| Backend / CAS / экономика | Checkpoint:79 тестов — onboarding/V2 hatch/ownership/replay/награды/cooldown/TTL/отказ старого протокола |
| Chick geometry | Checkpoint:12 тестов —720 anchors combinations, eye contours,180 feed/preen extremes,90 age variants/13poses |
| World / Flaps / Telegram / client | Checkpoint:22+15+9+4 PASS |
| UI browser/synthetic bridge | Последний checkpoint:33/33 PASS,39,1 с; не является signed live Telegram приёмкой |
| GitHub Actions | Reset source cb4e83a: [run38361629720/#28](https://github.com/tracerxbrhd/chipper-hatchery/actions/runs/38361629720) **SUCCESS:186 unit+33 UI**. Финальная запись результата — docs-only, runtime/tests не изменены |
| Production isolation | Предыдущая сборка без dev adapter/gallery/synthetic identities/секретов; recovery не меняет frontend |
| Исторические 0.1 | Не изменены спецификации/отчёты и screenshots0.1 |

Оригинальные 20 SQLite reset тестов доказывали локальный механизм trigger, но **не** разрешение выполнять catalog SQL/DDL на Serverless. Они относятся к историческому checkpoint. Новый recovery final gate оркестратора: **npm run check PASS, 186/186 tests, 12 файлов** (141 прежних non-reset + 33 reset + 12 CLI-wrapper). Wrapper tests включают реальный offline child-process probe установленной CLI progress-строки и отказ duplicate progress. TypeScript/runtime syntax/imports, lint, build, production isolation и secret/history checks PASS. Frontend asset hashes не изменились; игровой/UI runtime не менялся, предыдущий 33/33 UI checkpoint сохраняет свой статус без утверждения о новом live UI прогоне.

Для прежнего UI gate использован временный Chromium153 без изменения production dependencies; штатный путь — `npx playwright install chromium`, опционально собственный CHIPPER_CHROMIUM_PATH. Browser fixtures и административный CLI ctx не подтверждают подпись настоящего Telegram initData/несколько живых аккаунтов.

## Подтверждение завершённого live сброса

На source `cb4e83ac619435f09dc7969364c90defe18b5407` владелец получил:

- Prepare:prepared=true, status=prepared, planned_legacy_players=3, remaining_legacy_players=3.
- Apply:applied=true, alreadyApplied=false; status=completed, remaining_legacy_players=0; currentPlayers=0, legacyPlayers=0, currentV2Players=0.
- Финальный dry-run:players=0, legacyPlayers=0, currentV2Players=0, jsonFunctionsReady=true, receiptTableReady=true, alreadyApplied=true; тот же completed receipt.
- Fetch:23 модуля, revision 3. Status:clean,3 static files up-to-date, webhook in-sync.

Сопоставление before 3 legacy/after 0 подтверждает удаление **всех трёх существовавших игровых профилей0.1**. На момент подтверждения V2 аккаунтов не было; будущий V2 прогресс сохраняется immutable version fence и completed receipt.

Безопасная aggregate receipt из лога, без частных Telegram IDs/секретов:

```json
{
  "release_key": "chipper-v0.2-clean-start",
  "status": "completed",
  "prepared_at": 1791875990577,
  "completed_at": 1791875998225,
  "planned_legacy_players": 3,
  "remaining_legacy_players": 0,
  "app_id": 8924974998,
  "bot_username": "chipperhatcherybot",
  "source_sha": "cb4e83ac619435f09dc7969364c90defe18b5407"
}
```

Серверные epoch соответствуют UTC prepared **2026-10-13T07:19:50.577Z**, completed **2026-10-13T07:19:58.225Z**. Это время сохранённого серверного receipt, а не предположение о часах устройства владельца.

Предыдущие ограничения устранены: catalog SELECT получил `Failed to prepare query [23] not authorized` до любых записей; затем штатный stderr progress `- Checking schema...` ошибочно блокировался wrapper до temporary endpoint. Recovery убрал catalog/DDL, добавил receipt штатной миграцией и поддержал точный CLI progress contract. Последний apply и completed receipt подтверждают фактический успешный переход.

## Исправленная процедура и текущие статусы

| Область | Текущий статус / ожидаемое подтверждение |
|---|---|
| Старый catalog/PRAGMA/runtime DDL | Исключаются из recovery helper; не использовать fallback через запрещённые системные таблицы |
| Read-only direct probe | PASS owner:app8924974998/@chipperhatcherybot, before 3 legacy → final0; JSON/receipt ready |
| Schema-only push + migrate | PASS owner:source c2f87e5/cloud revision 3; ровно новаяreceipt table added 1/skipped 0, final schema dry-run in-sync |
| --dry-run | PASS live owner:players 0/legacy 0/V2=0, alreadyApplied=true, completed receipt |
| --prepare | PASS live owner:fixedkey/status prepared/source cb4/planned 3, без удаления до apply |
| --apply | PASS live owner:applied=true, complete receipt remaining 0, все3legacy удалены, отдельный completion CAS |
| Recovery automated tests | PASS:33 actual SQLite reset tests + 12 CLI-wrapper (включая actual installed-CLI offline spinner probe и duplicateprogress rejection); полный gate 186/186, 12 файлов. Live DELETE подтверждён owner log |
| Replay / resume | PASS SQLite tests и final dry-run alreadyApplied=true; live lost-response injection не выполнялась |
| Подтверждение reset | PASS live owner:completed receipt, legacy 0, fetchrevision 3/23 modules/static3up-to-date/webhook in-sync |
| Реальные A/B/C/A1/A2 и Android/iOS | PENDING owner |

**DELETE и completion receipt не коммитятся одной транзакцией.** Новый дизайн использует один атомарный legacy-only DELETE и отдельный pending/completed metadata CAS. Ровно один эффект очистки обеспечивается фиксированной границей schemaVersion=1 и отсутствием писателей V1. Повтор после потери ответа может снова исполнить SQL, но уже не удалит никакой новый V2 профиль. После pending запрещено возвращать runtime 0.1 или очищать/переписывать receipt вручную.

Однократный runbook [DEPLOYMENT_0.2.md](DEPLOYMENT_0.2.md) завершён. Повторять prepare/apply/migration не требуется. Будущие штатные deploy:build/check → fetch/status/diff/review → push; fixed completed receipt никогда не удалять и не сбрасывать. Следующий шаг — только приёмка игры с реальных Telegram аккаунтов.

## Игровые критерии и визуальные evidence

На предыдущем automated checkpoint проверены пять вкладок/центральныйДом/fixed root/40birds internal scroll/keyboard height/темы/reduced motion; новая V2 morphology и неизменные genes; grounded walk/care/sleep/hidden lifecycle; Flaps pointer/physics/collision/results/restart/record/reward/retry/TTL/pause/leave; CAS и старые аккаунтные ответы.

`DOCS/qa/0.2`: Home light/dark320/360/390/430, Collection/Incubator/Profile, Flaps ready/playing/paused/result/cooldown,30originalbirds×3ages, extreme poses/bounds. `perf-smoke.json` —30 сек local headless smoke стабильности DOM/longtasks, не гарантия FPS физического WebView. Обычные tests пишут новую evidence в игнорируемый test-results/qa; намеренное каноническое обновление до commit — CHIPPER_CAPTURE_QA=1.

## Приёмка владельца после завершённого recovery

1. A со старым V1 прогрессом переоткрывает Mini App: первоначальное onboarding, новое яйцо, нулевой прежний баланс/рекорд, новая V2 птица.
2. B, если уже создан на опубликованной V2: его новые имя/питомец/ресурсы/рекорд сохранены после очистки V1.
3. C новый: независимый профиль; повторный вход не выдаёт второй starter.
4. A1/A2 одновременно повторяют hatch/care/finish: один результат/награда, ownership отказ на чужие IDs.
5. Android Home/навигация/scroll/keyboard, grounded movement/care/sleep; Flaps выбранный chick/input/collision/restart/record/cooldown/pause/background; темы/звук/haptics и по доступностиiOS/Desktop.

Каждый live пункт отмечается PASS только после реального выполнения. Deploy log и unit tests не заменяют эту приёмку.

## Практические пределы

- Beta 0.2, schema migration и clean-start подтверждены; completed receipt фиксирован. Осталась signed multi-account/mobile приёмка владельца.
- После pending/completed только V2 checkpoint/fix-forward; runtime 0.1 нарушит version fence. До pending возможный откат также требует оценки уже существующих V2 профилей.
- ScoreFlaps casual с plausibility bounds, без полноценного античита/публичного рейтинга; durable receipts требуют future safe compaction.
- PNG share из необязательногоP1 не реализован; реальные Telegram жесты и multi-account acceptance PENDING.

Настоящие субагенты UI, Art, World, Flaps, Backend, Release/QA и integration reviewer выполнили initial implementation. Recovery выделена отдельно: schema/DML design, CLI/Termux audit и документация; игровой runtime не заменяется ради обхода доступа к системному каталогу.
