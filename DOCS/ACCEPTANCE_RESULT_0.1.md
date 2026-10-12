# Chipper 0.1 — результаты проверки

Дата: **12.10.2026**, Europe/Samara. Ветка: **feature/chipper-v0.1**, база main **7632e35**. Проверенный игровой код: **81d3572** (клиент **4c5bffd**, сервер **4c7ed7e**, арт **f8c1c26**, scaffold **bbfe5a3**). Опубликованный кандидат: **19e9051**. [PR #1](https://github.com/tracerxbrhd/chipper-hatchery/pull/1) открыт, не смержен.

**Готовность:** все предусмотренные GDD подсистемы реализованы и интегрированы; версия опубликована для приёмки владельцем. [Открыть в Telegram](https://t.me/chipperhatcherybot?startapp), [production URL](https://app8924974998.tgcloud.ai/). Безопасная миграция применена, webhook синхронизирован, Main Mini App включён, Menu Button «Играть» ведёт на точный production URL. Матрица нескольких реальных аккаунтов остаётся **PENDING — user acceptance**; локальные и административные проверки не выдаются за её прохождение.

## Фактически выполненные проверки

| Проверка | Команда/доказательство | Результат |
|---|---|---|
| TypeScript и серверная статическая проверка | npm run typecheck; node --check всех .js; whitelist runtime imports | PASS — automated |
| Lint | npm run lint | PASS — automated |
| Домен/контракты/SQLite/гонки/replay | npm test | **62 passed,0 failed**,5 suites; 12.10.2026 22:23 Europe/Samara |
| Production build | npm run build | PASS — automated; JS277.34kB / gzip88.18kB; CSS23.74kB / gzip5.91kB |
| Production isolation | node scripts/check-production.mjs | PASS — automated; dev-backend/профиль/fixtures отсутствуют в bundle |
| Секреты | node scripts/check-secrets.mjs | PASS — automated; рабочие файлы и версии всех Git-коммитов, вывод только имён; credential directories не читались |
| npm dependency audit | npm audit / npm install обновлённого Vitest5.0.4 |0 vulnerabilities после обновления |
| Browser smoke | npm run test:ui | **13 passed,0 failed**, включая2 настоящих25с раунда и3 synthetic production-adapter regressions;1.2мин |
| tgcloud init | npx tgcloud init --no-git | PASS — automated; CLI0.2.0, SDK reference создан |
| Live deploy/миграции | tgcloud push; migrate --safe; migrate --dry-run; status | **PASS — live**: revision1,19 .js +3 static files; schema in sync |
| Live HTTP/публичный браузер | HTTP200, SHA256 HTML/JS/CSS, Chromium390×844, anonymous endpoint | **PASS — live**: assets идентичны dist,0 page errors; POST без initData →401 |
| Main Mini App/Menu Button/webhook | getMe; getChatMenuButton; tgcloud webhook | **PASS — live**: main flag true, меню с точным URL, allowed_updates=message |
| Настоящие Telegram A/B/C/A1/A2 | Приёмка владельца | **PENDING — user acceptance**, окружение готово |

Первые попытки Vitest в Windows sandbox остановились с EPERM realpath **до выполнения assertions**; успешные запуски выполнены в разрешённом обычном окружении. Первый UI-прогон дал8pass/2fail во время изменения исходников/HMR; стабильный повтор дал10/10. Три добавленных synthetic bridge теста сначала получили outside-Telegram экран: официальный SDK перезаписывал тестовый контекст. Исправлен только harness (перехват скрипта для этих тестов); targeted rerun дал3/3. Итог ниже включает весь набор. Неуспешные ранние попытки не скрываются и не считаются PASS.

Первые GitHub Actions запуски прошли `npm run check`, но дали **12/13** в browser suite. [Лог CI](https://github.com/tracerxbrhd/chipper-hatchery/actions/runs/38291620992) выявил ошибку ожидания в тесте коллекции: после нажатия «Позвать домой» имя уже было видно на карточке, поэтому тест мог выполнить reload до ответа `activateChick`. Исправлено только ожидание теста: переход на `.home-hero` подтверждает завершённое серверное сохранение до reload. Повтор исправленного сценария `--repeat-each 10 --workers 2` дал **10/10 PASS**, 43,1с; lint — PASS. Игровой клиент и сервер не изменены. Итоговый статус повторного Linux CI доступен в [проверках PR](https://github.com/tracerxbrhd/chipper-hatchery/pull/1/checks).

## Сценарии настоящих аккаунтов U01–U16

Для всех U-сценариев статус **PENDING — user acceptance**: реальные аккаунты не доступны агенту. Автоматизированное доказательство в последнем столбце подтверждает локальную реализацию, не живое выполнение в Telegram.

| ID | Что проверить живьём | Локальное доказательство |
|---|---|---|
| U01 | Первый вход A, один starter, имя/пропуск | contracts A/B/C profiles; concurrency C01; UI onboarding |
| U02 | Независимый starter B после A | contracts independent profiles |
| U03 | Отдельный профиль C | contracts independent profiles |
| U04 | Закрыть/открыть A: тот же ID/имя/облик/баланс | recreated-service SQLite; UI reload/rename |
| U05 | Изменения A не меняют B | contracts profile rename isolation |
| U06 | Переключить Telegram-аккаунт на том же клиенте | client.test late-response identity guard; production-adapter UI synthetic identity switch |
| U07 | Второй питомец, переключение | C13/U13 domain; UI collection+activate |
| U08 |5–10 быстрых переключений без бонуса/сброса | concurrency rapid activation |
| U09 | B знает ID птицы A, воздействие запрещено | contracts IDOR care/rename/activate |
| U10 | Повтор bootstrap не даёт второй starter | concurrency10 bootstrap/hatch |
| U11 | ID/облик/редкость стабильны | domain RNG boundaries12 appearances + hatch replay |
| U12 | Закрыть во время настоящего45мин сна | domain persistent sleep and inactive completion |
| U13 | Закрыть во время настоящей3ч инкубации | contracts ordinary egg + UI ready hatch |
| U14 | Долгий перерыв не убивает/не снижает ниже35 | domain180days controlled-clock |
| U15 | Повторная игра не даёт награду в20ч | contracts cooldown; UI два настоящих25с раунда |
| U16 | Разные состояния A/B/C не влияют друг на друга | contracts independent profiles + ownership |

Нельзя менять production баланс/часы ради быстрого прохождения U07/U13. Накопите6 пёрышек обычной заботой/мини-игрой; долгие20/72ч уже покрыты управляемыми часами в tests.

## Конкуренция и крайние случаи C01–C14

Все следующие PASS — **локальные автоматические** проверки настоящего SQLite через те же production raw SQL. Требуется дополнительная live приёмка транспорта/runtime/подписи Telegram; настоящая платформа не симулируется как выполненная.

| ID | Статус | Тест |
|---|---|---|
| C01 | PASS — automated | concurrency:10 одновременных bootstrap+starter hatch |
| C02 | PASS — automated | concurrency:10 одинаковых finish и10 новых UUID, один reward |
| C03 | PASS — automated | concurrency:10 разных buy, один расход и slot |
| C04 | PASS — automated | concurrency:10 hatch с разными UUID, один chickId |
| C05 | PASS — automated | lost-response-after-commit buy/hatch recovery; durable replay |
| C06 | PASS — automated | contracts: недостаток6 пёрышек, без расхода |
| C07 | PASS — automated | spoofed ownerId/userId/amount/rarity/appearance/readyAt rejected |
| C08 | PASS — automated | чужие/несуществующие chickId для care/rename/activate |
| C09 | PASS — automated | невыданная/чужая attempt refused |
| C10 | PASS — automated | finish раньше25с refused, TTL checked |
| C11 | PASS — automated | milestones2birds, общий reward1 |
| C12 | PASS — automated | потеря ответа после SQLite commit + recreate service |
| C13 | PASS — automated | inactive needs freeze, sleep finish, activation decay boundary |
| C14 | PASS — automated | invalid/missing ctx refused; production UI outside Telegram blocked even mock query/storage |

Дополнительно: exact30min/20h boundaries, backwards clock, UUID/fingerprint mismatch, старые buy после hatch/finish после20ч, cancelled attempt replay, altered/invalid score, Unicode control/Cf/невидимое имя, семейные emoji,6starts/min guard. Производственный фронтенд использует официальный callback; synthetic bridge tests проверяют клиент, но **не подтверждают криптографическую авторизацию платформы**.

## UX и подготовка к выпуску

| Критерий | Статус/доказательство |
|---|---|
| Оригинальная анимированная птица | PASS — automated render;12×3 каталог визуально просмотрен |
| Уход/cooldowns/обратная связь | PASS — automated UI onboarding-care-sleep |
| Свободный/инкубируемый/готовый/hatch slot | PASS — automated backend+UI; живой3ч timer pending |
| Коллекция/разные варианты/rename/active | PASS — automated UI collection и визуальный screenshot |
| Три стадии | PASS — automated rules; каталог36SVG визуально просмотрен |
| Мини-игра начало/счёт/конец/награда | PASS — automated настоящий25с browser round; live pending |
|320/360/390/430px, dark/reduced-motion | PASS — automated UI overflow+theme assertions; скриншоты просмотрены |
| Loading/empty/offline/server errors | PASS — implemented + automated offline retry/outside/recovery |
| Back navigation | PASS — implemented Telegram BackButton; reload smoke; live Telegram buttons pending |
| Отсутствие чужих ссылок/копии ассетов | PASS — source/visual review, только оригинальные SVG |
| Секреты и CI | PASS — scanner; CI workflow создан, cloud run статус смотреть в PR |
| Бот/Main Mini App/Menu Button URL | PASS — live: @chipperhatcherybot, main flag true, меню «Играть» с production URL |
| Миграция cloud schema | PASS — live:1 новая таблица, applied1/skipped0; повторный dry-run без изменений |
| Android/iOS/Desktop/Web внутри Telegram | PENDING — user acceptance |
| Контролируемый staging reset | Не предоставлен destructive endpoint; при необходимости отдельная ручная staging операция |

## Исправления по QA и ограничения

Исправлены невидимые Unicode-имена, контроль частоты брошенных attempts, dark fallback при открытии без Telegram launch, блокировка background refresh на конце мини-игры и возвращение в «Активности» после expired/cancelled finish. Новых подтверждённых дефектов после исправления review не обнаружил; это не гарантирует отсутствие ошибок в непроверенном live runtime.

Остаются: приёмка нескольких реальных аккаунтов и устройств; бессрочно растущий aggregate с receipts/attempts/history; ограниченный MVP античит; формальная публичная privacy/deletion policy перед открытым релизом. Таймеры/покупка/выдача не имеют клиентских production заглушек.

Владельцу: выполнить U01–U16 и C01–C14 с A/B/C и A1/A2 через [опубликованную Mini App](https://t.me/chipperhatcherybot?startapp), фиксируя устройства и результаты. Путь повторного выпуска: [DEPLOYMENT_0.1.md](DEPLOYMENT_0.1.md). PR не мержить до решения по живой приёмке.

## Финальная запись кандидата

Проверенный игровой код: `81d3572c96fad219bbed4807ef181196dc02fe4a`. Команды: `npm run check` — PASS, `npm run test:ui` —13/13 PASS, `npm run lint` после правки harness — PASS, `node scripts/check-secrets.mjs` после коммитов — PASS. Полный локальный browser run завершился12.10.2026, около22:30 Europe/Samara. После этого изменены документация, screenshots, CI fetch-depth и ожидание подтверждённой активации в browser test; игровые исходники остаются проверенными.

[PR #1](https://github.com/tracerxbrhd/chipper-hatchery/pull/1), `feature/chipper-v0.1` → `main`, создан12.10.2026 22:32 Europe/Samara. **Открыт, не смержен.** Снимок реализации с отчётом при создании PR: `4a9b9aab2f8fc921c7b6f35c81da8b758073a6fa`. На момент создания access/deploy были заблокированы; блокер устранён следующим живым выпуском. Скриншоты: [qa/README.md](qa/README.md).

## Живой выпуск 12.10.2026, около23:40–23:45 Europe/Samara

- Пользователь выполнил local login; CLI сохранил токен, но direct Node fetch получил `UND_ERR_CONNECT_TIMEOUT`. DNS указывал149.154.166.100, TCP443 не проходил. Пользователь подтвердил системный VPN proxy; Windows использовал127.0.0.1:10808. Через этот уже настроенный proxy с `NODE_USE_ENV_PROXY=1` соединение и `tgcloud fetch` прошли. Токен не читался вручную и не передавался другому API-host.
- Read-only cloud probe подтвердил **@chipperhatcherybot**, bot ID8924974998; до деплоя было0 модулей/revision0 и0 таблиц. `getMe`/`sqlite_master` не создавали игроков.
- Первый `push` был отклонён до публикации из-за запрещённого пользовательского `X-Content-Type-Options`. Конфигурация исправлена; платформа сама отдаёт `nosniff`. После исправления повторный `npm run check` дал62/62, typecheck/lint/build/isolation/secrets PASS.
- Успешный `push` опубликованного SHA **19e9051b6348a0cc68294b71580511301f8b66ba** напечатал **https://app8924974998.tgcloud.ai/**. Миграция добавила только `chipper_players`: applied1, skipped0. Повторный dry-run: no changes. Итоговый status: revision1, working directory clean,3 static files up to date.
- Webhook: `https://cloud.telegram.org/app8924974998/webhook`, allowed updates `message`, pending0, in sync. Missing-user cloud runtime вызов `bootstrap` вернул `UNAUTHORIZED`, без создания тестового профиля. Публичный HTTP POST `/api/bootstrap` без initData вернул401. Ни административный ctx, ни этот отказ не доказывают всю матрицу подписей/аккаунтов.
- `setChatMenuButton` вернул true; последующее отдельное чтение подтвердило меню `web_app`, текст «Играть», точный URL. Владелец настроил Main Mini App в BotFather и ответил «готово»; повторный `getMe` подтвердил `has_main_web_app=true`. Read-only счётчик показал1 профиль после входа владельца; вымышленные Telegram IDs для bootstrap не использовались. Игровое содержимое этого профиля не выводилось.
- Независимый Chromium проверил production вне Telegram: HTTP200, экран запуска в Telegram, нет навигации/dev-баннера,0 page errors. [Скриншот](qa/live-outside-telegram.png). HTML/JS/CSS возвращают HTTP200 и совпадают с проверенным локальным dist по SHA256:

| Файл | SHA256 |
|---|---|
| index.html | 75ec81ca178c2c6ded3932fc7c3410e84b017b9a8940dfec0140627836e6c639 |
| assets/index-BWMKDnyw.js | fc91ce224e91971c415f9e6ade6edb4ae6239fe56d9cb039b7879f6d92d32d09 |
| assets/index-CaIi6bTI.css | b670893cc092a1af88b1928fb6c2f62770de987d1d2936e01fce1a94f3e1c5a3 |

Временные административные probes не деплоились и не коммитились; их локальные файлы удалены. Публичного диагностического endpoint нет. После SHA19e9051 изменяется только отчётность; игровые исходники и опубликованные assets остаются теми же. Проверки A/B/C, A1/A2 и настоящих таймеров выполняет владелец; их статус не повышен автоматически.
