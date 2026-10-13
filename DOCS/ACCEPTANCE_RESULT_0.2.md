# Chipper 0.2 — фактическая приёмка

**Статус: код 0.2 готов к приёмке; живой выпуск НЕ завершён.** Публикация и однократный сброс BLOCKED: в этой среде нет привязки Telegram Serverless CLI к боту и CLI-токена. Действующий бот не изменён. Дополнительное разрешение владельца не требуется — отсутствует технический доступ.

| Поле | Фактическое значение |
|---|---|
| Ветка | feature/chipper-v0.2 → main, merge не выполняется |
| Начальный main | 95fd2d13abbdbc394932ec249472147e496afca9 |
| Проверенный source checkpoint | 5ffea76c3d939c33779aab4d5522240c7480b7b5 |
| PR | https://github.com/tracerxbrhd/chipper-hatchery/pull/2 — открыт, merge не выполнялся |
| Runtime | Node v24.19.0, Chromium 153.0.8010.0, Playwright 1.64.0 |
| Serverless CLI | @tgcloud/cli 0.2.0; это версия CLI, не cloud revision |
| Bot/App | Ожидаются @chipperhatcherybot / 8924974998; live getMe не подтверждён |
| Cloud revision 0.2 | BLOCKED — не получена |
| URL 0.2 | Не подтверждён. Исторический URL 0.1: https://app8924974998.tgcloud.ai/ |
| Фактический reset | НЕ выполнен; боевые игровые записи не удалялись |

## Финальные автоматизированные проверки

