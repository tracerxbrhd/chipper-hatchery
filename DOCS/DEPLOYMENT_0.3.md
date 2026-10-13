# Chipper 0.3 — безопасный выпуск беты

**Текущий результат:** cloud write не выполнялся. `tgcloud fetch` и `migrate --local --dry-run` отказали с `No CLI access token found`. Нельзя подтвердить текущую revision, getMe, cloud schema, completed receipt или cloud SQL capabilities. Следующие шаги нужны на авторизованной машине владельца. PR не мержить автоматически.

Цель строго `@chipperhatcherybot`, App/Bot ID `8924974998`. Нового reset нет. Не запускать `reset-game-v0.2.mjs`, не удалять `chipper-v0.2-clean-start`, не читать credential-файлы вручную. Не использовать `--force`, `--yes`, runtime DDL или очистку players.

## 1. Зафиксировать проверенный источник

Получить ветку PR штатным `git fetch origin`, переключиться на `feature/chipper-v0.3`. Проверить `git rev-parse HEAD` и `git status --short`. Рабочая папка должна быть чистой; сохранить SHA. Runtime checkpoint и результаты приведены в [ACCEPTANCE_RESULT_0.3.md](ACCEPTANCE_RESULT_0.3.md).

На Node24:

```bash
npm ci
npm run check
npx playwright install chromium
npm run test:ui
```

Остановиться при первой ошибке; команды UI запускать без `CHIPPER_CAPTURE_QA`. После tests/build снова проверить чистоту tracked files. Если браузер не поддерживается текущей машиной, использовать успешный CI этого точного SHA; отсутствие браузера само по себе не PASS.

## 2. Привязать CLI и выполнить только чтения

Если CLI не авторизован — штатный `npx tgcloud login`, выбирая **именно этот бот**. Credential вводится владельцем в CLI; не добавлять token в Git/PR/логи. На машине с существующим login новый login не нужен.

```bash
npx tgcloud fetch
npx tgcloud --no-pager status
npx tgcloud --no-pager diff
node scripts/preflight-v0.3.mjs
npx tgcloud migrate --local --dry-run
```

Каждую фазу проверить до следующей. `preflight` запускает временный **локальный, не опубликованный** endpoint через documented `tgcloud run`. Он делает getMe, read-only MATERIALIZED/JSON probes, прямые SELECT известных player/receipt tables и сообщает только aggregate counts/booleans. Проверяет точную identity, completed0.2 receipt и отсутствие повреждённых/неизвестных saves, ownership mismatch и duplicate chick owners. Не вызывает reset, не пишет БД, не использует системный каталог. Временный файл удаляется в finally; `check-server` запрещает release при его остатке. Не запускать push одновременно с preflight.

Cloud diff должен состоять только из проверенных0.3 файлов. Любые неожиданные cloud changes сначала разобрать. Local schema dry-run должен содержать только новые `chipper_social_profiles`, `chipper_friendships`, `chipper_social_limits`, их compatible keys/checks/indices. Изменения `chipper_players`/`chipper_release_operations`, DROP/reset/manual warning запрещают продолжение. Сохранить фактическую текущую cloud revision и diff как checkpoint.

## 3. Добавить схему до нового runtime

Только после предыдущих зелёных guards:

```bash
npx tgcloud push tgcloud/schema.js
npx tgcloud migrate --dry-run
```

Повторно проверить только ожидаемые3 additions и связанные keys/indices. Затем отдельно:

```bash
npx tgcloud migrate --safe
npx tgcloud migrate --dry-run
node scripts/preflight-v0.3.mjs --require-social-schema
```

Последний dry-run обязан сообщить **No schema changes**. Успех `--safe` не заменяет эту проверку: CLI может пропустить warnings/manual changes. Strict preflight дополнительно проверяет доступность ожидаемых social columns, включая receipts_json/seen_json. Если SQL MATERIALIZED/JSON/RETURNING compatibility или schema не подтверждены, новый runtime и gift endpoints не публиковать.

## 4. Опубликовать проверенную сборку

При неизменном source SHA, чистом tracked worktree и зелёных regression/security/UI gates:

```bash
npx tgcloud fetch
npx tgcloud --no-pager status
npx tgcloud --no-pager diff
npx tgcloud push
```

Full push загрузит готовый dist, новые libs/endpoints и обновления. Он не должен запускать migration/reset автоматически. Не применять force при revision conflict: снова fetch и разобрать расхождение.

## 5. Независимая проверка после публикации

```bash
npx tgcloud fetch
npx tgcloud --no-pager status
npx tgcloud migrate --dry-run
node scripts/preflight-v0.3.mjs --require-social-schema
npx tgcloud webhook
curl -I https://app8924974998.tgcloud.ai/
```

Проверить cloud revision, clean modules/static, No schema changes, completed receipt/aggregate invariants и webhook in-sync. Через Telegram открыть Main Mini App, убедиться в правильном host и загрузке CSS/JS; HTTP200 не доказывает signed gameplay. При отсутствии Main Mini App — проверить URL через BotFather, не менять чужие настройки.

A старый0.2, B/C другие authorized аккаунты: private default; invite→request→consent; friends/public и отдельная collection privacy; revoke/block; readonly visit; gift inactive→accept с сохранением ID/genes/name/bornAt, cancel/decline/TTL; A1/A2 concurrent care/hatch/finish/gift. Android: native top, Flaps, dock, tap/stroke/hold/drag/land, background, keyboard. При наличии — iOS/desktop. Не публиковать реальные IDs/имена/initData.

## 6. Восстановление

Схема additive: при неудаче migration новый runtime не публиковать, старый0.2 продолжает использовать свои tables. Добавленные пустые social tables и completed receipt не удалять.

После pending offers или transfers использовать **fix-forward текущего0.3**: записать проблемный source/cloud revision, остановить дальнейшую публикацию, подготовить исправление на том же protocol, проверить локальные реальные SQLite races и UI, fetch/status/diff и штатный push безforce. При необходимости временно выключить gift writes на текущем0.3 backend; сохранять read/cancel/recovery и все receipts. Наивный backend rollback0.2 может нарушить reservation/ownership semantics и не разрешён. Никогда не откатывать runtime0.1 через completed release fence.

До повторного write preflight должен подтвердить один authoritative owner на каждый chickId и неизменный completed0.2 receipt. Сбой/потеря ответа во время gift acceptance восстанавливается повтором той же операции; ручные delete/insert двух коллекций запрещены.
