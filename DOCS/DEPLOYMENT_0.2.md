# Chipper 0.2 — выпуск и единственный clean-start reset

Владелец разрешил штатный deploy и один адресный reset игровых данных **@chipperhatcherybot / App ID 8924974998** без дополнительного подтверждения. Это не разрешение трогать системные данные, секреты, конфигурацию бота или другие приложения.

Проверено по установленной `@tgcloud/cli 0.2.0`, её `--help`, исходникам команды run и [официальной документации Serverless](https://blogfork.telegram.org/bots/serverless). CLI SQL-команды нет: run исполняет локальные handlers/endpoints на платформе без deploy. Raw `db.run/all/get` — документированный SDK. SQLite [AFTER INSERT triggers](https://www.sqlite.org/lang_createtrigger.html) позволяют атомарную очистку вместе с marker.

## 1. Доступ и проверка кандидата

```powershell
node --version
npm ci
npm run check
npm run test:ui
git status --short
git rev-parse HEAD
npx tgcloud --version
npx tgcloud --no-pager status
```

Node 24 обязателен для настоящих SQLite тестов. Зафиксируйте проверенный source SHA. `--prepare` и `--apply` reset helper откажут при dirty worktree. Не включайте `--debug`, не считывайте `.tgcloud` вручную и не помещайте CLI-токен в shell arguments/логи/PR.

Если CLI сообщает `Not linked to a bot yet` / `No CLI access token found`, свяжите этот checkout интерактивной командой `npx tgcloud login`, используя **BotFather → @chipperhatcherybot → Serverless → CLI Access**. Для CI поддерживается `TGCLOUD_TOKEN` через защищённое окружение. Его значение не выводится.

## 2. Облако до любой записи

```powershell
npx tgcloud fetch
npx tgcloud --no-pager status
npx tgcloud --no-pager diff
npx tgcloud webhook
npx tgcloud migrate --local --dry-run
node scripts/reset-game-v0.2.mjs --dry-run
```

Fetch обновляет snapshot без изменения исходников; status/diff сопоставляют локальное состояние с ним. Проверьте revision, полный список cloud-модулей и изменения схемы. Незнакомые изменения/удаления — блокер до разбора; `--force`, `pull` и `tgcloud reset` не являются способом его обойти.

Reset dry-run проверяет живой `api.getMe()` с точным ID, username и is_bot; показывает имена таблиц, число игровых профилей и существующий release receipt. Не показывает Telegram IDs или state_json. Проверяется точная структура `chipper_players(telegram_id,revision,state_json)`. Неизвестная собственная таблица `chipper_*`, FK или trigger требуют отдельного анализа; apply прекращается до DELETE. В текущей проверенной реализации вся игра находится в одном JSON-агрегате.

Dry-run ничего не пишет в БД. Если нет credentials/связи, фактическая cloud schema и идентичность не подтверждены, поэтому deploy/reset блокируются.

После успешного dry-run, **до публикации V2**, выполните неразрушающую подготовку:

```powershell
node scripts/reset-game-v0.2.mjs --prepare
```

Prepare повторно проверяет бот и схему, создаёт/валидирует только Chipper-служебную таблицу marker и точный AFTER INSERT trigger. **Не вставляет release marker и не удаляет игровые данные.** Ответ `prepared:true`, `receipt:null` и прежнее число игроков подтверждает поддержку нужного CREATE TRIGGER на реальном Serverless до замены рабочего кода. Старая игра не пишет в marker table, поэтому подготовленный trigger не затрагивает её запросы. Повторный prepare также не сбрасывает прогресс; при существующем release receipt возвращает alreadyApplied без записи.

Если prepare сообщает отказ SDK/SQL/схемы, **не публикуйте V2**: действующая 0.1 продолжает работать с сохранёнными игровыми строками. Неподтверждённый destructive fallback запрещён. Итоговая последовательность: **dry-run → prepare → push V2 → apply ровно один раз → dry-run**.

## 3. Публикация 0.2

```powershell
npx tgcloud push
npx tgcloud migrate --dry-run
# Только если dry-run действительно показал ожидаемые safe additions:
npx tgcloud migrate --safe
npx tgcloud migrate --dry-run
```

Новый код сохраняет schemaVersion=2; до reset старые игровые строки отклоняются с RESET_REQUIRED. В рабочем `tgcloud/` не должно быть `endpoints/chipperV02ResetTemporary.js`: release gate отказывает при таком файле. При наличии warnings/manual migrations не применяйте `--yes` и не продолжайте вслепую. Gameplay SQL schema остаётся прежней, обычно migrate не нужен.

Запишите exact source SHA, новую cloud revision и HTTPS URL **из успешного push**. Проверьте публичные HTML/assets и webhook; настройки Main Mini App/Menu Button используют тот же фактический URL.

## 4. Однократная очистка

```powershell
node scripts/reset-game-v0.2.mjs --apply
node scripts/reset-game-v0.2.mjs --dry-run
```

Helper создаёт local temporary endpoint только для supported `tgcloud run` и удаляет его в finally, в том числе при ошибке/прерывании SIGINT/SIGTERM. Не запускайте push параллельно helper. Если процесс убит SIGKILL и файл остался, release gate не разрешит deploy; сначала удалите именно этот локальный temporary файл после проверки отсутствия активного helper.

Apply повторно проверяет identity/schema и подготовленные `chipper_release_operations` и temporary trigger (создание идемпотентно). Один `INSERT ... ON CONFLICT DO NOTHING RETURNING ...` с ключом `chipper-v0.2-clean-start` записывает marker (timestamp, точное число удалённых профилей, бот и source SHA) и через AFTER INSERT вызывает адресный `DELETE FROM chipper_players`. Marker и DELETE входят в одну SQLite statement transaction. Trigger затем удаляется, marker остаётся. Повтор или потеря ответа после commit не очищает новых пользователей.

SQLite-механизм подтверждён 20 реальными локальными тестами; его live CREATE TRIGGER доступность проверяется успешным prepare **до push**. Если подготовка блокируется, не продолжайте publish. После prepare/push ошибки сети apply восстанавливаются повтором того же фиксированного release key; marker защищает от повторного удаления.

Сохраняйте receipt и post-reset dry-run в отчёте. Число currentPlayers может увеличиться после удаления из-за новых реальных входов; это не повтор старого прогресса. **Обычные subsequent deploy никогда не вызывают helper.**

## 5. Приёмка владельца

- A — бывший аккаунт 0.1: закрыть/переоткрыть Mini App; увидеть первоначальное onboarding, новое яйцо, ноль пёрышек/рекордов и пустую коллекцию; вылупить новую V2 птицу.
- B/C — ещё два аккаунта: независимо пройти то же; имена, birds, баланс и рекорды не пересекаются.
- A1/A2 — две сессии одного аккаунта: одновременно care/hatch/finish; подарок и reward не дублируются.
- После первого входа повторно открыть A: теперь его новый прогресс сохраняется; ещё одно стартовое яйцо не выдаётся.
- Android: Home не скроллится, ноги касаются поверхности, пять вкладок и доступные care actions; Collection/Profile прокручиваются, rename не перекрыт клавиатурой.
- Flaps: активная птица, тап/полёт/столкновение/result/restart; один reward после ≥2 секунд server time, затем cooldown; pause/resume, background/TTL и выход корректны.
- Light/dark/reduced motion, смена аккаунта, iOS/Desktop по доступности.

Эти пункты PENDING owner до реального выполнения. Browser fixtures и административный CLI ctx не являются signed live acceptance.

## 6. Исправление и rollback

**До фактического INSERT/DELETE reset** допустим rollback к исходному проверенному 0.1 source SHA `95fd2d13abbdbc394932ec249472147e496afca9`: старые игровые строки ещё существуют, а prepare не изменял их. Сначала убедитесь read-only dry-run, что release receipt отсутствует. В отдельной чистой рабочей копии восстановите этот код, rebuild, fetch/status/diff и штатный push без force; не запускайте миграцию удаления. Подготовленные служебные table/trigger не влияют на старые игровые операции и не требуют destructive cleanup.

После clean start 0.1 не является совместимым rollback: он не знает V2 модель. Используйте проверенный V2 checkpoint или fix-forward, rebuild, fetch/status/diff и обычный push без force. Release marker и новые игровые строки не удаляйте. При несовместимости временно остановите вход в неисправную Mini App и подготовьте исправление; повторный reset запрещён.
