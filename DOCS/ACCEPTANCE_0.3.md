# Chipper 0.3 — критерии приёмки и тест-план

**Бот:** \`@chipperhatcherybot\`. **Версия:** Social & Feel Update.  
**Источники:** \`GDD_0.3.md\`, \`CODEX_TASK_0.3.md\`.  
**Назначение:** обязательные критерии для Codex и владельца. Пункты ниже **не являются результатами тестов**. Отчёт создаётся отдельно: \`ACCEPTANCE_RESULT_0.3.md\`.

## 0. Статусы

- \`PASS automated\`: конкретный тест реально запущен, с SHA, командой, результатом.
- \`PASS live\`: реально проверено в Telegram, указаны устройство/дата/учётная запись (без секретов).
- \`PENDING owner\`: требует настоящих Telegram-аккаунтов владельца.
- \`BLOCKED\`: подтверждённый платформенный/технический блокер, описан proof и безопасное выключение.
- \`FAIL\`: воспроизведённая ошибка, шаги и логи без персональных данных.

Не засчитывать mock/fixture/Playwright за signed-live A/B/C. Нельзя присваивать FAIL → PASS на основании обещания будущего исправления.

## 1. Регресс 0.2 (P0)

| ID | Действие | Pass |
|---|---|---|
| R01 | A старый пользователь открывает приложение | Все птицы, генетика, имена, active, пёрышки и таймеры на месте |
| R02 | B новый пользователь получает яйцо | Ровно одно стартовое яйцо, onboarding/новый V2 птенец |
| R03 | A/B/C используют приложение одновременно | Нет утечек профиля, чьи-то actions не меняют чужих птиц |
| R04 | Hatch double/retry + profile concurrent | Не дублирует птицу, не тратит валюту дважды |
| R05 | Уход, 45мин сон, 3ч яйцо, 4ч care cooldown | Server timers и ограничения не изменились |
| R06 | Открытие после многодневного отсутствия | Ни один питомец не погибает, неактивные отдыхают |
| R07 | Прежние V2 гены и стадии | Не reroll, дизайн узнаваем, chickId стабильный |
| R08 | Player schema/receipt из 0.2 | Данные читаются без destructive reset, операции replay-safe |
| R09 | Обычный deployment | НЕТ сброса/удаления \`chipper_players\`, completed receipt clean-start сохраняется |
| R10 | 20ч legacy miniGameRewardAt | После миграции Flaps награда не открывается преждевременно |

## 2. UI, navigation, responsive (P0)

| ID | Действие | Pass |
|---|---|---|
| U01 | Android: Home сверху | Нативные Close/Back и правые Telegram-кнопки не перекрывают центр HUD |
| U02 | Android: Chippster Flaps | Название/очки/контролы не прячутся под системными кнопками |
| U03 | Карточка птицы и профиль | Собственный HUD/back не сталкивается с native chrome |
| U04 | 320×568 / 360×640 / 390×844 / 430×932 | Ни горизонтального overflow, ни обрезания обязательных действий |
| U05 | Dock: пять кнопок | \`Магазин Коллекция Дом Активности Профиль\`; Дом строго по центру |
| U06 | Floating dock на телефоне | Есть видимый нижний зазор, полупрозрачность и граница; safe-bottom правильно учтён |
| U07 | Rapid switch 20 раз | Не остаются overlay/старые клики/ошибочные выделения |
| U08 | Коллекция | \`Птенцы\` / \`Яйца\`, работает скролл и возврат |
| U09 | Инкубатор внутри Коллекции | Те же покупки, отсчёты, hatch, без новой валютной логики |
| U10 | Старый маршрут incubator | Перенаправляет в \`Коллекция → Яйца\`, без пустого экрана |
| U11 | Магазин | Честная витрина будущих товаров, никакого fake checkout |
| U12 | Dark/Light/unsupported blur | Контраст/читаемость, оригинальная палитра, рабочий fallback |
| U13 | Keyboard / rename | Поле доступно при изменении viewport, dock не мешает |
| U14 | Home downward swipe | Нет скролла документа и native collapse через scene, если Telegram поддерживает API |
| U15 | системный Telegram header drag | Нативное управление Telegram не ломается |
| U16 | reduced motion + voice accessibility | Ясная навигация и labels, кликабельные зоны >=44 CSS px |

Дополнительно: screen reader, 200% zoom, font scaling, orientation, iOS/desktop при наличии.

## 3. Touchy Feel, сцена и анимация (P0)

| ID | Действие | Pass |
|---|---|---|
| T01 | Одиночный tap по птице | Быстрая вариативная реакция, НЕ перемещает персонажа в точку сцены |
| T02 | Pointer hold ~250ms | Включается lifted mode, тело приподнимается, лапы/голова/крылья меняют позу |
| T03 | Drag по области поля | Персонаж следует с инерцией, геометрия не ломается |
| T04 | Release над допустимой точкой | Мягкое приземление, тень не «летает» вместе с птицей |
| T05 | Drag за пределы/по HUD | Персонаж ограничен, нельзя закрыть системные кнопки или увести бесконечно за сцену |
| T06 | Petting stroke | Отдельная спокойная реакция, не ошибочно определяется как перенос |
| T07 | Touch alongside bird | Поворот/взгляд/подход к точке, без непрошеного carry |
| T08 | pointercancel, second finger | Чистый возврат, нет stuck mode |
| T09 | Tab switch/back/background во время drag | Cleanup listeners/RAF/capture и нормальная поза после возврата |
| T10 | Сон / кормление / рост / прогулка | Приоритеты состояний соблюдаются, опасных наложений нет |
| T11 | Different gene extremes/3 ages | Корректные опорные точки тела/глаз/лап, анимации не рушат пропорции |
| T12 | SFX disabled/reduced-motion | Нет звуков, неотключаемой интенсивной тряски и лишнего расхода ресурсов |
| T13 | Touchy Feel abuse | Не меняет пёрышки, состояние ухода, cooldown или серверную позицию |
| T14 | Perf/profile | При скрытом WebView RAF не потребляет кадры; мониторинг FPS и утечек |

Для T02–T11 использовать настоящие UI/interaction smoke, а не лишь unit-тесты функций.

## 4. Memory of Growth (P0)

| ID | Действие | Pass |
|---|---|---|
| G01 | Baby | \`Птенец → ? → ?\` |
| G02 | Teen | \`Птенец → Подросток → ?\` |
| G03 | Adult | \`Птенец → Подросток → Взрослая\` |
| G04 | Нажать на открытую прошлую стадию | Показывает те же сохранённые genes в соответствующем возрасте |
| G05 | Нажать на закрытую стадию | Не раскрывает форму, ни через интерфейс, ни в доступных публичных DTO |
| G06 | Просмотр предыдущего возраста | Server stage, milestone, возраст и параметры не меняются |
| G07 | Reload / другой аккаунт | Открытые стадии согласованы с реальной стадией каждой птицы |

## 5. Games, rewards, records, leaderboard foundation (P0)

| ID | Действие | Pass |
|---|---|---|
| M01 | Flaps после обновления | Работает физика, хитбокс, выбранный активный питомец, result |
| M02 | Legacy bestScore, completedRuns | Сохраняются в per-game records |
| M03 | Legacy miniGameRewardAt | Перенесён в \`chippster-flaps\` cooldown без досрочного feather |
| M04 | Завершить Flaps при разрешённой награде | +1 пёрышко ровно один раз/20ч для этой игры |
| M05 | Повторить finish одновременно | Idempotent, нет двойных наград |
| M06 | Неизвестный gameId | Отклоняется без выдачи |
| M07 | Добавить test-only dummy game config | Независимый state/cooldown, не затрагивает Flaps/care |
| M08 | Клиент подделывает high score | Не может увеличить награду, best casual и bounded |
| M09 | Долгое время / logout/login | Личные рекорды не пропадают |
| M10 | UI leaderboard | Нет фиктивных публичных рангов/лидеров, только groundwork |

## 6. Profiles, friends, sharing, visits (P0)

A/B/C — разные настоящие Telegram ID (для локальных тестов — синтетические verified contexts).

| ID | Действие | Pass |
|---|---|---|
| S01 | A default private, B открывает A по ID/link | Без разрешения данные A недоступны |
| S02 | A переключает profile visibility public/friends/private | B видит только разрешённый DTO и только в допустимом режиме |
| S03 | A отдельно запрещает просмотр коллекции | B не видит collection даже если видит активную птицу |
| S04 | B отправляет другу A запрос | A видит pending request |
| S05 | A принимает запрос | Взаимная связь, один friend relation |
| S06 | A отклоняет/удаляет/блокирует | Отсутствует доступ и нежелательные новые запросы |
| S07 | B повторяет/спамит request | Idempotency и rate limit предотвращают дубли |
| S08 | A расшаривает карточку птицы | Открывается именно разрешённая птица, Telegram link работает |
| S09 | A отзывает доступ после share | Старая ссылка не раскрывает закрытый профиль |
| S10 | C впервые открывает ссылку | Onboarding, затем корректный return-to-intent |
| S11 | B посещает A, смотрит 2.5D scene | Допустимая публичная информация, реальное состояние A не меняется |
| S12 | B tries foreign care/activate/rename/egg | Отказ, данные A остаются неизменными |
| S13 | B knows A internal id/telegramId | Не извлекает приватные данные перебором/инъекцией |
| S14 | Link malformed/expired | Безопасный fallback без crash |
| S15 | No contacts permission | Ни телефон, ни контакты не нужны для friendship |

## 7. Подарки/владение — критические (P0)

| ID | Действие | Pass |
|---|---|---|
| P01 | A предлагает неактивную птицу B другу | One pending gift; птица зарезервирована/недоступна для нового подарка |
| P02 | A дарит единственную либо активную птицу | Отказ без изменения state |
| P03 | B accepts | Единственный действующий owner=B; старые ID/genes/name/bornAt сохранены |
| P04 | A cancels before accept | Птица остаётся/возвращается A без потери |
| P05 | B declines/TTL expiration | Птица снова безопасно доступна A |
| P06 | A simultaneously offers bird to B/C | Только одно предложение успешно |
| P07 | Accept vs cancel race | Не может возникнуть двух владельцев или пустоты без восстановимого escrow |
| P08 | 10 concurrent accepts / retries | Ровно одна передача, остальные идемпотентны либо отвергнуты |
| P09 | Lost server response after commit | Повтор возвращает окончательное состояние, без новой передачи |
| P10 | Network exception/crash at each protocol stage | No duplicate/lost chick; recoverable by idempotent reconciliation |
| P11 | Wrong giftId or recipientId | Нельзя принять чужой подарок или направить другому |
| P12 | Friend removed / blocked during pending | Определённая, безопасная политика отмены, без неконтролируемой передачи |
| P13 | Database consistency check | Для chickId ровно один authoritative owner, корректная gift history |
| P14 | Active not last after transfer | У A остаётся действующий активный питомец, неповреждённая коллекция |
| P15 | Platform atomicity proof | Реальные SQLite integration/concurrency tests, не два независимых UPDATE без protocol |

**Release blocker:** если P03/P07/P09/P10/P13/P15 не доказаны — блокировать live gift endpoint; оставить остальные безопасные системы доступными и сообщить, что 0.3 **не полностью готова**. Не имитировать «успешную» передачу UI-only.

## 8. CI, Deploy, Regression

- [ ] \`npm ci\`, \`npm run check\`, \`npm run test:ui\`, отдельные suites для social/gift migrations/races.
- [ ] Сборка строго исключает dev Mock и не содержит credentials.
- [ ] История Git проверена на секреты без вывода секретов.
- [ ] До cloud write: актуальный SHA и проверенный \`@chipperhatcherybot\`, ID \`8924974998\`, read-only \`status/fetch/diff\`.
- [ ] Serverless schema dry-run: только совместимые изменения, НЕТ DROP/TRUNCATE/RESET и перезапуска 0.2 clean-start.
- [ ] Сохранён rollback/fix-forward план. Технические изменения с irreversible multi-user ownership нельзя откатывать 0.2 кодом без анализа.
- [ ] Live push только после зелёных P0/security tests и проверки cloud diff.
- [ ] Bot Main Mini App, HTTP assets и webhook проверены после push.
- [ ] Создан PR в main, **не merged**.
- [ ] \`DOCS/ACCEPTANCE_RESULT_0.3.md\` с PASS/PENDING/BLOCKED по всем группам; screenshots 320/360/390/430 light/dark/touch/growth/social.

### Ручная проверка владельцем в Telegram

A/B/C: как минимум Android (где увидены проблемы с native HUD), плюс iOS/desktop при наличии. A старый аккаунт 0.2, B/C новые; проверка приватности, связи, визита, drag и истинной передачи между аккаунтами. Не публиковать в отчёте Telegram ID, имена или конфиденциальное содержимое профиля.

**Конечный DoD:** реально работающая безопасная 0.3, без потери 0.2 прогресса, с новым UI/Touchy Feel/социальными функциями, проверками и честными ограничениями.
