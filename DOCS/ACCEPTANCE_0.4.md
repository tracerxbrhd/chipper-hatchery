# Chipper 0.4 — Acceptance & Release Gate

**Статус:** тест-спецификация, не результаты.  
**Baseline:** 0.3 main; новая версия `feature/chipper-v0.4`.  
**Материалы:** `GDD_0.4.md`, `TOWER_DEFENSE_0.4.md`, `ARCHITECTURE_0.4.md`, `CODEX_TASK_0.4.md`.

## 0. Формат отметок

- `PASS automated`: реально запущенный test, команда + source SHA + output.
- `PASS live`: реально пройдено на устройстве в Telegram, дата/клиент.
- `PENDING owner`: владелец ещё не проверил свои реальные A/B/C.
- `BLOCKED`: достоверный технический / платформенный блокер с воспроизведённым proof.
- `FAIL`: воспроизведённая ошибка, не ложный PASS после обещания исправления.

Для каждого ID в итоговом `ACCEPTANCE_RESULT_0.4.md` требуются статус, evidence и комментарий. Моковый Telegram WebView не равен подписанному продакшену.

## 1. Regression 0.3 — P0

| ID | Тест | Pass |
|---|---|---|
| R01 | Старый аккаунт 0.3 | Все цыплята V2, ID, genes, возраст, имена, balance, активная птица сохраняются |
| R02 | Яйца/инкубация/уход/сон | Timers 3ч/45мин, care4ч/20ч, no death, нет двойного hatch |
| R03 | Flaps 0.3 | Физика, personal best и 20ч reward cooldown неизменны |
| R04 | Friend profiles, private/public, invite/block | Все доступы соблюдаются, нет приватного leak |
| R05 | Gifts: pending/accepted/cancel/TTL | Двухстрочная атомарная передача и receipts не сломаны |
| R06 | A1/A2 concurrent actions | Никаких double feathers, double chicks, неверных владельцев |
| R07 | Completed 0.2 release receipt | Не удалён, reset никогда не запускается |
| R08 | CSS/Telegram native safe HUD/dock/Touche Feel | UI работает на 320/360/390/430 light/dark |
| R09 | Внешние неподписанные запросы | Не получают игровые, социальные и платёжные данные |
| R10 | Production bundle | Нет devMock, cli token, user IDs из fixtures и debug endpoints |

## 2. Совместная поляна / Friend guest — P0

| ID | Тест | Pass |
|---|---|---|
| F01 | A имеет друзей B/C, выбирает B | На Доме A одновременно собственная птица A и **ровно один** питомец B |
| F02 | A касается/тащит свою птицу | Работает Touchy Feel как в 0.3 |
| F03 | A пытается перетащить/накормить птицу B | Чужое состояние не изменяется, guest read-only |
| F04 | A меняет B на C | Отрисован только новый гость, предыдущий уничтожен из локальной сцены |
| F05 | B меняет активного цыплёнка | После обновления guest snapshot у A соответствует новому active |
| F06 | B делает profile private, блокирует A или удаляет из друзей | При следующей проверке A не может видеть/получать B, guest исчезает |
| F07 | A знает чужой profileId без дружбы/публичных прав | Endpoint отказывает, не возвращая genes/TelegramId |
| F08 | Один из игроков не прошёл onboarding/нет птиц | Корректный empty-state |
| F09 | Анимации пары без realtime | Птицы гуляют рядом, look/greet без сетевого чата/удалённых действий |
| F10 | Мобильная 320×568, reduced motion, background | Оба силуэта видны, не накладываются на UI, FPS приемлемый, RAF idle при hide |

## 3. Daily bonus — P0

