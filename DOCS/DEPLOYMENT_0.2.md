# Chipper 0.2 — восстановление однократного clean start

Владелец разрешил штатный выпуск и один адресный сброс игрового прогресса **@chipperhatcherybot / App ID 8924974998**. Дополнительное разрешение на эти шаги не требуется. Системные данные, настройки бота, секреты и сторонние ресурсы не затрагиваются.

По предоставленному владельцем логу Termux уже опубликован source **7fd2486d3233e6f560620017d00f478568cacb4d**, **cloud revision 2**, URL **https://app8924974998.tgcloud.ai/**. Проверки этого checkpoint: 161/161 тестов PASS. Это не подтверждение завершённого reset.

Последний подтверждённый владельцем шаг: recovery source **c2f87e5922b36ea616d3a90450532316edcacbad**, успешный **schema-only push, cloud revision 3**. Миграция добавила только объявленную receipt table: **added 1, skipped 0**. Последующий live dry-run PASS: appId=8924974998/@chipperhatcherybot, players=3, legacyPlayers=3, currentV2Players=0, jsonFunctionsReady=true, receiptTableReady=true, alreadyApplied=false, receipt=null. **Prepare/reset ещё не выполнены**: wrapper c2f87e5 отклонил штатную stderr строку CLI `- Checking schema...` до temporary endpoint/SQL-записей.

Для текущего владельческого checkout таблица уже готова; **повторный push/migrate не требуется**. После перехода на новый SHA исправления wrapper выполните только:

```bash
npm run check &&
node scripts/reset-game-v0.2.mjs --prepare &&
node scripts/reset-game-v0.2.mjs --apply &&
node scripts/reset-game-v0.2.mjs --dry-run &&
npx tgcloud fetch &&
npx tgcloud --no-pager status
```

Каждая команда запускается только после успеха предыдущей. Новый SHA — последний spinner-compatibility commit существующего PR#2/финальный отчёт. Изменения не затрагивают schema/gameplay runtime. До completed receipt и post-reset legacyPlayers0 очистка остаётся НЕ подтверждённой. Ниже сохранён полный runbook для ещё не подготовленной среды; не повторяйте выполненную миграцию текущего приложения.

Прежний helper отказал на первом SQL-чтении `sqlite_master`: `Failed to prepare query [23] not authorized`. Во всех показанных вызовах dry-run/prepare/apply ошибка возникла после проверки getMe, но **до любых SQL-записей**. Следовательно, старый helper не удалял профили и не создавал marker/trigger. Старые schemaVersion=1 пока могут получать RESET_REQUIRED, а новые V2 аккаунты могли появиться после публикации и должны сохраниться.

Исправленная процедура не читает каталог/PRAGMA и не создаёт DDL/triggers через SDK. Receipt table объявляется в `tgcloud/schema.js` и добавляется штатной миграцией CLI. Игровой DML использует только заранее известные таблицы/столбцы, JSON-capability probe и версионную границу удаления.

## 1. Получить исправленный immutable checkpoint

Используйте точный **SHA исправления из PR #2**, который передан в отчёте о восстановлении. Это новая версия helper; исходный опубликованный 7fd2486… содержит неподдерживаемое чтение каталога.

Для существующего clean checkout в Termux:

```bash
git fetch origin
```

Затем отдельно переключитесь на переданный SHA (`git switch --detach <SHA_исправления>`), проверьте `git rev-parse HEAD` и `git status --short`. Сохранённый CLI login остаётся под управлением CLI; credential-файлы не открывайте. Если worktree грязный, сначала разберите собственные изменения без force/reset. Helper prepare/apply требует clean worktree и сохраняет этот source SHA в плане операции.

Проверки кандидата запускаются последовательно с остановкой при первой ошибке:

```bash
npm ci && npm run check
```

UI при установленном Chromium запускается отдельно: `npm run test:ui`. Обычные UI artifacts пишутся в игнорируемый `test-results/qa`, не меняя tracked evidence. Только для ручного обновления снимков до commit используется `CHIPPER_CAPTURE_QA=1`; release checks выполняются без этой переменной. Отсутствие браузера в Termux не превращает UI check в PASS.

Не копируйте все фазы одним блоком. Не запускайте следующую фазу при ненулевом exit code или неожиданных предупреждениях. Команды внутри одной проверенной фазы можно соединять `&&`; обычные переносы строк в shell продолжают выполнение даже после ошибки.

