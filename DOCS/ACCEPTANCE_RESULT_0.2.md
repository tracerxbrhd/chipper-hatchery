# Chipper 0.2 — фактическая приёмка и восстановление reset

**Статус: beta 0.2 опубликована владельцем; однократный reset НЕ завершён.** Рабочий код/сайт подтверждены логом Termux. Старый helper столкнулся с запретом SDK catalog SQL; исправляется административная процедура, игровые модули V2 остаются опубликованными. Дополнительное разрешение на штатные recovery шаги не требуется; неподдерживаемые SQL/DML остаются техническим блокером.

| Поле | Фактическое значение |
|---|---|
| Ветка / PR | feature/chipper-v0.2 → main; [PR #2](https://github.com/tracerxbrhd/chipper-hatchery/pull/2) открыт, merge не выполнялся |
| Начальный main | 95fd2d13abbdbc394932ec249472147e496afca9 |
| Опубликованный владельцем source | **7fd2486d3233e6f560620017d00f478568cacb4d** |
| Источник live evidence | Предоставленный владельцем лог Termux: успешный push, revision 2, URL и 161/161 PASS |
| Cloud revision опубликованной beta | **2**; новая revision schema-only recovery пока не получена |
| URL beta 0.2 | **https://app8924974998.tgcloud.ai/** |
| Serverless CLI | @tgcloud/cli 0.2.0; версия CLI не является cloud revision |
| Bot/App | @chipperhatcherybot / 8924974998; прежний helper прошёл getMe guard до первого SQL отказа |
| Reset | **НЕ выполнен**; старые dry-run/prepare/apply завершились до SQL-записей |
| Recovery checkpoint | Точный immutable SHA исправления — в последнем recovery commit [PR #2](https://github.com/tracerxbrhd/chipper-hatchery/pull/2/commits); его передаёт финальный отчёт. Self-reference SHA внутри того же commit не используется |
| Live recovery | Read-only diagnosis, миграция receipt table и version-fenced DML пока не подтверждены |

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
| GitHub Actions | Фактический итог исправления — [PR Checks](https://github.com/tracerxbrhd/chipper-hatchery/pull/2/checks); не приписывать старый CI PASS новому SHA |
| Production isolation | Предыдущая сборка без dev adapter/gallery/synthetic identities/секретов; recovery не меняет frontend |
| Исторические 0.1 | Не изменены спецификации/отчёты и screenshots0.1 |

Оригинальные 20 SQLite reset тестов доказывали локальный механизм trigger, но **не** разрешение выполнять catalog SQL/DDL на Serverless. Они относятся к историческому checkpoint. Новый recovery final gate оркестратора: **npm run check PASS, 184/184 tests, 12 файлов** (141 прежних non-reset + 33 новых reset + 10 CLI-wrapper). TypeScript/runtime syntax/imports, lint, build, production isolation и secret/history checks PASS. Frontend asset hashes не изменились; игровой/UI runtime не менялся, предыдущий 33/33 UI checkpoint сохраняет свой статус без утверждения о новом live UI прогоне.

Для прежнего UI gate использован временный Chromium153 без изменения production dependencies; штатный путь — `npx playwright install chromium`, опционально собственный CHIPPER_CHROMIUM_PATH. Browser fixtures и административный CLI ctx не подтверждают подпись настоящего Telegram initData/несколько живых аккаунтов.

## Причина отказа и что не было удалено

Во всех показанных старых вызовах первая SQL-команда `SELECT ... FROM sqlite_master` получила:

`Failed to prepare query [23] not authorized`.

По порядку выполнения кода 7fd2486… это произошло после getMe identity guard, **до CREATE TABLE/CREATE TRIGGER/INSERT/DELETE**. Вывод о нулевых удалениях основан на этой трассе и проверенном порядке кода; aggregate counts старой БД таким отказом не измерены. Ошибка не означает, что безопасно выполнять последующие команды: shell с обычными переносами строк продолжал старые вызовы после неуспешного шага.

V2 опубликована в cloud revision 2. Старые schemaVersion=1 до успешной очистки получают RESET_REQUIRED. Новые V2 игроки, которые могли появиться после публикации, сохраняются новой recovery-процедурой.

## Исправленная процедура и текущие статусы

| Область | Текущий статус / ожидаемое подтверждение |
|---|---|
| Старый catalog/PRAGMA/runtime DDL | Исключаются из recovery helper; не использовать fallback через запрещённые системные таблицы |
| --diagnose | PENDING live: read-only getMe, известные столбцы/aggregate counts, JSON capability и receiptTableReady; до миграции false допустимо |
| Schema-only push + migrate | PENDING live: только новая объявленная chipper_release_operations; --safe применяется после проверенного plan, последний dry-run обязан No schema changes |
| --dry-run | PENDING live: receipt table уже обязательна, valid known JSON/schema/ownership, countsV1/V2 и фиксированный receipt |
| --prepare | PENDING live; automated PASS:status='prepared' (pending план) key/source SHA/planned_legacy_players, schema guard exact CLI output/empty stderr, без изменения игроков |
| --apply | PENDING live: один atomic DELETE только schemaVersion=1 под guard на status='prepared'; отдельно completed metadata CAS после нуля legacy |
| Recovery automated tests | PASS:33 actual SQLite reset tests с запрещёнными catalog/PRAGMA/DDL и разрешённым DML + 10 CLI-wrapper tests; полный gate 184/184,12 файлов |
| Replay / resume | PASS отдельных SQLite tests; live DML PENDING. Immutable version fence сохраняет V2 при lost response, concurrent calls и незавершённом completion |
| Подтверждение reset | PENDING live: completed receipt, legacy count0, сохранённые V2, post-run cloud fetch/status |
| Реальные A/B/C/A1/A2 и Android/iOS | PENDING owner |

**DELETE и completion receipt не коммитятся одной транзакцией.** Новый дизайн использует один атомарный legacy-only DELETE и отдельный pending/completed metadata CAS. Ровно один эффект очистки обеспечивается фиксированной границей schemaVersion=1 и отсутствием писателей V1. Повтор после потери ответа может снова исполнить SQL, но уже не удалит никакой новый V2 профиль. После pending запрещено возвращать runtime 0.1 или очищать/переписывать receipt вручную.

Точный staged runbook: [DEPLOYMENT_0.2.md](DEPLOYMENT_0.2.md). Сейчас владельцу передаётся **только read-only --diagnose**. Следующие фазы выполняются после разбора его результата, без force/--yes и без destructive fallback.

## Игровые критерии и визуальные evidence

На предыдущем automated checkpoint проверены пять вкладок/центральныйДом/fixed root/40birds internal scroll/keyboard height/темы/reduced motion; новая V2 morphology и неизменные genes; grounded walk/care/sleep/hidden lifecycle; Flaps pointer/physics/collision/results/restart/record/reward/retry/TTL/pause/leave; CAS и старые аккаунтные ответы.

`DOCS/qa/0.2`: Home light/dark320/360/390/430, Collection/Incubator/Profile, Flaps ready/playing/paused/result/cooldown,30originalbirds×3ages, extreme poses/bounds. `perf-smoke.json` —30 сек local headless smoke стабильности DOM/longtasks, не гарантия FPS физического WebView. Обычные tests пишут новую evidence в игнорируемый test-results/qa; намеренное каноническое обновление до commit — CHIPPER_CAPTURE_QA=1.

## Приёмка после подтверждённого recovery

1. A со старым V1 прогрессом переоткрывает Mini App: первоначальное onboarding, новое яйцо, нулевой прежний баланс/рекорд, новая V2 птица.
2. B, если уже создан на опубликованной V2: его новые имя/питомец/ресурсы/рекорд сохранены после очистки V1.
3. C новый: независимый профиль; повторный вход не выдаёт второй starter.
4. A1/A2 одновременно повторяют hatch/care/finish: один результат/награда, ownership отказ на чужие IDs.
5. Android Home/навигация/scroll/keyboard, grounded movement/care/sleep; Flaps выбранный chick/input/collision/restart/record/cooldown/pause/background; темы/звук/haptics и по доступностиiOS/Desktop.

Каждый live пункт отмечается PASS только после реального выполнения. Deploy log и unit tests не заменяют эту приёмку.

## Практические пределы

- Beta 0.2 опубликована, но clean-start transition пока не завершён. Новый live DML и receipt migration не подтверждены.
- После pending/completed только V2 checkpoint/fix-forward; runtime 0.1 нарушит version fence. До pending возможный откат также требует оценки уже существующих V2 профилей.
- ScoreFlaps casual с plausibility bounds, без полноценного античита/публичного рейтинга; durable receipts требуют future safe compaction.
- PNG share из необязательногоP1 не реализован; реальные Telegram жесты и multi-account acceptance PENDING.

Настоящие субагенты UI, Art, World, Flaps, Backend, Release/QA и integration reviewer выполнили initial implementation. Recovery выделена отдельно: schema/DML design, CLI/Termux audit и документация; игровой runtime не заменяется ради обхода доступа к системному каталогу.