| Команда / область | Результат |
|---|---|
| npm ci | PASS; зависимости из исходного lockfile, изменена только версия самого проекта |
| npm run check | PASS: TypeScript, runtime syntax/imports, ESLint, Vitest, Vite build, production isolation, secret/history patterns |
| npm test | 161/161 PASS, 11 файлов |
| GitHub Actions | Итог последнего HEAD — в [PR Checks](https://github.com/tracerxbrhd/chipper-hatchery/pull/2/checks). Первый прогон прошёл check и 32/33 UI; изолированный тестовый WebApp заменялся загруженным внешним SDK. Harness исправлен; 10/10 целевых повторов PASS, runtime не менялся |
| Backend / CAS / экономика | 79 тестов: onboarding, V2 hatch, ownership, двойные операции, потерянные ответы, награды, 20ч, 2с, TTL, отказ старого протокола |
| Reset / prepare SQLite | 20 тестов: подготовка без DELETE, повтор/конкуренция/lost response/rollback, чужой бот/схема/таблицы/triggers/FK, новая игра прежних аккаунтов |
| Chick geometry | 12 тестов: 720 комбинаций anchors, реальные контуры глаз, 180 крайних вариантов feed/preen, 90 возрастных форм и 13 поз |
| World / Flaps / Telegram / client | 22 + 15 + 9 + 4 теста PASS |
| CHIPPER_CHROMIUM_PATH=/tmp/chipper-browser/chromium npm run test:ui | 33/33 PASS, 39,1с; запуск оркестратором после исправления CI harness, без изменения tracked артефактов |
| git diff --check / документы 0.1 | PASS; исторические спецификации/отчёты и screenshots 0.1 не изменены |
| Production bundle | index-kzwIfClV.js 316,00KB / 102,65KB gzip; CSS 39,73KB. Нет dev backend, каталога, synthetic identities и credential values |

Стандартный CDN Chromium в этой среде вернул неполный архив. Использован локальный Chromium 153 из временного npm-runtime, без изменения зависимостей проекта. В обычной среде доступен штатный `npx playwright install chromium`; опциональный CHIPPER_CHROMIUM_PATH нужен только для явного собственного executable.

Browser tests работают с явными локальными fixtures и synthetic Serverless callback bridge. Они не подтверждают подпись настоящего Telegram initData или приёмку нескольких живых аккаунтов.

## Покрытие критериев

| Область | Автоматизированная проверка | Реальная приёмка |
|---|---|---|
| UI / Liquid Glass | Пять вкладок, центральный Дом, фиксированный root, внутренний scroll 40 птиц, возврат scroll, rapid navigation, keyboard-height, dark/light/reduced-motion/fallback | PENDING owner: реальные системная шапка/свайпы/клавиатура/safe areas Android/iOS |
| Chick V2 | Новая геометрия, гены сервера, три возраста, shapes/palettes/patterns, нейтральный V2 fallback, одинаковый renderer в мире/полёте | Визуальная оценка владельца; legacy renderer удалён |
| Living World | Tap arrival, опорная походка/тень/глубина, кормление/игра/сон/preen/grow, крайние формы у четырёх границ, hidden/deactivated/unmount | PENDING owner: ощущение движения и физический WebView |
| Chippster Flaps | Ready/input/collision/result/restart, deterministic 30/60/120 timing, 5000 проёмов, 30 полётов по 40 ворот на максимальной сложности, TTL/pause/leave, captured chick, record/reward/retry | PENDING owner: касание/звук/вибрация/FPS на телефоне |
| Изоляция / сохранения | Три синтетических Telegram ID, два клиента, CAS/replay, поздний ответ старого аккаунта, отключённые haptics после background refresh | PENDING owner: подписанные A/B/C и A1/A2 |
| Однократный сброс | Prepare не очищает данные; атомарный marker+DELETE; повтор не удаляет новые V2 аккаунты; после reset новое яйцо/onboarding/нулевой баланс | BLOCKED: фактический Serverless getMe/schema/prepare/apply не выполнены |
| Публикация | Production сборка и exclusion PASS | BLOCKED: нет cloud identity/revision/diff/push; старый HTTP URL не является beta 0.2 |

## Визуальные артефакты и perf

`DOCS/qa/0.2/`: Home light и dark 320/360/390/430; Collection; Incubator; Profile; Flaps ready/playing/paused/result/cooldown; 30 персонажей × 3 возраста в двух темах; крайние walk/feed/preen/sleep/flap/turn/front; самый крупный взрослый у границ сцены.

30-секундный smoke записан в `perf-smoke.json`: проверяются стабильное число DOM-узлов, кадры и long tasks. Это наблюдение локального headless Chromium, а не гарантия FPS любого Android/iOS. Полные screenshots визуально просмотрены; исправлены поглощение тапов прозрачной SVG-областью, обрезание крайних форм, выход глаз за контур и уход головы под поверхность в preen.

## Выпуск и приёмка владельца

Точная процедура: [DEPLOYMENT_0.2.md](DEPLOYMENT_0.2.md). Доступ восстанавливается штатным интерактивным `npx tgcloud login` в этом checkout. Затем: fetch/status/diff → reset dry-run → prepare без очистки → штатный push → apply единственного сброса → повторный dry-run. Идентичность проверяется живым api.getMe, таблица — sqlite_master/PRAGMA. Неподтверждённый механизм не заменяется выдуманной SQL-командой.

После подтверждённого apply:
1. Старый A закрывает/переоткрывает Mini App: новое onboarding, новое стартовое яйцо, нулевой баланс/рекорд, новая V2 птица.
2. B/C независимо проходят то же; имена/коллекции/балансы изолированы.
3. A1/A2 одновременно повторяют hatch/care/finish: одно яйцо/птица/начисление; чужие chickId/runId отклоняются.
4. Повторный запуск A сохраняет уже новый прогресс; повторного стартового подарка нет.
5. Дом: тап по поляне, лапы/поворот, корм/игра/сон; Collection/Profile scroll и rename с клавиатурой.
6. Flaps: выбранный цыплёнок, полёт/столкновение/результат/повтор/рекорд; +1 после ≥2с server time, следующий бонус через 20ч; пауза/background/выход.
7. Темы/reduced-motion/звук/haptics; Android и по доступности iOS/Desktop. Все живые пункты остаются PENDING до выполнения владельцем.

## Ограничения и восстановление

- CLI доступ отсутствует; reset и публикация 0.2 не состоялись.
- Личный Flaps score имеет sanity bounds, но не полноценный античит; глобального рейтинга нет.
- Постоянные receipts обеспечивают replay safety, агрегат со временем растёт; compaction требует отдельного решения.
- Физические Telegram-клиенты и несколько реальных аккаунтов пока не проверены.
- Экспорт PNG-карточки/share из необязательного P1 не реализован.
- До фактического reset возможно вернуть исходный рабочий 0.1 SHA 95fd2d13abbdbc394932ec249472147e496afca9. После reset — только совместимый V2 checkpoint/fix-forward, без повторного удаления данных или release marker.

Работали настоящие субагенты UI, Art, Living World, Flaps, Backend, Release/QA и независимый integration reviewer. Оркестратор согласовал контракт, интегрировал приложение, выполнил финальные quality gates и подготовил Git-сдачу.