## 2. Сначала только read-only diagnosis

```bash
node scripts/reset-game-v0.2.mjs --diagnose
```

Diagnose через административный `tgcloud run` выполняет getMe и прямые SELECT известных `chipper_players` столбцов, проверяет доступность нужных JSON-операторов, формат/версию/ownership агрегатов и доступность receipt table. Не выводит state_json, Telegram IDs или секреты. **Не пишет в БД.** До миграции новой таблицы допустим результат `receiptTableReady:false`; это не разрешение сразу запускать prepare/apply.

Проверьте точные App ID 8924974998 и @chipperhatcherybot. Неподдерживаемые SQL/JSON, повреждённые агрегаты, неизвестные schemaVersion или несогласованный владелец требуют разбора и блокируют изменяющие шаги. Не заменяйте их чтением системного каталога, прямым DDL, придуманными SQL CLI-командами или очисткой всей базы.

Для среды без предыдущей diagnosis сначала выполните только этот read-only шаг. В текущем владельческом приложении diagnosis/dry-run и миграция уже подтверждены указанным выше логом; продолжение — исправленный wrapper prepare/apply, без повторного push/migrate.

## 3. Добавить только объявленную receipt table

После успешной diagnosis и проверки актуального cloud snapshot:

```bash
npx tgcloud fetch && npx tgcloud --no-pager status && npx tgcloud --no-pager diff
```

Проверьте текущую revision и cloud diff. V2 уже опубликована; игровые модули должны оставаться единственными писателями schemaVersion=2. Неизвестные cloud-модули/изменения требуют разбора, без `--force` и без повторного полного deploy ради исправления helper.

Первая проверка схемы пока read-only:

```bash
npx tgcloud migrate --local --dry-run
```

Продолжение допустимо **только если план содержит ровно одно ожидаемое безопасное добавление `chipper_release_operations`** с объявленными в recovery source столбцами/constraints. Не должно быть DROP, изменения `chipper_players`, warning/manual изменений или необъяснимых операций над другими таблицами. Фактическую схему проверяет штатный CLI migration inspector, а не SDK catalog queries.

Опубликуйте только схему:

```bash
npx tgcloud push tgcloud/schema.js
```

Push печатает URL; cloud revision получается через последующие fetch/status. После успешного schema-only push отдельно изучите deployed migration plan:

```bash
npx tgcloud migrate --dry-run
```

Снова ожидается только та же новая receipt table. Лишь после проверки примените:

```bash
npx tgcloud migrate --safe
```

И независимо подтвердите окончательное состояние:

```bash
npx tgcloud migrate --dry-run
```

Последняя команда должна сообщить **`No schema changes`**. `--safe` с exit0 может пропустить warning/manual changes; такой результат сам по себе не подтверждает готовую схему. При оставшихся изменениях остановитесь до prepare. Не используйте `--yes`, `--force`, runtime CREATE TABLE/CREATE TRIGGER или удаление инфраструктуры.

## 4. Read-only dry-run и фиксированный prepared план

После подтверждённой миграции:

```bash
node scripts/reset-game-v0.2.mjs --dry-run
```

Dry-run требует готовую receipt table. Он показывает проверенный бот, агрегированные количества старых schemaVersion=1 и новых schemaVersion=2 игроков и состояние фиксированной операции `chipper-v0.2-clean-start`. Повреждённые/неизвестные форматы и ownership mismatch блокируют prepare/apply. Уже завершённый receipt означает, что повторный сброс не нужен.

Wrapper перед `--prepare` и `--apply` сам запускает supported `migrate --local --dry-run` pinned CLI0.2.0. После удаления ANSI разрешены только строка `No schema changes. Database is in sync with your local tgcloud/schema.js.` и необязательная `(diff computed against your local tgcloud/schema.js)`. Stderr допускается пустой или ровно одна штатная progress-строка `- Checking schema...` после удаления VT/ANSI и trim. Повтор этой строки, warning/error/любой другой stderr, иной stdout или ненулевой exit code прекращают операцию до temporary endpoint и записи в БД. При warnings/manual/pending schema или изменённом контракте CLI возникает RESET_SCHEMA_REVIEW_REQUIRED; guard не ослабляется ради продолжения.

