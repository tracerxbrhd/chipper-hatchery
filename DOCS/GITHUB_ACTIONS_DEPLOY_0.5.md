# Chipper 0.5 — GitHub Actions с Android

Workflow: [Chipper manual release](../.github/workflows/release.yml). Он запускается только вручную владельцем tracerxbrhd из main. Default mode — preflight: публикации нет. Push/PR/check CI не запускают этот workflow.

## Один раз: секрет и активация

1. В Chrome открой [настройку repository secret](https://github.com/tracerxbrhd/chipper-hatchery/settings/secrets/actions/new). Если мобильный интерфейс скрывает Settings, включи «Версия для ПК». Эквивалентный путь: repository Settings → Secrets and variables → Actions → New repository secret.
2. Name: TGCLOUD_TOKEN. Secret: полный CLI Access Token для app8924974998, не Bot API token. Он берётся в Telegram @BotFather → @chipperhatcherybot → Serverless → CLI Access → Access token. Не вставляй его в чат, commit, workflow inputs или issue. GitHub не позволяет прочитать сохранённое значение обратно через API; для workflow передаётся только secret reference.
3. Workflow-файл должен быть в default branch main. Он подготовлен в существующем PR#5. Ветка feature сама по себе не создаёт доступную кнопку Run workflow. Владелец сначала проверяет и самостоятельно принимает решение о merge PR либо об отдельном добавлении самого workflow в main. Агент не выполняет merge/push main автоматически. После активации можно выбрать проверенный SHA feature/chipper-v0.5 без merge всего релиза.

[GitHub: repository secrets](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-guides/using-secrets-in-github-actions) · [Manual workflow requirements](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow?tool=webui).

## Первый запуск: только диагностика

1. Открой repository Actions → Chipper manual release → Run workflow. Branch: main.
2. Mode: preflight. Если PR0.5 уже в main, source_sha можно оставить пустым: workflow зафиксирует текущий полный SHA main. Если в main установлен только workflow, обязательно укажи полный проверенный SHA feature/chipper-v0.5, содержащий release helper. Старый main0.4 без helper не подходит и не будет опубликован. Остальные поля пустые.
3. Дождись npm ci, полного check и test:ui. Токен отсутствует на этих шагах.
4. Затем credential передаётся только release helper: fetch/status/diff, строгий read-only getMe/SELECT preflight и migrate --local --dry-run. Никаких gameplay endpoints, push или применённых миграций.
5. В Summary и artifact chipper-release-plan-<SHA> открой plan.json и changes.patch. Зафиксируй sourceSha, cloudRevision и planSha256. Проверь фактический diff с текущим cloud, а не только зелёную галочку.

Прежняя cloud revision не зашита в workflow: её нельзя предполагать по истории репозитория. Совместимость текущего cloud с выбранным релизом требует review changes.patch и preflight. Если обнаружен неизвестный модуль, удаление или другой неожиданный diff, остановись, не выбирай deploy и не подтверждай новый digest автоматически. Plan digest подтверждает точные reviewed source/build/cloud diff, а не заменяет их анализ.

## Второй запуск: явное разрешение на публикацию

Только после review первого плана, готовности владельца к Telegram-приёмке и решения публиковать:

- Branch: main.
- mode: deploy.
- source_sha: полный sourceSha из проверенного плана.
- expected_revision: cloudRevision из того же плана.
- plan_sha256: planSha256 из того же плана.
- confirmation: DEPLOY 8924974998.

Это отдельный ручной запуск с явным разрешением владельца на production push. Mode deploy без этих данных ничего не публикует. Он заново собирает/проверяет тот же SHA, проходит read-only probes, повторно fetch и требует точного совпадения revision и plan digest. Смена cloud source, diff, сборки или схемы блокирует публикацию. После проверки выполняется только обычный tgcloud push; его optimistic concurrency защищает от изменения cloud после последнего fetch. Никаких force/pull/reset/migrate apply/webhook commands, автоматических повторов или автоматического отката.

Параллельные release runs сериализованы по App ID; выполняющийся release не отменяется новым запуском. Это ограничивает только данный workflow: чужой CLI deploy всё ещё обнаруживается revision guard.

## Что проверяется и что остаётся вручную

- Только точный repository/actor и запуск workflow из main; выбранный immutable source должен входить в origin/main либо origin/feature/chipper-v0.5. Полный SHA feature вводится явно.
- version0.5.0, закреплённый CLI0.2.0, identity8924974998/@chipperhatcherybot, сохранённый release fence/ownership/social/TD invariants.
- schema.js и tgcloud.jsonc идентичны reviewed0.4 main3764261; dry-run обязан явно сообщить No schema changes.
- Свежий cloud snapshot после probes; неизменность deployable source и dist до push.
- Никакого чтения/архивации .tgcloud вручную. Artifacts содержат только sanitized release plan/diff, не token, player state или CLI cache.
- CLI stdout/stderr не выводятся напрямую. Неизвестный формат revision/dry-run или любая ошибка закрывают путь к push.
- Environment reviewers не обещаются: этот workflow не требует настроенного GitHub Environment. Отдельный ручной deploy с confirmation — обязательный gate. Дополнительные branch/environment protections владелец может настроить по своему плану GitHub.
- Успешные unit/fixture проверки не подтверждают live authorization или физический Telegram. До добавления владельцем secret и запуска preflight cloud readiness остаётся NOT RUN.
- После публикации открыть настоящий Telegram на Android/iOS, проверить care/drag/safe areas/blur/lifecycle, игры, друзей/подарки/обмен и once-only claims. Не считать один HTTP200 device PASS.

No schema migration required. После0.5 claims/transfers backend0.4 не является безопасным rollback; см. [основной runbook](DEPLOYMENT_0.5.md).