| ID | Тест | Pass |
|---|---|---|
| D01 | Первый допустимый claim | +1 feather; day/reward receipt сохраняются атомарно |
| D02 | Повторное нажатие с тем же UUID | Идемпотентен, +1 только один раз |
| D03 | 10 параллельных разных UUID в один UTC день | +1 только один раз |
| D04 | Конец UTC-дня → следующий день | Новый claim доступен только с новой серверной датой |
| D05 | Клиент подменяет clock/timezone/userId | Сервер его игнорирует/отказывает, повторной награды нет |
| D06 | Отсутствие 7 дней | Доступен только 1 текущий bonus, не 7 прошлых |
| D07 | Новый пользователь до onboarding | Нельзя бесконечно создавать бонусы/птенцов |
| D08 | Другие активности | Daily не сбрасывает ни Flaps, ни TD, ни care cooldown |
| D09 | Потерянный ответ сервера | Повтор с тем же ключом возвращает уже сделанный claim |
| D10 | UI + Telegram refresh | Подарок показывается/исчезает по настоящему serverNow; дружелюбный таймер |

## 4. Procedural Tower Defense — P0

| ID | Тест | Pass |
|---|---|---|
| T01 | ≥1000 seeds | Deterministic map generation, не ломается, всегда есть путь к гнезду |
| T02 | Разные seeds | Фактическая геометрия различается, не только цвет |
| T03 | Start run | Сервер сохраняет owner/seed/configVersion/runId, нет невозможной карты |
| T04 | Доступные tiles | Path/border/build restrictions; башни не блокируют маршрут |
| T05 | 3 вида башен и 3 врага | Реально разная стоимость/урон/скорость/поведение, UI понятен |
| T06 | Upgrade/sell | Нет отрицательных матчевых монет, продажа не даёт бесконечный profit |
| T07 | Combat simulation | Fixed-step, сравнима при 30/60/120Hz и паузах |
| T08 | Волна 1–3 | Короткий tutorial, честная проходимость |
| T09 | Волны 25/100/1000 | Нет искусственного конечного номера; scale безопасен от overflow |
| T10 | Wave end | Верификатор увеличивает verifiedWave лишь при реально завершённом состоянии |
| T11 | Fake `wave=999`, `score=10000` | Не выдаёт feathers и verified wave; нет доверия client claimed fields |
| T12 | Fake tower build/instant wave finish | Сервер отвергает по map/money/time/simulation constraints |
| T13 | Proof replay and batching | С одного и того же verified checkpoint commands дают тот же state/hash |
| T14 | Run checkpoint concurrency | Нельзя одновременно пропустить волну или double-apply command sequence |
| T15 | Network retry/timeout | Потерянный checkpoint/finish response идемпотентно восстанавливается |
| T16 | Отдельный Telegram ID | Нельзя читать/закончить чужую игру через runId |
| T17 | Pause background | Ничего не гибнет во время скрытого WebView; продолжается после возвращения |
| T18 | Resume после refresh/device change | Одно authoritative game state без рассинхронизации |
| T19 | Expiry/retire/gameover | Состояния различаются, правильно освобождают слот и определяют reward |
| T20 | Results from waves 0–2 | 0 feathers |
| T21 | 3–7 verified waves | +1 feather (если cooldown доступен) |
| T22 | 8–14 verified waves | +2 feathers |
| T23 | 15–24 verified waves | +3 feathers |
| T24 | ≥25 verified waves | +4 feathers максимум |
| T25 | TD cooldown 20ч | Дополнительные прохождения для рекорда разрешены, но без новой выплаты |
| T26 | Flaps vs TD vs daily vs care | Независимые reward policies, нет перекрёстного reset |
| T27 | Finish race / two devices | Одно начисление и запись рекорда, нет race-created feathers |
| T28 | Stored run size | Action proof ограничен, player JSON не пухнет без границ |
| T29 | UI/renderer portrait | Управление tap, башни, пауза, restart читаемы в 320px dark/light |
| T30 | Sounds/haptics off/reduced-motion | Функционал игры остаётся, нет неотключаемых звуков/анимаций |
| T31 | Offscreen/Android perf | Не продолжает RAF в background, нагрузка разумная |
| T32 | Продолжительный run и browser crash | Корректная persisted recovery без claim из несохранённой wave |

## 5. Trait Codex — P0

