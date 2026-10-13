# Chipper 0.2 — фактическая приёмка и восстановление reset

**Статус: beta 0.2 опубликована владельцем; однократный reset НЕ завершён.** Рабочий код/сайт подтверждены логом Termux. Catalog SQL заменён supported schema migration и direct DML. Receipt table уже добавлена в revision 3; live dry-run PASS. Последний wrapper guard отказал на штатном CLI progress stderr до записи; исправляется только его pinned output contract, игровые модули V2 остаются опубликованными. Дополнительное разрешение на штатные recovery шаги не требуется; неподдерживаемые SQL/DML остаются техническим блокером.

| Поле | Фактическое значение |
|---|---|
| Ветка / PR | feature/chipper-v0.2 → main; [PR #2](https://github.com/tracerxbrhd/chipper-hatchery/pull/2) открыт, merge не выполнялся |
| Начальный main | 95fd2d13abbdbc394932ec249472147e496afca9 |
| Опубликованный владельцем source | **7fd2486d3233e6f560620017d00f478568cacb4d** |
| Источник live evidence | Логи владельца Termux: initial beta revision 2/161PASS; затем c2f87e5 schema-only revision 3, migration added 1/skipped 0 и direct dry-run PASS |
| Cloud revision | **3**, schema-only recovery source c2f87e5922b36ea616d3a90450532316edcacbad; исходная игровая beta опубликована в revision 2 |
| URL beta 0.2 | **https://app8924974998.tgcloud.ai/** |
| Serverless CLI | @tgcloud/cli 0.2.0; версия CLI не является cloud revision |
| Bot/App | @chipperhatcherybot / 8924974998; прежний helper прошёл getMe guard до первого SQL отказа |
| Reset | **НЕ выполнен**; receipt=null. Последний prepare заблокирован wrapper до temporary endpoint/SQL-записей |
| Recovery checkpoint | Точный immutable SHA исправления — в последнем recovery commit [PR #2](https://github.com/tracerxbrhd/chipper-hatchery/pull/2/commits); его передаёт финальный отчёт. Self-reference SHA внутри того же commit не используется |
| Live recovery | Receipt migration и read-only dry-run PASS; players=3/legacy 3/V2=0/JSON ready/receiptTableReady=true. Prepare и destructive DML PENDING |

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
| GitHub Actions | Recovery c2f87e5: [run 38359684457/#26](https://github.com/tracerxbrhd/chipper-hatchery/actions/runs/38359684457) SUCCESS,184 unit +33 UI. CI нового spinner-fix commit PENDING; не переносить прежний PASS на новый SHA |
| Production isolation | Предыдущая сборка без dev adapter/gallery/synthetic identities/секретов; recovery не меняет frontend |
| Исторические 0.1 | Не изменены спецификации/отчёты и screenshots0.1 |

Оригинальные 20 SQLite reset тестов доказывали локальный механизм trigger, но **не** разрешение выполнять catalog SQL/DDL на Serverless. Они относятся к историческому checkpoint. Новый recovery final gate оркестратора: **npm run check PASS, 186/186 tests, 12 файлов** (141 прежних non-reset + 33 reset + 12 CLI-wrapper). Wrapper tests включают реальный offline child-process probe установленной CLI progress-строки и отказ duplicate progress. TypeScript/runtime syntax/imports, lint, build, production isolation и secret/history checks PASS. Frontend asset hashes не изменились; игровой/UI runtime не менялся, предыдущий 33/33 UI checkpoint сохраняет свой статус без утверждения о новом live UI прогоне.

Для прежнего UI gate использован временный Chromium153 без изменения production dependencies; штатный путь — `npx playwright install chromium`, опционально собственный CHIPPER_CHROMIUM_PATH. Browser fixtures и административный CLI ctx не подтверждают подпись настоящего Telegram initData/несколько живых аккаунтов.

## Причина отказа и что не было удалено

Во всех показанных старых вызовах первая SQL-команда `SELECT ... FROM sqlite_master` получила:

`Failed to prepare query [23] not authorized`.

По порядку выполнения кода 7fd2486… это произошло после getMe identity guard, **до CREATE TABLE/CREATE TRIGGER/INSERT/DELETE**. Вывод о нулевых удалениях основан на этой трассе и проверенном порядке кода; aggregate counts старой БД таким отказом не измерены. Ошибка не означает, что безопасно выполнять последующие команды: shell с обычными переносами строк продолжал старые вызовы после неуспешного шага.

Игровая V2 первоначально опубликована в revision 2; новаяreceipt schema опубликована отдельно в revision 3. Старые schemaVersion=1 до успешной очистки получают RESET_REQUIRED. Новые V2 игроки, которые могли появиться после публикации, сохраняются новой recovery-процедурой.

## Последний live probe и причина wrapper отказа

Владелец подтвердил schema-only source c2f87e5/cloud revision 3 и миграцию единственной новой receipt table: added 1/skipped 0. Live dry-run: правильный app/bot, players=3, legacyPlayers=3, currentV2Players=0, jsonFunctionsReady=true, receiptTableReady=true, alreadyApplied=false, receipt=null. Это подтверждает прямое чтение/JSON/готовность схемы, но не DELETE permission или completed reset.

Prepare c2f87e5 отказал на защитном wrapper guard: штатный pinned CLI0.2.0 записал в stderr **`- Checking schema...`**. Отказ произошёл до temporary endpoint/receipt INSERT; все 3 legacy профиля ещё предстоит очистить, prepared receipt отсутствует. Новый wrapper разрешает только пустой stderr либо точную одну эту progress-строку после VT/ANSI-strip+trim; duplicate progress/warning/error/прочие строки всё ещё блокируют запись.

## Исправленная процедура и текущие статусы

| Область | Текущий статус / ожидаемое подтверждение |
|---|---|
| Старый catalog/PRAGMA/runtime DDL | Исключаются из recovery helper; не использовать fallback через запрещённые системные таблицы |
| Read-only direct probe | PASS owner:app8924974998/@chipperhatcherybot, players=3/legacy 3/V2=0, JSON functions ready, receipt table ready |
| Schema-only push + migrate | PASS owner:source c2f87e5/cloud revision 3; ровно новаяreceipt table added 1/skipped 0, final schema dry-run in-sync |
| --dry-run | PASS owner:players=3/legacy 3/V2=0, alreadyApplied=false, receipt=null; unknown JSON/schema/ownership не обнаружены |
| --prepare | BLOCKED c2f87e5 wrapper progress-stderr mismatch до записи; повтор новым wrapper PENDING. Contract:exact schema stdout + empty/singleton '- Checking schema...' stderr |
| --apply | PENDING live: один atomic DELETE только schemaVersion=1 под guard на status='prepared'; отдельно completed metadata CAS после нуля legacy |
| Recovery automated tests | PASS:33 actual SQLite reset tests + 12 CLI-wrapper (включая actual installed-CLI offline spinner probe и duplicateprogress rejection); полный gate 186/186, 12 файлов. Live DELETE всё ещё PENDING |
| Replay / resume | PASS отдельных SQLite tests; live DML PENDING. Immutable version fence сохраняет V2 при lost response, concurrent calls и незавершённом completion |
| Подтверждение reset | PENDING live: completed receipt, legacy count0, сохранённые V2, post-run cloud fetch/status |
| Реальные A/B/C/A1/A2 и Android/iOS | PENDING owner |

**DELETE и completion receipt не коммитятся одной транзакцией.** Новый дизайн использует один атомарный legacy-only DELETE и отдельный pending/completed metadata CAS. Ровно один эффект очистки обеспечивается фиксированной границей schemaVersion=1 и отсутствием писателей V1. Повтор после потери ответа может снова исполнить SQL, но уже не удалит никакой новый V2 профиль. После pending запрещено возвращать runtime 0.1 или очищать/переписывать receipt вручную.

Точный staged runbook: [DEPLOYMENT_0.2.md](DEPLOYMENT_0.2.md). Diagnosis/dry-run и migration уже подтверждены. Следующий шаг владельца: checkout нового spinner-fix SHA, npm run check && prepare && apply && dry-run && fetch/status, с остановкой при первой ошибке. Повторный push/migrate не нужен; без force/--yes/destructive fallback.

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

- Beta0.2 и receipt migration подтверждены в cloud revision 3; clean-start transition пока не завершён. Live DELETE/completion PENDING, prepared receipt отсутствует.
- После pending/completed только V2 checkpoint/fix-forward; runtime 0.1 нарушит version fence. До pending возможный откат также требует оценки уже существующих V2 профилей.
- ScoreFlaps casual с plausibility bounds, без полноценного античита/публичного рейтинга; durable receipts требуют future safe compaction.
- PNG share из необязательногоP1 не реализован; реальные Telegram жесты и multi-account acceptance PENDING.

Настоящие субагенты UI, Art, World, Flaps, Backend, Release/QA и integration reviewer выполнили initial implementation. Recovery выделена отдельно: schema/DML design, CLI/Termux audit и документация; игровой runtime не заменяется ради обхода доступа к системному каталогу.
