# Chipper 0.4 — безопасный выпуск в действующую бету

**Проверенный code checkpoint:** `85116df54fc74b0b8213c6ed1b12b239e1256652`; check474/41 и full UI79/79 PASS. Последующие commits — только отчёты/evidence.

**Факт этой сессии:** `tgcloud fetch` и `tgcloud migrate --local --dry-run` воспроизвели `No CLI access token found for this project`. Ни migration, ни push, ни DB write не выполнялись. Cloud revision/getMe/schema/current completed receipt/URL/webhook не объявляются проверенными. Код и PR завершены независимо; реальные A/B/C выполняются после выпуска на авторизованной машине.

Цель строго `@chipperhatcherybot` / App ID **8924974998**, прежний host `https://app8924974998.tgcloud.ai/`. Историческая revision3 не является текущей. **Не запускать reset-game-v0.2.mjs, --force, drop, reset, mass delete; не читать .tgcloud вручную и не публиковать token.**

## 1. Проверенный источник

На машине владельца/Termux с Node24 и поддерживаемым браузером (либо успешным CI этого точного commit):

```bash
git fetch origin
git switch feature/chipper-v0.4
git pull --ff-only origin feature/chipper-v0.4
git status --short
git rev-parse HEAD
npm ci
npm run check
npx playwright install chromium
npm run test:ui
```

Остановить выпуск при ошибке. Tracked worktree должен быть чистым; сохранить исходный SHA. В Termux браузерные tests могут быть неподдерживаемыми: использовать green CI точного SHA, а не записывать fake PASS. Без capture suite не меняет committed QA.

## 2. Только read-only preflight

При отсутствии login выполнить штатный `npx tgcloud login`, выбрать **этот бот**. Существующий рабочий login сохраняется; token не передаётся через чат/Git. Затем последовательно:

```bash
npx tgcloud fetch
npx tgcloud --no-pager status
npx tgcloud --no-pager diff
node scripts/preflight-v0.4.mjs
npx tgcloud migrate --local --dry-run
```

Проверить каждый результат до следующей фазы. Preflight использует временный локальный **не опубликованный** read-only endpoint через documented run, getMe exact ID/name, SQL capability и invariants сохранений/ownership/completed0.2 receipt; возвращает только counts/booleans. Helper удаляется в finally, release guard запрещает его leftover. Не запускать push параллельно. SIGKILL может оставить helper: подтвердить, что процесс остановлен, удалить только локальный `chipperV04PreflightTemporary.js`, затем повторить check.

Сохранить текущую cloud revision и reviewed diff. Runtime должен соответствовать текущей 0.3 и ожидаемым changes0.4; неожиданные cloud изменения — причина остановить write и сверить источник. 0.3 social schema обязательна; если она отсутствует, сначала выполнить совместимую 0.3 миграцию с её guards, не публиковать новый runtime на отсутствующие tables.

Local dry-run ожидает **только** новую `chipper_tower_runs`, её CHECK/unique/partial owner index/start key/owner status index. Изменения players/release/profile/friend tables, DROP/manual warnings запрещают следующий шаг. Новый runtime не пишет DDL.

## 3. Сначала additive schema

Только после успешного источника, identity, preflight и reviewed diff:

```bash
npx tgcloud push tgcloud/schema.js
npx tgcloud migrate --dry-run
```

Снова проверить ожидаемый один table и связанные constraints/indices. Затем отдельно:

```bash
npx tgcloud migrate --safe
npx tgcloud migrate --dry-run
node scripts/preflight-v0.4.mjs --require-tower-schema
```

Обязательны **No schema changes** и strict preflight: columns, partial unique one active/settling, compact checkpoints и payment fences. Не применять force/yes, не продолжать при skipped warning. Это не сбрасывает баланс, птиц, инкубатор, friends/gifts или completed clean-start receipt.

## 4. Runtime/static push

Убедиться в том же SHA, green gates и неизменном tracked worktree; сборка уже создана check. Затем:

```bash
npx tgcloud fetch
npx tgcloud --no-pager status
npx tgcloud --no-pager diff
npx tgcloud push
```

Нормальный push только проверенных modules/static. При revision conflict повторить fetch и разобрать diff, не использовать --force. Source0.4 содержит проверяемый replay; нельзя подменять его endpoint, выдающим feathers по claimed wave.

## 5. После публикации

```bash
npx tgcloud fetch
npx tgcloud --no-pager status
npx tgcloud migrate --dry-run
node scripts/preflight-v0.4.mjs --require-tower-schema
npx tgcloud webhook
curl -I https://app8924974998.tgcloud.ai/
```

Записать фактическую revision, source SHA, URL, additive migration result и webhook in-sync. HTTP200 подтверждает только отдачу страницы. После этого открыть бот через настоящие A/B/C и A1/A2 и пройти [сценарии](ACCEPTANCE_RESULT_0.4.md); cloud CLI ctx с выдуманными Telegram ID не является signed acceptance и не должен создавать synthetic live accounts.

## Восстановление без потери данных

До runtime push текущая0.3 продолжает работать с добавленной таблицей. После новых TD rewards/gifts предпочитать **fix-forward** той же модели. Сохранять player receipts, towerReceipts, run rows, profile/friendship rows, pending gift reservations и0.2 receipt. Settling run никогда не expire/delete: get/start автоматически доводит выдачу по permanent fence; run finished/result cleanup само по себе не доказывает credit.

При инциденте зафиксировать source/revision; временно убрать вход в TD на frontend и ограничить создание новых партий проверенным hotfix, оставив get/finish recovery и записи. Повторить read-only invariants, проверенные tests, обычный push исправления. Нельзя откатывать backend на0.2/раннюю0.3, удалять tower table, массово чистить runs/receipts или повторять reset. Изменение rules требует поддерживать `nest-defense-1` на срок активных сохранений (24h продлеваемой активности), либо отдельный согласованный migration; текущий код safely отказывает неизвестной версии.