| ID | Тест | Pass |
|---|---|---|
| C01 | Открыть Коллекция → Кодекс | Категории признаков + общий и категорийный прогресс |
| C02 | Server generator taxonomy | Отображены **все фактически возможные** значения, без недостижимых фантазийных признаков |
| C03 | Новый hatch | Собственные значения genes становятся found |
| C04 | Gift accepted | Полученные признаки открываются у получателя |
| C05 | Подарил последнюю птицу с признаком | Ранее found остаётся found |
| C06 | Старый 0.3 аккаунт | Сканирование имеющихся chicks открывает их признаки идемпотентно, без нового hatch |
| C07 | Двойные параллельные refresh/hatch | Нет потери найденных признаков и corrupted set |
| C08 | Client sends fake found categories | Сервер игнорирует/отказывает |
| C09 | Unknown future geneSchemaVersion | Без crash и с корректной версионированной обработкой |
| C10 | UI темная/светлая тема, узкий экран | Found highlighted; locked gray/?, категория читаема |
| C11 | Privacy | Кодекс чужого игрока по умолчанию не публичен |
| C12 | Старый пользователь после обновления | Текущие genes/rarity/chickId не reroll |

## 6. Telegram identity profile — P0

| ID | Тест | Pass |
|---|---|---|
| P01 | User with verified first_name, last_name, username, photo_url | Свой профиль отображает реальные данные, правильный avatar |
| P02 | User without @username | Нет выдуманного тега или сломанной ссылки |
| P03 | User without photo_url or broken URL | Красивый placeholder с инициалами, нет broken image icon |
| P04 | Изменил username/фото в Telegram | При следующем подтверждённом обновлении новая информация появляется |
| P05 | У игрока собственный Chipper displayName | Он не перезаписывается новым Telegram display name |
| P06 | Owner private; B sees public DTO | Нет automatic exposure Telegram avatar/name без consent |
| P07 | Forged initDataUnsafe.user | Не может изменить persisted signed social identity или данные другого |
| P08 | External/unsafe image URL | Нельзя заставить backend fetch arbitrary URL или вставить XSS |
| P09 | Dark/light/320px card | Красивый avatar/name/tag + статистика/переходы |
| P10 | Guest/profile caching/re-login | Старый пользовательский avatar не показывается другому после смены ID |

## 7. Deployment/CI/Acceptance — P0

- [ ] `npm ci`, TypeScript/typecheck, lint, unit, integration, SQLite concurrency/security, `npm run check` — green.
- [ ] `npm run test:ui`, screenshots at 320/360/390/430px portrait light/dark, UI tests touch/guest/TD/profile/codex/daily.
- [ ] Real SQLite tests for TD checkpoint vs daily claim, guest permissions and gift accept, back-to-back CAS.
- [ ] No production mock, credential leaks or unexpected network telemetry.
- [ ] CLI Bot/App 8924974998/@chipperhatcherybot verified, cloud revision/diff reviewed.
- [ ] Schema only additive and dry-run reviewed; `chipper_players`, `chipper_release_operations`, profiles/friendships and current game records preserved.
- [ ] `chipper-v0.2-clean-start` receipt remains completed; **never rerun v0.2 reset**.
- [ ] Source SHA and exact migration/cloud deployment recorded; post-push URL, webhook, status and smoke.
- [ ] PR `feature/chipper-v0.4 → main` created and **not merged**.
- [ ] Real A/B/C, A1/A2 acceptance explicitly marked PENDING until owner tests them.

**Mandatory real owner scenarios after deployment:**
A invites B's active chick to own Home, interacts only with A; B unfriend/block → guest removed. A claims daily twice quickly → once. A runs TD, reaches verified wave tier → reward, resumes after close. B's Codex shows owned traits, gifts to C then keeps found. A's Profile shows Telegram avatar/name/tag if available; other accounts don't automatically see it. Existing Flaps, Hatch, Gift, Care still work.

## 8. Required result artifacts

Codex must create `DOCS/CONTRACT_0.4.md`, `DOCS/IMPLEMENTATION_0.4.md`, `DOCS/ACCEPTANCE_RESULT_0.4.md`, update README/AGENTS, and include evidence screenshots in `DOCS/qa/0.4/` or a clearly linked CI artifact. Final report includes PASS/FAIL/BLOCKED counts per group, exact tests, PR URL, source/revision and unresolved live checks.

**A successful browser preview does not mean Tower Defense rewards or Telegram profiles work in the actual cloud.**