Затем отдельно:

```bash
node scripts/reset-game-v0.2.mjs --prepare
```

Prepare записывает единственный **receipt со status='prepared' (pending план)** с фиксированным ключом, source SHA и `planned_legacy_players`; **игроков не удаляет**. Повтор с тем же планом безопасен; неизвестный или несовпадающий план не переопределяется. После pending запрещено возвращать код 0.1 или запускать любой writer schemaVersion=1. Применимость one-time fence зависит от того, что все текущие игровые писатели создают только V2.

## 5. Применить legacy-only очистку и подтвердить завершение

Только при корректном pending плане:

```bash
node scripts/reset-game-v0.2.mjs --apply
```

Apply повторно проверяет бот, агрегаты, ownership и pending receipt. Один SQL DELETE очищает **только строки `chipper_players`, чей JSON имеет schemaVersion=1**, с guard на существующий фиксированный pending план. Все V2 строки — в том числе созданные между публикацией 7fd2486… и reset — сохраняются. Игровые сущности 0.1 целиком находятся в удаляемом агрегате: птицы, яйца, баланс, таймеры, попытки, достижения и история операций.

После подтверждения нулевого количества legacy-строк отдельный CAS переводит receipt `prepared (pending) → completed`. **DELETE и metadata completion не являются одной транзакцией.** Безопасность повторов обеспечивает неизменяемая версионная граница: новые V2 профили не подходят под DELETE, а версия 1 больше не создаётся. При потере ответа после DELETE pending операция продолжается, видит ноль legacy и завершает metadata; повтор DELETE имеет нулевой эффект. Completed receipt блокирует дальнейшую очистку.

При неподдерживаемом DML или иной ошибке остановитесь; непроверенного destructive fallback нет. Pending receipt не удаляйте и не меняйте его key/source/count вручную. Текущий helper сохраняйте на том же immutable checkpoint для возобновления.

Завершающее подтверждение:

```bash
node scripts/reset-game-v0.2.mjs --dry-run
```

Ожидаются completed receipt, ноль legacy и сохранённые V2 записи. Далее отдельно:

```bash
npx tgcloud fetch && npx tgcloud --no-pager status
```

Запишите фактические source SHA, новую cloud revision, URL, planned legacy count, completed receipt и post-reset counts. До этих подтверждений **reset остаётся НЕ выполненным**. Обычные будущие deploy никогда не вызывают prepare/apply автоматически.

Temporary endpoint создаётся только локально для supported `tgcloud run`, удаляется в finally и не публикуется. Не запускайте push параллельно helper. При остатке файла после SIGKILL release gate отказывает; сначала проверьте завершение процесса и удалите только его temporary local файл.

## 6. Приёмка нескольких аккаунтов

- A — бывший schemaVersion=1 аккаунт: после подтверждённого reset закрыть/переоткрыть Mini App; новое onboarding, новое бесплатное яйцо, ноль прежних ресурсов/рекордов, новая V2 птица.
- B — уже созданный после публикации V2 аккаунт: его новая птица, баланс и прогресс сохраняются после recovery.
- C — новый аккаунт: независимый профиль и стартовое яйцо; повторный вход сохраняет прогресс.
- A1/A2 — две сессии A: одновременно care/hatch/finish, один подарок/питомец/бонус, чужие chickId/runId отклоняются.
- Android: fixed Home, походка/поворот/тап/корм/игра/сон, пять вкладок; внутренний Collection/Profile scroll и rename с клавиатурой.
- Flaps: активный персонаж, полёт/collision/results/restart, reward ≥2 с server time и cooldown20 ч, pause/background/TTL/выход. Темы, reduced-motion, звук/haptics и по доступности iOS/Desktop.

Browser fixtures и административный CLI ctx не являются signed Telegram acceptance. Эти проверки остаются PENDING owner до фактического выполнения.

## 7. Восстановление кода

После появления pending или completed receipt код 0.1 запрещён: он способен снова создавать версии 1 и нарушить reset fence. Используйте только проверенный V2 checkpoint/fix-forward, rebuild, fetch/status/diff и штатный push. До pending решение об откате требует отдельной оценки уже созданных V2 данных; исходный 0.1 SHA95fd2d13… не объявляется автоматически безопасным rollback. Receipt, новые профили и таблицы не удаляются.
